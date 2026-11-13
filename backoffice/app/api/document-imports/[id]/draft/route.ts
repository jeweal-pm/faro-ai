import { proxyDocumentJson } from '../../../../document-import/server';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) return new Response(null, { status: 404 });
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > 1_000_000) {
    return Response.json({ success: false, error: 'request_too_large', message: 'The draft change exceeds its limits.' }, { status: 413 });
  }
  if (!request.body) return Response.json({ success: false, error: 'invalid_request', message: 'The draft change is invalid.' }, { status: 400 });
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1_000_000) {
        await reader.cancel();
        return Response.json({ success: false, error: 'request_too_large', message: 'The draft change exceeds its limits.' }, { status: 413 });
      }
      chunks.push(value);
    }
  } catch { return Response.json({ success: false, error: 'invalid_request', message: 'The draft change is invalid.' }, { status: 400 }); }
  finally { reader.releaseLock(); }
  const combined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }
  const body = new TextDecoder().decode(combined);
  try { JSON.parse(body); } catch { return Response.json({ success: false, error: 'invalid_request', message: 'The draft change is invalid.' }, { status: 400 }); }
  return proxyDocumentJson(request, `/v1/document-imports/${encodeURIComponent(id)}/draft`, 'PATCH', body);
}
