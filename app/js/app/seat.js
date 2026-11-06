import { CAM } from '../core/cam-core.js';
import { RANK_AB } from '../core/squadron.js';
import { SEAT_PAD, seatBtn } from '../core/seatgeo.js';
import { ST } from './state.js';
import { $, appToast } from './base.js';
import { F, FD, dEl, pushOne, setField } from './datacard.js';
import { MFD, draw } from './cardview.js';
import { mdcAuto } from './mdcfill.js';
import { lines } from './dtcfile.js';
import { msLocked } from './ato.js';
import { apply, markMan } from './selection.js';
import { SX, SY, boxOf, cardOn } from './editor.js';
import { sqPage } from './pages.js';
import { myIdent, unsaved } from './mission.js';
import { seatDtcPush } from './seatdtc.js';
import { flightDtcPush } from './flightdtc.js';

/* The pilot seat. A card (and its DTC) is made for one pilot of the flight: the round buttons beside the pilots of the Flight section (and of the Pilots table of the MDC format)
   choose which one. The choice is global (it stays when another flight is chosen) and has these effects:
   - the laser code of the DTC is the CONF-LSR code of the seat (Datacard <-> DTC, group "lsr" of app/datacard.js) and the B. CODE cells show it;
   - once a seat is chosen (the default writes nothing) the IFF codes of the DTC (modes 2 and 3) and its Link 16 file A (flight lead, position in the callsign number) are the seat's too:
     groups "iff" and "l16", app/seatdtc.js;
   - the MDC format shows the IFF (M2, M3) and the Link 16 STN of the seat (core/mdcfill.js);
   - the name of the pilot who pressed the button (the Logbook name with his rank, "Maj. Chris"; the callsign when he has no name) is written in the Name cell of the seat (a manual change of the card, so a mission keeps it).
   n = 0..3 the seat, -1 no seat chosen (the card uses the values of the leader, as it did before); set = the pilot chose it (false: the default of whoever makes the card, the leader);
   ask = a mission of another pilot was opened and his name is not on it: the buttons call for a choice. Round buttons over the card are HTML, never drawn into the canvas, so the
   kneeboard and the exports stay clean. */
ST.SEAT = { n: 0, set: false, ask: false, note: '' };
export const SEAT_POS = ['1 Lead', '2 Wing', '3 Element', '4 Wing'];
const FREE = '(free seat)';
const str = x => String(x == null ? '' : x).trim();

// ---- who is the pilot of this computer, and who is on the card ----
export function seatMe() {
  let m = {},
    mine = null;
  try {
    m = (sqPage && sqPage.me && sqPage.me()) || {};
    const R = (sqPage && sqPage.rosterOf && sqPage.rosterOf()) || [];
    mine = R.find(r => r.uid && m.uid && r.uid === m.uid) || null;
  } catch (e) {
    /* no squadron yet */
  }
  const cs = str(m.callsign) || str(mine && mine.callsign),
    nm = str(m.name) || str(mine && mine.name),
    lb = str(mine && mine.label),
    ab = RANK_AB[m.st && m.st.rk] || '',
    own = str(m.name) ? (ab ? ab + ' ' : '') + str(m.name) : ''; // the name of the Logbook with the rank, as the roster lists it
  return {
    text: own || lb || cs, // what is written in the Name cell: the name with the rank, the callsign when the pilot has no name
    names: [...new Set([cs, nm, lb, own].filter(Boolean).map(x => x.toLowerCase()))],
  };
}
const isMe = t => {
  const v = str(t).toLowerCase();
  return !!v && seatMe().names.includes(v);
};
// a pilot of the squadron roster who is not me (a name that is not on the roster is one of the campaign's pilots, taken without asking)
function rosterPilot(t) {
  const v = str(t).toLowerCase();
  if (!v || v === '---' || v === FREE || isMe(v)) return false;
  try {
    return (sqPage.rosterOf() || []).some(r => [r.label, r.name, r.callsign].some(x => x && x.toLowerCase() === v));
  } catch (e) {
    return false;
  }
}

