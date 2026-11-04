// Docs page: the charts (PDF, or PNG / JPG pictures as in the Balkans) and manuals (PDF) of Falcon BMS (Docs folder), with a big viewer and "Add to cards" for the Kneeboard.
// Charts: Docs\<n> ... Charts\<n> <country>\<airport (ICAO)>\<airport (ICAO)> - <type>.pdf; Manuals: every other PDF under Docs.
// deps: root, esc, docsDir() -> path | '' | null (null = not the desktop app), listDir(path) -> [{name,isDirectory}], readBytes(path) -> Uint8Array,
//       join(a,b), pdf: {open, render, renderTo, text}, addCard(blob, name), airports() -> [ICAO of the flight: departure, arrival], toast(msg),
//       anim() -> animations on, confirm(msg) -> Promise<boolean> (default: window.confirm)
// Viewer: one page at a time, or (switch "Scroll", remembered) all the pages one below the other, drawn only near the view.
// "All pages" asks first when the PDF has more than ALL_WARN pages, then shows where it is and can be cancelled.

// "All pages" asks first when the PDF has more pages than this: every page becomes a card of the Kneeboard
export const ALL_WARN = 20;
const SCROLL_KEY = 'bmsdocscroll'; // reading by scrolling: remembered, off at the first start
const readScroll = () => {
  try {
    return localStorage.getItem(SCROLL_KEY) === '1';
  } catch (e) {
    return false;
  }
};
const saveScroll = on => {
  try {
    localStorage.setItem(SCROLL_KEY, on ? '1' : '0');
  } catch (e) {
    /* no storage: the choice is not remembered */
  }
};

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
    scroll: readScroll(),
    adding: null,
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
  const anim = () => (deps.anim ? deps.anim() : true);
  // Scroll mode: every page has a slot (sized from its page, so the scroll bar is right at once); a page is drawn only while it is near the view.
  // gen = the generation of the view (a new one makes the drawing jobs of the old one stop), vp = size of every page at scale 1, jump = page being scrolled to
  const SC = { gen: 0, doc: null, box: null, slots: [], vp: [], raf: 0, jump: 0, jt: 0, q: Promise.resolve() };
  const scrollOn = () => !!(S.scroll && S.doc && !S.doc.img && S.doc.numPages > 1);
  // Width on the screen of a page (v = its size at scale 1) for the zoom: the whole width, the whole page, or a part of the width
  const fitW = (v, aw, ah) =>
    S.zoom == 'w' ? aw : S.zoom == 'p' ? Math.min(aw, (ah * v.width) / v.height) : Math.min(aw * 4, aw * S.zoom);
  const viewArea = vw => [Math.max(200, vw.clientWidth - 24), Math.max(200, vw.clientHeight - 24)];

  async function openFile(path, name) {
    const mine = ++seq;
    S.cur = { path, name };
    S.err = '';
    S.page = 1;
    S.thumbs = [];
    S.zoom = 0.5;
    if (S.adding) S.adding.stop = true; // the pages that were being added belong to the document that closes
    SC.gen++;
    SC.doc = null;
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
  // The page number, the arrows, the thumbnail and the zoom label follow the current page
  function syncNav(fromScroll) {
    if (!S.doc) return;
    const n = $('#dcn');
    if (n && !(fromScroll && document.activeElement === n)) n.value = S.page;
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
  // Go to page n: the page itself, or (scroll mode) scroll to it
  function gotoPage(n) {
    const N = S.doc ? S.doc.numPages : 1;
    n = Math.max(1, Math.min(N, Math.round(+n) || 1));
    if (scrollOn() && SC.doc === S.doc) jumpTo(n, true);
    else {
      S.page = n;
      showPage();
    }
  }
  let pageTok = 0;
  async function showPage() {
    const box = $('#dcpg');
    if (!box || !S.doc) return;
    if (scrollOn()) return showScroll();
    leaveScroll();
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
    const [aw, ah] = viewArea(vw),
      w = fitW(v1, aw, ah);
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
    syncNav();
  }

  // ---- scroll mode: the pages one below the other
  // Back to one page at a time: the slots go away and their canvases are freed
  function leaveScroll() {
    if (!SC.doc && !SC.slots.length) return;
    SC.gen++;
    SC.slots.forEach(s => {
      const c = s.firstChild;
      if (c && c.tagName == 'CANVAS') c.width = 0;
    });
    Object.assign(SC, { doc: null, box: null, slots: [], vp: [], jump: 0 });
    clearTimeout(SC.jt);
    const box = $('#dcpg'),
      vw = $('#dcvw');
    if (box) box.className = '';
    if (vw) {
      vw.classList.remove('dcscv');
      vw.scrollTop = 0;
      vw.scrollLeft = 0;
    }
  }
  async function pageSize(doc, n) {
    const page = await doc.getPage(n),
      v = page.getViewport({ scale: 1 });
    page.cleanup();
    return { width: v.width, height: v.height };
  }
  async function showScroll() {
    const box = $('#dcpg'),
      vw = $('#dcvw'),
      doc = S.doc;
    if (!box || !vw || !doc) return;
    const tok = ++pageTok,
      N = doc.numPages;
    let fresh = false;
    if (SC.doc !== doc || SC.box !== box) {
      const g = ++SC.gen;
      let first;
      try {
        first = await pageSize(doc, 1);
      } catch (e) {
        return;
      }
      if (tok != pageTok || S.doc !== doc || !box.isConnected) return;
      SC.doc = doc;
      SC.box = box;
      SC.vp = Array.from({ length: N }, () => first); // all the pages as page 1 until their real size is read
      SC.slots = Array.from({ length: N }, (_, i) => {
        const s = document.createElement('div');
        s.className = 'dcslot';
        s.dataset.n = i + 1;
        return s;
      });
      box.className = 'dcsc';
      vw.classList.add('dcscv');
      box.replaceChildren(...SC.slots);
      fresh = true;
      readSizes(g);
    }
    sizeScroll(fresh);
    tick();
    syncNav();
  }
  // The real size of every page, in the background (the slots start with the size of page 1)
  async function readSizes(g) {
    const doc = SC.doc,
      N = doc.numPages;
    for (let a = 2; a <= N; a += 12) {
      const ns = Array.from({ length: Math.min(12, N - a + 1) }, (_, j) => a + j);
      let vs;
      try {
        vs = await Promise.all(ns.map(n => pageSize(doc, n)));
      } catch (e) {
        return;
      }
      if (g != SC.gen) return;
      let ch = false;
      ns.forEach((n, j) => {
        const o = SC.vp[n - 1];
        if (Math.abs(o.width - vs[j].width) > 0.5 || Math.abs(o.height - vs[j].height) > 0.5) {
          SC.vp[n - 1] = vs[j];
          ch = true;
        }
      });
      if (ch) {
        sizeScroll();
        tick();
      }
      await new Promise(r => setTimeout(r, 0));
    }
  }
  // The page at the top of the view and how far into it the top is (so a change of sizes keeps the same place)
  function anchor(vw) {
    const st = vw.scrollTop;
    let i = 0;
    while (i < SC.slots.length - 1 && SC.slots[i + 1].offsetTop <= st) i++;
    const s = SC.slots[i];
    return { i, f: (st - s.offsetTop) / Math.max(1, s.offsetHeight) };
  }
  // Sizes of the slots from the zoom; the place in the document stays (go: go to the current page instead)
  function sizeScroll(go) {
    const vw = $('#dcvw');
    if (!vw || !SC.slots.length) return;
    const a = go ? null : anchor(vw),
      [aw, ah] = viewArea(vw);
    SC.slots.forEach((s, i) => {
      const v = SC.vp[i],
        w = Math.round(fitW(v, aw, ah)),
        h = Math.round((w * v.height) / v.width);
      if (s._w0 !== w || s._h0 !== h) {
        s.style.width = w + 'px';
        s.style.height = h + 'px';
        s._w0 = w;
        s._h0 = h;
      }
    });
    if (go) {
      holdJump(S.page, 300);
      vw.scrollTop = SC.slots[S.page - 1].offsetTop - 12;
    } else {
      const s = SC.slots[a.i];
      vw.scrollTop = s.offsetTop + a.f * s.offsetHeight;
    }
  }
  // While the view is going to a page (an arrow, a thumbnail, the number), the pages passed on the way do not become the current page
  function holdJump(n, ms) {
    SC.jump = n;
    clearTimeout(SC.jt);
    SC.jt = setTimeout(endJump, ms);
  }
  function endJump() {
    SC.jump = 0;
    tick();
  }
  function jumpTo(n, smooth) {
    const vw = $('#dcvw'),
      s = SC.slots[n - 1];
    if (!vw || !s) return;
    S.page = n;
    syncNav();
    holdJump(n, 900);
    vw.scrollTo({ top: s.offsetTop - 12, behavior: smooth && anim() ? 'smooth' : 'auto' });
  }
  // The drawing width of a slot in pixels (not more than 36 million pixels: the size is limited, the picture is then stretched)
  const pxW = s =>
    Math.min(Math.round(s._w0 * (window.devicePixelRatio || 1)), Math.floor(Math.sqrt((36e6 * s._w0) / s._h0)));
  function need(i) {
    const s = SC.slots[i],
      pw = pxW(s);
    s._want = true;
    if (s._pw === pw || s._busy === pw) return;
    s._busy = pw;
    const g = SC.gen,
      doc = SC.doc;
    SC.q = SC.q.then(async () => {
      try {
        if (g != SC.gen || !s._want || s._busy !== pw) return;
        const cv = await deps.pdf.renderTo(doc, i + 1, { width: pw });
        if (g != SC.gen || !s._want || s._busy !== pw) {
          cv.width = 0;
          return;
        }
        s.replaceChildren(cv);
        s._pw = pw;
        s.classList.add('rd');
      } catch (e) {
        /* a page that cannot be drawn keeps its number */
      } finally {
        if (s._busy === pw) s._busy = 0;
      }
    });
  }
  function drop(i) {
    const s = SC.slots[i];
    s._want = false;
    if (!s._pw) return;
    const c = s.firstChild;
    if (c && c.tagName == 'CANVAS') c.width = 0;
    s.replaceChildren();
    s._pw = 0;
    s.classList.remove('rd');
  }
  // After a scroll or a change of sizes: the page in view is the current page; the pages near the view are drawn, the far ones freed
  function tick() {
    const vw = $('#dcvw');
    if (!vw || !scrollOn() || SC.doc !== S.doc || SC.box !== $('#dcpg')) return;
    const st = vw.scrollTop,
      hh = vw.clientHeight,
      m = Math.max(400, hh * 0.75),
      mid = st + hh / 2,
      N = SC.slots.length;
    let cur = 0;
    SC.slots.forEach((s, i) => {
      const t = s.offsetTop,
        b = t + s.offsetHeight;
      if (!cur && mid < b + 6) cur = i + 1;
      if (b > st - m && t < st + hh + m) need(i);
      else drop(i);
    });
    if (SC.jump || vw.scrollHeight <= hh + 1) return; // going to a page / everything is in view: the page stays the one chosen
    if (st <= 1) cur = 1;
    else if (st + hh >= vw.scrollHeight - 1) cur = N;
    cur = cur || N;
    if (cur != S.page) {
      S.page = cur;
      syncNav(true);
    }
  }
  function onScroll() {
    if (SC.jump) holdJump(SC.jump, 140);
    if (SC.raf) return;
    SC.raf = requestAnimationFrame(() => {
      SC.raf = 0;
      tick();
    });
  }

  // ---- thumbnails (kept when the view is drawn again)
  async function thumbs(mine) {
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
        d.onclick = () => gotoPage(n);
        S.thumbs.push(d);
        const col = $('#dcth');
        if (col) col.append(d);
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
      <button class="btn g" id="dcprev" title="Previous page (←)">◀</button><input id="dcn" type="number" min="1" max="${N}" value="${S.page}"><span class="hint">/ ${N}</span><button class="btn g" id="dcnext" title="Next page (→)">▶</button>${N > 1 ? `<button type="button" class="dsw${S.scroll ? ' on' : ''}" id="dcsc" role="switch" aria-checked="${S.scroll}" title="Read the pages one below the other, scrolling (off: one page at a time)"><i></i>Scroll</button>` : ''}
      <span class="dcsep"></span><button class="btn g" id="dczo" title="Zoom out">−</button><span id="dcz" class="hint" style="min-width:42px;text-align:center"></span><button class="btn g" id="dczi" title="Zoom in">+</button><button class="btn g" id="dcfw" title="Fit the width">Width</button><button class="btn g" id="dcfp" title="Fit the whole page">Page</button>
      <span class="dcsep"></span><button class="btn gn" id="dcadd" title="Add this page to the unused cards of the Kneeboard (it goes into the first free slot)">Add page to cards</button>${N > 1 ? '<button class="btn g" id="dcall" title="Add every page of this PDF to the Kneeboard cards">All pages</button>' : ''}</div>
      <div class="dcbody">${N > 1 && N <= 40 ? '<div class="dcth" id="dcth"></div>' : ''}<div class="dcvw" id="dcvw"><div id="dcpg"></div></div></div>`;
    const col = $('#dcth');
    if (col && S.thumbs.length) col.append(...S.thumbs);
    $('#dcprev').onclick = () => gotoPage(S.page - 1);
    $('#dcnext').onclick = () => gotoPage(S.page + 1);
    $('#dcn').onchange = e => gotoPage(e.target.value);
    const sc = $('#dcsc');
    if (sc)
      sc.onclick = () => {
        S.scroll = !S.scroll;
        saveScroll(S.scroll);
        sc.classList.toggle('on', S.scroll);
        sc.setAttribute('aria-checked', String(S.scroll));
        showPage();
      };
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
    $('#dcadd').onclick = () => addPages([S.page]); // the page in view (the one of the number box)
    const al = $('#dcall');
    if (al)
      al.onclick = () =>
        addPages(
          Array.from({ length: N }, (_, i) => i + 1),
          true
        );
    const vw = $('#dcvw');
    vw.onwheel = e => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      S.zoom = Math.max(0.3, Math.min(4, zf() * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      showPage();
    };
    vw.addEventListener('scroll', onScroll, { passive: true });
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
    progress(true);
  }

  // ---- pages to the Kneeboard
  // The strip under the toolbar while several pages are being added: where it is, a bar, Cancel
  function progress(quiet) {
    const run = S.adding,
      v = $('#dcview');
    ['#dcadd', '#dcall'].forEach(s => {
      const b = $(s);
      if (b) b.disabled = !!run;
    });
    if (!v) return;
    let p = $('#dcprog');
    if (p && p._closing) {
      p.remove();
      p = null;
    }
    if (!run || run.n < 2) {
      if (!p) return;
      if (quiet || !anim() || !p.animate) return p.remove();
      p._closing = true;
      const cs = getComputedStyle(p);
      p.style.overflow = 'hidden';
      const a = p.animate(
        [
          { height: p.offsetHeight + 'px', paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, opacity: 1 },
          { height: '0px', paddingTop: '0px', paddingBottom: '0px', opacity: 0 },
        ],
        { duration: 160, easing: 'ease-in' }
      );
      a.onfinish = a.oncancel = () => p.remove();
      return;
    }
    if (!p) {
      const tb = $('.dctb');
      if (!tb) return;
      p = document.createElement('div');
      p.id = 'dcprog';
      p.className = 'dcprog';
      p.innerHTML =
        '<span class="dcpt" id="dcpt"></span><span class="dcpb"><i id="dcpi"></i></span><button type="button" class="btn g sm" id="dcpx" title="Stop here: the pages already added stay in the Kneeboard">Cancel</button>';
      tb.after(p);
      p.querySelector('#dcpx').onclick = () => {
        if (S.adding) S.adding.stop = true;
        progress();
      };
      if (!quiet && anim() && p.animate) {
        const cs = getComputedStyle(p);
        p.style.overflow = 'hidden';
        const a = p.animate(
          [
            { height: '0px', paddingTop: '0px', paddingBottom: '0px', opacity: 0 },
            { height: p.offsetHeight + 'px', paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, opacity: 1 },
          ],
          { duration: 180, easing: 'ease-out' }
        );
        a.onfinish = a.oncancel = () => {
          p.style.overflow = '';
        };
      }
    }
    p.querySelector('#dcpt').textContent = run.stop
      ? 'Stopping…'
      : 'Adding page ' + Math.min(run.k + 1, run.n) + ' of ' + run.n + '…';
    p.querySelector('#dcpi').style.width = (run.k / run.n) * 100 + '%';
    p.querySelector('#dcpx').disabled = !!run.stop;
  }
  // list = the pages to add (each becomes a card); all = it is the "All pages" button: a long PDF asks first
  async function addPages(list, all) {
    const doc = S.doc;
    if (!doc || S.adding) return;
    if (all && list.length > ALL_WARN) {
      const ask = deps.confirm || (m => window.confirm(m)),
        n = list.length;
      if (
        !(await ask(
          `This PDF has ${n} pages.\n\nAdding all of them makes ${n} new cards in the Kneeboard: the first ones go into the free slots, the others stay among the unused cards. It can take a while.\n\nAdd all ${n} pages?`
        ))
      )
        return;
      if (doc !== S.doc || S.adding) return; // another document was opened while the question was open
    }
    const name = baseName(),
      run = { n: list.length, k: 0, stop: false };
    S.adding = run;
    progress();
    let err = '';
    try {
      for (const n of list) {
        if (run.stop) break;
        const r = doc.img ? { blob: doc.blob } : await deps.pdf.render(doc, n);
        if (run.stop) break;
        await deps.addCard(r.blob, name + (doc.numPages > 1 ? ' p.' + n : ''));
        run.k++;
        progress();
        await new Promise(r => setTimeout(r, 0)); // the bar is drawn and a click on Cancel arrives
      }
    } catch (e) {
      if (!run.stop) err = String((e && e.message) || e);
    }
    S.adding = null;
    progress();
    if (!deps.toast) return;
    const k = run.k,
      pages = k + ' page' + (k == 1 ? '' : 's');
    if (err) deps.toast('Could not add the page: ' + err + (k ? ' (' + pages + ' added before the error).' : ''));
    else if (run.stop) deps.toast('Stopped: ' + k + ' of ' + run.n + ' pages added to the Kneeboard cards.');
    else deps.toast(pages + ' added to the Kneeboard cards.');
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
