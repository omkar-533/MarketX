#!/usr/bin/env node
/**
 * One-time setup: Capacitor Android + iOS native projects
 * Run: npm run app:setup
 */
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function run(cmd) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd: root, stdio: 'inherit', shell: true });
}

console.log('Wolf Trade AI — app setup (clean, official build only)\n');

if (!existsSync(resolve(root, 'node_modules'))) {
  run('npm install');
}

if (!existsSync(resolve(root, 'android'))) {
  run('npx cap add android');
} else {
  console.log('android/ already exists — skip add');
}

if (!existsSync(resolve(root, 'ios'))) {
  try {
    run('npx cap add ios');
  } catch {
    console.warn('iOS project needs macOS — use PWA on iPhone (Safari → Add to Home Screen)');
  }
} else {
  console.log('ios/ already exists — skip add');
}

run('npm run build');
run('npx cap sync');

console.log(`
Done.

Windows desktop (abhi):
  npm run app:desktop          — open app window
  npm run app:desktop:pack     — create installer in release/

Android APK:
  npm run app:android:open     — Android Studio → Build → APK

iPhone (without Mac):
  Safari → https://mmtt-flame.vercel.app → Share → Add to Home Screen

Windows PWA:
  Edge/Chrome → site → Install app icon in address bar
`);