// ---- the seat ----
// the seat exists when the flight has that aircraft (the IDM cell of its row is filled)
export const seatExists = n => n >= 0 && n < 4 && !!F[`fl${n}_1`] && F[`fl${n}_1`] !== '---';
// the seat the values are taken from: the chosen one, the leader's when none is chosen
export const seatIdx = () => (ST.SEAT.n >= 0 && seatExists(ST.SEAT.n) ? ST.SEAT.n : 0);
export const seatAsk = () => !!ST.SEAT.ask && !!ST.MSFLOCK && ST.MSFLOCK.C === ST.C;
let QUIET = false; // a mission is being opened: the seat is worked out when it is in (seatResolve), not with every card built on the way
export const seatQuiet = on => {
  QUIET = !!on;
};

// the cells that follow the seat on their own (the pilot may type over them: the manual value stays)
const SEATK = ['m2', 'm3', 'dl0_fl', 'wp1_bc', 'wp2_bc'];
const put = (k, v) => {
  if (ST.MANK && ST.MANK.has(k)) return;
  F[k] = v;
  if (ST.AUTO) ST.AUTO[k] = v;
  const d = dEl(k);
  if (d && d.el && d.el.value !== v) d.el.value = v;
};
// B. CODE of the two weapon profiles: the laser code (CONF-LSR) of the seat. A reference on the card, not a DTC value: with several aircraft the DTC takes the TGP of its pilot only.
export function seatCodes() {
  const v = str(F[`fl${seatIdx()}_5`]);
  ['wp1_bc', 'wp2_bc'].forEach(k => put(k, v === '---' ? '' : v));
}
// the IFF codes and the Link 16 flags of the DTC for the seat: only once the pilot chose a seat (the default writes nothing), and only for the groups that follow the Datacard;
// only: {iff: true} = just that group (its switch was turned on). Giving the seat up writes the leader's, as the laser code does.
export function seatToDtc(only) {
  if (!ST.SEAT.set || !lines.length || !ST.DCS) return 0;
  const on = g => (!only || !!only[g]) && !!ST.DCS[g];
  return seatDtcPush(seatIdx(), { iff: on('iff'), l16: on('l16') });
}
// everything that follows from the seat, written again: IFF and Link 16 of the MDC, B. CODE, and the laser, IFF and Link 16 of the DTC (when "from Datacard" is on and push is not false)
export function seatRefresh(push = true) {
  mdcAuto();
  seatCodes();
  SEATK.forEach(k => {
    if (ST.AUTO && !(ST.MANK && ST.MANK.has(k))) ST.AUTO[k] = F[k] || '';
    const d = dEl(k);
    if (d && d.el && d.el.value !== (F[k] || '')) d.el.value = F[k] || '';
  });
  if (push && ST.DCS && ST.DCS.lsr && lines.length) pushOne(`fl${seatIdx()}_5`);
  if (push) seatToDtc();
}

// ---- the names ----
// the names the seat choice changed go back to what the campaign gave
function giveBack() {
  if (!ST.AUTO || !ST.MANK) return;
  for (let j = 0; j < 4; j++) {
    const k = `fl${j}_0`,
      v = str(F[k]);
    if (ST.MANK.has(k) && (v === FREE || isMe(v))) {
      ST.MANK.delete(k);
      F[k] = ST.AUTO[k] || '';
      const d = dEl(k);
      if (d && d.el) d.el.value = F[k];
    }
  }
}
// a pilot is on one seat only: where the campaign had put him, the seat is free
function freeOthers(i) {
  for (let j = 0; j < 4; j++) if (j !== i && isMe(F[`fl${j}_0`])) setField(`fl${j}_0`, FREE);
}

