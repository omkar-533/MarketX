import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)));
const symbolsPath = resolve(root, 'fnoSymbols.json');

let cached = null;

export function getFnoSymbolList() {
  if (!cached) {
    cached = JSON.parse(readFileSync(symbolsPath, 'utf8'));
  }
  return cached;
}
