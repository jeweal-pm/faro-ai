# SPEC: Tenant-scoped RAG Learning

- **Status:** Implemented as a review-and-export flow
- **Date:** 2026-10-16
- **Decision:** [ADR-0023](../adr/0023-tenant-scoped-rag-learning.md)

## Scope and user flow

This flow uses approved tenant knowledge to create supervised fine-tuning drafts. It does not fine-tune model weights and does not replace RAG retrieval.

1. A platform administrator records that the tenant authorizes local learning and a supporting authorization reference. Authorization is off by default.
2. The deployment enables local model connections. The tenant must have an enabled Ollama or LM Studio model configured and assigned.
3. In Learning, the operator selects up to 10 approved knowledge documents and requests up to 5 draft pairs per document.
4. FaroAI reads sanitized content from the tenant's authoritative PostgreSQL knowledge records and sends it only to that tenant's configured local model. OpenRouter/Jev fallback is not allowed.
5. Draft question/answer pairs are stored as pending candidates with the source document ID/version, model, tenant ID and audit event. They are not automatically approved, re-indexed, or added to a dataset.
6. A reviewer edits the preferred answer and explicitly selects local fine-tuning for each candidate. A candidate must pass all applicable source authorization checks.
7. The tenant-local export returns only that tenant's reviewed examples and writes a hashed export manifest. The separate local runner performs any actual fine-tuning.

## Authorization and consent

- The tenant_learning_settings local_training_authorized setting authorizes tenant-owned RAG source data and consented interactions for that tenant's local-learning path. It defaults false and requires an authorization reference.
- The shared-training authorization remains independent and cannot be implied by local authorization.
- Interaction-derived candidates require customer opt-in from the tenant's authenticated customer-site backend through the existing local-training consent header. The customer-facing checkbox is unchecked initially.
- In Backoffice, the local-training review checkbox is preselected when a candidate carries valid customer local-training consent or was generated from authorized RAG source content. A reviewer can clear it before approval.
- RAG-derived drafts do not require customer interaction consent because they originate from tenant-owned approved knowledge. They require the tenant-local authorization both when drafts are generated and when they are approved/exported.
- Tenant authorization revocation blocks new RAG draft generation, approval and export. Previously downloaded data/artifacts are outside the application and remain subject to tenant deletion procedures.

## Tenant isolation and data handling

- Every request resolves the tenant from the authenticated Backoffice route and uses an immutable tenant ID in all database queries and audit records.
- Selected document IDs must belong to the requested tenant and have approved status. Missing, removed or cross-tenant IDs fail the whole request.
- At most 10 documents and 5 pairs per document are processed per request. Credentials and generated dataset content are not written to application logs.
- The configured provider must be Ollama or LM Studio, enabled for deployment use, and assigned to that tenant. The gateway validates the saved endpoint against its local-model host policy before forwarding the request.
- The AI service scrubs credentials and personal data from source text and generated pairs, treats source text as untrusted, and asks the model for answers grounded only in that text.
- PostgreSQL is authoritative for source content, drafts, consent and manifests. Qdrant is not used as a training-dataset store.
- RAG-derived examples are marked separately from interaction-derived examples, have no shared-training consent, and are excluded from shared export.
- Similar drafts from the same tenant/source/version are deduplicated by a content hash.

## API contract

- PUT /admin/v1/tenants/:tenantId/learning/settings records local tenant authorization independently from shared-training authorization.
- POST /admin/v1/tenants/:tenantId/learning/rag/generate accepts document_ids (1–10) and questions_per_document (1–5). It requires tenant authorization, local-model deployment enablement, and a tenant-assigned local model.
- GET /admin/v1/tenants/:tenantId/learning/candidates exposes candidate origin, source references and consent basis for review.
- POST /admin/v1/tenants/:tenantId/learning/candidates/:candidateId/review continues to require an explicit preferred answer and local-training selection.
- GET /admin/v1/tenants/:tenantId/learning/datasets/local/export works in hosted/self-hosted and single/multi modes only when local-model use and the selected tenant's authorization are enabled. The result is tenant-scoped.
- If no approved, consent-eligible local-training examples exist for the tenant, export returns a clear conflict response and does not download an empty JSONL file or create an export manifest.
- The AI service's internal RAG-learning endpoint accepts only authenticated internal calls and only local-provider configurations; public clients cannot call it.

## UI behavior

- Keep tenant-local and shared authorization controls separate, each with its own reference.
- Show approved RAG documents for the selected tenant and allow selection up to the API limit.
- Clearly identify generated items as drafts from a tenant RAG source, including the source title and version.
- When the customer-facing site supplied local-training consent, preselect the corresponding Backoffice review choice. Never preselect the customer's consent checkbox itself.
- State that model calls create drafts and dataset export; only the separate runner changes model weights.

## Acceptance criteria

- Hosted multi-tenant mode can generate and export tenant-local examples without enabling shared training.
- No source document or candidate can cross tenant scope.
- No draft is generated unless tenant authorization and an approved tenant document are present.
- No RAG draft enters an export without human approval, a reviewed preferred answer, and an explicit local-training selection.
- A customer who opts into local learning sees that opt-in reflected in the default Backoffice review selection; a customer who did not opt in cannot be selected for interaction-derived training.
- Revoking tenant authorization blocks future RAG draft generation, local approval and local export.
- Local model endpoint failures return a controlled error and do not create partial candidates.