// ---- the status line under the card ----
export function seatInfo() {
  const el = $('seatinfo');
  if (!el) return;
  const S = ST.SEAT;
  let t = '',
    cls = '';
  if (!ST.C || !ST.CL || !ST.CL.length || !F.cs) t = '';
  else if (S.note) {
    t = S.note;
    cls = 'note';
  } else if (seatAsk()) {
    t =
      'Choose your seat: press the round button of your pilot in the Flight section. Until then the DTC and the MDC use the leader’s values.';
    cls = 'ask';
  } else if (S.n < 0)
    t =
      'No seat chosen: the DTC and the MDC use the leader’s values. Press a round button to take a seat with your name.';
  else {
    const i = seatIdx(),
      nm = str(F[`fl${i}_0`]);
    const who = `Seat ${SEAT_POS[i]}${S.set ? '' : ' (default)'}${nm && nm !== '---' ? ' · ' + nm : ''}`;
    t = S.set
      ? `${who}: the DTC (laser code ${str(F[`fl${i}_5`]) || '—'}, IFF modes 2 and 3, Link 16 flight lead and number) and the MDC format are made for this seat.`
      : `${who}: the DTC (laser code ${str(F[`fl${i}_5`]) || '—'}) and the MDC format are the leader’s. Press a round button to take a seat: the DTC takes its IFF and Link 16 too.`;
  }
  el.textContent = t;
  el.className = 'seatinfo' + (cls ? ' ' + cls : '') + (t ? ' on' : '');
}

// ---- choosing a seat ----
let BUSY = false;
function after() {
  seatRefresh();
  markMan();
  draw();
  seatInfo();
}
// the round button of seat i: take the seat (the name goes to its Name cell, a confirmation first when another pilot of the roster is there); pressed again: the seat is given up
export async function pickSeat(i) {
  const S = ST.SEAT;
  if (BUSY || !seatExists(i)) return;
  BUSY = true;
  try {
    S.note = '';
    if (S.n === i && S.set) {
      giveBack();
      S.n = -1;
      S.ask = false;
      return after();
    }
    const me = seatMe(),
      cur = str(F[`fl${i}_0`]);
    if (me.text) {
      if (
        rosterPilot(cur) &&
        !(await confirm(
          cur + ' is a pilot of your squadron roster. Put your name (' + me.text + ') in this seat instead?'
        ))
      )
        return;
    } else
      appToast(
        'Your name and callsign are not set (Squadron page, Me): the seat is chosen, but its name is not changed.'
      );
    giveBack();
    if (me.text && !isMe(F[`fl${i}_0`])) setField(`fl${i}_0`, me.text);
    freeOthers(i);
    S.n = i;
    S.set = true;
    S.ask = false;
    after();
  } finally {
    BUSY = false;
  }
}

// ---- a card was built (apply): the seat stays, the card of the new flight is checked ----
// before the card is filled from the DTC: a seat the flight does not have is given up (the card is neutral)
export function seatCheck() {
  const S = ST.SEAT;
  if (QUIET || S.n < 0 || seatExists(S.n)) return;
  const n = [0, 1, 2, 3].filter(seatExists).length;
  S.note = `${F.cs || 'This flight'} has only ${n} aircraft: the seat ${SEAT_POS[S.n]} does not exist, so the card is neutral (the leader’s values). Press a round button to take a seat.`;
  S.n = -1;
  S.ask = false;
  appToast(S.note);
}
// after the manual changes of the flight are back: B. CODE, and the name of the pilot on the seat he chose
export function seatEnter() {
  const S = ST.SEAT;
  if (!QUIET && S.note && S.n >= 0) S.note = '';
  seatCodes();
  if (!QUIET && S.set) seatToDtc(); // the DTC of the flight just opened follows the seat the pilot chose
  if (!QUIET) flightDtcPush(); // and the channels of Link 16 and the radio presets of the flight
  if (!QUIET && S.n >= 0 && S.set) seatStamp().catch(() => {});
  seatInfo();
}
async function seatStamp() {
  const S = ST.SEAT,
    i = S.n,
    k = `fl${i}_0`,
    key = ST.CURK,
    me = seatMe(),
    cur = str(F[k]);
  if (!me.text || !ST.MANK || ST.MANK.has(k) || isMe(cur)) return; // nothing to do: the name is there, or typed by hand
  const stay = () => ST.CURK === key && S.n === i;
  if (rosterPilot(cur)) {
    const ok = await confirm(
      cur +
        ' is a pilot of your squadron roster. Put your name (' +
        me.text +
        ') in the seat ' +
        SEAT_POS[i] +
        ' of ' +
        (F.cs || 'this flight') +
        '?\n\nCancel = no seat chosen in this flight.'
    );
    if (!stay()) return;
    if (!ok) {
      S.n = -1;
      after();
      return;
    }
  }
  setField(k, me.text);
  freeOthers(i);
  after();
}

