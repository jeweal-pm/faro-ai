# Contextual PO table filters — 25-10-26

- Preserved the active structured PO table across follow-up questions and filters.
- Added deterministic local numeric filters for unit price, quantity, and line amount; recomputes matching-line counts/subtotals and labels filtered totals.
- Added ADR-0029 and updated the procurement SPEC with context continuity, empty-state, and no-write rules.
- Verification: backoffice typecheck and production build passed; the updated backoffice is running at port 3001 and returns HTTP 200; the replaced backoffice image was removed. A model/GIS search was not repeated, so the local filter path did not spend credits or call MCP during this change.
