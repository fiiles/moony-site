// Each check of scripts/check-dist.mjs must fire on a page that breaks its rule, and stay quiet on a good site.
// The tests write a small site to a temp folder, run the real script against it (DIST_DIR, PUBLIC_DIR, SITE_URL, BASE_PATH) and read its exit code and output.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = resolve(dirname(fileURLToPath(import.meta.url)), 'check-dist.mjs');
// The script reads the real registry, so the fixture follows it: the first entry is English at the root, every other one lives under /<code>/.
const registry = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/locales.json'), 'utf8'));
const htmlLangOf = (code) => registry.find((l) => l.code === code).htmlLang;
const nonDefault = registry.slice(1).map((l) => l.code);
// Tests that need one locale folder take the first registered one; none of them depends on its code.
const first = nonDefault[0];
const LOCALE_PAGES = ['', 'download/', 'help/', 'ai-integration/', 'site-privacy/', 'support/'];

const HEADERS = `/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'
  X-Content-Type-Options: nosniff
/fonts/*
  Cache-Control: public, max-age=31536000, immutable
`;
const REDIRECTS = 'https://www.example.test/* https://example.test/:splat 301\n';

/** The language menu every page carries: one link per registry locale, in registry order. */
const langMenu = (base) => `<details class="lang-menu"><summary>EN</summary>${registry.map((l) => `<a data-lang-choice="${l.code}" href="#">${l.native}</a>`).join('')}</details>`;

/** The script every page loads first. `auto` is set on indexed pages of the default locale that exist in every language. */
const langScript = (base, auto = false) => `<script src="${base}js/lang.js" data-locales="${nonDefault.join(',')}" data-default="en" data-base="${base}"${auto ? ' data-auto' : ''}></script>`;

/** A page that follows every rule. `extra` goes into the head, `body` replaces the default body. */
function page({ base, locale = 'en', path = '', englishOnly = false, extra = '', body, lang = locale, withMenu = true, script = langScript(base, locale === 'en' && !englishOnly) }) {
  const url = (p) => `https://example.test${base}${p}`;
  const own = url(locale === 'en' ? path : `${locale}/${path}`);
  const languages = englishOnly ? [registry[0]] : registry;
  const alternates = [...languages.map((l) => `<link rel="alternate" hreflang="${l.htmlLang}" href="${url(l.code === 'en' ? path : `${l.code}/${path}`)}">`), `<link rel="alternate" hreflang="x-default" href="${url(path)}">`].join('');
  const menu = langMenu(base);
  return `<!doctype html><html${lang === null ? '' : ` lang="${lang === locale ? htmlLangOf(locale) : lang}"`}><head><meta charset="utf-8">${script}<title>Page</title>
<link rel="canonical" href="${own}">${alternates}
<link rel="stylesheet" href="${base}styles/site.css"><script type="application/ld+json">{"@context":"https://schema.org","url":"https://github.com/x/y"}</script>
${extra}</head><body>${withMenu ? menu : ''}${body ?? `<h1>Plain heading</h1><p>Surprise!</p><a href="${base}download/#install">Download</a> <a href="https://github.com/x/y">Source</a> <a href="mailto:a@b.test">Mail</a> <a href="#top">Top</a><main id="top"><h2 id="x">Section</h2></main><img src="${base}screenshots/a.png" alt=""><script src="${base}js/os.js" defer></script>`}</body></html>`;
}

const downloadPageBody = (base) => `<h1>Download</h1><h2 id="install">Install</h2><a href="${base}">Home</a>`;

