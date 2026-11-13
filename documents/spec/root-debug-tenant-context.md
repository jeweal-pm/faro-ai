# Specification: Root debug tenant context

## Goal

Give the platform root a separate, tenant-authenticated workspace for debugging MCP
configuration without changing the public demo discovery page.

## Behavior

- A new **Tenant Debug** item in the root menu opens a separate debug page.
- The page shows the selected tenant and ID, with a selector populated from tenants
  available to the platform root.
- The first active tenant is the initial default when no root choice has been saved.
- Saving a tenant persists the selection and records an audit event. The page clearly
  shows which tenant is selected for debugging.
- A **Sign in to tenant** action opens a modal for the selected tenant's actual
  tenant-admin email and password. The page only shows its MCP connection tools after
  authentication succeeds and the session tenant ID matches the selected tenant.
- If a tenant administrator already has a session for a different tenant, clear that
  tenant session before changing context. A mismatch after login also clears the new
  session and displays an error.
- The authenticated workspace reuses the tenant MCP API and shows only that tenant's
  MCP connections. It does not grant root impersonation or extra permissions.
- If the saved tenant was removed or is unavailable under the current deployment
  mode, fall back to the first active tenant and require root to save the new choice.

## Security and boundaries

- Only a valid platform-admin session may read or change the context.
- Validate the selected tenant against the server-side tenant table. Never use a
  browser-supplied tenant ID as proof of identity or as a replacement for a tenant
  API key.
- Tenant admins cannot read or change the root context.
- Root debug selection does not affect `/`. Discovery requires its own tenant
  session and resolves tenant context from that session; it does not read the root
  debug selection. External integrations use their own credentials.
- Each external caller continues to resolve its tenant from its own API key.

## API

- `GET /admin/v1/system/debug-tenant` returns `{tenant_id, tenant_name, status}`.
- `PUT /admin/v1/system/debug-tenant` accepts `{tenant_id}` and returns the saved
  context. Reject malformed or missing tenant IDs and IDs outside the configured
  single-tenant deployment.
- Tenant login reuses `POST /tenant/v1/auth/login` and checks the returned tenant ID
  against the root-selected context.

## Acceptance checks

- Root can select a tenant, save it, reload Backoffice, and see the same tenant.
- Root can persist a selected tenant and sign in to the debug page using that tenant's
  real tenant-admin account.
- A tenant session for another tenant is cleared and cannot expose MCP settings for
  the root-selected tenant.
- An invalid or out-of-scope tenant cannot be saved.
- Tenant login cannot access the root debug-context endpoints.
- Changing the setting leaves discovery's tenant-session and API-token resolution
  unchanged.
