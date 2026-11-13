# GIS Integrated Applications FaroAI contract

- Added ADR-0053 and SPEC for tenant-scoped GIS → FaroAI configuration and server-side credential verification.
- FaroAI OAuth token response now includes the authenticated tenant ID for GIS cross-checking.
- GIS frontend and backend implementation is tracked in their respective repositories.
- Follow-up: removed manual Tenant ID entry; GIS now records the tenant ID returned after successful FaroAI credential verification and displays it read-only.
