# Moony website

The website for Moony, the local-first personal finance app. A static Astro 7 site, bilingual (English and Czech), built to plain HTML.

## Installing

The `.npmrc` in this repository pins the npm registry to https://registry.npmjs.org/, so installs never use another registry.

## Build

```bash
npm ci && npm run build
```

The output lands in `dist/`.

## Scripts

- `npm run tokens:sync` - copy the app's design tokens into the site (`npm run tokens:check` fails on drift)
- `npm run content:sync` - fetch the app's privacy, security and changelog text and the latest release data as snapshots
- `npm test` - run the script tests (`node --test "scripts/*.test.mjs"`)

## Environment variables

- `SITE_URL` - the public origin of the site (default `https://moonyfinance.com`)
- `BASE_PATH` - the path prefix the site is served under (default `/`)

## Deploying

Deployed on Cloudflare from the `main` branch.

Astro's anonymous telemetry is switched off in CI with ASTRO_TELEMETRY_DISABLED=1; run `npx astro telemetry disable` once locally.
