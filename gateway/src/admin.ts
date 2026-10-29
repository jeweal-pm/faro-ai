// @ts-nocheck
export type AdminVariables = { correlationId: string; platformAdmin: { email: string; authMethod: 'oidc' | 'local' | 'service' }; csrfHash: Buffer };
import { verify } from '@node-rs/argon2';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import * as oidc from 'openid-client';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { z } from 'zod';
import { allowedProviderForDeployment, decryptProviderSecret, encryptProviderSecret, hashToken, maskSecretHint, parseEncryptionKey, safeEqual, validateMcpEndpoint, validateProviderEndpoint, } from './admin-security.js';
const bool = (fallback) => z.enum(['true', 'false']).default(fallback).transform((value) => value === 'true');
const env = z.object({
    DATABASE_URL: z.string().min(1),
    API_KEY_PEPPER: z.string().min(32),
    REDIS_URL: z.string().min(1),
    PYTHON_SERVICE_URL: z.string().url().default('http://ai-service:8000'),
    FAROAI_INTERNAL_SECRET: z.string().default(''),
    BACKOFFICE_ENABLED: bool('false'),
    BACKOFFICE_OIDC_ENABLED: bool('false'),
    BACKOFFICE_LOCAL_AUTH_ENABLED: bool('false'),
    BACKOFFICE_ADMIN_EMAILS: z.string().default(''),
    BACKOFFICE_OIDC_ISSUER_URL: z.string().default(''),
    BACKOFFICE_OIDC_CLIENT_ID: z.string().default(''),
    BACKOFFICE_OIDC_CLIENT_SECRET: z.string().default(''),
    BACKOFFICE_OIDC_REDIRECT_URI: z.string().default(''),
    BACKOFFICE_LOCAL_ADMIN_EMAIL: z.string().default(''),
    BACKOFFICE_LOCAL_ADMIN_PASSWORD_HASH_B64: z.string().default(''),
    BACKOFFICE_URL: z.string().default('http://127.0.0.1:3001'),
    BACKOFFICE_COOKIE_SECURE: bool('false'),
    FAROAI_CONFIG_ENCRYPTION_KEY: z.string().default(''),
    FAROAI_TENANT_MODE: z.enum(['multi', 'single']).default('multi'),
    FAROAI_SINGLE_TENANT_ID: z.string().default(''),
    FAROAI_DEPLOYMENT_MODE: z.enum(['hosted', 'self_hosted']).default('hosted'),
    FAROAI_ALLOW_EXTERNAL_PROVIDERS: bool('false'),
    FAROAI_LOCAL_LLM_ENABLED: bool('false'),
    FAROAI_SHARED_TRAINING_ENABLED: bool('false'),
    FAROAI_ALLOWED_LOCAL_MODEL_HOSTS: z.string().default(''),
    MCP_ALLOWED_HOSTS: z.string().default(''),
    MCP_ALLOW_DOCKER_HOST_HTTP: bool('false'),
}).parse(process.env);
if (env.BACKOFFICE_ENABLED) {
    const hasOidc = env.BACKOFFICE_OIDC_ENABLED
        && !!env.BACKOFFICE_OIDC_ISSUER_URL
        && !!env.BACKOFFICE_OIDC_CLIENT_ID
        && !!env.BACKOFFICE_OIDC_CLIENT_SECRET
        && !!env.BACKOFFICE_OIDC_REDIRECT_URI
        && env.BACKOFFICE_ADMIN_EMAILS.split(',').some((email) => email.trim());
    const hasLocal = env.BACKOFFICE_LOCAL_AUTH_ENABLED
        && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.BACKOFFICE_LOCAL_ADMIN_EMAIL)
        && Buffer.from(env.BACKOFFICE_LOCAL_ADMIN_PASSWORD_HASH_B64, 'base64').toString('utf8').startsWith('$argon2id$');
    if (!hasOidc && !hasLocal)
        throw new Error('Backoffice is enabled but no complete OIDC or local admin login is configured.');
    if (env.FAROAI_TENANT_MODE === 'single' && !z.string().uuid().safeParse(env.FAROAI_SINGLE_TENANT_ID).success) {
        throw new Error('FAROAI_SINGLE_TENANT_ID must be a valid UUID in single-tenant mode.');
    }
    if (!env.FAROAI_CONFIG_ENCRYPTION_KEY)
        throw new Error('FAROAI_CONFIG_ENCRYPTION_KEY is required when Backoffice is enabled.');
    parseEncryptionKey(env.FAROAI_CONFIG_ENCRYPTION_KEY);
}
const pool = new Pool({ connectionString: env.DATABASE_URL, max: 5, idleTimeoutMillis: 30_000 });
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: true });
const ADMIN_SESSION_SECONDS = 8 * 60 * 60;
const SESSION_COOKIE = env.BACKOFFICE_COOKIE_SECURE ? '__Host-faroai_admin' : 'faroai_admin';
const CSRF_COOKIE = env.BACKOFFICE_COOKIE_SECURE ? '__Host-faroai_admin_csrf' : 'faroai_admin_csrf';
const STATE_COOKIE = env.BACKOFFICE_COOKIE_SECURE ? '__Host-faroai_oidc_state' : 'faroai_oidc_state';
const allowedLocalHosts = new Set(env.FAROAI_ALLOWED_LOCAL_MODEL_HOSTS.split(',').map((host) => host.trim().toLowerCase()).filter(Boolean));
const allowedMcpHosts = new Set(env.MCP_ALLOWED_HOSTS.split(',').map((host) => host.trim().toLowerCase()).filter(Boolean));
const MAX_PROVIDER_MODEL_RESPONSE_BYTES = 3 * 1024 * 1024;
const MAX_PROVIDER_MODEL_COUNT = 5_000;
function providerModelListUrl(provider, endpoint) {
    if (provider === 'ollama')
        return { url: new URL('/api/tags', endpoint.origin), lmStudioNative: false };
    const basePath = endpoint.pathname.replace(/\/+$/, '');
    if (provider === 'openrouter')
        return { url: new URL(`${basePath}/models`, endpoint.origin), lmStudioNative: false };
    if (basePath.endsWith('/v1'))
        return { url: new URL(`${basePath}/models`, endpoint.origin), lmStudioNative: false };
    return { url: new URL(`${basePath}/api/v1/models`, endpoint.origin), lmStudioNative: true };
}
async function readBoundedResponse(response, maxBytes) {
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes)
        throw new Error('provider_model_response_too_large');
    if (!response.body)
        return '';
    const reader = response.body.getReader();
    const chunks = [];
    let totalBytes = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            totalBytes += value.byteLength;
            if (totalBytes > maxBytes) {
                await reader.cancel();
                throw new Error('provider_model_response_too_large');
            }
            chunks.push(value);
        }
    }
    finally {
        reader.releaseLock();
    }
    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
}
function parseProviderModels(provider, lmStudioNative, value) {
    if (typeof value !== 'object' || value === null)
        throw new Error('provider_model_response_invalid');
    const record = value;
    const source = provider === 'ollama' || lmStudioNative ? record.models : record.data;
    if (!Array.isArray(source) || source.length > MAX_PROVIDER_MODEL_COUNT)
        throw new Error('provider_model_response_invalid');
    const unique = new Map();
    for (const raw of source) {
        if (typeof raw !== 'object' || raw === null)
            continue;
        const item = raw;
        const candidates = provider === 'ollama' ? [item.name, item.model]
            : lmStudioNative ? [item.key, item.id]
                : [item.id, item.key, item.name];
        const modelId = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim().length > 0)?.trim();
        if (!modelId || modelId.length > 160 || /[\u0000-\u001f\u007f]/.test(modelId))
            continue;
        const display = [item.display_name, item.name].find((candidate) => typeof candidate === 'string' && candidate.trim().length > 0)?.trim();
        const pricing = !lmStudioNative && provider === 'openrouter' && typeof item.pricing === 'object' && item.pricing !== null
            ? item.pricing : null;
        const perTokenPrice = (value) => {
            const parsed = typeof value === 'string' || typeof value === 'number' ? Number(value) : Number.NaN;
            if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1)
                return null;
            return Number((parsed * 1_000_000).toFixed(12));
        };
        const perImagePrice = (value) => {
            const parsed = typeof value === 'string' || typeof value === 'number' ? Number(value) : Number.NaN;
            return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1_000_000 ? parsed : null;
        };
        unique.set(modelId, {
            model_id: modelId,
            display_name: (display && display.length <= 240 ? display : modelId),
            input_usd_per_million_tokens: pricing ? perTokenPrice(pricing.prompt) : null,
            output_usd_per_million_tokens: pricing ? perTokenPrice(pricing.completion) : null,
            image_usd_per_image: pricing ? perImagePrice(pricing.image) : null,
        });
    }
    if (source.length > 0 && unique.size === 0)
        throw new Error('provider_model_response_invalid');
    return [...unique.values()].sort((left, right) => left.model_id.localeCompare(right.model_id));
}
export const adminRoutes = new Hono();
const loginSchema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(1024) }).strict();
const tenantCreateSchema = z.object({ name: z.string().trim().min(1).max(120) }).strict();
const tenantPatchSchema = z.object({ name: z.string().trim().min(1).max(120).optional(), status: z.enum(['active', 'suspended']).optional() }).strict().refine((data) => Object.keys(data).length > 0);
const creditSchema = z.object({ amount: z.number().int().min(-1_000_000_000).max(1_000_000_000).refine((value) => value !== 0), entry_type: z.enum(['grant', 'adjustment']), reason: z.string().trim().min(3).max(500) }).strict();
const providerSchema = z.object({
    provider: z.enum(['openrouter', 'ollama', 'lmstudio']),
    name: z.string().trim().min(1).max(100),
    endpoint_url: z.string().url().max(500),
    max_input_usd_per_million_tokens: z.number().finite().min(0).max(10),
    max_output_usd_per_million_tokens: z.number().finite().min(0).max(10),
    max_image_usd_per_image: z.number().finite().min(0).max(10).default(0),
    enabled: z.boolean().default(true),
    secret: z.string().max(4000).optional(),
}).strict();
const modelCandidatesSchema = z.object({
    max_estimated_cost_per_request_usd: z.number().finite().min(0).max(100).nullable().optional().default(null),
    max_input_tokens: z.number().int().min(128).max(128000).default(8192),
    max_images_per_request: z.number().int().min(0).max(16).default(0),
}).strict();
const providerPriceLimitsSchema = z.object({
    max_input_usd_per_million_tokens: z.number().finite().min(0).max(10),
    max_output_usd_per_million_tokens: z.number().finite().min(0).max(10),
    max_image_usd_per_image: z.number().finite().min(0).max(10).default(0),
}).strict();
const mcpConnectionSchema = z.object({
    display_name: z.string().trim().min(1).max(120),
    endpoint_url: z.string().url().max(1000),
    auth_method: z.enum(['bearer', 'x-api-key']).default('bearer'),
    api_key: z.string().trim().min(1).max(4000).optional(),
    enabled: z.boolean().default(true),
    allowed_tools: z.array(z.string().regex(/^[A-Za-z0-9_.:-]{1,100}$/)).max(50).default([]),
}).strict();
const learningSettingsSchema = z.object({
    local_training_authorized: z.boolean().default(false),
    local_authorization_reference: z.string().trim().max(300).optional().nullable(),
    shared_training_authorized: z.boolean(),
    authorization_reference: z.string().trim().max(300).optional().nullable(),
}).strict();
const learningReviewSchema = z.object({
    review_status: z.enum(['approved', 'rejected']),
    preferred_answer: z.string().trim().min(1).max(8000).optional(),
    add_to_rag: z.boolean().default(false),
    add_to_local_training: z.boolean().default(false),
    add_to_shared_training: z.boolean().default(false),
}).strict().refine((value) => value.review_status !== 'rejected'
    || (!value.add_to_rag && !value.add_to_local_training && !value.add_to_shared_training))
    .refine((value) => value.review_status !== 'approved'
    || value.add_to_rag || value.add_to_local_training || value.add_to_shared_training);
const knowledgeDocumentSchema = z.object({
    title: z.string().trim().min(1).max(300),
    language: z.enum(['en', 'th', 'fr']),
    content: z.string().trim().min(1).max(100_000),
}).strict();
const pageParams = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25), offset: z.coerce.number().int().min(0).max(100_000).default(0) });
const fail = (c, status, code, message) => c.json({ success: false, error: code, message, correlation_id: c.get('correlationId') }, status);
function setSessionCookies(c, token, csrf) {
    const cookieBase = { path: '/', httpOnly: true, secure: env.BACKOFFICE_COOKIE_SECURE, sameSite: 'Lax', maxAge: ADMIN_SESSION_SECONDS };
    setCookie(c, SESSION_COOKIE, token, cookieBase);
    setCookie(c, CSRF_COOKIE, csrf, { ...cookieBase, httpOnly: false });
}
function clearSessionCookies(c) {
    deleteCookie(c, SESSION_COOKIE, { path: '/', secure: env.BACKOFFICE_COOKIE_SECURE, sameSite: 'Lax' });
    deleteCookie(c, CSRF_COOKIE, { path: '/', secure: env.BACKOFFICE_COOKIE_SECURE, sameSite: 'Lax' });
}
function checkOrigin(c) {
    const origin = c.req.header('origin');
    if (!origin)
        return false;
    try {
        return new URL(origin).origin === new URL(env.BACKOFFICE_URL).origin;
    }
    catch {
        return false;
    }
}
async function createSession(c, email, authMethod) {
    const token = randomBytes(32).toString('base64url');
    const csrf = randomBytes(32).toString('base64url');
    await pool.query(`INSERT INTO platform_admin_sessions(token_hash,admin_email,auth_method,csrf_hash,expires_at)
     VALUES($1,$2,$3,$4,now()+interval '8 hours')`, [hashToken(token), email.toLowerCase(), authMethod, hashToken(csrf)]);
    setSessionCookies(c, token, csrf);
    await pool.query(`INSERT INTO audit_events(tenant_id,correlation_id,actor_email,actor_kind,action,resource_type,metadata)
     VALUES(NULL,$1,$2,'platform_admin','platform.admin.login','platform_admin','{}')`, [c.get('correlationId'), email.toLowerCase()]);
}
const requireAdmin = async (c, next) => {
    if (!env.BACKOFFICE_ENABLED)
        return fail(c, 404, 'not_found', 'Backoffice is disabled.');
    const token = getCookie(c, SESSION_COOKIE);
    if (!token) {
        // Prompt-originated GIS operations use a server-held tenant credential.
        // Keep this exception limited to the four GIS workflow endpoints; it cannot
        // grant access to Backoffice administration or tenant-management routes.
        const path = c.req.path.replace(/^\/admin\/v1/, '');
        const match = /^\/tenants\/([0-9a-f-]{36})(?:\/(product-creation\/(?:drafts|tool)|procurement\/(?:assistant|confirm)))?$/i.exec(path);
        const bearer = /^Bearer (fai_[A-Za-z0-9_-]{32,})$/.exec(c.req.header('authorization') ?? '');
        const tenantLookup = c.req.method === 'GET' && !!match && !match[2];
        const promptOperation = c.req.method === 'POST' && !!match?.[2];
        if ((!tenantLookup && !promptOperation) || !bearer)
            return fail(c, 401, 'unauthorized', 'A platform admin session is required.');
        const keyHash = createHash('sha256').update(env.API_KEY_PEPPER).update(bearer[1]!).digest();
        const serviceResult = await pool.query(`SELECT k.id,k.tenant_id,k.scopes,t.status
          FROM api_keys k JOIN tenants t ON t.id=k.tenant_id
          WHERE k.key_hash=$1 AND k.revoked_at IS NULL`, [keyHash]);
        const service = serviceResult.rows[0];
        const allowedScopes = tenantLookup ? ['gis:product:write', 'gis:procurement:write']
            : match[2]!.startsWith('product-creation/') ? ['gis:product:write'] : ['gis:procurement:write'];
        if (!service || service.status !== 'active' || service.tenant_id !== match[1]
            || !Array.isArray(service.scopes) || !allowedScopes.some((scope) => service.scopes.includes(scope))
            || (env.FAROAI_TENANT_MODE === 'single' && service.tenant_id !== env.FAROAI_SINGLE_TENANT_ID))
            return fail(c, 403, 'forbidden', 'The configured tenant credential cannot perform this GIS operation.');
        c.set('platformAdmin', { email: `tenant-api-key:${service.id}`, authMethod: 'service' });
        c.set('csrfHash', Buffer.alloc(0));
        void pool.query('UPDATE api_keys SET last_used_at=now() WHERE id=$1', [service.id]).catch(() => undefined);
        await next();
        return;
    }
    const result = await pool.query(`SELECT admin_email,auth_method,csrf_hash FROM platform_admin_sessions
      WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()`, [hashToken(token)]);
    const session = result.rows[0];
    if (!session)
        return fail(c, 401, 'unauthorized', 'The platform admin session has expired.');
    const safeMethod = ['GET', 'HEAD', 'OPTIONS'].includes(c.req.method);
    const origin = c.req.header('origin');
    if ((origin && !checkOrigin(c)) || (!origin && !safeMethod))
        return fail(c, 403, 'forbidden', 'The request origin is not allowed.');
    if (!safeMethod) {
        const csrfCookie = getCookie(c, CSRF_COOKIE) ?? '';
        const csrfHeader = c.req.header('x-csrf-token') ?? '';
        const csrfHash = hashToken(csrfCookie);
        if (!csrfCookie || !csrfHeader || !safeEqual(csrfCookie, csrfHeader) || csrfHash.length !== session.csrf_hash.length || !timingSafeEqual(csrfHash, session.csrf_hash)) {
            return fail(c, 403, 'csrf_failed', 'The request could not be verified.');
        }
    }
    c.set('platformAdmin', { email: session.admin_email, authMethod: session.auth_method });
    c.set('csrfHash', session.csrf_hash);
    void pool.query('UPDATE platform_admin_sessions SET last_seen_at=now() WHERE token_hash=$1', [hashToken(token)]).catch(() => undefined);
    await next();
};
const gisPromptActorKind = (c) => c.get('platformAdmin').authMethod === 'service' ? 'tenant_api' : 'platform_admin';
adminRoutes.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    await next();
});
adminRoutes.get('/auth/config', (c) => {
    if (!env.BACKOFFICE_ENABLED)
        return fail(c, 404, 'not_found', 'Backoffice is disabled.');
    return c.json({ success: true, data: {
            oidc_enabled: env.BACKOFFICE_OIDC_ENABLED,
            local_enabled: env.BACKOFFICE_LOCAL_AUTH_ENABLED,
            oidc_label: env.BACKOFFICE_OIDC_ISSUER_URL ? new URL(env.BACKOFFICE_OIDC_ISSUER_URL).hostname : null,
        }, correlation_id: c.get('correlationId') });
});
adminRoutes.post('/auth/local/login', async (c) => {
    if (!env.BACKOFFICE_ENABLED || !env.BACKOFFICE_LOCAL_AUTH_ENABLED)
        return fail(c, 404, 'not_found', 'Local login is disabled.');
    if (!checkOrigin(c))
        return fail(c, 403, 'forbidden', 'The request origin is not allowed.');
    const parsed = loginSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
        return fail(c, 400, 'invalid_request', 'Email and password are required.');
    const email = parsed.data.email.trim().toLowerCase();
    const rateKey = `platform:auth:local:${hashToken(email).toString('hex')}`;
    try {
        const attempts = await redis.incr(rateKey);
        if (attempts === 1)
            await redis.expire(rateKey, 900);
        if (attempts > 8)
            return fail(c, 429, 'rate_limited', 'Too many login attempts. Try again later.');
    }
    catch {
        return fail(c, 503, 'auth_unavailable', 'Login is temporarily unavailable.');
    }
    let passwordValid = false;
    try {
        passwordValid = await verify(Buffer.from(env.BACKOFFICE_LOCAL_ADMIN_PASSWORD_HASH_B64, 'base64').toString('utf8'), parsed.data.password);
    }
    catch {
        passwordValid = false;
    }
    if (email !== env.BACKOFFICE_LOCAL_ADMIN_EMAIL.toLowerCase() || !passwordValid) {
        return fail(c, 401, 'unauthorized', 'The email or password is incorrect.');
    }
    try {
        await redis.del(rateKey);
        await createSession(c, email, 'local');
        return c.json({ success: true, data: { email }, correlation_id: c.get('correlationId') });
    }
    catch {
        return fail(c, 503, 'auth_unavailable', 'Login is temporarily unavailable.');
    }
});
async function getOidcConfiguration() {
    if (!env.BACKOFFICE_OIDC_ENABLED)
        throw new Error('OIDC is disabled.');
    return oidc.discovery(new URL(env.BACKOFFICE_OIDC_ISSUER_URL), env.BACKOFFICE_OIDC_CLIENT_ID, env.BACKOFFICE_OIDC_CLIENT_SECRET);
}
adminRoutes.get('/auth/oidc/start', async (c) => {
    if (!env.BACKOFFICE_ENABLED || !env.BACKOFFICE_OIDC_ENABLED)
        return fail(c, 404, 'not_found', 'OIDC login is disabled.');
    try {
        const configuration = await getOidcConfiguration();
        const state = oidc.randomState();
        const nonce = oidc.randomNonce();
        const codeVerifier = oidc.randomPKCECodeVerifier();
        const challenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
        await redis.setex(`platform:oidc:${hashToken(state).toString('hex')}`, 300, JSON.stringify({ nonce, codeVerifier }));
        setCookie(c, STATE_COOKIE, state, { path: '/', httpOnly: true, secure: env.BACKOFFICE_COOKIE_SECURE, sameSite: 'Lax', maxAge: 300 });
        const url = oidc.buildAuthorizationUrl(configuration, {
            redirect_uri: env.BACKOFFICE_OIDC_REDIRECT_URI,
            scope: 'openid email profile',
            state,
            nonce,
            code_challenge: challenge,
            code_challenge_method: 'S256',
        });
        return c.redirect(url.href, 302);
    }
    catch {
        return fail(c, 503, 'oidc_unavailable', 'Single sign-on is temporarily unavailable.');
    }
});
adminRoutes.get('/auth/oidc/callback', async (c) => {
    if (!env.BACKOFFICE_ENABLED || !env.BACKOFFICE_OIDC_ENABLED)
        return fail(c, 404, 'not_found', 'OIDC login is disabled.');
    const state = c.req.query('state') ?? '';
    const cookieState = getCookie(c, STATE_COOKIE) ?? '';
    if (!state || !cookieState || state !== cookieState)
        return fail(c, 401, 'oidc_state_failed', 'The identity response could not be verified.');
    try {
        const stateKey = `platform:oidc:${hashToken(state).toString('hex')}`;
        const stored = await redis.get(stateKey);
        await redis.del(stateKey);
        if (!stored)
            return fail(c, 401, 'oidc_state_expired', 'The sign-in request has expired.');
        const flow = z.object({ nonce: z.string(), codeVerifier: z.string() }).parse(JSON.parse(stored));
        const configuration = await getOidcConfiguration();
        const callbackUrl = new URL(env.BACKOFFICE_OIDC_REDIRECT_URI);
        callbackUrl.search = new URL(c.req.url).search;
        const tokens = await oidc.authorizationCodeGrant(configuration, callbackUrl, {
            pkceCodeVerifier: flow.codeVerifier,
            expectedState: state,
            expectedNonce: flow.nonce,
        });
        const claims = tokens.claims();
        if (!claims)
            return fail(c, 401, 'oidc_failed', 'The identity response did not contain an ID token.');
        const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : '';
        const emailVerified = claims.email_verified === true;
        const allowed = env.BACKOFFICE_ADMIN_EMAILS.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
        if (!emailVerified || !allowed.includes(email))
            return fail(c, 403, 'not_allowed', 'This identity is not allowed to access the platform Backoffice.');
        await createSession(c, email, 'oidc');
        deleteCookie(c, STATE_COOKIE, { path: '/', secure: env.BACKOFFICE_COOKIE_SECURE, sameSite: 'Lax' });
        return c.redirect(new URL('/admin', env.BACKOFFICE_URL).href, 302);
    }
    catch {
        return fail(c, 401, 'oidc_failed', 'Single sign-on could not be verified.');
    }
});
adminRoutes.get('/auth/session', requireAdmin, (c) => c.json({ success: true, data: {
        email: c.get('platformAdmin').email,
        auth_method: c.get('platformAdmin').authMethod,
        expires_in_seconds: ADMIN_SESSION_SECONDS,
    }, correlation_id: c.get('correlationId') }));
