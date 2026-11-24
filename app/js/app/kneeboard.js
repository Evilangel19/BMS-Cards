import {
  DEFAULT_SLOTS,
  ROWS,
  KB_SETS,
  setFor,
  autoDir,
  fitRect,
  rowFile,
  rowUsed,
  parsePages,
  cycleNext,
} from '../core/kneeboard.js';
import { pickAll } from '../core/tgdlg.js';
import { createDocsPage } from '../core/docspage.js';
import {
  listDir,
  readBytes,
  join as joinPath,
  onFilesDropped,
  isDesktop,
  pickFiles,
  appDir,
  fileExists,
  writeBytes,
  saveBlob as saveFile,
  makeDir,
  removeFile,
  loadPrefs,
  savePrefs,
  saveConfig,
  findOkb,
} from '../platform/desktop.js';
import { pdfOpen, pdfRender, pdfRenderTo, pdfPageText } from '../platform/pdf.js';
import * as PJ from '../core/mission.js';
import { toDDS5, toDDS } from '../core/dds.js';
import { toneRGBA } from '../core/tone.js';
import { setCardDark, cardDark, darkPixels, inkDc } from '../core/cardink.js';
import { busyStart, busySet, busyEnd } from '../core/busy.js';
// the look of the cards drawn from now on (SEAD, DEAD, Attack, Weather): light or dark, kept in this browser / program
try {
  setCardDark(localStorage.getItem('bmscarddark') === '1');
} catch (e) {}
import { ST } from './state.js';
import { $, IO, animOn, appToast, enc8, esc, jp } from './base.js';
import { draw, gapless, MSHOT, mdcDraw } from './cardview.js';
import { F, FD } from './datacard.js';

// cards: the pictures go into cards/, the arrangement into cards.json
export async function msfCards(dir) {
  const cd = joinPath(dir, 'cards');
  await IO.makeDir(cd);
  const files = new Map(),
    alts = {},
    keepOther = new Set(); // the other looks: kept by the memory too (it removes the files it did not write)
  let n = 0;
  for (const it of KBLIB) {
    const ext = (it.blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg'),
      fn = String(++n).padStart(2, '0') + '_' + PJ.safeName(it.name) + '.' + ext;
    files.set(it, fn);
    await IO.writeBytes(joinPath(cd, fn), new Uint8Array(await it.blob.arrayBuffer()));
    // a card made by the program: its other look (light / dark) beside it
    if (it.other) {
      const af = fn.replace(/\.[^.]+$/, '') + '.other.png';
      await IO.writeBytes(joinPath(cd, af), new Uint8Array(await it.other.arrayBuffer()));
      alts[fn] = { file: af, dark: !!it.dark, fixed: !!it.fixed };
      keepOther.add(af);
    }
  }
  const slot = sl =>
    sl.kind == 'pic' && files.has(sl.item)
      ? { kind: 'pic', mode: sl.mode, file: files.get(sl.item), name: sl.item.name }
      : { kind: sl.kind, mode: sl.mode };
  const cj = a => a.map(r => ({ left: slot(r.left), right: slot(r.right) }));
  await IO.writeBytes(
    joinPath(dir, PJ.missionFolder.cards),
    enc8(
      JSON.stringify(
        {
          version: 1,
          fmt: KBFMT,
          fit: KBFIT,
          slots: cj(KBS),
          default: cj(KBDEF),
          theater: KBTHNOW,
          theaters: Object.fromEntries(
            Object.entries(KBTH)
              .filter(([n]) => n !== KBTHNOW)
              .map(([n, a]) => [n, cj(a)])
          ),
          library: [...files.values()],
          looks: alts,
        },
        null,
        1
      )
    )
  );
  return new Set([...files.values(), ...keepOther]);
}
// merge: the cards of a mission file are added to the cards already in memory (same name and size = the same card) and the arrangement in memory is kept
export async function msfCardsLoad(dir, merge) {
  try {
    const cj = JSON.parse(new TextDecoder().decode(await readBytes(joinPath(dir, PJ.missionFolder.cards)))),
      lib = new Map(),
      had = merge && KBLIB.length > 0;
    if (!merge) KBLIB = [];
    for (const fn of cj.library || []) {
      try {
        const b = await readBytes(joinPath(joinPath(dir, 'cards'), fn)),
          ext = fn.split('.').pop().toLowerCase(),
          nm = fn.replace(/^\d+_/, '').replace(/\.[^.]+$/, '');
        const old = merge ? KBLIB.find(x => x.name === nm && x.blob && x.blob.size === b.length) : null;
        if (old) {
          lib.set(fn, old);
          continue;
        }
        const it = await kbMakeItem(new Blob([b], { type: ext == 'jpg' ? 'image/jpeg' : 'image/' + ext }), nm),
          lk = cj.looks && cj.looks[fn];
        if (lk)
          try {
            it.other = new Blob([await readBytes(joinPath(joinPath(dir, 'cards'), lk.file))], { type: 'image/png' });
            it.dark = !!lk.dark;
            it.fixed = !!lk.fixed;
          } catch (e) {}
        lib.set(fn, it);
        KBLIB.push(it);
      } catch (e) {}
    }
    await kbLook(cardDark()); // the cards of two looks in the look chosen now
    if (had) return true;
    const slot = sl =>
      sl.kind == 'pic'
        ? lib.has(sl.file)
          ? { kind: 'pic', mode: sl.mode, item: lib.get(sl.file) }
          : { kind: 'empty', mode: 'fill' }
        : { kind: sl.kind, mode: sl.mode };
    const rs = a => a.map(r => ({ left: slot(r.left), right: slot(r.right) }));
    KBS = rs(cj.slots);
    KBDEF = rs(cj.default || cj.slots);
    KBTH = Object.fromEntries(Object.entries(cj.theaters || {}).map(([n, a]) => [n, rs(a)]));
    KBTHNOW = cj.theater || '';
    KBFMT = cj.fmt || 'dxt1';
    KBFIT = !!cj.fit;
    return true;
  } catch (e) {
    return false;
  }
}
// The cards (imported pictures and their arrangement) are kept in the program folder (cardmemory) and loaded when the program starts: they serve every flight and mission
export let KBMEMSIG = '';
export let KBMEMT = 0;
export let KBMEMOK = false; // KBMEMOK: the memory has been read (or there is none yet); before that nothing may be written to it
export function kbMemLater() {
  if (!isDesktop()) return;
  clearTimeout(KBMEMT);
  KBMEMT = setTimeout(kbMemSave, 900);
}
// After the cards were imported from another copy of the program (Settings > Import & backup) what the program holds in its memory is the old state:
// it must not be written over the imported files until the program is started again.
export function kbMemFreeze() {
  clearTimeout(KBMEMT);
  KBMEMOK = false;
}
export async function kbMemSave() {
  if (!KBMEMOK) return;
  try {
    const sg = a =>
        a.map(r => [
          r.left.kind,
          r.left.item && r.left.item.name,
          r.left.mode,
          r.right.kind,
          r.right.item && r.right.item.name,
          r.right.mode,
        ]),
      sig = JSON.stringify([
        sg(KBS),
        sg(KBDEF),
        KBTHNOW,
        Object.keys(KBTH)
          .sort()
          .map(n => [n, sg(KBTH[n])]),
        KBLIB.map(i => [i.name, i.blob.size]),
        KBFMT,
        KBFIT,
      ]);
    if (sig === KBMEMSIG) return;
    const dir = joinPath(await IO.appDir(), 'cardmemory');
    await IO.makeDir(dir);
    const keep = await msfCards(dir);
    KBMEMSIG = sig;
    try {
      const cd = joinPath(dir, 'cards');
      for (const e of await listDir(cd))
        if (!e.isDirectory && !keep.has(e.name)) await IO.removeFile(joinPath(cd, e.name));
    } catch (e) {}
  } catch (e) {}
}
export async function kbMemLoad() {
  if (!isDesktop()) return;
  try {
    const dir = joinPath(await IO.appDir(), 'cardmemory');
    if (!(await IO.fileExists(joinPath(dir, PJ.missionFolder.cards)))) return;
    if (await msfCardsLoad(dir, false)) {
      KBMEMSIG = '';
      kbSyncTheater(ST.TH && ST.TH.name);
      if (!$('kn').classList.contains('hide')) kbRender();
    }
  } catch (e) {
  } finally {
    KBMEMOK = true;
  }
}
/* ---------- Kneeboard tab (row i -> 7982+i .dds, left | right) ---------- */
export let KBTH = {};
export let KBTHNOW = ''; // the arrangement of the cards of each theater (KBTH: theater -> slots; KBTHNOW: the theater whose arrangement is in KBS); the pictures are one library for all
export let KBDRAGGED = false;
export let KBS;
export let KBSEL = 0;
export let KBFMT = 'dxt1';
export let KBLIB = [];
ST.KBG = null;
export let KBTR = [];
// the look of the datacard pages on the kneeboard (the page of the program stays light): dark by the Light / Dark cards button, or by the ☀ / ☾ of the card
// (then fixed). A pseudo card: KBCARD is it when a datacard page is chosen.
export const KBDC = { dc: true, name: 'Datacard', other: true, dark: false, fixed: false };
try {
  const o = JSON.parse(localStorage.getItem('bmsdclook') || 'null');
  if (o) Object.assign(KBDC, { dark: !!o.dark, fixed: !!o.fixed });
} catch (e) {
  /* light */
}
const dcLookSave = () => {
  try {
    localStorage.setItem('bmsdclook', JSON.stringify({ dark: KBDC.dark, fixed: KBDC.fixed }));
  } catch (e) {
    /* not kept */
  }
};
// the datacard pages as written: light, or turned dark (the map or target picture on it as it is). The dark one is kept until the card is drawn again.
let DCK = null;
export function kbDcPages() {
  if (!KBDC.dark) return gapless();
  const v = (ST.CVV || 0) + (ST.MDCON ? 'm' : 'c');
  if (DCK && DCK.v === v) return DCK.c;
  const cv = /** @type {HTMLCanvasElement} */ ($('cv')),
    c = document.createElement('canvas');
  c.width = cv.width;
  c.height = cv.height;
  if (ST.MDCON) {
    // the MDC format is drawn by the program: drawn again, its colours turned as they are drawn
    mdcDraw(inkDc(c.getContext('2d')), true);
    DCK = { v, c: gapless(c) };
    return DCK.c;
  }
  // the Datacard is a picture (its form): turned pixel by pixel
  const x = c.getContext('2d');
  x.drawImage(cv, 0, 0);
  const im = x.getImageData(0, 0, c.width, c.height),
    keep = ST.MAPSHOT
      ? [
          ST.MDCON
            ? [
                (MSHOT[0] * 2048) / 1600,
                (MSHOT[1] * 2048) / 1200,
                (MSHOT[2] * 2048) / 1600,
                (MSHOT[3] * 2048) / 1200,
              ].map(Math.round)
            : [1048, 1290, 564, 752],
        ]
      : [];
  darkPixels(im.data, c.width, c.height, keep);
  x.putImageData(im, 0, 0);
  DCK = { v, c: gapless(c) };
  return DCK.c;
}
// a card made by the program (its page can make it again, in both looks): by its name
const kbProg = it => /^(SEAD|DEAD|Attack|Target|Weather|ROE \/ SOP)\b/.test(String((it && it.name) || ''));
export let KBCARD = null; // the picture card chosen for "Send card…" (click a card: in a slot or among the unused ones)
// hooks set by the squadron page (the modules cannot import each other): send(item) opens the choice of pilots
export const KBX = { send: null, can: () => false, src: {} }; // src: the cards of the pages for Add all cards (set by them)
export let KBFIT = false;
export const kbUsedKind = k => KBS.some(r => r.left.kind == k || r.right.kind == k);
export const kbUsedItem = it =>
  KBS.some(r => (r.left.kind == 'pic' && r.left.item === it) || (r.right.kind == 'pic' && r.right.item === it));
// Cards not placed in any slot: the datacard pages and the imported pictures.
export function kbTray() {
  const t = [];
  if (!kbUsedKind('dcl')) t.push({ kind: 'dcl' });
  if (!kbUsedKind('dcr')) t.push({ kind: 'dcr' });
  KBLIB.forEach(it => {
    if (!kbUsedItem(it)) t.push({ kind: 'pic', item: it });
  });
  return t;
}
// A card is kept when another theater's arrangement, or the default, still uses it
export const kbKept = it => {
  const u = a => a.some(r => ['left', 'right'].some(k => r[k].kind == 'pic' && r[k].item === it));
  return u(KBDEF) || Object.entries(KBTH).some(([n, a]) => n !== KBTHNOW && u(a));
};
export function kbDelete(it) {
  KBLIB = KBLIB.filter(x => x !== it);
  Object.values(KBTH).forEach(a =>
    a.forEach(r =>
      ['left', 'right'].forEach(k => {
        if (r[k].kind == 'pic' && r[k].item === it) r[k] = { kind: 'empty', mode: 'fill' };
      })
    )
  );
  KBS.forEach(r =>
    ['left', 'right'].forEach(k => {
      if (r[k].kind == 'pic' && r[k].item === it) r[k] = { kind: 'empty', mode: 'fill' };
    })
  );
}
export const kbCopy = a => a.map(r => ({ left: { ...r.left }, right: { ...r.right } }));
export let KBDEF;
// Set Default: blue, dimmed once the current cards are the default; Load: green
function kbDefBtns() {
  // Save is dimmed when nothing differs from the last Save: the same test as the dot of the tab and the button of the tab bar
  const sv = $('kbsave');
  if (sv) sv.classList.toggle('nil', !kbUnsaved());
  const a = $('kbdef');
  if (!a || !KBDEF) return;
  const same = JSON.stringify(kbCopy(KBS)) === JSON.stringify(kbCopy(KBDEF));
  a.classList.toggle('nil', same);
}
// Another theater: its own arrangement of the cards comes back (what was placed there), the pictures stay in the one library. A theater without an arrangement starts from the current one.
// Set Default / Load do not depend on the theater.
export function kbSyncTheater(name) {
  if (!name) return;
  if (!KBTHNOW) {
    KBTHNOW = name;
    return;
  }
  if (KBTHNOW === name) return;
  KBTH[KBTHNOW] = kbCopy(KBS);
  if (KBTH[name]) KBS = kbCopy(KBTH[name]);
  KBTHNOW = name;
  KBSEL = 0;
  kbMemLater();
  if (!$('kn').classList.contains('hide')) kbRender();
}
export const kbEmpty = () =>
  Array.from({ length: ROWS }, () => ({
    left: { kind: 'empty', mode: 'fill' },
    right: { kind: 'empty', mode: 'fill' },
  }));
export const kbDir = () => ST.CFG.paths.kneeboardDir || autoDir(joinPath, ST.CFG.paths.bmsInstall);
// Draw a slot into (dx,dy,dw,dh); the page is laid out in 1024x2048 texture units.
export function kbPage(ctx, sl, dx, dy, dw, dh) {
  ctx.save();
  ctx.translate(dx, dy);
  ctx.scale(dw / 1024, dh / 2048);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 1024, 2048);
  if (sl.kind == 'dcl' || sl.kind == 'dcr') {
    if (!ST.KBG) ST.KBG = kbDcPages();
    ctx.drawImage(ST.KBG, sl.kind == 'dcl' ? 0 : 1024, 0, 1024, 2048, 0, 0, 1024, 2048);
  } else if (sl.kind == 'pic' && sl.item) {
    const it = sl.item,
      im = it.src || it.mid;
    if (im) {
      const r = fitRect(it.w, it.h, KBFIT ? 'fit' : 'fill');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(im, r.x, r.y, r.w, r.h);
    }
  }
  ctx.restore();
}
// the sample of Settings > Kneeboard: the top of the left page of the row chosen (else of the datacard), w x h
export function kbToneSample(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d'),
    s = KBS[KBSEL] && KBS[KBSEL].left.kind != 'empty' ? KBS[KBSEL] : KBS[0];
  x.fillStyle = '#fff';
  x.fillRect(0, 0, w, h);
  ST.KBG = null;
  draw(); // the datacard as it is now
  const p = document.createElement('canvas');
  p.width = 1024;
  p.height = 2048;
  kbPage(p.getContext('2d'), s.left, 0, 0, 1024, 2048);
  x.imageSmoothingQuality = 'high';
  x.drawImage(p, 0, 0, 1024, (1024 * h) / w, 0, 0, w, h);
  return c;
}
// the Cockpit tone of the settings (Settings > Kneeboard)
export function kbTone() {
  const k = (ST.CFG && ST.CFG.kneeboard) || {};
  return { on: k.toneOn !== false, bright: k.toneBright ?? -50, contrast: k.toneContrast ?? 100, dark: !!k.toneDark };
}
export function kbRow(i) {
  const s = KBS[i];
  if (i == 0 && s.left.kind == 'dcl' && s.right.kind == 'dcr') return kbDcPages();
  const c = document.createElement('canvas');
  c.width = c.height = 2048;
  const x = c.getContext('2d');
  ST.KBG = null;
  kbPage(x, s.left, 0, 0, 1024, 2048);
  kbPage(x, s.right, 1024, 0, 1024, 2048);
  return c;
}
export const kbName = sl =>
  ({ empty: 'Empty', dcl: 'Datacard Left', dcr: 'Datacard Right' })[sl.kind] || (sl.item && sl.item.name) || 'Picture';
