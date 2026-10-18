// Privacy-by-construction checks on the built site (dist/). Runs after `astro build`; exit code 1 on any failed check.
//
// Environment: DIST_DIR (default ../dist), PUBLIC_DIR (default ../public), SITE_URL (default https://moonyfinance.com), BASE_PATH (default /).
// The checks mirror the Content-Security-Policy in public/_headers: nothing is loaded from another origin,
// nothing is inline, and nothing in the page can make a network request of its own.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(process.env.DIST_DIR || resolve(here, '../dist'));
const publicDir = resolve(process.env.PUBLIC_DIR || resolve(here, '../public'));
const siteUrl = (process.env.SITE_URL || 'https://moonyfinance.com').replace(/\/+$/, '');
const origin = new URL(siteUrl).origin;
const rawBase = (process.env.BASE_PATH || '/').replace(/^\/+|\/+$/g, '');
const basePath = rawBase === '' ? '/' : `/${rawBase}/`;

/** Pages that exist in English only: they carry the `en` and `x-default` alternates and no `cs`. */
const ENGLISH_ONLY = new Set(['privacy/', 'security/', 'changelog/']);
/** HTML + CSS + JS + fonts, without the screenshot and social images. */
const SIZE_BUDGET = 450 * 1024;
const BUDGET_EXTENSIONS = new Set(['.html', '.css', '.js', '.mjs', '.woff', '.woff2', '.ttf', '.otf']);
const BUDGET_EXCLUDED = ['screenshots/', 'og/'];

// ---------------------------------------------------------------- helpers

const posixRel = (file) => relative(dist, file).split(sep).join('/');
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", excl: '!', nbsp: ' ' };
const decode = (s) =>
  s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(\w+));/gi, (m, dec, hex, name) =>
    dec ? String.fromCodePoint(+dec) : hex ? String.fromCodePoint(parseInt(hex, 16)) : (ENTITIES[name.toLowerCase()] ?? m));

const ATTR = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
function parseAttrs(source) {
  const attrs = {};
  for (const m of source.matchAll(ATTR)) attrs[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? '');
  return attrs;
}

