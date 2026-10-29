# Edit latest procurement prompt — 26-10-26

## User impact

The latest user prompt in the Purchase orders & inventory conversation can now be
edited and resent from its message bubble.

## Changes

- Added an Edit action on the latest prompt and loaded its text into the composer.
- Added cancel and save/resend actions.
- Replaced the old prompt and its later transcript output on resubmission.
- Preserved the prior structured PO result and model history so corrected filters
  and model-backed follow-ups retain their intended context.
- Kept GIS write operations behind the existing preview and confirmation flow.
- Recorded the decision in ADR-0031 and the natural-language GIS procurement SPEC.

## Verification

- `pnpm typecheck` passed in backoffice.
- The production Docker image built successfully and the local backoffice container
  was recreated; `http://127.0.0.1:3001/` returned HTTP 200.
- The previous backoffice image was removed after the replacement started.
- The edit interaction is implemented in the transcript and composer; it was not
  exercised through a browser session in this change.
