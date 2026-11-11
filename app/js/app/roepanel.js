// The menu of ROE / SOP (Datacard and MDC): the rules of engagement and the SOP of the squadron as choices, the presets of the squadron and the
// personal ones (several can be chosen together), the text of the two boxes of the card. The choices are kept with the flight (F.roesel), the texts in
// F.roe and F.sop (they can still be typed by hand). The same menu edits a preset of the squadron (Squadron > ROE / SOP, the commander only).
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
} from '../core/roesop.js';
import { categoryOf } from '../core/ato.js';
import { ST } from './state.js';
import { F, dEl, setField } from './datacard.js';
import { esc } from './base.js';
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
const anim = () => !document.documentElement.classList.contains('noanim');
let POP = null;
export function roeClose() {
  const p = POP;
  if (!p) return;
  POP = null;
  document.removeEventListener('keydown', onKey, true);
  const bk =
    p.previousElementSibling && p.previousElementSibling.classList.contains('rpbk') ? p.previousElementSibling : null;
  const gone = () => {
    p.remove();
    if (bk) bk.remove();
  };
  if (anim())
    p.animate(
      [
        { opacity: 1, transform: 'none' },
        { opacity: 0, transform: 'translateY(8px)' },
      ],
      { duration: 130, easing: 'ease-in' }
    ).onfinish = gone;
  else gone();
}
function onKey(e) {
  if (e.key == 'Escape' && !document.querySelector('.ddp')) {
    e.stopPropagation();
    roeClose();
  }
}
// lines typed by hand in a box that the choices did not write: they come back as its other lines
const handLines = (typed, made) => {
  const M = made ? made.split('\n') : [];
  return String(typed || '')
    .split('\n')
    .filter(l => l.trim() && !M.includes(l))
    .join('\n');
};
// o: nothing = the ROE / SOP of the flight on the card; {preset: {name, sel, cats}, onSave(preset)} = a preset of the squadron
export function roeOpen(o = {}) {
  roeClose();
  const edit = !!o.preset;
  let sel;
  if (edit) sel = cleanSel(o.preset.sel);
  else {
    try {
      sel = cleanSel(JSON.parse(F.roesel || 'null'));
    } catch (e) {
      sel = emptySel();
    }
    if (F.roe && F.roe !== roeText(sel)) sel.free = handLines(F.roe, roeText({ ...sel, free: '' }));
    if (F.sop && F.sop !== sopText(sel)) sel.sfree = handLines(F.sop, sopText({ ...sel, sfree: '' }));
  }
  let cats = edit ? [...(o.preset.cats || [])] : [];
  let P = presetsLoad(),
    Q = edit ? [] : sqPresets(),
    on = new Set(); // the presets chosen: 'q0' (squadron), 'm0' (mine)
  const CUST = new Set(Object.keys(sel.sop).filter(k => sel.sop[k].t)); // the topics written with an own text
  const bk = document.createElement('div');
  bk.className = 'rpbk';
  const p = (POP = document.createElement('div'));
  p.className = 'roepop';
  p.setAttribute('role', 'dialog');
  p.setAttribute('aria-label', 'ROE / SOP');
  document.body.append(bk, p);
  bk.onclick = roeClose;
  document.addEventListener('keydown', onKey, true);

  const chip = (r, v, long, short, act) =>
    `<button type="button" class="rpk${act ? ' on' : ''}" data-r="${r}" data-v="${v}" title="${esc(long)}">${esc(short)}</button>`;
  const roeHtml = () =>
    ROE.map(
      ([id, lab, kind, , opts]) =>
        `<div class="rps"><div class="rpt">${esc(lab)}<small>${kind == 'many' ? 'one or more' : 'one'}</small></div><div class="rpo">${opts
          .map(([v, long, short]) =>
            chip(id, v, long, short, kind == 'many' ? sel.roe[id].includes(v) : sel.roe[id] === v)
          )
          .join('')}</div></div>`
    ).join('');
  const sopRow = t => {
    const [id, lab, , opts] = t,
      v = sel.sop[id] || { o: null, t: '', c: false },
      cust = !!v.t || CUST.has(id),
      long = cust ? '' : (opts.find(x => x[0] === v.o) || [])[1] || '';
    return `<div class="rpr${v.o || v.t ? ' set' : ''}" data-t="${id}"><span class="rpn">${esc(lab)}</span><select aria-label="${esc(lab)}"><option value="">—</option>${opts
      .map(([x, lg, sh]) => `<option value="${x}"${!cust && v.o === x ? ' selected' : ''}>${esc(sh)}</option>`)
      .join(
        ''
      )}<option value="*"${cust ? ' selected' : ''}>Own text…</option></select><label class="rpon" title="Write this topic in the SOP box of the card (short form)"><input type="checkbox"${v.c ? ' checked' : ''}${v.o || v.t ? '' : ' disabled'}> card</label><div class="rpd">${cust ? `<input type="text" class="rpi" maxlength="120" value="${esc(v.t)}" placeholder="Short text for the card">` : esc(long)}</div></div>`;
  };
  const cnt = T => T.filter(t => sel.sop[t[0]]).length || '';
  const sopHtml = () =>
    SOP.map(
      ([ph, T]) =>
        `<details class="rpg" open><summary>${esc(ph)}<em>${cnt(T)}</em></summary>${T.map(sopRow).join('')}</details>`
    ).join('');
  const pchip = (k, name, title, del) =>
    `<span class="rpq${on.has(k) ? ' on' : ''}${k[0] == 'q' ? ' sq' : ''}" data-k="${k}" title="${esc(title)}">${esc(name)}${del ? `<b data-del="${k.slice(1)}" title="Delete this preset">×</b>` : ''}</span>`;
  const presetHtml = () =>
    (Q.length
      ? `<span class="rpl">Squadron</span>${Q.map((q, i) => pchip('q' + i, q.name, 'Preset of the squadron (set by the commander)' + (q.cats.length ? ': default for ' + q.cats.join(', ') : ''), false)).join('')}`
      : '') +
    `<span class="rpl">Mine</span>${
      P.length
        ? P.map((q, i) =>
            pchip('m' + i, q.name, 'Your preset, on this PC (several can be chosen: their choices are joined)', true)
          ).join('')
        : '<span class="hint" style="min-height:0">none yet: make your choices, then Save as preset</span>'
    }`;
  const preview = () => {
    p.querySelector('.rpv1').textContent = roeText(sel) || '—';
    p.querySelector('.rpv2').textContent = sopText(sel) || '—';
  };
  const top = () =>
    edit
      ? `<div class="rpp"><span class="rpl">Name</span><input type="text" class="rpnm" maxlength="40" value="${esc(o.preset.name || '')}" placeholder="Name of the preset"><span class="rpl">Default for</span><span class="rpqs">${ROE_CATS.map(c => `<button type="button" class="rpk rpc2${cats.includes(c) ? ' on' : ''}" data-cat="${esc(c)}" title="Flights of this kind of mission get this preset by themselves">${esc(c)}</button>`).join('')}</span></div>`
      : `<div class="rpp"><span class="rpl">Presets</span><span class="rpqs">${presetHtml()}</span><span class="rpsv"><input type="text" class="rpnm" maxlength="40" placeholder="Name"><button type="button" class="btn g" data-a="save" title="Keep the choices of now as a preset on this PC">Save as preset</button></span></div>`;
  const render = () => {
    const st = [...p.querySelectorAll('.rpc')].map(c => c.scrollTop);
    p.innerHTML = `<div class="rph"><b>ROE / SOP${edit ? ' · squadron preset' : ''}</b><span class="hint" style="min-height:0">${edit ? 'Every pilot of the squadron gets this preset in his ROE / SOP menu.' : 'The rules of engagement and the habits of the squadron. The card gets the short form.'}</span><button type="button" class="rpx" title="Close (Esc)">×</button></div>
      ${top()}
      <div class="rpb"><div class="rpc"><h4>ROE</h4>${roeHtml()}<h4>Other ROE lines</h4><textarea class="rpfr" data-f="free" rows="3" maxlength="600" placeholder="Written in the ROE box as they are">${esc(sel.free)}</textarea></div><div class="rpc"><h4>SOP <small>tick "card" to write a topic in the SOP box</small></h4>${sopHtml()}<h4>Other SOP lines</h4><textarea class="rpfr" data-f="sfree" rows="3" maxlength="600" placeholder="Written in the SOP box as they are">${esc(sel.sfree)}</textarea></div></div>
      <div class="rpf"><div class="rpvw"><div><span class="rpl">ROE box</span><div class="rpv rpv1"></div></div><div><span class="rpl">SOP box</span><div class="rpv rpv2"></div></div></div><div class="bar"><button type="button" class="btn g rd" data-a="clear" title="Take every choice away">Clear</button><span style="flex:1"></span><button type="button" class="btn g" data-a="cancel">Cancel</button><button type="button" class="btn" data-a="apply" title="${edit ? 'Keep the preset and send it to the squadron' : 'Write the texts on the card'}">${edit ? 'Save preset' : 'Apply'}</button></div></div>`;
    p.querySelectorAll('.rpc').forEach((c, i) => (c.scrollTop = st[i] || 0));
    preview();
  };
  const fromPresets = () => {
    const L = [...on]
      .sort((a, b) => (a[0] == b[0] ? +a.slice(1) - +b.slice(1) : a[0] == 'q' ? -1 : 1)) // the squadron first, then mine
      .map(k => (k[0] == 'q' ? Q : P)[+k.slice(1)])
      .filter(Boolean)
      .map(x => x.sel);
    sel = mergeSel(L);
    CUST.clear();
    Object.keys(sel.sop).forEach(k => sel.sop[k].t && CUST.add(k));
    render();
  };
  p.onclick = e => {
    const k = e.target.closest('.rpk:not(.rpc2)'),
      cat = e.target.closest('.rpc2'),
      a = e.target.closest('[data-a]'),
      del = e.target.closest('[data-del]'),
      q = e.target.closest('.rpq');
    if (e.target.closest('.rpx')) return roeClose();
    if (del) {
      const i = +del.dataset.del;
      confirm(`Delete the preset "${P[i].name}"?`).then(y => {
        if (!y || !POP) return;
        P.splice(i, 1);
        presetsSave(P);
        on = new Set(
          [...on].filter(x => x != 'm' + i).map(x => (x[0] == 'm' && +x.slice(1) > i ? 'm' + (+x.slice(1) - 1) : x))
        );
        render();
      });
      return;
    }
    if (q) {
      const key = q.dataset.k;
      if (on.has(key)) on.delete(key);
      else on.add(key);
      return fromPresets();
    }
    if (cat) {
      const c = cat.dataset.cat;
      cats = cats.includes(c) ? cats.filter(x => x != c) : [...cats, c];
      cat.classList.toggle('on', cats.includes(c));
      return;
    }
    if (k) {
      const r = k.dataset.r,
        v = k.dataset.v,
        kind = ROE.find(x => x[0] == r)[2];
      if (kind == 'many') {
        const L = sel.roe[r];
        sel.roe[r] = L.includes(v) ? L.filter(x => x != v) : [...L, v];
        k.classList.toggle('on', sel.roe[r].includes(v));
      } else {
        sel.roe[r] = sel.roe[r] === v ? null : v;
        k.parentElement.querySelectorAll('.rpk').forEach(b => b.classList.toggle('on', b.dataset.v === sel.roe[r]));
      }
      return preview();
    }
    if (!a) return;
    if (a.dataset.a == 'cancel') return roeClose();
    if (a.dataset.a == 'clear') {
      sel = emptySel();
      on = new Set();
      CUST.clear();
      return render();
    }
    if (a.dataset.a == 'save') {
      const nm = p.querySelector('.rpnm'),
        name = nm.value.trim();
      if (!name) {
        nm.focus();
        nm.classList.add('err');
        return;
      }
      const i = P.findIndex(x => x.name.toLowerCase() == name.toLowerCase());
      if (i >= 0) P[i] = { name, sel: cleanSel(sel) };
      else P.push({ name, sel: cleanSel(sel) });
      presetsSave(P);
      P = presetsLoad();
      return render();
    }
    if (a.dataset.a == 'apply') {
      if (edit) {
        const nm = p.querySelector('.rpnm'),
          name = nm.value.trim();
        if (!name) {
          nm.focus();
          nm.classList.add('err');
          return;
        }
        o.onSave({ name, sel: cleanSel(sel), cats });
        return roeClose();
      }
      const t1 = roeText(sel),
        t2 = sopText(sel);
      setField('roesel', JSON.stringify(cleanSel(sel)));
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
      roeClose();
    }
  };
  p.onchange = e => {
    if (e.target.classList.contains('rpfr')) {
      sel[e.target.dataset.f] = e.target.value.replace(/\r/g, '');
      return preview();
    }
    const r = e.target.closest('.rpr');
    if (!r) return;
    const id = r.dataset.t,
      t = SOP.flatMap(x => x[1]).find(x => x[0] == id),
      v = sel.sop[id] || { o: null, t: '', c: false };
    if (e.target.tagName == 'SELECT') {
      const x = e.target.value;
      CUST.delete(id);
      if (!x) delete sel.sop[id];
      else if (x == '*') {
        CUST.add(id);
        sel.sop[id] = { o: null, t: v.t || sopShort(t, v) || '', c: true };
      } else sel.sop[id] = { o: x, t: '', c: v.o || v.t ? v.c : true }; // a topic just chosen goes on the card
      const row = document.createElement('div');
      row.innerHTML = sopRow(t);
      const nr = row.firstElementChild;
      r.replaceWith(nr);
      if (x == '*' && nr.querySelector('.rpi')) nr.querySelector('.rpi').focus();
      const g = nr.closest('.rpg');
      if (g) g.querySelector('summary em').textContent = cnt([...g.querySelectorAll('.rpr')].map(z => [z.dataset.t]));
    } else if (e.target.type == 'checkbox') {
      if (sel.sop[id]) sel.sop[id].c = e.target.checked;
    }
    preview();
  };
  p.oninput = e => {
    if (e.target.classList.contains('rpi')) {
      const id = e.target.closest('.rpr').dataset.t;
      sel.sop[id] = { o: null, t: e.target.value.slice(0, 120), c: sel.sop[id] ? sel.sop[id].c : true };
      preview();
    } else if (e.target.classList.contains('rpfr')) {
      sel[e.target.dataset.f] = e.target.value.replace(/\r/g, '');
      preview();
    } else if (e.target.classList.contains('rpnm')) e.target.classList.remove('err');
  };
  render();
  if (anim())
    p.animate(
      [
        { opacity: 0, transform: 'translateY(8px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 160, easing: 'ease-out' }
    );
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
