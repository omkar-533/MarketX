/**
 * Reseed Universal Indicator Library cards (sidebar → Indicators).
 * Recreates published CMS rows for built-in Wolf packs when DB was wiped
 * down to Professional SMC only. Does not delete SMC or touch other systems.
 *
 * Usage: node scripts/reseed-indicator-library.mjs
 */
import { loadServerEnv } from '../server/loadEnv.mjs';
import {
  createIndicator,
  listAllIndicators,
  updateIndicator,
} from '../server/auth/indicatorsStore.mjs';

loadServerEnv();

function stubPine(title) {
  const safe = String(title).replace(/"/g, '');
  return `//@version=5
indicator("${safe}", overlay=true)
plot(close, title="Close", color=color.yellow)
`;
}

/** Titles historically shown as Wolf library / Terminal packs. */
const SEED = [
  {
    title: 'Wolf Confluence Desk',
    description: 'Plots on Terminal chart',
    sortOrder: 10,
  },
  {
    title: 'Clusters Volume Profile',
    description: 'Plots on Terminal chart',
    sortOrder: 20,
  },
  {
    title: 'Wolf Trend Ribbon',
    description: 'Plots on Terminal chart',
    sortOrder: 30,
  },
  {
    title: 'Wolf Momentum Pulse',
    description: 'Plots on Terminal chart',
    sortOrder: 40,
  },
  {
    title: 'Wolf Volume Pressure',
    description: 'Plots on Terminal chart',
    sortOrder: 50,
  },
  {
    title: 'Wolf Structure Levels',
    description: 'Plots on Terminal chart',
    sortOrder: 60,
  },
  {
    title: 'Wolf Smart Money Concepts',
    description: 'Plots on Terminal chart',
    sortOrder: 70,
  },
];

const all = await listAllIndicators();
const byTitle = new Map(
  all.map((r) => [String(r.title || '').trim().toLowerCase(), r]),
);

const report = [];

for (const item of SEED) {
  const key = item.title.toLowerCase();
  const existing = byTitle.get(key);
  const pine = existing?.pineSource || stubPine(item.title);
  if (existing?.id) {
    const saved = await updateIndicator(existing.id, {
      title: item.title,
      description: item.description || existing.description || 'Plots on Terminal chart',
      published: true,
      sortOrder: item.sortOrder,
      link: existing.link || '',
      howToVideoUrl: existing.howToVideoUrl || '',
      pineSource: pine,
    });
    report.push({ action: 'updated', id: saved.id, title: saved.title });
  } else {
    const saved = await createIndicator({
      title: item.title,
      description: item.description,
      link: '',
      pineSource: pine,
      published: true,
      sortOrder: item.sortOrder,
      createdBy: 'reseed-library',
    });
    report.push({ action: 'created', id: saved.id, title: saved.title });
  }
}

const after = await listAllIndicators();
console.log(
  JSON.stringify(
    {
      ok: true,
      before: all.length,
      after: after.length,
      report,
      titles: after.map((r) => ({
        title: r.title,
        published: r.published,
        sortOrder: r.sortOrder,
      })),
    },
    null,
    2,
  ),
);
