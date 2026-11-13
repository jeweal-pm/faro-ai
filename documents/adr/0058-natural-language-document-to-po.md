# ADR-0058: Natural-language PO creation from an attached business document

- **Status:** Accepted for implementation
- **Date:** 2026-11-11
- **Owners:** FaroAI platform and GIS integration
- **Related:** [ADR-0026 Natural-language GIS procurement](0026-natural-language-gis-procurement.md), [ADR-0056 Secure business-document intake](0056-secure-business-document-intake.md), [Business-document intake spec](../spec/business-document-intake.md)

## Context

Users should be able to attach a supplier document and write an ordinary request such as “Add this document to a PO.” The current intake supports local OCR and review only. It does not classify/extract transaction fields or connect document content to GIS procurement. GIS already provides the normal tenant-scoped purchase-order lookup, preview, and create workflow.

The source document may contain errors, prompt injection, confidential supplier/customer data, ambiguous products, or values that do not match GIS. Processing extracted text with a provider and creating a purchase order therefore need separate consent and authorization boundaries.

## Decision

1. Extend the single chat attachment flow for a bounded first use case: create one GIS purchase order from a supported PDF, PNG, or JPEG when the user's natural-language request clearly asks for a PO. Example: “Add this document to a PO.” The request may be in Thai or English; users do not need to name tools, IDs, or a rigid template.
2. Run existing local PDF text extraction/OCR first. Do not send the original file or rendered previews to a model. For a clear PO creation request, one explicit, unchecked consent on the upload/send action authorizes local OCR, sending only extracted text from that file to the tenant's configured eligible paid model, and automatic creation of the single requested PO in GIS after the GIS preview passes validation. The consent text must say that it authorizes the GIS PO write. Bind consent to the exact prompt using a server-side HMAC; a changed prompt requires a new upload and consent. No consent means local OCR/review only. This consent does not authorize Qdrant, training, shared learning, or unrelated document use.
3. Jev selects the eligible model under the tenant's existing provider, price, credit, and model policies. Treat OCR as untrusted data: ignore instructions found inside the document, do not treat it as user authorization, and use it only as evidence for the user's request. Bound text and token input; never log OCR content.
4. Reuse GIS's current PO flow and live tenant masters. Resolve supplier, location, active PO voucher, products, and IDs only from GIS. Use values explicitly present in the document. If a required value is absent or ambiguous, ask the user; do not invent supplier/product identity, quantity, purchase price, currency, or tax. Preserve source evidence for extracted values where available. Generated PO import fixtures include Supplier Country and Phone; the current fixture uses Thailand and a clearly synthetic phone number.
5. Resolve a supplier through GIS first. If the document omits the supplier Country, use it only when an exact, unique GIS supplier match returns a verified country through a tenant-scoped GIS MCP read. Do not substitute the buyer's, tenant's, or delivery location's country. If no verified country is available and a new Supplier must be created, ask the user for Country. Supplier Phone is optional in GIS: preserve a source or verified GIS phone when available; otherwise leave it blank. Thailand is a fixture value, not a general default for uploaded documents.
6. Keep Buyer / Bill To as a source-document reference for this first iteration; GIS PO creation has no separate buyer field. Target one GIS location per PO. Resolve Ship-to only from GIS; if it is missing, collect the required location setup values and stage GIS creation for explicit review before creating a voucher or PO. GIS creates the default Vault zone and cash register with the Location; do not create them separately. A missing Supplier, Location, or PO Voucher is shown as its own confirmation. After each confirmed prerequisite, FaroAI resumes the same file job and original prompt automatically; it never stores OCR text in the confirmation draft.
7. Use `preview_purchase_order` as the only GIS PO write preparation step. After preview validation, automatically invoke the existing confirmation endpoint for the same draft; do not ask for a second click. This is allowed only for the exact, prompt-bound user request covered by the checked consent and a validated `create_purchase_order` preview. If required facts are absent/ambiguous, the preview fails, or permission is missing, stop at Needs Review and explain why. A successful create remains pending GIS approval. FaroAI never approves a PO or receives inventory as part of this flow.
8. The server retrieves OCR only through the authenticated, tenant-and-actor-scoped document job. Browser-supplied OCR text is not trusted as the authoritative source. The preparation route requires `document:import` and `document:procurement`; GIS derives and attests the actor. The confirmation route additionally requires `gis:procurement:write` and accepts only the stored preview's exact draft ID. Recheck tenant tool approvals and current GIS `tools/list` through the established procurement executor.
9. Keep the source retention, preview isolation, deletion, and content-free audit rules in ADR-0056. Do not persist the full OCR payload in procurement conversation history or audit logs; the existing document job is the source of truth and follows its seven-day review expiry.
10. Other document types, GIS operations, multi-location/multi-PO creation, direct PO writes without preview, and automatic learning remain unsupported.

11. When OCR reaches `needs_review`, automatically continue a consented, prompt-bound PO request to Jev, create the PO after its validated preview, and show the resulting PO number/status in the same page. Do not require a separate OCR-review/continue or PO-confirm click. If preparation or validation fails, keep the recognized text editable and save corrections through the tenant/actor-scoped draft endpoint using its optimistic correction version. The original OCR evidence and source file remain unchanged, and correction audit stores only a hash/length for the edited text.

## Consequences

- A user can upload a PO-related document and express the request conversationally in one prompt.
- The file is OCR-processed locally; only extracted text is sent externally when the user explicitly consents and an eligible paid model is available. The same consent explicitly authorizes one PO write after the GIS preview passes.
- OCR or GIS ambiguity stops before a PO preview/write and asks for the missing clarification.
- Missing Supplier Country is resolved only from an exact GIS Supplier record; if GIS cannot verify it for a new Supplier, FaroAI asks the user. A missing source Phone may remain blank because GIS makes it optional.
- The first version maps one Ship-to / Delivery Location per PO and displays Buyer / Bill To as source-document reference text only.
- Missing Supplier, Store/Location, and Purchase order Voucher records can be staged from complete document evidence, reviewed and individually confirmed; FaroAI then continues with the same file/prompt until it reaches the normal PO preview.
- GIS remains responsible for authoritative master validation, numbering, audit, and pending-approval state.
- GIS exposes a read-only `get_supplier` MCP capability to return verified supplier Country and Phone for a tenant-scoped supplier ID; it does not grant supplier create/activate permission. All GIS writes remain separately approved and confirmed.

## Acceptance criteria

- “Add this document to a PO” and equivalent Thai/English requests enter document-to-PO processing without requiring a fixed template.
- Without the single PO-processing consent, the job remains OCR/review only and no provider or GIS procurement call is made.
- Consent is bound to the selected file and prompt; changing the prompt invalidates the consent and requires a new upload and opt-in.
- Non-PO prompts never enter the PO creation executor merely because a file is attached.
- Prompt-injection text in OCR cannot grant permissions, change the user's intent, or bypass GIS preview and confirmation.
- Missing/ambiguous required business data is clarified; no guessed GIS IDs or transactional values are written.
- A consented document PO request automatically reaches Jev whether the upload response is immediately `needs_review` or transitions there later; the preview and write remain tenant/actor scoped and GIS-validated.
- A valid flow creates at most one PO after the checked consent and successful GIS preview, then reports its pending-approval status. Retries return the saved result or an explicit unknown outcome; they never blindly repeat a GIS write.
