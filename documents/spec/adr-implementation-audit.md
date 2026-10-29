# ADR implementation audit

Date: 2026-10-14

This audit summarizes the implementation visible in the current source tree and the local Docker environment. “Partial” means the decision has a working initial path but still has listed scope or runtime checks outstanding.

| ADR / decision | Status | Evidence and remaining work |
|---|---|---|
| ADR-0000 clone project | **Implemented as project baseline** | FAROAI is the active project workspace. Continue to track migration gaps against the product and architecture ADRs below. |
| ADR-0001 centralize third-party AI access through FAROAI/Jev | **Partial** | Hono is the public authorization boundary and supports configured external/local model connections. Jev selects from tenant candidates. AWS Bedrock, provider discovery, and a complete external-provider runtime verification remain outstanding. |
| ADR-0002 Qdrant vector database | **Implemented in initial form** | Python owns embedding and tenant-scoped Qdrant retrieval; approved knowledge and consented promotion are separate. Operational backup/restore and retrieval quality evaluation remain follow-up work. |
| ADR-0003 tenant ID design | **Implemented in initial form** | Hono resolves trusted tenant context; PostgreSQL, Redis, Qdrant and MCP paths carry tenant scope. Continue auditing every new route/job for tenant isolation. |
| ADR-0004 Redis caching and queue coordination | **Implemented in initial form** | Redis is used for short-lived routing state and queue coordination; durable job/policy state stays in PostgreSQL. Production failover and load behavior remain to be verified. |
| ADR-0005 PostgreSQL general database | **Implemented in initial form** | PostgreSQL stores tenant, provider, policy, job, consent and audit state, with numbered SQL migrations. Backup/restore and upgrade operations remain to be verified. |
| ADR-0006 Local LLM support | **Partial** | Deploy-time local-LLM and local-host allow-list guards gate Ollama/LM Studio provider management and tenant policies. Model installation/discovery and a verified customer-local single-tenant deployment remain outstanding. |
| ADR-0007 external-to-local learning/data split | **Superseded by ADR-0012** | Raw interaction capture and automatic training remain disabled. The governed replacement is consented, scrubbed candidates with manual review, separate tenant-local/shared dataset exports, and explicit RAG promotion. |
| ADR-0008 Python service/worker | **Implemented in initial form** | FastAPI owns orchestration, embedding, Qdrant operations, MCP live tools, and the queue worker. Evaluation quality management and GPU training are not implemented. |
| ADR-0009 tenant GIS/GMS/ERP MCP connections | **Accepted; source and migration deployed** | Migration 003 and admin API/UI support tenant endpoints, encrypted API keys, testing/tool discovery and explicit tool allow-lists. Verification against real customer GIS/GMS/ERP MCP endpoints and indexed resource synchronization remain outstanding. |
| ADR-0010 platform Backoffice and deployment modes | **Partial implementation** | ADR/SPEC and initial UI/API/auth/credit/provider/migration code exist. See [platform Backoffice SPEC](platform-backoffice.md) for remaining auth, deployment and operational gaps. |
| ADR-0011 Jev selects tenant-approved models | **Partially superseded by ADR-0016** | Jev remains the per-request selector. Manual per-tenant model grants are replaced by automatically derived, tenant-scoped candidates that pass the provider connection caps. |
| ADR-0012 consent-gated RAG improvement and training | **Partial; source and migration deployed** | Consent propagation, scrubbed review candidates, tenant-scoped Qdrant promotion/deletion, expiry cleanup, Backoffice review, and local/shared JSONL export are implemented. Fine-tuning execution, frozen dataset snapshots, evaluation/release and artifact lifecycle remain outstanding. |
| ADR-0013 bound Jev routing by configured price | **Partially superseded by ADR-0016** | Tenant request spend ceiling and input/image budgets remain optional request-level controls. Per-model manual provider prices are superseded by synced prices and provider-specific caps. |
| ADR-0014 image pricing and free-model exclusion | **Clarified by ADR-0016** | Provider image prices are synced when available. Free, unknown, and stale prices are excluded unconditionally; the free-model opt-out is removed. Live image-request pricing validation remains pending. |
| ADR-0015 provider model catalog and unified pricing | **Partially superseded by ADR-0016** | Secure discovery and endpoint protections remain. Manual model prices, enable checkboxes, and manual tenant grants are replaced by per-connection caps and automatic eligibility. |
| ADR-0016 provider-specific price caps and automatic model selection | **Source, migrations, and deployment complete; provider limits require operator input** | Provider input/output caps are configured per connection; catalog prices populate automatically; the gateway filters independently of Jev; provider and tenant pages no longer require selecting model IDs. Migrations 008–010 are applied; migration 010 resets existing caps to zero until an operator sets real values. OpenRouter discovery was previously verified from the API container; endpoint-to-page interaction remains untested. |

## Cross-cutting gaps

- Verify SSO/OIDC and production cookies/redirects with the customer's identity provider and TLS proxy.
- Exercise provider pricing and Jev decisions against real model endpoints, including image-capable models.
- Complete backup/restore, resource/availability planning, and production failure-mode exercises for PostgreSQL, Redis, and Qdrant.
- Keep implementation status and dated changes synchronized with ADR/SPEC updates.
