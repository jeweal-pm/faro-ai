# PO result view toggle — 26-10-26

- Added accessible icon controls to switch PO line items between product-card and table views.
- The selected presentation is shared across PO results in the open conversation; switching views does not call GIS or change the result data.
- Both views retain the PO header, filters, status, and totals; card view shows product name, SKU, quantity, unit price, and line amount.
- Updated `documents/spec/natural-language-gis-procurement.md`; frontend changes are in `backoffice/app/ProcurementAssistant.tsx` and `backoffice/app/globals.css`.
- `pnpm typecheck` passed in `backoffice`.
