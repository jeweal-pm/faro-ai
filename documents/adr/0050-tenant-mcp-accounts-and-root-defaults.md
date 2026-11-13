# ADR-0050: Tenant MCP accounts and root-managed tool defaults

- **Status:** Accepted
- **Date:** 2026-11-08
- **Decision owners:** FaroAI platform
- **Related:** [ADR-0003](0003-use-tenant-id-for-design.md), [ADR-0010](0010-platform-backoffice-and-deployment-modes.md), [Tenant MCP access SPEC](../spec/tenant-mcp-access.md)

## Context

FaroAI already stores MCP connections under `tenant_mcp_connections` with a unique
`(tenant_id, integration_key)` key. Today only a platform-admin session can edit
those connections. A tenant cannot sign in to configure its own MCP. Tool permission
selection also defaults to an empty list, with no root-controlled default policy.

## Decision

- Add tenant-admin accounts managed by the platform root. A tenant may have multiple
  named login accounts; root creates, resets, or disables them. Passwords are
  Argon2id hashes and are never retrievable after saving.
- Add tenant-admin sessions scoped in the database to one tenant and one account.
  Tenant users can view, save, test, enable, and choose tools only for the tenant
  bound to their session. The server does not accept a tenant ID from the tenant
  user's request as an authority source. Password reset, account disable, and tenant
  suspension revoke active sessions; reactivation requires a fresh login.
- Keep platform-root access separate. Root continues to manage all tenants, account
  access, platform providers and the global default MCP tool-selection policy.
- The initial platform policy is `all_discovered`: newly discovered tools are
  checked by default for a new connection. Root can change the policy to
  `none_selected`. The policy applies only to newly discovered tools; a connection
  re-test preserves existing choices, removes tools no longer advertised, and does
  not re-enable a previously unselected tool.
- The root default is a convenience for initializing tenant configuration, not an
  authorization bypass. Runtime MCP calls remain limited to the tenant connection's
  saved `allowed_tools`, the platform fixed tool allow-list, and workflow scopes.
- Continue using the tenant's configured MCP endpoint and secret. GIS continues to
  select its organization database and authenticate using its own server
  configuration; FaroAI must not pass a caller-selected GIS tenant/database to GIS.
- Do not add tenant access to platform-wide provider, credit, learning, audit, or
  tenant-management routes. Tenant accounts can configure MCP only.

## Consequences

- Each tenant can manage its own GIS/GMS/ERP MCP connection without seeing another
  tenant's endpoints, credentials, or tool approvals.
- Root remains the control plane for account provisioning and global defaults.
- The default `all_discovered` policy is broad and may include mutation tools. Root
  can set `none_selected` before provisioning tenants when least-privilege defaults
  are required; individual tenant admins can always uncheck tools.
- Tenant admins require a separate login URL and session/CSRF boundary. Existing
  platform-admin sessions and tenant MCP records remain valid.

## Acceptance criteria

- A tenant login session can access only its own MCP connection read/save/test APIs.
- Tenant credentials cannot call platform-admin APIs or choose another tenant ID.
- Root can create, reset, and disable tenant login accounts and suspend tenants.
- Root can set the default tool-selection policy; new tools follow that policy.
- Re-testing does not re-enable previously unselected tools.
- Password reset, account disable, or tenant suspension revokes existing tenant
  sessions; reactivation does not restore them.
- Tenant sessions use hashed tokens, Argon2id password hashes, rate-limited login,
  CSRF validation on writes, secure cookie settings, and audit events.
