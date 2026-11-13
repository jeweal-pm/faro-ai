import { proxyDocumentJson } from '../../../document-import/server';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) return new Response(null, { status: 404 });
  return proxyDocumentJson(request, `/v1/document-imports/${encodeURIComponent(id)}`);
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) return new Response(null, { status: 404 });
  return proxyDocumentJson(request, `/v1/document-imports/${encodeURIComponent(id)}`, 'DELETE');
}
