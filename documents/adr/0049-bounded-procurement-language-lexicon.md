# ADR-0049: Use a bounded procurement language lexicon as a hint layer

- **Status:** Accepted
- **Date:** 2026-11-07
- **Decision owners:** FaroAI platform
- **Related:** [ADR-0030](0030-correct-po-line-filter-comparisons.md), [ADR-0045](0045-natural-language-intent-routing.md), [Natural-language GIS procurement SPEC](../spec/natural-language-gis-procurement.md)

## Context

PO follow-up prompts vary across English and Thai. A request to count displayed
line items should produce a concise calculation, while leaving the earlier PO
cards/table visible and avoiding a duplicate table. Exact phrase checks can miss
common variants, but an exhaustive phrase grammar would make ordinary language
fragile and would move semantic interpretation away from the model-led workflow.

## Decision

- Maintain a small bilingual lexicon for observed aliases of supported PO follow-up
  analysis operations.
- Use a recognized count or aggregate operation only against structured PO rows
  already loaded in the active chat. Return the calculation answer without attaching
  the same PO rows again; retain the earlier result message in the transcript.
- The lexicon may recognize common terms such as “how many”, “line items”, “count”,
  “จำนวน”, “มีกี่รายการ”, and common field names. It does not attempt to interpret
  arbitrary natural language or invent values.
- Preserve the user's complete original prompt for the normal Jev-selected model
  path. Do not normalize or replace the prompt sent to Jev/task model.
- If no supported deterministic operation matches, fall through to the existing
  Jev/model workflow. Do not add a classifier call, MCP call, permission, or Qdrant
  record for dictionary lookup.
- Do not use lexicon matches to authorize GIS operations. Existing server-side
  tenant, tool, and read/write permission checks remain authoritative.
- Expand the lexicon only for observed misses and keep examples anonymized.

## Consequences

- Common bilingual phrasings for simple calculations are handled locally and
  consistently without model cost or another GIS request.
- The PO result remains available above the short answer, and is not rendered twice.
- Unrecognized or ambiguous requests keep the normal model-led interpretation path.
- The lexicon is bounded implementation support, not a user-configurable business
  vocabulary or a replacement for Jev's task and skill decisions.

## Acceptance criteria

- “How many line items are in the displayed results?”, “Count the items”, and
  “มีกี่รายการสินค้า” resolve to counting the loaded PO lines.
- “How many POs?” resolves to counting loaded POs, not line items.
- The calculation response contains no duplicate PO card/table.
- A new numeric filter still shows its newly filtered PO result, including an empty
  state when no rows match.
- Unknown wording is not forced into a dictionary result and continues through the
  existing assistant flow with the original prompt intact.
