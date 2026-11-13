# Customer birthday lookup — 12-11-26

- Added a dedicated read-only customer birthday flow from the tenant-authenticated FaroAI prompt, separate from product discovery and procurement.
- Added deterministic English/Thai intent and date parsing for customer name, named month/day, today, this/next month, exact birth year, and age-by-name. Unsupported ranges, count-only queries, and CRM filters fail with a clear explanation instead of silently broadening the lookup.
- Added the internal customer lookup runtime and fixed GIS MCP call to `search_customers`. It does not call Jev or any model provider and does not send customer data to Qdrant or training.
- Added tenant connection approval for `search_customers`, the separate server credential scope `gis:customers:read`, prompt-result audit metadata without customer PII, and a responsive table/card view with customer name, recorded DOB, age when complete, primary address, phone, and email.
- Added ADR-0061 and `documents/spec/customer-birthday-lookup.md`; updated the tenant MCP access specification and birthday prompt examples with the initial supported scope.
- Coordinated the GIS MCP tool through `gis-mcp-engineer`. GIS added a bounded read-only `search_customers` tool using only configured `MCP_ORG_DB`, excluding soft-deleted records and returning a minimal customer/contact projection. GIS's dated ADR and changelog are under `jw-gis-backend/docs/`; that repository ignores `docs/`.
- Static verification: Gateway `pnpm run typecheck` passed; Python `py_compile` passed; GIS agent `node --check` passed for `src/mcp/customerSearch.js` and `src/mcp/router.js`; TypeScript transpile/syntax checks passed for the four changed Backoffice `.ts/.tsx` files. Full Backoffice typecheck is blocked by missing/incomplete workspace dependencies: local `tsc` is absent, and using the Gateway compiler reports missing Next/React modules and types across the existing Backoffice project. No live customer records were queried or changed, and no automated tests were run.

## Local deployment follow-up — 12-11-26

- Verified authenticated GIS MCP `tools/list` exposes 33 tools, including `search_customers`; unauthenticated access remains rejected. A read-only smoke lookup using a unique synthetic name returned zero matches; no customer records were returned or changed.
- Synced the current 33-tool catalog to active JOKEAI and KT GIS connections. The configured root policy is `all_discovered`, so the two newly discovered tools (`get_supplier` and `search_customers`) are enabled for both tenants. A system audit event records each catalog refresh.
- Built the Backoffice production image successfully (Next.js build and TypeScript pass), rebuilt the Gateway TypeScript output, restarted the API, and recreated Backoffice. AI service already mounted the current source and exposes the birthday lookup route.
- Readiness verification passed for FaroAI API (`/health/ready`) and Backoffice (`http://127.0.0.1:3001/`). Disk availability after build: 130 GB.
- A real-customer lookup was intentionally not run. Use a tenant login and a customer birthday prompt for the first data-level check.

## GIS MCP tenant database investigation — 12-11-26

- Confirmed GIS login resolves `tbl_organization.database_name` and authenticated HTTP requests place it in request-scoped `ORG_DB`; there is no `ORG_DATABASE` env variable in this flow.
- Confirmed MCP currently authenticates only the shared `MCP_API_KEY` and selects one fixed `MCP_ORG_DB`, so that key alone cannot safely route multiple tenants.
- Confirmed `GIS_FAROAI_CREDENTIAL_KEY` is a separate GIS deployment-level AES key for encrypting FaroAI client secrets stored per organization. It is not an MCP credential or tenant selector.
- Coordinated with `gis-mcp-engineer`; recorded the findings in `chat_log/team_agent_qa/2026-11-12T11-27-54-gis-mcp-org-database-context.md`. The user clarified that the authoritative tenant ID comes from FaroAI's authenticated tenant context.
- Added ADR-0062 and its spec for signed, short-lived FaroAI tenant context to GIS MCP. The user clarified that FaroAI integrated-application credentials belong in the existing `GisAdminDb.tbl_ApplicationDetails`; the ADR/spec now explicitly prohibit a duplicate `tbl_faroai_integration` store. GIS implementation is being coordinated and the exact existing table contract is under review; no runtime secret or live record has been changed.

## Birthday prompt visibility fix — 12-11-26

- Route explicit customer birthday prompts before product/procurement intent checks, so `Who has a birthday on June 12` enters the read-only GIS customer lookup.
- Clear stale product answers when the prompt changes, hide product preference chips and general AI consent controls for recognized birthday lookups, and show a small GIS customer-lookup cue before submission.
- Updated `backoffice/app/discovery-page.tsx`; no GIS writes or customer data changes were made.
- Rebuilt and recreated only the Backoffice container. Next.js production build (including TypeScript) completed successfully and `http://127.0.0.1:3001/` returned HTTP 200. A tenant-authenticated live birthday lookup was not run in this turn.

## Birthday lookup request validation fix — 12-11-26

- API logs showed the internal birthday lookup was rejected with HTTP 422 because the Gateway forwarded `actor_email`, which the AI-service request model forbids. The AI service does not use this value; removing it also avoids forwarding unnecessary personal data.
- Updated `gateway/src/admin.ts`. The GIS read-only tool call was never reached for the failed requests; no customer records were changed.
- Gateway TypeScript typecheck and Docker production build passed; recreated only the FaroAI API container. `/health/ready` returned HTTP 200. A live tenant-authenticated birthday search remains pending because it requires the user's GIS tenant session and data.

## GIS frontend parity — 12-11-26

