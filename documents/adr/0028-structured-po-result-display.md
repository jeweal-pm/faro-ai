# ADR-0028: Render PO line details as a structured table

- **Status:** Accepted
- **Date:** 2026-10-25
- **Owners:** FaroAI platform and backoffice
- **Related:** [ADR-0027](0027-single-request-po-search-details.md), [Natural-language GIS procurement SPEC](../spec/natural-language-gis-procurement.md)

## Context

Read-only PO lookup now completes in one user request, but the UI renders the
model's full line-item summary as plain text. Long POs become a dense paragraph,
Markdown markers remain visible, and names, SKUs, quantities and prices are hard to
scan. The GIS detail tool already returns these fields as structured data.

## Decision

- Build a display-safe PO result object from each successful GIS `get_purchase_order`
  response and forward it through the gateway to the backoffice.
- Render structured PO results in the existing assistant response as a compact PO
  summary and a responsive item table. When structured details exist, use that view
  instead of repeating the same items in the model's prose answer.
- Show only values returned by GIS or derived from its line quantities and prices.
  Do not guess a currency when GIS does not return one; do not expose internal IDs.
- Keep the chat composer available for conversational follow-up. Rendering the table
  must not require another send or create a second nested answer.

## Consequences

- Large PO line lists become scannable and totals are visible in a consistent place.
- The model remains responsible for conversational intent; GIS remains the source of
  truth for displayed PO data.
- Small screens may scroll the table horizontally to preserve readable columns.

## Implementation

See [Natural-language GIS procurement SPEC](../spec/natural-language-gis-procurement.md).
