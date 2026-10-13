import en from './en.json';
import cs from './cs.json';

export type Locale = 'en' | 'cs';
export const locales: Locale[] = ['en', 'cs'];
/** Each language written in itself, for the language switch. Typed as a full record so a new locale cannot ship without a name. */
export const languageNames: Record<Locale, string> = { en: 'English', cs: 'Čeština' };
const dict: Record<Locale, unknown> = { en, cs };

/** Where the site is published when Astro has no `site` configured. The one place this address lives. */
const FALLBACK_SITE = 'https://moonyfinance.com';

function lookup(locale: Locale, key: string): unknown {
  return key.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), dict[locale]);
}

/** Look up a dot-path key (e.g. "nav.download"). Throws on a missing key so a build never ships a hole. */
export function t(locale: Locale, key: string): string {
  const value = lookup(locale, key);
  if (typeof value !== 'string') throw new Error(`i18n: missing key "${key}" for locale "${locale}"`);
  return value;
}

/** Look up an array of strings (e.g. the axis labels of a chart). Throws unless the key is a non-empty array of strings. */
export function tList(locale: Locale, key: string): string[] {
  const value = lookup(locale, key);
  if (!Array.isArray(value) || value.length === 0 || value.some((v) => typeof v !== 'string')) throw new Error(`i18n: key "${key}" for locale "${locale}" is not a list of strings`);
  return value as string[];
}

/** `t` with `{name}` placeholders filled in. A placeholder left without a value throws, like a missing key. */
export function tf(locale: Locale, key: string, vars: Record<string, string>): string {
  return t(locale, key).replace(/\{(\w+)\}/g, (_, name: string) => {
    if (!(name in vars)) throw new Error(`i18n: key "${key}" for locale "${locale}" needs "{${name}}"`);
    return vars[name];
  });
}

/** The base path the site is served under, always with a trailing slash. */
export function base(): string {
  const raw = import.meta.env.BASE_URL;
  return raw.endsWith('/') ? raw : raw + '/';
}

/** URL of a file under the site root (stylesheets, fonts, images), prefixed with the base path. */
export function asset(path: string): string {
  return base() + path.replace(/^\/+/, '');
}

/** Astro's configured site, or the production address when none is configured. */
export function siteUrl(site: URL | undefined): URL {
  return site ?? new URL(FALLBACK_SITE);
}

/** Site-relative URL for a page in a locale, prefixed with the configured base path. */
export function href(locale: Locale, path: string): string {
  const clean = path.replace(/^\/+/, '');
  return locale === 'en' ? base() + clean : base() + 'cs/' + clean;
}

/** The hreflang set (one entry per available locale, plus x-default) as absolute URLs. A page that exists in only some locales passes just those. */
export function alternate(site: URL, path: string, available: Locale[] = locales): { lang: string; href: string }[] {
  const abs = (l: Locale) => new URL(href(l, path), site).toString();
  return [
    ...available.map((l) => ({ lang: l, href: abs(l) })),
    { lang: 'x-default', href: abs(available.includes('en') ? 'en' : available[0]) },
  ];
}

export function other(locale: Locale): Locale { return locale === 'en' ? 'cs' : 'en'; }
