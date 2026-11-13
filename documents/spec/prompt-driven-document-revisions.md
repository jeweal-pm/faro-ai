# SPEC: Prompt-driven revisions for generated documents

- **Status:** Implemented for FaroAI-generated reports in the active chat
- **Date:** 2026-11-05
- **Decision:** [ADR-0047](../adr/0047-prompt-driven-document-revisions.md)

## User flow

1. Search or load verified PO rows, then request PDF, DOCX or XLSX in Thai or English.
2. A later prompt can change page orientation, paper size, title, explanatory text, font size, alignment, color, column visibility/order, footer or image placement. The source rows are reused in the same active chat. An edit creates a new artifact and a new link labelled with version and layout.
3. An image request needs an image attached in the document composer. The model receives only file type and dimensions, never image bytes. If the requested operation is unsupported, FaroAI says so before creating an unchanged file.
4. A first-turn request must identify a source (supplier, status or PO number) and format. A layout-only request with no loaded data asks for the source.

## Typed input

The gateway accepts `format`, `title`, `columns`, `rows`, optional `layout` and optional `image`. The layout uses bounded values: `orientation` (`portrait`/`landscape`), `paper_size` (`a4`/`a3`/`letter`), font sizes, alignment, page margins, separate body text/title/table-header text/table-header background colors, subtitle/footer text, page numbering, selected/reordered column names, and image position/width. Unknown keys are rejected. The worker repeats validation before rendering.

Image input is PNG or JPEG, at most 256 KiB decoded, and is verified by the worker. Its pixels are not sent to any AI model. The renderer applies it only to the new document version. External URLs, SVG, HTML, scripts, macros, arbitrary fonts and user-supplied output paths are not accepted.

## Format behavior

| Operation | PDF | DOCX | XLSX |
|---|---|---|---|
| Orientation and paper size | Page dimensions | Section page setup | Print page setup |
| Title, subtitle and footer | Flow and page footer | Paragraphs and footer | Worksheet title and print footer |
| Font size, alignment and colors | Table and heading styles | Paragraph/table styles | Cell styles |
| Hide/reorder columns | Before render | Before render | Before render |
| Attached image | In chosen safe position | In chosen safe position | Placed beside data |

## Routing and security

- Explicit export/creation remains necessary for a new file. A follow-up that clearly edits the last generated document counts as a new version request, not a GIS write.
- Jev selects the task model for open-ended instructions. The task model returns a structured patch; it cannot choose an unauthorized data source, output format, path, URL or executable operation.
- The gateway validates tenant, actor, credit policy, patch and artifact payload. The worker applies only supported properties. A generated PDF remains available for its existing 24-hour download window.
- A PDF whose source rows are no longer in the active chat is not silently edited. The user must reload/search the source rows. Arbitrary uploaded document editing is outside this implementation.

## Acceptance

1. `I need portarit pdf design` after a PO result creates a portrait PDF; its new link says `Portrait PDF` and the MediaBox height exceeds width.
2. `Make the title larger, center it, and add page numbers` produces a distinct new artifact with those properties.
3. `Remove the Status column` changes the exported table while retaining the underlying PO data.
4. `Put this image above the table` with an attached valid image embeds it. Without an attachment, FaroAI asks for one.
5. Invalid/oversized image, unknown layout keys and unsupported operations fail before a misleading download link is shown.

## Verification on 2026-11-05

- Follow-up color fix: report body, title, table-header text, and table-header fill have separate validated colors in PDF, DOCX, and XLSX. Thai prompts map `สีหัวตาราง` to header fill and `สีตัวอักษรหัวตาราง` to header text. Base Skills release `2026.11.05.2` loads PDF/DOCX/XLSX version `1.2.0`.
- OpenRouter document planning requests JSON mode, retries without that option if the selected endpoint rejects it, and extracts the first valid JSON object from model output before schema validation. The user's exact prompt returned HTTP 200 with the expected charcoal body text, dark blue title, and gold table-header fill values.

- Gateway validation: 2 targeted tests passed. Artifact worker: 6 renderer/security tests passed in the built image. The Backoffice production build and TypeScript check passed in Docker.
- The live Jev and task-model route returned `title_size: 24`, `alignment: center`, and `page_numbers: true` for “Make the title larger, center it, and add page numbers”.
- A live API job completed and downloaded an A4 portrait PDF with its title, data, footer and page number. Its `Status` column was hidden and the source row stayed intact.
- The direct chat hint for `I need portarit pdf design` resolves to portrait, treats the message as a revision, and labels its next link `Download Portrait PDF · version 2`.
- This renderer supports the typed controls in the format matrix. Arbitrary pixel-level editing of an existing PDF and uploaded external document editing require a separate import/editor design.
