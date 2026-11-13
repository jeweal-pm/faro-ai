# ADR-0043: Make discovery preference tags affect search

- **Status:** Accepted
- **Date:** 2026-11-02
- **Decision owners:** FaroAI platform
- **Related:** [ADR-0021 Structured Product Search Constraints](0021-structured-product-search-constraints.md), [Structured product search spec](../spec/structured-product-search-constraints.md)

## Context

The Discovery page renders selectable preference chips, but only some values reached deterministic local filters. Metal and color shared one filter field, budget presets lacked lower bounds and currency, and the live GIS route ignored the structured state. After results appeared, the preference controls were hidden, so selected values were not visible or easy to revise.

## Decision

- Keep one active selection per facet and show selected preferences as removable tags beside the search field.
- Keep the preference controls available after results so users can adjust tags and resubmit the same prompt.
- Include all selected facets in the search text given to Jev/GIS, including preferences without structured catalog columns.
- Apply structured filters where FaroAI has verified catalog fields: jewelry type, metal, metal color, gemstone, and budget range.
- Interpret dollar-denominated budget presets as USD and constrain catalog currency to USD.
- For live MCP search, send only filter fields permitted by that tool's current `search_products` input schema. Query-only MCP tools receive the selected preferences in text and remain compatible.

## Consequences

- Users can combine typed requests with optional tags, remove tags, or clear them all.
- Results refresh only when the user submits again; changing a tag does not silently issue a new AI/GIS request.
- GIS remains authoritative. A tool that does not declare structured filters receives the preference text but no undeclared filter arguments.
