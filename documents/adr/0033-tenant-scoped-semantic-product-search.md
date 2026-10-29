# ADR-0033: Add tenant-scoped semantic product search

- **Status:** Accepted
- **Date:** 2026-10-26
- **Owners:** FaroAI platform and backoffice
- **Related:** [ADR-0002 Qdrant](0002-use-qdrant-for-embed-db.md), [ADR-0003 tenant isolation](0003-use-tenant-id-for-design.md), [ADR-0017 live MCP product search](0017-live-mcp-product-search-results.md), [ADR-0021 product constraints](0021-structured-product-search-constraints.md), [Semantic product search SPEC](../spec/semantic-product-search.md)

## Context

The current Qdrant collection indexes approved knowledge documents. Product
search uses lexical PostgreSQL matching when it takes the local indexed path;
live GIS MCP search results are request-scoped and must not be persisted. This
misses semantic matches between a shopper's intent and product descriptions,
while sending the whole catalog to an LLM would be unbounded and unsafe.

## Decision

- Maintain a separate, rebuildable Qdrant product collection, populated only
  from the tenant-authenticated `/catalogue/sync` snapshot API. Do not embed
  live MCP search responses.
- PostgreSQL remains the source of truth for product records and dynamic fields.
  Qdrant stores semantic vectors plus stable product identity, tenant, version,
  and static descriptive attributes. Do not use vector payloads as authority for
  price, stock, or availability.
- Enqueue catalogue vector work durably in PostgreSQL and process it through the
  existing Redis/worker pipeline. Product upserts and explicit deletion IDs are
  idempotent and tenant-scoped. Failed Qdrant writes must remain retryable.
- For the indexed product path, combine semantic candidates with lexical results
  and hydrate displayed values from PostgreSQL. Apply structured price and
  attribute filters to the hydrated records.
- For a live GIS search, Qdrant may re-rank only products returned by the
  current validated GIS response, matching on stable product IDs. Never add a
  Qdrant-only candidate to a live result or expose cached price/stock.
- Keep the existing approved-knowledge collection separate. Do not embed user
  prompts, generated answers, training examples, image binaries, or secrets as
  product data.
- The first implementation uses multilingual text embeddings from the existing
  configured embedding model. For an image query, Jev selects a paid
  image-capable model with a recently verified per-image price and tenant image
  allowance. That model describes visible jewelry attributes; the image bytes
  and derived description are request-scoped, then the text query retrieves
  product vectors. This is image-guided semantic search, not image-vector
  similarity. Never fetch product image URLs for embedding or store uploaded
  image bytes in Qdrant.

## Consequences

- Natural-language product intent can match catalog descriptions beyond exact
  keyword overlap without scanning the full catalog at request time.
- A tenant's vector candidates cannot cross tenant boundaries; every Qdrant
  query includes a mandatory `tenant_id` filter.
- Catalogue freshness depends on the tenant's sync cadence. Qdrant retrieves
  candidates only; Postgres or live GIS supplies display facts.
- Embeddings add worker time and disk use, but can be rebuilt from PostgreSQL.
- Visual similarity independent of text descriptions remains a separate
  capability requiring a compatible visual embedding model, versioned image
  collection, pricing/retention policy, and consent/deletion rules.

## Implementation

See [Semantic product search SPEC](../spec/semantic-product-search.md). Existing
live MCP semantics in ADR-0017 remain unchanged.
