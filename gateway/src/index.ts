import { serve } from '@hono/node-server';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { randomUUID, createHash, createHmac } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { open as openFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { z } from 'zod';
import { artifactActorHash, artifactSchema } from './artifact-security.js';
import { adminRoutes, jevDecisionApiKey, mcpConnectionsForTenant, modelCandidatesForTenant, reserveModelCredit, settleModelCredit, type AdminVariables } from './admin.js';
const env = z.object({
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    PYTHON_SERVICE_URL: z.string().url(),
    FAROAI_INTERNAL_SECRET: z.string().min(32),
    API_KEY_PEPPER: z.string().min(32),
    MAX_BODY_BYTES: z.coerce.number().int().positive().default(32_768),
    FAROAI_ARTIFACT_ENABLED: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
    FAROAI_ARTIFACT_ROOT: z.string().default('/var/faroai/artifacts'),
    FAROAI_TENANT_MODE: z.enum(['multi', 'single']).default('multi'),
    FAROAI_SINGLE_TENANT_ID: z.string().default(''),
    FAROAI_DEPLOYMENT_MODE: z.enum(['hosted', 'self_hosted']).default('hosted'),
    FAROAI_LOCAL_LLM_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
    FAROAI_SHARED_TRAINING_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
    MCP_ALLOWED_HOSTS: z.string().default(''),
}).parse(process.env);
if (env.FAROAI_TENANT_MODE === 'single' && !z.string().uuid().safeParse(env.FAROAI_SINGLE_TENANT_ID).success) {
    throw new Error('FAROAI_SINGLE_TENANT_ID must be a valid UUID in single-tenant mode.');
}
const pool = new Pool({ connectionString: env.DATABASE_URL, max: 10, idleTimeoutMillis: 30_000 });
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: true });
if (env.FAROAI_TENANT_MODE === 'single') {
  const result = await pool.query<{ active_count: string; configured_is_active: boolean | null }>(
    `SELECT count(*)::text AS active_count,bool_or(id=$1::uuid) AS configured_is_active
       FROM tenants WHERE status='active'`,
    [env.FAROAI_SINGLE_TENANT_ID],
  );
  if (result.rows[0]?.active_count !== '1' || result.rows[0]?.configured_is_active !== true) {
    throw new Error('Single-tenant mode requires exactly the configured active tenant in PostgreSQL.');
  }
}
type AuthContext = { tenant: { id: string; consent_version: number }; scopes: string[]; apiKeyId: string; consent: { ai_chat: boolean; ai_improve: boolean; ai_training_local: boolean; ai_training_shared: boolean } };
type Variables = AdminVariables & { auth: AuthContext };
const app = new Hono<{ Variables: Variables }>();
const api = new Hono<{ Variables: Variables }>();
const chatSchema = z.object({
    message: z.string().trim().min(1).max(500),
    image_base64: z.string().max(2_000_000).optional(),
    image_media_type: z.enum(['image/jpeg', 'image/png', 'image/webp']).optional(),
    history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(1500) })).max(8).default([]),
    state: z.record(z.unknown()).default({}),
}).strict().refine((value) => Boolean(value.image_base64) === Boolean(value.image_media_type), { message: 'Image data and media type must be provided together.' });
const feedbackSchema = z.object({
    rating: z.enum(['up', 'down']),
    intent: z.string().regex(/^[a-z]{1,12}$/).default('other'),
    lang: z.enum(['en', 'th', 'fr']).default('en'),
    question: z.string().max(500).optional(),
}).strict();
const indexSchema = z.object({
    source_id: z.string().uuid(),
    source_version: z.string().min(1).max(120),
    documents: z.array(z.object({
        id: z.string().min(1).max(200),
        title: z.string().min(1).max(300),
        text: z.string().min(1).max(100_000),
        language: z.enum(['en', 'th', 'fr']).default('en'),
        content_version: z.string().min(1).max(120),
    }).strict()).min(1).max(100),
}).strict();
const sourceSchema = z.object({
    name: z.string().trim().min(1).max(120),
    mode: z.enum(['indexed', 'live']),
    allowed_resources: z.array(z.string().regex(/^[A-Za-z0-9_.:-]{1,100}$/)).max(50).default([]),
    allowed_tools: z.array(z.string().regex(/^[A-Za-z0-9_.:-]{1,100}$/)).max(50).default([]),
    refresh_seconds: z.number().int().min(60).max(2_592_000).nullable().default(null),
    endpoint_secret_ref: z.string().regex(/^tenant\/[0-9a-f-]{36}\/mcp\/[A-Za-z0-9_.-]{1,80}$/).nullable().default(null),
}).strict().refine((value) => value.mode !== 'indexed' || value.refresh_seconds !== null, { message: 'indexed sources need a refresh interval' });
const catalogueSchema = z.object({
    catalogue_version: z.string().min(1).max(120),
    products: z.array(z.object({
        id: z.string().min(1).max(200),
        sku: z.string().min(1).max(120),
        name: z.string().min(1).max(300),
        path: z.string().max(500).nullable().default(null),
        image: z.string().max(1000).nullable().default(null),
        product_type: z.string().max(80).nullable().default(null),
        metal: z.string().max(120).nullable().default(null),
        metal_karat: z.string().max(40).nullable().default(null),
        metal_color: z.string().max(80).nullable().default(null),
        stone_type: z.string().max(120).nullable().default(null),
        stone_shape: z.string().max(80).nullable().default(null),
        stone_carat: z.number().nonnegative().max(1000).nullable().default(null),
        price: z.number().nonnegative().max(1_000_000_000).nullable().default(null),
        currency: z.string().regex(/^[A-Z]{3}$/).default('USD'),
        weight: z.number().nonnegative().max(1_000_000).nullable().default(null),
        availability: z.string().max(80).nullable().default(null),
        search_text: z.string().max(4000).nullable().default(null),
        summary: z.string().max(2000).nullable().default(null),
    }).strict()).max(100).default([]),
    deleted_product_ids: z.array(z.string().min(1).max(200)).max(100).default([]),
}).strict().refine((value) => value.products.length > 0 || value.deleted_product_ids.length > 0, { message: 'At least one product upsert or deletion is required.' })
  .refine((value) => new Set(value.products.map((product) => product.id)).size === value.products.length, { message: 'Product IDs must be unique in a sync batch.' })
  .refine((value) => !value.products.some((product) => value.deleted_product_ids.includes(product.id)), { message: 'A product cannot be upserted and deleted in the same batch.' });
