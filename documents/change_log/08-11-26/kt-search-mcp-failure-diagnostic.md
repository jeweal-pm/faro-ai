# KT discovery MCP failure

- Confirmed KT's GIS connection is enabled and `search_products` is allowed; the stored `connected` state predates the failed search and did not guarantee the tunnel was still online.
- The failed MCP call targeted `https://decimal-crummy-multiple.ngrok-free.dev/mcp`. A read-only GET to that host returned HTTP 404 with `ERR_NGROK_3200` and stated that the endpoint is offline. This points to the ngrok tunnel being offline or changed, before catalog lookup or product verification can run.
- Updated `ai-service/faroai/routing.py` to log a normalized MCP failure code as well as exception type. It excludes prompt text and credentials and should distinguish useful transport/auth/protocol classes on the next request.
- No endpoint, secret, tenant scope, or MCP permission was changed as part of diagnosis.
