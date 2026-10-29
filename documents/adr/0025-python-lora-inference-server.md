# ADR-0025: Serve trained LoRA adapters with a Python inference service

- **Status:** Proposed
- **Date:** 2026-10-18
- **Deciders:** FaroAI product owner and implementation team
- **Related:** [ADR-0012 consented model improvement and training](0012-consented-model-improvement-and-training.md), [ADR-0022 local fine-tuning runner](0022-local-fine-tuning-runner.md), [ADR-0023 tenant-scoped RAG learning](0023-tenant-scoped-rag-learning.md)

## Context

The local Python training runner writes a PEFT LoRA adapter and a manifest. It does not create an inference API, deploy the adapter, or change the base model. LM Studio is an optional serving application, but the product owner wants a Python-based serving path that can be reached by FAROAI without requiring LM Studio.

FAROAI's current Learning draft-generation integration only accepts the Ollama and LM Studio provider kinds. It is separate from Jev/Discovery model routing. A Python service exposed through a tunnel therefore cannot be assumed to work with current provider configuration or to become a Jev-selected product-search model.

## Proposed decision

- Run a separate Python inference service that loads the exact Transformers base model referenced by the training manifest together with its LoRA adapter. The service is an inference host; it does not train, modify Qdrant, or send adapter weights to OpenRouter.
- Expose an authenticated chat API with model discovery and health endpoints. Prefer OpenAI-compatible request/response shapes so a FaroAI provider adapter can call it without model-specific code in the browser.
- Start with one tenant-bound model deployment per service instance. Bind the service credential and loaded adapter to that tenant; do not accept an untrusted request field as the adapter/tenant selector.
- Use ngrok only for a controlled development proof of concept, with HTTPS and access authentication. Production traffic must use a private network or an equivalently controlled authenticated route; a public unauthenticated tunnel is not acceptable.
- Treat FaroAI provider registration, approved-host policy, deployment configuration, Jev/Discovery routing and cost/accounting as separate integration work. Record and implement those changes before customer traffic can select the trained model.
- Keep the trained dataset and tenant authorization metadata out of the inference service unless inference requires them. The first design does not copy raw training examples to the serving host.

## Consequences

- Training and inference can run without LM Studio, but the serving machine still needs compatible hardware, the base checkpoint and adapter files.
- A provider/API integration is required before FaroAI can call the service. The current local Learning configuration does not provide this Python provider directly.
- A temporary tunnel makes the inference service reachable outside the workstation and therefore requires explicit authentication, limited access, monitoring and an expiry/disable procedure.
- LoRA adapter compatibility depends on the exact base model architecture, tokenizer/processor and supported inference runtime. Each artifact must be evaluated before deployment.

## Alternatives considered

- **Use the adapter directly with OpenRouter:** rejected; an adapter file is not a hosted model endpoint, and this path does not upload or serve the adapter.
- **Require LM Studio:** rejected as a hard requirement; it can be one serving option, but the product owner requested a Python path.
- **Merge and convert to GGUF:** remains an alternative serving-package path, but does not by itself define FaroAI authentication, tenant routing or endpoint validation.
- **Expose an unauthenticated ngrok URL:** rejected because it would expose an inference API and tenant-derived model to anyone who obtains the URL.

## Specification

See [SPEC: Python LoRA inference service](../spec/python-lora-inference-service.md). This ADR is proposed; it does not claim the service or FaroAI integration has been implemented.

