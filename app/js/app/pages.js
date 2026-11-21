import { createMap } from '../core/mapview.js';
import { createOffsets } from '../core/mapoffs.js';
import { busyWrap } from '../core/busy.js';
import { CAM } from '../core/cam-core.js';
import { createMissilesPage } from '../core/missilespage.js';
import { createSeadPage } from '../core/seadpage.js';
import { createDeadPage } from '../core/deadpage.js';
import { taskOf } from '../core/sead.js';
import { harmCode } from '../core/harmcodes.js';
import { createWeaponsPage } from '../core/weaponspage.js';
import { createTargetPage } from '../core/tgtpage.js';
import { openTargetPicker } from '../core/targetpicker.js';
import { glyphOf } from '../core/mapsymbols.js';
import { SHOTS } from '../core/mapconst.js';
import { featState } from '../parsers/cam.js';
import { operational } from '../core/objstatus.js';
import { createSquadronPage } from '../core/squadron.js';
import {
  isDesktop,
  loadPrefs,
  savePrefs,
  loadPrefsSafe,
  savePrefsSafe,
  beforeClose,
  readBytes,
  fileSize,
  listDir,
  findFiles,
  join as joinPath,
  onFilesDropped,
} from '../platform/desktop.js';
import { createPerfPage } from '../core/perfpage.js';
import { msaOfFlight, msaOfBase } from './msafill.js';
import { dtcPoints, WT_N, FT_KM, sitMeta } from '../core/mapdtc.js';
import { targetLine, readTarget } from '../core/targets.js';
import { parseBombList, parseBombDat } from '../bmsdata/bombdata.js';
import {
  flightRoute as mFlightRoute,
  toLL as mToLL,
  fromLL as mFromLL,
  fmtLL as mFmtLL,
  mapUnits,
} from '../core/mapdata.js';
import { nearAb, nearObj } from '../core/flight.js';
// name of the campaign object closest to a point (campaign km), '' when there is none: precision targets have no name of their own
export const nearName = (x, y) => {
  try {
    const o = ST.C && nearObj(ST.C, x, y, 3);
    return o ? String(o[1]) : '';
  } catch (e) {
    return '';
  }
};
import { ST } from './state.js';
import { $, animOn, appToast, esc, jp } from './base.js';
import { acFolder, misLoad, perfAcGet, terrain, heightsOf } from './gamefiles.js';
import { G, S, dtcOverwrite, dtcRevert, lines, stpts, MERGED } from './dtcfile.js';
import { isShipBase, shipKind } from '../core/carriers.js';
import { PERFP, RLI, baseName, bvrCells, perfEnv, perfFill, perfSave, rwyAuto, rwyFt, imcOpt } from './perf.js';
import { targetData, wtAdd, wtList, wtPut } from './dtctargets.js';
import { ATOL, PLAYER, msLocked, atoSearch } from './ato.js';
import { l16Add, l16Can, l16Has, l16Mate, l16Plan, l16Preview, l16Remove } from './l16link.js';
import { apply } from './selection.js';
import { F, dtcChanged, setField } from './datacard.js';
import { applyDTC, dtcClear, dtcSet, sitOn, sitSetMeta } from './dtcapply.js';
import { kbAddShot, kbAddTray, kbAddPic, KBX } from './kneeboard.js';
import { draw } from './cardview.js';
import { SHOT } from '../core/cardlayout.js';
import { dtcDir, wxWind, wxAt, wxKey, wxLoadKeys, wxFlight } from './campaign.js';
import { openSettings } from './settings.js';
import { APP_VERSION } from '../core/version.js';
import {
  msfIdent,
  msfBuild,
  msfLoad,
  msfSources,
  msfGroupsOf,
  msfForSend,
  msfStoreReceived,
  msfFolders,
  msfFolderAdd,
  msfFolderRename,
  msfFolderDel,
  msfFolderMove,
  msfMove,
  msfSave,
  msfList,
  msfRemove,
  msfText,
  missionToSave,
} from './mission.js';
import { roeDraw, roeAllCards } from './roepage.js';
import { seatIdx, seatExists } from './seat.js';

export let mapV;
const OFFS = createOffsets(); // offsets placed on the Map page (route steerpoints 1-24), shown and written by the Weapons page
export let harmRoot;
export let harmPage;
export let seadPage; // Weapons > HARM > SEAD
export let deadPage; // Weapons > HARM > DEAD
export let harmTab; // the HARM tab of the Weapons page: SEAD or Single shot
// Squadron page: the pilot is read from the logbook (User\Config\*.lbk), the mission of the leader goes to the pilots peer to peer
export let sqPage;
export let pfPage;

