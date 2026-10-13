// Snapshots the documents the site must never contradict, at a release tag, plus the latest release.
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = 'fiiles/Moony';
const api = 'https://api.github.com/repos/' + repo;
const headers = { 'User-Agent': 'moony-site-sync', Accept: 'application/vnd.github+json' };

const latest = await (await fetch(api + '/releases/latest', { headers })).json();
if (!latest.tag_name) throw new Error('no latest release: ' + JSON.stringify(latest).slice(0, 200));
const tag = process.argv[2] || latest.tag_name;
const pick = (test) => {
  const a = latest.assets.find((x) => test(x.name));
  return a ? { name: a.name, url: a.browser_download_url, bytes: a.size } : null;
};
const fetchedAt = new Date().toISOString();
const release = {
  tag: latest.tag_name,
  version: latest.tag_name.replace(/^v/, ''),
  publishedAt: latest.published_at.slice(0, 10),
  htmlUrl: latest.html_url,
  assets: {
    macArm: pick((n) => n.endsWith('_aarch64.dmg')),
    macIntel: pick((n) => n.endsWith('_x64.dmg')),
    windows: pick((n) => n.endsWith('_x64-setup.exe')),
    appimage: pick((n) => n.endsWith('.AppImage')),
    deb: pick((n) => n.endsWith('.deb')),
    rpm: pick((n) => n.endsWith('.rpm')),
  },
  fetchedAt,
};
for (const [k, v] of Object.entries(release.assets)) if (!v) throw new Error('asset missing: ' + k);

const docs = [
  ['PRIVACY.md', 'privacy', 'Privacy'],
  ['SECURITY.md', 'security', 'Security'],
  ['CHANGELOG.md', 'changelog', 'Changelog'],
];

// A line starting with "# " outside a fenced code block is a top-level heading.
const hasH1 = (md) => {
  let fence = null;
  for (const line of md.split('\n')) {
    const f = line.match(/^ {0,3}(```|~~~)/);
    if (f) fence = fence === null ? f[1] : fence === f[1] ? null : fence;
    else if (fence === null && /^# /.test(line)) return true;
  }
  return false;
};

// Fetch and transform everything first; nothing is written unless every document succeeded.
const snapshots = [];
for (const [file, slug, title] of docs) {
  const url = `https://raw.githubusercontent.com/${repo}/${tag}/${file}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'moony-site-sync' } });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  let md = await res.text();
  md = md.replace(/^# .*\n/, ''); // the page renders its own H1
  if (hasH1(md)) throw new Error(`${file}: a top-level "# " heading remains after stripping the title`);
  // relative links to repo files → GitHub blob links
  md = md.replace(/\]\(\.\/([^)]+)\)/g, `](https://github.com/${repo}/blob/${tag}/$1)`);
  const fm = `---\ntitle: "${title}"\nsourceUrl: "https://github.com/${repo}/blob/${tag}/${file}"\ntag: "${tag}"\nfetchedAt: "${fetchedAt}"\n---\n`;
  snapshots.push({ slug, text: fm + md });
}

mkdirSync(resolve(here, '../src/data'), { recursive: true });
mkdirSync(resolve(here, '../src/content/repo'), { recursive: true });
writeFileSync(resolve(here, '../src/data/release.json'), JSON.stringify(release, null, 2) + '\n');
console.log('release:', release.tag, release.publishedAt);
for (const { slug, text } of snapshots) {
  writeFileSync(resolve(here, `../src/content/repo/${slug}.md`), text);
  console.log('doc:', slug, 'from', tag);
}
