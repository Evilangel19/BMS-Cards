// Moving the data between two copies of the program, and into / out of a backup file (app/js/core/transfer.js and transferrun.js), on a file system in memory.
import { DEFAULTS } from '../app/js/config/config.js';
import { ZipWriter } from '../app/js/core/zip.js';
import {
  categoryOf,
  dateStamp,
  findRoot,
  fmtSize,
  isDefaultConfig,
  missionsIn,
  pickSquadron,
  planConfig,
  planDtcBackups,
  planKbBackups,
  safeRel,
  samePath,
  summarize,
  uniqueName,
} from '../app/js/core/transfer.js';
import {
  buildBackup,
  describeSource,
  findProgramFolder,
  runImport,
  sourceFromFolder,
  sourceFromZip,
} from '../app/js/core/transferrun.js';
import { memfs } from './memfs.mjs';

let bad = 0,
  n = 0;
const ok = (name, cond) => {
  n++;
  if (!cond) {
    bad++;
    console.log('FAIL', name);
  }
};
const enc = new TextEncoder();
const J = (...p) => p.join('\\');
const clone = o => JSON.parse(JSON.stringify(o));
const DAY = new Date(2026, 10, 4, 12, 0, 0);

// ---------- the rules
ok('safeRel keeps a good path', safeRel('missions/A b/A b.bcrd') === 'missions/A b/A b.bcrd');
ok('safeRel turns \\ into /', safeRel('missions\\A\\A.bcrd') === 'missions/A/A.bcrd');
for (const bad1 of [
  '../x.json',
  'a/../../x',
  '/etc/x',
  'C:/x',
  'C:\\x',
  'a/b?.json',
  'a/b:c',
  'a/b.',
  'a/b ',
  '',
  '.',
  'a\0b',
])
  ok('safeRel refuses ' + JSON.stringify(bad1), safeRel(bad1) === null);
ok('safeRel drops "." and empty parts', safeRel('./a//b/./c.json') === 'a/b/c.json');
ok(
  'categoryOf',
  categoryOf('Config.json') === 'settings' &&
    categoryOf('mapprefs.json') === 'prefs' &&
    categoryOf('missions/A/A.bcrd') === 'missions' &&
    categoryOf('cardmemory/cards.json') === 'kb' &&
    categoryOf('backup/dtc/x.ini') === 'backups' &&
    categoryOf('backup/before-import-2026-11-04/config.json') === null &&
    categoryOf('data/webview/x') === null &&
    categoryOf('BMS-Cards.exe') === null
);
ok('findRoot: files at the top', findRoot(['config.json', 'missions/A/A.bcrd']) === '');
ok(
  'findRoot: one folder around',
  findRoot(['BMS-Cards/config.json', 'BMS-Cards/missions/A/A.bcrd', 'BMS-Cards/BMS-Cards.exe']) === 'BMS-Cards/'
);
ok(
  'findRoot: two folders around',
  findRoot(['x/BMS-Cards/config.json', 'x/BMS-Cards/squadron.json']) === 'x/BMS-Cards/'
);
ok('findRoot: nothing known', findRoot(['a/b.txt', 'c.txt']) === '');
ok(
  'uniqueName',
  uniqueName('a.ini', new Set()) === 'a.ini' &&
    uniqueName('a.ini', new Set(['a.ini'])) === 'a (2).ini' &&
    uniqueName('a.ini', new Set(['a.ini', 'a (2).ini'])) === 'a (3).ini' &&
    uniqueName('noext', new Set(['noext'])) === 'noext (2)' &&
    uniqueName('A.INI', new Set(['a.ini'])) === 'A (2).INI'
);
ok(
  'samePath ignores case, the separator and the last one',
  samePath('D:\\Games\\BMS-Cards\\', 'd:/games/bms-cards') && !samePath('D:\\a', 'D:\\b') && !samePath('', '')
);
ok(
  'fmtSize',
  fmtSize(0) === '0 KB' && fmtSize(700) === '700 B' && fmtSize(4096) === '4 KB' && fmtSize(3.2 * 1048576) === '3.2 MB'
);
ok('dateStamp is the local day', dateStamp(new Date(2026, 0, 5)) === '2026-01-05');
ok(
  'pickSquadron: the .new copy wins when whole',
  pickSquadron('{"a":1}', '{"a":2}').from === 'new' && pickSquadron('{"a":1}', '{"a":2}').db.a === 1
);
ok('pickSquadron: the main one when the .new copy is cut', pickSquadron('{"a":', '{"a":2}').from === 'main');
ok(
  'pickSquadron: none when both are broken',
  pickSquadron('x', '[1]').db === null && pickSquadron(null, null).from === ''
);

const dflt = clone(DEFAULTS);
ok('a new config is the default one', isDefaultConfig(dflt));
const auto = clone(DEFAULTS);
auto.paths.bmsInstall = 'C:\\BMS';
auto.ui.lastDtc = 'C:\\x.ini';
auto.theater = 'Korea KTO';
ok('the folder found by itself, the last file and the theater do not count', isDefaultConfig(auto));
const mineCfg = clone(DEFAULTS);
mineCfg.mission.radiusNm = 90;
ok('a changed setting counts', !isDefaultConfig(mineCfg));
const impCfg = clone(DEFAULTS);
impCfg.paths.bmsInstall = 'C:\\BMS';
impCfg.paths.campaigns = 'X:\\nowhere';
impCfg.mission.radiusNm = 120;
let pc = planConfig(impCfg, clone(DEFAULTS), 'keep', { bmsInstall: true });
ok('keep: a copy with default settings takes the imported ones', pc.use && pc.config.mission.radiusNm === 120);
ok(
  'a folder that does not exist here is not taken (and said)',
  pc.config.paths.campaigns === '' &&
    pc.config.paths.bmsInstall === 'C:\\BMS' &&
    pc.notes.length === 1 &&
    /Campaigns folder X:\\nowhere not found/.test(pc.notes[0])
);
pc = planConfig(impCfg, mineCfg, 'keep', { bmsInstall: true });
ok('keep: customized settings stay', !pc.use);
mineCfg.paths.campaigns = 'D:\\Mine';
pc = planConfig(impCfg, mineCfg, 'replace', { bmsInstall: true });
ok(
  'replace: the imported settings win, a missing folder keeps mine',
  pc.use &&
    pc.config.mission.radiusNm === 120 &&
    pc.config.paths.campaigns === 'D:\\Mine' &&
    /left as it was/.test(pc.notes[0])
);

