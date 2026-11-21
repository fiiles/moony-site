import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readFileSync } from 'node:fs';

const registry = JSON.parse(readFileSync(new URL('./src/locales.json', import.meta.url), 'utf8'));

const site = process.env.SITE_URL || 'https://moonyfinance.com';
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  site,
  base,
  trailingSlash: 'always',
  build: { format: 'directory', assets: '_astro' },
  i18n: {
    defaultLocale: registry[0].code,
    locales: registry.map((l) => l.code),
    routing: { prefixDefaultLocale: false },
  },
  integrations: [sitemap({ i18n: { defaultLocale: registry[0].code, locales: Object.fromEntries(registry.map((l) => [l.code, l.htmlLang])) } })],
  vite: { build: { assetsInlineLimit: 0 } },
});
