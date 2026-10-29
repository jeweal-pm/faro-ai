# ADR-0030: Parse PO line-filter comparisons and fields precisely

- **Status:** Accepted
- **Date:** 2026-10-26
- **Owners:** FaroAI platform and backoffice
- **Related:** [ADR-0029](0029-contextual-po-table-filters.md), [Natural-language GIS procurement SPEC](../spec/natural-language-gis-procurement.md)

## Context

The follow-up prompt “Unit price not more than 300” was interpreted as
`Quantity > 300`. The comparison parser matched the shorter phrase “more than”
inside “not more than”, and its quantity-field detector treated singular “unit”
in “unit price” as a quantity field. Filtering then ran against the wrong GIS
field and incorrectly showed no rows.

## Decision

- Parse negated and bounded comparison phrases before their shorter substrings.
  “Not more than”, “no greater than”, “not greater than”, “at most”, “no more
  than”, “not over”, and “up to” mean `<=`. “Not less than”, “at least”, and
  “no less than” mean `>=`.
- Infer quantity only from explicit quantity terms (`qty`, `quantity`, plural
  `units`, “number of units”, or Thai “จำนวน”). Singular “unit” is not a
  quantity signal because it commonly appears in “unit price”.
- Preserve the existing local, read-only filtering over previously retrieved
  GIS line rows. Do not call Jev or MCP for an unambiguous numeric comparison.
- Keep the selected field and operator visible in the table filter label so a
  user can immediately spot an incorrect interpretation.

## Consequences

- “Unit price not more than 300” filters by unit price `<= 300`.
- “Quantity more than 300” filters quantity `> 300`.
- Explicit operator phrases take precedence over shorter contained phrases.
- Ambiguous or unsupported phrasing continues through the normal assistant flow.

## Implementation

The parser and user-visible filter label live in
`backoffice/app/ProcurementAssistant.tsx`. The behavior is specified in
[Natural-language GIS procurement SPEC](../spec/natural-language-gis-procurement.md).
