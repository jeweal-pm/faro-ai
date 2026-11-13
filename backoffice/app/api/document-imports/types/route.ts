import { proxyDocumentJson } from '../../../document-import/server';

export async function GET(request: Request) {
  return proxyDocumentJson(request, '/v1/document-types');
}
