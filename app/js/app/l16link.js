import { ST } from './state.js';
import { F, dtcChanged } from './datacard.js';
import { G, S, lines } from './dtcfile.js';
import { seatIdx } from './seat.js';
import {
  L16_EMPTY,
  addRec,
  callsignAbbr,
  callsignNumber,
  dropFile,
  dropFlight,
  flightStn,
  l16Edits,
  normStn,
  placeCheck,
  planDiff,
  resolvePlan,
  slotOfKey,
  slotValues,
} from '../core/l16plan.js';

/* The Link 16 files of the DTC for the flight on the card (the rules are in core/l16plan.js). The plan comes from the package table of the datacard (callsign, number of aircraft and STN of
   each flight, in the order of the card), so it works for a mission too, where the campaign's Link 16 file is not there. The changes of the pilot (a flight put in a place from the map,
   a flight taken out, an STN typed on the Data Cartridge page) are records kept for each flight of the card (ST.L16OV: flight -> records) and saved in the mission (datacard.l16).
   The lines of the DTC are written for the seat (callsign letters, number, flight lead flag, the STN slots) by seatDtcEdits (app/seatdtc.js) whenever the seat changes while the switch
   "from Datacard" of Link 16 is on, and at once when the pilot changes the plan from the map or the page. File B is empty and untouched unless the pilot puts something in it. */

const str = x => String(x == null ? '' : x).trim();
const ovMap = () => (ST.L16OV instanceof Map ? ST.L16OV : (ST.L16OV = new Map()));

// ---- the records of the flight on the card ----
export const l16Recs = () => (ST.CURK != null && ovMap().get(ST.CURK)) || [];
function setRecs(recs) {
  if (ST.CURK == null) return;
  if (recs.length) ovMap().set(ST.CURK, recs);
  else ovMap().delete(ST.CURK);
}
export const l16Clear = () => {
  ST.L16OV = new Map();
};
// the mission keeps the records of its flight
export const l16Save = () => l16Recs().map(r => ({ ...r }));
export function l16Load(recs) {
  const ok = r =>
    r &&
    (r.a === 'A' || r.a === 'B') &&
    ((r.k === 'put' && /^\d{4}$/.test(str(r.stn))) || r.k === 'off' || r.k === 'pin');
  setRecs((Array.isArray(recs) ? recs : []).filter(ok).map(r => ({ ...r })));
}

// ---- the plan ----
// the flights of the package as the card shows them (callsign, aircraft, STN): only those with an STN
export function l16Flights() {
  const out = [];
  for (let i = 0; i < 5; i++) {
    const cs = str(F[`pk${i}_0`]),
      stn = flightStn(F[`pk${i}_4`]),
      n = parseInt(F[`pk${i}_1`], 10);
    if (cs && cs !== '---' && stn && n >= 1) out.push({ cs, stn, n: Math.min(4, n) });
  }
  return out;
}
export const l16Own = () => str(F.cs);
export const l16Plan = file => resolvePlan(file, l16Flights(), l16Own(), l16Recs());
const sectionOn = () => lines.some(l => l.s === 'LINK16');

