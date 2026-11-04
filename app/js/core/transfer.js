// @ts-check
// Moving the data of the program (settings, page preferences, squadrons, missions, kneeboard cards, backups of the originals) from another copy of it, or from a backup
// file, and back into a backup file. This module holds the rules and no file access (core/transferrun.js reads and writes): everything here can be tested alone.
//
// "policy" says what happens to something that exists in both places:  'replace' = the imported one wins (what it replaces is saved first)  /  'keep' = yours stays.
import { DEFAULTS, mergeConfig } from '../config/config.js';

export const FORMAT = 'bms-cards-backup';
export const MANIFEST = 'bms-cards-backup.json';
export const PREF_FILES = ['mapprefs.json', 'perfprefs.json', 'dtcprefs.json', 'dtcdefaults.json', 'mfddefault.json'];
export const PATH_LABELS = {
  bmsInstall: 'BMS install folder',
  campaigns: 'Campaigns folder',
  dtc: 'DTC folder',
  kneeboardDir: 'Kneeboard DDS folder',
  missions: 'Missions folder',
};
export const lower = s => String(s).toLowerCase();
/** Two paths are the same place (Windows ignores the case and accepts both separators) */
export const samePath = (a, b) => {
  const n = p =>
    String(p || '')
      .replace(/\\/g, '/')
      .replace(/\/+$/, '')
      .toLowerCase();
  return n(a) !== '' && n(a) === n(b);
};
export const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many || one + 's');
export function fmtSize(n) {
  if (!(n > 0)) return '0 KB';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)) + ' KB';
  if (n < 1024 * 1024 * 1024) return (n / 1048576).toFixed(1) + ' MB';
  return (n / 1073741824).toFixed(2) + ' GB';
}
/** YYYY-MM-DD of the local day */
export const dateStamp = (d = new Date()) =>
  d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
/** "x.ini" -> "x (2).ini": the first name that is not in `taken` (a Set of lower case names) */
export function uniqueName(name, taken) {
  if (!taken.has(lower(name))) return name;
  const m = /^(.*?)(\.[^.]*)?$/.exec(name);
  let k = 2,
    n;
  do n = (m ? m[1] : name) + ' (' + k++ + ')' + ((m && m[2]) || '');
  while (taken.has(lower(n)));
  return n;
}

/**
 * A path from a zip made safe: "/" separators, no drive, no "..", no characters Windows refuses. null = refused.
 * @param {string} name
 */
