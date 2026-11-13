# GIS MCP PO read latency review — 2026-11-07

- Reviewed the GIS MCP PO search/detail flow and identified per-PO header and line queries after summary search.
- Implemented the coordinator-approved, backward-compatible `include_lines` option for `search_purchase_orders`, bounded to 20 POs and 1,000 lines with a single batched line query. Over-limit results fail explicitly rather than returning partial details.
- Preserved the existing `get_purchase_order` header/line fields and added `expected_line_count` and `details_complete`. Existing summary-only calls retain the prior response shape. Search, supplier, location, status, and configured-organization scoping remain enforced.
- JavaScript syntax checks passed for the three touched MCP files. No live GIS records or credentials were changed. The GIS repository contains unrelated pre-existing working-tree changes.
- GIS backend changelog was updated at `jw-gis-backend/docs/changelog/2026-11-07-mcp-po-search-batched-details.md`; its `docs/` tree is ignored by that repository's `.gitignore`.
