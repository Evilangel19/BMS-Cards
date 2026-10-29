import {
  onCloseGuard,
  loadPrefs,
  isDesktop,
  join as joinPath,
  saveBlob as saveFile,
  pickFile,
  readBytes,
  listDir,
} from '../platform/desktop.js';
import { getGeo } from '../rules/geo.js';
import { APP_VERSION } from '../core/version.js';
import * as PJ from '../core/mission.js';
import { parseDtc } from '../parsers/dtc.js';
import { CAM } from '../core/cam-core.js';
import { ST } from './state.js';
import { $, IO, appToast, enc8, esc, jclone } from './base.js';
import { DTCTEXT, S, dtcOverwrite, dtcRevert, lines, parse, restoreDtc, view, openDtc } from './dtcfile.js';
import { F, FD } from './datacard.js';
import { WXDIR, WXS, campCancel, dtcDir, setSel, wxKeys, wxLoadKeys } from './campaign.js';
import { harmPage, mapV, pfPage, sqPage } from './pages.js';
import { loadImg } from './cardview.js';
import { acMemo, perfAcGet } from './gamefiles.js';
import { apply, discardOk, hasMan, manClear, manDiff, markMan } from './selection.js';
import { atoCloseState, atoSearch } from './ato.js';
import { dtcBtns, dtcReloaded } from './dtcapply.js';

/* Mission (core/mission.js): one folder per package = the mission file (package taken out of the campaign, the DTC as opened with its changes kept apart, the datacard with its
   automatic and manual values), the program settings, the cards and a copy of the original kneeboards. The mission works without the campaign. */
