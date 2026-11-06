// @ts-check
// The Link 16 files of a DTC for one flight of a package (pure: no DTC, no card). A DTC has two files, A and B, each with the same lines: the callsign (two letters) and its number
// (the flight and the position of the aircraft), the flight lead flag and 16 slots of STNs: 4 "Flight", 4 "Team" and 8 "Donor". BMS fills them in the order of the package:
// the own flight from the first slot, then every other flight of the package from the first slot of the next block of 4 (two 2-ships are 1-2 and 5-6), then the donors (slots 9-16).
// The pilot can change the plan: a flight put in a place (leader only or all its aircraft), a flight taken out, an STN typed by hand. These "changes" are records that are applied
// over the automatic plan, and a flight is always taken out or put in whole: a flight touched by a change loses all its slots.
//
// Slots are numbered 0..15: 0-3 FLIGHT_1..4, 4-7 TEAM_1..4, 8-15 DONOR_1..8.
export const L16_SLOTS = 16;
export const L16_EMPTY = '00000';

/** @typedef {{cs: string, stn: string, n: number}} L16Flight a flight with an STN: callsign ("Cobra 3"), its STN (4 octal digits) and its number of aircraft */
/** @typedef {{cs: string, stn: string, label: string, src: 'auto'|'add'|'pin'}} L16Cell a filled slot: the callsign of its flight ('' for a typed STN), the 5 digit STN and where it comes from */
/** @typedef {{k: 'put', a: string, cs: string, stn: string, n: number, s: number, m: 'l'|'a'}|{k: 'off', a: string, cs: string}|{k: 'pin', a: string, s: number, v: string}} L16Rec a change of the pilot, in the order made */

/** @param {number} i @returns {string} */
export const slotName = i => (i < 4 ? 'Flight ' + (i + 1) : i < 8 ? 'Team ' + (i - 3) : 'Donor ' + (i - 7));
/** the key of a slot in the [LINK16] section @param {string} file 'A' or 'B' @param {number} i */
export const slotKey = (file, i) =>
  `FILE_${file}_${i < 4 ? 'FLIGHT_' + (i + 1) : i < 8 ? 'TEAM_' + (i - 3) : 'DONOR_' + (i - 7)}_STN`;
/** the slot of a key of the section, or null @param {string} key @returns {{file: string, slot: number}|null} */
export function slotOfKey(key) {
  const m = /^FILE_([AB])_(FLIGHT|TEAM|DONOR)_(\d)_STN$/.exec(key);
  if (!m) return null;
  const n = +m[3],
    base = m[2] === 'FLIGHT' ? 0 : m[2] === 'TEAM' ? 4 : 8,
    max = m[2] === 'DONOR' ? 8 : 4;
  return n >= 1 && n <= max ? { file: m[1], slot: base + n - 1 } : null;
}
/** the slots a flight put as "team" or "donor" may start at: [from, to) @param {'team'|'donor'} kind */
export const kindRange = kind => (kind === 'team' ? [4, 8] : [8, 16]);

/** the callsign without its number and the number: "Cobra 3" -> {name: 'Cobra', num: 3} @param {string} cs */
export function callsignParts(cs) {
  const t = String(cs == null ? '' : cs).trim(),
    m = /^(.*?)[\s-]*(\d+)$/.exec(t);
  return m ? { name: m[1].trim(), num: +m[2] } : { name: t, num: 0 };
}
/** the two letters of the Link 16 callsign: the first and the last letter of the callsign ("Cobra" CA, "Falcon" FN, "Jackal" JL). '' when there are not two letters @param {string} cs */
export function callsignAbbr(cs) {
  const L = callsignParts(cs)
    .name.replace(/[^A-Za-z]/g, '')
    .toUpperCase();
  return L.length >= 2 ? L[0] + L[L.length - 1] : '';
}
/** the number of the callsign for the aircraft `seat` (0..3): the flight digit and the position ("Cobra 3", seat 0 -> "31"). '' when the flight has no digit 1..9 @param {string} cs @param {number} seat */
export function callsignNumber(cs, seat) {
  const n = callsignParts(cs).num;
  return n >= 1 && n <= 9 && seat >= 0 && seat < 4 ? `${n}${seat + 1}` : '';
}

/** a STN as the file writes it (5 octal digits); anything else is kept as typed @param {string} v */
export function normStn(v) {
  const t = String(v == null ? '' : v).trim();
  if (t === '') return L16_EMPTY;
  return /^\d{1,5}$/.test(t) ? t.padStart(5, '0') : t;
}
/** a STN of a flight (4 digits) from a card value: the STN of the aircraft 1 is the STN and the digit 1 ("35141" -> "3514"). '' when it is not one @param {string} v */
export function flightStn(v) {
  const t = String(v == null ? '' : v).trim();
  return /^\d{4,5}$/.test(t) ? t.slice(0, -1).padStart(4, '0') : '';
}
const cellOf = (/** @type {L16Flight} */ f, /** @type {number} */ pos, /** @type {'auto'|'add'} */ src) => ({
  cs: f.cs,
  stn: f.stn + pos,
  label: `${f.cs}-${pos}`,
  src,
});
/** @returns {(L16Cell|null)[]} */
const empty = () => Array.from({ length: L16_SLOTS }, () => null);

