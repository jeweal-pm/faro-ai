# Route plural PO prompts to procurement — 26-10-26

- Fixed Discovery intent detection for `POs` and `purchase-orders`, and added
  list/display/view/get actions so PO queries enter the GIS procurement flow.
- Fixed the AI service's separate read-only lookup classifier to recognize plural
  PO references, which enables structured results and the same-turn GIS detail flow.
- Updated the [natural-language GIS procurement SPEC](../../spec/natural-language-gis-procurement.md)
  to keep PO prompts out of jewelry product discovery.
- Verified all five supplied English prompt forms against both the frontend
  route classifier and the AI service's read-only PO classifier; all route to
  procurement (`true` for all five).
- Replayed `Show Ham’s pending POs with item details.` in the running frontend.
  It returned PO-32 with supplier, date, pending-approval status, and a structured
  line-item table (100 items, total quantity 10,000, total amount THB 6,000,000),
  instead of the jewelry product list.
- `pnpm typecheck` passed in `backoffice`; the backoffice container was rebuilt
  and the local frontend returned HTTP 200.
