// Run after replacing a screenshot or its 720 px PNG copy. Requires cwebp on PATH (the phone picture's 720 px copy also needs sips or ImageMagick).
// PNG originals stay as fallbacks. Only screenshots used on the landing page need WebP.
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const dir = fileURLToPath(new URL('../public/screenshots/', import.meta.url));
for (const name of ['dashboard', 'account-detail', 'stocks-analysis', 'loans']) {
  for (const locale of ['', '-cs']) {
    for (const size of ['', '-720']) {
      const stem = dir + name + locale + size;
      if (!existsSync(stem + '.png')) continue; // Some screens have no separate Czech image.
      execFileSync('cwebp', ['-quiet', '-q', '88', '-m', '6', stem + '.png', '-o', stem + '.webp']);
    }
  }
}
// The iPhone picture (public/screenshots/phone-overview.png, English only, portrait) is optional: skip it while the PNG is absent.
// Its 720 px copy is made here (resized to 720 px wide), then both files get a WebP twin. The page references all of them once the copy exists.
const phone = dir + 'phone-overview';
if (!existsSync(phone + '.png')) console.log('screenshots: phone-overview.png is not there yet, skipped');
else {
  try {
    execFileSync('sips', ['--resampleWidth', '720', phone + '.png', '--out', phone + '-720.png'], { stdio: 'ignore' });
  } catch {
    execFileSync('magick', [phone + '.png', '-resize', '720x', phone + '-720.png']);
  }
  for (const size of ['', '-720']) execFileSync('cwebp', ['-quiet', '-q', '88', '-m', '6', phone + size + '.png', '-o', phone + size + '.webp']);
}
// A close-up of net worth and the first totals, readable at phone widths.
// Recheck the crop if the dashboard layout changes (currently a 1440 × 900 screenshot).
for (const locale of ['', '-cs']) {
  const stem = dir + 'dashboard' + locale;
  execFileSync('cwebp', ['-quiet', '-q', '90', '-m', '6', '-crop', '300', '196', '740', '520', stem + '.png', '-o', stem + '-mobile.webp']);
}
console.log('screenshots: WebP files and mobile dashboard crops updated');