const TAG = /<([a-zA-Z][\w:-]*)((?:\s+[^\s"'<>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/g;
function parseHtml(file) {
  let html = readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const scripts = [];
  const styles = [];
  html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (_, a, body) => (scripts.push({ attrs: parseAttrs(a), body }), ''));
  html = html.replace(/<style\b([^>]*)>([\s\S]*?)<\/style\s*>/gi, (_, a, body) => (styles.push({ attrs: parseAttrs(a), body }), ''));
  const tags = [...html.matchAll(TAG)].map((m) => ({ name: m[1].toLowerCase(), attrs: parseAttrs(m[2]) }));
  // Scripts and styles were cut out above; their opening tags still count as tags.
  for (const s of scripts) tags.push({ name: 'script', attrs: s.attrs });
  for (const s of styles) tags.push({ name: 'style', attrs: s.attrs });
  return { file, rel: posixRel(file), html, tags, scripts, styles };
}

/** URL path of a built page as the browser sees it: "" for the home page, "cs/download/" for cs/download/index.html, "404.html" as it is. */
const pageUrlPath = (rel) => (rel === 'index.html' ? '' : rel.endsWith('/index.html') ? rel.slice(0, -'index.html'.length) : rel);

/** Where a URL found in `fromRel` points: another origin, outside the base path, or a file of dist (or none). */
function resolveLocal(url, fromRel) {
  let u;
  try { u = new URL(url, `${origin}${basePath}${pageUrlPath(fromRel)}`); } catch { return { invalid: true }; }
  if (u.origin !== origin) return { external: true };
  if (!u.pathname.startsWith(basePath)) return { outside: true };
  const sub = decodeURIComponent(u.pathname.slice(basePath.length));
  const direct = sub === '' || sub.endsWith('/') ? `${sub}index.html` : sub;
  const file = [direct, `${sub}/index.html`].find((c) => existsSync(join(dist, c)) && statSync(join(dist, c)).isFile());
  return { file, fragment: decodeURIComponent(u.hash.slice(1)) };
}

const hasScheme = (url) => /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url);

/** True if a URL would leave the site origin when the browser loads it. data: URLs make no request. */
function isForeign(raw) {
  const url = raw.trim();
  if (url === '' || /^data:/i.test(url) || url.startsWith('#')) return false;
  if (!hasScheme(url)) return false;
  try { return new URL(url, origin).origin !== origin; } catch { return true; }
}

const srcsetUrls = (value) => value.split(',').map((c) => c.trim().split(/\s+/)[0]).filter(Boolean);
const cssUrls = (css) => {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [
    ...[...text.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)].map((m) => m[2]),
    ...[...text.matchAll(/@import\s+(?:url\(\s*)?['"]([^'"]+)['"]/gi)].map((m) => m[1]),
  ];
};
/** Every URL a tag makes the browser fetch (anchors excluded: a link is not a request). */
function requestUrls(tag) {
  const a = tag.attrs;
  const urls = [];
  if (tag.name === 'link' && a.href) urls.push(a.href);
  if (['script', 'img', 'iframe', 'source', 'video', 'audio', 'embed', 'track', 'input'].includes(tag.name) && a.src) urls.push(a.src);
  if (['img', 'source'].includes(tag.name) && a.srcset) urls.push(...srcsetUrls(a.srcset));
  if (tag.name === 'video' && a.poster) urls.push(a.poster);
  if (tag.name === 'object' && a.data) urls.push(a.data);
  if (tag.name === 'form' && a.action) urls.push(a.action);
  if (tag.name === 'meta' && /^refresh$/i.test(a['http-equiv'] ?? '')) urls.push((a.content ?? '').replace(/^[^;]*;\s*(?:url\s*=\s*)?/i, ''));
  return urls;
}

/** A JSON data block (JSON-LD) is never executed, so script-src does not apply to it. */
const isDataScript = (attrs) => /^application\/(?:ld\+)?json$/i.test((attrs.type ?? '').trim());
const NETWORK_API = /\b(?:fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts)|\bimport\s*\(/;

// ---------------------------------------------------------------- load

if (!existsSync(dist)) { console.error(`check-dist: ${dist} does not exist; run the build first`); process.exit(1); }
const files = walk(dist);
const pages = files.filter((f) => f.endsWith('.html')).map(parseHtml);
const stylesheets = files.filter((f) => f.endsWith('.css')).map((file) => ({ rel: posixRel(file), css: readFileSync(file, 'utf8') }));
const scriptFiles = files.filter((f) => /\.m?js$/.test(f)).map((file) => ({ rel: posixRel(file), js: readFileSync(file, 'utf8') }));

const checks = [];
const check = (name, run) => checks.push({ name, run });

// ---------------------------------------------------------------- checks

check('external-requests', () => {
  const problems = [];
  for (const p of pages) {
    for (const tag of p.tags) for (const url of requestUrls(tag)) if (isForeign(url)) problems.push(`${p.rel}: <${tag.name}> loads ${url}`);
    for (const s of p.styles) for (const url of cssUrls(s.body)) if (isForeign(url)) problems.push(`${p.rel}: <style> loads ${url}`);
  }
  for (const s of stylesheets) for (const url of cssUrls(s.css)) if (isForeign(url)) problems.push(`${s.rel}: css loads ${url}`);
  return { problems, summary: `no request leaves ${origin} (${pages.length} pages, ${stylesheets.length} stylesheets)` };
});

check('inline-code', () => {
  // The Content-Security-Policy is script-src 'self'; style-src 'self': inline scripts, styles and handlers would be blocked, so none may exist.
  const problems = [];
  for (const p of pages) {
    for (const s of p.scripts) {
      if (!s.attrs.src && !isDataScript(s.attrs)) problems.push(`${p.rel}: inline <script>`);
      if (s.attrs.src && s.body.trim()) problems.push(`${p.rel}: <script src> with an inline body`);
    }
    if (p.styles.length) problems.push(`${p.rel}: ${p.styles.length} inline <style>`);
    for (const tag of p.tags) {
      if ('style' in tag.attrs && tag.name !== 'style') problems.push(`${p.rel}: style attribute on <${tag.name}>`);
      for (const attr of Object.keys(tag.attrs)) if (/^on[a-z]/.test(attr)) problems.push(`${p.rel}: ${attr} handler on <${tag.name}>`);
      for (const attr of ['href', 'src', 'action', 'formaction']) if (/^\s*javascript:/i.test(tag.attrs[attr] ?? '')) problems.push(`${p.rel}: javascript: URL in <${tag.name}>`);
    }
  }
  return { problems, summary: 'no inline script, style or event handler (JSON-LD data blocks are not code)' };
});

check('network-apis', () => {
  // connect-src is 'none': a script has no business calling fetch or opening a socket, and naming a foreign host is never right.
  const problems = [];
  const scan = (where, js) => {
    if (NETWORK_API.test(js)) problems.push(`${where}: uses a network API (fetch, XMLHttpRequest, sendBeacon, WebSocket, EventSource, import())`);
    for (const m of js.matchAll(/(?:https?:)?\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+[^\s'"`)]*/gi)) if (isForeign(m[0])) problems.push(`${where}: names ${m[0]}`);
  };
  for (const s of scriptFiles) scan(s.rel, s.js);
  for (const p of pages) for (const s of p.scripts) if (!isDataScript(s.attrs)) scan(`${p.rel} (inline script)`, s.body);
  return { problems, summary: `${scriptFiles.length} script file(s) call no network API and name no foreign host` };
});

check('html-lang', () => {
  const problems = [];
  for (const p of pages) {
    const open = /<html\b([^>]*)>/i.exec(p.html);
    const lang = open ? parseAttrs(open[1]).lang : undefined;
    const expected = p.rel.startsWith('cs/') ? 'cs' : 'en';
    if (!lang) problems.push(`${p.rel}: <html> has no lang`);
    else if (lang !== expected) problems.push(`${p.rel}: lang="${lang}", the URL says ${expected}`);
  }
  return { problems, summary: `${pages.length} pages declare the right language` };
});

check('canonical-hreflang', () => {
  const problems = [];
  const url = (path) => `${origin}${basePath}${path}`;
  for (const p of pages) {
    const links = p.tags.filter((t) => t.name === 'link');
    const canonicals = links.filter((l) => /\bcanonical\b/i.test(l.attrs.rel ?? ''));
    const alternates = links.filter((l) => /\balternate\b/i.test(l.attrs.rel ?? '') && l.attrs.hreflang);
    if (p.rel === '404.html') {
      if (canonicals.length || alternates.length) problems.push('404.html: must name no canonical or alternate');
      if (!p.tags.some((t) => t.name === 'meta' && t.attrs.name === 'robots' && /noindex/i.test(t.attrs.content ?? ''))) problems.push('404.html: missing <meta name="robots" content="noindex">');
      continue;
    }
    const path = pageUrlPath(p.rel).replace(/^cs\//, '');
    const own = url(pageUrlPath(p.rel));
    if (canonicals.length !== 1) problems.push(`${p.rel}: ${canonicals.length} canonical links, expected exactly 1`);
    else if (canonicals[0].attrs.href !== own) problems.push(`${p.rel}: canonical is ${canonicals[0].attrs.href}, expected ${own}`);
    const expected = ENGLISH_ONLY.has(path)
      ? { en: url(path), 'x-default': url(path) }
      : { en: url(path), cs: url(`cs/${path}`), 'x-default': url(path) };
    const found = Object.fromEntries(alternates.map((l) => [l.attrs.hreflang, l.attrs.href]));
    if (alternates.length !== Object.keys(expected).length || Object.keys(found).length !== alternates.length || Object.keys(expected).some((l) => !(l in found))) {
      problems.push(`${p.rel}: hreflang set is [${alternates.map((l) => l.attrs.hreflang).join(', ')}], expected exactly [${Object.keys(expected).join(', ')}]`);
    }
    for (const [lang, href] of Object.entries(expected)) if (found[lang] !== undefined && found[lang] !== href) problems.push(`${p.rel}: hreflang ${lang} is ${found[lang]}, expected ${href}`);
  }
  if (!pages.some((p) => p.rel === '404.html')) problems.push('404.html is missing');
  return { problems, summary: `${pages.length} pages carry one canonical link and the right hreflang set (404 is noindex)` };
});

check('internal-links', () => {
  const problems = [];
  const ids = new Map();
  const idsOf = (rel) => {
    if (!ids.has(rel)) ids.set(rel, new Set(pages.find((p) => p.rel === rel)?.tags.map((t) => t.attrs.id).filter(Boolean)));
    return ids.get(rel);
  };
  let count = 0;
  for (const p of pages) {
    for (const tag of p.tags) {
      if (tag.name !== 'a' || tag.attrs.href === undefined) continue;
      const href = tag.attrs.href.trim();
      if (isForeign(href) || (hasScheme(href) && !/^(?:https?:)?\/\//i.test(href))) continue; // another origin, mailto:, tel:
      count++;
      const r = resolveLocal(href === '' ? '.' : href, p.rel);
      if (r.invalid || r.external) continue;
      if (r.outside) problems.push(`${p.rel}: ${href} leaves the base path ${basePath}`);
      else if (!r.file) problems.push(`${p.rel}: ${href} points to a file that is not in dist`);
      else if (r.fragment && r.fragment !== 'top' && r.file.endsWith('.html') && !idsOf(r.file).has(r.fragment)) problems.push(`${p.rel}: ${href} points to #${r.fragment}, which ${r.file} does not define`);
    }
  }
  return { problems, summary: `${count} internal links resolve to a file and anchor in dist` };
});

check('local-assets', () => {
  const problems = [];
  const verify = (from, url, what) => {
    const trimmed = url.trim();
    if (trimmed === '' || trimmed.startsWith('#') || /^data:/i.test(trimmed) || isForeign(trimmed)) return;
    const r = resolveLocal(trimmed, from);
    if (r.invalid || r.external) return;
    if (r.outside) problems.push(`${from}: ${what} ${url} leaves the base path ${basePath}`);
    else if (!r.file) problems.push(`${from}: ${what} ${url} does not exist in dist`);
  };
  for (const p of pages) for (const tag of p.tags) for (const url of requestUrls(tag)) verify(p.rel, url, `<${tag.name}>`);
  for (const s of stylesheets) for (const url of cssUrls(s.css)) verify(s.rel, url, 'css url');
  return { problems, summary: 'every stylesheet, script, image, font and icon a page references exists' };
});

check('headings', () => {
  const problems = [];
  for (const p of pages) {
    for (const m of p.html.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi)) {
      const text = decode(m[2].replace(/<[^>]*>/g, ''));
      if (text.includes('!')) problems.push(`${p.rel}: <h${m[1]}> "${text.trim()}" contains an exclamation mark`);
    }
  }
  return { problems, summary: 'no exclamation mark in an h1, h2 or h3' };
});

check('size-budget', () => {
  let total = 0;
  for (const f of files) {
    const rel = posixRel(f);
    if (BUDGET_EXCLUDED.some((d) => rel.startsWith(d))) continue;
    if (BUDGET_EXTENSIONS.has(extname(rel).toLowerCase())) total += statSync(f).size;
  }
  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  return {
    problems: total > SIZE_BUDGET ? [`HTML, CSS, JS and fonts total ${kb(total)}, over the ${kb(SIZE_BUDGET)} budget`] : [],
    summary: `${kb(total)} of HTML, CSS, JS and fonts (budget ${kb(SIZE_BUDGET)})`,
  };
});

check('robots-sitemap', () => {
  const robots = join(dist, 'robots.txt');
  const sitemap = `${siteUrl}${basePath}sitemap-index.xml`;
  const problems = [];
  if (!existsSync(robots)) return { problems: ['robots.txt is missing from dist'], summary: '' };
  const text = readFileSync(robots, 'utf8');
  if (!/^Sitemap:.*$/m.test(text)) problems.push('robots.txt has no Sitemap line to rewrite');
  else {
    const next = text.replace(/^Sitemap:.*$/m, `Sitemap: ${sitemap}`);
    if (next !== text) writeFileSync(robots, next);
  }
  if (!existsSync(join(dist, 'sitemap-index.xml'))) problems.push('sitemap-index.xml is missing from dist');
  return { problems, summary: `robots.txt names ${sitemap}` };
});

check('cloudflare-files', () => {
  const problems = [];
  for (const name of ['_headers', '_redirects']) {
    const built = join(dist, name);
    const source = join(publicDir, name);
    if (!existsSync(source)) problems.push(`public/${name} is missing`);
    else if (!existsSync(built)) problems.push(`dist/${name} was not copied from public/`);
    else if (!readFileSync(built).equals(readFileSync(source))) problems.push(`dist/${name} differs from public/${name}`);
  }
  if (existsSync(join(dist, '_headers'))) problems.push(...lintHeaders(readFileSync(join(dist, '_headers'), 'utf8')));
  if (existsSync(join(dist, '_redirects'))) problems.push(...lintRedirects(readFileSync(join(dist, '_redirects'), 'utf8')));
  return { problems, summary: '_headers and _redirects copied from public/, syntax valid, CSP strict' };
});

/** The syntax Cloudflare accepts (a path line, then indented "Name: value" lines) plus the policy the site relies on. */
function lintHeaders(text) {
  const problems = [];
  let rules = 0;
  let path = null;
  let csp;
  text.split(/\r?\n/).forEach((line, i) => {
    const at = `_headers line ${i + 1}`;
    if (line.length > 2000) problems.push(`${at}: longer than Cloudflare's 2000 characters`);
    if (line.trim() === '' || line.trim().startsWith('#')) return;
    if (/^\s/.test(line)) {
      if (path === null) problems.push(`${at}: header without a path line above it`);
      else if (!/^\s+[A-Za-z0-9-]+:\s*\S/.test(line)) problems.push(`${at}: expected "  Name: value"`);
      const m = /^\s+Content-Security-Policy:\s*(.*)$/i.exec(line);
      if (m && path === '/*') csp = m[1];
    } else {
      path = line.trim();
      rules++;
      if (!/^(?:\/|https?:\/\/)\S*$/.test(path)) problems.push(`${at}: expected a path starting with /`);
    }
  });
  if (rules > 100) problems.push(`_headers has ${rules} rules, Cloudflare allows 100`);
  if (!csp) problems.push('_headers has no Content-Security-Policy under /*');
  else {
    const directive = (name) => csp.split(';').map((d) => d.trim()).find((d) => d === name || d.startsWith(`${name} `));
    if (/'unsafe-(?:inline|eval)'/.test(csp)) problems.push("CSP contains 'unsafe-inline' or 'unsafe-eval'");
    if (directive('script-src') !== "script-src 'self'") problems.push(`CSP script-src is "${directive('script-src')}", expected 'self' only`);
    if (directive('connect-src') !== "connect-src 'none'") problems.push(`CSP connect-src is "${directive('connect-src')}", expected 'none'`);
    if (!directive('frame-ancestors')) problems.push('CSP has no frame-ancestors');
  }
  return problems;
}

function lintRedirects(text) {
  const problems = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const l = line.trim();
    if (l === '' || l.startsWith('#')) return;
    const parts = l.split(/\s+/);
    if (parts.length < 2 || parts.length > 3 || (parts[2] !== undefined && !/^\d{3}$/.test(parts[2]))) problems.push(`_redirects line ${i + 1}: expected "source destination [status]"`);
  });
  return problems;
}

// ---------------------------------------------------------------- run

let failed = 0;
console.log(`check-dist: ${dist} (origin ${origin}, base ${basePath})`);
for (const { name, run } of checks) {
  let result;
  try { result = run(); } catch (error) { result = { problems: [`check crashed: ${error.stack ?? error}`], summary: '' }; }
  if (result.problems.length === 0) console.log(`PASS ${name}: ${result.summary}`);
  else {
    failed++;
    console.log(`FAIL ${name}: ${result.problems.length} problem(s)`);
    for (const problem of result.problems.slice(0, 25)) console.log(`     ${problem}`);
    if (result.problems.length > 25) console.log(`     ... and ${result.problems.length - 25} more`);
  }
}
console.log(failed === 0 ? `check-dist: all ${checks.length} checks passed` : `check-dist: ${failed} of ${checks.length} checks failed`);
process.exit(failed === 0 ? 0 : 1);
