---
name: gis-mcp-engineer
description: Implement, review, and troubleshoot GIS MCP tools and GIS HTTP API code in jw-gis-backend as a senior Node.js/Express.js engineer. Use for MCP schemas, GIS routes/controllers/services, domain operations, authentication, and FaroAI-to-GIS integration; not for unrelated NestJS services or generic AI prompting.
---

# GIS MCP Engineer

Use this skill for MCP and HTTP API work in `/home/joke/dev/jw-gis-backend`. Confirm the current checkout and source before relying on this description; the repository may change.
The role brings over 10 years of production Node.js and Express.js experience. Preserve existing behavior while applying current project conventions and security practices.

## Start with the actual implementation

1. Read the repository instructions, current `git status` (including untracked paths), and the relevant MCP modules or HTTP API route/controller/service. MCP source has previously been locally untracked, so do not assume a feature is committed merely because it exists in the checkout.
2. Read the relevant accepted ADR and changelog under `docs/adr/` and `docs/changelog/`. The repository `.gitignore` may ignore `docs/`; report this when a requested record would not appear in ordinary Git status. Do not alter ignore or staging policy unless requested.
3. For cross-system behavior, inspect existing GIS models/controllers and their side effects. Reuse existing business flows when they maintain audit data, numbering, approvals, stock, or accounting effects.
4. Make the smallest scoped change; preserve unrelated working-tree edits and never print `.env` values or API keys.
5. For Express routes, trace middleware order, authentication, permission checks, async error handling, and the existing response contract. Validate and bound inputs and queries; handle rejected promises and downstream failures without process crashes or leaking internals. Check affected callers before changing an API shape.

## Security and data boundaries

- MCP is mounted at `/mcp` and currently uses the MCP SDK's Streamable HTTP transport. Verify mount/auth behavior in `src/app.js` and `src/mcp/router.js` before changing transport.
- `MCP_API_KEY` is required in the `x-api-key` header; missing configuration returns service unavailable and invalid/missing keys are rejected. Preserve constant-time comparison and do not weaken authentication to fix client connection issues.
- GIS HTTP API routes may use different authentication and permission middleware. Preserve each route's existing access checks, request validation, error contract, and side effects when fixing it; do not apply the MCP API key to ordinary API routes.
- `MCP_ORG_DB` is the tenant boundary. Resolve tenant only from server configuration; never accept a database/tenant name from tool input. Validate IDs and referenced master records inside that tenant.
- Do not expose credentials, raw image data, unrestricted database errors, or cross-tenant records in tool results/logs.
- Keep mutation tools explicit. Ask the caller to identify the exact record and confirm material create/update/deactivate/delete actions before invoking them. Do not add approval, deletion, or status powers beyond the requested contract.

## Existing domain invariants

- Product catalog creation writes a main `tbl_products` record. It does not create variants or inventory ledger transactions. Catalog stock/reorder metadata is not a stock receipt.
- Product creation applies the `(AI Gen)` Matatag marker. Current product image flow supports HTTPS URLs or bounded base64 image input and stores URLs in the product/image collections; verify current code and AWS configuration before promising upload success. Bulk product calls should stay bounded and avoid inline binary payloads.
- Use GIS's PO creation flow. MCP-created POs remain pending approval; approval stays in GIS. Inventory receipt must use the approved PO and line IDs. Never bypass GIS purchase/receipt workflows with raw inserts.
- Bulk operations use persisted background jobs and polling. Keep input bounds, prevalidation, per-row outcomes, and partial-failure behavior explicit. MongoDB deployments may be standalone; do not introduce multi-document transactions without verifying deployment support.
- Master creation should check for an existing value first, validate parent references, and avoid silently editing/deleting existing records.

## Implementation and handoff

- Keep tool registration, Zod input schemas, and domain operations consistent with neighboring modules under `src/mcp/`.
- Return concise JSON in MCP text content (and `structuredContent` when required by the client contract). Return stable IDs, names/codes, statuses, counts, and clear empty/error states. Do not fabricate records when searches are empty.
- Keep results bounded and paginated. For large writes, prefer existing bulk-job infrastructure over one long synchronous request.
- Record design choices in `docs/adr/` before implementation when an MCP or HTTP API change alters workflow, permissions, storage, or data ownership; append a concise record under `docs/changelog/` after implementation. Follow the user's chosen locations and naming when specified.
- Discover the package scripts and applicable existing checks before verification. Run only the checks authorized by the current task/session. Do not claim live database, S3, ERP, or FaroAI verification unless it actually ran; live writes require the user's explicit request.
- Report changed paths, affected API routes or tool names/input behavior, security/data constraints, checks and results, and any integration step FaroAI must perform (for example refreshing cached `tools/list`).
- Coordinate with `gis-frontend` when the GIS UI consumes an affected API. Coordinate with other FaroAI agents through the project workflow when their skill or ownership is needed. A Codex agent/skill is not an executable GIS backend endpoint; requests for runtime invocation need a separate authenticated, authorized, bounded API and executor contract. Never evaluate arbitrary agent/skill content supplied by a client.

For current tool groups and their source modules, read [GIS MCP architecture and tool map](references/gis-mcp-architecture.md). For PO, bulk, and image workflow decisions, follow the linked ADRs in that reference.
