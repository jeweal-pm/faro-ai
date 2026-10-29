# FaroAI

FaroAI is the migrated service stack for the architecture in `documents/`. The original portable PHP implementation stays in `faroai_example/` as a behavior reference.

The request flow follows `documents/diagram/flowchart/AI FLOW.drawio`:

```text
Website backend -> FaroAI Hono API -> Python decision / retrieval service
                                      |-> JEV or configured decision model
                                      |-> tenant MCP live tools
                                      |-> PostgreSQL product and job data
                                      `-> Qdrant approved knowledge vectors
```

The Hono gateway is the public boundary. It authenticates a tenant API key, checks scope and consent, applies rate limits, and signs internal requests to Python. PostgreSQL stores durable tenant, product, source, consent, feedback, and job records. Redis coordinates rate limits and embedding jobs. Qdrant stores only owner-approved knowledge chunks with a mandatory `tenant_id` payload filter. Embeddings support retrieval; they do not automatically train an LLM.

## Services

- `gateway/`: Hono + TypeScript public API and tenant key provisioning.
- `ai-service/`: Python API, model and MCP routing, embedding worker, and Qdrant integration.
- `infra/postgres/init/`: initial PostgreSQL schema and least-privilege application role.
- `backoffice/`: Next.js AI discovery page and FaroAI operator console. The operator console is served at `http://127.0.0.1:3001`.
- `docker-compose.yml`: service stack. Qdrant, PostgreSQL, and Redis have no published host ports; the API and Backoffice bind to loopback only.
- `docker-compose.hosted.yml`: optional provider egress for the AI service when hosted model endpoints are enabled.

The AI discovery screen follows the supplied reference and sends text searches from a Next.js server action. Its image-search affordance is intentionally disabled until an image API exists. The platform console uses separate administrator authentication and manages tenants, request credits, model providers, and retrieval jobs. The application website backend should call FaroAI server-to-server; browser code must not receive a FaroAI tenant API key.

## Start locally

Use Docker Compose v2 and copy `.env.example` to `.env`. Replace each placeholder secret with a different random URL-safe value (letters and numbers are simplest for the database password). Keep `.env` private.

```powershell
Copy-Item .env.example .env
# Edit .env and replace all secret placeholders

docker compose -f docker-compose.yml -f docker-compose.local.yml up --build -d
docker compose -f docker-compose.yml -f docker-compose.local.yml ps
```

### Backoffice development mode

For UI work, keep the API and data services in Docker but run the Backoffice from its source with Next.js Fast Refresh. This avoids rebuilding the Backoffice image for each code change:

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml stop backoffice
.\scripts\run-backoffice-dev.ps1
```

Open `http://127.0.0.1:3001/admin`. Stop the dev server with `Ctrl+C`. To return to the containerized Backoffice, run:

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --no-deps backoffice
```

The dev script binds only to loopback, loads the discovery settings from the ignored root `.env`, and points the server-side API rewrite to `http://127.0.0.1:3000`. The API key stays in the server process and is never sent to browser JavaScript. Public discovery remains disabled until a demo tenant and chat-scoped API key are configured. If the Backoffice dependencies are missing, run `pnpm install --frozen-lockfile` from `backoffice/` once before starting the script.

### Gateway and AI-service development mode

The local Compose override mounts compiled gateway output read-only and mounts AI-service source read-only with Uvicorn reload enabled. After a gateway source change, compile with `npm run build` from `gateway/`, then recreate only the API container. Python source changes reload automatically. Neither operation rebuilds an image:

```powershell
npm --prefix gateway run build
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --no-deps --force-recreate api
```

To switch the running API and AI service to this local development configuration without rebuilding:

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --no-deps --force-recreate api ai-service
```

To create a local break-glass administrator and deployment encryption key, run `node gateway/setup-local-admin.mjs`. It enables Backoffice local login, stores only the Argon2id password hash and encryption key in the ignored `.env`, and writes the one-time password to the ignored `.local-admin-password` file. Keep that file private and remove it after saving the credential in your password manager.

The first image build downloads the multilingual embedding model into the image. Containers run as non-root where supported, with read-only root filesystems for the API, Backoffice, and Python services. The migration service applies versioned schema updates to an existing PostgreSQL volume without deleting it. Backoffice is disabled by default in `.env.example`; create local credentials with the command above or configure OIDC. For outbound access from the AI service to model providers or external HTTPS MCP servers, include the optional egress overlay:

```powershell
docker compose -f docker-compose.yml -f docker-compose.hosted.yml -f docker-compose.local.yml up --build -d
```

Add each external MCP hostname to `MCP_ALLOWED_HOSTS` in `.env`. The egress overlay attaches only the AI service to a non-internal network; MCP endpoint validation still requires HTTPS and an exact hostname allow-list entry. Never attach PostgreSQL, Redis, or Qdrant to the egress network.

Check API readiness at `http://127.0.0.1:3000/health/ready`, AI discovery at `http://127.0.0.1:3001/`, and Backoffice at `http://127.0.0.1:3001/admin`. The local override publishes the Qdrant dashboard at `http://127.0.0.1:6333/dashboard`; use the read-only key from `.env` when prompted. Only the local override publishes the Qdrant port, bound to loopback. The base Compose configuration leaves it private. Back up the named PostgreSQL, Qdrant storage and snapshot volumes as part of deployment operations. The base limits fit the documented 8 GB / 4 vCPU target; the local override caps the stack at about 2 vCPU and 3.25 GiB including Backoffice.

