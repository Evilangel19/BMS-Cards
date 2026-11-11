// Version of the program (the same as package.json, src-tauri/tauri.conf.json and src-tauri/Cargo.toml; tests/run-version.mjs checks it, with the two lock files)
export const APP_VERSION = '1.2.0-beta.15';
// the version of Falcon BMS the readers were checked with (the warnings about other files name it)
export const BMS_TESTED = '4.38.1';
// where the program is published: the notice of a newer version reads the tags of this repository (v1.2.0, v1.2.0-beta.3 ...)
export const REPO = 'Evilangel19/BMS-Cards';
// '1.3.0-beta.4' or 'v1.3.0' -> {n: [1, 3, 0], pre: ['beta', 4]} (pre: [] for a release); null when it is not a version
export function parseVer(s) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.]+))?$/.exec(String(s || '').trim());
  if (!m) return null;
  return { n: [+m[1], +m[2], +m[3]], pre: m[4] ? m[4].split('.').map(x => (/^\d+$/.test(x) ? +x : x)) : [] };
}
// < 0 when a is older than b. A release is newer than its betas (1.2.0 > 1.2.0-beta.10); beta.10 is newer than beta.9
export function cmpVer(a, b) {
  const x = parseVer(a),
    y = parseVer(b);
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i++) if (x.n[i] != y.n[i]) return x.n[i] - y.n[i];
  if (!x.pre.length || !y.pre.length) return (x.pre.length ? 0 : 1) - (y.pre.length ? 0 : 1);
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i],
      q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    if (p === q) continue;
    if (typeof p == 'number' && typeof q == 'number') return p - q;
    if (typeof p == 'number') return -1;
    if (typeof q == 'number') return 1;
    return p < q ? -1 : 1;
  }
  return 0;
}
// the newest release among the tag names that is newer than cur ('' when there is none). Betas are never announced, to anybody.
export function newerVersion(tags, cur) {
  const me = parseVer(cur);
  if (!me) return '';
  let best = '';
  for (const t of tags || []) {
    const v = parseVer(t);
    if (!v || v.pre.length) continue;
    const s = String(t).replace(/^v/, '');
    if (cmpVer(s, cur) > 0 && (!best || cmpVer(s, best) > 0)) best = s;
  }
  return best;
}
