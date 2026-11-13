# Backoffice tenant configuration rebuild - 04-11-26

- The deployment was still running with the previous demo tenant ID while `.env` had the updated JOKEAI tenant ID, so the Backoffice container needed recreation to load the new value.
- The configured GIS API key did not match an active tenant API-key record in the current database. A fresh JOKEAI-scoped GIS operations key was provisioned and stored in `.env` without displaying it; `.env` permissions remain `600`.
- Rebuilt and recreated only the Backoffice service using the deployment's existing Compose files. The replaced image ID is absent and no container references it. Shared BuildKit cache was retained because the build reused valid layers and pruning it would also affect other builds.
- Verified the Backoffice runtime tenant ID and key presence, confirmed the key record is active for JOKEAI with product and procurement write scopes, and received HTTP 200 from the tenant credential endpoint. API readiness and Backoffice `/admin` both returned HTTP 200.
- No GIS write operation was issued as part of this deployment update.
