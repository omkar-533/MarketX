/**
 * Owner teachings for Analyse AI (PDF / text notes).
 * Answers prefer this knowledge base when present.
 */
import { createRequire } from 'module';
import { randomBytes } from 'crypto';
import { readJsonFile, writeJsonFile } from './jsonStore.mjs';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const FILE = 'app-master-ai-knowledge.json';
const MAX_DOCS = 40;
const MAX_TEXT_PER_DOC = 120_000;
/** Slightly larger so multi-PDF teachings can surface in answers */
const MAX_CONTEXT_CHARS = 12_000;
const MAX_PDF_BYTES = 8 * 1024 * 1024;

function readRows() {
  const raw = readJsonFile(FILE, { documents: [] });
  return Array.isArray(raw?.documents) ? raw.documents : [];
}

function writeRows(documents) {
  writeJsonFile(FILE, { documents });
}

function fromRow(row, { includeText = false } = {}) {
  if (!row) return null;
  const base = {
    id: row.id,
    title: row.title,
    filename: row.filename ?? null,
    sourceType: row.source_type || 'pdf',
    charCount: Number(row.char_count || (row.text || '').length),
    uploadedBy: row.uploaded_by ?? null,
    createdAt: row.created_at,
  };
  if (includeText) base.text = row.text || '';
  return base;
}

function decodePdfDataUrl(dataUrl) {
  const match = /^data:application\/pdf;base64,(.+)$/i.exec(String(dataUrl || '').trim());
  if (!match) {
    throw Object.assign(new Error('PDF must be a data:application/pdf;base64,… payload'), {
      status: 400,
    });
  }
  const buffer = Buffer.from(match[1], 'base64');
  if (!buffer.length) {
    throw Object.assign(new Error('Empty PDF'), { status: 400 });
  }
  if (buffer.length > MAX_PDF_BYTES) {
    throw Object.assign(new Error('PDF too large (max 8 MB)'), { status: 413 });
  }
  return buffer;
}

function collapseSpacedLetters(raw) {
  // PDFs sometimes extract "H e l l o" — collapse runs of single spaced letters
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
    .trim()
    .slice(0, MAX_TEXT_PER_DOC);
}

export async function listKnowledgeDocs() {
  return readRows()
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .map((row) => fromRow(row));
}

export async function createKnowledgeFromPdf({
  title,
  filename,
  pdfDataUrl,
  uploadedBy,
}) {
  const buffer = decodePdfDataUrl(pdfDataUrl);
  let parsed;
  try {
    parsed = await pdfParse(buffer);
  } catch (err) {
    throw Object.assign(new Error(`Could not read PDF: ${err?.message || 'parse failed'}`), {
      status: 400,
    });
  }
  const text = cleanText(parsed?.text);
  if (text.length < 40) {
    throw Object.assign(
      new Error('PDF se readable text nahi mila. Scanned/image PDF support nahi — text PDF use karo.'),
      { status: 400 },
    );
  }
  return saveDoc({
    title: title || filename || 'Teaching PDF',
    filename: filename || 'upload.pdf',
    sourceType: 'pdf',
    text,
    uploadedBy,
  });
}

export async function createKnowledgeFromText({ title, text, uploadedBy }) {
  const cleaned = cleanText(text);
  if (cleaned.length < 40) {
    throw Object.assign(new Error('Teaching text too short'), { status: 400 });
  }
  return saveDoc({
    title: title || 'Teaching notes',
    filename: null,
    sourceType: 'text',
    text: cleaned,
    uploadedBy,
  });
}

function saveDoc({ title, filename, sourceType, text, uploadedBy, id: forcedId }) {
  const rows = readRows();
  const titleKey = String(title || '').trim().toLowerCase();
  const withoutDup = rows.filter((row) => {
    if (forcedId && row.id === forcedId) return false;
    return String(row.title || '').trim().toLowerCase() !== titleKey;
  });
  if (withoutDup.length >= MAX_DOCS) {
    throw Object.assign(new Error(`Max ${MAX_DOCS} teaching docs. Delete one pehle.`), {
      status: 400,
    });
  }
  const id = forcedId || `kb_${randomBytes(9).toString('hex')}`;
  const createdAt = new Date().toISOString();
  const row = {
    id,
    title: String(title || 'Untitled').trim().slice(0, 160),
    filename: filename ? String(filename).trim().slice(0, 200) : null,
    source_type: sourceType,
    text,
    char_count: text.length,
    uploaded_by: uploadedBy || null,
    created_at: createdAt,
  };
  writeRows([row, ...withoutDup]);
  return fromRow(row);
}

