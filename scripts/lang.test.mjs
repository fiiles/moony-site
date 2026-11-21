// public/js/lang.js decides, before first paint, whether an English page should move to the visitor's language.
// The script runs here in node:vm against fakes of document, navigator, localStorage and location; every case checks the argument given to location.replace, or that there was none.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/js/lang.js', import.meta.url), 'utf8');
const LOCALES = 'cs,de,es,it,nb,pl,sv,ja,zh';

/** Runs the script once. `languages` / `language` feed navigator; `stored` is the saved choice (undefined: none, 'throws': storage is unusable). */
function visit({ languages, language, stored, auto = true, base = '/', pathname = '/', search = '', hash = '', referrer = '', noStorage = false, noCurrentScript = false } = {}) {
  const replaced = [];
  const listeners = {};
  const saved = {};
  const location = { pathname, search, hash, origin: 'https://example.test', replace: (url) => replaced.push(url) };
  const dataset = { locales: LOCALES, default: 'en', base };
  if (auto) dataset.auto = '';
  const localStorage = {
    getItem(key) { if (stored === 'throws') throw new Error('blocked'); return stored === undefined ? null : (key === 'moony-lang' ? stored : null); },
    setItem(key, value) { if (stored === 'throws') throw new Error('blocked'); saved[key] = value; },
  };
  const menus = [{ open: true, removeAttribute(name) { if (name === 'open') this.open = false; } }];
  const document = {
    currentScript: noCurrentScript ? null : { dataset },
    referrer,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    querySelectorAll(selector) { return selector === 'details.lang-menu[open]' ? menus.filter((m) => m.open) : []; },
  };
  const navigator = {};
  if (languages !== undefined) navigator.languages = languages;
  if (language !== undefined) navigator.language = language;
  const context = { document, navigator, location };
  if (!noStorage) context.localStorage = localStorage;
  vm.runInNewContext(source, context);
  const fire = (type, event) => (listeners[type] || []).forEach((fn) => fn(event));
  return { replaced, saved, menus, fire, listeners };
}

const cases = [
  [['de-AT', 'en'], {}, '/de/'],
  [['en-US', 'de'], {}, undefined],
  [['fr-FR', 'pl'], {}, '/pl/'],
  [['fr'], {}, undefined],
  [[], {}, undefined],
  [['nn-NO'], {}, '/nb/'],
  [['no'], {}, '/nb/'],
  [['zh-TW'], {}, '/zh/'],
  [['zh-Hant-HK'], {}, '/zh/'],
  [['JA-jp'], {}, '/ja/'],
  [['pl'], { pathname: '/download/', search: '?x=1', hash: '#mac' }, '/pl/download/?x=1#mac'],
  [['sv'], { base: '/preview/', pathname: '/preview/help/' }, '/preview/sv/help/'],
  [['de'], { stored: 'en' }, undefined],
  [['de'], { stored: 'sv' }, '/sv/'],
  [['de'], { stored: 'xx' }, '/de/'],
  [['de'], { auto: false }, undefined],
  [['de'], { stored: 'throws', referrer: 'https://example.test/download/' }, undefined],
  [['de'], { stored: 'throws', referrer: '' }, '/de/'],
  [['de'], { stored: 'throws', referrer: 'https://other.test/' }, '/de/'],
];
for (const [languages, options, expected] of cases) {
  const label = `${JSON.stringify(languages)} ${JSON.stringify(options)} -> ${expected ?? 'no redirect'}`;
  test(label, () => {
    const { replaced } = visit({ languages, ...options });
    assert.deepEqual(replaced, expected === undefined ? [] : [expected]);
  });
}

test('no languages and no language: no redirect and no throw', () => {
  assert.deepEqual(visit({}).replaced, []);
});

test('only navigator.language is available: it is used', () => {
  assert.deepEqual(visit({ language: 'it-IT' }).replaced, ['/it/']);
});

test('a stored choice wins over the browser languages and a same-origin referrer does not matter when storage works', () => {
  assert.deepEqual(visit({ languages: ['de'], stored: 'it', referrer: 'https://example.test/' }).replaced, ['/it/']);
});

test('a missing localStorage object, a missing currentScript: no throw, no redirect', () => {
  assert.deepEqual(visit({ languages: ['de'], noStorage: true, referrer: 'https://example.test/' }).replaced, []);
  assert.deepEqual(visit({ languages: ['de'], noCurrentScript: true }).replaced, []);
});

test('a path outside the base is never redirected', () => {
  assert.deepEqual(visit({ languages: ['de'], base: '/preview/', pathname: '/other/' }).replaced, []);
});

test('a page that already lives in a locale folder is never redirected', () => {
  assert.deepEqual(visit({ languages: ['de'], pathname: '/cs/download/' }).replaced, []);
});

function click(target) { return { target }; }
const link = (value) => ({ closest: (s) => (s === 'a[data-lang-choice]' ? { getAttribute: () => value } : null) });

test('a click on a language link stores the choice', () => {
  const v = visit({ languages: ['en'] });
  v.fire('DOMContentLoaded');
  v.fire('click', click(link('en')));
  assert.equal(v.saved['moony-lang'], 'en');
  v.fire('click', click(link('cs')));
  assert.equal(v.saved['moony-lang'], 'cs');
});

test('a click on a language link does not throw when storage throws', () => {
  const v = visit({ languages: ['en'], stored: 'throws' });
  v.fire('DOMContentLoaded');
  assert.doesNotThrow(() => v.fire('click', click(link('de'))));
});

test('a click outside the language menu closes it; a click inside does not', () => {
  const v = visit({ languages: ['en'] });
  v.fire('DOMContentLoaded');
  v.fire('click', click({ closest: (s) => (s === 'details.lang-menu' ? {} : null) }));
  assert.equal(v.menus[0].open, true);
  v.fire('click', click({ closest: () => null }));
  assert.equal(v.menus[0].open, false);
});

test('Escape closes the menu, other keys do not', () => {
  const v = visit({ languages: ['en'] });
  v.fire('DOMContentLoaded');
  v.fire('keydown', { key: 'a' });
  assert.equal(v.menus[0].open, true);
  v.fire('keydown', { key: 'Escape' });
  assert.equal(v.menus[0].open, false);
});
