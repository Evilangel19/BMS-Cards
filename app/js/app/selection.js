import { BMS_TESTED } from '../core/version.js';
import { CAM } from '../core/cam-core.js';
import { groupPackages } from '../core/ato.js';
import { ST } from './state.js';
import { F, FD, CYC, buildForm } from './datacard.js';
import { $, esc } from './base.js';
import { ATOCAT, ATOL, ATOOPEN, PLAYER, atoCloseState, atoSearch } from './ato.js';
import { wxApply, wxPrep, campDir } from './campaign.js';
import { join as joinPath, listDir, readBytes, isDesktop } from '../platform/desktop.js';
import { applyDTC, msfFreeze } from './dtcapply.js';
import { draw } from './cardview.js';
import { perfFill } from './perf.js';

// Manual datacard changes are kept per flight (OVR: flight id -> {field: value}); they are the difference from the automatic fill (AUTO) and are put back when the flight is selected again
export const fkey = f => (f && f.campId != null ? String(f.campId) : null);
export const manDiff = () => {
  if (!ST.AUTO) return {};
  const o = {};
  ST.MANK.forEach(k => {
    if ((F[k] || '') !== (ST.AUTO[k] || '')) o[k] = F[k] || '';
  });
  return o;
}; // only the fields the user typed (the DTC and the rules also write into F)
export const hasMan = () => Object.keys(manDiff()).length > 0 || [...ST.OVR.values()].some(o => Object.keys(o).length);
export const flMan = f => {
  const k = fkey(f);
  return k != null && (k === ST.CURK ? Object.keys(manDiff()).length > 0 : ST.OVR.has(k));
};
export function markMan() {
  const df = manDiff();
  FD.forEach(d => {
    if (d.el) d.el.classList.toggle('man', d.k in df);
  });
  const r = $('rstf');
  if (r) r.style.display = Object.keys(df).length ? '' : 'none';
  document.querySelectorAll('#ato .fl').forEach(el => {
    const e = ATOL[+el.dataset.i];
    el.classList.toggle('man', !!e && flMan(e.f));
  });
}
// before anything that rebuilds every flight from scratch (other campaign, date, weather): the changes would be lost
export async function discardOk() {
  if (!hasMan()) return true;
  return await confirm('The datacard changes you made by hand will be discarded. Continue?');
}
export function manClear() {
  ST.LDX = new Map();
  ST.OVR = new Map();
  ST.AUTO = null;
  ST.CURK = null;
  ST.MANK = new Set();
  ST.XBASE = undefined;
}
export function apply(i, mode) {
  if (mode !== 'reset' && mode !== 'fresh' && ST.CURK !== null && ST.AUTO) {
    const df = manDiff();
    if (Object.keys(df).length) ST.OVR.set(ST.CURK, df);
    else ST.OVR.delete(ST.CURK);
  }
  ST.MAPSHOT = null;
  ST.XBASE = undefined; // the other data of the mission (Weapons, HARM, BVR, tankers, map picture) start again from here
  ST.ATOSEL = ST.CL[i] && ST.CL[i].f;
  if (ST.ATOSEL && ST.ATOSEL.owner == PLAYER) {
    ATOOPEN.add(ST.ATOSEL.pkg.n);
    const pg = groupPackages(ATOL.filter(z => z.pkg == ST.ATOSEL.pkg.n))[0];
    if (pg) ATOCAT.add(pg.cat);
    ST.VIEW = PLAYER;
  }
  FD.forEach(d => (F[d.k] = ''));
  {
    const lf = ST.CL[i].f,
      G = CAM.loadGroups(lf);
    if (!ST.LDX) ST.LDX = new Map();
    if (G.length > 1) CYC.ldsel = G.map(g => g.label);
    else delete CYC.ldsel;
    Object.assign(F, CAM.fillCard(ST.C, lf, ST.LDX.get(fkey(lf)) | 0));
  }
  wxApply(i, (k, v) => {
    F[k] = v;
  });
  if (ST.L16) {
    const f = ST.CL[i].f,
      b = ST.L16[f.campId];
    if (b) {
      const n = CAM.nAcf(f);
      for (let q = 0; q < n; q++)
        F['fl' + q + '_3'] = b.s + (q + 1) + (b.mc >= 0 ? ' MC ' + b.mc : '') + (b.fc >= 0 ? ' FC ' + b.fc : '');
    }
    CAM.els0(ST.C, f)
      .slice(0, 5)
      .forEach((e, q) => {
        const t = ST.L16[e.campId];
        if (t) F['pk' + q + '_4'] = t.s + '1';
      });
  }
  applyDTC(ST.CL[i].f);
  [
    ['ab', 3, 7],
    ['fl', 4, 7],
    ['pk', 5, 7],
    ['su', 5, 4],
  ].forEach(([p, n, m]) => {
    for (let r = 0; r < n; r++) {
      const ks = [];
      for (let c = 0; c < m; c++) if (FD.some(d => d.k === `${p}${r}_${c}`)) ks.push(`${p}${r}_${c}`);
      if (ks.some(k => F[k] && F[k] !== '---'))
        ks.forEach(k => {
          if (!F[k]) F[k] = '---';
        });
    }
  });
  if (mode !== 'reset') msfFreeze(ST.CL[i].f);
  {
    const k = fkey(ST.CL[i].f);
    ST.AUTO = {};
    FD.forEach(d => {
      ST.AUTO[d.k] = F[d.k] || '';
    });
    ST.CURK = k;
    ST.MANK = new Set();
    if (mode === 'reset') ST.OVR.delete(k);
    else if (ST.OVR.has(k)) {
      Object.assign(F, ST.OVR.get(k));
      ST.MANK = new Set(Object.keys(ST.OVR.get(k)));
    }
  }
  buildForm();
  markMan();
  draw();
  atoSearch();
  perfFill(i);
  wxPrep(i);
}
export const pick = () => {
  const all = ST.CL.map((_, i) => i),
    mine = all.filter(i => ST.CL[i].f.owner == ST.C.playerTeam),
    hi = mine.filter(i => CAM.isHiFi((ST.CL[i].f && ST.C.D.ac[ST.CL[i].f.c.i]) || '')),
    hi2 = all.filter(i => CAM.isHiFi(ST.C.D.ac[ST.CL[i].f.c.i] || ''));
  return hi.length ? hi : mine.length ? mine : hi2.length ? hi2 : all;
};
// The owners of the untouched objectives are in the scenario file the campaign was saved from (Save3.cam ...: the campaign file holds only the changes): looked for in the Campaign folder
export async function loadBaseOwners(C) {
  try {
    if (!C || !C.base || !isDesktop()) return 0;
    const dir = campDir();
    if (!dir) return 0;
    const e = (await listDir(dir)).find(x => !x.isDirectory && x.name.toLowerCase() === C.base.toLowerCase() + '.cam');
    if (!e) return 0;
    return CAM.initialOwners(C, new Uint8Array(await readBytes(joinPath(dir, e.name))));
  } catch (x) {
    return 0;
  }
}
// stale(): true when another campaign was chosen meanwhile (then this one is dropped before it replaces anything)
export async function loadCam(file, stale) {
  if (!CAM.D.ct.length)
    return alert(
      'The game data is missing: set the BMS install folder in Settings. The program reads the entity table, the objects and the names from your Falcon BMS installation.'
    );
  let C;
  try {
    const u8 = new Uint8Array(await file.arrayBuffer());
    if (stale && stale()) return;
    C = ST.C = CAM.openCam(u8, CAM.D, file.name);
    ST.CL = CAM.listFlights(ST.C, null);
    manClear();
  } catch (e) {
    return alert(
      'Unable to read the campaign: ' +
        e.message +
        (ST.THEATERS.length > 1
          ? '\n\nThe selected theater is "' +
            (ST.TH ? ST.TH.name : '?') +
            '": a campaign of another theater cannot be read with its tables. Choose the right theater in the theater menu and open the campaign again.'
          : '')
    );
  }
  await loadBaseOwners(C);
  if (ST.C !== C) return; // another campaign was opened meanwhile: it goes on from here
  if (ST.C.ver > CAM.CAM_VER_MAX)
    alert(
      'This campaign file is newer (' +
        ST.C.ver +
        ') than the versions this program was checked with (up to ' +
        CAM.CAM_VER_MAX +
        ', Falcon BMS ' +
        BMS_TESTED +
        '): some data may be read wrongly. Check the flight data against the game, or look for a newer BMS Cards.'
    );
  if (!ST.CL.length) return alert('No flight with a datacard found in this campaign.');
  $('fsel').innerHTML = ST.CL.map((x, i) => `<option value="${i}">${esc(x.label)}</option>`).join('');
  const pk = () => {
    const m = pick();
    return m[Math.floor(Math.random() * m.length)];
  };
  const i = pk();
  $('fsel').value = i;
  atoSearch();
  apply(i);
  atoCloseState();
  atoSearch();
}

// The aircraft of a flight carry different loadouts: choosing a group (the list in the Config cell) redoes everything that comes from the loadout (rows, gross weight, drag, fuel and what follows from them in Performance)
ST.ldSet = v => {
  const i = +$('fsel').value || 0,
    x = ST.CL && ST.CL[i];
  if (!x || !ST.AUTO) return;
  const G = CAM.loadGroups(x.f),
    n = G.findIndex(g => g.label == v);
  if (n < 0) return;
  if (!ST.LDX) ST.LDX = new Map();
  ST.LDX.set(fkey(x.f), n);
  const N = CAM.fillCard(ST.C, x.f, n);
  ['ldsel', 'aa', 'ag', 'ecm', 'tanks', 'gw', 'drag', 'fuel'].forEach(k => {
    const t = N[k] == null ? '' : String(N[k]);
    F[k] = t;
    ST.AUTO[k] = t;
    ST.MANK.delete(k);
    const d = FD.find(z => z.k == k);
    if (d && d.el) d.el.value = t;
  });
  markMan();
  draw();
  perfFill(i);
};
