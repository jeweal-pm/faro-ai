# ADR-0025: Create GIS catalog products through an AI-assisted MCP workflow

- **Status:** Accepted
- **Date:** 2026-10-24
- **Deciders:** FaroAI product owner and implementation team
- **Related:** [ADR-0009](0009-use-multiple-source-mcp.md), [ADR-0017](0017-live-mcp-product-search-results.md), [AI-assisted GIS product creation](../spec/ai-assisted-mcp-product-creation.md), [GIS product prompt example](../../example-prompt/product-prompt.md)

## Context

GIS MCP now exposes `get_product_master_data`, `preview_product`, and `create_product`, but FaroAI's live MCP path is designed for read-only discovery: its caller constructs `{query, language}` arguments and product responses are normalized as search cards. Passing a create tool through that path would be unsafe and would not satisfy its input schema. Product creation also writes organization data and requires factual business values that a creative model cannot infer.

Operators want to describe a batch such as “add 10 rings” or “add 10 diamond products” and have AI expand it into useful product concepts before adding those records to GIS.

## Decision

### 2026-10-25 amendment: direct bulk creation from the frontend prompt

- For an explicit create-products prompt submitted by the configured FaroAI operator, complete the request end to end: generate the requested creative fields, resolve the verified GIS item master, and create the resulting products in GIS. Do not stop at a draft or require a second review/confirmation screen for this operator-authorized flow.
- Keep the AI output limited to creative name, `Matatag`, description and tags. FAROAI generates unique SKU/Product IDs and supplies the exact GIS item master ID. Default products to inactive; never invent commercial attributes or create variants, prices, inventory or media as part of catalog creation.
- Submit the complete generated set through GIS `create_products_bulk`. GIS validates the complete batch before its first product write and processes it as a background job. Poll `get_mcp_bulk_job_status` until terminal status and report actual succeeded/failed counts. Do not retry queued, partial, failed or unknown jobs automatically; verify outcomes first.
- This direct flow is available only through the configured GIS prompt service and fixed server-owned MCP tool allow-list. The model never chooses the endpoint, credentials, tenant, tool name or write arguments outside the validated product payload.
- Retain the separate `/admin/products` review workflow for deliberate manual drafting. The direct prompt flow is a distinct user-authorized mode and does not relax identity, length, master-ID, uniqueness or GIS validation requirements.

