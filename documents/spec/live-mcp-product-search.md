# SPEC: Live MCP product search in AI discovery

- **Status:** FAROAI integration implemented; GIS structured-filter support pending
- **Date:** 2026-10-15
- **Decision:** [ADR-0017](../adr/0017-live-mcp-product-search-results.md)
- **Related:** [MCP connections](../adr/0009-use-multiple-source-mcp.md), [consented model improvement](consented-model-improvement.md)

## MCP tool contract

The legacy GIS MCP input remains compatible with:

```json
{
  "query": "I need a necklace",
  "language": "en"
}
```

The preferred extended input adds `filters` when the tool's advertised schema supports it:

```json
{
  "query": "I need ring",
  "language": "en",
  "filters": { "stone_shape_exclude": ["round"] }
}
```

`query` is required; `language` is optional and should use a short language tag. The MCP result must be JSON, returned either through MCP `structuredContent` or a text content block:

```json
{
  "products": [
    {
      "id": "stable-product-id",
      "sku": "NECKLACE-01",
      "name": "Gold necklace",
      "product_type": "Necklace",
      "price": 125.5,
      "currency": "USD",
      "availability": "Available",
      "image_url": "https://catalog.example.com/images/necklace.jpg",
      "product_url": "https://catalog.example.com/products/necklace-01",
      "summary": "18k gold necklace"
    }
  ]
}
```

`filters` is optional for backward compatibility. When supported, `stone_shape_exclude` is an array of canonical GIS shape IDs applied before ranking. Return at most ten useful candidates for FaroAI to validate and rank, with only business data the authenticated tenant is authorized to see. Include `stone_shape` when it is a verified catalog attribute. The top-level result must be an object with a `products` array; return `{"products": []}` for a real no-match result. Do not return a bare array, alternate envelope keys, fabricate products or return raw database records. The tool must enforce its own GIS API authorization and tenant/account scope.

## Authorization and execution

- A connection test only discovers tools. A platform administrator must explicitly approve `search_products` for the tenant connection before Jev can select or call it.
- At runtime, the gateway passes only enabled, tested tenant connections and approved tool names to the AI service. The AI service checks the selected tool against the same allow-list before making the outbound call.
- When a Jev route selector is configured, Jev chooses the source/tool. If no selector is configured, a jewelry product query may use the sole enabled source approved for `search_products`; FaroAI does not choose between multiple eligible sources. Product care, repair, sizing, or other explanatory questions stay on the knowledge route.
- FaroAI uses the saved endpoint and authentication method; the user query cannot choose a URL, API key, MCP source or tool name.
- MCP requests use the existing exact-host allow-list, HTTPS policy, redirect rejection and finite timeouts. Tool arguments, headers, API keys and raw responses are not logged.

## Validation and response mapping

- Accept only an object with a `products` list. Support MCP `structuredContent` and JSON text blocks. Do not interpret free-form prose, bare arrays, or alternate envelope keys as product data.
- The product-search tool must provide a nonempty `id` and `name`. Limit output to eight distinct IDs. Bound field sizes; discard unknown fields and invalid records.
- Map only ID, name, SKU, product type, stone shape, price, currency, availability, summary, image URL and detail URL. A price is displayed only when finite, nonnegative, within the configured numeric bound, and paired with a valid three-letter currency.
- Image/detail links must be absolute HTTPS URLs with no embedded credentials and no local host target. Invalid optional fields are omitted; an invalid required identity causes that record to be discarded.
- Return normalized product objects in the existing `/v1/chat` `products` field. The UI renders cards and attributes product data to the MCP connection. The answer model receives only the validated fields as untrusted product context and cannot add unsupported product, price or stock facts.
- A valid empty envelope returns a localized verified no-match message. MCP errors or an unrecognized/oversized result return a localized live-verification fallback. Both cases return an empty product list.
- Status-only MCP tools remain supported but do not populate the product array.

## Persistence and learning boundary

Live responses exist only for the current chat request. They are excluded from Redis route/answer caches, Qdrant, product catalog tables and consented learning/training capture. Indexing GIS material requires the separately configured indexed-source synchronization, sanitization, tenant scoping and administrator approval. Generated answers remain excluded from automatic embedding and training under ADR-0012.

## Acceptance criteria

- [x] Approved `search_products` JSON results are validated, bounded and mapped into the discovery response.
- [x] FaroAI sends structured filters only when the MCP tool advertises the filter argument and applies recognized exclusions before displaying results.
- [x] The discovery page renders product details, optional safe image/detail links and MCP source attribution.
- [x] Invalid payloads, MCP errors and valid no-match results fail safely without product cards.
- [x] Status-only tools remain functional and cannot populate product cards.
- [x] Live results do not enter Qdrant, caches, learning candidates or training datasets.
- [x] Without a Jev selector, a product query reaches the sole approved `search_products` source; multiple eligible sources do not get selected by guesswork.
- [x] Frontend search for “I need a necklace” renders eight GIS product cards with source attribution from the MCP response; results remain request-scoped.
