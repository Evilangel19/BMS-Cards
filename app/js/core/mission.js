// Mission file: everything one package needs to work without the campaign, plus the DTC (as opened) with the changes kept apart from it, and the datacard
// with its automatic and manual values. Pure functions (no DOM, no files): the app reads and writes the files.
//   {format, version, created, app, name, package: {campaign snapshot}, dtc: {name, enc, bom, original, edits}, datacard: {flight, auto, manual}, settings}
import { parseDtc } from '../parsers/dtc.js';
import { bmsStptKey } from './mapdtc.js';
export const MISSION_FORMAT = 'bms-cards-mission',
  OLD_FORMAT = 'bms-cards-project',
  MISSION_VERSION = 1,
  MISSION_EXT = '.bcrd'; // files saved as projects (.bmsproj) are still read
const KM_NM = 1.852;
const key = id => id.n + ':' + id.c;

// distance (km) of a point to a polyline of {x, y} points
function distToLine(px, py, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i],
      b = pts[i + 1] || a,
      dx = b.x - a.x,
      dy = b.y - a.y,
      l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy)));
  }
  return best;
}

// The part of the campaign a package needs: the flight, its package and elements, the support (tankers, AWACS, JTAC...) and the other flights that come within radiusNm of
// its route, the ground and sea units within radiusNm of the route, the squadrons they belong to. Plain JSON.
export function snapshotCampaign(C, f, { radiusNm = 60 } = {}) {
  const rKm = radiusNm * KM_NM,
    route = (f.wps || []).map(w => ({ x: w.x, y: w.y })),
    take = new Map();
  const add = u => {
    if (u && !take.has(key(u.id))) take.set(key(u.id), u);
    return u;
  };
  const ref = id => (id && (id.n || id.c) ? C.byId[key(id)] : null);
  const addPkg = u => {
    const P = ref(u.pkg);
    if (!P) return;
    add(P);
    (P.els || []).forEach(e => add(ref(e)));
    ['awacs', 'jstar', 'ecm', 'tanker'].forEach(k => add(ref(P[k])));
  };
  add(f);
  addPkg(f);
  const win = u => {
      const t = (u.wps || []).flatMap(w => [w.arr, w.dep]).filter(Boolean);
      return t.length ? [Math.min(...t), Math.max(...t)] : null;
    },
    fw = win(f),
    M = 45 * 60000;
  const together = u => {
    const w = win(u);
    return !fw || !w || (w[0] <= fw[1] + M && w[1] >= fw[0] - M);
  };
  const support = u => /^KC-/.test(C.D.ac[u.c.i] || '') || /^FAC\(A\)$/i.test(C.D.S[300 + u.omis] || ''); // the datacard looks for tankers and FAC(A) by time, wherever they are
  for (const u of C.units) {
    if (u === f || take.has(key(u.id))) continue;
    if (u.kind === 'flight') {
      if (u.wps && u.wps.length && together(u) && (support(u) || u.wps.some(w => distToLine(w.x, w.y, route) <= rKm))) {
        add(u);
        addPkg(u);
      }
    } else if (u.kind === 'gnd' || u.kind === 'sea') {
      if (distToLine(u.x, u.y, route) <= rKm) add(u);
    }
  }
  [...take.values()].forEach(u => {
    if (u.sqd) add(ref(u.sqd));
  });
  const ships = new Set([...take.values()].filter(u => u.kind === 'sea').map(u => u.id.n)); // a ship is a base only through the squadrons based on it: they travel with it
  C.units.forEach(u => {
    if (u.kind === 'sqd' && u.airbase && ships.has(u.airbase.n)) add(u);
  });
  add(C.units.find(u => u.kind === 'sqd' && u.id.n === C.playerSq));
  const units = [...take.values()];
  return {
    name: C.name,
    bull: C.bull,
    now: C.now,
    playerSq: C.playerSq,
    playerTeam: C.playerTeam,
    stance: C.stance,
    squads: C.squads,
    objOwn: C.objOwn instanceof Map ? [...C.objOwn] : C.objOwn,
    objKey: 'camp',
    objFeat: C.objFeat instanceof Map ? [...C.objFeat].map(([k, v]) => [k, Array.from(v)]) : [],
    radiusNm,
    flight: key(f.id),
    units: JSON.parse(JSON.stringify(units)),
  };
}