// ---- a mission was opened (msfLoad): the seat of whoever made it comes back; for a mission of another pilot it is worked out from the names on the card ----
export function seatSave() {
  return { n: ST.SEAT.n, set: !!ST.SEAT.set, uid: myIdent().uid || '' };
}
// push: the DTC block of the mission was applied to this DTC, so its laser code is made the one of the seat (a mission of this pilot keeps the DTC it was saved with)
export function seatResolve(d, mine, push) {
  const S = ST.SEAT,
    sv = d && d.seat,
    uid = myIdent().uid;
  S.note = '';
  QUIET = false;
  if (sv && sv.uid && sv.uid === uid && Number.isInteger(sv.n) && sv.n >= -1 && sv.n < 4) {
    S.n = sv.n;
    S.set = !!sv.set;
    S.ask = false;
  } else if (mine && !sv) {
    S.n = 0;
    S.set = false;
    S.ask = false;
  } else {
    const j = [0, 1, 2, 3].find(q => seatExists(q) && isMe(F[`fl${q}_0`]));
    S.n = j === undefined ? -1 : j;
    S.set = j !== undefined;
    S.ask = j === undefined;
  }
  if (S.n >= 0 && !seatExists(S.n)) S.n = -1;
  seatRefresh(!!push);
  markMan();
  draw();
  seatInfo();
}

// ---- the other flights of the package ----
// the flight of a package row: its index in the list of the flights with a card, and why it cannot be chosen
function flightOf(e) {
  const k = ST.CL.findIndex(x => x.f.id.n == e.id.n && x.f.id.c == e.id.c);
  if (k < 0) return { k, why: 'This flight has no datacard (a helicopter flight, or fewer than two steerpoints).' };
  if (msLocked(e))
    return { k, why: 'This mission was made for another flight: load a campaign to use the other flights.' };
  return { k, why: '' };
}
// the round button of a flight of the package: its datacard replaces this one (the seat stays); changes of this card that no mission holds are asked about first
export async function goFlight(k) {
  if (BUSY || k < 0 || k === (+$('fsel').value || 0)) return;
  BUSY = true;
  try {
    const x = ST.CL[k];
    if (
      unsaved() &&
      !(await confirm(
        'Go to ' +
          (x ? x.label.split(' · ')[0] : 'this flight') +
          '?\n\nThe card of ' +
          (F.cs || 'this flight') +
          ' has changes that are not saved in a mission. They stay in the program while it is open, but only a saved mission keeps them.'
      ))
    )
      return;
    $('fsel').value = k;
    apply(k);
  } finally {
    BUSY = false;
  }
}

