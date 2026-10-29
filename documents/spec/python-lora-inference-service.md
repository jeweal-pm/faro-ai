# SPEC: Python LoRA inference service

- **Status:** Draft — implementation not started
- **Date:** 2026-10-18
- **Decision:** [ADR-0025](../adr/0025-python-lora-inference-server.md)
- **Portable handoff folder:** [python-inference-server](../../backoffice/public/local-training/python-inference-server/SPEC.md)

## 1. Purpose

Define the service that loads a locally trained LoRA adapter and makes the resulting model callable by FaroAI without requiring LM Studio. This is a serving specification, not a change to the training runner. The first implementation is a development proof of concept; production release requires the separate FaroAI provider and model-routing integration in section 9.

## 2. Current behavior and boundary

- `train_lora.py` reads an approved `messages` JSONL file and writes `adapter/` plus `training-manifest.json`.
- The manifest identifies the base model and dataset digest. The service must use that same base model and compatible tokenizer/processor with the adapter.
- The training runner does not provide an inference server, merge/convert the adapter, install ngrok, update FaroAI configuration, or register a trained model with Jev.
- FaroAI's current local Learning draft path accepts Ollama or LM Studio configurations. That path is for drafting learning examples; it does not route customer Discovery requests to a locally trained adapter.
- Qdrant is a separate RAG index. The inference server must not use it as an adapter store or training-data store.

## 3. First-release scope

### In scope

- Python service loads one configured base-model checkpoint and one LoRA adapter from local paths or a read-only artifact directory.
- Authenticated health, model-list and chat-completions endpoints.
- Single-tenant binding for the first release. One service instance and credential map to one tenant/model deployment.
- Local smoke evaluation and a development-only authenticated ngrok tunnel.
- Machine-readable startup manifest with model identity and artifact digests.

### Out of scope

- Training, adapter merging, GGUF conversion, checkpoint downloads initiated by public API requests.
- Direct connections from the service to FaroAI databases, Qdrant, MCP servers or OpenRouter.
- Multi-tenant adapter selection in a shared process.
- Automatic deployment, Jev selection, production Discovery routing, automated cost-based routing or tenant billing.
- Uploading prompts, outputs, datasets or adapter weights to a hosted provider.

## 4. Artifact contract

The service startup configuration must include:

- `BASE_MODEL_ID` and, where available, an immutable revision/commit; it must match the model used for training.
- `BASE_MODEL_PATH` or an already-populated model cache. The server must not fetch a model in response to a user request.
- `LORA_ADAPTER_PATH`, pointing to the runner's `adapter/` output.
- `TRAINING_MANIFEST_PATH`, used to check `base_model`, adapter format and dataset SHA-256.
- A deployment metadata file binding the artifact to a tenant ID, deployment ID, approved dataset export reference and artifact checksums. The runner's existing manifest does not contain a tenant ID; do not infer tenant ownership from a folder name.
- A server API credential supplied through a secret store or environment injection, never committed in the package or logged.

Startup must fail closed if files are missing, the base model does not match, the adapter cannot be loaded, the tenant binding is absent, or the runtime cannot load the configured model. The service becomes ready only after the model is fully loaded and a local inference smoke check succeeds.

## 5. Runtime/API contract

The first implementation should use Python 3.12 and a supported Transformers + PEFT serving stack. FastAPI is the proposed HTTP framework; keep the model-loader module independent from HTTP handlers so supported runtimes can change without changing the public contract.

Required routes:

| Route | Requirement |
| --- | --- |
| `GET /health/live` | Process is alive; must not reveal paths, credentials or tenant data. |
| `GET /health/ready` | Return ready only after model and adapter load successfully. |
| `GET /v1/models` | Return only the configured public model ID and minimal metadata. |
| `POST /v1/chat/completions` | Accept a bounded, non-streaming OpenAI-compatible chat request for the configured model. |

Request rules:

- Require `Authorization: Bearer <token>` on every route except an optional liveness check restricted to the local host.
- The `model` field must match the single configured model ID. Reject attempts to select arbitrary model paths, adapters, base models or tenant IDs.
- Enforce configured maximum request bytes, input tokens, output tokens, concurrency and inference timeout. Return a controlled overload/timeout response without crashing the model process.
- Treat the prompt as untrusted input. Do not permit filesystem, shell, Python, network, MCP or arbitrary tool execution from model output.
- First release does not support streaming, image/audio/video input, or tool calls. Reject unsupported fields explicitly rather than silently pretending they were processed.
- Responses must contain the configured model ID, generated text, finish reason and usage counts when the runtime can report them.

## 6. Tenant isolation, privacy and audit