// DTC backups
let d = planDtcBackups(
  { 'c:\\a.ini': 'a.ini' },
  new Set(['a.ini']),
  { 'c:\\a.ini': 'a.ini', 'd:\\a.ini': 'A.ini', 'c:\\b.ini': 'b.ini', 'c:\\gone.ini': 'gone.ini' },
  new Set(['a.ini', 'b.ini']),
  'replace'
);
ok(
  'dtc: the same original is replaced, the other original with the same name gets " (2)", a new one comes as it is, a copy missing in the source is ignored',
  d.ops.length === 3 &&
    d.ops[0].mode === 'replace' &&
    d.ops[1].to === 'A (2).ini' &&
    d.ops[2].to === 'b.ini' &&
    d.map['c:\\b.ini'] === 'b.ini' &&
    !('c:\\gone.ini' in d.map)
);
d = planDtcBackups({ 'c:\\a.ini': 'a.ini' }, new Set(['a.ini']), { 'd:\\a.ini': 'a.ini' }, new Set(['a.ini']), 'keep');
ok(
  'dtc: a name that is taken gets " (2)"',
  d.ops[0].to === 'a (2).ini' && d.map['d:\\a.ini'] === 'a (2).ini' && d.map['c:\\a.ini'] === 'a.ini'
);
d = planDtcBackups({ 'c:\\a.ini': 'a.ini' }, new Set(), { 'c:\\a.ini': 'a.ini' }, new Set(['a.ini']), 'keep');
ok('dtc: an entry whose copy is not there any more counts as new', d.ops[0].mode === 'new' && d.ops[0].to === 'a.ini');
// kneeboard backups
const subs = o => new Map(Object.entries(o).map(([k, v]) => [k, v]));
let k = planKbBackups(
  { 'c:\\kb': '' },
  subs({ '': new Set(['7982.dds']) }),
  { 'c:\\kb': '', 'd:\\other': 'folder 2', 'e:\\third': '' },
  subs({ '': ['7982.dds', '1403.dds'], 'folder 2': ['7982.dds'] }),
  'replace'
);
ok(
  'kb: the same folder -> into the same sub-folder; a new folder keeps its name; a second "root" one gets the next free name',
  k.map['c:\\kb'] === '' && k.map['d:\\other'] === 'folder 2' && k.map['e:\\third'] === 'folder 3'
);
ok(
  'kb ops: replace the same file, add the other',
  k.ops.find(o => o.toSub === '' && o.name === '7982.dds' && o.fromSub === '').mode === 'replace' &&
    k.ops.filter(o => o.mode === 'new').length >= 2
);
k = planKbBackups(
  { 'c:\\kb': '', 'c:\\kb2': 'folder 2' },
  subs({}),
  { 'd:\\x': '', 'd:\\y': 'folder 2' },
  subs({ '': ['a.dds'], 'folder 2': ['b.dds'] }),
  'keep'
);
ok('kb: names that are used go to the next free ones', k.map['d:\\x'] === 'folder 3' && k.map['d:\\y'] === 'folder 4');
k = planKbBackups({}, subs({}), { 'd:\\x': '' }, subs({ '': ['a.dds'] }), 'keep');
ok('kb: a program without backups gives the first folder the folder itself', k.map['d:\\x'] === '');

// missions, summary
const rels = [
  'missions/A/A.bcrd',
  'missions/A/settings.json',
  'missions/A/cards/01_x.png',
  'missions/B/B.bcrd',
  'missions/Broken/settings.json',
  'missions/loose.txt',
];
const ms = missionsIn(rels);
ok(
  'missionsIn: a mission has <name>.bcrd; the loose file and the folder without it are not missions',
  [...ms.keys()].join() === 'A,B' && ms.get('A').length === 3
);
const sm = summarize(
  [
    { path: 'config.json', size: 4000 },
    { path: 'mapprefs.json', size: 100 },
    { path: 'squadron.json', size: 30000 },
    ...rels.map(p => ({ path: p, size: 1048576 })),
    { path: 'cardmemory/cards.json', size: 10 },
    { path: 'cardmemory/cards/01_a.png', size: 10 },
    { path: 'cardmemory/cards/02_b.png', size: 10 },
    { path: 'backup/dtc/index.json', size: 10 },
    { path: 'backup/dtc/a.ini', size: 10 },
    { path: 'backup/kneeboard/index.json', size: 10 },
    { path: 'backup/kneeboard/7982.dds', size: 10 },
  ],
  { squads: 2 }
);
ok('summary lines in the order of the list', sm.map(i => i.k).join() === 'settings,prefs,squad,missions,kb,backups');
ok(
  'summary texts',
  sm[2].detail === '2 squadrons and your pilot identity' &&
    sm[3].detail === '2 saved missions' &&
    sm[4].detail === 'Page layout and 2 imported card pictures' &&
    sm[5].detail === 'DTC (1 file) and kneeboard (1 file)'
);
ok('the size of the missions counts the missions only', sm[3].size === 4 * 1048576);
ok('the chips', sm[2].chip[0] === 'wn' && sm[5].chip[0] === 'ok');

