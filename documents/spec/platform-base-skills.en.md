# SPEC: FaroAI Platform Base Skills

- **Status:** Accepted target contract; implementation in progress. Six of eleven skills are registered as ready: jewelry search, approved knowledge answers, PO search/create, catalog draft creation through the existing confirmed GIS workflow, and inventory receipt preparation. The test-specific PO shortcut has been disabled and PO creation uses the generic master lookup and preview/confirmation path. Data analysis and artifact downloads are not released.
- **Date:** 2026-10-29
- **Edition:** English; [Thai edition](platform-base-skills.md)
- **Decision:** [ADR-0036](../adr/0036-platform-base-skills.en.md)
- **Plan:** [BD/PO development plan](../product/discovery/2026-10-29-platform-base-skills.en.md)

Implementation clarification (2026-10-30): a PO lookup requires its approved read tools; creating a PO or receiving inventory separately requires the relevant preview and mutation tools, rechecked on confirmation. If Jev returns no skill, a verified existing read route may select its matching read-only skill; invalid or conflicting explicit choices are rejected. A retrieved knowledge chunk is not itself a verified answer, and no-model fallback must not present raw unrelated text as an answer.

Implementation status (2026-10-30): six of eleven catalog entries are registered ready. `catalog-create` covers draft generation in the existing confirmed product workflow; `po-create` uses generic GIS master lookup and preview/confirmation; and `inventory-receive` supplies constraints to the existing preview executor. They remain under existing permissions and confirmation requirements; created POs remain pending GIS approval. The test-specific PO shortcut is disabled. Data analysis and PDF/XLSX/DOCX/PPTX downloads are not enabled.

## 1. Product contract

Every new and existing tenant automatically inherits the Base Skill release published for its deployment. Tenants do not create, install or enable a separate copy of each base skill. Users describe tasks normally; FaroAI selects the workflow and returns an answer, table, products, document or operation preview.

Existing trusted context remains authoritative: tenant service credentials, actor scopes, approved MCP tools, provider/model policies and credits. Missing prerequisites produce an actionable explanation. Base Skill availability does not alter these policies.

The catalog covers general document/data tasks and Jewelry/GIS. Tenants without GIS can use general skills when the required input, worker and model are available. FaroAI owns the runtime and workers; MCP servers provide scoped tools and data.

## 2. Proposed Base Skill catalog

| ID | Task | Required executor/data | Output |
|---|---|---|---|
| `base.jewelry-search` | Find/recommend products and apply constraints such as not round-cut | Search adapter, approved GIS tool or indexed catalog under the existing flow | Verified cards and uncertainty/source metadata |
| `base.knowledge-answer` | Answer from approved tenant documents | Approved tenant RAG | Answer and source references |
| `base.po-search` | Find POs, read details and summarize status | Approved GIS read tools | Structured PO cards/table |
| `base.catalog-create` | Generate creative product concepts from a prompt | Scoped existing catalog executor and verified masters | GIS bulk job/results under the existing direct flow |
| `base.po-create` | Prepare and create a PO | Existing procurement executor | Preview/confirmation, then pending GIS approval |
| `base.inventory-receive` | Receive inventory against a GIS-approved PO | Approved PO/receipt tools and permitted actor | Receipt preview/confirmation and actual result |
| `base.data-analysis` | Aggregate, compare, group, filter and analyze authorized data | Typed table/CSV/XLSX adapters and fixed operations | Verified calculations, tables/chart specifications, optional model narrative |
| `base.pdf` | Summarize/create PDFs from verified data or text | Private artifact worker, PDF adapter, fonts and rendering checks | Downloadable PDF |
| `base.xlsx` | Create spreadsheets, summaries and template-based charts | Spreadsheet adapter and calculation validation | Downloadable XLSX |
| `base.docx` | Create Word reports/proposals | Document adapter and template/layout validation | Downloadable DOCX |
| `base.pptx` | Create presentations from content/analysis | Presentation adapter and slide/render validation | Downloadable PPTX |

