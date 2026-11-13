# Specification: Tenant logins and tenant-scoped MCP configuration

## Goal

Allow each active tenant to sign in and configure its own MCP connections while the
platform root retains tenant lifecycle and policy control.

## Roles

### Platform root

- Uses the existing platform-admin login.
- Creates and updates tenant records, suspends/reactivates tenant access, and adjusts
  tenant credits.
- Creates tenant login accounts, resets their passwords, and disables/re-enables
  them. The root can see the account email and status, never the stored password.
- Configures the global initial tool-selection policy for newly discovered MCP tools.
- Retains access to platform-wide provider and system configuration.

### Tenant administrator

- Signs in at `/tenant` using an account provisioned by the platform root.
- May list, save, enable/disable, test, and choose allowed tools on MCP connections
  bound to that account's tenant.
- May create and revoke server-to-server application credentials for the same tenant.
- May sign in to `/` for tenant-scoped discovery and the permitted natural-language
  product, procurement, and read-only customer birthday lookup workflows. These calls
  use the session tenant and cannot select a different tenant in request data.
- Customer birthday lookup is restricted to the `search_customers` MCP tool and returns
  only name, recorded DOB/age, primary address, phone, and email. Application credentials
  need the separate `gis:customers:read` scope; all calls still require that tenant's GIS
  connection to allow the tool.
- Cannot provide or override `tenant_id` as the authorization source.
- Cannot access platform settings, other tenants, provider credentials, credits,
  learning controls, or platform audit data. `/tenant` provides no direct GIS
  procurement mutation controls; natural-language writes remain limited to the
  existing prompt workflow and its GIS preview/confirmation rules.

## Authentication and session

- Store tenant login identities in `tenant_admin_users`, scoped by `tenant_id` and
  unique by normalized email across the platform so email/password login identifies
  exactly one tenant account.
- Store password hashes using Argon2id; never return a hash through the API.
- Store opaque random session-token hashes in `tenant_admin_sessions`, together with
  tenant ID, account ID, CSRF hash, expiry, revocation and last-seen metadata.
- Use separate HttpOnly session and readable CSRF cookies for tenant logins. Apply
  the configured secure-cookie mode, SameSite=Lax, exact Backoffice-origin checks,
  CSRF header validation for writes, eight-hour expiry, and Redis login rate limits.
- Login requires both an active tenant account and an active tenant. Return a
  generic credential error for invalid, disabled, or suspended accounts.
- Resetting a tenant account password, disabling that account, or suspending its
  tenant revokes all affected active sessions immediately. Re-enabling the account
  or tenant does not restore revoked sessions; the user must sign in again.
- Audit successful/failed login, logout, account provisioning/reset/disable, and MCP
  configuration changes without recording passwords, API keys, or prompt content.

## MCP permission defaults

- Root setting `mcp_new_tool_default` accepts `all_discovered` or `none_selected`.
- Default is `all_discovered` for the requested initial behavior. This policy applies
  when a tenant first tests a new integration and when genuinely new tool names are
  discovered later.
- On re-test, preserve existing allowed tools that remain advertised. Remove tools
  that no longer exist. Add only newly discovered names when the root setting is
  `all_discovered`; otherwise leave them unchecked. Never silently re-enable an
  existing unchecked tool.
- Saving a tool selection still constrains runtime calls to the tenant-specific
  saved selection and FAROAI's fixed allow-list. A checked tool may still be
  unavailable to a workflow whose server-side scope does not permit it.
- Endpoint host allow-list, HTTPS enforcement, encrypted API-key storage, and
  deployment egress controls continue to apply equally to root and tenant operators.

## API contract

Tenant-facing endpoints use the cookie session and derive the tenant from the
validated session:

- `POST /tenant/v1/auth/login`
- `GET /tenant/v1/auth/session`
- `POST /tenant/v1/auth/logout`
- `GET /tenant/v1/mcp/connections`
- `PUT /tenant/v1/mcp/connections/{integration}`
- `POST /tenant/v1/mcp/connections/{integration}/test`
- `GET /tenant/v1/app-credentials`
- `POST /tenant/v1/app-credentials` (returns the secret once)
- `DELETE /tenant/v1/app-credentials/{id}`
- `POST /v1/oauth/token` (server-to-server client-credentials exchange)
- `/v1/chat`, allowed document/analysis endpoints, and prompt-only `/admin/v1`
  operations accept the signed tenant session from FaroAI's own web app.

Root-only APIs under `/admin/v1` provision, list, reset and disable tenant accounts,
and read/update the default permission policy. Tenant API responses do not expose
secret ciphertext, nonce, authentication token, or GIS organization configuration.

## Data migration

Add tenant account/session tables and seed `mcp_new_tool_default=all_discovered` in
`platform_runtime_settings`. Existing tenant MCP connections and allowed tool arrays
are preserved; current root management remains available.

## GIS ownership boundary

GIS MCP configuration remains owned by FAROAI per tenant. GIS's own process chooses
its organization database from server-side `MCP_ORG_DB` and authenticates from
server-side `MCP_API_KEY`. FaroAI does not send a tenant-controlled organization or
database name to GIS. No GIS MCP tool/schema change is required.

## Acceptance checks

- Tenant A cannot enumerate, read, save, test, or mutate Tenant B's connections.
- A tenant login cannot call root-only APIs even if it changes the URL or request
  body.
- A suspended tenant or disabled account cannot establish a new session; sessions
  are rejected after account/tenant suspension. Password reset, account disable,
  and tenant suspension revoke existing sessions; reactivation requires a new login.
- With root policy set to `all_discovered`, a first test checks each discovered tool.
- With root policy set to `none_selected`, a first test checks none.
- Re-test preserves user choices and only applies the configured policy to new tool
  names.
- API keys remain encrypted and never return in list/save/test responses.
