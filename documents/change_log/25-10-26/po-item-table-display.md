# PO line item table display — 25-10-26

- Added a display-safe structured PO result contract from live GIS detail data through AI service and gateway.
- Replaced dense assistant prose with one responsive PO summary and item table in the same conversation response; kept the follow-up composer.
- Added ADR-0028 and documented the display contract in the procurement SPEC.
- Verification: backoffice and gateway typechecks passed; gateway compiled; AI service Python syntax parsed; backoffice image rebuilt and the previous image removed; API, AI service, and backoffice are healthy and `http://127.0.0.1:3001/` returns HTTP 200. No live MCP/LLM request was sent during this presentation-only change, so table data rendering against a fresh PO response was not manually exercised.