// ---------- the move itself: a folder of the older version
const OLD = 'D:\\Games\\BMS-Cards-1.0',
  NEW = 'C:\\app';
const oldCfg = clone(DEFAULTS);
Object.assign(oldCfg.paths, { bmsInstall: 'C:\\BMS', campaigns: 'X:\\nowhere' });
Object.assign(oldCfg.ui, { animations: false, autoLoad: true, lastCamp: 'x.cam' });
oldCfg.mission.radiusNm = 90;
oldCfg.squadron.trackers = 'wss://my.tracker';
oldCfg.map.satOn = true;
const sq2 = JSON.stringify({ uid: 'abc', squads: [{ id: 's1' }, { id: 's2' }], cs: 'Viper' });
const sq3 = JSON.stringify({ uid: 'abc', squads: [{ id: 's1' }, { id: 's2' }, { id: 's3' }], cs: 'Viper' });
const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
const dds = new Uint8Array(3000).map((_, i) => i % 251);
function makeOld(fs, root = OLD) {
  const P = (...p) => J(root, ...p);
  fs.put(P('config.json'), JSON.stringify(oldCfg, null, 2) + '\n');
  fs.put(P('BMS-Cards.exe'), 'MZ');
  fs.put(P('mapprefs.json'), '{"layers":["sam"]}');
  fs.put(P('perfprefs.json'), '{"p":1}');
  fs.put(P('dtcprefs.json'), '{"d":1}');
  fs.put(P('squadron.json'), sq2);
  fs.put(P('squadron.json.new'), sq3);
  fs.put(P('missions', 'A', 'A.bcrd'), 'MISSION-A');
  fs.put(P('missions', 'A', 'settings.json'), '{"config":{}}');
  fs.put(P('missions', 'A', 'cards.json'), '{"library":["01_x.png"]}');
  fs.put(P('missions', 'A', 'cards', '01_x.png'), png);
  fs.put(P('missions', 'B', 'B.bcrd'), 'MISSION-B');
  fs.put(P('missions', 'Broken', 'settings.json'), '{}');
  fs.put(P('cardmemory', 'cards.json'), '{"library":["01_pic.png"],"slots":[]}');
  fs.put(P('cardmemory', 'cards', '01_pic.png'), png);
  fs.put(
    P('backup', 'dtc', 'index.json'),
    JSON.stringify({ 'c:\\bms\\user\\config\\evil.ini': 'Evil.ini', 'd:\\x\\evil.ini': 'Evil (2).ini' })
  );
  fs.put(P('backup', 'dtc', 'Evil.ini'), 'ORIGINAL-EVIL');
  fs.put(P('backup', 'dtc', 'Evil (2).ini'), 'ORIGINAL-EVIL-2');
  fs.put(P('backup', 'kneeboard', 'index.json'), JSON.stringify({ 'c:\\bms\\kb': '', 'd:\\other': 'folder 2' }));
  fs.put(P('backup', 'kneeboard', '7982.dds'), dds);
  fs.put(P('backup', 'kneeboard', 'folder 2', '7982.dds'), dds.slice(0, 100));
  fs.put(P('data', 'webview', 'junk.bin'), 'never moved');
}
const freshApp = fs => {
  fs.put(J(NEW, 'config.json'), JSON.stringify(DEFAULTS, null, 2) + '\n');
  fs.put(J(NEW, 'BMS-Cards.exe'), 'MZ');
  fs.mkdir('C:\\BMS');
};
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const run = async (fs, src, picks, policy, cur) =>
  runImport({
    io: fs.io,
    src,
    appDir: NEW,
    picks,
    policy,
    cur: cur || { config: clone(DEFAULTS), missionsDir: J(NEW, 'missions') },
    today: DAY,
  });
const ALL = ['settings', 'prefs', 'squad', 'missions', 'kb', 'backups'];

