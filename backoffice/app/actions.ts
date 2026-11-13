'use server';

import { tenantServerContext, tenantSessionHeaders } from './tenant-auth-context';
import { loadDocumentOcrForProcurement } from './document-import/server';

import { artifactConfig } from './artifact-service';
import { hasExplicitDocumentExport, requestedDocument, type PdfOrientation } from './chat-intent-hints';
import { isDocumentRevisionHint, type DocumentFormat, type DocumentImage, type DocumentLayout, type DocumentPlan } from './document-layout';

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

export async function requestArtifact(input: { format: DocumentFormat; title: string; columns: string[]; rows: (string | number | boolean | null)[][]; userRequest: string; orientation?: PdfOrientation; layout?: DocumentLayout; image?: DocumentImage; revisionOf?: string }) {
  const context = await tenantServerContext();
  if (!context) return { success: false as const, message: 'Sign in to your tenant before creating a document.' };
  const request = input.userRequest.trim();
  const formatRequested = requestedDocument(request) === input.format;
  const exportRequested = hasExplicitDocumentExport(request);
  const revisingCurrentDocument = Boolean(input.revisionOf && /^[0-9a-f-]{36}$/i.test(input.revisionOf)
    && isDocumentRevisionHint(request) && await artifactStatus(input.revisionOf) === 'completed');
  if ((!formatRequested || !exportRequested) && !revisingCurrentDocument)
    return { success: false as const, message: 'Request an export or a revision of the current document.' };
  const config = await artifactConfig(true);
  if (!config) return { success: false as const, message: 'Document creation is not configured for this tenant.' };
  try {
    const response = await fetch(new URL('/v1/artifacts', context.apiBase), { method: 'POST',
      headers: { ...tenantSessionHeaders(context, { 'content-type': 'application/json', 'x-faroai-export-requested': 'true', 'x-faroai-artifact-actor': config.actor }), },
      body: JSON.stringify({ format: input.format, title: input.title, columns: input.columns, rows: input.rows,
        ...(input.orientation ? { orientation: input.orientation } : {}),
        ...(input.layout ? { layout: input.layout } : {}),
        ...(input.image ? { image: { mime_type: input.image.mime_type, base64: input.image.base64 } } : {}) }),
      cache: 'no-store', signal: AbortSignal.timeout(10000) });
    const body = await response.json();
    if (!response.ok || !body.success || !/^[0-9a-f-]{36}$/i.test(body.data?.id)
      || body.data?.base_skill_id !== `base.${input.format}`) return { success: false as const, message: body.message ?? 'Document creation failed.' };
    return { success: true as const, id: body.data.id as string, baseSkillId: body.data.base_skill_id as string };
  } catch { return { success: false as const, message: 'The document service is unavailable.' }; }
}

export async function requestDocumentPlan(input: { tenantId: string; message: string; format: DocumentFormat; columns: string[]; currentLayout: DocumentLayout }): Promise<{ success: true; plan: DocumentPlan } | { success: false; message: string }> {
  const response = await gisPromptRequest<DocumentPlan>(input.tenantId,
    `/tenants/${input.tenantId}/artifacts/plan`, {
      message: input.message, format: input.format, columns: input.columns, current_layout: input.currentLayout,
    });
  return response.success && response.data
    ? { success: true, plan: response.data }
    : { success: false, message: response.message ?? 'The document instruction could not be interpreted.' };
}

export async function requestProcurementAnalysis(input: {
  operation: 'count_lines' | 'count_orders' | 'sum' | 'average' | 'minimum' | 'maximum';
  field: 'quantity' | 'unit_price' | 'line_total';
  language: 'en' | 'th';
  orders: { line_count: number; lines: { quantity: number | null; unit_price: number | null; line_total: number | null }[] }[];
}) {
  const context = await tenantServerContext();
  if (!context) return { success: false as const, message: 'Sign in to your tenant before analyzing results.' };
  try {
    const response = await fetch(new URL('/v1/skills/analyze', context.apiBase), {
      method: 'POST', headers: tenantSessionHeaders(context, { 'content-type': 'application/json' }),
      body: JSON.stringify(input), cache: 'no-store', signal: AbortSignal.timeout(20_000),
    });
    const body = await response.json();
    if (!response.ok || body?.success !== true || body?.data?.base_skill_id !== 'base.data-analysis'
      || typeof body?.data?.answer !== 'string')
      return { success: false as const, message: body?.message ?? 'The data analysis skill could not complete this calculation.' };
    return { success: true as const, answer: body.data.answer, baseSkillId: body.data.base_skill_id as string };
  } catch { return { success: false as const, message: 'The data analysis service is unavailable.' }; }
}

export async function artifactStatus(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return 'failed';
  const context = await tenantServerContext();
  if (!context) return 'failed';
  const config = await artifactConfig(false);
  if (!config) return 'failed';
  try {
    const response = await fetch(new URL(`/v1/artifacts/${id}`, context.apiBase), { headers: tenantSessionHeaders(context, { 'x-faroai-artifact-actor': config.actor }), cache: 'no-store', signal: AbortSignal.timeout(5000) });
    const body = await response.json();
    return response.ok && ['pending', 'processing', 'completed', 'failed'].includes(body?.data?.status) ? body.data.status as string : 'failed';
  } catch { return 'failed'; }
}

