# SPEC: Live MCP product search in AI discovery

- **Status:** FAROAI caller and GIS MCP structured-filter implementation are in source; deployment refresh and end-to-end verification remain
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
  "filters": {
    "item": "ring",
    "metal": "Yellow gold",
    "gemstone": "Emerald",
    "color": "Yellow",
    "style": "Classic",
    "price": {"max": 500, "max_inclusive": false, "currency": "USD"},
    "exclude_terms": ["diamond"]
  }
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

`filters` is optional for backward compatibility. FaroAI sends only keys advertised in the live schema. GIS resolves item, metal, gemstone, color, and style against active organization masters; price requires an ISO currency and filters matching location price rows; `exclude_terms` applies before ranking. Price bounds are inclusive unless the matching boolean is false. Return at most ten candidates and include `verified_attributes`, `applied_filters`, and `unmatched_filters`. Unresolved master values return an empty result and never silently broaden the query. The top-level result must be an object with a `products` array. Do not return a bare array, alternate envelope keys, fabricated products or raw database records. GIS enforces the configured organization boundary.

## Authorization and execution

- A connection test only discovers tools. A platform administrator must explicitly approve `search_products` for the tenant connection before Jev can select or call it.
- At runtime, the gateway passes only enabled, tested tenant connections and approved tool names to the AI service. The AI service checks the selected tool against the same allow-list before making the outbound call.
- When a Jev route selector is configured, Jev chooses the source/tool. If Jev classifies a request as a product search but returns no usable MCP route, FaroAI may use the sole enabled source approved for `search_products`. Without a selector, a jewelry product query may also use that sole approved source. FaroAI does not choose between multiple eligible sources. Product care, repair, sizing, or other explanatory questions stay on the knowledge route.
- FaroAI uses the saved endpoint and authentication method; the user query cannot choose a URL, API key, MCP source or tool name.
- MCP requests use the existing exact-host allow-list, HTTPS policy, redirect rejection and finite timeouts. Tool arguments, headers, API keys and raw responses are not logged.
- A read-only `search_products` request may be attempted once more after a classified transport, connection, or timeout failure, with a short delay. Do not retry an MCP `isError` tool result, a valid empty result, or any write-capable tool. Keep the final failure as an empty result with the existing verification error; never substitute unverified or cached products.

## Generic discovery queries

- GIS strips common request wording, gift wording, recipient wording, and generic `jewelry` / `jewellery` terms before matching searchable product fields. Concrete catalog terms such as `ring`, `emerald`, `gold`, color, and SKU remain searchable.
- If only generic discovery wording remains (for example, `Find jewelry for my wife`), GIS may return a bounded browse of at most ten active products from the configured organization that have location price details. The browse remains organization-scoped and uses the same active product and location eligibility rules as ordinary searches.
- Recipient, occasion, and lifestyle preferences remain context for Jev and answer generation; they are not treated as verified catalog attributes.
- With structured filters, FAROAI sends the original catalog query separately from facet context. Query-only MCP tools receive selected preference context for backward compatibility.
- Jev-selected models may reorder only the at-most-ten GIS candidates for recipient, occasion, theme, size, or lifestyle fit. Unknown IDs are discarded and GIS order is preserved if model output is invalid or unavailable.

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
- [x] A transient transport failure on read-only `search_products` gets at most one retry; MCP tool errors and valid empty results are not retried.
- [x] A generic request with no concrete catalog term reaches the sole approved source and returns a bounded browse; the GIS source update includes the generic-term and filtered-browse paths, pending active endpoint verification.
- [x] Frontend search for “I need a necklace” renders eight GIS product cards with source attribution from the MCP response; results remain request-scoped.