// the lines of [LINK16] for the aircraft `seat`: file A always (callsign letters, number, flight lead flag, slots of the plan); file B only when the pilot put something in it (or took it all out:
// opts.clearB), and its callsign only when it is empty or the same as A
export function l16DtcEdits(seat, opts = {}) {
  const cs = l16Own();
  if (!ST.C || !cs || !sectionOn() || !(seat >= 0 && seat < 4)) return [];
  const get = k => G('LINK16', k, ''),
    flights = l16Flights(),
    abbr = callsignAbbr(cs),
    number = callsignNumber(cs, seat),
    recs = l16Recs(),
    ownKnown = flights.some(f => f.cs === cs),
    out = [];
  l16Edits(get, 'A', {
    abbr,
    number,
    seat,
    slots: ownKnown ? slotValues(resolvePlan('A', flights, cs, recs)) : null,
  }).forEach(e => out.push({ s: 'LINK16', ...e }));
  if (recs.some(r => r.a === 'B') || opts.clearB) {
    const planB = resolvePlan('B', flights, cs, recs),
      cur = str(get('FILE_B_CALLSIGN'));
    l16Edits(get, 'B', {
      abbr,
      number,
      seat,
      slots: slotValues(planB),
      identity: planB.some(Boolean) && (cur === '' || cur === abbr),
    }).forEach(e => out.push({ s: 'LINK16', ...e }));
  }
  return out;
}
// the channels of the flight (card: dl0_mc = Mission, dl0_fc = Fighter, dl0_sc = Special, from the Link 16 file of the campaign) in file A, as BMS shows them: three digits, 000 when there is none.
// Only when the card has the channels of this flight (a flight that is not in the file of the campaign leaves the lines as they are), and only the lines that change
const KCH = [
  ['MISSION', 'dl0_mc'],
  ['FIGHTER', 'dl0_fc'],
  ['SPECIAL', 'dl0_sc'],
];
export function l16ChanEdits() {
  if (!lines.length || !sectionOn() || (str(F.dl0_mc) === '' && str(F.dl0_fc) === '')) return [];
  const out = [];
  KCH.forEach(([n, ck]) => {
    const key = `FILE_A_${n}_CHANNEL`,
      want = String(Math.max(0, parseInt(str(F[ck]), 10) || 0)).padStart(3, '0');
    if (!lines.some(l => l.s === 'LINK16' && l.k === key)) return;
    if (parseInt(G('LINK16', key, ''), 10) !== parseInt(want, 10)) out.push({ s: 'LINK16', k: key, v: want });
  });
  return out;
}
// writes lines into the DTC (the Data Cartridge page shows them at once); returns how many changed
export function applyEdits(es) {
  es.forEach(e => {
    S(e.s, e.k, e.v);
    dtcChanged(e.s, e.k, true);
  });
  if (es.length && ST.dtcPage && ST.dtcPage.render) ST.dtcPage.render();
  return es.length;
}

// a flight of the map (an entry of the ATO list: callsign, aircraft, STN) as the plan takes it: {cs, stn, n}. null when it has no STN (the card's package table has it too, for a mission)
export function l16Mate(e) {
  if (!e) return null;
  const cs = str(e.callsign),
    card = l16Flights().find(x => x.cs === cs),
    stn = /^\d{4}$/.test(str(e.stn)) ? str(e.stn) : card ? card.stn : '',
    n = Math.min(4, Math.max(1, parseInt(e.n, 10) || (card ? card.n : 1)));
  return cs && stn ? { cs, stn, n } : null;
}
// the slots (from 0) a flight has in the plan of a file
export const l16Has = (file, cs) =>
  l16Plan(file)
    .map((c, i) => (c && c.cs === cs ? i : -1))
    .filter(i => i >= 0);

