// @ts-check
// The reading and writing of the move of the data (rules: core/transfer.js, zip: core/zip.js).
// "io" is the file access, handed in so that the same code runs in the program (platform/desktop.js) and in the tests (a file system in memory):
//   list(dir) -> [{name, isDirectory}]   read(path) -> Uint8Array   write(path, bytes)   mkdir(path) (with the folders above)   exists(path)   size(path)   join(dir, name)
import { mergeConfig } from '../config/config.js';
import { readZip, ZipWriter } from './zip.js';
import {
  FORMAT,
  MANIFEST,
  PATH_LABELS,
  PREF_FILES,
  categoryOf,
  dateStamp,
  findRoot,
  isDefaultConfig,
  lower,
  missionsIn,
  pickSquadron,
  planConfig,
  planDtcBackups,
  planKbBackups,
  plural,
  safeRel,
  samePath,
  squadCount,
  summarize,
} from './transfer.js';

const dec = new TextDecoder(),
  enc = new TextEncoder();
const txt = b => dec.decode(b).replace(/^﻿/, '');
const parseJson = t => {
  try {
    return JSON.parse(String(t).replace(/^﻿/, ''));
  } catch (e) {
    return undefined;
  }
};
const isObj = v => v !== null && typeof v == 'object' && !Array.isArray(v);
const msg = e => String((e && e.message) || e || 'error');
const dirOf = p => p.replace(/[\\/][^\\/]*$/, '');
const sameBytes = (a, b) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};
const safeList = async (io, dir) => {
  try {
    return (await io.list(dir)) || [];
  } catch (e) {
    return [];
  }
};
const joiner =
  io =>
  (...p) =>
    p.reduce((a, b) => io.join(a, b));
const caseless = files => {
  const m = new Map();
  for (const f of files) if (!m.has(lower(f.path))) m.set(lower(f.path), f);
  return rel => m.get(lower(rel)) || null;
};

/**
 * The data of a copy of the program that sits in a folder. The files are listed, not read.
 * @returns {Promise<any>} { kind:'folder', label, files:[{path, size, read}], find(rel), missionsDir }
 */
export async function sourceFromFolder(io, dir) {
  const J = joiner(io),
    files = [],
    add = (rel, phys) => files.push({ path: rel, phys, size: 0, read: () => io.read(phys) });
  const want = new Set(['config.json', 'squadron.json', 'squadron.json.new', ...PREF_FILES]);
  for (const e of await safeList(io, dir))
    if (!e.isDirectory && want.has(lower(e.name))) add(lower(e.name), J(dir, e.name));
  // the missions can be kept in a folder of the pilot (Settings)
  let missionsDir = J(dir, 'missions');
  const cf = files.find(f => f.path === 'config.json');
  if (cf) {
    try {
      const c = parseJson(txt(await cf.read())),
        m = isObj(c) && isObj(c.paths) && (c.paths.missions || c.paths.projects);
      if (typeof m == 'string' && m && (await io.exists(m))) missionsDir = m;
    } catch (e) {
      /* the file is checked later */
    }
  }
  const walk = async (phys, rel, depth) => {
    for (const e of await safeList(io, phys)) {
      if (e.isDirectory) {
        if (depth > 0) await walk(J(phys, e.name), rel + '/' + e.name, depth - 1);
      } else if (!/\.tmp$/i.test(e.name)) add(rel + '/' + e.name, J(phys, e.name));
    }
  };
  await walk(missionsDir, 'missions', 3);
  await walk(J(dir, 'cardmemory'), 'cardmemory', 1);
  await walk(J(dir, 'backup', 'dtc'), 'backup/dtc', 0);
  await walk(J(dir, 'backup', 'kneeboard'), 'backup/kneeboard', 1);
  for (let i = 0; i < files.length; i += 16)
    await Promise.all(
      files.slice(i, i + 16).map(async f => {
        try {
          f.size = (await io.size(f.phys)) || 0;
        } catch (e) {
          f.size = 0;
        }
      })
    );
  return { kind: 'folder', label: dir, files, find: caseless(files), missionsDir, manifest: async () => null };
}

/**
 * The folder a pilot chose: the program folder itself, or the one folder with a program in it below.
 * @returns {Promise<{dir?:string, error?:'self'|'none'|'several', options?:string[]}>}
 */
