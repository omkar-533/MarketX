/**
 * Train Jarvis from local PDFs (Cursor/local — not website UI).
 * 1) Reads each PDF carefully with pdf-parse
 * 2) Cleans + splits long books into parts (≤110k chars)
 * 3) Writes durable seed: data/jarvis-teachings-seed.json
 * 4) Uploads each part to live API admin knowledge
 *
 * Usage:
 *   node scripts/train-jarvis-pdfs.mjs
 *   node scripts/train-jarvis-pdfs.mjs --local-only
 */
import { createRequire } from 'module';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const dataDir = resolve(root, 'data');
const seedPath = resolve(dataDir, 'jarvis-teachings-seed.json');

const API = process.env.TRAIN_API_URL || 'https://market-api-t9co.onrender.com';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'omkarchauhan533@gmail.com').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Omkar@12345';
const LOCAL_ONLY = process.argv.includes('--local-only');
const PART_SIZE = 110_000;

const PDFS = [
  {
    title: 'Smart Money Concepts (Sonarlab)',
    path: 'C:/Users/Welcome/Pictures/Saved Pictures/62a8746d5271ed41a8f205ea_Smart Money Concepts PDF.pdf',
  },
  {
    title: 'NAACL 2024 NLP Research Paper',
    path: 'C:/Users/Welcome/Pictures/Saved Pictures/2024.naacl-long.70.pdf',
    note: 'Academic NLP paper — use only when question matches research/NLP topics',
  },
  {
    title: 'Stock Market Operations (DCOM507)',
    path: 'C:/Users/Welcome/Pictures/Saved Pictures/DCOM507_STOCK_MARKET_OPERATIONS.pdf',
  },
  {
    title: 'FIL Basics of Stock Market',
    path: 'C:/Users/Welcome/Pictures/Saved Pictures/FIL_Stock Market.pdf',
  },
  {
    title: 'Module 3 Fundamental Analysis (Varsity)',
    path: 'C:/Users/Welcome/Pictures/Saved Pictures/Module 3_Fundamental Analysis.pdf',
  },
  {
    title: 'Module 6 Option Strategies (Varsity)',
    path: 'C:/Users/Welcome/Pictures/Saved Pictures/Module 6_Option Strategies.pdf',
  },
  {
    title: 'Smart Money Concept Trading Strategy',
    path: 'C:/Users/Welcome/Pictures/Saved Pictures/Smart-Money-Concept-trading-strategy-PDF.pdf',
  },
  {
    title: 'NSE Technical Analysis Workbook',
    path: 'C:/Users/Welcome/Pictures/Saved Pictures/TA_wrkbk.pdf',
  },
];

function collapseSpacedLetters(raw) {
  return String(raw || '').replace(
    /(?:^|[^A-Za-z0-9])((?:[A-Za-z]\s+){4,}[A-Za-z])(?=[^A-Za-z0-9]|$)/g,
    (full, group) => {
      const prefix = full.slice(0, full.length - group.length);
      return `${prefix}${group.replace(/\s+/g, '')}`;
    },
  );
}