// ---- what the pilot does ----
// can the plan be written now: a DTC with a Link 16 section, a flight on the card, and the switch "from Datacard" of Link 16 on. why: the reason when not
export function l16Can() {
  if (!ST.C || ST.CURK == null || !l16Own()) return { ok: false, why: 'Choose a flight first.' };
  if (!lines.length) return { ok: false, why: 'Open a DTC first.' };
  if (!sectionOn()) return { ok: false, why: 'This DTC has no Link 16 section.' };
  if (!(ST.DCS && ST.DCS.l16))
    return { ok: false, why: 'Switch on “from Datacard” on the Link 16 page of the Data Cartridge.' };
  if (!l16Flights().some(f => f.cs === l16Own()))
    return { ok: false, why: 'The Link 16 file of the campaign has no STN for this flight.' };
  return { ok: true, why: '' };
}
const push = opts => applyEdits(l16DtcEdits(seatIdx(), opts));
// a flight put at a slot: file, kind ('team' | 'donor'), first slot (0..15), mode ('l' leader only, 'a' all its aircraft), d = {cs, stn, n}. Returns '' or why not
export function l16Add(file, kind, start, mode, d) {
  const c = l16Can();
  if (!c.ok) return c.why;
  const cnt = mode === 'l' ? 1 : Math.min(4, d.n),
    why = placeCheck(kind, start, cnt);
  if (why) return why;
  if (d.cs === l16Own()) return 'This is your own flight.';
  setRecs(addRec(l16Recs(), { k: 'put', a: file, cs: d.cs, stn: d.stn, n: d.n, s: start, m: mode }));
  push();
  return '';
}
// what a change would do: {why, diff: [{slot, from, to}]}
export function l16Preview(file, kind, start, mode, d) {
  const cnt = mode === 'l' ? 1 : Math.min(4, d.n),
    why = placeCheck(kind, start, cnt) || (d.cs === l16Own() ? 'This is your own flight.' : '');
  if (why) return { why, diff: [] };
  const fl = l16Flights(),
    own = l16Own(),
    before = resolvePlan(file, fl, own, l16Recs()),
    after = resolvePlan(
      file,
      fl,
      own,
      addRec(l16Recs(), { k: 'put', a: file, cs: d.cs, stn: d.stn, n: d.n, s: start, m: mode })
    );
  return { why: '', diff: planDiff(before, after) };
}
// a flight out of a file (all its slots): in file A it is an "off" record over the plan of BMS, in file B the flight put there goes. Returns '' or why not
export function l16Remove(file, cs) {
  const c = l16Can();
  if (!c.ok) return c.why;
  if (cs === l16Own()) return 'This is your own flight.';
  setRecs(file === 'B' ? dropFlight(l16Recs(), file, cs) : addRec(l16Recs(), { k: 'off', a: file, cs }));
  push({ clearB: file === 'B' && !l16Recs().some(r => r.a === 'B') });
  return '';
}
// a typed STN taken back: the slot returns to the plan
export function l16Unpin(file, slot) {
  const c = l16Can();
  if (!c.ok) return c.why;
  setRecs(l16Recs().filter(r => !(r.a === file && r.k === 'pin' && r.s === slot)));
  push({ clearB: file === 'B' && !l16Recs().some(r => r.a === 'B') });
  return '';
}
// all the changes of a file taken back: file A is the plan of BMS again, file B is empty
export function l16Back(file) {
  const c = l16Can();
  if (!c.ok) return c.why;
  setRecs(dropFile(l16Recs(), file));
  push({ clearB: file === 'B' });
  return '';
}
// an STN typed on the Data Cartridge page stays in its slot (the plan goes on around it); typing what the plan has there anyway keeps nothing
export function l16Typed(sec, key) {
  if (sec !== 'LINK16' || ST.CURK == null) return;
  const sk = slotOfKey(key);
  if (!sk) return;
  const v = G('LINK16', key, ''),
    rest = l16Recs().filter(r => !(r.a === sk.file && r.k === 'pin' && r.s === sk.slot)),
    cell = resolvePlan(sk.file, l16Flights(), l16Own(), rest)[sk.slot];
  setRecs(normStn(v) === (cell ? cell.stn : L16_EMPTY) ? rest : addRec(rest, { k: 'pin', a: sk.file, s: sk.slot, v }));
  if (ST.dtcPage && ST.dtcPage.l16Draw) ST.dtcPage.l16Draw();
}

// ---- what the Data Cartridge page shows ----
export function l16Info() {
  const cs = l16Own(),
    can = l16Can(),
    fl = l16Flights(),
    recs = l16Recs();
  return {
    cs,
    can,
    own: fl.some(f => f.cs === cs),
    A: resolvePlan('A', fl, cs, recs),
    B: resolvePlan('B', fl, cs, recs),
    changedA: recs.some(r => r.a === 'A'),
    changedB: recs.some(r => r.a === 'B'),
    stnOf: normStn,
  };
}
