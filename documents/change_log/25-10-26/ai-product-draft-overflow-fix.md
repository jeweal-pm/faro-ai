# AI product draft response handling — 25-10-26

- Jev selected several paid models that failed this task's verified constraints: `amazon/nova-micro-v1` produced short descriptions; `deepseek/deepseek-v4-flash-0731` exhausted output tokens; `cohere/command-r7b-12-2024` produced short names; `openai/gpt-oss-120b:batch` returned 404 on the interactive chat endpoint; and `openai/gpt-oss-20b` exhausted its output budget without returning content. No GIS product was created.
- AI service accepts bounded surplus output, normalizes common JSON array/key/field aliases, validates and keeps only the requested count, logs aggregate shape/count data without draft text, supplies actual price/token budgets to Jev, excludes observed incompatible models and batch-only endpoints from interactive product drafting, and accepts the tenant's 62 eligible paid model candidates. Batch size and estimate remain 20 products per credit (5 credits per 100).
- Updated ADR-0025 and the product-creation SPEC. Gateway build and AI-service syntax checks passed; API restarted and AI service hot-reloaded. Failed request credits were refunded. GIS product/PO/inventory records remain unchanged; retrying the 100-item batch through the frontend.
- Related: `documents/adr/0025-ai-assisted-mcp-product-creation.md`, `documents/spec/ai-assisted-mcp-product-creation.md`.

## Follow-up — 25-10-26

- Found two independent blockers during the requested frontend run: `ai-service` had no outbound route because it only joined `app` and `data` (`internal: true`), and the prompt counter did not parse the phrase “exactly 87 unique ring products”.
- Attached only `ai-service` to the existing `host_api` bridge; kept its private app/data networks, no published port, read-only root filesystem, dropped capabilities, internal request signing, HTTPS requirement, exact `MCP_ALLOWED_HOSTS` check, disabled redirects, and per-tool approvals. Docker Compose validation passed. Docker confirmed AI-service DNS for the saved ngrok host and `openrouter.ai`; HTTPS reached the MCP endpoint without following redirects. No image rebuild was needed for the network change.
- Fixed the product count parser to understand “add exactly N” and “N unique products”. The first frontend attempt reported 1 instead of 87 and was stopped before GIS bulk submission; no item was created by that attempt. Rebuilding Backoffice and re-running the 87-item request is pending.

## Completion and correction — 25-10-26

- Correction: the first stopped one-item run raced with the cancellation signal and GIS accepted a one-row job. That job (`6ade07a2715d1f8fab4b9993`) completed successfully. Extra product: `FAROAI-495209F5D00781B86DB1B4D5`, “The Kinetic Arch of Ethereal Fluidity and Sculptural Midnight Silhouettes (AI)”.
- Rebuilt Backoffice after fixing count parsing and adding a final cancellation check immediately before GIS bulk submission. The corrected frontend displayed `0 of 87`; GIS job `6ade09ef715d1f8fab4b9e40` completed with 87/87 succeeded.
- Read-only catalog verification found 87 new rows with 87 unique names, SKUs and Product IDs; names are 69–100 characters, descriptions 348–500 characters, and each description ends in `(AI)`. All 13 previous product IDs are present.
- The catalog has 101 active FAROAI test products (13 prior + 87 intended + 1 unintended). The GIS MCP exposes no product deletion tool, so the extra item was not silently removed.
- No PO preview or PO write was completed. Even after instruction to search the FAROAI SKU prefix and paginate, the procurement assistant asked for an exact product name/SKU. PO selection and preview need follow-up; no PO exists from this attempt.
- After the Backoffice rebuild, C: had approximately 3.7 GiB free. The cancellation guard is included in the current source and rebuilt image.
- The final Backoffice image (`24b18366b211`) is running; `http://127.0.0.1:3001/` returned HTTP 200. Removed the replaced Backoffice image (`5676b8ba45ea`) after confirming no container used it. C: has approximately 3.8 GiB free.

## PO bulk-selection follow-up — 25-10-26

