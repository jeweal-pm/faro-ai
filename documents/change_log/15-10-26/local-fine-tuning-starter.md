# Local fine-tuning starter — 15-10-26

- Added [ADR-0022](../../adr/0022-local-fine-tuning-runner.md) and its [SPEC](../../spec/local-fine-tuning-runner.md), defining an external workstation runner and keeping training data/artifacts separate from Qdrant and the FaroAI containers.
- Added a standalone Transformers/PEFT LoRA CLI, requirements, and Windows setup guide under `backoffice/public/local-training/`. The runner validates FaroAI JSONL exports, hashes the input, and writes the adapter and model cache locally.
- Added Learning page download links and explanatory guidance. Local dataset export remains guarded by the existing single-tenant self-hosted and consent/review requirements.
- Updated the consented-learning ADR/SPEC to point to the external runner while keeping managed training jobs and automatic model release out of scope.
- LM Studio is documented as the inference destination after model conversion. Training itself does not call LM Studio, OpenRouter, FaroAI APIs, or Qdrant.
- Clarified that the user's 8 GB refers to NVIDIA GPU VRAM: it is a reasonable target for the default 0.5B model at 512 tokens. The separate workstation recommendation is at least 16 GB system RAM and 20 GB free disk, with the LM Studio model unloaded during training. The FaroAI host's 8 GB system-RAM budget is a separate constraint.
- Updated Learning guidance for those resource requirements and made the runner reject examples whose assistant target is fully truncated, with an actionable error instead of silently skipping the row.
- Verification: no tests, build, dependency installation, model download, or training run was performed in this change.