// run 6: statements that run when the program starts (in the order of the original file)
export async function init6() {
  mapV = createMap($('mpbody'), {
    nearName,
    offs: OFFS,
    objects: {
      list: () => {
        const d = targetData();
        return d
          ? busyWrap('Loading the map objects…', d.objectives())
          : Promise.reject(new Error('Needs the BMS install folder (desktop app, Settings).'));
      },
      features: o => targetData().features(o),
      radars: () => {
        const d = targetData();
        return d && d.radars ? busyWrap('Loading the radars…', d.radars()) : Promise.resolve([]);
      },
    },
    attack: () => {
      const a = ST.wpPage && ST.wpPage.spec && ST.wpPage.spec();
      if (!a) return null;
      const ll = p => mapV.toLL(p.e / 3280.84, p.n / 3280.84);
      return {
        ghost: (a.ghost || []).map(pts => pts.map(ll)),
        segs: a.segs.map(z => ({ color: z.color, dash: z.dash, pts: z.pts.map(ll) })),
        marks: a.marks.map(m => ({ ll: ll(m.p), label: m.label, color: m.color, r: m.r, perm: m.perm })),
      };
    },
    selectFlight: f => {
      const e = ATOL.find(z => z.f === f);
      if (!e || ST.VIEW != PLAYER || e.heli || msLocked(f)) return false;
      const k = ST.CL.findIndex(x => x.f === f);
      if (k < 0) return false;
      $('fsel').value = k;
      apply(k);
      return true;
    },
    // Link 16 of the DTC: a flight of the package put in a file from the map (app/l16link.js)
    l16: {
      mate: f => l16Mate(ATOL.find(z => z.f === f)),
      can: l16Can,
      plan: l16Plan,
      has: l16Has,
      preview: l16Preview,
      add: l16Add,
      remove: l16Remove,
    },
    getC: () => ST.C,
    getWx: () => ST.WX,
    elev: async pts => {
      const t = await terrain();
      return t ? heightsOf(t, pts) : null;
    },
    getSel: () => ST.ATOSEL,
    msa: { route: msaOfFlight, base: msaOfBase },
    // speed (Mach/TAS), MSA and minimum fuel of steerpoint i of flight f, as the datacard holds them (only for the flight selected there)
    stp: (f, i) => {
      const x = ST.CL && ST.CL[+(document.getElementById('fsel') || {}).value || 0];
      if (!x || x.f !== f) return null;
      const g = j => String(F[`fp${i}_${j}`] == null ? '' : F[`fp${i}_${j}`]).trim();
      return { speed: g(4), msa: g(11), fuel: g(6) };
    },
    dtc: {
      points: () => dtcPoints(lines),
      wtargets: () => wtList(),
      wtAdd: () => wtAdd(),
      wtPut: t => wtPut(t),
      elev: async t => {
        try {
          const tr = await terrain();
          const h = tr ? await heightsOf(tr, [t]) : null;
          return h && h[0] !== null && h[0] !== undefined ? h[0] : 0;
        } catch (e) {
          return 0;
        }
      },
      wtClear: n => {
        S('STPT', 'wpntarget_' + n, targetLine(null));
        dtcChanged('STPT', 'wpntarget_' + n);
      },
      fileName: () => ST.name,
      dirty: () => lines.some(l => l.dirty) || MERGED.length > 0,
      open: () => $('open').click(),
      overwrite: () => dtcOverwrite(),
      revert: () => dtcRevert(),
      canOverwrite: () => !!(ST.DTCF && ST.DTCF.path),
      set: (g, slot, patch) => dtcSet(g, slot, patch, false),
      clear: (g, slot) => dtcClear(g, slot, false),
      sitOn: () => sitOn(),
      sitMeta: () => sitMeta(lines),
      setMeta: (n, patch) => sitSetMeta(n, patch, false),
    },
    saveMission: () => msfSave(),
    missionDirty: () => missionToSave(),
    satCfg: () => ST.CFG.map,
    loadPrefs: () => loadPrefs('mapprefs.json'),
    savePrefs: o => savePrefs('mapprefs.json', o),
    // The picture of the BMS folder, found but not read: its name and size (they are all that is needed to know whether the copies kept in the database are still
    // good) and read(), which gives the whole file, only called when the picture has to be decoded (the first time, or after a change of the file).
    localMapInfo: async () => {
      if (window.__localMapInfo) return window.__localMapInfo();
      if (window.__localMap) {
        const f = await window.__localMap();
        return { name: f.name, size: f.size, read: async () => f };
      }
      if (!isDesktop()) throw new Error('Only in the desktop app.');
      const d = ST.CFG.paths.bmsInstall;
      if (!d) throw new Error('Set the BMS folder in Settings first.');
      const sub = async (dir, rx) => (await listDir(dir)).find(e => rx.test(e.name)),
        pic = e => !e.isDirectory && /\.(jpe?g|png)$/i.test(e.name);
      let dir, f;
      if (ST.TH && ST.TH.docs) {
        // add-on theater: Data\<add-on>\Docs\<n> Maps\<theater>_UI_Map_16K.png
        const dd = jp(d, 'Data', ST.TH.docs),
          mp = await sub(dd, /maps/i);
        dir = mp && jp(dd, mp.name);
        const ls = dir ? await listDir(dir) : [];
        // the biggest picture of the folder: <theater>_UI_Map_16K (Hellas: HellasMap16K) or the 8K one (Israel: ITO_UI_Map_8K)
        const kk = e => +((/(\d+)k(?![a-z0-9])/i.exec(e.name.replace(/\.[^.]+$/, '')) || [])[1] || 0);
        f =
          ls.filter(e => pic(e) && kk(e) >= 4).sort((a, b) => kk(b) - kk(a))[0] ||
          ls.find(e => pic(e) && /map/i.test(e.name));
        if (!f)
          throw new Error('The map picture of ' + ST.TH.name + ' was not found (Docs\\...Maps folder of the theater).');
      } else {
        const docs = await sub(d, /^docs$/i),
          mp = docs && (await sub(jp(d, docs.name), /^05 maps$/i));
        dir = mp && jp(d, docs.name, mp.name);
        f = dir && (await listDir(dir)).find(e => !e.isDirectory && /^8_kto_16k_skyvector/i.test(e.name));
        if (!f) throw new Error('8_KTO_16k_Skyvector not found in Docs\\05 Maps of the BMS folder.');
      }
      const path = jp(dir, f.name);
      return {
        name: f.name,
        size: await fileSize(path),
        read: async () =>
          new File([await readBytes(path)], f.name, { type: /\.jpe?g$/i.test(f.name) ? 'image/jpeg' : 'image/png' }),
      };
    },
    canSelect: f => {
      const e = ATOL.find(z => z.f === f);
      return !!e && ST.VIEW == PLAYER && !e.heli && ST.CL.findIndex(x => x.f === f) >= 0;
    },
    mdcShot: () => {
      if (!ST.MDCON) return null;
      const w = SHOT[2] - SHOT[0],
        h = SHOT[3] - SHOT[1];
      return { w, h, out: 1124 };
    },
    setShot: (c, k, g) => {
      if (k == 'kb') kbAddShot(c);
      else if (k == 'tg') ST.tgPage && ST.tgPage.setShot(c, g);
      else {
        ST.MAPSHOT = c;
        draw();
      }
    },
    hasShot: () => !!ST.MAPSHOT,
    anim: animOn,
    getView: () => (ST.VIEW !== null ? ST.VIEW : ST.C && ST.C.playerTeam != null ? ST.C.playerTeam : 1),
    flightInfo: f => {
      const e = ATOL.find(z => z.f === f);
      return e
        ? {
            cat: e.cat,
            ac: e.ac,
            cs: e.callsign.toUpperCase().replace(/\s+/g, ''),
            text: e.callsign + ' · ' + e.n + '× ' + e.ac + ' · ' + e.mission + ' · ' + e.teamName,
          }
        : { cs: '?', text: 'Flight' };
    },
    esc: t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]),
    D: CAM.D,
  });
}