- The existing procurement assistant repeatedly asked for an exact product name/SKU even after the user supplied the FAROAI prefix, 100-line target, and explicit exclusion. Added a server-owned paginated GIS search for this exact bulk-selector request: pages of 50, exact title exclusion, `FAROAI-` SKU check, unique product IDs, and fail-closed exact-count validation.
- The selected paid model receives live GIS product/master results and is required to call `preview_purchase_order` for this bulk case. The flow still stops at the preview confirmation control; no automatic PO create or GIS approval is allowed.
- Saved the two prior prompt rounds and the new prompt at `final_prompt/po/2026-10-25-round-01-initial-preview.md`, `...round-02-product-search-retry.md`, and `...round-03-bulk-faroai-preview.md`.
- Updated ADR-0026 and the natural-language procurement SPEC. Runtime verification of the new preview flow is pending.

## PO preview operation — 25-10-26

- Replaced the fragile model-authored 100-line tool call with a server-owned line set: GIS MCP search enumerates every matching FAROAI page, applies the exact exclusion, de-duplicates IDs, and verifies the requested count. Jev's selected paid model proposes ordered prices; any missing tail values are requested separately and surplus values are ignored. The server builds exactly one PO line per verified GIS ID.
- Added unique prefix matching for an abbreviated master label; Ham, Central Worl (matched uniquely to GIS location Central World), and PO were resolved from live GIS masters. Gateway now connects its lazy Redis client before saving the pending preview draft.
- Runtime verified a valid, read-only GIS preview with 100 distinct lines, quantity 100 per line (10,000 total units), transaction date 2026-10-25, delivery date 2026-11-08, supplier Ham, Central World location, PO voucher, and `(AI)` note. GIS reports `writes_database: false`; FaroAI did not call `create_purchase_order` and the UI now exposes the confirmation control.
- The preview's AI-proposed total is USD 7,662,000. The administrator must review and confirm it in the FaroAI UI before any PO is created; after creation, GIS will keep it pending approval.
- Saved prompt rounds 01–10 with each attempt's result under `final_prompt/po/`. Updated ADR-0026 and the procurement SPEC to describe server-owned GIS IDs, AI-only price proposals, unique master resolution, Redis draft persistence, and the confirmation gate.
- Rebuilt only `ai-service` and `api`; old versions of those images were removed. C: has approximately 3.6 GiB free. Services are healthy and the gateway has its data network attached.

## PO create attempt — 25-10-26

- The user confirmed the 100-line preview should be created in the test GIS database. FaroAI sent one `create_purchase_order` call through the saved GIS MCP connection.
- GIS MCP returned `created: false`: `Transaction numbers are only allowed on a replica set member or mongos`. No PO was created; no PO number or pending-approval record exists from this attempt. The create was not retried.
- A subsequent read-only check prompt unexpectedly produced another preview in FaroAI. It was not confirmed and no write was sent. Do not confirm it or create again until GIS resolves its MongoDB transaction configuration; all GIS requests and verification must remain through MCP.
- Updated prompt records 10 and 11 in `final_prompt/po/` with these outcomes. No GIS database or MongoDB infrastructure was accessed or modified directly.

## PO create retry — 25-10-26

- Retried from the FAROAI frontend using the user's instruction and authorization. GIS MCP returned a valid preview for the intended 100 products (100 units each; 10,000 total), supplier Ham, Central World, voucher PO, dates 2026-10-25 / 2026-11-08, with AI-proposed total 5,961,000 (currency not reported by preview).
- Sent one `create_purchase_order` call through MCP. MCP returned `created: false` with `Transaction numbers are only allowed on a replica set member or mongos`. No PO was created and no number was returned. Stopped without retrying.
- The issue is on the GIS/MongoDB transaction path. No direct GIS database access or infrastructure change was made. Saved the prompt and exact result at `final_prompt/po/2026-10-25-round-12-create-first-po.md` for the GIS team.

## Retry after GIS team fix — 25-10-26

- Retried the same 100-product PO via the FAROAI frontend. The saved MCP endpoint returned HTTP `502 Bad Gateway` during `tools/list`, before the GIS product search, preview, or PO create call.
- FAROAI reported that no PO or receipt was created. Stopped without retrying. This attempt did not reach the PO transaction path, so it does not verify whether the prior MongoDB transaction issue is fixed.
- Saved the prompt and error at `final_prompt/po/2026-10-25-round-13-retry-after-gis-fix.md`. All GIS interaction remained through MCP; no direct GIS database access was used.
