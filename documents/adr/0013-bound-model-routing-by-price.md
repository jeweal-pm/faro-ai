# ADR-0013: Bound Jev model routing by configured price

- **Status:** Accepted
- **Date:** 2026-10-14
- **Deciders:** FaroAI product owner
- **Superseded in part:** Provider model rate entry and provider-level selection rules are superseded by [ADR-0016](0016-provider-specific-price-caps-and-automatic-model-selection.md). This ADR's optional tenant request spend ceiling and token budget remain additional policy.
- **Related:** [ADR-0011 Jev model selection](0011-jev-selects-tenant-approved-models.md), [ADR-0010 Backoffice](0010-platform-backoffice-and-deployment-modes.md), [ADR-0014 image pricing and free-model exclusion](0014-image-pricing-and-free-model-exclusion.md), [Backoffice SPEC](../spec/platform-backoffice.md)

## Context

ADR-0011 constrains Jev to tenant-approved model candidate IDs, but does not constrain candidate cost. Provider connections store an exact model allow-list, while the routing policy stores output-token and timeout limits only. Credits count model-backed requests and are not a currency or token-price balance. Operators therefore cannot express a price ceiling, and Jev cannot distinguish the configured cost of eligible candidates.

## Decision

- The platform administrator records input and output rates in USD per one million tokens for each exact `(provider connection, model ID)`. Rates are entered and confirmed manually; FaroAI does not infer or synchronize provider pricing.
- Each tenant may set a maximum estimated USD cost per request and a conservative maximum input-token budget. An unset cost ceiling preserves current behavior. The default input budget is 8,192 tokens.
- When a tenant ceiling is set, FaroAI includes a candidate only when it has a confirmed rate updated within the last 30 days and its conservative upper-bound estimate fits the ceiling:

  `((max_input_tokens × input_rate) + (max_output_tokens × output_rate)) / 1,000,000`

- The gateway performs the first filter before sending candidates to Jev. Jev may select only among those candidates. The AI service independently validates the selected candidate and input budget before making the provider call. Unknown, stale, or over-budget rates fail closed to deterministic retrieval/fallback.
- The input budget is enforced using a conservative UTF-8 byte bound, including message overhead, rather than a model-specific tokenizer. Requests that exceed it use deterministic fallback without a model call. This can reject requests that a model could have processed within the budget.
- Model prices and the tenant ceiling are safe routing metadata. Jev may receive candidate rates and estimated maximum cost, but never endpoints or credentials. It may prefer a cheaper eligible model; FaroAI remains the enforcement point.
- The ceiling applies to the response model Jev selects from tenant candidates. The separate Jev decision-model call has its own configured endpoint and is not included in this candidate price calculation.
- This is a ceiling against operator-configured rates and a conservative token bound, not a guarantee of the provider's final invoice. Providers may change prices or bill differently. Admins must refresh the confirmed price before the 30-day expiry. Actual usage billing and conversion of existing request credits remain out of scope.
- Self-hosted providers use an operator-entered zero rate only when the operator intentionally treats local inference as having no metered provider charge. This does not imply compute has no electricity or hardware cost.

## Consequences

- Backoffice can show model rates and a tenant's estimated maximum request cost before saving a routing policy.
- Enabling a price ceiling can remove every model candidate. In that case the chat remains available through deterministic retrieval/fallback and does not spend a model request credit.
- Pricing entry and review add operator work. Stale or missing prices stop model calls when a ceiling is active.
- Request credits continue to represent request allowance only; they do not represent USD, token quota, or an invoice amount.

## Alternatives considered

- **Ask Jev to obey a price instruction without filtering candidates:** rejected because model output is not an authorization or cost enforcement boundary.
- **Trust only provider-reported actual usage:** rejected as a pre-call guard because the charge has already occurred by the time usage is returned.
- **Treat request credits as dollars:** rejected because one request can consume widely different token counts and provider rates.
- **Automatically ingest pricing from provider APIs:** deferred because price metadata formats and availability vary; stale or ambiguous data must not silently relax a configured ceiling.

## Implementation

See [SPEC: Model price limits](../spec/model-price-limits.md). Revisit this ADR before adding automatic price feeds, actual-usage billing, currencies other than USD, or provider-specific invoice reconciliation.
