import en from './en.json';
import cs from './cs.json';

export type Locale = 'en' | 'cs';
export const locales: Locale[] = ['en', 'cs'];
const dict: Record<Locale, unknown> = { en, cs };

/** Look up a dot-path key (e.g. "nav.download"). Throws on a missing key so a build never ships a hole. */
export function t(locale: Locale, key: string): string {
  const value = key.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), dict[locale]);
  if (typeof value !== 'string') throw new Error(`i18n: missing key "${key}" for locale "${locale}"`);
  return value;
}

/** Site-relative URL for a page in a locale, prefixed with the configured base path. */
export function href(locale: Locale, path: string): string {
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : import.meta.env.BASE_URL + '/';
  const clean = path.replace(/^\/+/, '');
  return locale === 'en' ? base + clean : base + 'cs/' + clean;
}

/** The hreflang set (en, cs, x-default) as absolute URLs. */
export function alternate(site: URL | undefined, path: string): { lang: string; href: string }[] {
  const abs = (l: Locale) => new URL(href(l, path), site ?? 'https://moonyapp.com').toString();
  return [
    { lang: 'en', href: abs('en') },
    { lang: 'cs', href: abs('cs') },
    { lang: 'x-default', href: abs('en') },
  ];
}

export function other(locale: Locale): Locale { return locale === 'en' ? 'cs' : 'en'; }
