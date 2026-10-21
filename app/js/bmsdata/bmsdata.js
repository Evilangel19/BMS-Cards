// Game data read from the user's Falcon BMS installation (nothing is redistributed with the program).
// Each parser takes the file text and returns a table in the same shape as the embedded fallback in ../data/.

export const FILES = {
  ct: 'Falcon4_CT.xml',   // entity types
  vcd: 'Falcon4_VCD.xml', // vehicles (aircraft names)
  ucd: 'Falcon4_UCD.xml', // unit classes (-> aircraft names)
  wcd: 'Falcon4_WCD.xml', // weapons
  ocd: 'CampObjData.XML', // campaign objects (name and position)
  rm: 'RadioMap.dat',     // callsign radio presets
  str: 'Strings.txt',     // text strings
  ils: 'Stations+Ils.dat',// airbase TACAN, tower/ILS/ATC frequencies (campaign folder)
  ppt: 'Ppt.ini',        // pre-planned threats: name written in the DTC, ring range (feet), label (campaign folder)
  rack: 'BmsRack.dat',    // pylons and racks of every station (their weight and drag count in the loadout)
};
export const OPTIONAL = new Set();
// Fields the readers depend on, per XML table: if one is missing the file does not have the layout of Falcon BMS 4.38.1 (a newer BMS may have changed it)
export const EXPECT = {
  ct: ['EntityIdx', 'EntityType', 'Domain', 'Class', 'Type'],
  ucd: ['Name', 'CtIdx', 'VehicleCtIdx_0', 'Rng_Air', 'Rng_LowAir', 'RadarVehicle', 'Det_LowAir'],
  vcd: ['Name', 'CtIdx'],
  wcd: ['Name', 'CtIdx', 'Weight', 'Drag', 'Strength', 'Flags'],
  ocd: ['CampName', 'OcdIndex', 'PositionX', 'PositionY'],
};
// names of the expected fields that the first part of an XML text does not contain
export const missingFields = (key, text) => { const head = String(text).slice(0, 400000); return (EXPECT[key] || []).filter(f => !head.includes('<' + f + '>')); };
// Other spellings of a file name (e.g. when a file was renamed by a download).
export const ALIASES = { ils: ['Stations_Ils.dat'] };
export const allNames = () => Object.entries(FILES).flatMap(([k, n]) => [n, ...(ALIASES[k] || [])]);
// First of the file's names that is present in `paths` (a { name: fullPath } map)
export const pathFor = (paths, k) => [FILES[k], ...(ALIASES[k] || [])].map(n => paths[n]).find(Boolean) || null;
export const ENCODING = { rack: 'latin1', ct: 'utf-8', vcd: 'utf-8', ucd: 'utf-8', wcd: 'utf-8', ocd: 'utf-8', rm: 'latin1', str: 'latin1', ils: 'latin1', ppt: 'latin1' };

const tag = (b, k) => { const q = b.match(new RegExp('<' + k + '>([^<]*)<')); return q ? q[1] : ''; };
const blocks = (x, name) => [...x.matchAll(new RegExp('<' + name + ' Num="(\\d+)">([\\s\\S]*?)</' + name + '>', 'g'))];

