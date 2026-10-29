# ADR-0016: Provider-specific price caps and automatic model selection

- **Status:** Accepted
- **Date:** 2026-10-14
- **Deciders:** FaroAI product owner and implementation team
- **Related:** [ADR-0001](0001-use-faroaikey-centralize-3rdpartyapi-with-jev.md), [ADR-0011](0011-jev-selects-tenant-approved-models.md), [ADR-0013](0013-bound-model-routing-by-price.md), [ADR-0014](0014-image-pricing-and-free-model-exclusion.md), [ADR-0015](0015-discover-provider-models-and-manage-pricing.md)

## Context

ADR-0015 put a provider catalog, per-model enable controls, and manual price entry in Backoffice. ADR-0011 then required operators to assign individual models to tenants. This asks administrators to maintain a model list and duplicates decisions that should follow from each provider connection's own price policy. It also makes the policy dependent on Jev's routing call, even though FaroAI may add request flows that bypass Jev.

The product needs different price ceilings for different provider connections. A connection may later be used without Jev, but it must still obey the same maximum model rates.

## Decision

- Each provider connection stores its own maximum input and output prices in USD per 1,000,000 tokens and a maximum image price in USD per image. Each cap must be between $0 and $10 inclusive. The administrator sets the caps when adding the connection and can change them on that connection later. An image cap of zero disables image-priced models for image requests until the administrator sets a positive cap; it does not block text requests. A missing policy must never act like an unlimited cap. Migrations 011 and 012 enforce the upper bounds in PostgreSQL.
- FaroAI syncs model IDs and provider-reported input/output prices from supported provider catalogs. For OpenRouter, `pricing.prompt` and `pricing.completion` are USD per token and are converted to USD per 1,000,000 tokens. A provider-reported image rate is stored as USD per image. Discovery never asks an administrator to select models or type model IDs.
- Creating a provider connection or saving changed price caps triggers a provider catalog and price sync. After a successful sync, FaroAI derives the complete eligible model set from current availability, confirmed non-free rates, and the connection's input/output caps. If sync fails, retain saved caps, report the failure, and never treat missing rates as zero or add unpriced models.
- FaroAI derives the eligible set for a connection from the latest successful catalog sync and price data. A model is eligible only when it is currently available, has complete and current price data, has a non-zero applicable price, and both token rates are at or below that connection's limits. Provider price data missing from a later sync invalidates that provider-sourced price instead of retaining an older value.
- A provider connection's `allowed_models` is now an internal, derived compatibility field containing eligible model IDs. It is not a user-managed allow-list. Backoffice does not expose per-model checkboxes, manual model prices, or tenant model assignment.
- The gateway filters token prices against the provider-specific limits before it calls Jev. When a tenant request includes images, it also requires a current image rate at or below that connection's image cap. The gateway repeats these checks when resolving candidates for inference. Jev receives only eligible candidate IDs and safe pricing metadata, then selects a model for each request. Jev cannot relax a provider limit. Any future flow that skips Jev must use the gateway's same eligibility policy before selecting or invoking a provider.
- The tenant policy may retain a separate maximum estimated request spend and request token/image budgets. That ceiling is an additional request-level bound; it does not replace or override a provider connection's model price caps.
- Free, unpriced, stale, or over-limit models are always excluded. There is no setting to admit a free model. A missing or stale provider price never becomes zero.
- Providers that do not report a price catalog, including local Ollama and LM Studio, do not gain eligible models from discovery alone. They require an explicit, future local-cost pricing design; an unknown local price is not inferred from the connection cap.
- Credentials remain encrypted and server-side. Model catalog responses and eligibility summaries contain no provider credentials. Discovery uses saved, validated endpoints, rejects redirects, and retains response size, time, deployment-mode, and host allow-list controls.

## Consequences

- Provider setup has one simple, connection-scoped price policy; multiple connections can have different limits.
- New models automatically enter Jev's candidate pool when their current provider prices satisfy the connection's limits. Operators no longer curate model IDs per tenant.
- Jev remains the request-time selector, while FaroAI remains the authority that enforces the price policy. This same gateway rule remains available if a future request path bypasses Jev.
- A provider price update or a lower connection limit can remove models from the eligible set immediately. A later sync can restore a model if it again meets the current limits.
- Local models with no reported prices remain unavailable through price-bounded routing until a local cost basis is defined. This avoids silently treating unknown or free-priced models as paid models.
- Provider prices are provider-reported pre-call estimates, not an invoice guarantee. Tenant request cost limits and credits keep their distinct meanings.

## Alternatives considered

- **Ask Jev to honor the connection's limit:** rejected because Jev is a selector and cannot enforce policy for future flows that bypass Jev.
- **Keep individual model checkboxes and manual prices:** rejected because it requires continuous operator curation and contradicts automatic provider discovery.
- **Use one platform-wide price limit:** rejected because each provider connection may have a different contract and allowed spend.
- **Treat missing prices as zero or apply the connection maximum as the model price:** rejected because a limit is not a measured price and that would admit unknown-cost models.

## Supersession

This ADR supersedes ADR-0015's manual per-model price entry and administrator-managed platform allow-list, and ADR-0011's explicit per-tenant model assignment. ADR-0015's secure catalog discovery and provider endpoint requirements remain in force. ADR-0013's tenant request-level spend ceiling remains an optional, separate guardrail.

## Implementation

See [SPEC: Provider model catalog and price caps](../spec/provider-model-catalog.md) and [SPEC: Model price limits](../spec/model-price-limits.md). Migration `008_provider_price_caps_and_synced_rates.sql` stores token limits and synced-rate metadata; migration `010_fail_closed_provider_price_caps.sql` sets token caps to zero; migration `011_provider_price_cap_max_10.sql` enforces the token cap maximum; migration `012_provider_image_price_cap.sql` adds a zero-default image cap and enforces the $10/image maximum. Revisit this ADR before enabling a provider that does not expose usable pricing metadata or introducing local-model cost rates.
