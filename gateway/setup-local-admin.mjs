import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { hash } from '@node-rs/argon2';

const root = new URL('../', import.meta.url);
const envPath = new URL('.env', root);
const passwordPath = new URL('.local-admin-password', root);
const password = randomBytes(24).toString('base64url');
const passwordHash = await hash(password, { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 });
const encryptionKey = randomBytes(32).toString('base64');
let source = await readFile(envPath, 'utf8');
const values = {
  FAROAI_DEPLOYMENT_MODE: 'hosted',
  FAROAI_TENANT_MODE: 'multi',
  BACKOFFICE_ENABLED: 'true',
  BACKOFFICE_OIDC_ENABLED: 'false',
  BACKOFFICE_LOCAL_AUTH_ENABLED: 'true',
  BACKOFFICE_LOCAL_ADMIN_EMAIL: 'admin@localhost.test',
  BACKOFFICE_LOCAL_ADMIN_PASSWORD_HASH_B64: Buffer.from(passwordHash, 'utf8').toString('base64'),
  BACKOFFICE_URL: 'http://127.0.0.1:3001',
  BACKOFFICE_COOKIE_SECURE: 'false',
  FAROAI_CONFIG_ENCRYPTION_KEY: encryptionKey,
};
for (const [key, value] of Object.entries(values)) {
  const line = `${key}=${value}`;
  const matcher = new RegExp(`^${key}=.*$`, 'm');
  source = matcher.test(source) ? source.replace(matcher, line) : `${source.trimEnd()}\n${line}\n`;
}
source = source.replace(/^BACKOFFICE_LOCAL_ADMIN_PASSWORD_HASH=.*\r?\n/gm, '');
await writeFile(envPath, source, 'utf8');
await writeFile(passwordPath, `Email: admin@localhost.test\nPassword: ${password}\n`, { encoding: 'utf8', mode: 0o600 });
console.log('Local Backoffice login configured. Read the generated one-time password from .local-admin-password.');
