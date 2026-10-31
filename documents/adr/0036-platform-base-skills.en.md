# ADR-0036: Platform-owned Base Skills inherited by all tenants

- **Status:** Accepted for phased implementation; read-only runtime in progress
- **Date:** 2026-10-29
- **Edition:** English; [original edition](0036-platform-base-skills.md)
- **Owners:** FaroAI platform engineering; Product Owner owns functional scope
- **User scope:** Data analysis, PDF/XLSX/DOCX/PPTX, Jewelry/GIS workflows; every tenant receives the system base catalog
- **Related:** ADR-0003, 0004, 0009, 0012, 0016, 0019, both workflow decisions 0025/0026, and 0035

## Context

FaroAI already has separate discovery, product-creation, procurement and approved-knowledge paths. Frontend intent checks and service-specific prompts dispatch these workflows. There is no shared runtime skill registry or document-artifact execution contract in the entrypoints reviewed for this plan.

The owner wants system-provided Base Skills, available to all tenants without uploading or enabling one copy per tenant. The requested catalog covers both general documents/data analysis and Jewelry/GIS. The developer-facing `.codex/skills` folder serves a different consumer and must not be loaded into customer requests.

## Proposed decision

1. Publish a centrally maintained, versioned Base Skill release. All existing and new tenants in a deployment inherit that published release automatically. Store shared instruction content once; no per-tenant installation/grant/seed rows. Self-hosted deployments receive the release with their deployment update and can run bundled skills offline when their executors permit it.
2. Keep runtime sources separate from `.codex/skills`. The first implementation packages `ai-service/faroai/base_skills/<name>/SKILL.md` and `release.json` in the existing AI-service build context. Use Agent Skills-compatible frontmatter/body and reviewed references/assets. A FaroAI manifest supplies stable IDs, versions, digests, registered executors and capability status; further policy fields remain phased work.
3. Load skill metadata first and the selected instructions/resources on demand. Extend the existing typed Jev routing adapter with bounded skill choices and `none`/clarification. Reuse the routing call where feasible; do not add an unconditional independent LLM classifier. Skill choice and model choice have separate validation even if carried in one compatible decision request.
4. The gateway resolves trusted tenant/actor context and applies current permissions, provider caps, consent and budgets. The executor checks the current MCP tool approval/schema before calls. A shared skill never grants data access, new API scopes, an endpoint, a model exception or write authority. The experimental standard `allowed-tools` field is not the FaroAI authorization source.
5. Use server-registered executors for existing workflows and document/data operations. Instruction prose cannot become an arbitrary shell command, Python program, SQL statement, file path, URL, tool name or agent-spawn request. MVP accepts only platform-reviewed packages; tenant upload, overrides and marketplaces are later scope.
6. Preserve operation-specific behavior. Explicit authorized catalog creation retains its direct workflow. PO/receipt writes retain preview, explicit confirmation, re-preview and single-use mutation. FaroAI never approves a GIS PO. Existing scoped server-held tenant credentials remain supported; skill selection does not introduce a new login requirement.
7. General analysis and file skills use isolated CPU workers with fixed operations and private tenant-scoped artifacts. Ship data-analysis plus PDF, XLSX, DOCX and PPTX adapters in phases; a package is advertised ready only after its executor and quality checks work. Creating a requested downloadable document does not add a blanket business-write confirmation. External sending/publishing remains a separate authorized action.
8. Pin skill release, content digest, executor and policy version to a run. New requests resolve the current published release; in-flight runs retain their code/content version while rechecking live authorization and emergency revocation. Version changes never silently alter an already previewed business write.
9. PostgreSQL holds platform release metadata and tenant-scoped run/artifact metadata; Redis only coordinates jobs. Skill content is a deployment artifact, not Qdrant knowledge. Customer files, MCP results and skill outputs do not enter shared skills, RAG or training automatically.
10. Track routing, generation, executor/render, storage and retry cost per completed task. Reuse existing workflow credit settlement without double charging through the orchestration layer. One skill is not defined as one credit or one model call; no new prices are approved by this document.

## Delivery and release gates

Implementation clarification (2026-10-30): read-only PO access must not depend on approving create or receipt tools; write previews and confirmations independently recheck the relevant mutation capability. If Jev supplies no skill choice, FaroAI may load the matching reviewed read skill for an already-authorized read route; conflicting or invalid choices remain rejected. Retrieved vector matches are not themselves verified answers.

Status on 2026-10-30: 5/11 skills are ready. Catalog drafting and inventory-receipt preparation reuse existing executors without adding GIS permissions. `po-create` remains planned because a bulk shortcut still directly assumes test supplier, location and voucher values.

Start with contract/current-flow inventory, then registry and read-only adapters. After those gates, existing write adapters and general artifact workers can be developed as independent workstreams. Add bounded multi-skill composition after individual executors pass. Keep the current paths available during the migration; never shadow-execute a write or duplicate a paid request unnoticed.

Before making existing procurement logic a global base executor, remove or parameterize test-specific branches such as supplier `Ham`, location `Central Worl`, fixed voucher assumptions and test notes. Read user values and verified tenant GIS records; do not distribute test business values as shared defaults.

## Consequences

- FAROAI can improve one reviewed base workflow for every tenant without duplicating instruction content.
- A bad global version has a large impact; canary deployment, immutable versions, rollback and emergency disable are required.
- Metadata/instructions add input tokens; reuse may improve consistency but cost/quality savings must be measured.
- File generation requires actual executors, private storage, rendering and resource limits in addition to Markdown.
- Model/provider portability needs an adapter contract and conformance checks; it is not guaranteed for every local model.
- Tenant customization, autonomous subagent teams, arbitrary code execution, new billing and automatic learning remain outside this proposal.

## Alternatives considered

- A single large system prompt: loses selective loading/versioned workflow contracts and sends unrelated instructions on every request.
- Copy skills into every tenant: creates drift and contradicts default system inheritance.
- Load Codex development skills: mixes developer permissions/tools with customer runtime behavior.
- Use a provider-specific skill API as the platform contract: would tie execution to that provider's runtime; FaroAI needs to retain its existing Jev/provider/MCP boundaries.

## References

- [Executive overview and sequence diagrams](../diagram/base-skills/en/README.md)
- [Draft runtime SPEC](../spec/platform-base-skills.en.md)
- [Development and product plan](../product/discovery/2026-10-29-platform-base-skills.en.md)
- [Agent Skills format](https://agentskills.io/specification): portable SKILL.md metadata and instruction/resource packaging.
- [Agent Skills integration](https://agentskills.io/client-implementation/adding-skills-support): bundled base skills and staged loading can be integrated by the client.
- [Claude Agent Skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview): pre-built document skills illustrate the product model; FaroAI must implement its own compatible executors and licensed resources.
