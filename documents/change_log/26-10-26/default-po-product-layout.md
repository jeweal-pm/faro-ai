# Default PO product layout — 26-10-26

- Set structured PO results to open in product-card layout by default; the table icon remains available.
- Updated the procurement SPEC and ADR-0034 to record this presentation default.
- `backoffice/app/ProcurementAssistant.tsx` now initializes the shared PO view to `cards`.
- Built and deployed the Backoffice image; `/` and `/admin/settings` both returned HTTP 200.
- Removed the previous Backoffice image after confirming no container used it; final C: check showed 0.99 GB free.
