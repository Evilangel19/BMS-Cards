// Squadron > ROE / SOP: the page of the rules of engagement and of the SOP. The section Presets: two buttons, Flight (my presets) and Squadron (the
// presets of the squadron, the commander changes them); the first of each list is the Standard (the squadron's, or mine without a squadron). A click on a
// preset puts it on the datacard of the flight; what is changed by hand goes on the datacard at once and can be kept as a preset (a name, the kinds of
// mission it is the default of). A flight just chosen gets its default by itself (the list of the button chosen wins). The datacard gets the short form:
// what fits in a box (ROE one rule a line, SOP one line a phase). The custom sections (mine on this PC, the squadron's by the commander) join the SOP.
// "Add card" puts the whole text on Kneeboard cards. A click on the ROE or SOP box of the datacard opens this page.
import { otherLook, cardDark } from '../core/cardink.js';
import {
  ROE,
  ROE_CATS,
  emptySel,
  cleanSel,
  roeText,
  sopText,
  cleanPresets,
  sopShort,
  pickDefault,
  capSel,
  setBoxFit,
  boxFits,
  sopAll,
  topicsAll,
  setCustom,
  cleanCustom,
  optsFromText,
  optsToText,
} from '../core/roesop.js';
import { categoryOf } from '../core/ato.js';
import { ST } from './state.js';
import { F, dEl, setField } from './datacard.js';
import { esc, appToast, animOn, expand, collapse } from './base.js';
import { draw, freeLayout, freeDraw } from './cardview.js';
import { markMan } from './selection.js';
import { sqPage } from './pages.js';
import { kbAddPic } from './kneeboard.js';
import { roeCardPlan, roeCardDraw, CARD_W, CARD_H } from './roecard.js';
import { drawSmartText, SC_W, SC_H, wrap, keyFit } from '../core/smartcard.js';
import {
  fullText,
  smartSop,
  smartSopLines,
  roeKey,
  smartLink,
  msnOn,
  faorOwn,
  agCovers,
  cleanRules,
  ruleRow,
  ruleSame,
  rulesSet,
} from '../core/roesop.js';
import { APP_VERSION } from '../core/version.js';
import { seatIdx } from './seat.js';
import { flightTag } from './ato.js';
import { chooseCards } from '../core/tgdlg.js';
import { agLines } from '../core/agrules.js';

// ---- what stays on this PC: my presets (bmsroepre), my Standard (bmsroestd), my custom sections (bmsroesec), the list shown (bmsroesrc), the sections
// folded (bmsroeclosed2), Chosen only (bmsroeonly)
const LS = {
  get(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v == null ? d : JSON.parse(v);
    } catch (e) {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {}
  },
};
// the keys of the pages before 1.2.0-beta.26 that nothing reads any more (the last choices, the first-Apply question, the sections folded before
// beta.24): taken away once, so they do not stay in the browser storage
try {
  ['bmsroelast', 'bmsroeasked', 'bmsroeclosed'].forEach(k => localStorage.removeItem(k));
} catch (e) {}
export const presetsLoad = () => cleanPresets(LS.get('bmsroepre', []));
const presetsSave = P => LS.set('bmsroepre', cleanPresets(P));
// my Standard (Flight): {name, sel}; saved before as the choices alone; the first time, my first preset
const myStdRec = () => {
  const v = LS.get('bmsroestd', null);
  if (v && v.sel) return { name: String(v.name || 'Standard').slice(0, 40), sel: cleanSel(v.sel) };
  if (v) return { name: 'Standard', sel: cleanSel(v) };
  const P = presetsLoad();
  return { name: 'Standard', sel: P.length ? P[0].sel : emptySel() };
};
const myStd = () => myStdRec().sel;
const mySecs = () => cleanCustom(LS.get('bmsroesec', []));
const mySecsSave = L => LS.set('bmsroesec', cleanCustom(L));
const sqGet = (f, d) => {
  try {
    return (sqPage && sqPage[f] && sqPage[f]()) || d;
  } catch (e) {
    return d;
  }
};
// the custom sections known to the choices: mine, then the squadron's
function syncCustom() {
  setCustom([...mySecs(), ...((R && R.ctx.sections) || sqGet('roeSections', []))]);
  rulesSet(rulesUsed()); // and the rules of the Smart card in use
}
// lines typed by hand in a box that the choices did not write: they come back as its other lines
const handLines = (typed, made) => {
  const M = made ? made.split('\n') : [];
  return String(typed || '')
    .split('\n')
    .filter(l => l.trim() && !M.includes(l))
    .join('\n');
};
// the choices of the flight on the datacard: F.roesel, with the lines typed by hand on the datacard (a flight just chosen got its default: roeAuto)
function flightSel() {
  let s;
  try {
    s = cleanSel(JSON.parse(F.roesel || 'null'));
  } catch (e) {
    s = emptySel();
  }
  if (!F.roesel && !F.roe && !F.sop) return emptySel();
  if (F.roe && F.roe !== roeText(s)) s.free = handLines(F.roe, roeText({ ...s, free: '' }));
  if (F.sop && F.sop !== sopText(s)) s.sfree = handLines(F.sop, sopText({ ...s, sfree: '' }));
  return s;
}
const flightOn = () => !!(ST.AUTO && ST.CL && ST.CL.length);

// the state of the page (kept while the program runs)
const R = {
  box: null,
  ctx: { squad: '', own: false, presets: [], sections: [], save: () => {}, saveSec: () => {} },
  sig: '',
  sel: emptySel(),
  pick: null, // the preset chosen: 'std', 'q<i>' (squadron list), 'm<i>' (mine)
  base: '', // its choices: different = changed by hand
  name: '',
  cats: [],
  open: false, // the part to save it shown (a click on the preset chosen)
  wrote: '', // the choices last written on the datacard
  cust: new Set(), // the SOP topics written with an own text
  flightKey: null,
  stale: false, // a block of a page came while this page was hidden: drawn when it is shown
};
// the FAOR block (written by the FAOR page) is not a choice of this page: a preset with the same choices is still that preset
const key = s => JSON.stringify({ ...cleanSel(s), faor: null, ag: null });
// a choice put in keeps the FAOR block of the flight (a preset, Clear, Discard do not touch it): only the FAOR page changes it
const setSel = (s, kept = true) => {
  const fa = R.sel && R.sel.faor,
    ag = R.sel && R.sel.ag;
  R.sel = cleanSel(s);
  R.sel.faor = fa || null;
  R.sel.ag = ag || null;
  R.cust = new Set(Object.keys(R.sel.sop).filter(k => R.sel.sop[k].t));
  if (kept) R.base = key(R.sel);
};
const dirty = () => key(R.sel) != R.base;
// the list shown: Flight (mine) or Squadron (the squadron's); without a squadron, mine only
const inSq = () => !!R.ctx.squad;
const SRC = () => (inSq() && LS.get('bmsroesrc', 'sq') == 'sq' ? 'sq' : 'me');
const sqStdI = () => R.ctx.presets.findIndex(p => p.std);
// the presets of a list: [{k, name, sel, cats, ed (can be changed here), std}]. The first is the Standard of the list: Squadron = the squadron's (the
// commander changes it), Flight = mine (always mine, also in a squadron: Flight means my rules)
function chips(src) {
  const sq = sqStdI() >= 0 ? R.ctx.presets[sqStdI()] : null,
    st = src == 'sq' ? { name: sq ? sq.name : 'Standard', sel: sq ? sq.sel : emptySel() } : myStdRec(),
    L = [{ k: 'std', name: st.name, sel: st.sel, cats: [], std: 1, ed: src == 'sq' ? R.ctx.own : true }];
  if (src == 'sq') R.ctx.presets.forEach((p, i) => !p.std && L.push({ k: 'q' + i, ...p, ed: R.ctx.own }));
  else presetsLoad().forEach((p, i) => L.push({ k: 'm' + i, ...p, ed: true }));
  return L;
}
const chipOf = k => chips(SRC()).find(c => c.k == k);
const canNew = () => SRC() == 'me' || R.ctx.own;
// the preset the choices of now are: the one with the same choices (else none: changed by hand)
function setPick(c) {
  R.pick = c ? c.k : null;
  R.base = c ? key(c.sel) : key(emptySel());
  R.baseSel = c ? c.sel : emptySel(); // what Discard goes back to (kept when the other list is shown)
  R.name = c && !c.std ? c.name : ''; // the Standard: its name only when it is opened (double-click); changed by hand, the name of a new preset
  R.cats = c ? [...(c.cats || [])] : [];
  R.open = false;
}
function matchPick() {
  const k = key(R.sel),
    same = c => key(c.sel) == k;
  setPick(chips(SRC()).find(same) || null);
  // a preset of the other list (Flight / Squadron) is not "changed by hand" either: nothing to keep
  if (!R.pick && inSq() && chips(SRC() == 'sq' ? 'me' : 'sq').some(same)) {
    R.base = k;
    R.baseSel = R.sel;
  }
}
function loadFlight() {
  R.flightKey = ST.CURK;
  R.sel = emptySel();
  setSel(flightSel(), false);
  R.sel.faor = cleanSel(flightSel()).faor;
  R.sel.ag = cleanSel(flightSel()).ag;
  R.wrote = key(R.sel);
  matchPick();
}
// the squadron calls this when the page is drawn: the page is drawn again only when something it shows changed
export function roeDraw(box, ctx) {
  const sig = JSON.stringify([ctx.squad, ctx.own, ctx.presets, ctx.sections, ctx.rules]);
  R.ctx = ctx;
  syncCustom();
  let fresh = R.stale; // a block written while the page was hidden (blockSet): the page shows it now
  if (ST.CURK !== R.flightKey || !R.box) {
    loadFlight();
    fresh = true;
    // the conditions of the mission (weather, night…): the rows that the day changes on the Smart card show it
    roeCtxLoad().then(() => R.box && render());
  }
  // the values of the key box of the Smart card (JOKER, BINGO, LASER, M4: from the datacard) changed while the page was hidden
  const D = R.box ? smartData() : null,
    ks = D ? JSON.stringify(D.key) : '';
  if (ks != R.ks) fresh = true;
  R.ks = ks;
  if (box !== R.box || sig !== R.sig || !box.firstChild || fresh) {
    R.stale = false;
    if (sig !== R.sig && R.box && !dirty()) matchPick(); // the lists changed (saved here, or by the commander): the preset of now again
    R.box = box;
    R.sig = sig;
    render();
  }
  leaveGuard();
}
// the ROE or SOP box of the datacard was clicked: this page, on the flight
export function roeGo() {
  syncCustom();
  loadFlight();
  const t = document.querySelector('[data-t=sq]');
  if (t) t.click();
  if (sqPage && sqPage.tab) sqPage.tab('roe');
  render();
}