- Bind the service instance, API credential, adapter and deployment metadata to exactly one tenant in the first release. A tenant credential must never choose another tenant's adapter.
- FaroAI must resolve tenant identity from its authenticated request context and use a tenant-specific provider connection. Do not trust browser-supplied tenant IDs for provider selection.
- Do not log raw prompt/response text, API credentials, training data or local filesystem paths. Operational logs may include request ID, tenant/deployment ID, configured model ID, latency, status and token usage.
- Keep adapter, base checkpoint and manifests in an access-controlled directory encrypted at rest where supported. Apply tenant retention and deletion requirements to artifacts and backups.
- Do not put tenant-specific artifacts under `backoffice/public` or another web-served path.

## 7. Network and tunnel security

- Bind the Python service to `127.0.0.1` for workstation development. Do not bind to all interfaces unless network access is explicitly required and firewalled.
- For a development tunnel, ngrok must forward only the inference port over HTTPS. Require an app bearer token and ngrok access policy; use a controlled hostname, monitor access, rotate credentials, and shut the tunnel down after the test.
- Never expose the model-cache path, runner directory, training dataset, Python debugger, admin shell or file-serving endpoint through the tunnel.
- FaroAI's gateway must make server-side calls. The browser must not receive the tunnel/API credential.
- Before enabling the endpoint in FaroAI, add the host to an explicit deployment allowlist and retain SSRF protections. Do not allow arbitrary tenant-supplied URLs or broad `*.ngrok-free.dev` wildcards.
- ngrok is development-only in this proposal. Production should use a private network/VPN or a managed authenticated service with stable addressing, monitoring and an availability policy.

## 8. Operations and evaluation

- Keep the training dataset separate from the inference package; inference needs model artifacts, not the source JSONL.
- Evaluate with a human-reviewed holdout set that was not used to train. Compare base-model and adapter outputs for factuality, tenant scope, refusals, latency and resource usage.
- The 1,000-row KT test file is 13 prompt variations over 77 catalog products. It is a pipeline test artifact, not an independent 1,000-fact benchmark or production-quality training set.
- Record adapter digest, base-model ID/revision, dataset digest, deployment ID, evaluation report and rollback target for each release.
- Rollback means switching the tenant deployment to a previous approved model artifact or disabling the connection; do not delete a currently active artifact before rollback is confirmed.
- When GPU memory is exhausted or the worker is unavailable, return an explicit unavailable response; do not silently call OpenRouter.

## 9. FaroAI integration required before customer use

The existing provider schema permits `openrouter`, `ollama` and `lmstudio`; it does not currently define a Python LoRA provider. Before this server can be configured in Backoffice or used by Jev/Discovery, implementation must:

1. Add a narrowly scoped Python/OpenAI-compatible provider type or a reviewed protocol adapter. Store credentials using the existing encrypted provider-secret mechanism.
2. Add explicit approved-host configuration and SSRF validation for the server endpoint. For ngrok development, use one exact approved host; never trust a URL entered by a tenant merely because it uses HTTPS.
3. Add provider health/model discovery behavior and bind the provider connection and model ID to the selected tenant.
4. Define where the model is eligible: Learning draft generation, Discovery response, or both. This draft specifies the inference server API but does **not** authorize Jev/Discovery to use the model automatically.
5. Define cost accounting for self-hosted inference. Provider-reported token prices and the hosted-model $10 price ceiling do not represent GPU-hour cost.
6. Add an ADR/spec amendment for the Jev/Discovery routing policy before making the trained model selectable for customer traffic.

Until these steps are implemented and reviewed, do not enter an ngrok URL into an existing provider field and expect FaroAI to call it. A working Python endpoint by itself is not a FaroAI integration.

## 10. Acceptance criteria

- Valid artifacts load from local paths, and mismatched base/adapter/tenant metadata prevents readiness.
- Health and model-list responses reveal no secret, local path or training content.
- Missing/invalid API credentials are rejected; supported chat requests return a compatible response.
- Unsupported features, request limits, queue saturation and inference timeouts return documented errors.
- Tenant credentials cannot select another tenant or adapter.
- Prompts and responses are absent from operational logs; no hosted fallback occurs on failure.
- ngrok access is authenticated, restricted and disableable; public unauthenticated access is rejected.
- FaroAI integration validation proves tenant-specific provider assignment, host-policy enforcement, usage accounting and explicit routing eligibility before customer use.

## 11. Handoff folder

The portable specification-only folder is `backoffice/public/local-training/python-inference-server/`. It contains the specification and no sample dataset, model weights, credentials or runnable server implementation.