/** Writes a good site into a fresh folder and returns its paths together with a way to change files before the run. */
function site(base = '/') {
  const root = mkdtempSync(join(tmpdir(), 'check-dist-'));
  const dist = join(root, 'dist');
  const publicDir = join(root, 'public');
  const put = (file, content) => { mkdirSync(dirname(join(dist, file)), { recursive: true }); writeFileSync(join(dist, file), content); };
  const downloadBody = downloadPageBody(base);
  put('index.html', page({ base }));
  for (const path of LOCALE_PAGES.slice(1)) put(`${path}index.html`, page({ base, path, body: path === 'download/' ? downloadBody : '<h1>Page</h1>' }));
  for (const code of nonDefault) {
    for (const path of LOCALE_PAGES) put(`${code}/${path}index.html`, page({ base, locale: code, path, body: path === 'download/' ? downloadBody : '<h1>Page</h1>' }));
  }
  put('privacy/index.html', page({ base, path: 'privacy/', englishOnly: true, body: '<h1>Privacy</h1>' }));
  put('404.html', `<!doctype html><html lang="en"><head><meta charset="utf-8">${langScript(base)}<meta name="robots" content="noindex"><title>404</title></head><body>${langMenu(base)}<h1>Gone</h1></body></html>`);
  put('styles/site.css', '@font-face { src: url(../fonts/f.woff2) format("woff2"); } .a { background: url(data:image/png;base64,AAAA); }');
  put('fonts/f.woff2', 'font');
  put('js/lang.js', '(function () { document.title = "y"; })();');
  put('js/os.js', '(function () { document.title = "x"; })();');
  put('screenshots/a.png', 'x'.repeat(900 * 1024)); // images are outside the size budget
  put('robots.txt', 'User-agent: *\nAllow: /\nSitemap: https://moonyfinance.com/sitemap-index.xml\n');
  put('sitemap-index.xml', '<sitemapindex/>');
  put('_headers', HEADERS);
  put('_redirects', REDIRECTS);
  mkdirSync(publicDir);
  writeFileSync(join(publicDir, '_headers'), HEADERS);
  writeFileSync(join(publicDir, '_redirects'), REDIRECTS);
  return { root, dist, publicDir, put, base };
}

function run(s, { base = s.base, origin = 'https://example.test', env = {} } = {}) {
  const result = spawnSync(process.execPath, [script], {
    env: { ...process.env, DIST_DIR: s.dist, PUBLIC_DIR: s.publicDir, SITE_URL: origin, BASE_PATH: base, ...env },
    encoding: 'utf8',
  });
  return { status: result.status, out: result.stdout + result.stderr };
}

/** Runs the check on a site changed by `mutate` and asserts that `name` fails, and nothing else but the checks in `also` (one defect can break two rules). */
function assertFires(name, mutate, { base = '/', also = [] } = {}) {
  const s = site(base);
  try {
    mutate(s);
    const r = run(s);
    assert.equal(r.status, 1, `expected exit code 1\n${r.out}`);
    const failing = r.out.split('\n').filter((l) => l.startsWith('FAIL ')).map((l) => l.split(':')[0].slice(5));
    assert.deepEqual(failing.sort(), [name, ...also].sort(), r.out);
  } finally {
    rmSync(s.root, { recursive: true, force: true });
  }
}

const pageWith = (s, extra, body) => s.put('index.html', page({ base: s.base, extra, body }));

test('a good site passes every check and robots.txt gets the configured sitemap', () => {
  const s = site();
  try {
    const r = run(s);
    assert.equal(r.status, 0, r.out);
    assert.equal((r.out.match(/^PASS /gm) ?? []).length, 15, r.out);
    assert.match(readFileSync(join(s.dist, 'robots.txt'), 'utf8'), /^Sitemap: https:\/\/example\.test\/sitemap-index\.xml$/m);
  } finally {
    rmSync(s.root, { recursive: true, force: true });
  }
});

test('a good site under a base path passes, and robots.txt names the base path', () => {
  const s = site('/preview/');
  try {
    const r = run(s);
    assert.equal(r.status, 0, r.out);
    assert.match(readFileSync(join(s.dist, 'robots.txt'), 'utf8'), /^Sitemap: https:\/\/example\.test\/preview\/sitemap-index\.xml$/m);
  } finally {
    rmSync(s.root, { recursive: true, force: true });
  }
});

// ---- language script

const withoutScript = (s, file, options) => s.put(file, page({ base: s.base, script: '', ...options }));

test('language-script fires on a page that does not load the script', () => {
  assertFires('language-script', (s) => withoutScript(s, 'download/index.html', { path: 'download/', body: downloadPageBody(s.base) }));
  assertFires('language-script', (s) => withoutScript(s, `${nonDefault[0]}/index.html`, { locale: nonDefault[0] }));
});

test('language-script fires on a page that loads the script twice', () => {
  assertFires('language-script', (s) => s.put('index.html', page({ base: s.base, script: langScript(s.base, true) + langScript(s.base, true) })));
});

