import { createClient } from '@supabase/supabase-js';

/** undefined = not resolved yet, null = no service-role key configured */
let cachedClient;

/**
 * Service-role Supabase client shared by the auth/access stores. Resolved lazily
 * because server.mjs loads its .env files after these modules are imported.
 * Returns null when no key is configured, which puts every store in file mode.
 */
export function getAdminClient() {
  if (cachedClient !== undefined) return cachedClient;

  // Escape hatch for local testing against the file store.
  if (String(process.env.AUTH_STORE || '').toLowerCase() === 'file') {
    cachedClient = null;
    return cachedClient;
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';

  cachedClient =
    url && serviceKey
      ? createClient(url, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;
  return cachedClient;
}

export function isCloudStore() {
  return Boolean(getAdminClient());
}

export function storeError(error) {
  return Object.assign(new Error(error?.message || 'Store unavailable'), { status: 503 });
}

/** Postgres unique_violation */
export function isUniqueViolation(error) {
  return error?.code === '23505';
}
