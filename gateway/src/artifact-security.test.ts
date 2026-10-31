import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { artifactActorHash, artifactSchema } from './artifact-security.js';

test('artifact session is scoped to tenant, key and unguessable server session', () => {
  const actor = 'a'.repeat(64), pepper = 'b'.repeat(32);
  const value = artifactActorHash(pepper, 'tenant-a', 'key-a', actor);
  assert.ok(value);
  assert.notEqual(value, artifactActorHash(pepper, 'tenant-b', 'key-a', actor));
  assert.notEqual(value, artifactActorHash(pepper, 'tenant-a', 'key-b', actor));
  assert.notEqual(value, artifactActorHash(pepper, 'tenant-a', 'key-a', 'c'.repeat(64)));
  assert.equal(artifactActorHash(pepper, 'tenant-a', 'key-a', '../file'), null);
});

test('document inputs are bounded data and cannot supply a path or code', () => {
  const valid = { format: 'xlsx', title: 'Report', columns: ['Product', 'Price'], rows: [['Ring', 125]] };
  assert.equal(artifactSchema.safeParse(valid).success, true);
  assert.equal(artifactSchema.safeParse({ ...valid, path: '../outside' }).success, false);
  assert.equal(artifactSchema.safeParse({ ...valid, rows: [['Ring']] }).success, false);
  assert.equal(artifactSchema.safeParse({ ...valid, rows: [['Ring', Infinity]] }).success, false);
  assert.equal(artifactSchema.safeParse({ ...valid, rows: Array(501).fill(['Ring', 1]) }).success, false);
  assert.equal(artifactSchema.safeParse({ ...valid, format: 'sh' }).success, false);
});
