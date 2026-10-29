# Lower and higher PO price filters — 26-10-26

## User impact

Follow-up prompts such as “Unit price lower than 100” now filter the original GIS
PO rows and replace the prior filter turn in the transcript. When no unit prices
match, the table shows the zero-match state instead of retaining stale rows.

## Changes

- Added `lower than` / `higher than` comparisons and their bounded/negated forms.
- Kept filtering local to the original previously retrieved GIS rows for
  deterministic numeric comparisons, replacing the prior filter output.
- Documented the behavior in ADR-0032 and the natural-language GIS procurement SPEC.

## Verification

- `pnpm typecheck` passed in backoffice.
- The production Docker image built successfully and the local backoffice container
  was recreated; `http://127.0.0.1:3001/` returned HTTP 200.
- The previous backoffice image was removed after the replacement started.
