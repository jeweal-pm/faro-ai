import 'server-only';
import { cookies } from 'next/headers';
import { randomBytes } from 'node:crypto';
import { tenantServerContext } from './tenant-auth-context';

const COOKIE = 'faroai_artifact_session';
export async function artifactConfig(createSession: boolean) {
  const context = await tenantServerContext();
  if (!context) return null;
  const jar = await cookies();
  let actor = jar.get(COOKIE)?.value;
  if (!actor && createSession) {
    actor = randomBytes(32).toString('hex');
    jar.set(COOKIE, actor, { httpOnly: true, sameSite: 'lax', secure: process.env.BACKOFFICE_COOKIE_SECURE === 'true', path: '/', maxAge: 86400 });
  }
  if (!actor || !/^[0-9a-f]{64}$/.test(actor)) return null;
  return { base: context.apiBase, actor };
}
