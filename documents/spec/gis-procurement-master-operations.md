# Prompt-driven GIS master operations

## Purpose

Let a FaroAI platform administrator use the existing procurement prompt to set up a missing Purchase Order Voucher Type through the tenant's approved GIS MCP connection. Supplier lookup and writes are specified separately in [GIS Supplier operations](gis-supplier-operations.md).

## Purchase Order voucher

### Read and resolve

- Read active `purchase_voucher` masters and search active GIS locations before proposing creation.
- Use the exact location ID and name returned by GIS. Do not use a POS receipt voucher for PO work.
- The requested group must match the GIS tool's `Purchase order` enum value.
- A new voucher must be active. A matching active name or code is reused and not duplicated.
- Use the user's numbering configuration. For the current test request, the proposed format is `PO-YYYY-####`: current Bangkok year as the prefix, starting sequence 1, four zero-padded digits.
- Mark the test voucher name with `(AI)`.

### Review and create

1. Jev proposes the Voucher Type name, code, group, active location(s), numbering configuration, and status.
2. The AI service treats `create_voucher_type` as a staged mutation. It validates the runtime GIS schema and checks that every assigned location is a live active search result. It must not execute the mutation during this stage.
3. Gateway stores the exact arguments and display-safe preview in Redis for 15 minutes, bound to tenant and actor. The UI presents one confirmation control.
4. On confirmation, Gateway claims the draft once, rereads purchase vouchers, calls `get_location` for each selected location, verifies active status, and rebuilds the preview. A changed preview requires a new confirmation.
5. If no active duplicate exists, Gateway calls `create_voucher_type` once. Confirm success only when GIS returns `created: true`.
6. If GIS reports an existing duplicate, do not retry or claim it was activated. The current GIS tool creates only and cannot activate or edit Voucher Types.

## Supplier records

- Supplier behavior is governed by [GIS Supplier operations](gis-supplier-operations.md), including separate search/create/activate permissions and explicit confirmation for writes.
- FaroAI must not call `create_product_master` with `type: supplier`.

## Permissions and safety

- Voucher setup requires approved `get_product_master_data`, `search_locations`, `get_location`, and `create_voucher_type` tools.
- Existing PO search requires only its existing read tools. It must not require `create_purchase_order`, `receive_inventory`, or voucher-creation permissions.
- No PO, supplier, product, inventory, location, tax, zone, or cash-register record is created by this voucher flow.
- GIS remains authoritative for IDs, status, numbering validation, and write outcome.

## Acceptance checks

- English and Thai short prompts can request a PO voucher without a product SKU.
- `Central World POS Receipt` is not selected as a Purchase Order Voucher.
- A confirmed new voucher is assigned only to GIS-verified active location IDs and uses the `Purchase order` group.
- A duplicate active voucher produces no write. An inactive duplicate is not reported as active and is not mutated.
- Supplier create and activation prompts use their dedicated preview-confirmation flow; they do not create suppliers as a side effect of voucher setup.
