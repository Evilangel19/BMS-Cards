import { loadPrefs, readBytes, readRange, savePrefs } from '../platform/desktop.js';
import { heightsAt } from '../bmsdata/heightmap.js';
import { parseObjectives, phdPath, pdxPath } from '../core/targets.js';
import { runwayLengths, parseRunways, describeRunways, ilsOrder } from '../bmsdata/runways.js';
import * as PA from '../core/airperf.js';
import { climbAltitude, fuelPlan } from '../core/fuelplan.js';
import { CAM } from '../core/cam-core.js';
import { isShipBase } from '../core/carriers.js';
import { ST } from './state.js';
import { F, dEl, MIR, TOPOWER, pushOne } from './datacard.js';
import { $, jp } from './base.js';
import { pfPage } from './pages.js';
import { wxAt, wxWind } from './campaign.js';
import { perfAcGet, terrain } from './gamefiles.js';
import { markMan } from './selection.js';
import { draw } from './cardview.js';
import { lines } from './dtcfile.js';

/* Datacard fields from the performance data: TO Spec, Rotation, Refusal, Mil Power, Mil Climb, TO Fuel, Joker, Bingo and the Min.Fuel of every steerpoint. Fields the user typed are left alone. */
export const TAXIMIN = 10; // minutes of engine start and taxi at idle between the parking spot and the take-off roll (estimate)
export let PERFP = { rwy: {}, reserve: 1500, joker: 1000, ohalt: 1500, ohspd: 300 };
ST.PFT = 0;
ST.NOPERF = false;
// Runway sizes read from the objective files of the airbases (RL: campId -> {ends: {'09': {ft, w}}, max}); the length typed on the Performance page wins over them
ST.RL = {};
export let RLI = 'not read yet'; // RLI: what happened when the sizes were read (shown on the Performance page when a base has none)
export const rwyAuto = d => {
  const r = d && F.__ab && F.__ab[0] && ST.RL[F.__ab[0][0]]; // the campaign id of the departure airbase is F.__ab[0][0] (F.__dep starts with the ICAO code)
  if (!r) return null;
  const n = parseInt(F.ab0_5),
    k = isNaN(n) ? '' : String(n).padStart(2, '0');
  return r.ends[k] || r.max;
};
export const rwyFt = d => (d ? PERFP.rwy[d[0]] || (rwyAuto(d) || {}).ft || 0 : 0);
export async function loadRunways(atc) {
  try {
    ST.RL = {};
    if (!ST.OBJDIR) {
      RLI = 'Falcon4_CT.xml (objects folder) not found';
      return;
    }
    RLI = 'reading…';
    const dec = b => new TextDecoder('utf-8').decode(b),
      ids = new Set(atc.map(a => a.campId)),
      allObjs = parseObjectives(dec(await readBytes(ST.OBJCAMP || jp(ST.OBJDIR, 'CampObjData.XML')))),
      objs = allObjs.filter(o => ids.has(String(o.id))),
      byOcd = {},
      rwl = {};
    let err = '';
    for (let i = 0; i < objs.length; i += 10)
      await Promise.all(
        objs.slice(i, i + 10).map(async o => {
          try {
            if (!byOcd[o.ocd])
              byOcd[o.ocd] = parseRunways(
                dec(await readBytes(jp(ST.OBJDIR, ...phdPath(o.ocd).split('/')))),
                dec(await readBytes(jp(ST.OBJDIR, ...pdxPath(o.ocd).split('/'))))
              );
            rwl[o.id] = byOcd[o.ocd];
          } catch (e) {
            err = err || o.id + ': ' + ((e && e.message) || e);
          }
        })
      );
    ST.RL = runwayLengths(atc, rwl);
    // an airbase without an ATC file of its own (an add-on theater that brings none: ITO has the Korean ones): the size and the numbers of its runways come from its own objective files
    const isAb = o => (CAM.D.ab && CAM.D.ab[o.id]) || /air\s?(base|field|port|strip)|\([A-Z]{4}\)/i.test(o.name);
    const todo = allObjs.filter(o => !ST.RL[o.id] && isAb(o)),
      found = [],
      byOrd = {},
      // the ILS of the Stations table: one for each runway end, in the order of the file (runway 1 .. 4)
      ilsOf = id => ((CAM.D.ab && CAM.D.ab[id]) || []).slice(7, 11);
    for (let i = 0; i < todo.length; i += 10)
      await Promise.all(
        todo.slice(i, i + 10).map(async o => {
          try {
            if (!byOrd[o.ocd]) {
              const phd = dec(await readBytes(jp(ST.OBJDIR, ...phdPath(o.ocd).split('/')))),
                pdx = dec(await readBytes(jp(ST.OBJDIR, ...pdxPath(o.ocd).split('/'))));
              byOrd[o.ocd] = { list: parseRunways(phd, pdx), order: ilsOrder(phd, pdx) };
            }
            const { list, order } = byOrd[o.ocd];
            if (!list.length) return;
            const ends = {},
              rw = [];
            // the ends in the order of the ILS of the Stations table (ILS 1..4); two parallel runways keep one entry each
            order.forEach((e, k) => {
              const q = String(e.n).padStart(2, '0'),
                r = list.find(x => +x.id === e.rw) || list[0];
              if (!ends[q]) ends[q] = { ft: Math.round(r.len), w: Math.round(r.wid) };
              rw.push([q, e.n * 10, ilsOf(o.id)[k] || 0]);
            });
            const big = list.reduce((m, r) => (r.len > m.len ? r : m), list[0]);
            ST.RL[o.id] = { ends, max: { ft: Math.round(big.len), w: Math.round(big.wid) } };
            found.push({ o, rw });
          } catch (e) {
            /* no files for this base */
          }
        })
      );
    let why = '';
    if (!Object.keys(ST.RL).length && objs.length) {
      try {
        const o = objs[0];
        why =
          '; first base ' +
          o.id +
          ' (OCD ' +
          o.ocd +
          '): ' +
          describeRunways(
            dec(await readBytes(jp(ST.OBJDIR, ...phdPath(o.ocd).split('/')))),
            dec(await readBytes(jp(ST.OBJDIR, ...pdxPath(o.ocd).split('/'))))
          );
      } catch (e) {
        why = '; first base: ' + ((e && e.message) || e);
      }
    }
    // the same bases get their runway numbers (for the choice of the runway)
    if (found.length) {
      found.forEach(({ o, rw }) => {
        CAM.D.ap[o.id] = { i: (o.name.match(/\(([A-Z]{4})\)/) || [])[1] || '', rw };
      });
    }
    // every airbase still without an elevation (no AIP list in this theater) gets the one from the heights of the theater
    {
      const need = allObjs.filter(o => isAb(o) && !CAM.D.el[o.id] && o.n !== undefined);
      if (need.length)
        try {
          const tr = await terrain(),
            h = tr
              ? await heightsAt(
                  (off, len) => readRange(tr.path, off, len),
                  tr.spec,
                  need.map(o => ({ n: o.n, e: o.e }))
                )
              : null;
          if (h)
            need.forEach((o, i) => {
              if (h[i] !== null && h[i] !== undefined) CAM.D.el[o.id] = Math.round(h[i]);
            });
        } catch (e) {
          /* no heights: the elevation stays empty */
        }
    }
    RLI =
      Object.keys(ST.RL).length +
      ' of ' +
      atc.length +
      ' ATC airbases have a runway size (' +
      objs.length +
      ' found in CampObjData)' +
      (err ? '; first error ' + err : '') +
      why;
    try {
      perfFill(+$('fsel').value || 0);
    } catch (e) {}
    try {
      pfPage.render();
    } catch (e) {}
  } catch (e) {
    ST.RL = {};
    RLI = 'error: ' + ((e && e.message) || e);
  }
}
export const perfSave = () => {
  try {
    savePrefs('perfprefs.json', PERFP);
  } catch (e) {}
};
// Conditions at the departure of the selected flight: field elevation (ft), headwind on the planned runway (kt, from the weather at the departure time) and temperature against ISA (°C)
export function perfEnv() {
  const d = F.__dep;
  if (!d) return null;
  const elev = +F.ab0_4 || 0;
  let hw = 0,
    isa = 0,
    wind = null;
  const wxd = wxAt(d[3]);
  if (wxd) {
    try {
      const w = wxd.at(d[1], d[2]);
      isa = w.t - (15 - (1.9812 * elev) / 1000);
      wind = { hdg: w.hdg, spd: w.spd };
      const rn = parseInt(F.ab0_5);
      if (!isNaN(rn) && w.spd >= 3) hw = w.spd * Math.cos(((rn * 10 - w.hdg) * Math.PI) / 180);
    } catch (e) {}
  }
  const rn = parseInt(F.ab0_5);
  return {
    name: d[0] + (F.ab0_0 ? ' · ' + F.ab0_0 : ''),
    elev,
    hw,
    isa,
    wind,
    rwy: isNaN(rn) ? '' : String(rn).padStart(2, '0'),
  };
}
export async function perfCalc(i) {
  const f = ST.C && ST.CL[i] && ST.CL[i].f;
  if (!f || !f.wps || f.wps.length < 2) return null;
  const an = ST.C.D.ac[f.c.i];
  let ac = await perfAcGet(an);
  let q = an;
  while (!ac && q && q.includes(' ')) {
    q = q.replace(/\s+\S+$/, '');
    ac = await perfAcGet(q);
  }
  if (!ac) return null;
  const ty = an.replace(/\s*ROK\w*$/, ''),
    ew = ST.C.D.ew && ST.C.D.ew[ty],
    gw = +F.gw || 0,
    fuel = +F.fuel || 0,
    di = +F.drag || 0;
  if (!ew || !gw) return null;
  const stores = Math.max(0, gw - ew - fuel),
    d = F.__dep,
    E = perfEnv(),
    elev = E ? E.elev : 0,
    hw = E ? E.hw : 0,
    dIsa = E ? E.isa : 0;
  const ship = isShipBase(F.__ab && F.__ab[0]), // no runway to stop on: a take-off from a ship cannot be aborted
    rwy = rwyFt(d),
    to = PA.takeoff(ac, { W: gw, elev, dIsa, hw, power: TOPOWER, di }),
    alt = climbAltitude(f.wps);
  let taxi = 300;
  try {
    const id = PA.engine(ac, elev, 0, 'idle');
    if (id && id.ff > 0) taxi = (id.ff * TAXIMIN) / 60;
  } catch (e) {}
  return {
    ac,
    to,
    taxi,
    rpm: PA.milRpm(ac),
    ship,
    refusal: rwy && !ship ? PA.refusal(ac, { W: gw, elev, dIsa, hw, power: TOPOWER, di, rwy }) : null,
    climb: PA.climbSchedule(ac, { W: gw, dIsa, di, to: alt }),
    plan: fuelPlan(ac, f.wps, {
      empty: ew,
      stores,
      di,
      dIsa,
      reserve: PERFP.reserve,
      jokerMargin: PERFP.joker,
      loaded: fuel,
      wind: wxWind,
    }),
  };
}
export async function perfFill(i) {
  if (ST.NOPERF || !ST.C || !ST.CL[i] || !ST.AUTO) return;
  const k = ST.CURK;
  const put = (key, v) => {
    if (ST.MANK.has(key)) return;
    v = v == null ? '' : String(v);
    F[key] = v;
    ST.AUTO[key] = v;
    const d = dEl(key);
    if (d && d.el) d.el.value = v;
    if (MIR[key] && ST.DCS[MIR[key].grp] && lines.length) pushOne(key);
  };
  // the overhead pattern of the landing steerpoints: speed and altitude from the Fuel plan sliders (the Performance page)
  {
    const f = ST.CL[i].f;
    if (CAM.isHiFi(ST.C.D.ac[f.c.i] || '') || CAM.hasAcData(ST.C.D, ST.C.D.ac[f.c.i] || ''))
      f.wps.forEach((p, j) => {
        if (j < 24 && p.act == 7) {
          put(`fp${j}_4`, '- / ' + PERFP.ohspd);
          put(`fp${j}_5`, String(PERFP.ohalt));
        }
      });
  }
  let r;
  try {
    r = await perfCalc(i);
  } catch (e) {
    return;
  }
  if (!r || ST.CURK !== k || !ST.AUTO) return;
  if (!r.to.stuck) {
    put('tospec', (TOPOWER == 'mil' || !r.ac.hasAb ? 'MIL ' : 'AB ') + Math.round(r.to.aLO) + '°');
    put('rot', Math.round(r.to.vr));
  }
  if (r.rpm) put('mp', r.rpm + '%');
  if (r.ship) put('ref', '---');
  else if (r.refusal != null) put('ref', r.refusal >= 224.5 ? '225+' : Math.round(r.refusal));
  if (r.climb) put('mc', r.climb.cas + '/.' + String(Math.round(r.climb.mach * 100)).padStart(2, '0'));
  {
    const pk = +F.fuel;
    put('tof', pk > 0 ? Math.round((pk - r.taxi) / 10) * 10 : r.plan.toFuel);
  } // TO Fuel = what is left at take-off: the fuel at the parking spot minus start and taxi (the fuel the plan needs is in the Performance page)
  put('bingo', r.plan.bingo);
  put('joker', r.plan.joker);
  r.plan.rows.forEach((x, j) => {
    if (j < 24 && x.min != null) put(`fp${j}_6`, x.min);
  });
  markMan();
  draw();
}
export const perfLater = () => {
  clearTimeout(ST.PFT);
  ST.PFT = setTimeout(() => perfFill(+$('fsel').value || 0), 400);
};
export const bvrCells = rows => {
  const o = [];
  rows.forEach((r, i) =>
    [r && r.cls, r && r.mtr, r && r.fr, r && r.mar, r && r.dr, r && r.dor].forEach((v, j) =>
      o.push([
        `bv${i}_${j}`,
        v == null || v === '' || v === false ? '' : typeof v == 'number' ? String(Math.round(v)) : v,
      ])
    )
  );
  return o;
};

// run 12: statements that run when the program starts (in the order of the original file)
export async function init12() {
  loadPrefs('perfprefs.json')
    .then(o => {
      if (o && typeof o == 'object') PERFP = Object.assign(PERFP, o, { rwy: Object.assign({}, o.rwy) });
      if (PERFP.joker === 500) PERFP.joker = 1000;
    })
    .catch(() => {});
}
