import { createTargetData } from '../core/targetdata.js';
import { createDtcPage } from '../core/dtcpage.js';
import { FT_KM, WT_N, dtcPoints, removePoint } from '../core/mapdtc.js';
import { loadPrefs, savePrefs, readRange, isDesktop, readBytes } from '../platform/desktop.js';
import { readTarget, targetLine } from '../core/targets.js';
import { heightsAt } from '../bmsdata/heightmap.js';
import { openTargetPicker } from '../core/targetpicker.js';
import {
  fmtLL as mFmtLL,
  toLL as mToLL,
  flightRoute as mFlightRoute,
  legs as mLegs,
  fromLL as mFromLL,
} from '../core/mapdata.js';
import {
  nearObj as fNearObj,
  nAcf as fNAcf,
  csOf as fCsOf,
  actName as fActName,
  FORMS as fFORMS,
} from '../core/flight.js';
import { ST } from './state.js';
import { $, animOn, esc, jp } from './base.js';
import { G, S, lines, stpts, view } from './dtcfile.js';
import { dcSync, dtcChanged, freqOwners } from './datacard.js';
import { dtcBtns, dtcClear, dtcSet } from './dtcapply.js';
import { terrain } from './gamefiles.js';
import { mapV } from './pages.js';

// Defaults of the Data Cartridge pages (MFD, EWS, Systems): a snapshot of their keys kept in the program folder and put back into any file with a button
export const DEFSEC = {
  mfd: l => (l.s == 'MFD' && /^Display/.test(l.k)) || (l.s == 'Bullseye' && l.k == 'BullseyeInfoOnMFD'),
  ews: l => l.s == 'EWS',
  harm: l => l.s == 'HARM' && /^THREAT \d+ \d+$/.test(l.k),
};
export let DEFS = {};
export const defKeys = g => {
  const o = {};
  lines.filter(l => l.k && DEFSEC[g](l)).forEach(l => (o[l.s + '|' + l.k] = String(l.v)));
  return o;
};
export const dtcDef = {
  has: g => !!DEFS[g],
  get: g => DEFS[g],
  same: g => {
    const c = defKeys(g);
    if (!Object.keys(c).length) return true;
    if (!DEFS[g]) return false;
    return Object.keys(DEFS[g]).every(k => c[k] === undefined || c[k] === DEFS[g][k]);
  },
  save: g => {
    DEFS[g] = defKeys(g);
    try {
      savePrefs('dtcdefaults.json', DEFS);
    } catch (e) {}
  },
};
// Objectives and their features for the Targets page, read when first needed from the Objects folder of the BMS install
ST.OBJDIR = '';
ST.OBJCAMP = '';
// weapon targets (STPT wpntarget_n) for the Map page: the list to draw and the picker that fills the first free number (the Targets page of the DTC does the same)
export const wtHas = n => lines.some(l => l.s == 'STPT' && l.k === 'wpntarget_' + n);
export const wtList = () => {
  const o = [];
  for (let n = 0; n < WT_N; n++) {
    if (!wtHas(n)) continue;
    const t = readTarget(G('STPT', 'wpntarget_' + n, ''));
    if (t) o.push({ n, name: t.name, x: t.e / FT_KM, y: t.n / FT_KM, altFt: t.elv });
  }
  return o;
};
export const wtFree = () => {
  for (let i = 0; i < WT_N; i++) {
    if (wtHas(i) && !readTarget(G('STPT', 'wpntarget_' + i, ''))) return i;
  }
  return -1;
};
// put a target {n, e, elv, name} (ft) into the first free weapon target; the elevation is the terrain height when the terrain file can be read
export async function wtPut(t) {
  const n = wtFree();
  if (n < 0) return 'full';
  try {
    const tr = await terrain();
    const h = tr ? await heightsAt((o, l) => readRange(tr.path, o, l), tr.spec, [t]) : null;
    if (h && h[0] !== null && h[0] !== undefined) t.elv = h[0];
  } catch (e) {}
  S('STPT', 'wpntarget_' + n, targetLine(t, G('STPT', 'wpntarget_' + n, '')));
  dtcChanged('STPT', 'wpntarget_' + n);
  return 'ok';
}
export async function wtAdd() {
  const data = targetData();
  if (!data) return 'noinst';
  let n = -1;
  for (let i = 0; i < WT_N; i++) {
    if (wtHas(i) && !readTarget(G('STPT', 'wpntarget_' + i, ''))) {
      n = i;
      break;
    }
  }
  if (n < 0) return 'full';
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
    title: 'Target ' + (n + 1),
  });
  if (!t) return 'cancel';
  try {
    const tr = await terrain();
    const h = tr ? await heightsAt((o, l) => readRange(tr.path, o, l), tr.spec, [t]) : null;
    if (h && h[0] !== null && h[0] !== undefined) t.elv = h[0];
  } catch (e) {}
  S('STPT', 'wpntarget_' + n, targetLine(t, G('STPT', 'wpntarget_' + n, '')));
  dtcChanged('STPT', 'wpntarget_' + n);
  return 'ok';
}
export const targetData = () => {
  if (window.__targetData) return window.__targetData;
  if (!isDesktop() || !ST.OBJDIR) return null;
  return TDATA;
};
export let TDATA;

