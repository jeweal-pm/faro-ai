# ADR-0027: Complete read-only PO searches in one request

- **Status:** Accepted
- **Date:** 2026-10-25
- **Owners:** FaroAI platform and GIS integration
- **Related:** [ADR-0026](0026-natural-language-gis-procurement.md), [Natural-language GIS procurement SPEC](../spec/natural-language-gis-procurement.md)

## Context

A user asked FaroAI to find Ham's pending POs and show useful details. The filtered
search returned no rows, while an unfiltered GIS MCP search returned `PO-32` as pending
approval. The user then had to submit another prompt to fetch PO details. This creates
an incorrect no-results answer and makes routine PO lookup feel like a nested prompt
workflow.

## Decision

- Complete a read-only PO lookup from a single user prompt. FaroAI may internally call
  GIS MCP multiple times in the same request; the user must not need to send a second
  prompt to obtain the matching PO details or line items.
- Resolve requested supplier names against live GIS supplier masters before using
  `supplier_id`. Never pass a display name as an ID.
- Use `search_purchase_orders` for the requested filters, then `get_purchase_order`
  for each matching order needed by the answer. Return PO number, supplier display
  name, status, date, and requested item lines/totals from GIS. Never expose internal
  GIS IDs.
- If a search returns no rows, retry with verified IDs and relax optional filters one
  at a time within the same request. Explicit user constraints remain constraints:
  results outside the requested supplier or status may be shown only as diagnostic
  results, clearly labeled as outside the filter.
- Limit detailed output to the 10 most recent matching POs and say when more exist.
- Keep this path read-only. It cannot call `create_purchase_order`, `receive_inventory`,
  or any approval/mutation operation. A confirmed GIS empty result may be reported as
  no matches; a tool failure or invalid filter may not.

## Consequences

- One short prompt can return the PO and its requested line details.
- Supplier-name filtering is grounded in the GIS master rather than model guesses.
- A filtered no-result is checked before FaroAI tells the user that no PO exists.
- Read-only lookups may use additional internal MCP/model turns, but remain bounded
  and do not write data to GIS.

## Implementation

See [Natural-language GIS procurement SPEC](../spec/natural-language-gis-procurement.md).
