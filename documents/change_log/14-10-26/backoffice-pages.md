# Backoffice page routes

## Change

- Added bookmarkable Backoffice routes: `/admin` for Overview and `/admin/{tenants,providers,routing,knowledge,mcp,audit,settings}` for each workspace area.
- Changed the sidebar and Overview shortcuts to use links, so a section can be opened directly or shared by URL.
- Moved MCP connection management and existing MCP sources into a dedicated MCP connections page, separate from embedding jobs.
- Unknown Backoffice section paths return the standard 404 page.

## Verification

- `pnpm exec tsc --noEmit --incremental false` passed in `backoffice`.
- `pnpm build` passed and listed `/admin` and `/admin/[section]` as generated routes.
- Rebuilt and restarted the local `backoffice` container to make the changes available on port `3001`.
- Configured loopback-only local Discovery to use an existing empty development tenant through a new chat:write-only API key stored in ignored `.env`; updated the dev runner to load deployment-bound demo settings without exposing credentials to the browser. Added a visible Search submit action and clarified that jewelry type/color/stone/price filters are optional; documented the UX in `documents/spec/platform-backoffice.md`.
- Verification: Backoffice TypeScript check passed; `/` and API readiness return HTTP 200; a chat request with the configured dev credential returns successfully. Current development tenant and legacy SQLite contain no products, and there are no eligible provider models, so searches correctly return the deterministic no-match fallback until catalog data and an eligible paid model are configured.
- Added free-text recognition for English `necklace`/`necklaces` and Thai `สร้อยคอ`, plus a matching optional Jewelry type refinement. Search now includes the structured product type when matching free-text terms, so prompts such as `I need necklace` can match catalog rows even when the type appears only in the product type field. The active tenant (`KT`) currently has zero product records, so this cannot produce a verified product result until its catalog is populated or an MCP catalog source is connected.