export function safeRel(name) {
  const s = String(name).replace(/\\/g, '/');
  if (/^[A-Za-z]:/.test(s) || s.startsWith('/') || s.includes('\0')) return null;
  const seg = s.split('/').filter(x => x !== '' && x !== '.');
  if (!seg.length) return null;
  if (seg.some(x => x === '..' || /[<>:"|?*\x00-\x1f]/.test(x) || /[. ]$/.test(x))) return null;
  return seg.join('/');
}

/** What a path (relative to the folder of the program) belongs to; null = the program does not move it */
export function categoryOf(rel) {
  const l = lower(rel);
  if (l === 'config.json') return 'settings';
  if (PREF_FILES.includes(l)) return 'prefs';
  if (l === 'squadron.json' || l === 'squadron.json.new') return 'squad';
  if (l.startsWith('missions/') && l.length > 9) return 'missions';
  if (l.startsWith('cardmemory/') && l.length > 11) return 'kb';
  if ((l.startsWith('backup/dtc/') && l.length > 11) || (l.startsWith('backup/kneeboard/') && l.length > 17))
    return 'backups';
  return null;
}
/**
 * The folder inside a zip that holds the data ('' or "Name/"): a zip made by hand of the whole program folder has it inside one folder.
 * @param {string[]} paths safe relative paths
 */
export function findRoot(paths) {
  const cand = new Set(['']);
  for (const p of paths) {
    const s = p.split('/');
    if (s.length > 1) cand.add(s[0] + '/');
    if (s.length > 2) cand.add(s[0] + '/' + s[1] + '/');
  }
  let best = '',
    bestN = 0;
  for (const c of cand) {
    const n = paths.filter(p => p.startsWith(c) && categoryOf(p.slice(c.length))).length;
    if (n > bestN) {
      best = c;
      bestN = n;
    }
  }
  return best;
}

/**
 * The squadron file the program would read: the newest complete copy (the ".new" one first), as core/prefs.js does when it loads it.
 * @param {string|null} freshText squadron.json.new
 * @param {string|null} mainText squadron.json
 */
export function pickSquadron(freshText, mainText) {
  const ok = t => {
    if (t == null) return null;
    try {
      const v = JSON.parse(t);
      return v !== null && typeof v == 'object' && !Array.isArray(v) ? v : null;
    } catch (e) {
      return null;
    }
  };
  const a = ok(freshText),
    b = ok(mainText);
  if (a) return { db: a, from: 'new' };
  if (b) return { db: b, from: 'main' };
  return { db: null, from: '' };
}
export const squadCount = db => (db && Array.isArray(db.squads) ? db.squads.length : 0);

/** The settings are still the ones the program starts with (the folder it found by itself, the last files and the theater do not count) */
export function isDefaultConfig(cfg) {
  const flat = c => {
    const o = JSON.parse(JSON.stringify(c));
    o.paths.bmsInstall = '';
    o.ui.lastDtc = '';
    o.ui.lastCamp = '';
    o.theater = '';
    return JSON.stringify(o);
  };
  return flat(mergeConfig(cfg).config) === flat(DEFAULTS);
}
/**
 * What the settings become when a settings file is imported.
 * @param {any} imp the imported settings (already merged over the defaults)
 * @param {any} cur the settings of this copy
 * @param {'replace'|'keep'} policy
 * @param {Record<string, boolean>} pathOk for each folder of the imported settings: does it exist on this computer?
 * @returns {{use:boolean, config?:any, notes:string[]}}
 */
export function planConfig(imp, cur, policy, pathOk) {
  if (policy === 'keep' && !isDefaultConfig(cur)) return { use: false, notes: [] };
  const config = JSON.parse(JSON.stringify(imp)),
    notes = [];
  for (const k of Object.keys(PATH_LABELS)) {
    const v = imp.paths && imp.paths[k];
    if (!v || pathOk[k]) continue;
    const mine = (cur.paths && cur.paths[k]) || '';
    config.paths[k] = mine;
    notes.push(
      PATH_LABELS[k] + ' ' + v + ' not found on this computer: ' + (mine ? 'left as it was' : 'left automatic')
    );
  }
  return { use: true, config, notes };
}

/**
 * The backups of the DTC files: backup/dtc/index.json says which file each copy belongs to (lower case path of the original -> name of the copy).
 * @param {Record<string,string>} destMap
 * @param {Set<string>} destFiles names (lower case) of the copies there are in this copy of the program
 * @param {Record<string,string>} srcMap
 * @param {Set<string>} srcFiles names (lower case) of the copies there are in the other one
 * @param {'replace'|'keep'} policy
 * @returns {{map:Record<string,string>, ops:{from:string, to:string, mode:'new'|'replace'|'skip'}[]}}
 */
export function planDtcBackups(destMap, destFiles, srcMap, srcFiles, policy) {
  const map = { ...destMap },
    taken = new Set([...destFiles, ...Object.values(destMap).map(lower)]),
    ops = [];
  for (const [key, name] of Object.entries(srcMap || {})) {
    if (typeof name != 'string' || !srcFiles.has(lower(name))) continue;
    const mine = map[key];
    if (typeof mine == 'string' && destFiles.has(lower(mine))) {
      ops.push({ from: name, to: mine, mode: policy === 'replace' ? 'replace' : 'skip' });
      continue;
    }
    // an entry whose copy is gone keeps its name; a new one takes the first free name
    const to = typeof mine == 'string' ? mine : uniqueName(name, taken);
    taken.add(lower(to));
    map[key] = to;
    ops.push({ from: name, to, mode: 'new' });
  }
  return { map, ops };
}

/**
 * The backups of the kneeboard files: backup/kneeboard/index.json gives the sub-folder ('' = the folder itself) of each folder of DDS files (lower case path -> sub-folder).
 * @param {Record<string,string>} destMap
 * @param {Map<string, Set<string>>} destSubs sub-folder (lower case) -> names (lower case) of the files that are there
 * @param {Record<string,string>} srcMap
 * @param {Map<string, string[]>} srcSubs sub-folder (lower case) -> names of the files there
 * @param {'replace'|'keep'} policy
 * @returns {{map:Record<string,string>, ops:{fromSub:string, name:string, toSub:string, mode:'new'|'replace'|'skip'}[]}}
 */
export function planKbBackups(destMap, destSubs, srcMap, srcSubs, policy) {
  const map = { ...destMap },
    ops = [],
    used = () => new Set(Object.values(map).map(lower));
  for (const [key, sub] of Object.entries(srcMap || {})) {
    if (typeof sub != 'string') continue;
    const files = srcSubs.get(lower(sub)) || [];
    if (!files.length) continue;
    let to;
    if (typeof map[key] == 'string') to = map[key];
    else {
      const u = used();
      to = sub;
      if (u.has(lower(sub))) {
        let k = 2;
        while (u.has('folder ' + k)) k++;
        to = u.has('') ? 'folder ' + k : '';
      }
      map[key] = to;
    }
    const have = destSubs.get(lower(to)) || new Set();
    for (const name of files)
      ops.push({
        fromSub: sub,
        name,
        toSub: to,
        mode: !have.has(lower(name)) ? 'new' : policy === 'replace' ? 'replace' : 'skip',
      });
  }
  return { map, ops };
}

/**
 * The saved missions in a list of paths: a mission is the folder missions/<name> with <name>.bcrd in it.
 * @param {string[]} rels paths relative to the folder of the program ("missions/<name>/...")
 * @returns {Map<string, string[]>} name -> its paths
 */
export function missionsIn(rels) {
  const by = new Map();
  for (const p of rels) {
    const s = p.split('/');
    if (lower(s[0]) !== 'missions' || s.length < 3) continue;
    (by.get(s[1]) || by.set(s[1], []).get(s[1])).push(p);
  }
  for (const [n, list] of [...by])
    if (!list.some(p => lower(p) === lower('missions/' + n + '/' + n + '.bcrd'))) by.delete(n);
  return by;
}

/**
 * The lines of the list "what to bring": what was found in the source.
 * @param {{path:string, size:number}[]} files the files of the source (paths relative to the folder of the program)
 * @param {{squads?:number, missionsSame?:boolean}} [extra]
 */
export function summarize(files, extra = {}) {
  const by = { settings: [], prefs: [], squad: [], missions: [], kb: [], backups: [] };
  for (const f of files) {
    const c = categoryOf(f.path);
    if (c) by[c].push(f);
  }
  const sum = a => a.reduce((n, f) => n + (f.size || 0), 0),
    out = [];
  if (by.settings.length)
    out.push({
      k: 'settings',
      title: 'Settings',
      detail: 'Folders, start-up, mission radius, own map layer',
      size: sum(by.settings),
    });
  if (by.prefs.length)
    out.push({
      k: 'prefs',
      title: 'Page preferences',
      detail: 'Map, Performance, Data Cartridge and MFD choices',
      size: sum(by.prefs),
    });
  if (by.squad.length) {
    const n = extra.squads || 0;
    out.push({
      k: 'squad',
      title: 'Squadrons',
      detail: n ? plural(n, 'squadron') + ' and your pilot identity' : 'Your pilot identity (no squadron yet)',
      size: sum(by.squad),
      chip: ['wn', 'Use one version at a time'],
    });
  }
  const ms = missionsIn(by.missions.map(f => f.path));
  if (ms.size) {
    const inMs = by.missions.filter(f => ms.has(f.path.split('/')[1]));
    out.push({
      k: 'missions',
      title: 'Missions',
      detail: plural(ms.size, 'saved mission'),
      size: sum(inMs),
      same: !!extra.missionsSame,
      chip: extra.missionsSame ? ['nf', 'Same folder: nothing to copy'] : undefined,
    });
  }
  if (by.kb.length) {
    const pics = by.kb.filter(f => lower(f.path).startsWith('cardmemory/cards/')).length;
    out.push({
      k: 'kb',
      title: 'Kneeboard',
      detail: pics ? 'Page layout and ' + plural(pics, 'imported card picture') : 'Page layout',
      size: sum(by.kb),
    });
  }
  if (by.backups.length) {
    const isIx = f => /\/index\.json$/i.test(f.path),
      d = by.backups.filter(f => lower(f.path).startsWith('backup/dtc/') && !isIx(f)).length,
      k = by.backups.filter(f => lower(f.path).startsWith('backup/kneeboard/') && !isIx(f)).length;
    out.push({
      k: 'backups',
      title: 'Backups of your originals',
      detail: [d ? 'DTC (' + plural(d, 'file') + ')' : '', k ? 'kneeboard (' + plural(k, 'file') + ')' : '']
        .filter(Boolean)
        .join(' and '),
      size: sum(by.backups),
      chip: ['ok', 'Keep: your true originals'],
    });
  }
  return out;
}
