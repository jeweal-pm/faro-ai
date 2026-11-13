import { proxyDocumentUpload } from '../../document-import/server';

export async function POST(request: Request) {
  return proxyDocumentUpload(request);
}
