import { proxyDocumentPage } from '../../../../../document-import/server';

export async function GET(request: Request, context: { params: Promise<{ id: string; page: string }> }) {
  const { id, page } = await context.params;
  return proxyDocumentPage(request, id, page);
}
