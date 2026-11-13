# Explicit PO export intent — 02-11-26

- Removed the per-conversation document-generation checkbox and its consent cookie.
- Export now requires an explicit user request naming a supported file format and an export action; Backoffice validates the request and the API enforces a one-request `x-faroai-export-requested` header for artifact creation.
- Kept tenant/API-key/actor isolation, private storage, visible-row-only exports, and the 24-hour expiry. Status and download remain bound to the actor that created the artifact.
- Clarified that app-user export intent is not GDPR/PDPA data-subject consent or a lawful basis. Tenant controllers remain responsible for their legal basis, notice, retention and any required subject consent.
- Superseded [ADR-0042](../../adr/0042-explicit-document-generation-consent.md) with [ADR-0044](../../adr/0044-explicit-export-intent.md) and updated Thai/English Base Skills specs.