// a campaign object the datacard code can use (D: the static game tables of the program)
export function restoreCampaign(snap, D) {
  const units = snap.units.map(u => JSON.parse(JSON.stringify(u))),
    byId = {};
  units.forEach(u => {
    byId[key(u.id)] = u;
  });
  return {
    units,
    byId,
    D,
    bull: snap.bull,
    now: snap.now,
    playerSq: snap.playerSq,
    playerTeam: snap.playerTeam,
    stance: snap.stance,
    squads: snap.squads,
    objOwn:
      snap.objKey === 'camp'
        ? new Map(Array.isArray(snap.objOwn) ? snap.objOwn : Object.entries(snap.objOwn || {}))
        : new Map(),
    /* an older mission keyed the owners by entity id: not usable */ objFeat:
      snap.objKey === 'camp' ? new Map((snap.objFeat || []).map(([k, v]) => [k, Uint8Array.from(v)])) : new Map(),
    parse: { count: units.length, standalone: true },
    name: snap.name || '',
  };
}
export const snapshotFlight = (C, snap) => C.byId[snap.flight];

// ---- DTC: the file as opened and the changes on top of it ----
// lines: [{s: section, k: key, v: value, raw: 'key=value' as read (undefined for a line added later), dirty}]; an edit is {s, k, v, was} (was: the value as read, null for a new line)
export function dtcEdits(lines) {
  return lines
    .filter(l => l.k !== undefined && l.dirty)
    .map(l => ({
      s: l.s,
      k: l.k,
      v: l.v,
      was: l.raw === undefined ? null : l.raw.slice(l.raw.indexOf('=') + 1).trim(),
    }));
}
// edits of `lines` against the lines of the original file ({s, k, v} each): the lines whose value differs, or that the original does not have
export function dtcEditsAgainst(origLines, lines) {
  const o = new Map();
  origLines.forEach(l => {
    if (l.k !== undefined) o.set(l.s + '\u0000' + l.k, String(l.v).trim());
  });
  return lines
    .filter(
      l => l.k !== undefined && (!o.has(l.s + '\u0000' + l.k) || o.get(l.s + '\u0000' + l.k) !== String(l.v).trim())
    )
    .map(l => ({
      s: l.s,
      k: l.k,
      v: String(l.v),
      was: o.has(l.s + '\u0000' + l.k) ? o.get(l.s + '\u0000' + l.k) : null,
    }));
}
// the DTC text again: the original with the edits applied (a changed line keeps its place, a new key goes at the end of its section)
export function applyDtcEdits(original, edits) {
  const nl = /\r\n/.test(original) ? '\r\n' : '\n',
    rows = original.split(/\r?\n/),
    at = new Map();
  let sec = '';
  rows.forEach((r, i) => {
    const m = r.match(/^\[(.*)\]\s*$/);
    if (m) {
      sec = m[1];
      return;
    }
    const e = r.indexOf('=');
    if (e > 0) at.set(sec + '\u0000' + r.slice(0, e).trim(), i);
  });
  const added = new Map();
  for (const e of edits) {
    const k = e.s + '\u0000' + e.k;
    if (at.has(k)) rows[at.get(k)] = e.k + '=' + e.v;
    else {
      if (!added.has(e.s)) added.set(e.s, []);
      added.get(e.s).push(e.k + '=' + e.v);
    }
  }
  for (const [s, list] of added) {
    let last = -1,
      cur = '';
    rows.forEach((r, i) => {
      const m = r.match(/^\[(.*)\]\s*$/);
      if (m) cur = m[1];
      else if (cur === s && r.trim()) last = i;
    });
    if (last >= 0) rows.splice(last + 1, 0, ...list);
    else rows.push('[' + s + ']', ...list);
  }
  return rows.join(nl);
}

