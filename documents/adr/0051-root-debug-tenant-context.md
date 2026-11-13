# ADR-0051: Root-configured tenant context for administration and debugging

- **Status:** Accepted
- **Date:** 2026-11-08
- **Decision owners:** FaroAI platform
- **Related:** [ADR-0050](0050-tenant-mcp-accounts-and-root-defaults.md), [Root debug tenant context SPEC](../spec/root-debug-tenant-context.md)

## Context

Platform administrators often switch between tenant-scoped configuration and
debugging tasks. The current Backoffice chooses a tenant independently in each
section, and some sections default to the first tenant. The public discovery page
uses a deployment-wide demo API key and tenant configuration instead. Production
integrations authenticate with their own tenant API keys.

## Decision

- Store one root-selected debug tenant ID in `platform_runtime_settings` under
  `root_debug_tenant`. Only platform-admin APIs may read or update it.
- If no value exists, default the debug page to the first active tenant; root must
  explicitly save a tenant to persist the choice.
- Add a separate root-only Tenant Debug page. Root selects a tenant, opens a sign-in
  dialog, and enters that tenant's actual tenant-admin credentials before managing
  its MCP connections. The tenant session must resolve to the selected tenant.
- Do not impersonate tenant users or bypass tenant authentication. If credentials
  belong to another tenant, reject the sign-in for this debug context and clear the
  newly created tenant session.
- This selection is not authentication. The tenant MCP API continues to derive its
  authority from the validated tenant session, never from the selected ID alone.
- Do not apply this setting to `/` discovery, tenant login sessions, or external
  application integrations. `/` derives tenant context from its own validated
  tenant session; external integrations derive it from their own API access token.
- Audit every root context change. Do not store or expose API keys as part of this
  setting.

## Consequences

- Root can select and authenticate as a tenant administrator in a separate workspace
  to inspect and configure that tenant's MCP connections.
- A changed root context does not redirect signed-in discovery users to another
  tenant's catalog or knowledge data.
- Integrating applications remain responsible for using their own tenant API key;
  a tenant ID in a request cannot substitute for that credential.

## Acceptance criteria

- Root can read and change the selected tenant context from Backoffice.
- The selected tenant appears in the separate debug page and is required to match
  the tenant administrator session before MCP access is shown.
- Invalid tenant IDs are rejected and changes are audited.
- Tenant context is not exposed to or controlled by tenant-admin accounts.
- Changing root context does not change discovery's tenant-session or external
  API-token tenant resolution.
