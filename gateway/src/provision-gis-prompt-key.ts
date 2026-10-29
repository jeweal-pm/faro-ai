import { randomBytes, createHash } from 'node:crypto';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
const pepper = process.env.API_KEY_PEPPER;
const tenantId = process.argv[2]?.trim();
if (!databaseUrl || !pepper || pepper.length < 32 || !/^[0-9a-f-]{36}$/i.test(tenantId ?? '')) {
  throw new Error('Set DATABASE_URL and API_KEY_PEPPER, then pass a tenant UUID.');
}

const apiKey = `fai_${randomBytes(32).toString('base64url')}`;
const keyHash = createHash('sha256').update(pepper).update(apiKey).digest();
const pool = new Pool({ connectionString: databaseUrl, max: 1 });
try {
  const result = await pool.query(
    `INSERT INTO api_keys(tenant_id,key_hash,label,scopes)
     SELECT id,$2,'FaroAI prompt GIS operations',ARRAY['gis:product:write','gis:procurement:write']::text[]
       FROM tenants WHERE id=$1 AND status='active'
     RETURNING id`,
    [tenantId, keyHash],
  );
  if (!result.rowCount) throw new Error('The active tenant was not found.');
  process.stdout.write(`${apiKey}\n`);
} finally {
  await pool.end();
}