// ---- the parts of a DTC a mission can carry ----
// A mission sent to other pilots does not bring the whole DTC of its author (the MFD pages, the EWS programs ... are personal): it brings groups of sections.
// `mission` groups are the ones the author of a mission decides (they are on by default), the others are personal (off by default; the author can still turn them on).
// what travels to other pilots: ONE block of the DTC (no choice): steerpoints 1-99 (targets, PPT, geo lines, weapon targets), nav offsets, FCC profiles, laser codes and the ICP section (Bingo, Alow)
export const DTC_BLOCK_SECS = ['STPT', 'NAV OFFSETS', 'FCC_AGB', 'FCC_AIM', 'FCC_AGM', 'Laser', 'ICP'];
export const DTC_GROUPS = [
  {
    id: 'mission',
    label: 'Steerpoints, targets, lines, nav offsets, weapons and Bingo/Alow',
    secs: DTC_BLOCK_SECS,
    mission: true,
  },
];
// the groups of the lines [{s, k, v}] of a DTC: [{id, label, mission, items: [[s, k, v], ...]}], only the groups that have lines
// the steerpoint keys BMS does not use (ppt_15 and up, target_24-79 ...) are not carried
const stptOk = l => l.s !== 'STPT' || !/^(target_|ppt_|lineSTPT_|wpntarget_)\d+$/.test(l.k) || bmsStptKey(l.k);
export function dtcShare(lines) {
  return DTC_GROUPS.map(g => ({
    id: g.id,
    label: g.label,
    mission: g.mission,
    items: (lines || [])
      .filter(l => l.k !== undefined && g.secs.includes(l.s) && stptOk(l))
      .map(l => [l.s, l.k, String(l.v)]),
  })).filter(g => g.items.length);
}
// the block of a DTC saved inside a mission (the original with its edits, or the block of a mission that travelled): [] or one group
export function shareFromSaved(dtc) {
  if (!dtc) return [];
  let items = [];
  if (dtc.share && Array.isArray(dtc.share.groups)) dtc.share.groups.forEach(g => items.push(...(g.items || [])));
  else if (typeof dtc.original == 'string')
    items = dtcShare(parseDtc(applyDtcEdits(dtc.original, dtc.edits || []))).flatMap(g => g.items);
  items = items.filter(i => DTC_BLOCK_SECS.includes(i[0]) && stptOk({ s: i[0], k: i[1] }));
  return items.length ? [{ ...DTC_GROUPS[0], items }] : [];
}
// the part of a mission that travels to other pilots: the DTC is reduced to the block, nothing of the program settings goes along
export function shareMission(m, groups) {
  const out = JSON.parse(JSON.stringify(m));
  out.dtc = (groups || []).length
    ? {
        share: { groups: groups.map(g => ({ id: g.id, label: g.label, mission: true, items: g.items, on: true })) },
        author: (m.dtc && m.dtc.author) || null,
      }
    : null;
  out.settings = null;
  out.shared = true;
  return out;
}
// slots of the steerpoint blocks: what the receiver has there and the mission does not is emptied, so no point of the receiver mixes with the mission
const norm = v =>
  String(v == null ? '' : v)
    .replace(/\s+/g, ' ')
    .trim();
