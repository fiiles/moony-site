import release from '../data/release.json';
import { repoUrl } from '../config';
import type { Locale } from '../i18n';

export { release };

/** The release page on GitHub that lists every version. */
export const allReleasesUrl = `${repoUrl}/releases`;

/** File size in MB with the locale's decimal separator, e.g. "16.1 MB" or "16,1 MB". */
export function formatSize(bytes: number, locale: Locale): string {
  return (bytes / 1048576).toFixed(1).replace('.', locale === 'cs' ? ',' : '.') + ' MB';
}

/** The release date written out in the locale, e.g. "12 October 2026". */
export function formatDate(locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${release.publishedAt}T00:00:00Z`));
}

/** schema.org description of the app for the download page. Every value comes from release.json or a fixed fact about the project. */
export function softwareApplicationLd(): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Moony',
    operatingSystem: 'macOS, Windows, Linux',
    applicationCategory: 'FinanceApplication',
    softwareVersion: release.version,
    datePublished: release.publishedAt,
    downloadUrl: release.htmlUrl,
    license: 'https://www.gnu.org/licenses/agpl-3.0.html',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    author: { '@type': 'Person', name: 'Filip Král' },
  };
}
