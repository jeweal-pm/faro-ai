import { artifactConfig } from '../../../artifact-service';
import { tenantServerContext, tenantSessionHeaders } from '../../../tenant-auth-context';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 });
  const config = await artifactConfig(false);
  const tenant = await tenantServerContext();
  if (!config || !tenant) return new Response(null, { status: 404 });
  try {
    const response = await fetch(new URL(`/v1/artifacts/${id}/download`, config.base), {
      headers: tenantSessionHeaders(tenant, { 'x-faroai-artifact-actor': config.actor }), cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
    if (!response.ok || !response.body) return new Response(null, { status: 404 });
    return new Response(response.body, { headers: {
      'Content-Type': response.headers.get('content-type') ?? 'application/octet-stream',
      'Content-Disposition': response.headers.get('content-disposition') ?? 'attachment',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    } });
  } catch { return new Response(null, { status: 503 }); }
}
