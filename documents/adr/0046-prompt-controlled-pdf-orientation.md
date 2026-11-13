# ADR-0046: Honor prompt-selected PDF page orientation

- **Status:** Accepted
- **Date:** 2026-11-04
- **Decision owners:** FaroAI platform
- **Related:** [ADR-0036](0036-platform-base-skills.md), [ADR-0044](0044-explicit-export-intent.md), [ADR-0045](0045-natural-language-intent-routing.md)

## Context

PO exports use nine columns. The PDF executor automatically selected A3 landscape for documents with more than six columns, and the export request contract had no orientation field. As a result, a follow-up request for a portrait PDF reused the right PO data but silently retained landscape layout.

## Decision

- Preserve the current automatic orientation when the user does not specify one.
- Accept explicit portrait or landscape as a constrained PDF layout option. Recognize common English/Thai wording and common misspellings, including `portarit`.
- Reuse only PO lines already loaded in the active chat for a layout-only follow-up. Do not query GIS again unless the user asks for updated or different data.
- Pass orientation as a typed enum through Backoffice and the artifact API to the `base.pdf` renderer. The renderer applies it to A4 or A3 based on the existing column-count rule.
- Keep PDF rendering as a fixed Base Skill executor. Orientation cannot provide code, paths, URLs, fonts, or arbitrary rendering instructions.
- Do not make an additional model call solely to map an explicit orientation to the `portrait`/`landscape` enum. Jev and the selected task model remain responsible for natural-language task/model routing under ADR-0045.

## Consequences

- A prompt such as `I need portarit pdf design` can create a new portrait PDF from the current displayed PO lines.
- With no orientation wording, existing layout defaults remain unchanged.
- Complex requests that change document content or require assets remain separate Base Skill capabilities and are not implied by this orientation option.

ADR-0047 extends the bounded orientation field to DOCX and XLSX print layouts and adds separate typed revision properties. This ADR remains the PDF orientation baseline.
