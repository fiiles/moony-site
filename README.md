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
- `_redirects` - holds only a comment. Cloudflare does not support domain-level redirects in this file, so the `www` to apex redirect is a Redirect Rule on the domain's zone (see Deploying, section 3).
- `robots.txt` - allows everything and names the sitemap (the build rewrites the address to match `SITE_URL` and `BASE_PATH`).
- `js/os.js` - the only script on the site: it labels the home page download links for the visitor’s operating system, links to the matching installer section and highlights that system on the download page. All systems stay available, and phones keep the generic choices. It is a file of its own so that no inline script is needed.
- `screenshots/` - the app pictures, 1440 px wide (`<name>.png` and `<name>-cs.png`), each with a 720 px copy (`<name>-720.png`, `<name>-cs-720.png`) that phones download through `srcset`. To refresh them, replace the 1440 px files under the same names, then recreate the copies, regenerate WebP variants and build:

  ```bash
  for f in public/screenshots/*.png; do case "$f" in *-720.png) ;; *) sips -Z 720 "$f" --out "${f%.png}-720.png";; esac; done
  npm run shots:optimize # requires cwebp (WebP tools); not needed for a normal build
  ```

The landing page uses four screenshots: dashboard, account detail, investment analysis and loans. Each has same-origin WebP sources with PNG fallback; the dashboard also has a 740 × 520 close-up for screens up to 600 px wide. Recheck the crop in `scripts/optimize-shots.mjs` if the app layout changes. A short AI integration section on the home page shows example questions and explains the optional data sharing. Full setup instructions live at `/ai-integration/` and `/cs/ai-integration/`, linked from the footer.

## Deploying

The site is deployed by Cloudflare from the `main` branch of this repository, as a Worker with static assets (configured by `wrangler.jsonc`). Every push to `main` rebuilds and publishes it; other branches only build previews, if you leave that on in the Worker's build settings. You need a GitHub account, a free Cloudflare account and the domain `moonyfinance.com`, which is registered at Cloudflare. Nothing here needs a credit card or any paid plan. Dashboard menu and setting names below are the ones Cloudflare shows today; they vary by dashboard version, so search the dashboard for a name if a path does not exist.

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

### 2. Create the Worker

1. Sign in at https://dash.cloudflare.com (create the free account first if you have none) and open **Compute → Workers & Pages** in the left menu.
2. Click **Create**. The screen offers *Connect GitHub*, *Connect with GitLab*, *Start with Hello World!*, *Select a template* and *Upload your static files*; choose **Connect GitHub**, authorise Cloudflare to read your GitHub account and pick the repository `fiiles/moony-site`. (The same screen labels Pages as legacy: "Need to use the legacy Pages workflow? Continue to Pages". See the note at the end of this section.)
3. Use these settings:

   | Setting | Value |
   |---|---|
   | Project name | `moony-site` (must equal `name` in `wrangler.jsonc`) |
   | Build command | `npm run build` |
   | Deploy command | `npx wrangler deploy` (the default) |
   | Root directory | `/` |

4. Under **Build variables** add `ASTRO_TELEMETRY_DISABLED` = `1`. `SITE_URL` and `BASE_PATH` are not needed: the defaults (`https://moonyfinance.com` and `/`) are right. Node comes from the repository's `.nvmrc` (24); Astro 7 needs 22.12 or newer.
5. Click **Create and deploy**. The first build takes about a minute; the site is then live at the Worker's `workers.dev` address.

`wrangler.jsonc` in the repository root is the whole Worker: no code, only `dist/` served as static assets, `dist/404.html` as the 404 page for unknown addresses (`not_found_handling`), and `/download` answered with a redirect to `/download/` while the file `dist/download/index.html` is served for both (`html_handling: auto-trailing-slash`). Wrangler is not a dependency of the site; Workers Builds runs `npx wrangler deploy` itself. `public/_headers` and `public/_redirects` end up in `dist/` and are honoured by Workers static assets (`npm run build` checks that they are copied unchanged).

Legacy alternative, Cloudflare Pages: on the same Create screen choose **Continue to Pages**, then **Connect to Git**, pick the repository and use build command `npm run build`, build output directory `dist`, root directory empty, and the environment variable `ASTRO_TELEMETRY_DISABLED` = `1`. Add the domains under the project's **Custom domains** instead of the Worker's settings (section 3). `wrangler.jsonc` belongs to the Worker path; if the Pages build complains about it, remove the file for that path. Everything else in this document applies to both.

### 3. Connect the domain

