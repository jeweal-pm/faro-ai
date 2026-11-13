# Tenant CSRF cookie selection

- Fixed tenant session and CSRF cookie selection in the Backoffice and gateway. Both now choose regular or `__Host-` cookie names using `BACKOFFICE_COOKIE_SECURE`, and a new login clears stale cookies from the other mode.
- Verified against the local deployment (`BACKOFFICE_COOKIE_SECURE=false`) while injecting stale `__Host-` cookies: a deliberately invalid product-draft request passed CSRF and stopped at request validation with HTTP 400 `invalid_request`. No AI generation or GIS write was performed by this probe.
- Rebuilt and restarted `api` and `backoffice`; Docker build completed and services are running.
- Then exercised the guide's product-draft example with the JOKEAI tenant: FaroAI returned three creative drafts with 499/499/500-character descriptions and did not create products in GIS.
- The previously working read-only jewelry discovery example remains a separate read path; the user confirmed its yellow-gold necklace prompt works.
