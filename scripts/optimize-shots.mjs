// Run after replacing a screenshot or its 720 px PNG copy. Requires cwebp on PATH.
// PNG originals stay as fallbacks. Only screenshots used on the landing page need WebP.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const dir = fileURLToPath(new URL('../public/screenshots/', import.meta.url));
for (const name of ['dashboard', 'account-detail', 'stocks-analysis']) {
  for (const locale of ['', '-cs']) {
    for (const size of ['', '-720']) {
      const stem = dir + name + locale + size;
      execFileSync('cwebp', ['-quiet', '-q', '88', '-m', '6', stem + '.png', '-o', stem + '.webp']);
    }
  }
}
// A close-up of net worth and the first totals, readable at phone widths.
// Recheck the crop if the dashboard layout changes (currently a 1440 × 900 screenshot).
for (const locale of ['', '-cs']) {
  const stem = dir + 'dashboard' + locale;
  execFileSync('cwebp', ['-quiet', '-q', '90', '-m', '6', '-crop', '300', '196', '740', '520', stem + '.png', '-o', stem + '-mobile.webp']);
}
console.log('screenshots: WebP files and mobile dashboard crops updated');