{
  const fs = memfs();
  makeOld(fs);
  freshApp(fs);
  const found = await findProgramFolder(fs.io, OLD, NEW);
  ok('the program folder is found', found.dir === OLD);
  const src = await sourceFromFolder(fs.io, OLD);
  ok(
    'only the data of the program is listed (not the exe, the web profile, the folder without a mission file kept apart)',
    src.files.every(f => categoryOf(f.path)) && !src.files.some(f => /webview|\.exe/i.test(f.path))
  );
  const info = await describeSource(src, { missionsDir: J(NEW, 'missions') });
  ok(
    'six lines, 3 squadrons from the newer copy, 2 missions',
    info.items.map(i => i.k).join() === ALL.join() &&
      info.items[2].detail.startsWith('3 squadrons') &&
      info.items[3].detail === '2 saved missions'
  );
  ok(
    'sizes come from the files',
    info.items[4].size === enc.encode('{"library":["01_pic.png"],"slots":[]}').length + png.length &&
      info.items[0].size > 100
  );
  fs.clearWrites();
  const steps = [];
  const r = await runImport({
    io: fs.io,
    src,
    appDir: NEW,
    picks: ALL,
    policy: 'replace',
    cur: { config: clone(DEFAULTS), missionsDir: J(NEW, 'missions') },
    today: DAY,
    progress: p => steps.push(p),
  });
  ok('nothing is written in the older folder', !fs.writes.some(p => p.toLowerCase().startsWith(OLD.toLowerCase())));
  ok(
    'every row is done',
    r.rows.map(x => x.state).join() === 'done,done,done,done,done,done' && r.errors.length === 0 && r.changed
  );
  ok(
    'nothing was replaced, so no safety copy',
    r.safety === '' && !fs.has(J(NEW, 'backup', 'before-import-2026-11-04'))
  );
  const cfg = JSON.parse(fs.text(J(NEW, 'config.json')));
  ok(
    'the settings are imported; the folder that is not here is left out',
    cfg.mission.radiusNm === 90 &&
      cfg.ui.animations === false &&
      cfg.ui.autoLoad === true &&
      cfg.squadron.trackers === 'wss://my.tracker' &&
      cfg.map.satOn === true &&
      cfg.paths.bmsInstall === 'C:\\BMS' &&
      cfg.paths.campaigns === ''
  );
  ok(
    'and it is said',
    r.notes.length === 1 && /Campaigns folder/.test(r.notes[0]) && /Campaigns folder/.test(r.rows[0].detail)
  );
  ok(
    'the page preferences are copied as they are',
    fs.text(J(NEW, 'mapprefs.json')) === '{"layers":["sam"]}' &&
      fs.text(J(NEW, 'dtcprefs.json')) === '{"d":1}' &&
      !fs.has(J(NEW, 'mfddefault.json'))
  );
  ok(
    'the squadron file is the newest whole copy, in both names',
    fs.text(J(NEW, 'squadron.json')) === sq3 && fs.text(J(NEW, 'squadron.json.new')) === sq3
  );
  ok(
    'missions: A with everything in it, B; the folder without a mission file is left',
    fs.text(J(NEW, 'missions', 'A', 'A.bcrd')) === 'MISSION-A' &&
      same(fs.bytes(J(NEW, 'missions', 'A', 'cards', '01_x.png')), png) &&
      fs.text(J(NEW, 'missions', 'B', 'B.bcrd')) === 'MISSION-B' &&
      !fs.has(J(NEW, 'missions', 'Broken'))
  );
  const wA = fs.writes.filter(p => p.includes('\\missions\\A\\'));
  ok('the mission file is written last', /A\.bcrd$/.test(wA[wA.length - 1]));
  ok(
    'kneeboard cards',
    same(fs.bytes(J(NEW, 'cardmemory', 'cards', '01_pic.png')), png) &&
      fs.text(J(NEW, 'cardmemory', 'cards.json')).includes('01_pic.png')
  );
  const w = fs.writes.filter(p => p.includes('cardmemory'));
  ok('the arrangement is written after its pictures', /cards\.json$/.test(w[w.length - 1]));
  ok(
    'backups: DTC copies and their index, kneeboard files in their folders',
    fs.text(J(NEW, 'backup', 'dtc', 'Evil.ini')) === 'ORIGINAL-EVIL' &&
      JSON.parse(fs.text(J(NEW, 'backup', 'dtc', 'index.json')))['d:\\x\\evil.ini'] === 'Evil (2).ini' &&
      same(fs.bytes(J(NEW, 'backup', 'kneeboard', '7982.dds')), dds) &&
      fs.bytes(J(NEW, 'backup', 'kneeboard', 'folder 2', '7982.dds')).length === 100 &&
      JSON.parse(fs.text(J(NEW, 'backup', 'kneeboard', 'index.json')))['d:\\other'] === 'folder 2'
  );
  ok(
    'the names to protect from the old state of the program',
    ['config.json', 'mapprefs.json', 'squadron.json', 'squadron.json.new', 'cardmemory'].every(x =>
      r.written.includes(x)
    )
  );
  ok(
    'progress goes from the start to the end, in order',
    steps.length > 5 &&
      steps[steps.length - 1].done === steps[steps.length - 1].total &&
      steps.every((s, i) => i === 0 || s.done >= steps[i - 1].done) &&
      steps.some(s => /missions/.test(s.stage))
  );
}

// ---------- the same thing twice: nothing changes
{
  const fs = memfs();
  makeOld(fs);
  freshApp(fs);
  const src = await sourceFromFolder(fs.io, OLD);
  await run(fs, src, ALL, 'replace');
  const cur = { config: JSON.parse(fs.text(J(NEW, 'config.json'))), missionsDir: J(NEW, 'missions') };
  const before = fs
    .paths(NEW)
    .map(p => p + '=' + fs.bytes(p).length)
    .join('|');
  const r2 = await run(fs, src, ALL, 'replace', cur);
  const mid = fs
    .paths(NEW)
    .filter(p => !/before-import/.test(p))
    .map(p => p + '=' + fs.bytes(p).length)
    .join('|');
  ok('a second import of the same folder changes no data file', before === mid);
  ok(
    'and what it replaces is kept apart',
    r2.safety === 'backup\\before-import-2026-11-04' &&
      fs.has(J(NEW, 'backup', 'before-import-2026-11-04', 'config.json'))
  );
  const r3 = await run(fs, src, ALL, 'replace', cur);
  ok('a third one the same day makes another safety folder', r3.safety === 'backup\\before-import-2026-11-04 (2)');
}

