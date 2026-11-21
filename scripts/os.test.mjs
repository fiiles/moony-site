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

// ---- iPhone button (data-ios, data-ios-href)

/** A download button; `ios` adds the data-ios and data-ios-href attributes. */
function iosButton({ ios = true } = {}) {
  const attrs = { href: '/download/' };
  const label = { textContent: 'Download' };
  const dataset = { mac: 'Download for Mac', win: 'Download for Windows', linux: 'Download for Linux' };
  if (ios) { dataset.ios = 'Get it on the App Store'; dataset.iosHref = 'https://apps.apple.com/app/x'; }
  return { attrs, label, dataset, querySelector: (s) => (s === 'span' ? label : null), getAttribute: (n) => attrs[n], setAttribute(n, v) { attrs[n] = v; } };
}

function visitIos({ userAgent = '', platform = '', maxTouchPoints = 0, ios = true } = {}) {
  const b = iosButton({ ios });
  const document = { querySelectorAll: (s) => (s === '[data-platform-link]' ? [b] : []) };
  vm.runInNewContext(source, { document, navigator: { userAgent, platform, maxTouchPoints } });
  return b;
}

const IPHONE = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15', platform: 'iPhone', maxTouchPoints: 5 };

test('an iPhone gets the App Store label and address', () => {
  const b = visitIos(IPHONE);
  assert.equal(b.label.textContent, 'Get it on the App Store');
  assert.equal(b.attrs.href, 'https://apps.apple.com/app/x');
});

test('an iPod touch gets the App Store label and address', () => {
  const b = visitIos({ userAgent: 'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X)', platform: 'iPod' });
  assert.equal(b.attrs.href, 'https://apps.apple.com/app/x');
});

test('an iPad keeps the generic button, also when it reports as a Mac with touch', () => {
  for (const o of [{ userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)', platform: 'iPad', maxTouchPoints: 5 }, { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 }]) {
    const b = visitIos(o);
    assert.equal(b.label.textContent, 'Download');
    assert.equal(b.attrs.href, '/download/');
  }
});

test('an Android phone keeps the generic button', () => {
  const b = visitIos({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)', platform: 'Linux armv81', maxTouchPoints: 5 });
  assert.equal(b.label.textContent, 'Download');
  assert.equal(b.attrs.href, '/download/');
});

test('an iPhone and a button without data-ios: unchanged, no throw', () => {
  let b;
  assert.doesNotThrow(() => { b = visitIos({ ...IPHONE, ios: false }); });
  assert.equal(b.label.textContent, 'Download');
  assert.equal(b.attrs.href, '/download/');
});

test('desktop systems keep their label and #os fragment on a button that carries data-ios', () => {
  const cases = [
    ['MacIntel', 'Macintosh', 'Download for Mac', 'mac'],
    ['Win32', 'Windows NT 10.0', 'Download for Windows', 'win'],
    ['Linux x86_64', 'X11; Linux x86_64', 'Download for Linux', 'linux'],
  ];
  for (const [platform, userAgent, label, os] of cases) {
    const b = visitIos({ platform, userAgent });
    assert.equal(b.label.textContent, label);
    assert.equal(b.attrs.href, `/download/#${os}`);
  }
});
