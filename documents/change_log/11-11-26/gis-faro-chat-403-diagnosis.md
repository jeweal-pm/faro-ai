# FARO Search: FaroAI chat permission/consent 403 diagnosis

- Date: 2026-11-11 (Asia/Bangkok)
- Scope: read-only diagnosis across GIS frontend, GIS backend, and FaroAI gateway

## Finding

The GIS tenant OAuth token was issued successfully with `chat:write`, and the hashed token record was active and unexpired. The same token received HTTP 403 `forbidden` from both `/v1/chat` and `/v1/skills/base`.

Root cause: the new document-import router had `routes.use('*', enforceDocumentScope)`. Because the Hono subrouter is mounted at `/v1`, this wildcard guard also affected unrelated routes, so a chat credential without `document:import` was rejected before chat processing. The document scope must be enforced only on document-import endpoints.

## Fix and verification

- Applied `enforceDocumentScope` to each document-import route individually; `/v1/chat` and skills routes no longer inherit it.
- Rebuilt and recreated only the FaroAI `api` service; `/health/ready` returned healthy.
- Retested the stored GIS organization credential without printing its secret or token: OAuth returned HTTP 200 with the matching tenant and `chat:write`; `/v1/chat` returned HTTP 200 with `success: true`.
- Requested a separate token for `document:import`; OAuth returned HTTP 200 with the matching tenant and scope, and read-only `GET /v1/document-types` returned HTTP 200 with 26 document types.
- No document was uploaded in this API check. A real upload still depends on a selected file and explicit per-upload consent; upload endpoints continue to require `document:import`.

## Agent coordination

- GIS MCP engineer read-only diagnosis: `chat_log/team_agent_qa/2026-11-11_15-00-17-gis-mcp-faro-chat-403.md`
- GIS frontend engineer read-only diagnosis: `chat_log/team_agent_qa/2026-11-11_15-00-18-gis-frontend-faro-chat-consent.md`

No source code changed in this diagnosis.
