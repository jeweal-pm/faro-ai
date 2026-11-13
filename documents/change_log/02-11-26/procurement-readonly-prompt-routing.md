# Procurement read-only prompt routing fix

Date: 2026-11-02

- Updated procurement intent detection so explicit negative instructions such as “Do not approve it or receive inventory” do not route a read-only PO lookup into the inventory-receipt workflow.
- Jev now receives only the published Base Skills eligible for the detected workflow scope, reducing mismatched-skill failures. Runtime still validates Jev's choice before execution.
- Added sanitized provider status and error details to internal logs for procurement model request failures.
- Retested in the FAROAI prompt page with `Show PO-CW-2026-0002. Read its current status in GIS and show its items, quantities, prices, and total. Do not approve it or receive inventory.`
- The request completed through Jev, the paid model, and GIS MCP. GIS returned one PO, then its details; the page displayed PO-CW-2026-0002, supplier `jjjj company`, status `pending_approval`, one ring line, quantity 1, unit price 1,000, and amount 1,000. No write tool was called.
