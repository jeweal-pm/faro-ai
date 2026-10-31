import 'server-only';
import { cookies } from 'next/headers';
import { randomBytes } from 'node:crypto';

const COOKIE = 'faroai_artifact_session';
export async function artifactConfig(createSession: boolean) {
  const key = process.env.FAROAI_DEMO_API_KEY;
  const tenant = process.env.FAROAI_DEMO_TENANT_ID;
  if (process.env.FAROAI_DEMO_ENABLED !== 'true' || !key || !tenant || !/^[0-9a-f-]{36}$/i.test(tenant)) return null;
  if (process.env.FAROAI_TENANT_MODE === 'single' && tenant !== process.env.FAROAI_SINGLE_TENANT_ID) return null;
  const jar = await cookies();
  let actor = jar.get(COOKIE)?.value;
  if (!actor && createSession) {
    actor = randomBytes(32).toString('hex');
    jar.set(COOKIE, actor, { httpOnly: true, sameSite: 'lax', secure: process.env.BACKOFFICE_COOKIE_SECURE === 'true', path: '/', maxAge: 86400 });
  }
  if (!actor || !/^[0-9a-f]{64}$/.test(actor)) return null;
  const base = process.env.FAROAI_API_INTERNAL_URL || 'http://api:3000';
  const headers = { authorization: `Bearer ${key}`, 'x-faroai-artifact-actor': actor };
  try {
    const response = await fetch(new URL('/v1/artifacts/context', base), { headers, cache: 'no-store', signal: AbortSignal.timeout(5000) });
    const body = await response.json();
    if (!response.ok || body?.data?.tenant_id !== tenant) return null;
    return { base, headers };
  } catch { return null; }
}
