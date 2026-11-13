# GIS product search: bounded retry for transient MCP failures

- Date: 2026-11-11 (Asia/Bangkok)
- Scope: FaroAI read-only `search_products` MCP call.

## Change

- Retry a product search once, after a short 200 ms delay, only when the MCP client reports a timeout, connection failure, or transport error.
- Do not retry GIS `isError` tool responses, valid empty catalog results, or any non-search tool.
- Classify an MCP `isError` separately from an MCP transport/protocol exception in safe runtime logs. This avoids treating a GIS tool failure as proof that the transport protocol failed.
- Keep the existing fail-closed response: no cards are shown when FaroAI cannot validate a GIS result.

## Evidence

- The exact UI query `Find a pendant for my wife, for an anniversary.` with the `Pendant` facet returned one GIS-verified catalog result in a live FaroAI API request. GIS MCP independently returned the same one verified Pendant for the exact query and item filter.
- Existing runtime logs showed successful searches interleaved with failed calls; prior `mcp_protocol_error` log entries were ambiguous because GIS tool `isError` responses were converted to generic `RuntimeError`.
- No frontend facet choices or GIS catalog records were changed.

## Verification

- Focused tests passed (3 cases): recovery after a connection failure, no retry for GIS `isError`, and no retry for non-search tools.
- Rebuilt and recreated only FaroAI `ai-service`; `/health/ready` returned HTTP 200.
- Repeated the exact prompt and `Pendant` facet through the running FaroAI API after deployment. It returned HTTP 200, `success: true`, `decision_used: true`, and one GIS MCP product: `Solstice Emerald Pendant` (`AI-CTW-PND-003`, THB 15,900, out of stock).
- No GIS/frontend source, choices, or records were changed.
