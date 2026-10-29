import assert from 'node:assert/strict';
import test from 'node:test';
import { decryptProviderSecret, encryptProviderSecret, maskSecretHint, parseEncryptionKey, validateMcpEndpoint, validateProviderEndpoint } from './admin-security.js';

test('provider credentials encrypt and decrypt with an authenticated key', () => {
  const key = Buffer.alloc(32, 7);
  const encrypted = encryptProviderSecret('provider-secret-value', key);
  assert.equal(decryptProviderSecret(encrypted.ciphertext, encrypted.nonce, encrypted.tag, key), 'provider-secret-value');
  assert.equal(maskSecretHint(encrypted.hint), '••••alue');
  assert.throws(() => decryptProviderSecret(encrypted.ciphertext, encrypted.nonce, encrypted.tag, Buffer.alloc(32, 8)));
});

test('encryption key must encode exactly 32 bytes', () => {
  assert.equal(parseEncryptionKey(Buffer.alloc(32, 1).toString('base64')).length, 32);
  assert.throws(() => parseEncryptionKey(Buffer.alloc(31, 1).toString('base64')));
});

test('provider URLs are restricted to the configured endpoint policy', () => {
  assert.equal(validateProviderEndpoint('openrouter', 'https://openrouter.ai/api/v1', new Set()).hostname, 'openrouter.ai');
  assert.throws(() => validateProviderEndpoint('openrouter', 'https://evil.example/api/v1', new Set()));
  assert.throws(() => validateProviderEndpoint('ollama', 'http://10.0.0.5:11434/v1', new Set()));
  assert.equal(validateProviderEndpoint('ollama', 'http://ollama.customer.test:11434/v1', new Set(['ollama.customer.test'])).hostname, 'ollama.customer.test');
});

test('Docker host HTTP MCP endpoint is allowed only by the local development switch', () => {
  assert.throws(() => validateMcpEndpoint('http://host.docker.internal:3009/mcp', new Set(['host.docker.internal'])));
  assert.equal(
    validateMcpEndpoint('http://host.docker.internal:3009/mcp', new Set(['host.docker.internal']), true).hostname,
    'host.docker.internal',
  );
  assert.throws(() => validateMcpEndpoint('http://evil.example:3009/mcp', new Set(['evil.example']), true));
});
