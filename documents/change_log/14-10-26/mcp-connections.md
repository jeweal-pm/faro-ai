# MCP Connections

Date: 14-10-2026 (Asia/Bangkok)

## Delivered

- Added ADR-0009 for tenant-scoped GIS, GMS, ERP, and generic MCP connections, including encrypted API keys, connection testing, discovered tools, explicit tool approval, and deployment-owned egress policy.
- Added Backoffice SPEC details for configuring, testing, and approving tenant MCP tools.
- Added PostgreSQL migration 003 for tenant-scoped MCP connection records.
- Added gateway admin API and Backoffice UI for saving/rotating credentials, testing connections, and managing per-connection allowed tools.
- Routed only enabled, tested connections with approved tools from the gateway to the AI service.
- Added the AI service MCP test endpoint and runtime Streamable HTTP tool calls.
- Enforced exact deployment host allow-lists, HTTPS (except loopback development), disabled redirects and environment proxies for MCP HTTP clients, and filtered discovered tool names to the gateway's accepted format.
- Updated the ADR implementation audit and Compose environment/migration configuration.

## Verification

- Gateway TypeScript typecheck: passed.
- Backoffice TypeScript check: passed.
- Docker Compose configuration validation: passed.

## GIS product search live verification (2026-10-14)

- Rechecked the saved GIS MCP connection after GIS reported adding `search_products`. MCP discovery returned `get_backend_status` and `search_products`; the search input schema accepts required `query` and optional `language` as specified.
- Approved only `search_products` for the tenant connection and recorded the test/approval in the MCP audit log. Other discovered tools remain unapproved.
- Ran `I need a necklace` once through the local frontend at `http://127.0.0.1:3001` with chat processing consent on and learning/training consent off. The frontend request reached FAROAI and returned the deterministic verified no-match response with zero product cards, consistent with GIS returning a valid empty `products` array. No result was embedded or stored as training data.
- The MCP search flow is now end-to-end verified. To display jewelry cards, GIS must have matching active catalog products visible to this API key's organization/location and return them in the agreed `{ "products": [...] }` envelope.
- Local frontend dev server points to `http://127.0.0.1:3000` and remains available on loopback port 3001. No Docker image was rebuilt. C: had about 87 MiB free after the browser run.

## Product routing fix after GIS catalog update (2026-10-14)

- A credential-safe direct MCP call now returns 10 necklace records for `I need a necklace`, but FaroAI chat still returned zero.
- Confirmed this deployment has no Jev route selector configured. The no-selector fallback did not recognize `necklace` and routed the query to knowledge search, so it never called GIS.
- Added the ADR/SPEC-approved fallback: with Jev routing unavailable, product queries use `search_products` only when exactly one active source has approved that tool. Ambiguous sources are never guessed; jewelry care/repair questions remain knowledge searches.
- AI source is mounted read-only into its dev container with Uvicorn reload enabled; no image build was required.
- Repeated the prompt through the local frontend after the code reloaded. The page rendered eight product cards and attributed them to GIS MCP, with no browser errors. GIS returned ten matches and FAROAI displayed its maximum of eight. The displayed records were marked `out_of_stock`; no prices appeared on the cards.
- Rebuilt the API, AI service, worker, and Backoffice images and recreated the local FaroAI stack.
- Applied migrations 002 and 003; the final schema ledger contains migrations 001, 002, and 003.
- Runtime checks passed: gateway readiness returned HTTP 200, Backoffice admin returned HTTP 200, and Qdrant returned HTTP 200 when queried with the AI service API key.
- Removed 14 dangling images labeled for the FaroAI Compose project after confirming no container referenced them. Left images from other projects alone; Postgres, Redis, and Qdrant volumes remain present.
- Docker Desktop stopped during the first Compose startup attempt and was relaunched. Compose then completed successfully. The unrelated mongodb container is running but remains unhealthy, as it was before this operation.
- Automated tests were not run. Python syntax validation was unavailable because this Windows host exposes only the Microsoft Store Python alias.
- No real GIS/GMS/ERP endpoints or credentials were available, so vendor MCP connectivity remains unverified. The stack is running locally; no external deployment was performed.

## Tenant creation fix