// Weapons > Target: the target picture (core/tgtpage.js) reads the DTC, the campaign, the objective files, the attack planner and the Map page through these
const curFlight = () => {
  try {
    const x = ST.C && ST.CL.length && ST.CL[+$('fsel').value || 0];
    return x ? x.f : null;
  } catch (e) {
    return null;
  }
};
function tgtDeps() {
  const PLACES = [8, 28, 29]; // cities, towns, villages: a target is never put on them
  return {
    esc,
    anim: animOn,
    toast: appToast,
    async points() {
      const pts = [],
        P = dtcPoints(lines);
      const f = curFlight();
      if (f && f.wps) {
        const a = f.wps.find(p => ![0, 1, 2, 3, 4, 7, 8].includes(p.act));
        if (a && [14, 15, 16, 17, 19].includes(a.act))
          pts.push({
            kind: 'flight',
            short: 'FLIGHT',
            ref: '',
            name: F.pri || 'Flight target',
            x: a.x,
            y: a.y,
            dmpi: false,
          });
      }
      if (P)
        (P.prec || [])
          .filter(q => !q.empty)
          .forEach(q =>
            pts.push({
              kind: 'prec',
              slot: q.slot,
              ref: 'TGT STPT ' + q.stpt,
              short: 'STPT ' + q.stpt,
              name: q.name || nearName(q.x, q.y) || 'STPT ' + q.stpt,
              x: q.x,
              y: q.y,
              altFt: q.altFt,
              dmpi: true,
            })
          );
      for (let n = 0; n < WT_N; n++) {
        if (!lines.some(l => l.s == 'STPT' && l.k === 'wpntarget_' + n)) continue;
        const t = readTarget(G('STPT', 'wpntarget_' + n, ''));
        if (t && (t.n || t.e))
          pts.push({
            kind: 'wpn',
            n,
            ref: 'WPN TGT ' + (n + 1),
            short: 'WPN ' + (n + 1),
            name: t.name && !/^not set$/i.test(t.name) ? t.name : 'Weapon target ' + (n + 1),
            x: t.e / FT_KM,
            y: t.n / FT_KM,
            altFt: t.elv,
            dmpi: true,
          });
      }
      try {
        const a = ST.wpPage && ST.wpPage.attack(),
          wp = a && a.t && f && f.wps ? f.wps[a.t.stpt - 1] : null;
        // the target of the attack planner, unless it is a steerpoint that is no target (take-off, landing, nav...): with no target chosen the planner
        // takes the first steerpoint, the airbase of departure, which is not a target
        if (a && a.t && a.t.stpt > 0 && a.t.stpt < 31 && !(wp && [0, 1, 2, 3, 4, 7, 8].includes(wp.act)))
          pts.push({
            kind: 'stpt',
            ref: 'STPT ' + a.t.stpt,
            short: 'STPT ' + a.t.stpt,
            name: nearName(a.t.e / FT_KM, a.t.n / FT_KM) || 'STPT ' + a.t.stpt,
            x: a.t.e / FT_KM,
            y: a.t.n / FT_KM,
            altFt: 0,
            dmpi: true,
          });
      } catch (e) {}
      let objs = [];
      try {
        const td = targetData();
        if (td)
          objs = (await td.objectives()).map(o => ({
            id: o.id,
            name: o.name,
            x: o.e / FT_KM,
            y: o.n / FT_KM,
            type: o.type,
          }));
      } catch (e) {}
      if (!objs.length && ST.C && ST.C.D && ST.C.D.ob)
        objs = ST.C.D.ob.map(o => ({ id: o[0], name: String(o[1]), x: o[2], y: o[3], type: -1 }));
      return { points: pts, objs: objs.filter(o => !PLACES.includes(o.type)) };
    },
    async features(id) {
      const td = targetData();
      if (!td) return null;
      const o = (await td.objectives()).find(z => z.id === id);
      if (!o) return null;
      const fs = await td.features(o),
        S = ST.C && ST.C.objFeat ? ST.C.objFeat.get(id) : null,
        af = td.airfield ? await td.airfield(o) : null,
        K = ([n, e]) => [e / FT_KM, n / FT_KM];
      return {
        air:
          af && af.rwy.length
            ? { rwy: af.rwy.map(r => ({ c: r.c.map(K), ends: r.ends })), taxi: af.taxi.map(l => l.map(K)) }
            : null,
        feats: fs.map((q, k) => ({
          name: q.name,
          value: q.value,
          x: q.e / FT_KM,
          y: q.n / FT_KM,
          st: S && S[k] !== undefined ? featState(S[k]) : 0,
        })),
        pct: S ? operational(fs, S) : null,
      };
    },
    threats() {
      try {
        if (!ST.C) return { sams: [], units: [] };
        const v = ST.VIEW !== null ? ST.VIEW : ST.C.playerTeam != null ? ST.C.playerTeam : 1,
          UL = mapUnits(ST.C, v);
        return {
          sams: UL.filter(m => m.sam && !m.noFcr && m.hostile && m.spotted).map(m => ({
            name: m.name,
            x: m.u.x,
            y: m.u.y,
            r: m.rng,
          })),
          units: UL.filter(m => m.hostile && m.spotted && !m.sam && !m.carrier).map(m => ({
            name: m.bn,
            glyph: glyphOf(m.cat),
            x: m.u.x,
            y: m.u.y,
          })),
        };
      } catch (e) {
        return { sams: [], units: [] };
      }
    },
    attack: () => (ST.wpPage ? ST.wpPage.attack() : null),
    // the wind at the target (weather of the campaign) at the time of the attack of the flight, else the time of the campaign
    wind(x, y, alt) {
      try {
        const f = curFlight(),
          a = f && f.wps && f.wps.find(p => [14, 15, 16, 17, 19].includes(p.act)),
          t = (a && (a.arr || a.dep)) || (ST.C && ST.C.time);
        return t ? wxWind(x, y, t, alt) : null;
      } catch (e) {
        return null;
      }
    },
    route() {
      try {
        const f = curFlight();
        return f && f.wps ? mFlightRoute(ST.C, f).map(w => ({ n: w.n, x: w.x, y: w.y })) : [];
      } catch (e) {
        return [];
      }
    },
    info: () => ({ cs: F.cs || '', mis: F.mis || '', tot: String(F.d1 || '').split(' · ')[0], wpn: F.ag || '' }),
    geoLL: (x, y) => {
      try {
        return ST.C ? CAM.geoLL(ST.C, x, y) : mFmtLL(...mToLL(x, y));
      } catch (e) {
        return '';
      }
    },
    async pick() {
      const data = targetData();
      if (!data) {
        appToast('The objectives are read from the BMS folder: set it in Settings > Folders.');
        return null;
      }
      const t = await openTargetPicker({
        data,
        fmt: (a, b) => {
          try {
            return mFmtLL(...mToLL(b / FT_KM, a / FT_KM));
          } catch (x) {
            return '';
          }
        },
        esc,
        anim: animOn,
        title: 'Target picture',
      });
      return t ? { x: t.e / FT_KM, y: t.n / FT_KM, name: t.name, altFt: 0 } : null;
    },
    // the Map page lent to the Target tab, with the frame of the screenshot; the width of the frame on the ground is nm
    // the map lent to the Target tab, around the target (nm wide); mapShoot opens the frame on it
    async mapShow(el, c, nm) {
      const lm = mapV.leaflet;
      if (!(lm && el.contains(lm.getContainer()))) {
        const r = await mapV.attach(el, true); // the points of the map are not edited on the Target tab
        if (!r) return false;
      }
      const map = mapV.leaflet,
        fi = document.getElementById('mpfi'),
        fw = (fi && fi.offsetWidth) || el.clientWidth * 0.7,
        ll = mToLL(c[0], c[1]),
        mpp = (nm * 1852) / fw,
        z = Math.log2((156543.03392 * Math.cos((ll[0] * Math.PI) / 180)) / mpp);
      map.setView(ll, Math.max(5, Math.min(18, z)), { animate: false });
      mapV.zoomLock(true); // the width chosen on the tab: the zoom comes back only for the frame of the picture
      return true;
    },
    // the frame on the lent map: as wide as nm, around the middle of the map as it was left
    mapShoot(nm) {
      const map = mapV.leaflet;
      if (!map || document.getElementById('mpfr')) return;
      const ll = map.getCenter();
      mapV.shotStart('tg', { toast: appToast });
      const fi = document.getElementById('mpfi'),
        fw = (fi && fi.offsetWidth) || map.getContainer().clientWidth * 0.7,
        z = Math.log2((156543.03392 * Math.cos((ll.lat * Math.PI) / 180)) / ((nm * 1852) / fw));
      map.setView(ll, Math.max(5, Math.min(18, z)), { animate: false });
      map.panBy([0, 20], { animate: false }); // the frame stands 20 px above the middle of the map
    },
    mapDetach: () => mapV.detach(),
    cyclePlan: () => mapV.cyclePlan(),
    planMode: () => mapV.planMode(),
    // Add target on the Target tab: a weapon target of the DTC, as on the Map page ('ok', 'full', or 'none' without a DTC)
    addWpn: p => (lines.length ? wtPut({ n: p.y * FT_KM, e: p.x * FT_KM, elv: 0, name: p.name }) : 'none'),
    levelsTo: async el => (await mapV.ensure()) && mapV.levelsTo(el),
    levelsBack: () => mapV.levelsBack(),
    mapPal: () => (mapV.isReady() ? mapV.dtcColors() : null),
    confirm: m => confirm(m),
    // the aim points taken away on the Target tab: the TGT steerpoints and the weapon targets of the DTC
    removeDtc(pts) {
      for (const d of pts) {
        if (d.kind == 'prec' && d.slot != null) dtcClear('prec', d.slot, false);
        else if (d.kind == 'wpn' && d.n != null) {
          S('STPT', 'wpntarget_' + d.n, targetLine(null));
          dtcChanged('STPT', 'wpntarget_' + d.n);
        }
      }
    },
    // the heights of the BMS terrain (ft) at points in km, null without the BMS folder
    async heights(pts) {
      const t = await terrain();
      return t
        ? heightsOf(
            t,
            pts.map(p => ({ n: p[1] * FT_KM, e: p[0] * FT_KM }))
          )
        : null;
    },
    fromLL: (lat, lon) => mFromLL(lat, lon),
    kbAdd: (blob, name, alt, dark) => kbAddPic(blob, name, alt, dark),
    putShot: c => {
      ST.MAPSHOT = c;
      draw();
    },
    shotDim: () =>
      ST.MDCON
        ? { w: SHOT[2] - SHOT[0], h: SHOT[3] - SHOT[1], out: 1124, name: 'MDC' }
        : { ...SHOTS.dc, name: 'Datacard' },
    prefs: { load: () => loadPrefs('tgtprefs.json'), save: o => savePrefs('tgtprefs.json', o) },
  };
}

