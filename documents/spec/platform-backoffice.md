# SPEC: FaroAI AI Discovery and Platform Backoffice

- **Status:** Accepted for implementation
- **Date:** 2026-10-13
- **Decision:** [ADR-0010](../adr/0010-platform-backoffice-and-deployment-modes.md)
- Provider model discovery and per-connection price caps: [ADR-0016](../adr/0016-provider-specific-price-caps-and-automatic-model-selection.md) and [SPEC](provider-model-catalog.md).
- Live MCP product search and verified discovery cards: [ADR-0017](../adr/0017-live-mcp-product-search-results.md) and [SPEC](live-mcp-product-search.md).
- **Related:** ADR-0000 through ADR-0009, `documents/adr/tech-stack.md`, `documents/diagram/flowchart/AI FLOW.drawio`

## 1. Goal

Provide (1) an AI discovery experience matching the user's visual reference and (2) a secure Next.js platform console for FaroAI operators to manage tenants, request credits, model-provider configuration, MCP sources, approved knowledge, embedding jobs, and retrieval inspection. The UI supports both FaroAI-hosted multi-tenant mode and customer-local single-tenant mode.

## 2. Existing project boundary

- `gateway/` is the Hono public and administrative API boundary.
- `ai-service/` owns model calls, MCP calls, embedding, retrieval and worker jobs.
- PostgreSQL is the source of truth; Redis is coordination; Qdrant is the vector index.
- `backoffice/` is a new Next.js App Router application. The browser must not call gateway admin endpoints directly with credentials, AI providers, Qdrant, Redis, PostgreSQL, or Python. Server components/actions call Hono through a private service URL.
- The public discovery page is tenant-bound by deployment configuration and calls Hono from a Next.js server action. It is disabled by default in multi-tenant deployments unless a specific demo tenant/API credential is configured. The browser never supplies the trusted tenant ID or FaroAI API key.
- All mutations require an authenticated platform administrator and create an audit record.

## 3. Deploy-time configuration

```dotenv
FAROAI_DEPLOYMENT_MODE=hosted                 # hosted | self_hosted
FAROAI_TENANT_MODE=multi                      # multi | single
FAROAI_SINGLE_TENANT_ID=                      # required for single mode
FAROAI_LOCAL_LLM_ENABLED=false
FAROAI_ALLOW_EXTERNAL_PROVIDERS=false          # default false for self_hosted
MCP_ALLOWED_HOSTS=                             # comma-separated exact outbound MCP hostnames
MCP_ALLOW_DOCKER_HOST_HTTP=false                # true only in local Compose for host.docker.internal
BACKOFFICE_ENABLED=true
BACKOFFICE_OIDC_ENABLED=false
BACKOFFICE_LOCAL_AUTH_ENABLED=true
BACKOFFICE_ADMIN_EMAILS=
BACKOFFICE_OIDC_ISSUER_URL=
BACKOFFICE_OIDC_CLIENT_ID=
BACKOFFICE_OIDC_CLIENT_SECRET=
BACKOFFICE_OIDC_REDIRECT_URI=
BACKOFFICE_LOCAL_ADMIN_EMAIL=
BACKOFFICE_LOCAL_ADMIN_PASSWORD_HASH_B64=   # base64-encoded Argon2id hash for Compose-safe transport
FAROAI_CONFIG_ENCRYPTION_KEY=
BACKOFFICE_URL=http://127.0.0.1:3001
FAROAI_API_INTERNAL_URL=http://api:3000
FAROAI_DEMO_ENABLED=false
FAROAI_DEMO_TENANT_ID=
FAROAI_DEMO_API_KEY=
```

Rules:

