# Procurement prompt test

Date: 2026-11-02

- Restarted only the AI service so its running process loaded the Jev skill/model selection changes; service returned to healthy.
- Manually submitted `List Ham’s POs awaiting approval.` through the FaroAI prompt page. Jev Decisions and the paid provider request returned successfully, and GIS search ran. GIS returned zero pending Ham POs.
- Manually submitted `Show PO-32.`. Jev Decisions and the provider request returned successfully; GIS could not retrieve PO-32.
- No PO, supplier, inventory, or voucher writes were performed. Detailed customer-facing test notes: `user-check/2026-11-02-procurement-prompt-check.md`.
