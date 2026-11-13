# Product discovery routing

For requests to discover, compare or prioritize product features, customer segments,
business opportunities or roadmap options, coordinate the `bd` and `po` subagents
using [the shared role and discovery contract](documents/spec/bd-po-product-discovery.md).
Apply this to discovery work, not routine bug fixes, PO-record searches or an exact
implementation already specified by the user.

- `bd` means Business Development. `po` means Product Owner; purchase-order
  operations alone must not trigger the Product Owner agent.
- Spawn one BD and one PO with the same task, user constraints and relevant project
  evidence. They are peer functions; the parent coordinates exchanges and owns the
  single final file write. Subagents must not recursively spawn another pair.
- For an explicitly role-only request, use that role and identify the missing peer
  review instead of presenting a joint decision.
- Exchange their findings, request responses to material objections, and reconcile
  scope, users, business outcomes and success metrics. Continue while new evidence
  or a concrete revision can resolve the difference. Finish with a shared disposition
  or an explicit unresolved sponsor decision; do not invent evidence or agreement.
- If a new custom role is not exposed by the current runtime, use separate default
  subagents instructed to read `.codex/agents/bd.toml` and `.codex/agents/po.toml`,
  and identify this fallback accurately.
- A discovery conclusion is a recommendation. Existing user authorization determines
  whether implementation, external commitments or live business actions may follow.

# GIS MCP routing

For GIS MCP tool design, schema changes, endpoint/auth issues, GIS product/master,
supplier, PO, inventory, location, GIS backend HTTP API issues (including routes,
controllers, services, validation and permissions), and FaroAI-to-GIS API/MCP integration
tasks, coordinate the `gis-mcp-engineer` role in `.codex/agents/gis-mcp-engineer.toml`
and follow the `gis-mcp-engineer` skill. The role may fix the underlying GIS API when
an MCP tool depends on it; keep unrelated FaroAI gateway API work with the FaroAI
backend owner. If the custom agent is not registered in the current runtime, spawn a
default subagent with that role and skill and identify it as the runtime fallback.

- Save each question and answer with the GIS MCP agent as a separate timestamped
  Markdown file under `chat_log/team_agent_qa/`, using Asia/Bangkok time. Do not log
  credentials, API keys, or other secrets.
- When the GIS MCP agent changes code in `jw-gis-backend`, require it to update that
  repository's established dated changelog under `docs/changelog/` and report the path.
- When FaroAI project files also change, record the FaroAI changes under
  `documents/change_log/dd-mm-yy/` after checking the current date.

# GIS frontend routing

For any task that reads, changes, or reviews files under `/home/joke/dev/jw-gis-frontend`,
coordinate the `gis-frontend` role in `.codex/agents/gis-frontend.toml` and follow
the `gis-frontend` skill. Keep the work coordinated from this FaroAI project. If the
custom role is not registered in the current runtime, spawn a default subagent
instructed to read those two files and identify it as a runtime fallback. The GIS
frontend role owns React UI work; coordinate API contracts with `gis-mcp-engineer`,
which owns GIS backend and MCP changes. Neither role should silently edit the
other repository's files.

Before editing project files, check the current date and record the change under
`documents/change_log/dd-mm-yy/`, creating that day's directory when needed.
