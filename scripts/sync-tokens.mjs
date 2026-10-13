// Copies the app's design tokens into the site. The app repo is the only source of truth.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = process.env.MOONY_APP_DIR
  ? resolve(process.env.MOONY_APP_DIR, 'docs/design-system/tokens.css')
  : resolve(here, '../../Moony-tauri/docs/design-system/tokens.css');
const target = resolve(here, '../public/styles/tokens.css');
const check = process.argv.includes('--check');

if (!existsSync(source)) {
  if (check && existsSync(target)) { console.log('tokens: app repo not found, keeping the committed copy'); process.exit(0); }
  console.error(`tokens: source not found at ${source} (set MOONY_APP_DIR)`); process.exit(1);
}
const header = '/* Synced from the Moony app repository (docs/design-system/tokens.css). Do not edit here; run npm run tokens:sync. */\n';
const wanted = header + readFileSync(source, 'utf8');
const current = existsSync(target) ? readFileSync(target, 'utf8') : '';
if (check) {
  if (current !== wanted) { console.error('tokens: public/styles/tokens.css differs from the app; run npm run tokens:sync'); process.exit(1); }
  console.log('tokens: in sync'); process.exit(0);
}
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, wanted);
console.log(`tokens: wrote ${target}`);