export function kbThumbs() {
  ST.KBG = null;
  draw();
  kbDefBtns();
  document.querySelectorAll('#kn canvas.kbt').forEach(c => {
    const sl = c.dataset.i !== undefined ? KBTR[+c.dataset.i] : KBS[+c.dataset.r][c.dataset.s],
      x = c.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, c.width, c.height);
    if (sl.kind == 'empty') {
      x.fillStyle = '#0003';
      x.fillRect(0, 0, c.width, c.height);
    } else kbPage(x, sl, 0, 0, c.width, c.height);
  });
  const pv = $('kbpv');
  if (pv) {
    const x = pv.getContext('2d'),
      s = KBS[KBSEL];
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.fillStyle = '#fff';
    x.fillRect(0, 0, pv.width, pv.height);
    x.imageSmoothingQuality = 'high';
    kbPage(x, s.left, 0, 0, pv.width / 2, pv.height);
    kbPage(x, s.right, pv.width / 2, 0, pv.width / 2, pv.height);
    // the page as it goes into the cockpit: with the Cockpit tone of the settings
    const im = x.getImageData(0, 0, pv.width, pv.height);
    toneRGBA(im.data, pv.width, pv.height, kbTone());
    x.putImageData(im, 0, 0);
    x.fillStyle = '#8886';
    x.fillRect(pv.width / 2 - 1, 0, 2, pv.height);
  }
  const cp = $('kbcap');
  if (cp)
    cp.textContent =
      'Row ' +
      (KBSEL + 1) +
      ' → ' +
      rowFile(KBSEL, kbSet()) +
      (rowUsed(KBS[KBSEL], KBSEL) ? '' : ' (empty: not written)') +
      ' · ' +
      kbSet().name +
      ' files' +
      ' · Left: ' +
      kbName(KBS[KBSEL].left) +
      ' · Right: ' +
      kbName(KBS[KBSEL].right);
}
// Imported pictures are kept as compressed files plus a small preview; the full image is decoded only while a card is placed (keeps memory low with big PDFs).
export async function kbMakeItem(blob, name) {
  const bm = await createImageBitmap(blob),
    w = bm.width,
    h = bm.height,
    sc = Math.min(1, 640 / h),
    mid = document.createElement('canvas');
  mid.width = Math.max(1, Math.round(w * sc));
  mid.height = Math.max(1, Math.round(h * sc));
  const x = mid.getContext('2d');
  x.imageSmoothingQuality = 'high';
  x.drawImage(bm, 0, 0, mid.width, mid.height);
  bm.close();
  return { name, w, h, blob, mid, src: null };
}
// A map screenshot (a canvas of one card, 1024 x 2048) becomes a new card and goes by itself into the first free slot (left column first)
// alt: the same card in the other look (light / dark), dark: the look of blob; the kneeboard shows the look chosen (kbLook)
export async function kbAddPic(blob, name, alt, dark) {
  const it = await kbMakeItem(blob, name);
  if (alt) {
    it.other = alt;
    it.dark = !!dark;
  }
  if (it.other && it.dark != cardDark()) await kbSwapLook(it);
  KBLIB.push(it);
  let side = null,
    row = -1;
  for (const sd of ['left', 'right']) {
    row = KBS.findIndex(r => r[sd].kind == 'empty');
    if (row >= 0) {
      side = sd;
      break;
    }
  }
  if (side) Object.assign(KBS[row][side], { kind: 'pic', item: it, mode: 'fill' });
  kbRender();
  return side ? { side, row } : null;
}
// ADD ALL CARDS: every card the pages can make for the flight (SEAD, DEAD, Attack, Weather, Target, ROE / SOP; not the documents), in both looks, shown in
// a window to choose them on their pictures, then put into the free slots (else among the unused cards)
const ALL_SRC = [
  ['sead', 'SEAD'],
  ['dead', 'DEAD'],
  ['atk', 'Attack'],
  ['faor', 'DCA'],
  ['oca', 'OCA'],
  ['wx', 'Weather'],
  ['tgt', 'Target'],
  ['roe', 'ROE / SOP'],
];
export async function kbAddAll(kind = 'classic') {
  const L = [],
    none = [],
    bid = busyStart('Making the cards…', true),
    tab0 = document.querySelector('.tab.on[data-t]'),
    cover = document.createElement('div'); // the pages with a map make their cards on screen: the Kneeboard stays in front
  cover.id = 'kbcover';
  cover.innerHTML = '<span>Making the cards…</span>';
  document.body.append(cover);
  if (KBX.begin) KBX.begin();
  try {
    for (let i = 0; i < ALL_SRC.length; i++) {
      const [k, l] = ALL_SRC[i],
        f = KBX.src[k];
      busySet(bid, (i / ALL_SRC.length) * 100, 'Making the cards: ' + l + '…');
      await new Promise(r => setTimeout(r, 20));
      let got = [];
      try {
        got = f ? (await f()) || [] : [];
      } catch (e) {
        got = [];
      }
      got = got.filter(c => /^Smart\b/.test(String(c.name || '')) == (kind == 'smart'));
      if (got.length) got.forEach(c => L.push({ ...c, src: l }));
      else none.push(l);
    }
  } finally {
    try {
      if (KBX.end) await KBX.end();
    } catch (e) {
      /* the pages as they are */
    }
    const t = /** @type {HTMLElement|null} */ (tab0 && !tab0.classList.contains('on') ? tab0 : null);
    if (t) t.click();
    await new Promise(r => setTimeout(r, 150));
    cover.remove();
    busyEnd(bid);
  }
  if (!L.length)
    return alert(
      'No card to make for this flight: open its pages first (Weapons, Weather, ROE / SOP) and choose what to plan.',
      'bad'
    );
  const on = L.map(c => !c.off),
    d = document.createElement('dialog');
  d.className = 'tgdlg kball';
  d.innerHTML = `<h3>Add all ${kind == 'smart' ? 'Smart' : 'classic'} cards to the Kneeboard</h3><p class="hint">The cards the program can make for this flight, ${cardDark() ? 'dark' : 'light'} as chosen (each keeps the other look too). Click a card to leave it out. They go into the free slots of the Kneeboard; when there is no free slot, among the unused cards.${none.length ? ' Nothing to make for: ' + none.join(', ') + '.' : ''}</p><div class="tgcards"></div><div class="tgbar"><span class="hint tgn"></span><span class="tgsp"></span><button type="button" class="btn g" data-a="no">Cancel</button><button type="button" class="btn" data-a="ok">Add</button></div>`;
  document.body.append(d);
  const cnt = () => {
    const n = on.filter(Boolean).length,
      b = d.querySelector('[data-a=ok]');
    b.textContent = n ? `Add ${n} card${n > 1 ? 's' : ''}` : 'Add';
    b.classList.toggle('nil', !n);
  };
  L.forEach((c, i) => {
    const it = document.createElement('button');
    it.type = 'button';
    it.className = 'tgcard' + (on[i] ? ' on' : '');
    const th = document.createElement('canvas');
    th.width = 200;
    th.height = 300;
    th.getContext('2d').drawImage(c.c, 0, 0, 200, 300);
    it.append(th);
    const s = document.createElement('span');
    s.textContent = c.label;
    it.append(s);
    it.onclick = () => {
      on[i] = !on[i];
      it.classList.toggle('on', on[i]);
      cnt();
    };
    d.querySelector('.tgcards').append(it);
  });
  cnt();
  const close = () => {
    d.close();
    d.remove();
  };
  pickAll(d); // Select all / none
  d.querySelector('[data-a=no]').onclick = close;
  d.addEventListener('cancel', e => {
    e.preventDefault();
    close();
  });
  d.querySelector('[data-a=ok]').onclick = async () => {
    const pick = L.filter((c, i) => on[i]);
    if (!pick.length) return;
    close();
    let slots = 0;
    const ab = busyStart('Adding the cards…', true);
    try {
      for (const c of pick) {
        const b = await new Promise(r => c.c.toBlob(r, 'image/png')),
          a = await new Promise(r => c.alt.toBlob(r, 'image/png'));
        if (b && (await kbAddPic(b, c.name, a, c.dark))) slots++;
        busySet(ab, ((pick.indexOf(c) + 1) / pick.length) * 100);
      }
    } finally {
      busyEnd(ab);
    }
    kbRender();
    kbMemLater();
    $('kbst').textContent =
      pick.length +
      ' card' +
      (pick.length > 1 ? 's' : '') +
      ' added: ' +
      slots +
      ' into free slots' +
      (pick.length > slots ? ', ' + (pick.length - slots) + ' among the unused cards' : '') +
      '.';
  };
  d.showModal();
}
// a card with two looks takes the other one (its picture, its small copy)
async function kbSwapLook(it) {
  if (it.dc) {
    it.dark = !it.dark;
    dcLookSave();
    return;
  }
  const o = it.other;
  it.other = it.blob;
  it.blob = o;
  it.dark = !it.dark;
  const m = await kbMakeItem(o, it.name);
  it.mid = m.mid;
  it.w = m.w;
  it.h = m.h;
  if (it.src)
    try {
      it.src.close();
    } catch (e) {}
  it.src = null;
}
// every card made by the program in the look chosen (Light / Dark cards): the others (imported pages, maps) stay as they are
export async function kbLook(dark) {
  let n = 0;
  if (!KBDC.fixed && KBDC.dark != !!dark) {
    KBDC.dark = !!dark;
    dcLookSave();
    n++;
  }
  for (const it of KBLIB)
    if (it.other && !it.fixed && !!it.dark != !!dark) {
      await kbSwapLook(it);
      n++;
    }
  return n;
}
// A card received from a pilot goes among the unused cards (never into a slot, never over another card)
export async function kbAddTray(blob, name) {
  const it = await kbMakeItem(blob, name);
  KBLIB.push(it);
  kbMemLater();
  kbRender(true);
  return it;
}
// "One map screenshot" (Settings > General): the new picture takes the place of the last map screenshot, in every slot that holds it (this theater, the others,
// the default arrangement) or among the unused cards; the pages of the Docs and the other cards are not touched
async function kbReplaceShot(blob) {
  const old = [...KBLIB].reverse().find(i => /^Map screenshot/.test(i.name));
  if (!old) return null;
  const it = await kbMakeItem(blob, 'Map screenshot');
  KBLIB = KBLIB.map(x => (x === old ? it : x));
  const swap = a =>
    (a || []).forEach(r =>
      ['left', 'right'].forEach(k => {
        if (r[k].kind == 'pic' && r[k].item === old) r[k] = { ...r[k], item: it };
      })
    );
  swap(KBS);
  swap(KBDEF);
  Object.values(KBTH).forEach(swap);
  for (const sd of ['left', 'right']) {
    const row = KBS.findIndex(r => r[sd].kind == 'pic' && r[sd].item === it);
    if (row >= 0) return { side: sd, row };
  }
  return { tray: true };
}
export async function kbAddShot(c) {
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  if (!blob) return alert('The screenshot could not be saved.', 'bad');
  if (ST.CFG && ST.CFG.ui && ST.CFG.ui.oneMapShot) {
    const at = await kbReplaceShot(blob);
    if (at) {
      kbMemLater();
      kbRender(true);
      const st = $('kbst');
      if (st)
        st.textContent =
          'Map screenshot replaced' +
          (at.tray ? ' (among the unused cards).' : ' on the ' + at.side + ' column, card ' + (at.row + 1) + '.');
      return;
    }
  }
  const n = KBLIB.filter(i => /^Map screenshot/.test(i.name)).length + 1,
    at = await kbAddPic(blob, 'Map screenshot ' + n);
  const st = $('kbst');
  if (st)
    st.textContent =
      'Map screenshot added' +
      (at
        ? ' to the ' + at.side + ' column, card ' + (at.row + 1) + '.'
        : ' (no free slot: it is among the unused cards).');
}
// Docs tab: the charts and manuals (PDF) of the Docs folder of Falcon BMS; a page goes to the first free card of the Kneeboard
export const dcIcaos = () => {
  const o = [];
  if (F.__dep && F.__dep[0]) o.push(F.__dep[0]);
  const a = F.__ab && F.__ab[1],
    m = a && String(a[1]).match(/\((\w+)\)/);
  if (m) o.push(m[1]);
  return o;
};
export let dcPage;
export async function kbDecodeUsed() {
  let again = false;
  const used = new Set();
  KBS.forEach(r =>
    ['left', 'right'].forEach(k => {
      if (r[k].kind == 'pic' && r[k].item) used.add(r[k].item);
    })
  );
  for (const it of used)
    if (!it.src && it.blob) {
      try {
        it.src = await createImageBitmap(it.blob);
        again = true;
      } catch (e) {}
    }
  KBLIB.forEach(it => {
    if (!used.has(it) && it.src) {
      try {
        it.src.close();
      } catch (e) {}
      it.src = null;
    }
  });
  return again;
}
export const KBMAXP = 40;
// Dropping files on the Kneeboard tab imports them (no file dialog needed, which also avoids the Windows PDF preview).
export const kbSlotAt = pos => {
  if (!pos) return null;
  const u = document.elementFromPoint(pos.x, pos.y),
    c = u && u.closest ? u.closest('div.kbt[data-s]') : null;
  return c && $('kn').contains(c) ? c : null;
};
export function askPages(name, total) {
  return new Promise(res => {
    const d = document.createElement('dialog');
    d.style.maxWidth = '460px';
    d.innerHTML = `<h3 style="margin:0 0 6px">${esc(name)}</h3><p class="hint" style="margin:0 0 10px">This PDF has ${total} pages. Which ones do you want to import? Examples: 1-5, 8, 10-12 (at most ${KBMAXP} at a time).</p><input id="pgin" value="1-${Math.min(8, total)}" style="width:100%"><div id="pgerr" class="hint" style="color:#e66;min-height:1.4em;margin-top:6px"></div><div class="bar" style="justify-content:flex-end;margin-top:6px"><button class="btn g" id="pgno">Cancel</button><button class="btn" id="pgok">Import</button></div>`;
    document.body.append(d);
    d.showModal();
    const inp = d.querySelector('#pgin');
    inp.focus();
    inp.select();
    const done = v => {
      d.close();
      d.remove();
      res(v);
    };
    const go = () => {
      const r = parsePages(inp.value, total, KBMAXP);
      if (r.error) {
        d.querySelector('#pgerr').textContent = r.error;
        return;
      }
      done(r.pages);
    };
    d.querySelector('#pgok').onclick = go;
    d.querySelector('#pgno').onclick = () => done(null);
    d.oncancel = e => {
      e.preventDefault();
      done(null);
    };
    inp.onkeydown = e => {
      if (e.key == 'Enter') go();
    };
  });
}
export async function kbImport(files, side, row) {
  const added = [];
  const st = $('kbst');
  for (const f of files) {
    const ext = (f.name.match(/\.([^.]+)$/) || [, ''])[1].toLowerCase();
    try {
      if (ext == 'pdf') {
        st.textContent = 'Opening ' + f.name + '…';
        const doc = await pdfOpen(new Uint8Array(await f.arrayBuffer()));
        try {
          const total = doc.numPages;
          let pages = Array.from({ length: total }, (_, i) => i + 1);
          if (total > 8) {
            pages = await askPages(f.name, total);
            if (!pages) continue;
          }
          let k = 0;
          for (const n of pages) {
            st.textContent = 'Reading ' + f.name + ' p.' + n + ' (' + ++k + ' of ' + pages.length + ')…';
            const r = await pdfRender(doc, n);
            added.push(await kbMakeItem(r.blob, f.name + (total > 1 ? ' p.' + n : '')));
          }
        } finally {
          await doc.destroy();
        }
      } else added.push(await kbMakeItem(f, f.name));
    } catch (e) {
      alert('Could not read ' + f.name + (ext == 'pdf' ? ' (PDF)' : '') + ': ' + ((e && e.message) || e), 'bad');
    }
  }
  if (!added.length) {
    st.textContent = '';
    return;
  }
  KBLIB.push(...added);
  if (side == null) {
    kbRender();
    $('kbst').textContent = added.length + ' card(s) imported: drag them from the unused cards onto the kneeboard.';
    return;
  }
  // first page goes to the clicked slot, the following ones to the next empty slots of the same side
  let r = row,
    n = 0;
  for (const it of added) {
    while (r < ROWS && r != row && KBS[r][side].kind != 'empty') r++;
    if (r >= ROWS) break;
    Object.assign(KBS[r][side], { kind: 'pic', item: it, mode: 'fill' });
    r++;
    n++;
  }
  const msg =
    added.length +
    ' page(s) imported' +
    (n < added.length ? ' · ' + (added.length - n) + ' left in the cycle list (no free slot)' : '') +
    '.';
  kbRender();
  $('kbst').textContent = msg;
}
export function kbMenu(side, row, ev) {
  closeKbMenu();
  const sl = KBS[row][side],
    m = document.createElement('div');
  m.id = 'kbmenu';
  m.innerHTML = `<div class="mh">Row ${row + 1} · ${side == 'left' ? 'Left' : 'Right'}</div><div class="mc"><button class="btn g" data-a="prev">◀</button><span>${esc(kbName(sl))}</span><button class="btn g" data-a="next">▶</button></div>
 <button class="btn" data-a="imp">📥 Import images…</button><button class="btn g" data-a="clr">✖ Empty</button>`;
  document.body.append(m);
  const r = ev.target.getBoundingClientRect();
  m.style.left = Math.min(r.left, innerWidth - 250) + 'px';
  m.style.top = Math.min(r.bottom + 4, innerHeight - 190) + 'px';
  m.onclick = async e => {
    const a = e.target.dataset.a;
    if (!a) return;
    if (a == 'prev' || a == 'next') {
      const o = cycleNext(sl, KBLIB, a == 'next' ? 1 : -1);
      sl.kind = o.kind;
      sl.item = o.item;
      sl.mode = sl.mode || 'fill';
      m.querySelector('span').textContent = kbName(sl);
      kbThumbs();
      kbRender(true);
    } else if (a == 'clr') {
      sl.kind = 'empty';
      sl.item = null;
      closeKbMenu();
      kbRender();
    } else if (a == 'imp') {
      closeKbMenu();
      const fs = await pickFiles({
        exts: ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
        title: 'Kneeboard pages (images or PDF)',
      });
      if (fs.length) kbImport(fs, side, row);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', kbOut), 0);
}
export function kbOut(e) {
  const m = $('kbmenu');
  if (m && !m.contains(e.target)) closeKbMenu();
}
export function closeKbMenu() {
  const m = $('kbmenu');
  if (m) m.remove();
  document.removeEventListener('mousedown', kbOut);
}
// drop a card between two others: it goes before / after the card under the pointer and the cards of that column move on until the first empty slot
// (with none free the last card of the column leaves the kneeboard and stays among the unused ones)
export function kbInsert(src, dst, zone, card) {
  const n = KBS.length,
    emp = () => ({ kind: 'empty', mode: 'fill' });
  let idx = dst.r + (zone == 'a' ? 1 : 0);
  const mine = src.tray === undefined && src.s === dst.s && src.r === dst.r;
  if (mine) return false;
  if (idx >= n) {
    if (src.tray === undefined && src.s === dst.s && src.r === n - 1) return false;
    idx = n - 1;
    if (zone == 'a') {
      /* after the last slot: it takes that slot's place only if it is empty */ if (KBS[n - 1][dst.s].kind != 'empty')
        return false;
    }
  }
  const keep = { kind: card.kind, item: card.item, mode: card.mode || 'fill' };
  if (src.tray === undefined) KBS[src.r][src.s] = emp();
  const col = KBS.map(r => r[dst.s]);
  // the nearest free slot of the column takes the shift: below the drop point the cards move down, above it they move up; with no free slot the last card leaves
  const d = col.findIndex((c, i) => i >= idx && c.kind == 'empty');
  let u = -1;
  for (let i = idx - 1; i >= 0; i--)
    if (col[i].kind == 'empty') {
      u = i;
      break;
    }
  if (d >= 0 && (u < 0 || d - idx <= idx - 1 - u)) {
    for (let k = d; k > idx; k--) col[k] = col[k - 1];
    col[idx] = keep;
  } else if (u >= 0) {
    for (let k = u; k < idx - 1; k++) col[k] = col[k + 1];
    col[idx - 1] = keep;
  } else {
    for (let k = n - 1; k > idx; k--) col[k] = col[k - 1];
    col[idx] = keep;
  }
  KBS.forEach((r, i) => (r[dst.s] = col[i]));
  return true;
}
export function kbRender(keepMenu) {
  const el = $('kn');
  if (!el) return;
  kbMemLater();
  if (!keepMenu) closeKbMenu();
  const DM = animOn();
  KBTR = kbTray();
  const grid = (side, btns) =>
    `<div class="kbside"><div><h3>${side == 'left' ? 'Left' : 'Right'}</h3><div class="kbgrid">${KBS.map((s, r) => `<div class="kbt${r == KBSEL ? ' sel' : ''}" data-s="${side}" data-r="${r}"><canvas class="kbt" width="192" height="288" data-s="${side}" data-r="${r}"></canvas><span>${r + 1}</span></div>`).join('')}</div></div><div class="kbbtns ${side}">${btns}</div></div>`;
  const tray = DM
    ? `<div id="kbtray"><div class="hint" style="margin:0 0 6px">Unused cards — drag them onto the kneeboard · drop a card on the bin to delete it, click the bin to empty this area</div><div class="kbtw">${KBTR.map((c, i) => `<div class="kbt kbtr" data-i="${i}" title="${esc(kbName(c))}"><canvas class="kbt" width="144" height="216" data-i="${i}"></canvas></div>`).join('')}<div id="kbtrash" title="Click to delete all unused imported cards, or drop a card here to delete it">🗑</div></div></div>`
    : '';
  el.innerHTML = `<style>.kbw{display:grid;grid-template-columns:auto minmax(300px,1fr) auto;gap:18px;align-items:start;margin-top:6px}.kbside{display:flex;flex-direction:column}.kbbtns{padding-top:14px;display:flex;gap:10px;flex-wrap:wrap}.kbbtns.right{justify-content:flex-end}.kbw h3{margin:0 0 8px;text-align:center}.kbgrid{display:grid;grid-template-columns:repeat(4,100px);gap:8px}@media(max-width:1230px){.kbgrid{grid-template-columns:repeat(3,100px)}}
 div.kbt{position:relative;cursor:pointer;border:2px solid transparent;border-radius:4px;line-height:0}.kbdrag div.kbt{cursor:grab}div.kbt.sel{border-color:#1f7a46}div.kbt.csel{outline:2px solid #4aa3ff;outline-offset:1px}div.kbt:hover{border-color:var(--ac)}div.kbt.ib{box-shadow:inset 8px 0 0 #3ddc84}div.kbt.ia{box-shadow:inset -8px 0 0 #3ddc84}div.kbt.ib::before,div.kbt.ia::after{content:'';position:absolute;top:-3px;bottom:-3px;width:7px;border-radius:4px;background:#3ddc84;box-shadow:0 0 12px 3px #3ddc84cc;z-index:4;pointer-events:none}div.kbt.ib::before{left:-10px}div.kbt.ia::after{right:-10px}div.kbt.ib,div.kbt.ia{border-style:solid;border-color:#3ddc84}div.kbt.dr,#kbtrash.dr,#kbtray.dr{border-color:#e0a030;border-style:dashed}#kbtrash.dr{background:#a12b2b55;border-color:#d44}div.kbt.dg{opacity:.4}div.kbt span{position:absolute;left:2px;top:2px;background:#000b;color:#fff;font:600 11px/1 sans-serif;padding:2px 4px;border-radius:3px}canvas.kbt{width:96px;height:144px;background:#0003;display:block}
 div.kbtr canvas.kbt{width:72px;height:108px}.kbtw{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start;justify-content:center}#kbtray{margin-top:14px;padding:10px;border:2px solid transparent;border-radius:8px;background:#ffffff08}#kbtrash{width:76px;height:112px;border:2px dashed var(--line);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:30px;color:var(--mu);transition:background-color .15s,border-color .15s}
 .dropping .kbm{outline:2px dashed #3ddc84;outline-offset:6px;border-radius:8px}.kbm{text-align:center}.kbx{display:flex;gap:14px;align-items:center;justify-content:center;margin-top:10px;flex-wrap:wrap}#kbpv{display:block;margin:0 auto;width:100%;max-width:640px;height:auto;background:#fff;border:1px solid var(--line);aspect-ratio:1/1}
#kbmenu{position:fixed;z-index:50;width:240px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:8px;box-shadow:0 8px 24px #000a}#kbmenu .mh{font-weight:600}#kbmenu .mc{display:grid;grid-template-columns:36px 1fr 36px;gap:6px;align-items:center;text-align:center}#kbmenu .mc span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}</style>
 <div class="bar" style="margin:0 0 6px;padding-bottom:10px;border-bottom:1px solid var(--line)"><button class="btn g" id="kbinfo" title="How the kneeboard page works">ⓘ Info</button><button class="btn g bl nil" id="kbsend" title="Click a picture card, then send it to the pilots of your squadron">Send card…</button><button class="btn g kblk nil" id="kblk" title="Click a card made by the program or a datacard page, then switch it between light and dark">☀</button><span id="kballw" style="margin-left:auto"><button class="btn g" id="kball" title="All the cards the program can make for the flight (SEAD or DEAD, Attack, Weather, Target, ROE / SOP): first Classic or Smart, then chosen on their pictures and put into the Kneeboard">＋ Add all cards…</button><span id="kballk" hidden><button class="btn g" data-kball="classic" title="The cards of the pages, as before">Classic</button><button class="btn g" data-kball="smart" title="The Smart cards: the look of a smart card, and the mission cards">Smart</button></span></span><span class="dlg" style="margin-left:auto"><button class="btn${KBFMT == 'dxt1' ? '' : ' g'}" id="kbf1" title="DXT1: what BMS needs">DXT1</button><button class="btn${KBFMT == 'dxt5' ? '' : ' g'}" id="kbf5" title="DXT5 with mipmaps">DXT5 + mipmaps</button></span><button class="btn${cardDark() ? '' : ' g'}" id="kbcd" style="margin-left:10px" title="The look of the cards made from now on (SEAD, DEAD, Attack, Weather, Target, ROE / SOP) and of the datacard pages: light or dark. The cards already on the kneeboard change with it, except those switched one by one with the ☀ / ☾ button.">${cardDark() ? '☾ Dark cards' : '☀ Light cards'}</button></div>
 <div class="kbw${DM ? ' kbdrag' : ''}">${grid('left', '<button class="btn g bl" id="kbdef" title="Remember the current cards as the default arrangement (once missions exist, a backup copy is also kept in the mission folder)">Set Default</button><button class="btn" id="kbldef" title="Put the cards back as saved with Set Default">Load</button><button class="btn g rd" id="kbclr" title="Take every card off the kneeboard">🗑 Clear kneeboard</button>')}<div class="kbm"><canvas id="kbpv" width="1024" height="1024"></canvas><div id="kbcap" class="hint" style="margin-top:6px"></div>
 <div class="kbx">${DM ? '<button class="btn" id="kbimp" title="Add pictures (jpg, png, webp) or the pages of a PDF to the unused cards">📥 Import images…</button>' : ''}<label class="hint"><input type="checkbox" id="kbfit" style="width:auto"${KBFIT ? ' checked' : ''}> Keep page proportions (otherwise images are stretched over the page)</label></div>${tray}<div id="kbst" class="hint" style="margin-top:10px;min-height:1.3em"></div><div id="kbprog"><i></i></div></div>${grid('right', '<button class="btn g" id="kbrest" title="Put back the original BMS files (backups are kept in the program folder)">↺ Restore</button><button class="btn g" id="kbokb" title="Writes the kneeboard pages as pictures for OpenKneeboard, in the Left and Right folders. In OpenKneeboard, a Folder tab on this folder shows the pages." hidden>Save to OpenKneeboard</button><button class="btn" id="kbsave">Save to BMS folder</button>')}</div>
`;
  const pickCard = c => {
    KBCARD = c && c.kind == 'pic' && c.item ? c.item : c && (c.kind == 'dcl' || c.kind == 'dcr') ? KBDC : null;
    kbMarkCard();
  };
  const kbMarkCard = () => {
    el.querySelectorAll('div.kbt').forEach(t => {
      const c = t.dataset.i !== undefined ? KBTR[+t.dataset.i] : t.dataset.s ? KBS[+t.dataset.r][t.dataset.s] : null;
      t.classList.toggle(
        'csel',
        !!(
          KBCARD &&
          c &&
          ((c.kind == 'pic' && c.item === KBCARD) || (KBCARD.dc && (c.kind == 'dcl' || c.kind == 'dcr')))
        )
      );
    });
    const lk = $('kblk');
    if (lk) {
      const two = !!(KBCARD && KBCARD.other);
      lk.classList.toggle('nil', !two);
      lk.textContent = two && KBCARD.dark ? '☾' : '☀';
      lk.title = !KBCARD
        ? 'Click a card made by the program, then switch it between light and dark'
        : !two
          ? kbProg(KBCARD)
            ? '"' +
              KBCARD.name +
              '" has one look only (made before 1.3.0-beta.48): add it again from its page to have both'
            : 'No dark version available: "' + KBCARD.name + '" is a document, a picture or a map'
          : '"' +
            KBCARD.name +
            '": ' +
            (KBCARD.dark ? 'dark' : 'light') +
            '. Press for ' +
            (KBCARD.dark ? 'light' : 'dark') +
            ' (this card only; the Light / Dark cards button then leaves it as it is)';
    }
    const b = $('kbsend');
    if (b) {
      b.classList.toggle('nil', !KBCARD || KBCARD.dc || !KBX.can()); // dimmed, not disabled: a click says what is missing
      b.title = !KBCARD
        ? 'Click a picture card, then send it to the pilots of your squadron'
        : !KBX.can()
          ? 'Join or create a squadron to send cards'
          : 'Send "' + KBCARD.name + '" to the pilots of your squadron';
    }
  };
  if (KBCARD && !KBCARD.dc && !KBLIB.includes(KBCARD)) KBCARD = null;
  kbMarkCard();
  // the look of the chosen card only: kept when the general button switches the others
  if ($('kblk'))
    $('kblk').onclick = async () => {
      if (!KBCARD) return alert('Click a card first (in a slot or among the unused cards).', 'bad');
      if (!KBCARD.other)
        return alert(
          kbProg(KBCARD)
            ? '"' + KBCARD.name + '" has one look only: add it again from its page to have both.'
            : 'No dark version available: "' + KBCARD.name + '" is a document, a picture or a map, kept as it is.',
          'bad'
        );
      await kbSwapLook(KBCARD);
      KBCARD.fixed = true;
      if (KBCARD.dc) dcLookSave();
      ST.KBG = null;
      kbMemLater();
      kbRender();
    };
  // Add all cards: two choices open under it (Classic, Smart); a click elsewhere closes them
  if ($('kball')) {
    const k = $('kballk'),
      shut = () => (k.hidden = true);
    $('kball').onclick = e => {
      e.stopPropagation();
      k.hidden = !k.hidden;
      if (!k.hidden && animOn()) {
        k.classList.remove('kbapp');
        void k.offsetWidth;
        k.classList.add('kbapp');
      }
    };
    k.querySelectorAll('[data-kball]').forEach(b => {
      /** @type {HTMLElement} */ (b).onclick = e => {
        e.stopPropagation();
        shut();
        kbAddAll(/** @type {HTMLElement} */ (b).dataset.kball);
      };
    });
    document.addEventListener('click', e => {
      if (!k.hidden && !(/** @type {HTMLElement} */ (e.target).closest('#kballw'))) shut();
    });
  }
  if ($('kbsend'))
    $('kbsend').onclick = () => {
      if (!KBCARD || KBCARD.dc)
        return alert('Click a picture card first (in a slot or among the unused cards), then press Send card.', 'bad');
      if (!KBX.can())
        return alert('Join or create a squadron first (Squadron page): the card is sent to its pilots.', 'bad');
      if (KBX.send) KBX.send(KBCARD);
    };
  el.querySelectorAll('div.kbt[data-i]').forEach(t =>
    t.addEventListener('click', () => {
      if (!KBDRAGGED) pickCard(KBTR[+t.dataset.i]);
    })
  );
  el.querySelectorAll('div.kbt[data-s]').forEach(
    t =>
      (t.onclick = e => {
        if (KBDRAGGED) return;
        pickCard(KBS[+t.dataset.r][t.dataset.s]);
        KBSEL = +t.dataset.r;
        kbThumbs();
        el.querySelectorAll('div.kbt[data-s]').forEach(x => x.classList.toggle('sel', +x.dataset.r == KBSEL));
        if (!DM) kbMenu(t.dataset.s, +t.dataset.r, e);
        else if (KBS[+t.dataset.r][t.dataset.s].kind == 'empty')
          pickFiles({ exts: ['jpg', 'jpeg', 'png', 'webp', 'pdf'], title: 'Kneeboard cards (images or PDF)' }).then(
            fs => {
              if (fs.length) kbImport(fs, t.dataset.s, +t.dataset.r);
            }
          );
      })
  );
  $('kbinfo').onclick = () =>
    alert(
      `${DM ? 'Drag a card onto another to swap them (on the left or right edge of a card it is inserted there: a free slot beside it is filled first, otherwise the cards move on), to the unused cards to take it off, or to the bin to delete it. You can also drop image or PDF files here.' : 'Click a card to cycle it or import images (animations are off, so dragging is off too).'} Each row becomes one DDS: row 1 = ${rowFile(0)} … row ${ROWS} = ${rowFile(ROWS - 1)} in ${kbDir() || '(set the BMS install folder in Settings)'}. "Not saved: Kneeboard" (tab bar) shows when the cards or the datacard changed since the last Save. Settings > General > One map screenshot: a new map screenshot replaces the last one.`
    );
  $('kbdef').onclick = () => {
    KBDEF = kbCopy(KBS);
    $('kbst').textContent = 'Current cards remembered as the default.';
    kbDefBtns();
  };
  $('kbldef').onclick = () => {
    KBS = kbCopy(KBDEF);
    kbRender();
  };
  $('kbclr').onclick = async () => {
    if (
      !(await confirm(
        'Take every card off the kneeboard? (Imported cards stay among the unused ones. Nothing is written to the BMS folder until you press Save.)'
      ))
    )
      return;
    KBS = kbEmpty();
    KBSEL = 0;
    kbRender();
    $('kbst').textContent = 'Kneeboard emptied.';
  };
  $('kbf1').onclick = () => {
    KBFMT = 'dxt1';
    kbDefBtns();
    $('kbf1').classList.remove('g');
    $('kbf5').classList.add('g');
  };
  $('kbf5').onclick = () => {
    KBFMT = 'dxt5';
    kbDefBtns();
    $('kbf5').classList.remove('g');
    $('kbf1').classList.add('g');
  };
  const look = async d => {
    setCardDark(d);
    try {
      localStorage.setItem('bmscarddark', d ? '1' : '0');
    } catch (e) {}
    savePrefs('cardlook.json', { dark: d });
    // the cards made by the program switch at once (they keep both looks); the kneeboard is then not saved until it is written again
    const n = await kbLook(d);
    ST.KBG = null; // the datacard pages in their look
    kbMemLater();
    kbRender();
    $('kbst').textContent =
      (d ? 'Dark' : 'Light') +
      ' cards: ' +
      (n ? n + ' card' + (n > 1 ? 's' : '') + ' switched; ' : '') +
      'the cards made from now on are drawn so. Documents, pictures and maps have no dark version (they stay as they are).';
  };
  $('kbcd').onclick = () => look(!cardDark());
  $('kbfit').onchange = () => {
    KBFIT = $('kbfit').checked;
    kbThumbs();
  };
  $('kbrest').onclick = kbRestore;
  $('kbsave').onclick = kbSave;
  $('kbokb').onclick = okbSave;
  okbSync();
  if ($('kbimp'))
    $('kbimp').onclick = async () => {
      const fs = await pickFiles({
        exts: ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
        title: 'Kneeboard cards (images or PDF)',
      });
      if (fs.length) kbImport(fs, null, 0);
    };
  if ($('kbtrash'))
    $('kbtrash').onclick = async () => {
      if (KBDRAGGED) return;
      const all = KBTR.filter(c => c.kind == 'pic'),
        del = all.filter(c => !kbKept(c.item)),
        kept = all.length - del.length;
      if (!all.length) {
        $('kbst').textContent = 'No imported cards among the unused ones.';
        return;
      }
      if (!del.length) {
        $('kbst').textContent = 'The ' + kept + ' unused card(s) are used by another theater or by the default: kept.';
        return;
      }
      if (
        !(await confirm(
          'Delete the ' +
            del.length +
            ' unused imported card(s) and their saved files? (The datacard pages cannot be deleted.' +
            (kept ? ' ' + kept + ' card(s) used by another theater or by the default are kept.' : '') +
            ')'
        ))
      )
        return;
      del.forEach(c => kbDelete(c.item));
      kbRender();
      $('kbst').textContent = del.length + ' unused card(s) deleted' + (kept ? ', ' + kept + ' kept.' : '.');
    };
  if (DM)
    el.querySelectorAll('div.kbt').forEach(t => {
      t.onmousedown = e => {
        if (e.button !== 0) return;
        const sx = e.clientX,
          sy = e.clientY,
          src = t.dataset.i !== undefined ? { tray: +t.dataset.i } : { s: t.dataset.s, r: +t.dataset.r };
        let ghost = null,
          over = null,
          zone = '';
        const cell = q =>
          q.tray !== undefined
            ? el.querySelector(`div.kbt[data-i="${q.tray}"]`)
            : el.querySelector(`div.kbt[data-s=${q.s}][data-r="${q.r}"]`);
        const move = ev => {
          if (!ghost) {
            if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
            closeKbMenu();
            const r0 = t.getBoundingClientRect(),
              cv = t.querySelector('canvas'),
              c = document.createElement('canvas');
            c.width = cv.width;
            c.height = cv.height;
            c.getContext('2d').drawImage(cv, 0, 0);
            c.style.cssText = `position:fixed;z-index:60;pointer-events:none;width:${r0.width - 4}px;height:${r0.height - 4}px;box-shadow:0 10px 26px #000b;border-radius:4px;opacity:.95;transform:scale(1.06) rotate(2deg)`;
            document.body.append(c);
            ghost = c;
            t.classList.add('dg');
            document.body.classList.add('dragging');
          }
          ghost.style.left = ev.clientX - ghost.offsetWidth / 2 + 'px';
          ghost.style.top = ev.clientY - ghost.offsetHeight / 2 + 'px';
          const u = document.elementFromPoint(ev.clientX, ev.clientY),
            hit = u && u.closest ? u.closest('#kbtrash') || u.closest('div.kbt') || u.closest('#kbtray') : null,
            nx = hit && hit !== t ? hit : null;
          let z = '';
          if (nx && nx.dataset.s !== undefined) {
            const rr = nx.getBoundingClientRect(),
              fx = (ev.clientX - rr.left) / rr.width;
            z = fx < 0.28 ? 'b' : fx > 0.72 ? 'a' : '';
          }
          if (over !== nx || zone !== z) {
            if (over) over.classList.remove('dr', 'ib', 'ia');
            over = nx;
            zone = z;
            if (over) {
              over.classList.add('dr');
              if (zone) over.classList.add(zone == 'b' ? 'ib' : 'ia');
            }
          }
        };
        const up = () => {
          document.removeEventListener('mousemove', move);
          document.removeEventListener('mouseup', up);
          if (!ghost) return;
          KBDRAGGED = true;
          setTimeout(() => (KBDRAGGED = false), 0);
          document.body.classList.remove('dragging');
          t.classList.remove('dg');
          if (over) over.classList.remove('dr', 'ib', 'ia');
          const gr = ghost.getBoundingClientRect(),
            from = { left: gr.left - 2, top: gr.top - 2 },
            card = src.tray !== undefined ? KBTR[src.tray] : KBS[src.r][src.s];
          const fly = (to, cb) => {
            if (!animOn()) {
              ghost.remove();
              cb();
              return;
            }
            const a = ghost.animate(
              [
                { transform: ghost.style.transform, opacity: 0.95 },
                {
                  transform: `translate(${to.left + to.width / 2 - gr.left - gr.width / 2}px,${to.top + to.height / 2 - gr.top - gr.height / 2}px) scale(.2)`,
                  opacity: 0,
                },
              ],
              { duration: 170, easing: 'ease-in' }
            );
            a.onfinish = a.oncancel = () => {
              ghost.remove();
              cb();
            };
          };
          const moved = q => {
            const c = cell(q);
            if (c && animOn()) {
              const r = c.getBoundingClientRect();
              c.animate(
                [
                  { transform: `translate(${from.left - r.left}px,${from.top - r.top}px)`, zIndex: 5 },
                  { transform: 'none', zIndex: 5 },
                ],
                { duration: 200, easing: 'ease-out' }
              );
            }
          };
          // a card is known by its picture (the object itself: as text every picture was the same "[object Object]", so every card slid from
          // one place) or, for the datacard pages, by its kind
          const ck = c => c.item || c.kind;
          const snap = () => {
            const m = new Map();
            KBS.forEach((row, r) =>
              ['left', 'right'].forEach(s => {
                const c = row[s],
                  e = c && c.kind != 'empty' ? cell({ s, r }) : null;
                if (e) m.set(ck(c), e.getBoundingClientRect());
              })
            );
            return m;
          }; // where every card is now, to slide the cards to their new places after an insert
          const flip = (m, card, gfrom) => {
            if (!animOn()) return;
            KBS.forEach((row, r) =>
              ['left', 'right'].forEach(s => {
                const c = row[s],
                  e = c && c.kind != 'empty' ? cell({ s, r }) : null;
                if (!e) return;
                const n = e.getBoundingClientRect(),
                  o = c.kind == card.kind && c.item === card.item ? gfrom : m.get(ck(c)); // the card dropped comes from where it was let go
                if (!o || Math.abs(o.left - n.left) + Math.abs(o.top - n.top) < 2) return;
                e.animate(
                  [
                    { transform: `translate(${o.left - n.left}px,${o.top - n.top}px)`, zIndex: 5 },
                    { transform: 'none', zIndex: 5 },
                  ],
                  { duration: 220, easing: 'ease-out' }
                );
              })
            );
          };
          const after = () => {
            const i = KBTR.findIndex(x => x.kind == card.kind && x.item === card.item);
            return i >= 0 ? { tray: i } : null;
          };
          if (!over) {
            ghost.remove();
            return;
          }
          if (over.id == 'kbtrash') {
            const to = over.getBoundingClientRect();
            fly(to, () => {
              if (card.kind == 'pic' && kbKept(card.item)) {
                appToast('This card is used by another theater or by the default: kept in the library.', true);
                if (src.tray === undefined) KBS[src.r][src.s] = { kind: 'empty', mode: 'fill' };
              } else if (card.kind == 'pic') kbDelete(card.item);
              else if (src.tray === undefined) KBS[src.r][src.s] = { kind: 'empty', mode: 'fill' };
              kbRender();
            });
            return;
          }
          ghost.remove();
          if (over.dataset.s !== undefined) {
            const dst = { s: over.dataset.s, r: +over.dataset.r };
            if (zone) {
              const m = snap();
              if (kbInsert(src, dst, zone, card)) {
                KBSEL = dst.r;
                kbRender();
                flip(m, card, from);
                return;
              }
            }
            if (src.tray !== undefined) {
              KBS[dst.r][dst.s] = { kind: card.kind, item: card.item, mode: 'fill' };
              KBSEL = dst.r;
              kbRender();
              moved(dst);
            } else {
              const rb = over.getBoundingClientRect(),
                ra = t.getBoundingClientRect(),
                a = KBS[src.r],
                b = KBS[dst.r],
                x = a[src.s];
              a[src.s] = b[dst.s];
              b[dst.s] = x;
              KBSEL = dst.r;
              kbRender();
              if (animOn()) {
                const mv = (q, f, to) =>
                  cell(q).animate(
                    [
                      { transform: `translate(${f.left - to.left}px,${f.top - to.top}px)`, zIndex: 5 },
                      { transform: 'none', zIndex: 5 },
                    ],
                    { duration: 200, easing: 'ease-out' }
                  );
                mv(dst, from, rb);
                mv(src, rb, ra);
              }
            }
          } else if (src.tray === undefined) {
            KBS[src.r][src.s] = { kind: 'empty', mode: 'fill' };
            kbRender();
            const q = after();
            if (q) moved(q);
          }
        };
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
      };
    });
  kbThumbs();
  kbDecodeUsed().then(ch => {
    if (ch) kbThumbs();
  });
}
export const kbBackupDir = async () => joinPath(joinPath(await appDir(), 'backup'), 'kneeboard');
// The originals are kept once for each folder they come from (the folder can change: another theater, another BMS installation, the Settings):
// backup\kneeboard\index.json gives the sub-folder of each folder; the copies made before the index (directly in backup\kneeboard) belong to the first folder that asks.
export async function kbBackupFor(dir) {
  const root = await kbBackupDir(),
    ix = joinPath(root, 'index.json'),
    key = String(dir)
      .replace(/[\\/]+$/, '')
      .toLowerCase();
  let map = {};
  try {
    if (await fileExists(ix)) map = JSON.parse(new TextDecoder().decode(await readBytes(ix))) || {};
  } catch (e) {
    map = {};
  }
  if (typeof map[key] == 'string') return map[key] ? joinPath(root, map[key]) : root;
  const used = new Set(Object.values(map));
  let sub = '';
  if (used.has('')) {
    let k = 2;
    while (used.has('folder ' + k)) k++;
    sub = 'folder ' + k;
  }
  map[key] = sub;
  await makeDir(root);
  await writeBytes(ix, enc8(JSON.stringify(map, null, 1)));
  return sub ? joinPath(root, sub) : root;
}
export async function kbRestore() {
  const dir = kbDir(),
    st = $('kbst');
  if (!isDesktop()) {
    alert('Restore works in the desktop program only.', 'bad');
    return;
  }
  if (!dir) {
    alert('Set the BMS install folder (or the Kneeboard DDS folder) in Settings first.', 'bad');
    return;
  }
  const bk = await kbBackupFor(dir),
    have = [];
  for (const set of KB_SETS)
    for (let i = 0; i < ROWS; i++) {
      const f = rowFile(i, set),
        a = joinPath(bk, f),
        legacy = joinPath(dir, f) + '.orig';
      if (await fileExists(a)) have.push([f, a]);
      else if (await fileExists(legacy)) have.push([f, legacy]);
    }
  if (!have.length) {
    alert('No backups found in:\n' + bk, 'bad');
    return;
  }
  if (
    !(await confirm(
      'Restore ' +
        have.length +
        ' original file(s) (' +
        have.map(h => h[0]).join(', ') +
        ') in:\n' +
        dir +
        '\n\nThe current files will be replaced.'
    ))
  )
    return;
  try {
    for (const [f, a] of have) await writeBytes(joinPath(dir, f), await readBytes(a));
    st.textContent = 'Restored ' + have.length + ' original file(s).';
  } catch (e) {
    alert('Could not restore: ' + ((e && e.message) || e), 'bad');
  }
}
// the files to write: those of the aircraft of the flight (its type is read in the datacard: the row of the package of the flight, its callsign; else the
// first row that has one), the F-16 ones when there is no flight. The DTC uses it too (SIT lines of the F-15).
export const kbSet = () => {
  const cs = String(F.cs || '')
    .trim()
    .toLowerCase();
  if (cs)
    for (let q = 0; q < 5; q++) {
      const t = F['pk' + q + '_1'];
      if (
        t &&
        String(t).trim() &&
        String(F['pk' + q + '_0'] || '')
          .trim()
          .toLowerCase() == cs
      )
        return setFor(t);
    }
  for (let q = 0; q < 5; q++) {
    const t = F['pk' + q + '_1'];
    if (t && String(t).trim()) return setFor(t);
  }
  return setFor('');
};
// the datacard pages are on a kneeboard row that will be written, but the datacard holds nothing (no flight chosen, or every field empty)
export const dcEmpty = () =>
  !FD.some(d => {
    const v = String(F[d.k] == null ? '' : F[d.k]).replace(/[-\s]/g, '');
    return v !== '';
  });
export const dcOnRows = rows =>
  rows.some(i => [KBS[i].left.kind, KBS[i].right.kind].some(k => k == 'dcl' || k == 'dcr'));
export async function kbSave() {
  if (!$('kbsave')) kbRender(); // saved from the "Ready to fly" button before the Kneeboard page was ever opened
  const dir = kbDir(),
    st = $('kbst'),
    rows = KBS.map((s, i) => i).filter(i => rowUsed(KBS[i], i)),
    set = kbSet();
  if (
    dcOnRows(rows) &&
    dcEmpty() &&
    !(await confirm(
      'The datacard is empty: the datacard pages on the kneeboard would be blank in flight.\n\nChoose a flight (Datacard tab) first, or write the files anyway?\n\nOK = write anyway, Cancel = go back.'
    ))
  )
    return;
  if (isDesktop() && !dir) {
    alert('Set the BMS install folder (or the Kneeboard DDS folder) in Settings first.', 'bad');
    return;
  }
  if (
    isDesktop() &&
    !(await confirm(
      'Write ' +
        rows.length +
        ' ' +
        set.name +
        ' file(s) (' +
        rows.map(i => rowFile(i, set)).join(', ') +
        ') to:\n' +
        dir +
        '\n\nOriginal files are saved once in the program folder (backup\\kneeboard) before being replaced; nothing extra is created in the BMS folder.'
    ))
  )
    return;
  $('kbsave').disabled = true;
  draw();
  let done = 0;
  // the loading bar of the program while the pages are made and written (a page takes about a second in DXT5)
  const bid = busyStart('Writing the kneeboard…', true);
  await kbDecodeUsed();
  try {
    for (const i of rows) {
      st.textContent = 'Writing ' + rowFile(i, set) + ' (' + (done + 1) + ' of ' + rows.length + ')…';
      $('kbprog').firstChild.style.width = (done / rows.length) * 100 + '%';
      busySet(
        bid,
        (done / rows.length) * 100,
        'Writing ' + rowFile(i, set) + ' (' + (done + 1) + ' of ' + rows.length + ')…'
      );
      await new Promise(r => setTimeout(r, 20));
      const dd = toneRGBA(kbRow(i).getContext('2d').getImageData(0, 0, 2048, 2048).data, 2048, 2048, kbTone()),
        bytes = KBFMT == 'dxt5' ? toDDS5(2048, dd) : toDDS(2048, dd);
      if (isDesktop()) {
        const path = joinPath(dir, rowFile(i, set)),
          bk = await kbBackupFor(dir),
          orig = joinPath(bk, rowFile(i, set));
        if ((await fileExists(path)) && !(await fileExists(orig))) {
          await makeDir(bk);
          await writeBytes(orig, await readBytes(path));
        }
        await writeBytes(path, bytes);
      } else saveFile(new Blob([bytes]), rowFile(i, set));
      done++;
    }
    $('kbprog').firstChild.style.width = '100%';
    st.textContent = 'Done: ' + done + ' file(s) written.';
    kbMarkSaved();
    if ($('kn').classList.contains('hide')) appToast('Kneeboard saved: ' + done + ' file(s) written.');
    kbDefBtns();
    $('kbsave').classList.remove('flash');
    void $('kbsave').offsetWidth;
    $('kbsave').classList.add('flash');
    setTimeout(() => {
      const b = $('kbprog');
      if (b) b.firstChild.style.width = '0';
    }, 1200);
  } catch (e) {
    st.textContent = '';
    alert(
      'Could not write ' +
        (rows[done] !== undefined ? rowFile(rows[done], set) : 'the files') +
        ': ' +
        ((e && e.message) || e) +
        '\n\n' +
        done +
        ' file(s) were written before the error.',
      'bad'
    );
  } finally {
    busyEnd(bid);
  }
  $('kbsave').disabled = false;
}

// ---- OpenKneeboard: the pages as PNG files in a folder (Left\, Right\) that a "Folder" tab of OpenKneeboard shows and reloads by itself.
// Nothing else is done with OpenKneeboard: it is only looked for (find_okb: its settings folder), to show the button.
export const OKB = { settings: '', saved: '' };
export async function okbFind() {
  const [s, v] = await findOkb();
  OKB.settings = s || '';
  OKB.saved = v || '';
  okbSync();
}
// Settings > Kneeboard: 'auto' = the button when OpenKneeboard is found, 'on' = always, 'off' = never
export const okbOn = () => {
  const m = (ST.CFG.kneeboard && ST.CFG.kneeboard.okb) || 'auto';
  return isDesktop() && (m == 'on' || (m == 'auto' && !!OKB.settings));
};
export const okbDefDir = () => (OKB.saved ? joinPath(joinPath(OKB.saved, 'BMS Cards'), 'OpenKneeboard') : '');
export const okbDir = () => ST.CFG.paths.okbDir || okbDefDir();
export function okbSync() {
  const b = $('kbokb');
  if (b) b.hidden = !okbOn();
}
const OKB_OURS = /^\d\d [^\\/]*\.png$/i; // the files written here (the others in the folders are left alone)
const okbName = (i, sl) =>
  String(i + 1).padStart(2, '0') +
  ' ' +
  (kbName(sl)
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60) || 'Page') +
  '.png';
// a page at its true shape: the datacard pages (800 x 1200 page units, stretched to 1024 x 2048 for BMS) back to 2:3 at 1600 x 2400; a picture
// (the cards of the program are 1600 x 2400) at its own size, at most 4096. No Cockpit tone: OpenKneeboard is not lit by the cockpit.
function okbPage(sl) {
  const c = document.createElement('canvas'),
    x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  if (sl.kind == 'dcl' || sl.kind == 'dcr') {
    c.width = 1600;
    c.height = 2400;
    x.drawImage(kbDcPages(), sl.kind == 'dcl' ? 0 : 1024, 0, 1024, 2048, 0, 0, 1600, 2400);
    return c;
  }
  const it = sl.item,
    im = it && (it.src || it.mid);
  if (!im) return null;
  const k = Math.min(1, 4096 / Math.max(it.w, it.h));
  c.width = Math.round(it.w * k);
  c.height = Math.round(it.h * k);
  x.fillStyle = '#fff';
  x.fillRect(0, 0, c.width, c.height);
  x.drawImage(im, 0, 0, c.width, c.height);
  return c;
}
export async function okbSave() {
  if (!$('kbokb')) kbRender();
  const dir = okbDir(),
    st = $('kbst'),
    first = !ST.CFG.paths.okbDir,
    pages = [];
  KBS.forEach((r, i) =>
    ['left', 'right'].forEach(s => {
      const sl = r[s];
      if (sl.kind == 'dcl' || sl.kind == 'dcr' || (sl.kind == 'pic' && sl.item)) pages.push({ i, s, sl });
    })
  );
  if (!pages.length) return alert('The kneeboard has no pages. Add cards to the kneeboard first.', 'bad');
  if (!dir) return alert('Set the OpenKneeboard folder in Settings > Folders.', 'bad');
  if (
    pages.some(p => p.sl.kind != 'pic') &&
    dcEmpty() &&
    !(await confirm(
      'The datacard is empty. Its pages will be blank.\n\nTo fill the datacard, select a flight on the Datacard page.\n\nOK = write the pages. Cancel = stop.'
    ))
  )
    return;
  if (
    first &&
    !(await confirm(
      'The program writes ' +
        pages.length +
        ' kneeboard pages as pictures to this folder:\n' +
        dir +
        '\n\nThe pages go into the Left and Right folders. To use a different folder, go to Settings > Folders.\n\nOK = write the pages. Cancel = stop.'
    ))
  )
    return;
  const b = $('kbokb'),
    bid = busyStart('Writing the pages for OpenKneeboard…', true);
  b.disabled = true;
  let done = 0;
  try {
    draw();
    ST.KBG = null;
    await kbDecodeUsed();
    // the pages written last time go first: a page taken off the kneeboard does not stay in OpenKneeboard
    for (const side of ['Left', 'Right']) {
      const d = joinPath(dir, side);
      await makeDir(d);
      for (const e of await listDir(d))
        if (!e.isDirectory && OKB_OURS.test(e.name)) await removeFile(joinPath(d, e.name));
    }
    for (const p of pages) {
      const msg = 'Writing page ' + (done + 1) + ' of ' + pages.length + '…';
      st.textContent = msg;
      busySet(bid, (done / pages.length) * 100, msg);
      await new Promise(r => setTimeout(r, 20));
      const c = okbPage(p.sl);
      if (c) {
        const blob = await new Promise(r => c.toBlob(r, 'image/png'));
        await writeBytes(
          joinPath(joinPath(dir, p.s == 'left' ? 'Left' : 'Right'), okbName(p.i, p.sl)),
          new Uint8Array(await blob.arrayBuffer())
        );
      }
      done++;
    }
    st.textContent = 'Done: ' + done + ' pages written for OpenKneeboard.';
    if (first) {
      ST.CFG = { ...ST.CFG, paths: { ...ST.CFG.paths, okbDir: dir } };
      await saveConfig(ST.CFG);
      try {
        await navigator.clipboard.writeText(dir);
      } catch (e) {}
      alert(
        done +
          ' pages are written.\n\nDo these steps in OpenKneeboard one time:\n1. Open Settings > Tabs.\n2. Click Add a tab, then Folder.\n3. Select this folder (the path is in the clipboard):\n' +
          dir +
          '\n\nOpenKneeboard then shows the pages after each save.'
      );
    } else appToast('OpenKneeboard: ' + done + ' pages written.');
  } catch (e) {
    st.textContent = '';
    alert(
      'The program cannot write the pages for OpenKneeboard: ' +
        ((e && e.message) || e) +
        '\n\nThe program wrote ' +
        done +
        ' pages before the error.',
      'bad'
    );
  } finally {
    busyEnd(bid);
    b.disabled = false;
  }
}

// run 17: statements that run when the program starts (in the order of the original file)
// ---- "Kneeboard not saved": what the kneeboard would write now (the cards in the slots, the format, the files of the aircraft and, when the datacard pages are
// on it, the datacard as it is drawn) against what the last Save wrote. Kept between sessions (kbsaved.json), so the same mission opened again is not "not saved".
let KBLAST = null;
const fnv = (str, h = 2166136261) => {
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
};
// the datacard by what it is drawn from (its values, the format, the seat, the map screenshot), not by its pixels: the same card drawn again
// (on another tab, by another graphics path of the window) can differ by a few pixels at the edges of its text, and was taken for a change
const SHOTH = new WeakMap();
function shotHash(c) {
  if (!c) return '';
  if (SHOTH.has(c)) return SHOTH.get(c);
  let h = '';
  try {
    // a picture taken once and never drawn again: its own pixels, read once
    const d = c.getContext ? c.getContext('2d').getImageData(0, 0, c.width, c.height).data : null;
    if (d) {
      let k = 2166136261;
      for (let i = 0; i < d.length; i += 4 * 7)
        k = Math.imul(k ^ (d[i] | (d[i + 1] << 8) | (d[i + 2] << 16)), 16777619);
      h = c.width + 'x' + c.height + ':' + (k >>> 0).toString(36);
    } else h = (c.width || 0) + 'x' + (c.height || 0);
  } catch (e) {
    h = (c.width || 0) + 'x' + (c.height || 0);
  }
  SHOTH.set(c, h);
  return h;
}
function dcSig() {
  const keys = Object.keys(F).sort();
  return fnv(
    JSON.stringify([
      !!ST.MDCON,
      !!(ST.C && ST.CL && ST.CL.length && F.cs), // the seat buttons move the text of their cells
      keys.map(k => [k, F[k] == null ? '' : String(F[k])]),
      shotHash(ST.MAPSHOT),
    ])
  );
}
const slotSig = sl => [
  sl.kind,
  sl.item
    ? sl.item.name + ':' + (sl.item.blob ? sl.item.blob.size : '') + (sl.item.other ? (sl.item.dark ? ':d' : ':l') : '')
    : '',
  sl.mode || '',
];
export function kbNowSig() {
  if (!KBS) return null;
  const rows = KBS.map((r, i) => i).filter(i => rowUsed(KBS[i], i));
  if (!rows.length) return null;
  const dc = dcOnRows(rows);
  return (
    fnv(
      JSON.stringify([
        KBFMT,
        KBFIT,
        kbSet().name,
        kbTone(), // the Cockpit tone of the settings
        KBDC.dark, // the look of the datacard pages
        kbDir() || '',
        rows.map(i => [i, slotSig(KBS[i].left), slotSig(KBS[i].right)]),
      ])
    ) + (dc ? '.d' + dcSig() : '')
  );
}
function kbMarkSaved() {
  KBLAST = kbNowSig();
  savePrefs('kbsaved.json', { sig: KBLAST });
  kbWarn();
}
// not saved: something is on the kneeboard and differs from the last Save. A datacard with no flight chosen does not count (nothing to save yet), even when the
// program filled some cells by itself (the ephemerides of the campaign...): it counts only when something was typed on it by hand
export const dcIdle = () => dcEmpty() || (ST.CURK == null && !ST.DCHAND);
export function kbUnsaved() {
  const sig = kbNowSig();
  if (!sig || sig === KBLAST) return false;
  const rows = KBS.map((r, i) => i).filter(i => rowUsed(KBS[i], i));
  if (dcOnRows(rows) && dcIdle() && rows.every(i => ['left', 'right'].every(sd => KBS[i][sd].kind != 'pic')))
    return false;
  return true;
}
// the dot on the Kneeboard tab (the "Ready to fly" button of the tab bar, app/ready.js, lists it with the DTC and the mission)
function kbWarn() {
  const tab = document.querySelector('.tab[data-t=kn]'),
    u = kbUnsaved();
  if (tab) tab.classList.toggle('unsaved', u);
  const sv = $('kbsave');
  if (sv) sv.classList.toggle('nil', !u);
}
export function kbWatch() {
  if (isDesktop()) okbFind().catch(() => {});
  // the look of the cards (Light / Dark cards) is kept in a file of the program too: the browser storage of the desktop app is not reliable at start
  loadPrefs('cardlook.json')
    .then(async o => {
      if (!o || typeof o.dark != 'boolean' || o.dark === cardDark()) return;
      setCardDark(o.dark);
      if ((await kbLook(o.dark)) && $('kn') && !$('kn').classList.contains('hide')) kbRender();
      const b = $('kbcd');
      if (b) {
        b.classList.toggle('g', !o.dark);
        b.textContent = o.dark ? '☾ Dark cards' : '☀ Light cards';
      }
    })
    .catch(() => {});
  loadPrefs('kbsaved.json')
    .then(o => {
      if (o && typeof o.sig == 'string') KBLAST = o.sig;
    })
    .catch(() => {})
    .finally(() => {
      kbWarn();
      setInterval(kbWarn, 1500);
    });
}

export async function init17() {
  KBS = DEFAULT_SLOTS();
  KBDEF = kbCopy(KBS);
  dcPage = createDocsPage({
    root: $('dc'),
    esc,
    docsDir: () => (!isDesktop() ? null : ST.CFG.paths.bmsInstall ? jp(ST.CFG.paths.bmsInstall, 'Docs') : ''),
    chartDirs: () => {
      const i = ST.CFG.paths.bmsInstall;
      if (!isDesktop() || !i) return [];
      return [ST.TH && ST.TH.docs ? jp(i, 'Data', ST.TH.docs) : jp(i, 'Docs')];
    },
    listDir,
    readBytes,
    join: joinPath,
    anim: animOn,
    pdf: { open: pdfOpen, render: pdfRender, renderTo: pdfRenderTo, text: pdfPageText },
    addCard: kbAddPic,
    airports: dcIcaos,
    toast: appToast,
  });
  kbWatch();
  onFilesDropped(
    (files, pos) => {
      if ($('kn').classList.contains('hide')) return;
      const ok = files.filter(f => /\.(jpe?g|png|webp|pdf)$/i.test(f.name));
      if (!ok.length) {
        $('kbst').textContent = 'Only jpg, png, webp and pdf files can be dropped here.';
        return;
      }
      const c = kbSlotAt(pos);
      if (c && KBS[+c.dataset.r][c.dataset.s].kind == 'empty') {
        kbImport(ok, c.dataset.s, +c.dataset.r);
        return;
      } // dropped on an empty slot: the file goes straight into it
      if (animOn()) kbImport(ok, null, 0);
      else {
        let r = 0;
        while (r < ROWS - 1 && KBS[r].left.kind != 'empty') r++;
        kbImport(ok, 'left', r);
      }
    },
    (on, pos) => {
      const k = $('kn');
      if (!k) return;
      const show = on && !k.classList.contains('hide');
      k.querySelectorAll('div.kbt.dr').forEach(x => x.classList.remove('dr'));
      const c = show ? kbSlotAt(pos) : null,
        slot = c && KBS[+c.dataset.r][c.dataset.s].kind == 'empty';
      if (slot) c.classList.add('dr');
      k.classList.toggle('dropping', show && !slot);
    }
  );
}
