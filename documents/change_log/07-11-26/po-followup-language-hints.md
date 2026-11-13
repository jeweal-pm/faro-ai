# PO follow-up language hints — 07-11-26

- Add a compact, bilingual PO analysis lexicon for common count and numeric-analysis wording; retain the original prompt for the Jev-selected model.
- Keep deterministic operations limited to already-loaded PO rows. Analysis answers do not re-render the PO cards/table; unrecognized wording continues through the existing Jev flow.
- Document the boundary in ADR-0049 and the procurement language spec. No GIS tools, permissions, Qdrant records, or persistent user prompts are changed.
- `pnpm --dir backoffice typecheck` was attempted and is blocked because dependencies are not installed/resolvable in this checkout (`react`, `next`, `vitest`, and related modules are missing); no packages were installed.
- No tests were added or run, and no container was rebuilt.