function cleanText(raw) {
  return collapseSpacedLetters(String(raw || ''))
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function stableId(title) {
  return `seed_${createHash('sha256').update(title).digest('hex').slice(0, 18)}`;
}

function splitParts(text, baseTitle) {
  if (text.length <= PART_SIZE) {
    return [{ title: baseTitle, text }];
  }
  const parts = [];
  const total = Math.ceil(text.length / PART_SIZE);
  for (let i = 0; i < total; i += 1) {
    const chunk = text.slice(i * PART_SIZE, (i + 1) * PART_SIZE).trim();
    if (chunk.length < 40) continue;
    parts.push({
      title: `${baseTitle} (Part ${i + 1}/${total})`,
      text: chunk,
    });
  }
  return parts;
}

async function extractPdf(filePath) {
  const buf = readFileSync(filePath);
  const parsed = await pdfParse(buf);
  const text = cleanText(parsed?.text || '');
  return { pages: parsed?.numpages || 0, text };
}

async function listRemote() {
  const res = await fetch(`${API}/api/app-auth/admin/knowledge`, {
    headers: {
      'X-Admin-Email': ADMIN_EMAIL,
      'X-Admin-Password': ADMIN_PASSWORD,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `list failed ${res.status}`);
  return Array.isArray(data.documents) ? data.documents : Array.isArray(data) ? data : [];
}

async function uploadText(title, text, filename) {
  const res = await fetch(`${API}/api/app-auth/admin/knowledge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Email': ADMIN_EMAIL,
      'X-Admin-Password': ADMIN_PASSWORD,
    },
    body: JSON.stringify({
      title,
      text,
      filename,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `upload failed ${res.status}`);
  return data.document || data;
}

async function deleteRemote(id) {
  const res = await fetch(`${API}/api/app-auth/admin/knowledge/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: {
      'X-Admin-Email': ADMIN_EMAIL,
      'X-Admin-Password': ADMIN_PASSWORD,
    },
  });
  if (!res.ok && res.status !== 404) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `delete failed ${res.status}`);
  }
}

async function main() {
  console.log(`Jarvis training from ${PDFS.length} PDFs…`);
  const seedDocs = [];

  for (const item of PDFS) {
    if (!existsSync(item.path)) {
      console.error(`MISSING: ${item.path}`);
      continue;
    }
    console.log(`\n→ Reading: ${item.title}`);
    const { pages, text } = await extractPdf(item.path);
    if (text.length < 40) {
      console.error(`  SKIP — almost no text (scanned/image PDF?)`);
      continue;
    }
    const header = item.note ? `${item.note}\n\n` : '';
    const full = `${header}${text}`;
    console.log(`  pages=${pages} chars=${full.length}`);
    const parts = splitParts(full, item.title);
    for (const part of parts) {
      const id = stableId(part.title);
      seedDocs.push({
        id,
        title: part.title,
        filename: basename(item.path),
        sourceType: 'pdf',
        uploadedBy: 'cursor-train',
        text: part.text,
        charCount: part.text.length,
      });
      console.log(`  part ready: ${part.title} (${part.text.length} chars)`);
    }
  }

  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  writeFileSync(
    seedPath,
    JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        source: 'scripts/train-jarvis-pdfs.mjs',
        documents: seedDocs,
      },
      null,
      2,
    ),
    'utf8',
  );
  console.log(`\nSeed saved: ${seedPath} (${seedDocs.length} docs)`);

  if (LOCAL_ONLY) {
    console.log('Local-only mode — skip live upload.');
    return;
  }

  console.log(`\nUploading to ${API} …`);
  let remote = [];
  try {
    remote = await listRemote();
    console.log(`Remote docs before: ${remote.length}`);
  } catch (err) {
    console.error(`Could not list remote knowledge: ${err.message}`);
    console.error('Seed file is ready — deploy will import on boot. Live upload skipped.');
    return;
  }

  // Remove prior Cursor-trained titles so we don't stack duplicates
  for (const doc of remote) {
    const title = String(doc.title || '');
    const mine =
      seedDocs.some((s) => s.title === title) ||
      String(doc.uploadedBy || '').includes('cursor') ||
      String(doc.uploaded_by || '').includes('cursor');
    if (mine && doc.id) {
      try {
        await deleteRemote(doc.id);
        console.log(`  removed old: ${title}`);
      } catch (err) {
        console.warn(`  delete warn ${title}: ${err.message}`);
      }
    }
  }

  let ok = 0;
  for (const doc of seedDocs) {
    try {
      const saved = await uploadText(doc.title, doc.text, doc.filename);
      ok += 1;
      console.log(`  ✓ uploaded ${doc.title} → ${saved?.id || 'ok'} (${doc.charCount} chars)`);
    } catch (err) {
      console.error(`  ✗ ${doc.title}: ${err.message}`);
    }
  }

  const after = await listRemote().catch(() => []);
  console.log(`\nDone. Uploaded ${ok}/${seedDocs.length}. Remote total now: ${after.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
