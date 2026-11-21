// THE HIGHEST GROUND OF EVERY KM OF THE THEATER, for the MSA / ERAA (core/msa.js setCellMax): made once from the whole HeightMap.raw of the BMS folder, in the
// background, and kept in the program folder (cache\terrmax_<theater>.bin, about 2 MB); made again when the height map of BMS changes (its size or date).
// While it is being made the MSA reads a few samples of each cell as before; when it is ready the MSA of the flight and of the airbases are made again from it:
// the true highest of all the samples of each cell, nothing read any more.
// The file: "TMAX1\n", a line of JSON {key, k} (k: cells on a side - 1), then (k+1)^2 little-endian int16 (feet; -32768 = nothing), row j (north km) by row,
// i (east km) along it. Cell i, j is the square of 1 km around the point i km east, j km north (the cells of core/msa.js).
import { setCellMax, CELL } from '../core/msa.js';
import { busyStart, busySet, busyEnd } from '../core/busy.js';
import { terrain } from './gamefiles.js';
import {
  appDir,
  isDesktop,
  readBytes,
  writeBytes,
  makeDir,
  fileExists,
  fileStat,
  openRead,
} from '../platform/desktop.js';
import { ST } from './state.js';
import { jp } from './base.js';
import { clearMsa, msaFill } from './msafill.js';

const NONE = -32768;
let RUN = null, // the key being made / made
  READY = null; // {key, k, v}
export const terrMaxReady = () => !!READY;

const use = g => {
  READY = g;
  const K = g.k,
    W = K + 1;
  setCellMax((i, j) => (i < 0 || j < 0 || i > K || j > K || g.v[j * W + i] === NONE ? null : g.v[j * W + i]));
};

/** the grid of the highest ground: read from its file, else made (in the background); called when the game data are loaded (gamedata.js) */
export async function terrMaxStart() {
  if (!isDesktop()) return;
  const t = await terrain();
  if (!t) {
    RUN = null;
    READY = null;
    setCellMax(null);
    return;
  }
  const st = await fileStat(t.path),
    key = [t.path.toLowerCase(), st ? st.size : 0, st ? st.mtime : 0, t.spec.side, Math.round(t.spec.sizeFt)].join('|');
  if (RUN === key) return;
  RUN = key;
  READY = null;
  setCellMax(null);
  let dir = '';
  try {
    dir = jp(await appDir(), 'cache');
  } catch (e) {
    return;
  }
  const file = jp(dir, 'terrmax_' + String((ST.TH && ST.TH.name) || 'theater').replace(/[^\w.-]+/g, '_') + '.bin');
  // the grid made before for this height map
  try {
    if (await fileExists(file)) {
      const b = await readBytes(file),
        nl = b.indexOf(10, 6),
        h = JSON.parse(new TextDecoder().decode(b.subarray(6, nl)));
      if (new TextDecoder().decode(b.subarray(0, 6)) == 'TMAX1\n' && h.key === key) {
        const n = (h.k + 1) * (h.k + 1),
          d = b.slice(nl + 1, nl + 1 + n * 2);
        if (d.length == n * 2) {
          use({ key, k: h.k, v: new Int16Array(d.buffer) });
          return;
        }
      }
    }
  } catch (e) {
    /* made again */
  }
  const g = await build(t, key);
  if (!g || RUN !== key) return;
  use(g);
  try {
    await makeDir(dir);
    const head = new TextEncoder().encode('TMAX1\n' + JSON.stringify({ key, k: g.k }) + '\n'),
      out = new Uint8Array(head.length + g.v.byteLength);
    out.set(head, 0);
    out.set(new Uint8Array(g.v.buffer), head.length);
    await writeBytes(file, out);
  } catch (e) {
    /* made again next time */
  }
  // the MSA already shown, made again from it
  clearMsa();
  try {
    if (ST.CL && ST.CL.length && ST.AUTO) msaFill(+(/** @type {any} */ (document.getElementById('fsel')).value) || 0);
  } catch (e) {}
}

// the whole height map read row band by row band (4 MB at a time), every sample to its cell
async function build(t, key) {
  const side = t.spec.side,
    K = Math.round(t.spec.sizeFt / CELL),
    v = new Int16Array((K + 1) * (K + 1)).fill(NONE),
    // the cell of each column (east) and of each row (north; the file starts in the north), as heightmap.js places a point
    cellOf = q => Math.round(((q / (side - 1)) * t.spec.sizeFt) / CELL),
    segs = []; // [first column, last column + 1, cell i]
  for (let c = 0; c < side;) {
    const i = cellOf(c);
    let e = c + 1;
    while (e < side && cellOf(e) === i) e++;
    segs.push([c, e, i]);
    c = e;
  }
  const ROWS = Math.max(1, Math.floor((4 << 20) / (side * 2))),
    bz = busyStart('Preparing the terrain for the MSA (once)…', true);
  try {
    const f = await openRead(t.path);
    try {
      for (let r0 = 0; r0 < side; r0 += ROWS) {
        if (RUN !== key) return null; // another theater chosen meanwhile
        const nr = Math.min(ROWS, side - r0),
          buf = new Uint8Array(nr * side * 2);
        if ((await f.read(buf)) < buf.length) return null;
        const a = new Int16Array(buf.buffer, 0, nr * side);
        for (let r = 0; r < nr; r++) {
          const j = Math.round((((side - 1 - (r0 + r)) / (side - 1)) * t.spec.sizeFt) / CELL),
            base = j * (K + 1),
            o = r * side;
          if (j < 0 || j > K) continue;
          for (const [c0, c1, i] of segs) {
            if (i < 0 || i > K) continue;
            let m = v[base + i];
            for (let c = o + c0, e = o + c1; c < e; c++) if (a[c] > m) m = a[c];
            v[base + i] = m;
          }
        }
        busySet(bz, ((r0 + nr) / side) * 100);
        await new Promise(res => setTimeout(res, 0)); // the program stays usable
      }
    } finally {
      await f.close();
    }
  } catch (e) {
    return null;
  } finally {
    busyEnd(bz);
  }
  return { key, k: K, v };
}
