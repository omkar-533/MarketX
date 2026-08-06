/**
 * Adds pine_source to app_indicators (idempotent).
 * Prefers Management API / DB URL; falls back to service-role probe.
 */
import { loadServerEnv } from '../server/loadEnv.mjs';

loadServerEnv();

const SQL = `
alter table public.app_indicators
  add column if not exists pine_source text not null default '';
`;

const projectUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
const accessToken = (process.env.SUPABASE_ACCESS_TOKEN || '').trim();
const dbUrl = (process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '').trim();
const serviceKey = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  ''
).trim();

function projectRef() {
  const match = /^https:\/\/([a-z0-9]+)\.supabase\.co/i.exec(projectUrl);
  if (!match) throw new Error(`Cannot read project ref from SUPABASE_URL: ${projectUrl}`);
  return match[1];
}

async function viaManagementApi() {
  const ref = projectRef();
  console.log(`Applying via Management API → ${ref}`);
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: SQL }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Management API ${res.status}: ${body.slice(0, 500)}`);
  console.log('Column added (Management API).');
}

async function viaPostgres() {
  const pg = await import('pg');
  const client = new pg.default.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(SQL);
    console.log('Column added (Postgres).');
  } finally {
    await client.end();
  }
}

async function probeColumn() {
  const { createClient } = await import('@supabase/supabase-js');
  if (!projectUrl || !serviceKey) return { ok: false, reason: 'missing service role' };
  const db = createClient(projectUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await db.from('app_indicators').select('id, pine_source').limit(1);
  if (!error) return { ok: true };
  return { ok: false, reason: error.message };
}

async function main() {
  if (!projectUrl) throw new Error('SUPABASE_URL is not set in .env.local');

  const before = await probeColumn();
  if (before.ok) {
    console.log('Already present: pine_source is live.');
    return;
  }
  console.log(`Column missing (${before.reason}). Applying…`);

  if (accessToken) await viaManagementApi();
  else if (dbUrl) await viaPostgres();
  else {
    if (serviceKey) {
      const ref = projectRef();
      const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: SQL }),
      });
      const body = await res.text();
      if (res.ok) {
        console.log('Column added (service-role Management API).');
      } else {
        throw new Error(
          `Cannot run DDL with current secrets (API ${res.status}). ` +
            `Set SUPABASE_ACCESS_TOKEN=sbp_… or SUPABASE_DB_URL=postgresql://… in .env.local.\n` +
            body.slice(0, 300),
        );
      }
    } else {
      throw new Error('Need SUPABASE_ACCESS_TOKEN or SUPABASE_DB_URL to apply SQL.');
    }
  }

  const after = await probeColumn();
  if (!after.ok) {
    throw new Error(`Applied but verify failed: ${after.reason}`);
  }
  console.log('Verified: pine_source is live.');
}

main().catch((err) => {
  console.error(`Failed: ${err.message}`);
  process.exit(1);
});
