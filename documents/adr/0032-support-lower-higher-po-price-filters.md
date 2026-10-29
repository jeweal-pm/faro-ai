# ADR-0032: Support lower and higher PO line filters

- **Status:** Accepted
- **Date:** 2026-10-26
- **Owners:** FaroAI platform and backoffice
- **Related:** [ADR-0029](0029-contextual-po-table-filters.md), [ADR-0030](0030-correct-po-line-filter-comparisons.md), [Natural-language GIS procurement SPEC](../spec/natural-language-gis-procurement.md)

## Context

The UI recognizes common numeric filters locally and applies them to the most
recent structured PO rows. The phrase “Unit price lower than 100” was not in the
recognized comparison list. It therefore went through the model-backed path,
where the existing PO table could remain visible when the response did not
include replacement structured rows. The display looked stale instead of showing
the empty result the user expected.

## Decision

- Recognize “lower than” as a strict `<` comparison and “higher than” as a strict
  `>` comparison.
- Also recognize their negated/bounded forms: “not/no higher than” means `<=`,
  and “not/no lower than” means `>=`.
- Apply these unambiguous comparisons locally to the original structured GIS rows
  for the active PO result, recompute matching rows and totals, and replace the
  preceding filter turn in the transcript so old filtered rows do not look current.
- Keep the visible filter label and zero-match empty state so the selected field
  and comparison are clear.

## Consequences

- “Unit price lower than 100” displays only rows with unit price `< 100`.
- If no rows match, the answer reports zero matching line items and the table
  contains no stale rows.
- A new numeric filter replaces the previous filter result and applies to the
  original GIS rows, rather than intersecting with the previous filtered subset.
- Deterministic numeric filters do not call Jev or MCP.

## Implementation

The parser and local filter behavior live in
`backoffice/app/ProcurementAssistant.tsx`. The behavior is specified in
[Natural-language GIS procurement SPEC](../spec/natural-language-gis-procurement.md).
