# ADR-0022: Local fine-tuning runner for approved tenant datasets

- **Status:** Accepted; amended 2026-10-16
- **Date:** 2026-10-15 (Gemma 4 QLoRA amendment: 2026-10-16)
- **Deciders:** FaroAI product owner and implementation team
- **Related:** [ADR-0002 Qdrant](0002-use-qdrant-for-embed-db.md), [ADR-0003 tenant isolation](0003-use-tenant-id-for-design.md), [ADR-0008 Python worker](0008-use-phyton-for-service-worker.md), [ADR-0012 consented model improvement](0012-consented-model-improvement-and-training.md)

## Context

The Learning page can review consented interactions, promote reviewed answers into tenant-scoped Qdrant knowledge, and export approved examples. It has no trainer. LM Studio serves models for inference; it does not fine-tune model weights. The FaroAI host has a limited system-RAM budget, so training must not run inside the request API, the embedding worker, or the default Compose stack.

The product owner wants a usable local fine-tuning path that can be tried on a separate machine and connected to LM Studio after training.

## Decision

- Add a standalone, opt-in Python LoRA runner that runs on an operator-selected workstation. It consumes only a local dataset file exported from Learning; it does not receive jobs or tenant data over a network.
- Keep dataset eligibility governed by ADR-0012 and ADR-0023: the tenant's local-learning authorization, applicable source consent, human review, and an approved preferred answer. Tenant-local exports can be prepared in hosted multi-tenant mode and remain isolated to one tenant. Shared-training data cannot be passed to this runner.
- The runner validates the JSONL format, bounds dataset rows and sequence length, rejects any example whose assistant target is truncated away, and writes output only to an operator-selected directory. The runner does not access FaroAI databases, Qdrant, provider keys, or the LM Studio API.
- Use Hugging Face Transformers with PEFT LoRA for supervised fine-tuning. The runner saves a LoRA adapter and tokenizer metadata. It does not automatically publish or activate an artifact.
- Use an open-weights base model in Transformers format. A GGUF model already loaded in LM Studio is an inference artifact and cannot be used as the training input. The operator must obtain the corresponding permitted base checkpoint in Transformers format separately.
- Add an explicit Gemma 4 text-only training profile using `AutoModelForMultimodalLM` and PEFT QLoRA with 4-bit NF4 loading. The profile requires a CUDA GPU, a separate dependency list with compatible Transformers/PEFT and bitsandbytes support, and an explicit `--model-family gemma4 --qlora-4bit` command. Do not infer this profile from arbitrary model IDs.
- Keep the standard small-model LoRA path unchanged. The Gemma 4 profile consumes the existing reviewed text-pair JSONL export; image, audio and video training are not included. A 24 GB NVIDIA GPU at 512 tokens is a target configuration to try, not a validated compatibility guarantee. The full Transformers checkpoint is downloaded to the operator-selected cache; 4-bit refers to its in-memory training load, not the downloaded checkpoint format.
- The separate workstation needs Python and the downloaded runner, dependencies and dataset only; cloning the FAROAI repository is not required. Python environment setup, model download, training, evaluation and adapter conversion remain operator actions.
- To serve the result in LM Studio, the operator merges/converts the adapter to a compatible GGUF using the model's supported conversion path, imports that GGUF into LM Studio, and explicitly loads it. This is a manual release step.
- Add a Learning page entry point to download the runner and its dependency list alongside the existing local dataset export. The UI must state that model downloads and training occur on the selected workstation and may require substantially more RAM/VRAM and disk than inference. For the starter defaults (0.5B model and 512-token context), 8 GB of NVIDIA GPU VRAM is a reasonable target; recommend at least 16 GB system RAM and 20 GB free disk, and unload models from LM Studio during training.
- Do not add a training container to the default FaroAI deployment or make training run automatically after approval/export. A future server-managed runner requires a separate security, resource and artifact-release decision.
- Qdrant remains a retrieval index only. Training data and LoRA artifacts stay outside Qdrant.

## Consequences

- Operators can take an approved local dataset to a separate computer and run a reproducible starter fine-tune without consuming FaroAI container resources.
- The runner is an opt-in starter workflow, not a managed job service. FaroAI does not report training status or automatically deploy the resulting weights.
- The runner requires a compatible model checkpoint and Python dependencies. An NVIDIA GPU with 8 GB VRAM is a reasonable target for the default 0.5B model at 512-token context. Gemma 4 12B has an optional QLoRA 4-bit profile targeting 24 GB VRAM at 512 tokens; actual fit depends on hardware, drivers and runtime memory. CPU training is not supported by that profile. System RAM and free disk are separate from VRAM and must also be sufficient.
- Exported datasets and resulting artifacts are outside FaroAI's retention controls after download. Operators must keep them on encrypted storage and delete them according to the tenant's policy.
- An adapter is not considered released until it has been evaluated and manually imported/loaded in the intended inference runtime.

## Alternatives considered

- **Treat LM Studio as the trainer:** rejected because it serves inference and model-management APIs; fine-tuning is performed by a separate training tool.
- **Run fine-tuning inside the FaroAI AI service or default Compose stack:** rejected because it would compete with retrieval and API workloads for system memory/CPU and could break the supported 8 GB system-RAM deployment budget.
- **Store training examples or weights in Qdrant:** rejected because Qdrant stores retrieval vectors, not authoritative training datasets or model artifacts.
- **Automatically train on every approved interaction:** rejected because consent, dataset selection, evaluation and model release remain separate explicit actions.

## Implementation

See [SPEC: Local fine-tuning runner](../spec/local-fine-tuning-runner.md). This ADR supersedes only ADR-0012's statement that no local runner starter is available. ADR-0023 broadens tenant-local dataset eligibility beyond single-tenant self-hosting without changing source consent, tenant isolation, shared-training, evaluation or release requirements.