// ---- Weapons > HARM > SEAD: the package of the flight chosen in the datacard, the SAMs of the map, the HARMs of the loadout, the DTC
const isSeadM = m => /^SEAD/.test(String(m || ''));
function seadCtx() {
  if (!ST.C) return { ok: false, why: 'Open a campaign: SEAD plans the HARM shots of a SEAD flight of its ATO.' };
  const x = ST.CL && ST.CL[+(document.getElementById('fsel') || {}).value || 0],
    e = x && ATOL.find(z => z.f === x.f);
  if (!e) return { ok: false, why: 'Choose a flight in the ATO.' };
  if (!isSeadM(e.mission))
    return { ok: false, why: e.callsign + ' flies ' + e.mission + ': SEAD is planned for a SEAD flight.' };
  const pk = ATOL.filter(z => z.pkg == e.pkg && z.f !== e.f && z.f.wps && z.f.wps.length >= 2);
  if (!pk.some(z => !isSeadM(z.mission)))
    return { ok: false, why: 'Package ' + e.pkgNo + ' has no other flight to protect.' };
  const D = ST.C.D,
    n = Math.max(1, Math.min(4, CAM.nAcf(e.f))),
    G = CAM.loadGroups(e.f),
    harms = Array.from({ length: n }, (_, i) => {
      const g = G.find(z => z.ac.includes(i + 1));
      return g ? g.ids.reduce((a, id, k) => a + (/AGM-88|\bHARM\b/i.test(D.wn[id] || '') ? g.cn[k] || 0 : 0), 0) : 0;
    });
  let sams = [];
  try {
    sams = mapUnits(ST.C, e.team)
      .filter(m => m.sam && !m.noFcr && m.hostile && m.spotted)
      .map(m => ({
        id: m.u.id.n + ':' + m.u.id.c,
        x: m.u.x,
        y: m.u.y,
        rng: mapV.samRng ? mapV.samRng(m.name, m.rng) : m.rng, // the ring of the Map page (the Ppt.ini range when it has one)
        name: m.name,
        code: harmCode(m.name),
        telar: m.telar,
      }));
  } catch (er) {
    /* no unit table */
  }
  // the HTS pod in the loadout (HAD), the steerpoints for POS: the flight plan and the pre-planned threats of the DTC
  const hts = G.some(g => g.ids.some(id => /\bHTS\b|ASQ-213/i.test(D.wn[id] || ''))),
    P = lines.length ? dtcPoints(lines) : null,
    refs = e.f.wps
      .map((w, i) => ({ n: i + 1, x: w.x, y: w.y }))
      .filter(w => w.x || w.y)
      .concat(P ? P.ppt.filter(p => !p.empty).map(p => ({ n: p.stpt, x: p.x, y: p.y, ppt: true, name: p.name })) : []);
  const fl = z => ({
    key: String(z.f.id.n),
    name: z.callsign,
    ac: z.ac,
    n: z.n,
    mission: z.mission,
    tot: z.tot,
    f: z.f,
    sead: isSeadM(z.mission),
  });
  return {
    ok: true,
    me: { ...fl(e), n, pkgNo: e.pkgNo },
    flights: pk.map(fl),
    sams,
    seat: ST.SEAT && ST.SEAT.set && seatExists(seatIdx()) ? seatIdx() : 0,
    harms,
    hts,
    refs,
  };
}
const HARM_K = (t, n) => `THREAT ${t} ${n}`;
function seadDeps() {
  return {
    esc,
    toast: appToast,
    confirm: m => confirm(m),
    ctx: seadCtx,
    harm: () => harmPage.harm(),
    toLL: (x, y) => mapV.toLL(x, y),
    attach: el => mapV.attach(el),
    detach: () => mapV.detach(),
    cyclePlan: () => mapV.cyclePlan(),
    planMode: () => mapV.planMode(),
    layerOn: k => !!mapV.state().on[k],
    pal: () => mapV.palette(),
    dtc: {
      harm: () =>
        lines.some(l => l.s == 'HARM')
          ? [0, 1, 2].map(t => [0, 1, 2, 3, 4].map(n => parseInt(G('HARM', HARM_K(t, n), ''), 10)))
          : null,
      setHarm: (t, n, code) => {
        S('HARM', HARM_K(t, n), String(code).padStart(4, '0'));
        dtcChanged('HARM', HARM_K(t, n));
      },
    },
    // the AUTO PPT of the Map page for the threats assigned: the ones not in the DTC yet, after asking
    ppt: async list => {
      const P = dtcPoints(lines);
      if (!lines.length || !P) return 'Open a DTC first: the threats are added to it.';
      const miss = list.filter(s => !P.ppt.some(p => !p.empty && Math.hypot(p.x - s.x, p.y - s.y) < 0.5));
      if (!miss.length) return 'Your threats are already pre-planned threats of the DTC.';
      if (
        !(await confirm(
          'Add ' +
            miss.length +
            ' pre-planned threats to the DTC (the AUTO PPT of the Map page): ' +
            miss.map(s => s.name).join(', ') +
            '?\n\nThe pre-planned threats already in the DTC stay.'
        ))
      )
        return '';
      return mapV.autoPptFor(miss).msg;
    },
    snap: scale => mapV.snap(scale),
    kbAdd: (blob, name, alt, dark) => kbAddPic(blob, name, alt, dark),
  };
}
// ---- Weapons > HARM > DEAD: the SAM of the task of a DEAD flight (its target, else the enemy SAMs near the task steerpoint), the HARMs of the loadout
const isDeadM = m => /^DEAD/.test(String(m || ''));
function deadCtx() {
  if (!ST.C)
    return { ok: false, why: 'Open a campaign: DEAD plans the attack of a DEAD flight of its ATO on its SAM.' };
  const x = ST.CL && ST.CL[+(document.getElementById('fsel') || {}).value || 0],
    e = x && ATOL.find(z => z.f === x.f);
  if (!e) return { ok: false, why: 'Choose a flight in the ATO.' };
  if (!isDeadM(e.mission))
    return { ok: false, why: e.callsign + ' flies ' + e.mission + ': DEAD is planned for a DEAD flight.' };
  const tk = taskOf(e.f.wps);
  if (!tk) return { ok: false, why: e.callsign + ' has no task steerpoint.' };
  const D = ST.C.D,
    n = Math.max(1, Math.min(4, CAM.nAcf(e.f))),
    G = CAM.loadGroups(e.f),
    harms = Array.from({ length: n }, (_, i) => {
      const g = G.find(z => z.ac.includes(i + 1));
      return g ? g.ids.reduce((a, id, k) => a + (/AGM-88|\bHARM\b/i.test(D.wn[id] || '') ? g.cn[k] || 0 : 0), 0) : 0;
    }),
    tw = e.f.wps[tk.n - 1],
    tid = tw && tw.tid,
    KM = 1.852;
  let sams = [];
  try {
    sams = mapUnits(ST.C, e.team)
      .filter(m => m.sam && m.hostile)
      .map(m => ({
        id: m.u.id.n + ':' + m.u.id.c,
        x: m.u.x,
        y: m.u.y,
        rng: mapV.samRng ? mapV.samRng(m.name, m.rng) : m.rng, // the ring of the Map page (the Ppt.ini range when it has one)
        det: m.detAir || m.det || m.rng,
        name: m.name,
        code: harmCode(m.name),
        telar: m.telar,
        fcr: !m.noFcr,
        spotted: !!m.spotted,
        tgt: !!(tid && m.u.id && m.u.id.n == tid.n && m.u.id.c == tid.c),
        d: Math.hypot(m.u.x - tk.x, m.u.y - tk.y) / KM,
      }))
      .filter(m => m.tgt || m.d < 25)
      .sort((a, b) => b.tgt - a.tgt || a.d - b.d)
      .slice(0, 12);
  } catch (er) {
    /* no unit table */
  }
  const t = sams.find(m => m.tgt) || sams.find(m => m.fcr) || sams[0];
  return {
    ok: true,
    me: {
      key: String(e.f.id.n),
      name: e.callsign,
      ac: e.ac,
      n,
      mission: e.mission,
      tot: e.tot,
      f: e.f,
      pkgNo: e.pkgNo,
    },
    sams,
    target: t ? t.id : null,
    seat: ST.SEAT && ST.SEAT.set && seatExists(seatIdx()) ? seatIdx() : 0,
    harms,
  };
}
function deadDeps() {
  const d = seadDeps();
  return {
    ...d,
    ctx: deadCtx,
    dtc: {
      ...d.dtc,
      has: sec => lines.some(l => l.s == sec),
      setOA: (key, v) => {
        S('NAV OFFSETS', key, v);
        dtcChanged('NAV OFFSETS', key);
      },
    },
    addPpt: m => mapV.addPpt(m),
    pptTypes: () => mapV.otherPpt(),
    // the lines of a Weapons attack page (popup, hadb, toss) on the target steerpoint nearest to the SAM (pt), drawn on the DEAD map
    planLines: (m, pt) => (ST.wpPage && ST.wpPage.planLines ? ST.wpPage.planLines(m, pt.x, pt.y) : null),
    // a Weapons page of the attack (Pop-up, HADB, TOSS), its target the steerpoint nearest to the SAM (pt): the target chosen (or null), then the tab
    openMode: (m, pt) => {
      const a = pt && ST.wpPage && ST.wpPage.aimAt ? ST.wpPage.aimAt(pt.x, pt.y) : null,
        b = document.querySelector('#wp .wtabs [data-mode="' + m + '"]');
      if (b) /** @type {HTMLElement} */ (b).click();
      return a;
    },
  };
}
// the HARM tab: SEAD (a SEAD flight protecting its package) or DEAD (a DEAD flight on its SAM; without a DEAD flight the HARM standoff shot at a PPT of the
// DTC); SEAD first when the flight chosen is a SEAD flight of a package with flights to protect, until the pilot chooses
function makeHarmTab() {
  const root = document.createElement('div'),
    bar = document.createElement('div'),
    body = document.createElement('div');
  root.id = 'wpharmtab';
  bar.className = 'hsub';
  root.append(bar, body);
  let sub = null,
    on = false,
    pg = null;
  try {
    sub = sessionStorage.getItem('harmsub');
  } catch (e) {
    /* none */
  }
  const cur = () => (sub == 'sead' || sub == 'dead' ? sub : seadPage.usable() ? 'sead' : 'dead'),
    page = s => (s == 'sead' ? seadPage : deadPage.usable() ? deadPage : harmPage);
  const all = () => [seadPage, deadPage, harmPage];
  function show() {
    on = true;
    const s = cur(),
      p = page(s);
    bar.innerHTML = `<span class="seg">${[
      ['sead', 'SEAD'],
      ['dead', 'DEAD'],
    ]
      .map(([v, l]) => `<button type="button" class="${s == v ? 'on' : ''}" data-hsub="${v}">${l}</button>`)
      .join('')}</span><span class="hint">${
      s == 'sead'
        ? 'The HARM shots of your SEAD flight that protect the flights of its package.'
        : p == deadPage
          ? 'Your DEAD flight against its SAM: HARM standoff, Hunter-Killer or bombs.'
          : 'No DEAD flight chosen: HARM standoff, one HARM shot at a pre-planned threat of the DTC.'
    }</span>`;
    bar.querySelectorAll('[data-hsub]').forEach(
      b =>
        (b.onclick = () => {
          if (cur() == b.dataset.hsub) return;
          sub = b.dataset.hsub;
          try {
            sessionStorage.setItem('harmsub', sub);
          } catch (e) {
            /* none */
          }
          all().forEach(q => q.leave());
          show();
        })
    );
    all()
      .filter(q => q != p)
      .forEach(q => q.leave());
    if (body.firstChild !== p.root || body.children.length != 1) {
      body.innerHTML = '';
      body.appendChild(p.root);
    }
    pg = p;
    if (p.acts) bar.append(p.acts()); // the buttons of the page (HARM tables, Auto PPT, Add card) at the right of this bar
    p.render();
  }
  return {
    root,
    render: show,
    leave: () => {
      on = false;
      all().forEach(q => q.leave());
    },
    refresh: () => {
      if (!on) return;
      if (page(cur()) != pg) return show();
      pg.refresh();
    },
    sub: () => cur(),
    // Add card of the Weapons tabs: the card of the SEAD or DEAD page shown
    addCard: b =>
      pg && pg.addCard ? pg.addCard(b) : appToast('No card for this page: choose a SEAD or a DEAD flight.', true),
  };
}

