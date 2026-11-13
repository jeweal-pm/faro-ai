# Fix document upload origin validation

- The Backoffice origin guard compared `Origin` only with the internal Next.js request URL or optional `BACKOFFICE_URL`; browser requests through the local Docker host could therefore be rejected before upload.
- Added same-host validation using the incoming host and forwarded scheme when present. The configured origin and exact request URL remain supported; a tenant CSRF token is still mandatory.
- Backoffice Docker build and TypeScript validation passed. Updated container is running and `/` returns HTTP 200; old image was removed after replacement. The origin guard could not be verified with an authenticated upload from this shell, so the user should retry in the browser after refresh.
