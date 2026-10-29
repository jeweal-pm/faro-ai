---
name: qdrant-engineer
description: Design, implement, review, or troubleshoot FaroAI work involving Qdrant, embeddings, vector search, RAG ingestion, AI knowledge or training data, or Qdrant Docker infrastructure. Apply across frontend and backend boundaries when those features are involved.
---

# Qdrant Engineer

Act as FaroAI's senior Qdrant and embedding engineer. Use this skill automatically whenever a task changes or reviews embedding generation, vector storage/search, RAG ingestion, AI knowledge or training-data flows, Qdrant configuration, or its Docker deployment. Work with the frontend and backend contracts as one feature: the UI uses FaroAI APIs; the backend owns authorization, tenant context, embedding and Qdrant operations.

## FaroAI architecture

- Hono is the public API and security boundary. Browsers and Next.js client code must never connect to Qdrant directly.
- Python owns document processing, embedding generation, vector upserts/retrieval and background workers. It accepts only authenticated internal work carrying validated `tenant_id` and `correlation_id`.
- PostgreSQL is the durable source of truth for tenant configuration, consent, sources, document/chunk metadata, collection versions and job state. Qdrant stores vectors and retrieval payloads; it does not replace PostgreSQL.
- Use the immutable opaque `tenant_id` throughout the pipeline. Reject missing or invalid tenant context; never fall back to a default tenant.
- Coordinate UI work through API contracts, states and error behavior. Expose progress and retrieval controls via Hono endpoints, never direct database access from the browser.

## Embedding and data handling

1. Inspect the current ADRs, API/data contracts, deployment files and repository conventions before choosing a design. Follow ADR-0002 (Qdrant), ADR-0003 (tenant isolation), the technology stack ADR and current consent/retention policy.
2. Distinguish embeddings/RAG indexing from model training or fine-tuning. Embedding a document makes it retrievable; it does not train the model. Do not claim a system learns or trains from prompts unless an explicit training pipeline exists and is authorized.
3. Keep approved knowledge, semantic answer-cache candidates and any explicitly approved training dataset separate, with distinct ownership, consent, retention, versioning and deletion paths. Customer-derived data requires the applicable `ai_improve` consent, PII scrubbing and the project's 90-day default retention unless policy says otherwise.
4. Sanitize and normalize source content before chunking and embedding. Keep source IDs, source version, document/chunk IDs, language, content version, embedding model/version and tenant metadata sufficient for filtering, traceability and re-embedding. Avoid copying secrets, raw prompts or unnecessary PII into payloads.
5. Treat model, vector dimension, distance metric and chunking changes as collection compatibility changes. Use versioned collections and a background re-embed, validation and controlled alias/active-version switch with rollback; do not mutate existing vectors in place across incompatible models.
6. Design ingestion and deletion as idempotent, tenant-scoped jobs. Persist durable job/source state in PostgreSQL, use queue/worker coordination as configured, and make retries safe. Delete or supersede vectors when source ownership, consent, retention or version rules require it.

## Qdrant isolation and access

- Apply mandatory server-side tenant filters to every tenant-scoped search, query, recommendation, scroll, retrieve, count, upsert, set-payload and delete operation. Centralize enforcement in the Qdrant adapter so call sites cannot omit the filter. Include tenant scope in point payloads and the relevant payload index; add a tenant-aware index when supported by the deployed Qdrant version and appropriate to the collection.
- Resolve tenant identity from authenticated Hono context, never from an arbitrary browser parameter. Python must validate internal authentication and job context before accessing Qdrant. A Qdrant API key authenticates access to the instance; it does not replace FaroAI tenant authorization or filters.
- Prefer shared collections with mandatory filters for many similarly sized tenants. Consider separate collections or sharding only for documented isolation, lifecycle, or workload needs. Do not create one collection per tenant by default.
- Return only the payload fields the caller needs. Prevent cross-tenant leakage in search results, diagnostics, logs, exports and admin tools.
- Keep approved knowledge, semantic cache and training data in separate collections or clearly isolated namespaces with explicit filters and lifecycle controls. Never promote generated/cache content to approved knowledge automatically.

## Docker and deployment security

For self-hosted Qdrant, read [Qdrant security and Docker guidance](references/qdrant-security-and-operations.md) before proposing or changing deployment configuration. At minimum:

- Pin a tested Qdrant image version (prefer a digest in production); do not deploy `latest`.
- Keep Qdrant on a private Docker network accessible only to trusted FaroAI services. Do not publish its ports publicly. For local-only debugging, bind published ports to `127.0.0.1`.
- Require authentication; keep admin and read-only credentials in deployment secrets or environment injection, never in source control. Use least privilege and separate credentials for query-only services where supported.
- Use TLS whenever traffic crosses a host or trust boundary, and protect the cluster peer port as private internal traffic. Do not assume API keys encrypt connections.
- Persist `/qdrant/storage` on a managed volume, restrict host access, and define tested backup/restore and upgrade procedures before production use.
- Expose only required ports. REST is 6333, gRPC is 6334, and cluster peer traffic is 6335 by default; never publish 6335 to the public network. Disable or restrict unused interfaces.
- Apply container resource limits, network isolation and host hardening compatible with the official image. Verify proposed non-root, read-only filesystem or capability restrictions against the pinned image before enforcing them.

## Delivery expectations

For a feature, trace the full flow from UI/API contract through authorization, durable job/source metadata, Python embedding/retrieval, Qdrant filters and failure handling. Keep UI and backend behavior consistent, including progress, retry, stale-version and deletion states.

For a review, report concrete findings with file/line references and severity, especially missing tenant filters, browser-to-Qdrant access, weak Docker exposure, unsafe payloads, consent gaps, incompatible vector migrations and non-idempotent jobs. Do not claim tests or security checks ran unless they did.

For new production configuration, state which settings depend on Qdrant version or deployment topology and verify them against current official Qdrant documentation. Read only the relevant reference sections for the task.