export async function deleteKnowledgeDoc(id) {
  const rows = readRows();
  const next = rows.filter((row) => row.id !== id);
  if (next.length === rows.length) {
    throw Object.assign(new Error('Document not found'), { status: 404 });
  }
  writeRows(next);
  return true;
}

/** Replace-or-insert by stable seed id / title (used by local training script + boot seed). */
export async function upsertKnowledgeDoc({
  id,
  title,
  text,
  filename = null,
  sourceType = 'pdf',
  uploadedBy = 'cursor-train',
}) {
  const cleaned = cleanText(text);
  if (cleaned.length < 40) {
    throw Object.assign(new Error('Teaching text too short'), { status: 400 });
  }
  return saveDoc({
    id: id || undefined,
    title,
    filename,
    sourceType,
    text: cleaned,
    uploadedBy,
  });
}

/**
 * Load durable seed teachings shipped with the repo (survives Render redeploys).
 * File: data/jarvis-teachings-seed.json
 */
export async function ensureSeedTeachings() {
  const seed = readJsonFile('jarvis-teachings-seed.json', null);
  const docs = Array.isArray(seed?.documents) ? seed.documents : [];
  if (!docs.length) return { imported: 0, total: knowledgeDocCount() };

  let imported = 0;
  for (const doc of docs) {
    const title = String(doc?.title || '').trim();
    const text = String(doc?.text || '');
    if (!title || text.length < 40) continue;
    await upsertKnowledgeDoc({
      id: doc.id || `seed_${Buffer.from(title).toString('hex').slice(0, 18)}`,
      title,
      text,
      filename: doc.filename || null,
      sourceType: doc.sourceType || 'pdf',
      uploadedBy: doc.uploadedBy || 'seed',
    });
    imported += 1;
  }
  return { imported, total: knowledgeDocCount() };
}

function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9\u0900-\u097f₹%]+/i)
    .filter((t) => t.length > 2);
}

const STOP_TOKENS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'have', 'what', 'when', 'where',
  'kya', 'hai', 'hain', 'karo', 'batao', 'please', 'about', 'just', 'into', 'your',
]);

function scoreText(text, queryTokens) {
  if (!queryTokens.length) return 0;
  const lower = text.toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    if (STOP_TOKENS.has(token)) continue;
    if (lower.includes(token)) score += token.length >= 5 ? 2 : 1;
  }
  return score;
}

function isNonTradingDoc(title = '') {
  return /naacl|nlp research|computational linguistics|association for computational/i.test(title);
}

function isTradingDoc(title = '') {
  return /smart money|smc|option|fundamental|technical|stock market|varsity|order block|nifty|trading/i.test(
    title,
  );
}

/**
 * Build OWNER KNOWLEDGE only when docs actually match the question.
 * Never dump unrelated PDF garbage into every reply (that makes answers dumb).
 */
export function buildKnowledgeContext(userMessage = '') {
  const docs = readRows();
  if (!docs.length) return '';

  const queryTokens = tokenize(userMessage).filter((t) => !STOP_TOKENS.has(t));
  if (queryTokens.length < 1) return '';

  const scored = docs
    .map((doc) => {
      const title = String(doc.title || '');
      let score = scoreText(`${title}\n${String(doc.text || '').slice(0, 40_000)}`, queryTokens);
      if (isTradingDoc(title)) score += 1;
      if (isNonTradingDoc(title) && !/nlp|language model|llm|transformer/i.test(userMessage)) {
        score = 0;
      }
      return { doc, score };
    })
    .filter((row) => row.score >= 2)
    .sort((a, b) => b.score - a.score || Date.parse(b.doc.created_at) - Date.parse(a.doc.created_at));

  if (!scored.length) return '';

  const parts = [];
  let used = 0;
  for (const { doc, score } of scored.slice(0, 3)) {
    if (used >= MAX_CONTEXT_CHARS) break;
    const header = `### ${doc.title} (match:${score})`;
    const room = Math.min(4500, MAX_CONTEXT_CHARS - used - header.length - 2);
    if (room < 280) break;
    const body = String(doc.text || '').slice(0, room);
    parts.push(`${header}\n${body}`);
    used += header.length + body.length + 2;
  }

  if (!parts.length) return '';

  return [
    'OWNER TEACHINGS (use ONLY if relevant to THIS question):',
    'Extract the useful method/rule — do NOT paste or ramble the PDF. Ignore unrelated chunks.',
    'If teachings conflict with live market numbers, use live numbers for prices; teachings for method.',
    'If nothing here matches the question, ignore OWNER TEACHINGS completely.',
    '',
    ...parts,
  ].join('\n');
}

export function knowledgeDocCount() {
  return readRows().length;
}
