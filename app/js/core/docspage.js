// Docs page: the charts (PDF, or PNG / JPG pictures as in the Balkans) and manuals (PDF) of Falcon BMS (Docs folder), with a big viewer and "Add to cards" for the Kneeboard.
// Charts: Docs\<n> ... Charts\<n> <country>\<airport (ICAO)>\<airport (ICAO)> - <type>.pdf; Manuals: every other PDF under Docs.
// deps: root, esc, docsDir() -> path | '' | null (null = not the desktop app), listDir(path) -> [{name,isDirectory}], readBytes(path) -> Uint8Array,
//       join(a,b), pdf: {open, render, renderTo, text}, addCard(blob, name), airports() -> [ICAO of the flight: departure, arrival], toast(msg)

export const clean = s =>
  String(s)
    .replace(/^\d+\s+/, '')
    .replace(/\.(pdf|png|jpe?g)$/i, '')
    .replace(/_/g, ' ');
export const icaoOf = name => {
  const m = String(name).match(/\(([A-Z0-9]{3,4})\)\s*$/);
  return m ? m[1] : '';
};
// "Gunsan AB (RKJK) - ILS.pdf" -> "ILS"; "Gunsan AB (RKJK)_APC_RWY 18.pdf" -> "APC RWY 18"
export function chartName(file) {
  const base = String(file).replace(/\.(pdf|png|jpe?g)$/i, ''),
    m = base.match(/\([A-Z0-9]{3,4}\)\s*[-_ ]*(.*)$/),
    t = ((m ? m[1] : base) || base).replace(/_/g, ' ').trim();
  return t || base;
}
const isPdf = n => /\.pdf$/i.test(n),
  isImg = n => /\.(png|jpe?g)$/i.test(n); // the charts of some theaters (Balkans) are PNG pictures
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

