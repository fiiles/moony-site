import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/js/os.js', import.meta.url), 'utf8');
function visit(navigator, withButtons = true) {
  const buttons = withButtons ? [0, 1].map(() => ({
    dataset: { mac: 'Download for macOS', win: 'Download for Windows', linux: 'Download for Linux' },
    label: { textContent: 'Download' }, href: '/download/',
    querySelector() { return this.label; },
    getAttribute() { return this.href; }, setAttribute(name, value) { this[name] = value; },
  })) : [];
  const cards = ['mac', 'win', 'linux'].map(os => ({
    dataset: { os }, classes: new Set(), badge: { hidden: true },
    classList: { add(value) { this.owner.classes.add(value); } },
    querySelector() { return this.badge; },
  }));
  cards.forEach(c => c.classList.owner = c);
  const document = {
    getElementById: () => buttons[0],
    querySelectorAll(selector) { return selector === '[data-platform-link]' ? buttons : selector === '[data-os]' ? cards : []; },
  };
  vm.runInNewContext(source, { navigator, document });
  return { buttons, cards };
}
for (const [os, navigator] of [
  ['mac', { platform: 'MacIntel', userAgent: 'Macintosh', maxTouchPoints: 0 }],
  ['win', { userAgentData: { platform: 'Windows' }, platform: 'Win32', userAgent: 'Windows NT 10.0' }],
  ['linux', { platform: 'Linux x86_64', userAgent: 'X11; Linux x86_64' }],
  ['linux', { platform: 'Linux aarch64', userAgent: 'X11; Linux aarch64' }],
]) {
  test(`${os}: both download links lead to the right installer section`, () => {
    const { buttons } = visit(navigator);
    for (const b of buttons) {
      assert.equal(b.href, `/download/#${os}`);
      assert.equal(b.label.textContent, b.dataset[os]);
    }
  });
  test(`${os}: the matching card is recommended even without a hero button`, () => {
    const { cards } = visit(navigator, false);
    for (const c of cards) {
      assert.equal(c.classes.has('is-current'), c.dataset.os === os);
      assert.equal(c.badge.hidden, c.dataset.os !== os);
    }
  });
}
for (const navigator of [
  { platform: 'MacIntel', userAgent: 'Macintosh', maxTouchPoints: 5 },
  { platform: 'Linux armv8l', userAgent: 'Android' },
  { platform: 'Linux x86_64', userAgent: 'CrOS x86_64' },
  { platform: 'iPhone', userAgent: 'iPhone' },
  { platform: '', userAgent: '' },
]) {
  test(`mobile or unknown (${navigator.userAgent}): offers all desktop choices`, () => {
    const { buttons, cards } = visit(navigator);
    assert.ok(buttons.every(b => b.href === '/download/' && b.label.textContent === 'Download'));
    assert.ok(cards.every(c => !c.classes.has('is-current') && c.badge.hidden));
  });
}
