# SPEC: Provider model catalog and price caps

- **Status:** Implemented and deployed; provider form interaction pending manual use
- **Date:** 2026-10-14
- **Decision:** [ADR-0016](../adr/0016-provider-specific-price-caps-and-automatic-model-selection.md)
- **Related:** [ADR-0011](../adr/0011-jev-selects-tenant-approved-models.md), [ADR-0015](../adr/0015-discover-provider-models-and-manage-pricing.md), [Model price limits SPEC](model-price-limits.md), [Platform Backoffice SPEC](platform-backoffice.md)

## Goal

Make `/admin/providers` the single place to create and manage provider connections, their individual input/output price ceilings, and automatic model discovery. Administrators never select individual models. FaroAI derives eligibility, and Jev selects an eligible candidate per request.

## Provider page workflow

1. Add a connection with provider kind, connection name, endpoint, provider credential where required, maximum input/output USD per 1M tokens, and maximum USD per image. Each cap is from $0 through $10; image cap defaults to $0.
2. After saving, the gateway automatically syncs the model catalog and available provider-reported prices. A **Refresh catalog** action repeats the same sync.
3. The connection card shows discovered and eligible model counts, last sync time, and its editable input/output/image caps.
4. Save a changed cap on that provider connection. Backoffice saves the limits, refreshes the provider catalog and prices, and the gateway recalculates the complete eligible model set. Connections can use different limits. If refresh fails, show the saved limits and a clear sync error; do not claim the candidate set is current.
5. No model checkbox, per-model rate editor, or platform model allow-list appears in Backoffice. Jev model routing presents only an eligible model count and request-level budget settings.

## Price discovery

- OpenRouter: `GET /api/v1/models`; read `data[].id`, `data[].name`, and `data[].pricing.prompt`, `completion`, and optional `image`.
- Convert OpenRouter prompt/completion USD per token into USD per 1,000,000 tokens before storage. Preserve image USD per image.
- Ollama: `GET /api/tags`; LM Studio: use the documented model-list endpoint for the configured base URL. These catalogs may not expose prices; do not infer a price from the connection cap or treat missing rates as zero.
- Ignore duplicate or malformed IDs; bound response size/model count and request time. A malformed or failed response does not change the previous catalog. A successful sync marks absent models unavailable.
- For provider-sourced rate rows, each successful sync replaces the current rates. If a returned model no longer has complete input/output prices, delete its old provider-sourced rate so stale data cannot make it eligible. A model omitted from the catalog is unavailable.
- Provider prices become current at sync time and are eligible for up to 30 days. A successful refresh also refreshes the verification time. Missing, stale, or zero-price models are excluded.
- Provider-reported price metadata is used for eligibility and pre-call estimates. It is not an invoice guarantee.

## Eligibility and runtime enforcement

A provider model is eligible only when all of the following hold:

- Its connection is enabled and permitted by deployment mode.
- It was present in the latest successful catalog sync.
- It has complete, current input/output rates.
- Its input rate is less than or equal to the connection's input cap and its output rate is less than or equal to the connection's output cap.
- It has an applicable non-zero price. Free, unpriced, and stale models are always excluded.

The gateway derives `provider_connections.allowed_models` from these checks for compatibility with existing database/runtime paths. This array is internal and must not be edited by an administrator. It is not an authorization substitute: gateway candidate loading repeats catalog, rate freshness, cap, free-price, connection-enabled, deployment, and tenant checks before returning any candidate to Jev or inference.

Jev receives eligible candidate IDs and safe model/price metadata only. The gateway resolves Jev's candidate ID against the current eligible set. A future inference flow that bypasses Jev must use the same gateway eligibility function before provider invocation.

Tenant request-level maximum estimated spend and token/image budgets remain additional policy. They do not alter per-connection price caps. No UI or API policy may disable free-model exclusion.

## Local providers

Ollama and LM Studio model discovery remains supported, but a discovered model with no provider-reported price is ineligible. Existing manually verified price records from the earlier release remain subject to freshness and connection caps; the manual per-model pricing API and editor are removed. A future local-cost pricing design must define operator-entered rate semantics before local models can join the paid-model pool.

## Data and API

- `provider_connections.max_input_usd_per_million_tokens` and `max_output_usd_per_million_tokens` are per-connection limits from $0 through $10 inclusive per 1M tokens. `max_image_usd_per_image` is from $0 through $10 per image and defaults to $0. The Backoffice form, gateway API, and PostgreSQL constraints enforce all three caps.
- Migrations set existing connections to a zero cap until an operator explicitly enters limits. Database defaults are zero so omitted configuration never means unlimited access.
- `provider_model_catalog` is keyed by `(provider_connection_id, model_id)` and stores display name, current availability, and last-seen time.
- `provider_model_pricing` stores exact-connection/model rates, source (`provider` or legacy `manual`), and verification time.
- `POST /admin/v1/providers/:providerId/models/discover` uses the saved validated endpoint and encrypted key. It does not accept endpoint or credential input.
- `PUT /admin/v1/providers/:providerId/price-limits` saves the connection's two caps and derives eligible model IDs.
- `GET /admin/v1/providers` returns caps, counts, last sync, and masked credential hints; it never returns provider secrets or a per-model list.
- `GET /admin/v1/tenants/:tenantId/model-candidates` returns the current eligible options to the Backoffice summary; runtime candidate loading separately enforces caps.
- Credentials remain encrypted in Postgres and are only decrypted in the trusted gateway-to-private-AI-service path. Jev and browser responses never receive credentials or provider endpoints.
- Discovery validates provider/deployment mode and endpoint host, rejects redirects, uses a timeout and bounded response, and redacts upstream details.

## Acceptance criteria

- A provider connection requires input and output limits from $0 through $10 per 1M tokens at creation, and accepts an image cap from $0 through $10/image (default $0); larger values are rejected by the UI, API, and database.
- Existing connections do not inherit an effectively unlimited cap during upgrade; they stay ineligible until their actual limits are set.
- Saving a new connection automatically attempts catalog discovery; a sync failure leaves the connection saved, reports the failed sync, and preserves any prior catalog on an existing connection.
- Saving changed price caps automatically attempts catalog and price sync, then reports the number of paid models under the updated caps; a failed sync reports an error and never inserts unknown-price models.
- OpenRouter's reported prompt and completion prices are scaled to USD per 1M tokens; image prices remain USD per image.
- A sync refresh updates rates and invalidates provider-sourced prices absent from the latest feed.
- Models above either connection-specific limit, free models, unknown-price models, stale-price models, and models absent from the latest sync are never returned to Jev or inference.
- When image use is enabled for a tenant, models with unknown image rates or image rates above their connection's image cap are excluded; the image cap does not exclude those models from text-only use.
- No provider or tenant page requires selecting model IDs or editing a per-model price. Jev chooses automatically from eligible candidates.
- Lowering a provider cap removes failing models from the candidate pool without relying on Jev.
- A provider flow that bypasses Jev still cannot call a model over its provider connection's configured caps.
- Catalog discovery uses only saved credentials and validated endpoints and does not expose secrets or upstream response bodies.
- Local providers without usable rate data remain unavailable; they are never silently treated as zero-cost.
