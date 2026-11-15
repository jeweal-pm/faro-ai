# FAROAI API edge routing

- Routed `/v1/*`, `/admin/v1/*`, `/tenant/v1/*`, and API health endpoints through Caddy to the `api:3000` service.
- Kept all other requests routed to `backoffice:3000` so the existing web UI remains available.
- This fixes GIS credential verification calls such as `POST /v1/oauth/token`, which previously reached the Backoffice service and returned 404.
- Deployment is required before the public hostname exposes these API routes.
