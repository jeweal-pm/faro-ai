# Qdrant semantic product and image-guided search — 26-10-26

## What changed

- Added a separate tenant-filtered product vector collection. Catalogue syncs
  create durable PostgreSQL embedding jobs; the worker indexes descriptive
  product fields and processes explicit deletions. PostgreSQL/GIS remain the
  authority for price and availability.
- Indexed product search now combines semantic vector candidates with lexical
  matches and hydrates the current product details from PostgreSQL. Live GIS
  results can only be re-ranked among products returned by that GIS request.
- Added an optional jewelry-reference image input to Discovery. Jev chooses
  from paid image-capable models with a verified per-image rate and tenant image
  allowance. The chosen model converts visible jewelry details to a short-lived
  text hint that searches the product vectors.
- Increased the Next.js Server Action body limit for image payloads while
  retaining a strict client file-size limit and the smaller API request bound.
- Image inputs are limited to JPEG, PNG, and WebP, at most 1.5 MB, and their
  declared type is checked against the file signature. The image and derived
  hint are not stored in Qdrant, PostgreSQL, Redis, logs, or learning datasets.
- Added ADR-0033 and the semantic product search specification. Catalogue job
  type/schema updates are in migration `014_semantic_product_vectors.sql`.

## Scope note

Image-guided semantic search uses a text description of the visual reference;
it does not create image vectors or promise pixel-level visual similarity.
Cross-modal image-vector search would need a separate model and collection.

## Search regression fix — 26-10-26

- Fixed the live-product Qdrant reranker call so filters are optional when the
  caller has no structured facets; this was causing the reported HTTP 500 for
  `rings`.
- Fixed the embedding worker's PostgreSQL row handling and mounted its source in
  local Compose so the dev container can pick up the correction without an image
  rebuild.
- Recreated only the worker container with the new source mount; the AI service
  hot-reloaded its mounted Python source. No image was built, and C: retained
  about 2.8 GB free.
- Repeated `rings` in the local FAROAI frontend; it returned 8 GIS MCP product
  cards and the internal chat request returned HTTP 200.
