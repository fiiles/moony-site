# Moony website

The website for Moony, the local-first personal finance app. A static Astro 5 site, bilingual (English and Czech), built to plain HTML and deployed to GitHub Pages.

## Build

```bash
npm ci && npm run build
```

The output lands in `dist/`.

## Scripts

- `npm run tokens:sync` - copy the app's design tokens into the site (`npm run tokens:check` fails on drift)
- `npm run content:sync` - fetch the app's privacy, security and changelog text and the latest release data as snapshots
- `npm test` - run the script tests (`node --test scripts/`)

## Environment variables

- `SITE_URL` - the public origin of the site (default `https://moonyapp.com`)
- `BASE_PATH` - the path prefix the site is served under (default `/`), for example `/moony-site/` on GitHub Pages

## Deploying

See .github/workflows/deploy.yml
