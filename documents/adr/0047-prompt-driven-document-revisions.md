# ADR-0047: Prompt-driven revisions for generated documents

- **Status:** Accepted
- **Date:** 2026-11-05
- **Decision owners:** FaroAI platform
- **Related:** [ADR-0044](0044-explicit-export-intent.md), [ADR-0045](0045-natural-language-intent-routing.md), [ADR-0046](0046-prompt-controlled-pdf-orientation.md)

## Context

The current PDF, DOCX and XLSX executors accept a title and a rectangular table. PDF alone accepts an orientation enum. A user can ask for portrait PDF in a follow-up, but every download link is labelled `Download PDF`, so an older landscape version can be mistaken for the new one. Generated artifacts discard their source payload after rendering. The current chat keeps PO results in memory, while it is open.

Users also need to revise layout, typography, text, columns and attached images through ordinary Thai or English prompts. Hard-coding a phrase list for every possible request would be brittle. Passing arbitrary model-generated drawing commands, file paths, fonts or URLs to the worker would be unsafe.

## Decision

1. Treat a document prompt as a request for a **new version** from the verified data currently available in the active chat. Preserve the previous version and give each link a distinctive format, orientation and version label. The download always refers to the exact artifact ID shown beside that label.
2. Use a typed document specification. The gateway and worker both validate the same bounded properties: page setup, title and supporting text, typography, alignment, colors, table columns, footer and an optional uploaded image. The worker accepts data and approved layout values only; it never executes document instructions as code or fetches model-supplied URLs.
3. Keep a deterministic fast path for explicit orientation and other unambiguous settings. For general natural-language revisions, Jev chooses an eligible paid task model, and that model returns a typed patch. The gateway validates the patch before the executor sees it. Ambiguous or unsupported requests receive a clear explanation, without pretending the resulting file was changed.
4. An attached image is accepted only through the authenticated Backoffice document flow, with a size and format limit. Image bytes are not sent to Jev or the task model. The image is decoded and verified again in the worker before embedding.
5. The first implementation revises FaroAI-generated PDF, DOCX and XLSX reports from the current chat's PO data. Editing arbitrary uploaded files requires separate format-specific import and provenance rules; a renderer cannot safely promise arbitrary binary PDF editing from a prompt alone.

## Consequences

- New reports can express common page, text, table and image layout requests without expanding the frontend into a full document editor.
- Revisions stay scoped to the authenticated tenant/session and the verified source rows already loaded in the chat; a new GIS query is needed for changed business data.
- Current-session source data must remain available until the user closes or reloads the page. Persistence across reload is a separate decision because completed job payloads are currently scrubbed for privacy.
- The interface must show exactly which version was created and which operations were applied. The system must report unsupported editing requests instead of silently ignoring them.

## Color semantics

Color controls are distinct to avoid treating “header color” as an undefined accent. `text_color` applies to report body text, `title_color` applies to the document title, `header_text_color` applies to table heading labels, and `header_background_color` applies to the table heading fill. The legacy `accent_color` remains an alias for header background. This mapping is shared by PDF, DOCX, and XLSX renderers.
