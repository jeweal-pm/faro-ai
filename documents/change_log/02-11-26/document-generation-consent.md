# Explicit consent for PO document export — 02-11-26

- Added a default-unchecked document consent checkbox to the PO assistant and a separate `x-faroai-artifact-consent` contract; AI chat and training consent remain independent.
- Gateway now enforces document consent on artifact context, create, status, and download endpoints; Backoffice keeps an HttpOnly consent session for status/download of the requested file.
- Updated [ADR-0042](../../adr/0042-explicit-document-generation-consent.md) and [Base Skills spec](../../spec/platform-base-skills.md).
- Root cause was `403 consent_required`: the Backoffice artifact context request omitted consent. Deployment flags and worker were already enabled.
