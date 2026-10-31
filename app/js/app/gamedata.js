import { BMS_TESTED } from '../core/version.js';
import {
  isDesktop,
  readBytes,
  readExeRange,
  fileExists,
  findFiles,
  detectBms,
  saveConfig,
  listDir,
} from '../platform/desktop.js';
import { exeVersion, compareVersion } from '../bmsdata/exever.js';
import {
  parseTheaterList,
  theaterDirs,
  parseTdf,
  allNames,
  buildTables,
  FILES,
  OPTIONAL,
  parseTheaterTxt,
  pathFor,
  ENCODING,
  parseAircraftData,
} from '../bmsdata/bmsdata.js';
import { CAM } from '../core/cam-core.js';
import { setGeo } from '../rules/geo.js';
import { ocdPath } from '../core/targets.js';
import { parseAtc, buildAirbases } from '../bmsdata/airbases.js';
import { parseAip } from '../bmsdata/aip.js';
import { pdfTextItems } from '../platform/pdf.js';
import { ST } from './state.js';
import { $, jp, esc } from './base.js';
import { kbSyncTheater } from './kneeboard.js';
import { TDATA } from './dtctargets.js';
import { mapV } from './pages.js';
import { fillCampaigns, selectCampaign, wxPage } from './campaign.js';
import { loadRunways } from './perf.js';

/* ---------- Game data from the BMS installation ---------- */
export let GAMEDATA = {
  status:
    'No game data yet: the program reads it from your Falcon BMS installation (desktop app, BMS install folder in Settings)',
};
export let GLOBAL_PATHS = null;
export let GLOBAL_FOR = '';
export async function loadTheaters() {
  ST.THEATERS = [];
  const inst = ST.CFG.paths.bmsInstall,
    dec = b => new TextDecoder('latin1').decode(b);
  if (isDesktop() && inst) {
    const data = jp(inst, 'Data');
    try {
      let lp = jp(data, 'Theater.lst');
      try {
        await readBytes(lp);
      } catch (e) {
        lp = (await findFiles(inst, ['Theater.lst'], 3))['Theater.lst'];
      }
      for (const e of parseTheaterList(dec(await readBytes(lp)))) {
        try {
          ST.THEATERS.push(theaterDirs(e, parseTdf(dec(await readBytes(jp(data, e))))));
        } catch (_) {}
      }
    } catch (_) {}
  }
  ST.TH = ST.THEATERS.find(t => t.name === ST.CFG.theater) || ST.THEATERS[0] || null;
  const sel = $('tsel');
  sel.style.display = ST.THEATERS.length ? '' : 'none';
  sel.innerHTML = ST.THEATERS.map(t => `<option value="${esc(t.name)}">${esc(t.name)}</option>`).join('');
  if (ST.TH) sel.value = ST.TH.name;
}
// Loads one after the other, the last request wins: a slow load of a theater left behind can never finish in the middle of the next one and mix their tables.
let LOADGEN = 0,
  LOADING = Promise.resolve();
