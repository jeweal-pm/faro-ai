# SPEC: Manual tenant knowledge review

- **Status:** Implemented
- **Date:** 2026-10-18
- **Decision:** [ADR-0024](../adr/0024-manual-tenant-knowledge-review.md)

## User flow

1. A platform admin opens Backoffice → **Knowledge & embedding jobs** and selects the target tenant.
2. The admin pastes trusted plain text or Markdown, sets a title and language, and saves it. FaroAI stores a `pending` document in PostgreSQL and records an audit event.
3. The admin reviews the title and bounded content preview, then selects **Approve & index**.
4. The API records the reviewer and approval time and submits the document to the authenticated internal Python index endpoint. The API never exposes direct Qdrant access to the browser.
5. The worker embeds the content, upserts points with tenant/document/version metadata, and marks the PostgreSQL document `approved` after successful indexing. The document then appears in Learning's approved RAG source list.
6. Learning uses the tenant's authorized local Ollama/LM Studio connection to draft Q&A pairs. A human reviews and approves individual pairs for local fine-tuning. Dataset export emits the existing `messages` JSONL schema.

## API contract

- `GET /admin/v1/tenants/:tenantId/knowledge/documents?limit=50` lists documents with status, approval metadata, a preview capped at 1,200 characters and total character count.
- `POST /admin/v1/tenants/:tenantId/knowledge/documents` accepts `{ title, language, content }`; language is `en`, `th`, or `fr`; content is capped at 100,000 characters and saved as pending.
- `POST /admin/v1/tenants/:tenantId/knowledge/documents/:documentId/approve` accepts an empty JSON object and returns `202` with the embedding job ID. Only the matching tenant's manual pending document can be approved once.
- The API resolves and checks the tenant on every route. Admin session/CSRF checks apply through the existing Backoffice middleware. Approval and index queueing are audited.
- Qdrant indexing is dispatched only through the authenticated internal service request and existing durable embedding-job/Redis worker path.

## Data and security rules

- PostgreSQL is authoritative for raw sanitized text, source/version hash, approval actor/time, status and audit history.
- Source content is cleaned of NUL/control characters and line endings are normalized. The browser receives only the first 1,200 characters for review listing.
- Each manual document uses a tenant-owned indexed MCP source named `Backoffice knowledge uploads`; tenant scoping is mandatory throughout the Qdrant pipeline.
- A document whose index job has not completed remains unavailable to Learning. The review list reports `indexing` while approval metadata exists and the document status is still pending.
- The word “approved” here refers to source-document approval for retrieval. It does not approve generated Q&A pairs or bypass tenant learning authorization and reviewer approval.
- The text-only form does not parse files. Operators must paste text they are authorized to use.

## Acceptance criteria

- A platform admin can add source text to the selected tenant and see it as pending.
- Pending text is excluded from Learning document selection and Qdrant retrieval.
- Approval creates an audit record and a tenant-scoped embedding job; successful indexing makes the source eligible for Learning.
- A different tenant cannot read, approve, index or select the document by changing an ID in the request.
- The current 220-query discovery evaluation remains an evaluation artifact and is not silently exported as gold training data.
