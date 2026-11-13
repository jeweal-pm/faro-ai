# GIS MCP skill and agent

- Inspected the current `/home/joke/dev/jw-gis-backend/src/mcp` tool set, transport/authentication, GIS workflow ADRs, and existing Codex agent/skill formats.
- Created `.codex/skills/gis-mcp-engineer/SKILL.md` plus a focused architecture/tool-map reference.
- Created `.codex/agents/gis-mcp-engineer.toml`, linked to the new skill for direct team invocation.
- Validation passed: the Skill Creator `quick_validate.py` and Python TOML parsing/skill-link check.
- To expose the new agent in the active Codex team/session, reload or restart its agent catalog if it does not appear immediately.