- Boolean and enum values are validated at startup. Invalid combinations fail closed.
- `single` requires one active configured tenant; requests cannot choose a tenant ID.
- `self_hosted` denies external providers unless explicitly enabled.
- MCP endpoints require HTTPS and an exact hostname listed in `MCP_ALLOWED_HOSTS`; loopback development may use HTTP. The local Compose overlay also enables HTTP only for the fixed Docker host alias `host.docker.internal`; `MCP_ALLOW_DOCKER_HOST_HTTP` defaults to false and hosted deployments must keep it false. Redirects are rejected and MCP requests ignore proxy environment variables. Keep this as deployment-owned egress policy. When a local FaroAI deployment connects to an external MCP host, attach the AI service to the optional `provider_egress` network from `docker-compose.hosted.yml`; keep database and Qdrant services on internal networks. The exact external MCP hostname must still be listed in `MCP_ALLOWED_HOSTS`.
- Each MCP connection selects how its encrypted API key is sent: `Authorization: Bearer` (default) or `X-API-Key`. The same selected header is used for connection testing and tool calls. Changing the endpoint or auth method clears tool discovery/approval; test again and explicitly approve tools.
- Disabling both local auth and OIDC while Backoffice is enabled is a startup error.
- Disabling `BACKOFFICE_ENABLED` disables all UI and admin API routes.
- `FAROAI_CONFIG_ENCRYPTION_KEY` is a 32-byte key supplied in base64; do not generate a fallback in application code.
- The public discovery page requires `FAROAI_DEMO_ENABLED=true`, a configured tenant UUID, and a server-only tenant API key. In `single` mode its tenant ID must equal `FAROAI_SINGLE_TENANT_ID`. Missing/invalid values disable chat and show a safe setup state.
- Use HTTPS in hosted deployments. HTTP cookies are permitted only for loopback local development.
- A loopback MCP address refers to the AI service container itself when FaroAI runs in Docker.
- MCP connection tests use the installed Streamable HTTP SDK API and return safe, actionable failure categories for an unapproved hostname, TLS policy, timeout, unreachable endpoint, rejected credentials, or protocol mismatch. Do not return URLs, response bodies, headers, or credentials in errors.

## 4. Authentication and session contract

### OIDC

- Authorization Code Flow with PKCE S256, `state`, `nonce`, exact configured redirect URI, issuer discovery pinned to configured issuer, and verified email allow-list.
- Accept only authenticated principals whose email is verified and appears in `BACKOFFICE_ADMIN_EMAILS`.
- Reject issuer, audience, signature, nonce, state, PKCE, expiry, or email verification mismatch.
- Discard access and ID tokens after local session creation; no third-party token is stored in the browser.

### Local break-glass login

- Enabled only by `BACKOFFICE_LOCAL_AUTH_ENABLED=true` and a provisioned email plus Argon2id encoded password hash.
- Generic login errors, bounded password attempts per IP/account, constant-time hash verification, and no password reset endpoint in the first release.
- Backoffice must have at least one enabled authentication method when enabled.

### FaroAI session