// run 9: statements that run when the program starts (in the order of the original file)
export async function init9() {
  harmRoot = document.createElement('div');
  harmRoot.id = 'wpharm';
  harmPage = createMissilesPage({
    esc,
    points: () => dtcPoints(lines),
    route: () => stpts(),
    isSam: n => mapV.isSamPpt(n),
    ll: (n, e) => mapV.toLL(e / 3280.84, n / 3280.84),
    attach: el => mapV.attach(el),
    detach: () => mapV.detach(),
    root: harmRoot,
    missiles: misLoad,
    only: 'harm',
    key: 'msmissiles1h',
    objectsAll: on => mapV.objectsAll(on),
    objectsOn: () => mapV.objectsOn(),
    cyclePlan: () => mapV.cyclePlan(),
    planMode: () => mapV.planMode(),
    toggleEdit: () => mapV.toggleEdit(),
    isEdit: () => mapV.isEdit(),
  });
  seadPage = createSeadPage(seadDeps());
  deadPage = createDeadPage(deadDeps());
  harmTab = makeHarmTab();
  ST.tgPage = createTargetPage(tgtDeps());
  // Add all cards (Kneeboard): the cards of these pages, in the order of the window
  KBX.src.sead = () => seadPage.allCards();
  KBX.src.dead = () => deadPage.allCards();
  KBX.src.atk = () => (ST.wpPage ? ST.wpPage.allCards() : []);
  KBX.src.tgt = () => ST.tgPage.allCards();
  KBX.src.roe = roeAllCards;
  // the desktop program takes the files dropped on its window: a picture dropped on Weapons > Target is its screenshot
  if (isDesktop()) onFilesDropped(files => ST.tgPage.drop(files));
  ST.wpPage = createWeaponsPage({
    offs: OFFS,
    harm: harmTab,
    tgt: ST.tgPage,
    cyclePlan: () => mapV.cyclePlan(),
    planMode: () => mapV.planMode(),
    toggleEdit: () => mapV.toggleEdit(),
    isEdit: () => mapV.isEdit(),
    objectsAll: on => mapV.objectsAll(on),
    objectsOn: () => mapV.objectsOn(),
    applyBtn: $('wpapply'),
    clearBtn: $('wpclear'),
    applyNote: $('wpnote'),
    applied: () => {
      try {
        applyDTC(null);
        draw();
      } catch (e) {}
    },
    bombs: async () => {
      // Data\Sim\...\Bombdata: BombTypes.lst + <name>.dat
      try {
        const inst = ST.CFG.paths.bmsInstall;
        if (!isDesktop() || !inst) return null;
        const lst = (await findFiles(jp(inst, 'Data', 'Sim'), ['BombTypes.lst'], 3))['BombTypes.lst'];
        if (!lst) return null;
        const dir = lst.replace(/[\\/][^\\/]*$/, ''),
          dec = b => new TextDecoder('latin1').decode(b),
          o = {};
        for (const n of parseBombList(dec(await readBytes(lst)))) {
          try {
            const d = parseBombDat(dec(await readBytes(jp(dir, n + '.dat'))));
            if (d) o[n] = d;
          } catch (e) {}
        }
        return o;
      } catch (e) {
        return null;
      }
    },
    elev: async pts => {
      const t = await terrain();
      return t ? heightsOf(t, pts) : null;
    },
    root: $('wp'),
    esc,
    lines: () => lines,
    G,
    S,
    route: () => stpts(),
    fplan: () => {
      try {
        const f = ST.C && ST.CL.length && ST.CL[+$('fsel').value || 0] && ST.CL[+$('fsel').value || 0].f;
        return f && f.wps ? mFlightRoute(ST.C, f) : [];
      } catch (e) {
        return [];
      }
    },
    // the loadout of aircraft k of the flight (0 the lead; the element's is 2): the first one's when the flight has no other
    loadout: (k = 0) => {
      try {
        const f = ST.C && ST.CL.length && ST.CL[+$('fsel').value || 0] && ST.CL[+$('fsel').value || 0].f,
          L = f && f.loads && (f.loads[k] || f.loads[0]),
          Dd = ST.C && ST.C.D;
        if (!L || !Dd) return [];
        const o = [];
        L.ids.forEach((id, k) => {
          const c = L.cn[k];
          if (id && c && id != 492) o.push({ name: Dd.wn[id] || '', n: c });
        });
        return o;
      } catch (e) {
        return [];
      }
    },
    points: () => dtcPoints(lines),
    // the seat chosen on the Datacard and the aircraft of the flight (lead / element envelopes)
    seat: () => ({ n: seatIdx(), size: [0, 1, 2, 3].filter(seatExists).length }),
    // the flight chosen in the datacard, for the Attack card
    title: () => {
      const x = ST.CL && ST.CL[+(document.getElementById('fsel') || {}).value || 0],
        e = x && ATOL.find(z => z.f === x.f);
      return e ? e.callsign + ' · ' + e.n + '× ' + e.ac + ' · ' + e.mission : '';
    },
    changed: (sec, key) => dtcChanged(sec, key),
    confirm: m => confirm(m),
    alert: m => alert(m),
    ll: (n, e) => mapV.toLL(e / 3280.84, n / 3280.84),
    attach: el => mapV.attach(el),
    detach: () => mapV.detach(),
    // the Attack cards of the Kneeboard: a picture of the lent map, the cards, the messages
    snap: scale => mapV.snap(scale),
    kbAdd: (blob, name, alt, dark) => kbAddPic(blob, name, alt, dark),
    toast: appToast,
  });
}

