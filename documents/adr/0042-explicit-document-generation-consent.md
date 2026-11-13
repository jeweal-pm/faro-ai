# ADR-0042: Require separate consent for document generation

- **Status:** Superseded by [ADR-0044](0044-explicit-export-intent.md)
- **Date:** 2026-11-02
- **Decision owners:** FaroAI platform
- **Related:** [ADR-0036 Platform Base Skills](0036-platform-base-skills.md), [Platform Base Skills spec](../spec/platform-base-skills.md)

## Context

Backoffice document export called the artifact context endpoint without the AI chat consent header. The API rejected the request with `403 consent_required`, while Backoffice displayed the misleading message that document creation was not configured. Document generation is a separate, deterministic operation over PO rows already displayed to the user; it must not silently reuse consent for AI chat, knowledge improvement, or training.

## Decision

- Show an unchecked document-generation consent checkbox in the PO assistant after PO results are displayed.
- Require the user to select it before a document can be created.
- Send the distinct `x-faroai-artifact-consent` header from the Backoffice server action. The API enforces this consent for artifact context, creation, status and download routes in addition to tenant, API-key scope, actor and deployment checks.
- Keep the consent in an HttpOnly, same-site session cookie for up to the artifact's 24-hour lifetime so the same user can poll and download the requested file. Do not infer consent from AI chat, learning, or training consent.
- Do not send the checkbox value in the artifact payload or to the browser as an API credential.

## Consequences

- Users must opt in before exporting displayed PO rows; the checkbox is never preselected.
- A missing consent is reported as a consent problem rather than as missing deployment configuration.
- Existing deployment flags, tenant/API-key setup, export formats, private storage, and the 24-hour expiry policy remain unchanged.
