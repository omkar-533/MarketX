/**
 * Bundle Opportunity scanners for the Render Node job.
 * Same math as the website — no second pipeline.
 */
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { build } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'server/marketData/generated');
const entry = resolve(root, 'src/services/opportunity/opportunityEvalNode.ts');

mkdirSync(outDir, { recursive: true });

await build({
  configFile: false,
  logLevel: 'warn',
  root,
  build: {
    ssr: entry,
    outDir,
    emptyOutDir: false,
    minify: false,
    sourcemap: false,
    target: 'node20',
    rollupOptions: {
      output: {
        format: 'es',
        entryFileNames: 'opportunityEval.mjs',
      },
    },
  },
  ssr: {
    noExternal: true,
  },
});

console.log('[opportunity-eval] bundled → server/marketData/generated/opportunityEval.mjs');