// ---------- something exists in both places
function makeMine(fs) {
  const c = clone(DEFAULTS);
  c.mission.radiusNm = 70;
  c.paths.campaigns = 'D:\\MyCamp';
  fs.put(J(NEW, 'config.json'), JSON.stringify(c, null, 2) + '\n');
  fs.put(J(NEW, 'BMS-Cards.exe'), 'MZ');
  fs.mkdir('C:\\BMS');
  fs.put(J(NEW, 'mapprefs.json'), '{"mine":1}');
  fs.put(J(NEW, 'squadron.json'), '{"uid":"mine","squads":[{"id":"m1"}]}');
  fs.put(J(NEW, 'missions', 'A', 'A.bcrd'), 'MY-A');
  fs.put(J(NEW, 'missions', 'A', 'extra.json'), 'EXTRA');
  fs.put(J(NEW, 'cardmemory', 'cards.json'), '{"library":["01_old.png"]}');
  fs.put(J(NEW, 'cardmemory', 'cards', '01_old.png'), 'OLD-PNG');
  fs.put(
    J(NEW, 'backup', 'dtc', 'index.json'),
    JSON.stringify({ 'c:\\bms\\user\\config\\evil.ini': 'Evil.ini', 'e:\\other\\evil.ini': 'Other.ini' })
  );
  fs.put(J(NEW, 'backup', 'dtc', 'Evil.ini'), 'MY-EVIL');
  fs.put(J(NEW, 'backup', 'dtc', 'Other.ini'), 'MY-OTHER');
  fs.put(J(NEW, 'backup', 'kneeboard', 'index.json'), JSON.stringify({ 'c:\\bms\\kb': '' }));
  fs.put(J(NEW, 'backup', 'kneeboard', '7982.dds'), 'MY-DDS');
  return { config: c, missionsDir: J(NEW, 'missions') };
}
{
  const fs = memfs();
  makeOld(fs);
  const cur = makeMine(fs);
  const src = await sourceFromFolder(fs.io, OLD);
  const r = await run(fs, src, ALL, 'replace', cur);
  const sf = (...p) => J(NEW, 'backup', 'before-import-2026-11-04', ...p);
  ok('replace: the safety folder is named', r.safety === 'backup\\before-import-2026-11-04');
  ok(
    'replace: what was replaced is kept apart with its path',
    fs.text(sf('config.json')).includes('"radiusNm": 70') &&
      fs.text(sf('mapprefs.json')) === '{"mine":1}' &&
      fs.text(sf('squadron.json')).includes('"m1"') &&
      fs.text(sf('missions', 'A', 'A.bcrd')) === 'MY-A' &&
      fs.text(sf('cardmemory', 'cards', '01_old.png')) === 'OLD-PNG' &&
      fs.text(sf('cardmemory', 'cards.json')).includes('01_old') &&
      fs.text(sf('backup', 'dtc', 'Evil.ini')) === 'MY-EVIL' &&
      fs.text(sf('backup', 'kneeboard', '7982.dds')) === 'MY-DDS'
  );
  ok(
    'replace: what was not replaced is not copied',
    !fs.has(sf('missions', 'A', 'extra.json')) && !fs.has(sf('backup', 'dtc', 'Other.ini'))
  );
  ok(
    'replace: the imported ones are in place',
    JSON.parse(fs.text(J(NEW, 'config.json'))).mission.radiusNm === 90 &&
      fs.text(J(NEW, 'mapprefs.json')) === '{"layers":["sam"]}' &&
      fs.text(J(NEW, 'squadron.json')) === sq3 &&
      fs.text(J(NEW, 'missions', 'A', 'A.bcrd')) === 'MISSION-A' &&
      fs.text(J(NEW, 'backup', 'dtc', 'Evil.ini')) === 'ORIGINAL-EVIL' &&
      same(fs.bytes(J(NEW, 'backup', 'kneeboard', '7982.dds')), dds)
  );
  ok(
    'replace: a file of the mission that the other one does not have stays',
    fs.text(J(NEW, 'missions', 'A', 'extra.json')) === 'EXTRA'
  );
  ok(
    'replace: the copies of the other DTC files stay, the new ones are added without touching the names in use',
    fs.text(J(NEW, 'backup', 'dtc', 'Other.ini')) === 'MY-OTHER' &&
      fs.text(J(NEW, 'backup', 'dtc', 'Evil (2).ini')) === 'ORIGINAL-EVIL-2'
  );
  ok(
    'replace: the cards of this copy are replaced by the imported ones',
    fs.text(J(NEW, 'cardmemory', 'cards.json')).includes('01_pic.png') &&
      fs.has(J(NEW, 'cardmemory', 'cards', '01_pic.png'))
  );
  ok(
    'replace: the kneeboard folder of the other copy is added as a new one',
    fs.bytes(J(NEW, 'backup', 'kneeboard', 'folder 2', '7982.dds')).length === 100 &&
      JSON.parse(fs.text(J(NEW, 'backup', 'kneeboard', 'index.json')))['d:\\other'] === 'folder 2' &&
      JSON.parse(fs.text(J(NEW, 'backup', 'kneeboard', 'index.json')))['c:\\bms\\kb'] === ''
  );
  ok(
    'replace: the mission folder not in this copy is added',
    fs.text(J(NEW, 'missions', 'B', 'B.bcrd')) === 'MISSION-B'
  );
}
{
  const fs = memfs();
  makeOld(fs);
  const cur = makeMine(fs);
  const src = await sourceFromFolder(fs.io, OLD);
  const before = [
    'config.json',
    'mapprefs.json',
    'squadron.json',
    'missions\\A\\A.bcrd',
    'cardmemory\\cards.json',
    'cardmemory\\cards\\01_old.png',
    'backup\\dtc\\Evil.ini',
    'backup\\kneeboard\\7982.dds',
  ].map(p => p + '=' + fs.text(J(NEW, p)));
  const r = await run(fs, src, ALL, 'keep', cur);
  const after = [
    'config.json',
    'mapprefs.json',
    'squadron.json',
    'missions\\A\\A.bcrd',
    'cardmemory\\cards.json',
    'cardmemory\\cards\\01_old.png',
    'backup\\dtc\\Evil.ini',
    'backup\\kneeboard\\7982.dds',
  ].map(p => p + '=' + fs.text(J(NEW, p)));
  ok('keep: everything that exists here stays as it is', before.join('|') === after.join('|'));
  ok('keep: no safety folder', r.safety === '' && !fs.has(J(NEW, 'backup', 'before-import-2026-11-04')));
  ok(
    'keep: only what is missing is added (mission B, the second DTC copy, the other kneeboard folder, the page preferences not here)',
    fs.text(J(NEW, 'missions', 'B', 'B.bcrd')) === 'MISSION-B' &&
      fs.text(J(NEW, 'backup', 'dtc', 'Evil (2).ini')) === 'ORIGINAL-EVIL-2' &&
      fs.bytes(J(NEW, 'backup', 'kneeboard', 'folder 2', '7982.dds')).length === 100 &&
      fs.text(J(NEW, 'perfprefs.json')) === '{"p":1}'
  );
  ok(
    'keep: the rows say so',
    r.rows.find(x => x.k === 'settings').state === 'kept' &&
      r.rows.find(x => x.k === 'squad').state === 'kept' &&
      r.rows.find(x => x.k === 'kb').state === 'kept' &&
      r.rows.find(x => x.k === 'missions').state === 'done'
  );
}

