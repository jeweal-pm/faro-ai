#!/usr/bin/env python3
"""Train a local LoRA adapter from a FaroAI-approved JSONL dataset.

This standalone starter intentionally has no FaroAI, Qdrant, or network API client.
It reads a local export file and writes the adapter to a local output directory.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any


MAX_ROWS = 10_000
MAX_SEQUENCE_LENGTH = 2_048
MAX_MESSAGE_CHARS = 16_000


def load_examples(path: Path) -> list[list[dict[str, str]]]:
    examples: list[list[dict[str, str]]] = []
    with path.open("r", encoding="utf-8") as dataset_file:
        for line_number, line in enumerate(dataset_file, start=1):
            if not line.strip():
                continue
            if len(examples) >= MAX_ROWS:
                raise ValueError(f"Dataset exceeds the {MAX_ROWS:,}-example limit.")
            try:
                row = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"Invalid JSON on line {line_number}: {error.msg}.") from None
            messages = row.get("messages") if isinstance(row, dict) else None
            if not isinstance(messages, list) or len(messages) != 2:
                raise ValueError(f"Line {line_number} must contain exactly one user and one assistant message.")
            if [item.get("role") for item in messages if isinstance(item, dict)] != ["user", "assistant"]:
                raise ValueError(f"Line {line_number} must contain user then assistant roles.")
            normalized: list[dict[str, str]] = []
            for item in messages:
                content = item.get("content")
                if not isinstance(content, str) or not content.strip() or len(content) > MAX_MESSAGE_CHARS:
                    raise ValueError(f"Line {line_number} has empty or oversized message content.")
                normalized.append({"role": item["role"], "content": content.strip()})
            examples.append(normalized)
    if not examples:
        raise ValueError("The dataset contains no training examples.")
    return examples


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fine-tune a local model with LoRA.")
    parser.add_argument("--dataset", required=True, type=Path, help="FaroAI local dataset JSONL export")
    parser.add_argument("--model", default="Qwen/Qwen2.5-0.5B-Instruct", help="Transformers base model ID or local checkpoint path")
    parser.add_argument("--model-family", choices=("causal-lm", "gemma4"), default="causal-lm", help="Model loader/profile; use gemma4 for Gemma 4 text fine-tuning")
    parser.add_argument("--qlora-4bit", action="store_true", help="Load the base model in 4-bit NF4 and train a LoRA adapter (CUDA required)")
    parser.add_argument("--output-dir", required=True, type=Path, help="Directory for adapter output")
    parser.add_argument("--model-cache-dir", type=Path, help="Directory for downloaded base-model files (defaults inside output-dir)")
    parser.add_argument("--epochs", type=float, default=1.0)
    parser.add_argument("--max-sequence-length", type=int, default=512)
    parser.add_argument("--learning-rate", type=float, default=2e-4)
    parser.add_argument("--cpu", action="store_true", help="Force CPU training even when CUDA is available")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.dataset.is_file():
        print("Dataset file does not exist.", file=sys.stderr)
        return 2
    if not 64 <= args.max_sequence_length <= MAX_SEQUENCE_LENGTH:
        print(f"Sequence length must be between 64 and {MAX_SEQUENCE_LENGTH}.", file=sys.stderr)
        return 2
    if not 0 < args.epochs <= 10:
        print("Epochs must be greater than 0 and no more than 10.", file=sys.stderr)
        return 2
    if not 0 < args.learning_rate <= 0.01:
        print("Learning rate must be greater than 0 and no more than 0.01.", file=sys.stderr)
        return 2
    if args.model_family == "gemma4" and not args.qlora_4bit:
        print("Gemma 4 training requires --qlora-4bit in this runner.", file=sys.stderr)
        return 2
    if args.model_family == "gemma4" and args.cpu:
        print("Gemma 4 QLoRA requires a CUDA GPU; CPU training is not supported by this profile.", file=sys.stderr)
        return 2

    try:
        examples = load_examples(args.dataset)
    except (OSError, ValueError) as error:
        print(f"Dataset rejected: {error}", file=sys.stderr)
        return 2

    try:
        import torch
        from peft import LoraConfig, get_peft_model
        from torch.utils.data import Dataset
        from transformers import AutoModelForCausalLM, AutoTokenizer, DataCollatorForSeq2Seq, Trainer, TrainingArguments
        if args.qlora_4bit:
            from peft import prepare_model_for_kbit_training
            from transformers import BitsAndBytesConfig
        if args.model_family == "gemma4":
            from transformers import AutoModelForMultimodalLM, AutoProcessor
    except ImportError as error:
        requirements_file = "requirements-gemma4.txt" if args.model_family == "gemma4" or args.qlora_4bit else "requirements.txt"
        print(f"Missing training dependency: {error.name}. Install {requirements_file} on the training workstation.", file=sys.stderr)
        return 2

    use_cuda = torch.cuda.is_available() and not args.cpu
    if args.qlora_4bit and not use_cuda:
        print("4-bit QLoRA requires a working CUDA GPU. Check the NVIDIA driver and CUDA-enabled PyTorch install.", file=sys.stderr)
        return 2

    class TokenizedExamples(Dataset):
        def __init__(self) -> None:
            self.rows: list[dict[str, list[int]]] = []
            for example_number, messages in enumerate(examples, start=1):
                prompt = tokenizer.apply_chat_template(messages[:1], tokenize=False, add_generation_prompt=True)
                full_text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=False)
                prompt_ids = tokenizer(prompt, add_special_tokens=False, truncation=True, max_length=args.max_sequence_length)["input_ids"]
                encoded = tokenizer(full_text, add_special_tokens=False, truncation=True, max_length=args.max_sequence_length)
                labels = list(encoded["input_ids"])
                masked_prefix = min(len(prompt_ids), len(labels))
                labels[:masked_prefix] = [-100] * masked_prefix
                if all(token == -100 for token in labels):
                    raise ValueError(
                        f"Example {example_number} has no assistant target tokens left at sequence length "
                        f"{args.max_sequence_length}. Shorten the prompt or increase --max-sequence-length."
                    )
                self.rows.append({"input_ids": encoded["input_ids"], "attention_mask": encoded["attention_mask"], "labels": labels})

        def __len__(self) -> int:
            return len(self.rows)

        def __getitem__(self, index: int) -> dict[str, list[int]]:
            return self.rows[index]

    args.output_dir.mkdir(parents=True, exist_ok=True)
    model_cache_dir = args.model_cache_dir or args.output_dir / "model-cache"
    model_cache_dir.mkdir(parents=True, exist_ok=True)
    processor = None
    if args.model_family == "gemma4":
        processor = AutoProcessor.from_pretrained(args.model, cache_dir=model_cache_dir)
        tokenizer = processor.tokenizer
    else:
        tokenizer = AutoTokenizer.from_pretrained(args.model, use_fast=True, cache_dir=model_cache_dir)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"
    try:
        dataset = TokenizedExamples()
    except ValueError as error:
        print(f"Dataset rejected: {error}", file=sys.stderr)
        return 2
    if not len(dataset):
        print("No assistant target tokens remained after tokenization. Check the model chat template and sequence length.", file=sys.stderr)
        return 2

    model_dtype = torch.float32
    if use_cuda:
        model_dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
    model_kwargs: dict[str, Any] = {"cache_dir": model_cache_dir}
    if args.model_family == "gemma4":
        model_kwargs["dtype"] = model_dtype
    else:
        model_kwargs["torch_dtype"] = model_dtype
    if args.qlora_4bit:
        model_kwargs["device_map"] = "auto"
        model_kwargs["quantization_config"] = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_use_double_quant=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=model_dtype,
            bnb_4bit_quant_storage=model_dtype,
        )
    if args.model_family == "gemma4":
        model = AutoModelForMultimodalLM.from_pretrained(args.model, **model_kwargs)
    else:
        model = AutoModelForCausalLM.from_pretrained(args.model, **model_kwargs)
    model.config.use_cache = False
    if args.qlora_4bit:
        model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)
    if args.model_family == "gemma4":
        # PEFT provides the Gemma 4 target-module mapping; Google’s guide leaves
        # target_modules unset for this architecture.
        lora_config = LoraConfig(
            r=16,
            lora_alpha=16,
            lora_dropout=0.05,
            bias="none",
            task_type="CAUSAL_LM",
        )
    else:
        available_targets = {name.rsplit(".", 1)[-1] for name, _ in model.named_modules()}
        target_modules = [name for name in ("q_proj", "v_proj") if name in available_targets]
        if not target_modules:
            print("The selected model has no supported q_proj/v_proj layers for this starter LoRA config.", file=sys.stderr)
            return 2
        lora_config = LoraConfig(
            r=8,
            lora_alpha=16,
            lora_dropout=0.05,
            bias="none",
            task_type="CAUSAL_LM",
            target_modules=target_modules,
        )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    training_args = TrainingArguments(
        output_dir=str(args.output_dir),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=1,
        gradient_accumulation_steps=4,
        learning_rate=args.learning_rate,
        logging_steps=1,
        save_strategy="epoch",
        save_total_limit=2,
        report_to="none",
        seed=42,
        use_cpu=args.cpu,
        fp16=use_cuda and model_dtype == torch.float16,
        bf16=use_cuda and model_dtype == torch.bfloat16,
        dataloader_num_workers=0,
        remove_unused_columns=False,
    )
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=dataset,
        data_collator=DataCollatorForSeq2Seq(tokenizer=tokenizer, padding=True, label_pad_token_id=-100),
    )
    trainer.train()
    model.save_pretrained(args.output_dir / "adapter")
    if processor is not None:
        processor.save_pretrained(args.output_dir / "adapter")
    else:
        tokenizer.save_pretrained(args.output_dir / "adapter")
    dataset_digest = hashlib.sha256()
    with args.dataset.open("rb") as dataset_file:
        for chunk in iter(lambda: dataset_file.read(1024 * 1024), b""):
            dataset_digest.update(chunk)
    metadata: dict[str, Any] = {
        "base_model": args.model,
        "dataset_file": args.dataset.name,
        "dataset_sha256": dataset_digest.hexdigest(),
        "example_count": len(dataset),
        "epochs": args.epochs,
        "max_sequence_length": args.max_sequence_length,
        "adapter_format": "PEFT LoRA",
        "model_family": args.model_family,
        "qlora_4bit": args.qlora_4bit,
        "model_cache_dir": str(model_cache_dir),
        "note": "Evaluate before use. Merge and convert to a compatible GGUF before importing into LM Studio.",
    }
    (args.output_dir / "training-manifest.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(f"LoRA adapter saved to: {args.output_dir / 'adapter'}")
    print("This created an adapter only. It did not modify or deploy the base model.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