export async function getPromptTenant(): Promise<{ ok: true; tenant: PromptTenant } | { ok: false; message: string }> {
  const context = await tenantServerContext();
  return context ? { ok: true, tenant: { id: context.tenant.id, name: context.tenant.name } }
    : { ok: false, message: 'Sign in to your tenant to continue.' };
}

export async function gisPromptRequest<T>(tenantId: string, path: string, body: unknown, timeoutMs = 125_000): Promise<PromptApiResult<T>> {
  const context = await tenantServerContext();
  if (!context || tenantId !== context.tenant.id) return { success: false, error: 'unauthorized', message: 'Sign in to the matching tenant to continue.' };
  // Keep this server action limited to the prompt's GIS and generated-document workflows.
  const allowedPath = new RegExp(`^/tenants/${context.tenant.id}/(?:product-creation/(?:drafts|tool)|procurement/(?:assistant|confirm)|customers/assistant|artifacts/plan)$`, 'i');
  if (!allowedPath.test(path)) return { success: false, error: 'invalid_request', message: 'This GIS operation is not available from the prompt.' };
  try {
    const response = await fetch(new URL(`/admin/v1${path}`, context.apiBase), {
      method: 'POST', headers: tenantSessionHeaders(context, { 'content-type': 'application/json' }),
      body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(timeoutMs),
    });
    return await response.json() as PromptApiResult<T>;
  } catch {
    return { success: false, error: 'service_unavailable', message: 'FaroAI could not reach the GIS workflow service.' };
  }
}

export type CustomerBirthdayLookup = {
  customers: Array<{
    name: string; date_of_birth: { day?: number; month?: number; year?: number } | null; age: number | null;
    email: string | null; phone: string | null;
    address: { address: string | null; city: string | null; state: string | null; zipcode: string | null; country: string | null } | null;
  }>;
  total: number; limit: number; offset: number; has_more: boolean;
  filters: Record<string, string | number>;
};

export async function requestCustomerBirthdayLookup(tenantId: string, message: string): Promise<PromptApiResult<CustomerBirthdayLookup>> {
  const prompt = message.trim();
  if (!prompt || prompt.length > 500) return { success: false, error: 'invalid_request', message: 'Enter a customer name or a supported birthday question.' };
  return gisPromptRequest<CustomerBirthdayLookup>(tenantId, `/tenants/${tenantId}/customers/assistant`, { message: prompt }, 40_000);
}

export async function requestDocumentProcurement<T>(input: {
  tenantId: string; documentJobId: string; message: string; history?: Record<string, unknown>[];
}): Promise<PromptApiResult<T>> {
  const context = await tenantServerContext();
  if (!context || context.tenant.id !== input.tenantId)
    return { success: false, error: 'unauthorized', message: 'Sign in to the tenant that uploaded this document.' };
  const message = input.message.trim();
  if (!message || message.length > 1500 || !/^[0-9a-f-]{36}$/i.test(input.documentJobId))
    return { success: false, error: 'invalid_request', message: 'The document request is invalid.' };
  const document = await loadDocumentOcrForProcurement(input.documentJobId);
  if (!document.success) return { success: false, error: 'document_unavailable', message: document.message };
  return gisPromptRequest<T>(input.tenantId, `/tenants/${input.tenantId}/procurement/assistant`, {
    message,
    history: input.history ?? [],
    document_context: document.text,
    document_analysis_consented: true,
  }, 125_000);
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
  state: Record<string, string | number | Record<string, string>>;
  image?: { base64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' };
}): Promise<DiscoveryActionResult> {
  if (!input.consented) return { ok: false, message: 'Please accept the AI chat notice before searching.' };
  if (typeof input.message !== 'string' || input.message.trim().length < 1 || input.message.length > 500) {
    return { ok: false, message: 'Enter a question of up to 500 characters.' };
  }

  const context = await tenantServerContext();
  if (!context) return { ok: false, message: 'Sign in to your tenant before searching.' };
  const localTrainingConsent = input.trainingLocalConsented
    && process.env.FAROAI_LOCAL_LLM_ENABLED === 'true';
  const sharedTrainingConsent = input.trainingSharedConsented
    && process.env.FAROAI_DEPLOYMENT_MODE !== 'self_hosted'
    && process.env.FAROAI_SHARED_TRAINING_ENABLED === 'true';

  try {
    const response = await fetch(new URL('/v1/chat', context.apiBase), {
      method: 'POST',
      headers: tenantSessionHeaders(context, {
        'content-type': 'application/json',
        'x-faroai-ai-chat-consent': 'true',
        'x-faroai-ai-improve-consent': String(input.knowledgeImprovementConsented),
        'x-faroai-ai-training-local-consent': String(localTrainingConsent),
        'x-faroai-ai-training-shared-consent': String(sharedTrainingConsent),
      }),
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
