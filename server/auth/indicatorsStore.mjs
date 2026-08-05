import { randomBytes } from 'crypto';
import { getAdminClient, storeError } from './supabaseAdmin.mjs';
import { readJsonFile, writeJsonFile } from './jsonStore.mjs';

const TABLE = 'app_indicators';
const FILE = 'app-indicators.json';
const BUCKET = 'indicators-media';
const MAX_BYTES = 4 * 1024 * 1024;
const SIGNED_URL_TTL = 60 * 60;

let bucketReady = false;

async function ensureBucket(db) {
  if (bucketReady) return;
  const { error } = await db.storage.createBucket(BUCKET, { public: false });
  if (error && !/exists/i.test(error.message || '')) throw storeError(error);
  bucketReady = true;
}

function decodeDataUrl(dataUrl) {
  const match = /^data:(image\/(png|jpe?g|webp));base64,([\s\S]+)$/i.exec(String(dataUrl || ''));
  if (!match) {
    throw Object.assign(new Error('Upload a PNG, JPG or WebP image'), { status: 400 });
  }
  const buffer = Buffer.from(match[3], 'base64');
  if (!buffer.length) {
    throw Object.assign(new Error('Image looks empty'), { status: 400 });
  }
  if (buffer.length > MAX_BYTES) {
    throw Object.assign(new Error('Image is too large (max 4 MB)'), { status: 413 });
  }
  return { buffer, mime: match[1], ext: match[2].toLowerCase() === 'jpeg' ? 'jpg' : match[2] };
}

function readRows() {
  const raw = readJsonFile(FILE, { indicators: [] });
  return Array.isArray(raw?.indicators) ? raw.indicators : [];
}

function writeRows(indicators) {
  writeJsonFile(FILE, { indicators });
}

/** Prefer dedicated link; fall back to legacy `code` if it holds a URL. */
function rowLink(row) {
  const link = String(row?.link || '').trim();
  if (link) return link;
  const legacy = String(row?.code || '').trim();
  if (/^https?:\/\//i.test(legacy)) return legacy;
  return '';
}

function rowHowToVideo(row) {
  return String(row?.how_to_video_url || row?.howToVideoUrl || '').trim();
}

function fromRow(row, signedUrl = null) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    link: rowLink(row),
    howToVideoUrl: rowHowToVideo(row) || null,
    sortOrder: Number(row.sort_order || 0),
    published: row.published !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by ?? null,
    imageUrl: signedUrl || row.image_data || null,
    imagePath: row.image_path ?? null,
  };
}

async function signImage(db, row) {
  if (!row?.image_path) return null;
  const { data, error } = await db.storage
    .from(BUCKET)
    .createSignedUrl(row.image_path, SIGNED_URL_TTL);
  if (error) return null;
  return data?.signedUrl ?? null;
}

async function mapRows(db, rows) {
  if (!db) return rows.map((row) => fromRow(row));
  return Promise.all(rows.map(async (row) => fromRow(row, await signImage(db, row))));
}

function normalizeHttpUrl(value) {
  let clean = String(value || '').trim();
  if (!clean) return '';
  if (!/^https?:\/\//i.test(clean)) {
    if (
      /^[a-z0-9.-]+\.[a-z]{2,}\//i.test(clean) ||
      /^www\./i.test(clean) ||
      /^youtu\.be\//i.test(clean)
    ) {
      clean = `https://${clean.replace(/^\/+/, '')}`;
    }
  }
  return clean;
}

function validateHttpUrl(value, label) {
  const clean = normalizeHttpUrl(value);
  if (!clean) return '';
  let parsed;
  try {
    parsed = new URL(clean);
  } catch {
    throw Object.assign(new Error(`Enter a valid ${label} URL (https://…)`), { status: 400 });
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw Object.assign(new Error(`${label} must start with http:// or https://`), { status: 400 });
  }
  return clean.slice(0, 2000);
}

function validateFields({ title, description, link, howToVideoUrl }) {
  const cleanTitle = String(title || '').trim();
  if (cleanTitle.length < 2) {
    throw Object.assign(new Error('Enter a title for the indicator'), { status: 400 });
  }
  const cleanLink = validateHttpUrl(link, 'invite link');
  if (!cleanLink) {
    throw Object.assign(new Error('Paste the indicator invite / share link'), { status: 400 });
  }
  return {
    title: cleanTitle.slice(0, 120),
    description: String(description || '').slice(0, 4000),
    link: cleanLink,
    howToVideoUrl: validateHttpUrl(howToVideoUrl, 'how-to video'),
  };
}