1. Open the Worker, then **Settings → Domains & Routes → Add → Custom domain**, enter `moonyfinance.com` and add it. Do the same for `www.moonyfinance.com`. The domain is registered at Cloudflare, so the DNS records and the certificate are created automatically when a custom domain is added; there is nothing to enter at a registrar. (A bare domain only works with its DNS zone on Cloudflare, which a Cloudflare registration provides.)
2. Wait until both domains show as active (the certificate is issued automatically). The `www` record must stay **proxied** (orange cloud): a redirect rule never sees requests to an unproxied record.
3. Create the `www` redirect as a zone **Redirect Rule**. This is required: `public/_redirects` cannot do it, because Cloudflare does not support domain-level sources there. Open the zone `moonyfinance.com`, then **Rules → Overview**, pick the template **Redirect from WWW to root**, choose **Create from template** and **Deploy**. If the template is not offered, create a custom rule under **Rules → Redirect Rules**:
   - When incoming requests match: custom filter expression `http.host eq "www.moonyfinance.com"`
   - Then: **Dynamic** redirect, expression `concat("https://moonyfinance.com", http.request.uri.path)`, status code **301**, **Preserve query string** switched on
4. Run the `www` check in section 5 below.

### 4. Zone settings

Cloudflare has optional features that inject scripts into HTML, set cookies or alter files. They would break the site's promise of no third parties and no cookies (and the Content-Security-Policy would block the scripts anyway, leaving the console full of errors). Open the zone `moonyfinance.com` and set:

| Where | Setting | Value |
|---|---|---|
| SSL/TLS → Overview | Encryption mode | **Full (strict)** |
| SSL/TLS → Edge Certificates | Always Use HTTPS | On |
| SSL/TLS → Edge Certificates | Minimum TLS Version | TLS 1.2 |
| SSL/TLS → Edge Certificates | HTTP Strict Transport Security (HSTS) | leave **off** here; the site sends the header itself (`public/_headers`) |
| Security → Settings (use the search box on that page) | Email Address Obfuscation | Off (rewrites the HTML) |
| Security → Settings | AI Labyrinth | Off |
| Security → Settings | Bot fight mode | Off (injects detection scripts, can set cookies) |
| Security → Settings | Hotlink Protection | Off (can break link previews) |
| Security → Settings | Continuous script monitoring | Off (adds a script) |
| Speed → Settings → Content | Rocket Loader™ | Off (rewrites script tags) |
| Speed → Settings → Content | Speed Brain | Off |
| Speed → Settings → Content | Cloudflare Fonts | Off (rewrites the font links) |
| Speed → Settings → Recommendations | Web analytics using real user measurement (RUM) | Disabled (adds a tracking beacon) |
| AI Crawl Control → Overview | Enable Bot Preference Sync | Off (otherwise Cloudflare prepends its own text to `robots.txt`) |

Browser integrity check and Replace insecure JavaScript libraries may stay on. At account level (outside the zone), **Analytics → Web analytics**: do not add the site. Do not turn on Zaraz either.

### 5. Check the live site

After the first deploy, from this folder:

```bash
npm run build
curl -s https://moonyfinance.com/ | diff - dist/index.html && echo "identical: nothing was injected"
curl -sI https://moonyfinance.com/ | grep -iE 'content-security-policy|strict-transport|x-frame|x-content-type|referrer-policy|permissions-policy'
curl -sI https://www.moonyfinance.com/download/ | grep -iE '^HTTP|^location'
curl -s https://moonyfinance.com/robots.txt | diff - dist/robots.txt && echo "identical: robots.txt untouched"
```

The first command must print `identical` (any difference means something between the repository and the visitor changed the HTML; look at the diff). The second must list the six headers from `public/_headers`. The third must show a `301` to `https://moonyfinance.com/download/` (it only does once the Redirect Rule from section 3 is deployed). The fourth must print `identical` as well; `dist/robots.txt` names `https://moonyfinance.com/sitemap-index.xml`, and a difference usually means Bot Preference Sync (section 4) is still on. In a browser, open the developer tools on the home page: the Network tab lists only `moonyfinance.com` and the Console shows no errors. The `Strict-Transport-Security` header carries `includeSubDomains; preload`, so every future subdomain of `moonyfinance.com` must also answer over HTTPS; only submit the domain to https://hstspreload.org when you are sure of that.

### 6. After each app release

```bash
npm run content:sync && npm run tokens:sync
npm test && npm run build
git add -A && git commit -m "chore: sync v0.x.y" && git push
```

`content:sync` refreshes the snapshots of the app's Privacy, Security and Changelog and the latest release (version, date, download links and sizes); `tokens:sync` copies the design tokens. Running the build first matters: its checks fail on a broken link or anchor in the new text, and a failed build on Cloudflare leaves the previous version online. Cloudflare rebuilds on the push. If the app's screenshots changed, replace the files in `public/screenshots/` first (1440 px wide, same names) and recreate the 720 px copies and WebP variants (see "What lives in `public/`").

Roll back a bad deploy from the Worker's **Deployments** (roll back to an earlier version there; names vary by dashboard version), or revert the commit and push.

Astro's anonymous telemetry is switched off in the build by `ASTRO_TELEMETRY_DISABLED=1`; run `npx astro telemetry disable` once locally.
