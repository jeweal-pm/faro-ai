# SPEC: Structured product search constraints

- **Status:** FAROAI parsing, compatibility filtering, and uncertainty response implemented; GIS structured filter support pending
- **Date:** 2026-10-15
- **Decision:** [ADR-0021](../adr/0021-structured-product-search-constraints.md)
- **Related:** [Live MCP product search](live-mcp-product-search.md), [Jev discovery routing](openrouter-jev-discovery-routing.md), [Consented model improvement](consented-model-improvement.md)

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

The preferred tool schema adds an optional `filters` object and returns up to ten candidates for FaroAI to validate and rank:

```json
{
  "query": "I need ring",
  "language": "en",
  "filters": {
    "stone_shape_exclude": ["round"]
  }
}
```

The corresponding product record should include `stone_shape` when GIS has that verified catalog attribute. GIS applies structured filters inside its authorized tenant/location scope before result ranking and its ten-result limit. FaroAI checks the advertised MCP input schema and never sends `filters` to a tool that does not declare the field.

## Result filtering and display

- FaroAI accepts at most ten bounded MCP candidates, preserves optional `stone_shape` for constraint evaluation, removes duplicates and rejects malformed product IDs/names.
- When a shape is explicitly excluded, FaroAI drops a candidate whose structured shape, name or summary identifies an excluded shape, then returns no more than eight cards.
- A legacy response without structured shape can only be filtered when the excluded shape is visible in its name or summary. Complete enforcement requires GIS to implement `filters.stone_shape_exclude` and return `stone_shape` where available.
- When excluded-shape results still have no verified shape data, FaroAI shows the returned cards with a clear uncertainty message and does not ask a generation model to claim that they satisfy the exclusion.
- GIS remains authoritative for tenant access, location, product facts, stock and price. The generation model cannot add products or override filters.
- A verified empty result produces the existing no-match response. MCP errors or malformed envelopes produce the existing live-verification response and no cards.

## Learning and persistence

- Live MCP products, prices and stock are not automatically sent to Qdrant.
- Chat prompts and generated answers enter improvement workflows only under the purpose-specific consent and review lifecycle in ADR-0012.
- Any future vector index for approved catalog descriptions requires a separate sync/version policy; price, stock and location remain live checks against GIS.

## Acceptance criteria

- [x] Jev is asked to classify explicit gemstone-shape exclusions from a bounded vocabulary.
- [x] Excluded shape phrases are removed from the positive lexical query.
- [x] Query-only GIS tools remain compatible and receive no undeclared arguments.
- [x] FAROAI retains shape metadata and filters candidates before the eight-card UI limit.
- [x] Missing shape data is disclosed instead of being presented as a verified match.
- [ ] GIS applies `filters.stone_shape_exclude` before ranking and returns structured shape metadata.
- [ ] `I need ring not round cut` returns no product identified as round-cut, while `I need a round-cut ring` can return round-cut products.
