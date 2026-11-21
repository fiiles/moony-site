import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const i18nDir = resolve(here, '../src/i18n');
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const registry = readJson(resolve(here, '../src/locales.json'));
const load = (l) => readJson(resolve(i18nDir, `${l}.json`));
/** Flatten to [dotted key, value]; arrays are flattened by index (`features.overview.bullets.0`). */
const flatten = (o, p = '') => Object.entries(o).flatMap(([k, v]) => typeof v === 'object' && v !== null ? flatten(v, `${p}${k}.`) : [[`${p}${k}`, v]]);

/** Dictionary codes that exist as files but are not registered yet (a language is translated before it goes live). Empty while every dictionary is live. */
const PENDING = [];

// Every dictionary file present is checked, so a translation is verified before it is registered.
const codes = readdirSync(i18nDir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -'.json'.length)).sort();
const en = new Map(flatten(load('en')));
const others = codes.filter((c) => c !== 'en');
const entries = (code) => new Map(flatten(load(code)));
const tokens = (v) => [...String(v).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const targets = (v) => [...String(v).matchAll(/\]\(([^)]*)\)/g)].map((m) => m[1]).sort();

test('every registered locale has a dictionary and every dictionary is registered or listed as pending', () => {
  const registered = registry.map((r) => r.code);
  assert.deepEqual(registered.filter((c) => !codes.includes(c)), [], 'registered locales without src/i18n/<code>.json');
  assert.deepEqual(codes.filter((c) => !registered.includes(c) && !PENDING.includes(c)), [], 'dictionaries neither in src/locales.json nor in PENDING');
  assert.deepEqual(PENDING.filter((c) => !codes.includes(c) || registered.includes(c)), [], 'PENDING names a code that has no dictionary or is already registered');
  assert.equal(registered[0], 'en', 'the first registry entry is the default locale, English');
});

test('every dictionary has the same key set as en', () => {
  for (const code of others) {
    const d = entries(code);
    assert.deepEqual([...en.keys()].filter((k) => !d.has(k)), [], `missing in ${code}`);
    assert.deepEqual([...d.keys()].filter((k) => !en.has(k)), [], `${code} has keys that en does not`);
  }
});

test('every dictionary keeps the placeholders of en', () => {
  for (const code of others) {
    const d = entries(code);
    for (const [k, v] of en) if (d.has(k)) assert.deepEqual(tokens(d.get(k)), tokens(v), `${code}:${k} placeholders differ from en`);
  }
});

test('every dictionary keeps the link targets of en', () => {
  for (const code of others) {
    const d = entries(code);
    for (const [k, v] of en) if (d.has(k)) assert.deepEqual(targets(d.get(k)), targets(v), `${code}:${k} link targets differ from en`);
  }
});

test('list values have the same length as en', () => {
  const lengths = (o, p = '') => Object.entries(o).flatMap(([k, v]) => Array.isArray(v) ? [[`${p}${k}`, v.length]] : typeof v === 'object' && v !== null ? lengths(v, `${p}${k}.`) : []);
  const english = new Map(lengths(load('en')));
  for (const code of others) {
    const d = new Map(lengths(load(code)));
    for (const [k, n] of english) assert.equal(d.get(k), n, `${code}:${k} has ${d.get(k)} items, en has ${n}`);
  }
});

test('no empty strings, no exclamation marks', () => {
  for (const code of codes) {
    for (const [k, v] of flatten(load(code))) {
      assert.equal(typeof v, 'string', `${code}:${k} is not a string`);
      assert.notEqual(v.trim(), '', `${code}:${k} is empty`);
      assert.ok(!/[!！]/.test(v), `${code}:${k} contains an exclamation mark`);
    }
  }
});

test('cs and pl keep one-letter words tied to the next word with a no-break space', () => {
  const letters = { cs: 'ksvzouaiKSVZOUAI', pl: 'aiouwzAIOUWZ' };
  for (const [code, set] of Object.entries(letters)) {
    if (!codes.includes(code)) continue;
    const orphan = new RegExp(`(?<![\\p{L}\\p{N}])[${set}] \\S`, 'u');
    const offending = flatten(load(code)).filter(([, v]) => orphan.test(v)).map(([k]) => k);
    assert.deepEqual(offending, [], `${code} strings with a plain space after a one-letter word (use U+00A0 so the line never ends on it): ${offending.join(', ')}`);
  }
});

test('links to English-only pages are marked (EN) in every non-English dictionary, and nothing else is', () => {
  const englishOnly = new Set(['privacy', 'privacyData', 'security', 'issues', 'contributing', 'discussions', 'syncRepo', 'syncIssues']);
  const links = (v) => [...String(v).matchAll(/\[([^\]]*)\]\(([^)]*)\)/g)].map((m) => ({ label: m[1], target: m[2] }));
  const problems = [];
  for (const code of others) {
    for (const [k, v] of entries(code)) {
      for (const { label, target } of links(v)) {
        const marked = label.endsWith('(EN)');
        const shouldBe = englishOnly.has(target) || target.startsWith('https://');
        if (shouldBe && !marked) problems.push(`${code}:${k} [${label}](${target}) needs (EN) at the end of the label`);
        if (!shouldBe && marked) problems.push(`${code}:${k} [${label}](${target}) is marked (EN) but the target is not English-only`);
      }
    }
  }
  assert.deepEqual(problems, []);
});
