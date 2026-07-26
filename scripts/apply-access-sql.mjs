/**
 * Applies supabase/app_access.sql to the configured Supabase project.
 *
 *   node scripts/apply-access-sql.mjs
 *
 * DDL cannot go through the service-role key (PostgREST is data-only), so this
 * needs one of:
 *   SUPABASE_ACCESS_TOKEN  personal access token (sbp_…) → Management API
 *   SUPABASE_DB_URL        postgres connection string    → direct (needs `pg`)
 *
 * Safe to re-run: the SQL is written with `if not exists` / `on conflict`.
 */

import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { loadServerEnv } from '../server/loadEnv.mjs';

loadServerEnv();

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sql = readFileSync(resolve(root, 'supabase/app_access.sql'), 'utf8');

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
  console.log(`Applying via Management API to project ${ref}…`);

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
  let pg;
  try {
    pg = await import('pg');
  } catch {
    throw new Error('SUPABASE_DB_URL is set but the `pg` package is missing — run: npm i -D pg');
  }

  console.log('Applying over a direct Postgres connection…');
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
  const { hasAccessSchema } = await import('../server/auth/appUserStore.mjs');
  const ready = await hasAccessSchema();
  console.log(ready ? 'Verified: trial/OTP columns are live.' : 'Verify FAILED: columns still missing.');
  return ready;
}

async function main() {
  if (!projectUrl) throw new Error('SUPABASE_URL is not set');

  if (accessToken) await runViaManagementApi();
  else if (dbUrl) await runViaPostgres();
  else {
    console.error(
      'No credential for DDL.\n' +
        '  Option A: SUPABASE_ACCESS_TOKEN=sbp_…  (supabase.com/dashboard/account/tokens)\n' +
        '  Option B: SUPABASE_DB_URL=postgresql://…  (Project settings → Database)\n' +
        '  Option C: paste supabase/app_access.sql into the Supabase SQL Editor.',
    );
    process.exit(2);
  }

  process.exit((await verify()) ? 0 : 1);
}

main().catch((err) => {
  console.error(`Failed: ${err.message}`);
  process.exit(1);
});
