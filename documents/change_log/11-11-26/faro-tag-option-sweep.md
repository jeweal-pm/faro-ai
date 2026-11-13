# FARO tag option sweep

**Date:** 11-11-2026

- Audited all 12 main search groups and 63 sub-options using the same prompt builder and `selected_facets` contract as the GIS FARO test page; also reproduced the screenshot's combined earrings prompt. Ran 64 live, read-only requests through Jev, FaroAI, and the configured GIS catalog. No product or master data was changed.
- Wrote the detailed outcomes and limitations to `user-check/2026-11-11-faro-tag-option-sweep.md`.
- Added a standalone, searchable HTML presentation at `user-check/2026-11-11-faro-tag-option-sweep.html` for reviewing the summary and individual main/sub results.
- Confirmed Metal and Color failures come from UI-label/master-name mismatch under GIS's exact-match resolver, not missing or inactive masters. Style `Modern` similarly has active GIS `Contemporary` but no exact `Modern` master.
- Confirmed all Budget chips currently map to USD while the tested catalog prices are THB. Zero results therefore do not establish that no in-budget products exist.
- Reproduced a hard-constraint failure: “Find earrings for my wife, in yellow gold, with pearl.” returned one verified pearl earring in white gold.
- Coordinated a read-only diagnosis with the GIS MCP engineer; findings are in `chat_log/team_agent_qa/2026-11-11_17-28-40_Asia-Bangkok-gis-tag-master-aliases.md`.
- No frontend options or application code were changed. Literal browser clicking remains unverified because no browser automation driver was available; API requests bypassed the GIS frontend proxy.
