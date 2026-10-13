# Moony website

The website for Moony, the local-first personal finance app. A static Astro 7 site, bilingual (English and Czech), built to plain HTML. Hosted on Cloudflare from the public GitHub repository `fiiles/moony-site`, served at https://moonyfinance.com.

## Installing

The `.npmrc` in this repository pins the npm registry to https://registry.npmjs.org/, so installs never use another registry.

## Build

```bash
npm ci && npm run build
```

The output lands in `dist/`. `npm run build` also runs the token check before the build and `scripts/check-dist.mjs` after it. The checks fail the build when a page would break the site's promises: a request to another host, an inline script or style (the Content-Security-Policy allows none), a missing canonical or hreflang link, a broken internal link or asset, an exclamation mark in an h1 to h3, more than 400 KB of HTML, CSS, JS and fonts (screenshots and social images excluded), or a weakened `_headers` file. It also writes the right `Sitemap:` line into `dist/robots.txt`.

## Scripts

- `npm run tokens:sync` - copy the app's design tokens into the site (`npm run tokens:check` fails on drift)
- `npm run content:sync` - fetch the app's privacy, security and changelog text and the latest release data as snapshots
- `npm test` - run the script tests (`node --test "scripts/*.test.mjs"`), among them the proof that every `check-dist` check fires on a bad page

## Environment variables

- `SITE_URL` - the public origin of the site (default `https://moonyfinance.com`)
- `BASE_PATH` - the path prefix the site is served under (default `/`); only for previews under a sub-path, not needed on Cloudflare

## What lives in `public/`

- `_headers` - the response headers Cloudflare adds: a strict Content-Security-Policy (`script-src 'self'`, `style-src 'self'`, `connect-src 'none'`, no exceptions), HSTS, `nosniff`, referrer and permissions policies, and the cache rules for fonts, screenshots and `_astro/`. Change it only to something equally strict; `check-dist` fails the build otherwise.
- `_redirects` - holds only a comment. Cloudflare does not support domain-level redirects in this file, so the `www` to apex redirect is a Redirect Rule on the domain's zone (see Deploying, step 3).
- `robots.txt` - allows everything and names the sitemap (the build rewrites the address to match `SITE_URL` and `BASE_PATH`).
- `js/os.js` - the only script on the site: it puts the visitor's operating system on the home page download button. It is a file of its own so that no inline script is needed.
- `screenshots/` - the app pictures, 1440 px wide. To refresh them, replace the files under the same names (`<name>.png` and `<name>-cs.png`), then build.

## Deploying

The site is deployed by Cloudflare from the `main` branch of this repository. Every push to `main` rebuilds and publishes it; every other branch gets a preview address. You need a GitHub account, a free Cloudflare account and the domain `moonyfinance.com`. Nothing here needs a credit card or any paid plan.

### 1. Put the code on GitHub

From this folder, either let the GitHub CLI do it:

```bash
gh repo create fiiles/moony-site --public --source . --push
```

or create an empty public repository `moony-site` on github.com and run:

```bash
git remote add origin https://github.com/fiiles/moony-site.git
git push -u origin main
```

### 2. Create the Cloudflare project

1. Sign in at https://dash.cloudflare.com (create the free account first if you have none) and open **Workers & Pages** in the left menu.
2. Click **Create**, choose **Pages**, then **Connect to Git**, authorise Cloudflare to read your GitHub account and pick the repository `fiiles/moony-site`. (If the dashboard only offers **Import a repository** for a Worker, see the note below the table.)
3. Use these settings:

   | Setting | Value |
   |---|---|
   | Production branch | `main` |
   | Framework preset | Astro, or none |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Root directory | empty |

