# GIS MCP product images and updates

- Check the MCP product create/preview flow, tenant-scoped product models, existing GIS image collections, and S3 upload conventions.
- Add an accepted ADR before implementing product image input/upload and a partial product update tool; preserve tenant scoping and existing API key protection.
- Verify the schemas and MCP tool registration, run targeted validation, and document changed files and limitations.

## Implemented

- Added `update_product`, tenant-scoped partial update with duplicate SKU/ID checks and GIS master validation. It preserves omitted fields and does not delete products or post inventory.
- Added image payload support (`image_base64` + `image_mime_type`, JPEG/PNG/WebP, max 5 MiB) to preview/create/update. Server verifies and normalizes the image to WebP, uploads under the organization S3 folder, sets `main_image`, and writes the additional `tbl_products_images` record.
- Kept bulk product creation bounded by excluding inline binary image input; bulk callers may still use HTTPS image URLs.
- `node --check` passed for `productSchema.js`, `productImages.js`, `productCreate.js`, `productUpdate.js`, and `router.js`; MCP router module loaded using the same `BASEPATH` bootstrap as `src/app.js`. No live database or S3 writes were performed.
- Added the accepted ADR and MCP changelog under `docs/adr/` and `docs/changelog/` in the backend repo.
