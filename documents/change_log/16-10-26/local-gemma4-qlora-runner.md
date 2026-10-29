# Gemma 4 QLoRA runner support

Date: 16-10-26

## Changes

- Added an explicit `gemma4` model profile to the standalone Python trainer. It loads Gemma 4 through `AutoModelForMultimodalLM`, uses the model processor/tokenizer template, and applies PEFT QLoRA with 4-bit NF4 quantization.
- Kept the default causal-LM LoRA path and dependency file separate. Added `requirements-gemma4.txt` for Gemma 4's Transformers, PEFT, Accelerate and bitsandbytes dependencies; CUDA-enabled PyTorch is installed separately using the official PyTorch selector.
- Added CUDA-only checks for the Gemma 4 QLoRA path and recorded model family and QLoRA mode in the training manifest.
- Added a Backoffice download link for Gemma 4 dependencies and updated the runner setup guide with detailed Windows workstation steps. The workstation needs only Python, the downloaded runner/dependencies, and approved dataset; FAROAI source does not need to be cloned.
- Documented that this profile supports text pairs only. A 24 GB GPU at 512 tokens is a target configuration, not a guarantee. The HF Transformers checkpoint is downloaded in full to cache and quantized in memory for training; the LM Studio QAT/GGUF file is not used as training input.
- Amended ADR-0022 and SPEC `local-fine-tuning-runner.md` to record the Gemma 4 QLoRA profile, resource assumptions, operator workflow, and limits.

## Validation

- No training run was started and no model or Python dependency was downloaded.
- Tests were not run.