// ---------- only some items
{
  const fs = memfs();
  makeOld(fs);
  freshApp(fs);
  const src = await sourceFromFolder(fs.io, OLD);
  const r = await run(fs, src, ['missions'], 'replace');
  ok(
    'only the chosen items are brought',
    r.rows.length === 1 &&
      fs.has(J(NEW, 'missions', 'A', 'A.bcrd')) &&
      !fs.has(J(NEW, 'squadron.json')) &&
      !fs.has(J(NEW, 'mapprefs.json')) &&
      !fs.has(J(NEW, 'cardmemory')) &&
      JSON.parse(fs.text(J(NEW, 'config.json'))).mission.radiusNm === 60
  );
}

// ---------- missions folders
{
  // the older copy keeps its missions in a folder of its own, and this one is told to use the same: nothing to copy
  const fs = memfs();
  makeOld(fs);
  freshApp(fs);
  const oc = clone(oldCfg);
  oc.paths.missions = 'D:\\MyMissions';
  fs.put(J(OLD, 'config.json'), JSON.stringify(oc));
  fs.put('D:\\MyMissions\\Z\\Z.bcrd', 'MISSION-Z');
  const src = await sourceFromFolder(fs.io, OLD);
  ok(
    'the missions folder of the older copy is the one in its settings',
    src.missionsDir === 'D:\\MyMissions' &&
      src.files.some(f => f.path === 'missions/Z/Z.bcrd') &&
      !src.files.some(f => f.path === 'missions/A/A.bcrd')
  );
  const r = await run(fs, src, ['settings', 'missions'], 'replace');
  ok(
    'settings with that folder, which exists here: the missions are already in place',
    JSON.parse(fs.text(J(NEW, 'config.json'))).paths.missions === 'D:\\MyMissions' &&
      r.rows.find(x => x.k === 'missions').detail === 'The same folder: nothing to copy.' &&
      r.missionsDir === 'D:\\MyMissions' &&
      !fs.has(J(NEW, 'missions'))
  );
  const fs2 = memfs();
  makeOld(fs2);
  freshApp(fs2);
  fs2.put(J(OLD, 'config.json'), JSON.stringify(oc));
  fs2.put('D:\\MyMissions\\Z\\Z.bcrd', 'MISSION-Z');
  const src2 = await sourceFromFolder(fs2.io, OLD);
  const info = await describeSource(src2, { missionsDir: 'D:\\MyMissions' });
  ok('the list says so when it is the same folder', info.items.find(i => i.k === 'missions').same === true);
  const r2 = await run(fs2, src2, ['missions'], 'replace');
  ok(
    'without the settings the missions come into the folder of this copy',
    fs2.text(J(NEW, 'missions', 'Z', 'Z.bcrd')) === 'MISSION-Z' && r2.rows[0].state === 'done'
  );
  // the settings name a folder that is not here (another computer): the missions folder of this copy is used
  const fs3 = memfs();
  makeOld(fs3);
  freshApp(fs3);
  const oc3 = clone(oldCfg);
  oc3.paths.missions = 'Q:\\Nowhere\\Missions';
  fs3.put(J(OLD, 'config.json'), JSON.stringify(oc3));
  const r3 = await run(fs3, await sourceFromFolder(fs3.io, OLD), ['settings', 'missions'], 'replace');
  ok(
    'a missions folder that is not here is not taken; the missions go to the default folder',
    JSON.parse(fs3.text(J(NEW, 'config.json'))).paths.missions === '' &&
      fs3.has(J(NEW, 'missions', 'A', 'A.bcrd')) &&
      r3.missionsDir === J(NEW, 'missions')
  );
}

