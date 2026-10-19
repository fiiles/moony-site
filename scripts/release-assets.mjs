// Picks the installers of a GitHub release by their exact architecture suffix, so the x86_64 and
// ARM64 Linux files (and the .sig files next to them) can never be mistaken for each other.
const patterns = {
  macArm: (n) => n.endsWith('_aarch64.dmg'),
  macIntel: (n) => n.endsWith('_x64.dmg'),
  windows: (n) => n.endsWith('_x64-setup.exe'),
  appimage: (n) => n.endsWith('_amd64.AppImage'),
  deb: (n) => n.endsWith('_amd64.deb'),
  rpm: (n) => n.endsWith('.x86_64.rpm'),
  appimageArm: (n) => n.endsWith('_aarch64.AppImage'),
  debArm: (n) => n.endsWith('_arm64.deb'),
  rpmArm: (n) => n.endsWith('.aarch64.rpm'),
};

// Linux ARM64 builds start with 1.0.1; an older release has none, and the site leaves them out.
const linuxArmSince = [1, 0, 1];
const linuxArm = ['appimageArm', 'debArm', 'rpmArm'];

function atLeast(version, min) {
  const parts = version.split('-')[0].split('.').map(Number);
  for (let i = 0; i < min.length; i++) if ((parts[i] ?? 0) !== min[i]) return (parts[i] ?? 0) > min[i];
  return true;
}

/** `{ key: { name, url, bytes } }` for every installer the release must carry; throws if one is missing or ambiguous. */
export function pickAssets(assets, version) {
  const expected = Object.keys(patterns).filter((k) => atLeast(version, linuxArmSince) || !linuxArm.includes(k));
  const picked = {};
  for (const key of expected) {
    const found = assets.filter((a) => patterns[key](a.name));
    if (found.length === 0) throw new Error(`asset missing: ${key}`);
    if (found.length > 1) throw new Error(`asset ambiguous: ${key} matches ${found.map((a) => a.name).join(', ')}`);
    const [a] = found;
    picked[key] = { name: a.name, url: a.browser_download_url, bytes: a.size };
  }
  return picked;
}