/**
 * The plan BMS makes: the own flight from slot 1, every other flight of the package from the first slot of the next block of 4, in the order given (the order of the package on the
 * datacard). Flights with no STN are not in the list. More flights than blocks: the last ones do not fit.
 * @param {L16Flight[]} flights the flights of the package, own flight included @param {string} own the callsign of the own flight @returns {(L16Cell|null)[]}
 */
export function autoPlan(flights, own) {
  const me = flights.find(f => f.cs === own),
    order = (me ? [me] : []).concat(flights.filter(f => f !== me)),
    slots = empty();
  let blk = me ? 0 : 1;
  order.forEach(f => {
    if (blk * 4 >= L16_SLOTS) return;
    for (let p = 0; p < Math.min(4, Math.max(1, f.n)); p++) slots[blk * 4 + p] = cellOf(f, p + 1, 'auto');
    blk++;
  });
  return slots;
}

/** why a flight cannot be put at `start` with `count` aircraft as `kind`; '' when it can @param {'team'|'donor'} kind @param {number} start @param {number} count */
export function placeCheck(kind, start, count) {
  const [a, b] = kindRange(kind);
  if (!(start >= a && start < b)) return `Choose a slot from ${slotName(a)} to ${slotName(b - 1)}`;
  if (start + count > b) return `${count} aircraft do not fit from ${slotName(start)} (the last is ${slotName(b - 1)})`;
  return '';
}

/**
 * The plan for a file with the changes of the pilot applied in the order made. File A starts from the automatic plan; file B is empty (nothing is written there unless the pilot
 * puts something in).
 * @param {string} file 'A' or 'B' @param {L16Flight[]} flights @param {string} own @param {L16Rec[]} recs @returns {(L16Cell|null)[]}
 */
export function resolvePlan(file, flights, own, recs) {
  let slots = file === 'A' ? autoPlan(flights, own) : empty();
  (recs || [])
    .filter(r => r.a === file)
    .forEach(r => {
      if (r.k === 'pin') {
        if (r.s >= 0 && r.s < L16_SLOTS) slots[r.s] = { cs: '', stn: normStn(r.v), label: '', src: 'pin' };
      } else if (r.k === 'off') {
        if (r.cs !== own) slots = slots.map(c => (c && c.cs === r.cs ? null : c));
      } else if (r.k === 'put') {
        const cnt = r.m === 'l' ? 1 : Math.min(4, Math.max(1, r.n));
        if (r.cs === own || !(r.s >= 0 && r.s + cnt <= L16_SLOTS) || !/^\d{4}$/.test(r.stn)) return;
        const gone = new Set([r.cs]);
        for (let i = r.s; i < r.s + cnt; i++) if (slots[i] && slots[i].cs) gone.add(slots[i].cs);
        slots = slots.map(c => (c && gone.has(c.cs) ? null : c));
        for (let p = 0; p < cnt; p++) slots[r.s + p] = cellOf({ cs: r.cs, stn: r.stn, n: r.n }, p + 1, 'add');
      }
    });
  return slots;
}

/** the 16 values of the slots as the file writes them @param {(L16Cell|null)[]} slots */
export const slotValues = slots => slots.map(c => (c ? c.stn : L16_EMPTY));

/**
 * What changes between two plans: [{slot, from, to}] with the labels of the flights ('' = empty), for the preview of a change.
 * @param {(L16Cell|null)[]} before @param {(L16Cell|null)[]} after
 */
export function planDiff(before, after) {
  const out = [];
  for (let i = 0; i < L16_SLOTS; i++) {
    const a = before[i],
      b = after[i];
    if ((a ? a.stn : '') !== (b ? b.stn : ''))
      out.push({ slot: i, from: a ? a.label || a.stn : '', to: b ? b.label || b.stn : '' });
  }
  return out;
}

/**
 * The slots a flight can start at as `kind`, with what each holds now: the choices of the menu on the map. `ok`: the flight fits from there; `mine`: the slot is one of the flight itself.
 * @param {'team'|'donor'} kind @param {number} count aircraft to put @param {(L16Cell|null)[]} plan the plan now @param {string} cs the callsign of the flight to put
 * @returns {{slot: number, num: number, name: string, who: string, ok: boolean, mine: boolean}[]}
 */
export function startOptions(kind, count, plan, cs) {
  const [a, b] = kindRange(kind),
    out = [];
  for (let i = a; i < b; i++) {
    const c = plan[i];
    out.push({
      slot: i,
      num: i + 1,
      name: slotName(i),
      who: c ? c.label || c.stn : '',
      ok: i + count <= b,
      mine: !!(c && c.cs === cs),
    });
  }
  return out;
}
/**
 * The slot a flight is put at when the pilot does not choose: where it already is (when that is in the range and holds it), else the first run of free slots that holds it (its own slots
 * count as free), else the first free slot, else the first one of the kind (it replaces what is there).
 * @param {'team'|'donor'} kind @param {number} count @param {(L16Cell|null)[]} plan @param {string} cs
 */
