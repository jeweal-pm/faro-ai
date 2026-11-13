# ADR-0055: Rank verified discovery results using soft preferences

- **Status:** Accepted
- **Date:** 2026-11-09
- **Decision owners:** FaroAI platform
- **Related:** [ADR-0043 Functional Discovery Preference Tags](0043-functional-discovery-preference-tags.md), [Structured Product Search Constraints](../spec/structured-product-search-constraints.md), [Live MCP Product Search](../spec/live-mcp-product-search.md)

## Context

The discovery page has fixed preference choices for recipient, occasion, style, theme, color, size, lifestyle, budget, and exclusions. Some are verifiable catalog constraints; others describe intent that may not exist as GIS master data. Treating all choices as plain search words causes misses, while treating soft preferences as filters can hide valid products or claim unsupported facts. GIS is the source of truth for product records and prices.

## Decision

- Map only allow-listed selections into the structured GIS `search_products` filter contract: item, metal, gemstone, color, style, currency-scoped price range, and explicit exclusion terms.
- GIS resolves master values within the configured organization and applies its own active/deleted checks. Unresolved values return no broadened result; they are reported as unavailable.
- FaroAI sends a filter only when the live MCP schema advertises it and requires GIS to echo applied filters before presenting filtered results. Unsupported or unconfirmed hard filters do not produce product cards.
- Recipient, occasion, theme, size, and lifestyle are soft preferences. Jev may select an eligible paid response model; that model may reorder only the bounded, verified GIS candidate IDs and return a short explanation. FaroAI validates every ID against the candidate set and preserves GIS facts. If ranking is unavailable or invalid, retain GIS ordering and use the deterministic answer.
- A generic “Specific gemstone” avoidance choice is incomplete input; ask the user which gemstone to avoid before querying.
- Never use model output to create products, change filters, or assert unsupported product attributes.

## Consequences

- Search quality can improve for preference-only prompts without expanding GIS results or inventing catalog records.
- Search requests with hard constraints fail closed when GIS cannot apply or confirm the requested filters.
- The configured per-request model eligibility, token limits, and estimated cost ceiling govern model-based ranking.
- Live products and ranking output remain request-scoped and are not automatically written to Qdrant, chat memory, or training data.