Each advertised capability needs a working executor. Initial document delivery focuses on creating/exporting from structured data and approved text. Reading, editing or converting uploaded files is enabled one input format at a time after conformance checks, including supported PDF/CSV/XLSX input. A skill name alone does not establish universal file compatibility.

## 3. Separate responsibilities

| Component | Responsibility |
|---|---|
| Base Skill | Reusable workflow instructions, step-selection guidance and output conventions loaded when relevant |
| Jev | Select a skill and eligible generation model from server-supplied choices |
| Generation model | Interpret the request and draft content using selected instructions and authorized data |
| MCP | Expose approved GIS/GMS/ERP data and operations |
| Qdrant | Retrieve tenant-approved knowledge/product candidates under existing ADRs |
| Executor | Execute typed operations and enforce the actual operation policy |
| Subagent | A separate agent/context for delegated work; outside this MVP |
| `.codex/skills` | Developer-agent instructions in the workspace; not customer-runtime instructions |

Tenant isolation, secrets, confirmation and budgets must be enforced in the gateway/executor even if a model or instruction body fails to follow the written guidance.

## 4. Package and global release

Planned source layout:

```text
runtime-skills/
  base/
    purchase-order-search/
      SKILL.md
      faroai.json
      references/
      assets/
  releases/
    release-manifest.json
```

Use standard `name`/`description` frontmatter and instruction body in `SKILL.md`. Stable IDs and versions belong in metadata or the manifest. The containing skill directory matches `name`. This is a design example, not an implemented package:

```yaml
---
name: purchase-order-search
description: Find and explain purchase orders in Thai or English using verified tenant GIS data.
metadata:
  faroai.id: base.po-search
  faroai.version: "1.0.0"
---
```

The platform-reviewed `faroai.json` declares a registered executor ID/version, input/output schemas, required scopes, MCP capability group, model requirements, write class/confirmation contract, limits and artifact policy. It contains no credentials or tenant records.

Validate package size/schema/frontmatter, ID/version collisions, digests and resource paths inside the bundle. Reject symlink/path traversal. Experimental `allowed-tools` frontmatter never grants API rights.

Git contains source packages. Deployment produces immutable bundles recording skill versions, content hashes and executor compatibility. PostgreSQL holds active release selection, publish/revoke audit and deployed versions. Shared content is not copied into tenant rows.

All tenants in a deployment resolve the same published release. Use staging/canary deployments or explicit expiring release policies for canaries, without turning base availability into tenant-by-tenant grants. After global publishing, new requests inherit the release automatically.

Self-hosted deployments use their bundled release without runtime package downloads. Development-only reload creates a new digest and explicitly invalidates outdated session versions. Production loads read-only published packages.

## 5. Routing and selective loading

[English executive and sequence diagrams](../diagram/base-skills/en/README.md) illustrate PO read, analysis and XLSX as a target composition flow, separate from current implementation status.

```text
Prompt and optional authorized input
  -> Hono: trusted tenant/actor, policy and budget context
  -> Resolve the published Base Skill catalog
  -> Capability/permission shortlist
  -> Bounded Jev skill choice and compatible model choice
  -> Validate IDs/version; load selected instructions/references
  -> Registered executor or existing workflow adapter
  -> Schema-validated result or artifact job
  -> Frontend cards, table, answer, confirmation or download
```

- Extend the existing Jev adapter with typed skill choices, `none` and `needs_clarification`. Validate choices; do not accept endpoints, tool arguments or credentials from decision output.
- Filter model candidates for the selected task's capabilities, such as tool calling, structured output or vision, and retain existing price caps. Recheck skill/model compatibility server-side. Model selection does not create executor capabilities.
- Reuse existing necessary decision calls for skill/model selection where conformance permits. Do not introduce an unconditional additional paid classifier for every prompt.
- Local filters, layout toggles and authorized structured UI exports can use deterministic adapters without a model recalculating values.
- Start with one primary skill per request. Later composition accepts bounded, reviewed dependency/plan templates; skills do not recursively invoke skills, agents or code without control.
- If Jev is unavailable, use only already-supported deterministic routes with authorization checks. Clarify ambiguous requests; do not guess write intent.
- A catalog may describe a skill whose executor is unavailable. The router must not execute it without prerequisites. An explicit request for it receives a specific blocker.
- Immutable package bytes/metadata may be cached by release digest. This addition does not cache user prompts or Jev decisions.

