# Procurement history control and line filters — 26-10-26

- Added an Admin → Deployment toggle for procurement conversation history; PostgreSQL stores it, the gateway enforces it, and changes are audited without redeploying.
- Added a separate Filter icon for local PO line filtering by unit price, quantity, or line amount; this does not call the model or GIS.
- Added migration `015_procurement_runtime_settings.sql`; applied successfully with the default history setting enabled.
- Gateway typecheck/build and Backoffice typecheck passed; the Docker Next.js production build succeeded. API readiness and Backoffice HTTP checks returned 200.
- Decision and behavior are documented in [ADR-0034](../../adr/0034-configurable-procurement-conversation-context.md) and [the procurement SPEC](../../spec/natural-language-gis-procurement.md).
