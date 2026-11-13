# Prompt session CSRF selection

- Investigation: a browser may hold root admin and tenant sessions at once. Product-draft prompt requests carry the tenant session and tenant CSRF, but the gateway's admin route guard chose the root admin session first and rejected the request with `csrf_failed`.
- Changed `gateway/src/admin.ts` so only the exact tenant prompt routes first validate a matching tenant session and its CSRF token. Root administration routes still use root authentication. Root admin access to prompt routes remains available when its own CSRF token is supplied; scoped server credentials remain supported.
- GIS MCP agent review is recorded under `chat_log/team_agent_qa/2026-11-08_23-50-00_Asia-Bangkok.md`; the failure occurs before GIS MCP is called.
- Reproduced before the fix using simultaneous valid root and tenant cookies: HTTP 403 `csrf_failed` with the user's exact error text. After rebuilding/reloading `api`, the same safe invalid-input probe reached request validation: HTTP 400 `invalid_request`.
- Ran the guide's real three-ring product-draft prompt under simultaneous root and tenant cookies. It returned HTTP 200 with three drafts. This generates drafts only; it does not create products in GIS. The temporary test root session was deleted after each probe and the tenant test session was logged out.
- `pnpm --dir gateway typecheck` and the Docker API build passed; `api` reports healthy.
