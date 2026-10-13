import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { asset, type Locale } from '../i18n';

/** Screenshots live in public/screenshots/<name>.png (English UI) and <name>-cs.png (Czech UI). Swapping the files is enough: size is read from them at build time. */
const dir = join(process.cwd(), 'public', 'screenshots');

/** The file for a locale; a locale without its own set falls back to the English file. */
function fileFor(name: string, locale: Locale): string {
  const localized = locale === 'en' ? `${name}.png` : `${name}-${locale}.png`;
  return existsSync(join(dir, localized)) ? localized : `${name}.png`;
}

/** Width and height of a PNG, read from its IHDR chunk (bytes 16 to 24). */
function pngSize(file: string): { width: number; height: number } {
  const head = readFileSync(join(dir, file)).subarray(0, 24);
  if (head.toString('ascii', 1, 4) !== 'PNG') throw new Error(`shots: ${file} is not a PNG`);
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

export function shot(name: string, locale: Locale): { src: string; width: number; height: number } {
  const file = fileFor(name, locale);
  return { src: asset(`screenshots/${file}`), ...pngSize(file) };
}