adminRoutes.post('/auth/logout', requireAdmin, async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token)
        await pool.query('UPDATE platform_admin_sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL', [hashToken(token)]);
    clearSessionCookies(c);
    return c.json({ success: true, data: { logged_out: true }, correlation_id: c.get('correlationId') });
});
adminRoutes.use('*', requireAdmin);
async function procurementConversationHistoryEnabled(): Promise<boolean> {
    const result = await pool.query(`SELECT COALESCE(
      (SELECT (setting_value->>'enabled')::boolean FROM platform_runtime_settings
       WHERE setting_key='procurement_conversation_history'), true) AS enabled`);
    return result.rows[0]?.enabled === true;
}
adminRoutes.get('/system/config', async (c) => {
    const conversationHistoryEnabled = await procurementConversationHistoryEnabled();
    return c.json({ success: true, data: {
        tenant_mode: env.FAROAI_TENANT_MODE,
        deployment_mode: env.FAROAI_DEPLOYMENT_MODE,
        local_llm_enabled: env.FAROAI_LOCAL_LLM_ENABLED,
        external_providers_allowed: env.FAROAI_DEPLOYMENT_MODE === 'hosted' || env.FAROAI_ALLOW_EXTERNAL_PROVIDERS,
        oidc_enabled: env.BACKOFFICE_OIDC_ENABLED,
        local_auth_enabled: env.BACKOFFICE_LOCAL_AUTH_ENABLED,
        shared_training_enabled: env.FAROAI_DEPLOYMENT_MODE !== 'self_hosted' && env.FAROAI_SHARED_TRAINING_ENABLED,
        procurement_conversation_history_enabled: conversationHistoryEnabled,
    }, correlation_id: c.get('correlationId') });
});
adminRoutes.put('/system/procurement-settings', async (c) => {
    const parsed = procurementRuntimeSettingsSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
        return fail(c, 400, 'invalid_request', 'The procurement conversation setting is invalid.');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`INSERT INTO platform_runtime_settings(setting_key,setting_value,updated_by_email,updated_at)
          VALUES('procurement_conversation_history',$1,$2,now())
          ON CONFLICT(setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,
            updated_by_email=EXCLUDED.updated_by_email,updated_at=now()`,
        [JSON.stringify({ enabled: parsed.data.conversation_history_enabled }), c.get('platformAdmin').email]);
        await client.query(`INSERT INTO audit_events(tenant_id,correlation_id,actor_email,actor_kind,action,resource_type,resource_id,metadata)
          VALUES(NULL,$1,$2,'platform_admin','platform.setting.updated','platform_runtime_setting','procurement_conversation_history',$3)`,
        [c.get('correlationId'), c.get('platformAdmin').email, JSON.stringify({ conversation_history_enabled: parsed.data.conversation_history_enabled })]);
        await client.query('COMMIT');
        return c.json({ success: true, data: { conversation_history_enabled: parsed.data.conversation_history_enabled }, correlation_id: c.get('correlationId') });
    }
    catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
    }
    finally {
        client.release();
    }
});
adminRoutes.get('/tenants', async (c) => {
    const paging = pageParams.safeParse(c.req.query());
    if (!paging.success)
        return fail(c, 400, 'invalid_request', 'The page parameters are invalid.');
    const { limit, offset } = paging.data;
    const tenantFilter = env.FAROAI_TENANT_MODE === 'single' ? 'WHERE t.id=$3' : '';
    const params = [limit, offset];
    if (env.FAROAI_TENANT_MODE === 'single')
        params.push(env.FAROAI_SINGLE_TENANT_ID);
    const result = await pool.query(`SELECT t.id,t.name,t.status,t.created_at,
            COALESCE(a.balance,0)::bigint AS available_credits,
            GREATEST(COALESCE((SELECT -sum(l.amount) FROM tenant_credit_ledger l WHERE l.tenant_id=t.id AND l.entry_type IN ('model_request','refund')),0),0)::bigint AS used_credits
       FROM tenants t LEFT JOIN tenant_credit_accounts a ON a.tenant_id=t.id ${tenantFilter}
      ORDER BY t.created_at DESC LIMIT $1 OFFSET $2`, params);
    return c.json({ success: true, data: { items: result.rows, limit, offset }, correlation_id: c.get('correlationId') });
});
adminRoutes.post('/tenants', async (c) => {
    if (env.FAROAI_TENANT_MODE === 'single')
        return fail(c, 403, 'single_tenant_mode', 'Tenant creation is disabled in single-tenant mode.');
    const parsed = tenantCreateSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
        return fail(c, 400, 'invalid_request', 'The tenant name is invalid.');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query('INSERT INTO tenants(name) VALUES($1) RETURNING id', [parsed.data.name]);
        const tenantId = result.rows[0]?.id;
        if (!tenantId)
            throw new Error('tenant_create_failed');
        await client.query('INSERT INTO tenant_credit_accounts(tenant_id,balance) VALUES($1,0)', [tenantId]);
        await client.query(`INSERT INTO audit_events(tenant_id,correlation_id,actor_email,actor_kind,action,resource_type,resource_id)
       VALUES($1,$2,$3,'platform_admin','tenant.created','tenant',$4)`, [tenantId, c.get('correlationId'), c.get('platformAdmin').email, tenantId]);
        await client.query('COMMIT');
        return c.json({ success: true, data: { id: tenantId, name: parsed.data.name, status: 'active', available_credits: 0 }, correlation_id: c.get('correlationId') }, 201);
    }
    catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        const errorCode = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
            ? error.code
            : error instanceof Error ? error.name : 'unknown';
        console.error(JSON.stringify({ event: 'tenant_create_failed', correlation_id: c.get('correlationId'), error_code: errorCode }));
        return fail(c, 500, 'server_error', 'The tenant could not be created.');
    }
    finally {
        client.release();
    }
});
async function tenantExists(tenantId) {
    if (env.FAROAI_TENANT_MODE === 'single' && tenantId !== env.FAROAI_SINGLE_TENANT_ID)
        return false;
    const result = await pool.query('SELECT 1 FROM tenants WHERE id=$1', [tenantId]);
    return result.rowCount === 1;
}
async function postToAiService(path, payload, timeoutMs = 20_000) {
    if (env.FAROAI_INTERNAL_SECRET.length < 32)
        return { ok: false, data: null };
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac('sha256', env.FAROAI_INTERNAL_SECRET).update(`${timestamp}.${body}`).digest('hex');
    try {
        const response = await fetch(new URL(path, env.PYTHON_SERVICE_URL), {
            method: 'POST', headers: { 'content-type': 'application/json', 'x-faroai-timestamp': timestamp, 'x-faroai-signature': signature },
            body, signal: AbortSignal.timeout(timeoutMs), redirect: 'error',
        });
        return { ok: response.ok, data: await response.json().catch(() => null) };
    }
    catch {
        return { ok: false, data: null };
    }
}
adminRoutes.get('/tenants/:tenantId', async (c) => {
    const tenantId = c.req.param('tenantId');
    if (!z.string().uuid().safeParse(tenantId).success)
        return fail(c, 400, 'invalid_request', 'The tenant ID is invalid.');
    if (!await tenantExists(tenantId))
        return fail(c, 404, 'not_found', 'The tenant was not found.');
    const result = await pool.query(`SELECT t.id,t.name,t.status,t.created_at,COALESCE(a.balance,0)::bigint AS available_credits
       FROM tenants t LEFT JOIN tenant_credit_accounts a ON a.tenant_id=t.id WHERE t.id=$1`, [tenantId]);
    return c.json({ success: true, data: result.rows[0], correlation_id: c.get('correlationId') });
});
adminRoutes.patch('/tenants/:tenantId', async (c) => {
    const tenantId = c.req.param('tenantId');
    if (!z.string().uuid().safeParse(tenantId).success)
        return fail(c, 400, 'invalid_request', 'The tenant ID is invalid.');
    if (!await tenantExists(tenantId))
        return fail(c, 404, 'not_found', 'The tenant was not found.');
    const parsed = tenantPatchSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
        return fail(c, 400, 'invalid_request', 'The tenant update is invalid.');
    const result = await pool.query(`UPDATE tenants SET name=COALESCE($2,name),status=COALESCE($3,status),updated_at=now() WHERE id=$1 RETURNING id,name,status`, [tenantId, parsed.data.name ?? null, parsed.data.status ?? null]);
    await pool.query(`INSERT INTO audit_events(tenant_id,correlation_id,actor_email,actor_kind,action,resource_type,resource_id,metadata)
     VALUES($1,$2,$3,'platform_admin','tenant.updated','tenant',$1,$4)`, [tenantId, c.get('correlationId'), c.get('platformAdmin').email, JSON.stringify(parsed.data)]);
    return c.json({ success: true, data: result.rows[0], correlation_id: c.get('correlationId') });
});
adminRoutes.get('/tenants/:tenantId/credits/ledger', async (c) => {
    const tenantId = c.req.param('tenantId');
    if (!z.string().uuid().safeParse(tenantId).success)
        return fail(c, 400, 'invalid_request', 'The tenant ID is invalid.');
    if (!await tenantExists(tenantId))
        return fail(c, 404, 'not_found', 'The tenant was not found.');
    const paging = pageParams.safeParse(c.req.query());
    if (!paging.success)
        return fail(c, 400, 'invalid_request', 'The page parameters are invalid.');
    const result = await pool.query(`SELECT id,amount,entry_type,reason,actor_email,correlation_id,created_at FROM tenant_credit_ledger
      WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`, [tenantId, paging.data.limit, paging.data.offset]);
    const account = await pool.query('SELECT balance FROM tenant_credit_accounts WHERE tenant_id=$1', [tenantId]);
    return c.json({ success: true, data: { balance: account.rows[0]?.balance ?? 0, items: result.rows, ...paging.data }, correlation_id: c.get('correlationId') });
});
adminRoutes.post('/tenants/:tenantId/credits', async (c) => {
    const tenantId = c.req.param('tenantId');
    if (!z.string().uuid().safeParse(tenantId).success)
        return fail(c, 400, 'invalid_request', 'The tenant ID is invalid.');
    if (!await tenantExists(tenantId))
        return fail(c, 404, 'not_found', 'The tenant was not found.');
    const parsed = creditSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
        return fail(c, 400, 'invalid_request', 'The credit adjustment is invalid.');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const updated = await client.query(`UPDATE tenant_credit_accounts SET balance=balance+$2,updated_at=now()
        WHERE tenant_id=$1 AND balance+$2>=0 RETURNING balance`, [tenantId, parsed.data.amount]);
        if (!updated.rowCount) {
            await client.query('ROLLBACK');
            return fail(c, 409, 'insufficient_balance', 'The adjustment would create a negative balance.');
        }
        const balance = updated.rows[0]?.balance;
        await client.query(`INSERT INTO tenant_credit_ledger(tenant_id,amount,entry_type,reason,actor_email,correlation_id)
       VALUES($1,$2,$3,$4,$5,$6)`, [tenantId, parsed.data.amount, parsed.data.entry_type, parsed.data.reason, c.get('platformAdmin').email, c.get('correlationId')]);
        await client.query(`INSERT INTO audit_events(tenant_id,correlation_id,actor_email,actor_kind,action,resource_type,resource_id,metadata)
       VALUES($1,$2,$3,'platform_admin','tenant.credits.adjusted','credit_account',$5,$4)`, [tenantId, c.get('correlationId'), c.get('platformAdmin').email, JSON.stringify({ amount: parsed.data.amount, reason: parsed.data.reason, balance }), tenantId]);
        await client.query('COMMIT');
        return c.json({ success: true, data: { balance }, correlation_id: c.get('correlationId') });
    }
    catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        const errorCode = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
            ? error.code
            : error instanceof Error ? error.name : 'unknown';
        console.error(JSON.stringify({ event: 'credit_adjustment_failed', correlation_id: c.get('correlationId'), error_code: errorCode }));
        return fail(c, 500, 'server_error', 'The credit adjustment failed.');
    }
    finally {
        client.release();
    }
});
function encryptionKey() {
    if (!env.FAROAI_CONFIG_ENCRYPTION_KEY)
        throw new Error('Provider secrets are not configured for encryption.');
    return parseEncryptionKey(env.FAROAI_CONFIG_ENCRYPTION_KEY);
}
adminRoutes.get('/providers', async (c) => {
    const result = await pool.query(`SELECT p.id,p.provider,p.name,p.endpoint_url,p.enabled,p.secret_hint,p.updated_at,
       p.max_input_usd_per_million_tokens::float8,p.max_output_usd_per_million_tokens::float8,p.max_image_usd_per_image::float8,
       (SELECT count(*)::int FROM provider_model_catalog m WHERE m.provider_connection_id=p.id AND m.is_available) AS discovered_model_count,
       (SELECT count(*)::int FROM provider_model_catalog m JOIN provider_model_pricing r
          ON r.provider_connection_id=m.provider_connection_id AND r.model=m.model_id
         WHERE m.provider_connection_id=p.id AND m.is_available
           AND r.input_usd_per_million_tokens<=p.max_input_usd_per_million_tokens
           AND r.output_usd_per_million_tokens<=p.max_output_usd_per_million_tokens
           AND (r.input_usd_per_million_tokens>0 OR r.output_usd_per_million_tokens>0 OR COALESCE(r.image_usd_per_image,0)>0)
           AND r.verified_at>=now()-interval '30 days') AS eligible_model_count,
       (SELECT max(m.last_seen_at) FROM provider_model_catalog m WHERE m.provider_connection_id=p.id) AS models_synced_at,
       (p.enabled AND p.provider='openrouter' AND p.max_input_usd_per_million_tokens >= 0.042
         AND p.max_output_usd_per_million_tokens >= 0 AND p.secret_ciphertext IS NOT NULL
         AND p.secret_nonce IS NOT NULL AND p.secret_tag IS NOT NULL) AS jev_price_eligible
       FROM provider_connections p ORDER BY p.provider,p.name`);
    return c.json({ success: true, data: { items: result.rows.map((row) => ({
        ...row, secret_hint: maskSecretHint(row.secret_hint),
        jev_eligible: allowedProviderForDeployment(row.provider, env.FAROAI_DEPLOYMENT_MODE, env.FAROAI_ALLOW_EXTERNAL_PROVIDERS, env.FAROAI_LOCAL_LLM_ENABLED) && row.jev_price_eligible,
    })) }, correlation_id: c.get('correlationId') });
});
adminRoutes.post('/providers/:providerId/models/discover', async (c) => {
    const providerId = c.req.param('providerId');
    if (!z.string().uuid().safeParse(providerId).success)
        return fail(c, 400, 'invalid_request', 'The provider ID is invalid.');
    const result = await pool.query(`SELECT provider,endpoint_url,enabled,max_input_usd_per_million_tokens::float8,max_output_usd_per_million_tokens::float8,
             secret_ciphertext,secret_nonce,secret_tag FROM provider_connections WHERE id=$1`, [providerId]);
    const connection = result.rows[0];
    if (!connection)
        return fail(c, 404, 'not_found', 'The provider connection was not found.');
    if (!allowedProviderForDeployment(connection.provider, env.FAROAI_DEPLOYMENT_MODE, env.FAROAI_ALLOW_EXTERNAL_PROVIDERS, env.FAROAI_LOCAL_LLM_ENABLED)) {
        return fail(c, 403, 'provider_disabled', 'This provider is disabled by deployment policy.');
    }
    let endpoint;
    try {
        endpoint = validateProviderEndpoint(connection.provider, connection.endpoint_url, allowedLocalHosts);
    }
    catch {
        return fail(c, 400, 'invalid_endpoint', 'The saved provider endpoint is not allowed.');
    }
    if (connection.provider === 'openrouter' && !connection.secret_ciphertext) {
        return fail(c, 400, 'credential_required', 'Save the provider API key before syncing models.');
    }
    let headers;
    try {
        headers = new Headers({ accept: 'application/json' });
        if (connection.secret_ciphertext && connection.secret_nonce && connection.secret_tag) {
            const key = parseEncryptionKey(env.FAROAI_CONFIG_ENCRYPTION_KEY);
            headers.set('authorization', `Bearer ${decryptProviderSecret(connection.secret_ciphertext, connection.secret_nonce, connection.secret_tag, key)}`);
        }
    }
    catch {
        return fail(c, 503, 'credential_unavailable', 'The saved provider credential could not be read.');
    }
    const modelList = providerModelListUrl(connection.provider, endpoint);
    let models;
    try {
        const response = await fetch(modelList.url, { method: 'GET', headers, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12_000) });
        if (!response.ok)
            return fail(c, 502, 'provider_unavailable', 'The provider could not return its model list. Check the connection and try again.');
        const body = await readBoundedResponse(response, MAX_PROVIDER_MODEL_RESPONSE_BYTES);
        models = parseProviderModels(connection.provider, modelList.lmStudioNative, JSON.parse(body));
    }
    catch {
        return fail(c, 502, 'provider_unavailable', 'The provider model list could not be read. Check the connection and try again.');
    }
    const client = await pool.connect();
    let eligibleModelCount = 0;
    try {
        await client.query('BEGIN');
        await client.query('UPDATE provider_model_catalog SET is_available=false,updated_at=now() WHERE provider_connection_id=$1', [providerId]);
        await client.query(`INSERT INTO provider_model_catalog(provider_connection_id,model_id,display_name,is_available,last_seen_at,updated_at)
       SELECT $1,model_id,display_name,true,now(),now()
         FROM jsonb_to_recordset($2::jsonb) AS model(model_id text,display_name text,
           input_usd_per_million_tokens float8,output_usd_per_million_tokens float8,image_usd_per_image float8)
       ON CONFLICT(provider_connection_id,model_id) DO UPDATE SET
         display_name=EXCLUDED.display_name,is_available=true,last_seen_at=now(),updated_at=now()`, [providerId, JSON.stringify(models)]);
        const pricedModels = models.filter((model) => model.input_usd_per_million_tokens !== null && model.output_usd_per_million_tokens !== null);
        await client.query(`DELETE FROM provider_model_pricing WHERE provider_connection_id=$1 AND price_source='provider'
        AND NOT (model=ANY($2::text[]))`, [providerId, pricedModels.map((model) => model.model_id)]);
        for (const model of pricedModels) {
            await client.query(`INSERT INTO provider_model_pricing(provider_connection_id,model,input_usd_per_million_tokens,output_usd_per_million_tokens,
           image_usd_per_image,verified_by_email,price_source,verified_at,updated_at)
         VALUES($1,$2,$3,$4,$5,'provider_sync','provider',now(),now())
         ON CONFLICT(provider_connection_id,model) DO UPDATE SET
           input_usd_per_million_tokens=EXCLUDED.input_usd_per_million_tokens,
           output_usd_per_million_tokens=EXCLUDED.output_usd_per_million_tokens,
           image_usd_per_image=EXCLUDED.image_usd_per_image,
           verified_by_email='provider_sync',price_source='provider',verified_at=now(),updated_at=now()`, [providerId, model.model_id, model.input_usd_per_million_tokens, model.output_usd_per_million_tokens, model.image_usd_per_image]);
        }
        const eligible = await client.query(`UPDATE provider_connections p SET allowed_models=COALESCE((
         SELECT array_agg(m.model_id ORDER BY m.model_id)
           FROM provider_model_catalog m JOIN provider_model_pricing r
             ON r.provider_connection_id=m.provider_connection_id AND r.model=m.model_id
          WHERE m.provider_connection_id=p.id AND m.is_available
            AND r.input_usd_per_million_tokens<=p.max_input_usd_per_million_tokens
            AND r.output_usd_per_million_tokens<=p.max_output_usd_per_million_tokens
            AND (r.input_usd_per_million_tokens>0 OR r.output_usd_per_million_tokens>0 OR COALESCE(r.image_usd_per_image,0)>0)
            AND r.verified_at>=now()-interval '30 days'), '{}'),updated_at=now()
        WHERE p.id=$1 RETURNING allowed_models`, [providerId]);
        eligibleModelCount = eligible.rows[0]?.allowed_models.length ?? 0;
        await client.query(`INSERT INTO audit_events(tenant_id,correlation_id,actor_email,actor_kind,action,resource_type,resource_id,metadata)
       VALUES(NULL,$1,$2,'platform_admin','provider.models.discovered','provider_connection',$3,$4)`, [c.get('correlationId'), c.get('platformAdmin').email, providerId, JSON.stringify({ model_count: models.length, eligible_model_count: eligibleModelCount, priced_model_count: pricedModels.length })]);
        await client.query('COMMIT');
    }
    catch {
        await client.query('ROLLBACK').catch(() => undefined);
        return fail(c, 500, 'server_error', 'The provider model list could not be saved.');
    }
    finally {
        client.release();
    }
    return c.json({ success: true, data: { count: models.length, eligible_count: eligibleModelCount, priced_count: models.filter((model) => model.input_usd_per_million_tokens !== null && model.output_usd_per_million_tokens !== null).length }, correlation_id: c.get('correlationId') });
});
adminRoutes.put('/providers/:providerId/price-limits', async (c) => {
    const providerId = c.req.param('providerId');
    if (!z.string().uuid().safeParse(providerId).success)
        return fail(c, 400, 'invalid_request', 'The provider ID is invalid.');
    const parsed = providerPriceLimitsSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
        return fail(c, 400, 'invalid_request', 'Enter token limits from $0 to $10 per 1M tokens and image limits from $0 to $10 per image.');
    const result = await pool.query(`UPDATE provider_connections p SET
       max_input_usd_per_million_tokens=$2,max_output_usd_per_million_tokens=$3,max_image_usd_per_image=$4,
       allowed_models=COALESCE((SELECT array_agg(m.model_id ORDER BY m.model_id)
         FROM provider_model_catalog m JOIN provider_model_pricing r
           ON r.provider_connection_id=m.provider_connection_id AND r.model=m.model_id
        WHERE m.provider_connection_id=p.id AND m.is_available
          AND r.input_usd_per_million_tokens<=$2 AND r.output_usd_per_million_tokens<=$3
          AND (r.input_usd_per_million_tokens>0 OR r.output_usd_per_million_tokens>0 OR COALESCE(r.image_usd_per_image,0)>0)
          AND r.verified_at>=now()-interval '30 days'), '{}'),updated_at=now()
       WHERE p.id=$1 RETURNING p.id,p.allowed_models`, [providerId, parsed.data.max_input_usd_per_million_tokens, parsed.data.max_output_usd_per_million_tokens, parsed.data.max_image_usd_per_image]);
    if (!result.rowCount)
        return fail(c, 404, 'not_found', 'The provider connection was not found.');
    await pool.query(`INSERT INTO audit_events(tenant_id,correlation_id,actor_email,actor_kind,action,resource_type,resource_id,metadata)
     VALUES(NULL,$1,$2,'platform_admin','provider.price_limits.updated','provider_connection',$3,$4)`, [c.get('correlationId'), c.get('platformAdmin').email, providerId, JSON.stringify({ ...parsed.data, eligible_model_count: result.rows[0].allowed_models.length })]);
    return c.json({ success: true, data: { eligible_model_count: result.rows[0].allowed_models.length }, correlation_id: c.get('correlationId') });
});
adminRoutes.post('/providers', async (c) => {
    const parsed = providerSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
        return fail(c, 400, 'invalid_request', 'The provider connection is invalid.');
    if (!allowedProviderForDeployment(parsed.data.provider, env.FAROAI_DEPLOYMENT_MODE, env.FAROAI_ALLOW_EXTERNAL_PROVIDERS, env.FAROAI_LOCAL_LLM_ENABLED)) {
        return fail(c, 403, 'provider_disabled', 'This provider is disabled by deployment policy.');
    }
    let url;
    try {
        url = validateProviderEndpoint(parsed.data.provider, parsed.data.endpoint_url, allowedLocalHosts);
    }
    catch {
        return fail(c, 400, 'invalid_endpoint', 'The provider endpoint is not allowed.');
    }
    let encrypted = null;
    if (parsed.data.secret) {
        try {
            encrypted = encryptProviderSecret(parsed.data.secret, encryptionKey());
        }
        catch {
            return fail(c, 503, 'secret_storage_unavailable', 'Secure provider secret storage is not configured.');
        }
    }
    if (parsed.data.provider === 'openrouter' && !encrypted)
        return fail(c, 400, 'secret_required', 'OpenRouter requires an API key.');
    try {
        const result = await pool.query(`INSERT INTO provider_connections(provider,name,endpoint_url,enabled,allowed_models,max_input_usd_per_million_tokens,
       max_output_usd_per_million_tokens,max_image_usd_per_image,secret_ciphertext,secret_nonce,secret_tag,secret_hint)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`, [parsed.data.provider, parsed.data.name, url.href.replace(/\/$/, ''), parsed.data.enabled, [],
            parsed.data.max_input_usd_per_million_tokens, parsed.data.max_output_usd_per_million_tokens, parsed.data.max_image_usd_per_image,
            encrypted?.ciphertext ?? null, encrypted?.nonce ?? null, encrypted?.tag ?? null, encrypted?.hint ?? null]);
        await pool.query(`INSERT INTO audit_events(tenant_id,correlation_id,actor_email,actor_kind,action,resource_type,resource_id,metadata)
       VALUES(NULL,$1,$2,'platform_admin','provider.created','provider_connection',$3,$4)`, [c.get('correlationId'), c.get('platformAdmin').email, result.rows[0]?.id, JSON.stringify({ provider: parsed.data.provider, name: parsed.data.name })]);
        return c.json({ success: true, data: { id: result.rows[0]?.id, provider: parsed.data.provider, name: parsed.data.name,
                endpoint_url: url.href, enabled: parsed.data.enabled, allowed_models: [],
                max_input_usd_per_million_tokens: parsed.data.max_input_usd_per_million_tokens,
                max_output_usd_per_million_tokens: parsed.data.max_output_usd_per_million_tokens,
                max_image_usd_per_image: parsed.data.max_image_usd_per_image,
                secret_configured: !!encrypted }, correlation_id: c.get('correlationId') }, 201);
    }
    catch {
        return fail(c, 409, 'provider_conflict', 'A provider connection with this name already exists.');
    }
});
adminRoutes.put('/providers/:providerId', async (c) => {
    const providerId = c.req.param('providerId');
    if (!z.string().uuid().safeParse(providerId).success)
        return fail(c, 400, 'invalid_request', 'The provider ID is invalid.');
    const parsed = providerSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
        return fail(c, 400, 'invalid_request', 'The provider connection is invalid.');
    if (!allowedProviderForDeployment(parsed.data.provider, env.FAROAI_DEPLOYMENT_MODE, env.FAROAI_ALLOW_EXTERNAL_PROVIDERS, env.FAROAI_LOCAL_LLM_ENABLED))
        return fail(c, 403, 'provider_disabled', 'This provider is disabled by deployment policy.');
    let url;
    try {
        url = validateProviderEndpoint(parsed.data.provider, parsed.data.endpoint_url, allowedLocalHosts);
    }
    catch {
        return fail(c, 400, 'invalid_endpoint', 'The provider endpoint is not allowed.');
    }
    let encrypted = null;
    if (parsed.data.secret) {
        try {
            encrypted = encryptProviderSecret(parsed.data.secret, encryptionKey());
        }
        catch {
            return fail(c, 503, 'secret_storage_unavailable', 'Secure provider secret storage is not configured.');
        }
    }
    const existing = await pool.query('SELECT allowed_models FROM provider_connections WHERE id=$1', [providerId]);
    if (!existing.rowCount)
        return fail(c, 404, 'not_found', 'The provider connection was not found.');
    const allowedModels = existing.rows[0].allowed_models;
    const result = await pool.query(`UPDATE provider_connections SET provider=$2,name=$3,endpoint_url=$4,enabled=$5,allowed_models=$6,
       max_input_usd_per_million_tokens=$7,max_output_usd_per_million_tokens=$8,max_image_usd_per_image=$9,
       secret_ciphertext=COALESCE($10,secret_ciphertext),secret_nonce=COALESCE($11,secret_nonce),secret_tag=COALESCE($12,secret_tag),
       secret_hint=COALESCE($13,secret_hint),updated_at=now() WHERE id=$1 RETURNING id`, [providerId, parsed.data.provider, parsed.data.name, url.href.replace(/\/$/, ''), parsed.data.enabled, allowedModels,
        parsed.data.max_input_usd_per_million_tokens, parsed.data.max_output_usd_per_million_tokens, parsed.data.max_image_usd_per_image,
        encrypted?.ciphertext ?? null, encrypted?.nonce ?? null, encrypted?.tag ?? null, encrypted?.hint ?? null]);
    if (!result.rowCount)
        return fail(c, 404, 'not_found', 'The provider connection was not found.');
    await pool.query(`INSERT INTO audit_events(tenant_id,correlation_id,actor_email,actor_kind,action,resource_type,resource_id,metadata)
     VALUES(NULL,$1,$2,'platform_admin','provider.updated','provider_connection',$3,$4)`, [c.get('correlationId'), c.get('platformAdmin').email, providerId, JSON.stringify({ provider: parsed.data.provider, name: parsed.data.name })]);
    return c.json({ success: true, data: { id: providerId, updated: true, secret_rotated: !!encrypted }, correlation_id: c.get('correlationId') });
});
adminRoutes.post('/providers/:providerId/test', async (c) => {
    const providerId = c.req.param('providerId');
    const result = await pool.query('SELECT id,provider,endpoint_url,allowed_models,secret_ciphertext,secret_nonce,secret_tag FROM provider_connections WHERE id=$1 AND enabled=true', [providerId]);
    const row = result.rows[0];
    if (!row)
        return fail(c, 404, 'not_found', 'The enabled provider connection was not found.');
    if (!allowedProviderForDeployment(row.provider, env.FAROAI_DEPLOYMENT_MODE, env.FAROAI_ALLOW_EXTERNAL_PROVIDERS, env.FAROAI_LOCAL_LLM_ENABLED))
        return fail(c, 403, 'provider_disabled', 'This provider is disabled by deployment policy.');
    const headers = { accept: 'application/json' };
    if (row.secret_ciphertext && row.secret_nonce && row.secret_tag) {
        try {
            headers.authorization = `Bearer ${decryptProviderSecret(row.secret_ciphertext, row.secret_nonce, row.secret_tag, encryptionKey())}`;
        }
        catch {
            return fail(c, 503, 'secret_unavailable', 'The provider credential could not be read.');
        }
    }
    try {
        const response = await fetch(`${row.endpoint_url}/models`, { headers, signal: AbortSignal.timeout(7000), redirect: 'error' });
        if (!response.ok)
            return fail(c, 502, 'provider_unavailable', 'The provider returned an unsuccessful response.');
        const body = await response.json();
        const models = typeof body === 'object' && body !== null && 'data' in body && Array.isArray(body.data)
            ? body.data.filter((item) => typeof item === 'object' && item !== null && 'id' in item && typeof item.id === 'string').map((item) => item.id)
            : [];
        return c.json({ success: true, data: { reachable: true, configured_model_count: row.allowed_models.length, discovered_model_count: models.length }, correlation_id: c.get('correlationId') });
    }
    catch {
        return fail(c, 502, 'provider_unavailable', 'The provider connection could not be verified.');
    }
});
adminRoutes.delete('/providers/:providerId', async (c) => {
    const providerId = c.req.param('providerId');
    const result = await pool.query('DELETE FROM provider_connections WHERE id=$1 RETURNING id,provider,name', [providerId]);
    if (!result.rowCount)
        return fail(c, 404, 'not_found', 'The provider connection was not found.');
    await pool.query(`INSERT INTO audit_events(tenant_id,correlation_id,actor_email,actor_kind,action,resource_type,resource_id,metadata)
     VALUES(NULL,$1,$2,'platform_admin','provider.deleted','provider_connection',$3,$4)`, [c.get('correlationId'), c.get('platformAdmin').email, providerId, JSON.stringify({ provider: result.rows[0]?.provider, name: result.rows[0]?.name })]);
    return c.json({ success: true, data: { deleted: true }, correlation_id: c.get('correlationId') });
});
async function syncTenantModelCandidates(tenantId) {
    await pool.query(`INSERT INTO tenant_model_candidates(tenant_id,provider_connection_id,model,is_default,max_tokens,timeout_seconds)
     SELECT $1,p.id,m.model_id,false,600,30
       FROM provider_connections p
       JOIN provider_model_catalog m ON m.provider_connection_id=p.id AND m.is_available
       JOIN provider_model_pricing r ON r.provider_connection_id=p.id AND r.model=m.model_id
      WHERE p.enabled AND m.model_id=ANY(p.allowed_models)
        AND r.input_usd_per_million_tokens<=p.max_input_usd_per_million_tokens
        AND r.output_usd_per_million_tokens<=p.max_output_usd_per_million_tokens
        AND (r.input_usd_per_million_tokens>0 OR r.output_usd_per_million_tokens>0 OR COALESCE(r.image_usd_per_image,0)>0)
        AND r.verified_at>=now()-interval '30 days'
     ON CONFLICT(tenant_id,provider_connection_id,model) DO NOTHING`, [tenantId]);
    await pool.query(`DELETE FROM tenant_model_candidates m WHERE m.tenant_id=$1 AND NOT EXISTS (
       SELECT 1 FROM provider_connections p
       JOIN provider_model_catalog c ON c.provider_connection_id=p.id AND c.model_id=m.model AND c.is_available
       JOIN provider_model_pricing r ON r.provider_connection_id=p.id AND r.model=c.model_id
       WHERE p.id=m.provider_connection_id AND p.enabled AND c.model_id=ANY(p.allowed_models)
         AND r.input_usd_per_million_tokens<=p.max_input_usd_per_million_tokens
         AND r.output_usd_per_million_tokens<=p.max_output_usd_per_million_tokens
         AND (r.input_usd_per_million_tokens>0 OR r.output_usd_per_million_tokens>0 OR COALESCE(r.image_usd_per_image,0)>0)
         AND r.verified_at>=now()-interval '30 days')`, [tenantId]);
    if (env.FAROAI_DEPLOYMENT_MODE === 'self_hosted' && env.FAROAI_LOCAL_LLM_ENABLED) {
        await pool.query(`UPDATE tenant_model_candidates SET is_default=false WHERE tenant_id=$1`, [tenantId]);
        await pool.query(`UPDATE tenant_model_candidates SET is_default=true WHERE id=(
         SELECT m.id FROM tenant_model_candidates m JOIN provider_connections p ON p.id=m.provider_connection_id
          WHERE m.tenant_id=$1 AND p.provider IN ('ollama','lmstudio') ORDER BY p.name,m.model LIMIT 1)`, [tenantId]);
    }
}
adminRoutes.get('/tenants/:tenantId/model-candidates', async (c) => {
    const tenantId = c.req.param('tenantId');
    if (!await tenantExists(tenantId))
        return fail(c, 404, 'not_found', 'The tenant was not found.');
    await syncTenantModelCandidates(tenantId);
    const [candidateProviders, policyResult] = await Promise.all([
        pool.query(`SELECT c.provider FROM tenant_model_candidates m JOIN provider_connections c ON c.id=m.provider_connection_id
        JOIN provider_model_catalog catalog ON catalog.provider_connection_id=c.id AND catalog.model_id=m.model AND catalog.is_available
        JOIN provider_model_pricing r ON r.provider_connection_id=c.id AND r.model=m.model
       WHERE m.tenant_id=$1 AND c.enabled AND m.model=ANY(c.allowed_models)
         AND r.input_usd_per_million_tokens<=c.max_input_usd_per_million_tokens
         AND r.output_usd_per_million_tokens<=c.max_output_usd_per_million_tokens
         AND (COALESCE((SELECT max_images_per_request FROM tenant_model_spending_policies WHERE tenant_id=$1),0)=0
           OR (r.image_usd_per_image IS NOT NULL AND r.image_usd_per_image<=c.max_image_usd_per_image))
         AND r.verified_at>=now()-interval '30 days'
         AND (r.input_usd_per_million_tokens>0 OR r.output_usd_per_million_tokens>0 OR COALESCE(r.image_usd_per_image,0)>0)`, [tenantId]),
        pool.query(`SELECT max_estimated_cost_per_request_usd::float8,max_input_tokens,max_images_per_request FROM tenant_model_spending_policies WHERE tenant_id=$1`, [tenantId]),
    ]);
    const spendingPolicy = policyResult.rows[0] ?? { max_estimated_cost_per_request_usd: null, max_input_tokens: 8192, max_images_per_request: 0, exclude_free_models: true };
    const eligibleModelCount = candidateProviders.rows.filter((row) => allowedProviderForDeployment(row.provider, env.FAROAI_DEPLOYMENT_MODE, env.FAROAI_ALLOW_EXTERNAL_PROVIDERS, env.FAROAI_LOCAL_LLM_ENABLED)).length;
    return c.json({ success: true, data: {
            eligible_model_count: eligibleModelCount, spending_policy: { ...spendingPolicy, exclude_free_models: true },
        }, correlation_id: c.get('correlationId') });
});
adminRoutes.put('/tenants/:tenantId/model-candidates', async (c) => {
    const tenantId = c.req.param('tenantId');
    if (!await tenantExists(tenantId))
        return fail(c, 404, 'not_found', 'The tenant was not found.');
    const parsed = modelCandidatesSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
        return fail(c, 400, 'invalid_request', 'The model candidate policy is invalid.');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`INSERT INTO tenant_model_spending_policies(tenant_id,max_estimated_cost_per_request_usd,max_input_tokens,max_images_per_request,exclude_free_models,updated_by_email,updated_at)
       VALUES($1,$2,$3,$4,true,$5,now()) ON CONFLICT(tenant_id) DO UPDATE SET
         max_estimated_cost_per_request_usd=EXCLUDED.max_estimated_cost_per_request_usd,
         max_input_tokens=EXCLUDED.max_input_tokens,max_images_per_request=EXCLUDED.max_images_per_request,
         exclude_free_models=true,updated_by_email=EXCLUDED.updated_by_email,updated_at=now()`, [tenantId, parsed.data.max_estimated_cost_per_request_usd, parsed.data.max_input_tokens,
            parsed.data.max_images_per_request, c.get('platformAdmin').email]);
        await client.query(`INSERT INTO audit_events(tenant_id,correlation_id,actor_email,actor_kind,action,resource_type,resource_id,metadata)
       VALUES($1,$2,$3,'platform_admin','tenant.model_candidates.updated','model_candidate_policy',$1,$4)`, [tenantId, c.get('correlationId'), c.get('platformAdmin').email, JSON.stringify({
                max_estimated_cost_per_request_usd: parsed.data.max_estimated_cost_per_request_usd,
                max_input_tokens: parsed.data.max_input_tokens,
                max_images_per_request: parsed.data.max_images_per_request,
                exclude_free_models: true,
            })]);
        await client.query('COMMIT');
    }
    catch {
        await client.query('ROLLBACK').catch(() => undefined);
        return fail(c, 409, 'candidate_policy_conflict', 'The model candidate policy could not be saved.');
    }
    finally {
        client.release();
    }
    await syncTenantModelCandidates(tenantId);
    const eligible = await pool.query(`SELECT count(*)::int AS count
      FROM tenant_model_candidates m JOIN provider_connections c ON c.id=m.provider_connection_id
      JOIN provider_model_pricing r ON r.provider_connection_id=c.id AND r.model=m.model
      WHERE m.tenant_id=$1 AND ($2=0 OR (r.image_usd_per_image IS NOT NULL AND r.image_usd_per_image<=c.max_image_usd_per_image))`,
      [tenantId, parsed.data.max_images_per_request]);
    return c.json({ success: true, data: { candidates: eligible.rows[0]?.count ?? 0,
            max_estimated_cost_per_request_usd: parsed.data.max_estimated_cost_per_request_usd,
            max_input_tokens: parsed.data.max_input_tokens, max_images_per_request: parsed.data.max_images_per_request,
            exclude_free_models: true }, correlation_id: c.get('correlationId') });
});
export async function modelCandidatesForTenant(tenantId, options = {}) {
    await syncTenantModelCandidates(tenantId);
    const result = await pool.query(`SELECT m.id AS candidate_id,c.provider,c.endpoint_url,m.model,m.max_tokens,m.timeout_seconds,m.is_default,
            c.secret_ciphertext,c.secret_nonce,c.secret_tag,c.allowed_models,c.max_image_usd_per_image::float8,
            r.input_usd_per_million_tokens::float8,r.output_usd_per_million_tokens::float8,
            r.image_usd_per_image::float8,r.verified_at AS pricing_verified_at,
            s.max_estimated_cost_per_request_usd::float8,COALESCE(s.max_input_tokens,8192) AS max_input_tokens,
            COALESCE(s.max_images_per_request,0) AS max_images_per_request,COALESCE(s.exclude_free_models,true) AS exclude_free_models
       FROM tenant_model_candidates m JOIN provider_connections c ON c.id=m.provider_connection_id
       LEFT JOIN provider_model_pricing r ON r.provider_connection_id=c.id AND r.model=m.model
       LEFT JOIN tenant_model_spending_policies s ON s.tenant_id=m.tenant_id
      WHERE m.tenant_id=$1 AND c.enabled=true AND m.model=ANY(c.allowed_models)
        AND r.input_usd_per_million_tokens<=c.max_input_usd_per_million_tokens
        AND r.output_usd_per_million_tokens<=c.max_output_usd_per_million_tokens
        AND (COALESCE(s.max_images_per_request,0)=0 OR (r.image_usd_per_image IS NOT NULL AND r.image_usd_per_image<=c.max_image_usd_per_image))
        AND EXISTS (SELECT 1 FROM provider_model_catalog catalog WHERE catalog.provider_connection_id=c.id
          AND catalog.model_id=m.model AND catalog.is_available=true)
      ORDER BY m.is_default DESC,c.provider,c.name,m.model`, [tenantId]);
    const candidates = [];
    for (const row of result.rows) {
        const maxOutputTokens = Number.isInteger(options.max_output_tokens)
            ? Math.min(7000, Math.max(row.max_tokens, options.max_output_tokens))
            : row.max_tokens;
        if (row.max_images_per_request > 0 && (row.image_usd_per_image === null || row.image_usd_per_image > row.max_image_usd_per_image))
            continue;
        if (!allowedProviderForDeployment(row.provider, env.FAROAI_DEPLOYMENT_MODE, env.FAROAI_ALLOW_EXTERNAL_PROVIDERS, env.FAROAI_LOCAL_LLM_ENABLED))
            continue;
        if (row.provider === 'openrouter' && (!row.secret_ciphertext || !row.secret_nonce || !row.secret_tag))
            continue;
        let estimatedMaximum = null;
        const verifiedAt = row.pricing_verified_at ? Date.parse(row.pricing_verified_at) : Number.NaN;
        const hasCurrentPrice = Number.isFinite(verifiedAt) && Date.now() - verifiedAt <= 30 * 24 * 60 * 60 * 1000
            && Date.now() - verifiedAt >= 0
            && row.input_usd_per_million_tokens !== null && row.output_usd_per_million_tokens !== null
            && (row.max_images_per_request === 0 || row.image_usd_per_image !== null);
        if (!hasCurrentPrice)
            continue;
        const isFree = row.input_usd_per_million_tokens === 0 && row.output_usd_per_million_tokens === 0
            && (row.image_usd_per_image === null || row.image_usd_per_image === 0);
        if (isFree)
            continue;
        if (row.max_estimated_cost_per_request_usd !== null) {
            estimatedMaximum = (row.max_input_tokens * row.input_usd_per_million_tokens
                + maxOutputTokens * row.output_usd_per_million_tokens) / 1_000_000
                + row.max_images_per_request * (row.image_usd_per_image ?? 0);
            if (row.max_estimated_cost_per_request_usd !== null
                && estimatedMaximum > row.max_estimated_cost_per_request_usd)
                continue;
        }
        const apiKey = row.secret_ciphertext && row.secret_nonce && row.secret_tag
            ? decryptProviderSecret(row.secret_ciphertext, row.secret_nonce, row.secret_tag, encryptionKey()) : '';
        candidates.push({
            candidate_id: row.candidate_id, provider: row.provider, base_url: row.endpoint_url, api_key: apiKey,
            model: row.model, max_tokens: maxOutputTokens, timeout_seconds: row.timeout_seconds, is_default: row.is_default,
            input_usd_per_million_tokens: row.input_usd_per_million_tokens,
            output_usd_per_million_tokens: row.output_usd_per_million_tokens,
            image_usd_per_image: row.image_usd_per_image,
            pricing_verified_at: row.pricing_verified_at, max_input_tokens: row.max_input_tokens,
            max_estimated_cost_per_request_usd: row.max_estimated_cost_per_request_usd,
            max_images_per_request: row.max_images_per_request, exclude_free_models: row.exclude_free_models,
        });
    }
    return candidates;
}
const JEV_INPUT_USD_PER_MILLION_TOKENS = 0.042;
export async function jevDecisionApiKey() {
    if (!allowedProviderForDeployment('openrouter', env.FAROAI_DEPLOYMENT_MODE, env.FAROAI_ALLOW_EXTERNAL_PROVIDERS, env.FAROAI_LOCAL_LLM_ENABLED))
        return '';
    const result = await pool.query(`SELECT secret_ciphertext,secret_nonce,secret_tag
       FROM provider_connections
      WHERE provider='openrouter' AND enabled=true
        AND max_input_usd_per_million_tokens >= $1
        AND max_output_usd_per_million_tokens >= 0
        AND secret_ciphertext IS NOT NULL AND secret_nonce IS NOT NULL AND secret_tag IS NOT NULL
      ORDER BY name,id`, [JEV_INPUT_USD_PER_MILLION_TOKENS]);
    for (const row of result.rows) {
        try {
            return decryptProviderSecret(row.secret_ciphertext, row.secret_nonce, row.secret_tag, encryptionKey());
        }
        catch {
            continue;
        }
    }
    return '';
}
export async function reserveModelCredit(tenantId, correlationId) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const account = await client.query('SELECT balance FROM tenant_credit_accounts WHERE tenant_id=$1 FOR UPDATE', [tenantId]);
        if (!account.rowCount) {
            await client.query('INSERT INTO tenant_credit_accounts(tenant_id,balance) VALUES($1,0) ON CONFLICT DO NOTHING', [tenantId]);
            await client.query('COMMIT');
            return null;
        }
        const stale = await client.query(`SELECT id,correlation_id FROM model_credit_reservations
        WHERE tenant_id=$1 AND status='reserved' AND created_at < now()-interval '5 minutes' FOR UPDATE`, [tenantId]);
        for (const reservation of stale.rows) {
            const changed = await client.query(`UPDATE model_credit_reservations SET status='refunded',settled_at=now()
          WHERE id=$1 AND status='reserved'`, [reservation.id]);
            if (changed.rowCount) {
                await client.query('UPDATE tenant_credit_accounts SET balance=balance+1,updated_at=now() WHERE tenant_id=$1', [tenantId]);
                await client.query(`INSERT INTO tenant_credit_ledger(tenant_id,amount,entry_type,reason,actor_email,correlation_id)
           VALUES($1,1,'refund','Expired model request reservation','system',$2)`, [tenantId, reservation.correlation_id]);
            }
        }
        const updated = await client.query(`UPDATE tenant_credit_accounts SET balance=balance-1,updated_at=now()
        WHERE tenant_id=$1 AND balance>0 RETURNING balance`, [tenantId]);
        if (!updated.rowCount) {
            await client.query('COMMIT');
            return null;
        }
        const reservation = await client.query(`INSERT INTO model_credit_reservations(tenant_id,correlation_id) VALUES($1,$2) RETURNING id`, [tenantId, correlationId]);
        const reservationId = reservation.rows[0]?.id;
        if (!reservationId)
            throw new Error('credit_reservation_failed');
        await client.query(`INSERT INTO tenant_credit_ledger(tenant_id,amount,entry_type,reason,actor_email,correlation_id)
       VALUES($1,-1,'model_request','Reserved for model-backed chat','system',$2)`, [tenantId, correlationId]);
        await client.query('COMMIT');
        return reservationId;
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    }
}
export async function settleModelCredit(reservationId, usedModel) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(`UPDATE model_credit_reservations SET status=$2,settled_at=now()
        WHERE id=$1 AND status='reserved' RETURNING tenant_id,correlation_id`, [reservationId, usedModel ? 'settled' : 'refunded']);
        const row = result.rows[0];
        if (row && !usedModel) {
            await client.query('UPDATE tenant_credit_accounts SET balance=balance+1,updated_at=now() WHERE tenant_id=$1', [row.tenant_id]);
            await client.query(`INSERT INTO tenant_credit_ledger(tenant_id,amount,entry_type,reason,actor_email,correlation_id)
         VALUES($1,1,'refund','Model was not used for this response','system',$2)`, [row.tenant_id, row.correlation_id]);
        }
        await client.query('COMMIT');
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    }
}
adminRoutes.get('/tenants/:tenantId/mcp/sources', async (c) => {
    const tenantId = c.req.param('tenantId');
    if (!await tenantExists(tenantId))
        return fail(c, 404, 'not_found', 'The tenant was not found.');
    const result = await pool.query(`SELECT id,name,mode,allowed_resources,allowed_tools,refresh_seconds,source_version,status,last_synced_at,created_at
       FROM mcp_sources WHERE tenant_id=$1 ORDER BY created_at DESC`, [tenantId]);
    return c.json({ success: true, data: { items: result.rows }, correlation_id: c.get('correlationId') });
});
const mcpIntegrationKeys = ['gis', 'gms', 'erp', 'custom'];
adminRoutes.get('/tenants/:tenantId/mcp/connections', async (c) => {
    const tenantId = c.req.param('tenantId');
    if (!await tenantExists(tenantId))
        return fail(c, 404, 'not_found', 'The tenant was not found.');
    const result = await pool.query(`SELECT id,integration_key,display_name,endpoint_url,auth_method,enabled,connection_status,discovered_tools,allowed_tools,
            secret_hint,last_checked_at,last_error_code
       FROM tenant_mcp_connections WHERE tenant_id=$1 ORDER BY integration_key`, [tenantId]);
    return c.json({ success: true, data: { items: result.rows.map((row) => ({
                ...row, secret_hint: maskSecretHint(row.secret_hint),
            })) }, correlation_id: c.get('correlationId') });
});
adminRoutes.put('/tenants/:tenantId/mcp/connections/:integration', async (c) => {
    const tenantId = c.req.param('tenantId');
    const integrationKey = c.req.param('integration');
    if (!mcpIntegrationKeys.includes(integrationKey))
        return fail(c, 400, 'invalid_integration', 'The MCP integration type is invalid.');
    if (!await tenantExists(tenantId))
        return fail(c, 404, 'not_found', 'The tenant was not found.');
    const parsed = mcpConnectionSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success || new Set(parsed.data?.allowed_tools ?? []).size !== (parsed.data?.allowed_tools.length ?? 0)) {
        return fail(c, 400, 'invalid_request', 'The MCP connection configuration is invalid.');
    }
    let endpoint;
    try {
        endpoint = validateMcpEndpoint(parsed.data.endpoint_url, allowedMcpHosts, env.MCP_ALLOW_DOCKER_HOST_HTTP);
    }
    catch {
        return fail(c, 400, 'invalid_endpoint', 'The endpoint must use HTTPS and an approved MCP host.');
    }
    const endpointUrl = endpoint.href.replace(/\/$/, '');
    const previous = await pool.query(`SELECT id,endpoint_url,auth_method,secret_ciphertext,secret_nonce,secret_tag,discovered_tools,allowed_tools,
            connection_status,last_checked_at,last_error_code,secret_hint
       FROM tenant_mcp_connections WHERE tenant_id=$1 AND integration_key=$2`, [tenantId, integrationKey]);
    const old = previous.rows[0];
    if (!old && !parsed.data.api_key)
        return fail(c, 400, 'api_key_required', 'An API key is required for a new MCP connection.');
    let encrypted = null;
    if (parsed.data.api_key) {
        try {
            encrypted = encryptProviderSecret(parsed.data.api_key, encryptionKey());
        }
        catch {
            return fail(c, 503, 'secret_storage_unavailable', 'Secure MCP credential storage is not configured.');
        }
    }
    const resetDiscovery = !old || old.endpoint_url !== endpointUrl || old.auth_method !== parsed.data.auth_method || !!encrypted;
    const discoveredTools = resetDiscovery ? [] : old.discovered_tools;
    const allowedTools = resetDiscovery ? [] : parsed.data.allowed_tools;
    if (allowedTools.some((tool) => !discoveredTools.includes(tool))) {
        return fail(c, 400, 'tool_not_discovered', 'Only tools found by the latest successful connection test can be enabled.');
    }
    const connectionStatus = resetDiscovery ? 'untested' : old.connection_status;
    const secretCiphertext = encrypted?.ciphertext ?? old?.secret_ciphertext;
    const secretNonce = encrypted?.nonce ?? old?.secret_nonce;
    const secretTag = encrypted?.tag ?? old?.secret_tag;
    if (!secretCiphertext || !secretNonce || !secretTag)
        return fail(c, 400, 'api_key_required', 'An API key is required for a new MCP connection.');
    try {
        const result = await pool.query(`INSERT INTO tenant_mcp_connections
         (tenant_id,integration_key,display_name,endpoint_url,auth_method,secret_ciphertext,secret_nonce,secret_tag,secret_hint,
          enabled,connection_status,discovered_tools,allowed_tools,last_checked_at,last_error_code)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (tenant_id,integration_key) DO UPDATE SET
         display_name=EXCLUDED.display_name,endpoint_url=EXCLUDED.endpoint_url,auth_method=EXCLUDED.auth_method,
         secret_ciphertext=EXCLUDED.secret_ciphertext,secret_nonce=EXCLUDED.secret_nonce,secret_tag=EXCLUDED.secret_tag,
         secret_hint=EXCLUDED.secret_hint,enabled=EXCLUDED.enabled,connection_status=EXCLUDED.connection_status,
         discovered_tools=EXCLUDED.discovered_tools,allowed_tools=EXCLUDED.allowed_tools,
         last_checked_at=EXCLUDED.last_checked_at,last_error_code=EXCLUDED.last_error_code,updated_at=now()
       RETURNING id`, [tenantId, integrationKey, parsed.data.display_name, endpointUrl,
            parsed.data.auth_method, secretCiphertext, secretNonce, secretTag, encrypted?.hint ?? old?.secret_hint,
            parsed.data.enabled, connectionStatus, discoveredTools, allowedTools,
            resetDiscovery ? null : old?.last_checked_at ?? null, resetDiscovery ? null : old?.last_error_code ?? null]);
        await pool.query(`INSERT INTO audit_events(tenant_id,correlation_id,actor_email,actor_kind,action,resource_type,resource_id,metadata)
       VALUES($1,$2,$3,'platform_admin','mcp.connection.updated','mcp_connection',$4,$5)`, [tenantId, c.get('correlationId'), c.get('platformAdmin').email, result.rows[0]?.id,
            JSON.stringify({ integration: integrationKey, enabled: parsed.data.enabled, credential_rotated: !!encrypted, endpoint_changed: resetDiscovery })]);
        return c.json({ success: true, data: {
                id: result.rows[0]?.id, integration: integrationKey, endpoint_url: endpointUrl, auth_method: parsed.data.auth_method, enabled: parsed.data.enabled,
                connection_status: connectionStatus, discovered_tools: discoveredTools, allowed_tools: allowedTools,
                secret_hint: maskSecretHint(encrypted?.hint ?? old?.secret_hint ?? null),
            }, correlation_id: c.get('correlationId') });
    }
    catch {
        return fail(c, 409, 'mcp_connection_conflict', 'The MCP connection could not be saved.');
    }
});
const mcpTestFailureMessages: Record<string, string> = {
    endpoint_host_not_allowed: 'This MCP hostname is not in the deployment allow-list.',
    endpoint_tls_required: 'This MCP endpoint must use HTTPS. HTTP is only supported for loopback development endpoints.',
    unsupported_endpoint_url: 'The MCP endpoint URL contains unsupported credentials, query parameters, or fragments.',
    invalid_endpoint: 'The MCP endpoint URL is invalid.',
    endpoint_timeout: 'The MCP server did not respond before the connection timed out.',
    endpoint_unreachable: 'The MCP server could not be reached from the AI service container. Do not use localhost for a server running in another container or on the host.',
    credentials_rejected: 'The MCP server rejected the API key. Check the key and its required authentication format.',
    mcp_server_rejected_request: 'The MCP server rejected the Streamable HTTP handshake or tools/list request.',
    mcp_protocol_error: 'The MCP server response did not match the Streamable HTTP protocol expected by FaroAI.',
};
adminRoutes.post('/tenants/:tenantId/mcp/connections/:integration/test', async (c) => {
    const tenantId = c.req.param('tenantId');
    const integrationKey = c.req.param('integration');
    if (!mcpIntegrationKeys.includes(integrationKey))
        return fail(c, 400, 'invalid_integration', 'The MCP integration type is invalid.');
    if (!await tenantExists(tenantId))
        return fail(c, 404, 'not_found', 'The tenant was not found.');
    const result = await pool.query(`SELECT id,endpoint_url,auth_method,secret_ciphertext,secret_nonce,secret_tag,allowed_tools
       FROM tenant_mcp_connections WHERE tenant_id=$1 AND integration_key=$2`, [tenantId, integrationKey]);
    const connection = result.rows[0];
    if (!connection)
        return fail(c, 404, 'not_found', 'Save this MCP connection before testing it.');
    let bearerToken;
    try {
        bearerToken = decryptProviderSecret(connection.secret_ciphertext, connection.secret_nonce, connection.secret_tag, encryptionKey());
    }
    catch {
        return fail(c, 503, 'secret_unavailable', 'The MCP credential could not be read securely.');
    }
    let discoveredTools;
    let failureCode = 'connection_test_failed';
    try {
        const body = JSON.stringify({ tenant_id: tenantId, correlation_id: c.get('correlationId'), endpoint_url: connection.endpoint_url, api_key: bearerToken, auth_method: connection.auth_method });
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const signature = createHmac('sha256', env.FAROAI_INTERNAL_SECRET).update(`${timestamp}.${body}`).digest('hex');
        const response = await fetch(new URL('/internal/v1/mcp/test', env.PYTHON_SERVICE_URL), {
            method: 'POST', headers: { 'content-type': 'application/json', 'x-faroai-timestamp': timestamp, 'x-faroai-signature': signature },
            body, signal: AbortSignal.timeout(15_000), redirect: 'error',
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || typeof payload !== 'object' || payload === null || !('discovered_tools' in payload)
            || !Array.isArray(payload.discovered_tools) || !payload.discovered_tools.every((tool) => typeof tool === 'string')) {
            const reportedCode = typeof payload === 'object' && payload !== null && 'error_code' in payload
                ? payload.error_code : null;
            if (typeof reportedCode === 'string' && Object.hasOwn(mcpTestFailureMessages, reportedCode))
                failureCode = reportedCode;
            throw new Error('mcp_probe_failed');
        }
        discoveredTools = [...new Set(payload.discovered_tools)].slice(0, 100);
    }
    catch {
        await pool.query(`UPDATE tenant_mcp_connections SET connection_status='error',last_checked_at=now(),last_error_code='connection_test_failed',updated_at=now()
        WHERE id=$1 AND tenant_id=$2`, [connection.id, tenantId]);
        await pool.query(`INSERT INTO audit_events(tenant_id,correlation_id,actor_email,actor_kind,action,resource_type,resource_id,metadata)
       VALUES($1,$2,$3,'platform_admin','mcp.connection.test_failed','mcp_connection',$4,$5)`, [tenantId, c.get('correlationId'), c.get('platformAdmin').email, connection.id, JSON.stringify({ integration: integrationKey })]);
        return fail(c, 502, 'mcp_unavailable', mcpTestFailureMessages[failureCode]
            ?? 'The MCP server could not be verified. Check the endpoint, API key, and approved host configuration.');
    }
    const allowedTools = connection.allowed_tools.filter((tool) => discoveredTools.includes(tool));
    await pool.query(`UPDATE tenant_mcp_connections SET connection_status='connected',discovered_tools=$3,allowed_tools=$4,
       last_checked_at=now(),last_error_code=NULL,updated_at=now() WHERE id=$1 AND tenant_id=$2`, [connection.id, tenantId, discoveredTools, allowedTools]);
    await pool.query(`INSERT INTO audit_events(tenant_id,correlation_id,actor_email,actor_kind,action,resource_type,resource_id,metadata)
     VALUES($1,$2,$3,'platform_admin','mcp.connection.tested','mcp_connection',$4,$5)`, [tenantId, c.get('correlationId'), c.get('platformAdmin').email, connection.id, JSON.stringify({ integration: integrationKey, discovered_tool_count: discoveredTools.length })]);
    return c.json({ success: true, data: { connection_status: 'connected', discovered_tools: discoveredTools, allowed_tools: allowedTools }, correlation_id: c.get('correlationId') });
});
export async function mcpConnectionsForTenant(tenantId) {
    const result = await pool.query(`SELECT id AS source_id,display_name,endpoint_url,auth_method,secret_ciphertext,secret_nonce,secret_tag,allowed_tools
       FROM tenant_mcp_connections
      WHERE tenant_id=$1 AND enabled=true AND connection_status='connected' AND cardinality(allowed_tools)>0
      ORDER BY integration_key`, [tenantId]);
    return result.rows.map((row) => ({
        source_id: row.source_id, name: row.display_name, endpoint_url: row.endpoint_url, auth_method: row.auth_method,
        api_key: decryptProviderSecret(row.secret_ciphertext, row.secret_nonce, row.secret_tag, encryptionKey()),
        allowed_tools: row.allowed_tools,
    }));
}
async function productGisConnection(tenantId, requiredTools) {
    const result = await pool.query(`SELECT id AS source_id,display_name,endpoint_url,auth_method,
            secret_ciphertext,secret_nonce,secret_tag,allowed_tools
       FROM tenant_mcp_connections
      WHERE tenant_id=$1 AND integration_key='gis' AND enabled=true AND connection_status='connected'
      LIMIT 1`, [tenantId]);
    const row = result.rows[0];
    if (!row)
        return { error: 'gis_connection_unavailable' };
    const missing = requiredTools.filter((tool) => !row.allowed_tools.includes(tool));
    if (missing.length)
        return { error: 'gis_product_tools_not_approved', missing_tools: missing };
    try {
        return { connection: {
                source_id: row.source_id, name: row.display_name, endpoint_url: row.endpoint_url,
                auth_method: row.auth_method,
                api_key: decryptProviderSecret(row.secret_ciphertext, row.secret_nonce, row.secret_tag, encryptionKey()),
                allowed_tools: row.allowed_tools,
            } };
    }
    catch {
        return { error: 'gis_connection_unavailable' };
    }
}
async function callProductAi(path, tenantId, correlationId, payload, timeoutMs = 60_000) {
    if (env.FAROAI_INTERNAL_SECRET.length < 32)
        throw new Error('ai_service_unavailable');
    const body = JSON.stringify({ tenant_id: tenantId, correlation_id: correlationId, ...payload });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac('sha256', env.FAROAI_INTERNAL_SECRET).update(`${timestamp}.${body}`).digest('hex');
    const response = await fetch(new URL(path, env.PYTHON_SERVICE_URL), {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-faroai-timestamp': timestamp, 'x-faroai-signature': signature },
        body, signal: AbortSignal.timeout(timeoutMs), redirect: 'error',
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || typeof data !== 'object' || data === null) {
        const detail = typeof data === 'object' && data !== null && 'detail' in data ? data.detail : null;
        throw new Error(typeof detail === 'string' && /^[a-z0-9_]{1,80}$/.test(detail) ? detail : 'ai_operation_failed');
    }
    return data;
}
const productCreativePromptSchema = z.object({
    prompt: z.string().trim().min(1).max(1000),
    count: z.number().int().min(1).max(20),
    batch_index: z.number().int().min(0).max(49).optional(),
    avoid_names: z.array(z.string().trim().min(1).max(200)).max(60).optional(),
}).strict();
const productMcpActionSchema = z.object({
    action: z.enum(['masters', 'preview', 'create', 'bulk_create', 'bulk_status']),
    types: z.array(z.enum(['item','collection','style','category','metal','color','size','stone','stone_group','shape','cut','clarity','stone_color','stone_size','setting_type','location','tax'])).min(1).max(17).optional(),
    query: z.string().trim().max(100).optional(),
    product: z.record(z.unknown()).optional(),
    products: z.array(z.record(z.unknown())).min(1).max(1000).optional(),
    job_id: z.string().regex(/^[a-fA-F0-9]{24}$/).optional(),
    offset: z.number().int().min(0).max(10000).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    confirm: z.literal(true).optional(),
}).strict();
const PRODUCT_CREATION_TOOLS = ['get_product_master_data', 'preview_product', 'create_product', 'create_products_bulk', 'get_mcp_bulk_job_status'];
const PROCUREMENT_TOOLS = ['get_product_master_data', 'search_po_products', 'preview_purchase_order', 'create_purchase_order',
    'search_purchase_orders', 'get_purchase_order', 'preview_inventory_receipt', 'receive_inventory'];
const procurementAssistantSchema = z.object({
    message: z.string().trim().min(1).max(1500),
    history: z.array(z.record(z.unknown())).max(12).optional(),
}).strict();
const procurementRuntimeSettingsSchema = z.object({ conversation_history_enabled: z.boolean() }).strict();
const procurementConfirmSchema = z.object({ draft_id: z.string().regex(/^[a-f0-9]{32}$/) }).strict();
adminRoutes.post('/tenants/:tenantId/product-creation/drafts', async (c) => {
    const tenantId = c.req.param('tenantId');
    if (!z.string().uuid().safeParse(tenantId).success || !await tenantExists(tenantId))
        return fail(c, 404, 'not_found', 'The tenant was not found.');
    const parsed = productCreativePromptSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
        return fail(c, 400, 'invalid_request', 'Enter a prompt and a product count from 1 to 20.');
    const gis = await productGisConnection(tenantId, PRODUCT_CREATION_TOOLS);
    if (!gis.connection)
        return c.json({ success: false, error: gis.error, message: gis.missing_tools
            ? `Approve these GIS tools in MCP connections first: ${gis.missing_tools.join(', ')}.`
            : 'Enable and test the tenant GIS MCP connection first.', correlation_id: c.get('correlationId') }, 409);
    let candidates;
    try {
        const draftOutputTokenBudget = Math.min(7000, Math.max(2000, parsed.data.count * 600));
        candidates = await modelCandidatesForTenant(tenantId, { max_output_tokens: draftOutputTokenBudget });
    }
    catch {
        return fail(c, 503, 'model_configuration_unavailable', 'The tenant model configuration is unavailable.');
    }
    if (!candidates.length)
        return fail(c, 409, 'no_eligible_model', 'Configure an eligible paid AI model for this tenant before generating drafts.');
    let decisionApiKey = '';
    try { decisionApiKey = await jevDecisionApiKey(); } catch { /* use the eligible default candidate below */ }
    const reservationId = await reserveModelCredit(tenantId, c.get('correlationId'));
    if (!reservationId)
        return fail(c, 402, 'insufficient_credits', 'The tenant has no available AI credits for draft generation.');
    try {
        const result = await callProductAi('/internal/v1/products/drafts', tenantId, c.get('correlationId'), {
            prompt: parsed.data.prompt, count: parsed.data.count,
            creative_direction: ['sculptural forms', 'architectural lines', 'botanical silhouettes', 'geometric details', 'celestial motifs', 'vintage revival', 'asymmetric balance', 'modular forms', 'fluid curves', 'bold minimalism', 'nature textures', 'graphic contrast'][(parsed.data.batch_index ?? 0) % 12],
            avoid_names: parsed.data.avoid_names ?? [], provider_candidates: candidates, decision_api_key: decisionApiKey,
        }, 15 * 60_000);
        await settleModelCredit(reservationId, result.model_used === true);
        await pool.query(`INSERT INTO audit_events(tenant_id,correlation_id,actor_email,actor_kind,action,resource_type,metadata)
         VALUES($1,$2,$3,$4,'product.content.generated','gis_product_batch',$5)`, [tenantId, c.get('correlationId'), c.get('platformAdmin').email, gisPromptActorKind(c),
            JSON.stringify({ count: result.drafts?.length ?? 0, provider: result.provider ?? 'unknown', model: result.model ?? 'unknown', decision_used: result.decision_used === true })]);
        const drafts = Array.isArray(result.drafts) ? result.drafts.map((draft) => ({
            ...draft,
            SKU: `FAROAI-${randomBytes(12).toString('hex').toUpperCase()}`,
            ID: `FAROAI-${randomBytes(12).toString('hex').toUpperCase()}`,
        })) : [];
        return c.json({ success: true, data: { ...result, drafts }, correlation_id: c.get('correlationId') });
    }
    catch (error) {
        await settleModelCredit(reservationId, false).catch(() => undefined);
        if (error instanceof Error && error.message === 'product_draft_response_invalid')
            return fail(c, 502, error.message, 'The selected paid model did not return the requested structured drafts. No product was created; try again or refresh the eligible model list.');
        if (error instanceof Error && error.message === 'product_draft_generation_failed')
            return fail(c, 502, error.message, 'The selected provider could not generate product drafts. Check provider availability or account limits, then try again.');
        return fail(c, 502, 'product_draft_generation_failed', 'AI could not generate product drafts. Check the provider and try again.');
    }
});
adminRoutes.post('/tenants/:tenantId/product-creation/tool', async (c) => {
    const tenantId = c.req.param('tenantId');
    if (!z.string().uuid().safeParse(tenantId).success || !await tenantExists(tenantId))
        return fail(c, 404, 'not_found', 'The tenant was not found.');
    const raw = await c.req.text();
    if (Buffer.byteLength(raw, 'utf8') > 2_000_000)
        return fail(c, 413, 'too_large', 'The product request is too large.');
    let input;
    try { input = JSON.parse(raw); } catch { return fail(c, 400, 'invalid_request', 'The request must contain valid JSON.'); }
    const parsed = productMcpActionSchema.safeParse(input);
    if (!parsed.success)
        return fail(c, 400, 'invalid_request', 'The GIS product operation is invalid.');
    const { action } = parsed.data;
    if (action === 'masters' && !parsed.data.types)
        return fail(c, 400, 'invalid_request', 'Choose at least one supported GIS master type.');
    if (['preview', 'create'].includes(action) && !parsed.data.product)
        return fail(c, 400, 'invalid_request', 'A product payload is required.');
    if (action === 'bulk_create' && !parsed.data.products)
        return fail(c, 400, 'invalid_request', 'A product list is required.');
    if (action === 'bulk_status' && !parsed.data.job_id)
        return fail(c, 400, 'invalid_request', 'A bulk job ID is required.');
    if (action === 'create' && parsed.data.confirm !== true)
        return fail(c, 400, 'confirmation_required', 'Confirm the reviewed product before saving it.');
    if (['preview', 'create'].includes(action)) {
        const product = parsed.data.product;
        const nameLength = typeof product.name === 'string' ? Array.from(product.name.trim()).length : 0;
        const descriptionLength = typeof product.Description === 'string' ? Array.from(product.Description.trim()).length : 0;
        if (Buffer.byteLength(JSON.stringify(product), 'utf8') > 32_000
            || !['name','SKU','ID','Matatag','Description'].every((key) => typeof product[key] === 'string' && product[key].trim())
            || nameLength < 50 || nameLength > 100 || descriptionLength < 300 || descriptionLength > 500
            || (product.status !== undefined && !['0','1'].includes(product.status)))
            return fail(c, 400, 'invalid_product', 'Product identity, description, or status is invalid.');
    }
    if (action === 'bulk_create') {
        const products = parsed.data.products!;
        const identities = products.flatMap((product) => [product.SKU, product.ID]);
        const names = products.map((product) => typeof product.name === 'string' ? product.name.trim().toLocaleLowerCase() : '');
        const invalid = products.some((product) => {
            const nameLength = typeof product.name === 'string' ? Array.from(product.name.trim()).length : 0;
            const descriptionLength = typeof product.Description === 'string' ? Array.from(product.Description.trim()).length : 0;
            return !['name','SKU','ID','Matatag','Description','item_id'].every((key) => typeof product[key] === 'string' && String(product[key]).trim())
                || nameLength < 50 || nameLength > 100 || descriptionLength < 300 || descriptionLength > 500
                || !/^[a-f0-9]{24}$/i.test(String(product.item_id))
                || (product.status !== undefined && !['0','1'].includes(String(product.status)))
                || Buffer.byteLength(JSON.stringify(product), 'utf8') > 32_000;
        });
        if (invalid || identities.some((value) => typeof value !== 'string' || !value.trim())
            || new Set(identities).size !== identities.length || names.some((name) => !name) || new Set(names).size !== names.length)
            return fail(c, 400, 'invalid_product_batch', 'Every product must have a unique name, SKU, and ID, a verified GIS item ID, and valid descriptions.');
    }
    const tool = action === 'masters' ? 'get_product_master_data'
        : action === 'preview' ? 'preview_product'
            : action === 'create' ? 'create_product'
                : action === 'bulk_create' ? 'create_products_bulk' : 'get_mcp_bulk_job_status';
    const gis = await productGisConnection(tenantId, PRODUCT_CREATION_TOOLS);
    if (!gis.connection)
        return c.json({ success: false, error: gis.error, message: gis.missing_tools
            ? `Approve these GIS tools in MCP connections first: ${gis.missing_tools.join(', ')}.`
            : 'Enable and test the tenant GIS MCP connection first.', correlation_id: c.get('correlationId') }, 409);
    try {
        const args = action === 'masters'
            ? { types: parsed.data.types, ...(parsed.data.query ? { query: parsed.data.query } : {}), limit: 100 }
            : action === 'bulk_create' ? { products: parsed.data.products }
                : action === 'bulk_status' ? { job_id: parsed.data.job_id, offset: parsed.data.offset ?? 0, limit: parsed.data.limit ?? 100 }
                    : parsed.data.product;
        if (action === 'create') {
            const preview = await callProductAi('/internal/v1/products/mcp-tool', tenantId, c.get('correlationId'), {
                mcp_connection: gis.connection, tool: 'preview_product', arguments: args,
            });
            const previewResult = preview.result;
            if (!previewResult || previewResult.valid !== true || previewResult.can_create === false)
                return c.json({ success: false, error: 'preview_failed', message: 'GIS rejected the final preview. Correct the product details and preview again.', data: previewResult ?? null, correlation_id: c.get('correlationId') }, 409);
        }
        const result = await callProductAi('/internal/v1/products/mcp-tool', tenantId, c.get('correlationId'), {
            mcp_connection: gis.connection, tool, arguments: args,
        });
        if (action === 'create') {
            const outcome = result.result;
            if (!outcome || outcome.created !== true)
                return c.json({ success: false, error: outcome?.conflict ? 'product_conflict' : 'product_not_created', message: outcome?.conflict ? 'GIS reported a duplicate SKU or ID. Verify the catalog before retrying.' : 'GIS did not confirm product creation. Verify the catalog before retrying.', data: outcome ?? null, correlation_id: c.get('correlationId') }, 409);
            await pool.query(`INSERT INTO audit_events(tenant_id,correlation_id,actor_email,actor_kind,action,resource_type,resource_id,metadata)
             VALUES($1,$2,$3,$4,'product.created','gis_product',$5,$6)`, [tenantId, c.get('correlationId'), c.get('platformAdmin').email, gisPromptActorKind(c),
                String(outcome.product?.id ?? outcome.product_id ?? outcome.id ?? ''), JSON.stringify({ integration: 'gis' })]);
        }
        else if (action === 'preview') {
            await pool.query(`INSERT INTO audit_events(tenant_id,correlation_id,actor_email,actor_kind,action,resource_type,metadata)
             VALUES($1,$2,$3,$4,'product.previewed','gis_product',$5)`, [tenantId, c.get('correlationId'), c.get('platformAdmin').email, gisPromptActorKind(c),
                JSON.stringify({ valid: result.result?.valid === true })]);
        }
        else if (action === 'bulk_create') {
            await pool.query(`INSERT INTO audit_events(tenant_id,correlation_id,actor_email,actor_kind,action,resource_type,metadata)
             VALUES($1,$2,$3,$4,'product.bulk_create.queued','gis_product_batch',$5)`, [tenantId, c.get('correlationId'), c.get('platformAdmin').email, gisPromptActorKind(c),
                JSON.stringify({ count: parsed.data.products?.length ?? 0, job_id: result.result?.job_id ?? null })]);
        }
        return c.json({ success: true, data: result.result, correlation_id: c.get('correlationId') });
    }
    catch {
        return fail(c, 502, 'gis_operation_failed', action === 'create'
            ? 'GIS did not return a clear result. Verify the catalog before retrying.'
            : 'The GIS product operation could not be completed.');
    }
});
adminRoutes.post('/tenants/:tenantId/procurement/assistant', async (c) => {
    const tenantId = c.req.param('tenantId');
    if (!z.string().uuid().safeParse(tenantId).success || !await tenantExists(tenantId))
        return fail(c, 404, 'not_found', 'The tenant was not found.');
    const parsed = procurementAssistantSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
        return fail(c, 400, 'invalid_request', 'Enter a Thai or English PO or inventory request.');
    const gis = await productGisConnection(tenantId, PROCUREMENT_TOOLS);
    if (!gis.connection)
        return c.json({ success: false, error: gis.error, message: gis.missing_tools
            ? `Approve these GIS procurement tools in MCP connections first: ${gis.missing_tools.join(', ')}.`
            : 'Enable and test the tenant GIS MCP connection first.', correlation_id: c.get('correlationId') }, 409);
    let candidates;
    let decisionApiKey = '';
    let conversationHistoryEnabled = true;
    try {
        candidates = await modelCandidatesForTenant(tenantId, { max_output_tokens: 6000 });
        decisionApiKey = await jevDecisionApiKey();
        conversationHistoryEnabled = await procurementConversationHistoryEnabled();
    }
    catch {
        return fail(c, 503, 'model_configuration_unavailable', 'The tenant model configuration is unavailable.');
    }
    if (!candidates.length)
        return fail(c, 409, 'no_eligible_model', 'Configure an eligible paid model and price ceiling before using GIS procurement.');
    const reservationId = await reserveModelCredit(tenantId, c.get('correlationId'));
    if (!reservationId)
        return fail(c, 402, 'insufficient_credits', 'The tenant has no available AI credits for this procurement request.');
    let procurementStage = 'ai_request';
    try {
        const result = await callProductAi('/internal/v1/procurement/assistant', tenantId, c.get('correlationId'), {
            actor_email: c.get('platformAdmin').email, mcp_connection: gis.connection,
            message: parsed.data.message, history: conversationHistoryEnabled ? parsed.data.history ?? [] : [],
            provider_candidates: candidates, decision_api_key: decisionApiKey,
        }, 120_000);
        procurementStage = 'settle_credit';
        await settleModelCredit(reservationId, result.model_used === true);
        let pendingConfirmation = null;
        if (result.pending_action && typeof result.pending_action === 'object') {
            procurementStage = 'validate_preview';
            const action = result.pending_action;
            const kind = action.kind;
            const argumentsValue = action.arguments;
            const preview = action.preview;
            if (!['create_purchase_order', 'receive_inventory'].includes(kind)
                || typeof argumentsValue !== 'object' || argumentsValue === null
                || typeof preview !== 'object' || preview === null) {
                return fail(c, 502, 'procurement_preview_invalid', 'The GIS preview could not be safely saved for confirmation.');
            }
            const draftId = randomBytes(16).toString('hex');
            const draft = { tenant_id: tenantId, actor_email: c.get('platformAdmin').email, kind,
                arguments: argumentsValue, preview, status: 'pending', created_at: new Date().toISOString() };
            if (Buffer.byteLength(JSON.stringify(draft), 'utf8') > 100_000)
                return fail(c, 413, 'procurement_preview_too_large', 'The GIS preview is too large to store safely.');
            procurementStage = 'save_preview';
            if (redis.status === 'wait') await redis.connect();
            await redis.set(`faroai:procurement:preview:${tenantId}:${draftId}`, JSON.stringify(draft), 'EX', 900, 'NX');
            pendingConfirmation = { draft_id: draftId, kind, preview, expires_in_seconds: 900 };
        }
        procurementStage = 'audit';
        await pool.query(`INSERT INTO audit_events(tenant_id,correlation_id,actor_email,actor_kind,action,resource_type,metadata)
         VALUES($1,$2,$3,$4,'procurement.assistant.used','gis_procurement',$5)`, [tenantId, c.get('correlationId'), c.get('platformAdmin').email, gisPromptActorKind(c),
            JSON.stringify({ provider: result.provider ?? 'unknown', model: result.model ?? 'unknown', decision_used: result.decision_used === true,
                has_pending_confirmation: !!pendingConfirmation, conversation_history_enabled: conversationHistoryEnabled })]);
        return c.json({ success: true, data: { answer: result.answer, history: conversationHistoryEnabled ? result.history ?? [] : [],
            pending_confirmation: pendingConfirmation, purchase_orders: result.purchase_orders ?? [],
            provider: result.provider, model: result.model,
            decision_used: result.decision_used === true }, correlation_id: c.get('correlationId') });
    }
    catch (error) {
        await settleModelCredit(reservationId, false).catch(() => undefined);
        const code = error instanceof Error ? error.message : '';
        console.error(JSON.stringify({ event: 'procurement_assistant_failed', correlation_id: c.get('correlationId'),
            stage: procurementStage, error_type: error instanceof Error ? error.name : 'unknown',
            error_message: error instanceof Error ? error.message.replace(/[\r\n]/g, ' ').slice(0, 160) : 'unknown',
            error_code: /^[a-z0-9_]{1,80}$/.test(code) ? code : 'internal_error' }));
        if (code === 'required_gis_tools_not_approved')
            return fail(c, 409, code, 'Some required GIS procurement tools are not currently discovered and approved. Retest the connection and approve the PO and receipt tools.');
        return fail(c, 502, 'procurement_assistant_failed', 'FaroAI could not complete this PO or inventory request. No PO or receipt was created.');
    }
});
adminRoutes.post('/tenants/:tenantId/procurement/confirm', async (c) => {
    const tenantId = c.req.param('tenantId');
    if (!z.string().uuid().safeParse(tenantId).success || !await tenantExists(tenantId))
        return fail(c, 404, 'not_found', 'The tenant was not found.');
    const parsed = procurementConfirmSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
        return fail(c, 400, 'invalid_request', 'The procurement confirmation is invalid.');
    const actorEmail = c.get('platformAdmin').email;
    const key = `faroai:procurement:preview:${tenantId}:${parsed.data.draft_id}`;
    const claimScript = `local raw=redis.call('GET',KEYS[1]); if not raw then return 'missing' end; local item=cjson.decode(raw); if item.actor_email~=ARGV[1] or item.status~='pending' then return 'invalid' end; item.status='executing'; redis.call('SET',KEYS[1],cjson.encode(item),'EX',900); return cjson.encode(item)`;
    const claimed = await redis.eval(claimScript, 1, key, actorEmail);
    if (typeof claimed !== 'string' || claimed === 'missing')
        return fail(c, 404, 'procurement_preview_expired', 'This GIS preview has expired. Run the request again to get a new preview.');
    if (claimed === 'invalid')
        return fail(c, 409, 'procurement_confirmation_replayed', 'This preview is already being processed or was already used.');
    let draft;
    try { draft = JSON.parse(claimed); } catch { return fail(c, 409, 'procurement_preview_invalid', 'The saved preview could not be read.'); }
    const gis = await productGisConnection(tenantId, PROCUREMENT_TOOLS);
    if (!gis.connection) {
        draft.status = 'blocked';
        await redis.set(key, JSON.stringify(draft), 'EX', 900);
        return c.json({ success: false, error: gis.error, message: gis.missing_tools
            ? `Approve these GIS procurement tools first: ${gis.missing_tools.join(', ')}.`
            : 'Enable and test the tenant GIS MCP connection first.' }, 409);
    }
    const previewTool = draft.kind === 'create_purchase_order' ? 'preview_purchase_order' : 'preview_inventory_receipt';
    let mutationSent = false;
    try {
        const current = await callProductAi('/internal/v1/procurement/tool', tenantId, c.get('correlationId'), {
            mcp_connection: gis.connection, tool: previewTool, arguments: draft.arguments,
        });
        const preview = current.result;
        if (!preview || preview.valid !== true || (draft.kind === 'receive_inventory' && preview.can_receive === false)) {
            draft.status = 'blocked';
            await redis.set(key, JSON.stringify(draft), 'EX', 900);
            return c.json({ success: false, error: 'procurement_preview_failed', message: 'GIS data changed or the latest preview did not pass. Review a fresh preview before confirming.', data: preview ?? null }, 409);
        }
        const stableJson = (value) => JSON.stringify(value, (_key, child) => child && typeof child === 'object' && !Array.isArray(child)
            ? Object.fromEntries(Object.keys(child).sort().map((name) => [name, child[name]])) : child);
        if (stableJson(preview) !== stableJson(draft.preview)) {
            draft.status = 'superseded';
            await redis.set(key, JSON.stringify(draft), 'EX', 900);
            const refreshedDraftId = randomBytes(16).toString('hex');
            const refreshedDraft = { ...draft, status: 'pending', preview, created_at: new Date().toISOString() };
            const refreshedKey = `faroai:procurement:preview:${tenantId}:${refreshedDraftId}`;
            await redis.set(refreshedKey, JSON.stringify(refreshedDraft), 'EX', 900, 'NX');
            return c.json({ success: true, data: { answer: 'GIS data changed since the last preview. Please review this refreshed preview and confirm again.',
                pending_confirmation: { draft_id: refreshedDraftId, kind: draft.kind, preview, expires_in_seconds: 900 } }, correlation_id: c.get('correlationId') });
        }
        const tool = draft.kind;
        mutationSent = true;
        const result = await callProductAi('/internal/v1/procurement/tool', tenantId, c.get('correlationId'), {
            mcp_connection: gis.connection, tool, arguments: draft.arguments,
        }, 90_000);
        const outcome = result.result;
        const completed = tool === 'create_purchase_order' ? outcome?.created === true : outcome?.created === true || outcome?.accepted === true;
        if (!completed) {
            draft.status = 'failed';
            draft.outcome = outcome;
            await redis.set(key, JSON.stringify(draft), 'EX', 900);
            return c.json({ success: false, error: 'procurement_write_not_confirmed', message: 'GIS did not confirm the write. Check the PO or receipt in GIS before retrying.', data: outcome ?? null }, 502);
        }
        draft.status = 'completed';
        draft.outcome = outcome;
        await redis.set(key, JSON.stringify(draft), 'EX', 900);
        await pool.query(`INSERT INTO audit_events(tenant_id,correlation_id,actor_email,actor_kind,action,resource_type,resource_id,metadata)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [tenantId, c.get('correlationId'), actorEmail, gisPromptActorKind(c),
            tool === 'create_purchase_order' ? 'purchase_order.created' : 'inventory_receipt.created',
            tool === 'create_purchase_order' ? 'gis_purchase_order' : 'gis_inventory_receipt',
            String(outcome.purchase_order?.id ?? outcome.receipt?.id ?? outcome.job_id ?? ''),
            JSON.stringify({ status: outcome.status ?? (outcome.accepted ? 'queued' : 'pending_approval') })]);
        const answer = tool === 'create_purchase_order'
            ? 'The PO was created in GIS with pending approval status. Approve it in GIS before receiving inventory.'
            : outcome.accepted && outcome.job_id
                ? `GIS accepted the inventory receipt job (${String(outcome.job_id)}). The resulting receipt remains pending GIS approval.`
                : 'The inventory receipt was created in GIS with pending approval status. Approve it in GIS before stock is available.';
        return c.json({ success: true, data: { answer, kind: tool, outcome }, correlation_id: c.get('correlationId') });
    }
    catch {
        draft.status = mutationSent ? 'unknown' : 'failed';
        await redis.set(key, JSON.stringify(draft), 'EX', 900).catch(() => undefined);
        return fail(c, 502, mutationSent ? 'procurement_write_unknown' : 'procurement_preview_failed', mutationSent
            ? 'The GIS write result is unknown. Check GIS before retrying; FaroAI will not repeat the write automatically.'
            : 'GIS could not revalidate the preview. No write was sent.');
    }
});
adminRoutes.get('/tenants/:tenantId/embedding/jobs', async (c) => {
    const tenantId = c.req.param('tenantId');
    if (!await tenantExists(tenantId))
        return fail(c, 404, 'not_found', 'The tenant was not found.');
    const paging = pageParams.safeParse(c.req.query());
    if (!paging.success)
        return fail(c, 400, 'invalid_request', 'The page parameters are invalid.');
    const result = await pool.query(`SELECT id,source_id,source_version,collection_name,embedding_model,job_kind,status,attempts,total_documents,completed_documents,error_code,created_at,updated_at
       FROM embedding_jobs WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`, [tenantId, paging.data.limit, paging.data.offset]);
    return c.json({ success: true, data: { items: result.rows, ...paging.data }, correlation_id: c.get('correlationId') });
});
adminRoutes.post('/tenants/:tenantId/embedding/jobs/:jobId/retry', async (c) => {
    const { tenantId, jobId } = c.req.param();
    if (!z.string().uuid().safeParse(tenantId).success || !z.string().uuid().safeParse(jobId).success)
        return fail(c, 400, 'invalid_request', 'The tenant or job ID is invalid.');
    if (!await tenantExists(tenantId))
        return fail(c, 404, 'not_found', 'The tenant was not found.');
    const result = await pool.query(`UPDATE embedding_jobs SET status='pending',attempts=0,error_code=NULL,updated_at=now()-interval '10 seconds'
      WHERE tenant_id=$1 AND id=$2 AND status IN ('failed','cancelled') RETURNING id`, [tenantId, jobId]);
    if (!result.rowCount)
        return fail(c, 409, 'job_not_retryable', 'Only failed or cancelled jobs can be retried.');
    await pool.query(`INSERT INTO audit_events(tenant_id,correlation_id,actor_email,actor_kind,action,resource_type,resource_id)
     VALUES($1,$2,$3,'platform_admin','embedding_job.retried','embedding_job',$4)`, [tenantId, c.get('correlationId'), c.get('platformAdmin').email, jobId]);
    return c.json({ success: true, data: { id: jobId, status: 'pending' }, correlation_id: c.get('correlationId') }, 202);
});
adminRoutes.post('/tenants/:tenantId/embedding/jobs/:jobId/cancel', async (c) => {
    const { tenantId, jobId } = c.req.param();
    if (!z.string().uuid().safeParse(tenantId).success || !z.string().uuid().safeParse(jobId).success)
        return fail(c, 400, 'invalid_request', 'The tenant or job ID is invalid.');
    if (!await tenantExists(tenantId))
        return fail(c, 404, 'not_found', 'The tenant was not found.');
    const result = await pool.query(`UPDATE embedding_jobs SET status='cancelled',updated_at=now()
      WHERE tenant_id=$1 AND id=$2 AND status IN ('pending','queued') RETURNING id`, [tenantId, jobId]);
    if (!result.rowCount)
        return fail(c, 409, 'job_not_cancellable', 'Only pending or queued jobs can be cancelled.');
    await pool.query(`INSERT INTO audit_events(tenant_id,correlation_id,actor_email,actor_kind,action,resource_type,resource_id)
     VALUES($1,$2,$3,'platform_admin','embedding_job.cancelled','embedding_job',$4)`, [tenantId, c.get('correlationId'), c.get('platformAdmin').email, jobId]);
    return c.json({ success: true, data: { id: jobId, status: 'cancelled' }, correlation_id: c.get('correlationId') });
});
adminRoutes.get('/tenants/:tenantId/knowledge/documents', async (c) => {
    const tenantId = c.req.param('tenantId');
    if (!await tenantExists(tenantId))
        return fail(c, 404, 'not_found', 'The tenant was not found.');
    const paging = pageParams.safeParse(c.req.query());
    if (!paging.success)
        return fail(c, 400, 'invalid_request', 'The page parameters are invalid.');
    const result = await pool.query(`SELECT id,source_id,title,language,content_version,
        CASE WHEN status='pending' AND approved_at IS NOT NULL THEN 'indexing' ELSE status END AS status,approved_by,approved_at,
        left(sanitized_content,1200) AS content_preview,char_length(sanitized_content)::int AS character_count,updated_at FROM knowledge_documents
      WHERE tenant_id=$1 ORDER BY updated_at DESC LIMIT $2 OFFSET $3`, [tenantId, paging.data.limit, paging.data.offset]);
    return c.json({ success: true, data: { items: result.rows, ...paging.data }, correlation_id: c.get('correlationId') });
});
adminRoutes.post('/tenants/:tenantId/knowledge/documents', async (c) => {
    const tenantId = c.req.param('tenantId');
    if (!z.string().uuid().safeParse(tenantId).success)
        return fail(c, 400, 'invalid_request', 'The tenant ID is invalid.');
    if (!await tenantExists(tenantId))
        return fail(c, 404, 'not_found', 'The tenant was not found.');
    const raw = await c.req.text();
    if (Buffer.byteLength(raw, 'utf8') > 250_000)
        return fail(c, 413, 'too_large', 'The knowledge document is too large.');
    let input;
    try { input = JSON.parse(raw || 'null'); }
    catch { return fail(c, 400, 'invalid_request', 'The request must contain valid JSON.'); }
    const parsed = knowledgeDocumentSchema.safeParse(input);
    if (!parsed.success)
        return fail(c, 400, 'invalid_request', 'Enter a title, language, and document text (up to 100,000 characters).');
    const content = parsed.data.content.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\r\n?/g, '\n').trim();
    if (!content)
        return fail(c, 400, 'invalid_request', 'The document has no readable text.');
    const contentHash = createHash('sha256').update(content, 'utf8').digest();
    const contentVersion = contentHash.toString('hex').slice(0, 32);
    const documentId = `manual-${randomBytes(16).toString('hex')}`;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [tenantId]);
        let source = await client.query(`SELECT id FROM mcp_sources
          WHERE tenant_id=$1 AND name='Backoffice knowledge uploads' AND mode='indexed' LIMIT 1`, [tenantId]);
        if (!source.rows[0]) {
            source = await client.query(`INSERT INTO mcp_sources(tenant_id,name,mode,allowed_resources,refresh_seconds,status)
              VALUES($1,'Backoffice knowledge uploads','indexed',ARRAY['manual'],86400,'active') RETURNING id`, [tenantId]);
        }
        const sourceId = source.rows[0].id;
        await client.query(`INSERT INTO knowledge_documents
          (tenant_id,id,source_id,title,sanitized_content,language,content_version,content_hash,status)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pending')`,
        [tenantId, documentId, sourceId, parsed.data.title, content, parsed.data.language, contentVersion, contentHash]);
        await client.query(`INSERT INTO audit_events(tenant_id,correlation_id,actor_email,actor_kind,action,resource_type,resource_id,metadata)
          VALUES($1,$2,$3,'platform_admin','knowledge.document.created','knowledge_document',$4,$5)`,
        [tenantId, c.get('correlationId'), c.get('platformAdmin').email, documentId,
            JSON.stringify({ source_id: sourceId, title: parsed.data.title, language: parsed.data.language, content_version: contentVersion, character_count: content.length })]);
        await client.query('COMMIT');
        return c.json({ success: true, data: { id: documentId, source_id: sourceId, title: parsed.data.title, language: parsed.data.language, content_version: contentVersion, status: 'pending', character_count: content.length }, correlation_id: c.get('correlationId') }, 201);
    }
    catch {
        await client.query('ROLLBACK').catch(() => undefined);
        return fail(c, 500, 'knowledge_document_save_failed', 'The knowledge document could not be saved.');
    }
    finally {
        client.release();
    }
});
adminRoutes.post('/tenants/:tenantId/knowledge/documents/:documentId/approve', async (c) => {
    const { tenantId, documentId } = c.req.param();
    if (!z.string().uuid().safeParse(tenantId).success || !/^manual-[a-f0-9]{32}$/.test(documentId))
        return fail(c, 400, 'invalid_request', 'The tenant or document ID is invalid.');
    if (!await tenantExists(tenantId))
        return fail(c, 404, 'not_found', 'The tenant was not found.');
    const client = await pool.connect();
    let approvedDocument;
    try {
        await client.query('BEGIN');
        const updated = await client.query(`UPDATE knowledge_documents SET approved_by=$3,approved_at=now(),updated_at=now()
          WHERE tenant_id=$1 AND id=$2 AND status='pending' AND approved_at IS NULL
          RETURNING source_id,title,language,sanitized_content,content_version`, [tenantId, documentId, c.get('platformAdmin').email]);
        if (!updated.rows[0]) {
            await client.query('ROLLBACK');
            return fail(c, 409, 'knowledge_document_not_approvable', 'Only a pending, unapproved document can be approved.');
        }
        approvedDocument = updated.rows[0];
        await client.query(`INSERT INTO audit_events(tenant_id,correlation_id,actor_email,actor_kind,action,resource_type,resource_id,metadata)
          VALUES($1,$2,$3,'platform_admin','knowledge.document.approved','knowledge_document',$4,$5)`,
        [tenantId, c.get('correlationId'), c.get('platformAdmin').email, documentId,
            JSON.stringify({ source_id: approvedDocument.source_id, content_version: approvedDocument.content_version })]);
        await client.query('COMMIT');
    }
    catch {
        await client.query('ROLLBACK').catch(() => undefined);
        return fail(c, 500, 'knowledge_document_approval_failed', 'The knowledge document could not be approved.');
    }
    finally {
        client.release();
    }
    const sourceVersion = `manual-${approvedDocument.content_version}`;
    const indexed = await postToAiService('/internal/v1/knowledge/index', {
        tenant_id: tenantId,
        correlation_id: c.get('correlationId'),
        source_id: approvedDocument.source_id,
        source_version: sourceVersion,
        documents: [{ id: documentId, title: approvedDocument.title, text: approvedDocument.sanitized_content,
            language: approvedDocument.language, content_version: approvedDocument.content_version }],
    }, 35_000);
    if (!indexed.ok || !indexed.data || typeof indexed.data.job_id !== 'string') {
        await pool.query(`UPDATE knowledge_documents SET approved_by=NULL,approved_at=NULL,updated_at=now()
          WHERE tenant_id=$1 AND id=$2 AND status='pending'`, [tenantId, documentId]).catch(() => undefined);
        await pool.query(`INSERT INTO audit_events(tenant_id,correlation_id,actor_email,actor_kind,action,resource_type,resource_id,metadata)
          VALUES($1,$2,$3,'platform_admin','knowledge.document.approval_failed','knowledge_document',$4,'{}')`,
        [tenantId, c.get('correlationId'), c.get('platformAdmin').email, documentId]).catch(() => undefined);
        return fail(c, 502, 'knowledge_index_failed', 'The approved document could not be queued for Qdrant indexing.');
    }
    return c.json({ success: true, data: { id: documentId, status: 'indexing', job_id: indexed.data.job_id }, correlation_id: c.get('correlationId') }, 202);
});
adminRoutes.get('/tenants/:tenantId/learning/settings', async (c) => {
    const tenantId = c.req.param('tenantId');
    if (!await tenantExists(tenantId))
        return fail(c, 404, 'not_found', 'The tenant was not found.');
    const result = await pool.query(`SELECT local_training_authorized,local_authorization_reference,
          shared_training_authorized,authorization_reference,updated_by_email,updated_at
       FROM tenant_learning_settings WHERE tenant_id=$1`, [tenantId]);
    return c.json({ success: true, data: result.rows[0] ?? {
            local_training_authorized: false, local_authorization_reference: null,
            shared_training_authorized: false, authorization_reference: null, updated_by_email: null, updated_at: null,
        }, correlation_id: c.get('correlationId') });
});
adminRoutes.put('/tenants/:tenantId/learning/settings', async (c) => {
    const tenantId = c.req.param('tenantId');
    if (!await tenantExists(tenantId))
        return fail(c, 404, 'not_found', 'The tenant was not found.');
    const parsed = learningSettingsSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success
        || (parsed.data.shared_training_authorized && !parsed.data.authorization_reference?.trim())
        || (parsed.data.local_training_authorized && !parsed.data.local_authorization_reference?.trim())) {
        return fail(c, 400, 'invalid_request', 'A reference is required for each tenant learning authorization.');
    }
    if (parsed.data.shared_training_authorized && env.FAROAI_DEPLOYMENT_MODE === 'self_hosted') {
        return fail(c, 403, 'shared_training_unavailable', 'Self-hosted deployments cannot authorize central training.');
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(`INSERT INTO tenant_learning_settings
          (tenant_id,local_training_authorized,local_authorization_reference,shared_training_authorized,authorization_reference,updated_by_email,updated_at)
         VALUES($1,$2,$3,$4,$5,$6,now()) ON CONFLICT(tenant_id) DO UPDATE SET
           local_training_authorized=EXCLUDED.local_training_authorized,local_authorization_reference=EXCLUDED.local_authorization_reference,
           shared_training_authorized=EXCLUDED.shared_training_authorized,authorization_reference=EXCLUDED.authorization_reference,
           updated_by_email=EXCLUDED.updated_by_email,updated_at=now()
         RETURNING local_training_authorized,local_authorization_reference,shared_training_authorized,
           authorization_reference,updated_by_email,updated_at`,
        [tenantId, parsed.data.local_training_authorized, parsed.data.local_training_authorized ? parsed.data.local_authorization_reference : null,
            parsed.data.shared_training_authorized, parsed.data.shared_training_authorized ? parsed.data.authorization_reference : null,
            c.get('platformAdmin').email]);
        await client.query(`INSERT INTO audit_events(tenant_id,correlation_id,actor_email,actor_kind,action,resource_type,resource_id,metadata)
          VALUES($1,$2,$3,'platform_admin',$5,'tenant_learning_settings',$6,$4)`, [tenantId, c.get('correlationId'), c.get('platformAdmin').email,
            JSON.stringify({
                local_training_authorized: parsed.data.local_training_authorized,
                local_authorization_reference: parsed.data.local_training_authorized ? parsed.data.local_authorization_reference : null,
                shared_training_authorized: parsed.data.shared_training_authorized,
                shared_authorization_reference: parsed.data.shared_training_authorized ? parsed.data.authorization_reference : null,
            }),
            'learning.authorization.updated', String(tenantId)]);
        await client.query('COMMIT');
        return c.json({ success: true, data: result.rows[0], correlation_id: c.get('correlationId') });
    }
    catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
    }
    finally {
        client.release();
    }
});
adminRoutes.post('/tenants/:tenantId/learning/rag/generate', async (c) => {
    const tenantId = c.req.param('tenantId');
    if (!z.string().uuid().safeParse(tenantId).success)
        return fail(c, 400, 'invalid_request', 'The tenant ID is invalid.');
    if (!await tenantExists(tenantId))
        return fail(c, 404, 'not_found', 'The tenant was not found.');
    if (!env.FAROAI_LOCAL_LLM_ENABLED)
        return fail(c, 403, 'local_llm_disabled', 'Enable a local model provider in this deployment before generating learning drafts.');
    const parsed = z.object({
        document_ids: z.array(z.string().min(1).max(200)).min(1).max(10),
        questions_per_document: z.number().int().min(1).max(5).default(3),
    }).strict().safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
        return fail(c, 400, 'invalid_request', 'Choose between 1 and 10 approved knowledge documents.');
    const settings = await pool.query('SELECT local_training_authorized FROM tenant_learning_settings WHERE tenant_id=$1', [tenantId]);
    if (!settings.rows[0]?.local_training_authorized)
        return fail(c, 403, 'tenant_authorization_required', 'This tenant has not authorized using its knowledge for local learning.');

    const modelResult = await pool.query(`SELECT m.id AS candidate_id,m.model,m.max_tokens,m.timeout_seconds,
        COALESCE(s.max_input_tokens,8192) AS max_input_tokens,
        p.provider,p.endpoint_url,p.enabled,p.allowed_models,p.secret_ciphertext,p.secret_nonce,p.secret_tag
      FROM tenant_model_candidates m JOIN provider_connections p ON p.id=m.provider_connection_id
      LEFT JOIN tenant_model_spending_policies s ON s.tenant_id=m.tenant_id
      WHERE m.tenant_id=$1 AND p.enabled AND p.provider IN ('ollama','lmstudio')
        AND m.model=ANY(p.allowed_models)
      ORDER BY m.is_default DESC,p.name,m.model LIMIT 1`, [tenantId]);
    const model = modelResult.rows[0];
    if (!model)
        return fail(c, 409, 'local_model_not_configured', 'Configure an enabled Ollama or LM Studio model for this tenant first.');
    let endpoint;
    try {
        if (!allowedProviderForDeployment(model.provider, env.FAROAI_DEPLOYMENT_MODE, env.FAROAI_ALLOW_EXTERNAL_PROVIDERS, env.FAROAI_LOCAL_LLM_ENABLED))
            return fail(c, 403, 'local_model_disabled', 'The configured local model is disabled by deployment policy.');
        endpoint = validateProviderEndpoint(model.provider, model.endpoint_url, allowedLocalHosts);
    }
    catch {
        return fail(c, 400, 'local_model_endpoint_rejected', 'The configured local model endpoint is not approved.');
    }
    let apiKey = '';
    try {
        if (model.secret_ciphertext && model.secret_nonce && model.secret_tag)
            apiKey = decryptProviderSecret(model.secret_ciphertext, model.secret_nonce, model.secret_tag, encryptionKey());
    }
    catch {
        return fail(c, 503, 'local_model_credential_unavailable', 'The local model credential could not be read securely.');
    }
    const documentsResult = await pool.query(`SELECT id,title,sanitized_content,language,content_version
      FROM knowledge_documents WHERE tenant_id=$1 AND id=ANY($2::text[]) AND status='approved'`,
    [tenantId, parsed.data.document_ids]);
    if (documentsResult.rowCount !== parsed.data.document_ids.length)
        return fail(c, 404, 'knowledge_document_not_found', 'One or more selected documents are missing, removed, or not approved.');
    const generated = await postToAiService('/internal/v1/learning/generate-from-rag', {
        tenant_id: tenantId,
        correlation_id: c.get('correlationId'),
        model_config_for_learning: {
            candidate_id: model.candidate_id,
            provider: model.provider,
            base_url: endpoint.toString().replace(/\/+$/, ''),
            api_key: apiKey,
            model: model.model,
            max_tokens: Math.min(2000, Math.max(512, model.max_tokens)),
            timeout_seconds: Math.min(60, Math.max(3, model.timeout_seconds)),
            max_input_tokens: model.max_input_tokens,
        },
        documents: documentsResult.rows.map((row) => ({
            id: row.id, title: row.title, text: row.sanitized_content,
            language: row.language, content_version: row.content_version,
        })),
        questions_per_document: parsed.data.questions_per_document,
    }, 600_000);
    if (!generated.ok || !generated.data || typeof generated.data !== 'object'
        || !Array.isArray(generated.data.drafts) || typeof generated.data.provider !== 'string'
        || typeof generated.data.model !== 'string') {
        return fail(c, 502, 'learning_draft_generation_failed', 'The configured local model could not create grounded learning drafts.');
    }
    const drafts = generated.data.drafts.slice(0, parsed.data.document_ids.length * parsed.data.questions_per_document);
    const inserted = [];
    for (const draft of drafts) {
        if (!draft || typeof draft !== 'object' || typeof draft.question !== 'string' || typeof draft.answer !== 'string'
            || typeof draft.language !== 'string' || !draft.source_ref || typeof draft.source_ref !== 'object') continue;
        const sourceRef = draft.source_ref;
        if (typeof sourceRef.id !== 'string' || !parsed.data.document_ids.includes(sourceRef.id)) continue;
        const hash = createHash('sha256').update(
            tenantId + '\n' + sourceRef.id + '\n' + String(draft.content_version ?? '') + '\n' + draft.question + '\n' + draft.answer,
        ).digest();
        const row = await pool.query(`INSERT INTO learning_candidates
          (tenant_id,question,generated_answer,provider,model,language,source_refs,rag_consent,local_consent,shared_consent,
           rag_training_consent,origin,correlation_id,content_hash)
          VALUES($1,$2,$3,$4,$5,$6,$7,false,false,false,true,'rag_document',$8,$9)
          ON CONFLICT DO NOTHING RETURNING id`,
        [tenantId,draft.question,draft.answer,generated.data.provider,generated.data.model,draft.language,
            JSON.stringify([{ ...sourceRef, content_version: draft.content_version }]),c.get('correlationId'),hash]);
        if (row.rows[0]) inserted.push(row.rows[0].id);
    }
    await pool.query(`INSERT INTO audit_events(tenant_id,correlation_id,actor_email,actor_kind,action,resource_type,resource_id,metadata)
      VALUES($1,$2,$3,'platform_admin','learning.rag_drafts.generated','knowledge_documents',$4,$5)`,
    [tenantId,c.get('correlationId'),c.get('platformAdmin').email,tenantId,
        JSON.stringify({ document_count: documentsResult.rowCount, draft_count: inserted.length, provider: generated.data.provider, model: generated.data.model })]);
    return c.json({ success: true, data: { draft_count: inserted.length, candidate_ids: inserted, provider: generated.data.provider, model: generated.data.model },
        correlation_id: c.get('correlationId') }, 201);
});
adminRoutes.get('/tenants/:tenantId/learning/candidates', async (c) => {
    const tenantId = c.req.param('tenantId');
    if (!await tenantExists(tenantId))
        return fail(c, 404, 'not_found', 'The tenant was not found.');
    const paging = pageParams.safeParse(c.req.query());
    if (!paging.success)
        return fail(c, 400, 'invalid_request', 'The page parameters are invalid.');
    const status = c.req.query('status') ?? 'pending_review';
    if (!['pending_review', 'approved', 'rejected', 'expired', 'deleted', 'all'].includes(status))
        return fail(c, 400, 'invalid_request', 'The candidate status is invalid.');
    const result = await pool.query(`SELECT id,question,generated_answer,preferred_answer,provider,model,language,source_refs,origin,rag_training_consent,
            rag_consent,local_consent,shared_consent,review_status,rag_approved,local_training_approved,
            shared_training_approved,rag_status,created_at,expires_at,reviewed_by,reviewed_at
       FROM learning_candidates WHERE tenant_id=$1 AND ($2='all' OR review_status=$2)
       ORDER BY created_at DESC LIMIT $3 OFFSET $4`, [tenantId, status, paging.data.limit, paging.data.offset]);
    return c.json({ success: true, data: { items: result.rows, ...paging.data, status }, correlation_id: c.get('correlationId') });
});
adminRoutes.post('/tenants/:tenantId/learning/candidates/:candidateId/review', async (c) => {
    const tenantId = c.req.param('tenantId');
    const candidateId = c.req.param('candidateId');
    if (!z.string().uuid().safeParse(candidateId).success)
        return fail(c, 400, 'invalid_request', 'The candidate ID is invalid.');
    if (!await tenantExists(tenantId))
        return fail(c, 404, 'not_found', 'The tenant was not found.');
    const parsed = learningReviewSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
        return fail(c, 400, 'invalid_request', 'The review decision is invalid.');
    const existing = await pool.query(`SELECT question,generated_answer,language,source_refs,origin,rag_training_consent,
       rag_consent,local_consent,shared_consent,review_status
       FROM learning_candidates WHERE tenant_id=$1 AND id=$2`, [tenantId, candidateId]);
    const candidate = existing.rows[0];
    if (!candidate)
        return fail(c, 404, 'not_found', 'The learning candidate was not found.');
    if (candidate.review_status !== 'pending_review')
        return fail(c, 409, 'candidate_already_reviewed', 'This candidate has already been reviewed.');
    if (candidate.origin === 'rag_document') {
        const sourceRefs = Array.isArray(candidate.source_refs) ? candidate.source_refs : [];
        const source = sourceRefs.find((item) => item && item.kind === 'knowledge_document');
        if (!source || typeof source.id !== 'string' || typeof source.content_version !== 'string')
            return fail(c, 409, 'learning_source_unavailable', 'The source document reference is missing.');
        const currentSource = await pool.query(`SELECT 1 FROM knowledge_documents
          WHERE tenant_id=$1 AND id=$2 AND content_version=$3 AND status='approved'`,
        [tenantId, source.id, source.content_version]);
        if (!currentSource.rowCount)
            return fail(c, 409, 'learning_source_changed', 'The source document changed or is no longer approved. Generate a fresh draft before approving it.');
    }
    const decision = parsed.data;
    if (decision.add_to_rag && !candidate.rag_consent)
        return fail(c, 403, 'consent_required', 'The user did not consent to using this answer as tenant knowledge.');
    const localPolicy = await pool.query('SELECT local_training_authorized FROM tenant_learning_settings WHERE tenant_id=$1', [tenantId]);
    const localConsentAvailable = candidate.local_consent || (candidate.origin === 'rag_document'
        && candidate.rag_training_consent && localPolicy.rows[0]?.local_training_authorized);
    if (decision.add_to_local_training && (!localConsentAvailable || !localPolicy.rows[0]?.local_training_authorized || !env.FAROAI_LOCAL_LLM_ENABLED)) {
        return fail(c, 403, 'local_training_unavailable', 'Local training requires tenant authorization, the applicable source consent, and an enabled local model.');
    }
    if (decision.add_to_shared_training) {
        const policy = await pool.query('SELECT shared_training_authorized FROM tenant_learning_settings WHERE tenant_id=$1', [tenantId]);
        if (env.FAROAI_DEPLOYMENT_MODE === 'self_hosted' || !candidate.shared_consent || !env.FAROAI_SHARED_TRAINING_ENABLED || !policy.rows[0]?.shared_training_authorized) {
            return fail(c, 403, 'shared_training_unavailable', 'Shared training requires user consent, tenant authorization, and the deployment switch.');
        }
    }
    const preferredAnswer = decision.review_status === 'approved' ? (decision.preferred_answer?.trim() || candidate.generated_answer) : null;
    const reviewed = await pool.query(`UPDATE learning_candidates SET review_status=$3,preferred_answer=$4,rag_approved=$5,
       local_training_approved=$6,shared_training_approved=$7,promotion_method='human',rag_status=$8,
       rag_job_id=NULL,reviewed_by=$9,reviewed_at=now()
     WHERE tenant_id=$1 AND id=$2 AND review_status='pending_review'`, [tenantId, candidateId, decision.review_status, preferredAnswer,
        decision.review_status === 'approved' && decision.add_to_rag,
        decision.review_status === 'approved' && decision.add_to_local_training,
        decision.review_status === 'approved' && decision.add_to_shared_training,
        decision.review_status === 'approved' && decision.add_to_rag ? 'pending' : 'not_requested',
        c.get('platformAdmin').email]);
    if (!reviewed.rowCount)
        return fail(c, 409, 'candidate_already_reviewed', 'This candidate has already been reviewed.');
    let ragJobId = null;
    if (decision.add_to_rag) {
        let source = await pool.query(`SELECT id FROM mcp_sources WHERE tenant_id=$1 AND name='Approved AI answers' AND mode='indexed' LIMIT 1`, [tenantId]);
        if (!source.rows[0]) {
            source = await pool.query(`INSERT INTO mcp_sources(tenant_id,name,mode,refresh_seconds,source_version,status)
         VALUES($1,'Approved AI answers','indexed',86400,'managed-v1','active') RETURNING id`, [tenantId]);
        }
        const indexed = await postToAiService('/internal/v1/knowledge/index', {
            tenant_id: tenantId, correlation_id: c.get('correlationId'), source_id: source.rows[0].id,
            source_version: `learning-${candidateId}`,
            documents: [{ id: `learning-${candidateId}`, title: `Reviewed AI answer ${candidateId.slice(0, 8)}`,
                    text: `Question: ${candidate.question}\nApproved answer: ${preferredAnswer}`, language: candidate.language,
                    content_version: `learning-${candidateId}` }],
        });
        if (!indexed.ok || typeof indexed.data !== 'object' || indexed.data === null || !('job_id' in indexed.data)
            || typeof indexed.data.job_id !== 'string') {
            await pool.query(`UPDATE learning_candidates SET review_status='pending_review',preferred_answer=NULL,rag_approved=false,
           local_training_approved=false,shared_training_approved=false,rag_status='not_requested',
           reviewed_by=NULL,reviewed_at=NULL
         WHERE tenant_id=$1 AND id=$2 AND review_status='approved' AND rag_job_id IS NULL`, [tenantId, candidateId]);
            return fail(c, 502, 'knowledge_index_failed', 'The approved answer could not be queued for Qdrant indexing.');
        }
        ragJobId = indexed.data.job_id;
        await pool.query('UPDATE learning_candidates SET rag_job_id=$3 WHERE tenant_id=$1 AND id=$2 AND review_status=\'approved\'', [tenantId, candidateId, ragJobId]);
    }
    await pool.query(`INSERT INTO audit_events(tenant_id,correlation_id,actor_email,actor_kind,action,resource_type,resource_id,metadata)
     VALUES($1,$2,$3,'platform_admin',$4,'learning_candidate',$5,$6)`, [tenantId, c.get('correlationId'), c.get('platformAdmin').email,
        decision.review_status === 'approved' ? 'learning_candidate.approved' : 'learning_candidate.rejected', candidateId,
        JSON.stringify({ add_to_rag: decision.add_to_rag, add_to_local_training: decision.add_to_local_training,
            add_to_shared_training: decision.add_to_shared_training })]);
    return c.json({ success: true, data: { id: candidateId, review_status: decision.review_status, rag_job_id: ragJobId }, correlation_id: c.get('correlationId') });
});
adminRoutes.delete('/tenants/:tenantId/learning/candidates/:candidateId', async (c) => {
    const tenantId = c.req.param('tenantId');
    const candidateId = c.req.param('candidateId');
    if (!z.string().uuid().safeParse(candidateId).success)
        return fail(c, 400, 'invalid_request', 'The candidate ID is invalid.');
    if (!await tenantExists(tenantId))
        return fail(c, 404, 'not_found', 'The tenant was not found.');
    const existing = await pool.query('SELECT rag_approved,review_status FROM learning_candidates WHERE tenant_id=$1 AND id=$2', [tenantId, candidateId]);
    const candidate = existing.rows[0];
    if (!candidate || (candidate.review_status === 'deleted' && !candidate.rag_approved))
        return fail(c, 404, 'not_found', 'The learning candidate was not found.');
    if (candidate.rag_approved) {
        await pool.query("UPDATE learning_candidates SET review_status='deleted' WHERE tenant_id=$1 AND id=$2", [tenantId, candidateId]);
        const removed = await postToAiService('/internal/v1/learning/delete', {
            tenant_id: tenantId, candidate_id: candidateId, correlation_id: c.get('correlationId'),
        });
        if (!removed.ok)
            return fail(c, 502, 'knowledge_delete_failed', 'The Qdrant knowledge item could not be removed.');
    }
    await pool.query(`UPDATE learning_candidates SET review_status='deleted',question='[deleted]',generated_answer='[deleted]',
       preferred_answer=NULL,source_refs='[]'::jsonb,rag_consent=false,local_consent=false,shared_consent=false,
       rag_training_consent=false,rag_approved=false,local_training_approved=false,shared_training_approved=false,
       content_hash=decode(repeat('00',32),'hex') WHERE tenant_id=$1 AND id=$2`, [tenantId, candidateId]);
    await pool.query(`INSERT INTO audit_events(tenant_id,correlation_id,actor_email,actor_kind,action,resource_type,resource_id)
     VALUES($1,$2,$3,'platform_admin','learning_candidate.deleted','learning_candidate',$4)`, [tenantId, c.get('correlationId'), c.get('platformAdmin').email, candidateId]);
    return c.json({ success: true, data: { id: candidateId, deleted: true }, correlation_id: c.get('correlationId') });
});
adminRoutes.get('/tenants/:tenantId/learning/datasets/local/export', async (c) => {
    const tenantId = c.req.param('tenantId');
    if (!await tenantExists(tenantId))
        return fail(c, 404, 'not_found', 'The tenant was not found.');
    if (!env.FAROAI_LOCAL_LLM_ENABLED) {
        return fail(c, 403, 'local_training_unavailable', 'Local dataset export requires an enabled local model.');
    }
    const localPolicy = await pool.query('SELECT local_training_authorized FROM tenant_learning_settings WHERE tenant_id=$1', [tenantId]);
    if (!localPolicy.rows[0]?.local_training_authorized)
        return fail(c, 403, 'tenant_authorization_required', 'This tenant has not authorized its data for local learning.');
    const examples = await pool.query(`SELECT c.id,c.question,c.preferred_answer FROM learning_candidates c
      WHERE c.tenant_id=$1 AND c.review_status='approved' AND c.local_training_approved=true
        AND c.preferred_answer IS NOT NULL
        AND (c.local_consent=true OR (c.origin='rag_document' AND c.rag_training_consent=true))
        AND (c.origin<>'rag_document' OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(c.source_refs) ref
          JOIN knowledge_documents d ON d.tenant_id=c.tenant_id AND d.id=ref->>'id'
          WHERE ref->>'kind'='knowledge_document' AND d.status='approved' AND d.content_version=ref->>'content_version'
        ))
      ORDER BY c.reviewed_at,c.id`, [tenantId]);
    if (examples.rowCount === 0)
        return fail(c, 409, 'dataset_empty', 'This tenant has no approved local-training examples yet. Approve at least one eligible example in Learning & training, then export again.');
    const jsonl = examples.rows.map((row) => JSON.stringify({ messages: [
            { role: 'user', content: row.question }, { role: 'assistant', content: row.preferred_answer },
        ] })).join('\n') + (examples.rowCount ? '\n' : '');
    const digest = createHash('sha256').update(jsonl).digest('hex');
    const manifest = await pool.query(`INSERT INTO learning_dataset_manifests(scope,tenant_id,example_count,content_sha256,created_by)
     VALUES('tenant_local',$1,$2,$3,$4) RETURNING id`, [tenantId, examples.rowCount, digest, c.get('platformAdmin').email]);
    const manifestId = manifest.rows[0].id;
    await pool.query(`INSERT INTO audit_events(tenant_id,correlation_id,actor_email,actor_kind,action,resource_type,resource_id,metadata)
     VALUES($1,$2,$3,'platform_admin','learning.dataset.exported','learning_dataset',$4,$5)`, [tenantId, c.get('correlationId'), c.get('platformAdmin').email, manifestId, JSON.stringify({ scope: 'tenant_local', example_count: examples.rowCount, sha256: digest })]);
    return c.body(jsonl, 200, {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'content-disposition': `attachment; filename="faroai-tenant-${tenantId}-dataset-${manifestId}.jsonl"`,
        'x-faroai-dataset-manifest': manifestId,
        'cache-control': 'no-store',
    });
});
adminRoutes.get('/learning/datasets/shared/export', async (c) => {
    if (env.FAROAI_DEPLOYMENT_MODE === 'self_hosted' || !env.FAROAI_SHARED_TRAINING_ENABLED)
        return fail(c, 403, 'shared_training_disabled', 'Shared training is disabled by deployment configuration.');
    const examples = await pool.query(`SELECT c.id,c.question,c.preferred_answer FROM learning_candidates c
       JOIN tenant_learning_settings s ON s.tenant_id=c.tenant_id AND s.shared_training_authorized=true
      WHERE c.review_status='approved' AND c.shared_training_approved=true AND c.shared_consent=true
        AND c.preferred_answer IS NOT NULL AND c.tenant_id IS NOT NULL
      ORDER BY c.tenant_id,c.reviewed_at,c.id LIMIT 50000`);
    const jsonl = examples.rows.map((row) => JSON.stringify({ messages: [
            { role: 'user', content: row.question }, { role: 'assistant', content: row.preferred_answer },
        ] })).join('\n') + (examples.rowCount ? '\n' : '');
    const digest = createHash('sha256').update(jsonl).digest('hex');
    const manifest = await pool.query(`INSERT INTO learning_dataset_manifests(scope,tenant_id,example_count,content_sha256,created_by)
     VALUES('central_shared',NULL,$1,$2,$3) RETURNING id`, [examples.rowCount, digest, c.get('platformAdmin').email]);
    const manifestId = manifest.rows[0].id;
    await pool.query(`INSERT INTO audit_events(tenant_id,correlation_id,actor_email,actor_kind,action,resource_type,resource_id,metadata)
     VALUES(NULL,$1,$2,'platform_admin','learning.dataset.exported','learning_dataset',$3,$4)`, [c.get('correlationId'), c.get('platformAdmin').email, manifestId, JSON.stringify({ scope: 'central_shared', example_count: examples.rowCount, sha256: digest })]);
    return c.body(jsonl, 200, {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'content-disposition': `attachment; filename="faroai-shared-dataset-${manifestId}.jsonl"`,
        'x-faroai-dataset-manifest': manifestId,
        'cache-control': 'no-store',
    });
});
adminRoutes.post('/tenants/:tenantId/retrieval/query', async (c) => {
    const tenantId = c.req.param('tenantId');
    if (!z.string().uuid().safeParse(tenantId).success)
        return fail(c, 400, 'invalid_request', 'The tenant ID is invalid.');
    if (!await tenantExists(tenantId))
        return fail(c, 404, 'not_found', 'The tenant was not found.');
    const parsed = z.object({ query: z.string().trim().min(1).max(500), language: z.enum(['en', 'th', 'fr']).default('en'), limit: z.number().int().min(1).max(10).default(5) }).strict().safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
        return fail(c, 400, 'invalid_request', 'The retrieval query is invalid.');
    if (env.FAROAI_INTERNAL_SECRET.length < 32)
        return fail(c, 503, 'ai_service_unavailable', 'The retrieval service is not configured.');
    const payload = { tenant_id: tenantId, correlation_id: c.get('correlationId'), ...parsed.data };
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac('sha256', env.FAROAI_INTERNAL_SECRET).update(`${timestamp}.${body}`).digest('hex');
    try {
        const response = await fetch(new URL('/internal/v1/retrieval/query', env.PYTHON_SERVICE_URL), {
            method: 'POST', headers: { 'content-type': 'application/json', 'x-faroai-timestamp': timestamp, 'x-faroai-signature': signature },
            body, signal: AbortSignal.timeout(15_000),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || typeof data !== 'object' || data === null)
            return fail(c, 502, 'retrieval_failed', 'The retrieval query could not be completed.');
        return c.json({ success: true, data, correlation_id: c.get('correlationId') });
    }
    catch {
        return fail(c, 502, 'retrieval_failed', 'The retrieval service is temporarily unavailable.');
    }
});
adminRoutes.get('/audit-events', async (c) => {
    const paging = pageParams.safeParse(c.req.query());
    if (!paging.success)
        return fail(c, 400, 'invalid_request', 'The page parameters are invalid.');
    const result = await pool.query(`SELECT id,tenant_id,actor_email,actor_kind,action,resource_type,resource_id,metadata,correlation_id,created_at
       FROM audit_events ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [paging.data.limit, paging.data.offset]);
    return c.json({ success: true, data: { items: result.rows, ...paging.data }, correlation_id: c.get('correlationId') });
});
adminRoutes.onError((error, c) => {
    console.error(JSON.stringify({ event: 'platform_admin_request_failed', correlation_id: c.get('correlationId'), name: error.name }));
    return fail(c, 500, 'server_error', 'The platform request could not be completed.');
});
