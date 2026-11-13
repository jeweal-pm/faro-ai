# Allow the updated GIS MCP host

- Added `decimal-crummy-multiple.ngrok-free.dev` to the deployment-owned `MCP_ALLOWED_HOSTS` list so the Backoffice save validation and AI service accept the updated HTTPS GIS MCP endpoint.
- Preserved existing allow-list entries and all other environment values.
- Restricted the local `.env` permissions to owner-only access (`0600`).
- Restarted only the API and AI service without rebuilding images; no MCP database or records were changed.
