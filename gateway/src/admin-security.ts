import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export type EncryptedSecret = {
  ciphertext: Buffer;
  nonce: Buffer;
  tag: Buffer;
  hint: string;
};

export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function parseEncryptionKey(value: string): Buffer {
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) throw new Error('FAROAI_CONFIG_ENCRYPTION_KEY must encode exactly 32 bytes.');
  return key;
}

export function encryptProviderSecret(secret: string, key: Buffer): EncryptedSecret {
  if (!secret.trim()) throw new Error('A provider secret cannot be empty.');
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return { ciphertext, nonce, tag: cipher.getAuthTag(), hint: secret.slice(-4) };
}

export function decryptProviderSecret(ciphertext: Buffer, nonce: Buffer, tag: Buffer, key: Buffer): string {
  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export function allowedProviderForDeployment(
  provider: string,
  deploymentMode: 'hosted' | 'self_hosted',
  allowExternalProviders: boolean,
  localLlmEnabled: boolean,
): boolean {
  if (provider === 'none') return true;
  if (provider === 'ollama' || provider === 'lmstudio') return localLlmEnabled;
  if (provider === 'openrouter') return deploymentMode === 'hosted' || allowExternalProviders;
  return false;
}

export function validateProviderEndpoint(
  provider: 'openrouter' | 'ollama' | 'lmstudio',
  rawUrl: string,
  allowedLocalHosts: ReadonlySet<string>,
): URL {
  const url = new URL(rawUrl);
  if (url.username || url.password || url.search || url.hash) throw new Error('Provider endpoint URL contains unsupported components.');
  if (provider === 'openrouter') {
    if (url.protocol !== 'https:' || url.hostname !== 'openrouter.ai' || url.pathname.replace(/\/$/, '') !== '/api/v1') {
      throw new Error('OpenRouter must use https://openrouter.ai/api/v1.');
    }
    return url;
  }
  const host = url.hostname.toLowerCase();
  const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (!isLoopback && !allowedLocalHosts.has(host)) throw new Error('Local model host is not in FAROAI_ALLOWED_LOCAL_MODEL_HOSTS.');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback) && !(url.protocol === 'http:' && allowedLocalHosts.has(host))) {
    throw new Error('Provider endpoints must use HTTPS outside explicitly allowed local model hosts.');
  }
  return url;
}

export function validateMcpEndpoint(rawUrl: string, allowedHosts: ReadonlySet<string>, allowDockerHostHttp = false): URL {
  const url = new URL(rawUrl);
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const isLoopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  const isDockerHostDevelopment = hostname === 'host.docker.internal' && allowDockerHostHttp;
  if (url.username || url.password || url.search || url.hash) throw new Error('MCP endpoint contains unsupported URL components.');
  if (!isLoopback && !isDockerHostDevelopment && !allowedHosts.has(hostname)) throw new Error('MCP endpoint host is not in MCP_ALLOWED_HOSTS.');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && (isLoopback || isDockerHostDevelopment))) {
    throw new Error('MCP endpoints must use HTTPS except for loopback development.');
  }
  return url;
}

export function maskSecretHint(hint: string | null): string | null {
  return hint ? `••••${hint}` : null;
}