- Random opaque session token; store only SHA-256 hash in PostgreSQL, with administrator identity, auth method, issued/expiry/last-seen timestamps and revocation.
- Eight-hour absolute lifetime; no refresh in the first release.
- Cookie: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` outside loopback development; rotate on login and revoke on logout.
- Mutating endpoints require same-origin `Origin` validation and CSRF token.
- Every admin request checks current session, deployment mode and `platform_admin` authorization.

## 5. Pages and behaviors

### 5.1 AI discovery page (`/`)

- Follow the supplied screenshot as the visual source: near-white background with faint lavender/cyan light, generous whitespace, a centered blue-to-cyan gradient magnifying-glass/sparkle mark, serif “Ask faro anything” title, muted one-line helper text, and a long white pill-shaped search field.
- The search field has an accessible text input with placeholder “Search (Product name, Color, Type,...)”, image affordance, microphone affordance, and “Discovery” action. The composition is centered and responsive; on narrow screens actions remain reachable without horizontal overflow.
- Submit text through a server action to Hono `POST /v1/chat`, using deployment-bound tenant credentials and validated server-side chat consent. Never expose `FAROAI_TENANT_API_KEY` to client JavaScript. Send `ai_improve` consent as false unless a future end-user consent flow explicitly obtains and persists it.
- Free-text prompt is the primary search action: submit with Enter or the visible Search button. Product filters are optional refinements; no jewelry type, color, stone, or price selection is required to search.
- Product search infers common jewelry types from free text, including necklace/สร้อยคอ, and uses the inferred type as a structured filter. Search results still require verified product records for the selected tenant; never synthesize catalog items when the tenant has no matching records.
- Show clear loading, error, no-result, and result states. Render products and verified knowledge returned by the API; do not invent product facts. Keep the user query out of URLs and logs.
- Approved live `search_products` MCP results use the same product-card area and display their source; malformed results and status-only tools never produce product cards. Live responses remain request-scoped and are not embedded or captured for training.
- Discovery toggles a small filter panel whose supported values map to the existing `state` fields (`product_type`, `metal_color`, `metal_karat`, `stone_type`, `stone_shape`, `carat_min/max`, `price_min/max`, `sort`). The panel is progressive and can be closed without clearing a query.
- Voice action starts browser speech recognition only after an explicit user gesture and permission. Unsupported browsers show a concise unavailable message. Voice transcripts are shown in the input and are not submitted automatically.
- Image action is displayed to match the reference but disabled with an explanatory “Image search is not available yet” label until an image-search API/model and privacy contract are approved. Do not upload or store an image in this release.
- A required first-use AI chat consent notice is shown before chat submission. Declining leaves the page usable for navigation but prevents the AI request. The public discovery surface is disabled if deployment tenant credentials are absent or invalid.

### 5.2 Platform Backoffice

1. **Overview:** tenant count/status, assigned/used/available request credits, provider readiness, active MCP sources, pending/failed embedding jobs, and recent admin audit events.
2. **Tenants:** paginated list, create, rename, activate/suspend, and inspect tenant policy. In `single` mode, show only configured tenant and disable cross-tenant create/select.
3. **Credits:** show available/assigned/used request units; append-only grant or adjustment with required reason; show ledger history. Disallow adjustments that would make a tenant balance negative.
4. **Providers:** create/update/delete global provider connections for OpenRouter, Ollama and LM Studio; set/rotate credentials; set each connection's maximum input and output rate; automatically sync its model catalog and reported prices; show discovered/eligible counts and last sync. Do not expose model checkboxes or manual per-model price entry. Hide or disable external providers when deployment policy forbids them. AWS Bedrock remains unsupported until its adapter exists.
5. **Jev model routing:** select a tenant and configure only its additional request-cost ceiling and token/image budgets. Show the count of models that pass their provider connection limits. The gateway filters models before Jev; Jev chooses a candidate per request. Do not expose or let the browser submit provider credentials or arbitrary model IDs.
6. **MCP connections:** tenant-scoped GIS, GMS, ERP and generic MCP connection cards. Configure the Streamable HTTP endpoint URL and Bearer API key; save secrets encrypted and show only a masked hint afterwards. Provide a connection test that performs `initialize` and `tools/list`. Show discovered tool names separately from the explicit allowed-tool selection. A connection cannot be used by Jev until the test succeeds and at least one tool is approved. Enforce the deployment hostname allow-list and do not expose secrets or endpoint URLs to Jev. Existing indexed knowledge sources and embedding jobs remain separate from live MCP connections.
7. **Knowledge and embedding jobs:** list approved sources, documents, jobs and status; submit approved documents; retry failed jobs; cancel pending/queued jobs; inspect model/collection metadata. Destructive removal requires confirmation and creates an audit event. Do not expose raw Qdrant admin credentials.
8. **Retrieval playground:** select tenant only in multi mode; submit a query through an admin-only Hono endpoint; display filtered retrieval results and model/collection metadata without exposing Qdrant to the browser.
9. **Audit:** paginated immutable event list with actor, action, resource, tenant, timestamp, correlation ID, and safe metadata. Never include secrets, raw prompts, or provider tokens.
10. **Settings:** show effective deployment/auth/provider-mode flags read-only. Changes to deployment-wide env flags require redeploy and cannot be edited in the browser.

All screens implement loading, empty, success, validation, permission, and API failure states. Long lists are server-paginated. Forms use accessible labels, keyboard operation, and explicit confirmation for destructive actions.

## 6. API contract

All routes are under `/admin/v1`, separate from `/v1` tenant API keys.

### Auth

- `GET /admin/v1/auth/config` — returns enabled login methods and OIDC provider label, never secrets.
- `POST /admin/v1/auth/local/login` — local email/password when enabled; sets opaque session cookie.
- `GET /admin/v1/auth/oidc/start` and `GET /admin/v1/auth/oidc/callback` — OIDC flow.
- `GET /admin/v1/auth/session` — current principal and session expiry.
- `POST /admin/v1/auth/logout` — revoke server session and clear cookie.

### Operations

- `GET/POST /admin/v1/tenants`, `GET/PATCH /admin/v1/tenants/:id`
- `GET/POST /admin/v1/tenants/:id/credits`, `GET /admin/v1/tenants/:id/credits/ledger`
- `GET/POST/PATCH/DELETE /admin/v1/providers` and `POST /admin/v1/providers/:id/test`
- `GET/PUT /admin/v1/tenants/:id/model-candidates`
- `GET /admin/v1/tenants/:id/mcp/connections`
- `PUT /admin/v1/tenants/:id/mcp/connections/:integration` — save endpoint, optional API-key rotation, enabled state and allowed-tool list.
- `POST /admin/v1/tenants/:id/mcp/connections/:integration/test` — perform MCP handshake and return discovered tool names; never return the API key.
- `GET /admin/v1/tenants/:id/mcp/sources` — read-only legacy/indexed source metadata.
- `GET /admin/v1/tenants/:id/embedding/jobs`, `POST /admin/v1/tenants/:id/embedding/jobs/:jobId/retry|cancel`
- `GET /admin/v1/tenants/:id/knowledge/documents`, `POST /admin/v1/tenants/:id/knowledge/index`
- `POST /admin/v1/tenants/:id/retrieval/query`
- `GET /admin/v1/audit-events`, `GET /admin/v1/system/config`

Every request/response has a stable JSON envelope with `success`, optional `data`, and safe `error` plus `correlation_id`. Inputs are schema-validated, paginated, and size-bounded. Tenant ID in admin paths is checked against deployment mode and actor permission. Public tenant endpoints never accept platform-admin session cookies as tenant API credentials.

## 7. Data model changes

- `platform_admin_sessions`: hashed token, admin subject/email, auth method, creation/expiry/revocation, last-seen.
- `provider_connections`: provider, endpoint, enabled flag, connection-specific maximum input/output USD per 1M tokens, internal derived eligible-model IDs, encrypted credential fields, masked hint, and timestamps.
- `provider_model_catalog` and `provider_model_pricing`: synced provider models, availability, provider-reported input/output/image prices, price source, and freshness. Free, unknown, stale, unavailable, or over-cap models are excluded.
- `tenant_model_candidates`: automatically materialized runtime candidate IDs derived from each tenant's currently eligible provider models. Jev can return only a candidate ID in the gateway's current eligible set. [ADR-0013](../adr/0013-bound-model-routing-by-price.md) adds an optional per-tenant request spend ceiling; [ADR-0014](../adr/0014-image-pricing-and-free-model-exclusion.md) covers image estimates. Free-model exclusion is mandatory under [ADR-0016](../adr/0016-provider-specific-price-caps-and-automatic-model-selection.md). Request credits remain separate.
- `tenant_mcp_connections`: tenant, integration key (`gis`, `gms`, `erp`, or `custom`), endpoint URL, encrypted API key fields, masked hint, enabled/test status, discovered tools, approved tools, and timestamps. Unique per tenant and integration key.
- `tenant_credit_accounts`: tenant, cached balance, updated timestamp; balance must equal sum of append-only ledger entries.
- `tenant_credit_ledger`: tenant, signed integer request-credit units, entry kind, reason, actor, correlation ID, creation timestamp.
- `audit_events`: add platform actor identity/auth method and safe metadata; retain tenant-scoped audit events and permit explicitly global platform events.
- Migrations must be versioned and applied to existing named PostgreSQL volumes; do not rely on init SQL rerunning.

## 8. Credit transaction rules

- Before a model-backed chat call, atomically reserve one request credit with a conditional update. If none is available, the AI service receives no provider configuration and must return deterministic retrieval fallback.
- On a successful response with `ai=true`, finalize the debit. On a failed provider call, timeout, or `ai=false`, append a matching refund entry and restore balance in one transaction.
- `ai=false` deterministic responses remain available at zero credits.
- Admin grant/adjustment is one transaction that appends ledger entry and updates the account; only platform admins may write it.
- No token/currency conversion is implied. Dashboard labels the unit “model request credits”.

## 9. Acceptance criteria

- [ ] Backoffice builds and starts in Docker with auth enabled; no page or admin route works without a valid session.
- [ ] OIDC package and framework baseline at implementation: `openid-client` 6.8.8, Next.js 16.4.0, React 19.3.0, Node.js 22 LTS, pnpm 10.x. Recheck package support/advisories on dependency updates.
- [ ] The AI discovery page matches the supplied design reference, handles text search/result/loading/error/empty states, and keeps tenant credentials server-side.
- [ ] Discovery filters use only API-supported state fields; voice requires explicit browser permission; image affordance is disabled until image search exists.
- [ ] AI chat consent is explicit and `ai_improve` remains false by default.
- [ ] OIDC enabled/disabled by env; OIDC fails closed on state, nonce, PKCE, issuer, signature, audience, expiry, or email allow-list mismatch.
- [ ] Local login is optional, requires pre-hashed credential, has rate limiting, and cannot be enabled with an empty password hash.
- [ ] `multi` mode permits platform admins to manage multiple tenants; `single` mode scopes every operation to the configured tenant and rejects another tenant ID.
- [ ] Tenant lifecycle and credit grant/adjustment are auditable and tenant-scoped.
- [ ] Concurrent chat requests cannot spend more model credits than available; zero-credit and deterministic fallback behavior follows section 8.
- [ ] Provider credentials are encrypted at rest and never returned to browser/API responses; allowed models/endpoints are enforced server-side.
- [ ] Local LLM mode is disabled by default; local endpoints work only when enabled and pass SSRF/allow-list checks.
- [ ] OpenRouter, Ollama and LM Studio connections enforce their own configured input/output price limits. FaroAI derives eligible candidates and Jev selects only from that set; invalid or stale selections fail closed. Bedrock is explicitly unavailable until implemented.
- [ ] MCP sources, knowledge jobs, retrieval playground and audit use backend authorization and mandatory tenant filters.
- [ ] Backoffice can create/update/test GIS, GMS, ERP and generic tenant MCP connections; test discovers tools, and only explicitly selected discovered tools are routed by Jev.
- [ ] MCP credentials are encrypted at rest, masked after save, never returned to clients/Jev/logs, and endpoint hosts must satisfy deployment `MCP_ALLOWED_HOSTS` policy.
- [ ] No accidental learning/training collection occurs. `ai_training` remains unused until a new data-governance decision is accepted.
- [ ] Frontend and backend test cases cover login denial, tenant-mode isolation, credit concurrency/refund, secret masking, provider policy, and key page states.
- [ ] Compose static config validates and resource ceilings are recalculated for the new Backoffice service.

## 10. Explicitly out of scope

- Tenant end-user accounts or tenant self-service portal.
- Payment processing, invoices, provider-cost billing, token-based credits, auto-expiry or credit purchases.
- Image-based search and image upload; the visible reference affordance remains disabled pending a separate image-input/privacy decision.
- AWS Bedrock adapter, model installation/download management, automatic MCP scheduler, model fine-tuning, and shared training data.
- Editing deployment environment flags from the running Backoffice.

## 11. Research and review triggers

OIDC design checked against RFC 9700, OpenID Connect Core 1.0, Next.js authentication guidance, and `openid-client` docs on 2026-10-13. Registry baseline checked on 2026-10-13: `openid-client` 6.8.8, Next.js 16.4.0, React 19.3.0. Recheck when selecting/upgrading the OIDC library, changing callback/session behavior, or changing supported identity providers. Review provider security on provider additions and encryption format before key rotation or migration.