- Added a dedicated GIS proxy `POST /api/v1/App/applicationkey/faroai-customer-birthday`; it authenticates the GIS session, derives the tenant server-side, and requests only the `gis:customers:read` scope. See the GIS backend ADR/spec/changelog and `chat_log/team_agent_qa/2026-11-12T14-11-28-gis-customer-birthday-proxy.md`.
- Updated the GIS `/app/faro-test` page to route birthday prompts to that proxy and show matching read-only birthday results. The OCR upload/review UI was already present in both apps and remains available in GIS.
- Updated FaroAI ADR-0061/spec to document the two entry points. FaroAI and GIS UI production builds completed; both pages returned HTTP 200. An unauthenticated route probe returned GIS's expected `Invalid Authorization` response, so customer data was not queried.
- The GIS integration's FaroAI application credential must include `gis:customers:read`; that permission is intentionally narrow and fail-closed. No tenant credential scope or customer record was changed in this deployment.

## Gateway stale runtime artifact — 12-11-26

- Follow-up logs showed the AI service still received `actor_email` after the API image rebuild. The API container bind-mounts host `gateway/dist`, which masked the compiled code in the image; that host artifact was stale.
- Rebuilt the Gateway `dist` output from current source and restarted only the API container. Gateway build passed and `/health/ready` returned HTTP 200. No authenticated birthday lookup was run after restart.

## Birthday month parsing and live MCP failure — 12-11-26

- The GIS frontend screenshot exposed a case-sensitive location heuristic: `in June` was treated as a location because the parser compared capitalized prompt text against lowercase month names. The heuristic now uses the case-folded prompt, allowing month-only prompts such as `Show customers born in June` to parse as a birthday-month filter.
- New request logs show `search_customers` reaches the configured GIS MCP endpoint (`tools/list` succeeds), but the tool invocation fails inside the Streamable HTTP client with an `ExceptionGroup`; the AI service returns HTTP 502 and the Backoffice displays its generic lookup error. Both JOKEAI and KT connection records report `search_customers` discovered and approved. A GIS MCP code review is in progress; no customer result was returned or modified.
- The GIS frontend now displays safe response messages from the birthday proxy, including scope and credential failures. The JOKEAI tenant's active `GIS` FaroAI credential currently lacks `gis:customers:read`; enable that narrow scope and re-save the linked GIS connection to clear its cached token.
- Verification so far: Gateway readiness HTTP 200; GIS backend controller `node --check` passed; AI service logs show MCP tool transport attempts and failure; no live customer records were returned. Parser/MCP follow-up verification remains pending.

### Runtime correction — 12-11-26

- Confirmed both shared tenant-context secret variables were absent. Generated one random secret and stored the same value privately in FaroAI `.env` (`FAROAI_GIS_MCP_CONTEXT_SECRET`) and GIS backend `.env` (`GIS_FAROAI_MCP_CONTEXT_SECRET`); file permissions remain `0600`. Values are not recorded here.
- Restarted the local GIS backend so it loads the new secret. Rebuilt and recreated only the FaroAI `ai-service` image, which had been 17 hours old and lacked the tenant-context signer; the replacement image contains the signer and loads the configured secret. The superseded image ID is no longer present. No volumes or build caches were removed.
- Fixed the case-sensitive month/location check. In the running image, `Show customers born in June` now parses to `birthday_month: 6`.
- Runtime checks passed: FaroAI API health HTTP 200, AI service readiness HTTP 200, both secret configurations match without printing their value, and the GIS backend is listening on port 3009. No authenticated lookup was run after deployment and no customer records were read or changed.
- The JOKEAI `GIS` application credential still lacks `gis:customers:read`; enable this permission in the tenant credential UI before expecting 5003 to return customer details. The MCP transport fix for the 3001 lookup is deployed and ready for a fresh prompt.

### Month abbreviation recognition — 12-11-26

- Fixed the location-phrase guard to derive recognized English month names and abbreviations from the same birthday month map. It no longer misclassifies `in FEB` as a location filter before birthday parsing can match February.
- No customer records or tenant settings were changed. No automated test was run.

### Birthday date coverage and live parser deployment — 12-11-26

- Expanded birthday parsing to cover all English and Thai month names/abbreviations, every valid month/day combination, day-first numeric dates (`DD/MM` and `DD/MM/YYYY`), ISO dates, Gregorian birth years, month plus year, and exact today/tomorrow/yesterday date filters. Count phrasing retains the date filter so GIS's total can answer it. Fixed the natural-name phrasing `I want to know [name]'s birthday` so the leading words are not included in the GIS name query.
- A valid query with no GIS matches returns `success: true`, an empty customer list, and total `0`; malformed calendar dates remain input errors. Unsupported rolling ranges and CRM segment filters remain explicit rather than being silently broadened.
- Added parser and endpoint tests for all 366 valid month/day combinations, every supported birth year from 1800 through the current year, supported English/Thai month variants, numeric/ISO dates, relative single days, and successful zero-result responses. All 13 birthday tests passed. No live customer records were read or changed as part of those tests.
- Audited all 100 prompts in `example-prompt/birthday-prompt-list.md`: 53 map to currently supported lookup behavior; the rest are unsupported ranges, age bands, segment filters, or aggregate/report operations. Recorded the prompt IDs and limits in `user-check/2026-11-12-birthday-prompt-audit.md`.
- The active `faroai-ai-service-1` container had no source bind mount and used the base `docker-compose.yml` image, so earlier source edits were not reflected at runtime. Rebuilt and recreated only `ai-service`; readiness returned HTTP 200 and the container is healthy with the new image. `feb`, `FEB`, and `12/06` parse correctly at runtime. No caches, images from unrelated projects, or data volumes were removed.
