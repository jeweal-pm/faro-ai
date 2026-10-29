# ADR-0014: Price image usage and exclude free models

- **Status:** Accepted
- **Date:** 2026-10-14
- **Deciders:** FaroAI product owner
- **Clarification:** Free-model exclusion is mandatory in [ADR-0016](0016-provider-specific-price-caps-and-automatic-model-selection.md); the earlier opt-out control is removed. Provider-reported image rates are synced automatically when available, and each provider connection has an independent maximum USD/image cap.
- **Related:** [ADR-0011 Jev model selection](0011-jev-selects-tenant-approved-models.md), [ADR-0013 price-bounded routing](0013-bound-model-routing-by-price.md), [SPEC: Model price limits](../spec/model-price-limits.md)

## Context

ADR-0013 prices model usage by input and output tokens. Some AI operations are billed per image instead, so a token-only estimate misses that cost. The routing policy also has no way to prevent Jev from selecting a zero-price model, while the product owner prefers paid models.

## Decision

- Keep token prices in USD per one million tokens and store an optional `image_usd_per_image` rate for each exact provider connection/model pair when reported by the provider. Preserve the per-image unit; never infer an image price from token rates or a configured cap. `$0.035/image` is an example, not a default price. Each connection has a separately configured maximum from $0 through $10/image, defaulting to $0.
- Each tenant policy has `max_images_per_request`, default 0, with a supported range of 0–16. The conservative model estimate adds `max_images_per_request × image_usd_per_image` to the token estimate. If this limit is greater than zero, missing image pricing is unknown and the candidate is ineligible while price enforcement is active. Current text chat does not send images, so the default does not charge an image estimate for text requests.
- FaroAI always requires complete, current pricing and excludes models whose applicable token/image rates are all explicitly zero. Unknown rates are not treated as free; they are excluded because the policy must reliably avoid free or unpriced models.
- Free, unknown-price, and stale-price models are always excluded. The administrator has no opt-out because provider inference requires current paid model pricing; this requirement is clarified by ADR-0016.
- The gateway filters candidates before Jev and the AI service independently rechecks pricing freshness, free-model exclusion, token bounds, and the estimated ceiling before provider invocation. Jev remains a selector, not the cost enforcement point.
- The gateway excludes image-priced models above a connection's image cap only when the tenant request policy permits image use. The image cap does not remove a model from text-only requests. A positive image request limit requires a current image rate within the cap.
- Image pricing is a per-image estimate. Provider-specific variable image-token billing must be represented through the token rates or a future richer pricing unit; this ADR does not claim exact invoice reconciliation.

## Consequences

- Backoffice shows token and per-image rates and displays the conservative maximum cost, including the tenant's configured image count.
- Each model needs current confirmed rates before it can serve tenant requests. If none qualify, deterministic retrieval/fallback remains available.

## Alternatives considered

- **Ask Jev to avoid free models:** rejected because model output is not an enforcement boundary.
- **Assume an image rate for every provider:** rejected because actual image pricing differs; `$0.035/image` is an operator-entered example only.
- **Use zero when image pricing is missing:** rejected because unknown and free are different states and must not be conflated.

## Implementation

See [SPEC: Model price limits](../spec/model-price-limits.md). Revisit this ADR before adding variable image dimensions, provider price feeds, or actual-usage invoice reconciliation.
