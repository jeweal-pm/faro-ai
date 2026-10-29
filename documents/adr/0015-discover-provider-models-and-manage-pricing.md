# ADR-0015: Discover provider models and manage access and pricing together

- **Status:** Accepted
- **Date:** 2026-10-14
- **Deciders:** FaroAI product owner
- **Superseded:** Manual per-model pricing and model enable/tenant assignment policy are superseded by [ADR-0016](0016-provider-specific-price-caps-and-automatic-model-selection.md). Secure provider discovery and endpoint protections remain active.
- **Related:** [ADR-0011 Jev model selection](0011-jev-selects-tenant-approved-models.md), [ADR-0013 price-bounded routing](0013-bound-model-routing-by-price.md), [ADR-0014 image pricing](0014-image-pricing-and-free-model-exclusion.md), [Provider model catalog SPEC](../spec/provider-model-catalog.md)

## Context

The provider form currently requires administrators to type exact model IDs before they can save a connection. Jev does not discover models from providers: FaroAI sends Jev only the candidates that a platform administrator has enabled for a tenant. The existing price editor is nested under saved provider cards, so the initial form hides the model price workflow and makes connection setup confusing.

## Decision (partially superseded by ADR-0016)

- Provider setup no longer requires a manually typed model list. After saving a connection, the administrator can sync its model catalog and configure model access and rates from the same Providers page.
- Discovery is server-side and uses the saved endpoint and encrypted provider credential. FaroAI supports OpenRouter `GET /api/v1/models`, Ollama `GET /api/tags`, and LM Studio model listing (`GET /api/v1/models` for the native API, or `GET /models` when the configured base URL ends in `/v1`). Model IDs are parsed from documented response shapes. [OpenRouter API](https://openrouter.ai/docs/api/api-reference/models/get-models), [Ollama API](https://github.com/ollama/ollama/blob/main/docs/api.md#list-local-models), [LM Studio API](https://lmstudio.ai/docs/developer/rest/list)
- The API container needs outbound HTTPS reachability to its configured, validated provider endpoints. The Compose `host_api` bridge provides NAT for that traffic; provider and MCP URL validation, redirect rejection, finite timeouts, and deployment-mode checks remain mandatory application controls.
- A successful sync stores model IDs and display names in a provider-scoped catalog, marks models found in that sync available, and records their last-seen time. Models not returned by a later sync remain in the catalog and retain their saved price and access state, but are withheld from Jev until discovered again. A failed or malformed response changes no catalog state. Existing models with no sync history remain eligible until the first successful sync to avoid breaking deployments during rollout.
- The catalog is not an allow-list. The administrator explicitly enables catalog entries for platform use. Only enabled models are eligible for tenant assignment. Jev still chooses per request from tenant-approved candidates and cannot create a model ID, URL, or credential.
- Input/output token rates and optional USD-per-image rates remain manually verified operator values under ADR-0013/0014. Provider-reported pricing is not copied into enforcement rates. Price editing is in the same provider model table as discovery and access controls.
- A tenant must still be granted an enabled provider/model candidate on the Jev routing page. Cost ceilings and the default-on free/unknown-price exclusion remain tenant routing controls.
- Discovery uses only the saved provider endpoint. It reuses deployment-mode and host validation, sends the stored credential only to that endpoint, rejects redirects, applies a short timeout and bounded response size, and never returns secrets to the browser or Jev.

## Consequences

- Administrators do not need to know or type provider-specific model IDs before creating a connection.
- The Providers page becomes the single place to discover model IDs, enable them for platform use, and enter verified token/image pricing.
- Provider catalog discovery does not guarantee inference will succeed; tenant assignment, current price policy, deployment policy, and provider availability are checked separately.
- Pricing remains a manual operator task. A discovered model with missing or stale rates is not sent to Jev while free-model exclusion or a price ceiling is active.
- Catalog entries are provider-scoped and do not grant tenant access on their own.

## Alternatives considered

- **Keep manual model ID entry required:** rejected because model IDs are provider-owned data and the entry flow hides the related price controls.
- **Treat every discovered model as available to every tenant:** rejected because discovery must not grant tenant access. Tenant candidate assignment remains explicit.
- **Trust provider-reported prices automatically:** rejected because rates can change and differ by billing conditions; enforcement requires explicit operator confirmation.

## Implementation

See [SPEC: Provider model catalog and pricing](../spec/provider-model-catalog.md). Migration `007_provider_model_catalog.sql` stores discovered catalog entries. Revisit this ADR before adding other provider APIs, automatic price ingestion, or automatic tenant grants.
