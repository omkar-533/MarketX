/**
 * Upsert Professional Smart Money Concepts into Wolf CMS (exact Pine from file).
 * Usage: node scripts/upsert-smc-indicator.mjs
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadServerEnv } from '../server/loadEnv.mjs';
import {
  createIndicator,
  listAllIndicators,
  updateIndicator,
} from '../server/auth/indicatorsStore.mjs';

loadServerEnv();

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pinePath = resolve(root, 'data/pine/professional-smart-money-concepts.pine');
const TITLE = 'Professional Smart Money Concepts';
const DESCRIPTION =
  'Wolf SMC — market structure, volumetric order blocks, FVG, premium/discount, MTF scanner. Source encrypted for members.';

const pineSource = readFileSync(pinePath, 'utf8');
if (!pineSource.includes('//@version=5') || !pineSource.includes('Wolf SMC')) {
  throw new Error('Pine file looks invalid: ' + pinePath);
}

const all = await listAllIndicators();
const existing = all.find(
  (r) => String(r.title || '').trim().toLowerCase() === TITLE.toLowerCase(),
);

if (existing?.id) {
  const saved = await updateIndicator(existing.id, {
    title: TITLE,
    description: DESCRIPTION,
    pineSource,
    link: existing.link || '',
    howToVideoUrl: existing.howToVideoUrl || '',
    published: true,
  });
  console.log(
    JSON.stringify(
      {
        ok: true,
        action: 'updated',
        id: saved.id,
        title: saved.title,
        pineChars: pineSource.length,
        settings: Array.isArray(saved.settings) ? saved.settings.length : 0,
        hasPine: Boolean(saved.pineSource),
      },
      null,
      2,
    ),
  );
} else {
  const saved = await createIndicator({
    title: TITLE,
    description: DESCRIPTION,
    pineSource,
    link: '',
    published: true,
    sortOrder: 0,
    createdBy: 'admin-script',
  });
  console.log(
    JSON.stringify(
      {
        ok: true,
        action: 'created',
        id: saved.id,
        title: saved.title,
        pineChars: pineSource.length,
        settings: Array.isArray(saved.settings) ? saved.settings.length : 0,
        hasPine: Boolean(saved.pineSource),
      },
      null,
      2,
    ),
  );
}
