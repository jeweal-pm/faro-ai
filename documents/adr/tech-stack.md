# ADR: AI and FaroAI Technology Stack

**Status:** Accepted for FaroAI; implementation remains in progress.

**Scope:** Central AI service, retrieval, embeddings, MCP synchronization, caching and migration boundaries.

## 1. Decision summary

FaroAI will be a framework-independent, multi-tenant AI service that can run in two modes:

- **Hosted mode:** FaroAI manages model access through OpenRouter and provides a shared API to client websites.
- **Self-hosted mode:** FaroAI runs inside the customer infrastructure and uses a local Ollama or LM Studio endpoint by default.

The browser never calls OpenRouter, Qdrant or privileged FaroAI endpoints directly. The client website backend remains the security and session boundary.

## 2. FaroAI application stack

FaroAI uses separate runtimes for the web experience, API boundary and AI/data-processing workloads. This keeps browser-facing concerns, request policy and long-running AI jobs independently scalable.

| Layer | Technology | Responsibilities |
|---|---|---|
| Web application | **Next.js** | User portal, tenant dashboard, admin panel, retrieval playground, authentication UI and server-rendered pages |
| API gateway/service boundary | **Hono.js + TypeScript** | REST API, authentication, tenant resolution, consent checks, request validation, rate limits, streaming/SSE and service-to-service contracts |
| AI and worker runtime | **Python** | AI orchestration, MCP connectors, document sanitization/chunking, embedding jobs, retrieval pipelines, evaluations and provider adapters |
| Durable data | PostgreSQL | Tenants, configuration, consent, jobs, documents, feedback, policies and audit metadata |
| Vector search | Qdrant | Embeddings, semantic retrieval and versioned vector collections |
| Cache/coordination | Redis | Rate limiting, cache, queue coordination, leases, locks and deduplication |
| Model access | OpenRouter / Ollama / LM Studio | Hosted or self-hosted inference through controlled server-side adapters |

### 2.1 Runtime responsibilities

**Next.js** is the presentation and administration layer. It must not contain provider secrets or call Qdrant, Redis or OpenRouter directly from the browser. It calls the Hono API using a tenant-scoped session or server-to-server credential.

**Hono.js** is the API boundary. It owns authentication, tenant and consent validation, request size limits, rate limiting, stable JSON contracts and streaming responses. It can serve as the backend-for-frontend for Next.js and route longer tasks to Python workers.

**Python** is the AI/data-processing layer. It is used for model orchestration, MCP synchronization, embedding generation, vector upserts, retrieval evaluation and background jobs. Python workers do not bypass Hono authorization; jobs carry a validated tenant context and correlation ID.

This split allows the web UI, API traffic and AI workers to scale or deploy independently while keeping the security boundary explicit.

### 2.2 API contract

- Stable JSON API such as `POST /v1/chat`, `POST /v1/feedback` and administrative source/job endpoints.
- REST communication between client websites and FaroAI.
- Docker-based deployment for local, hosted and self-hosted installations.
- The service owns tenant validation, consent validation, safety rules, model routing and response validation.

### 2.3 Model and inference layer

- **OpenRouter** for hosted model access and provider/model routing.
- **Ollama or LM Studio** for self-hosted local inference through an OpenAI-compatible endpoint.
- Provider credentials remain server-side and are never exposed to browsers or admin panels.
- Deterministic retrieval fallback remains available when a provider, model or network is unavailable.
- Model training is not part of ordinary chat or embedding. Consent-gated collection, RAG promotion and supervised fine-tuning follow [ADR-0012](0012-consented-model-improvement-and-training.md); training and shared contribution remain opt-in and separately governed.

### 2.4 PostgreSQL

PostgreSQL is the system-of-record for structured FaroAI data:

- tenants and tenant configuration;
- API keys, scopes, quotas and revocation;
- consent records and retention policy;
- MCP source definitions and sync versions;
- document/chunk metadata;
- embedding job records and audit events;
- feedback, unanswered-question gaps and approved synonyms;
- model policies and routing configuration.

PostgreSQL is not the primary vector index. Vector search is handled by Qdrant.

### 2.5 Qdrant

Qdrant is the planned vector database for embeddings and semantic retrieval. It is preferred over ChromaDB for this architecture because it provides a stronger production-oriented service boundary, filtering, collection management and operational separation from the application process.

Qdrant stores vectors for:

- approved knowledge and MCP-indexed content in the approved-knowledge collection;
- tenant-scoped product/catalogue vectors in a separate rebuildable collection;
- future answer-cache candidates, if approved in a separate ADR;
- optional routing or classification embeddings, if later required.

Product vectors are populated from the authenticated catalogue snapshot API and
contain descriptive text and stable IDs. PostgreSQL holds the current product
facts; live price and availability must be checked against GIS when live MCP is
the selected source. Request-scoped MCP results are never persisted as vectors.