export function defaultStart(kind, count, plan, cs) {
  const [a, b] = kindRange(kind),
    cur = plan.findIndex(c => !!c && c.cs === cs);
  if (cur >= a && cur + count <= b) return cur;
  const free = (/** @type {number} */ i) => !plan[i] || plan[i].cs === cs,
    o = startOptions(kind, count, plan, cs).filter(x => x.ok),
    run = o.find(x => {
      for (let i = x.slot; i < x.slot + count; i++) if (!free(i)) return false;
      return true;
    });
  return (run || o.find(x => free(x.slot)) || o[0] || { slot: a }).slot;
}
/** slot numbers (1..16) as a short text: [4, 5, 6, 9] -> "5-7, 10" (the numbers the pilot counts, from 1) @param {number[]} list the slots, from 0 */
export function rangeText(list) {
  const a = [...new Set(list)].sort((x, y) => x - y),
    out = [];
  for (let i = 0; i < a.length;) {
    let j = i;
    while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++;
    out.push(j > i ? `${a[i] + 1}-${a[j] + 1}` : String(a[i] + 1));
    i = j + 1;
  }
  return out.join(', ');
}
/**
 * What a change does, one line for each run of slots that go from one flight to another ("9-10: empty → Mako 5-1 … 5-2", "10-12: Jackal 1-2 … 1-4 → empty", "9: Jackal 1-1 → Zed 9-1").
 * @param {{slot: number, from: string, to: string}[]} diff from planDiff @returns {string[]}
 */
export function diffLines(diff) {
  const out = [],
    base = (/** @type {string} */ t) => (t.includes('-') ? t.slice(0, t.lastIndexOf('-')) : t), // "Cobra 3-2" -> "Cobra 3"
    tail = (/** @type {string} */ a, /** @type {string} */ z) =>
      z && base(z) === base(a) ? z.slice(z.lastIndexOf(' ') + 1) : z; // "Cobra 3-2 … 3-4"
  for (let i = 0; i < diff.length;) {
    let j = i;
    while (
      j + 1 < diff.length &&
      diff[j + 1].slot === diff[j].slot + 1 &&
      base(diff[j + 1].from) === base(diff[i].from) &&
      base(diff[j + 1].to) === base(diff[i].to)
    )
      j++;
    const side = (/** @type {string} */ x, /** @type {string} */ y) =>
      !x ? 'empty' : j > i ? `${x} … ${tail(x, y)}` : x;
    out.push(
      `${diff[i].slot + 1}${j > i ? '-' + (diff[j].slot + 1) : ''}: ${side(diff[i].from, diff[j].from)} → ${side(diff[i].to, diff[j].to)}`
    );
    i = j + 1;
  }
  return out;
}

/** the records after a change: the same flight in the same file is put once (its older record goes) @param {L16Rec[]} recs @param {L16Rec} r @returns {L16Rec[]} */
export function addRec(recs, r) {
  const keep = (recs || []).filter(q => {
    if (q.a !== r.a) return true;
    if (r.k === 'pin') return !(q.k === 'pin' && q.s === r.s);
    if (r.k === 'put' || r.k === 'off') return !((q.k === 'put' || q.k === 'off') && q.cs === r.cs);
    return true;
  });
  return keep.concat([r]);
}
/** the records without those of a flight (a flight put in or taken out) in a file @param {L16Rec[]} recs @param {string} file @param {string} cs */
export const dropFlight = (recs, file, cs) =>
  (recs || []).filter(q => !(q.a === file && (q.k === 'put' || q.k === 'off') && q.cs === cs));
/** the records without those of a file ("back to auto") @param {L16Rec[]} recs @param {string} file */
export const dropFile = (recs, file) => (recs || []).filter(q => q.a !== file);

/**
 * The lines of a Link 16 file that make the DTC the one of the aircraft `seat` and of the plan. Only the lines that change.
 * @param {(key: string) => string} get the value of a key of the [LINK16] section ('' when it is not there)
 * @param {string} file 'A' or 'B'
 * @param {{abbr?: string, number?: string, seat: number, slots?: (string[]|null), identity?: boolean}} o abbr: the two letters; number: the number of the callsign (flight digit + position);
 *   slots: the 16 values (null: the slots are not touched); identity: write the callsign, number and lead flag (false: leave them as they are)
 * @returns {{k: string, v: string}[]}
 */
export function l16Edits(get, file, o) {
  const out = [],
    K = k => `FILE_${file}_${k}`,
    put = (k, v) => {
      if (String(get(k)).trim() !== v) out.push({ k, v });
    };
  if (o.identity !== false) {
    if (o.abbr) put(K('CALLSIGN'), o.abbr);
    if (o.number) put(K('CALLSIGN_NUMBER'), o.number);
    put(K('FLIGHT_LEAD'), o.seat === 0 ? '1' : '0');
  }
  if (o.slots)
    o.slots.forEach((v, i) => {
      const k = slotKey(file, i),
        cur = String(get(k)).trim();
      if (normStn(cur) !== normStn(v)) out.push({ k, v: normStn(v) });
    });
  return out;
}
