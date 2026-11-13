# SPEC: Structured product search constraints

- **Status:** FaroAI and GIS MCP source implementation complete; active deployment validation pending
- **Date:** 2026-10-15
- **Decision:** [ADR-0021](../adr/0021-structured-product-search-constraints.md)
- **Related:** [Live MCP product search](live-mcp-product-search.md), [Jev discovery routing](openrouter-jev-discovery-routing.md), [Consented model improvement](consented-model-improvement.md)
- **Related:** [ADR-0055: Rank verified discovery results using soft preferences](../adr/0055-ranking-verified-discovery-results.md)

## Shopping preference tags

- Selecting a chip records one active value per facet. Selected values remain visible as removable tags beside the search field and can be cleared individually or together.
- Submitting a search includes all selected values in the user-language query so Jev and query-only GIS tools can use preferences that have no structured catalog column.
- The existing frontend choices remain unchanged. FaroAI validates selected values against the server-side facet vocabulary and maps Jewelry Type, Metal, Gemstone, Color, Style, Budget, and Avoid into the GIS filter contract. Budget presets use USD because the UI labels them with `$`; price comparisons require an exact currency match. “Under $500” has an exclusive upper bound; bounded presets use inclusive bounds.
- Recipient, Occasion, Theme, Size, and Wear/Lifestyle remain soft preference context. Jev may select an eligible paid model to rank only the verified GIS candidates; the model cannot add IDs or modify hard filters. If ranking is unavailable or invalid, GIS order remains unchanged.
- When a request contains only soft preference tags, FaroAI requests a bounded general jewelry candidate set from GIS instead of using soft words such as `birthday` as mandatory lexical search terms. Any hard filters in the same request remain active and must still be verified by GIS. Jev may then rank only the returned candidate IDs against the soft preferences. This does not create product records or claim that a product has a structured occasion attribute.
- “Avoid: Specific gemstone” requires the user to name the gemstone before GIS search. “Avoid: Large designs” uses the existing explicit exclusion text contract; GIS must apply it before returning candidates.
- Chips are optional. Users can combine them with a free-text prompt, adjust selections after a result, then submit again to refresh the results.

## Query planning

- The original customer prompt is given to Jev before GIS search. Jev's typed `excluded_stone_shape` choice accepts only the server-defined shape IDs; unknown IDs are ignored.
- Recognized negative-shape phrases are removed from the lexical query. The remaining text and validated positive facet phrases remain available to GIS.
- If Jev is not configured or cannot return a valid route, a bounded recognizer handles explicit negations for the supported gemstone-shape vocabulary. It does not generate MCP arguments or select a source.
- Shape exclusions currently cover round, oval, princess, cushion, emerald, pear, marquise, radiant, asscher and heart cuts. Add vocabulary only with tests and corresponding GIS taxonomy support.

## GIS MCP contract

Legacy tools continue to receive:

```json
{
  "query": "I need ring",
  "language": "en"
}
```

The preferred tool schema adds an optional `filters` object and returns up to ten candidates for FaroAI to validate and rank. FaroAI forwards only filter keys that the live `search_products` schema declares (or explicitly permits as additional properties):

```json
{
  "query": "I need ring",
  "language": "en",
  "filters": {
    "item": "ring",
    "metal": "White gold",
    "gemstone": "Diamond",
    "color": "White",
    "style": "Classic",
    "price": {"min": 500, "max": 1500, "currency": "USD"},
    "exclude_terms": ["diamond"]
  }
}
```

GIS resolves master-backed labels within its authenticated organization, applies active/deleted validation, and filters before its ten-result limit. Price comparisons use only price rows in the requested currency and GIS location scope. GIS returns `applied_filters`, `unmatched_filters`, and bounded `verified_attributes` for item, metal, gemstone, color, and style. FaroAI checks the advertised MCP input schema and never sends fields the tool does not declare.

If a hard filter is absent from the live tool schema, GIS cannot resolve it uniquely, or GIS does not echo its application, FaroAI returns a clear limitation and no candidate cards. It does not silently broaden a constrained request.

## Result filtering and display

- FaroAI accepts at most ten bounded MCP candidates, preserves optional `stone_shape` for constraint evaluation, removes duplicates and rejects malformed product IDs/names.
- When a shape is explicitly excluded, FaroAI drops a candidate whose structured shape, name or summary identifies an excluded shape, then returns no more than eight cards.
- A legacy response without structured shape can only be filtered when the excluded shape is visible in its name or summary. Complete enforcement requires GIS to implement `filters.stone_shape_exclude` and return `stone_shape` where available.
- When excluded-shape results still have no verified shape data, FaroAI shows the returned cards with a clear uncertainty message and does not ask a generation model to claim that they satisfy the exclusion.
- GIS remains authoritative for tenant access, location, product facts, stock and price. The generation model cannot add products or override filters.
- For soft preference ranking, the response model sees only the bounded GIS candidate records and may return candidate IDs from that set. FaroAI discards unknown/duplicate IDs and keeps the original GIS order for any unranked candidates.
- A verified empty result produces the existing no-match response. MCP errors or malformed envelopes produce the existing live-verification response and no cards.

## Learning and persistence

- Live MCP products, prices and stock are not automatically sent to Qdrant.
- Chat prompts and generated answers enter improvement workflows only under the purpose-specific consent and review lifecycle in ADR-0012.
- Any future vector index for approved catalog descriptions requires a separate sync/version policy; price, stock and location remain live checks against GIS.

## Acceptance criteria

- [x] Jev is asked to classify explicit gemstone-shape exclusions from a bounded vocabulary.
- [x] Excluded shape phrases are removed from the positive lexical query.
- [x] Query-only GIS tools remain compatible and receive no undeclared arguments.
- [x] Selected chips are included in the search prompt and compatible structured filters are forwarded based on the live tool schema.
- [x] Price ranges carry their currency and do not compare catalog prices across different currencies.
- [x] FAROAI retains shape metadata and filters candidates before the eight-card UI limit.
- [x] Missing shape data is disclosed instead of being presented as a verified match.
- [x] GIS MCP source advertises structured facet filters and echoes applied/unmatched filters; active endpoint verification remains pending.
- [x] Jev-selected soft-preference ranking only reorders bounded GIS candidate IDs; unsupported or invalid model output preserves GIS ordering.
- [ ] GIS applies `filters.stone_shape_exclude` before ranking and returns structured shape metadata.
- [ ] `I need ring not round cut` returns no product identified as round-cut, while `I need a round-cut ring` can return round-cut products.