// the missions folder is inside the older program folder: the path must not tie this copy to it
{
  // 1) the settings carry the absolute path of the missions folder of the older copy
  const fs = memfs();
  makeOld(fs);
  freshApp(fs);
  const oc = clone(oldCfg);
  oc.paths.missions = J(OLD, 'missions');
  fs.put(J(OLD, 'config.json'), JSON.stringify(oc));
  const src = await sourceFromFolder(fs.io, OLD);
  const info = await describeSource(src, { missionsDir: J(OLD, 'missions') });
  ok('inside the older folder is never "the same folder"', info.items.find(i => i.k === 'missions').same === false);
  const r = await run(fs, src, ['settings', 'missions'], 'replace');
  ok(
    'settings and missions: the path stays automatic and the missions are copied here',
    JSON.parse(fs.text(J(NEW, 'config.json'))).paths.missions === '' &&
      fs.text(J(NEW, 'missions', 'A', 'A.bcrd')) === 'MISSION-A' &&
      r.missionsDir === J(NEW, 'missions') &&
      r.rows.find(x => x.k === 'missions').state === 'done'
  );
  // 2) this copy is already tied to the older one (an import of the first kind was made before): it is put right
  const fs2 = memfs();
  makeOld(fs2);
  freshApp(fs2);
  const tied = clone(DEFAULTS);
  tied.paths.missions = J(OLD, 'missions');
  fs2.put(J(NEW, 'config.json'), JSON.stringify(tied, null, 2) + '\n');
  const r2 = await run(fs2, await sourceFromFolder(fs2.io, OLD), ['missions'], 'replace', {
    config: tied,
    missionsDir: J(OLD, 'missions'),
  });
  ok(
    'already tied to the older folder: back to the folder of this copy, the missions copied',
    JSON.parse(fs2.text(J(NEW, 'config.json'))).paths.missions === '' &&
      fs2.text(J(NEW, 'missions', 'A', 'A.bcrd')) === 'MISSION-A' &&
      r2.missionsDir === J(NEW, 'missions')
  );
}

// ---------- a backup file
{
  const fs = memfs();
  makeOld(fs, NEW); // this copy has the data
  const out = await buildBackup({ io: fs.io, appDir: NEW, version: '1.1.0-beta.9', now: DAY });
  ok('the backup is named by the day', out.name === 'BMS-Cards-backup-2026-11-04.zip');
  const src = sourceFromZip(out.bytes, out.name);
  const man = await src.manifest();
  ok(
    'the manifest says what it is',
    man.format === 'bms-cards-backup' &&
      man.appVersion === '1.1.0-beta.9' &&
      man.created === DAY.toISOString() &&
      man.files === out.count
  );
  ok(
    'the backup holds the data and nothing else: no exe, no web profile, no .new copy, one squadron file with the newest data',
    !src.files.some(f => /exe|webview|\.new$/i.test(f.path)) &&
      src.files.some(f => f.path === 'squadron.json') &&
      (await src.find('squadron.json').read()).length === sq3.length
  );
  ok(
    'the folder without a mission file is in the backup (it is the data of the pilot) but is not counted as a mission',
    src.files.some(f => f.path === 'missions/Broken/settings.json')
  );
  const info = await describeSource(src, { missionsDir: J(NEW, 'missions') });
  ok(
    'the list of a backup',
    info.items.map(i => i.k).join() === ALL.join() && info.items[3].detail === '2 saved missions' && !info.items[3].same
  );
  const fs2 = memfs();
  freshApp(fs2);
  const r = await run(fs2, src, ALL, 'replace');
  ok(
    'restored in a new folder: every file is the same',
    r.errors.length === 0 &&
      [
        'mapprefs.json',
        'perfprefs.json',
        'dtcprefs.json',
        'cardmemory\\cards.json',
        'missions\\A\\A.bcrd',
        'missions\\A\\cards\\01_x.png',
        'backup\\dtc\\Evil.ini',
        'backup\\dtc\\Evil (2).ini',
        'backup\\kneeboard\\7982.dds',
        'backup\\kneeboard\\folder 2\\7982.dds',
      ].every(p => same(fs2.bytes(J(NEW, p)), fs.bytes(J(NEW, p)))) &&
      ['backup\\dtc\\index.json', 'backup\\kneeboard\\index.json'].every(
        p => JSON.stringify(JSON.parse(fs2.text(J(NEW, p)))) === JSON.stringify(JSON.parse(fs.text(J(NEW, p))))
      ) &&
      fs2.text(J(NEW, 'squadron.json')) === sq3
  );
  const bk = await buildBackup({ io: fs2.io, appDir: NEW, version: '1.1.0-beta.9', now: DAY });
  const names = s =>
    sourceFromZip(s, 'x')
      .files.map(f => f.path + ':' + f.size)
      .sort()
      .join('|');
  const noSizes = t =>
    t
      .split('|')
      .filter(x => !/Broken/.test(x))
      .join('|')
      .replace(/(config|index)\.json:\d+/g, '$1.json')
      .replace(/\|/g, '\n');
  ok(
    'and a backup of the restored copy has the same files as the first one (the settings and the indexes were rewritten; the folder without a mission file is not a mission, so it stays behind)',
    noSizes(names(bk.bytes)) === noSizes(names(out.bytes))
  );
}
{
  // a zip of the whole program folder made by hand: one folder around everything, an exe, the web profile
  const z = new ZipWriter();
  z.add('BMS-Cards-1.0/', new Uint8Array(0));
  z.add('BMS-Cards-1.0/BMS-Cards.exe', enc.encode('MZ'));
  z.add('BMS-Cards-1.0/config.json', enc.encode(JSON.stringify(oldCfg)));
  z.add('BMS-Cards-1.0/missions/A/A.bcrd', enc.encode('MISSION-A'));
  z.add('BMS-Cards-1.0/data/webview/x.bin', enc.encode('junk'));
  z.add('BMS-Cards-1.0/../../evil.json', enc.encode('{}'));
  z.add('/abs.json', enc.encode('{}'));
  const src = sourceFromZip(z.finish(), 'whole.zip');
  ok(
    'a zip of a whole folder: the folder around is taken off, the rest is ignored, the unsafe names are counted',
    src.files
      .map(f => f.path)
      .sort()
      .join() === 'config.json,missions/A/A.bcrd' && src.unsafe === 2
  );
  const info = await describeSource(src, {});
  ok('and it is a good source', info.items.length === 2);
}
{
  const z = new ZipWriter();
  z.add('bms-cards-backup.json', enc.encode('{"format":"something-else"}'));
  z.add('config.json', enc.encode('{}'));
  let msg = '';
  try {
    await describeSource(sourceFromZip(z.finish(), 'other.zip'), {});
  } catch (e) {
    msg = e.message;
  }
  ok('a zip with another manifest is refused', /not a backup made by BMS Cards/.test(msg));
  const z2 = new ZipWriter();
  z2.add('notes.txt', enc.encode('hello'));
  const info = await describeSource(sourceFromZip(z2.finish(), 'n.zip'), {});
  ok('a zip with nothing of the program gives an empty list', info.items.length === 0);
}