export async function findProgramFolder(io, dir, appDir) {
  const has = async d => {
    const l = await safeList(io, d);
    return l.some(e =>
      e.isDirectory
        ? ['missions', 'cardmemory', 'backup'].includes(lower(e.name))
        : ['config.json', 'squadron.json', 'bms-cards.exe', ...PREF_FILES].includes(lower(e.name))
    );
  };
  if (samePath(dir, appDir)) return { error: 'self' };
  if (await has(dir)) return { dir };
  const J = joiner(io),
    found = [];
  for (const e of await safeList(io, dir)) if (e.isDirectory && (await has(J(dir, e.name)))) found.push(e.name);
  if (found.length === 1) return samePath(J(dir, found[0]), appDir) ? { error: 'self' } : { dir: J(dir, found[0]) };
  return found.length ? { error: 'several', options: found } : { error: 'none' };
}

/** The data in a backup file (or in a zip of a whole program folder). Throws when the file is not a zip. */
export function sourceFromZip(/** @type {Uint8Array} */ bytes, label) {
  const z = readZip(bytes),
    ents = [];
  let unsafe = 0;
  for (const e of z.entries) {
    if (e.dir) continue;
    const r = safeRel(e.name);
    if (r) ents.push({ r, e });
    else unsafe++;
  }
  const root = findRoot(ents.map(x => x.r)),
    files = [],
    seen = new Set();
  let man = null;
  for (const { r, e } of ents) {
    if (!r.startsWith(root)) continue;
    const rel = r.slice(root.length);
    if (lower(rel) === MANIFEST) {
      man = e;
      continue;
    }
    if (!categoryOf(rel) || seen.has(lower(rel))) continue;
    seen.add(lower(rel));
    files.push({ path: rel, size: e.size, read: () => z.read(e) });
  }
  return {
    kind: 'zip',
    label,
    files,
    find: caseless(files),
    unsafe,
    manifest: async () => (man ? parseJson(txt(await z.read(man))) : null),
  };
}

/**
 * What there is in the source, for the list "what to bring". Throws when it is a zip that is not a backup of this program.
 * @param {any} src
 * @param {{missionsDir?:string}} [ctx] the missions folder of this copy
 */
export async function describeSource(src, ctx = {}) {
  const man = await src.manifest();
  if (man && man.format !== FORMAT) throw new Error('This file is not a backup made by BMS Cards.');
  const extra = { squads: 0, missionsSame: src.kind === 'folder' && samePath(src.missionsDir, ctx.missionsDir) };
  const problems = {};
  const fresh = src.find('squadron.json.new'),
    main = src.find('squadron.json');
  if (fresh || main) {
    const p = pickSquadron(fresh ? txt(await fresh.read()) : null, main ? txt(await main.read()) : null);
    if (p.db) extra.squads = squadCount(p.db);
    else problems.squad = 'The squadron file is damaged: it cannot be imported.';
  }
  const cf = src.find('config.json');
  if (cf) {
    const c = parseJson(txt(await cf.read()));
    if (!isObj(c)) problems.settings = 'The settings file is damaged: it cannot be imported.';
  }
  const items = summarize(
    src.files.map(f => ({ path: f.path, size: f.size })),
    extra
  ).map(it => ({ ...it, problem: problems[it.k] || '' }));
  return { items, manifest: man, unsafe: src.unsafe || 0 };
}

/**
 * Brings the chosen items from the source into this copy of the program.
 * @param {object} o
 * @param {any} o.io
 * @param {any} o.src
 * @param {string} o.appDir the folder of this copy of the program
 * @param {string[]} o.picks the items to bring (k of describeSource)
 * @param {'replace'|'keep'} o.policy
 * @param {{config:any, missionsDir:string}} o.cur the settings of this copy and its missions folder
 * @param {Date} [o.today]
 * @param {(p:{done:number, total:number, stage:string})=>void} [o.progress]
 */
