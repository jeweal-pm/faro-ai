import { randomBytes, createHash } from 'node:crypto';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
const pepper = process.env.API_KEY_PEPPER;
const tenantName = process.argv.slice(2).join(' ').trim();
if (!databaseUrl || !pepper || pepper.length < 32 || !tenantName || tenantName.length > 120) {
  throw new Error('Set DATABASE_URL and API_KEY_PEPPER, then pass a tenant name.');
}

const scopes = ['chat:write', 'feedback:write', 'knowledge:write', 'mcp:write', 'catalogue:write'];
const apiKey = `fai_${randomBytes(32).toString('base64url')}`;
const keyHash = createHash('sha256').update(pepper).update(apiKey).digest();
const pool = new Pool({ connectionString: databaseUrl, max: 1 });
try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tenant = await client.query<{ id: string }>(
      `INSERT INTO tenants(name) VALUES($1) RETURNING id`, [tenantName],
    );
    const tenantId = tenant.rows[0]?.id;
    if (!tenantId) throw new Error('Tenant could not be created.');
    await client.query('INSERT INTO tenant_credit_accounts(tenant_id,balance) VALUES($1,0) ON CONFLICT (tenant_id) DO NOTHING', [tenantId]);
    await client.query(
      `INSERT INTO api_keys(tenant_id,key_hash,label,scopes) VALUES($1,$2,$3,$4)`,
      [tenantId, keyHash, 'initial server key', scopes],
    );
    await client.query('COMMIT');
    process.stdout.write(`tenant_id=${tenantId}\napi_key=${apiKey}\n`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
