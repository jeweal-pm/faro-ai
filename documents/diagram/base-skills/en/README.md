# FaroAI Base Skills: Executive View and Sequence Diagrams

29 October 2026 | English edition | **Proposed target design** based on [ADR-0036](../../../adr/0036-platform-base-skills.en.md) and the [Draft SPEC](../../../spec/platform-base-skills.en.md). This is not a verified production deployment diagram.

[Thai diagram edition](../README.md)

[English development plan](../../../product/discovery/2026-10-29-platform-base-skills.en.md)

## Present or share

- [Open the HTML viewer](index.html): choose diagrams, zoom, and open PDF/editable source; no CDN connection is required.
- [Three-page PDF](faroai-base-skills-diagrams.pdf): vector A3 landscape with embedded fonts.
- [Editable draw.io source](base-skills.drawio): three pages, suitable for diagrams.net/draw.io.

## 1. Executive view

The [overview SVG](01-overview.svg) shows a shared Base Skill Catalog inherited by every tenant, Jev/runtime selection, existing business capabilities and the proposed analysis/document worker.

All tenants use the same published skill release within a deployment without per-tenant installation. Their data, permissions and budgets remain separate. Measure completed work, time, rework and cost rather than treating skill count as ROI.

**The Skill Runtime and artifact workers are built and operated by FaroAI.** MCP servers provide authorized tools and data. They do not own FaroAI's skill orchestration.

## 2. Sequence 1/2: Select skills and read data

[SVG](02-sequence-routing.svg) / [Mermaid source](02-sequence-routing.mmd)

The example, "Summarize pending POs and create an Excel file," is a target composition-phase workflow. It does not mean the entire capability is already implemented.

The gateway validates trusted tenant/actor/budget context. The runtime resolves the release, gives Jev only allowed choices, validates the result and loads selected instructions. MCP supplies verified business data. A generation model is called only when narrative is needed; deterministic executors verify calculations.

Persist a durable artifact job before queueing and reporting queued. The drawing shows logical responsibilities. Combining skill/model selection in a single decision call requires compatibility validation during implementation.

## 3. Sequence 2/2: Worker and private file

[SVG](03-sequence-artifact.svg) / [Mermaid source](03-sequence-artifact.mmd)

PostgreSQL owns durable job manifests/status. Redis coordinates delivery of job identity. The worker validates context/version/policy, computes results, creates a file and stores it privately. Status checks and downloads pass through the gateway's tenant/actor/expiry checks.

UI polling tracks an existing job automatically; users do not submit the prompt again. Snapshot references do not imply raw MCP payloads in logs or queues.

## Policies to explain to the team

1. Shared Base Skills share workflow knowledge, not tenant records or additional tool rights.
2. Read/search/analysis/file generation does not create hidden GIS transactions.
3. Catalog creation retains its direct authorized policy. PO/receipt writes require preview, confirmation and re-preview. FaroAI never approves POs.
4. Validate skill/model IDs, versions, tools and artifact access server-side; instruction text alone cannot enforce policy.
5. Qdrant retains approved tenant knowledge/product retrieval, condensed into the knowledge box. It does not store skill code/artifact bytes or automatically learn from outputs.
6. Blue marks proposed additions; teal marks existing capabilities being reused/extended. These are logical target diagrams, not container topology.

## Regenerate from source

`build_diagrams.py` contains the English labels and layout and exports SVG, PDF, HTML, editable draw.io and Mermaid. It requires Python, ReportLab and the font configured in the script; these are documentation-generation dependencies, not FaroAI runtime changes.

```powershell
python -B documents/diagram/base-skills/en/build_diagrams.py
```

Review the diagrams against inheritance, scoped credentials, selective loading, operation policies, durable jobs and private-artifact rules. Render all three PDF pages to inspect readability.
