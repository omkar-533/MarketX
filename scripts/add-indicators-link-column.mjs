/**
 * Adds app_indicators.link (invite URL) when missing, and syncs from code.
 * Idempotent. Also refreshes that how_to_video_url exists.
 */
import { loadServerEnv } from '../server/loadEnv.mjs';

loadServerEnv();

const SQL = `
alter table public.app_indicators
  add column if not exists link text not null default '';
alter table public.app_indicators
  add column if not exists how_to_video_url text not null default '';
update public.app_indicators
set link = code
where coalesce(nullif(trim(link), ''), '') = ''
  and code ~* '^https?://';
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
  console.log('Columns applied (Management API).');
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
    console.log('Columns applied (Postgres).');
  } finally {
    await client.end();
  }
}

async function probe() {
  const { createClient } = await import('@supabase/supabase-js');
  if (!projectUrl || !serviceKey) return { ok: false, reason: 'missing service role' };
  const db = createClient(projectUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.from('app_indicators').select('*').limit(1);
  if (error) return { ok: false, reason: error.message };
  const cols = data?.[0] ? Object.keys(data[0]) : [];
  // Empty table: try a no-op update shape probe
  if (!cols.length) {
    const tryLink = await db.from('app_indicators').select('id, link, how_to_video_url').limit(1);
    if (tryLink.error) return { ok: false, reason: tryLink.error.message, cols };
    return { ok: true, cols: ['link', 'how_to_video_url'] };
  }
  const hasLink = cols.includes('link');
  const hasVideo = cols.includes('how_to_video_url');
  return { ok: hasLink && hasVideo, cols, hasLink, hasVideo };
}

async function main() {
  if (!projectUrl) throw new Error('SUPABASE_URL is not set');
  const before = await probe();
  console.log('Before:', JSON.stringify(before));
  if (before.ok) {
    console.log('Already present: link + how_to_video_url are live.');
    return;
  }

  if (accessToken) await viaManagementApi();
  else if (dbUrl) await viaPostgres();
  else {
    throw new Error(
      'Need SUPABASE_ACCESS_TOKEN=sbp_… or SUPABASE_DB_URL to add the link column.',
    );
  }

  const after = await probe();
  console.log('After:', JSON.stringify(after));
  if (!after.ok) throw new Error(`Applied but verify failed: ${after.reason || 'missing cols'}`);
  console.log('Verified: link + how_to_video_url are live.');
}

main().catch((err) => {
  console.error(`Failed: ${err.message}`);
  process.exit(1);
});