async function uploadImage(db, dataUrl) {
  if (!dataUrl) return { path: null, data: null };
  const { buffer, mime, ext } = decodeDataUrl(dataUrl);
  if (!db) return { path: null, data: dataUrl };

  await ensureBucket(db);
  const path = `covers/${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`;
  const { error } = await db.storage.from(BUCKET).upload(path, buffer, {
    contentType: mime,
    upsert: false,
  });
  if (error) throw storeError(error);
  return { path, data: null };
}

async function removeStoragePath(db, path) {
  if (!db || !path) return;
  try {
    await db.storage.from(BUCKET).remove([path]);
  } catch {
    /* ignore orphan cleanup failures */
  }
}

function sortKey(a, b) {
  const order = Number(a.sort_order || 0) - Number(b.sort_order || 0);
  if (order !== 0) return order;
  return Date.parse(b.created_at) - Date.parse(a.created_at);
}

export async function listPublishedIndicators() {
  const db = getAdminClient();
  if (!db) {
    return mapRows(
      null,
      readRows()
        .filter((row) => row.published !== false)
        .sort(sortKey),
    );
  }

  const { data, error } = await db
    .from(TABLE)
    .select('*')
    .eq('published', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) throw storeError(error);
  return mapRows(db, data || []);
}

export async function listAllIndicators() {
  const db = getAdminClient();
  if (!db) {
    return mapRows(null, [...readRows()].sort(sortKey));
  }

  const { data, error } = await db
    .from(TABLE)
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) throw storeError(error);
  return mapRows(db, data || []);
}

export async function getIndicatorById(id, { publishedOnly = false } = {}) {
  const db = getAdminClient();
  if (!db) {
    const row = readRows().find((r) => r.id === id) ?? null;
    if (!row) return null;
    if (publishedOnly && row.published === false) return null;
    return fromRow(row);
  }

  const { data, error } = await db.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw storeError(error);
  if (!data) return null;
  if (publishedOnly && data.published === false) return null;
  return fromRow(data, await signImage(db, data));
}

export async function createIndicator({
  title,
  description,
  link,
  howToVideoUrl = '',
  image,
  sortOrder = 0,
  published = true,
  createdBy = 'admin',
}) {
  const fields = validateFields({ title, description, link, howToVideoUrl });
  const id = `ind_${randomBytes(9).toString('hex')}`;
  const now = new Date().toISOString();
  const db = getAdminClient();
  const media = await uploadImage(db, image);

  // File store keeps both; cloud prod historically has `code` but not always `link`.
  const row = {
    id,
    title: fields.title,
    description: fields.description,
    link: fields.link,
    how_to_video_url: fields.howToVideoUrl,
    code: fields.link,
    image_path: media.path,
    image_data: media.data,
    sort_order: Number(sortOrder) || 0,
    published: published !== false,
    created_at: now,
    updated_at: now,
    created_by: createdBy ?? null,
  };

  if (!db) {
    writeRows([row, ...readRows()]);
    return fromRow(row);
  }

  // Cloud write: prefer columns that exist on live Supabase (`code` + how_to_video_url).
  // Sending `link` when the column is missing aborts the whole update and used to
  // silently drop the video URL in the legacy retry path.
  const cloudRow = {
    id: row.id,
    title: row.title,
    description: row.description,
    code: row.code,
    how_to_video_url: row.how_to_video_url,
    image_path: row.image_path,
    image_data: row.image_data,
    sort_order: row.sort_order,
    published: row.published,
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by,
  };

  let { data, error } = await db.from(TABLE).insert(cloudRow).select().single();
  if (error && /how_to_video_url/i.test(error.message || '')) {
    if (fields.howToVideoUrl) {
      throw Object.assign(
        new Error(
          'How-to video column missing on database. Run scripts/add-howto-video-column.mjs then retry.',
        ),
        { status: 500 },
      );
    }
    const withoutVideo = { ...cloudRow };
    delete withoutVideo.how_to_video_url;
    ({ data, error } = await db.from(TABLE).insert(withoutVideo).select().single());
  }
  // Optional: if `link` column was added later, keep it in sync (best-effort).
  if (!error && data?.id && fields.link) {
    await db.from(TABLE).update({ link: fields.link }).eq('id', data.id);
  }
  if (error) throw storeError(error);
  return fromRow(data, await signImage(db, data));
}