const SLOT_SECS = ['STPT', 'NAV OFFSETS'];
const isEmptySlot = v => {
  const t = norm(v)
    .split(/\s*,\s*/)
    .slice(0, 2);
  return t.length == 2 && t.every(x => /^-?[\d.]+$/.test(x) && +x === 0);
};
const keyBase = k => String(k).replace(/\d+$/, '');
// [{s, k, v}] of the lines of the receiver (`existing`) to empty for a group: slots the mission does not fill, using an empty line of the mission as the pattern
export function shareClears(existing, g) {
  const have = new Set(g.items.map(i => i[0] + '|' + i[1])),
    out = [];
  for (const l of existing || []) {
    if (
      !SLOT_SECS.includes(l.s) ||
      l.k === undefined ||
      !g.items.some(i => i[0] == l.s) ||
      have.has(l.s + '|' + l.k) ||
      isEmptySlot(l.v)
    )
      continue;
    const t = g.items.find(i => i[0] == l.s && keyBase(i[1]) == keyBase(l.k) && isEmptySlot(i[2]));
    if (t) out.push({ s: l.s, k: l.k, v: t[2] });
  }
  return out;
}
// what a group does to the DTC of the receiver: {change, add, clear, same, missing: [sections the receiver's DTC does not have], lost: lines of those sections}
export function shareDiff(existing, g) {
  const cur = new Map((existing || []).filter(l => l.k !== undefined).map(l => [l.s + '|' + l.k, norm(l.v)])),
    secs = new Set((existing || []).map(l => l.s)),
    miss = new Set();
  let change = 0,
    add = 0,
    same = 0,
    lost = 0;
  for (const [s, k, v] of g.items) {
    if (!secs.has(s)) {
      miss.add(s);
      lost++;
      continue;
    }
    const c = cur.get(s + '|' + k);
    if (c === undefined) add++;
    else if (c !== norm(v)) change++;
    else same++;
  }
  return { change, add, same, lost, missing: [...miss], clear: shareClears(existing, g).length };
}
// puts the items of the groups with the given ids into a DTC through set(section, key, value); `existing` = lines of the DTC of the receiver (to empty the slots the mission does not use and to skip the sections it does not have): {n: lines written or emptied, skipped: lines of missing sections}
export function applyShare(set, groups, ids, existing) {
  const want = new Set(ids),
    secs = existing ? new Set(existing.map(l => l.s)) : null;
  let n = 0,
    skipped = 0;
  for (const g of groups || [])
    if (want.has(g.id)) {
      const clr = shareClears(existing, g);
      for (const [s, k, v] of g.items) {
        if (secs && !secs.has(s)) {
          skipped++;
          continue;
        }
        set(s, k, v);
        n++;
      }
      for (const c of clr) {
        set(c.s, c.k, c.v);
        n++;
      }
    }
  return { n, skipped };
}

// ---- the mission file ----
export function buildMission({
  app = '',
  name = '',
  flight = null,
  snapshot = null,
  dtc = null,
  datacard = null,
  settings = null,
  weather = null,
  aircraft = null,
  tanks = null,
  weapons = null,
  mapshot = null,
  created = null,
  version = '',
  theater = null,
}) {
  return {
    format: MISSION_FORMAT,
    version: MISSION_VERSION,
    created: created || new Date().toISOString(),
    saved: new Date().toISOString(),
    app,
    appVersion: version,
    theater,
    name,
    package: snapshot,
    dtc,
    datacard: datacard ? { ...datacard, flight } : null,
    settings,
    weather,
    aircraft,
    tanks,
    weapons,
    mapshot,
  };
}
export function parseMission(text) {
  let o;
  try {
    o = JSON.parse(text);
  } catch (e) {
    return { error: 'The file is not valid JSON.' };
  }
  if (!o || (o.format !== MISSION_FORMAT && o.format !== OLD_FORMAT))
    return { error: 'This is not a BMS Cards mission file.' };
  if (!(o.version >= 1)) return { error: 'The mission has no version number.' };
  if (o.version > MISSION_VERSION)
    return { error: 'This mission was saved by a newer program (format ' + o.version + '); update BMS Cards.' };
  return { mission: o };
}
// the manual changes of the datacard: the fields that differ from the automatic values
export const diffFields = (auto, final, keys) => {
  const o = {};
  (keys || Object.keys(final)).forEach(k => {
    if ((final[k] || '') !== ((auto || {})[k] || '')) o[k] = final[k] || '';
  });
  return o;
};
// file and folder names of a mission
export const missionFolder = { file: n => n + MISSION_EXT, settings: 'settings.json', cards: 'cards.json' };
// The name of the DTC file kept in a mission is untrusted (the file may come from anybody): a plain file name ending in .ini, never a folder or a path.
export const dtcFileName = n => {
  const b = String(n == null ? '' : n)
    .split(/[\\/]/)
    .pop()
    .replace(/[<>:"|?*\u0000-\u001f]/g, '')
    .trim();
  return b.length <= 80 && /^[^.].*\.ini$/i.test(b) ? b : 'DTC.ini';
};
export const safeName = s =>
  String(s || 'mission')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'mission';
