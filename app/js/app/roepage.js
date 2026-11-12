// Squadron > ROE / SOP: the page of the rules of engagement and of the SOP of the squadron. What is edited: the ROE / SOP of the flight on the card,
// or (the commander) a preset of the squadron. The presets of the squadron and the personal ones (this PC) can be combined and copied from one to the
// other. The card gets the short form: 5 lines a box (ROE one rule a line, SOP one line a phase). The custom sections (mine on this PC, the squadron's
// by the commander) join the SOP. "Add card" puts the whole text on a Kneeboard card. A click on the ROE or SOP box of the card opens this page.
import {
  ROE,
  ROE_CATS,
  emptySel,
  cleanSel,
  mergeSel,
  roeText,
  sopText,
  cleanPresets,
  sopShort,
  defaultFor,
  BOX_MAX,
  capSel,
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
// the choices of the flight on the card: F.roesel, with the lines typed by hand on the card; a flight with nothing yet starts from the last choices
function flightSel() {
  let s;
  try {
    s = cleanSel(JSON.parse(F.roesel || 'null'));
  } catch (e) {
    s = emptySel();
  }
  if (!F.roesel && !F.roe && !F.sop) return cleanSel(LS.get('bmsroelast', null));
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
  mode: 'flight', // 'flight' | 'new' | the index of a squadron preset (the commander)
  sel: emptySel(),
  base: '', // the choices as last kept (a preset saved, the card written, a preset loaded): different = unsaved
  name: '',
  cats: [],
  on: new Set(), // the presets combined: 'q0' (squadron), 'm0' (mine)
  cust: new Set(), // the SOP topics written with an own text
  flightKey: null,
};
const key = s => JSON.stringify(cleanSel(s));
const setSel = (s, kept = true) => {
  R.sel = cleanSel(s);
  R.cust = new Set(Object.keys(R.sel.sop).filter(k => R.sel.sop[k].t));
  if (kept) R.base = key(R.sel);
};
const dirty = () => key(R.sel) != R.base && (R.mode !== 'flight' || key(R.sel) != key(emptySel()));
// the squadron calls this when the page is drawn: the page is drawn again only when something it shows changed
export function roeDraw(box, ctx) {
  const sig = JSON.stringify([ctx.squad, ctx.own, ctx.presets, ctx.sections]);
  R.ctx = ctx;
  syncCustom();
  if (typeof R.mode == 'number' && !ctx.presets[R.mode]) R.mode = 'flight';
  if (!ctx.own && R.mode !== 'flight') R.mode = 'flight';
  if (R.mode === 'flight' && ST.CURK !== R.flightKey) {
    R.flightKey = ST.CURK;
    setSel(flightSel());
    R.on = new Set();
  }
  if (box !== R.box || sig !== R.sig || !box.firstChild) {
    R.box = box;
    R.sig = sig;
    render();
  }
  leaveGuard();
}
// the ROE or SOP box of the card was clicked: this page, on the flight
export function roeGo() {
  syncCustom();
  R.mode = 'flight';
  R.flightKey = ST.CURK;
  setSel(flightSel());
  R.on = new Set();
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
// my presets: keep the choices of now under a name (the same name is replaced)
function savePreset(name) {
  const P = presetsLoad(),
    i = P.findIndex(x => x.name.toLowerCase() == name.toLowerCase());
  if (i >= 0) P[i] = { name, sel: cleanSel(R.sel) };
  else P.push({ name, sel: cleanSel(R.sel) });
  presetsSave(P);
  if (R.mode === 'flight') R.base = key(R.sel);
  appToast('Preset "' + name + '" kept on this PC.');
}
// leaving the page (another tab, Back to the card) with choices not kept: save them first?
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
      modal(
        'Unsaved choices',
        `<p>The choices on this page are not kept in a preset${R.mode === 'flight' ? ' nor written on the card' : ''}.</p>${R.mode === 'flight' ? '<input type="text" class="rpnm rslv" maxlength="40" placeholder="Name of the preset" value="My SOP">' : ''}`,
        [
          ...(R.mode === 'flight'
            ? [{ a: 'save', label: 'Save as preset and go' }]
            : [{ a: 'psave', label: 'Save the preset and go' }]),
          { a: 'go', label: 'Leave anyway', g: 1, rd: 1 },
          { a: 'stay', label: 'Stay', g: 1 },
        ],
        (a, p) => {
          if (a == 'stay') return;
          if (a == 'save') {
            const n = p.querySelector('.rslv').value.trim();
            if (!n) return false;
            savePreset(n);
          }
          if (a == 'psave' && !savePsq()) return;
          if (a == 'go') R.base = key(R.sel);
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
  if (R.mode === 'flight') LS.set('bmsroelast', cleanSel(R.sel)); // the last choices: a flight with nothing yet starts from them
  const st = [...box.querySelectorAll('.rsc')].map(c => c.scrollTop),
    { own, presets: Q, squad, sections: SQS } = R.ctx,
    P = presetsLoad(),
    MY = mySecs(),
    edit = R.mode !== 'flight',
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
  const pchip = (k, name, title, extra) =>
    `<span class="rpq${R.on.has(k) ? ' on' : ''}${k[0] == 'q' ? ' sq' : ''}" data-k="${k}" title="${esc(title)}">${esc(name)}${extra}</span>`;
  const cs = F.cs || (ST.CL && ST.CL.length ? 'flight' : '');
  const editCard = card(
    'edit',
    'Editing',
    squad ? esc(squad) : '',
    `${
      own
        ? `<select class="rsmode" aria-label="What is edited"><option value="flight"${R.mode === 'flight' ? ' selected' : ''}>Flight${cs ? ' · ' + esc(cs) : ''} (the card)</option>${Q.map((q, i) => `<option value="${i}"${R.mode === i ? ' selected' : ''}>Squadron preset · ${esc(q.name)}</option>`).join('')}<option value="new"${R.mode === 'new' ? ' selected' : ''}>＋ New squadron preset (from the choices of now)</option></select>`
        : `<div class="rsflt">Flight${cs ? ' · <b>' + esc(cs) + '</b>' : ''} (the card)</div>`
    }${
      edit
        ? `<div class="rpt">Name</div><input type="text" class="rpnm rsname" maxlength="40" value="${esc(R.name)}" placeholder="Name of the preset"><div class="rpt">Default for<small>flights of these kinds of mission get it by themselves</small></div><div class="rpo">${ROE_CATS.map(c => `<button type="button" class="rpk rpcat${R.cats.includes(c) ? ' on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>`
        : `<div class="hint" style="margin-top:6px">${flightOn() ? 'The choices go on the card of this flight with Apply to card.' : 'Pick a flight in the ATO (Datacard) to write on its card; the presets can be made anyway.'}${own ? ' Choose a squadron preset above to edit it.' : ''}</div>`
    }`
  );
  const presetCard = card(
    'presets',
    'Presets',
    'several together',
    `${
      Q.length
        ? `<div class="rpl">Squadron</div><div>${Q.map((q, i) => pchip('q' + i, q.name, 'Preset of the squadron (set by the commander)' + (q.cats.length ? ': default for ' + q.cats.join(', ') : ''), `<b data-cp="q${i}" title="Copy to my presets">→ME</b>`)).join('')}</div>`
        : ''
    }<div class="rpl">Mine</div><div>${
      P.length
        ? P.map((q, i) =>
            pchip(
              'm' + i,
              q.name,
              'Your preset, on this PC',
              `${own ? `<b data-cp="m${i}" title="Copy to the presets of the squadron">→SQ</b>` : ''}<b data-del="${i}" title="Delete this preset">×</b>`
            )
          ).join('')
        : '<span class="hint" style="min-height:0">none yet: make your choices, then Save as preset</span>'
    }</div><div class="rssv"><input type="text" class="rpnm" maxlength="40" placeholder="Name"><button type="button" class="btn g" data-a="save" title="Keep the choices of now as a preset on this PC">Save as preset</button></div>`
  );
  const warn = [fullR ? 'ROE box full' : '', fullS ? 'SOP box full' : ''].filter(Boolean);
  const cardCard = card(
    'card',
    edit ? 'Preview' : 'On the card',
    'Datacard · MDC',
    `<div class="rscard"><div class="h">ROE</div><div class="h">SOP</div><div class="b rpv1"></div><div class="b rpv2"></div></div><div class="rscnt"><span>ROE <b class="${fullR ? 'full' : ''}">${nR}/${BOX_MAX}</b></span><span>SOP <b class="${fullS ? 'full' : ''}">${nS}/${BOX_MAX}</b> (one line a phase)</span></div>${
      warn.length
        ? `<div class="rswarn">${warn.join(', ')} (${BOX_MAX} lines): take a line away to add another one.</div>`
        : ''
    }${
      dirty()
        ? `<div class="rsdirty">${edit ? 'This squadron preset is not saved: Save preset.' : 'Unsaved choices: Save as preset (or Apply to card), so they are not lost.'}</div>`
        : ''
    }<div class="rsbar"><button type="button" class="btn g rd" data-a="clear" title="Take every choice away">Clear</button><button type="button" class="btn g" data-a="kb" title="A Kneeboard card with the whole ROE and SOP, not shortened">Add card</button><span style="flex:1"></span>${
      edit
        ? `${typeof R.mode == 'number' ? `<button type="button" class="btn g" data-a="up" title="Move up in the list"${R.mode ? '' : ' disabled'}>↑</button><button type="button" class="btn g rd" data-a="del">Delete</button>` : ''}<button type="button" class="btn" data-a="psave" title="Keep the preset and send it to the squadron">Save preset</button>`
        : `<button type="button" class="btn g" data-a="back" title="The Datacard">Back to the card</button><button type="button" class="btn" data-a="apply" title="Write ROE and SOP on the card of the flight"${flightOn() ? '' : ' disabled'}>Apply to card</button>`
    }</div>`
  );
  const other = card(
    'other',
    'Other SOP lines',
    'one a line, they count too',
    `<textarea class="rpfr" data-f="sfree" rows="2" maxlength="600" placeholder="Written in the SOP box as they are">${esc(R.sel.sfree)}</textarea>`
  );
  box.innerHTML = `<div class="rsq"><div class="rsc rsl">${editCard}${presetCard}${cardCard}</div><div class="rsc">${roeCard}</div><div class="rsc rss">${tools}${customBlock}${cols(phases)}${other}</div></div>`; // the custom sections above the standard ones; Other SOP lines right under the phases (folded or not)
  box.querySelectorAll('.rsc').forEach((c, i) => (c.scrollTop = st[i] || 0));
  box.querySelector('.rpv1').textContent = roeText(R.sel);
  box.querySelector('.rpv2').textContent = sopText(R.sel);
  wire(box);
}
function fromPresets() {
  const Q = R.ctx.presets,
    P = presetsLoad();
  // the boxes hold BOX_MAX lines: what is beyond is cut (the last ones)
  setSel(
    capSel(
      mergeSel(
        [...R.on]
          .sort((a, b) => (a[0] == b[0] ? +a.slice(1) - +b.slice(1) : a[0] == 'q' ? -1 : 1)) // the squadron first, then mine
          .map(k => (k[0] == 'q' ? Q : P)[+k.slice(1)])
          .filter(Boolean)
          .map(x => x.sel)
      )
    ),
    R.mode === 'flight'
  );
  render();
}
// the squadron preset of now: saved and sent (false when it has no name)
function savePsq() {
  const nm = R.box && R.box.querySelector('.rsname'),
    name = ((nm && nm.value) || R.name || '').trim();
  if (!name) {
    if (nm) {
      nm.focus();
      nm.classList.add('err');
    }
    return false;
  }
  const L = R.ctx.presets.slice(),
    p = { name, sel: cleanSel(R.sel), cats: R.cats };
  if (typeof R.mode == 'number') L[R.mode] = p;
  else {
    L.push(p);
    R.mode = L.length - 1;
  }
  R.name = name;
  R.base = key(R.sel);
  R.ctx.save(L);
  appToast('Squadron preset "' + name + '" saved and sent to the squadron.');
  return true;
}
// the card of the flight: the two boxes and the choices
function applyCard() {
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
  R.base = key(R.sel);
  appToast('ROE and SOP written on the card' + (F.cs ? ' of ' + F.cs : '') + '.');
  render();
}
// Add card: the whole text on Kneeboard cards (two when one is not enough: ROE and SOP apart, the pilot is told first)
async function addCards() {
  const c = document.createElement('canvas');
  c.width = CARD_W;
  c.height = CARD_H;
  const x = c.getContext('2d'),
    plan = roeCardPlan(R.sel, x);
  if (!plan.length) return appToast('Nothing chosen yet: no card to add.');
  const sub = R.mode === 'flight' ? (F.cs ? 'Flight ' + F.cs : '') : 'Squadron preset ' + (R.name || ''),
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
      cp = e.target.closest('[data-cp]'),
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
    if (cp) {
      const kk = cp.dataset.cp,
        P = presetsLoad();
      if (kk[0] == 'q') {
        const s = R.ctx.presets[+kk.slice(1)];
        let name = s.name;
        while (P.some(x => x.name.toLowerCase() == name.toLowerCase())) name += ' (sq)';
        presetsSave([...P, { name, sel: s.sel }]);
        appToast('"' + s.name + '" copied to your presets.');
      } else {
        const s = P[+kk.slice(1)];
        R.ctx.save([...R.ctx.presets, { name: s.name, sel: s.sel, cats: [] }]);
        appToast('"' + s.name + '" copied to the presets of the squadron.');
      }
      return render();
    }
    if (del) {
      const P = presetsLoad(),
        i = +del.dataset.del;
      confirm(`Delete your preset "${P[i].name}"?`).then(y => {
        if (!y) return;
        P.splice(i, 1);
        presetsSave(P);
        R.on = new Set(
          [...R.on].filter(x => x != 'm' + i).map(x => (x[0] == 'm' && +x.slice(1) > i ? 'm' + (+x.slice(1) - 1) : x))
        );
        render();
      });
      return;
    }
    if (q) {
      const kk = q.dataset.k;
      if (R.on.has(kk)) R.on.delete(kk);
      else R.on.add(kk);
      return fromPresets();
    }
    if (cat) {
      const c = cat.dataset.cat;
      R.cats = R.cats.includes(c) ? R.cats.filter(x => x != c) : [...R.cats, c];
      cat.classList.toggle('on', R.cats.includes(c));
      R.base = '';
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
      R.on = new Set();
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
    if (act == 'save') {
      const nm = box.querySelector('.rssv .rpnm'),
        name = nm.value.trim();
      if (!name) {
        nm.focus();
        nm.classList.add('err');
        return;
      }
      savePreset(name);
      return render();
    }
    if (act == 'apply') {
      if (!flightOn()) return;
      // the first time, with no preset yet: keep the choices as a preset (recommended)
      if (!presetsLoad().length && !LS.get('bmsroeasked', false)) {
        LS.set('bmsroeasked', true);
        modal(
          'Save these choices as a preset?',
          '<p>Recommended: a preset keeps your ROE and SOP for the next flights (several presets can be put together).</p><input type="text" class="rpnm rsfirst" maxlength="40" value="My SOP">',
          [
            { a: 'save', label: 'Save & apply' },
            { a: 'apply', label: 'Apply only', g: 1 },
          ],
          (a2, p) => {
            if (a2 == 'save') {
              const n = p.querySelector('.rsfirst').value.trim();
              if (!n) return false;
              savePreset(n);
            }
            applyCard();
          }
        );
        return;
      }
      return applyCard();
    }
    const L = R.ctx.presets.slice();
    if (act == 'psave') {
      if (savePsq()) render();
      return;
    }
    if (act == 'up' && typeof R.mode == 'number' && R.mode > 0) {
      const i = R.mode;
      [L[i - 1], L[i]] = [L[i], L[i - 1]];
      R.mode = i - 1;
      R.ctx.save(L);
      return;
    }
    if (act == 'del' && typeof R.mode == 'number') {
      const i = R.mode;
      confirm('Delete the squadron preset "' + L[i].name + '"? Every pilot loses it.').then(y => {
        if (!y) return;
        R.mode = 'flight';
        setSel(flightSel());
        R.ctx.save(L.filter((_, j) => j != i));
      });
    }
  };
  box.onchange = e => {
    if (e.target.classList.contains('rsmode')) {
      const v = e.target.value;
      R.on = new Set();
      if (v == 'flight') {
        R.mode = 'flight';
        setSel(flightSel());
      } else if (v == 'new') {
        R.mode = 'new'; // a new squadron preset starts from the choices of now
        R.name = '';
        R.cats = [];
        setSel(R.sel);
        R.base = '';
      } else {
        const p = R.ctx.presets[+v];
        R.mode = +v;
        R.name = p.name;
        R.cats = [...p.cats];
        setSel(p.sel);
      }
      return render();
    }
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
// a flight just chosen gets the default of the squadron for its kind of mission (the presets marked "Default for" it), as an automatic fill:
// what the pilot chose for that flight stays (the hand changes come back over it)
export function roeAuto(f) {
  const Q = sqGet('roePresets', []);
  if (!Q.length || !ST.C || !f) return;
  syncCustom();
  const s = defaultFor(Q, categoryOf(ST.C.D.S[300 + f.omis] || ''));
  if (!s) return;
  F.roesel = JSON.stringify(s);
  F.roe = roeText(s);
  F.sop = sopText(s);
}
export const roeRefresh = () => {
  if (R.box && R.mode === 'flight' && R.flightKey !== ST.CURK) {
    R.flightKey = ST.CURK;
    setSel(flightSel());
    R.on = new Set();
    render();
  }
};
