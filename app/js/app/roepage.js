// Squadron > ROE / SOP: the page of the rules of engagement and of the SOP of the squadron. What is edited: the ROE / SOP of the flight on the card,
// or (the commander) a preset of the squadron. The presets of the squadron and the personal ones (this PC) can be combined. The card gets the short
// form, one rule / one topic a line, 5 at most in each box. A click on the ROE or SOP box of the card opens this page.
import {
  ROE,
  SOP,
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
} from '../core/roesop.js';
import { categoryOf } from '../core/ato.js';
import { ST } from './state.js';
import { F, dEl, setField } from './datacard.js';
import { esc, appToast } from './base.js';
import { draw } from './cardview.js';
import { markMan } from './selection.js';
import { sqPage } from './pages.js';

const KEY = 'bmsroepre'; // the personal presets: only on this PC
export function presetsLoad() {
  try {
    return cleanPresets(JSON.parse(localStorage.getItem(KEY) || '[]'));
  } catch (e) {
    return [];
  }
}
function presetsSave(P) {
  try {
    localStorage.setItem(KEY, JSON.stringify(cleanPresets(P)));
  } catch (e) {}
}
const sqPresets = () => {
  try {
    return (sqPage && sqPage.roePresets && sqPage.roePresets()) || [];
  } catch (e) {
    return [];
  }
};
// lines typed by hand in a box that the choices did not write: they come back as its other lines
const handLines = (typed, made) => {
  const M = made ? made.split('\n') : [];
  return String(typed || '')
    .split('\n')
    .filter(l => l.trim() && !M.includes(l))
    .join('\n');
};
const lines = t => (t ? t.split('\n').filter(l => l.trim()).length : 0);
// the choices of the flight on the card: F.roesel, with the lines typed by hand on the card
function flightSel() {
  let s;
  try {
    s = cleanSel(JSON.parse(F.roesel || 'null'));
  } catch (e) {
    s = emptySel();
  }
  if (F.roe && F.roe !== roeText(s)) s.free = handLines(F.roe, roeText({ ...s, free: '' }));
  if (F.sop && F.sop !== sopText(s)) s.sfree = handLines(F.sop, sopText({ ...s, sfree: '' }));
  return s;
}
const flightOn = () => !!(ST.AUTO && ST.CL && ST.CL.length);

// the state of the page (kept while the program runs)
const R = {
  box: null,
  ctx: { squad: '', own: false, presets: [], save: () => {} },
  sig: '',
  mode: 'flight', // 'flight' | 'new' | the index of a squadron preset (the commander)
  sel: emptySel(),
  name: '',
  cats: [],
  on: new Set(), // the presets combined: 'q0' (squadron), 'm0' (mine)
  cust: new Set(), // the SOP topics written with an own text
  flightKey: null,
};
const setSel = s => {
  R.sel = cleanSel(s);
  R.cust = new Set(Object.keys(R.sel.sop).filter(k => R.sel.sop[k].t));
};
// the squadron calls this when the page is drawn (the presets may have changed): the page is drawn again only when something it shows changed
export function roeDraw(box, ctx) {
  const sig = JSON.stringify([ctx.squad, ctx.own, ctx.presets]);
  const fk = ST.CURK;
  R.ctx = ctx;
  if (typeof R.mode == 'number' && !ctx.presets[R.mode]) R.mode = 'flight';
  if (!ctx.own && R.mode !== 'flight') R.mode = 'flight';
  if (R.mode === 'flight' && fk !== R.flightKey) {
    R.flightKey = fk;
    setSel(flightSel());
    R.on = new Set();
  }
  if (box !== R.box || sig !== R.sig || !box.firstChild) {
    R.box = box;
    R.sig = sig;
    render();
  }
}
// the ROE or SOP box of the card was clicked: this page, on the flight
export function roeGo() {
  R.mode = 'flight';
  R.flightKey = ST.CURK;
  setSel(flightSel());
  R.on = new Set();
  const t = document.querySelector('[data-t=sq]');
  if (t) t.click();
  if (sqPage && sqPage.tab) sqPage.tab('roe');
  render();
}

