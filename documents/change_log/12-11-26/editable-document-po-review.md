# Editable document PO review — 12 November 2026

- Added a structured PO correction form for supplier/location mapping and product name, SKU, quantity, price, and currency, with add/remove line controls.
- Saving and retrying stores a marked user-correction block in the tenant-scoped corrected OCR draft; original OCR evidence remains unchanged. Map-existing choices block master creation.
- Added ADR-0060, updated the business-document intake spec, and wrote the master-data quality proposal and staged plan.
- Python syntax compilation and targeted `git diff --check` for the backend/page files passed. The existing modified CSS file reports trailing-whitespace warnings on pre-existing lines; the new CSS rule has no trailing whitespace. Backoffice typecheck is blocked by incomplete workspace dependencies: the package script cannot find `tsc` in `.bin`, and direct TypeScript invocation reports missing React/Lucide/Next modules/types. No dependency install or container rebuild was performed.
- No live GIS master or PO writes were made by this UI change; live end-to-end behavior still needs verification after deployment.