4. Under **Environment variables** add, for production (and for preview deployments, which have their own tab):

   | Variable | Value |
   |---|---|
   | `NODE_VERSION` | `24` (the repository's `.nvmrc` says the same) |
   | `ASTRO_TELEMETRY_DISABLED` | `1` |
   | `SITE_URL` | `https://moonyfinance.com` |
   | `BASE_PATH` | `/` |

5. Click **Save and Deploy**. The first build takes about a minute; the site is then live at `https://<project>.pages.dev`.

Workers with static assets instead of Pages: the same build command and the same variables apply, and the deploy command is `npx wrangler deploy`. That path needs a file `wrangler.toml` in the repository root (commit it only if you take this path; with Pages leave it out):

```toml
name = "moony-site"
compatibility_date = "2026-10-01"

[assets]
directory = "./dist"
not_found_handling = "404-page"
```

`not_found_handling = "404-page"` makes unknown addresses answer with `dist/404.html` and a 404 status. Pages does that on its own, so it has no such setting. `_headers` works the same on both paths. The Worker's name in the Cloudflare dashboard must equal `name` in `wrangler.toml` (`moony-site`).

### 3. Connect the domain

1. In the project, open **Custom domains**, click **Set up a custom domain**, enter `moonyfinance.com` and continue. Then add `www.moonyfinance.com` the same way, so that the name exists and the redirect in item 3 below has a request to act on. The domain is registered at Cloudflare, so its DNS records are created automatically when the custom domain is added to the Pages project; there is nothing to enter at a registrar. (The bare domain only works when the domain's DNS zone is on Cloudflare, which a Cloudflare registration provides.)
2. Wait until both domains show **Active** (the certificate is issued automatically). Leave the `www` record **proxied** (orange cloud); a redirect rule never sees requests to an unproxied record.
3. Create the `www` redirect as a zone **Redirect Rule**. This step is required: `public/_redirects` cannot do it, because Cloudflare does not support domain-level sources there. In the Cloudflare dashboard open the zone `moonyfinance.com`, then **Rules → Redirect Rules** (in the 2025 dashboard it may sit under **Rules → Overview → Create rule → Redirect Rule**; names vary by dashboard version). If a "Redirect from WWW to Root" template is offered, use it and check that it ends up as described below. Otherwise create a custom rule:
   - When incoming requests match: custom filter expression `http.host eq "www.moonyfinance.com"`
   - Then: **Dynamic** redirect, expression `concat("https://moonyfinance.com", http.request.uri.path)`, status code **301**, **Preserve query string** switched on
4. Deploy the rule, then run the `www` check in section 5 below.

### 4. Switch off everything that adds to the pages

Cloudflare has optional features that inject scripts into HTML or set cookies. They would break the site's promise of no third parties and no cookies (and the Content-Security-Policy would block them anyway, leaving the console full of errors). Open the domain `moonyfinance.com` in the dashboard and make sure each of these is **off**. Menu names vary by dashboard version: if a path below does not exist, search the dashboard for the setting's name and check that it is off.

| Where | Setting | Why |
|---|---|---|
| Speed → Optimization → Content Optimization | Rocket Loader | rewrites script tags |
| Speed → Optimization → Content Optimization | Auto Minify (where it is still shown) | alters the HTML; the build output is already compact |
| Speed → Optimization → Image Optimization | Mirage, Polish (paid plans only) | rewrite images |
| Security → Bots | Bot Fight Mode | injects detection scripts and can set cookies |
| Scrape Shield | Email Address Obfuscation | rewrites the HTML |
| Scrape Shield | Hotlink Protection | can break link previews that embed the site's images on other sites |
| Analytics & Logs → Web Analytics | do not enable it for the site (it is also offered in the Pages project settings; keep it off there) | adds a tracking beacon |

Do not turn on Zaraz either. Leaving **Always Use HTTPS** on is fine.

### 5. Check the live site

After the first deploy, from this folder:

```bash
npm run build
curl -s https://moonyfinance.com/ | diff - dist/index.html && echo "identical: nothing was injected"
curl -sI https://moonyfinance.com/ | grep -iE 'content-security-policy|strict-transport|x-frame|x-content-type|referrer-policy|permissions-policy'
curl -sI https://www.moonyfinance.com/download/ | grep -iE '^HTTP|^location'
curl -s https://moonyfinance.com/robots.txt
```

The first command must print `identical` (any difference means something between the repository and the visitor changed the HTML; look at the diff). The second must list the six headers from `public/_headers`. The third must show a `301` to `https://moonyfinance.com/download/` (it only does once the Redirect Rule from section 3 is deployed). The fourth must name `https://moonyfinance.com/sitemap-index.xml`. In a browser, open the developer tools on the home page: the Network tab lists only `moonyfinance.com` and the Console shows no errors. The `Strict-Transport-Security` header carries `includeSubDomains; preload`, so every future subdomain of `moonyfinance.com` must also answer over HTTPS; only submit the domain to https://hstspreload.org when you are sure of that.

### 6. After each app release

```bash
npm run content:sync && npm run tokens:sync
npm test && npm run build
git add -A && git commit -m "chore: sync v0.x.y" && git push
```

`content:sync` refreshes the snapshots of the app's Privacy, Security and Changelog and the latest release (version, date, download links and sizes); `tokens:sync` copies the design tokens. Running the build first matters: its checks fail on a broken link or anchor in the new text, and a failed build on Cloudflare leaves the previous version online. Cloudflare rebuilds on the push. If the app's screenshots changed, replace the files in `public/screenshots/` first (1440 px wide, same names).

Roll back a bad deploy from the project's **Deployments** list (**Rollback to this deployment**), or revert the commit and push.

Astro's anonymous telemetry is switched off in the build by `ASTRO_TELEMETRY_DISABLED=1`; run `npx astro telemetry disable` once locally.
