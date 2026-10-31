import { createMap } from '../core/mapview.js';
import { createOffsets } from '../core/mapoffs.js';
import { CAM } from '../core/cam-core.js';
import { createMissilesPage } from '../core/missilespage.js';
import { createWeaponsPage } from '../core/weaponspage.js';
import { createSquadronPage } from '../core/squadron.js';
import {
  isDesktop,
  readRange,
  loadPrefs,
  savePrefs,
  loadPrefsSafe,
  savePrefsSafe,
  beforeClose,
  readBytes,
  listDir,
  findFiles,
  join as joinPath,
} from '../platform/desktop.js';
import { createPerfPage } from '../core/perfpage.js';
import { heightsAt } from '../bmsdata/heightmap.js';
import { dtcPoints } from '../core/mapdtc.js';
import { targetLine } from '../core/targets.js';
import { parseBombList, parseBombDat } from '../bmsdata/bombdata.js';
import { flightRoute as mFlightRoute } from '../core/mapdata.js';
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
import { acFolder, misLoad, perfAcGet, terrain } from './gamefiles.js';
import { G, S, dtcOverwrite, dtcRevert, lines, stpts, MERGED } from './dtcfile.js';
import { PERFP, RLI, bvrCells, perfEnv, perfFill, perfSave, rwyAuto, rwyFt } from './perf.js';
import { targetData, wtAdd, wtList, wtPut } from './dtctargets.js';
import { ATOL, PLAYER, msLocked } from './ato.js';
import { apply } from './selection.js';
import { F, dtcChanged, setField } from './datacard.js';
import { applyDTC, dtcClear, dtcSet } from './dtcapply.js';
import { kbAddShot, kbAddTray, KBX } from './kneeboard.js';
import { draw } from './cardview.js';
import { SHOT } from '../core/cardlayout.js';
import { dtcDir, wxWind } from './campaign.js';
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
  msfSave,
  msfList,
  msfRemove,
  missionToSave,
} from './mission.js';

export let mapV;
const OFFS = createOffsets(); // offsets placed on the Map page (route steerpoints 1-24), shown and written by the Weapons page
export let harmRoot;
export let harmPage;
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
        return d ? d.objectives() : Promise.reject(new Error('Needs the BMS install folder (desktop app, Settings).'));
      },
      features: o => targetData().features(o),
      radars: () => {
        const d = targetData();
        return d && d.radars ? d.radars() : Promise.resolve([]);
      },
    },
    attack: () => {
      const a = ST.wpPage && ST.wpPage.spec && ST.wpPage.spec();
      if (!a) return null;
      const ll = p => mapV.toLL(p.e / 3280.84, p.n / 3280.84);
      return {
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
    getC: () => ST.C,
    getWx: () => ST.WX,
    elev: async pts => {
      const t = await terrain();
      return t ? heightsAt((o, l) => readRange(t.path, o, l), t.spec, pts) : null;
    },
    getSel: () => ST.ATOSEL,
    dtc: {
      points: () => dtcPoints(lines),
      wtargets: () => wtList(),
      wtAdd: () => wtAdd(),
      wtPut: t => wtPut(t),
      elev: async t => {
        try {
          const tr = await terrain();
          const h = tr ? await heightsAt((o, l) => readRange(tr.path, o, l), tr.spec, [t]) : null;
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
    },
    saveMission: () => msfSave(),
    missionDirty: () => missionToSave(),
    satCfg: () => ST.CFG.map,
    loadPrefs: () => loadPrefs('mapprefs.json'),
    savePrefs: o => savePrefs('mapprefs.json', o),
    localMap: async () => {
      if (window.__localMap) return window.__localMap();
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
      return new File([await readBytes(jp(dir, f.name))], f.name, {
        type: /\.jpe?g$/i.test(f.name) ? 'image/jpeg' : 'image/png',
      });
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
    setShot: (c, k) => {
      if (k == 'kb') kbAddShot(c);
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

// run 9: statements that run when the program starts (in the order of the original file)
export async function init9() {
  harmRoot = document.createElement('div');
  harmRoot.id = 'wpharm';
  harmPage = createMissilesPage({
    esc,
    points: () => dtcPoints(lines),
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
  ST.wpPage = createWeaponsPage({
    offs: OFFS,
    harm: harmPage,
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
      return t ? heightsAt((o, l) => readRange(t.path, o, l), t.spec, pts) : null;
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
    loadout: () => {
      try {
        const f = ST.C && ST.CL.length && ST.CL[+$('fsel').value || 0] && ST.CL[+$('fsel').value || 0].f,
          L = f && f.loads && f.loads[0],
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
    changed: (sec, key) => dtcChanged(sec, key),
    confirm: m => confirm(m),
    alert: m => alert(m),
    ll: (n, e) => mapV.toLL(e / 3280.84, n / 3280.84),
    attach: el => mapV.attach(el),
    detach: () => mapV.detach(),
  });
}

// run 11: statements that run when the program starts (in the order of the original file)
export async function init11() {
  sqPage = createSquadronPage({
    esc,
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
    buildMission: () => msfBuild(),
    loadMission: t => msfLoad(t, null),
    version: APP_VERSION,
    saveReceived: (t, n) => msfStoreReceived(t, n),
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
      groups: id => msfGroupsOf(id),
      forSend: (id, t) => msfForSend(id, t),
    },
  });
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
      return { wps: x.f.wps, labels: x.f.wps.map((_, i) => F['fp' + i + '_0'] || '') };
    },
    env: { get: perfEnv },
    runway: {
      get: () => {
        const d = F.__dep;
        if (!d) return null;
        const a = rwyAuto(d);
        return {
          id: d[0],
          name: d[0] + (F.ab0_0 ? ' · ' + F.ab0_0 : ''),
          ft: rwyFt(d),
          man: PERFP.rwy[d[0]] || 0,
          auto: a ? a.ft : 0,
          wid: a ? a.w : 0,
          info: RLI,
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
      get: () => ({ reserve: PERFP.reserve, joker: PERFP.joker }),
      set: o => {
        PERFP.reserve = o.reserve;
        PERFP.joker = o.joker;
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
    cyclePlan: () => mapV.cyclePlan(),
    planMode: () => mapV.planMode(),
    toggleEdit: () => mapV.toggleEdit(),
    isEdit: () => mapV.isEdit(),
  });
}