function counts() {
  return { r: lines(roeText(R.sel)), s: lines(sopText(R.sel)) };
}
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
function render0(box) {
  const st = [...box.querySelectorAll('.rsc')].map(c => c.scrollTop),
    { own, presets: Q, squad } = R.ctx,
    P = presetsLoad(),
    edit = R.mode !== 'flight',
    { r: nR, s: nS } = counts(),
    fullR = nR >= BOX_MAX,
    fullS = nS >= BOX_MAX;
  const chip = (id, kind, [v, long, short]) => {
    const on = kind == 'many' ? R.sel.roe[id].includes(v) : R.sel.roe[id] === v,
      off = !on && fullR && (kind == 'many' || !R.sel.roe[id]);
    return `<button type="button" class="rpk${on ? ' on' : ''}${off ? ' off' : ''}" data-r="${id}" data-v="${v}" title="${esc(long)}"${off ? ' disabled' : ''}>${esc(short)}</button>`;
  };
  const roeCard = `<div class="wcard"><div class="wh"><h3>ROE</h3><span class="hint">one rule a line on the card · ${BOX_MAX} at most</span></div>${ROE.map(
    ([id, lab, kind, , opts]) =>
      `<div class="rpt">${esc(lab)}<small>${kind == 'many' ? 'one or more' : 'one'}</small></div><div class="rpo">${opts.map(o => chip(id, kind, o)).join('')}</div>`
  ).join(
    ''
  )}<div class="rpt">Other ROE lines<small>one a line, they count too</small></div><textarea class="rpfr" data-f="free" rows="2" maxlength="600" placeholder="Written in the ROE box as they are">${esc(R.sel.free)}</textarea></div>`;
  const row = t => {
    const [id, lab, , opts] = t,
      v = R.sel.sop[id] || { o: null, t: '', c: false },
      cust = !!v.t || R.cust.has(id),
      long = cust ? '' : (opts.find(x => x[0] === v.o) || [])[1] || '',
      set = !!(v.o || v.t),
      cOff = !set || (fullS && !v.c);
    return `<div class="rpr${set ? ' set' : ''}" data-t="${id}"><span class="rpn">${esc(lab)}</span><select aria-label="${esc(lab)}"><option value="">—</option>${opts
      .map(([x, , sh]) => `<option value="${x}"${!cust && v.o === x ? ' selected' : ''}>${esc(sh)}</option>`)
      .join(
        ''
      )}<option value="*"${cust ? ' selected' : ''}>Own text…</option></select><label class="rpon" title="${fullS && !v.c ? 'The SOP box of the card is full' : 'Write this topic in the SOP box of the card (short form)'}"><input type="checkbox"${v.c ? ' checked' : ''}${cOff ? ' disabled' : ''}> card</label><div class="rpd">${cust ? `<input type="text" class="rpi" maxlength="120" value="${esc(v.t)}" placeholder="Short text for the card">` : esc(long)}</div></div>`;
  };
  const phases = SOP.map(
    ([ph, T]) =>
      `<div class="wcard"><div class="wh"><h3>${esc(ph)}</h3><span class="hint">${T.filter(t => R.sel.sop[t[0]]).length || ''}</span></div>${T.map(row).join('')}</div>`
  );
  const pchip = (k, name, title, del) =>
    `<span class="rpq${R.on.has(k) ? ' on' : ''}${k[0] == 'q' ? ' sq' : ''}" data-k="${k}" title="${esc(title)}">${esc(name)}${del ? `<b data-del="${k.slice(1)}" title="Delete this preset">×</b>` : ''}</span>`;
  const cs = F.cs || (ST.CL && ST.CL.length ? 'flight' : '');
  const editCard = `<div class="wcard"><div class="wh"><h3>Editing</h3>${squad ? `<span class="hint">${esc(squad)}</span>` : ''}</div>${
    own
      ? `<select class="rsmode" aria-label="What is edited"><option value="flight"${R.mode === 'flight' ? ' selected' : ''}>Flight${cs ? ' · ' + esc(cs) : ''} (the card)</option>${Q.map((q, i) => `<option value="${i}"${R.mode === i ? ' selected' : ''}>Squadron preset · ${esc(q.name)}</option>`).join('')}<option value="new"${R.mode === 'new' ? ' selected' : ''}>＋ New squadron preset</option></select>`
      : `<div class="rsflt">Flight${cs ? ' · <b>' + esc(cs) + '</b>' : ''} (the card)</div>`
  }${
    edit
      ? `<div class="rpt">Name</div><input type="text" class="rpnm rsname" maxlength="40" value="${esc(R.name)}" placeholder="Name of the preset"><div class="rpt">Default for<small>flights of these kinds of mission get it by themselves</small></div><div class="rpo">${ROE_CATS.map(c => `<button type="button" class="rpk rpcat${R.cats.includes(c) ? ' on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>`
      : `<div class="hint" style="margin-top:6px">${flightOn() ? 'The choices go on the card of this flight with Apply to card.' : 'Pick a flight in the ATO (Datacard) to write on its card; the presets can be made anyway.'}${own ? ' Choose a squadron preset above to edit it.' : ''}</div>`
  }</div>`;
  const presetCard = edit
    ? ''
    : `<div class="wcard"><div class="wh"><h3>Presets</h3><span class="hint">several together</span></div>${
        Q.length
          ? `<div class="rpl">Squadron</div><div>${Q.map((q, i) => pchip('q' + i, q.name, 'Preset of the squadron (set by the commander)' + (q.cats.length ? ': default for ' + q.cats.join(', ') : ''), false)).join('')}</div>`
          : ''
      }<div class="rpl">Mine</div><div>${
        P.length
          ? P.map((q, i) => pchip('m' + i, q.name, 'Your preset, on this PC', true)).join('')
          : '<span class="hint" style="min-height:0">none yet: make your choices, then Save as preset</span>'
      }</div><div class="rssv"><input type="text" class="rpnm" maxlength="40" placeholder="Name"><button type="button" class="btn g" data-a="save" title="Keep the choices of now as a preset on this PC">Save as preset</button></div></div>`;
  const warn = [fullR ? 'ROE box full' : '', fullS ? 'SOP box full' : ''].filter(Boolean);
  const cardCard = `<div class="wcard"><div class="wh"><h3>${edit ? 'Preview' : 'On the card'}</h3><span class="hint">Datacard · MDC</span></div><div class="rscard"><div class="h">ROE</div><div class="h">SOP</div><div class="b rpv1"></div><div class="b rpv2"></div></div><div class="rscnt"><span>ROE <b class="${fullR ? 'full' : ''}">${nR}/${BOX_MAX}</b></span><span>SOP <b class="${fullS ? 'full' : ''}">${nS}/${BOX_MAX}</b></span></div>${
    warn.length
      ? `<div class="rswarn">${warn.join(', ')} (${BOX_MAX} lines): take a line away to add another one.</div>`
      : ''
  }<div class="rsbar"><button type="button" class="btn g rd" data-a="clear" title="Take every choice away">Clear</button><span style="flex:1"></span>${
    edit
      ? `${typeof R.mode == 'number' ? `<button type="button" class="btn g" data-a="up" title="Move up in the list"${R.mode ? '' : ' disabled'}>↑</button><button type="button" class="btn g rd" data-a="del">Delete</button>` : ''}<button type="button" class="btn" data-a="psave" title="Keep the preset and send it to the squadron">Save preset</button>`
      : `<button type="button" class="btn g" data-a="back" title="The Datacard">Back to the card</button><button type="button" class="btn" data-a="apply" title="Write ROE and SOP on the card of the flight"${flightOn() ? '' : ' disabled'}>Apply to card</button>`
  }</div></div>`;
  box.innerHTML = `<div class="rsq"><div class="rsc rsl">${editCard}${presetCard}${cardCard}</div><div class="rsc">${roeCard}</div><div class="rsc rss"><div class="rsg">${phases.filter((_, i) => i % 2 == 0).join('')}</div><div class="rsg">${phases.filter((_, i) => i % 2 == 1).join('')}</div></div><div class="rsc rsx"><div class="wcard"><div class="wh"><h3>Other SOP lines</h3><span class="hint">one a line, they count too</span></div><textarea class="rpfr" data-f="sfree" rows="2" maxlength="600" placeholder="Written in the SOP box as they are">${esc(R.sel.sfree)}</textarea></div></div></div>`;
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
    )
  );

  render();
}
function wire(box) {
  box.onclick = e => {
    const k = e.target.closest('.rpk:not(.rpcat)'),
      cat = e.target.closest('.rpcat'),
      a = e.target.closest('[data-a]'),
      del = e.target.closest('[data-del]'),
      q = e.target.closest('.rpq');
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
      const key = q.dataset.k;
      if (R.on.has(key)) R.on.delete(key);
      else R.on.add(key);
      return fromPresets();
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
      setSel(emptySel());
      R.on = new Set();
      return render();
    }
    if (act == 'back') {
      const t = document.querySelector('[data-t=dc]');
      if (t) t.click();
      return;
    }
    if (act == 'save') {
      const nm = box.querySelector('.rssv .rpnm'),
        name = nm.value.trim();
      if (!name) {
        nm.focus();
        nm.classList.add('err');
        return;
      }
      const P = presetsLoad(),
        i = P.findIndex(x => x.name.toLowerCase() == name.toLowerCase());
      if (i >= 0) P[i] = { name, sel: cleanSel(R.sel) };
      else P.push({ name, sel: cleanSel(R.sel) });
      presetsSave(P);
      appToast('Preset "' + name + '" kept on this PC.');
      return render();
    }
    if (act == 'apply') {
      if (!flightOn()) return;
      const t1 = roeText(R.sel),
        t2 = sopText(R.sel);
      setField('roesel', JSON.stringify(cleanSel(R.sel)));
      setField('roe', t1);
      setField('sop', t2);
      [
        ['roe', t1],
        ['sop', t2],
      ].forEach(([key, t]) => {
        const d = dEl(key);
        if (d && d.el) d.el.value = t;
      });
      markMan();
      draw();
      appToast('ROE and SOP written on the card' + (F.cs ? ' of ' + F.cs : '') + '.');
      return;
    }
    const L = R.ctx.presets.slice();
    if (act == 'psave') {
      const nm = box.querySelector('.rsname'),
        name = nm.value.trim();
      if (!name) {
        nm.focus();
        nm.classList.add('err');
        return;
      }
      const p = { name, sel: cleanSel(R.sel), cats: R.cats };
      if (typeof R.mode == 'number') L[R.mode] = p;
      else {
        L.push(p);
        R.mode = L.length - 1;
      }
      R.ctx.save(L);
      appToast('Squadron preset "' + name + '" saved and sent to the squadron.');
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
        R.mode = 'new';
        R.name = '';
        R.cats = [];
        setSel(emptySel());
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
      t = SOP.flatMap(x => x[1]).find(x => x[0] == id),
      v = R.sel.sop[id] || { o: null, t: '', c: false },
      room = lines(sopText(R.sel)) < BOX_MAX;
    if (e.target.tagName == 'SELECT') {
      const x = e.target.value;
      R.cust.delete(id);
      if (!x) delete R.sel.sop[id];
      else if (x == '*') {
        R.cust.add(id);
        R.sel.sop[id] = { o: null, t: v.t || sopShort(t, v) || '', c: v.c || (!(v.o || v.t) && room) };
      } else R.sel.sop[id] = { o: x, t: '', c: v.o || v.t ? v.c : room }; // a topic just chosen goes on the card when there is room
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
  const Q = sqPresets();
  if (!Q.length || !ST.C || !f) return;
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
