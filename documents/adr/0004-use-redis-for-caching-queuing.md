# ADR-0004: Use Redis for Caching and Queue Coordination

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** Jakapong Chan-o (PM)

## Context

FaroAI needs shared, low-latency state across multiple API instances and workers. This includes rate-limit counters, short-lived cache entries, routing decisions, and coordination for asynchronous work such as MCP synchronization and embedding jobs.

PostgreSQL is the durable source of truth for tenant configuration, consent, job records, source versions and audit metadata. Qdrant stores vectors for retrieval. Neither should be used as a general-purpose distributed cache or lock manager.

Redis is suitable for operational state that can expire or be rebuilt. Treating it as the only record of a job or business decision would make data loss during eviction, restart or infrastructure failure difficult to recover from. Redis keys also need the same tenant boundary as the rest of FaroAI to prevent cross-tenant cache or coordination leaks.

## Decision

Use Redis for disposable cache data and short-lived coordination across FaroAI API instances and workers. Redis is not a system of record. PostgreSQL remains the durable source of truth, and Qdrant remains the vector store.

Redis may be used for:

- Distributed rate-limit counters and short-lived request coordination.
- Exact-response and semantic-answer cache entries, subject to the cache and consent rules below.
- Short-lived routing-decision cache entries. Durable routing policy remains in PostgreSQL.
- Queue delivery/coordination, worker leases, locks, retries-in-progress and deduplication keys.
- Short-lived conversation or task state when losing it does not lose durable user or job data.

### Tenant scope and key design

Every tenant-scoped Redis key must include the immutable, opaque `tenant_id`. Keys must also include the purpose and, where applicable, a stable fingerprint or identifier. For example:

```text
tenant:{tenant_id}:cache:answer:{fingerprint}
tenant:{tenant_id}:rate:{client_id}
tenant:{tenant_id}:routing:{request_hash}
tenant:{tenant_id}:job:{job_id}:lease
```

Do not build keys from user-provided tenant identity, raw prompts, email addresses or other unnecessary personal data. Platform-wide keys must use an explicit platform namespace; a missing tenant identifier must never imply global scope. See ADR-0003 for tenant identity and authorization requirements.

### Cache behavior

- Cache entries must have an explicit TTL and be safe to discard or recompute.
- Cache identity and validation must include all data that affects the result, such as tenant, language, task, consent state and relevant source or catalogue versions.
- Generated customer-derived entries require the relevant `ai_improve` consent, must be scrubbed of PII and must follow the approved retention period. The default retention is 90 days.
- Semantic answer cache entries are candidates, not approved knowledge. They must remain logically separate from the approved knowledge index and routing-decision cache.
- Price, stock, promotions, order status and customer-specific data must be fetched through live MCP tools, not served from semantic cache.
- Cache invalidation must be scoped by tenant and by the source/version changes that make an entry stale.

### Queue and job durability

PostgreSQL stores durable job identity, tenant scope, status, retry metadata and audit history. Redis may deliver and coordinate work, but a Redis queue entry must not be the only evidence that a job exists. Workers must be idempotent, validate the job's tenant context and correlation ID, and update durable job state in PostgreSQL.

Queue delivery is at least once: workers must tolerate duplicate delivery. Enqueueing and recovery must be designed so that a committed PostgreSQL job can be re-enqueued if Redis loses queue state or is unavailable. Redis locks and leases are temporary coordination aids, not authorization controls or proof of exclusive ownership after their TTL expires.

### Failure behavior and access

- If Redis is unavailable, cache reads are treated as misses and cache writes may be skipped; the application must use its normal source of truth or deterministic fallback.
- If rate limiting cannot be enforced safely during a Redis outage, Hono must use an explicitly configured conservative fallback or reject/throttle the request. It must not silently disable the limit.
- If queue coordination is unavailable, durable jobs remain recorded in PostgreSQL and can be enqueued when Redis recovers. API responses must not claim that work was accepted unless durable job creation succeeded.
- Redis is reachable only by trusted server-side services. The browser must never connect to Redis, and Redis credentials must be kept in environment variables or a secret manager.
- Do not store secrets, raw prompts or unnecessary PII in Redis. Apply network isolation, authentication and transport protection appropriate to the deployment.

## Consequences

### Positive consequences

- Enables shared rate limiting and coordination across horizontally scaled API and worker instances.
- Keeps frequently accessed, short-lived data off PostgreSQL and reduces repeated computation.
- Provides fast queue coordination while retaining durable job recovery through PostgreSQL.
- Tenant-scoped keys and explicit cache lifetimes reduce the risk of stale or cross-tenant results.

### Trade-offs

- Cache and queue behavior must account for expiry, eviction, duplicate delivery, Redis outages and recovery.
- Every tenant-scoped operation needs a correctly scoped key and invalidation path.
- PostgreSQL and Redis state must be reconciled for reliable job delivery; Redis alone cannot provide job durability.
- Cache versioning and consent checks add complexity but are required for safe reuse of generated results.

## Alternatives considered

### Use PostgreSQL for all caching and queue coordination

Rejected as the default. PostgreSQL remains authoritative and can support durable job records, but using it for all high-volume ephemeral coordination would mix operational workloads with core application data and increase contention.

### Treat Redis as the durable job or business-data store

Rejected. Redis data may expire, be evicted or be lost during recovery. Durable job state, policy, consent and audit history belong in PostgreSQL.

### Use an independent message broker from the start

Deferred. Redis meets the initial cache and coordination requirements with the planned deployment stack. A dedicated broker may be introduced if measured delivery, throughput or isolation needs exceed Redis's role; PostgreSQL remains the durable job record either way.

## Follow-up constraints

- Define key prefixes, TTLs and cache version inputs in the relevant service contracts.
- Ensure job creation is durable before acknowledging acceptance, and provide a reconciliation path for jobs not present in Redis.
- Monitor Redis availability, memory/eviction behavior, queue age and retry volume without logging sensitive payloads.
- Verify tenant isolation, cache invalidation, consent enforcement, duplicate job delivery and recovery from Redis loss.