// RadioMap.dat: "name, UHF1, VHF, UHF2" -> { name(no spaces): [UHF1, VHF, UHF2] } (blank = 0)
export function parseRadioMap(text) {
  const rm = {};
  for (const l of text.split(/\r?\n/)) {
    if (/^\s*\/\//.test(l) || !l.trim()) continue;
    const p = l.split(',').map(x => x.trim());
    if (p.length < 4) continue;
    rm[p[0].replace(/\s+/g, '')] = [+p[1] || 0, +p[2] || 0, +p[3] || 0];
  }
  return rm;
}

// Ppt.ini: "name range label" per line -> [[name, range in feet (0.1 = no ring), label], ...] in file order (the first 26 are the weapon systems)
export function parsePpt(text) {
  const out = [];
  for (const l of text.split(/\r?\n/)) { const m = l.trim().match(/^(\S+)\s+(-?[\d.]+)\s+(.+)$/); if (m) out.push([m[1], +m[2], m[3].trim()]); }
  return out;
}

// Strings.txt: "id<TAB>text". Only the ranges the program uses (mission names 300-419, callsigns 2000-2999).
export function parseStrings(text, ranges = [[40, 47], [300, 419], [2000, 2999]]) {
  const S = {};
  for (const l of text.split(/\r?\n/)) {
    const m = l.match(/^(\d+)(?:\t| +)(.*)$/);
    if (m && ranges.some(([a, b]) => +m[1] >= a && +m[1] <= b)) S[m[1]] = m[2];
  }
  return S;
}

// Falcon4_CT.xml -> array indexed by CT number: [domain, class, type, entityType, entityIdx]
export function parseCt(xml) {
  const ct = [];
  xml.split('</CT>').forEach(b => {
    const m = b.match(/<CT Num="(\d+)">/);
    if (!m) return;
    const g = k => { const q = b.match(new RegExp('<' + k + '>(-?\\d+)')); return q ? +q[1] : 0; };
    ct[+m[1]] = [g('Domain'), g('Class'), g('Type'), g('EntityType'), g('EntityIdx')];
  });
  return ct;
}

// Unit class number -> name of its first vehicle (e.g. "F-16C-52")
export function parseAircraftNames(ucdXml, vcdXml) {
  const byCt = {};
  for (const m of blocks(vcdXml, 'VCD')) byCt[tag(m[2], 'CtIdx')] = tag(m[2], 'Name');
  const ac = {};
  for (const m of blocks(ucdXml, 'UCD')) { const n = byCt[tag(m[2], 'VehicleCtIdx_0')]; if (n !== undefined) ac[m[1]] = n; }
  return ac;
}

// Weapon number -> name
export function parseWeaponNames(wcdXml) {
  const wn = {};
  for (const m of blocks(wcdXml, 'WCD')) wn[m[1]] = tag(m[2], 'Name');
  return wn;
}

// Campaign objects -> [campId, name, north km, east km]
export function parseCampObjects(xml) {
  const r = n => Math.round(n / 3280.84 * 100) / 100;
  return [...xml.matchAll(/<CampObj CampId="(\d+)">([\s\S]*?)<\/CampObj>/g)]
    .map(m => [+m[1], tag(m[2], 'CampName'), r(+tag(m[2], 'PositionY')), r(+tag(m[2], 'PositionX'))]);
}

// Pilot names: Strings 2301..3099 -> array (index = pilot id - 1)
export function parsePilotNames(text) {
  const S = parseStrings(text, [[2301, 3100]]), a = [];
  for (let i = 2301; i <= 3100; i++) a.push(S[i] || '');
  return a;
}

// Weapon number -> [weight, drag]
export function parseWeaponData(wcdXml) {
  const wt = {};
  for (const m of blocks(wcdXml, 'WCD')) { const w = +tag(m[2], 'Weight'), d = +tag(m[2], 'Drag'); wt[m[1]] = [w || 0, d || 0]; }
  return wt;
}

// Ground unit classes the program reports (UCD Name) -> { unit class number: category }
export function parseGroundUnits(ucdXml, cats = ['Mech', 'Infantry', 'HQ', 'Airmobile', 'Marine']) {
  const gu = {};
  for (const m of blocks(ucdXml, 'UCD')) { const n = tag(m[2], 'Name'); if (cats.includes(n)) gu[m[1]] = n; }
  return gu;
}

// Stations_Ils.dat -> { campId: [tacan ch, band, callsign, range, type, twrUHF, twrVHF, ils1..4, ops, gnd, app, lso, atis] }
export function parseStationsIls(text) {
  const ab = {};
  for (const l of text.split(/\r?\n/)) {
    if (/^\s*#/.test(l) || !l.trim()) continue;
    const p = l.trim().split(/\s+/);
    if (p.length < 17) continue;
    ab[p[0]] = [+p[1], p[2], ...p.slice(3, 17).map(Number)].slice(0, 16);
  }
  return ab;
}

// Tank fuel (lb) by weapon number: drop tanks are weapons named "Tank ..." with flag 2; "Strength" holds the fuel weight.
export function parseTankFuel(wcdXml) {
  const tf = {};
  for (const m of blocks(wcdXml, 'WCD')) if (/^Tank/i.test(tag(m[2], 'Name')) && tag(m[2], 'Flags') === '2') tf[m[1]] = +tag(m[2], 'Strength');
  return tf;
}

// BmsRack.dat -> the racks and the hardpoint groups, with the weight and drag of each pylon / rack (taken from the WCD by its CtIdx).
// { racks: {name: {ct, wid: [ids], cls: [classes]}}, groups: {name: [{ct, racks: [names]}]}, ctw: {ct: [weight, drag]} }
export function parseRacks(text, wcdXml) {
  const racks = {}, groups = {}, ctw = {}; let r = null, g = null, p = null;
  for (const m of blocks(wcdXml, 'WCD')) ctw[+tag(m[2], 'CtIdx')] = [+tag(m[2], 'Weight') || 0, +tag(m[2], 'Drag') || 0];
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.replace(/#.*/, '').trim(); if (!l) continue;
    const w = l.split(/[\s,]+/).filter(Boolean), k = w[0].toLowerCase(), v = w.slice(1);
    if (k == 'definerack') { r = racks[v[0]] = {ct: 0, wid: [], cls: []}; g = p = null; }
    else if (k == 'definegroup') { g = groups[v[0]] = []; r = p = null; }
    else if (r && k == 'rackct') r.ct = +v[0] || 0;
    else if (r && k == 'addwid') r.wid.push(...v.map(Number).filter(n => !isNaN(n)));
    else if (r && k == 'addwclass') r.cls.push(...v.map(s => s.toLowerCase()));
    else if (g && k == 'addpylon') { p = {ct: 0, racks: []}; g.push(p); }
    else if (p && k == 'pylonct') p.ct = +v[0] || 0;
    else if (p && k == 'addrack') p.racks.push(v[0]);
  }
  return {racks, groups, ctw};
}
// the class BmsRack.dat uses for a weapon (from its name; a tank is known from its fuel)
export function weaponClass(name, isTank) {
  const n = name || '';
  if (isTank) return 'tank';
  if (/^(AIM|CATM|ASRAAM|IRIS|MICA|R-\d|PL-\d|AA-)/i.test(n)) return 'aim';
  if (/HARM|AGM-88|AARGM/i.test(n)) return 'harm';
  if (/ALQ|ECM|ALE-|jammer/i.test(n)) return 'ecm';
  if (/camera/i.test(n)) return 'camera';
  if (/^(AGM|AGM-|Maverick|Hellfire|Brimstone|Kh-|AS-)/i.test(n)) return 'agm';
  if (/^GBU|JDAM|Paveway|WCMD|JSOW|SDB/i.test(n)) return 'gbu';
  if (/rocket|^LAU-|hydra|^S-\d|^UB-/i.test(n)) return 'rocket';
  return 'bomb';
}
// weight and drag of the pylon and the rack that carry a weapon on a station of a hardpoint group: the first pylon of the group that has a rack for it
// (a rack that names the weapon wins over one that names only its class)
export function rackLoad(rk, group, id, cls) {
  const g = rk && rk.groups[group]; if (!g) return null;
  for (const p of g) {
    const rs = p.racks.map(n => rk.racks[n]).filter(Boolean), m = rs.find(x => x.wid.includes(id)) || rs.find(x => x.cls.includes(cls));
    if (!m) continue;
    const a = rk.ctw[p.ct] || [0, 0], b = rk.ctw[m.ct] || [0, 0];
    return {w: (p.ct ? a[0] : 0) + (m.ct ? b[0] : 0), d: (p.ct ? a[1] : 0) + (m.ct ? b[1] : 0)};
  }
  return null;
}

// Aircraft data files (Data\Sim\Acdata\*.txtpb) -> empty weight and internal fuel by aircraft name.
// `files` = [{ name: 'F-16CM-52.txtpb', text }]. A name ending in " ROKAF" is also stored without it (the program uses that spelling).
const hp_text = t => { const i = t.indexOf('hardpoints {'); return i < 0 ? '' : t.slice(i, i + 3000); };
export function parseAircraftData(files) {
  const ew = {}, fi = {}, hp = {};
  for (const { name, text } of files) {
    const w = text.match(/empty_weight_lbs:\s*(\d+)/), f = text.match(/internal_fuel_lbs:\s*(\d+)/);
    if (!w) continue;
    const k = name.replace(/\.txtpb$/i, '');
    ew[k] = +w[1]; if (f) fi[k] = +f[1];
    const h = [...(hp_text(text)).matchAll(/hardpoint_grp:\s*"([^"]*)"/g)].map(q => q[1]); if (h.length) hp[k] = h;   // the hardpoint group of every station (0 = the gun)
  }
  for (const k of Object.keys(ew)) {
    const b = k.replace(/\s+ROKAF$/, '');
    if (b !== k && !(b in ew)) { ew[b] = ew[k]; if (k in fi) fi[b] = fi[k]; if (k in hp) hp[b] = hp[k]; }
  }
  return { ew, fi, hp };
}

// Build every table that can be read. `readText(key)` returns the file text or null if the file is missing.
// Unit class number -> [category (UCD Name), air range km, low-altitude air range km, slot of the radar vehicle (fire control radar, FCR) or -1, low-altitude detection range km]: air defense units draw their SAM rings from it
export function parseUnitInfo(ucdXml) {
  const un = {};
  for (const m of blocks(ucdXml, 'UCD')) {
    const n = tag(m[2], 'Name').trim();
    const rv = tag(m[2], 'RadarVehicle');
    if (n) un[m[1]] = [n, +tag(m[2], 'Rng_Air') || 0, +tag(m[2], 'Rng_LowAir') || 0, rv !== '' && +rv >= 0 && +rv < 16 ? +rv : -1, +tag(m[2], 'Det_LowAir') || 0];
  }
  return un;
}

export async function buildTables(readText) {
  const t = {}, found = [], missing = [], errors = [], changed = [];
  const get = async k => {
    const x = await readText(k);
    if (x == null) { if (!OPTIONAL.has(k)) missing.push(FILES[k]); return null; }
    found.push(FILES[k]); const mf = missingFields(k, x); if (mf.length) changed.push(FILES[k] + ': ' + mf.join(', ')); return x;
  };
  const run = (name, fn) => { try { const v = fn(); if (v && (Array.isArray(v) ? v.length : Object.keys(v).length)) t[name] = v; else errors.push(name + ': empty result'); } catch (e) { errors.push(name + ': ' + e.message); } };
  const x = {};
  for (const k of Object.keys(FILES)) x[k] = await get(k);
  if (x.ct) run('ct', () => parseCt(x.ct));
  if (x.ucd && x.vcd) run('ac', () => parseAircraftNames(x.ucd, x.vcd));
  if (x.wcd) run('wn', () => parseWeaponNames(x.wcd));
  if (x.ocd) run('ob', () => parseCampObjects(x.ocd));
  if (x.rm) run('rm', () => parseRadioMap(x.rm));
  if (x.str) run('S', () => parseStrings(x.str));
  if (x.str) run('pn', () => parsePilotNames(x.str));
  if (x.wcd) run('wt', () => parseWeaponData(x.wcd));
  if (x.ucd) run('gu', () => parseGroundUnits(x.ucd));
  if (x.ucd) run('un', () => parseUnitInfo(x.ucd));
  if (x.wcd) run('tf', () => parseTankFuel(x.wcd));
  if (x.rack && x.wcd) run('rk', () => parseRacks(x.rack, x.wcd));
  if (x.ils) run('ab', () => parseStationsIls(x.ils));
  if (x.ppt) run('ppt', () => parsePpt(x.ppt));
  return { tables: t, found, missing, errors, changed };
}

// ---- Theaters -------------------------------------------------------------------------------
// Data\Theater.lst: one .tdf path per line, relative to the Data folder (add-on theaters live in their own subfolder).
export function parseTheaterList(text) {
  return text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#') && !l.startsWith('//'));
}

// .tdf file: "key value" lines (# = comment)
export function parseTdf(text) {
  const t = {};
  for (const l of text.split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Za-z0-9_]+)\s+(.*?)\s*$/);
    if (m && !l.trim().startsWith('#')) t[m[1].toLowerCase()] = m[2];
    else { const k = l.match(/^\s*([A-Za-z0-9_]+)\s*$/); if (k && !l.trim().startsWith('#')) t[k[1].toLowerCase()] = ''; }
  }
  return t;
}

const parts = p => (p || '').split(/[\\/]+/).filter(Boolean);

// Folders of a theater, as path parts relative to the Data folder.
// `entry` is the path from Theater.lst; the theater's own folder is what comes before its "TerrData" folder.
export function theaterDirs(entry, tdf) {
  const e = parts(entry), i = e.findIndex(x => x.toLowerCase() === 'terrdata'), base = i > 0 ? e.slice(0, i) : [];
  const rel = v => (v ? [...base, ...parts(v)] : null);
  return { name: tdf.name || e[e.length - 1].replace(/\.tdf$/i, ''), base, campaign: rel(tdf.campaigndir || 'Campaign'), sim: rel(tdf.simdatadir || 'Sim'),
    objects: rel(tdf.objectdir), terrain: rel(tdf.terraindir), tdfEntry: entry };
}
