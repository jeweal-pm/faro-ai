# ADR-0031: Edit the latest procurement prompt

- **Status:** Accepted
- **Date:** 2026-10-26
- **Owners:** FaroAI platform and backoffice
- **Related:** [ADR-0029](0029-contextual-po-table-filters.md), [ADR-0030](0030-correct-po-line-filter-comparisons.md), [Natural-language GIS procurement SPEC](../spec/natural-language-gis-procurement.md)

## Context

Users may notice that a filter or procurement request was phrased incorrectly
after it appears in the conversation. Requiring them to type a correction as a
new follow-up can make the transcript confusing, especially for a filter that
should replace the previous one.

## Decision

- Provide an Edit action on the most recent user prompt in the procurement
  conversation.
- Load that prompt into the existing composer. Let the user cancel editing or
  save and resend the revised prompt.
- Replace the edited prompt and its later transcript content. Preserve the
  structured PO result and model history from immediately before the edited
  prompt as context for the revised request.
- For deterministic numeric filters, apply the edited prompt to the previous
  structured GIS rows locally. For model-backed requests, resubmit the revised
  prompt with the preceding model history only.
- Keep existing preview and explicit confirmation requirements for any GIS
  write operation.

## Consequences

- Users can correct the latest prompt without adding a confusing correction turn.
- Follow-up filters still act on the PO table they were meant to refine.
- Editing a prompt does not execute a GIS write; writes remain gated by the
  existing confirmation flow.

## Implementation

The Edit action and composer behavior live in
`backoffice/app/ProcurementAssistant.tsx`; styling is in
`backoffice/app/globals.css`. The behavior is specified in
[Natural-language GIS procurement SPEC](../spec/natural-language-gis-procurement.md).
