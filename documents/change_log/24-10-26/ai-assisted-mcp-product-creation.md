# AI-assisted MCP product creation — 24-10-26

- Added a Backoffice product-creation workflow and gateway routes for prompt drafts, GIS master lookup, preview, and confirmed creation; Jev selects only among eligible paid models.
- Added fixed-tool GIS MCP orchestration, revalidated tenant approvals, server-side preview before each write, sequential batch processing, credit reservation, and audit events without raw prompts or MCP payloads.
- Updated the product prompt, ADR-0025, and SPEC. Backoffice/gateway typechecks and Python AST syntax check pass. Production compiler and TypeScript phases pass with webpack; Next blocks completion at its security gate. Default Turbopack also encounters existing pnpm symlink resolution errors.
- References: `documents/adr/0025-ai-assisted-mcp-product-creation.md`, `documents/spec/ai-assisted-mcp-product-creation.md`, `example-prompt/product-prompt.md`.

## Container update

- Upgraded Backoffice Next.js from 16.4.0 to 16.4.1 to clear the framework security build gate; updated package manifest and lockfile. See [Next.js security update](https://nextjs.org/blog/nextjs-security-update-october-14-2026).
- Built and deployed Backoffice image `sha256:229cfb77a4390b9ed9215a9e8d9abd5d794d36adec664aefd1b4f4a4e53a2033`; removed the previous Backoffice image after confirming no container used it.
- Restarted API with the latest gateway build output. AI service uses the local source bind mount with reload; verified product draft and MCP tool routes are registered.
- Verified `/admin/products` and API `/health/ready` both return HTTP 200. Backoffice and gateway typechecks passed; production container build succeeded.
- Pruned unused Docker build cache (about 3.73 GB reclaimed). Final Docker build cache is 10.14 MB; C: has about 9.18 GB free. Preserved all volumes and application data.
- No product was written to GIS during this container update.

## Frontend prompt entry-point correction

- Removed the dedicated `/admin/products` page and platform navigation item. Product-creation requests entered in the main prompt now open the GIS draft workflow; ordinary shopping prompts continue to discovery.
- Kept all product operations behind the platform-admin session/CSRF protected API. Single-tenant installs use the sole active tenant; multi-tenant installs prompt for a tenant. GIS preview and explicit create confirmation remain required.
- Updated ADR-0025 and the product-creation SPEC. Backoffice typecheck and webpack production build passed; Docker image `sha256:09341d9d19c974789a388f5ff06083bc116be9464d09b8c177ac50829858e4e3` deployed.
- Verified frontend `/` returns HTTP 200, `/admin/products` returns 404, and an unauthenticated admin API request returns 401. Removed prior Backoffice image and reclaimed about 1.38 GB Docker build cache; C: now has about 8.95 GB free. Volumes were preserved.

## Product draft model response failure

- Diagnosed the draft error from provider logs: Jev and the OpenRouter chat-completion request both returned HTTP 200, but FaroAI rejected the model response against the required structured draft shape. The provider currently has 29 paid candidates under its saved caps; the earlier `no_eligible_model` message no longer applies.
- OpenRouter draft calls now request JSON-object output. The parser reads the first valid JSON object robustly, and invalid count/shape logs only safe metadata (model ID, requested/returned count, finish reason), never prompt or response contents.
- Gateway now returns a safe, specific error for invalid model output or provider failure. Updated the product-creation SPEC to document structured-output handling.
- Python AST check, gateway typecheck/build passed; AI service hot-reloaded and API restarted. No product was created in GIS during diagnosis.

## Structured draft output budget

- Root cause confirmed in OpenRouter response metadata: Jev selected `amazon/nova-micro-v1`, and the completion ended with `finish_reason=length` because the gateway passed only 600 output tokens for a ten-item JSON response.
- Draft generation now requests a batch-scaled output budget (2,000–4,000 tokens), and model eligibility estimates include that effective budget so configured maximum request spending remains enforced. AI instructions constrain field length and prefer compact JSON; invalid output remains a hard failure.
- Verified the exact `add 10 rings products` prompt through the frontend at `http://127.0.0.1:3001/`: Jev selected a paid OpenRouter model, OpenRouter returned valid structured output, GIS MCP master data was fetched, and the UI displayed 10 draft concepts. No product was previewed or created. Draft fields still require human review before any GIS write.
- Gateway `tsc --noEmit` and production compile passed using the local TypeScript CLI; AI-service Python AST check passed; API readiness returned HTTP 200. AI service reloaded from its dev bind mount; API was restarted using the existing dist mount, with no image build.

## Creative multi-batch product generation

- Raised natural-language product requests to 1,000 drafts. The frontend now sends independent groups of up to 20, includes only the previous 60 names for duplicate avoidance, rotates among fixed design directions, shows generation/preview/create progress, and paginates review at 20 products per page.
- FAROAI now assigns random `FAROAI-` SKU and Product ID values outside the model response and automatically matches generated product-type hints to exact GIS item masters. Unmatched masters remain visible for operator correction; no product is written until GIS preview and final confirmation.
- One tenant credit is used per group; large requests show their estimated credit use before generation. A later group failure preserves completed drafts. GIS preview and create continue sequentially using existing MCP tools; no GIS MCP change is required for draft generation.
- Updated ADR-0025 and the product-creation SPEC. Gateway and Backoffice typechecks pass, gateway production compile passes, and AI-service Python AST check passes.
- Verified `add 21 rings products` in the frontend: two independent model calls (20 + 1) completed, progress was shown, pagination reported 21 drafts over two pages, and generated SKU/Product IDs were visible. The tenant consumed two AI credits.
- Verified `add 1 ring product` in the frontend: one creative draft was returned with generated SKU and Product ID, and GIS item master was auto-matched to `Ring · R`. Logs confirm Jev decision and OpenRouter completion calls plus GIS MCP master lookup. No GIS preview or product creation was performed.
- Verified `Cancel` returns to the main prompt before GIS preview/create.
- Review remains required: AI-generated descriptions/tags can contain creative material or gemstone suggestions not stated by the operator. These are proposals, not verified product facts; unsupported claims must be edited or removed before preview/create.

## Product copy length and creativity

- Updated the AI generation contract so product names are 50–100 characters and descriptions are 300–500 characters, with varied concepts, visual language and writing patterns rather than short generic copy.
- Added strict AI-service validation, matching limits in the editable Backoffice form, and gateway-side length checks before GIS preview/create. Increased the request output budget to a bounded 7,000 tokens and kept it included in model cost eligibility.
- Updated ADR-0025 and the product-creation SPEC. Gateway compile, Backoffice typecheck, and AI-service syntax validation passed; API and AI service were restarted, and local frontend/API readiness returned HTTP 200. The new length targets were not manually exercised with a paid model call.
