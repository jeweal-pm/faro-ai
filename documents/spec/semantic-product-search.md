# SPEC: Tenant-scoped semantic product search

- **Status:** Implemented in code; rollout pending
- **Date:** 2026-10-26
- **Decision:** [ADR-0033](../adr/0033-tenant-scoped-semantic-product-search.md)

## Data flow

1. An authenticated tenant syncs bounded product snapshots through
   `POST /v1/catalogue/sync`. PostgreSQL upserts product facts and creates a
   durable catalogue embedding job in the same transaction.
2. The worker embeds only descriptive text: product name, SKU, type, materials,
   verified gemstone attributes, search text, and summary. It upserts points to
   a product-specific Qdrant collection. It does not embed price, stock, image
   URLs, or user prompts.
3. The worker processes explicit deleted product IDs by deleting their vectors
   with both tenant and product-ID filters.
4. On an indexed product search, the AI service embeds the query, searches the
   product collection with the mandatory tenant filter and optional verified
   attribute filters, combines vector and lexical candidates, hydrates records
   from PostgreSQL, applies price/attribute constraints, and returns bounded
   product cards.
5. On live MCP search, FaroAI validates the request-scoped GIS result and may
   reorder only those returned records using matching Qdrant product IDs. It
   never adds vector-only products or stale dynamic facts.

## Qdrant payload

Each product point stores `tenant_id`, `product_id`, `sku`, `name`, `text`,
`product_type`, `metal_color`, `stone_type`, `stone_shape`, `catalogue_version`,
`embedding_model`, and collection version. Price, currency, availability, image
URLs, credentials, raw prompts, and generated answers are excluded.

## Synchronization and lifecycle

- Sync requests carry at most 100 products and 100 explicit deletion IDs.
- Each batch is transactional in PostgreSQL; embedding jobs are durable and
  idempotent across retries.
- A product update upserts the same deterministic point ID. A deletion tombstone
  is tenant-scoped and removes only that product's point.
- PostgreSQL is authoritative. Qdrant failure does not roll back a committed
  catalog snapshot; the durable job reports pending/failed and can be retried.
- Embedding model/dimension changes use a separate versioned collection and
  re-embedding plan. They must not overwrite incompatible vectors in place.

## Search and freshness

- Vector search returns a bounded candidate set; it is never a catalog dump.
- Structured filters are applied to hydrated PostgreSQL records. Live price,
  stock, order and customer data continue to require GIS MCP.
- Live MCP results remain request-scoped under ADR-0017 and are never written to
  Qdrant by the search request.
- Search falls back to lexical PostgreSQL matching if the product collection is
  absent, empty, or temporarily unavailable.

## Image-guided search

- The shopper may attach one JPEG, PNG, or WebP reference image up to 1.5 MB.
- The API checks the declared media type against the image signature and rejects
  mismatches or oversized data. Images are not written to PostgreSQL, Qdrant,
  Redis, logs, or learning datasets.
- Jev routes only among tenant-eligible paid models configured for at least one
  image per request, with a verified per-image price. If none is eligible, the
  request returns a clear configuration message.
- The selected model describes visible jewelry attributes. FaroAI combines
  that short-lived description with the shopper's text and searches product
  vectors. Live MCP results remain authoritative and may only be re-ranked
  within the current GIS response.
- The description is not stored as product knowledge. The embedding worker
  never fetches product image URLs.
- This is image-guided text-to-product search, not cross-modal visual
  similarity. Image vectors require a separate model and collection version.

## Acceptance criteria

- Tenant catalogue sync creates durable idempotent vector jobs.
- Product vectors are stored separately from approved knowledge and always
  filtered by `tenant_id`.
- Product semantic search can find descriptive matches with no exact keyword
  overlap while returning only current hydrated product facts.
- Product deletion removes only the matching tenant's vector.
- Live MCP product responses are never persisted and Qdrant cannot introduce
  products absent from a live response.
- Search remains available through lexical fallback when Qdrant is unavailable.
- Image search rejects invalid/oversized inputs and reports when no paid,
  price-verified image-capable model is configured.
- Every product vector lookup remains tenant-scoped; image bytes are transient.
