# Python LoRA inference server after training

This folder is a **specification-only handoff** for implementing an inference server that loads the PEFT adapter produced by `train_lora.py`. It contains no customer dataset, model weights, credentials, or runnable server code.

The canonical FaroAI spec is [python-lora-inference-service.md](../../../../documents/spec/python-lora-inference-service.md), with the architecture proposal in [ADR-0025](../../../../documents/adr/0025-python-lora-inference-server.md).

## Handoff summary

After training, the service must load the exact base model from `training-manifest.json` together with the `adapter/` directory. It then serves a tenant-bound, authenticated inference API. The adapter file itself is not a model endpoint and is not uploaded to OpenRouter or Qdrant.

The proposal uses Python 3.12, Transformers + PEFT and a FastAPI HTTP layer. The initial API is single-tenant, non-streaming and text-only, with health, model-list and OpenAI-compatible chat-completions routes. It must fail closed if base model, adapter, tenant binding, API credentials or runtime hardware do not match the deployment configuration.

ngrok is limited to an authenticated development tunnel. FaroAI integration still needs a Python provider type or protocol adapter, exact host allowlisting, encrypted credentials, tenant assignment and a separate decision on whether Jev/Discovery may select the model. Current FaroAI Learning provider settings support Ollama/LM Studio and do not automatically route customer search to a trained adapter.

See the canonical spec for artifact rules, API details, security, operations, integration work and acceptance criteria. The ADR is **Proposed** and the service is **not implemented**.