// ---------- problems on the way
{
  const fs = memfs();
  makeOld(fs);
  freshApp(fs);
  fs.io.failOn = /missions\\B\\/;
  const src = await sourceFromFolder(fs.io, OLD);
  const r = await run(fs, src, ALL, 'replace');
  ok(
    'a mission that cannot be written is told, the others are copied',
    r.errors.length === 1 &&
      r.errors[0].file === 'missions/B' &&
      /Access is denied/.test(r.errors[0].error) &&
      fs.has(J(NEW, 'missions', 'A', 'A.bcrd')) &&
      r.rows.find(x => x.k === 'missions').state === 'failed'
  );
  ok(
    'and the rest of the items are done',
    r.rows.filter(x => x.k !== 'missions').every(x => x.state === 'done')
  );
  const fs2 = memfs();
  makeOld(fs2);
  freshApp(fs2);
  fs2.io.failOn = /missions\\A\\cards\\01_x\.png/;
  const r2 = await run(fs2, await sourceFromFolder(fs2.io, OLD), ['missions'], 'replace');
  ok(
    'a mission that stops in the middle does not show up as a mission (no mission file)',
    !fs2.has(J(NEW, 'missions', 'A', 'A.bcrd')) && r2.errors.length === 1 && fs2.has(J(NEW, 'missions', 'B', 'B.bcrd'))
  );
}
{
  const fs = memfs();
  makeOld(fs);
  freshApp(fs);
  fs.put(J(OLD, 'config.json'), '{ not json');
  fs.put(J(OLD, 'squadron.json'), '{"x":');
  fs.put(J(OLD, 'squadron.json.new'), '');
  fs.put(J(OLD, 'mapprefs.json'), 'garbage');
  const src = await sourceFromFolder(fs.io, OLD);
  const info = await describeSource(src, {});
  ok(
    'damaged settings and squadron files are marked',
    info.items.find(i => i.k === 'settings').problem !== '' && info.items.find(i => i.k === 'squad').problem !== ''
  );
  const r = await run(fs, src, ['settings', 'prefs', 'squad'], 'replace');
  ok(
    'and are not imported; a damaged preference file is skipped and counted',
    r.rows.find(x => x.k === 'settings').state === 'failed' &&
      r.rows.find(x => x.k === 'squad').state === 'failed' &&
      /1 damaged file skipped/.test(r.rows.find(x => x.k === 'prefs').detail) &&
      !fs.has(J(NEW, 'mapprefs.json')) &&
      !fs.has(J(NEW, 'squadron.json'))
  );
}
{
  // a squadron copy cut in half is not taken when the whole one is there
  const fs = memfs();
  makeOld(fs);
  freshApp(fs);
  fs.put(J(OLD, 'squadron.json.new'), '{"uid":"abc","squads":[');
  const r = await run(fs, await sourceFromFolder(fs.io, OLD), ['squad'], 'replace');
  ok(
    'a cut .new copy: the main file is the one imported',
    fs.text(J(NEW, 'squadron.json')) === sq2 && r.rows[0].state === 'done'
  );
}

// ---------- the folder that was chosen
{
  const fs = memfs();
  makeOld(fs);
  freshApp(fs);
  fs.mkdir('D:\\Games\\empty');
  fs.put('D:\\Games\\one\\BMS-Cards.exe', 'MZ');
  ok(
    'the folder that is in use is refused',
    (await findProgramFolder(fs.io, NEW, NEW)).error === 'self' &&
      (await findProgramFolder(fs.io, 'c:/APP/', NEW)).error === 'self'
  );
  ok(
    'a folder with a program folder in it: that one',
    (await findProgramFolder(fs.io, 'D:\\Games', NEW)).error === 'several'
  );
  fs.put('D:\\Games\\BMS-Cards-1.0\\config.json', '{}');
  ok(
    'several program folders are told',
    JSON.stringify((await findProgramFolder(fs.io, 'D:\\Games', NEW)).options.sort()) ===
      JSON.stringify(['BMS-Cards-1.0', 'one'])
  );
  ok(
    'a folder with nothing of the program',
    (await findProgramFolder(fs.io, 'D:\\Games\\empty', NEW)).error === 'none'
  );
  const fs2 = memfs();
  freshApp(fs2);
  fs2.put('D:\\Games\\BMS-Cards-1.0\\squadron.json', '{}');
  ok(
    'one program folder below the chosen one is taken',
    (await findProgramFolder(fs2.io, 'D:\\Games', NEW)).dir === 'D:\\Games\\BMS-Cards-1.0'
  );
}

console.log(bad ? `run-transfer.mjs: ${bad} of ${n} checks failed` : `run-transfer.mjs: OK - ${n} checks`);
process.exit(bad ? 1 : 0);
