'use server';

import { artifactConfig } from './artifact-service';

export type DiscoveryResult = {
  answer: string;
  products: Array<{ id?: string; name?: string; sku?: string; productType?: string | null; price?: number | null; currency?: string | null; availability?: string | null; summary?: string | null; image?: string | null; url?: string | null }>;
  sources: Array<{ label?: string; kind?: string }>;
  search?: { resultCount?: number };
  learningCandidateRecorded?: boolean;
};

export type DiscoveryActionResult = { ok: true; data: DiscoveryResult } | { ok: false; message: string };

export type PromptTenant = { id: string; name: string };
export type PromptApiResult<T> = { success: boolean; data?: T; error?: string; message?: string };

export async function requestArtifact(input: { format: 'pdf' | 'xlsx' | 'docx' | 'pptx'; title: string; columns: string[]; rows: (string | number | boolean | null)[][] }) {
  const config = await artifactConfig(true);
  if (!config) return { success: false as const, message: 'Document creation is not configured for this tenant.' };
  try {
    const response = await fetch(new URL('/v1/artifacts', config.base), { method: 'POST',
      headers: { ...config.headers, 'content-type': 'application/json' }, body: JSON.stringify(input),
      cache: 'no-store', signal: AbortSignal.timeout(10000) });
    const body = await response.json();
    if (!response.ok || !body.success || !/^[0-9a-f-]{36}$/i.test(body.data?.id)) return { success: false as const, message: body.message ?? 'Document creation failed.' };
    return { success: true as const, id: body.data.id as string };
  } catch { return { success: false as const, message: 'The document service is unavailable.' }; }
}

export async function artifactStatus(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return 'failed';
  const config = await artifactConfig(false);
  if (!config) return 'failed';
  try {
    const response = await fetch(new URL(`/v1/artifacts/${id}`, config.base), { headers: config.headers, cache: 'no-store', signal: AbortSignal.timeout(5000) });
    const body = await response.json();
    return response.ok && ['pending', 'processing', 'completed', 'failed'].includes(body?.data?.status) ? body.data.status as string : 'failed';
  } catch { return 'failed'; }
}

function promptServiceConfig() {
  const apiKey = process.env.FAROAI_GIS_API_KEY;
  const tenantId = process.env.FAROAI_DEMO_TENANT_ID;
  const apiBase = process.env.FAROAI_API_INTERNAL_URL || 'http://api:3000';
  if (process.env.FAROAI_DEMO_ENABLED !== 'true' || !apiKey || !tenantId || !/^[0-9a-f-]{36}$/i.test(tenantId)) return null;
  if (process.env.FAROAI_TENANT_MODE === 'single' && tenantId !== process.env.FAROAI_SINGLE_TENANT_ID) return null;
  return { apiKey, tenantId, apiBase };
}

export async function getPromptTenant(): Promise<{ ok: true; tenant: PromptTenant } | { ok: false; message: string }> {
  const config = promptServiceConfig();
  if (!config) return { ok: false, message: 'GIS prompt operations have not been configured for this deployment.' };
  try {
    const response = await fetch(new URL(`/admin/v1/tenants/${config.tenantId}`, config.apiBase), {
      headers: { authorization: `Bearer ${config.apiKey}` }, cache: 'no-store', signal: AbortSignal.timeout(10_000),
    });
    const body = await response.json() as PromptApiResult<{ id: string; name: string; status: string }>;
    if (!response.ok || !body.success || !body.data || body.data.id !== config.tenantId || body.data.status !== 'active') {
      return { ok: false, message: body.message ?? 'The configured GIS tenant is unavailable.' };
    }
    return { ok: true, tenant: { id: body.data.id, name: body.data.name } };
  } catch {
    return { ok: false, message: 'The configured GIS tenant could not be reached.' };
  }
}

export async function gisPromptRequest<T>(tenantId: string, path: string, body: unknown, timeoutMs = 125_000): Promise<PromptApiResult<T>> {
  const config = promptServiceConfig();
  if (!config || tenantId !== config.tenantId) return { success: false, error: 'tenant_unavailable', message: 'The configured GIS tenant is unavailable.' };
  // Keep this server action limited to the prompt's GIS product and PO workflows.
  const allowedPath = new RegExp(`^/tenants/${config.tenantId}/(?:product-creation/(?:drafts|tool)|procurement/(?:assistant|confirm))$`, 'i');
  if (!allowedPath.test(path)) return { success: false, error: 'invalid_request', message: 'This GIS operation is not available from the prompt.' };
  try {
    const response = await fetch(new URL(`/admin/v1${path}`, config.apiBase), {
      method: 'POST', headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(timeoutMs),
    });
    return await response.json() as PromptApiResult<T>;
  } catch {
    return { success: false, error: 'service_unavailable', message: 'FaroAI could not reach the GIS workflow service.' };
  }
}

function safeProductUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function publicProducts(value: unknown): DiscoveryResult['products'] {
  if (!Array.isArray(value)) return [];
  const products: DiscoveryResult['products'] = [];
  const seen = new Set<string>();
  for (const entry of value.slice(0, 8)) {
    if (typeof entry !== 'object' || entry === null) continue;
    const item = entry as Record<string, unknown>;
    const id = typeof item.id === 'string' && item.id.length <= 120 ? item.id.trim() : '';
    const name = typeof item.name === 'string' && item.name.length <= 200 ? item.name.trim() : '';
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    const price = typeof item.price === 'number' && Number.isFinite(item.price) && item.price >= 0 && item.price <= 1_000_000_000 ? item.price : null;
    const currency = typeof item.currency === 'string' && /^[A-Z]{3}$/.test(item.currency) ? item.currency : null;
    products.push({
      id,
      name,
      sku: typeof item.sku === 'string' && item.sku.length <= 120 ? item.sku : undefined,
      productType: typeof item.productType === 'string' && item.productType.length <= 80 ? item.productType : null,
      price: currency ? price : null,
      currency: currency && price !== null ? currency : null,
      availability: typeof item.availability === 'string' && item.availability.length <= 80 ? item.availability : null,
      summary: typeof item.summary === 'string' && item.summary.length <= 500 ? item.summary : null,
      image: safeProductUrl(item.image),
      url: safeProductUrl(item.url),
    });
  }
  return products;
}

export async function askFaro(input: {
  message: string;
  consented: boolean;
  knowledgeImprovementConsented: boolean;
  trainingLocalConsented: boolean;
  trainingSharedConsented: boolean;
  state: Record<string, string | number>;
  image?: { base64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' };
}): Promise<DiscoveryActionResult> {
  if (!input.consented) return { ok: false, message: 'Please accept the AI chat notice before searching.' };
  if (typeof input.message !== 'string' || input.message.trim().length < 1 || input.message.length > 500) {
    return { ok: false, message: 'Enter a question of up to 500 characters.' };
  }

  const apiKey = process.env.FAROAI_DEMO_API_KEY;
  const tenantId = process.env.FAROAI_DEMO_TENANT_ID;
  const apiBase = process.env.FAROAI_API_INTERNAL_URL || 'http://api:3000';
  if (process.env.FAROAI_DEMO_ENABLED !== 'true' || !apiKey || !tenantId) {
    return { ok: false, message: 'AI discovery has not been configured for this deployment yet.' };
  }
  if (!/^[0-9a-f-]{36}$/i.test(tenantId)) return { ok: false, message: 'AI discovery is unavailable because tenant setup is incomplete.' };
  if (process.env.FAROAI_TENANT_MODE === 'single' && tenantId !== process.env.FAROAI_SINGLE_TENANT_ID) {
    return { ok: false, message: 'AI discovery is not available for the configured tenant.' };
  }
  const localTrainingConsent = input.trainingLocalConsented
    && process.env.FAROAI_LOCAL_LLM_ENABLED === 'true';
  const sharedTrainingConsent = input.trainingSharedConsented
    && process.env.FAROAI_DEPLOYMENT_MODE !== 'self_hosted'
    && process.env.FAROAI_SHARED_TRAINING_ENABLED === 'true';

  try {
    const response = await fetch(new URL('/v1/chat', apiBase), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'x-faroai-ai-chat-consent': 'true',
        'x-faroai-ai-improve-consent': String(input.knowledgeImprovementConsented),
        'x-faroai-ai-training-local-consent': String(localTrainingConsent),
        'x-faroai-ai-training-shared-consent': String(sharedTrainingConsent),
      },
      body: JSON.stringify({
        message: input.message.trim(), history: [], state: input.state,
        ...(input.image ? { image_base64: input.image.base64, image_media_type: input.image.mediaType } : {}),
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(input.image ? 70_000 : 35_000),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok || !body || typeof body !== 'object') {
      const detail = body && typeof body === 'object' && 'message' in body && typeof body.message === 'string' ? body.message : '';
      return { ok: false, message: detail || (response.status === 429 ? 'Please wait a moment and try again.' : 'FaroAI could not complete that search. Please try again.') };
    }
    const record = body as Record<string, unknown>;
    return {
      ok: true,
      data: {
        answer: typeof record.answer === 'string' ? record.answer : 'No verified answer was returned.',
        products: publicProducts(record.products),
        sources: Array.isArray(record.sources) ? record.sources as DiscoveryResult['sources'] : [],
        search: typeof record.search === 'object' && record.search !== null ? record.search as DiscoveryResult['search'] : undefined,
        learningCandidateRecorded: record.learning_candidate_recorded === true,
      },
    };
  } catch {
    return { ok: false, message: 'FaroAI is temporarily unavailable. Please try again.' };
  }
}
