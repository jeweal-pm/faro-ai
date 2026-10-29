# SPEC: Consented model improvement

- **Status:** Implemented with an external local fine-tuning starter
- **Date:** 2026-10-15
- **Decision:** [ADR-0012](../adr/0012-consented-model-improvement-and-training.md)

## Goals

- Let an operator see how approved MCP and AI-derived knowledge changes tenant-scoped local search.
- Keep RAG indexing and actual fine-tuning visibly separate.
- Collect examples only with purpose-specific consent, review them manually in the first release, and preserve a safe path to automated triage later.
- Allow a tenant to authorize local-only use, shared-model contribution, both, or neither.

## Consent contract

The authenticated tenant website backend supplies consent headers to Hono:

- `X-FaroAI-AI-Improve-Consent: true` permits existing limited improvement-gap behavior only.
- `X-FaroAI-AI-Training-Local-Consent: true` permits this interaction to be considered for the tenant's local fine-tuning dataset.
- `X-FaroAI-AI-Training-Shared-Consent: true` permits shared-pool consideration only when tenant authorization and `FAROAI_SHARED_TRAINING_ENABLED=true` also permit it.

Consent headers are ignored unless the FaroAI API key is valid and the tenant is active. These values are never accepted from the JSON body. Each candidate records which permissions were present. Missing consent does not prevent a chat response; it prevents candidate capture.

## Candidate lifecycle

`captured -> pending_review -> approved | rejected | expired | deleted`

- Capture the scrubbed user question, generated answer, selected provider/model, retrieved source IDs, response language, content hashes, tenant, correlation ID, policy version, consent scopes and expiry.
- Do not store full chat history, provider secrets, tool credentials or unsanitized request/response bodies.
- Pending candidates expire after 90 days. Rejected or expired candidates are excluded from every RAG and training build.
- Platform review requires an explicit decision and audit event. The schema includes `promotion_method` for future automated review, but automatic promotion is disabled initially.
- A thumbs-up may nominate an answer for review. A thumbs-down is an improvement signal only and never supplies a fine-tuning target. Fine-tuning approval requires a preferred answer.

## RAG promotion

- An operator may approve a candidate as tenant-scoped answer knowledge. It is sanitized, versioned, embedded with the configured embedding model and added to the approved retrieval index with tenant ID, source candidate, content version, language, and approval metadata.
- Every Qdrant query continues to filter by the authenticated `tenant_id`.
- This approval does not train any model. Retrieval results identify their knowledge source and can be removed or re-embedded by version.

## Fine-tuning dataset

- Approved supervised examples contain a prompt and a reviewed preferred response. The original model response is optional comparison metadata and is not a target unless a reviewer explicitly approves it.
- Dataset exports are scoped as `tenant_local` or `central_shared`. A central export includes only examples with end-user shared consent, tenant authorization, shared training enabled, and review approval.
- Each export creates an audit manifest containing its example count and content hash. The current release does not persist a frozen dataset snapshot or support re-export by manifest ID; an immutable snapshot is required before any training job can consume it.
- The local dataset export can be used with the standalone workstation CLI in [SPEC: Local fine-tuning runner](local-fine-tuning-runner.md). It is not a FaroAI-managed job and does not create a server-side immutable dataset snapshot. Tenant-local source generation from approved RAG documents is defined in [SPEC: Tenant-scoped RAG Learning](tenant-scoped-rag-learning.md).
- A managed trainer must use held-out examples, compare against the base model, store a versioned adapter outside Qdrant and require explicit release before inference can select it.

## Backoffice

The **Learning & training** page provides tenant/status filters; candidate question, answer, model, source references, consent scope and expiry; approve/reject controls; preferred-answer editing; independent RAG/local/shared promotion; RAG-to-draft generation using only the tenant's configured local model; separate RAG and dataset actions; and export controls for local/shared scopes. Customer-provided local consent is reflected as a preselected reviewer choice; the customer consent control itself remains unchecked by default. Tenant-local export is allowed in hosted multi-tenant mode when tenant authorization and local-model configuration are enabled. It must not claim a model was trained when only embeddings, drafts or a dataset were created.

## Data model and API

PostgreSQL is authoritative for consent evidence, review candidates, dataset manifests and job states. Candidate and dataset queries always require tenant scope. Shared jobs are separate platform-admin-only operations and receive only centrally approved candidate IDs.

Implemented operations:

- `POST /v1/chat`: optionally create a scrubbed candidate when consent permits.
- `GET /admin/v1/tenants/:tenantId/learning/candidates`: list candidates with paging and filters.
- `POST /admin/v1/tenants/:tenantId/learning/candidates/:candidateId/review`: approve/reject, select RAG/local/shared scopes, and set the reviewed preferred answer.
- `DELETE /admin/v1/tenants/:tenantId/learning/candidates/:candidateId`: withdraw the candidate and remove its tenant-scoped Qdrant knowledge if promoted.
- `GET /admin/v1/tenants/:tenantId/learning/datasets/local/export`: create an export audit manifest and return consent-filtered tenant-local JSONL.
- `GET /admin/v1/learning/datasets/shared/export`: create an export audit manifest and return centrally authorized JSONL.
- `POST /admin/v1/tenants/:tenantId/learning/rag/generate`: create human-review candidates from selected approved tenant documents using only that tenant's configured local Ollama/LM Studio model.
- A future training-worker API may create and evaluate LoRA jobs from frozen manifests; it is not part of this external CLI release.

## Deployment configuration

- `FAROAI_SHARED_TRAINING_ENABLED=false` by default in Compose and every deployment mode.
- `FAROAI_LOCAL_LLM_ENABLED=true` gates local consent, review promotion and export; it does not imply that FaroAI runs training inside its deployment. A separate tenant authorization gates tenant-local data use; it does not permit cross-tenant sharing. See ADR-0022 and ADR-0023.
- The shared-training switch is an additional kill switch; it does not replace per-tenant and per-user consent.

## Acceptance criteria

- No candidate is eligible for a training dataset without matching local/shared training consent. `ai_improve` alone may create a RAG-only review candidate but never enables training use.
- Captured data is scrubbed, pending records expire after 90 days, and no API keys or MCP credentials enter the record.
- An unreviewed candidate cannot enter Qdrant or a dataset manifest.
- Qdrant promotion always stores and filters by tenant ID and records source/version metadata.
- A central dataset excludes each candidate missing end-user shared consent, tenant authorization, shared-training enablement, or review approval.
- Dataset creation is visibly distinct from executing training and releasing a model.
- Audit events record review, promotion, export-manifest creation and deletion. Model release auditing is required when a trainer is implemented.
- Existing chat works when all improvement/training consent is false.
- The runner validates exported JSONL and writes LoRA output locally without calling FaroAI or Qdrant.
