# ADR-0038: Set up a GIS Store Location and Voucher Type through approved MCP tools

- **Status:** Withdrawn (2026-10-30)
- **Date:** 2026-10-30
- **Decision owners:** FAROAI platform
- **Related spec:** [GIS Store and Voucher setup](../spec/gis-store-voucher-setup.md)
- **Related ADR:** [ADR-0037 Product Master seeding](0037-gis-product-master-seeding.md)

## Context

The new GIS database needs a Store Location and its Voucher Type. The GIS MCP tools are tenant-scoped and separately approved. Location creation also creates a default Vault zone and cash register, so those must not be duplicated. FAROAI did not have an operator workflow to call the approved Location and Voucher tools.

## Decision

1. Add a fixed Gateway → AI service → GIS MCP operation for `get_product_master_data`, `search_locations`, `get_location`, `create_location`, and `create_voucher_type`; do not expose arbitrary MCP execution.
2. Restrict the setup route to a platform-admin session. Do not reuse the prompt-scoped tenant API key for Location or Voucher administration.
3. Fetch schemas and records from the live GIS MCP; check matching Locations, selected Tax, and Purchase Voucher records before each write. Do not invent GIS IDs.
4. Require an explicit confirmation flag on each creation. Create the Store first, require the GIS-returned Location ID, then create the Voucher Type linked only to that ID.
5. Do not create or update zones, cash registers, Tax, products, POs, or inventory. If Voucher creation fails after Location creation, return the Location ID and report the partial result; never retry creation automatically.
6. For the Central World test setup, use Store / CTW / THB / `Tax` selected by GIS / `,` / `dd/MM/yyyy` / `Asia/Bangkok`; create one POS Voucher `CTW-POS` with `CTW-000001` auto-numbering. These are test defaults and can be edited in Backoffice before creation.

## Consequences

- The operator can provision a Store and Voucher Type without direct GIS database access.
- The selected GIS Tax and returned Location ID remain authoritative.
- The Backoffice confirmation and audit trail cover each external write separately.
- The platform must handle a partial outcome when the Location succeeds and Voucher Type creation fails.

## Withdrawal

On 2026-10-30 the user requested removal of the GIS Store setup feature. The Backoffice setup panel and its dedicated Gateway/AI-service MCP adapter have been removed. Store and Voucher administration must be performed through the GIS MCP by the authorized GIS workflow; this ADR no longer authorizes a FaroAI Backoffice setup flow.

The test Location and Voucher Type listed in the related spec are historical GIS records and were not deleted. Existing GIS MCP connection configuration and tool approvals were not changed.
