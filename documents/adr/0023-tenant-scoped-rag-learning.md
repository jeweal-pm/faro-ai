# ADR-0023: Tenant-scoped Learning from approved RAG knowledge

- **Status:** Accepted
- **Date:** 2026-10-16
- **Deciders:** FaroAI product owner and implementation team
- **Related:** [ADR-0002 Qdrant](0002-use-qdrant-for-embed-db.md), [ADR-0003 tenant isolation](0003-use-tenant-id-for-design.md), [ADR-0012 consented improvement](0012-consented-model-improvement-and-training.md), [ADR-0022 local fine-tuning runner](0022-local-fine-tuning-runner.md)

## Context

Tenants want to use their approved RAG knowledge to prepare better tenant-local models, including when FaroAI runs as hosted + multi. RAG indexing and fine-tuning are different: vectors make approved source content retrievable, while supervised fine-tuning needs reviewed question/answer examples. Passing arbitrary document chunks to a trainer does not create reliable training pairs.

Customer interaction consent is collected by the tenant's customer-facing site, outside Backoffice, and forwarded by its authenticated backend through FaroAI's consent headers. Tenant authorization to use tenant-owned RAG content is a separate decision. Neither consent permits combining data across tenants.

## Decision

- Add a tenant-local learning authorization to Backoffice, with an authorization reference. It is off by default and separate from authorization for cross-tenant/shared learning.
- In hosted + multi, all candidates, source documents, authorizations and exports remain scoped to the immutable tenant ID. A tenant's local-learning authorization does not enable shared training.
- Only approved tenant RAG documents can be selected. FaroAI sends selected source content only to an enabled, configured Ollama or LM Studio model assigned to that tenant. There is no OpenRouter fallback for this flow.
- The local model drafts grounded question/answer pairs. Drafts are stored as pending review candidates with their source document and version. A human must approve each pair and select local fine-tuning before it enters an export.
- Chat-derived local examples still require explicit customer opt-in supplied by the authenticated tenant backend. The customer-facing checkbox starts unchecked. When that consent was received, Backoffice preselects the corresponding local-learning choice for the reviewer; the reviewer can clear it.
- Local dataset export requires both tenant authorization and FaroAI's local-model deployment switch. It contains only this tenant's reviewed examples with the applicable source consent. It remains tenant-scoped in every deployment mode.
- Shared training retains its existing independent requirements: customer shared-training consent, tenant shared authorization, and the deployment switch for shared training. RAG-derived tenant-local examples are never eligible for shared export.
- PostgreSQL remains authoritative for sanitized source text, candidates, consent, authorization, reviews, manifests and audit events. Qdrant remains the retrieval index; it is not read as a training-dataset store.
- Fine-tuning is still an explicit external runner action. Sending knowledge to LM Studio/Ollama drafts examples; it does not change model weights.
- Revoking tenant authorization blocks future draft generation, approvals and exports. Previously downloaded datasets and model artifacts remain outside FaroAI's deletion control and must be managed by the tenant/operator.

## Consequences

- A hosted multi-tenant deployment can prepare a separate local dataset for each authorized tenant without switching to single-tenant mode.
- Tenant-owned business facts can seed a reviewable dataset without pretending that vector embeddings themselves trained a model.
- Local model calls, human review and source selection add steps, but prevent automatic model output from being treated as approved training truth.
- Customer interaction consent and tenant source authorization are visibly distinct in the Learning workflow.

## Alternatives considered

- **Train directly on Qdrant chunks:** rejected because chunks do not provide reliable question/answer targets and Qdrant is not the authoritative data source.
- **Use Jev or a hosted provider to generate RAG drafts:** rejected for this flow because tenant knowledge must stay on the tenant's configured local model path.
- **Treat hosted multi as incompatible with tenant-local learning:** rejected because tenant authorization and mandatory tenant filters allow a tenant-only dataset without cross-tenant pooling.
- **Preselect consent on the customer website:** rejected because consent must be a deliberate customer action. Backoffice may reflect a recorded opt-in as the default review choice.

## Implementation

See [SPEC: Tenant-scoped RAG Learning](../spec/tenant-scoped-rag-learning.md). This ADR extends the source and deployment eligibility for tenant-local Learning in ADR-0012 and ADR-0022; it does not enable shared training or managed fine-tuning.
