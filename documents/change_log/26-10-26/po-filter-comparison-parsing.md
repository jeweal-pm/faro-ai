# PO filter comparison parsing — 26-10-26

## User impact

Fixed follow-up PO filters such as “Unit price not more than 300” that were being
shown as `Quantity > 300` and consequently returned no matching rows.

## Changes

- Parse “not more than” and related bounded/negated comparison phrases as `<=`;
  parse “not less than” as `>=`.
- Stop interpreting singular “unit” in “unit price” as a quantity reference.
- Record the parsing rules in ADR-0030 and the natural-language GIS procurement
  SPEC.

## Verification

- `pnpm typecheck` passed in backoffice.
- The production Docker image built successfully and the backoffice container was
  recreated; `http://127.0.0.1:3001/` returned HTTP 200.
- The previous backoffice image was removed after the replacement started.