- Start product creation from the same natural-language prompt on the FaroAI frontend. Explicit product-creation intents (for example, “เพิ่มสินค้าเกี่ยวกับ ring 10 ชิ้น”) enter the catalog workflow; ordinary shopping prompts continue through discovery. Do not expose a dedicated `/admin/products` page.
- Keep catalog writes behind the existing authenticated platform-admin session even though the entry point is the frontend prompt. An unauthenticated shopper prompt can never write to GIS. In multi-tenant mode, identify the tenant before draft generation; in single-tenant mode, use the configured tenant.
- Treat the operator's prompt as a request to create a bounded batch of products. Internally generated payloads are not an operator-facing deliverable in the direct prompt flow. The AI may creatively propose product names, merchandising descriptions, and tags from the supplied theme. It must not invent SKU/ID, master IDs, price, tax, cost, stock, location, weights, stone measurements, certifications, or other factual fields.
- Require each generated product name to contain 50–100 characters and each description to contain 300–500 characters. Make the descriptions vivid and concept-specific. Vary names, concepts, imagery and writing patterns within one batch; reject output outside these bounds or with duplicate names.
- Split each UI batch of up to 20 drafts into one model completion per product after Jev selects a suitable paid model for the batch. Each completion has a strict single-product JSON schema with schema-level name and description bounds. Validate each product independently and retry only an invalid product once; reject the batch if any item still fails.
- Allow up to 15 minutes for a serial draft group at both the authenticated gateway and server-action boundary. The normal 60-second API timeout is too short for up to 20 independent model completions.
- Give Jev the actual batch size, name/description length constraints, and per-item output-token requirement when selecting a paid model. Exclude batch-only endpoints and models observed failing the contract, while keeping the tenant's provider configuration unchanged; Jev selects from the remaining eligible paid models.
- Normalize common JSON field aliases into the server's draft contract, then enforce the same count and content limits before review. Invalid or incomplete content still blocks GIS operations.
- Support prompts for up to 1,000 products by splitting generation into independent groups of at most 20 drafts. Jev chooses once per group and the selected model generates the items separately; only the last 60 generated names are supplied as duplicate-avoidance labels, so prior conversation and full generated batches never accumulate in model context. Rotate a fixed set of creative directions between groups.
- FAROAI assigns random `FAROAI-` SKU and Product ID values after model output; the model never invents identifiers. Match the model's product-type hint to one exact existing GIS item master by name/code automatically. Keep unresolved matches blocked for review. GIS preview remains authoritative for identifier conflicts.
- Charge one tenant credit per generated group (up to 20 items), independent of the number of model completions within that group. The main frontend prompt automatically runs the required groups and submits the complete set to GIS; do not expose intermediate drafts or require a second click for this explicitly requested create flow. If generation fails before completion, do not submit any partial set.
- Gather relevant master records from the tenant's connected GIS MCP. Use returned IDs only. If required facts are absent, or a master value is ambiguous or missing, keep the draft blocked and ask the operator; never create product masters automatically.
- Require the approved GIS tools `get_product_master_data`, `create_products_bulk`, and `get_mcp_bulk_job_status` for direct prompt creation. Keep `preview_product` and `create_product` for the separate manual review workflow. Do not allow Jev or the model to choose endpoint, credentials, tenant, or tool names. Keep MCP request arguments server-owned and validated against the discovered schema.
- Submit one complete batch to GIS. Rely on GIS bulk prevalidation before the first write, then poll the returned job ID and report per-item outcomes. A partial or unknown job must be surfaced and never retried blindly.
- Recheck the cancellation signal immediately before GIS bulk submission. A stop requested while AI generation is still running must prevent any GIS write; once GIS accepts a job, report its job ID and require status verification rather than implying that it can be canceled.
- Default created products to inactive unless the operator explicitly selects active status. Do not create variants, inventory ledger entries, or media uploads through this first workflow.
- Log actor, tenant, operation, and per-item outcome for audit without storing API keys or raw model/MCP payloads. Keep these product drafts out of Qdrant and training capture unless a separate approved workflow explicitly handles them.

## Consequences

- A short prompt can yield diverse, reviewable concepts, but it cannot manufacture missing commercial facts. The UI must clearly identify required inputs before creation.
- Product creation shares the frontend prompt entry point with product search. Intent routing, server-side GIS credentials, fixed tool allow-lists, schema validation, bulk prevalidation, inactive defaults and job-status reporting keep catalog writes separate from shopper discovery.
- A connected GIS MCP is insufficient by itself: the three exact tools must be discovered and explicitly approved for this capability.
- Batches can partially succeed because GIS creates one product per MCP call; FaroAI must expose per-product status and avoid silent retries.
- Drafting makes more model calls and repeats a small bounded prompt per product, increasing provider request overhead while keeping each output short and independently validated. The Jev candidate cost check remains bounded per UI batch. If a paid model still violates the JSON or length contract after one item retry, reject the group and create no product from that group.
- A 1,000-product request uses up to 1,000 model completions plus 50 Jev batch decisions, while tenant credit accounting remains 50 credits. GIS bulk creation prevalidates the entire set and returns a job for background processing; FAROAI must poll the job rather than resubmit it.

## Alternatives considered

- **Let unauthenticated shoppers create products from the shopping prompt:** rejected because it would mix shopper and catalog-administration permissions.
- **Generate every field from the prompt and immediately create products:** rejected for factual business fields. Creative fields can be generated and created directly only after FAROAI supplies IDs and GIS verifies the full batch; price, costs, measurements, and location data remain unset.
- **Reuse the search MCP execution helper:** rejected because it hardcodes search arguments and parses search results as product cards.

## Review triggers

Revisit when GIS adds a transactional batch-create/rollback tool, product variants or image upload become in-scope, or the GIS product schema changes.
