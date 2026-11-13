# ADR-0062: Authenticate FaroAI tenant context for GIS MCP

- **Status:** Accepted
- **Date:** 2026-11-12
- **Related:** [ADR-0003](0003-use-tenant-id-for-design.md), [ADR-0052](0052-tenant-application-credentials-and-authenticated-discovery.md), [ADR-0053](0053-gis-integrated-faroai-credentials.md), [SPEC](../spec/faroai-gis-mcp-tenant-context.md)

## Context

FaroAI authenticates an opaque tenant API bearer token and resolves its tenant ID and scopes in the gateway. GIS MCP currently authenticates a shared `MCP_API_KEY` but chooses one fixed `MCP_ORG_DB`, so the API key does not identify which FaroAI tenant is calling. GIS stores the verified FaroAI tenant ID in an organization-local integration record, but MCP has no central reverse mapping to the GIS organization database.

The product requirement is that FaroAI's authenticated tenant selects the GIS organization for each MCP request. A caller must never choose a database by submitting a raw database name or unsigned tenant ID.

## Decision

1. The FaroAI gateway remains the authority for FaroAI tenant identity and permissions. After gateway authentication, the AI service receives the tenant ID only over the existing signed internal gateway request.
2. For each HTTP request to a GIS MCP connection, the AI service adds a short-lived HMAC-signed tenant context alongside the existing `MCP_API_KEY`. The assertion binds the FaroAI tenant ID, timestamp, unique request ID, HTTP method, path, and raw-body digest; GIS accepts a maximum 60-second clock skew and consumes each request ID once. A separate `FAROAI_GIS_MCP_CONTEXT_SECRET` is used for this signature.
3. GIS stores each organization's FaroAI integration credentials in that organization's existing `<ORG_DB>.tbl_ApplicationDetails` integrated-application row. The shared integrated-application catalog remains in `GisAdminDb.tbl_ApplicationDetails` and contains no tenant secret. GIS stores only the non-secret verified FaroAI tenant association/enabled state on the authoritative `GisAdminDb.tbl_organization` record, then resolves its database name from that record. No duplicate `tbl_faroai_integration` collection is introduced. Missing, duplicate, disabled, or malformed mappings fail closed.
4. GIS places the resolved database in request-scoped `AsyncLocalStorage` for the full MCP request. MCP tools use this context for all tenant data access. Request data cannot override it.
5. `MCP_API_KEY` remains deployment-level service authentication. `GIS_FAROAI_CREDENTIAL_KEY` remains a GIS deployment-level at-rest encryption key for organization-specific FaroAI client secrets. Neither identifies a tenant and neither is reused as the signed-context key.
6. Background workers continue to use persisted job tenant context and must not inherit a caller's request context or use a process-global tenant variable.

## Consequences

- One GIS MCP deployment can safely route requests for multiple linked FaroAI tenants.
- GIS remains the authority for tenant-to-database mapping; FaroAI never receives or selects a GIS database name.
- FaroAI and GIS deployments must configure the same dedicated context-signing secret. MCP requests fail closed when it is missing or invalid.
- GIS uses a short-lived nonce record to reject replayed tenant-context requests across backend replicas; this is replay-protection state, not a tenant credential store.
- Existing single-tenant deployments can retain their explicit worker configuration during migration, but live MCP requests must use authenticated tenant context.
- The existing integrated-application record must be kept consistent with verified credential changes and organization status.

## Alternatives considered

- **Trust a `tenant_id` or database name header without a signature:** rejected because callers could select another tenant.
- **Use the shared MCP API key as tenant identity:** rejected because it is deployment-wide and has no tenant binding.
- **Scan every tenant database for an integration on each request:** rejected because it is unbounded, slow, and difficult to make unambiguous.
- **Introspect the FaroAI token from GIS on every MCP call:** rejected for the initial implementation because it adds a FaroAI network dependency to each GIS operation; a signed context is already available after gateway authentication.

## Review triggers

Revisit if FaroAI switches to public-key-signed tenant assertions, GIS centralizes tenant integrations, or a key-rotation service is introduced.
