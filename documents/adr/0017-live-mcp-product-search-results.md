# ADR-0017: Return verified live MCP product search results to discovery

- **Status:** Accepted
- **Date:** 2026-10-14
- **Deciders:** FaroAI product owner and implementation team
- **Related:** [ADR-0002](0002-use-qdrant-for-embed-db.md), [ADR-0003](0003-use-tenant-id-for-design.md), [ADR-0009](0009-use-multiple-source-mcp.md), [ADR-0012](0012-consented-model-improvement-and-training.md), [AI Discovery SPEC](../spec/platform-backoffice.md), [Live MCP product search SPEC](../spec/live-mcp-product-search.md)

## Context

FaroAI can call tenant-approved live MCP tools, but the chat response previously discarded their results and always returned an empty product list. The discovery interface therefore could not show GIS catalog products even when Jev selected an approved search tool. MCP tool output is external, untrusted data and must not become a product assertion, link, training example, or vector record without validation and the separate approval required by the relevant workflow.

## Decision

- The `search_products` MCP tool is the product-card contract. Jev can select it only when the source is enabled, tested, and `search_products` appears in that tenant connection's explicit approved-tool list. The gateway passes only that tenant's approved tools and credentials to the AI service; the Python caller checks the allow-list again before execution.
- When no Jev route selector is configured, FaroAI uses a narrow deterministic fallback for product discovery: a jewelry item query is sent to `search_products` only when exactly one enabled source has explicitly approved that tool. If there are multiple eligible sources, FaroAI does not guess which one to use. When Jev is configured, Jev continues to select the source and tool.
- Search input is the positive query text plus detected `language`. The GIS MCP returns a JSON object containing a `products` array in `structuredContent` or a text content block. An empty `products` array is a verified no-match response. Other text, malformed JSON, MCP errors, and invalid product records do not establish a product match.
- Only bounded records with a nonempty product ID and name become cards. FaroAI normalizes a small display-field allow-list, accepts up to ten search candidates, removes duplicate IDs, bounds strings and prices, requires a valid ISO currency alongside a displayed price, and accepts only absolute HTTPS image/detail URLs without credentials or local hosts. It applies explicit product exclusions before limiting the UI to eight cards. Unknown fields and raw MCP payloads are discarded.
- The validated records are returned in the existing chat `products` response and shown in the discovery page with optional image, SKU, product type, price/currency, availability, summary, and a safe external detail link. The answer model may use only these validated product fields as its context. MCP JSON and untrusted prose are never passed through as product facts.
- If the MCP call fails or does not return a recognized product JSON envelope, return no cards and the localized live-verification fallback. A valid empty product envelope returns the localized no-verified-match response. Status-only tools such as `get_backend_status` remain callable under their own approval but do not produce product cards.
- Live MCP results are request-scoped. They are not written to Qdrant, answer/route caches, learning candidates, training data, or persistent catalog tables. Promoting a source into indexed knowledge remains a separate operator-approved sync workflow under ADR-0009 and ADR-0012.

Explicit structured product filters and shape exclusion semantics are defined by [ADR-0021](0021-structured-product-search-constraints.md) and [SPEC](../spec/structured-product-search-constraints.md).

## Consequences

- Approved GIS catalog search can return cards through the same discovery UI used for indexed product results.
- Operators retain explicit per-tool approval; discovering a tool never grants permission to execute it.
- Unrecognized or unsafe records reduce to the existing fallback instead of being guessed by the model or displayed as verified products.
- GIS now exposes `search_products`. FaroAI discovered the tool, checked its input schema, and approved only this tool for the saved GIS connection. Initial frontend verification exposed that this deployment has no Jev route selector configured and the old fallback omitted “necklace”, so the request went to knowledge search instead of GIS. The fallback now selects the sole approved product-search source for a product query. End-to-end verification through the frontend returned eight product cards and GIS MCP attribution; FAROAI caps display at eight.

## Alternatives considered

- **Treat every MCP text response as a product:** rejected because status text, prompt injection, malformed data, or unrelated tool output could be mislabeled as verified inventory.
- **Persist live results into Qdrant or learning automatically:** rejected because live price and availability can become stale, and an MCP response is neither approved source material nor human-reviewed training data.

## Review triggers

Revisit this ADR when the GIS search contract changes, a second vendor search schema is adopted, live-result caching is proposed, or MCP results are proposed for indexing or training.
