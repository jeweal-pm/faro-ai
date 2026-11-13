# GIS MCP architecture and tool map

This is a navigation aid, not a substitute for inspecting the live source. Paths below refer to `/home/joke/dev/jw-gis-backend`.

## Transport and authentication

- `src/app.js` mounts `src/mcp/router.js` at `/mcp`.
- The router registers tools with `@modelcontextprotocol/sdk` and `StreamableHTTPServerTransport`.
- `requireMcpApiKey` reads `MCP_API_KEY` and checks `x-api-key`; tenant operations use configured `MCP_ORG_DB`.
- Read the router and app bootstrap before making transport, body-size, or middleware changes. FaroAI may cache tool names/schema; a successful HTTP connection alone does not confirm a refreshed `tools/list`.

## Tool groups and modules

Confirm exact current names and schemas from `router.js` before describing them to a client.

- Runtime and catalog: `get_backend_status`, `search_products`, `preview_product`, `create_product`, `update_product` — `productSearch.js`, `productCreate.js`, `productUpdate.js`, `productSchema.js`, `productImages.js`.
- Product masters: `get_product_master_data`, `create_product_master`, `create_product_masters_bulk`, `create_voucher_type` — `productMasters.js`, `voucherTypes.js`.
- Suppliers: `search_suppliers`, `create_supplier`, `activate_supplier` — `suppliers.js`.
- Locations and zones: `search_locations`, `get_location`, `create_location`, `update_location`, `deactivate_location`, `list_location_zones`, `create_location_zone`, `update_location_zone`, `delete_location_zone` — `locations.js`.
- Purchase orders: `search_po_products`, `preview_purchase_order`, `create_purchase_order`, `search_purchase_orders`, `get_purchase_order` — `purchaseOrder.js`, `purchaseOrderSchema.js`.
- Inventory: `get_inventory_stock`, `preview_inventory_receipt`, `receive_inventory` — `inventory.js`, `inventorySchema.js`.
- Bulk jobs: `create_products_bulk`, `get_mcp_bulk_job_status` (also used by other supported bulk job types) — `bulkJobs.js`, `bulkWorker.js`.

## Workflow boundaries

- PO preview validates existing supplier, location, active PO voucher, and catalog product IDs. Creation uses the GIS purchase workflow and starts pending approval. The user approves in GIS before receipt.
- Inventory receipt consumes approved PO IDs/line IDs and follows the GIS PU receipt flow; it is not equivalent to setting `OtherDetails.currentstock` on a product.
- Product masters are references for products, not inventory records. Check master data before creating a new master value.
- Inline product images accept JPEG/PNG/WebP base64 (5 MiB decoded limit) or an HTTPS URL; actual upload depends on the organization's upload folder and S3 configuration. Bulk creation deliberately avoids inline image bytes.

## Design records

Read the current versions of these before touching their workflows:

- `docs/adr/ADR-2026-10-23-mcp-inventory-tools.md`
- `docs/adr/ADR-2026-10-24-mcp-bulk-jobs.md`
- `docs/adr/ADR-2026-10-25-mcp-purchase-order.md`
- `docs/adr/ADR-2026-11-04-mcp-product-images-and-updates.md`
- Related `docs/changelog/` entries for locations, PO voucher validation, AI Gen marker, and the feature being changed.

Some repositories ignore `docs/`; verify whether newly written ADR/changelog files are tracked and report it without silently changing Git policy.
