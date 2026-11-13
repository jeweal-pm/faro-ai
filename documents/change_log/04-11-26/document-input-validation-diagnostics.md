# Document input validation diagnostics

- Replaced the opaque artifact schema rejection with safe field-level explanations for row-width, row-count, text-cell, orientation, and column validation failures.
- Added a structured rejection log containing only validation codes and top-level field names; document contents are not logged.
- Updated `gateway/src/artifact-security.ts` and `gateway/src/index.ts`.
- API Docker build passed TypeScript compilation; API container recreated and `/health/ready` returned HTTP 200.
