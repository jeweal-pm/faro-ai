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

Before editing project files, check the current date and record the change under
`documents/change_log/dd-mm-yy/`, creating that day's directory when needed.
