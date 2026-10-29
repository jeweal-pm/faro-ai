# ADR-0029: Preserve PO tables across follow-up filters

- **Status:** Accepted
- **Date:** 2026-10-25
- **Owners:** FaroAI platform and backoffice
- **Related:** [ADR-0028](0028-structured-po-result-display.md), [Natural-language GIS procurement SPEC](../spec/natural-language-gis-procurement.md)

## Context

After a PO search, a user may type a short follow-up such as “Only unit price <
300”. The message omits PO identifiers, so the model can answer in prose and the
structured PO table disappears even though the conversation already has the GIS
line data.

## Decision

- Keep the latest structured PO result available to the active conversation. Treat
  a follow-up filter as a continuation of that table even when it omits “PO”.
- Apply clear numeric comparisons over known GIS line fields locally in the UI. For
  example, filter unit price below 300 against the previously retrieved line rows;
  do not call the model or MCP again for a deterministic filter.
- Recalculate displayed matching-line counts and subtotals from the matching GIS
  rows. Clearly label filtered totals and render a useful empty state.
- For other contextual follow-ups, use the normal assistant flow and keep the last
  PO table visible when the response lacks replacement structured PO data.
- Do not carry a read-only result into a new write/receive/approve request.

## Consequences

- Common filters appear immediately in the same table and do not spend model credits.
- The filter result is auditable because every row comes from GIS data already
  retrieved for the conversation.
- Unsupported or ambiguous filters continue through the assistant; the UI does not
  silently guess a field or alter GIS records.

## Implementation

See [Natural-language GIS procurement SPEC](../spec/natural-language-gis-procurement.md).
