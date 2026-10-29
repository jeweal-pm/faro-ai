# BD and Product Owner discovery agents — 29-10-26

- Added `.codex/agents/bd.toml` and `.codex/agents/po.toml` with jewelry, AI and ecommerce expertise and distinct commercial/product responsibilities.
- Added project discovery routing in `AGENTS.md` and updated the engineering lead's role list.
- Added ADR-0035 and a shared SPEC containing the organization model, RACI, peer-review workflow, decision criteria and final feature brief requirements.
- Validation passed: Python `tomllib` parsed both new profiles and the updated lead profile; required fields, unique role names, inherited model/permissions and shared reference files were checked without installing dependencies.
- A read-only jewelry AI-stylist scenario was analyzed independently by BD and PO, followed by mutual review. Both converged on `validate_first`, identified buyer/user/beneficiary separately and retained commercial/product/engineering/sponsor ownership without inventing evidence or writing live data.
- Behavioral validation used default subagents explicitly reading the new role files; native custom-role discovery in this already-open session was not claimed as tested. `AGENTS.md` documents this fallback.
