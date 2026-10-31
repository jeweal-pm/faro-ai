# ADR-0037: Govern Product Master seeding through approved GIS MCP tools

- **Status:** Accepted
- **Date:** 2026-10-30
- **Decision owners:** FAROAI platform
- **Related spec:** [GIS Product Master seeding](../spec/gis-product-master-seeding.md)

## Context

FAROAI's product MCP adapter supported reading Product Masters and creating catalog products, but it could not call GIS `create_product_masters_bulk`. The new GIS database needs controlled test masters. The MCP connection stores per-tenant allowed tools, and bulk master creation is asynchronous. The task also needs to avoid duplicate values and retain an `(AI)` marker for later cleanup.

## Decision

1. Keep master operations on the existing Gateway → AI service → tenant GIS MCP connection. Do not add a direct database write path or arbitrary MCP tool passthrough.
2. Use `get_product_master_data` for read-before-create and re-read verification. Expose live input schemas only for a fixed allow-list and only when each tool is approved for that tenant.
3. Add a fixed `create_masters` action limited to GIS-supported Product Master types and fields. Require explicit `confirm: true`, tenant approval for `create_product_masters_bulk`, server-side input bounds, and audit submission metadata.
4. Poll the existing `get_mcp_bulk_job_status` tool and report the job result. A queued request is not treated as completed until its job reports completion.
5. Master values generated for experiments carry `(AI)` in their names and `AI-` code prefixes. Existing matching rows are not updated or deleted.
6. Location and Voucher setup remain separate. Do not create them unless GIS exposes the required approved tools and the user supplies the required Location and voucher-numbering values.

## Consequences

- GIS remains the source of truth for IDs, uniqueness, and validation.
- The platform can seed only Product Master types exposed by the fixed schema; it cannot mutate arbitrary GIS resources.
- Partial asynchronous outcomes must be reported per job and verified by reading masters again.
- Location, Tax, and Voucher setup needs separate capability and user-configured data; this ADR does not infer those values.