export async function runImport(o) {
  const { io, src, appDir, policy } = o,
    J = joiner(io),
    today = o.today || new Date(),
    picks = new Set(o.picks),
    rows = [],
    errors = [],
    notes = [],
    written = new Set(),
    made = new Set();
  const cat = f => categoryOf(f.path);
  const all = src.files.filter(f => picks.has(cat(f)));
  const total = Math.max(1, all.length);
  let done = 0,
    stageText = '';
  const tick = (n = 1) => {
    done += n;
    if (o.progress) o.progress({ done: Math.min(done, total), total, stage: stageText });
  };
  const stage = t => {
    stageText = t;
    if (o.progress) o.progress({ done: Math.min(done, total), total, stage: t });
  };
  const ensureDir = async d => {
    if (made.has(lower(d))) return;
    await io.mkdir(d);
    made.add(lower(d));
  };
  const put = async (dest, bytes) => {
    await ensureDir(dirOf(dest));
    await io.write(dest, bytes);
  };
  const readText = async p => {
    try {
      return (await io.exists(p)) ? txt(await io.read(p)) : null;
    } catch (e) {
      return null;
    }
  };
  // what is about to be replaced is saved in backup\before-import-<day> (the first free name), with the same paths
  let safeDir = '',
    safeName = '';
  const saveFirst = async (rel, destPath) => {
    if (!(await io.exists(destPath))) return;
    if (!safeDir) {
      const base = J(appDir, 'backup'),
        taken = new Set((await safeList(io, base)).map(e => lower(e.name)));
      safeName = 'before-import-' + dateStamp(today);
      for (let k = 2; taken.has(lower(safeName)); k++) safeName = 'before-import-' + dateStamp(today) + ' (' + k + ')';
      safeDir = J(base, safeName);
    }
    await put(J(safeDir, ...rel.split('/')), await io.read(destPath));
  };
  const row = (k, title, state, detail) => rows.push({ k, title, state, detail });
  const bad = (file, e) => errors.push({ file, error: msg(e) });
  let destMissions = o.cur.missionsDir;

  // ---- settings
  if (picks.has('settings') && src.find('config.json')) {
    stage('Copying the settings…');
    try {
      const user = parseJson(txt(await src.find('config.json').read()));
      if (!isObj(user)) row('settings', 'Settings', 'failed', 'The settings file is damaged: skipped.');
      else {
        const imp = mergeConfig(user).config,
          pathOk = {};
        for (const k of Object.keys(PATH_LABELS)) {
          const v = imp.paths[k];
          pathOk[k] = !!v && ((await io.exists(v)) || (k === 'missions' && (await io.exists(dirOf(v)))));
        }
        const plan = planConfig(imp, o.cur.config, policy, pathOk);
        if (!plan.use) row('settings', 'Settings', 'kept', 'Yours stay as they are.');
        else {
          const dest = J(appDir, 'config.json');
          if (!isDefaultConfig(o.cur.config)) await saveFirst('config.json', dest); // the settings of a copy never used are not worth a copy
          await put(dest, enc.encode(JSON.stringify(plan.config, null, 2) + '\n'));
          written.add('config.json');
          destMissions = plan.config.paths.missions || J(appDir, 'missions');
          notes.push(...plan.notes);
          row(
            'settings',
            'Settings',
            'done',
            'Imported.' + (plan.notes.length ? ' ' + plan.notes.join('. ') + '.' : '')
          );
        }
      }
    } catch (e) {
      bad('config.json', e);
      row('settings', 'Settings', 'failed', 'Could not be imported.');
    }
    tick();
  }

  // ---- page preferences
  if (picks.has('prefs')) {
    stage('Copying the page preferences…');
    let added = 0,
      replaced = 0,
      kept = 0,
      same = 0,
      damaged = 0,
      failed = 0;
    for (const name of PREF_FILES) {
      const f = src.find(name);
      if (!f) continue;
      try {
        const bytes = await f.read(),
          v = parseJson(txt(bytes)),
          dest = J(appDir, name);
        if (!isObj(v)) damaged++;
        else if (await io.exists(dest)) {
          const have = await io.read(dest);
          if (sameBytes(have, bytes)) same++;
          else if (policy === 'keep') kept++;
          else {
            await saveFirst(name, dest);
            await put(dest, bytes);
            written.add(name);
            replaced++;
          }
        } else {
          await put(dest, bytes);
          written.add(name);
          added++;
        }
      } catch (e) {
        failed++;
        bad(name, e);
      }
      tick();
    }
    const parts = [
      added + replaced ? plural(added + replaced, 'file') + ' imported' : '',
      kept ? plural(kept, 'file') + ' kept as they were' : '',
      same ? plural(same, 'file') + ' already the same' : '',
      damaged ? plural(damaged, 'damaged file') + ' skipped' : '',
    ].filter(Boolean);
    row('prefs', 'Page preferences', failed ? 'failed' : added + replaced ? 'done' : 'kept', parts.join(' · ') + '.');
  }

  // ---- squadrons
  if (picks.has('squad')) {
    stage('Copying the squadrons…');
    try {
      const fresh = src.find('squadron.json.new'),
        main = src.find('squadron.json'),
        fb = fresh ? await fresh.read() : null,
        mb = main ? await main.read() : null,
        pick = pickSquadron(fb ? txt(fb) : null, mb ? txt(mb) : null);
      if (!pick.db) row('squad', 'Squadrons', 'failed', 'The squadron file is damaged: skipped.');
      else {
        const dn = J(appDir, 'squadron.json.new'),
          dm = J(appDir, 'squadron.json'),
          have = pickSquadron(await readText(dn), await readText(dm));
        if (squadCount(have.db) > 0 && policy === 'keep') row('squad', 'Squadrons', 'kept', 'Yours stay as they are.');
        else {
          if (squadCount(have.db) > 0) {
            await saveFirst('squadron.json', dm);
            await saveFirst('squadron.json.new', dn);
          }
          const bytes = pick.from === 'new' ? fb : mb;
          await put(dn, bytes); // like the program: the copy first, read back, then the file itself
          if (!sameBytes(await io.read(dn), bytes)) throw new Error('The file was not written whole.');
          await put(dm, bytes);
          written.add('squadron.json');
          written.add('squadron.json.new');
          const n = squadCount(pick.db);
          row(
            'squad',
            'Squadrons',
            'done',
            (n ? plural(n, 'squadron') + ' and your pilot identity' : 'Your pilot identity') + ' imported.'
          );
        }
      }
    } catch (e) {
      bad('squadron.json', e);
      row('squad', 'Squadrons', 'failed', 'Could not be imported.');
    }
    tick(src.files.filter(f => cat(f) === 'squad').length);
  }

  // ---- missions
  if (picks.has('missions')) {
    stage('Copying the missions…');
    const ms = missionsIn(src.files.map(f => f.path));
    let added = 0,
      replaced = 0,
      kept = 0,
      failed = 0;
    if (src.kind === 'folder' && samePath(src.missionsDir, destMissions)) {
      row('missions', 'Missions', 'kept', 'The same folder: nothing to copy.');
      tick(all.filter(f => cat(f) === 'missions').length);
    } else {
      for (const [name, rels] of ms) {
        const there = await io.exists(J(destMissions, name, name + '.bcrd'));
        if (there && policy === 'keep') {
          kept++;
          tick(rels.length);
          continue;
        }
        try {
          // the mission file itself last: a copy that stops in the middle does not show up as a mission
          const main = lower('missions/' + name + '/' + name + '.bcrd'),
            ordered = [...rels.filter(r => lower(r) !== main), ...rels.filter(r => lower(r) === main)];
          for (const rel of ordered) {
            const sub = rel.split('/').slice(2),
              dest = J(destMissions, name, ...sub);
            if (there) await saveFirst('missions/' + name + '/' + sub.join('/'), dest);
            await put(dest, await src.find(rel).read());
            tick();
          }
          there ? replaced++ : added++;
        } catch (e) {
          failed++;
          bad('missions/' + name, e);
        }
      }
      const parts = [
        added ? plural(added, 'mission') + ' copied' : '',
        replaced ? plural(replaced, 'mission') + ' replaced' : '',
        kept ? plural(kept, 'mission') + ' kept as they were' : '',
        failed ? plural(failed, 'mission') + ' could not be copied' : '',
      ].filter(Boolean);
      row('missions', 'Missions', failed ? 'failed' : added + replaced ? 'done' : 'kept', parts.join(' · ') + '.');
    }
  }

  // ---- kneeboard cards: the arrangement and its pictures go together
  if (picks.has('kb')) {
    stage('Copying the kneeboard cards…');
    const cj = src.find('cardmemory/cards.json'),
      pics = src.files.filter(f => lower(f.path).startsWith('cardmemory/cards/'));
    if (!cj) {
      row('kb', 'Kneeboard', 'failed', 'cards.json is missing: skipped.');
      tick(pics.length);
    } else {
      try {
        const dest = J(appDir, 'cardmemory', 'cards.json'),
          there = await io.exists(dest),
          cur = there ? parseJson((await readText(dest)) || '') : null,
          mineHas = !!(isObj(cur) && Array.isArray(cur.library) && cur.library.length);
        if (mineHas && policy === 'keep') {
          row('kb', 'Kneeboard', 'kept', 'Yours stay as they are.');
          tick(pics.length + 1);
        } else {
          if (there) {
            await saveFirst('cardmemory/cards.json', dest);
            for (const e of await safeList(io, J(appDir, 'cardmemory', 'cards')))
              if (!e.isDirectory)
                await saveFirst('cardmemory/cards/' + e.name, J(appDir, 'cardmemory', 'cards', e.name));
          }
          for (const p of pics) {
            await put(J(appDir, 'cardmemory', 'cards', p.path.split('/').pop()), await p.read());
            tick();
          }
          await put(dest, await cj.read()); // the arrangement last
          written.add('cardmemory');
          tick();
          row(
            'kb',
            'Kneeboard',
            'done',
            (pics.length ? plural(pics.length, 'card picture') + ' and the page layout' : 'The page layout') +
              ' imported.'
          );
        }
      } catch (e) {
        bad('cardmemory', e);
        row('kb', 'Kneeboard', 'failed', 'Could not be imported.');
      }
    }
  }

  // ---- the backups of the originals (DTC and kneeboard)
  if (picks.has('backups')) {
    stage('Copying the backups of your originals…');
    let nDtc = 0,
      nKb = 0,
      kept = 0,
      failed = 0;
    // DTC: backup\dtc\index.json (original path -> copy)
    try {
      const names = path => path.split('/').pop(),
        inDtc = src.files.filter(f => lower(f.path).startsWith('backup/dtc/') && f.path.split('/').length === 3),
        ixf = src.find('backup/dtc/index.json'),
        sMap = ixf ? parseJson(txt(await ixf.read())) : null,
        sFiles = new Set(inDtc.filter(f => lower(names(f.path)) !== 'index.json').map(f => lower(names(f.path)))),
        dDir = J(appDir, 'backup', 'dtc'),
        dFiles = new Set(
          (await safeList(io, dDir))
            .filter(e => !e.isDirectory && lower(e.name) !== 'index.json')
            .map(e => lower(e.name))
        ),
        dMapRaw = parseJson((await readText(J(dDir, 'index.json'))) || ''),
        dMap = isObj(dMapRaw) ? dMapRaw : {},
        plan = planDtcBackups(dMap, dFiles, isObj(sMap) ? sMap : {}, sFiles, policy);
      for (const op of plan.ops) {
        try {
          if (op.mode === 'skip') {
            kept++;
            continue;
          }
          const dest = J(dDir, op.to);
          if (op.mode === 'replace') await saveFirst('backup/dtc/' + op.to, dest);
          await put(dest, await src.find('backup/dtc/' + op.from).read());
          nDtc++;
        } catch (e) {
          failed++;
          bad('backup/dtc/' + op.from, e);
        }
      }
      if (plan.ops.some(p => p.mode === 'new'))
        await put(J(dDir, 'index.json'), enc.encode(JSON.stringify(plan.map, null, 1)));
    } catch (e) {
      failed++;
      bad('backup/dtc', e);
    }
    // kneeboard: backup\kneeboard\index.json (folder of the DDS files -> sub-folder)
    try {
      const rest = f => f.path.slice('backup/kneeboard/'.length).split('/'),
        inKb = src.files.filter(f => lower(f.path).startsWith('backup/kneeboard/')),
        ixf = src.find('backup/kneeboard/index.json'),
        sMap = ixf ? parseJson(txt(await ixf.read())) : null,
        sSubs = new Map();
      for (const f of inKb) {
        const r = rest(f);
        if (r.length === 1 && lower(r[0]) !== 'index.json') (sSubs.get('') || sSubs.set('', []).get('')).push(r[0]);
        else if (r.length === 2) (sSubs.get(lower(r[0])) || sSubs.set(lower(r[0]), []).get(lower(r[0]))).push(r[1]);
      }
      const kDir = J(appDir, 'backup', 'kneeboard'),
        dMapRaw = parseJson((await readText(J(kDir, 'index.json'))) || ''),
        dMap = isObj(dMapRaw) ? dMapRaw : {},
        dSubs = new Map(),
        top = await safeList(io, kDir);
      dSubs.set('', new Set(top.filter(e => !e.isDirectory && lower(e.name) !== 'index.json').map(e => lower(e.name))));
      for (const e of top)
        if (e.isDirectory)
          dSubs.set(
            lower(e.name),
            new Set((await safeList(io, J(kDir, e.name))).filter(x => !x.isDirectory).map(x => lower(x.name)))
          );
      const plan = planKbBackups(dMap, dSubs, isObj(sMap) ? sMap : {}, sSubs, policy);
      for (const op of plan.ops) {
        try {
          if (op.mode === 'skip') {
            kept++;
            continue;
          }
          const dest = op.toSub ? J(kDir, op.toSub, op.name) : J(kDir, op.name),
            from = 'backup/kneeboard/' + (op.fromSub ? op.fromSub + '/' : '') + op.name;
          if (op.mode === 'replace')
            await saveFirst('backup/kneeboard/' + (op.toSub ? op.toSub + '/' : '') + op.name, dest);
          await put(dest, await src.find(from).read());
          nKb++;
        } catch (e) {
          failed++;
          bad('backup/kneeboard/' + op.name, e);
        }
      }
      if (JSON.stringify(plan.map) !== JSON.stringify(dMap))
        await put(J(kDir, 'index.json'), enc.encode(JSON.stringify(plan.map, null, 1)));
    } catch (e) {
      failed++;
      bad('backup/kneeboard', e);
    }
    tick(all.filter(f => cat(f) === 'backups').length);
    const parts = [
      nDtc ? 'DTC ' + plural(nDtc, 'file') : '',
      nKb ? 'kneeboard ' + plural(nKb, 'file') : '',
      kept ? plural(kept, 'file') + ' kept as they were' : '',
    ].filter(Boolean);
    row(
      'backups',
      'Backups of your originals',
      failed ? 'failed' : nDtc + nKb ? 'done' : 'kept',
      (parts.join(' · ') || 'Nothing new') + '.'
    );
  }

  stage('Done');
  if (o.progress) o.progress({ done: total, total, stage: 'Done' });
  const order = ['settings', 'prefs', 'squad', 'missions', 'kb', 'backups'];
  rows.sort((a, b) => order.indexOf(a.k) - order.indexOf(b.k));
  return {
    rows,
    errors,
    notes,
    written: [...written],
    safety: safeName ? 'backup\\' + safeName : '',
    changed: rows.some(r => r.state === 'done'),
    missionsDir: destMissions,
  };
}