## 6. Gateway, frontend and operation policy

Introduce a unified server orchestration contract for BFF/trusted clients and typed responses. Resolve tenant identity from server authentication. Public discovery credentials must not reach privileged workflows without the required scopes.

The frontend submits one prompt and renders by result kind. A browser-selected or user-typed skill name is a request, not authority. Users need not know skill/tool/model names. Valid existing server-held tenant credentials do not gain a new sign-in requirement solely for skills.

| Operation | Required behavior |
|---|---|
| Search/read/analysis | No GIS mutation; disclose data source, time and calculation coverage |
| Catalog create | Retain explicit authorized direct creation, inactive defaults, identity/master checks, bulk outcomes and cancellation; no blanket second confirmation |
| PO create | Preview, explicit confirmation, current re-preview and single-use mutation; remains pending GIS approval |
| Inventory receipt | Verify GIS approval of the PO first, then separate receipt preview/confirmation; never approve a PO through AI |
| Requested artifact | Create a private downloadable output under current rights; no automatic external sending/publishing |

Bind preview, skill/executor versions and payload digest to confirmation drafts. Changed data, policies or revocation require current validation. Updating a skill must not silently change a confirmed operation.

## 7. Analysis and documents

- Compute from structured data using fixed operations. Models may interpret and explain; executors verify figures.
- Distinguish totals over currently loaded rows from a fully fetched query. Use approved bounded MCP pagination or disclose coverage. Do not silently truncate or fetch the entire catalog for every prompt.
- Obtain business data through authorized tenant sources/MCP, not direct GIS SQL/backend access.
- Validate input type/signature/size and row/cell/page/slide limits. Do not execute uploaded macros, embedded code or external formula links.
- Use reviewed output templates and validate numeric types/formula values, safe text export, missing facts, filenames and MIME. Raw model HTML/paths/URLs are not automatically trusted artifacts.
- Check Thai/English fonts, pagination and overflow in PDF/DOCX/PPTX. Check workbook readability, formulas/totals and numeric formatting in XLSX.
- Prioritize creating new files from authorized data before complex editing/conversion features.

## 8. Workers, jobs, artifacts and resource limits

The registry/instruction phase primarily adds text assets and adapters. Reading `SKILL.md` does not require a new model installation or container.

The artifact phase proposes a worker separate from AI/embedding services to isolate dependencies, CPU/RAM and rebuild scope. Execute fixed operations with build-pinned dependencies, a non-root user, constrained temporary storage/time/memory and network disabled by default. Do not mount the Docker socket/host workspace, expose a model-driven shell or install packages during a request.

Separate worker profiles and share images/layers where useful. Check disk/image size before builds. Do not require heavyweight browsers/office suites in every deployment; choose adapters/renderers during implementation based on quality/resource experiments.

Record durable jobs in PostgreSQL before returning accepted. Redis supplies queue/lease coordination only. Workers must be idempotent. Unknown GIS mutation outcomes must not trigger automatic write retries. Artifact retries reuse job identity and verifiable output digests.

Artifacts use a private storage adapter, such as a private volume or object store appropriate to the deployment. They are not placed in `backoffice/public` or Qdrant. Generate IDs/paths server-side; enforce tenant and actor access for every preview/download; support expiry/deletion. The proposed default is 24 hours, configurable by the platform and requiring confirmation before release. Do not inherit training-candidate retention by accident.

Requests, input files and outputs are not automatically promoted into shared skills, RAG or training. Existing ADR-0012 consent/review rules govern any improvement use.

## 9. Proposed persistence and API contracts

