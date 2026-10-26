// Air Tasking Order: every flight of the campaign, any faction, grouped by package.
import { ord, isHiFi, isHeli, els0, acOf, csOf, nAcf, hms, rmf, clean, nearAb, nearObj, totMs } from './flight.js';
const CAT = {
  'Offensive Counter Air': ['OCA STRIKE', 'SWEEP', 'ESCORT'],
  'Defensive Counter Air': ['DCA', 'BARCAP', 'HAVCAP', 'TARCAP', 'RESCORT', 'AMBUSHCAP', 'QRA', 'INTERCEPTION'],
  SEAD: ['DEAD', 'SEAD'],
  Airstrike: ['AI STRIKE', 'STRIKE', 'DEEP STRIKE', 'STEALTH STK', 'STRAT STRIKE'],
  'Air Interdiction': ['AI', 'BAI', 'SCAR'],
  CAS: ['FAC(A)', 'ON CALL CAS', 'PRE-PLAN CAS', 'CAS'],
  C3I: ['AEW/ABCCC', 'ELINT', 'EWS/ESJ', 'RECCE', 'RECCE PATROL'],
  Countersea: ['ASW', 'TASMO', 'PATROL'],
  Support: ['AIR REFUEL', 'AIRLIFT', 'AIRMOBILE', 'CSAR'],
};
export const CATEGORIES = [...Object.keys(CAT), 'Other'];
export const categoryOf = m => CATEGORIES.find(c => (CAT[c] || []).includes(m)) || 'Other';
const TEAMS = ['None', 'U.S.', 'ROK', 'Japan', 'CIS', 'PRC', 'DPRK', 'NATO'];
export const teamName = (D, t) => D.S[40 + t] || TEAMS[t] || 'Team ' + t;
const B = [0, 1, 2, 3, 4, 7, 8];
export function buildAto(C, L16) {
  const D = C.D,
    out = [];
  C.units
    .filter(u => u.kind == 'flight' && u.wps && u.wps.length)
    .forEach(f => {
      const mission = D.S[300 + f.omis] || (f.omis == 41 ? 'RELOCATE' : '?'),
        w = f.wps,
        t0 = w[0],
        tg = w.find(p => !B.includes(p.act)),
        ab = t0 && nearAb(C, t0.x, t0.y),
        ob = tg && nearObj(C, tg.x, tg.y),
        cs = csOf(C, f),
        r = rmf(C, cs),
        l = L16 && L16[f.campId],
        sq = C.byId[f.sqd.n + ':' + f.sqd.c];
      const eo = Math.max(
        0,
        els0(C, f).findIndex(x => x.id.n == f.id.n && x.id.c == f.id.c)
      );
      out.push({
        f,
        eo,
        team: f.owner,
        teamName: teamName(D, f.owner),
        pkg: f.pkg.n,
        pkgNo: (C.byId[f.pkg.n + ':' + f.pkg.c] || {}).campId || f.pkg.n,
        mission,
        cat: categoryOf(mission),
        callsign: cs,
        ac: acOf(C, f),
        n: nAcf(f),
        squadron: (sq && C.squads && C.squads[sq.id.n]) || (sq ? ord(sq.nameId) + ' Sqn' : ''),
        base: ab ? clean(ab[1]) : '',
        takeoff: t0 ? hms(t0.arr).slice(0, 5) : '',
        tot: totMs(C, f) ? hms(totMs(C, f)).slice(0, 5) : '',
        target: ob ? clean(ob[1]) : '',
        uhf: r[0],
        vhf: r[1],
        stn: l ? l.s : '',
        fc: l && l.fc >= 0 ? l.fc : '',
        mc: l && l.mc >= 0 ? l.mc : '',
        hifi: isHiFi(acOf(C, f)),
        heli: isHeli(acOf(C, f)),
      });
    });
  return out.sort((a, b) => (a.takeoff < b.takeoff ? -1 : a.takeoff > b.takeoff ? 1 : 0) || a.pkgNo - b.pkgNo);
}
// "1430", "14:30", "930", "14" -> prefix to compare with hh:mm
export function timePrefix(v) {
  const d = String(v || '')
    .replace(/\D/g, '')
    .slice(0, 4);
  if (!d) return '';
  if (d.length <= 2) return d;
  const h = d.length == 3 && +d.slice(0, 2) > 23 ? '0' + d : d;
  return h.slice(0, 2) + ':' + h.slice(2);
}
export function filterAto(list, q) {
  const m = (s, v) => !v || String(s).toLowerCase().includes(v.toLowerCase()),
    to = timePrefix(q.to),
    tt = timePrefix(q.tot);
  return list.filter(
    e =>
      (q.team == null || q.team === '' || e.team == q.team) &&
      (!q.cat || e.cat == q.cat) &&
      m(e.callsign, q.cs) &&
      m(e.ac, q.ac) &&
      m(e.pkgNo, q.pkg) &&
      m(e.mission, q.mis) &&
      m(e.base, q.ap) &&
      m(e.squadron, q.sq) &&
      (!to || e.takeoff.startsWith(to)) &&
      (!tt || e.tot.startsWith(tt))
  );
}
// Flights grouped by package (one row per package, flights inside).
export function groupPackages(list) {
  const g = new Map();
  list.forEach(e => {
    if (!g.has(e.pkg)) g.set(e.pkg, []);
    g.get(e.pkg).push(e);
  });
  const first = a => a.filter(Boolean).sort()[0] || '';
  return [...g.values()]
    .map(fl => {
      fl.sort((a, b) => a.eo - b.eo);
      const h = fl[0];
      const tm = [...new Map(fl.map(e => [e.team, e.teamName])).entries()].sort((a, b) => a[0] - b[0]);
      return {
        pkg: h.pkg,
        pkgNo: h.pkgNo,
        team: h.team,
        teams: tm.map(t => t[0]),
        teamName: tm.map(t => t[1]).join(' + '),
        mission: h.mission,
        cat: h.cat,
        base: h.base,
        takeoff: first(fl.map(e => e.takeoff)),
        tot: first(fl.map(e => e.tot)),
        target: (fl.find(e => e.target) || {}).target || '',
        flights: fl,
      };
    })
    .sort((a, b) => (a.takeoff < b.takeoff ? -1 : a.takeoff > b.takeoff ? 1 : 0) || a.pkgNo - b.pkgNo);
}
