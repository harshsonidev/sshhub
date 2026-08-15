// One-shot smoke test: launch the built app, visit every page,
// screenshot each, and report renderer console errors.
import { _electron as electron } from 'playwright-core';
import * as fs from 'node:fs';
import * as path from 'node:path';

const APP_DIR = path.resolve(import.meta.dirname, '..');
const SHOT_DIR = process.env.SCREENSHOT_DIR || path.join(APP_DIR, 'smoke-shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const electronBin =
  process.platform === 'darwin'
    ? path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
    : path.join(APP_DIR, 'node_modules/electron/dist/electron');

// The VSCode/Claude Code shell exports ELECTRON_RUN_AS_NODE=1, which would
// turn the launched binary into a plain Node process — strip it.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const errors = [];
const app = await electron.launch({
  executablePath: electronBin,
  args: ['--no-sandbox', APP_DIR],
  env,
  timeout: 30000,
});

const page = await app.firstWindow();
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));

await page.waitForSelector('.sidebar .brand', { timeout: 15000 });
console.log('App launched. Title:', await page.title());

const pages = ['SSH Keys', 'Profiles', 'SSH Config', 'Repositories', 'SSH Agent', 'AWS', 'Backups'];
for (const label of pages) {
  const clicked = await page.evaluate((t) => {
    const el = [...document.querySelectorAll('.nav-item')].find((e) => e.textContent.includes(t));
    if (!el) return false;
    el.click();
    return true;
  }, label);
  if (!clicked) {
    errors.push(`nav item not found: ${label}`);
    continue;
  }
  await page.waitForTimeout(900);
  const file = path.join(SHOT_DIR, label.toLowerCase().replace(/\s+/g, '-') + '.png');
  await page.screenshot({ path: file });
  const title = await page.evaluate(() => document.querySelector('.page-title')?.textContent ?? '(none)');
  console.log(`${label}: page-title="${title}" -> ${path.basename(file)}`);
}

await app.close();

if (errors.length) {
  console.log('\nRenderer errors:');
  for (const e of errors) console.log(' -', e);
  process.exit(1);
}
console.log('\nSmoke test passed: all pages rendered, no renderer errors.');