Discovery may use an eligible paid vision model to turn a user-supplied jewelry
photo into a temporary text query. The photo is not stored in Qdrant. Product
vectors remain text embeddings; cross-modal image vectors require a separate
decision and collection.

Embedding model, vector dimension, distance metric and collection version are compatibility settings. A model or dimension change creates a new versioned collection, re-embeds in the background, validates quality, switches the active collection and keeps the old collection for rollback.

### 2.6 Redis

Redis is an operational component, not the source of truth. It is used for:

- distributed rate limiting across multiple FaroAI instances;
- exact and short-lived semantic cache entries;
- routing-decision cache;
- job queue state, leases, locks and deduplication keys;
- short-lived conversation/task coordination.

Redis data must be disposable and rebuildable. Durable tenant metadata, consent, jobs and audit records remain in PostgreSQL.

## 3. Background workers and learning loop

The worker pipeline is for synchronization and retrieval improvement, not automatic model training:

```text
MCP/catalogue sync
  -> sanitize and normalize
  -> persist authoritative records and durable embedding job in PostgreSQL
  -> queue with Redis
  -> generate embeddings in the Python worker
  -> upsert vectors into the versioned knowledge or product collection
  -> update PostgreSQL source/version/job metadata
```

Redis coordinates the queue and workers. PostgreSQL records durable job state. Failed jobs can be retried, paused, resumed or audited from an administrator panel.

Customer feedback can create scrubbed unanswered-question gaps when `ai_improve` consent exists. Capturing model interactions for RAG or fine-tuning requires the separate consent scopes and manual review defined in ADR-0012. Candidates are not automatically promoted to approved knowledge, datasets, or model training.

## 4. MCP integration

MCP is the tenant-specific data connector:

- **Indexed resources:** products, collections, FAQ, policies and CMS content are synchronized periodically into PostgreSQL metadata and Qdrant vectors.
- **Live tools:** price, stock, promotions, order status and customer-specific data are queried at request time.

Every MCP source has an allow-listed endpoint/tool set, indexed or live mode, refresh policy, source version and health state. Client requests cannot select arbitrary MCP URLs or tools.

## 5. Cache and knowledge separation

The system keeps three logically separate stores:

1. **Approved knowledge index** — owner-approved factual content used by RAG.
2. **Semantic answer cache** — generated candidates with tenant, language, task, source version, catalogue version, consent and expiry metadata. It is never treated as approved knowledge automatically.
3. **Routing-decision cache** — operational decisions about task type and model class. It is not knowledge and has a short TTL.

Cache rules:

- Exact cache hits require matching tenant, language, task, consent and source versions.
- Semantic hits require a high similarity threshold and compatible metadata.
- Product answers require an exact catalogue-version match.
- Price, stock, order and user-specific data must use live MCP tools and must not be served directly from semantic cache.

## 6. Tenant isolation

`tenant_id` is mandatory in every tenant-scoped:

- PostgreSQL query;
- Qdrant point payload and filter;
- Redis cache key;
- MCP source and job payload;
- log and audit event;
- administrator-panel query.

Shared Qdrant collections are allowed only when every query enforces a tenant filter. Separate collections per tenant may be selected when stronger isolation is required. Cross-tenant retrieval is never allowed.

## 7. Docker deployment

The planned self-hosted Compose stack contains:

- `faroai-api` — HTTP API;
- `faroai-worker` — MCP, chunking, embedding and vector jobs;
- `postgres` — durable metadata and configuration;
- `qdrant` — vector storage and retrieval;
- `redis` — cache and queue coordination;
- optional `ollama` or external LM Studio endpoint — local inference.

OpenRouter is disabled by default in self-hosted mode. It is enabled only through explicit customer configuration.

## 8. Knowledge and embedding management panel

FaroAI will provide an administrator panel for business-level embedding management. Qdrant's technical dashboard is not a replacement for this panel.

Planned functions:

- register and health-check tenant-scoped MCP sources;
- configure indexed versus live resources;
- preview sanitized documents and chunks;
- start, pause, retry and cancel sync/embedding jobs;
- re-index or re-embed a document;
- show collection version, model, dimension, counts and health;
- switch the active collection after validation;
- inspect retrieval results in a tenant-scoped playground;
- audit destructive vector deletion and collection retirement.

## 9. Migration principles

1. Define the FaroAI API contract before connecting client applications.
2. Start with deterministic retrieval and the OpenRouter boundary.
3. Add PostgreSQL metadata and tenant isolation before enabling shared infrastructure.
4. Add MCP indexed/live source modes.
5. Deploy Qdrant and run embedding jobs in observe-only mode first.
6. Enable semantic-cache reads only after similarity, consent and version checks are validated.
7. Use Redis for distributed operations, never as the only durable store.
8. Keep self-hosted inference outbound-free unless the customer explicitly enables OpenRouter.
9. Test provider failure, MCP failure, local-model failure, tenant isolation, consent absence, cache staleness and prompt injection before production rollout.
