# GIS MCP agent API scope

- Extended the GIS MCP routing contract in `AGENTS.md`, `.codex/agents/gis-mcp-engineer.toml`, and `.codex/skills/gis-mcp-engineer/SKILL.md` to cover HTTP API routes, controllers, services, authentication, validation, and permissions in `jw-gis-backend` when issues arise.
- The agent can fix the GIS API implementation behind an MCP tool and coordinate FaroAI-to-GIS integration. Unrelated FaroAI gateway APIs remain with the FaroAI backend owner.
- GIS HTTP API authentication stays on its existing route policy; the MCP API key remains specific to `/mcp`.
- This change updates team instructions only; it does not modify live GIS API behavior or data.
