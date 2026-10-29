# ADR 0003: Use `tenant_id` for Multi-Tenant Design

**Status:** Accepted

**Date:** 2026-10-07

## Context

FaroAI is designed to serve multiple websites, customers or organizations from the same platform. Each tenant may have its own users, consent records, MCP sources, documents, embeddings, model policies, cache entries and AI conversations.

Without an explicit tenant boundary, a query, vector search, cache lookup or background job could accidentally read or modify another tenant's data. A tenant cannot be identified reliably from a user-supplied email, domain, URL or request parameter because those values can change or be forged.

The tenant boundary must work consistently across all FaroAI services and storage systems:

- Next.js web and administration UI;
- Hono.js API gateway;
- Python AI services and background workers;
- PostgreSQL;
- Qdrant;
- Redis;
- MCP sources and live tools;
- logs, metrics and audit records.

## Decision

Use an immutable, opaque `tenant_id` as the mandatory namespace for all tenant-owned data and operations.

`tenant_id` should be a UUID or equivalent opaque identifier. It must not be derived from an email address, domain name, customer ID or display name. Human-readable tenant names and domains are separate attributes and may change without changing the tenant identity.

The trusted tenant context is resolved by the Hono.js API from authenticated server-side credentials, session claims or a validated API key. The browser must not be allowed to select an arbitrary `tenant_id` and the Python service must not trust a tenant value that has not been validated by Hono.js.

Every internal request and background job must carry:

```json
{
  "tenant_id": "opaque-tenant-identifier",
  "correlation_id": "request-or-job-identifier"
}
```

The authorization context must be checked before the request reaches a tenant-scoped data store.

## Storage rules

### PostgreSQL

- Add `tenant_id` to every tenant-owned table.
- Include `tenant_id` in ownership and uniqueness constraints where applicable.
- Scope every read, update and delete by `tenant_id`.
- Use composite indexes beginning with `tenant_id` for common tenant queries.
- Keep platform-global records explicitly marked as global; never infer global scope from a missing tenant value.

### Qdrant

- Store `tenant_id` in every point payload.
- Apply a mandatory tenant filter to every search, scroll, recommendation and delete operation.
- Keep collection version and embedding model metadata separate from the tenant filter.
- Shared collections are allowed initially only when tenant filtering is enforced centrally.
- Separate collections may be used for tenants requiring stronger isolation or independent lifecycle control.

### Redis

Every tenant-scoped key must include the tenant namespace, for example:

```text
tenant:{tenant_id}:cache:answer:{fingerprint}
tenant:{tenant_id}:rate:{client_id}
tenant:{tenant_id}:routing:{request_hash}
tenant:{tenant_id}:job:{job_id}
```

No cache key may use only a user message, email address or product ID when the value can differ between tenants.

### MCP

- MCP source definitions belong to one tenant unless explicitly marked as platform-owned.
- Indexed resources must be written to the correct tenant namespace.
- Live tool calls must use the tenant's configured connection and allow-list.
- A client request cannot select an arbitrary MCP source, URL or tool.

### Logs and observability

- Include `tenant_id` and `correlation_id` in safe logs, metrics and traces.
- Do not log raw prompts, secrets or unnecessary personal data.
- Access to cross-tenant operational metrics must be restricted to platform administrators.

## Authorization flow

```text
Client request
  -> Next.js/session or server credential
  -> Hono authenticates caller
  -> Hono resolves and authorizes tenant_id
  -> Hono creates internal request context
  -> Python service/worker receives validated context
  -> PostgreSQL, Qdrant, Redis and MCP calls enforce tenant scope
```

The Python service may reject requests without a validated tenant context. It must not silently fall back to a default tenant.

## Consequences

### Positive consequences

- Prevents accidental cross-tenant retrieval and cache leakage.
- Makes tenant ownership explicit across all services and databases.
- Allows tenant-specific model policies, MCP sources, embedding collections and retention rules.
- Supports hosted and self-hosted deployments using the same contract.
- Makes audit, quota and cost reporting possible per tenant.

### Trade-offs

- Every query, cache key, vector operation and job needs tenant context.
- Composite indexes and tenant filters add implementation complexity.
- Shared Qdrant collections require strict centralized filtering.
- Data migrations must backfill and validate `tenant_id` before a table becomes tenant-scoped.

## Alternatives considered

### Use email or domain as the tenant identity

Rejected. Emails and domains can change, are not guaranteed to be unique in all deployments and are unsafe as authorization boundaries.

### Use only application or API keys

Rejected. Credentials authenticate a caller but do not provide a consistent data namespace across databases, vectors, cache keys and jobs. The authenticated credential must resolve to a `tenant_id`.

### Separate database or Qdrant collection for every tenant

Not the default. It provides stronger isolation but increases operational cost and provisioning complexity. It remains an option for high-isolation tenants.

### Rely on application-level filtering only

Rejected unless the filter is mandatory and centralized. Every storage adapter must require tenant context so a caller cannot accidentally omit the filter.

## Required safeguards

- Reject missing or invalid `tenant_id` with an authorization error.
- Never accept tenant identity directly from an untrusted browser field.
- Test that tenant A cannot read, update, delete, search or cache tenant B data.
- Include tenant scope in idempotency keys and job deduplication keys.
- Include tenant scope in cache invalidation and vector collection switching.
- Audit tenant changes, credential rotation, data exports and destructive operations.
- Review all new tables, endpoints, workers and MCP tools for tenant enforcement before merge.
