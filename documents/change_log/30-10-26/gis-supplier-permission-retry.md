# GIS Supplier permission retry

- Verified the saved GIS MCP connection is enabled and reports `connected`; its last sync discovered 27 tools, but its approved tool list does not include `search_suppliers`, `create_supplier`, or `activate_supplier`.
- A direct `tools/list` probe without the stored GIS credential returned HTTP 401; that probe did not test FaroAI's saved credential. The read-only Supplier prompt through FaroAI's tenant API credential returned HTTP 409 `required_gis_tools_not_approved` before any model call or GIS write.
- Fixed Gateway error classification so read-only Supplier search reports only the missing `search_suppliers` permission, and create/activate requests show their respective required tool pairs and sync guidance.
- Gateway typecheck and build passed. Replaced the old API image `f2ebd02703fa` with `2e68a9293abf`; API is healthy and `/health/ready` returned HTTP 200. Postgres, Qdrant, Redis, and other services/data were preserved.
- No Supplier records were created or changed. Completion of live Supplier operations still requires syncing the GIS tool list and approving `search_suppliers` (plus `create_supplier` or `activate_supplier` for those writes) in the GIS connection.
