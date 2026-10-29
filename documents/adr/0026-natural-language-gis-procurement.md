# ADR 0026: Natural-language GIS purchase orders and inventory receipts

- **Status:** Accepted for implementation
- **Date:** 2026-10-25
- **Owners:** FaroAI platform and GIS integration

## Context

GIS exposes tools for finding PO products, previewing and creating purchase orders,
searching and reading purchase orders, and previewing and receiving inventory. Users
should be able to request these actions in Thai or English without knowing MCP tool
names or GIS record IDs. Purchase orders and receipts are consequential ERP writes.
Generated business values must remain visible proposals behind explicit administrator
confirmation, and the assistant must never invent GIS records or approve transactions.

## Decision

1. Use `example-prompt/po-inventory-prompt` as the procurement assistant's system
   prompt. Jev selects an eligible paid tenant model; that model interprets the request
   and calls only GIS read/search/preview tools advertised by the current `tools/list`
   and explicitly allowed on that tenant's GIS connection.
2. Keep a server-owned fixed tool allow-list. Never accept a tool name or GIS ID from
   the browser as authority. Recheck the live `tools/list` and tenant tool approval
   immediately before each MCP call. A missing required tool blocks procurement.
3. User-provided values always win. Jev may propose reasonable missing commercial
   values for a PO, including line quantity, unit purchase price, transaction date,
   and delivery date. Default dates use the current Asia/Bangkok date and a proposed
   delivery date 14 calendar days later; a missing quantity defaults to 1 per line.
   Use user currency, then GIS-configured currency, then THB. Mark generated values as
   AI proposals in the preview. Resolve supplier, location, voucher, and product only
   from live GIS records; choose the closest contextual match and disclose it. Never
   fabricate GIS records or IDs. If a required GIS master is unavailable, stop and
   explain the missing setup. If the user requests new products, route through the
   separate product-creation preview/confirmation flow first. Inventory receipt
   quantities still come only from an approved PO returned by GIS.
4. Only a signed-in platform administrator may use the procurement UI. Store the
   exact previewed operation in Redis for 15 minutes, bound to tenant and actor, and
   make it single-use. On confirmation, re-run the GIS preview. If the preview differs,
   require a new confirmation. Only the gateway can call `create_purchase_order` or
   `receive_inventory`; the model cannot call either mutation tool.
5. A created PO remains pending GIS approval. FaroAI never approves it. Receiving is
   available only after `get_purchase_order` confirms GIS status `3` (approved), and
   requires a receipt preview and separate confirmation. Receipts also remain pending
   GIS approval.
6. Do not create a PO or receipt as part of prompt tests. Tests for incomplete prompts
   must end with a follow-up question, before any preview write confirmation.
7. For a PO request, fetch the live supplier, location, and purchase-voucher masters
   before the model answers. Remove quantity/unit wording from product search queries
   so line quantities do not narrow the catalog lookup. Any deliberate test write
   must append `(AI)` to the record's supported descriptive field: product `Matatag`
   and `Description`, PO `note`, or receipt `note`.
8. When multiple purchase vouchers are active, use an exact user match when supplied;
   otherwise choose the contextually best valid GIS option and expose it for review in
   the preview. The word `PO` alone is treated as purchase-order intent, not as a
   voucher selector.

### 2026-10-25 amendment: paginated bulk product selection for PO preview

- For an explicit bulk request naming a verified catalog selector such as the FAROAI
  SKU prefix and exact requested count, the server searches the saved GIS connection
  in pages of at most 50 through the approved `search_po_products` tool. It filters
  only by the user's stated selector and exact exclusions, deduplicates by GIS
  product ID, and proceeds only when the live result count exactly matches the
  requested line count (maximum 100). A mismatch stops before preview; it never asks
  the user to copy GIS IDs or silently selects a subset.
- The server passes the verified product records and live master records to Jev's
  selected paid model and requires a `preview_purchase_order` tool call for this
  complete bulk-selection path. AI-generated prices and dates remain proposals.
- This automation ends at the normal GIS preview and explicit UI confirmation. It
  never calls `create_purchase_order` automatically and never approves the PO.
- Each prompt round used for the operation is saved under `final_prompt/po/` with its
  result, so the operator can review which text led to the preview.

### 2026-10-25 implementation refinement: model proposes prices, gateway owns GIS lines

- For exact bulk PO previews, Jev's selected paid model returns only ordered price
  proposals. FaroAI constructs the PO lines from the complete, distinct product IDs
  already returned by approved GIS MCP search. Surplus prices are ignored; missing
  trailing prices are requested separately. The gateway never accepts product IDs
  invented or omitted by the model for this bounded bulk flow.
- Resolve supplier, location, and PO voucher against live GIS masters. A unique
  prefix match may resolve an abbreviated user label such as `Central Worl`; multiple
  matches stop before preview.
- Connect the gateway's lazy Redis client before persisting the preview draft. A
  valid GIS preview is not usable until the one-time confirmation draft is stored.
- Runtime operation confirmed all 100 requested product lines, quantity 100 each,
  exact Ham supplier, unique Central World location, PO voucher, and a valid GIS
  preview. GIS preview reported `writes_database: false`. FaroAI did not call
  `create_purchase_order`; the preview remains in the UI for the administrator's
  review and explicit confirmation.

## Consequences

- Users can make PO and receipt requests conversationally in Thai or English.
- Users can leave commercial fields blank; AI proposes values, while the exact preview
  and explicit confirmation keep the administrator in control.
- GIS remains authoritative for records, identifiers, validation, and approval state.
- A GIS tool may be used only after it is both advertised at runtime and enabled for
  that tenant. Reconnecting to a different endpoint clears tool discovery and approvals.
- The model provider, current Jev decision service, GIS availability, admin session,
  credits, and price policy must all be configured for the full flow.
- Large receipt-job polling is available only when GIS advertises and the tenant enables
  `get_mcp_bulk_job_status`.

## References

- [Procurement specification](../spec/natural-language-gis-procurement.md)
- [GIS PO and inventory prompt](../../example-prompt/po-inventory-prompt)
- GIS server contracts: `C:/dev/jw-gis-backend/docs/MCP.md`