export async function updateIndicator(id, patch = {}) {
  const current = await getIndicatorById(id);
  if (!current) {
    throw Object.assign(new Error('Indicator not found'), { status: 404 });
  }

  const fields = validateFields({
    title: patch.title ?? current.title,
    description: patch.description ?? current.description,
    link: patch.link ?? current.link,
    howToVideoUrl:
      patch.howToVideoUrl === undefined ? current.howToVideoUrl || '' : patch.howToVideoUrl,
  });

  const db = getAdminClient();
  let imagePath = current.imagePath;
  let imageData = null;

  if (patch.image === null || patch.image === '') {
    await removeStoragePath(db, current.imagePath);
    imagePath = null;
    imageData = null;
  } else if (patch.image) {
    const media = await uploadImage(db, patch.image);
    await removeStoragePath(db, current.imagePath);
    imagePath = media.path;
    imageData = media.data;
  }

  const next = {
    title: fields.title,
    description: fields.description,
    link: fields.link,
    how_to_video_url: fields.howToVideoUrl,
    code: fields.link,
    sort_order:
      patch.sortOrder === undefined ? current.sortOrder : Number(patch.sortOrder) || 0,
    published: patch.published === undefined ? current.published : patch.published !== false,
    updated_at: new Date().toISOString(),
    image_path: imagePath,
    image_data: imageData,
  };

  if (!db) {
    writeRows(
      readRows().map((row) => {
        if (row.id !== id) return row;
        const updated = {
          ...row,
          title: next.title,
          description: next.description,
          link: next.link,
          how_to_video_url: next.how_to_video_url,
          code: next.code,
          sort_order: next.sort_order,
          published: next.published,
          updated_at: next.updated_at,
        };
        if (patch.image !== undefined) {
          updated.image_path = imagePath;
          updated.image_data = imageData;
        }
        return updated;
      }),
    );
    return getIndicatorById(id);
  }

  // Do NOT send `link` — live DB may not have that column; invite URL is in `code`.
  const cloudPatch = {
    title: next.title,
    description: next.description,
    how_to_video_url: next.how_to_video_url,
    code: next.code,
    sort_order: next.sort_order,
    published: next.published,
    updated_at: next.updated_at,
  };
  if (patch.image !== undefined) {
    cloudPatch.image_path = imagePath;
    cloudPatch.image_data = null;
  }

  let { data, error } = await db.from(TABLE).update(cloudPatch).eq('id', id).select().maybeSingle();
  if (error && /how_to_video_url/i.test(error.message || '')) {
    if (fields.howToVideoUrl) {
      throw Object.assign(
        new Error(
          'How-to video column missing on database. Run scripts/add-howto-video-column.mjs then retry.',
        ),
        { status: 500 },
      );
    }
    const withoutVideo = { ...cloudPatch };
    delete withoutVideo.how_to_video_url;
    ({ data, error } = await db.from(TABLE).update(withoutVideo).eq('id', id).select().maybeSingle());
  }
  if (error) throw storeError(error);
  if (!data) throw Object.assign(new Error('Indicator not found'), { status: 404 });

  // Best-effort sync to `link` when that column exists (ignore schema-cache miss).
  if (fields.link) {
    const sync = await db.from(TABLE).update({ link: fields.link }).eq('id', id);
    if (sync.error && !/link/i.test(sync.error.message || '')) {
      console.warn('[indicators] link sync failed:', sync.error.message);
    }
  }

  return fromRow(data, await signImage(db, data));
}

export async function deleteIndicator(id) {
  const current = await getIndicatorById(id);
  if (!current) {
    throw Object.assign(new Error('Indicator not found'), { status: 404 });
  }

  const db = getAdminClient();
  if (!db) {
    writeRows(readRows().filter((row) => row.id !== id));
    return { ok: true };
  }

  await removeStoragePath(db, current.imagePath);
  const { data, error } = await db.from(TABLE).delete().eq('id', id).select('id');
  if (error) throw storeError(error);
  if (!data?.length) throw Object.assign(new Error('Indicator not found'), { status: 404 });
  return { ok: true };
}
