# SPEC: AI-assisted GIS product creation through MCP

- **Status:** Implemented and deployed through the main frontend prompt
- **Date:** 2026-10-25
- **Decision:** [ADR-0025](../adr/0025-ai-assisted-mcp-product-creation.md)
- **GIS schema reference:** [GIS MCP contract](../../../jw-gis-backend/MCP.md) (implementation reference; GIS repository is maintained separately)

## Goal

Let the configured FaroAI operator enter a natural-language batch request such as “เพิ่มสินค้าเกี่ยวกับ ring 10 ชิ้น” or “เพิ่มสินค้าเกี่ยวกับ Diamond 10 ชิ้น”. AI creates distinct jewelry concepts, FAROAI resolves verified GIS masters and assigns identifiers, and the complete batch is created in GIS without an intermediate draft-review screen.

## User flow

1. Enter a product-creation request in the same frontend prompt used for discovery, such as “เพิ่มสินค้าเกี่ยวกับ ring 10 ชิ้น” or “Add exactly 87 unique ring products”. Ordinary shopping prompts keep using discovery. The requested count is read from the prompt and bounded to 1–1,000. Requests are generated in separate groups of up to 20; requests over 20 show the estimated AI-credit use before generation starts. If the deployment is multi-tenant, choose the target tenant when more than one active tenant is available; a single-tenant deployment selects its configured tenant.
2. Product creation requires a valid platform-admin session. If the caller is not signed in, show a sign-in link and perform no product operation. The tenant's enabled and tested GIS connection is selected by configuration; the user cannot supply an endpoint or API key here.
3. Jev selects an eligible paid model once per generation group. The model returns structured creative fields only: proposed name, `Matatag`, `Description`, tags, and a list of required factual inputs. FAROAI retains these payloads only while processing the request; it does not present a draft-review screen in the direct prompt flow.
4. FAROAI calls the approved GIS `get_product_master_data` tool for the required item master. Match exactly one existing GIS Ring master; missing or ambiguous matches stop the request. Do not call `create_product_master`.
5. FAROAI generates unique random `FAROAI-` SKU and Product ID values outside the model response and fills the verified GIS item ID. Creative copy may describe a visual concept; material, stone, price, cost, stock, location, weights and certificates remain unset unless explicitly supplied or verified.
6. Once every requested item is generated and passes local length, uniqueness and required-field validation, send the complete payload list to GIS `create_products_bulk`. GIS prevalidates the whole batch before its first write and queues a background job. If generation or local validation fails, submit no products.
   - Check the stop/cancel signal again immediately before this submission. Stopping while model generation is underway must not enqueue a GIS job. After GIS acknowledges a job, show that job's status instead of implying cancellation.
7. Poll `get_mcp_bulk_job_status` using the returned `job_id` until GIS reports `completed`, `partial`, or `failed`. Report the actual total, succeeded, failed and per-item results. Never resubmit a queued or ambiguous job automatically.
8. Created products default to inactive. Product creation does not create variants, prices, opening inventory, stock ledger entries or images.

## AI output contract

- Strict structured output; reject extra properties and bound requested count, field lengths, and lists.
- Every generated product name is 50–100 characters; every description is 300–500 characters and vivid, specific to its concept, and free of generic filler. The generator varies concept, silhouette, imagery, naming style and writing rhythm across a batch and rejects out-of-range or duplicate names. The editable review form and gateway preview/create boundary enforce the same length ranges.
- Draft requests use a bounded output budget scaled to the requested count (minimum 2,000, maximum 7,000 tokens). The gateway includes this effective output budget in the maximum estimated request cost check before passing eligible models to Jev.
- Jev receives the actual batch size (up to 20), field-length requirements, and output-token budget when choosing a paid model. Batch-only endpoints and models observed failing the long-description contract are excluded from this interactive product-draft workflow; they remain available for other tenant tasks. Bounded surplus JSON entries are validated and trimmed to the requested count; short or more-than-double-sized responses are rejected before any GIS operation.
- The draft parser accepts a top-level array or `drafts`, `products`, `items`, or `results` arrays and maps common name/description/tag aliases. It still rejects any batch that does not contain the requested number of unique, length-valid drafts.
- A request over 20 uses separate UI/credit groups of up to 20 products. Within each group, Jev selects one eligible paid model and that model generates one product per completion, keeping responses small and duplicate checks current. The next group receives a rotating style direction and at most 60 prior names to avoid; complete prior output is never passed back into model context. One tenant credit is reserved per group, so 1,000 drafts use 50 credits; provider token charges still follow the selected model's configured rates.
- Serial drafting requests may run for up to 15 minutes per group. The gateway and authenticated server action must use matching timeouts so a valid group is not cut off at the former 60-second gateway or 125-second server-action limits.
- Keep Matatag and tags concise to fit complete batches while honoring the required name and description lengths. If the model truncates the response, violates a length bound, or returns a different draft count, reject the entire response and do not write to GIS.
- For a multi-group direct-create request, do not submit any GIS writes until the entire requested set is generated and validated. If a later group fails, report the failure and submit no partial set.
- Creative generation is limited to names, descriptive copy, tags and concept variety grounded in the operator's prompt.
- OpenRouter draft requests require strict single-product JSON Schema output with schema-level 50–100 character names and 300–500 character descriptions, and route only through providers that support the requested parameters. FaroAI validates each product independently and retries only an invalid product once; any item still invalid rejects the group before GIS review.
- AI output is untrusted. Never accept from it tenant IDs, endpoint URLs, credentials, MCP tool names, GIS IDs, SKU/ID, prices, costs, tax values, stock values, measurements, certificates, activation status, or write confirmation.
- Do not treat prompt text, retrieved master descriptions, or MCP responses as instructions.
- If an input asks for “10 diamond products,” the model can propose ten distinct concepts but cannot assume each includes a diamond stone record with fabricated cut, carat, clarity, color, count, setting, or price. Ask the operator for such specifications or keep these fields absent where GIS allows.