export function loadGameData(reloadTheaters = true) {
  const gen = ++LOADGEN,
    run = LOADING.then(() => (gen === LOADGEN ? readGameData(reloadTheaters) : undefined));
  LOADING = run.catch(() => {});
  return run;
}
async function readGameData(reloadTheaters) {
  if (isDesktop() && !ST.CFG.paths.bmsInstall) {
    const d = await detectBms();
    if (d) {
      ST.CFG.paths.bmsInstall = d;
      try {
        await saveConfig(ST.CFG);
      } catch (e) {}
    }
  }
  if (reloadTheaters) await loadTheaters();
  try {
    kbSyncTheater(ST.TH && ST.TH.name);
  } catch (e) {}
  if (!isDesktop() || !ST.CFG.paths.bmsInstall) {
    GAMEDATA = {
      status: 'No game data: the BMS install folder is not set',
      warn: isDesktop()
        ? [
            'The BMS install folder is not set and was not detected. Set it in Settings: the program reads its game data (aircraft, weapons, objects, airbases, radio) from your Falcon BMS installation and nothing works without it.',
          ]
        : ['The game data is read from your Falcon BMS installation: use the desktop app.'],
    };
    return;
  }
  try {
    GAMEDATA = { status: 'Reading game data from the BMS folder…' };
    const inst = ST.CFG.paths.bmsInstall,
      names = [...allNames(), 'Airbase.lst', 'KTO_AIP.pdf'],
      paths = {};
    if (ST.TH) {
      const data = jp(inst, 'Data');
      for (const rel of [ST.TH.objects, ST.TH.campaign, ST.TH.terrain, ST.TH.base]) {
        if (!rel) continue;
        Object.assign(
          paths,
          Object.fromEntries(
            Object.entries(
              await findFiles(
                jp(data, rel),
                names.filter(n => !paths[n]),
                3
              )
            ).filter(([k]) => !paths[k])
          )
        );
      }
    }
    // an add-on theater has its own campaign numbers, radio map, airbases ...: what it lacks is NOT taken from the other theaters (the numbers would match other places)
    const ADDON = !!(ST.TH && ST.TH.base && ST.TH.base.length),
      KEYED = new Set(['campobjdata.xml', 'stations+ils.dat', 'airbase.lst', 'kto_aip.pdf', 'radiomap.dat', 'ppt.ini']),
      need = names.filter(n => !paths[n] && !(ADDON && KEYED.has(n.toLowerCase())));
    if (need.length) {
      if (GLOBAL_FOR !== inst) {
        GLOBAL_PATHS = await findFiles(inst, names);
        GLOBAL_FOR = inst;
      }
      for (const n of need) if (GLOBAL_PATHS[n]) paths[n] = GLOBAL_PATHS[n];
    }
    {
      const dn = f => f.replace(/[\\/][^\\/]*$/, '');
      ST.OBJDIR = paths['Falcon4_CT.xml']
        ? dn(paths['Falcon4_CT.xml'])
        : ST.TH && ST.TH.objects
          ? jp(inst, 'Data', ST.TH.objects)
          : '';
      ST.OBJCAMP = paths['CampObjData.XML'] || (ST.OBJDIR ? jp(ST.OBJDIR, 'CampObjData.XML') : '');
      // CampObjData.XML and the ObjectiveRelatedData folder (runways, features) are side by side: an add-on theater that has its own CampObjData must not read the OCD folders of another theater
      try {
        const cd = paths['CampObjData.XML'] ? dn(paths['CampObjData.XML']) : '';
        if (
          cd &&
          cd !== ST.OBJDIR &&
          (await listDir(cd)).some(e => e.isDirectory && /^objectiverelateddata$/i.test(e.name))
        )
          ST.OBJDIR = cd;
      } catch (e) {}
      TDATA.reset();
      try {
        mapV.objectsChanged(); // the objects drawn on the map are those of the new theater
      } catch (e) {}
    }
    {
      let g = null;
      try {
        if (ST.TH) {
          const data = jp(inst, 'Data'),
            ds = [ST.TH.newterrain, ST.TH.terrain, ['TerrData', ST.TH.name]].filter(Boolean);
          for (const d of ds) {
            for (const sub of ['', 'NewTerrain', 'HeightMaps', 'NewTerrain/HeightMaps']) {
              try {
                g = parseTheaterTxt(new TextDecoder('latin1').decode(await readBytes(jp(data, d, sub, 'Theater.txt'))));
              } catch (e) {
                g = null;
              }
              if (g) break;
            }
            if (g) break;
          }
        }
      } catch (e) {
        g = null;
      }
      ST.GEOWARN =
        !g && ST.TH && !/korea/i.test(ST.TH.name)
          ? 'Theater.txt of ' +
            ST.TH.name +
            ' not found (or without the centre of the theater): the positions on the map are those of Korea, so they will be wrong.'
          : '';
      if (g) setGeo(g.lat, g.lon);
      else setGeo();
      ST.THGEO = g;
      const gk = g ? g.lat + ',' + g.lon : 'k';
      const tk = (ST.TH ? ST.TH.name : '') + '|' + gk; // a theater whose centre is not read has the key of Korea: the theater name tells them apart
      if (tk !== ST.GEOKEY && !(ST.GEOKEY === 'k' && gk === 'k')) {
        ST.GEOKEY = tk;
        try {
          mapV.theaterChanged();
        } catch (e) {}
        try {
          wxPage.resetView();
        } catch (e) {}
      }
    }
    if (!ST.D_BASE) ST.D_BASE = { ...CAM.D };
    Object.assign(CAM.D, ST.D_BASE); // the tables of the theater left behind must not stay when the new one lacks a file
    const r = await buildTables(async k => {
      const p = pathFor(paths, k);
      if (!p) return null;
      return new TextDecoder(ENCODING[k]).decode(await readBytes(p));
    });
    Object.assign(CAM.D, r.tables);
    CAM.D.navOcd = [];
    try {
      if (ST.OBJDIR && CAM.D.ob)
        for (const k of new Set(CAM.D.ob.filter(o => CAM.D.ab[o[0]] && o[4] > 0).map(o => o[4])))
          try {
            const x = new TextDecoder('utf-8').decode(await readBytes(jp(ST.OBJDIR, ...ocdPath(k).split('/'))));
            if (/<Name>[^<]*(Nav\s*Beacon|\bVOR|TACAN|\bNDB)/i.test(x)) CAM.D.navOcd.push(k);
          } catch (e) {}
    } catch (e) {}
    let acInfo = '';
    const warn = [];
    if (ST.GEOWARN) warn.push(ST.GEOWARN);
    try {
      const tdir = p => p.replace(/[\\/][^\\/]*$/, '');
      const atcDir = paths['Airbase.lst'] ? tdir(paths['Airbase.lst']) : '';
      const atc = [];
      if (atcDir)
        for (const e of await listDir(atcDir)) {
          if (e.isDirectory || !/\.dat$/i.test(e.name)) continue;
          const a = parseAtc(new TextDecoder('latin1').decode(await readBytes(jp(atcDir, e.name))));
          if (a) atc.push(a);
        }
      let aipList = null;
      if (paths['KTO_AIP.pdf']) {
        try {
          aipList = parseAip(await pdfTextItems(await readBytes(paths['KTO_AIP.pdf'])));
          if (!aipList.length) aipList = null;
        } catch (e) {
          aipList = null;
        }
      }
      if (atc.length || aipList) {
        const b = buildAirbases({ atc, aipList, ob: CAM.D.ob, ab: CAM.D.ab });
        CAM.D.ap = b.ap;
        CAM.D.api = b.api;
        CAM.D.el = Object.assign({}, CAM.D.el, b.el);
        CAM.D.tn = Object.assign({}, CAM.D.tn, b.tn);
        acInfo +=
          ' Runways: ' +
          Object.keys(b.ap).length +
          ' airbases (' +
          atc.length +
          ' ATC files, AIP ' +
          (aipList ? 'read' : 'not found') +
          ').';
        loadRunways(atc);
      } else {
        acInfo += ' Runways: no ATC files or AIP found.';
        warn.push('Runways: no ATC files or AIP found (runway lengths and airbase data will be missing).');
      }
    } catch (e) {
      acInfo += ' Runways could not be read (' + ((e && e.message) || e) + ').';
      warn.push('Runways could not be read: ' + ((e && e.message) || e));
    }
    try {
      const data = jp(inst, 'Data');
      let dir = ST.TH && ST.TH.sim ? jp(data, ST.TH.sim, 'Acdata') : jp(data, 'Sim', 'Acdata');
      let ents = await listDir(dir);
      if (!ents.length) {
        const f = (await findFiles(inst, ['F-16CM-40.txtpb'], 6))['F-16CM-40.txtpb'];
        if (f) {
          dir = f.replace(/[\\/][^\\/]*$/, '');
          ents = await listDir(dir);
        }
      }
      const fl = ents.filter(e => !e.isDirectory && /^F-1[56].*\.txtpb$/i.test(e.name));
      const files = [];
      for (const e of fl)
        files.push({ name: e.name, text: new TextDecoder('utf-8').decode(await readBytes(jp(dir, e.name))) });
      if (files.length) {
        const a = parseAircraftData(files);
        CAM.D.ew = a.ew;
        CAM.D.fi = a.fi;
        CAM.D.hp = a.hp;
        acInfo += ' Aircraft data: ' + files.length + ' F-16/F-15 files.';
      } else {
        acInfo += ' Aircraft data not found (Data\\Sim\\Acdata); the Performance page and the weights need it.';
        warn.push('Aircraft data not found (Data\\Sim\\Acdata): the Performance page and the weights need it.');
      }
    } catch (e) {
      acInfo += ' Aircraft data could not be read.';
      warn.push('Aircraft data could not be read.');
    }
    // the version of the game (Details of Bin\x64\Falcon BMS.exe): a warning when it is not the one the readers were checked with
    let bmsVer = '',
      bmsVerNote = '';
    try {
      const exe = jp(inst, 'Bin', 'x64', 'Falcon BMS.exe');
      if (!(await fileExists(exe)))
        bmsVerNote = 'Falcon BMS.exe not found in Bin\\x64, the game version is not checked.';
      else {
        const why = [],
          v = await exeVersion((o, l) => readExeRange(exe, o, l), why);
        if (!v)
          bmsVerNote =
            'The version of Falcon BMS.exe could not be read (' +
            why.join('; ') +
            '), the game version is not checked.';
        else if (v.every(x => !x))
          bmsVerNote = 'Falcon BMS.exe has no version number (0.0.0.0), the game version is not checked.';
        const cv = compareVersion(v, BMS_TESTED);
        bmsVer = cv.text;
        if (cv.level == 'newer' || cv.level == 'other')
          warn.push(
            'This is Falcon BMS ' +
              cv.text +
              ', the program was checked with ' +
              BMS_TESTED +
              (cv.level == 'newer'
                ? ': a newer game may have changed some files, and some data may be missing or wrong.'
                : ': some data may be missing or wrong.')
          );
      }
    } catch (e) {
      bmsVerNote = 'The game version could not be read (' + ((e && e.message) || e) + ').';
    }
    const used = Object.keys(r.tables).join(', ') || 'none';
    if (r.changed && r.changed.length)
      warn.push(
        'These files do not have the layout this program was checked with (Falcon BMS ' +
          BMS_TESTED +
          '), fields not found: ' +
          r.changed.join('; ') +
          '. A newer BMS may have changed them: some data may be missing or wrong.'
      );
    if (r.missing.length)
      warn.push(
        'Files not found in the BMS folder: ' + r.missing.join(', ') + ' (what depends on them will be empty).'
      );
    if (r.errors.length) warn.push('Files that could not be read: ' + r.errors.join('; '));
    GAMEDATA = {
      warn,
      status:
        (ST.TH ? 'Theater: ' + ST.TH.name + '. ' : '') +
        (bmsVer ? 'Falcon BMS ' + bmsVer + '. ' : bmsVerNote ? bmsVerNote + ' ' : '') +
        'Game data: ' +
        r.found.length +
        '/' +
        (Object.keys(FILES).length - OPTIONAL.size) +
        ' files found; tables read: ' +
        used +
        (r.missing.length ? '; not found: ' + r.missing.join(', ') : '') +
        '; folders: ' +
        [...new Set(Object.values(paths).map(p => p.replace(/[\\/][^\\/]*$/, '')))].join(' | ') +
        (r.errors.length ? '; problems: ' + r.errors.join('; ') : '') +
        '.' +
        acInfo +
        ' Other tables use the built-in version.',
    };
  } catch (e) {
    GAMEDATA = {
      warn: ['Could not read the game data: ' + ((e && e.message) || e) + ' (nothing is shown that depends on them).'],
      status: 'Could not read game data (' + ((e && e.message) || e) + ')',
    };
  }
}

// run 16: statements that run when the program starts (in the order of the original file)
export async function init16() {
  let tgen = 0;
  $('tsel').onchange = async () => {
    const gen = ++tgen; // another choice made while this one is loading: only the last one goes on
    ST.CFG.theater = $('tsel').value;
    try {
      await saveConfig(ST.CFG);
    } catch (e) {}
    if (gen !== tgen) return;
    ST.TH = ST.THEATERS.find(t => t.name === ST.CFG.theater) || ST.TH;
    await loadGameData(false);
    if (gen !== tgen) return;
    await fillCampaigns();
    if (gen !== tgen) return;
    await selectCampaign('');
  };
}
