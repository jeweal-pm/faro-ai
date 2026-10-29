# ADR-0018: Discovery shopping journey and order-action boundary

- **Status:** Accepted
- **Date:** 2026-10-14
- **Deciders:** FaroAI product owner and implementation team
- **Related:** [ADR-0017](0017-live-mcp-product-search-results.md), [Discovery shopping journey SPEC](../spec/discovery-shopping-journey.md)

## Context

FaroAI Discovery needs to let shoppers describe a jewelry request in plain language, optionally refine it with visual prompts, review live product results, and inspect a product's options. A future order workflow does not exist yet, and GIS currently does not return structured product variant options.

## Decision

- Keep the free-text shopping prompt as the primary way to search. Optional preference categories may refine the prompt without requiring shoppers to choose filters.
- Use the provided blue-to-teal CI gradient and a four-column product result grid on desktop, with responsive columns on smaller screens.
- Show a stock-only filter and verified fields from the live MCP response. Do not invent product images, prices, stock, or catalog details when GIS omits them.
- Clicking a product's plus button opens a side drawer with its image, name, SKU, and local option selectors styled after the supplied reference. Until GIS supplies variant data, those selectors are visual/local state and must not be represented as verified inventory options.
- `Add to Order` is intentionally a no-op. It must not create an order, reserve inventory, mutate customer state, navigate, or display a success claim. A real order flow requires a separate API contract and ADR.

## Consequences

- Customers can search by prompt alone or add optional preferences.
- Product cards and the drawer remain a presentation of verified GIS search results; only the filters and temporary option selections are local UI state.
- Adding an order later requires verified variant data, tenant authorization, inventory and pricing checks, and a dedicated order API.

## Review triggers

Revisit this ADR when GIS provides product variant data or when an order API is designed.
