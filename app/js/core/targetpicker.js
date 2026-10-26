// Dialog to pick a weapon target: category and search -> objective -> feature (building) or the objective centre.
// `data` = {objectives(): Promise<[{id,name,type,n,e,ocd}]>, features(obj): Promise<[{i,name,value,n,e}]>}, `fmt(n, e)` writes a position.
import { OBJ_TYPES } from './targets.js';
export async function openTargetPicker({ data, fmt, esc, anim, title }) {
  const d = document.createElement('dialog');
  d.className = 'tpk';
  d.innerHTML = `<h3>${esc(title || 'Choose a target')}</h3><div class="tpbar"><select class="tpcat"></select><input class="tpq" placeholder="Search by name" autocomplete="off"><span class="hint tpn"></span></div>
    <div class="tpcols"><div class="tplist tpobj"><div class="hint">Reading the objectives…</div></div><div class="tplist tpfeat"><div class="hint">Pick an objective on the left.</div></div></div>
    <div class="tpfoot"><span class="hint tpsel">Nothing selected.</span><span class="sp"></span><button type="button" class="btn g tpno">Cancel</button><button type="button" class="btn tpok nil">Apply</button></div>`;
  document.body.appendChild(d);
  const q = s => d.querySelector(s),
    cat = q('.tpcat'),
    qi = q('.tpq'),
    ol = q('.tpobj'),
    fl = q('.tpfeat'),
    ok = q('.tpok'),
    sel = q('.tpsel');
  let objs = [],
    cur = null,
    pick = null;
  const done = new Promise(res => {
    const close = v => {
      d.close();
      setTimeout(() => d.remove(), 200);
      res(v);
    };
    q('.tpno').onclick = () => close(null);
    d.addEventListener('cancel', e => {
      e.preventDefault();
      close(null);
    });
    ok.onclick = () => {
      if (!pick) return;
      close({
        n: pick.n,
        e: pick.e,
        elv: 0,
        name: pick.name,
      }); /* the elevation is the terrain height, filled in by the caller */
    };
  });
  d.showModal();
  const setPick = p => {
    pick = p;
    ok.classList.toggle('nil', !p);
    sel.textContent = p ? p.name + ' · ' + fmt(p.n, p.e) : 'Nothing selected.';
    fl.querySelectorAll('button').forEach(b => b.classList.toggle('on', p && b.dataset.k == p.key));
  };
  const drawObjs = () => {
    const t = cat.value,
      s = qi.value.trim().toLowerCase(),
      m = objs
        .filter(o => (t === '' || String(o.type) === t) && (!s || o.name.toLowerCase().includes(s)))
        .sort((a, b) => a.name.localeCompare(b.name));
    q('.tpn').textContent =
      m.length + ' objectives' + (m.length > 300 && t !== '' ? ' (first 300 shown, type to narrow)' : '');
    if (t === '' && !s) {
      ol.innerHTML = '<div class="hint">Choose a type above or type a name to see the objectives.</div>';
      return;
    }
    ol.innerHTML =
      m
        .slice(0, 300)
        .map(
          o =>
            `<button type="button" data-id="${o.id}" class="${cur && cur.id == o.id ? 'on' : ''}"><b>${esc(o.name)}</b><i>${esc(fmt(o.n, o.e))}</i></button>`
        )
        .join('') || '<div class="hint">None.</div>';
    ol.querySelectorAll('button').forEach(b => (b.onclick = () => chooseObj(objs.find(o => o.id == b.dataset.id))));
  };
  async function chooseObj(o) {
    cur = o;
    setPick(null);
    ol.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.id == o.id));
    fl.innerHTML = '<div class="hint">Reading…</div>';
    let fs = [],
      fe = '';
    try {
      fs = await data.features(o);
    } catch (e) {
      fs = [];
      fe = String((e && e.message) || e);
    }
    if (cur !== o) return;
    const rows = [
      { key: 'c', name: o.name, n: o.n, e: o.e, label: 'Objective centre', value: '' },
      ...fs.map(f => ({ key: 'f' + f.i, name: o.name + ' ' + f.name, n: f.n, e: f.e, label: f.name, value: f.value })),
    ];
    fl.innerHTML =
      '<div class="hint">Click a line, then Apply.</div>' +
      rows
        .map(
          r =>
            `<button type="button" data-k="${r.key}"><b>${esc(r.label)}</b><i>${esc(fmt(r.n, r.e))}${r.value !== '' ? ' · value ' + r.value : ''}</i></button>`
        )
        .join('') +
      (fs.length
        ? ''
        : '<div class="hint">' +
          (fe
            ? 'Could not read the features of this objective (' + esc(fe) + '); the centre can still be used.'
            : 'No features found for this objective (the centre is used).') +
          '</div>');
    if (!fs.length) setPick({ ...rows[0] });
    fl.querySelectorAll('button').forEach((b, i) => {
      b.onclick = () => setPick({ ...rows[i] });
      b.ondblclick = () => {
        setPick({ ...rows[i] });
        ok.click();
      };
    });
  }
  qi.oninput = drawObjs;
  cat.onchange = drawObjs;
  try {
    objs = await data.objectives();
  } catch (e) {
    ol.innerHTML = '<div class="hint">Could not read the objectives: ' + esc((e && e.message) || e) + '</div>';
    return done;
  }
  const cnt = {};
  objs.forEach(o => (cnt[o.type] = (cnt[o.type] || 0) + 1));
  cat.innerHTML =
    '<option value="">All types · ' +
    objs.length +
    '</option>' +
    Object.keys(cnt)
      .map(Number)
      .sort((a, b) => (OBJ_TYPES[a] || 'zz').localeCompare(OBJ_TYPES[b] || 'zz'))
      .map(t => `<option value="${t}">${esc(t < 0 ? 'Other' : OBJ_TYPES[t] || 'Type ' + t)} · ${cnt[t]}</option>`)
      .join('');
  drawObjs();
  qi.focus();
  if (objs.info) q('.tpsel').textContent = objs.info;
  return done;
}
