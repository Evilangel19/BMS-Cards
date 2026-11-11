// The menu of the cell ROE / SOP (Datacard and MDC): the rules of engagement and the SOP of the squadron as choices, the presets (several can be
// chosen together), the text that goes on the card. The choices are kept with the flight (F.roesel), the text in F.roe (it can still be typed by hand).
import { ROE, SOP, emptySel, cleanSel, mergeSel, cardText, cleanPresets, sopShort } from '../core/roesop.js';
import { F, dEl, setField } from './datacard.js';
import { esc } from './base.js';
import { draw } from './cardview.js';
import { markMan } from './selection.js';

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
  if (e.key == 'Escape') {
    e.stopPropagation();
    roeClose();
  }
}
export function roeOpen() {
  roeClose();
  let sel;
  try {
    sel = cleanSel(JSON.parse(F.roesel || 'null'));
  } catch (e) {
    sel = emptySel();
  }
  // lines typed by hand on the card that the choices did not write: they stay, as Other lines
  if (F.roe && F.roe !== cardText(sel)) {
    const made = cardText({ ...sel, free: '' }).split('\n');
    sel.free = String(F.roe)
      .split('\n')
      .filter(l => l.trim() && !made.includes(l))
      .join('\n');
  }
  let P = presetsLoad(),
    on = new Set(); // the presets chosen (indexes)
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
      long = cust ? '' : (opts.find(o => o[0] === v.o) || [])[1] || '';
    return `<div class="rpr${v.o || v.t ? ' set' : ''}" data-t="${id}"><span class="rpn">${esc(lab)}</span><select aria-label="${esc(lab)}"><option value="">—</option>${opts
      .map(
        ([o, lg, sh]) =>
          `<option value="${o}"${!cust && v.o === o ? ' selected' : ''} title="${esc(lg)}">${esc(sh)}</option>`
      )
      .join(
        ''
      )}<option value="*"${cust ? ' selected' : ''}>Own text…</option></select><label class="rpon" title="Write this topic on the card (short form)"><input type="checkbox"${v.c ? ' checked' : ''}${v.o || v.t ? '' : ' disabled'}> card</label><div class="rpd">${cust ? `<input type="text" class="rpi" maxlength="120" value="${esc(v.t)}" placeholder="Short text for the card">` : esc(long)}</div></div>`;
  };
  const sopHtml = () =>
    SOP.map(
      ([ph, T]) =>
        `<details class="rpg" open><summary>${esc(ph)}<em>${T.filter(t => sel.sop[t[0]]).length || ''}</em></summary>${T.map(sopRow).join('')}</details>`
    ).join('');
  const presetHtml = () =>
    P.length
      ? P.map(
          (q, i) =>
            `<span class="rpq${on.has(i) ? ' on' : ''}" data-i="${i}" title="Choose this preset (several can be chosen: their choices are joined)">${esc(q.name)}<b data-del="${i}" title="Delete this preset">×</b></span>`
        ).join('')
      : '<span class="hint" style="min-height:0">No presets yet: make your choices, then Save as preset.</span>';
  const preview = () => {
    const t = cardText(sel);
    p.querySelector('.rpv').textContent = t || '(nothing on the card)';
  };
  const render = () => {
    const st = [...p.querySelectorAll('.rpc')].map(c => c.scrollTop);
    p.innerHTML = `<div class="rph"><b>ROE / SOP</b><span class="hint" style="min-height:0">The rules of engagement and the habits of the squadron. Hover a choice for its full text; the card gets the short form.</span><button type="button" class="rpx" title="Close (Esc)">×</button></div>
      <div class="rpp"><span class="rpl">Presets · mine</span><span class="rpqs">${presetHtml()}</span><span class="rpsv"><input type="text" class="rpnm" maxlength="40" placeholder="Name"><button type="button" class="btn g" data-a="save" title="Keep the choices of now as a preset on this PC">Save as preset</button></span></div>
      <div class="rpb"><div class="rpc"><h4>ROE</h4>${roeHtml()}<h4>Other lines</h4><textarea class="rpfr" rows="3" maxlength="600" placeholder="Written on the card as they are">${esc(sel.free)}</textarea></div><div class="rpc"><h4>SOP <small>tick "card" to write a topic on the card</small></h4>${sopHtml()}</div></div>
      <div class="rpf"><div class="rpvw"><span class="rpl">On the card</span><div class="rpv"></div></div><div class="bar"><button type="button" class="btn g rd" data-a="clear" title="Take every choice away">Clear</button><span style="flex:1"></span><button type="button" class="btn g" data-a="cancel">Cancel</button><button type="button" class="btn" data-a="apply" title="Write the text on the card">Apply</button></div></div>`;
    p.querySelectorAll('.rpc').forEach((c, i) => (c.scrollTop = st[i] || 0));
    preview();
  };
  const fromPresets = () => {
    sel = mergeSel([...on].sort((a, b) => a - b).map(i => P[i] && P[i].sel));
    CUST.clear();
    Object.keys(sel.sop).forEach(k => sel.sop[k].t && CUST.add(k));
    render();
  };
  p.onclick = e => {
    const k = e.target.closest('.rpk'),
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
        on = new Set([...on].filter(x => x != i).map(x => (x > i ? x - 1 : x)));
        render();
      });
      return;
    }
    if (q) {
      const i = +q.dataset.i;
      if (on.has(i)) on.delete(i);
      else on.add(i);
      return fromPresets();
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
      const json = JSON.stringify(cleanSel(sel)),
        t = cardText(sel);
      setField('roesel', json);
      setField('roe', t);
      const d = dEl('roe');
      if (d && d.el) d.el.value = t;
      markMan();
      draw();
      roeClose();
    }
  };
  p.onchange = e => {
    const r = e.target.closest('.rpr');
    if (e.target.classList.contains('rpfr')) {
      sel.free = e.target.value.replace(/\r/g, '');
      return preview();
    }
    if (!r) return;
    const id = r.dataset.t,
      t = SOP.flatMap(x => x[1]).find(x => x[0] == id),
      v = sel.sop[id] || { o: null, t: '', c: false };
    if (e.target.tagName == 'SELECT') {
      const o = e.target.value;
      CUST.delete(id);
      if (!o) delete sel.sop[id];
      else if (o == '*') {
        CUST.add(id);
        sel.sop[id] = { o: null, t: v.t || sopShort(t, v) || '', c: true };
      } else sel.sop[id] = { o, t: '', c: v.o || v.t ? v.c : true }; // a topic just chosen goes on the card
      const row = document.createElement('div');
      row.innerHTML = sopRow(t);
      const nr = row.firstElementChild;
      r.replaceWith(nr);
      if (o == '*' && nr.querySelector('.rpi')) nr.querySelector('.rpi').focus();
      const g = nr.closest('.rpg');
      if (g)
        g.querySelector('summary em').textContent =
          [...g.querySelectorAll('.rpr')].filter(x => sel.sop[x.dataset.t]).length || '';
    } else if (e.target.type == 'checkbox') {
      if (sel.sop[id]) sel.sop[id].c = e.target.checked;
    }
    preview();
  };
  p.oninput = e => {
    if (e.target.classList.contains('rpi')) {
      const r = e.target.closest('.rpr'),
        id = r.dataset.t;
      sel.sop[id] = { o: null, t: e.target.value.slice(0, 120), c: sel.sop[id] ? sel.sop[id].c : true };
      preview();
    } else if (e.target.classList.contains('rpfr')) {
      sel.free = e.target.value.replace(/\r/g, '');
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