/**
 * Packs the data of this copy of the program into a zip. The files that cannot be read are listed in `errors`; the rest is packed.
 * @param {object} o
 * @param {any} o.io
 * @param {string} o.appDir
 * @param {string} o.version the version of the program
 * @param {Date} [o.now]
 * @param {(p:{done:number,total:number,stage:string})=>void} [o.progress]
 */
export async function buildBackup(o) {
  const { io } = o,
    now = o.now || new Date(),
    src = await sourceFromFolder(io, o.appDir),
    errors = [],
    list = src.files.filter(f => f.path !== 'squadron.json.new');
  const total = list.length + 1,
    sum = list.reduce((n, f) => n + f.size, 0);
  const z = new ZipWriter(sum + list.length * 200 + 1024);
  let done = 0;
  const step = () => o.progress && o.progress({ done: Math.min(++done, total), total, stage: 'Packing your data…' });
  let count = 0;
  for (const f of list) {
    try {
      let bytes;
      if (f.path === 'squadron.json') {
        // the newest complete copy of the squadron file, under the name of the main one
        const fresh = src.find('squadron.json.new'),
          fb = fresh ? await fresh.read() : null,
          mb = await f.read(),
          p = pickSquadron(fb ? txt(fb) : null, txt(mb));
        bytes = p.from === 'new' ? fb : mb;
      } else bytes = await f.read();
      z.add(f.path, bytes, now);
      count++;
    } catch (e) {
      errors.push({ file: f.path, error: msg(e) });
    }
    step();
  }
  if (!src.find('squadron.json') && src.find('squadron.json.new')) {
    try {
      z.add('squadron.json', await src.find('squadron.json.new').read(), now);
      count++;
    } catch (e) {
      errors.push({ file: 'squadron.json.new', error: msg(e) });
    }
  }
  z.add(
    MANIFEST,
    enc.encode(
      JSON.stringify(
        {
          format: FORMAT,
          version: 1,
          app: 'BMS Cards',
          appVersion: o.version,
          created: now.toISOString(),
          files: count,
        },
        null,
        1
      )
    ),
    now
  );
  step();
  return {
    bytes: z.finish(),
    name: 'BMS-Cards-backup-' + dateStamp(now) + '.zip',
    count,
    errors,
  };
}
