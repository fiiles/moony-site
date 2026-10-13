import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const load = (l) => JSON.parse(readFileSync(resolve(here, `../src/i18n/${l}.json`), 'utf8'));
const flatten = (o, p = '') => Object.entries(o).flatMap(([k, v]) => typeof v === 'object' && v !== null ? flatten(v, `${p}${k}.`) : [[`${p}${k}`, v]]);

test('en and cs have identical key sets', () => {
  const en = new Set(flatten(load('en')).map(([k]) => k));
  const cs = new Set(flatten(load('cs')).map(([k]) => k));
  assert.deepEqual([...en].filter((k) => !cs.has(k)), [], 'missing in cs');
  assert.deepEqual([...cs].filter((k) => !en.has(k)), [], 'missing in en');
});

test('no empty strings, no exclamation marks in either locale', () => {
  for (const l of ['en', 'cs']) {
    for (const [k, v] of flatten(load(l))) {
      assert.equal(typeof v, 'string', `${l}:${k} is not a string`);
      assert.notEqual(v.trim(), '', `${l}:${k} is empty`);
      assert.ok(!v.includes('!'), `${l}:${k} contains an exclamation mark`);
    }
  }
});
