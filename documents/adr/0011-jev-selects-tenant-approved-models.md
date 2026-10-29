# ADR-0011: Jev selects among tenant-approved provider models

- **Status:** Accepted
- **Date:** 2026-10-13
- **Deciders:** FaroAI product owner (user) and implementation team
- **Superseded:** The explicit per-tenant model assignment parts are superseded by [ADR-0016](0016-provider-specific-price-caps-and-automatic-model-selection.md). Jev remains the per-request selector from the gateway-filtered eligible set.
- **Related:** [ADR-0001](0001-use-faroaikey-centralize-3rdpartyapi-with-jev.md), [ADR-0010](0010-platform-backoffice-and-deployment-modes.md), [platform Backoffice SPEC](../spec/platform-backoffice.md)

## Context

ADR-0001 makes Jev the decision-maker for selecting a model for third-party inference. ADR-0010 adds a provider registry and tenant model policies. The first Backoffice implementation exposed a connection-level model allow-list and a fixed tenant provider/model policy, while the runtime router only classified intent and returned an unused `model_class`. That left operators selecting a fixed model and Jev unable to select the inference model.

## Decision

- A provider connection's `allowed_models` is a platform-level safety ceiling. It records exact model IDs that the connection is permitted to expose; it does not select the model for a request.
- Provider model IDs come from the synced provider catalog and are explicitly enabled by a platform administrator; they are not typed into the connection form. See [ADR-0015](0015-discover-provider-models-and-manage-pricing.md).
- A platform administrator grants a tenant a set of eligible `(provider connection, exact model ID)` candidates. Candidates are tenant-scoped and may include request limits and one local fallback candidate. A tenant receives no access from a global provider connection until candidates are granted.
- For model-backed requests, Jev receives the tenant's eligible candidate IDs, provider names, and exact model IDs, alongside the sanitized request needed to make its decision. Jev never receives provider endpoints, API keys, or other credentials.
- Jev returns a candidate ID, not a free-form endpoint or model name. FaroAI resolves that ID against the candidate set and checks that the provider remains enabled, the model remains in the connection allow-list, and deployment policy still permits the provider before inference. Unknown, stale, or malformed selections fail closed to deterministic retrieval/fallback and do not call a provider.
- Provider credentials remain in the trusted backend boundary. They may be sent from the Hono gateway to the private AI service over the authenticated internal request, but are never sent to Jev, a browser, or a tenant.
- In hosted mode, a configured Jev decision endpoint selects among eligible external or local candidates. If Jev is unavailable or returns an invalid candidate, FaroAI does not silently choose another model.
- In self-hosted mode, local inference can run without Jev only when local LLM use is enabled and the tenant has exactly one explicitly marked default local candidate. If Jev is configured, it selects from the tenant's candidates. External providers remain subject to the self-hosted egress flag.
- Jev makes a fresh selection on every request that has model candidates; cached routing decisions must never reuse a model choice. Non-model routing decisions may use a tenant-scoped short-lived cache.
- Existing fixed chat model policies are migrated to one tenant candidate to preserve their current behavior. The fixed model-policy API is replaced by the candidate policy API; deleting or disabling a provider/model removes it from the runtime candidate set immediately.

## Consequences

- The provider page manages provider connectivity and the platform allow-list; it does not imply that an administrator chooses each request's model.
- The tenant routing page grants Jev a constrained candidate set. Jev remains the per-request selector, while FaroAI enforces tenant access, deployment mode, credits, and provider safety.
- If no eligible candidate exists, or hosted Jev selection fails, deterministic retrieval/fallback remains available without a model call.
- A local installation can use its configured local model directly when Jev is intentionally disabled, following ADR-0001.
- Audit events record candidate policy changes without credentials or prompt content.

## Security invariants

- The decision response cannot construct or alter a provider URL, credential, model ID, tenant ID, or token limit.
- The candidate ID must resolve within the authenticated tenant's current eligible set at request time.
- Provider and model eligibility is rechecked after selection and immediately before the provider call.
- Secrets and raw provider responses are excluded from the Jev request and logs.

## Review triggers

Revisit this ADR when Jev's protocol changes, a new provider is added, tenant policy becomes self-service, or model selection gains cost/latency/privacy objectives.
