/**
 * Applies supabase/app_indicators.sql
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_… node scripts/apply-indicators-sql.mjs
 */

import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { loadServerEnv } from '../server/loadEnv.mjs';

loadServerEnv();

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sql = readFileSync(resolve(root, 'supabase/app_indicators.sql'), 'utf8');

const projectUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const accessToken = (process.env.SUPABASE_ACCESS_TOKEN || '').trim();
const dbUrl = (process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '').trim();

function projectRef() {
  const match = /^https:\/\/([a-z0-9]+)\.supabase\.co/i.exec(projectUrl);
  if (!match) throw new Error(`Cannot read the project ref from SUPABASE_URL: ${projectUrl}`);
  return match[1];
}

async function runViaManagementApi() {
  const ref = projectRef();
  console.log(`Applying indicators SQL via Management API to ${ref}…`);
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Management API ${res.status}: ${body.slice(0, 400)}`);
  console.log('SQL applied.');
}

async function runViaPostgres() {
  const pg = await import('pg');
  const client = new pg.default.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(sql);
    console.log('SQL applied.');
  } finally {
    await client.end();
  }
}

async function verify() {
  const { getAdminClient } = await import('../server/auth/supabaseAdmin.mjs');
  const db = getAdminClient();
  if (!db) {
    console.log('No service role — skip verify (file mode).');
    return true;
  }
  const { error } = await db.from('app_indicators').select('id').limit(1);
  if (error) {
    console.error('Verify FAILED:', error.message);
    return false;
  }
  console.log('Verified: app_indicators is live.');
  return true;
}

async function main() {
  if (!projectUrl) throw new Error('SUPABASE_URL is not set');
  if (accessToken) await runViaManagementApi();
  else if (dbUrl) await runViaPostgres();
  else {
    console.error(
      'Need SUPABASE_ACCESS_TOKEN or SUPABASE_DB_URL, or paste supabase/app_indicators.sql in the SQL Editor.',
    );
    process.exit(2);
  }
  process.exit((await verify()) ? 0 : 1);
}

main().catch((err) => {
  console.error(`Failed: ${err.message}`);
  process.exit(1);
});