// run 11: statements that run when the program starts (in the order of the original file)
export async function init11() {
  sqPage = createSquadronPage({
    esc,
    roeDraw, // the page Squadron > ROE / SOP (app/roepage.js)
    root: $('sq'),
    toast: appToast,
    lbk: isDesktop()
      ? {
          list: async () => {
            const d = dtcDir();
            return d ? (await listDir(d)).filter(e => !e.isDirectory && /\.lbk$/i.test(e.name)).map(e => e.name) : [];
          },
          read: async n => readBytes(joinPath(dtcDir(), n)),
        }
      : null,
    trackers: () => ST.CFG.squadron && ST.CFG.squadron.trackers,
    openSettings: () => openSettings(),
    squadInfo: u => {
      const ab = nearAb(ST.C, u.x, u.y);
      return {
        owner:
          ST.C.D.S[40 + u.owner] ||
          ['None', 'U.S.', 'ROK', 'Japan', 'CIS', 'PRC', 'DPRK', 'NATO'][u.owner] ||
          'Team ' + u.owner,
        base: ab ? ab[1] : '',
      };
    },
    phonebook: isDesktop()
      ? {
          read: async () => {
            const d = dtcDir();
            if (!d) return null;
            const n = (await listDir(d)).find(e => !e.isDirectory && /^phonebkn\.ini$/i.test(e.name));
            return n ? new TextDecoder().decode(await readBytes(joinPath(d, n.name))) : null;
          },
        }
      : null,
    store: {
      load: async () => {
        const r = await loadPrefsSafe('squadron.json');
        if (r.issue)
          setTimeout(
            () =>
              appToast(
                r.issue == 'repaired'
                  ? 'The squadron file was damaged: it was restored from its copy.'
                  : 'The squadron file could not be read. A copy of it was kept as squadron.json.bad in the program folder.'
              ),
            1500
          );
        return r.value;
      },
      save: o => savePrefsSafe('squadron.json', o),
    },
    campaign: () => ST.C,
    swarm: window.__swarmTest,
    // the Briefing tab: the map of the Map page (not editable), its kneeboard frame, the flight chosen in the datacard and the theater
    briefing: {
      attach: el => mapV.attach(el, true),
      detach: () => mapV.detach(),
      shot: o => mapV.shotStart('kb', o),
      mission: () => {
        const x = ST.CL && ST.CL[+(document.getElementById('fsel') || {}).value || 0],
          e = x && ATOL.find(z => z.f === x.f);
        return e ? e.callsign + ' · ' + e.n + '× ' + e.ac + ' · ' + e.mission : '';
      },
      theater: () => (ST.TH ? ST.TH.name : ''),
      // the wide page of the room; narrow again only while the Squadron is the page on screen (the Map and the others keep their width)
      wide: b => {
        if (b || !document.getElementById('sq').classList.contains('hide'))
          document.querySelector('main').classList.toggle('wide', !!b);
      },
      // the weather of the room: the map of an hour (loaded from the weather files of the campaign), the hours of the flight of the briefer
      wx: {
        at: ms => wxAt(ms),
        load: ms => wxLoadKeys([wxKey(ms)]),
        flight: () => {
          const f = wxFlight();
          return f ? { hours: f.hours, dep: f.dep, tot: f.tot, land: f.land, alt: f.alt } : null;
        },
        toLL: (x, y) => mToLL(x, y),
      },
    },
    buildMission: () => msfBuild(),
    loadMission: t => msfLoad(t, null),
    roleChanged: () => {
      atoSearch();
      if (mapV && mapV.isReady()) mapV.refresh();
    },
    version: APP_VERSION,
    saveReceived: (t, n, from, squad) => msfStoreReceived(t, n, from, squad),
    receiveCard: async (c, from) => {
      // the picture arrives as a data: address already checked by the squadron; it is decoded here (no fetch, so a strict CSP can stay)
      const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(c.img);
      if (!m) throw new Error('not a picture');
      const bin = atob(m[2]),
        u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      await kbAddTray(new Blob([u], { type: m[1] }), c.name + ' · from ' + from);
    },
    mission: {
      ident: () => msfIdent(),
      sources: () => msfSources(),
      list: () => msfList(),
      remove: id => msfRemove(id),
      text: id => msfText(id),
      groups: id => msfGroupsOf(id),
      forSend: (id, t) => msfForSend(id, t),
      folders: () => msfFolders(),
      folderAdd: (name, parent) => msfFolderAdd(name, parent),
      folderRename: (id, name) => msfFolderRename(id, name),
      folderDel: id => msfFolderDel(id),
      folderMove: (id, parent) => msfFolderMove(id, parent),
      move: (keys, fid) => msfMove(keys, fid),
    },
  });
  ST.SQROLE = () => sqPage.role();
  beforeClose(() => sqPage.flush());
  KBX.send = it => sqPage.sendCard(it);
  KBX.can = () => sqPage.canSendCard();
  pfPage = createPerfPage({
    esc,
    root: $('pf'),
    wind: (x, y, t, a) => wxWind(x, y, t, a),
    aircraft: {
      list: async () => {
        const f = await acFolder(),
          a = new Set([...(f ? f.names : Object.keys(CAM.D.acfb)), ...Object.keys(ST.MSFAC)]);
        return [...a].sort();
      },
      get: perfAcGet,
    },
    loadout: () => {
      const x = ST.CL[+$('fsel').value];
      if (!x || !ST.C) return null;
      return { ac: ST.C.D.ac[x.f.c.i], gw: +F.gw || 0, fuel: +F.fuel || 0, drag: +F.drag || 0 };
    },
    flightPlan: () => {
      const x = ST.C && ST.CL[+$('fsel').value];
      if (!x || !x.f.wps) return null;
      return { wps: x.f.wps, labels: x.f.wps.map((_, i) => F['fp' + i + '_0'] || ''), imc: imcOpt(x.f) };
    },
    env: { get: perfEnv },
    runway: {
      get: () => {
        const d = F.__dep;
        if (!d) return null;
        const a = rwyAuto(d);
        return {
          id: d[0],
          name: baseName(d),
          ft: rwyFt(d),
          man: PERFP.rwy[d[0]] || 0,
          auto: a ? a.ft : 0,
          wid: a ? a.w : 0,
          info: RLI,
          ship: isShipBase(F.__ab && F.__ab[0]),
          kind: isShipBase(F.__ab && F.__ab[0]) ? shipKind(F.__ab[0][1]) : '',
        };
      },
      set: v => {
        const d = F.__dep;
        if (!d) return;
        if (v > 0) PERFP.rwy[d[0]] = v;
        else delete PERFP.rwy[d[0]];
        perfSave();
        perfFill(+$('fsel').value || 0);
      },
    },
    prefs: {
      get: () => ({
        reserve: PERFP.reserve,
        joker: PERFP.joker,
        ohalt: PERFP.ohalt,
        ohspd: PERFP.ohspd,
        lmode: PERFP.lmode,
        lstores: PERFP.lstores,
        imcHold: PERFP.imcHold,
        imcAlt: PERFP.imcAlt,
      }),
      set: o => {
        if (o.imcHold != null) PERFP.imcHold = o.imcHold;
        if (o.imcAlt != null) PERFP.imcAlt = o.imcAlt;
        PERFP.reserve = o.reserve;
        PERFP.joker = o.joker;
        PERFP.ohalt = o.ohalt;
        PERFP.ohspd = o.ohspd;
        PERFP.lmode = o.lmode || 'ovhd';
        PERFP.lstores = o.lstores || 'on';
        perfSave();
        clearTimeout(ST.PFT);
        ST.PFT = setTimeout(() => perfFill(+$('fsel').value || 0), 500);
      },
    },
  });
}

// run 13: statements that run when the program starts (in the order of the original file)
export async function init13() {
  ST.msPage = createMissilesPage({
    fillBvr: rows => bvrCells(rows).forEach(([k, v]) => setField(k, v)),
    bvrSame: rows => bvrCells(rows).every(([k, v]) => (F[k] || '') === v),
    esc,
    points: () => dtcPoints(lines),
    ll: (n, e) => mapV.toLL(e / 3280.84, n / 3280.84),
    attach: el => mapV.attach(el),
    detach: () => mapV.detach(),
    root: $('ms'),
    missiles: misLoad,
    only: 'bvr',
    key: 'msmissiles1b',
    prefs: { load: () => loadPrefs('bvrprefs.json'), save: o => savePrefs('bvrprefs.json', o) }, // kept from one session to the next
    cyclePlan: () => mapV.cyclePlan(),
    planMode: () => mapV.planMode(),
    toggleEdit: () => mapV.toggleEdit(),
    isEdit: () => mapV.isEdit(),
  });
}