// ---- the round buttons over the card ----
const BT = new Map(); // kept between the redraws, so a change of state is animated by the CSS transition
const px = (b, k) => ({ x: b.x * SX * k, y: b.y * SY * k, w: b.w * SX * k, h: b.h * SY * k });
// the box (in screen pixels, inside the canvas) of a row of the format on the screen, from its first cell to its last, and its first cell
function rowRect(k1, k2, kk, x0) {
  const L = ST.MDCON ? MFD : FD,
    a = L.find(d => d.k === k1),
    z = L.find(d => d.k === k2);
  if (!a || !z) return null;
  const A = px(boxOf(a), kk),
    Z = px(boxOf(z), kk),
    l = x0 != null ? x0 * SX * kk : Math.min(A.x, Z.x);
  return {
    x: l,
    y: Math.min(A.y, Z.y),
    w: Math.max(A.x + A.w, Z.x + Z.w) - l,
    h: Math.max(A.y + A.h, Z.y + Z.h) - Math.min(A.y, Z.y),
    first: A,
  };
}
function node(id, tag, cls) {
  let el = BT.get(id);
  if (!el) {
    el = document.createElement(tag);
    el.className = cls;
    el.dataset.seat = id;
    $('seatov').append(el);
    BT.set(id, el);
  }
  return el;
}
export function seatDraw() {
  const ov = $('seatov'),
    c = $('cv');
  if (!ov || !c) return;
  const want = new Set();
  if (c.offsetWidth && cardOn() && ST.C && ST.CL && ST.CL.length && F.cs) {
    const kk = c.getBoundingClientRect().width / 2048,
      S = ST.SEAT,
      ask = seatAsk(),
      md = !!ST.MDCON,
      one = (id, rr, o) => {
        // the row (lit when it is the one chosen) and its round button (at the left end of the first cell: the text of the cell starts after it, see core/seatgeo.js)
        const row = node(id + 'r', 'i', 'seatrow'),
          b = node(id, 'button', 'seatb'),
          sz = Math.max(10, seatBtn(rr.first.h / kk) * kk),
          set = (el, l, t, w, h) => {
            el.style.left = l + 'px';
            el.style.top = t + 'px';
            el.style.width = w + 'px';
            el.style.height = h + 'px';
          };
        want.add(id + 'r');
        want.add(id);
        set(row, rr.x, rr.y, rr.w, rr.h);
        row.classList.toggle('on', o.on);
        set(b, rr.first.x + SEAT_PAD * kk, rr.first.y + (rr.first.h - sz) / 2, sz, sz);
        b.type = 'button';
        b.disabled = !!o.why;
        b.classList.toggle('on', o.on);
        b.classList.toggle('ask', !!o.ask);
        b.setAttribute('aria-pressed', o.on ? 'true' : 'false');
        b.setAttribute('aria-label', o.label);
        b.title = o.why || o.label;
        b.onclick = o.go;
      };
    for (let i = 0; i < 4; i++) {
      const rr = rowRect(`fl${i}_0`, md ? `fl${i}_5` : `fl${i}_6`, kk, md ? null : 29);
      if (!rr) continue;
      const ex = seatExists(i),
        on = ex && S.n === i;
      one('s' + i, rr, {
        on,
        ask: ask && ex,
        why: ex ? '' : 'No aircraft in this seat.',
        label:
          on && S.set
            ? `Give up the seat ${SEAT_POS[i]}`
            : `Take the seat ${SEAT_POS[i]} (your name goes in its Name cell)`,
        go: () => pickSeat(i),
      });
    }
    const x = ST.CL[+$('fsel').value || 0],
      f = x && x.f;
    let els = [];
    try {
      els = f ? CAM.els0(ST.C, f) : [];
    } catch (e) {
      els = [];
    }
    const cur = f ? els.findIndex(e => e.id.n == f.id.n && e.id.c == f.id.c) : -1;
    for (let r = 0; r < (md ? 8 : 5); r++) {
      const e = els[r],
        k0 = md ? `rc${r}_0` : `pk${r}_0`;
      if (!e || !str(F[k0]) || F[k0] === '---') continue;
      const rr = rowRect(k0, md ? `rc${r}_7` : `pk${r}_6`, kk);
      if (!rr) continue;
      const q = flightOf(e),
        on = r === cur,
        nm = str(F[k0]);
      one('p' + r, rr, {
        on,
        why: on ? '' : q.why,
        label: on ? `${nm}: the card is for this flight` : `Fill the datacard for ${nm}`,
        go: () => (on ? 0 : goFlight(q.k)),
      });
    }
  }
  for (const [id, el] of BT)
    if (!want.has(id)) {
      el.remove();
      BT.delete(id);
    }
}
