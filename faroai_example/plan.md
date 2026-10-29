# FaroAI: Central RAG, Semantic Cache, MCP and Dual Deployment

## Summary

Build FaroAI as a multi-tenant AI platform with two equivalent modes:

- **Hosted API:** client website sends requests with a FaroAI API key; FaroAI owns OpenRouter access, model routing, vector storage and billing/quota.
- **Self-hosted:** the same FaroAI data plane runs on the customer server; vector/cache/MCP data stays local and inference uses only a configured local endpoint such as Ollama or LM Studio. No OpenRouter fallback unless the customer explicitly enables it.

A central vector store is useful, but it must be split into approved knowledge, generated semantic cache, and model-routing decisions. Do not write every AI answer directly into the approved RAG knowledge base.

## Core architecture

```text
Website backend
  -> FaroAI API / local FaroAI
     -> tenant + consent + safety validation
     -> exact cache
     -> semantic answer cache
     -> approved RAG + product index
     -> routing-decision cache
     -> decision model only on routing cache miss
     -> selected task model
     -> response validation + feedback/candidate storage

MCP connector
  -> indexed content: product, FAQ, policy, CMS content
  -> live tools: price, stock, order, user-specific data
```

- Use a mandatory `tenant_id` namespace in every database query, vector query, cache key, MCP source and log event. No cross-tenant retrieval is permitted.
- Use PostgreSQL for tenant/configuration/metadata, Qdrant for vector collections and Redis for distributed rate limiting, short-lived cache and job coordination.
- Provide Docker Compose for self-hosted deployments: FaroAI, PostgreSQL, Qdrant and Redis. Ollama/LM Studio remains a configurable local inference endpoint.
- Keep all browser traffic behind the client website backend. Browsers never call OpenRouter or a privileged FaroAI endpoint directly.

## Knowledge and embedding management panel

Plan a custom administrator area named **Knowledge & Embedding Management**. This is the business/configuration panel for the embedding pipeline; Qdrant's own dashboard remains a technical operations tool and is not a replacement for this panel.

Recommended sections:

1. **Data Sources**

   - Register and manage tenant-scoped MCP sources.
   - Configure indexed versus live mode, refresh interval, allowed resources/tools, source status and the last successful sync.
   - Provide `Sync now`, re-sync and connection health actions.

2. **Documents**

   - Show source, tenant, content version, language, document status, chunk count and vector status.
   - Preview the sanitized text and chunks before embedding.
   - Allow an administrator to re-index, re-embed or remove a document's vectors with confirmation.

3. **Embedding Jobs**

   - Show queued, processing, completed, failed and cancelled jobs.
   - Include progress, retry, error details safe for administrators, timestamps, source/content version and correlation ID.
   - Run MCP synchronization, sanitize/chunk, embedding and Qdrant upsert as background jobs; do not make a browser request wait for the full operation.

4. **Vector Collections**

   - Show collection name, tenant scope, embedding model, vector dimension, distance metric, document/chunk/vector counts and collection health.
   - Display the active collection and the collection version currently used for retrieval.
   - Keep approved knowledge, semantic answer cache and routing-decision data visibly separated.

5. **Retrieval Playground**

   - Let an administrator test a query for a selected tenant and language.
   - Show matched chunks, similarity scores, source documents, filters, collection version and whether the result came from exact cache, semantic cache or live retrieval.
   - Never expose another tenant's documents or metadata in this view.

### Embedding lifecycle and model changes

- An embedding model and vector dimension are collection-level compatibility settings; they must not be changed in-place.
- When the model, dimension, chunking rule or important metadata changes, create a new versioned collection, re-embed in the background, validate retrieval quality, switch an alias/active-collection setting, and only then retire the old collection.
- Keep the old collection available for rollback during a configurable grace period.
- Record who started a sync/re-embed, what configuration was used, the source/content version, result counts and failure details.
- Use `tenant_id` in every panel query, job payload, cache key and Qdrant filter. A global collection is acceptable only if every point has an enforced tenant filter; separate collections per tenant may be selected for stronger isolation.

### Operational controls

- Support pause/resume, retry failed jobs, concurrency limits, rate limits, retention and cleanup policies.
- Make destructive actions such as deleting vectors or retiring a collection confirmation-protected and auditable.
- Show embedding cost/usage where the provider exposes it, but do not store provider secrets in the panel or browser.
- The panel is a planned feature for the FaroAI architecture; it is not part of the current MUKSHA production AI implementation until explicitly built.

## Knowledge, cache and learning policy

Create three separate stores:

1. **Approved knowledge index**

   - Contains owner-approved FAQ, policy, CMS content and curated product knowledge.
   - Is the factual source of truth for RAG.
   - Changes only through MCP sync or explicit admin approval.

2. **Semantic answer cache**

   - Stores generated answers as `candidate`, never as approved knowledge automatically.
   - Metadata includes tenant, language, task type, normalized intent/filters, source/content version, catalogue version, product IDs, model route, creation/expiry time, quality status and consent eligibility.
   - Only write customer-derived generated entries when `ai_improve` consent is true.
   - Scrub PII before persistence; preserve the existing 90-day default retention for generated customer-derived entries.
   - Promote a candidate to approved knowledge only through an admin review workflow or explicitly approved automation policy.

3. **Routing-decision cache**

   - Stores the decision that a request fingerprint/task should use a particular capability and model class.
   - Is operational metadata, not RAG knowledge.
   - Default TTL: 24 hours, invalidated when tenant model policy or available local models change.

