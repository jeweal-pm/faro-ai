# FaroAI Platform Base Skills: Development Plan

29 October 2026 | BD and Product Owner cross-review | English edition

**Conclusion:** The planning deliverable covers the owner's requested scope. Implementation readiness, rollout and financial returns remain `validate_first`. This plan is ready for technical backlog preparation and estimation; the runtime skills have not been implemented or deployed.

[Thai edition](2026-10-29-platform-base-skills.md)

## 1. What users will receive

FaroAI will maintain and update a shared set of system Base Skills. Every existing and new tenant in a deployment inherits the published release automatically, without uploading packages or configuring each skill separately. Users describe their task in ordinary language, and FaroAI selects the relevant workflow and presents the appropriate result.

The full requested scope includes **data analysis, PDF, Excel, Word, PowerPoint and Jewelry/GIS workflows**. Data access and business operations remain subject to the tenant's existing permissions and policies.

**FaroAI owns and implements the Skill Runtime and document workers.** MCP servers expose authorized tools and business data; they do not host or control FaroAI's skill orchestration.

| Example prompt | Planned execution | Result |
|---|---|---|
| Find rings that are not round-cut. | Jewelry search with verified GIS constraints | Product cards with confirmed or uncertain attributes identified |
| Show Ham's pending POs and export an Excel summary. | PO read, deterministic summary, XLSX | An authorized table and Excel file |
| Create a PDF catalog from these ring results. | Verified search results and a PDF template | A catalog using verified price and stock facts where available |
| Summarize sales in this file and make a PowerPoint. | Authorized file data, analysis, PPTX | Calculated figures and slides |
| Create a Word jewelry-care guide from approved documents. | Tenant knowledge, DOCX | A report with source references |
| Add 10 ring products. | Existing creative catalog workflow | Actual GIS bulk job and results under the direct-create policy |
| Create a PO for these products. | Live masters/products, PO preview | Review and confirmation before creating a PO pending GIS approval |

Composite examples describe a later delivery phase. They must not be advertised as available until their executors are implemented and verified.

## 2. Rationale and target users

The proposed payer is the jewelry tenant's business owner or operations owner. Users include sales, purchasing, merchandising and knowledge staff, subject to their actual permissions. Shoppers benefit from discovery. FaroAI platform operators maintain the base catalog and releases.

The value hypotheses are faster task completion, less repeated prompting and rework, and less workflow maintenance per tenant. Baselines, willingness to pay and ROI are not established. This plan does not invent revenue forecasts or selling prices.

The reviewed frontend currently separates search, product creation and procurement through intent checks. Backend prompts, model calls and tool loops already exist for those tasks. The proposal therefore uses adapters around existing workflows before considering broader rewrites.

## 3. Execution overview

[Open the English executive and sequence diagrams](../../diagram/base-skills/en/README.md)

```text
User describes a task
  -> Validate tenant, actor and prerequisites
  -> Resolve the central Base Skill catalog
  -> Jev selects an allowed skill and model
  -> Load only the selected skill instructions
  -> A registered executor calls MCP, calculates or creates files
  -> Return an answer, products, table, preview or download
```

The shared catalog contains workflow instructions and templates. Tenant data remains in authorized tenant sources. Skills do not grant additional MCP/model rights or automatically contribute tenant data to shared skills or training.

## 4. Delivery sequence and completion evidence

| Phase | Deliverables | Gate before proceeding |
|---|---|---|
| 0: Contract and inventory | Draft ADR/SPEC, an 11-skill catalog, authorization/cost/confirmation map, routing/evaluation cases, dependency inventory | Engineering reconciles effective code/ADR policy, isolates test-only defaults and defines baselines without live test writes |
| 1: Core and read-only pilot | Shared registry, exact versions/digests, bounded Jev selection, selective loading, typed outputs, search/PO-read/knowledge adapters | New and existing tenants inherit the release; existing permissions/results are preserved; Thai/English, no-skill and ambiguous routing cases pass |
| 2A: Existing writes | Catalog-create, PO-create and inventory-receive adapters around existing flows | Direct catalog creation and PO/receipt confirmation remain distinct; replay, changed previews, timeouts and unknown job outcomes do not duplicate writes |
| 2B: Analysis and files | Isolated worker, private artifact/job/download lifecycle, analysis and PDF/XLSX/DOCX/PPTX adapters | Each enabled format produces real, openable, accurate files; rendering and access-isolation checks pass |
| 3: Composition and global rollout | Reviewed data-to-analysis-to-document plans, usage/cost reporting, staged publishing and rollback | Individual executors pass first; plans are bounded without recursive tool/skill execution; quality/cost are compared with the baseline before broad release |