- Diagnosed PostgreSQL's conflicting parameter inference: the tenant UUID parameter was reused for the text audit resource ID. Changed the audit insert to bind resource_id separately as parameter $4.
- Added a structured tenant-create failure log containing the correlation ID and database error code/name, without logging tenant input or SQL details.
- Gateway typecheck and API image build passed. The API container is healthy and gateway readiness returns HTTP 200.
- Removed the replaced API image after verifying that no container referenced it.

## Credit adjustment fix

- Fixed the same PostgreSQL UUID/text parameter inference conflict in the credit audit insert by binding resource_id as its own parameter $5. The transaction can now commit its balance update, ledger entry, and audit event together.
- Added structured failure logging with correlation ID and database error code/name, without recording the credit reason or tenant input.
- Gateway typecheck and SQL statement parsing passed; rebuilt and restarted the API. Gateway readiness returned HTTP 200.
- Removed the replaced API image after confirming no container referenced it.

## MCP connection test failure

- Diagnosed the failed GIS MCP test: the stored endpoint uses localhost, and the AI service runs inside Docker; container loopback does not point to a Windows-host or sibling-container MCP server.
- The AI container log showed TypeError before a network request because the MCP client passed HTTP options that the installed MCP SDK 1.30.0 no longer accepts.
- Updated MCP Streamable HTTP client construction to inject a configured httpx.AsyncClient, retain finite timeouts, reject environment proxies, and use the installed SDK API. Raised the supported MCP SDK floor to 1.30.
- Added safe failure categories so the Backoffice can distinguish endpoint policy, reachability, timeout, credential, server, and protocol failures without exposing secrets or response content.
- Updated the Backoffice SPEC to explain container loopback and the connection-test error contract.
- Clarified the MCP form that localhost targets the AI service container in Docker. The saved GIS URL is HTTP localhost on port 3009; the container cannot use that address to reach a host or sibling service.
- Gateway npm build, Python syntax validation, and local Compose validation passed. The API and AI service were recreated using the local source mounts without rebuilding images; API readiness returned HTTP 200.
- A real MCP handshake remains pending. The configured localhost endpoint must resolve to an approved HTTPS MCP server reachable from the AI service container; container localhost points to the AI container itself.

## External MCP endpoint connectivity

- Confirmed the replacement GIS endpoint is an external HTTPS MCP URL; a host-side unauthenticated probe reached the server but returned HTTP 400, so protocol/authenticated connection status is not yet verified.
- Added the external-MCP egress deployment note to the Backoffice SPEC and README. External HTTPS MCP calls require the AI service to use the optional egress overlay and the exact hostname to appear in `MCP_ALLOWED_HOSTS`; data services remain on internal networks.
- The GIS connection still has its previous localhost URL and encrypted credential. Update its endpoint in Backoffice to the supplied HTTPS URL, then run Test connection to check the actual authenticated handshake.
- The supplied server rejected Bearer authentication with `API key required` and accepted the same stored key in `X-API-Key`, returning HTTP 200 for MCP initialization. Amended ADR-0009 and the SPEC to support an explicit per-connection header method while preserving Bearer as the default.

## Live MCP product results in Discovery

- Added ADR-0017 and a product-search SPEC defining the exact GIS contract: approved `search_products`, `{query, language}` input, and a JSON object with a `products` array, including an empty array for a confirmed no-match.
- The Python MCP adapter now extracts only that contract from `structuredContent` or JSON text, validates required product identity, bounds records and fields, filters unsafe URLs/prices, and maps approved results into the existing chat `products` response. MCP errors, status-only tools, and unrecognized payloads cannot create cards.
- The discovery page now renders optional product image/details and attributes live product data to its MCP source. Live responses remain request-only and are not embedded, cached, or captured as learning/training candidates.
- No real catalog search was verified: the connected GIS server currently exposes only `get_backend_status`; GIS must add `search_products` and a FaroAI administrator must approve it.
- Final verification: MCP product parser tests passed (5/5) in the existing AI container with `python -B`; Discovery UI tests passed (4/4) with one Vitest worker; Backoffice TypeScript check passed after all edits. No new packages or Docker images were downloaded or built.

