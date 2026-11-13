import 'server-only';

import { tenantServerContext, tenantSessionHeaders, type TenantServerContext } from '../tenant-auth-context';

const MAX_MULTIPART_BYTES = 21 * 1024 * 1024;
const DOCUMENT_API_BASE = process.env.FAROAI_API_INTERNAL_URL || 'http://api:3000';
const MAX_DOCUMENT_MODEL_TEXT = 32_000;

type GuardResult = { ok: true; context: TenantServerContext } | { ok: false; response: Response };

function error(status: number, code: string, message: string) {
  return Response.json({ success: false, error: code, message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function isAllowedRequestOrigin(request: Request, origin: string, configuredOrigin: string) {
  let parsedOrigin: URL;
  try { parsedOrigin = new URL(origin); } catch { return false; }
  if ((parsedOrigin.protocol !== 'http:' && parsedOrigin.protocol !== 'https:') || parsedOrigin.origin !== origin) return false;
  if (origin === new URL(request.url).origin || origin === configuredOrigin) return true;

  // In Docker/reverse-proxy deployments request.url may describe the internal
  // Next.js address. Validate the browser Origin against the incoming host
  // (and proxy scheme when supplied) instead of rejecting the public same-origin
  // request. The CSRF token is still required below.
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const incomingHost = forwardedHost || request.headers.get('host')?.trim();
  if (!incomingHost || parsedOrigin.host.toLowerCase() !== incomingHost.toLowerCase()) return false;
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  const expectedProtocol = forwardedProto ? `${forwardedProto}:` : new URL(request.url).protocol;
  return parsedOrigin.protocol === expectedProtocol;
}

async function readTextBounded(response: Response, limit: number): Promise<string | null> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const combined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(combined);
}

async function readRequestTextBounded(request: Request, limit: number): Promise<string | null> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const combined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(combined);
}

export async function requireTenantRequest(request: Request, mutating = false): Promise<GuardResult> {
  const context = await tenantServerContext();
  if (!context) return { ok: false, response: error(401, 'unauthorized', 'Sign in to your tenant to import documents.') };

  if (!mutating) return { ok: true, context };

  const origin = request.headers.get('origin');
  let configuredOrigin = '';
  try {
    configuredOrigin = process.env.BACKOFFICE_URL ? new URL(process.env.BACKOFFICE_URL).origin : '';
  } catch { return { ok: false, response: error(403, 'origin_not_allowed', 'This request origin is not allowed.') }; }
  if (!origin || !isAllowedRequestOrigin(request, origin, configuredOrigin)) {
    return { ok: false, response: error(403, 'origin_not_allowed', 'This request origin is not allowed.') };
  }

  const csrf = request.headers.get('x-csrf-token') ?? '';
  if (!context.csrfToken || !csrf || csrf !== context.csrfToken) {
    return { ok: false, response: error(403, 'csrf_failed', 'The request could not be verified.') };
  }
  return { ok: true, context };
}

export async function proxyDocumentJson(request: Request, path: string, method = 'GET', body?: string) {
  const guard = await requireTenantRequest(request, method !== 'GET');
  if (!guard.ok) return guard.response;
  try {
    const response = await fetch(new URL(path, DOCUMENT_API_BASE), {
      method,
      headers: tenantSessionHeaders(guard.context, body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(body === undefined ? {} : { body }),
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('application/json')) {
      return error(502, 'invalid_upstream_response', 'The document service returned an invalid response.');
    }
    const text = await readTextBounded(response, 2_000_000);
    if (text === null) return error(502, 'response_too_large', 'The document service response exceeded its limits.');
    return new Response(text, { status: response.status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch {
    return error(503, 'service_unavailable', 'The document service is unavailable.');
  }
}

export async function proxyDocumentUpload(request: Request) {
  const guard = await requireTenantRequest(request, true);
  if (!guard.ok) return guard.response;
  if (request.headers.get('x-faroai-document-import-consent') !== 'true') {
    return error(400, 'consent_required', 'Confirm document processing for this upload before continuing.');
  }
  const contentType = request.headers.get('content-type') ?? '';
  if (!/^multipart\/form-data\s*;\s*boundary=/i.test(contentType) || !request.body) {
    return error(400, 'invalid_file', 'Choose one PDF, PNG, or JPEG file.');
  }
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BYTES) {
    return error(413, 'file_too_large', 'This upload exceeds the document size limit.');
  }

  let exceeded = false;
  let bytes = 0;
  const boundedBody = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytes += chunk.byteLength;
      if (bytes > MAX_MULTIPART_BYTES) {
        exceeded = true;
        throw new Error('multipart_limit_exceeded');
      }
      controller.enqueue(chunk);
    },
  }));

  try {
    const response = await fetch(new URL('/v1/document-imports', DOCUMENT_API_BASE), {
      method: 'POST',
      headers: tenantSessionHeaders(guard.context, {
        'content-type': contentType,
        'x-faroai-document-import-consent': 'true',
        ...(request.headers.get('x-faroai-document-model-consent') === 'true'
          ? { 'x-faroai-document-model-consent': 'true' } : {}),
      }),
      body: boundedBody,
      cache: 'no-store',
      signal: AbortSignal.timeout(120_000),
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    const responseType = response.headers.get('content-type') ?? '';
    if (!responseType.toLowerCase().includes('application/json')) {
      return error(502, 'invalid_upstream_response', 'The document service returned an invalid response.');
    }
    const text = await readTextBounded(response, 1_000_000);
    if (text === null) return error(502, 'response_too_large', 'The document service response exceeded its limits.');
    return new Response(text, { status: response.status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch {
    return exceeded
      ? error(413, 'file_too_large', 'This upload exceeds the document size limit.')
      : error(503, 'service_unavailable', 'The document service is unavailable.');
  }
}

export async function loadDocumentOcrForProcurement(id: string): Promise<{ success: true; text: string } | { success: false; message: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { success: false, message: 'The attached document could not be verified.' };
  const context = await tenantServerContext();
  if (!context) return { success: false, message: 'Sign in to the same tenant that uploaded this document.' };
  try {
    const response = await fetch(new URL(`/v1/document-imports/${encodeURIComponent(id)}`, DOCUMENT_API_BASE), {
      headers: tenantSessionHeaders(context), cache: 'no-store', signal: AbortSignal.timeout(20_000),
    });
    const raw = await readTextBounded(response, 2_000_000);
    if (raw === null) return { success: false, message: 'The document result exceeds the safe processing limit.' };
    const body = JSON.parse(raw) as { success?: boolean; data?: { status?: string; model_processing_consented?: boolean; corrected_ocr_text?: string | null; pages?: Array<{ page_number?: number; ocr_text?: string; ocr_text_truncated?: boolean }> } };
    if (!response.ok || body.success !== true || !body.data) return { success: false, message: 'The uploaded document could not be loaded for this tenant.' };
    if (body.data.status !== 'needs_review' && body.data.status !== 'completed') return { success: false, message: 'Wait until local OCR has finished before using this document.' };
    if (body.data.model_processing_consented !== true) return { success: false, message: 'This upload was approved for local OCR only. Attach it again and allow AI processing to use it for a PO.' };
    const pages = Array.isArray(body.data.pages) ? body.data.pages : [];
    if (!pages.length || pages.some((page) => page.ocr_text_truncated === true)) return { success: false, message: 'The OCR text is incomplete. Use a clearer or smaller document so no PO lines are missed.' };
    const text = typeof body.data.corrected_ocr_text === 'string' && body.data.corrected_ocr_text.trim()
      ? body.data.corrected_ocr_text.trim()
      : pages.map((page) => `--- Page ${page.page_number ?? '?'} ---\n${typeof page.ocr_text === 'string' ? page.ocr_text : ''}`)
        .join('\n\n').trim();
    if (!text) return { success: false, message: 'No OCR text is available for this document.' };
    if (text.length > MAX_DOCUMENT_MODEL_TEXT) return { success: false, message: 'This document is too long for one safe PO request. Split it into smaller documents and try again.' };
    return { success: true, text };
  } catch {
    return { success: false, message: 'The document could not be securely loaded for AI processing.' };
  }
}

export async function proxyDocumentPage(request: Request, id: string, page: string) {
  const guard = await requireTenantRequest(request);
  if (!guard.ok) return guard.response;
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id) || !/^\d{1,3}$/.test(page)) return new Response(null, { status: 404 });
  try {
    const response = await fetch(new URL(`/v1/document-imports/${encodeURIComponent(id)}/preview/${page}`, DOCUMENT_API_BASE), {
      headers: tenantSessionHeaders(guard.context), cache: 'no-store', signal: AbortSignal.timeout(20_000),
    });
    const type = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (!response.ok || !response.body || !(type.startsWith('image/png') || type.startsWith('image/jpeg'))) return new Response(null, { status: response.ok ? 502 : response.status });
    return new Response(response.body, { status: response.status, headers: {
      'Content-Type': type.startsWith('image/png') ? 'image/png' : 'image/jpeg',
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox", 'Cross-Origin-Resource-Policy': 'same-origin',
    } });
  } catch { return new Response(null, { status: 503 }); }
}
