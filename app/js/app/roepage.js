// Squadron > ROE / SOP: the page of the rules of engagement and of the SOP. The section Presets: two buttons, Flight (my presets) and Squadron (the
// presets of the squadron, the commander changes them); the first of each list is the Standard (the squadron's, or mine without a squadron). A click on a
// preset puts it on the datacard of the flight; what is changed by hand goes on the datacard at once and can be kept as a preset (a name, the kinds of
// mission it is the default of). A flight just chosen gets its default by itself (the list of the button chosen wins). The datacard gets the short form:
// 5 lines a box (ROE one rule a line, SOP one line a phase). The custom sections (mine on this PC, the squadron's by the commander) join the SOP.
// "Add card" puts the whole text on Kneeboard cards. A click on the ROE or SOP box of the datacard opens this page.
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
  BOX_MAX,
  sopPhaseOn,
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
import { esc, appToast, animOn } from './base.js';
import { draw } from './cardview.js';
import { markMan } from './selection.js';
import { sqPage } from './pages.js';
import { kbAddPic } from './kneeboard.js';
import { roeCardPlan, roeCardDraw, CARD_W, CARD_H } from './roecard.js';

// ---- what stays on this PC: my presets, my custom sections, the last choices, the sections closed, "the first Apply was asked"
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
export const presetsLoad = () => cleanPresets(LS.get('bmsroepre', []));
const presetsSave = P => LS.set('bmsroepre', cleanPresets(P));
// my Standard (without a squadron, or a squadron with no Standard yet); the first time, my first preset
const myStd = () => {
  const v = LS.get('bmsroestd', null);
  if (v) return cleanSel(v);
  const P = presetsLoad();
  return P.length ? P[0].sel : emptySel();
};
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
}
// lines typed by hand in a box that the choices did not write: they come back as its other lines
const handLines = (typed, made) => {
  const M = made ? made.split('\n') : [];
  return String(typed || '')
    .split('\n')
    .filter(l => l.trim() && !M.includes(l))
    .join('\n');
};
const lines = t => (t ? t.split('\n').filter(l => l.trim()).length : 0);
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
};
const key = s => JSON.stringify(cleanSel(s));
const setSel = (s, kept = true) => {
  R.sel = cleanSel(s);
  R.cust = new Set(Object.keys(R.sel.sop).filter(k => R.sel.sop[k].t));
  if (kept) R.base = key(R.sel);
};
const dirty = () => key(R.sel) != R.base;
// the list shown: Flight (mine) or Squadron (the squadron's); without a squadron, mine only
const inSq = () => !!R.ctx.squad;
const SRC = () => (inSq() && LS.get('bmsroesrc', 'sq') == 'sq' ? 'sq' : 'me');
const sqStdI = () => R.ctx.presets.findIndex(p => p.std);
// the Standard: the squadron's when it has one, else mine
const stdSel = () => (sqStdI() >= 0 ? R.ctx.presets[sqStdI()].sel : myStd());
// the presets of a list: [{k, name, sel, cats, ed (can be changed here), std}]
function chips(src) {
  const sqs = sqStdI() >= 0,
    L = [{ k: 'std', name: 'Standard', sel: stdSel(), cats: [], std: 1, ed: src == 'sq' ? R.ctx.own : !sqs }];
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
  R.name = c && !c.std ? c.name : '';
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
  setSel(flightSel(), false);
  R.wrote = key(R.sel);
  matchPick();
}
// the squadron calls this when the page is drawn: the page is drawn again only when something it shows changed
export function roeDraw(box, ctx) {
  const sig = JSON.stringify([ctx.squad, ctx.own, ctx.presets, ctx.sections]);
  R.ctx = ctx;
  syncCustom();
  if (ST.CURK !== R.flightKey || !R.box) loadFlight();
  if (box !== R.box || sig !== R.sig || !box.firstChild) {
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
    if (SRC() == 'sq' || sqStdI() >= 0) {
      if (!R.ctx.own) return false;
      const L = R.ctx.presets.slice(),
        i = sqStdI();
      if (i >= 0) L[i] = { ...L[i], sel };
      else L.unshift({ name: 'Standard', sel, cats: [], std: true });
      R.base = key(sel);
      R.ctx.save(L);
      appToast('Standard of the squadron saved and sent.');
    } else {
      LS.set('bmsroestd', sel);
      R.base = key(sel);
      appToast('Standard saved: every new flight starts from it.');
    }
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
  document.addEventListener(
    'click',
    e => {
      const t = e.target.closest && e.target.closest('.tab[data-t], #sqtabs button, #sqroe [data-a=back]');
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
  try {
    render0(box);
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
const card = (k, title, hint, body, extra = '') => {
  const shut = CLOSED().has(k);
  return `<div class="wcard rsk${shut ? ' shut' : ''}" data-k="${esc(k)}"><div class="wh rsh" title="Click to fold or unfold"><i class="rsar">${shut ? '▸' : '▾'}</i><h3>${title}</h3><span class="hint">${hint}</span>${extra}</div><div class="rsbd">${body}</div></div>`;
};
function counts() {
  return { r: lines(roeText(R.sel)), s: lines(sopText(R.sel)) };
}
function render0(box) {
  if (flightOn() && key(R.sel) !== R.wrote) writeCard(); // every change goes on the datacard of the flight at once
  const st = [...box.querySelectorAll('.rsc')].map(c => c.scrollTop),
    { own, squad, sections: SQS } = R.ctx,
    MY = mySecs(),
    { r: nR, s: nS } = counts(),
    fullR = nR >= BOX_MAX,
    fullS = nS >= BOX_MAX;
  const chip = (id, kind, [v, long, short]) => {
    const on = kind == 'many' ? R.sel.roe[id].includes(v) : R.sel.roe[id] === v,
      off = !on && fullR && (kind == 'many' || !R.sel.roe[id]);
    return `<button type="button" class="rpk${on ? ' on' : ''}${off ? ' off' : ''}" data-r="${id}" data-v="${v}" title="${esc(long)}"${off ? ' disabled' : ''}>${esc(short)}</button>`;
  };
  const roeCard = card(
    'roe',
    'ROE',
    `one rule a line on the card · ${BOX_MAX} lines at most`,
    `${ROE.map(
      ([id, lab, kind, , opts]) =>
        `<div class="rpt rg">${esc(lab)}<small>${kind == 'many' ? 'one or more' : 'one'}</small></div><div class="rpo">${opts.map(o => chip(id, kind, o)).join('')}</div>`
    ).join(
      ''
    )}<div class="rpt rg">Other ROE lines<small>one a line, they count too</small></div><textarea class="rpfr" data-f="free" rows="2" maxlength="600" placeholder="Written in the ROE box as they are">${esc(R.sel.free)}</textarea>`
  );
  const row = t => {
    const [id, lab, , opts] = t,
      v = R.sel.sop[id] || { o: null, t: '', c: false },
      cust = !!v.t || R.cust.has(id),
      long = cust ? '' : (opts.find(x => x[0] === v.o) || [])[1] || '',
      set = !!(v.o || v.t),
      cOff = !set || (fullS && !v.c && !sopPhaseOn(R.sel, id)); // a topic of a phase already on the card does not add a line
    return `<div class="rpr${set ? ' set' : ''}" data-t="${id}"><span class="rpn">${esc(lab)}</span><select aria-label="${esc(lab)}"><option value="">—</option>${opts
      .map(([x, , sh]) => `<option value="${x}"${!cust && v.o === x ? ' selected' : ''}>${esc(sh)}</option>`)
      .join(
        ''
      )}<option value="*"${cust ? ' selected' : ''}>Own text…</option></select><label class="rpon" title="${cOff && set ? 'The SOP box of the card is full' : 'Write this topic in the SOP box of the card (short form)'}"><input type="checkbox"${v.c ? ' checked' : ''}${cOff ? ' disabled' : ''}> card</label><div class="rpd">${cust ? `<input type="text" class="rpi" maxlength="120" value="${esc(v.t)}" placeholder="Short text for the card">` : esc(long)}</div></div>`;
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
      ed ? `<button type="button" class="rsed" data-sec="${esc(cid)}" title="Edit this section">✎</button>` : ''
    );
  };
  const ALL = sopAll().filter(([, T]) => !only || T.some(t => R.sel.sop[t[0]])),
    custom = ALL.filter(x => x[3]).map(phaseCard),
    phases = ALL.filter(x => !x[3]).map(phaseCard),
    cols = L =>
      `<div class="rspg"><div class="rsg">${L.slice(0, Math.ceil(L.length / 2)).join('')}</div><div class="rsg">${L.slice(Math.ceil(L.length / 2)).join('')}</div></div>`; // in the order of the flight: down the left column, then the right one
  const tools = `<div class="rstool"><div class="seg rsonly" role="group" aria-label="Show"><button type="button" data-only="0" class="${only ? '' : 'on'}">All topics</button><button type="button" data-only="1" class="${only ? 'on' : ''}" title="Only the topics chosen: your SOP at a glance">Chosen only</button></div><span style="flex:1"></span><button type="button" class="btn g" data-a="foldall" title="Fold every SOP section">Fold all</button><button type="button" class="btn g" data-a="unfoldall" title="Unfold every SOP section">Unfold all</button></div>`;
  const customBlock = `<div class="rscust"><div class="rsct"><h3>Custom sections</h3><span class="hint">yours on this PC${own ? ', or of the squadron' : ''}</span><span style="flex:1"></span><button type="button" class="btn g" data-a="newsec" title="A section of your own (on this PC${own ? ', or for the squadron' : ''}) with its topics and options">＋ Custom section</button></div>${custom.length ? cols(custom) : ''}</div>`;
  const src = SRC(),
    C = chips(src),
    cur = R.pick ? C.find(c => c.k == R.pick) : null,
    chg = dirty(),
    cs = F.cs || (ST.CL && ST.CL.length ? 'flight' : '');
  const pchip = c => {
    const on = c.k == R.pick,
      tip = c.std
        ? `The Standard${sqStdI() >= 0 ? ' of the squadron' : ''}: every flight starts from it${c.ed ? '' : ' (only the commander changes it)'}`
        : c.cats.length
          ? 'Default for ' + c.cats.join(', ')
          : 'Default for no kind of mission';
    return `<span class="rpq${src == 'sq' ? ' sq' : ''}${on ? ' on' : ''}${c.std ? ' std' : ''}" data-k="${c.k}" title="${esc(tip)}">${c.std ? '<i class="rpst">STANDARD</i>' : esc(c.name)}${on && chg ? '<i class="rpdot" title="Changed by hand"></i>' : ''}${c.std && !c.ed ? '<i class="rplk" title="Locked">🔒</i>' : ''}${!c.std && c.ed ? `<b data-del="${c.k}" title="Delete this preset">×</b>` : ''}</span>`;
  };
  const who = !flightOn()
    ? 'Pick a flight in the ATO (Datacard): a preset clicked here goes on its datacard.'
    : `Flight <b>${esc(cs)}</b>${LASTCAT ? ' (' + esc(LASTCAT) + ')' : ''} · ${src == 'sq' ? "the datacard gets the squadron's selection" : inSq() ? "the datacard gets this selection, the squadron's is ignored" : 'the datacard gets this selection'}`;
  const upd = cur && cur.ed,
    showEd = chg || (R.open && cur && cur.ed);
  const edit = showEd
    ? `<div class="rsedit">${chg ? `<div class="rsdirty">${flightOn() ? 'Changed by hand: already on the datacard.' : 'Changed: in no preset yet.'} Keep it as a preset?</div>` : ''}${
        cur && cur.std && !canNew()
          ? ''
          : `<div class="rpt">Name</div><input type="text" class="rpnm rsname" maxlength="40" value="${esc(R.name)}" placeholder="Name of the preset"><div class="rpt">Default for<small>flights of these kinds of mission get it by themselves</small></div><div class="rpo">${ROE_CATS.map(c => `<button type="button" class="rpk rpcat${R.cats.includes(c) ? ' on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>`
      }<div class="rsbar">${upd ? `<button type="button" class="btn${src == 'sq' ? ' rsb' : ''}" data-a="psave">${cur.std ? 'Save Standard' : 'Save "' + esc(cur.name) + '"'}${src == 'sq' ? ' &amp; send' : ''}</button>` : ''}${canNew() ? `<button type="button" class="btn g" data-a="pnew">Save as new</button>` : ''}${chg ? '<button type="button" class="btn g" data-a="pdisc">Discard</button>' : ''}</div>${
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
        ? `<div class="seg rssrc" role="group" aria-label="Presets of"><button type="button" data-src="me" class="${src == 'me' ? 'on' : ''}">✈ Flight</button><button type="button" data-src="sq" class="${src == 'sq' ? 'on sq' : ''}">⛨ Squadron</button></div>`
        : ''
    }<div class="rswho">${who}</div><div class="rpqs">${C.map(pchip).join('')}</div><div class="hint">A click puts a preset on the datacard${cur && cur.ed && !chg ? '; a click on the one chosen to rename it or change its Default for' : ''}.</div>${edit}`
  );
  const warn = [fullR ? 'ROE box full' : '', fullS ? 'SOP box full' : ''].filter(Boolean);
  const cardCard = card(
    'card',
    'Preview',
    'Datacard · MDC',
    `<div class="rscard"><div class="h">ROE</div><div class="h">SOP</div><div class="b rpv1"></div><div class="b rpv2"></div></div><div class="rscnt"><span>ROE <b class="${fullR ? 'full' : ''}">${nR}/${BOX_MAX}</b></span><span>SOP <b class="${fullS ? 'full' : ''}">${nS}/${BOX_MAX}</b> (one line a phase)</span></div>${
      warn.length
        ? `<div class="rswarn">${warn.join(', ')} (${BOX_MAX} lines): take a line away to add another one.</div>`
        : ''
    }<div class="rsbar"><button type="button" class="btn g rd" data-a="clear" title="Take every choice away">Clear</button><button type="button" class="btn g" data-a="kb" title="A Kneeboard card with the whole ROE and SOP, not shortened">Add card</button><span style="flex:1"></span><button type="button" class="btn g" data-a="back" title="The Datacard">Back to the datacard</button></div>`
  );
  const other = card(
    'other',
    'Other SOP lines',
    'one a line, they count too',
    `<textarea class="rpfr" data-f="sfree" rows="2" maxlength="600" placeholder="Written in the SOP box as they are">${esc(R.sel.sfree)}</textarea>`
  );
  box.innerHTML = `<div class="rsq"><div class="rsc rsl">${presetCard}${cardCard}</div><div class="rsc">${roeCard}</div><div class="rsc rss">${tools}${customBlock}${cols(phases)}${other}</div></div>`; // the custom sections above the standard ones; Other SOP lines right under the phases (folded or not)
  box.querySelectorAll('.rsc').forEach((c, i) => (c.scrollTop = st[i] || 0));
  box.querySelector('.rpv1').textContent = roeText(R.sel);
  box.querySelector('.rpv2').textContent = sopText(R.sel);
  wire(box);
}
// the datacard of the flight: the two boxes and the choices (no word: every change goes there at once)
function writeCard() {
  const t1 = roeText(R.sel),
    t2 = sopText(R.sel);
  setField('roesel', JSON.stringify(cleanSel(R.sel)));
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
  R.wrote = key(R.sel);
}
// Add card: the whole text on Kneeboard cards (two when one is not enough: ROE and SOP apart, the pilot is told first)
async function addCards() {
  const c = document.createElement('canvas');
  c.width = CARD_W;
  c.height = CARD_H;
  const x = c.getContext('2d'),
    plan = roeCardPlan(R.sel, x);
  if (!plan.length) return appToast('Nothing chosen yet: no card to add.');
  const c0 = R.pick && !dirty() && chipOf(R.pick),
    sub = F.cs && flightOn() ? 'Flight ' + F.cs : c0 ? (c0.std ? 'Standard' : c0.name) : '',
    go = async () => {
      for (const p of plan) {
        roeCardDraw(p, x, sub);
        const blob = await new Promise(r => c.toBlob(r, 'image/png'));
        await kbAddPic(blob, p.title + (sub ? ' · ' + sub : ''));
      }
      appToast(
        plan.length == 1 ? 'ROE / SOP card added to the Kneeboard.' : 'Two ROE / SOP cards added to the Kneeboard.'
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
  const topicRow = t =>
    `<div class="rstp"><input type="text" class="rstl" maxlength="40" placeholder="Topic (e.g. Strobe in the pattern)" value="${esc(t.label || '')}"><input type="text" class="rstt" maxlength="10" placeholder="Word on the card" value="${esc(t.tag || '')}"><button type="button" class="btn g rd" data-tdel="1" title="Remove this topic">×</button><textarea class="rsto" rows="3" placeholder="One option a line: SHORT = full text&#10;FLASH TAXI = Strobe flash while taxiing">${esc(optsToText(t.opts))}</textarea></div>`;
  const p = modal(
    old ? 'Custom section' : 'New custom section',
    `<div class="rsfm"><label>Name<input type="text" class="rssn" maxlength="40" value="${esc(s.name)}" placeholder="e.g. Range procedures"></label><label>Tag on the card<input type="text" class="rsst" maxlength="8" value="${esc(s.tag)}" placeholder="e.g. RNG"></label>${
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
    } else if (e.target.closest('[data-tdel]')) e.target.closest('.rstp').remove();
  });
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
    const ob = e.target.closest('[data-only]');
    if (ob) {
      LS.set('bmsroeonly', ob.dataset.only == '1');
      return render();
    }
    if (fold && !e.target.closest('button')) {
      const c = fold.closest('.rsk'),
        kk = c.dataset.k,
        S = CLOSED();
      const shut = !c.classList.contains('shut');
      if (shut) S.add(kk);
      else S.delete(kk);
      LS.set(CKEY, [...S]);
      c.classList.toggle('shut', shut);
      fold.querySelector('.rsar').textContent = shut ? '▸' : '▾';
      if (!shut && animOn()) c.querySelector('.rsbd').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
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
      if (kk == R.pick && !dirty()) {
        R.open = !R.open && c.ed && !c.std; // the one chosen: its name and Default for
        return render();
      }
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
    if (act == 'clear') {
      setSel(emptySel(), false);
      return render();
    }
    if (act == 'back') {
      const t = document.querySelector('[data-t=dc]');
      if (t) t.click();
      return;
    }
    if (act == 'kb') return addCards();
    if (act == 'foldall' || act == 'unfoldall') {
      const S = CLOSED(),
        K = [...box.querySelectorAll('.rss .rsk')].map(c => c.dataset.k).filter(k => k != 'other');
      K.forEach(k => (act == 'foldall' ? S.add(k) : S.delete(k)));
      LS.set(CKEY, [...S]);
      return render();
    }
    if (act == 'newsec') return editSection(null);
    if (act == 'psave' || act == 'pnew') {
      const nm = box.querySelector('.rsname'),
        name = ((nm && nm.value) || '').trim(),
        c = R.pick && chipOf(R.pick);
      if (act == 'psave' && c && c.std) {
        savePick(c);
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
    if (e.target.classList.contains('rpfr')) {
      R.sel[e.target.dataset.f] = e.target.value.replace(/\r/g, '');
      limitText(e.target);
      return render();
    }
    const r = e.target.closest('.rpr');
    if (!r) return;
    const id = r.dataset.t,
      t = topicsAll().find(x => x[0] == id),
      v = R.sel.sop[id] || { o: null, t: '', c: false },
      room = lines(sopText(R.sel)) < BOX_MAX || sopPhaseOn(R.sel, id);
    if (e.target.tagName == 'SELECT') {
      const x = e.target.value;
      R.cust.delete(id);
      if (!x) delete R.sel.sop[id];
      else if (x == '*') {
        R.cust.add(id);
        R.sel.sop[id] = { o: null, t: v.t || sopShort(t, v) || '', c: v.c };
      } else R.sel.sop[id] = { o: x, t: '', c: v.c }; // the tick "card" is the pilot's choice: off for a topic just chosen
    } else if (e.target.type == 'checkbox') {
      if (R.sel.sop[id]) R.sel.sop[id].c = e.target.checked && (room || R.sel.sop[id].c);
    }
    render();
    if (e.target.tagName == 'SELECT' && e.target.value == '*') {
      const i = R.box.querySelector(`.rpr[data-t="${id}"] .rpi`);
      if (i) i.focus();
    }
  };
  box.oninput = e => {
    if (e.target.classList.contains('rpi')) {
      const id = e.target.closest('.rpr').dataset.t;
      R.sel.sop[id] = { o: null, t: e.target.value.slice(0, 120), c: R.sel.sop[id] ? R.sel.sop[id].c : false };
      const cb = e.target.closest('.rpr').querySelector('.rpon input'),
        room = lines(sopText(R.sel)) < BOX_MAX || sopPhaseOn(R.sel, id) || R.sel.sop[id].c;
      cb.disabled = !e.target.value.trim() || !room; // an own text can go on the card once it is written
      box.querySelector('.rpv2').textContent = sopText(R.sel);
    } else if (e.target.classList.contains('rpnm')) {
      e.target.classList.remove('err');
      if (e.target.classList.contains('rsname')) R.name = e.target.value;
    }
  };
}
// the other lines count in the box too: what is beyond the limit is cut, with a word
function limitText(ta) {
  const f = ta.dataset.f,
    other = f == 'free' ? lines(roeText({ ...R.sel, free: '' })) : lines(sopText({ ...R.sel, sfree: '' })),
    L = R.sel[f].split('\n').filter(l => l.trim()),
    room = Math.max(0, BOX_MAX - other);
  if (L.length > room) {
    R.sel[f] = L.slice(0, room).join('\n');
    appToast(
      `The ${f == 'free' ? 'ROE' : 'SOP'} box holds ${BOX_MAX} lines: the last ${L.length - room} line${L.length - room == 1 ? ' was' : 's were'} left out.`
    );
  }
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
      myStd: LS.get('bmsroestd', null) || (presetsLoad()[0] || {}).sel || null,
      src: Q.length ? LS.get('bmsroesrc', 'sq') : 'me',
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
