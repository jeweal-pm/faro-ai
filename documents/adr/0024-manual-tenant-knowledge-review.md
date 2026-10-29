# ADR-0024: Manually add and review tenant knowledge

- **Status:** Accepted
- **Date:** 2026-10-18
- **Deciders:** FaroAI product owner and implementation team
- **Related:** [ADR-0002 Qdrant](0002-use-qdrant-for-embed-db.md), [ADR-0003 tenant isolation](0003-use-tenant-id-for-design.md), [ADR-0023 tenant-scoped RAG learning](0023-tenant-scoped-rag-learning.md)

## Context

ADR-0023 lets an operator generate training question/answer drafts from approved RAG documents, but the Backoffice had no way to add or approve the source documents. MCP live product tools are request-scoped and do not automatically become an indexed knowledge corpus. KT's test tenant had no approved RAG documents, so there was no legitimate source for the learning flow.

## Decision

- Platform admins can add plain-text or Markdown knowledge for a selected tenant in Backoffice. Binary file parsing is not included in this change; operators paste extracted text and keep the source document in their own records.
- New manual documents are stored in PostgreSQL as `pending`, with a content hash/version and tenant ID. The Backoffice lists a bounded content preview and requires an explicit admin approval action.
- Approval is recorded with the admin identity and timestamp, plus an audit event. Only then does the API submit an idempotent tenant-scoped embedding job to the Python worker. The document becomes `approved` for retrieval and Learning only after the worker has indexed it successfully in Qdrant.
- The existing `approved` status remains the eligibility gate for retrieval and Learning. Qdrant is still only the vector index; PostgreSQL remains the authoritative text and approval record.
- Existing indexed MCP ingestion retains its existing source-trust behavior. A live MCP tool such as `search_products` is not treated as a knowledge-document ingestion source.
- Training examples remain a separate human-reviewed step. The source approval does not approve generated answers or authorize dataset export by itself.
- Test snapshots and evaluation outputs may be used only as labeled test knowledge. A query-to-result mapping from an evaluation run is not a verified relevance label and must not be converted into recommendation training truth.

## Consequences

- Operators can bootstrap a tenant's RAG knowledge without a dedicated MCP resource-sync implementation.
- Pending source text is not retrievable and cannot be selected for RAG-to-learning.
- Approval queues asynchronous Qdrant indexing; indexing failures remain visible through embedding-job status and do not make the source available to Learning.
- This workflow accepts text only. PDF/Word parsing, source-file storage, version replacement and document deletion controls remain future work.

## Alternatives considered

- **Insert directly into Qdrant from the browser:** rejected because tenant authorization, durable job state and source text ownership belong behind the API.
- **Automatically approve on paste:** rejected because a data-entry action should not silently authorize a source for retrieval or training draft generation.
- **Treat live GIS results as approved RAG documents:** rejected because live product search is not a stable, versioned knowledge sync and search results can be irrelevant to the query.

## Implementation

See [SPEC: Manual tenant knowledge review](../spec/manual-tenant-knowledge-review.md).
