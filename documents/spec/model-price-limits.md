# SPEC: Provider and request price limits

- **Status:** Implemented and deployed; local-provider pricing remains a separate design item
- **Date:** 2026-10-14
- **Primary decision:** [ADR-0016](../adr/0016-provider-specific-price-caps-and-automatic-model-selection.md)
- **Related decisions:** [ADR-0013](../adr/0013-bound-model-routing-by-price.md), [ADR-0014](../adr/0014-image-pricing-and-free-model-exclusion.md)
- **Provider workflow:** [Provider model catalog SPEC](provider-model-catalog.md)

## Goals

- Let platform administrators set an independent maximum input and output rate per provider connection.
- Automatically discover supported models and provider prices, with no per-model allow-list or price-entry workflow.
- Keep Jev as the request-time model selector while the FaroAI gateway enforces provider and request limits before any provider call.
- Preserve an optional tenant request-cost ceiling and tenant token/image budgets as additional controls.
- Always exclude free, unknown-price, stale-price, and over-limit models.

## Provider connection price limits

- Store `max_input_usd_per_million_tokens` and `max_output_usd_per_million_tokens` on each provider connection; both are USD per 1,000,000 tokens, between $0 and $10 inclusive. The UI, API schema, and PostgreSQL check constraints reject larger values.
- Store `max_image_usd_per_image` separately on each provider connection; it is USD per image from $0 through $10, defaults to $0, and is enforced by the UI, API, and PostgreSQL. It applies only when a tenant request permits image use.
- Require both values on connection creation. Permit an administrator to edit them on that provider connection. Different connections may use different ceilings, even when they point to the same provider company.
- Default both values to zero. Migration 010 resets existing connections to zero; the provider remains configured but no positive-price model passes until an administrator sets real limits.
- A model passes the connection's rate check only when its current input rate is less than or equal to that connection's input limit and its current output rate is less than or equal to that connection's output limit.
- For OpenRouter, read provider `pricing.prompt` and `pricing.completion` USD/token values and multiply by 1,000,000. Keep optional `pricing.image` as USD/image. A provider sync is the current source of provider-sourced rates.
- The limit is not the actual model price. Never use the configured maximum as a fallback price, and never substitute zero for unknown pricing.
- Successful provider refreshes update prices and verification time. If current feed data does not include complete token prices, remove/expire its provider-sourced token rate. A failed sync changes no catalog or price state.
- Enforce the same provider limit in gateway eligibility loading for Jev and for any future direct model flow. Jev does not control or override a provider cap.

## Model eligibility

- A model must have a current catalog record from a successful sync, a non-free current price, and complete input/output price data; each rate must pass its connection's cap.
- Provider-sourced price freshness is 30 days. After expiry, sync is required before model inference.
- If a request has a positive image limit, the candidate also needs a confirmed image rate. The estimate includes `max_images_per_request × image_usd_per_image`.
- A model with token rates of zero and a positive image rate may only be used for image work when image use is in scope; free-model exclusion evaluates every configured pricing dimension.
- There is no Backoffice control or API choice to disable free-model exclusion.
- The internal `provider_connections.allowed_models` value is derived for compatibility. Do not expose it as an administrator-maintained allow-list.
- `tenant_model_candidates` are automatically synchronized from current eligible connection models. They are a materialized runtime set, not an admin-configured model list.
- Local providers that do not report a price remain unknown and excluded until a separate local cost-rate design is accepted.

## Tenant request policy

- `max_estimated_cost_per_request_usd` is an optional additional per-tenant cost ceiling from $0 through $100. Null means no tenant request-cost ceiling; it never disables a provider connection's cap or price freshness/free-model checks.
- `max_input_tokens` is 128–128,000, default 8,192. The AI service enforces a conservative UTF-8 byte bound with message overhead, not a model tokenizer.
- `max_images_per_request` is 0–16, default 0. A positive limit requires a current image price.
- The maximum request estimate is:

  `((max_input_tokens × input_rate) + (max_output_tokens × output_rate)) / 1,000,000 + (max_images_per_request × image_rate)`

- Tenant estimates apply after provider caps and do not redefine which provider prices are acceptable. They may further narrow the current candidate set.
- The UI explains that the estimate uses provider-reported current rates and request bounds; provider billing details may differ. Request credits are separate from USD.

## Runtime enforcement

1. The Hono gateway loads the tenant request policy, current provider catalog, exact connection/model price, provider caps, and deployment policy.
2. It removes candidates that are missing/stale/unpriced/free, not currently available, outside either connection price cap, or above the optional tenant request ceiling.
3. Jev receives only eligible candidate IDs, model IDs, and non-secret rate metadata and returns an eligible candidate ID.
4. The gateway resolves that ID against the current set and repeats provider/tenant checks before forwarding a trusted candidate to the private AI service. No future no-Jev flow may skip the gateway eligibility policy.
5. The AI service checks candidate identity, free-price exclusion, rate freshness, tenant request estimate, and conservative input budget before provider invocation. It cannot invent model IDs, endpoints, or credentials.
6. Any failed policy check returns deterministic retrieval/fallback and does not retry with an unpriced, stale, free, or more expensive model.
7. The ceiling is an estimate, not actual usage reconciliation. Jev's separate decision-model cost remains outside the tenant response-model estimate.

## Backoffice and API

- `/admin/providers`: add provider kind, connection name, endpoint, required credential (as applicable), maximum input price, and maximum output price. Sync runs after save. Existing connections show editable limits, discovered/eligible counts, last sync, and a refresh action.
- Provider-specific model IDs and prices are not shown as editable lists. Jev routing shows eligible model count and tenant request budget fields only.
- `POST /admin/v1/providers/:providerId/models/discover` loads the saved endpoint and encrypted key server-side.
- `PUT /admin/v1/providers/:providerId/price-limits` saves the two provider-specific values and refreshes derived eligible IDs.
- `GET /admin/v1/providers` returns non-secret connection limits and catalog summary metadata.
- `GET/PUT /admin/v1/tenants/:tenantId/model-candidates` returns automatic eligible options and stores only tenant request-policy fields; clients cannot submit candidate IDs.
- Every provider/tenant policy write requires platform-admin authentication, request validation, and an audit entry with no credential or prompt content.

## Acceptance criteria

- A newly created provider connection stores its own input/output caps, rejects either cap above $10 per 1M tokens at UI, API, and database layers, and attempts model/price discovery.
- A provider connection stores an image cap from $0 to $10/image; image requests are blocked for models with unknown or over-cap image pricing, while the same models remain eligible for text-only requests.
- Two connections can use different caps and produce different eligible model sets from their catalog prices.
- No free, unknown, stale, unavailable, or above-cap model reaches Jev, a fallback selector, or provider inference.
- The connection caps are applied even when a future request path does not call Jev.
- Decreasing a provider cap removes affected models from the derived candidate set on the next selection; raising it does not admit unavailable or stale models.
- Automatic discovery reads per-token pricing correctly and retains the per-image unit.
- Tenant request ceilings may further narrow eligible candidates but cannot broaden provider eligibility.
- Tenant policy API payloads cannot enable free models or submit a manual model list.
- A malformed/out-of-set Jev candidate cannot result in a provider call.
- Missing image pricing blocks a request when its image budget is positive.
- Request credits are never represented as USD or token budget.