export const MSFPREFS = ['mapprefs.json', 'dtcprefs.json', 'dtcdefaults.json', 'mfddefault.json'];
// what the open campaign, TE or mission offers to name packages and flights of a squadron: the selected flight and all the flights
export function msfIdent() {
  const list = ST.CL || [];
  if (!ST.C || !list.length) return null;
  const no = x => {
      const P = ST.C.byId && ST.C.byId[x.f.pkg.n + ':' + x.f.pkg.c];
      return String((P && P.campId) || x.f.pkg.n);
    },
    cs = x => x.label.split(' · ')[0] || '',
    x = list[+$('fsel').value || 0] || list[0],
    uniq = a => [...new Set(a.filter(Boolean))];
  const map = {};
  for (const y of list) (map[no(y)] = map[no(y)] || []).push(cs(y));
  return { pk: no(x), fl: cs(x), pks: uniq(list.map(no)), fls: uniq(list.map(cs)), map };
}
// default name of a mission: package number + callsign of the flight, e.g. "1301 Hawkeye 4"
export function msfName(x) {
  const p = x.label.split(' · '),
    P = ST.C && ST.C.byId && ST.C.byId[x.f.pkg.n + ':' + x.f.pkg.c],
    no = (P && P.campId) || x.f.pkg.n;
  return PJ.safeName(no + ' ' + (p[0] || ''));
}
export function msfCardKeys() {
  return Object.keys(F).filter(
    k => ((typeof F[k] == 'string' || typeof F[k] == 'number') && !/^__/.test(k)) || k == '__taf'
  );
}
export async function wxPack(u8) {
  const s = new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate')),
    b = new Uint8Array(await new Response(s).arrayBuffer());
  let t = '';
  for (let i = 0; i < b.length; i += 8192) t += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
  return btoa(t);
}
export async function wxBuild(f) {
  try {
    await wxLoadKeys(wxKeys(f));
  } catch (e) {}
  const series = {};
  for (const k of wxKeys(f)) {
    const w = WXS.get(k);
    if (w && w.raw) series[k] = await wxPack(w.raw);
  }
  if (!(ST.WX && ST.WX.raw) && !Object.keys(series).length) return null;
  const o = {};
  if (ST.WX && ST.WX.raw) o.fmap = await wxPack(ST.WX.raw);
  if (Object.keys(series).length) o.series = series;
  return o;
}
export async function wxUnpack(t) {
  const b = Uint8Array.from(atob(t), c => c.charCodeAt(0)),
    s = new Blob([b]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
// the weapons data (Weapons page, HARM and BVR pages): an attack profile travels with the mission
export function msfWeapons() {
  try {
    return { wp: jclone(ST.wpPage.state()), harm: jclone(harmPage.state()), bvr: jclone(ST.msPage.state()) };
  } catch (e) {
    return null;
  }
}
export async function msfMapshot(u) {
  if (!u) {
    ST.MAPSHOT = null;
    return;
  }
  try {
    const im = await loadImg(u),
      c = document.createElement('canvas');
    c.width = im.naturalWidth;
    c.height = im.naturalHeight;
    c.getContext('2d').drawImage(im, 0, 0);
    ST.MAPSHOT = c;
  } catch (e) {}
}
// who made a mission: the id kept by this installation (squadron page) and the callsign; a mission made by somebody else brings the DTC groups, not the DTC itself
export const myIdent = () => {
  try {
    const d = sqPage && sqPage.db && sqPage.db(),
      m = sqPage && sqPage.me && sqPage.me();
    return { uid: (d && d.uid) || '', callsign: (m && m.callsign) || '' };
  } catch (e) {
    return { uid: '', callsign: '' };
  }
};
// program settings kept beside a saved mission (settings.json): no paths and no keys
export async function msfSettings() {
  const c = jclone(ST.CFG) || {};
  delete c.paths;
  if (c.map) {
    c.map.satUrl = '';
    c.map.satKey = '';
  }
  if (c.squadron) c.squadron.trackers = '';
  const prefs = {};
  for (const n of MSFPREFS) {
    const o = await loadPrefs(n);
    if (o) prefs[n] = o;
  }
  return { config: c, prefs };
}
export async function msfBuild() {
  const i = +$('fsel').value || 0,
    x = ST.CL[i];
  if (!ST.C || !x) throw new Error('Select a flight first (a campaign or a mission must be open).');
  const dtc = lines.length
    ? {
        name: ST.name,
        enc: (ST.DTCF && ST.DTCF.enc) || 'utf-8',
        bom: !!(ST.DTCF && ST.DTCF.bom),
        original: DTCTEXT,
        edits: PJ.dtcEditsAgainst(parseDtc(DTCTEXT), lines),
        share: { groups: PJ.dtcShare(lines).map(g => ({ ...g, on: g.mission })) },
        author: myIdent(),
      }
    : null;
  const final = {},
    auto = {};
  msfCardKeys().forEach(k => {
    final[k] = typeof F[k] == 'number' ? String(F[k]) : F[k]; // numbers (airfield elevations) travel as text like the other fields
  });
  FD.forEach(d => {
    const a = ST.AUTO && ST.AUTO[d.k];
    auto[d.k] = a || a === 0 ? String(a) : '';
  });
  const manual = PJ.diffFields(
    ST.AUTO || {},
    F,
    FD.map(d => d.k)
  );
  let aircraft = null;
  try {
    const an = ST.C.D.ac[x.f.c.i],
      d = an && (await perfAcGet(an));
    if (d) aircraft = { name: an, perf: d };
  } catch (e) {}
  return PJ.buildMission({
    app: 'BMS Cards',
    name: msfName(x),
    flight: x.f.id.n + ':' + x.f.id.c,
    snapshot: PJ.snapshotCampaign(ST.C, x.f, { radiusNm: ST.CFG.mission.radiusNm }),
    dtc,
    datacard: { label: x.label, auto, manual, final },
    settings: null,
    version: APP_VERSION,
    theater: { name: (ST.TH && ST.TH.name) || '', lat: getGeo().lat, lon: getGeo().lon },
    weather: await wxBuild(x.f),
    aircraft,
    tanks: mapV.tanks(),
    weapons: msfWeapons(),
    mapshot: ST.MAPSHOT ? ST.MAPSHOT.toDataURL('image/png') : null,
  });
}
export async function msfSave() {
  try {
    const msf = await msfBuild(),
      text = JSON.stringify(msf);
    if (!isDesktop()) {
      saveFile(new Blob([text]), PJ.missionFolder.file(msf.name), '');
      MSFSIG = msfSig();
      ST.XBASE = extraSig();
      appToast('Mission saved: ' + PJ.missionFolder.file(msf.name));
      return;
    }
    const app = await IO.appDir(),
      base = ST.CFG.paths.missions || joinPath(app, 'missions'),
      dir = joinPath(base, msf.name);
    if (
      (await IO.fileExists(joinPath(dir, PJ.missionFolder.file(msf.name)))) &&
      !(await confirm('The mission "' + msf.name + '" already exists:\n\n' + dir + '\n\nOverwrite it?'))
    )
      return;
    await IO.makeDir(dir);
    await IO.writeBytes(joinPath(dir, PJ.missionFolder.file(msf.name)), enc8(text));
    await IO.writeBytes(joinPath(dir, PJ.missionFolder.settings), enc8(JSON.stringify(await msfSettings(), null, 1)));
    MSFDIR = dir;
    MSFSIG = msfSig();
    ST.XBASE = extraSig();
    appToast('Mission saved in: ' + dir);
  } catch (e) {
    alert('Could not save the mission: ' + ((e && e.message) || e));
  }
}
// ---- missions to send to other pilots ----
const missionsBase = async () => ST.CFG.paths.missions || joinPath(await IO.appDir(), 'missions');
// the sources of a mission to send: the current one, or one saved in the missions folder (desktop app)
export async function msfSources() {
  const out = [{ id: '', label: 'Current mission (the selected flight)' }];
  if (!isDesktop()) return out;
  try {
    const base = await missionsBase();
    for (const e of await listDir(base)) {
      if (!e.isDirectory) continue;
      const f = joinPath(joinPath(base, e.name), PJ.missionFolder.file(e.name));
      if (await IO.fileExists(f)) out.push({ id: f, label: e.name });
    }
  } catch (e) {}
  return out;
}
// the missions saved in the missions folder (the ones that were received too): [{id (the file), name}]
export async function msfList() {
  return (await msfSources()).filter(x => x.id);
}
// deletes the folder of a saved mission (never the ones sent to the other pilots); true when it is gone
export async function msfRemove(id) {
  const base = await missionsBase(),
    dir = id.replace(/[\\/][^\\/]*$/, '');
  if (!dir || dir === base || !dir.startsWith(base)) throw new Error('This is not a mission folder.');
  return IO.removeDir(dir);
}
// a mission received from another pilot is kept in the missions folder (desktop app) under its own name; one that exists already is never overwritten: " (2)", " (3)"...; returns the folder or null
export async function msfStoreReceived(text, name) {
  if (!isDesktop()) return null;
  const r = PJ.parseMission(text);
  if (r.error) throw new Error(r.error);
  const base = await missionsBase(),
    stem = PJ.safeName(name || r.mission.name);
  let n = stem,
    k = 2;
  while (await IO.fileExists(joinPath(base, n))) n = stem + ' (' + k++ + ')';
  const dir = joinPath(base, n);
  await IO.makeDir(dir);
  await IO.writeBytes(joinPath(dir, PJ.missionFolder.file(n)), enc8(text));
  return dir;
}
const msfRead = async id => {
  const r = PJ.parseMission(new TextDecoder().decode(await readBytes(id)));
  if (r.error) throw new Error(r.error);
  return r.mission;
};
// the DTC groups a source can send: [{id, label, mission, count}]
export async function msfGroupsOf(id) {
  const m = id ? await msfRead(id) : await msfBuild();
  return PJ.shareFromSaved(m.dtc).map(g => ({ id: g.id, label: g.label, mission: g.mission, count: g.items.length }));
}
// the mission as it travels: the DTC reduced to its one block, no program settings
export async function msfForSend(id) {
  const m = id ? await msfRead(id) : await msfBuild();
  return PJ.shareMission(m, PJ.shareFromSaved(m.dtc));
}
// the block of a received mission: shows what it does to the open DTC and what may not fit; true = apply
function askBlock(g, diff, warns, dtcName, author) {
  return new Promise(res => {
    const o = document.createElement('div');
    o.id = 'msfgrp';
    o.style.cssText =
      'position:fixed;inset:0;z-index:2000;background:#000b;display:flex;align-items:center;justify-content:center';
    o.innerHTML = `<div style="background:var(--card);border:1px solid var(--line);border-radius:10px;padding:18px 22px;max-width:560px;width:92%;max-height:86vh;overflow:auto;color:var(--tx);font:13px system-ui,sans-serif;box-shadow:0 10px 30px #000a"><h3 style="margin:0 0 6px;font-size:15px">DTC data of the mission${author && author.callsign ? ' · from ' + esc(author.callsign) : ''}</h3>
 <div style="margin-bottom:8px">Applied to your open DTC <b>${esc(dtcName || '')}</b>: ${esc(g.label)}. These data replace yours so the points of the two DTCs never mix; the rest of your DTC (MFD, EWS, radio, Link 16...) is not touched.</div>
 <div class="hint" style="margin-bottom:8px">${diff.change} lines change · ${diff.add} new · ${diff.clear} of yours emptied · ${diff.same} already equal</div>
 ${warns.map(w => `<div style="margin:6px 0;padding:6px 9px;border:1px solid #c90;border-radius:6px;color:#fc6">⚠ ${esc(w)}</div>`).join('')}
 <div class="hint" style="margin-top:8px">It stays in the program until you write the DTC (Write button of the DTC page): nothing in BMS changes before that.</div>
 <div class="bar" style="margin-top:14px;justify-content:flex-end;gap:8px"><button class="btn g" data-x>Do not apply</button><button class="btn g gn" data-ok>Apply to my DTC</button></div></div>`;
    const done = v => {
      o.remove();
      res(v);
    };
    o.querySelector('[data-ok]').onclick = () => done(true);
    o.querySelector('[data-x]').onclick = () => done(false);
    document.body.append(o);
  });
}
// the DTC of this pilot opened by itself: <callsign>.ini of the DTC folder (never the name of the author of the mission); false when there is none
async function msfOwnDtc() {
  const cs = (myIdent().callsign || '').trim(),
    dir = dtcDir();
  if (!isDesktop() || !cs || !dir) return false;
  const path = joinPath(dir, cs + '.ini');
  try {
    if (!(await IO.fileExists(path))) return false;
    const b = await readBytes(path);
    await openDtc({
      name: cs + '.ini',
      path,
      arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
    });
    return lines.length > 0;
  } catch (e) {
    return false;
  }
}
// no DTC is open and the pilot's own was not found: the choice waits for him ('open' his DTC, 'skip' = the mission without its DTC data, 'cancel')
function askNoDtc(author) {
  const cs = (myIdent().callsign || '').trim(),
    dir = dtcDir(),
    why = !cs
      ? 'Your callsign is not set (Squadron page, Me): with it the program opens <callsign>.ini of the DTC folder by itself.'
      : !dir
        ? 'The DTC folder is not known: set the BMS install folder (or the DTC folder) in Settings.'
        : '"' + cs + '.ini" was not found in ' + dir + '.';
  return new Promise(res => {
    const o = document.createElement('div');
    o.id = 'msfnodtc';
    o.style.cssText =
      'position:fixed;inset:0;z-index:2000;background:#000b;display:flex;align-items:center;justify-content:center';
    o.innerHTML = `<div style="background:var(--card);border:1px solid var(--line);border-radius:10px;padding:18px 22px;max-width:560px;width:92%;max-height:86vh;overflow:auto;color:var(--tx);font:13px system-ui,sans-serif;box-shadow:0 10px 30px #000a"><h3 style="margin:0 0 6px;font-size:15px">No DTC is open${author && author.callsign ? ' · mission from ' + esc(author.callsign) : ''}</h3>
 <div style="margin-bottom:8px">The mission brings its DTC data (steerpoints, targets, PPT, lines, weapon targets, nav offsets, bomb profiles, laser codes, Bingo / Alow): they go into <b>your own DTC</b>, and no DTC is open. ${esc(why)}</div>
 <div style="margin:6px 0;padding:6px 9px;border:1px solid #c90;border-radius:6px;color:#fc6">⚠ Without a DTC the mission opens without them: the map, the Weapons page and the Data Cartridge do not show the points of the mission.</div>
 <div class="bar" style="margin-top:14px;justify-content:flex-end;gap:8px;flex-wrap:wrap"><button class="btn g" data-x>Cancel</button><button class="btn g" data-skip>Open without the DTC data</button><button class="btn g gn" data-ok>Open my DTC…</button></div></div>`;
    const done = v => {
      removeEventListener('keydown', esc0, true);
      o.remove();
      res(v);
    };
    const esc0 = e => {
      if (e.key == 'Escape') {
        e.stopPropagation();
        done('cancel');
      }
    };
    addEventListener('keydown', esc0, true);
    o.querySelector('[data-ok]').onclick = () => done('open');
    o.querySelector('[data-skip]').onclick = () => done('skip');
    o.querySelector('[data-x]').onclick = () => done('cancel');
    document.body.append(o);
    o.querySelector('[data-ok]').focus();
  });
}
// a mission made by somebody else: its DTC block goes into the DTC of this pilot; true when lines were written, false when not, null = the pilot cancelled (the mission is not opened)
async function msfShared(d) {
  const groups = PJ.shareFromSaved(d);
  if (!groups.length) return false;
  if (!lines.length) await msfOwnDtc();
  while (!lines.length) {
    const c = await askNoDtc(d.author);
    if (c == 'cancel') return null;
    if (c == 'skip') return false;
    const f = await pickFile({
      exts: ['ini'],
      startDir: dtcDir(),
      title: 'Open your DTC: the mission will be applied to it',
    });
    if (f) await openDtc(f);
  }
  const g = groups[0],
    cur = lines.map(l => ({ s: l.s, k: l.k, v: l.v })),
    diff = PJ.shareDiff(cur, g),
    warns = [],
    cs = (myIdent().callsign || '').trim();
  if (cs && String(ST.name).toLowerCase() !== (cs + '.ini').toLowerCase())
    warns.push(
      'You are applying the mission to "' +
        ST.name +
        '", but your callsign in the roster is "' +
        cs +
        '": BMS loads "' +
        cs +
        '.ini" for you, so this may not be the DTC used in the game.'
    );
  if (diff.missing.length)
    warns.push(
      'Your DTC has no section ' +
        diff.missing.map(x => '[' + x + ']').join(', ') +
        ': ' +
        diff.lost +
        ' lines of the mission cannot be applied. This DTC may not be compatible with the mission.'
    );
  if (diff.add > 0)
    warns.push(
      diff.add +
        ' lines of the mission do not exist in your DTC (a different DTC layout or version?) and will be added. The mission may not be compatible with this DTC.'
    );
  if (!(await askBlock(g, diff, warns, ST.name, d.author))) return false;
  const r = PJ.applyShare((a, b, c) => S(a, b, c), groups, [g.id], cur);
  dtcReloaded();
  dtcBtns();
  $('fn').textContent = ST.name + ' · mission applied (' + r.n + ' lines)';
  if (r.skipped) appToast(r.skipped + ' lines were NOT applied: your DTC has no section for them.');
  return r.n > 0;
}
// true when the mission was opened (false: refused, cancelled or failed; the program is as it was)
export async function msfLoad(text, file) {
  const no = m => {
    if (m) alert(m);
    return false;
  };
  const r = PJ.parseMission(text);
  if (r.error) return no(r.error);
  const p = r.mission;
  if (!p.package || !p.datacard) return no('This mission has no package.');
  // the units of the mission are read with the tables of the game (names, aircraft, tankers, objects): without them the flights and the map would be wrong
  if (!CAM.D.ct.length)
    return no(
      'The game data is missing: set the BMS install folder in Settings, then open the mission again. The program reads the names, the aircraft, the tankers and the objects from your Falcon BMS installation.' +
        (isDesktop() ? '' : ' (desktop app)')
    );
  if (
    p.theater &&
    p.theater.name &&
    ST.TH &&
    ST.TH.name &&
    p.theater.name !== ST.TH.name &&
    !(await confirm(
      'This mission was made on the theater "' +
        p.theater.name +
        '" and this computer has "' +
        ST.TH.name +
        '" selected: positions and names would be wrong.\n\nChoose the right theater in the top bar first.\n\nOK = open anyway, Cancel = go back.'
    ))
  )
    return false;
  if (ST.C && !(await discardOk())) return false;
  const mine = !p.dtc || !p.dtc.author || !p.dtc.author.uid || p.dtc.author.uid === myIdent().uid,
    own = !!(p.dtc && mine && typeof p.dtc.original == 'string'); // a mission saved by this installation brings its DTC back; one of somebody else only its DTC block
  if (
    p.dtc &&
    dtcDirty() &&
    !(await confirm(
      own
        ? 'The DTC open now has changes not written to its file. Loading this mission replaces that DTC: those changes are lost.\n\nContinue?'
        : 'The DTC open now has changes not written to its file. The mission will add its DTC data on top of them.\n\nContinue?'
    ))
  )
    return false;
  let C2, CL2;
  try {
    C2 = PJ.restoreCampaign(p.package, CAM.D);
    CL2 = CAM.listFlights(C2, null);
  } catch (e) {
    return no(
      'Could not open the mission: its package is damaged (' + ((e && e.message) || e) + '). Nothing was changed.'
    );
  }
  if (!CL2.length) return no('Could not open the mission: it has no flight. Nothing was changed.');
  // what the mission replaces, kept before the DTC of the pilot is touched: a failure from here on puts everything back
  const snap = msfSnapshot(),
    back = () => {
      try {
        msfRestore(snap);
      } catch (e2) {}
    };
  let shared = false;
  if (p.dtc && !own) {
    try {
      shared = await msfShared(p.dtc);
    } catch (e) {
      back();
      return no(
        'Could not apply the DTC data of the mission: ' + ((e && e.message) || e) + '\nThe mission was not opened.'
      );
    }
    if (shared === null) {
      back(); // the pilot cancelled: the mission is not opened (and a DTC opened meanwhile without lines is closed again)
      return false;
    }
  }
  // everything that can fail while reading the file is prepared first: weather and map picture
  const wxSeries = new Map();
  let wxNow = null,
    shot = null;
  try {
    if (p.weather && p.weather.series) {
      for (const k of Object.keys(p.weather.series)) {
        try {
          wxSeries.set(+k, CAM.parseFmap(await wxUnpack(p.weather.series[k])));
        } catch (e) {}
      }
    }
    if (p.weather && p.weather.fmap) {
      try {
        wxNow = CAM.parseFmap(await wxUnpack(p.weather.fmap));
      } catch (e) {}
    }
    if (p.mapshot) {
      try {
        const im = await loadImg(p.mapshot),
          c = document.createElement('canvas');
        c.width = im.naturalWidth;
        c.height = im.naturalHeight;
        c.getContext('2d').drawImage(im, 0, 0);
        shot = c;
      } catch (e) {}
    }
  } catch (e) {
    back();
    return no('Could not open the mission: ' + ((e && e.message) || e) + '\nNothing was changed.');
  }
  try {
    campCancel(); // a campaign of the menu still loading must not come over the mission
    ST.NOPERF = true;
    WXS.clear();
    WXDIR.files = null;
    ST.C = C2;
    ST.CL = CL2;
    manClear();
    ST.WX = null;
    ST.L16 = null;
    ST.IFFP = null;
    ST.CAMSEL = '';
    setSel('');
    ST.MSFAC = {};
    if (p.aircraft && p.aircraft.perf) {
      ST.MSFAC[p.aircraft.name] = p.aircraft.perf;
      acMemo.delete(p.aircraft.name);
    }
    pfPage.refresh();
    wxSeries.forEach((v, k) => WXS.set(k, v));
    ST.WX = wxNow;
    try {
      mapV.setTanks(Array.isArray(p.tanks) ? p.tanks : []);
    } catch (e) {}
    let i = ST.CL.findIndex(x => x.f.id.n + ':' + x.f.id.c == p.datacard.flight);
    if (i < 0) i = 0;
    $('fsel').innerHTML = ST.CL.map((x, k) => `<option value="${k}">${esc(x.label)}</option>`).join('');
    $('fsel').value = i;
    $('cinfo').textContent = 'Mission: ' + p.name;
    ST.MSFLOCK = { C: C2, key: p.datacard.flight };
    [...$('fsel').options].forEach((o, k) => {
      o.disabled = k !== i;
    });
    if (own) {
      ST.name = PJ.dtcFileName(p.dtc.name);
      let dpath = null;
      if (isDesktop()) {
        const cur = ST.DTCF && ST.DTCF.path; // where the DTC is written comes only from this computer: the DTC file open now (same name) or the DTC folder of the settings; the path stored in a mission file is never used
        if (cur && PJ.dtcFileName(cur) === ST.name) dpath = cur;
        else if (dtcDir()) dpath = joinPath(dtcDir(), ST.name);
      }
      ST.DTCF = { path: dpath, enc: p.dtc.enc || 'utf-8', bom: !!p.dtc.bom, orig: enc8(p.dtc.original) };
      parse(p.dtc.original);
      p.dtc.edits.forEach(e => S(e.s, e.k, e.v));
      $('fn').textContent = ST.name + ' · from the mission';
      dtcReloaded();
      dtcBtns();
    }
    ST.MSFCARD = {
      C: C2,
      key: p.datacard.flight,
      vals: Object.fromEntries(
        Object.entries(p.datacard.final || {}).filter(([k, v]) => typeof v == 'string' && v !== '' && !/^__/.test(k))
      ),
    }; // the card of the mission stays as the sender made it
    atoSearch();
    apply(i, 'fresh');
    const w = p.weapons;
    if (w) {
      try {
        w.wp && ST.wpPage.setState(w.wp);
        w.harm && harmPage.setState(w.harm);
        w.bvr && ST.msPage.setState(w.bvr);
      } catch (e) {}
    }
    const d = p.datacard;
    Object.assign(F, d.final || {});
    ST.MAPSHOT = shot;
    ST.AUTO = Object.assign({}, d.auto || ST.AUTO);
    ST.MANK = new Set(Object.keys(d.manual || {}));
    view();
    markMan();
    atoCloseState();
    atoSearch();
    ST.XBASE = extraSig();
    MSFSIG = shared ? '\u0000dtc-not-written' : msfSig(); // the DTC lines taken from the mission are not written yet: closing the program warns
    return true;
  } catch (e) {
    back(); // the program goes back to what it was before the mission
    return no('Could not open the mission: ' + ((e && e.message) || e) + '\nThe program was put back as it was.');
  } finally {
    ST.NOPERF = false;
  }
}
// the state a mission replaces, kept to put it back when the load fails halfway
const SNAPK = [
  'C',
  'CL',
  'OVR',
  'LDX',
  'AUTO',
  'CURK',
  'MANK',
  'WX',
  'L16',
  'IFFP',
  'CAMSEL',
  'MSFAC',
  'MSFLOCK',
  'MSFCARD',
  'MAPSHOT',
  'DTCF',
  'name',
  'XBASE',
  'ATOSEL',
];
export function msfSnapshot() {
  const s = {
    st: {},
    f: { ...F },
    lines: lines.map(l => ({ ...l })), // a copy: the DTC data of a mission are written into the same line objects
    dtc: DTCTEXT,
    wxs: new Map(WXS),
    files: WXDIR.files,
    weapons: msfWeapons(),
  };
  SNAPK.forEach(k => {
    s.st[k] = ST[k];
  });
  s.html = { fsel: $('fsel').innerHTML, sel: $('fsel').value, cinfo: $('cinfo').textContent, fn: $('fn').textContent };
  try {
    s.tanks = jclone(mapV.tanks());
  } catch (e) {
    s.tanks = [];
  }
  return s;
}
export function msfRestore(s) {
  SNAPK.forEach(k => {
    ST[k] = s.st[k];
  });
  Object.keys(F).forEach(k => delete F[k]);
  Object.assign(F, s.f);
  WXS.clear();
  s.wxs.forEach((v, k) => WXS.set(k, v));
  WXDIR.files = s.files;
  $('fsel').innerHTML = s.html.fsel;
  $('fsel').value = s.html.sel;
  $('cinfo').textContent = s.html.cinfo;
  $('fn').textContent = s.html.fn;
  [...$('fsel').options].forEach(o => {
    o.disabled = false;
  });
  if (ST.MSFLOCK) [...$('fsel').options].forEach((o, k) => (o.disabled = String(k) !== s.html.sel));
  restoreDtc(s.dtc, s.lines);
  dtcBtns();
  try {
    mapV.setTanks(s.tanks);
  } catch (e) {}
  try {
    if (mapV.isReady()) mapV.refreshDtc();
  } catch (e) {}
  try {
    s.weapons && s.weapons.wp && ST.wpPage.setState(s.weapons.wp);
    s.weapons && s.weapons.harm && harmPage.setState(s.weapons.harm);
    s.weapons && s.weapons.bvr && ST.msPage.setState(s.weapons.bvr);
  } catch (e) {}
  try {
    view();
    markMan();
    atoSearch();
  } catch (e) {}
}
// unsaved changes: the datacard fields typed by hand, the edited DTC lines; compared with what the last saved (or opened) mission held
export let MSFSIG = '';
export const dtcDirty = () => lines.some(l => l.dirty);
// the values of the DTC (not the 'edited' marks, which a Save DTC clears: saving the file is not a change of the mission)
// what a mission holds besides the datacard and the DTC: Weapons, HARM and BVR pages, tanker tracks, the map picture
export const extraSig = () => {
  try {
    const w = msfWeapons();
    if (w && w.wp) delete w.wp.fz; // read back from the DTC by the page when it opens: the DTC lines already count
    return JSON.stringify([w, mapV.tanks(), ST.MAPSHOT ? [ST.MAPSHOT.width, ST.MAPSHOT.height] : 0]);
  } catch (e) {
    return '';
  }
};
// the baseline is taken the first time it is asked after a flight is chosen or a mission is opened or saved
const extraChanged = () => {
  const s = extraSig();
  if (ST.XBASE === undefined) ST.XBASE = s;
  return s !== ST.XBASE;
};
export const msfSig = () => {
  try {
    return JSON.stringify([
      $('fsel').value,
      manDiff(),
      [...ST.OVR.entries()],
      lines.map(l => l.s + '|' + l.k + '|' + l.v),
      extraSig(),
    ]);
  } catch (e) {
    return '';
  }
};
// for the Save mission button of the map: lit while the mission is not saved as it is now (never saved, or something changed since; writing the DTC does not count as saving the mission)
export const missionToSave = () => !!$('fsel').value && msfSig() !== MSFSIG;
export const unsaved = () => (hasMan() || dtcDirty() || extraChanged()) && msfSig() !== MSFSIG;
export let MSFDIR = '';

// run 3: statements that run when the program starts (in the order of the original file)
export async function init3() {
  $('msfsave').onclick = msfSave;
  setInterval(() => {
    const b = $('msfsave');
    if (b) b.classList.toggle('nil', !unsaved());
    const mb = $('mpmsave');
    if (mb) mb.classList.toggle('nil', !missionToSave());
    if (document.body.classList.contains('onwp'))
      try {
        ST.wpPage.btn();
      } catch (e) {}
  }, 700);
  onCloseGuard(
    async () =>
      !unsaved() ||
      (await confirm(
        'There are changes not saved in a mission (and not written to the DTC). Close the program anyway?'
      )),
    unsaved
  );
  $('msfopen').onclick = async () => {
    const f = await pickFile({
      exts: ['bcrd'],
      startDir: MSFDIR || ST.CFG.paths.missions || '',
      title: 'Open a mission',
    });
    if (f) msfLoad(await f.text(), f);
  };
  $('wpapply').onclick = () => {
    if ($('wpapply').classList.contains('nil')) return;
    ST.wpPage.apply();
  };
  $('wpclear').onclick = () => {
    if ($('wpclear').classList.contains('nil')) return;
    ST.wpPage.clearAll();
  };
  $('saveow').onclick = dtcOverwrite;
  $('dtcrev').onclick = dtcRevert;
}
