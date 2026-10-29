# ADR-0012: Consent-gated RAG improvement and model training

- **Status:** Accepted (local execution superseded by [ADR-0022](0022-local-fine-tuning-runner.md))
- **Date:** 2026-10-14
- **Deciders:** FaroAI product owner
- **Supersedes:** The data collection and learning proposal in [ADR-0007](0007-from-3rdparty-to-localllm.md)
- **Related:** [ADR-0002 Qdrant](0002-use-qdrant-for-embed-db.md), [ADR-0003 tenant isolation](0003-use-tenant-id-for-design.md), [ADR-0008 Python worker](0008-use-phyton-for-service-worker.md), [ADR-0010 Backoffice and deployment modes](0010-platform-backoffice-and-deployment-modes.md), [ADR-0011 Jev model selection](0011-jev-selects-tenant-approved-models.md)

## Context

FaroAI needs to improve local search and local-model answers using approved information from MCP sources and useful AI interactions. The earlier ADR-0007 proposal calls this “learning” but does not distinguish retrieval indexing from fine-tuning, define separate consent scopes, or specify review, deletion, evaluation, and release controls. ADR-0010 consequently disables customer-data training until a separate governance decision exists.

The current stack supports document embedding into Qdrant and stores limited scrubbed unanswered-question gaps when `ai_improve` consent is present. It does not store answer candidates, curate supervised examples, or fine-tune and deploy model weights. Embeddings improve retrieval; they do not change model weights.

## Decision

FaroAI will provide two separate, opt-in improvement paths:

1. **RAG knowledge improvement:** approved source material and human-approved question/answer knowledge are embedded into Qdrant. This changes what can be retrieved, not model weights.
2. **Supervised fine-tuning:** human-approved prompt/response examples can be prepared as a versioned dataset for local model fine-tuning. The training runner, model artifact, evaluation results, and release are distinct from Qdrant.

### Collection and consent

- Collection is off unless the request carries purpose-specific end-user consent from the authenticated tenant application. `ai_improve` alone is not consent for model training.
- Tenant-local training data and centrally shared training data are separate scopes. Tenant-local data is usable only for that tenant and may be prepared in hosted multi-tenant deployments when tenant authorization is recorded. Central contribution additionally requires the tenant's explicit authorization and the shared-training deployment switch; both scopes default off. See [ADR-0023](0023-tenant-scoped-rag-learning.md).
- Consent is recorded with the candidate, policy version, tenant, scope and capture time. Missing, malformed, revoked, or stale consent fails closed. Consent is not accepted from the browser request body; the authenticated tenant backend supplies it to Hono.
- Customer data is scrubbed before retention. Secrets, credentials, payment data, and unnecessary personal data are excluded. Captured candidates expire after 90 days unless explicitly approved into separately governed knowledge or training artifacts.
- Revocation stops future collection and dataset builds. Pending candidates are deleted or excluded. A model already trained must be retired and replaced by a new build; deleting a vector or source row cannot erase information already encoded in model weights.

### Review and promotion

- Newly captured model interactions are review candidates only. They are never automatically added to approved Qdrant knowledge or a training dataset.
- The first release requires an authorized platform administrator to review and approve each candidate. The data model records a promotion method so later quality/rule-based automation can be added without treating raw generated output as approved.
- A candidate can be approved independently for tenant-scoped RAG, tenant-local fine-tuning, or central fine-tuning. Tenant-local fine-tuning requires tenant authorization and the applicable source consent: customer opt-in for interaction-derived examples or tenant authorization for approved RAG documents. Central approval is impossible unless both end-user and tenant/deployment consent are present.
- Fine-tuning examples require a verified preferred answer. A thumbs-up may nominate a response for review; a thumbs-down never becomes a target answer. A correction or human-written answer is preferred for supervised pairs.
- Every promoted record retains source interaction IDs, content hashes, consent scope, reviewer, policy version and dataset/model version for audit and exclusion from future builds.

### Storage, processing and isolation

- PostgreSQL stores consent evidence, candidates, review state, dataset manifests, and training job state. Redis carries disposable job coordination only.
- Qdrant stores only approved retrieval vectors and payloads. It is not the store for raw conversation logs, training examples, or model weights. Tenant filters are mandatory on every tenant-scoped vector operation.
- Fine-tuning datasets and artifacts are stored outside Qdrant in a tenant-scoped private artifact location. Tenant-local exports remain isolated by tenant ID regardless of hosted/self-hosted or single/multi deployment mode. Central artifacts may contain only centrally approved examples and are isolated from tenant-local artifacts.
- Hono remains the authorization boundary; Python workers perform scrubbing, embedding, dataset construction and training only for signed jobs with validated tenant and scope. Backoffice endpoints require platform-admin authorization and create audit events.
- Jev continues to choose the inference model according to ADR-0011. It does not choose which data can be collected, promoted, shared or trained on. Embedding model configuration is independent of Jev's generation-model choice.

### Training and release controls

- Fine-tuning is an explicit job against a named local base model. It never runs as a side effect of chat, embedding, or candidate approval.
- Each job uses an immutable dataset manifest, a held-out evaluation set, a base-model identifier and a versioned output artifact. An adapter is not served until evaluation passes and an administrator explicitly releases it.
- The default FaroAI deployment has no in-container fine-tuning runtime. A separate workstation CLI starter is defined by ADR-0022. Backoffice-managed jobs, artifact registry, evaluation gates and automatic release remain out of scope until separately designed. No claim of successful training is shown before an actual run completes.
- Shared-training is disabled by default in every deployment. Self-hosted deployments default to local-only scope and cannot send local training content to the shared pool. Hosted multi-tenant deployments may enable tenant-local Learning without enabling the shared pool.

## Consequences

- FaroAI can improve local search through approved RAG content and build traceable supervised datasets for local fine-tuning.
- Consent and review increase operator work but prevent feedback or model errors from silently becoming trusted knowledge.
- RAG and fine-tuning require separate controls, retention, deletion, evaluation and release procedures.
- Fine-tuning does not run inside the current FaroAI deployment. Operators can export an approved local dataset and run the separate CLI starter from ADR-0022 on a suitable workstation.
- Central learning is possible only from separately consented and approved examples. It is never inferred from ordinary chat consent or tenant mode.

## Alternatives considered

- **Automatically embed every generated answer:** rejected because incorrect, stale or prompt-injected answers could become persistent retrieval results.
- **Treat Qdrant embeddings as model training:** rejected because embeddings affect retrieval and do not update model weights.
- **Use tenant data for a shared model by default:** rejected because tenant-local business data must not cross tenant boundaries without separate tenant and end-user authorization.
- **Let Jev decide whether data can be saved or trained:** rejected because model routing and data governance are separate responsibilities.

## Implementation

See [SPEC: Consented model improvement](../spec/consented-model-improvement.md) for consent, review, RAG promotion and dataset contracts, and [ADR-0022](0022-local-fine-tuning-runner.md) for external local fine-tuning. Revisit this ADR before enabling automatic promotion, shared training, another training backend, or persistent model artifacts.
