# GIS location list tax enrichment

- Fixed the GIS `POST /locationList` query contract: `Location.js` passed projection-shaped data where `getTaxs()` expects Mongoose query options, and the model swallowed query errors into an undefined result.
- The GIS controller now uses valid sort options, handles tax lookup errors with a controlled API response, and the model returns an array for successful empty results while propagating database failures.
- The GIS MCP engineer fallback reviewed the cause; the Q&A is recorded at `chat_log/team_agent_qa/2026-11-09_09-20-26_Asia-Bangkok.md`. GIS repository changelog is `jw-gis-backend/docs/changelog/2026-11-09-location-tax-enrichment.md` (the GIS repository ignores `docs/`).