// Folder tree: {name, path, dirs: [node], files: [{name, path}]}; empty folders are dropped.
export async function scanTree(listDir, join, path, name, { depth = 5, budget = { n: 8000 }, img = false } = {}) {
  const node = { name, path, dirs: [], files: [] };
  let ents = [];
  try {
    ents = (await listDir(path)) || [];
  } catch (e) {
    ents = [];
  }
  const kids = [];
  for (const e of ents) {
    if (budget.n-- <= 0) break;
    if (e.isDirectory) {
      if (depth > 0) kids.push(e);
    } else if (isPdf(e.name) || (img && isImg(e.name))) node.files.push({ name: e.name, path: join(path, e.name) });
  }
  const subs = await Promise.all(
    kids.map(e => scanTree(listDir, join, join(path, e.name), e.name, { depth: depth - 1, budget, img }))
  );
  node.dirs = subs.filter(d => d.files.length || d.dirs.length).sort(byName);
  node.files.sort(byName);
  return node;
}
const count = n => n.files.length + n.dirs.reduce((a, d) => a + count(d), 0);
// The tree reduced to the files (and folders) matching the words of q; null when nothing matches.
export function filterTree(n, q, trail = '') {
  const words = String(q || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return n;
  const here = (trail + ' ' + n.name).toLowerCase();
  const files = n.files.filter(f => words.every(w => (here + ' ' + f.name.toLowerCase()).includes(w)));
  const dirs = n.dirs.map(d => filterTree(d, q, trail + ' ' + n.name)).filter(Boolean);
  return files.length || dirs.length ? { ...n, files, dirs } : null;
}
export function findAirports(n, icao, out = []) {
  if (icaoOf(n.name) == icao && n.files.length) out.push(n);
  n.dirs.forEach(d => findAirports(d, icao, out));
  return out;
}

export function createDocsPage(deps) {
  const { root, esc } = deps;
  const S = {
    tab: 'charts',
    q: '',
    open: new Set(),
    trees: {},
    loading: '',
    cur: null,
    doc: null,
    page: 1,
    zoom: 0.5,
    thumbs: [],
    err: '',
  };
  let seq = 0,
    built = false;
  const $ = s => root.querySelector(s);

  async function loadTrees() {
    const dir = deps.docsDir();
    if (!dir) return;
    const cds = deps.chartDirs ? deps.chartDirs() : [dir],
      key = dir + '|' + cds.join('|');
    if (S.trees.dir === key) return;
    S.trees = { dir: key };
    S.loading = 'Reading the Docs folder…';
    draw();
    try {
      const mine = ++seq,
        charts = [];
      for (const cd of cds) {
        const top = (await deps.listDir(cd)) || [],
          ch = top.filter(e => e.isDirectory && /chart/i.test(e.name));
        charts.push(
          ...(await Promise.all(
            ch.map(e =>
              scanTree(deps.listDir, deps.join, deps.join(cd, e.name), e.name, { budget: { n: 60000 }, img: true })
            )
          ))
        );
      }
      const man = await scanTree(deps.listDir, deps.join, dir, 'Docs', { depth: 5, budget: { n: 8000 } });
      man.dirs = man.dirs.filter(d => !/chart/i.test(d.name));
      if (mine != seq || S.trees.dir !== key) return;
      S.trees = { dir: key, charts, manuals: man };
      charts.forEach(c => c.dirs.forEach(d => S.open.add(d.path)));
      man.dirs.forEach(d => S.open.add(d.path)); // the first level is open at the start
    } catch (e) {
      S.trees = { dir: key, charts: [], manuals: null, err: String((e && e.message) || e) };
    }
    S.loading = '';
    draw();
  }

  // ---- list (left)
  const fileRow = (f, label, sub) =>
    `<button type="button" class="dcf${S.cur && S.cur.path == f.path ? ' on' : ''}" data-f="${esc(f.path)}" data-n="${esc(f.name)}" title="${esc(f.name)}">${esc(label)}${sub ? ` <small>${esc(sub)}</small>` : ''}</button>`;
  function dirHtml(n, lvl, charts) {
    const ic = charts ? icaoOf(n.name) : '',
      open = S.q.trim() || S.open.has(n.path);
    const items =
      n.dirs.map(d => dirHtml(d, lvl + 1, charts)).join('') +
      n.files.map(f => fileRow(f, ic ? chartName(f.name) : clean(f.name))).join('');
    return `<details class="dcd${lvl == 0 ? ' dcm' : ''}${n.files.length ? ' dcp' : ''}" data-p="${esc(n.path)}"${open ? ' open' : ''}><summary>${esc(clean(n.name))}${ic ? ` <small>${esc(ic)}</small>` : ''}<em>${count(n)}</em></summary><div class="dcb">${items}</div></details>`;
  }
  function listHtml() {
    const dir = deps.docsDir();
    if (dir === null)
      return '<p class="hint">The charts and manuals are read from the Docs folder of Falcon BMS: only in the desktop app.</p>';
    if (!dir) return '<p class="hint">Set the Falcon BMS folder in Settings first.</p>';
    if (S.loading) return `<p class="hint">${esc(S.loading)}</p>`;
    const T = S.trees;
    if (T.err) return `<p class="hint">The Docs folder could not be read: ${esc(T.err)}</p>`;
    if (S.tab == 'charts') {
      if (!T.charts || !T.charts.length)
        return '<p class="hint">No charts folder found in the Docs folder of the theater (for example "03 KTO Charts" or "01 Balkans Charts").</p>';
      const q = S.q.trim(),
        fl = !q ? (deps.airports() || []).filter(Boolean).filter((v, i, a) => a.indexOf(v) == i) : [];
      let h = '';
      if (fl.length) {
        const found = fl.map(ic => ({ ic, n: T.charts.flatMap(c => findAirports(c, ic)) })).filter(x => x.n.length);
        if (found.length)
          h +=
            `<h4>Airports of the flight</h4>` +
            found
              .map(x =>
                x.n
                  .map(
                    a =>
                      `<div class="dcfl"><b>${esc(clean(a.name))}</b>${a.files.map(f => fileRow(f, chartName(f.name))).join('')}</div>`
                  )
                  .join('')
              )
              .join('');
      }
      const tr = T.charts.map(c => filterTree(c, q)).filter(Boolean);
      h +=
        (h ? '<h4>All charts</h4>' : '') +
        (tr.length
          ? tr
              .map(
                c =>
                  c.dirs.map(d => dirHtml(d, 0, true)).join('') + c.files.map(f => fileRow(f, clean(f.name))).join('')
              )
              .join('')
          : '<p class="hint">No chart matches.</p>');
      return h;
    }
    const m = T.manuals && filterTree(T.manuals, S.q.trim());
    return m
      ? m.dirs.map(d => dirHtml(d, 0, false)).join('') + m.files.map(f => fileRow(f, clean(f.name))).join('')
      : '<p class="hint">No manual found (PDF files in the Docs folder and its subfolders).</p>';
  }

  // ---- viewer (right)
  const baseName = () => (S.cur ? String(S.cur.name).replace(/\.(pdf|png|jpe?g)$/i, '') : '');
  async function openFile(path, name) {
    const mine = ++seq;
    S.cur = { path, name };
    S.err = '';
    S.page = 1;
    S.thumbs = [];
    S.zoom = 0.5;
    if (S.doc) {
      try {
        S.doc.destroy();
      } catch (e) {
        /* closed */
      }
      S.doc = null;
    }
    drawView();
    markSel();
    try {
      let doc;
      if (isImg(name)) {
        const bytes = await deps.readBytes(path),
          blob = new Blob([bytes], { type: /\.png$/i.test(name) ? 'image/png' : 'image/jpeg' }),
          img = await createImageBitmap(blob);
        doc = {
          numPages: 1,
          img,
          blob,
          destroy() {
            try {
              img.close();
            } catch (e) {
              /* closed */
            }
          },
        };
      } else doc = await deps.pdf.open(await deps.readBytes(path));
      if (mine != seq) {
        doc.destroy();
        return;
      }
      S.doc = doc;
      drawView();
      showPage();
      if (doc.numPages > 1 && doc.numPages <= 40) thumbs(mine);
    } catch (e) {
      if (mine == seq) {
        S.err = 'This PDF could not be read: ' + String((e && e.message) || e);
        drawView();
      }
    }
  }
  const markSel = () =>
    root.querySelectorAll('.dcf').forEach(b => b.classList.toggle('on', !!S.cur && b.dataset.f == S.cur.path));
  let pageTok = 0;
  async function showPage() {
    const box = $('#dcpg');
    if (!box || !S.doc) return;
    const tok = ++pageTok,
      vw = $('#dcvw'),
      dpr = window.devicePixelRatio || 1;
    let v1;
    if (S.doc.img) v1 = { width: S.doc.img.width, height: S.doc.img.height };
    else {
      const page = await S.doc.getPage(S.page);
      v1 = page.getViewport({ scale: 1 });
      page.cleanup();
    }
    const aw = Math.max(200, vw.clientWidth - 24),
      ah = Math.max(200, vw.clientHeight - 24);
    const w =
      S.zoom == 'w' ? aw : S.zoom == 'p' ? Math.min(aw, (ah * v1.width) / v1.height) : Math.min(aw * 4, aw * S.zoom);
    let cv;
    if (S.doc.img) {
      cv = document.createElement('canvas');
      cv.width = Math.round(w * dpr);
      cv.height = Math.round((w * dpr * v1.height) / v1.width);
      const g = cv.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(S.doc.img, 0, 0, cv.width, cv.height);
    } else cv = await deps.pdf.renderTo(S.doc, S.page, { width: Math.round(w * dpr) });
    if (tok != pageTok) return;
    cv.style.width = Math.round(w) + 'px';
    cv.style.height = 'auto';
    cv.className = 'dcpage';
    box.replaceChildren(cv);
    const n = $('#dcn');
    if (n) n.value = S.page;
    const pv = $('#dcprev'),
      nx = $('#dcnext');
    if (pv) pv.disabled = S.page <= 1;
    if (nx) nx.disabled = S.page >= S.doc.numPages;
    root.querySelectorAll('.dct').forEach(t => t.classList.toggle('on', +t.dataset.n == S.page));
    const cur = root.querySelector('.dct.on');
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
    const zl = $('#dcz');
    if (zl) zl.textContent = S.zoom == 'w' ? 'width' : S.zoom == 'p' ? 'page' : Math.round(S.zoom * 100) + '%';
  }
  async function thumbs(mine) {
    const col = $('#dcth');
    if (!col) return;
    for (let n = 1; n <= S.doc.numPages; n++) {
      if (mine != seq || !S.doc) return;
      try {
        const cv = await deps.pdf.renderTo(S.doc, n, { width: 150 }),
          txt = await deps.pdf.text(S.doc, n),
          m = txt.match(/\b[A-Z]{4}\s+AD\s+CHART\s+[\d\s-]*\d/) || [];
        if (mine != seq) return;
        const d = document.createElement('button');
        d.type = 'button';
        d.className = 'dct' + (n == S.page ? ' on' : '');
        d.dataset.n = n;
        cv.style.width = '100%';
        cv.style.height = 'auto';
        const cap = document.createElement('span');
        cap.textContent = m[0] ? m[0].replace(/\s+/g, ' ').replace(/ AD CHART /, ' ') : 'p.' + n;
        d.title = txt.slice(0, 160);
        d.append(cv, cap);
        d.onclick = () => {
          S.page = n;
          showPage();
        };
        col.append(d);
      } catch (e) {
        /* page without preview */
      }
    }
  }
  function drawView() {
    const v = $('#dcview');
    if (!v) return;
    if (!S.cur) {
      v.innerHTML = `<div class="dcemp">${S.tab == 'charts' ? 'Pick a chart on the left.' : 'Pick a manual on the left.'}</div>`;
      return;
    }
    if (S.err) {
      v.innerHTML = `<div class="dcemp">${esc(S.err)}</div>`;
      return;
    }
    if (!S.doc) {
      v.innerHTML = '<div class="dcemp">Opening…</div>';
      return;
    }
    const N = S.doc.numPages;
    v.innerHTML = `<div class="dctb"><b title="${esc(S.cur.name)}">${esc(S.tab == 'charts' ? baseName() : clean(S.cur.name))}</b><span class="dcsp"></span>
      <button class="btn g" id="dcprev" title="Previous page (←)">◀</button><input id="dcn" type="number" min="1" max="${N}" value="${S.page}"><span class="hint">/ ${N}</span><button class="btn g" id="dcnext" title="Next page (→)">▶</button>
      <span class="dcsep"></span><button class="btn g" id="dczo" title="Zoom out">−</button><span id="dcz" class="hint" style="min-width:42px;text-align:center"></span><button class="btn g" id="dczi" title="Zoom in">+</button><button class="btn g" id="dcfw" title="Fit the width">Width</button><button class="btn g" id="dcfp" title="Fit the whole page">Page</button>
      <span class="dcsep"></span><button class="btn gn" id="dcadd" title="Add this page to the unused cards of the Kneeboard (it goes into the first free slot)">Add page to cards</button>${N > 1 ? '<button class="btn g" id="dcall" title="Add every page of this PDF to the Kneeboard cards">All pages</button>' : ''}</div>
      <div class="dcbody">${N > 1 && N <= 40 ? '<div class="dcth" id="dcth"></div>' : ''}<div class="dcvw" id="dcvw"><div id="dcpg"></div></div></div>`;
    const go = n => {
      n = Math.max(1, Math.min(N, Math.round(+n) || 1));
      if (n != S.page) {
        S.page = n;
        showPage();
      } else showPage();
    };
    $('#dcprev').onclick = () => go(S.page - 1);
    $('#dcnext').onclick = () => go(S.page + 1);
    $('#dcn').onchange = e => go(e.target.value);
    const zf = () => (S.zoom == 'w' ? 1 : S.zoom == 'p' ? 1 : S.zoom);
    $('#dczi').onclick = () => {
      S.zoom = Math.min(4, zf() * 1.25);
      showPage();
    };
    $('#dczo').onclick = () => {
      S.zoom = Math.max(0.3, zf() / 1.25);
      showPage();
    };
    $('#dcfw').onclick = () => {
      S.zoom = 'w';
      showPage();
    };
    $('#dcfp').onclick = () => {
      S.zoom = 'p';
      showPage();
    };
    $('#dcadd').onclick = () => addPages([S.page]);
    const al = $('#dcall');
    if (al) al.onclick = () => addPages(Array.from({ length: N }, (_, i) => i + 1));
    const vw = $('#dcvw');
    vw.onwheel = e => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      S.zoom = Math.max(0.3, Math.min(4, zf() * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      showPage();
    };
    let drag = null;
    vw.onpointerdown = e => {
      if (e.button) return;
      drag = { x: e.clientX, y: e.clientY, l: vw.scrollLeft, t: vw.scrollTop };
      vw.setPointerCapture(e.pointerId);
      vw.classList.add('grab');
    };
    vw.onpointermove = e => {
      if (drag) {
        vw.scrollLeft = drag.l - (e.clientX - drag.x);
        vw.scrollTop = drag.t - (e.clientY - drag.y);
      }
    };
    vw.onpointerup = vw.onpointercancel = () => {
      drag = null;
      vw.classList.remove('grab');
    };
  }
  async function addPages(list) {
    const doc = S.doc;
    if (!doc) return;
    const btn = $('#dcadd');
    if (btn) btn.disabled = true;
    let k = 0;
    try {
      for (const n of list) {
        const r = doc.img ? { blob: doc.blob } : await deps.pdf.render(doc, n);
        await deps.addCard(r.blob, baseName() + (doc.numPages > 1 ? ' p.' + n : ''));
        k++;
      }
      deps.toast && deps.toast(k + ' page' + (k == 1 ? '' : 's') + ' added to the Kneeboard cards.');
    } catch (e) {
      deps.toast && deps.toast('Could not add the page: ' + String((e && e.message) || e));
    }
    if (btn) btn.disabled = false;
  }

  // Open / close a folder with a short animation; closing a folder closes the folders inside it too
  function fold(d) {
    const body = d.querySelector(':scope > .dcb'),
      anim = deps.anim ? deps.anim() : true,
      searching = !!S.q.trim();
    if (d.open) {
      if (!searching) {
        S.open.delete(d.dataset.p);
        d.querySelectorAll('details[data-p]').forEach(x => S.open.delete(x.dataset.p));
      }
      const done = () => {
        d.open = false;
        d.querySelectorAll('details[open]').forEach(x => {
          x.open = false;
        });
        if (body) {
          body.style.height = '';
          body.style.opacity = '';
        }
      };
      if (anim && body && body.animate) {
        const h = body.offsetHeight;
        body.style.overflow = 'hidden';
        const a = body.animate(
          [
            { height: h + 'px', opacity: 1 },
            { height: '0px', opacity: 0 },
          ],
          { duration: 160, easing: 'ease-in' }
        );
        a.onfinish = a.oncancel = () => {
          done();
          body.style.overflow = '';
        };
      } else done();
    } else {
      if (!searching) S.open.add(d.dataset.p);
      d.open = true;
      if (anim && body && body.animate) {
        const h = body.offsetHeight;
        body.style.overflow = 'hidden';
        const a = body.animate(
          [
            { height: '0px', opacity: 0 },
            { height: h + 'px', opacity: 1 },
          ],
          { duration: 180, easing: 'ease-out' }
        );
        a.onfinish = a.oncancel = () => {
          body.style.overflow = '';
        };
      }
    }
  }
  // ---- shell
  function build() {
    built = true;
    root.innerHTML = `<div class="dcw"><div class="wtabs" role="tablist" id="dctabs"><button type="button" role="tab" data-tab="charts">Charts</button><button type="button" role="tab" data-tab="manuals">Manuals</button></div>
      <div class="dcg2"><aside class="dcl"><input id="dcq" type="search" placeholder="Search…" autocomplete="off"><div id="dclist" class="dcls"></div></aside><div id="dcview" class="dcvv"></div></div></div>`;
    root.querySelectorAll('#dctabs button').forEach(
      b =>
        (b.onclick = () => {
          S.tab = b.dataset.tab;
          S.q = '';
          $('#dcq').value = '';
          draw();
        })
    );
    $('#dcq').oninput = e => {
      S.q = e.target.value;
      drawList();
    };
    $('#dclist').onclick = e => {
      const b = e.target.closest('.dcf');
      if (b) openFile(b.dataset.f, b.dataset.n);
    };
    $('#dclist').addEventListener('click', e => {
      const sm = e.target.closest('summary');
      if (!sm) return;
      e.preventDefault();
      fold(sm.parentElement);
    });
    root.onkeydown = e => {
      if (!S.doc || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key == 'ArrowRight' || e.key == 'PageDown') {
        $('#dcnext') && $('#dcnext').click();
      } else if (e.key == 'ArrowLeft' || e.key == 'PageUp') {
        $('#dcprev') && $('#dcprev').click();
      }
    };
    root.tabIndex = -1;
    new ResizeObserver(() => {
      if (S.doc && root.offsetParent) {
        clearTimeout(build.t);
        build.t = setTimeout(showPage, 150);
      }
    }).observe(root);
  }
  function drawList() {
    const l = $('#dclist');
    if (l) {
      const sc = l.scrollTop;
      l.innerHTML = listHtml();
      l.scrollTop = sc;
    }
  }
  function draw() {
    if (!built) build();
    root.querySelectorAll('#dctabs button').forEach(b => b.classList.toggle('on', b.dataset.tab == S.tab));
    drawList();
    drawView();
    if (S.doc) showPage();
  }
  return {
    render() {
      if (!root.isConnected || root.closest('.hide')) return;
      draw();
      loadTrees();
    },
    refresh() {
      S.trees = {};
    },
    state: () => S,
  };
}
