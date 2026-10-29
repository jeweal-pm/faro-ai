# SPEC: Local fine-tuning runner

- **Status:** Implemented as an opt-in starter kit; Gemma 4 profile added 2026-10-16
- **Date:** 2026-10-15 (updated 2026-10-16)
- **Decision:** [ADR-0022](../adr/0022-local-fine-tuning-runner.md)

## User flow

1. Enable local-model use and record the tenant's local-learning authorization. This works in hosted multi-tenant mode because each dataset export remains tenant-scoped.
2. Capture examples only when the authenticated user grants local-training consent.
3. In Learning, review each candidate, correct the preferred answer, and select local fine-tuning use.
4. Export the selected tenant's local fine-tuning dataset. The API exports only authorized, approved, reviewed examples with the applicable source consent and records the manifest hash.
5. On a separate training workstation, download the runner and requirements, install the optional training dependencies, and run the CLI against the exported JSONL. No runner service or inbound port is exposed.
6. Evaluate the adapter against held-out prompts. If acceptable, merge and convert using a compatible llama.cpp conversion toolchain, then import the GGUF into LM Studio and load it explicitly.

## Starter runner contract

- Input: JSONL rows with `messages`, containing one user message and one reviewed assistant target.
- Supported training: supervised fine-tuning with standard LoRA for the default starter model, plus an explicit Gemma 4 text-only QLoRA 4-bit NF4 profile. The runner does not synthesize training data; reviewed RAG-derived examples are prepared separately by the flow in SPEC Tenant-scoped RAG Learning. No reward training, image/audio/video training, or continual training.
- Gemma 4 invocation requires `--model-family gemma4 --qlora-4bit`, CUDA, a Transformers version compatible with `AutoModelForMultimodalLM`, PEFT Gemma 4 support, and bitsandbytes. It reads the approved text JSONL with the processor/tokenizer chat template. The default path remains `AutoModelForCausalLM` and standard LoRA.
- The Gemma 4 profile targets 24 GB NVIDIA VRAM at the default 512-token sequence length, but this is not a guaranteed fit on every GPU/runtime. The model checkpoint is downloaded in Transformers/Safetensors form to the selected cache; QLoRA loads it in 4-bit for training. The LM Studio GGUF/QAT artifact is not the training input.
- The separate training workstation needs only the runner script, the selected requirements file, Python, and the approved dataset. Cloning the FAROAI application repository is unnecessary.
- Default base model: `Qwen/Qwen2.5-0.5B-Instruct`, overridable by an explicit model ID.
- Default limits: one epoch, sequence length 512, batch size 1, gradient accumulation 4, and at most 10,000 rows. The CLI rejects malformed or oversized input and examples whose assistant target is truncated away instead of silently dropping them.
- Output: adapter weights plus tokenizer/config metadata in an operator-selected output directory. The base model weights are not copied into FaroAI or Qdrant.
- Device: CUDA is used when available unless `--cpu` is set; the runner uses FP16 or BF16 model weights on CUDA. CPU uses FP32. An NVIDIA GPU with 8 GB VRAM is a reasonable target for the default 0.5B model at 512-token context, but larger models or longer contexts require more memory. Recommend at least 16 GB system RAM and 20 GB free disk; these are separate from VRAM.
- The runner never reads API credentials, calls FaroAI, connects to Qdrant, or sends training data to a hosted provider.

## Backoffice behavior

- Keep local dataset export disabled unless local LLM is enabled and the selected tenant has recorded local-learning authorization. The API always scopes the export to the selected tenant.
- Provide direct downloads for `train_lora.py`, standard dependencies and Gemma 4 dependencies beside the dataset export control, plus detailed Windows setup instructions.
- Explain that LM Studio serves the resulting model; it is not the fine-tuning runner. The input is a Transformers-format base checkpoint, not a GGUF file loaded by LM Studio.
- Do not show a running/completed job state or claim that weights changed. Training runs outside FaroAI.
- Preserve the existing distinct Qdrant promotion control. Approving RAG knowledge does not add a training example unless the local-training option is separately selected.

## Security and retention

- The authenticated gateway remains the only path for exporting data. The CLI operates only on the downloaded local file.
- Dataset export retains the existing tenant scope, consent, review, preferred-answer, audit and manifest-hash checks.
- The training workstation is operator-managed. Use encrypted storage, honor the tenant's retention/deletion policy, and delete exported datasets/checkpoints when no longer needed.
- Never commit datasets, model weights, tokens or adapters to this repository.

## Limitations

- The first version does not automate immutable snapshot retrieval by manifest ID, evaluation gates, model registry, GGUF conversion, or deployment back into LM Studio.
- The Gemma 4 QLoRA profile requires CUDA and fails closed without a visible CUDA GPU; CPU-only training is not supported by this profile. Do not run the supplied starter on the FaroAI host. Use a separate workstation with resources suitable for the selected base model. Close or unload any model in LM Studio during training to free VRAM.
- Dependency installation and model-weight downloads are explicit operator actions. They are intentionally not part of the Docker build.

## Acceptance criteria

- Local export remains unavailable unless local-model use, tenant authorization, source consent and review policy permit it. Hosted multi-tenant mode must keep exports tenant-scoped.
- The training script accepts only the exported message format and errors clearly on invalid input.
- The script trains LoRA adapters without network calls to FaroAI or Qdrant and writes only under the requested output directory. Gemma 4 loads with its multimodal Transformers model class, QLoRA 4-bit NF4 and processor; this starter only supplies text examples.
- The Learning page links to the script and dependency list and distinguishes dataset export, RAG indexing, fine-tuning and model serving.
