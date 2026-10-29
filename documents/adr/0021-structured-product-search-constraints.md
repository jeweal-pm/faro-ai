# ADR-0021: Interpret explicit product exclusions before live MCP search

- **Status:** Accepted
- **Date:** 2026-10-15
- **Deciders:** FaroAI product owner and implementation team
- **Related:** [ADR-0017](0017-live-mcp-product-search-results.md), [ADR-0019](0019-use-openrouter-typesafe-jev-decisions-api.md), [Live MCP product search](../spec/live-mcp-product-search.md)

## Context

FaroAI sends a shopper's full sentence as plain text to GIS `search_products`. The GIS search described by its current contract tokenizes the text and searches product name, SKU, type and description. A negative phrase such as “not round cut” is therefore treated as ordinary search terms and can rank round-cut products above suitable alternatives. The current product response also does not consistently include a structured gemstone shape.

## Decision

- Jev receives a typed question for explicit gemstone-shape exclusions. Only a validated choice from the server-defined shape vocabulary becomes a filter. A narrow deterministic recognizer for explicit shape-negation phrases provides the bounded fallback when Jev is unavailable.
- Remove the recognized excluded-shape phrase from the lexical query so a negated word is not treated as a positive match. Preserve the remaining shopper prompt and validated positive preferences.
- Define the optional GIS `search_products` argument `filters` with `stone_shape_exclude` and other supported, documented product filters. FaroAI sends this object only when the live MCP tool's advertised input schema accepts `filters`; legacy query-only tools continue to receive the positive query and language without unknown arguments.
- GIS remains the authority for product retrieval and should apply structured filters before ranking and limiting results. The structured product response may include `stone_shape`. FaroAI normalizes at most ten candidates, removes products explicitly identified as an excluded shape by structured shape data or bounded searchable product text, and returns at most eight cards.
- A query-only MCP response that omits shape metadata cannot guarantee a negative-shape constraint. FaroAI may remove visibly identified excluded products, but the GIS filter and structured shape field are required for complete enforcement.
- Live search results remain request-scoped. They are not automatically embedded into Qdrant, used as training data, or retained as learning examples.

## Consequences

- “Ring, not round cut” becomes a positive ring query plus an explicit excluded shape instead of a bag of positive search tokens.
- Simple supported constraints do not require a second generation-model call. Jev's choice is validated by FaroAI before it becomes a GIS filter.
- Existing GIS servers remain callable while they advertise only `query` and `language`, but explicit exclusion quality is limited to fields the response actually provides.
- GIS MCP must add and implement the structured `filters` contract and return structured shape data before the negative-shape acceptance criterion is fully met.
- Product price, stock and location remain live GIS facts; Qdrant is not a substitute catalog cache.

## Alternatives considered

- **Send the entire natural-language prompt unchanged:** rejected because the current GIS token search does not interpret negation.
- **Send only `ring`:** rejected because it discards the shopper's other positive preferences and exclusions.
- **Let a generation model search the entire GIS catalog:** rejected because it would move authoritative retrieval out of GIS and send unbounded catalog data to a model.
- **Persist every search and result to Qdrant:** rejected under ADR-0012 because live inventory can change and raw interactions are not approved knowledge.

## Implementation

See [SPEC: Structured product search constraints](../spec/structured-product-search-constraints.md). Revisit this ADR when GIS implements the structured filter contract, new product taxonomies are introduced, or a separate consented search-feedback index is proposed.
