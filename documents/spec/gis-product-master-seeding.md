# SPEC: GIS Product Master seeding through FaroAI

- **Status:** Implemented for approved Product Master bulk writes; Location/Voucher workflow is pending GIS tool approval and user configuration.
- **Date:** 2026-10-30
- **Decision:** [ADR-0037](../adr/0037-gis-product-master-seeding.md)

## Contract

The tenant-authorized operation runs through the existing Gateway → AI service → GIS MCP connection. GIS MCP tool discovery and the connection's per-tenant `allowed_tools` list are checked before every tool call. No direct GIS database writes are permitted.

### Actions

| Action | Required tool approval | Behavior |
|---|---|---|
| `masters` | `get_product_master_data` | Read requested Product Master types before creating anything. |
| `master_tool_schemas` | Each requested fixed allow-listed tool | Return only live schemas for tools approved on the current tenant connection. |
| `create_masters` | `create_product_masters_bulk`, `get_mcp_bulk_job_status` | Require `confirm: true`; accept 1–100 validated rows per request; queue GIS bulk creation. |
| `bulk_status` | `get_mcp_bulk_job_status` | Poll the returned 24-hex job ID with bounded offset and page size. |

Allowed master row fields are `type`, `name`, `code`, optional `item_id`, `color_id`, and `pointer`. The `type` is restricted to the Product Master enum returned by the GIS schema. Extra fields, duplicate type/code-or-name identities, empty names, oversized values, and unsupported types are rejected before MCP invocation.

Bulk submission audit entries record counts by type and use action `product_masters.bulk_submitted`; they do not store credentials or full submitted rows. The operator verifies completion using the GIS job result and then reads Product Masters again to confirm final counts.

### Exclusions

- Catalog product, PO, and inventory creation are not part of master seeding.
- No existing master is edited or deleted.
- `search_locations`, `create_location`, and `create_voucher_type` require explicit tenant tool approval and live GIS discovery before use.
- Location creation needs a name, code, Store/Warehouse type, currency, selected GIS Tax, thousand separator, date format, timezone, and voucher-numbering format. GIS creates the initial Vault zone and cash register with the Location; the integration must not create duplicates.