| Record | Scope and key fields |
|---|---|
| Platform skill release | Global release ID, reviewed bundle digest, compatible executor build, active/revoked status, publisher/audit |
| Skill run/steps | Mandatory tenant, trusted actor, request/idempotency identity, immutable release/skill/executor references, step status, usage/error codes |
| Skill artifact | Mandatory tenant/run/owner scope, private object reference, content hash, MIME, size, creation/expiry/deletion state |

Run payloads are not raw conversation archives. Retain only what jobs/resumption require under the retention policy. Do not log secrets, raw MCP payloads or file contents.

Proposed endpoints require security and API-convention review before implementation:

- `GET /admin/v1/skills/base`: published catalog/release and executor readiness
- `GET /admin/v1/tenants/:tenantId/skills/effective`: authorized tenant readiness, not a grant list
- `POST /v1/assist`: unified orchestration preserving trusted authentication/scopes
- `GET /v1/skill-runs/:id`, `POST /v1/skill-runs/:id/cancel`: scoped job status/cancellation
- `GET /v1/artifacts/:id/download`: authorized streaming without exposing filesystem paths

Reuse/adapt the existing typed business-confirmation contract rather than adding mutation endpoints that bypass the gateway.

## 10. Release, observability and cost

- Pin release, skill, content, executor and policy versions to a run. Recheck live policy, credential and tool revocation before business writes.
- Publish/rollback only reviewed deployed bundles. MVP has no arbitrary-code upload through administration.
- Emergency disable stops new work and revalidates queued/confirmation steps. A mutation already submitted retains actual/unknown source status; do not falsely report cancellation.
- Compare routing through fixtures or read-only pilots. Shadow execution must not duplicate writes or incur untracked extra model cost.
- Track Jev, generation, worker/rendering, storage and retry costs with estimated/observed/unknown labels. Provider caps do not cover all artifact processing costs.
- Define which adapter reserves/settles credits to avoid double charging during orchestration. Migration does not change credit units/prices.

## 11. Acceptance and regression gates

1. New/existing tenants inherit the published release without skill copies or individual grants. Self-hosted instances accurately report their deployed release.
2. Unknown, unpublished, revoked or executor-incompatible skill versions do not execute. No-skill/clarification are valid outcomes.
3. Load instructions/resources only for selected skills and explain missing models/tools/scopes/input/workers.
4. Prompts, uploads and MCP content cannot change tenant, endpoints, scopes, policies or confirmation. Jobs/artifacts cannot leak between tenants.
5. Existing cards, structured POs, local filters, direct catalog creation and confirmed PO/receipt flows pass regression, including replay, changed previews, cancellation and unavailable sources.
6. Replace test-specific Ham/Central Worl/voucher/note assumptions with user input and verified tenant GIS resolution before globally publishing the executor.
7. Support Thai/English, short, ambiguous and incomplete requests. Do not route reads as writes or require tool IDs from users.
8. Every advertised format produces real, openable files with correct content/calculations and rendered visual QA. Metadata creation alone is not success.
9. Report timeouts, partial and unknown outcomes honestly. Restarts/retries must not duplicate credits or GIS writes. Failed artifacts do not receive misleading successful download links.
10. Collect routing/task success, rework, latency, quality and per-completed-task cost baselines before setting numeric rollout targets. Acceptance safety cases must have no cross-tenant access or confirmation bypass.

## 12. Evidence and review scope

Source entrypoints reviewed on 29 October 2026: `backoffice/app/discovery-page.tsx` (`search` and intent checks), `backoffice/app/actions.ts` (`gisPromptRequest`), `gateway/src/admin.ts` (service-credential exception/procurement routes), `ai-service/faroai/routing.py` (Jev/tool allow-lists), `ai-service/faroai/app.py` (prompt/tool loops and bulk branch), and relevant worker/Dockerfile code. This was not runtime verification or an end-to-end implementation test.

The [Agent Skills specification](https://agentskills.io/specification) and [client integration guide](https://agentskills.io/client-implementation/adding-skills-support) support package/selective-loading concepts. The APIs, authorization, isolation and release policies above are FaroAI proposals, not guarantees provided by that standard.