Phases 2A and 2B are independent workstreams after the core gates. Their order depends on Engineering capacity and pilot needs. All four document formats remain in scope. Adapter sequencing depends on quality/resource experiments; no completion date or duration is asserted before technical estimation.

## 5. Outcomes and measurement

| Dimension | Evaluation | Baseline/target status |
|---|---|---|
| User efficiency | Task completion, time to usable output, rework/retries/support | Unknown; collect from current workflows and pilot tasks |
| Routing | Correct skill/no-skill/clarification, false write routing, Thai/English cases | Human-labeled evaluation set; propose numeric targets after establishing a baseline |
| Artifacts | Openable files, correct content/formulas/figures, Thai/English layout | Per-adapter acceptance; do not advertise readiness before passing |
| Authorization | Tenant/artifact isolation, write policy, replay and revocation | Invariant: no bypass or leakage in the acceptance suite |
| Cost | Jev, generation, worker/rendering, storage, retries and review per completed task | Distinguish observed, estimated and unknown costs; credits are not USD |
| Business value | Less work/rework/support per tenant and willingness to pay where measurable | BD gathers evidence; skill counts/downloads are not ROI |

One skill is not assumed to equal one credit or one model call. Reuse may reduce maintenance, while metadata and artifact processing add costs. These effects require measurement.

## 6. Scope and risks

- Begin with centrally reviewed FAROAI skills. Tenant authoring, overrides, marketplaces and runtime skill downloads are outside the MVP.
- Keep runtime skills separate from `.codex/skills`. Do not execute model-generated shell/Python or automatically copy proprietary Claude scripts.
- Preserve direct product creation and PO/receipt preview/confirmation. Reuse valid trusted credentials without introducing a new sign-in step solely for skills.
- A bad global release affects every tenant. Pin versions, use canary deployments, provide emergency disable and rollback, and audit release changes.
- Documents require real workers, fonts, renderers and private storage. Assess CPU/RAM/image size before building; separate artifact work from embedding workloads.
- Files and MCP content are untrusted input. Validate them and do not execute macros, embedded code or external links. External publishing/sending is not a side effect of file creation.
- Qdrant retains its approved-knowledge/product-vector role. Base instructions and generated files do not become shared learning automatically.
- The current bulk procurement branch contains Ham/Central Worl/test-note assumptions. Parameterize them before publishing that executor for all tenants.

## 7. Organizational responsibility

| Owner | Next responsibility | Completion evidence |
|---|---|---|
| BD | Validate task frequency, payer, pain, benefit and unit economics across the requested categories | Evidence-backed opportunity/baseline; no invented ROI |
| Product Owner | User flows, catalog, priority, functional acceptance and evaluation cases | Clear output/read/write/clarification acceptance and baseline task study |
| Engineering | Technical sizing; registry/router/executors/workers/storage/authorization; implementation and release | Estimates, reviewed contracts, conformance/quality/resource checks |
| Sponsor | Rollout funding and binding pricing/business commitments | Decisions based on measured quality and cost |

BD and PO cross-reviewed the scope and sequencing. Both accepted the shared catalog, complete requested categories and independent 2A/2B workstreams because evidence does not require one to finish first. Demand, cost and sizing are rollout validation work, not reasons to leave the requested plan incomplete. No material scope disagreement remains.

## 8. Sources and implementation status

- [Proposed ADR-0036, English edition](../../adr/0036-platform-base-skills.en.md) and [Draft SPEC, English edition](../../spec/platform-base-skills.en.md)
- ADR-0003/0009: tenant context and approved MCP; ADR-0016/0019: model policy and bounded Jev; ADR-0012: learning/consent; ADR-0025/0026: write behavior; ADR-0035: BD/PO ownership
- [Agent Skills specification](https://agentskills.io/specification) and [client integration guide](https://agentskills.io/client-implementation/adding-skills-support): package format and selective loading
- [Claude Agent Skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview): a product reference for system-provided document skills; the FaroAI runtime design is a separate proposal

This planning review inspected documents and relevant source entrypoints. It did not test a live runtime, create GIS records, install libraries, build containers or change a deployment release.