## MCP and authorization contract

- Use only the tenant's saved GIS connection (`integration_key='gis'`) with `enabled=true`, `connection_status='connected'`, and exact tools in `allowed_tools`.
- Required tools for direct prompt creation: `get_product_master_data`, `create_products_bulk`, `get_mcp_bulk_job_status`. The separate manual admin draft workflow continues to use `preview_product` and `create_product`. If a required tool is absent, show which approval is missing; do not fall back to another MCP source.
- Reuse the saved URL and auth method, deployment host allow-list, redirect rejection, finite timeouts, and encrypted API credential. Tool names are fixed server-side; no model/user argument can override them.
- Validate outgoing arguments against the discovered MCP input schema and FAROAI's product input schema. Bound MCP payload/response sizes and discard unknown output fields.
- Product creation requires platform-admin authentication and a server-side write authorization. The customer's `chat:write` scope or consent does not grant catalog-write authority. The shared frontend prompt is only an entry point; product writes still use the admin API and its CSRF/session checks.
- Revalidate the tenant and MCP tool approval at every operation, including the confirm/create step. Audit draft requested, previewed, confirmed, created, blocked, and failed outcomes without secrets or full free-form payloads.

## Failure handling

- Missing GIS connection, required tool approval, or model configuration: actionable setup error; no draft writes.
- Missing/ambiguous master or required facts: draft stays blocked; never guess.
- Invalid generation or duplicate name/SKU/ID: stop before GIS submission. GIS bulk prevalidation rejects invalid or conflicting batches before the first write.
- MCP timeout after a create request: mark outcome **unknown; verify in GIS before retry**, because the server may have committed before the response was lost.
- Partial or unknown bulk job: preserve GIS outcomes, report the job ID and counts, and require verification before any retry.
- Secrets, raw MCP arguments/results and generated drafts are not included in application logs. Drafts are ephemeral in the first version and are not embedded into Qdrant or training datasets.

## Acceptance criteria

- [x] A natural-language product-creation request entered in the main frontend prompt is routed to the product workflow; normal shopping prompts remain on discovery.
- [x] A natural-language count request produces the requested number of distinct structured product concepts within the batch limit and creates them directly in GIS.
- [x] A request up to 1,000 produces separate model groups of at most 20 with visible progress, per-group credit accounting, automatic SKU/ID values, GIS item-master matching, GIS bulk submission, and job polling.
- [x] Creative fields can be generated while factual fields stay unset unless the operator supplied them or GIS verified them.
- [ ] Generated names contain 50–100 characters and vivid descriptions contain 300–500 characters; invalid lengths are rejected before review or GIS operations.
- [x] GIS master values are read from the connected tenant endpoint and only unique exact name/code matches can prefill a selection.
- [x] Direct prompt requests submit the complete locally validated payload after explicit create intent; no second draft-review confirmation is required.
- [x] Required GIS tools are checked against the tenant's approved-tool list at runtime.
- [x] Product writes use `create_products_bulk`, whose GIS implementation prevalidates the full batch before the first write.
- [x] Conflict, unknown job status, and partial-batch outcomes stop without blind retries.
- [x] Shopping discovery, Qdrant, user consent, and training capture are not used as a shortcut for catalog writes.
- [x] Count parsing supports leading intent words with “exactly” and product descriptions with “unique”.

## Deployment network requirement

- The Python AI service must be attached to `app`, `data`, and `host_api`: private service-to-service traffic stays on the internal networks, while model inference and the saved, allow-listed MCP endpoints require outbound connectivity.
- Do not publish an AI-service port. Keep the deployment's HTTPS and exact-host checks (`MCP_ALLOWED_HOSTS`), disabled redirects, MCP tool approvals, signed internal requests, and container hardening enabled.
- A Compose `internal: true` network has no external route. Attaching the AI service only to `app` and `data` therefore prevents MCP DNS resolution and external model requests; `host_api` supplies the required bridge route.

