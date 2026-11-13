# Chat first-turn PDF export

- Routed natural-language file requests into the in-chat procurement flow, including a first message with conversation continuity disabled.
- Requests with a format but no PO scope now ask for a supplier, status, or PO number in chat; a single prompt with both scope and format uses the same-turn GIS results for the artifact.
- Updated export intent validation and ADR/spec documentation. No GIS write is performed by this flow.
- Verification: `pnpm --filter backoffice typecheck` passed.

## Intent routing refinement

- Centralized common file-format and export wording in `backoffice/app/chat-intent-hints.ts`; the full prompt still reaches the Jev-selected task model for semantic interpretation.
- Added ADR-0045 and updated Thai/English Base Skills specs: no extra classifier call, no Qdrant command dictionary, and deterministic scope/permission checks stay in the application.
- Verification: `pnpm --filter backoffice typecheck`.