// ---- a small window over the page (the first Apply, leaving with unsaved choices, a custom section)
function modal(title, html, buttons, onAct) {
  const bk = document.createElement('div'),
    p = document.createElement('div');
  bk.className = 'rsbk';
  p.className = 'rsmodal';
  p.setAttribute('role', 'dialog');
  p.innerHTML = `<div class="wh"><h3>${esc(title)}</h3></div><div class="rsmb">${html}</div><div class="rsbar">${buttons
    .map(
      b =>
        `<button type="button" class="btn${b.g ? ' g' : ''}${b.rd ? ' rd' : ''}" data-m="${b.a}">${esc(b.label)}</button>`
    )
    .join('')}</div>`;
  document.body.append(bk, p);
  if (animOn())
    p.animate(
      [
        { opacity: 0, transform: 'translate(-50%, 8px)' },
        { opacity: 1, transform: 'translate(-50%, 0)' },
      ],
      { duration: 150, easing: 'ease-out' }
    );
  const close = () => {
    bk.remove();
    p.remove();
    document.removeEventListener('keydown', esc1, true);
  };
  const esc1 = e => {
    if (e.key == 'Escape' && !document.querySelector('.ddp')) {
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener('keydown', esc1, true);
  bk.onclick = close;
  p.onclick = e => {
    const b = e.target.closest('[data-m]');
    if (b && onAct(b.dataset.m, p) !== false) close();
  };
  const f = p.querySelector('input,textarea');
  if (f) f.focus();
  return p;
}
// keep the choices of now: in the preset chosen (c), or as a new preset of the list shown (c null: the name and the kinds of mission of the page)
function savePick(c, name, cats) {
  const sel = cleanSel(R.sel);
  if (c && c.std) {
    const nm = (name || c.name || 'Standard').slice(0, 40);
    if (SRC() == 'sq') {
      if (!R.ctx.own) return false;
      const L = R.ctx.presets.slice(),
        i = sqStdI();
      if (i >= 0) L[i] = { ...L[i], name: nm, sel };
      else L.unshift({ name: nm, sel, cats: [], std: true });
      R.ctx.save(L);
      appToast('Standard of the squadron "' + nm + '" saved and sent.');
    } else {
      LS.set('bmsroestd', { name: nm, sel });
      appToast('Your Standard "' + nm + '" saved: your flights start from it.');
    }
    R.base = key(sel);
    R.name = '';
    R.open = false;
    return true;
  }
  const sq = SRC() == 'sq';
  if (sq && !R.ctx.own) return false;
  const L = sq ? R.ctx.presets.slice() : presetsLoad(),
    p = { name, sel, cats, ...(sq ? { std: false } : {}) };
  let i = c ? +c.k.slice(1) : L.findIndex(x => !x.std && x.name.toLowerCase() == name.toLowerCase());
  if (i >= 0) L[i] = p;
  else {
    L.push(p);
    i = L.length - 1;
  }
  R.pick = (sq ? 'q' : 'm') + i;
  R.base = key(sel);
  R.name = name;
  R.cats = cats;
  R.open = false;
  if (sq) R.ctx.save(L);
  else presetsSave(L);
  appToast('Preset "' + name + '" saved' + (sq ? ' and sent to the squadron.' : ' on this PC.'));
  return true;
}
// a new preset: its name must not be taken in the list, or the pilot says to replace it
function saveNew(name, cats, done) {
  const sq = SRC() == 'sq',
    L = sq ? R.ctx.presets : presetsLoad(),
    j = L.findIndex(x => !x.std && x.name.toLowerCase() == name.toLowerCase());
  if (j < 0) return savePick(null, name, cats) && done && done();
  modal(
    '"' + name + '" is already there',
    '<p>Replace it with the choices of now?</p>',
    [
      { a: 'rep', label: 'Replace it' },
      { a: 'no', label: 'Cancel', g: 1 },
    ],
    a => {
      if (a == 'rep' && savePick({ k: (sq ? 'q' : 'm') + j }, name, cats) && done) done();
    }
  );
}
// leaving the page (another tab, Back to the datacard) with changes kept in no preset: keep them first?
let GUARD = false;
function leaveGuard() {
  if (GUARD) return;
  GUARD = true;
  // Add card at the right of the tabs of the Squadron page (shown on the ROE / SOP tab)
  document.addEventListener('click', e => {
    if (e.target.closest && e.target.closest('#sqroekb')) addCards();
  });
  document.addEventListener(
    'click',
    e => {
      const t = e.target.closest && e.target.closest('.tab[data-t], #sqtabs button[data-tab], #sqroe [data-a=back]');
      if (!t || !R.box || !R.box.offsetParent || !dirty() || R.leaving) return;
      if (t.matches('[data-t=sq]') || t.dataset.tab == 'roe') return;
      e.preventDefault();
      e.stopPropagation();
      const c = R.pick && chipOf(R.pick),
        upd = c && c.ed;
      modal(
        'Changes not in a preset',
        `<p>The changes are on the datacard${F.cs ? ' of ' + esc(F.cs) : ''}, but in no preset.</p>${!upd && canNew() ? '<input type="text" class="rpnm rslv" maxlength="40" placeholder="Name of the new preset">' : ''}`,
        [
          ...(upd ? [{ a: 'upd', label: 'Save "' + (c.std ? 'Standard' : c.name) + '" and go' }] : []),
          ...(!upd && canNew() ? [{ a: 'new', label: 'Save as preset and go' }] : []),
          { a: 'go', label: 'Leave anyway', g: 1, rd: 1 },
          { a: 'stay', label: 'Stay', g: 1 },
        ],
        (a, p) => {
          if (a == 'stay') return;
          if (a == 'upd') savePick(c, R.name || c.name, R.cats);
          if (a == 'new') {
            const n = p.querySelector('.rslv').value.trim();
            if (!n) return false;
            savePick(null, n, []);
          }
          if (a == 'go') {
            R.pick = null;
            R.base = key(R.sel);
          }
          R.leaving = true;
          setTimeout(() => {
            t.click();
            R.leaving = false;
          }, 0);
        }
      );
    },
    true
  );
}

// ---- the page
let BUSY = false;
function render() {
  const box = R.box;
  if (!box || BUSY) return; // a field that loses the focus while the page is drawn again sends its change: it must not draw again inside
  BUSY = true;
  // what was already shown does not fade in again when the page is drawn again (a choice draws the page again: it flickered); an element
  // with data-seen is known by it (the options of a topic stay the same panel while a choice changes them)
  const ANIM = '.rswarn,.rsdirty,.rsedit,.rpdot,.rplk,.rpmsn,.rpfa',
    seenKey = e => e.dataset.seen || e.className + '|' + e.textContent,
    seen = new Set([...box.querySelectorAll(ANIM)].map(seenKey));
  try {
    render0(box);
    const kb = /** @type {HTMLButtonElement|null} */ (document.getElementById('sqroekb')),
      n = counts();
    if (kb) kb.disabled = !(n.r || n.s); // Add card: dimmed while nothing is chosen
    box.querySelectorAll(ANIM).forEach(e => {
      if (seen.has(seenKey(e))) e.style.animation = 'none';
    });
  } finally {
    BUSY = false;
  }
}
// the folded cards; the first time every SOP section starts folded (a new key: the old one, bmsroeclosed, had them open)
const CKEY = 'bmsroeclosed2';
const CLOSED = () => {
  const v = LS.get(CKEY, null);
  return new Set(Array.isArray(v) ? v : sopAll().map(([ph, , , cid]) => (cid ? 'c:' + cid : 'p:' + ph)));
};
// a card of the page that folds: a click on its title
const card = (k, title, hint, body, extra = '', hc = '') => {
  const shut = CLOSED().has(k);
  return `<div class="wcard rsk${shut ? ' shut' : ''}${hc ? ' php' : ''}" data-k="${esc(k)}"${hc ? ` style="--hc:${hc}"` : ''}><div class="wh rsh" title="Click to fold or unfold"><i class="rsar">${shut ? '▸' : '▾'}</i><h3>${title}</h3><span class="hint">${hint}</span>${extra}</div><div class="rsbd">${body}</div></div>`;
};
// the colour of a SOP phase (its top border, its title, the strips of its topics): blue the ground and the field, orange the mission, purple the
// conditions, red the emergencies, teal the own sections
const PH_COL = {
  Mission: '#f0b040',
  'En route': '#f0b040',
  'FENCE, comms and fuel': '#f0b040',
  Tanker: '#b07cff',
  Weather: '#b07cff',
  Night: '#b07cff',
  Training: '#b07cff',
  Emergencies: '#ff5d5d',
};
const phCol = (ph, cid) => (cid ? '#2ec4b6' : PH_COL[ph] || '#4aa3ff');
// what a box of the datacard holds: the text measured as the card draws it (cardview.js freeLayout: 154 wide, 97 high, 12 at the smallest)
let MXC = null;
const boxUse = t => freeLayout(MXC || (MXC = document.createElement('canvas').getContext('2d')), t, 154, 97);
setBoxFit(t => boxUse(t).fit);
function counts() {
  const a = boxUse(roeText(R.sel)),
    b = boxUse(sopText(R.sel));
  return { r: a.used, s: b.used, cap: a.cap };
}
// an option of a SOP topic clicked: '' takes the topic away, '*' gives an own text (the short form of the option chosen as a start)
function sopPick(id, x) {
  const t = topicsAll().find(y => y[0] == id),
    v = R.sel.sop[id] || { o: null, t: '', c: false };
  R.cust.delete(id);
  if (!x) delete R.sel.sop[id];
  else if (x == '*') {
    R.cust.add(id);
    R.sel.sop[id] = { o: null, t: v.t || sopShort(t, v) || '', c: v.c, s: v.s };
  } else R.sel.sop[id] = { o: x, t: '', c: v.c, s: v.s }; // CARD is the pilot's choice: off for a topic just chosen
  render();
  if (x == '*') {
    const i = R.box.querySelector(`.rpr[data-t="${id}"] .rpi`);
    if (i) i.focus();
  }
}
// the preview of a box: drawn as the datacard draws it (twice the size, for a sharp picture); its text for the screen readers and the tests
function pvPaint(el, t) {
  const cv = el.querySelector('canvas'),
    x = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
  el.dataset.t = t;
  el.setAttribute('aria-label', t);
  x.setTransform(2, 0, 0, 2, 0, 0);
  x.clearRect(0, 0, 158, 101);
  x.fillStyle = '#111';
  x.textAlign = 'left';
  x.textBaseline = 'middle';
  if (t) freeDraw(x, t, { x: 0, y: 2, w: 158 }, 2, 97, 2);
}
// the SOP box with a topic ticked for the card
const sopWith = id => sopText({ ...R.sel, sop: { ...R.sel.sop, [id]: { ...R.sel.sop[id], c: true } } });
function render0(box) {
  if (flightOn() && key(R.sel) !== R.wrote) writeCard(); // every change goes on the datacard of the flight at once
  const st = [...box.querySelectorAll('.rsc')].map(c => c.scrollTop),
    { own, squad, sections: SQS } = R.ctx,
    MY = mySecs(),
    { r: nR, s: nS, cap } = counts(),
    fullR = nR >= cap,
    fullS = nS >= cap;
  const D = smartData(),
    onSmart = D ? D.on : new Set(),
    man = R.sel.mode == 'man',
    msn = msnOn(R.sel),
    sub0 = LS.get('bmsroesub', 'roe'),
    sub = sub0 == 'sop' || (sub0 == 'rules' && rulesOn()) ? sub0 : 'roe';
  const fa = R.sel.faor,
    ag = R.sel.ag,
    KEYS = ['ws', 'id', 'commit', 'abort'];
  // the value of the mission for a rule (the A-A block: weapons status, commit), or null
  const msnV = id =>
    fa && msn
      ? id == 'ws'
        ? fa.wpn
        : id == 'commit' && ROE.find(r => r[0] == 'commit')[4].some(o => o[0] == 'n' + fa.commit)
          ? 'n' + fa.commit
          : null
      : null;
  // a rule as a strip (green: a key rule, on the Smart card too; blue: on the datacard); the value of the mission has a yellow dot, struck
  // through when the pilot chose another one
  const chip = (id, kind, [v, long, short]) => {
    const on = kind == 'many' ? R.sel.roe[id].includes(v) : R.sel.roe[id] === v,
      off =
        !on && !boxFits(roeText({ ...R.sel, roe: { ...R.sel.roe, [id]: kind == 'many' ? [...R.sel.roe[id], v] : v } })),
      cov = agCovers(R.sel, v), // the A-G block of the mission writes it
      mv = msnV(id) === v || cov,
      over = mv && !cov && R.sel.roe[id] && !on,
      tip = cov
        ? 'The A-G block of the mission writes it. ' + long
        : mv
          ? over
            ? 'The value of the mission: your choice replaces it. Click your choice again to use the value of the mission.'
            : 'The value of the mission (A-A page). ' + long
          : long;
    return `<button type="button" class="rpk rps${KEYS.includes(id) ? ' k' : ''}${on ? ' on' : ''}${(mv && !R.sel.roe[id]) || (cov && !on) ? ' msn' : ''}${over ? ' over' : ''}${off ? ' off' : ''}" data-r="${id}" data-v="${v}" title="${esc(tip)}"${off ? ' disabled' : ''}><span>${esc(short)}</span>${mv ? '<i class="rpmd"></i>' : ''}</button>`;
  };
  // a rule of the list and its strips
  const rule = ([id, lab, kind, , opts]) =>
    `<div class="rpt rg">${esc(lab)}<small>${kind == 'many' ? 'one or more' : 'one'}</small></div><div class="rpo rps">${opts.map(o => chip(id, kind, o)).join('')}</div>`;
  const why = !msn ? 'ROE MANUAL: not written' : '';
  // a block of the mission, under the Smart card
  const block = (lab, btn, act, L) =>
    `<div class="wcard rpfa${msn ? '' : ' rsoff'}" data-seen="fa:${esc(lab)}"><div class="wh"><h3>${esc(lab)}</h3><span class="rpmsn">MISSION</span></div>${why ? `<div class="hint rpwhy">${why}</div>` : ''}<div class="rpfl">${L.map(esc).join('<br>')}</div><button type="button" class="btn g sm rpfe" data-a="${act}" title="Open the page that writes this block">${esc(btn)}</button></div>`;
  const oca = fa && fa.pos != null ? 'OCA' : 'DCA';
  const roePane = `<div class="rstool"><div class="seg main" role="group" aria-label="ROE"><button type="button" data-rmode="auto" class="${msn ? 'on' : ''}" title="The ROE of the mission (A-A and A-G pages) and your choices, on the datacard and on the Smart card">AUTO</button><button type="button" data-rmode="man" class="${msn ? '' : 'on'}" title="Only your ROE, not those of the mission">MANUAL</button></div><span class="hint">${msn ? 'The ROE of the mission and your choices. Your choice replaces a mission value of the same rule.' : 'Only your ROE.'}</span><span style="flex:1"></span><button type="button" class="btn g rd" data-a="rclear" title="Take away your ROE and the ROE lines. The ROE go to MANUAL, so the ROE of the mission are not written either.">Clear ROE</button></div><div class="rspg2"><div class="wcard"><div class="wh"><h3>Key rules</h3><span class="hint">datacard + Smart card key</span></div>${ROE.filter(
    r => KEYS.includes(r[0])
  )
    .map(rule)
    .join(
      ''
    )}</div><div class="wcard"><div class="wh"><h3>Other rules</h3><span class="hint">datacard</span></div>${ROE.filter(
    r => !KEYS.includes(r[0])
  )
    .map(rule)
    .join(
      ''
    )}<div class="rpt rg">Other ROE lines<small>one a line, they count too</small></div><textarea class="rpfr" data-f="free" rows="2" maxlength="600" placeholder="Written in the ROE box as they are">${esc(R.sel.free)}</textarea></div></div>`;
  const msnCol =
    fa || ag
      ? (fa
          ? block('A-A · ' + oca + (fa.kind ? ' · ' + fa.kind : ''), 'Edit in ' + oca, 'faor', faorOwn(R.sel, false))
          : '') + (ag ? block('A-G · ' + ag.kind, 'Edit in A-G', 'agpage', agLines(ag, false)) : '')
      : `<div class="hint rpnom">No ROE of the mission for this flight. The A-A (DCA, OCA) and A-G pages write them.</div>`;

  const row = t => {
    const [id, lab, , opts] = t,
      v = R.sel.sop[id] || { o: null, t: '', c: false },
      cust = !!v.t || R.cust.has(id),
      long = cust ? '' : (opts.find(x => x[0] === v.o) || [])[1] || '',
      set = !!(v.o || v.t),
      cOff = !set || (!v.c && !boxFits(sopWith(id))),
      lk = smartLink(R.sel, id, CTX), // the change of the mission on the Smart card (SOP AUTO)
      dot = !man && onSmart.has(id);
    const open = R.sopOpen === id,
      val = cust ? v.t : (opts.find(x => x[0] === v.o) || [])[2] || '';
    // a strip: the name, CARD / SMART when it goes there, the value; a click opens its options under it
    return `<div class="rpr${set ? ' set' : ''}${open ? ' op' : ''}" data-t="${id}"><button type="button" class="sps" aria-expanded="${open}" title="${open ? 'Close' : 'Show the options'}">${dot ? '<i class="rpon1" title="On the Smart card"></i>' : ''}<span class="rpn">${esc(lab)}</span>${v.c ? '<b class="cd">CARD</b>' : ''}${man && v.s ? '<b class="cd">SMART</b>' : ''}<em>${esc(val) || '—'}</em><i class="ar">${open ? '▾' : '▸'}</i></button>${lk && (!man || v.s) ? `<div class="rplk" title="The mission changes this topic on the Smart card. The page and the datacard keep your choice.">Smart card: ${esc(lk.say)}</div>` : ''}${
      open
        ? `<div class="spx"><div class="spo">${opts
            .map(
              ([x, lg, sh]) =>
                `<button type="button" class="sps2${!cust && v.o === x ? ' on' : ''}" data-o="${x}" title="${esc(lg)}">${esc(sh)}</button>`
            )
            .join(
              ''
            )}<button type="button" class="sps2${cust ? ' on' : ''}" data-o="*" title="Write your own short text for the card">Own text…</button></div><div class="rpd">${cust ? `<input type="text" class="rpi" maxlength="120" value="${esc(v.t)}" placeholder="Short text for the card">` : esc(long)}</div><div class="spb rpck"><button type="button" class="btn${v.c ? '' : ' g'} rptg" data-tg="c" aria-pressed="${!!v.c}"${cOff && !v.c ? ' disabled' : ''} title="${cOff && set ? 'The SOP box of the card is full' : 'Write this topic in the SOP box of the card (short form)'}">CARD</button>${man ? `<button type="button" class="btn${v.s ? '' : ' g'} rptg" data-tg="s" aria-pressed="${!!v.s}"${set ? '' : ' disabled'} title="${set ? 'Write this topic on the Smart card' : 'Choose a value first'}">SMART</button>` : ''}<span style="flex:1"></span><button type="button" class="btn g rd sps2c" data-o=""${set ? '' : ' disabled'} title="Take this topic away">✕ Clear</button></div></div>`
        : ''
    }</div>`;
  };
  const myIds = new Set(MY.map(c => c.id)),
    sqIds = new Set((SQS || []).map(c => c.id));
  const only = !!LS.get('bmsroeonly', false); // Show: chosen only (the topics not chosen are hidden)
  const phaseCard = ([ph, T, ctag, cid]) => {
    const n = T.filter(t => R.sel.sop[t[0]]).length,
      TT = only ? T.filter(t => R.sel.sop[t[0]]) : T,
      mine = cid && myIds.has(cid),
      sq = cid && sqIds.has(cid),
      ed = mine || (sq && own);
    return card(
      cid ? 'c:' + cid : 'p:' + ph,
      esc(ph),
      (cid ? `<span class="rsbadge${sq ? ' sq' : ''}">${mine ? 'mine' : 'squadron'} · ${esc(ctag)}</span> ` : '') +
        (n || ''),
      TT.length
        ? TT.map(row).join('')
        : `<div class="hint">${T.length ? 'Nothing chosen here.' : 'No topics yet: ✎ to add them.'}</div>`,
      ed ? `<button type="button" class="rsed" data-sec="${esc(cid)}" title="Edit this section">✎</button>` : '',
      phCol(ph, cid)
    );
  };
  const ALL = sopAll().filter(([, T]) => !only || T.some(t => R.sel.sop[t[0]])),
    custom = ALL.filter(x => x[3]).map(phaseCard),
    phases = ALL.filter(x => !x[3]).map(phaseCard),
    cols = L => `<div class="rspg">${L.join('')}</div>`; // in the order of the flight: down the first column, then the next ones
  const SK = sopAll().map(([ph, , , cid]) => (cid ? 'c:' + cid : 'p:' + ph)),
    anyOpen = SK.some(k => !CLOSED().has(k)),
    wide = !!LS.get('bmsroewide', false);
  const tools = `<div class="rstool"><div class="seg main" role="group" aria-label="SOP of the Smart card"><button type="button" data-mode="auto" class="${man ? '' : 'on'}" title="The program chooses the SOP topics of the Smart card and adapts them to the mission (IMC, night…)">AUTO</button><button type="button" data-mode="man" class="${man ? 'on' : ''}" title="Only the topics with SMART go on the Smart card, as you chose them">MANUAL</button></div><button type="button" class="btn sm rsonly${only ? '' : ' g'}" data-only="${only ? 0 : 1}" aria-pressed="${only}" title="${only ? 'Show all the topics again' : 'Show only the topics that you chose'}">Chosen only</button><button type="button" class="btn sm${wide ? '' : ' g'}" data-a="wide" aria-pressed="${wide}" title="${wide ? 'Show the columns of the presets and of the Smart card again' : 'Hide the columns of the presets and of the Smart card: more space for the SOP'}">Wide view</button><button type="button" class="btn g sm" data-a="fold" title="${anyOpen ? 'Fold all the SOP sections' : 'Unfold all the SOP sections'}">${anyOpen ? 'Fold all' : 'Unfold all'}</button><span class="rsgr"><button type="button" class="btn g" data-a="newsec" title="Make a section of your own (on this PC${own ? ', or for the squadron' : ''}), with its topics and options">＋ Custom</button><button type="button" class="btn g rd" data-a="sclear" title="Take away every SOP topic and the SOP lines">Clear SOP</button></span></div>`;
  const customBlock = custom.length
    ? `<div class="rscust"><div class="rsct"><h3>Custom sections</h3><span class="hint">yours on this PC${own ? ', or of the squadron' : ''}</span></div>${cols(custom)}</div>`
    : '';
  const src = SRC(),
    C = chips(src),
    cur = R.pick ? C.find(c => c.k == R.pick) : null,
    chg = dirty(),
    cs = F.cs || (ST.CL && ST.CL.length ? 'flight' : '');
  const pchip = c => {
    const on = c.k == R.pick,
      tip = c.std
        ? `The Standard${src == 'sq' ? ' of the squadron' : ' of your flights'}: Default for every kind of mission with no preset of its own${c.ed ? '' : ' (only the commander changes it)'}`
        : c.cats.length
          ? 'Default for ' + c.cats.join(', ')
          : 'Default for no kind of mission';
    return `<span class="rpq${src == 'sq' ? ' sq' : ''}${on ? ' on' : ''}${c.std ? ' std' : ''}" data-k="${c.k}" title="${esc(tip)}">${c.std ? '<i class="rpst">STANDARD</i>' + (c.name != 'Standard' ? esc(c.name) : '') : esc(c.name)}${on && chg ? '<i class="rpdot" title="Changed by hand"></i>' : ''}${c.std && !c.ed ? '<i class="rplk" title="Locked">🔒</i>' : ''}${!c.std && c.ed ? `<b data-del="${c.k}" title="Delete this preset">×</b>` : ''}</span>`;
  };
  const who = !flightOn()
    ? 'Pick a flight in the ATO (Datacard): a preset clicked here goes on its datacard.'
    : `Flight <b>${esc(cs)}</b>${LASTCAT ? ' (' + esc(LASTCAT) + ')' : ''} · ${src == 'sq' ? "the datacard gets the squadron's selection" : inSq() ? "the datacard gets this selection, the squadron's is ignored" : 'the datacard gets this selection'}`;
  const upd = cur && cur.ed,
    showEd = chg || (R.open && cur && cur.ed),
    nameIn = `<div class="rpt">Name</div><input type="text" class="rpnm rsname" maxlength="40" value="${esc(R.name)}" placeholder="Name of the preset">`;
  const edit = showEd
    ? `<div class="rsedit">${chg ? `<div class="rsdirty">${flightOn() ? 'Changed by hand: already on the datacard.' : 'Changed: in no preset yet.'} Keep it as a preset?</div>` : ''}${
        cur && cur.std && R.open
          ? cur.ed
            ? `${nameIn}<div class="rpt">Default for<small>every kind of mission with no preset of its own: it is the Standard</small></div>`
            : ''
          : `${nameIn}<div class="rpt">Default for<small>flights of these kinds of mission get it by themselves</small></div><div class="rpo rps">${ROE_CATS.map(c => `<button type="button" class="rpk rps k rpcat${R.cats.includes(c) ? ' on' : ''}" data-cat="${esc(c)}" title="${esc(c)}"><span>${esc(c)}</span></button>`).join('')}</div>`
      }<div class="rsbar">${upd ? `<button type="button" class="btn${src == 'sq' ? ' g bl' : ''}" data-a="psave">${cur.std ? 'Save Standard' : 'Save "' + esc(cur.name) + '"'}${src == 'sq' ? ' &amp; send' : ''}</button>` : ''}${canNew() ? `<button type="button" class="btn g" data-a="pnew">Save as new</button>` : ''}${chg ? '<button type="button" class="btn g rd" data-a="pdisc">Discard</button>' : ''}</div>${
        !upd && !canNew()
          ? '<div class="hint">The squadron presets are changed by the commander: switch to Flight to keep these changes as your preset.</div>'
          : ''
      }</div>`
    : '';
  const presetCard = card(
    'presets',
    'Presets',
    squad ? esc(squad) : 'on this PC',
    `${
      inSq()
        ? `<div class="seg rssrc" role="group" aria-label="Presets of"><button type="button" data-src="me" class="${src == 'me' ? 'on' : ''}">Flight</button><button type="button" data-src="sq" class="${src == 'sq' ? 'on sq' : ''}">Squadron</button></div>`
        : ''
    }<div class="rswho">${who}</div><div class="rpqs">${C.map(pchip).join('')}</div><div class="hint">Click: puts the preset on the datacard. Double-click: change it (name, Default for).</div>${edit}`
  );
  const warn = [fullR ? 'ROE box full' : '', fullS ? 'SOP box full' : ''].filter(Boolean);
  const cardCard = card(
    'card',
    'Preview',
    'Datacard · MDC',
    `<div class="rscard"><div class="h">ROE</div><div class="h">SOP</div><div class="b rpv1"><canvas width="316" height="202"></canvas></div><div class="b rpv2"><canvas width="316" height="202"></canvas></div></div><div class="rscnt"><span title="The lines of the box at the smallest text size">ROE <b class="${fullR ? 'full' : ''}">${nR}/${cap}</b> lines</span><span title="The lines of the box at the smallest text size (one line a phase, long ones wrap)">SOP <b class="${fullS ? 'full' : ''}">${nS}/${cap}</b> lines</span></div>${
      warn.length ? `<div class="rswarn">${warn.join(', ')}: take a line away to add another one.</div>` : ''
    }<div class="rsbar"><span style="flex:1"></span><button type="button" class="btn g" data-a="back" title="The Datacard">Back to the datacard</button></div>`
  );
  const other = card(
    'other',
    'Other SOP lines',
    'one a line, they count too',
    `<textarea class="rpfr" data-f="sfree" rows="2" maxlength="600" placeholder="Written in the SOP box as they are">${esc(R.sel.sfree)}</textarea>`
  );
  const subs = `<div class="wtabs rssub" role="tablist">${[
    ['roe', 'ROE'],
    ['sop', 'SOP'],
    ...(rulesOn() ? [['rules', 'RULES']] : []),
  ]
    .map(
      ([k, l]) =>
        `<button type="button" role="tab" data-sub="${k}" class="${sub == k ? 'on' : ''}" aria-selected="${sub == k}">${l}</button>`
    )
    .join('')}</div>`;
  const main = sub == 'roe' ? roePane : sub == 'rules' ? rulesPane() : `${tools}${customBlock}${cols(phases)}${other}`; // the custom sections above the standard ones; Other SOP lines right under the phases
  box.innerHTML = `<div class="rsq${sub == 'rules' ? ' rlw' : sub == 'sop' && wide ? ' rwide' : ''}"><div class="rsc rsl">${presetCard}${cardCard}</div><div class="rsc rsm${sub == 'sop' ? ' rss' : ''}">${subs}${main}</div><div class="rsc rsr">${smartCol(D)}${sub == 'roe' ? msnCol : ''}</div></div>`;
  box.querySelectorAll('.rsc').forEach((c, i) => (c.scrollTop = st[i] || 0));
  pvPaint(box.querySelector('.rpv1'), roeText(R.sel));
  pvPaint(box.querySelector('.rpv2'), sopText(R.sel));
  smartPaint(box, D);
  wire(box);
}
// the datacard of the flight: the two boxes and the choices (no word: every change goes there at once)
function writeCard(sel = R.sel) {
  const t1 = roeText(sel),
    t2 = sopText(sel);
  setField('roesel', JSON.stringify(cleanSel(sel)));
  setField('roe', t1);
  setField('sop', t2);
  [
    ['roe', t1],
    ['sop', t2],
  ].forEach(([k, t]) => {
    const d = dEl(k);
    if (d && d.el) d.el.value = t;
  });
  markMan();
  draw();
  if (sel === R.sel) R.wrote = key(R.sel);
}
// the ROE of the flight now: this page's choices when it was opened on the flight, else those of the datacard
export function roeOfFlight() {
  return R.box && ST.CURK === R.flightKey ? cleanSel(R.sel) : flightSel();
}
// THE FAOR BLOCK of the flight, from the FAOR page (core/faor.js faorRoe, null: none): on the datacard at once, and on this page when it shows the flight.
// false when there is no flight or nothing changed
export function roeFaorSet(fa) {
  return blockSet('faor', fa);
}
// THE A-G BLOCK of the flight, from the A-G pages (core/agrules.js); false when nothing changed
export function roeAgSet(b) {
  return blockSet('ag', b);
}
function blockSet(field, fa) {
  if (!flightOn()) return false;
  const seen = R.box && ST.CURK === R.flightKey,
    s = seen ? R.sel : flightSel(),
    nx = capSel({ ...s, [field]: fa }); // the block lines are never cut: the last choices of the lists make room for them
  if (JSON.stringify(nx[field]) === JSON.stringify(cleanSel(s)[field])) return false;
  // the block comes from the page of the mission, not from the hand of the pilot: when the ROE / SOP of the card were not changed by hand, the new text
  // is the automatic one (ST.AUTO), so it is no hand change (a weather map or a date loaded after a flight was chosen asked to discard changes nobody made)
  const ROEK = ['roesel', 'roe', 'sop'],
    wasMan = !ST.AUTO || ROEK.some(k => ST.MANK.has(k) && (F[k] || '') !== (ST.AUTO[k] || ''));
  if (seen) {
    R.sel = nx;
    writeCard();
    if (R.box.isConnected && !R.box.closest('.hide')) render();
    else R.stale = true; // drawn when the page is shown (roeDraw)
  } else writeCard(nx);
  if (!wasMan) {
    ROEK.forEach(k => {
      ST.AUTO[k] = F[k];
      ST.MANK.delete(k);
    });
    markMan();
  }
  return true;
}
// the data of the Smart ROE / SOP card for the flight now (the combined Smart cards take their ROE / SOP part from it): null when nothing is chosen
export function roeSmartNow() {
  syncCustom();
  const seen = R.box && ST.CURK === R.flightKey,
    c0 = seen && R.pick && !dirty() && chipOf(R.pick),
    sub = F.cs && flightOn() ? 'Flight ' + F.cs : c0 ? (c0.std ? 'Standard' : c0.name) : '';
  try {
    return roeSmart(seen ? R.sel : flightSel(), sub);
  } catch (e) {
    return null;
  }
}
// the ROE / SOP cards, in both looks, for Add all cards of the Kneeboard (none when nothing is chosen; pages.js registers it)
export async function roeAllCards() {
  syncCustom();
  await roeCtxLoad();
  const c = document.createElement('canvas');
  c.width = CARD_W;
  c.height = CARD_H;
  const seen = R.box && ST.CURK === R.flightKey, // the page was opened on this flight: its choices, else those of the datacard
    plan = roeCardPlan(seen ? R.sel : flightSel(), c.getContext('2d'));
  if (!plan.length) return [];
  const c0 = seen && R.pick && !dirty() && chipOf(R.pick),
    sub = F.cs && flightOn() ? 'Flight ' + F.cs : c0 ? (c0.std ? 'Standard' : c0.name) : '';
  const mk = p => {
    const k = document.createElement('canvas');
    k.width = CARD_W;
    k.height = CARD_H;
    roeCardDraw(p, k.getContext('2d'), sub);
    return k;
  };
  const sm = roeSmartCard(seen ? R.sel : flightSel(), sub);
  return plan
    .map(p => ({
      name: p.title + (sub ? ' · ' + sub : ''),
      label: p.title,
      c: mk(p),
      alt: otherLook(() => mk(p)),
      dark: cardDark(),
    }))
    .concat(sm ? [sm] : []);
}
// ---- RULES (shown with Settings > Mission & squadron > Edit the Smart card rules): the table of the rules of the Smart card. The rows that are not
// the defaults are kept: mine on this PC (bmsroerules), the squadron's in the squadron (the commander changes them)
const myRules = () => cleanRules(LS.get('bmsroerules', {}));
const sqRules = () => (R.ctx.squad ? R.ctx.rules : sqGet('roeRules', {})) || {};
// the rules in use: the squadron's when its presets are chosen (always for a mission of another pilot) and it changed some, else mine
function rulesSrc() {
  return Object.keys(sqRules()).length && (ST.MSQ || LS.get('bmsroesrc', 'sq') == 'sq') ? 'sq' : 'me';
}
const rulesUsed = () => (rulesSrc() == 'sq' ? sqRules() : myRules());
const rulesOn = () => !!(ST.CFG && ST.CFG.squadron && ST.CFG.squadron.rulesEdit);
// the rows the page changes: of the list chosen with Flight / Squadron
const rulesEd = () => (SRC() == 'sq' ? cleanRules(R.ctx.rules) : myRules());
const rulesCan = () => SRC() == 'me' || R.ctx.own;
function rulesSave(rows) {
  const o = cleanRules(rows);
  Object.keys(o).forEach(id => ruleSame(id, o[id]) && delete o[id]);
  if (SRC() == 'sq') {
    if (!R.ctx.own) return;
    R.ctx.rules = o;
    R.ctx.saveRules(o);
  } else LS.set('bmsroerules', o);
  syncCustom();
  render();
}
// the page drawn again (Settings saved: the RULES sub-page shown or hidden)
export function roeRefreshPage() {
  if (R.box && R.box.isConnected) render();
}
const RCOLS = [
  ['imcDep', 'IMC DEP', 'IMC at the departure field'],
  ['imcArr', 'IMC ARR', 'IMC at the landing field'],
  ['wxDep', 'MVFR DEP', 'Marginal weather or worse at the departure field'],
  ['wxArr', 'MVFR ARR', 'Marginal weather or worse at the landing field'],
  ['wxTgt', 'MVFR TGT', 'Marginal weather or worse at the target'],
  ['night', 'NIGHT', 'Night at take-off, at the task or at landing'],
  ['train', 'TRNG', 'A training mission'],
  ['tank', 'TNK', 'A tanker in the flight plan or in the package'],
  ['ag', 'A-G', 'An A-G mission'],
  ['enemy', 'ENEMY', 'Over the enemy (not DCA, support or C3I)'],
];
const RLAB = { '': '·', in: 'IN', first: '1ST', set: 'SET', out: 'OUT' };
const rkind = v => (!v ? '' : typeof v == 'string' ? v : 'set');
function rulesPane() {
  const src = SRC(),
    rows = rulesEd(),
    can = rulesCan(),
    only = !!LS.get('bmsrulesonly', false),
    ph0 = R.rph || '',
    nCh = Object.keys(rows).length,
    dis = can ? '' : ' disabled';
  const cell = (t, ph, r, k) => {
    const v = r.c[k],
      kd = rkind(v);
    let sel = '';
    if (kd == 'set') {
      const cur = v.o != null ? v.o : '*';
      sel = `<select class="rlv" data-id="${t[0]}" data-k="${k}" aria-label="Value"${dis}>${t[3].map(([o, , sh]) => `<option value="${esc(o)}"${cur === o ? ' selected' : ''}>${esc(sh)}</option>`).join('')}<option value="*"${cur == '*' ? ' selected' : ''}>Text…</option></select>${cur == '*' ? `<input class="rlt" data-id="${t[0]}" data-k="${k}" maxlength="60" value="${esc(v.t || '')}" placeholder="Text on the card" aria-label="Text of the value"${dis}>` : ''}`;
    }
    return `<td><button type="button" class="rlc ${kd}" data-id="${t[0]}" data-k="${k}" data-e="${ph == 'Emergencies' ? 1 : 0}"${dis}>${RLAB[kd]}</button>${sel}</td>`;
  };
  let body = '';
  for (const [ph, T] of sopAll()) {
    if (ph0 && ph != ph0) continue;
    const L = T.filter(t => !only || rows[t[0]]);
    if (!L.length) continue;
    body += `<tr class="rlph"><td colspan="${RCOLS.length + 3}">${esc(ph.toUpperCase())}</td></tr>`;
    for (const t of L) {
      const ch = !!rows[t[0]],
        r = rows[t[0]] || ruleRow(t[0]);
      body += `<tr class="${ch ? 'chg' : ''}"><td class="rln"><span>${esc(t[1])}</span>${ch && can ? `<button type="button" class="rlr" data-id="${t[0]}" title="Back to the default rule">↺</button>` : ''}</td><td><button type="button" class="rlc t" data-id="${t[0]}" data-a="tier" title="Tier: A flight safety, B procedures, C routine"${dis}>${r.tier}</button></td><td><button type="button" class="rlc t${r.fx ? ' in' : ''}" data-id="${t[0]}" data-a="fx" title="Fixed: always on the Smart card when it has a value"${dis}>${r.fx ? 'YES' : '·'}</button></td>${RCOLS.map(([k]) => cell(t, ph, r, k)).join('')}</tr>`;
    }
  }
  const who =
    src == 'sq'
      ? `The rules of the squadron${can ? ': they go to all its pilots' : ': only the commander changes them'}.`
      : 'Your rules, on this PC.';
  return `<div class="rstool rltool">${inSq() ? `<div class="seg rssrc" role="group" aria-label="Rules of"><button type="button" data-src="me" class="${src == 'me' ? 'on' : ''}" title="Your rules, on this PC">Flight</button><button type="button" data-src="sq" class="${src == 'sq' ? 'on sq' : ''}" title="The rules of the squadron">Squadron</button></div>` : ''}<select class="rlph" aria-label="Phase"><option value="">All phases</option>${sopAll()
    .map(([ph]) => `<option${ph == ph0 ? ' selected' : ''}>${esc(ph)}</option>`)
    .join(
      ''
    )}</select><div class="seg" role="group" aria-label="Show"><button type="button" data-ronly="0" class="${only ? '' : 'on'}">All topics</button><button type="button" data-ronly="1" class="${only ? 'on' : ''}">Changed only</button></div><span style="flex:1"></span><button type="button" class="btn g" data-a="rexp" title="The changed rules as text, to give to another pilot">Export</button><button type="button" class="btn g" data-a="rimp"${dis} title="Put in the rules of a text made with Export">Import</button><button type="button" class="btn g rd" data-a="rreset"${nCh && can ? '' : ' disabled'} title="All the rules back to the defaults">Reset to default</button></div><div class="hint rlwho">${who} ${nCh ? `<b>${nCh}</b> topic${nCh == 1 ? '' : 's'} changed.` : 'All rules are the defaults.'} Click a cell to change it: <b>IN</b> the topic goes on the card when it has a value, <b>1ST</b> an Emergency at the top, <b>SET</b> on the card with this value (also without a choice), <b>OUT</b> not on the card. When more conditions are true, the first column from the left wins.</div><div class="rltab"><table><thead><tr><th class="rln">Topic</th><th title="Tier: A flight safety, B procedures, C routine">Tier</th><th title="Fixed: always on the Smart card when it has a value">Fixed</th>${RCOLS.map(([, l, tip]) => `<th title="${esc(tip)}">${l}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
}
// a click on a cell of the table
function rulesClick(b) {
  const id = b.dataset.id,
    rows = rulesEd(),
    r = rows[id] || ruleRow(id),
    t = topicsAll().find(x => x[0] == id);
  if (!t) return;
  if (b.dataset.a == 'tier') r.tier = { A: 'B', B: 'C', C: 'A' }[r.tier];
  else if (b.dataset.a == 'fx') r.fx = !r.fx;
  else {
    const k = b.dataset.k,
      cy = b.dataset.e == '1' ? ['', 'in', 'first', 'set', 'out'] : ['', 'in', 'set', 'out'],
      nx = cy[(cy.indexOf(rkind(r.c[k])) + 1) % cy.length];
    if (!nx) delete r.c[k];
    else r.c[k] = nx == 'set' ? (t[3].length ? { o: t[3][0][0] } : { t: 'TEXT' }) : nx;
  }
  rulesSave({ ...rows, [id]: r });
  const f = R.box.querySelector(
    `.rltab button[data-id="${id}"]${b.dataset.k ? `[data-k="${b.dataset.k}"]` : `[data-a="${b.dataset.a}"]`}`
  );
  if (f) f.focus();
}
function rulesValue(x) {
  const id = x.dataset.id,
    rows = rulesEd(),
    r = rows[id] || ruleRow(id);
  r.c[x.dataset.k] = x.classList.contains('rlt')
    ? { t: x.value.trim() || 'TEXT' }
    : x.value == '*'
      ? { t: 'TEXT' }
      : { o: x.value };
  rulesSave({ ...rows, [id]: r });
}
function rulesExport() {
  const txt = 'SOPTAB ' + JSON.stringify({ v: 1, base: APP_VERSION, rows: rulesEd() });
  modal(
    'Export the rules',
    `<p>Copy this text and give it to another pilot: Import puts it in.</p><textarea class="rpfr rlx" rows="6" readonly>${esc(txt)}</textarea>`,
    [
      { a: 'copy', label: 'Copy' },
      { a: 'no', label: 'Close', g: 1 },
    ],
    a => {
      if (a != 'copy') return;
      navigator.clipboard.writeText(txt).then(
        () => appToast('Rules copied.'),
        () => appToast('Select the text and copy it with Ctrl+C.', true)
      );
    }
  );
}
function rulesImport() {
  modal(
    'Import the rules',
    `<p>Paste a text made with Export. It replaces the ${SRC() == 'sq' ? 'rules of the squadron' : 'rules on this PC'}.</p><textarea class="rpfr rlx" rows="6" placeholder="SOPTAB {…}"></textarea>`,
    [
      { a: 'ok', label: 'Import' },
      { a: 'no', label: 'Cancel', g: 1 },
    ],
    (a, p) => {
      if (a != 'ok') return;
      const ta = p.querySelector('.rlx');
      try {
        const v = JSON.parse(ta.value.replace(/^\s*SOPTAB\s*/, ''));
        if (!v || typeof v.rows != 'object') throw new Error();
        rulesSave(v.rows);
        appToast('Rules imported.');
      } catch (e) {
        ta.classList.add('err');
        appToast('The text is not a rules text made with Export.', true);
        return false;
      }
    }
  );
}
// ---- the column of the Smart ROE / SOP card: what the mission is, its picture and what it holds
const SMART_TIP =
  'ROE AUTO: the ROE of the mission (A-A and A-G pages) and your choices. ROE MANUAL: only your choices.\nSOP AUTO: the program chooses the SOP topics for the Smart card and adapts them to the mission (the conditions at the departure field, the target and the landing field: for example IMC at landing gives STAR + ILS/TACAN). The order: the topics that the mission changes, the texts that you wrote, the topics of the mission conditions (IMC, marginal weather, night, training, tanker, A-G, over the enemy), the fixed topics; in each group the safety topics first. The Emergencies go at the bottom when there is space; other topics that you chose fill the space that stays. The page and the datacard keep your choices.\nSOP MANUAL: only the topics with SMART, as you chose them.\nMarginal weather (MVFR): clouds below 3,000 ft AGL, a visibility below 8 km or Inclement weather. IMC: clouds below 1,500 ft AGL or a visibility below 5 km.';
// the data of the Smart card for the choices of the page (null: nothing to write)
function smartData() {
  try {
    return roeSmart(R.sel, '');
  } catch (e) {
    return null;
  }
}
// what SOP AUTO sees in the mission, in words
function ctxSay() {
  const c = CTX,
    W = (i, w, k) => (i ? 'IMC ' + k : w ? 'MVFR ' + k : ''),
    L = [
      W(c.imcDep, c.wxDep, 'at take-off'),
      W(c.imcArr, c.wxArr, 'at landing'),
      c.wxTgt ? 'MVFR at the target' : '',
      c.night ? 'night' : '',
      c.train ? 'training' : '',
      c.tank ? 'tanker' : '',
      c.ag ? 'A-G' : '',
      c.enemy ? 'over the enemy' : '',
    ].filter(Boolean);
  return L.length ? L.join(' · ') : 'no special conditions';
}
// the rules in use, when they are not the defaults
function rulesLine() {
  const n = Object.keys(rulesUsed()).length;
  return n
    ? `<div class="rsctx rsrul" title="The rules of the Smart card are not the defaults${rulesOn() ? ': see the RULES sub-page' : ''}.">Rules: ${rulesSrc() == 'sq' ? 'squadron' : 'yours'} · ${n} topic${n == 1 ? '' : 's'} changed</div>`
    : '';
}
function smartCol(D) {
  const man = R.sel.mode == 'man',
    n = D ? D.blocks.reduce((a, [h, L]) => a + (h == 'SOP' ? L.length : 0), 0) : 0;
  return `<div class="wcard rssc"><div class="wh"><h3>Smart card</h3><span class="hint rsinfo" title="${esc(SMART_TIP)}">ⓘ How it works</span></div><div class="rsctx">${man ? 'SOP MANUAL: the topics with SMART, as you chose them.' : 'Mission: ' + esc(flightOn() ? ctxSay() : 'no flight chosen')}</div>${rulesLine()}${D ? '<canvas class="rsprev" width="520" height="780" aria-label="The Smart ROE / SOP card"></canvas>' : '<div class="rsnone hint">Choose ROE or SOP topics to make the Smart card.</div>'}${
    D
      ? `<div class="rscnt rssm"><span>SOP <b>${n}</b> line${n == 1 ? '' : 's'} · Emergencies <b>${D.emerg.length}</b></span></div>${D.left ? `<div class="rscnt rssm"><span><b class="full">${D.left}</b> topic${D.left == 1 ? '' : 's'} not written (no space)</span></div>` : ''}`
      : ''
  }<div class="rsbar rsdotl">${man ? '' : '<span class="hint"><i class="rpon1"></i> on the Smart card</span>'}</div></div>`;
}
// the picture of the Smart card, drawn at its size and made smaller
let SCV = null;
function smartPaint(box, D) {
  const cv = /** @type {HTMLCanvasElement|null} */ (box.querySelector('.rsprev'));
  if (!cv || !D) return;
  if (!SCV) {
    SCV = document.createElement('canvas');
    SCV.width = SC_W;
    SCV.height = SC_H;
  }
  const x = /** @type {CanvasRenderingContext2D} */ (SCV.getContext('2d'));
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.clearRect(0, 0, SC_W, SC_H);
  drawSmartText(x, D);
  const y = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
  y.imageSmoothingQuality = 'high';
  y.drawImage(SCV, 0, 0, cv.width, cv.height);
}
// the conditions of the mission for the Smart card (pages.js registers it): {imcDep, imcArr, wx, night, train, tank, ag, enemy}
let CTX_OF = async () => ({}),
  CTX = {};
export function setRoeCtx(f) {
  CTX_OF = f;
}
export async function roeCtxLoad() {
  try {
    CTX = (await CTX_OF()) || {};
  } catch (e) {
    CTX = {};
  }
  return CTX;
}
// the Smart ROE / SOP card (core/smartcard.js). Key box: JOKER, BINGO, LASER, M4, then the four ROE (WPN, ID, COMMIT, BUGOUT). The body, while it
// fits: the other ROE (other rules, restrictions, own lines, the A-A and A-G blocks), then the SOP chosen by smartSop (the topics that the day
// changes, those ticked Smart, the phases of the conditions of the mission, the fixed ones), written in the order of the flight. Under the line
// at the bottom: the Emergencies, as many as the space left allows.
const SM = { top: 168, foot: 684, lh: 16, head: 18, gap: 10, w: 432, fs: 13 };
function roeSmart(sel, sub) {
  const T = fullText(sel),
    K = roeKey(sel),
    v = k => (F[k] != null && String(F[k]).trim() ? String(F[k]).trim() : '--'),
    lsr = v('fl' + seatIdx() + '_5'),
    keyLab = new Set(['Weapons status', 'ID criteria', 'Commit', 'Abort / bugout']),
    mx = document.createElement('canvas').getContext('2d'),
    // a key value too long for its cell (cut with "…"): the whole rule under the key box
    cut = [
      ['WPN', K.wpn],
      ['ID', K.id],
      ['COMMIT', K.commit],
      ['BUGOUT', K.bugout],
    ].filter(([, t]) => t && keyFit(mx, t).cut),
    roeB = [
      ...(cut.length ? [['KEY ROE', cut.map(([l, t]) => [l + ': ' + t, false, l.length + 1])]] : []),
      ...T.roe.filter(([lab]) => !keyLab.has(lab)).map(([lab, L]) => [String(lab).toUpperCase(), L]),
      ...(T.roeFree.length ? [['ROE', T.roeFree]] : []),
    ],
    S = smartSop(sel, CTX),
    sfree = T.sopFree;
  if (!roeB.length && !S.items.length && !S.emerg.length && !sfree.length && !K.wpn && !K.id) return null;
  // the height of the blocks, as drawSmartText draws them
  const rowsH = L =>
      L.reduce((a, r) => a + wrap(mx, '• ' + (Array.isArray(r) ? r[0] : r), SM.fs, SM.w).length * SM.lh, 0),
    blocksH = B => B.reduce((a, [, L]) => a + SM.head + rowsH(L) + SM.gap, 0),
    sopB = items => {
      const L = [...smartSopLines(items), ...sfree];
      return L.length ? [['SOP', L]] : [];
    },
    room = SM.foot - 26 - SM.top; // the last line at the bottom
  // the SOP that fit, the most important first: an item that does not fit is left out, a smaller one after it can still go in
  const pick = [];
  for (const it of S.items) if (blocksH([...roeB, ...sopB([...pick, it])]) <= room) pick.push(it);
  // the Emergencies in the space left: their box takes a label and its lines
  const free = room - blocksH([...roeB, ...sopB(pick)]) - 30,
    em = [],
    on = new Set();
  let eh = 0;
  for (const it of S.emerg) {
    const t = it.txt + (it.tag ? ' (' + it.tag + ')' : ''),
      h = wrap(mx, '• ' + t, SM.fs, SM.w).length * SM.lh;
    if (eh + h > free) break;
    eh += h;
    em.push(t);
    on.add(it.id);
  }
  // still space: the other topics chosen, by tier
  const n0 = pick.length;
  for (const it of S.fill)
    if (blocksH([...roeB, ...sopB([...pick, it])]) <= room - (em.length ? eh + 30 : 0)) pick.push(it);
  const blocks = [...roeB, ...sopB(pick)];
  pick.forEach(it => on.add(it.id));
  return {
    title: 'ROE / SOP',
    right: flightTag() || F.cs || '',
    key: [
      ['JOKER', v('joker')],
      ['BINGO', v('bingo'), true],
      ['LASER', lsr],
      ['M4', v('m4')],
      ['WPN', K.wpn || '--'],
      ['ID', K.id || '--'],
      ['COMMIT', K.commit || '--'],
      ['BUGOUT', K.bugout || '--'],
    ],
    // for the combined Smart cards (smartcombo.js)
    more: [
      ['M3', v('m3')],
      ['PRESET', (sub || 'Custom').toUpperCase().slice(0, 10)],
    ],
    blocks,
    emerg: em,
    left: S.items.length - n0, // the SOP topics of the card that did not fit (not those that only fill the space)
    on, // the ids of the SOP topics on the card (the page marks them)
    foot: [],
    last: sub ? 'ROE preset: ' + sub : '',
  };
}
function roeSmartCard(sel, sub) {
  const D = roeSmart(sel, sub);
  if (!D) return null;
  const mk = () => {
    const k = document.createElement('canvas');
    k.width = SC_W;
    k.height = SC_H;
    drawSmartText(/** @type {CanvasRenderingContext2D} */ (k.getContext('2d')), D);
    return k;
  };
  const nm = 'Smart · ROE / SOP' + (sub ? ' · ' + sub : '');
  return { name: nm, label: 'Smart · ROE / SOP', c: mk(), alt: otherLook(mk), dark: cardDark() };
}
// Add card: the whole text on Kneeboard cards (two when one is not enough: ROE and SOP apart, the pilot is told first)
async function addCards() {
  syncCustom();
  await roeCtxLoad();
  const c = document.createElement('canvas');
  c.width = CARD_W;
  c.height = CARD_H;
  const x = c.getContext('2d'),
    plan = roeCardPlan(R.sel, x);
  if (!plan.length) return appToast('Nothing chosen yet: no card to add.', true);
  const c0 = R.pick && !dirty() && chipOf(R.pick),
    sub = F.cs && flightOn() ? 'Flight ' + F.cs : c0 ? (c0.std ? 'Standard' : c0.name) : '',
    go = async () => {
      // the classic card(s) and the Smart card, chosen on their pictures
      const mk = p => {
          const k = document.createElement('canvas');
          k.width = CARD_W;
          k.height = CARD_H;
          roeCardDraw(p, /** @type {CanvasRenderingContext2D} */ (k.getContext('2d')), sub);
          return k;
        },
        sm = roeSmartCard(R.sel, sub),
        list = plan
          .map(p => ({
            kind: 'std',
            name: p.title + (sub ? ' · ' + sub : ''),
            label: p.title,
            c: mk(p),
            alt: otherLook(() => mk(p)),
          }))
          .concat(sm ? [{ ...sm, kind: 'smart' }] : []);
      const pick = await chooseCards(list, 'Add ROE / SOP cards to the Kneeboard');
      if (!pick.length) return;
      for (const z of pick) {
        const blob = await new Promise(r => z.c.toBlob(r, 'image/png')),
          alt = await new Promise(r => z.alt.toBlob(r, 'image/png'));
        if (blob) await kbAddPic(blob, z.name, alt, cardDark());
      }
      appToast(
        pick.length == 1
          ? 'ROE / SOP card added to the Kneeboard.'
          : pick.length + ' ROE / SOP cards added to the Kneeboard.'
      );
    };
  if (plan.length == 1) return go();
  modal(
    'Two cards needed',
    `<p>The whole ROE and SOP do not fit on one card: they go on two cards, <b>ROE / SOP</b> and <b>ROE / SOP (2)</b> (the SOP go on from the first).</p>${plan.cut ? '<p>Even with the smallest text the last lines do not fit: they are left out. Choose fewer topics to have them all.</p>' : ''}`,
    [
      { a: 'go', label: 'Add ' + plan.length + ' cards' },
      { a: 'no', label: 'Cancel', g: 1 },
    ],
    a => {
      if (a == 'go') go();
    }
  );
}
// a custom section: name, tag on the card, mine or the squadron's, topics with their options ("SHORT = full text" a line)
function editSection(id) {
  const MY = mySecs(),
    SQ = R.ctx.sections || [],
    old = MY.find(c => c.id == id) || SQ.find(c => c.id == id),
    isSq = !!SQ.find(c => c.id == id),
    s = old || { name: '', tag: '', topics: [] };
  // a topic: its name, the word before its value on the card, its options (as the SOP of the program: Ground > Anti-collision / flash, LTS)
  const topicRow = t =>
    `<div class="rstp"><label>Topic<input type="text" class="rstl" maxlength="40" placeholder="e.g. Anti-collision / flash" value="${esc(t.label || '')}"></label><label>Word on the card<input type="text" class="rstt" maxlength="10" placeholder="e.g. LTS" value="${esc(t.tag || '')}"></label><button type="button" class="btn g rd" data-tdel="1" title="Remove this topic">×</button><label class="rstol">Options: one a line, what the card writes = what it means<textarea class="rsto" rows="3" placeholder="FLASH MOVING = Flash as soon as the aircraft moves&#10;FLASH RWY = Steady while taxiing, flash on the runway">${esc(optsToText(t.opts))}</textarea></label><div class="hint rstpv"></div></div>`;
  // what the card writes for a topic with its first option: TAG: WORD OPTION
  const pvTopics = p => {
    const tag = p.querySelector('.rsst').value.trim().toUpperCase() || 'TAG';
    p.querySelectorAll('.rstp').forEach(r => {
      const w = r.querySelector('.rstt').value.trim().toUpperCase(),
        o = optsFromText(r.querySelector('.rsto').value)[0];
      r.querySelector('.rstpv').innerHTML = o
        ? 'On the card: <b>' + esc(tag + ': ' + (w ? w + ' ' : '') + o[2]) + '</b>'
        : 'On the card: ' + esc(tag) + ': ' + (w ? esc(w) + ' ' : '') + 'and the option chosen';
    });
  };
  const p = modal(
    old ? 'Custom section' : 'New custom section',
    `<p class="hint rsfmh">A section of your own, with its topics and their options, as the SOP of the program. On the card a topic is one line: the tag of the section, the word of the topic and the option chosen (RNG: LTS FLASH MOVING).</p><div class="rsfm"><label>Name<input type="text" class="rssn" maxlength="40" value="${esc(s.name)}" placeholder="e.g. Range procedures"></label><label>Tag on the card<input type="text" class="rsst" maxlength="8" value="${esc(s.tag)}" placeholder="e.g. RNG"></label>${
      R.ctx.own && !old
        ? `<label>For<select class="rsfor"><option value="me">Me (this PC)</option><option value="sq">The squadron</option></select></label>`
        : `<div class="hint">${isSq ? 'Section of the squadron' : 'Your section, on this PC'}</div>`
    }</div><div class="rstps">${(s.topics.length ? s.topics : [{}]).map(topicRow).join('')}</div><button type="button" class="btn g" data-tadd="1">＋ Topic</button>`,
    [
      { a: 'ok', label: 'Save section' },
      ...(old ? [{ a: 'del', label: 'Delete section', g: 1, rd: 1 }] : []),
      { a: 'no', label: 'Cancel', g: 1 },
    ],
    (a, p) => {
      if (a == 'no') return;
      const sq = old ? isSq : !!(p.querySelector('.rsfor') && p.querySelector('.rsfor').value == 'sq');
      let L = sq ? SQ.slice() : MY.slice();
      if (a == 'del') L = L.filter(c => c.id != id);
      else {
        const name = p.querySelector('.rssn').value.trim();
        if (!name) {
          p.querySelector('.rssn').classList.add('err');
          return false;
        }
        const sec = cleanCustom([
          {
            id: old ? old.id : undefined,
            name,
            tag: p.querySelector('.rsst').value,
            topics: [...p.querySelectorAll('.rstp')].map((r, i) => ({
              id: old && old.topics[i] ? old.topics[i].id : undefined,
              label: r.querySelector('.rstl').value,
              tag: r.querySelector('.rstt').value,
              opts: optsFromText(r.querySelector('.rsto').value),
            })),
          },
        ])[0];
        if (old) L = L.map(c => (c.id == id ? sec : c));
        else L.push(sec);
      }
      if (sq) R.ctx.saveSec(L);
      else mySecsSave(L);
      syncCustom();
      setSel(R.sel, false);
      render();
    }
  );
  p.addEventListener('click', e => {
    if (e.target.closest('[data-tadd]')) {
      const w = document.createElement('div');
      w.innerHTML = topicRow({});
      p.querySelector('.rstps').append(w.firstElementChild);
      pvTopics(p);
    } else if (e.target.closest('[data-tdel]')) e.target.closest('.rstp').remove();
  });
  p.addEventListener('input', () => pvTopics(p));
  pvTopics(p);
}
function wire(box) {
  box.onclick = e => {
    const k = e.target.closest('.rpk:not(.rpcat)'),
      cat = e.target.closest('.rpcat'),
      a = e.target.closest('[data-a]'),
      del = e.target.closest('[data-del]'),
      sb = e.target.closest('[data-src]'),
      q = e.target.closest('.rpq'),
      ed = e.target.closest('.rsed'),
      fold = e.target.closest('.rsh');
    if (ed) return editSection(ed.dataset.sec);
    const sp = e.target.closest('.rpr .sps');
    if (sp) {
      // a topic opens (its options unroll, as the ATO), the one open closes first
      const id = sp.closest('.rpr').dataset.t,
        old = box.querySelector('.rpr.op .spx');
      const show = () => {
        R.sopOpen = R.sopOpen === id ? null : id;
        render();
        const x = R.sopOpen && box.querySelector(`.rpr[data-t="${R.sopOpen}"] .spx`);
        if (x) expand([x]);
      };
      return old ? collapse([old], show) : show();
    }
    const so = e.target.closest('.rpr [data-o]');
    if (so && !so.disabled) return sopPick(so.closest('.rpr').dataset.t, so.dataset.o);
    const tg = e.target.closest('.rptg');
    if (tg && !tg.disabled) {
      const id = tg.closest('.rpr').dataset.t,
        v = R.sel.sop[id];
      if (!v) return;
      if (tg.dataset.tg == 's') v.s = !v.s;
      else v.c = !v.c && boxFits(sopWith(id));
      return render();
    }
    const rc = e.target.closest('.rlc');
    if (rc) return rulesClick(rc);
    const rr = e.target.closest('.rlr');
    if (rr) {
      const rows = rulesEd();
      delete rows[rr.dataset.id];
      return rulesSave(rows);
    }
    const ro = e.target.closest('[data-ronly]');
    if (ro) {
      LS.set('bmsrulesonly', ro.dataset.ronly == '1');
      return render();
    }
    const sb2 = e.target.closest('[data-sub]');
    if (sb2) {
      LS.set('bmsroesub', sb2.dataset.sub);
      render();
      const m = box.querySelector('.rsm');
      if (m && animOn()) m.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
      return;
    }
    const rm = e.target.closest('[data-rmode]');
    if (rm) {
      R.sel.manroe = rm.dataset.rmode == 'man';
      return render();
    }
    const md = e.target.closest('[data-mode]');
    if (md) {
      R.sel.mode = md.dataset.mode == 'man' ? 'man' : 'auto';
      return render();
    }
    const ob = e.target.closest('[data-only]');
    if (ob) {
      LS.set('bmsroeonly', ob.dataset.only == '1');
      return render();
    }
    if (fold && !e.target.closest('button')) {
      const c = fold.closest('.rsk'),
        kk = c.dataset.k,
        S = CLOSED();
      const shut = !c.classList.contains('shut'),
        bd = c.querySelector('.rsbd');
      if (shut) S.add(kk);
      else S.delete(kk);
      LS.set(CKEY, [...S]);
      fold.querySelector('.rsar').textContent = shut ? '▸' : '▾';
      // the section rolls up or unrolls (the times of the ATO)
      if (shut) collapse([bd], () => c.classList.add('shut'));
      else {
        c.classList.remove('shut');
        expand([bd]);
      }
      const fb = box.querySelector('[data-a=fold]'),
        op = sopAll().some(([ph, , , cid]) => !S.has(cid ? 'c:' + cid : 'p:' + ph));
      if (fb) {
        fb.textContent = op ? 'Fold all' : 'Unfold all';
        fb.title = op ? 'Fold all the SOP sections' : 'Unfold all the SOP sections';
      }
      return;
    }
    if (sb) {
      if (sb.dataset.src == SRC()) return;
      LS.set('bmsroesrc', sb.dataset.src);
      if (!dirty()) matchPick();
      else R.pick = null; // the changes stay; they are kept in the list now shown
      return render();
    }
    if (del) {
      const kk = del.dataset.del,
        c = chipOf(kk),
        sq = kk[0] == 'q',
        i = +kk.slice(1);
      if (!c) return;
      confirm(`Delete the preset "${c.name}"?${sq ? ' Every pilot of the squadron loses it.' : ''}`).then(y => {
        if (!y) return;
        const L = sq ? R.ctx.presets.slice() : presetsLoad(),
          gone = L.splice(i, 1)[0],
          was = R.pick;
        const put = M => (sq ? R.ctx.save(M) : presetsSave(M));
        put(L);
        if (was == kk) R.pick = null;
        if (!dirty() || was != kk) matchPick();
        render();
        appToast(
          'Preset "' + c.name + '" deleted.',
          {
            label: 'Undo',
            fn: () => {
              const M = sq ? R.ctx.presets.slice() : presetsLoad();
              M.splice(Math.min(i, M.length), 0, gone);
              put(M);
              if (!dirty()) matchPick();
              render();
            },
          },
          10000
        );
      });
      return;
    }
    if (q) {
      const kk = q.dataset.k,
        c = chipOf(kk);
      if (!c) return;
      // a double-click (two clicks on the same preset, the page drawn again between them): its name and Default for
      const now = Date.now(),
        dbl = R.lastQ == kk && now - R.lastT < 450;
      R.lastQ = kk;
      R.lastT = now;
      if (dbl && kk == R.pick) {
        R.lastQ = null;
        if (!c.ed) return appToast('Only the commander changes the presets of the squadron.', true);
        R.open = true;
        if (c.std) R.name = c.name;
        render();
        const n = box.querySelector('.rsname');
        if (n) n.focus();
        return;
      }
      if (kk == R.pick && !dirty()) return; // already on the datacard (a double-click changes it)
      const go = () => {
        setSel(c.sel, false);
        setPick(c);
        render();
        if (flightOn())
          appToast((c.std ? 'Standard' : '"' + c.name + '"') + ' on the datacard' + (F.cs ? ' of ' + F.cs : '') + '.');
      };
      if (!dirty() || key(R.sel) == key(emptySel())) return go();
      const cc = R.pick && chipOf(R.pick),
        upd = cc && cc.ed;
      modal(
        'Changes not saved',
        `<p>The datacard${F.cs ? ' of ' + esc(F.cs) : ''} has changes that are in no preset.</p>`,
        [
          ...(upd ? [{ a: 'save', label: 'Save "' + (cc.std ? 'Standard' : cc.name) + '" first' }] : []),
          { a: 'disc', label: 'Discard', g: 1, rd: 1 },
          { a: 'no', label: 'Cancel', g: 1 },
        ],
        a => {
          if (a == 'no') return;
          if (a == 'save') savePick(cc, R.name || cc.name, R.cats);
          go();
        }
      );
      return;
    }
    if (cat) {
      const c = cat.dataset.cat;
      R.cats = R.cats.includes(c) ? R.cats.filter(x => x != c) : [...R.cats, c];
      cat.classList.toggle('on', R.cats.includes(c));
      return;
    }
    if (k && !k.disabled) {
      const r = k.dataset.r,
        v = k.dataset.v,
        kind = ROE.find(x => x[0] == r)[2];
      if (kind == 'many') {
        const L = R.sel.roe[r];
        R.sel.roe[r] = L.includes(v) ? L.filter(x => x != v) : [...L, v];
      } else R.sel.roe[r] = R.sel.roe[r] === v ? null : v;
      return render();
    }
    if (!a) return;
    const act = a.dataset.a;
    if (act == 'agpage') return ST.agGo && ST.agGo(R.sel.ag);
    if (act == 'faor') return ST.bvrGo && ST.bvrGo(R.sel.faor && R.sel.faor.pos != null ? 'oca' : 'faor');
    if (act == 'rclear') {
      // the ROE: none of the pilot, none of the mission (MANUAL)
      R.sel.roe = emptySel().roe;
      R.sel.free = '';
      R.sel.manroe = true;
      return render();
    }
    if (act == 'sclear') {
      R.sel.sop = {};
      R.sel.sfree = '';
      R.cust.clear();
      R.sopOpen = null;
      return render();
    }
    if (act == 'back') {
      const t = document.querySelector('.tab[data-t=kb]'); // the Datacard tab
      if (t) t.click();
      return;
    }
    if (act == 'kb') return addCards();
    if (act == 'wide') {
      // the side columns fade away and the sections take the room (or the other way); the bar does not move
      const on = !LS.get('bmsroewide', false),
        go = () => {
          LS.set('bmsroewide', on);
          render();
          if (!animOn()) return;
          const F = [{ opacity: 0 }, { opacity: 1 }];
          box
            .querySelectorAll(on ? '.rspg, .rscust' : '.rsl, .rsr, .rspg, .rscust')
            .forEach(e => e.animate(F, { duration: 200, easing: 'ease-out' }));
        };
      if (!on || !animOn()) return go();
      const out = [...box.querySelectorAll('.rsl, .rsr')].map(e =>
        e.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: 'ease-in', fill: 'forwards' })
      );
      out[0].onfinish = go;
      return;
    }
    if (act == 'rexp') return rulesExport();
    if (act == 'rimp') return rulesImport();
    if (act == 'rreset')
      return modal(
        'Reset to default',
        `<p>All the ${SRC() == 'sq' ? 'rules of the squadron' : 'rules on this PC'} go back to the defaults of the program.</p>`,
        [
          { a: 'ok', label: 'Reset to default', rd: 1 },
          { a: 'no', label: 'Cancel', g: 1 },
        ],
        a => a == 'ok' && rulesSave({})
      );

    if (act == 'fold') {
      const S = CLOSED(),
        K = sopAll().map(([ph, , , cid]) => (cid ? 'c:' + cid : 'p:' + ph)),
        shut = K.some(k => !S.has(k)), // one open: fold them all
        open0 = [...box.querySelectorAll('.rsk.php:not(.shut) .rsbd, .rscust .rsk:not(.shut) .rsbd')];
      K.forEach(k => (shut ? S.add(k) : S.delete(k)));
      LS.set(CKEY, [...S]);
      if (shut) return collapse(open0, render);
      const was = new Set(open0.map(b => b.closest('.rsk').dataset.k));
      render();
      expand(
        [...box.querySelectorAll('.rsk.php .rsbd, .rscust .rsk .rsbd')].filter(
          b => !was.has(b.closest('.rsk').dataset.k)
        )
      );
      return;
    }
    if (act == 'newsec') return editSection(null);
    if (act == 'psave' || act == 'pnew') {
      const nm = box.querySelector('.rsname'),
        name = ((nm && nm.value) || '').trim(),
        c = R.pick && chipOf(R.pick);
      if (act == 'psave' && c && c.std) {
        savePick(c, R.open ? name : c.name); // opened: renamed too; else its choices only
        return render();
      }
      if (!name) {
        if (nm) {
          nm.focus();
          nm.classList.add('err');
        }
        return;
      }
      if (act == 'psave' && c && c.ed) savePick(c, name, R.cats);
      else return saveNew(name, R.cats, () => render());
      return render();
    }
    if (act == 'pdisc') {
      setSel(R.baseSel || emptySel(), false);
      R.base = key(R.sel);
      R.open = false;
      return render();
    }
  };
  box.onchange = e => {
    if (e.target.matches('.rlv, .rlt')) return rulesValue(e.target);
    if (e.target.matches('.rlph')) {
      R.rph = e.target.value;
      return render();
    }
    if (e.target.classList.contains('rpfr')) {
      R.sel[e.target.dataset.f] = e.target.value.replace(/\r/g, '');
      limitText(e.target);
      return render();
    }
    if (e.target.closest('.rpr')) render();
  };
  box.oninput = e => {
    if (e.target.classList.contains('rpi')) {
      const id = e.target.closest('.rpr').dataset.t;
      R.sel.sop[id] = {
        o: null,
        t: e.target.value.slice(0, 120),
        c: R.sel.sop[id] ? R.sel.sop[id].c : false,
        s: R.sel.sop[id] ? R.sel.sop[id].s : false,
      };
      const cb = e.target.closest('.rpr').querySelector('.rptg[data-tg=c]');
      cb.disabled = !e.target.value.trim() || !(R.sel.sop[id].c || boxFits(sopWith(id))); // an own text can go on the card once it is written
      pvPaint(box.querySelector('.rpv2'), sopText(R.sel));
    } else if (e.target.classList.contains('rpnm')) {
      e.target.classList.remove('err');
      if (e.target.classList.contains('rsname')) R.name = e.target.value;
    }
  };
}
// the other lines count in the box too: what is beyond the limit is cut, with a word
function limitText(ta) {
  const f = ta.dataset.f,
    txt = () => (f == 'free' ? roeText(R.sel) : sopText(R.sel)),
    L = R.sel[f].split('\n').filter(l => l.trim()),
    n = L.length;
  while (L.length && !boxFits(txt())) {
    L.pop();
    R.sel[f] = L.join('\n');
  }
  if (L.length < n)
    appToast(
      `The ${f == 'free' ? 'ROE' : 'SOP'} box of the card is full: the last ${n - L.length} line${n - L.length == 1 ? ' was' : 's were'} left out.`,
      true
    );
}
// a flight just chosen gets its default by itself: the preset marked "Default for" its kind of mission (the list of the button chosen wins: Squadron or
// Flight), else the Standard; what the pilot changed on that flight stays (the hand changes come back over it)
let LASTCAT = '';
export function roeAuto(f) {
  if (!ST.C || !f) return;
  syncCustom();
  LASTCAT = categoryOf(ST.C.D.S[300 + f.omis] || '');
  const Q = sqGet('roePresets', []),
    d = pickDefault({
      sq: Q,
      mine: presetsLoad(),
      myStd: myStd(),
      src: Q.length ? (ST.MSQ ? 'sq' : LS.get('bmsroesrc', 'sq')) : 'me', // a mission received from another pilot: the squadron's, always
      cat: LASTCAT,
    });
  if (!d) return;
  F.roesel = JSON.stringify(d.sel);
  F.roe = roeText(d.sel);
  F.sop = sopText(d.sel);
}
export const roeRefresh = () => {
  if (R.box && R.flightKey !== ST.CURK) {
    loadFlight();
    render();
  }
};
