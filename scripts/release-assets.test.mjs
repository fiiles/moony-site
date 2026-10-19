import test from 'node:test';
import assert from 'node:assert/strict';
import { pickAssets } from './release-assets.mjs';

const asset = (name) => ({ name, browser_download_url: `https://example.test/${name}`, size: 1 });
const files = (v, arm = true) => [
  `Moony_${v}_aarch64.dmg`, `Moony_${v}_x64.dmg`, `Moony_${v}_x64-setup.exe`, `Moony_${v}_x64-setup.exe.sig`,
  `Moony_${v}_amd64.AppImage`, `Moony_${v}_amd64.AppImage.sig`, `Moony_${v}_amd64.deb`, `Moony_${v}_amd64.deb.sig`,
  `Moony-${v}-1.x86_64.rpm`, `Moony-${v}-1.x86_64.rpm.sig`, 'Moony_aarch64.app.tar.gz', 'latest.json',
  ...(arm ? [`Moony_${v}_aarch64.AppImage`, `Moony_${v}_aarch64.AppImage.sig`, `Moony_${v}_arm64.deb`, `Moony_${v}_arm64.deb.sig`,
    `Moony-${v}-1.aarch64.rpm`, `Moony-${v}-1.aarch64.rpm.sig`] : []),
].map(asset);

test('each Linux architecture gets its own files, never a .sig or the other architecture', () => {
  const picked = pickAssets(files('1.0.1'), '1.0.1');
  assert.deepEqual(Object.fromEntries(Object.entries(picked).map(([k, v]) => [k, v.name])), {
    macArm: 'Moony_1.0.1_aarch64.dmg',
    macIntel: 'Moony_1.0.1_x64.dmg',
    windows: 'Moony_1.0.1_x64-setup.exe',
    appimage: 'Moony_1.0.1_amd64.AppImage',
    deb: 'Moony_1.0.1_amd64.deb',
    rpm: 'Moony-1.0.1-1.x86_64.rpm',
    appimageArm: 'Moony_1.0.1_aarch64.AppImage',
    debArm: 'Moony_1.0.1_arm64.deb',
    rpmArm: 'Moony-1.0.1-1.aarch64.rpm',
  });
});

test('a release from 1.0.1 on without an ARM file fails', () => {
  const list = files('1.0.1').filter((a) => a.name !== 'Moony_1.0.1_arm64.deb');
  assert.throws(() => pickAssets(list, '1.0.1'), /asset missing: debArm/);
  assert.throws(() => pickAssets(files('1.2.0', false), '1.2.0'), /asset missing: appimageArm/);
});

test('a release before 1.0.1 has no ARM files and is still complete', () => {
  const picked = pickAssets(files('1.0.0', false), '1.0.0');
  assert.equal(Object.keys(picked).length, 6);
  assert.equal(picked.appimageArm, undefined);
});

test('a missing x86_64 file still fails', () => {
  const list = files('1.0.0', false).filter((a) => !a.name.endsWith('.x86_64.rpm'));
  assert.throws(() => pickAssets(list, '1.0.0'), /asset missing: rpm/);
});
