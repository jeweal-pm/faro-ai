# SPEC: Prompt-controlled PDF orientation

- **Status:** Implemented for portrait and landscape orientation
- **Date:** 2026-11-04
- **Decision:** [ADR-0046](../adr/0046-prompt-controlled-pdf-orientation.md)
- **Related:** [Base Skills SPEC](platform-base-skills.md)

## User behavior

A user may request a new PDF layout in the same active PO chat after searching or exporting results. A layout-only request reuses the PO line items already loaded in the conversation and creates a new artifact; the previous PDF is not modified in place.

Supported orientation values are `portrait` and `landscape`. The natural-language hint recognizes English terms (`portrait`, `vertical`, `upright`; `landscape`, `horizontal`), common typo variants (`portarit`, `portait`, `portriat`), and Thai terms for page orientation. A request without an explicit orientation keeps automatic layout.

Words describing page format and layout do not count as a supplier, PO, or status scope. If no PO results are loaded and the user asks only for a PDF layout, FaroAI asks which supplier/status/PO to use instead of sending the phrase to Jev as an unrelated procurement request.

## Rendering rules

- Up to six columns: A4 page size.
- More than six columns: A3 page size.
- `portrait`: use the selected paper size in portrait orientation.
- `landscape`: rotate the selected paper size to landscape.
- No orientation supplied: retain the existing automatic behavior (A4 portrait through six columns; A3 landscape above six columns).
- PDF reports use a FaroAI-owned print layout informed by GIS invoice/report templates: centered document title, restrained header rule, compact typography, repeating table headings, alternating light row backgrounds, thin horizontal separators, and a quiet page footer. It does not reuse GIS logos, tenant data, template variables, or GIS rendering code.
- Keep the document data generic. Show only the supplied title, subtitle, columns, rows, and optional user-approved footer/image; do not invent supplier, location, tax, PO metadata, totals, or organization details to imitate a business form.
- The GIS-inspired layout lives in `artifact-worker/pdf_layout_reference.py`; it is used only by the FaroAI PDF renderer. XLSX and DOCX styles are unchanged.

## Data and authorization

- Export still requires an explicit supported document format and export action.
- The only exported data is the current conversation's loaded PO line set; layout-only changes do not call GIS.
- Orientation is an optional enum in the artifact request and is accepted only for PDF. The Python renderer validates it again.
- Artifact tenant/actor scope, row and size limits, private storage, expiry, and download checks remain unchanged.
- No additional Jev/model call is made solely for this bounded enum; semantic task routing remains governed by ADR-0045.

## Acceptance checks

1. `I need portarit pdf design` with loaded PO results produces a portrait PDF.
2. `I need portarit pdf design` with no loaded PO results asks for PO scope locally and does not send a procurement lookup.
3. A landscape request produces a landscape PDF.
4. A prompt with no orientation preserves automatic orientation.
5. Invalid orientation enum values are rejected. ADR-0047 extends the typed orientation field to DOCX and XLSX print layouts.
6. Layout-only follow-up uses existing PO rows and does not call GIS.
