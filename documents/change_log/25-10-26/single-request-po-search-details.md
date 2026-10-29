# Single-request PO search and detail lookup — 25-10-26

- Fixed the procurement assistant guidance so supplier names are resolved to GIS supplier IDs and PO details are retrieved within the same user request.
- Added a read-only PO lookup path that preloads supplier masters and allows bounded internal tool turns; it never approves, creates, edits, or receives a PO.
- Updated the procurement SPEC and added ADR-0027 for one-request search, verified filters, and bounded detail display.
- Live MCP verification before this change found PO-32 pending approval (100 lines, 10,000 units, total 6,000,000); the prior Ham-filtered search returned no rows. No GIS write was made during verification.
- Verification passed: reloaded the AI service in dev mode without rebuilding an image, then submitted one Thai prompt in the frontend. FaroAI returned PO-32 and its line details in that same response; no second prompt and no GIS write, approval, or receipt action occurred. The response content was English despite Thai input, so response-language consistency remains a follow-up issue.