Cache-read rules:

- Exact cache hit: return only when tenant, language, task, consent policy and source versions match.
- Semantic cache hit: require a high similarity threshold (default `0.93`) plus compatible metadata.
- Stable FAQ/policy answers: valid until their source version changes, with a 30-day maximum TTL.
- Product answers: return a cached complete answer only when `catalogue_version` matches exactly; default maximum TTL is 15 minutes.
- Price, stock, order status and user-specific information: never return directly from semantic cache. Retrieve through the configured live MCP capability every time.
- If product/catalogue versions differ, reuse only the cached intent/routing decision; retrieve current products and regenerate or build a factual response.

## MCP ingestion and live-data policy

Use MCP as FaroAI’s tenant-specific data connector.

- **Indexed MCP resources:** products, collections, FAQ, policy and CMS pages are periodically synchronized into the tenant’s relational/vector index.
- **Live MCP tools:** stock, live price, promotion eligibility, order state and customer-specific rules are queried during the request.
- Each MCP source declares its mode: `indexed` or `live`, refresh interval, tenant namespace, allowed resources/tools, version field and health state.
- Compute a `catalogue_version` and `content_version` from MCP source versions or canonical content hashes.
- MCP failures must not expose tool errors to users. Return a safe fallback and avoid claiming live data when it cannot be verified.
- MCP endpoints and tools are administrator-configured, allow-listed and scoped; no client request may choose an arbitrary MCP URL or tool.

## Model routing

Use rules and cache before any decision-model call:

1. Classify request deterministically: cached answer, knowledge retrieval, product search, live-data query, simple chat or complex generation.
2. Use the routing-decision cache when available.
3. On a routing miss, call the decision model with only a constrained task descriptor and an allow-list of supported capabilities/models.
4. Call the selected task model through:
   - FaroAI’s OpenRouter gateway in hosted mode.
   - Ollama or OpenAI-compatible LM Studio endpoint in self-hosted mode.
5. Validate response against retrieved facts before returning it.

The client never chooses a provider/model directly. FaroAI model policy controls cost, quality, timeout, maximum tokens and fallback per tenant/task.

Self-hosted default policy: no outbound inference traffic. If the local model is unavailable, return deterministic retrieval-based fallback rather than silently sending data to OpenRouter.

## API and security contract

- Keep a stable API shape such as `POST /v1/chat`, `POST /v1/feedback`, and administrative MCP sync/configuration endpoints.
- Hosted requests authenticate with tenant-scoped FaroAI API keys. Store only hashed keys; support rotation, scopes, quotas and revocation.
- The calling website sends a signed server-to-server context containing tenant, server-validated `ai_chat`/`ai_improve` consent and permitted user context. Never trust consent or tenant identity sent directly from the browser.
- Preserve CSRF/session protections at the website boundary.
- Enforce request size, message/history limits, distributed rate limiting, timeouts, circuit breakers and provider/local-model health checks.
- Retain existing prompt-injection handling, output safety rules and factual fallback behavior.
- Track correlation IDs and metrics for cache layer, MCP latency, retrieval latency, decision-model calls, selected model, model latency, source versions, token/cost usage and errors.

## Rollout plan

1. Define the framework-neutral FaroAI API contract and move the current MUKSHAAI orchestration behind a compatible adapter.
2. Deploy hosted multi-tenant FaroAI with tenant isolation, OpenRouter gateway, approved RAG and existing deterministic fallback.
3. Add MCP source registration and indexed/live source modes; sync Muksha catalogue, FAQ and site content into a tenant namespace.
4. Enable semantic cache in observe-only mode, logging would-hit results without serving them.
5. Enable approved-knowledge cache hits, then generated cache hits with consent, version and similarity safeguards.
6. Enable cached product answers only when catalogue versions match; retain live MCP calls for dynamic fields.
7. Package the self-hosted stack with local Ollama/LM Studio adapters and outbound inference disabled by default.
8. Migrate additional projects by creating a tenant, MCP source mapping and model policy rather than copying application logic.

## Test plan

- Verify that one tenant cannot retrieve vectors, answers, logs, sources or cache entries from another tenant.
- Verify no generated cache entry is written without `ai_improve` consent.
- Verify policy/FAQ updates and product catalogue changes invalidate relevant cache entries.
- Verify price/stock/order requests always call live MCP and never serve stale semantic-cache data.
- Verify MCP outage, OpenRouter outage and local LLM outage return safe factual fallback responses.
- Verify model routing uses cached/rule decisions before invoking the decision model.
- Verify self-hosted mode has no OpenRouter network calls unless explicitly enabled.
- Test injection-like text in MCP/CMS data, invalid API keys, expired keys, oversized input, rate-limit abuse and model/provider timeout paths.

## Assumptions and defaults

- FaroAI centrally owns OpenRouter credentials and selects hosted models; client websites only need FaroAI API keys.
- Self-hosted FaroAI uses local Ollama or LM Studio endpoints and keeps customer vector/cache/MCP data inside the customer infrastructure.
- Generated semantic-cache data requires `ai_improve` consent and is retained for at most 90 days by default.
- Approved knowledge remains until its MCP source removes/changes it.
- Similarity threshold begins at `0.93` and is tuned per tenant from feedback and false-hit metrics.
- Product answer cache lifetime begins at 15 minutes with exact catalogue-version matching; live-data answers are not cached directly.
