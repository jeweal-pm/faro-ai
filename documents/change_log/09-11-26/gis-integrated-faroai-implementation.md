# GIS Integrated Applications FaroAI implementation

- GIS frontend now shows a dedicated FaroAI row and editor with Tenant ID, API Key (Client ID), write-only Secret Key, and enabled state.
- GIS backend now has tenant-scoped encrypted FaroAI configuration and OAuth tenant verification endpoints, separate from the generic application credentials flow.
- FaroAI OAuth token responses include the authenticated tenant ID for exact GIS cross-checking; the FaroAI API image was rebuilt and the API container recreated healthy.
- Added ADR-0053 and its SPEC. Local GIS runtime now loads a Git-ignored, owner-readable `.env.local` with a generated encryption key and loopback FaroAI API URL. No tenant credential was supplied or saved in this work.
- Existing GIS authentication protects the new endpoints, but the GIS application has no dedicated Integrated Applications role permission to enforce. The SPEC records the required permission-category rollout.
- GIS frontend production build completed with existing lint warnings; its dev server returned HTTP 200. GIS backend syntax and local encryption/config checks passed. Live credential exchange awaits tenant values from the operator.
- GIS nodemon restarted after the local environment file was created; the new authenticated route is reachable and rejects anonymous requests. FaroAI API container health returned HTTP 200.