## Create a tenant credential

Provision a tenant through the API container. The one-time API key is printed to the terminal; store it in the calling website backend's secret store.

```powershell
docker compose exec api node dist/provision-tenant.js "Example Store"
```

The initial key has `chat:write`, `feedback:write`, `knowledge:write`, `mcp:write`, and `catalogue:write` scopes. The database stores only a peppered hash. Use tenant-scoped credentials only from trusted server code.

## API contract

All `/v1` routes require `Authorization: Bearer fai_...`.

- `POST /v1/chat` — JSON `{ "message": "...", "history": [], "state": {} }`. Also send `X-FaroAI-AI-Chat-Consent: true` after the website backend has checked the user's consent. `X-FaroAI-AI-Improve-Consent: true` permits a scrubbed answer candidate for human-reviewed RAG promotion. `X-FaroAI-AI-Training-Local-Consent: true` and `X-FaroAI-AI-Training-Shared-Consent: true` separately permit consideration for local or shared supervised datasets. Training consent alone does not approve a candidate or start training. Consent must come from a server-side decision, never an untrusted browser field.
- `POST /v1/feedback` — JSON `{ "rating": "up" | "down", "intent": "product", "lang": "en", "question": "..." }`. The question is stored for improvement only when the improvement-consent header is true.
- `POST /v1/mcp/sources` — register a tenant-owned indexed or live MCP source and explicit resource/tool allow-lists.
- `GET /v1/mcp/sources` — list that tenant's sources.
- `POST /v1/catalogue/sync` — upsert up to 100 tenant products per batch from the trusted GMS/MCP connector. This endpoint uses `catalogue:write` and records the catalogue version.
- `POST /v1/knowledge/index` — submit approved documents for asynchronous embedding. The body includes `source_id`, `source_version`, and `documents` with `id`, `title`, `text`, `language`, and `content_version`. The source must already be an active indexed source.
- `GET /v1/embedding/jobs/{job_id}` — check job status and progress.

A minimal chat call from the website backend:

```powershell
$headers = @{
  Authorization = "Bearer $env:FAROAI_API_KEY"
  "Content-Type" = "application/json"
  "X-FaroAI-AI-Chat-Consent" = "true"
}
$body = @{ message = "Show me diamond rings"; history = @(); state = @{} } | ConvertTo-Json -Depth 8
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3000/v1/chat -Headers $headers -Body $body
```

The catalogue connector should push product updates to `/v1/catalogue/sync`; the API searches the tenant's PostgreSQL `products` table. MCP live calls use the configured endpoint and tool allow-list. The initial live adapter invokes tools with `{ "query": message, "language": lang }`; MCP servers should expose that input shape or use an adapter that translates it.

## Model and MCP configuration

The default is `MODEL_PROVIDER=none`: FaroAI returns deterministic results from verified product/knowledge data. To enable a model, configure `MODEL_PROVIDER`, `MODEL_BASE_URL`, `MODEL_NAME`, and the provider key in `.env`. Supported adapters are OpenRouter, Ollama, and LM Studio using an OpenAI-compatible chat-completions API. OpenRouter requests default to `OPENROUTER_DATA_COLLECTION=deny`.

The optional decision model is configured separately using `DECISION_BASE_URL`, `DECISION_MODEL`, and `DECISION_API_KEY`. It may select only from the configured live source/tool allow-list. If unavailable, deterministic routing is used. Live price, stock, order, and other changing facts should be served by live MCP tools, not embedded knowledge.

For live MCP, inject `MCP_CONNECTIONS_JSON` from a secret manager. It maps the exact `endpoint_secret_ref` on a tenant source to `{ "url": "https://...", "bearer_token": "..." }`. Add each permitted hostname to `MCP_ALLOWED_HOSTS`. The adapter rejects hosts outside that list and requires HTTPS except for loopback development endpoints. Never put endpoint credentials in source records or browser requests.

## Data and privacy boundaries

- Tenant identity comes from the authenticated API key; request JSON cannot choose a tenant.
- PostgreSQL and Qdrant operations include tenant scope. Qdrant has API-key authentication and is only on the private data network.
- Only approved knowledge submitted through the indexing API enters Qdrant. Customer conversations and live MCP responses are not vectorized or cached as approved knowledge.
- Consented improvement/training interactions are scrubbed and stored as pending review candidates in PostgreSQL with a 90-day expiry window. Only human-approved RAG candidates are embedded into tenant-filtered Qdrant. Fine-tuning currently supports reviewed JSONL dataset export only; no training runner or model-weight updates are deployed.
- Redis is disposable coordination/cache storage. PostgreSQL remains the durable record for embedding job status.
- Keep the gateway API private behind the calling website backend or a TLS reverse proxy in production. Rotate API keys and secrets through the deployment secret manager.

## Reference implementation

`faroai_example/` contains the original portable PHP implementation, sample SQLite data, and its plan. Use it to compare the existing chat behavior while migrating callers and data into the new API. See `faroai_example/README.md` for its separate local run instructions.