// run 8: statements that run when the program starts (in the order of the original file)
export async function init8() {
  TDATA = createTargetData({
    dir: () => ST.OBJDIR,
    camp: () => ST.OBJCAMP,
    readBytes: (...a) => readBytes(...a),
    jp: (...a) => jp(...a),
  });
  ST.dtcPage = createDtcPage({
    nearName: (x, y) => {
      try {
        const o = ST.C && fNearObj(ST.C, x, y, 3);
        return o ? String(o[1]) : '';
      } catch (e) {
        return '';
      }
    },
    elev: async pts => {
      const t = await terrain();
      return t ? heightsAt((o, l) => readRange(t.path, o, l), t.spec, pts) : null;
    },
    nav: $('dnav'),
    view: $('view'),
    esc,
    anim: animOn,
    lines: () => lines,
    G,
    S,
    FT_KM,
    points: () => dtcPoints(lines),
    route: () => stpts(),
    routeSet: (n, f, v) => {
      const r = stpts().find(z => z.n == n);
      if (!r) return;
      r[f] = v;
      const p = r.l.v.split(',').map(a => a.trim());
      p[0] = r.x;
      p[1] = r.y;
      p[2] = (-r.alt).toFixed(6);
      p[3] = r.t;
      S('STPT', r.l.k, p.join(', '));
      dtcChanged('STPT', r.l.k);
    },
    ll: (n, e) => {
      try {
        return mFmtLL(...mToLL(e / FT_KM, n / FT_KM));
      } catch (x) {
        return '';
      }
    },
    flight: () => {
      try {
        const f = ST.C && ST.CL.length && ST.CL[+$('fsel').value || 0] && ST.CL[+$('fsel').value || 0].f;
        if (!f || !f.wps) return [];
        const mn = ST.C.D.S[300 + f.omis] || '',
          r = mFlightRoute(ST.C, f),
          lg = mLegs(r),
          nA = fNAcf(f),
          o = r.map((w, i) => {
            const p = f.wps[i],
              q = f.wps[i - 1],
              l = lg[i],
              dt = q && p.arr > 0 && q.arr > 0 ? (p.arr - q.arr) / 3600000 : 0;
            return {
              n: w.n,
              name: fActName(f.wps, i, mn),
              pos: mFmtLL(w.ll[0], w.ll[1]),
              alt: w.altFt,
              hdg: l ? String(Math.round(l.hdg)).padStart(3, '0') + '°' : '',
              dist: l ? l.nm.toFixed(1) : '',
              spd: l && dt > 0 ? Math.round(l.nm / dt) : '',
              form:
                nA > 1 && p.act != 4
                  ? p.act == 7
                    ? 'Echelon'
                    : p.z * 10 < 5000
                      ? 'Trail'
                      : fFORMS[p.form & 7] || ((p.form & 7) == 0 && p.form & 128 ? 'Spread' : '')
                  : '',
            };
          });
        o.cs = fCsOf(ST.C, f);
        return o;
      } catch (e) {
        return [];
      }
    },
    llInv: (lat, lon) => mFromLL(lat, lon),
    autoPpt: () => {
      try {
        return mapV.autoPptSlots();
      } catch (e) {
        return new Set();
      }
    },
    lineNotes: () => {
      try {
        return mapV.lineNotes();
      } catch (e) {
        return {};
      }
    },
    confirm: m => confirm(m),
    targetData: () => targetData(),
    dtcDef: dtcDef,
    showMfd34: () => !!(ST.CFG.ui && ST.CFG.ui.showMfd34),
    owners: freqOwners,
    changed: (sec, key) => dtcChanged(sec, key),
    sync: dcSync,
    pointSet: (g, slot, patch) => dtcSet(g, slot, patch, true),
    pointDel: (g, slot) =>
      removePoint(
        dtcPoints(lines),
        g,
        slot,
        (a, b, c) => dtcSet(a, b, c, true),
        (a, b) => dtcClear(a, b, true)
      ),
  });
  loadPrefs('dtcdefaults.json')
    .then(async o => {
      if (o && typeof o == 'object') DEFS = Object.assign({}, o);
      if (!DEFS.mfd) {
        const m = await loadPrefs('mfddefault.json');
        if (m && m.keys) DEFS.mfd = m.keys;
      }
      view();
    })
    .catch(() => {});
  loadPrefs('dtcprefs.json')
    .then(o => {
      if (o && o.sync) {
        ST.DCS = Object.assign({}, o.sync);
        ST.dtcPage.setSync(ST.DCS);
        view();
      }
    })
    .catch(() => {});
  dtcBtns();
  ST.dtcPage.render();
}
