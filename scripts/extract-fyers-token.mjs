#!/usr/bin/env node

/**
 * Extract Fyers token from local storage for Render deployment
 * Run: node scripts/extract-fyers-token.mjs
 */

import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tokenPath = resolve(root, 'data', 'fyers-token.json');

try {
  if (!existsSync(tokenPath)) {
    console.log('❌ No token file found at data/fyers-token.json');
    console.log('   Login locally first: npm run dev → Profile → Connect Fyers');
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(tokenPath, 'utf8'));
  const token = raw.access_token || raw.accessToken;
  const refresh = raw.refresh_token || raw.refreshToken || '';

  if (!token) {
    console.log('❌ Token file empty or invalid');
    process.exit(1);
  }

  console.log('\n✅ Fyers Token Found:\n');
  console.log(`   ${token}\n`);
  console.log('📋 To use on Render:');
  console.log('   1. Go to Render Dashboard → Settings → Environment');
  console.log('   2. Add variable: FYERS_ACCESS_TOKEN');
  console.log('   3. Paste the token above');
  if (refresh) {
    console.log('   4. Also add FYERS_REFRESH_TOKEN for auto-renew');
    console.log(`      ${refresh}`);
    console.log('   5. Add FYERS_PIN (your 4-digit TPIN)');
    console.log('   6. Save & redeploy\n');
  } else {
    console.log('   4. Save & redeploy\n');
  }

  // Copy to clipboard if possible (optional)
  try {
    const exec = await import('child_process').then(m => m.exec);
    exec(`echo "${token}" | clip`, (err) => {
      if (!err) console.log('   ✓ Token copied to clipboard!\n');
    });
  } catch {
    // Clipboard not available, user can copy manually
  }
} catch (err) {
  console.error('❌ Error reading token:', err.message);
  process.exit(1);
}