const fail = (c: Context<{ Variables: Variables }>, status: 400 | 401 | 403 | 404 | 409 | 413 | 429 | 500 | 502 | 503, code: string, message: string) => c.json({ success: false, error: code, message, correlation_id: c.get('correlationId') ?? randomUUID() }, status);
app.use('*', async (c, next) => {
    const correlationId = c.req.header('x-correlation-id');
    c.set('correlationId', correlationId && /^[A-Za-z0-9._-]{8,80}$/.test(correlationId) ? correlationId : randomUUID());
    c.header('Cache-Control', 'no-store');
    c.header('X-Content-Type-Options', 'nosniff');
    await next();
});
app.get('/health/live', (c) => c.json({ success: true, service: 'faroai-api' }));
app.get('/health/ready', async (c) => {
    try {
        await pool.query('SELECT 1');
        if (redis.status === 'wait')
            await redis.connect();
        await redis.ping();
        return c.json({ success: true, service: 'faroai-api' });
    }
    catch {
        return fail(c, 503, 'not_ready', 'Service dependencies are unavailable.');
    }
});
const authenticate: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
    const authorization = c.req.header('authorization') ?? '';
    const match = /^Bearer (fai_[A-Za-z0-9_-]{32,})$/.exec(authorization);
    if (!match)
        return fail(c, 401, 'unauthorized', 'A valid FaroAI server credential is required.');
    const keyHash = createHash('sha256').update(env.API_KEY_PEPPER).update(match[1]!).digest();
    const result = await pool.query(`SELECT k.id, k.tenant_id, k.scopes, t.consent_version
       FROM api_keys k JOIN tenants t ON t.id = k.tenant_id
      WHERE k.key_hash = $1 AND k.revoked_at IS NULL AND t.status = 'active'`, [keyHash]);
    const row = result.rows[0];
    if (!row)
        return fail(c, 401, 'unauthorized', 'A valid FaroAI server credential is required.');
    if (env.FAROAI_TENANT_MODE === 'single' && row.tenant_id !== env.FAROAI_SINGLE_TENANT_ID) {
        return fail(c, 403, 'tenant_disabled', 'This deployment is restricted to its configured tenant.');
    }
    void pool.query('UPDATE api_keys SET last_used_at=now() WHERE id=$1', [row.id]).catch(() => undefined);
    // Consent is supplied by the authenticated calling website backend, never in the JSON body.
    const consent = {
        ai_chat: c.req.header('x-faroai-ai-chat-consent') === 'true',
        ai_improve: c.req.header('x-faroai-ai-improve-consent') === 'true',
        ai_training_local: c.req.header('x-faroai-ai-training-local-consent') === 'true',
        ai_training_shared: env.FAROAI_DEPLOYMENT_MODE !== 'self_hosted' && env.FAROAI_SHARED_TRAINING_ENABLED && c.req.header('x-faroai-ai-training-shared-consent') === 'true',
    };
    c.set('auth', { tenant: { id: row.tenant_id, consent_version: row.consent_version }, scopes: row.scopes, apiKeyId: row.id, consent });
    await next();
};
const enforceScope = (scope: string): MiddlewareHandler<{ Variables: Variables }> => async (c, next) => {
    if (!c.get('auth').scopes.includes(scope))
        return fail(c, 403, 'forbidden', 'This credential does not have the required permission.');
    await next();
};
const rateLimit: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
    const auth = c.get('auth');
    const route = new URL(c.req.url).pathname.split('/').at(-1) ?? 'request';
    const key = `tenant:${auth.tenant.id}:rate:${route}`;
    try {
        const count = await redis.incr(key);
        if (count === 1)
            await redis.expire(key, 60);
        if (count > 60)
            return fail(c, 429, 'rate_limited', 'Too many requests. Please retry later.');
    }
    catch {
        return fail(c, 503, 'rate_limiter_unavailable', 'Requests are temporarily unavailable.');
    }
    await next();
};
async function callPython(path: string, payload: Record<string, unknown>, correlationId: string, timeoutMs = 35_000): Promise<Record<string, any>> {
    const body = JSON.stringify({ ...payload, tenant_id: payload.tenant_id, correlation_id: correlationId });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac('sha256', env.FAROAI_INTERNAL_SECRET).update(`${timestamp}.${body}`).digest('hex');
    let response;
    try {
        response = await fetch(new URL(path, env.PYTHON_SERVICE_URL), {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-faroai-timestamp': timestamp, 'x-faroai-signature': signature, 'x-correlation-id': correlationId },
            body,
            signal: AbortSignal.timeout(timeoutMs),
        });
    }
    catch {
        throw new Error('ai_service_unavailable');
    }
    const data = await response.json().catch(() => null);
    if (!response.ok || typeof data !== 'object' || data === null) {
        const detail = typeof data?.detail === 'string' ? data.detail : '';
        if (['paid_image_model_not_configured', 'image_request_over_model_limit', 'image_search_model_failed', 'image_type_mismatch', 'invalid_image', 'image_too_large', 'jev_image_model_decision_unavailable'].includes(detail))
            throw new Error(`ai_service:${detail}`);
        throw new Error('ai_service_failed');
    }
    return data;
}
api.use('*', authenticate, rateLimit);
const artifactMimes = { pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' } as const;
function artifactActor(c: Context<{ Variables: Variables }>): string | null {
    // This is an opaque server-side session token, never a tenant ID or username.
    const actor = c.req.header('x-faroai-artifact-actor') ?? '';
    const auth = c.get('auth');
    return artifactActorHash(env.API_KEY_PEPPER, auth.tenant.id, auth.apiKeyId, actor);
}
api.get('/artifacts/context', enforceScope('chat:write'), (c) => {
    if (!env.FAROAI_ARTIFACT_ENABLED) return fail(c, 503, 'artifacts_disabled', 'Document creation is not enabled for this deployment.');
    return c.json({ success: true, data: { tenant_id: c.get('auth').tenant.id } });
});
api.post('/artifacts', enforceScope('chat:write'), async (c) => {
    if (!env.FAROAI_ARTIFACT_ENABLED) return fail(c, 503, 'artifacts_disabled', 'Document creation is not enabled for this deployment.');
    const actor = artifactActor(c);
    if (!actor) return fail(c, 400, 'invalid_actor', 'A trusted artifact session is required.');
    const raw = await c.req.text();
    if (Buffer.byteLength(raw, 'utf8') > 512_000) return fail(c, 413, 'too_large', 'The document input is too large.');
    let value: unknown;
    try { value = JSON.parse(raw); } catch { return fail(c, 400, 'invalid_request', 'The document input is invalid.'); }
    const parsed = artifactSchema.safeParse(value);
    if (!parsed.success) return fail(c, 400, 'invalid_request', 'The document input is invalid or exceeds its limits.');
    const auth = c.get('auth');
    const id = randomUUID();
    const { format, ...input } = parsed.data;
    try {
        await pool.query(`INSERT INTO skill_artifact_jobs(tenant_id,id,api_key_id,actor_hash,format,input_payload,expires_at)
          VALUES($1,$2,$3,$4,$5,$6::jsonb,now()+interval '24 hours')`,
        [auth.tenant.id, id, auth.apiKeyId, actor, format, JSON.stringify(input)]);
        // Queue notification is only a wake-up. The committed DB job is durable.
        void redis.lpush('platform:queue:artifacts', id).then(() => redis.ltrim('platform:queue:artifacts', 0, 999)).catch(() => undefined);
        return c.json({ success: true, data: { id, status: 'pending', format, expires_in_seconds: 86400 } }, 202);
    } catch { return fail(c, 503, 'artifact_unavailable', 'The document job could not be created.'); }
});
async function getArtifact(c: Context<{ Variables: Variables }>) {
    const id = c.req.param('id');
    const actor = artifactActor(c);
    if (!actor || !z.string().uuid().safeParse(id).success) return null;
    const auth = c.get('auth');
    const result = await pool.query(`SELECT id,format,status,size_bytes,output_sha256,expires_at
      FROM skill_artifact_jobs WHERE tenant_id=$1 AND id=$2 AND api_key_id=$3 AND actor_hash=$4 AND expires_at>now()`,
    [auth.tenant.id, id, auth.apiKeyId, actor]);
    return result.rows[0] ?? null;
}
api.get('/artifacts/:id', enforceScope('chat:write'), async (c) => {
    if (!env.FAROAI_ARTIFACT_ENABLED) return fail(c, 503, 'artifacts_disabled', 'Document creation is not enabled for this deployment.');
    const item = await getArtifact(c);
    if (!item) return fail(c, 404, 'not_found', 'The document job was not found.');
    return c.json({ success: true, data: { id: item.id, status: item.status, format: item.format, expires_at: item.expires_at } });
});
api.get('/artifacts/:id/download', enforceScope('chat:write'), async (c) => {
    if (!env.FAROAI_ARTIFACT_ENABLED) return fail(c, 503, 'artifacts_disabled', 'Document creation is not enabled for this deployment.');
    const item = await getArtifact(c);
    if (!item || item.status !== 'completed' || !(item.format in artifactMimes)) return fail(c, 404, 'not_found', 'The document was not found.');
    try {
        const file = await openFile(join(env.FAROAI_ARTIFACT_ROOT, c.get('auth').tenant.id, `${item.id}.${item.format}`), fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
        try {
            const stat = await file.stat();
            if (!stat.isFile() || stat.size <= 0 || stat.size > 10 * 1024 * 1024 || stat.size !== Number(item.size_bytes)) throw new Error('invalid_artifact');
            const bytes = await file.readFile();
            if (createHash('sha256').update(bytes).digest('hex') !== item.output_sha256) throw new Error('invalid_artifact');
            return new Response(bytes, { headers: { 'Content-Type': artifactMimes[item.format as keyof typeof artifactMimes],
                'Content-Disposition': `attachment; filename="faroai-report.${item.format}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
        } finally { await file.close(); }
    } catch { return fail(c, 404, 'not_found', 'The document was not found.'); }
});
api.get('/skills/base', enforceScope('chat:write'), async (c) => {
    try {
        const catalog = await callPython('/internal/v1/skills/catalog', {
            tenant_id: c.get('auth').tenant.id,
        }, c.get('correlationId'), 5_000);
        if (!Array.isArray(catalog.skills))
            return fail(c, 503, 'base_skill_catalog_unavailable', 'The Base Skills catalog is temporarily unavailable.');
        return c.json({ success: true, data: catalog, correlation_id: c.get('correlationId') });
    } catch {
        return fail(c, 503, 'base_skill_catalog_unavailable', 'The Base Skills catalog is temporarily unavailable.');
    }
});
api.post('/chat', enforceScope('chat:write'), async (c) => {
    const raw = await c.req.text();
    if (Buffer.byteLength(raw, 'utf8') > 2_100_000)
        return fail(c, 413, 'too_large', 'The request is too large.');
    let input;
    try {
        input = JSON.parse(raw);
    }
    catch {
        return fail(c, 400, 'invalid_request', 'The request must contain valid JSON.');
    }
    const parsed = chatSchema.safeParse(input);
    if (!parsed.success)
        return fail(c, 400, 'invalid_request', 'The chat request is invalid.');
    const auth = c.get('auth');
    if (!auth.consent.ai_chat)
        return fail(c, 403, 'consent_required', 'Chat consent is required.');
    let modelCandidates: Awaited<ReturnType<typeof modelCandidatesForTenant>> = [];
    let mcpConnections: Awaited<ReturnType<typeof mcpConnectionsForTenant>> = [];
    let decisionApiKey = '';
    let reservationId = null;
    try {
        modelCandidates = await modelCandidatesForTenant(auth.tenant.id);
        mcpConnections = await mcpConnectionsForTenant(auth.tenant.id);
        decisionApiKey = await jevDecisionApiKey();
        if (modelCandidates.length > 0 || decisionApiKey) {
            reservationId = await reserveModelCredit(auth.tenant.id, c.get('correlationId'));
            if (!reservationId) {
                modelCandidates = [];
                decisionApiKey = '';
            }
        }
    }
    catch {
        return fail(c, 503, 'tenant_configuration_unavailable', 'The model or MCP configuration is temporarily unavailable.');
    }
    try {
        const result = await callPython('/internal/v1/chat', {
            tenant_id: auth.tenant.id,
            consent: auth.consent,
            decision_api_key: decisionApiKey,
            provider_candidates: modelCandidates,
            mcp_connections: mcpConnections,
            message: parsed.data.message,
            image_base64: parsed.data.image_base64,
            image_media_type: parsed.data.image_media_type,
            history: parsed.data.history,
            state: parsed.data.state,
        }, c.get('correlationId'), parsed.data.image_base64 ? 65_000 : 35_000);
        if (reservationId)
            await settleModelCredit(reservationId, result.ai === true || result.decision_used === true);
        return c.json({ ...result, success: true, correlation_id: c.get('correlationId') });
    }
    catch (error) {
        if (reservationId)
            await settleModelCredit(reservationId, false).catch(() => undefined);
        if (error instanceof Error && error.message === 'ai_service:paid_image_model_not_configured')
            return fail(c, 409, 'image_model_unavailable', 'Configure a paid image-capable model with a verified per-image price and allow at least one image per request.');
        if (error instanceof Error && error.message === 'ai_service:image_request_over_model_limit')
            return fail(c, 409, 'image_request_over_limit', 'This image search exceeds the model token or request cost limit.');
        if (error instanceof Error && error.message === 'ai_service:image_search_model_failed')
            return fail(c, 502, 'image_search_failed', 'The configured model could not analyze this image. Try another image or model.');
        if (error instanceof Error && error.message === 'ai_service:jev_image_model_decision_unavailable')
            return fail(c, 503, 'image_model_decision_unavailable', 'Jev could not select an eligible image model right now. Please try again.');
        if (error instanceof Error && ['ai_service:image_type_mismatch', 'ai_service:invalid_image', 'ai_service:image_too_large'].includes(error.message))
            return fail(c, 400, 'invalid_image', 'Use a valid JPEG, PNG, or WebP image smaller than 1.5 MB.');
        return fail(c, 502, 'ai_service_failed', 'The assistant is temporarily unavailable.');
    }
});
api.post('/feedback', enforceScope('feedback:write'), async (c) => {
    const raw = await c.req.text();
    if (Buffer.byteLength(raw, 'utf8') > env.MAX_BODY_BYTES)
        return fail(c, 413, 'too_large', 'The request is too large.');
    let input;
    try {
        input = JSON.parse(raw);
    }
    catch {
        return fail(c, 400, 'invalid_request', 'The request must contain valid JSON.');
    }
    const parsed = feedbackSchema.safeParse(input);
    if (!parsed.success)
        return fail(c, 400, 'invalid_request', 'The feedback request is invalid.');
    try {
        const result = await callPython('/internal/v1/feedback', {
            tenant_id: c.get('auth').tenant.id,
            consent: c.get('auth').consent,
            ...parsed.data,
        }, c.get('correlationId'));
        return c.json({ ...result, success: true, correlation_id: c.get('correlationId') });
    }
    catch {
        return fail(c, 502, 'ai_service_failed', 'Feedback could not be recorded.');
    }
});
api.post('/knowledge/index', enforceScope('knowledge:write'), async (c) => {
    const raw = await c.req.text();
    if (Buffer.byteLength(raw, 'utf8') > env.MAX_BODY_BYTES * 10)
        return fail(c, 413, 'too_large', 'The indexing request is too large.');
    let input;
    try {
        input = JSON.parse(raw);
    }
    catch {
        return fail(c, 400, 'invalid_request', 'The request must contain valid JSON.');
    }
    const parsed = indexSchema.safeParse(input);
    if (!parsed.success)
        return fail(c, 400, 'invalid_request', 'The indexing request is invalid.');
    try {
        const result = await callPython('/internal/v1/knowledge/index', {
            tenant_id: c.get('auth').tenant.id,
            ...parsed.data,
        }, c.get('correlationId'));
        return c.json({ ...result, success: true, correlation_id: c.get('correlationId') }, 202);
    }
    catch {
        return fail(c, 502, 'ai_service_failed', 'The indexing request could not be accepted.');
    }
});
api.post('/mcp/sources', enforceScope('mcp:write'), async (c) => {
    const raw = await c.req.text();
    if (Buffer.byteLength(raw, 'utf8') > env.MAX_BODY_BYTES)
        return fail(c, 413, 'too_large', 'The request is too large.');
    let input;
    try {
        input = JSON.parse(raw);
    }
    catch {
        return fail(c, 400, 'invalid_request', 'The request must contain valid JSON.');
    }
    const parsed = sourceSchema.safeParse(input);
    if (!parsed.success)
        return fail(c, 400, 'invalid_request', 'The source configuration is invalid.');
    const auth = c.get('auth');
    if (parsed.data.endpoint_secret_ref && !parsed.data.endpoint_secret_ref.startsWith(`tenant/${auth.tenant.id}/mcp/`)) {
        return fail(c, 400, 'invalid_request', 'The source secret reference must belong to this tenant.');
    }
    if (parsed.data.mode === 'live' && parsed.data.allowed_tools.length === 0) {
        return fail(c, 400, 'invalid_request', 'Live sources must define an allow-list of tools.');
    }
    if (parsed.data.mode === 'indexed' && parsed.data.allowed_resources.length === 0) {
        return fail(c, 400, 'invalid_request', 'Indexed sources must define an allow-list of resources.');
    }
    const result = await pool.query(`INSERT INTO mcp_sources(tenant_id,name,mode,endpoint_secret_ref,allowed_resources,allowed_tools,refresh_seconds,status)
     VALUES($1,$2,$3,$4,$5,$6,$7,'active') RETURNING id`, [auth.tenant.id, parsed.data.name, parsed.data.mode, parsed.data.endpoint_secret_ref,
        parsed.data.allowed_resources, parsed.data.allowed_tools, parsed.data.refresh_seconds]);
    const sourceId = result.rows[0]?.id;
    if (!sourceId)
        return fail(c, 500, 'server_error', 'The source could not be saved.');
    await pool.query(`INSERT INTO audit_events(tenant_id,correlation_id,actor_key_id,action,resource_type,resource_id)
     VALUES($1,$2,$3,'mcp.source.created','mcp_source',$4)`, [auth.tenant.id, c.get('correlationId'), auth.apiKeyId, sourceId]);
    return c.json({ success: true, source: { id: sourceId, name: parsed.data.name, mode: parsed.data.mode, status: 'active' }, correlation_id: c.get('correlationId') }, 201);
});
api.get('/mcp/sources', enforceScope('mcp:write'), async (c) => {
    const result = await pool.query(`SELECT id,name,mode,allowed_resources,allowed_tools,refresh_seconds,source_version,status,last_synced_at
       FROM mcp_sources WHERE tenant_id=$1 ORDER BY created_at DESC`, [c.get('auth').tenant.id]);
    return c.json({ success: true, sources: result.rows, correlation_id: c.get('correlationId') });
});
api.post('/catalogue/sync', enforceScope('catalogue:write'), async (c) => {
    const raw = await c.req.text();
    if (Buffer.byteLength(raw, 'utf8') > env.MAX_BODY_BYTES * 10)
        return fail(c, 413, 'too_large', 'The catalogue batch is too large.');
    let input;
    try {
        input = JSON.parse(raw);
    }
    catch {
        return fail(c, 400, 'invalid_request', 'The request must contain valid JSON.');
    }
    const parsed = catalogueSchema.safeParse(input);
    if (!parsed.success)
        return fail(c, 400, 'invalid_request', 'The catalogue batch is invalid.');
    const auth = c.get('auth');
    const embeddingJobId = randomUUID();
    const embeddingModel = process.env.EMBEDDING_MODEL ?? 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2';
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const product of parsed.data.products) {
            await client.query(`INSERT INTO products(tenant_id,id,sku,name,path,image,product_type,metal,metal_karat,metal_color,stone_type,stone_shape,stone_carat,price,currency,weight,availability,search_text,summary,catalogue_version,updated_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,now())
         ON CONFLICT (tenant_id,id) DO UPDATE SET sku=EXCLUDED.sku,name=EXCLUDED.name,path=EXCLUDED.path,image=EXCLUDED.image,
           product_type=EXCLUDED.product_type,metal=EXCLUDED.metal,metal_karat=EXCLUDED.metal_karat,metal_color=EXCLUDED.metal_color,
           stone_type=EXCLUDED.stone_type,stone_shape=EXCLUDED.stone_shape,stone_carat=EXCLUDED.stone_carat,price=EXCLUDED.price,
           currency=EXCLUDED.currency,weight=EXCLUDED.weight,availability=EXCLUDED.availability,search_text=EXCLUDED.search_text,
           summary=EXCLUDED.summary,catalogue_version=EXCLUDED.catalogue_version,updated_at=now()`, [auth.tenant.id, product.id, product.sku, product.name, product.path, product.image, product.product_type,
                product.metal, product.metal_karat, product.metal_color, product.stone_type, product.stone_shape,
                product.stone_carat, product.price, product.currency, product.weight, product.availability,
                product.search_text, product.summary, parsed.data.catalogue_version]);
        }
        await client.query(`INSERT INTO embedding_jobs(tenant_id,id,source_id,source_version,collection_name,embedding_model,job_kind,status,total_documents,payload,correlation_id)
         VALUES($1,$2,NULL,$3,'faroai_products_v1',$4,'catalogue_products','pending',$5,$6,$7)`, [
            auth.tenant.id, embeddingJobId, parsed.data.catalogue_version, embeddingModel,
            parsed.data.products.length + parsed.data.deleted_product_ids.length,
            JSON.stringify({ product_ids: parsed.data.products.map((product) => product.id), deleted_product_ids: parsed.data.deleted_product_ids }),
            c.get('correlationId'),
        ]);
        await client.query(`INSERT INTO audit_events(tenant_id,correlation_id,actor_key_id,action,resource_type,resource_id,metadata)
       VALUES($1,$2,$3,'catalogue.synced','catalogue',$4,$5)`, [auth.tenant.id, c.get('correlationId'), auth.apiKeyId, parsed.data.catalogue_version,
            JSON.stringify({ product_count: parsed.data.products.length, deleted_product_count: parsed.data.deleted_product_ids.length, embedding_job_id: embeddingJobId })]);
        await client.query('COMMIT');
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    }
    try {
        await redis.xadd('platform:queue:embedding', 'MAXLEN', '~', 100_000, '*', 'job_id', embeddingJobId, 'tenant_id', auth.tenant.id);
        await pool.query("UPDATE embedding_jobs SET status='queued',updated_at=now() WHERE tenant_id=$1 AND id=$2 AND status='pending'", [auth.tenant.id, embeddingJobId]);
    }
    catch { /* The durable pending job is picked up by worker reconciliation. */ }
    return c.json({ success: true, accepted: parsed.data.products.length, deleted: parsed.data.deleted_product_ids.length,
      embedding_job_id: embeddingJobId, embedding_status: 'pending', catalogue_version: parsed.data.catalogue_version, correlation_id: c.get('correlationId') }, 202);
});
api.get('/embedding/jobs/:jobId', enforceScope('knowledge:write'), async (c) => {
    const jobId = c.req.param('jobId');
    if (!/^[0-9a-f-]{36}$/i.test(jobId))
        return fail(c, 400, 'invalid_request', 'The job identifier is invalid.');
    const result = await pool.query(`SELECT id,status,total_documents,completed_documents,source_version,collection_name,embedding_model,job_kind,error_code,created_at,updated_at
       FROM embedding_jobs WHERE tenant_id=$1 AND id=$2`, [c.get('auth').tenant.id, jobId]);
    if (!result.rows[0])
        return fail(c, 404, 'not_found', 'The job was not found.');
    return c.json({ success: true, job: result.rows[0], correlation_id: c.get('correlationId') });
});
app.route('/admin/v1', adminRoutes);
app.route('/v1', api);
app.notFound((c) => fail(c, 404, 'not_found', 'The requested endpoint was not found.'));
app.onError((error, c) => {
    console.error(JSON.stringify({ event: 'request_failed', correlation_id: c.get('correlationId'), name: error.name }));
    return fail(c, 500, 'server_error', 'The request could not be completed.');
});
serve({ fetch: app.fetch, port: env.PORT, hostname: '0.0.0.0' });
process.on('SIGTERM', async () => {
    await Promise.allSettled([pool.end(), redis.quit()]);
    process.exit(0);
});
