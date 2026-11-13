# Jev selects procurement Base Skills

Date: 2026-11-02

- Changed procurement planning to ask Jev for both an eligible paid model and a published Base Skill in one Decisions request.
- Removed the default-model fallback when the Jev decision is missing or invalid; FAROAI now fails closed instead of silently using a different model.
- Runtime loads Jev's selected skill from the central published catalog, validates it against the current workflow's required scope, and limits model-visible GIS tools to that skill's scope.
- Inventory receipt requests now pass through Jev selection and Runtime skill validation before the deterministic executor reads GIS and prepares the receipt preview. The executor still handles its bounded MCP calls without asking Jev again for every tool round-trip.
- The intent classifier remains a permission and compatibility guard. It does not choose or substitute a skill.
- No ADR or specification documents changed.
