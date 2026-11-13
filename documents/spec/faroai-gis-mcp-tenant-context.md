# SPEC: FaroAI-authenticated tenant context for GIS MCP

- **Status:** Implemented in code; local deployment needs matching context secrets
- **Date:** 2026-11-12
- **Decision:** [ADR-0062](../adr/0062-faroai-authenticated-tenant-context-for-gis-mcp.md)

## Request flow

1. FaroAI gateway validates the tenant bearer token, tenant status, deployment mode, scopes, and tool allow-list.
2. The gateway sends `tenant_id` to the AI service in the existing HMAC-authenticated internal request. The AI service does not accept a tenant ID from public request input.
3. For connections whose `integration_key` is `gis`, the AI service sends the normal `MCP_API_KEY` plus the signed tenant context headers:

   ```http
   X-FaroAI-Tenant-ID: <authenticated FaroAI tenant UUID>
   X-FaroAI-Tenant-Timestamp: <Unix seconds>
   X-FaroAI-Request-ID: <unique UUID for this HTTP request>
   X-FaroAI-Tenant-Signature: <hex HMAC-SHA256>
   ```

   For each HTTP request, the signature is HMAC-SHA256 using `FAROAI_GIS_MCP_CONTEXT_SECRET` over UTF-8 bytes of `<timestamp>.<tenant_id>.<request_id>.<uppercase method>.<path without query>.<lowercase hex SHA-256 of raw body bytes>`. Generate a fresh request ID for every Streamable HTTP transport request.
4. GIS independently verifies the service API key and the tenant signature, validates UUIDs/timestamp and a maximum 60-second clock skew, atomically consumes the request ID once, then finds the unique active tenant mapping in `GisAdminDb`.
5. GIS resolves the mapped organization ID to `tbl_organization.database_name`, validates organization status and database identifier format, and sets request-scoped `ORG_DB` for the complete MCP transport request.
6. GIS MCP tools run with the resolved request context. They do not accept tenant ID or database name in tool arguments. No mapping or auth failure reaches tool execution.

## GIS integrated-application credential and tenant-link lifecycle

- Use each GIS organization's existing `<ORG_DB>.tbl_ApplicationDetails` row with `slag: "faroai"` for its FaroAI credentials and connection state, using GIS's established application-details model/schema. The GIS frontend already provides a special FaroAI row, so no global catalog template or `defaultId` is required. `GisAdminDb.tbl_ApplicationDetails` remains the shared catalog and must never contain a tenant's secret. Do not create a duplicate `tbl_faroai_integration` collection.
- After FaroAI credential verification succeeds, save the verified FaroAI tenant ID and encrypted credential in the organization's existing tenant `tbl_ApplicationDetails` row. Keep secret material encrypted with `GIS_FAROAI_CREDENTIAL_KEY` and never return it from view/list APIs. Store only the non-secret FaroAI tenant association and enabled state on the matching authoritative `GisAdminDb.tbl_organization` record for reverse lookup.
- The signed-context resolver finds a unique active FaroAI tenant link from this trusted GIS-owned storage, then resolves the GIS organization ID to `tbl_organization.database_name`.
- Disabling the link or replacing it with a different verified tenant ID deactivates the prior association and activates the new one atomically or fails closed if consistency cannot be maintained.
- A tenant ID may map to at most one active GIS organization. Duplicate active mappings are rejected and are treated as an operational error during resolution.
- Organization status and database name are re-read from the authoritative GIS organization registry; request claims never contain a database name.
- GIS records consumed `(tenant_id, request_id)` pairs in a short-lived central nonce collection with a unique index and TTL cleanup so replay rejection works across backend replicas. This collection contains no credentials and is separate from integrated-application configuration.

## Credential and secret boundaries

| Setting | Purpose | Scope |
| --- | --- | --- |
| `MCP_API_KEY` | Authenticate FaroAI service access to GIS MCP | Shared by one GIS MCP deployment; not a tenant selector |
| `GIS_FAROAI_CREDENTIAL_KEY` | Encrypt FaroAI client secrets stored in per-organization `tbl_ApplicationDetails` records | Shared by one GIS deployment; not an MCP request credential |
| `FAROAI_GIS_MCP_CONTEXT_SECRET` | Sign short-lived tenant context in FaroAI AI service | Shared only between FaroAI AI service and GIS MCP |
| FaroAI tenant ID | Select the linked GIS organization through the signed assertion | Unique per FaroAI tenant; not a database name |

All three secrets must be independent random values, stored in deployment secret stores, omitted from logs and API responses, and rotated with an overlap plan. Use TLS for remote MCP connections.

## Scope and background processing

- The tenant context selects a database only. FaroAI gateway scopes and per-tenant `allowed_tools` remain the authorization decision for which tool can be called.
- MCP mutation tools preserve their existing preview/confirmation/status rules.
- GIS HTTP requests from GIS frontend continue to use GIS session auth and its existing `ORG_DB`; they do not receive the MCP context secret or shared MCP API key.
- MCP bulk jobs persist the resolved organization/tenant identity with the job. Workers load the persisted tenant context per job and never use caller request context or a global mutable tenant variable.
- `tools/list` can be inspected with service authentication alone. Any tenant data operation requires the signed tenant context.
- Explicit legacy single-tenant fallback, if retained for a background worker, must be isolated from `/mcp` request handling and must not mask missing signed context.

## Failure behavior

- Missing or invalid service key: reject before MCP transport.
- Missing/malformed signature, timestamp, tenant ID, or unconfigured signing secret: reject before tenant lookup.
- Reused request ID, invalid body digest/signature, or expired assertion: reject before tenant lookup or MCP tool execution.
- Expired assertion, missing/duplicate mapping, disabled integration/organization, or invalid database mapping: reject before tool execution with a generic error; logs may include a stable error code and correlation ID, never a secret or raw database name.
- Database connection errors remain generic and do not trigger a fallback to another tenant.

## Deployment

1. Configure independently generated `FAROAI_GIS_MCP_CONTEXT_SECRET` in the FaroAI AI service and `GIS_FAROAI_MCP_CONTEXT_SECRET` in GIS backend with the same value. These names may differ by deployment, but values must match.
2. Keep the existing GIS `MCP_API_KEY` and `GIS_FAROAI_CREDENTIAL_KEY` configured as separate secrets; persist each tenant's integration credentials in that organization's `tbl_ApplicationDetails` row with `slag: "faroai"`.
3. Confirm each GIS organization's FaroAI integration is verified/enabled so its central tenant mapping exists.
4. Roll out GIS mapping and request-context support, then FaroAI signed headers. Requests without valid context fail closed; there is no cross-tenant or default database fallback.
5. Remove `MCP_ORG_DB` from live MCP configuration after background workers have been migrated to tenant-aware job processing.

## Acceptance criteria

- [x] A signed FaroAI tenant request resolves only that tenant's mapped GIS database.
- [x] A tampered, expired, unknown, disabled, or ambiguous tenant assertion is rejected before tool code executes.
- [x] A request-supplied database name or unsigned tenant ID cannot change the selected database.
- [x] Concurrent requests for different tenants use request-scoped context rather than process-global tenant state.
- [x] MCP service authentication, tenant scope, tool allow-list, and existing mutation constraints remain independent and enforced.
- [x] Background jobs retain and use their originating tenant context.
- [x] Logs and responses expose neither secrets nor raw database names.
- [ ] Matching deployment secrets are configured and both services restarted; the values are currently absent from local `.env` files.
