# PDF export font fallback fix

Date: 2026-11-04

## Problem

PDF exports completed and contained the expected row count, but their text appeared blank. The artifact worker used a Thai-only Noto font for all text. That font does not contain Latin letters or digits, so English purchase-order data rendered as missing glyphs.

## Change

- Register Noto Sans Thai and Noto Sans Regular as separate fonts in the PDF renderer.
- Render Thai codepoints with Noto Sans Thai and other text with Noto Sans Regular, including mixed-language titles and table cells.
- Keep the artifact input validation, row data, and output formats unchanged.

## Verification

- Reproduced the blank output with a synthetic English PO table before the fix.
- Rebuilt and restarted only `artifact-worker`.
- Verified a mixed English and Thai PDF sample visually and with text extraction; the title, column headings, and sample row values are present.
- The original Heritage Gold Components artifact cannot be repaired in place because the completed job payload is scrubbed and existing artifacts are immutable. A fresh export is required to verify that exact report.

## Scope

Only `artifact-worker` PDF rendering is affected. Existing PDFs are immutable and remain blank; create a new export after the worker is updated.
