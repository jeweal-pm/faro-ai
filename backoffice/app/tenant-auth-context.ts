import 'server-only';
import { cookies, headers } from 'next/headers';

export type TenantServerContext = {
  tenant: { id: string; name: string; status: string };
  email: string;
  apiBase: string;
  origin: string;
  cookieHeader: string;
  csrfToken: string;
};

export async function tenantServerContext(): Promise<TenantServerContext | null> {
  const jar = await cookies();
  const requestHeaders = await headers();
  const cookieHeader = jar.getAll().map(({ name, value }) => `${name}=${value}`).join('; ');
  const secureCookies = process.env.BACKOFFICE_COOKIE_SECURE === 'true';
  const csrfCookieName = secureCookies ? '__Host-faroai_tenant_csrf' : 'faroai_tenant_csrf';
  const csrfToken = jar.get(csrfCookieName)?.value ?? '';
  const forwardedHost = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const forwardedProto = requestHeaders.get('x-forwarded-proto') ?? 'http';
  const origin = requestHeaders.get('origin') ?? process.env.BACKOFFICE_URL
    ?? (forwardedHost ? `${forwardedProto}://${forwardedHost}` : 'http://127.0.0.1:3001');
  const apiBase = process.env.FAROAI_API_INTERNAL_URL || 'http://api:3000';
  if (!cookieHeader) return null;
  try {
    const response = await fetch(new URL('/tenant/v1/auth/session', apiBase), {
      headers: { cookie: cookieHeader, origin }, cache: 'no-store', signal: AbortSignal.timeout(5_000),
    });
    const body = await response.json();
    if (!response.ok || body?.success !== true || !body.data?.tenant?.id
      || !/^[0-9a-f-]{36}$/i.test(body.data.tenant.id)) return null;
    return { tenant: body.data.tenant, email: body.data.email, apiBase, origin, cookieHeader, csrfToken };
  } catch { return null; }
}

export function tenantSessionHeaders(context: TenantServerContext, extra: Record<string, string> = {}) {
  return {
    cookie: context.cookieHeader,
    origin: context.origin,
    ...(context.csrfToken ? { 'x-csrf-token': context.csrfToken } : {}),
    ...extra,
  };
}