test('language-script fires when the script comes after a stylesheet', () => {
  assertFires('language-script', (s) => s.put('index.html', page({ base: s.base, script: '<link rel="stylesheet" href="' + s.base + 'styles/site.css">' + langScript(s.base, true) })));
  assertFires('language-script', (s) => s.put('index.html', page({ base: s.base, script: '', extra: '', body: undefined }).replace('</head>', `${langScript(s.base, true)}</head>`)));
});

test('language-script fires on a deferred, async or module script', () => {
  for (const attr of ['defer', 'async', 'type="module"']) {
    assertFires('language-script', (s) => s.put('index.html', page({ base: s.base, script: langScript(s.base, true).replace('<script ', `<script ${attr} `) })));
  }
});

test('language-script fires on a wrong data-locales, data-default or data-base', () => {
  assertFires('language-script', (s) => s.put('index.html', page({ base: s.base, script: langScript(s.base, true).replace(/data-locales="[^"]*"/, `data-locales="${first},xx"`) })));
  assertFires('language-script', (s) => s.put('index.html', page({ base: s.base, script: langScript(s.base, true).replace('data-default="en"', `data-default="${first}"`) })));
  assertFires('language-script', (s) => s.put('index.html', page({ base: s.base, script: langScript(s.base, true).replace(/data-base="[^"]*"/, 'data-base="/x/"') })));
});

test('language-script fires when data-auto is missing from an indexed default-locale page', () => {
  assertFires('language-script', (s) => s.put('index.html', page({ base: s.base, script: langScript(s.base, false) })));
});

test('language-script fires when data-auto is set on a locale page, an English-only page or the 404 page', () => {
  assertFires('language-script', (s) => s.put(`${nonDefault[0]}/index.html`, page({ base: s.base, locale: nonDefault[0], script: langScript(s.base, true) })));
  assertFires('language-script', (s) => s.put('privacy/index.html', page({ base: s.base, path: 'privacy/', englishOnly: true, body: '<h1>Privacy</h1>', script: langScript(s.base, true) })));
  assertFires('language-script', (s) => s.put('404.html', `<!doctype html><html lang="en"><head><meta charset="utf-8">${langScript(s.base, true)}<meta name="robots" content="noindex"><title>404</title></head><body>${langMenu(s.base)}<h1>Gone</h1></body></html>`));
});

// ---- language menu

test('language-menu fires on a page without the menu', () => {
  assertFires('language-menu', (s) => s.put('download/index.html', page({ base: s.base, path: 'download/', body: downloadPageBody(s.base), withMenu: false })));
});

test('language-menu fires on a 404 page without the menu', () => {
  assertFires('language-menu', (s) => s.put('404.html', `<!doctype html><html lang="en"><head><meta charset="utf-8">${langScript(s.base)}<meta name="robots" content="noindex"><title>404</title></head><body><h1>Gone</h1></body></html>`));
});

test('language-menu fires on a menu that misses a language or breaks the order', () => {
  const menu = (codes) => `<details class="lang-menu"><summary>EN</summary>${codes.map((c) => `<a data-lang-choice="${c}" href="/">x</a>`).join('')}</details>`;
  assertFires('language-menu', (s) => pageWith(s, '', `${menu(registry.slice(1).map((l) => l.code))}<h1>Home</h1>`));
  assertFires('language-menu', (s) => pageWith(s, '', `${menu(registry.map((l) => l.code).reverse())}<h1>Home</h1>`));
});

test('language-menu fires on a page with two menus', () => {
  assertFires('language-menu', (s) => {
    const codes = registry.map((l) => l.code);
    const menu = `<details class="lang-menu">${codes.map((c) => `<a data-lang-choice="${c}" href="/">x</a>`).join('')}</details>`;
    pageWith(s, '', `${menu}${menu}<h1>Home</h1>`);
  });
});

test('a missing dist folder fails', () => {
  const r = spawnSync(process.execPath, [script], { env: { ...process.env, DIST_DIR: join(tmpdir(), 'no-such-dist-folder') }, encoding: 'utf8' });
  assert.equal(r.status, 1);
});

// ---- external requests

const external = {
  'a script from another host': '<script src="https://cdn.example.org/a.js"></script>',
  'a stylesheet from another host': '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">',
  'a scheme-relative image': '<img src="//evil.test/pixel.gif" alt="">',
  'an iframe': '<iframe src="https://www.youtube.com/embed/x"></iframe>',
  'a font preload from a CDN': '<link rel="preload" as="font" href="https://fonts.gstatic.com/a.woff2" crossorigin>',
  'a srcset candidate': '<img src="/screenshots/a.png" srcset="/screenshots/a.png 1x, https://cdn.example.org/a@2x.png 2x" alt="">',
  'a meta refresh to another site': '<meta http-equiv="refresh" content="0; url=https://example.org/">',
  'a canonical link to another host': '<link rel="canonical" href="https://example.org/">',
};
for (const [label, markup] of Object.entries(external)) {
  test(`external-requests fires on ${label}`, () => {
    // A canonical link to another host is also a second canonical link on that page.
    assertFires('external-requests', (s) => pageWith(s, markup), { also: label === 'a canonical link to another host' ? ['canonical-hreflang'] : [] });
  });
}

test('external-requests fires on a url() to another host in a stylesheet', () => {
  assertFires('external-requests', (s) => s.put('styles/site.css', '@font-face { src: url("https://fonts.gstatic.com/a.woff2"); }'));
});

test('external-requests fires on an @import from another host', () => {
  assertFires('external-requests', (s) => s.put('styles/site.css', '@import "https://fonts.googleapis.com/css2?family=Inter";'));
});

test('anchors to other hosts and mailto links are fine (the good site has them)', () => {
  const s = site();
  try { assert.equal(run(s).status, 0); } finally { rmSync(s.root, { recursive: true, force: true }); }
});

// ---- inline code and network APIs (the Content-Security-Policy)

test('inline-code fires on an inline script', () => {
  assertFires('inline-code', (s) => pageWith(s, '<script>document.title = "x"</script>'));
});

test('inline-code fires on an inline style element, a style attribute and an event handler', () => {
  assertFires('inline-code', (s) => pageWith(s, '<style>body{margin:0}</style>'));
  assertFires('inline-code', (s) => pageWith(s, '', '<h1>Plain</h1><svg style="position:absolute"></svg>'));
  assertFires('inline-code', (s) => pageWith(s, '', '<h1>Plain</h1><button onclick="go()">x</button>'));
  assertFires('inline-code', (s) => pageWith(s, '', '<h1>Plain</h1><a href="javascript:void(0)">x</a>'));
});

test('network-apis fires on fetch in a script file and on a foreign host named in one', () => {
  assertFires('network-apis', (s) => s.put('js/os.js', 'fetch("/api/x")'));
  assertFires('network-apis', (s) => s.put('js/os.js', 'var u = "https://tracker.example.org/p";'));
  assertFires('network-apis', (s) => s.put('js/os.js', 'new XMLHttpRequest();'));
  assertFires('network-apis', (s) => s.put('js/os.js', 'navigator.sendBeacon("/x");'));
});

// ---- language, canonical, hreflang

test('html-lang fires on an <html> without lang and on a lang that contradicts the URL', () => {
  assertFires('html-lang', (s) => s.put('index.html', page({ base: s.base, lang: null })));
  assertFires('html-lang', (s) => s.put(`${first}/index.html`, page({ base: s.base, locale: first, lang: 'en' })));
});

test('html-lang expects the registry htmlLang for a locale folder', () => {
  const s = site();
  try {
    s.put(`${first}/index.html`, page({ base: s.base, locale: first }).replace(/<html lang="[^"]*"/, `<html lang="${first}-XX"`));
    const r = run(s);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, new RegExp(`${first}/index\\.html: lang="${first}-XX", the URL says ${first}`), r.out);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test('canonical-hreflang fires on a missing canonical link', () => {
  assertFires('canonical-hreflang', (s) => s.put('index.html', page({ base: s.base }).replace(/<link rel="canonical"[^>]*>/, '')));
});

test('canonical-hreflang fires on two canonical links', () => {
  assertFires('canonical-hreflang', (s) => s.put('index.html', page({ base: s.base, extra: `<link rel="canonical" href="https://example.test${s.base}">` })));
});

test('canonical-hreflang fires on a canonical that is not the page itself', () => {
  assertFires('canonical-hreflang', (s) => s.put('download/index.html', page({ base: s.base, path: 'download/', body: downloadPageBody(s.base) }).replace(/(<link rel="canonical" href=")[^"]*/, `$1https://example.test${s.base}`)));
});

test('canonical-hreflang fires when x-default is missing', () => {
  assertFires('canonical-hreflang', (s) => s.put('index.html', page({ base: s.base }).replace(/<link rel="alternate" hreflang="x-default"[^>]*>/, '')));
});

test('canonical-hreflang fires on an hreflang that points at the wrong URL', () => {
  // The right set of languages, but the first non-English alternate leads to a page that exists (the English download page) and is not that locale's home page.
  const wrongCs = (s) => s.put('index.html', page({ base: s.base }).replace(new RegExp(`(hreflang="${htmlLangOf(first)}" href=")[^"]*`), `$1https://example.test${s.base}download/`));
  assertFires('canonical-hreflang', wrongCs);
  assertFires('canonical-hreflang', (s) => s.put('index.html', page({ base: s.base }).replace(/(hreflang="x-default" href=")[^"]*/, `$1https://example.test${s.base}${first}/`)));
  const s = site();
  try {
    wrongCs(s);
    const r = run(s);
    assert.match(r.out, new RegExp(`index\\.html: hreflang ${htmlLangOf(first)} is https://example\\.test/download/, expected https://example\\.test/${first}/`), r.out);
  } finally {
    rmSync(s.root, { recursive: true, force: true });
  }
});

test('canonical-hreflang fires on an hreflang for a language that is not in the registry', () => {
  assertFires('canonical-hreflang', (s) => s.put('index.html', page({ base: s.base }).replace('<link rel="alternate" hreflang="x-default"', `<link rel="alternate" hreflang="xx" href="https://example.test${s.base}download/"><link rel="alternate" hreflang="x-default"`)));
});

test('canonical-hreflang fires on a locale alternate for an English-only page', () => {
  // The locale alternate also points at a page that was never built.
  assertFires('canonical-hreflang', (s) => s.put('privacy/index.html', page({ base: s.base, path: 'privacy/', body: '<h1>Privacy</h1>', script: langScript(s.base) })), { also: ['local-assets'] });
});

test('canonical-hreflang fires on a normal page that carries only en and x-default', () => {
  assertFires('canonical-hreflang', (s) => s.put('download/index.html', page({ base: s.base, path: 'download/', englishOnly: true, body: downloadPageBody(s.base), script: langScript(s.base, true) })));
});

test('canonical-hreflang fires when 404.html carries a canonical link or lacks noindex, or is missing', () => {
  assertFires('canonical-hreflang', (s) => s.put('404.html', `<!doctype html><html lang="en"><head>${langScript(s.base)}<link rel="canonical" href="https://example.test/"><meta name="robots" content="noindex"></head><body>${langMenu(s.base)}<h1>x</h1></body></html>`));
  assertFires('canonical-hreflang', (s) => s.put('404.html', `<!doctype html><html lang="en"><head>${langScript(s.base, true)}<title>404</title></head><body>${langMenu(s.base)}<h1>x</h1></body></html>`));
  assertFires('canonical-hreflang', (s) => rmSync(join(s.dist, '404.html')));
});

// ---- links and assets

test('internal-links fires on a link to a page that is not built, with or without a trailing slash', () => {
  assertFires('internal-links', (s) => pageWith(s, '', '<h1>Plain</h1><a href="/nope/">x</a>'));
  assertFires('internal-links', (s) => pageWith(s, '', '<h1>Plain</h1><a href="nope.html">x</a>'));
});

test('internal-links fires on a link to an anchor the target does not define', () => {
  assertFires('internal-links', (s) => pageWith(s, '', `<h1>Plain</h1><a href="${s.base}download/#missing">x</a>`));
  assertFires('internal-links', (s) => pageWith(s, '', '<h1>Plain</h1><a href="#missing">x</a>'));
});

test('internal-links fires on a link that leaves the base path', () => {
  assertFires('internal-links', (s) => pageWith(s, '', '<h1>Plain</h1><a href="/elsewhere/">x</a>'), { base: '/preview/' });
});

test('internal-links accepts a relative link and a link with the full site address', () => {
  const s = site();
  try {
    pageWith(s, '', `<h1>Plain</h1><a href="download/">x</a> <a href="https://example.test/${first}/download/?a=1#install">y</a>`);
    s.put(`${first}/download/index.html`, page({ base: '/', locale: first, path: 'download/', body: '<h1>D</h1><h2 id="install">I</h2><a href="../">up</a>' }));
    assert.equal(run(s).status, 0, run(s).out);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test('local-assets fires on a missing image, script, stylesheet, font and css url', () => {
  assertFires('local-assets', (s) => pageWith(s, '', '<h1>Plain</h1><img src="/screenshots/missing.png" alt="">'));
  assertFires('local-assets', (s) => pageWith(s, '<script src="/js/missing.js" defer></script>'));
  assertFires('local-assets', (s) => pageWith(s, '<link rel="stylesheet" href="/styles/missing.css">'));
  assertFires('local-assets', (s) => pageWith(s, '<link rel="preload" as="font" href="/fonts/missing.woff2" crossorigin>'));
  assertFires('local-assets', (s) => s.put('styles/site.css', '@font-face { src: url(../fonts/missing.woff2); }'));
});

// ---- headings, size, robots, Cloudflare files

test('headings fires on an exclamation mark in an h1, h2 or h3, also inside nested markup and as an entity', () => {
  assertFires('headings', (s) => pageWith(s, '', '<h1>Hello!</h1>'));
  assertFires('headings', (s) => pageWith(s, '', '<h1>Fine</h1><h2>Stop <em>now!</em></h2>'));
  assertFires('headings', (s) => pageWith(s, '', '<h1>Fine</h1><h3 class="x">Wow&excl;</h3>'));
  assertFires('headings', (s) => pageWith(s, '', '<h1>Fine</h1><h3>Wow&#33;</h3>'));
});

test('an exclamation mark in a paragraph or an h4 is fine (the good site has one)', () => {
  const s = site();
  try {
    pageWith(s, '', '<h1>Fine</h1><h4>Careful!</h4><p>Surprise!</p>');
    assert.equal(run(s).status, 0, run(s).out);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test('size-budget fires over 192 KB of shared CSS, JS and fonts, but ignores screenshots and social images', () => {
  assertFires('size-budget', (s) => s.put('styles/big.css', '/* ' + 'x'.repeat(200 * 1024) + ' */'));
  assertFires('size-budget', (s) => s.put('fonts/big.woff2', 'x'.repeat(200 * 1024)));
  const s = site();
  try {
    s.put('og/social.png', 'x'.repeat(2 * 1024 * 1024));
    assert.equal(run(s).status, 0, run(s).out);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test('size-budget fires when the English root HTML is over 320 KB, and names the group', () => {
  const big = (s) => s.put('big/index.html', '<!doctype html><html lang="en"><body>' + 'x'.repeat(330 * 1024) + '</body></html>');
  // The big page is not a normal page: it lacks canonical and hreflang links.
  const s = site();
  try {
    big(s);
    const r = run(s);
    assert.match(r.out, /FAIL size-budget[\s\S]*English HTML totals/, r.out);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test('size-budget fires when one locale folder is over 160 KB, and names the locale', () => {
  const s = site();
  try {
    const code = first;
    s.put(`${code}/help/index.html`, page({ base: s.base, locale: code, path: 'help/', body: '<h1>Help</h1><p>' + 'x'.repeat(170 * 1024) + '</p>' }));
    const r = run(s);
    assert.equal(r.status, 1, r.out);
    assert.deepEqual(r.out.split('\n').filter((l) => l.startsWith('FAIL ')).map((l) => l.split(':')[0].slice(5)), ['size-budget'], r.out);
    assert.match(r.out, new RegExp(`${code} HTML totals`), r.out);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test('the size-budget summary prints all three groups and names every non-default locale with a size', () => {
  const s = site();
  try {
    const r = run(s);
    const locales = nonDefault.map((code) => `${code} [\\d.]+ KB`).join(', ');
    assert.match(r.out, new RegExp(`PASS size-budget: English HTML [\\d.]+ KB \\(budget 320\\.0 KB\\); per locale: ${locales} \\(budget 160\\.0 KB each\\); shared CSS, JS and fonts [\\d.]+ KB \\(budget 192\\.0 KB\\)`), r.out);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

// ---- release links

test('release-links fires on a page that carries the App Store placeholder', () => {
  assertFires('release-links', (s) => pageWith(s, '', '<h1>Home</h1><a href="https://apps.apple.com/app/APP_STORE_ID_PLACEHOLDER">App Store</a>'));
  // An attribute is not text: the guard reads the page source, so this cannot slip through.
  assertFires('release-links', (s) => pageWith(s, '', '<h1>Home</h1><a data-x="APP_STORE_ID_PLACEHOLDER" href="#">x</a>'));
});

test('release-links passes with MOONY_PRERELEASE=1', () => {
  const s = site();
  try {
    pageWith(s, '', '<h1>Home</h1><a href="https://apps.apple.com/app/APP_STORE_ID_PLACEHOLDER">App Store</a>');
    const r = run(s, { env: { MOONY_PRERELEASE: '1' } });
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /PASS release-links: pre-release: the App Store placeholder is allowed \(\d+ pages\)/, r.out);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test('locale-pages fires when a locale lacks one of its six pages', () => {
  for (const path of LOCALE_PAGES) {
    const code = nonDefault[0];
    // The English page's alternate link now points at a file that is gone, so local-assets fires too.
    assertFires('locale-pages', (s) => rmSync(join(s.dist, `${code}/${path}index.html`)), { also: ['local-assets'] });
  }
});

test('robots-sitemap fires on a robots.txt without a Sitemap line, a missing robots.txt and a missing sitemap', () => {
  assertFires('robots-sitemap', (s) => s.put('robots.txt', 'User-agent: *\nAllow: /\n'));
  assertFires('robots-sitemap', (s) => rmSync(join(s.dist, 'robots.txt')));
  assertFires('robots-sitemap', (s) => rmSync(join(s.dist, 'sitemap-index.xml')));
});

test('cloudflare-files fires when _headers or _redirects was not copied, or differs from public/', () => {
  assertFires('cloudflare-files', (s) => rmSync(join(s.dist, '_headers')));
  assertFires('cloudflare-files', (s) => rmSync(join(s.dist, '_redirects')));
  assertFires('cloudflare-files', (s) => s.put('_redirects', REDIRECTS + '/a /b 302\n'));
  assertFires('cloudflare-files', (s) => rmSync(join(s.publicDir, '_headers')));
});

test('cloudflare-files fires on a weakened Content-Security-Policy', () => {
  const weak = (from, to) => (s) => {
    const changed = HEADERS.replace(from, to);
    s.put('_headers', changed);
    writeFileSync(join(s.publicDir, '_headers'), changed);
  };
  assertFires('cloudflare-files', weak("script-src 'self'", "script-src 'self' 'unsafe-inline'"));
  assertFires('cloudflare-files', weak("script-src 'self'", "script-src 'self' https://cdn.example.org"));
  assertFires('cloudflare-files', weak("connect-src 'none'", "connect-src 'self'"));
  assertFires('cloudflare-files', weak(/ {2}Content-Security-Policy:.*\n/, ''));
  assertFires('cloudflare-files', weak(' frame-ancestors \'none\';', ''));
});

test('cloudflare-files fires on _headers syntax Cloudflare would not accept', () => {
  const rewrite = (content) => (s) => { s.put('_headers', content); writeFileSync(join(s.publicDir, '_headers'), content); };
  assertFires('cloudflare-files', rewrite(HEADERS.replace('/fonts/*', 'fonts/*')));
  assertFires('cloudflare-files', rewrite(HEADERS.replace('  Cache-Control: public', 'Cache-Control: public')));
  assertFires('cloudflare-files', rewrite(HEADERS.replace('X-Content-Type-Options: nosniff', 'X-Content-Type-Options nosniff')));
  assertFires('cloudflare-files', rewrite('  X-Orphan: header\n' + HEADERS));
});

test('cloudflare-files fires on a _redirects line without a destination or with a bad status', () => {
  const rewrite = (content) => (s) => { s.put('_redirects', content); writeFileSync(join(s.publicDir, '_redirects'), content); };
  assertFires('cloudflare-files', rewrite('/only-a-source\n'));
  assertFires('cloudflare-files', rewrite('/a /b moved\n'));
});
