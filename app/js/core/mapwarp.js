// Re-projects a theater map picture (north up, in the campaign grid: linear in km) onto the Web Mercator used by the map page.
// The picture is cut into a mesh of small triangles; each one is drawn with the affine transform that maps its corners.
import { tmInv, tmFwd } from '../rules/geo.js';

// Area covered by the official BMS KTO map picture (KTO_UI_Map_6k.jpeg): the whole 1024 x 1024 km theater, north up, linear in the
// campaign grid (4 px per km on the 4096 px grid of the interactive map). Found by fitting the airbase hot spots of the official
// interactive map (49 airbases, 0.5 km rms: x = 4.003 px/km - 2.5, y = 4097 - 4.000 px/km).
export const BMS_EXTENT = { x0: 0, x1: 1024, y0: 0, y1: 1024 };

const rad = Math.PI / 180,
  merc = lat => Math.log(Math.tan(Math.PI / 4 + (lat * rad) / 2));

// Pure geometry (no DOM): output size and lat/lon bounds for a picture of w x h pixels
export function warpFrame(ext, w, h, outW) {
  const ll = (px, py) =>
    tmInv((ext.x0 + (px / w) * (ext.x1 - ext.x0) - 512) * 1000, (ext.y1 - (py / h) * (ext.y1 - ext.y0) - 512) * 1000);
  let la0 = 90,
    la1 = -90,
    lo0 = 180,
    lo1 = -180;
  for (let i = 0; i <= 40; i++)
    for (const [px, py] of [
      [(i / 40) * w, 0],
      [(i / 40) * w, h],
      [0, (i / 40) * h],
      [w, (i / 40) * h],
    ]) {
      const [la, lo] = ll(px, py);
      la0 = Math.min(la0, la);
      la1 = Math.max(la1, la);
      lo0 = Math.min(lo0, lo);
      lo1 = Math.max(lo1, lo);
    }
  const x0 = lo0 * rad,
    x1 = lo1 * rad,
    y0 = merc(la0),
    y1 = merc(la1),
    outH = Math.round((outW * (y1 - y0)) / (x1 - x0));
  // source pixel -> output pixel
  const dst = (px, py) => {
    const [la, lo] = ll(px, py);
    return [((lo * rad - x0) / (x1 - x0)) * outW, ((y1 - merc(la)) / (y1 - y0)) * outH];
  };
  return {
    outW,
    outH,
    bounds: [
      [la0, lo0],
      [la1, lo1],
    ],
    dst,
  };
}

// affine matrix [a b c d e f] with dst = (a*x + c*y + e, b*x + d*y + f) for three point pairs
export function affine(s, d) {
  const [[x0, y0], [x1, y1], [x2, y2]] = s,
    det = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  const solve = (u0, u1, u2) => {
    const a = ((u1 - u0) * (y2 - y0) - (u2 - u0) * (y1 - y0)) / det,
      c = ((x1 - x0) * (u2 - u0) - (x2 - x0) * (u1 - u0)) / det;
    return [a, c, u0 - a * x0 - c * y0];
  };
  const [a, c, e] = solve(d[0][0], d[1][0], d[2][0]),
    [b, dd, f] = solve(d[0][1], d[1][1], d[2][1]);
  return [a, b, c, dd, e, f];
}

// img: HTMLImageElement / ImageBitmap / canvas. Returns {canvas, bounds}
function* warpSteps(img, ext, outW, N) {
  const w = img.naturalWidth || img.width,
    h = img.naturalHeight || img.height,
    F = warpFrame(ext, w, h, outW);
  const cv = document.createElement('canvas');
  cv.width = F.outW;
  cv.height = F.outH;
  const c = cv.getContext('2d');
  c.imageSmoothingQuality = 'high';
  const G = [];
  for (let j = 0; j <= N; j++) {
    G.push([]);
    for (let i = 0; i <= N; i++) G[j].push(F.dst((i / N) * w, (j / N) * h));
  }
  const grow = (tri, e) => {
    const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3,
      cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
    return tri.map(p => {
      const dx = p[0] - cx,
        dy = p[1] - cy,
        l = Math.hypot(dx, dy) || 1;
      return [p[0] + (dx / l) * e, p[1] + (dy / l) * e];
    });
  };
  for (let j = 0; j < N; j++) {
    yield j / N;
    for (let i = 0; i < N; i++) {
      const sx0 = (i / N) * w,
        sx1 = ((i + 1) / N) * w,
        sy0 = (j / N) * h,
        sy1 = ((j + 1) / N) * h;
      const S = [
          [sx0, sy0],
          [sx1, sy0],
          [sx1, sy1],
          [sx0, sy1],
        ],
        Dp = [G[j][i], G[j][i + 1], G[j + 1][i + 1], G[j + 1][i]];
      for (const t of [
        [0, 1, 2],
        [0, 2, 3],
      ]) {
        const s = t.map(k => S[k]),
          d = t.map(k => Dp[k]),
          m = affine(s, d),
          g = grow(d, 0.8);
        c.save();
        c.beginPath();
        c.moveTo(g[0][0], g[0][1]);
        c.lineTo(g[1][0], g[1][1]);
        c.lineTo(g[2][0], g[2][1]);
        c.closePath();
        c.clip();
        c.setTransform(...m);
        c.drawImage(
          img,
          sx0 - 1,
          sy0 - 1,
          sx1 - sx0 + 2,
          sy1 - sy0 + 2,
          sx0 - 1,
          sy0 - 1,
          sx1 - sx0 + 2,
          sy1 - sy0 + 2
        );
        c.restore();
      }
    }
  }
  return { canvas: cv, bounds: F.bounds };
}
export function warpImage(img, ext = BMS_EXTENT, outW = 4096, N = 40) {
  const g = warpSteps(img, ext, outW, N);
  let r;
  do {
    r = g.next();
  } while (!r.done);
  return r.value;
}
// the same, in slices (one row of the mesh at a time) so the page stays responsive; onProgress(0..1) after each row
export async function warpImageAsync(img, ext = BMS_EXTENT, outW = 4096, N = 40, onProgress) {
  const g = warpSteps(img, ext, outW, N);
  for (;;) {
    const r = g.next();
    if (r.done) return r.value;
    if (onProgress) onProgress(r.value);
    await new Promise(res => setTimeout(res, 0));
  }
}

// One 256 px web-mercator tile (z/x/y) cut out of a theater picture, drawn onto the canvas `cv`: every tile is drawn straight from the
// picture at full resolution through a small mesh (N x N cells), so a very large picture needs no huge intermediate canvas and tiles are
// made only when they are shown. src: image / ImageBitmap / canvas of sw x sh pixels in the extent `ext`. Returns false when the tile
// lies outside the picture (nothing drawn).
export function pictureTile(cv, src, sw, sh, ext, z, x, y, N = 4) {
  const size = cv.width,
    n = 2 ** z;
  const sp = (px, py) => {
    const X = (x + px / size) / n,
      Y = (y + py / size) / n,
      la = Math.atan(Math.sinh(Math.PI * (1 - 2 * Y))) / rad,
      lo = X * 360 - 180;
    const [e, nn] = tmFwd(la, lo);
    return [
      ((e / 1000 + 512 - ext.x0) / (ext.x1 - ext.x0)) * sw,
      ((ext.y1 - (nn / 1000 + 512)) / (ext.y1 - ext.y0)) * sh,
    ];
  };
  const G = [];
  let inside = false;
  for (let j = 0; j <= N; j++) {
    G.push([]);
    for (let i = 0; i <= N; i++) {
      const s = sp((i / N) * size, (j / N) * size);
      G[j].push(s);
      if (s[0] > 0 && s[0] < sw && s[1] > 0 && s[1] < sh) inside = true;
    }
  }
  if (!inside) {
    // no mesh point inside: the picture can still cross the tile (small tile, big picture) - test the corners of the tile in the picture
    const xs = G.flat().map(p => p[0]),
      ys = G.flat().map(p => p[1]);
    if (Math.max(...xs) < 0 || Math.min(...xs) > sw || Math.max(...ys) < 0 || Math.min(...ys) > sh) return false;
  }
  const c = cv.getContext('2d');
  c.imageSmoothingQuality = 'high';
  const grow = (tri, e) => {
    const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3,
      cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
    return tri.map(p => {
      const dx = p[0] - cx,
        dy = p[1] - cy,
        l = Math.hypot(dx, dy) || 1;
      return [p[0] + (dx / l) * e, p[1] + (dy / l) * e];
    });
  };
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const S = [G[j][i], G[j][i + 1], G[j + 1][i + 1], G[j + 1][i]],
        D = [
          [i, j],
          [i + 1, j],
          [i + 1, j + 1],
          [i, j + 1],
        ].map(([a, b]) => [(a / N) * size, (b / N) * size]);
      for (const t of [
        [0, 1, 2],
        [0, 2, 3],
      ]) {
        const s = t.map(k => S[k]),
          d = t.map(k => D[k]);
        const bx0 = Math.max(0, Math.floor(Math.min(...s.map(p => p[0])) - 1)),
          by0 = Math.max(0, Math.floor(Math.min(...s.map(p => p[1])) - 1));
        const bx1 = Math.min(sw, Math.ceil(Math.max(...s.map(p => p[0])) + 1)),
          by1 = Math.min(sh, Math.ceil(Math.max(...s.map(p => p[1])) + 1));
        if (bx1 <= bx0 || by1 <= by0) continue;
        const m = affine(s, d),
          g = grow(d, 0.6);
        c.save();
        c.beginPath();
        c.moveTo(g[0][0], g[0][1]);
        c.lineTo(g[1][0], g[1][1]);
        c.lineTo(g[2][0], g[2][1]);
        c.closePath();
        c.clip();
        c.setTransform(...m);
        if (src.draw) src.draw(c, bx0, by0, bx1, by1);
        else c.drawImage(src, bx0, by0, bx1 - bx0, by1 - by0, bx0, by0, bx1 - bx0, by1 - by0);
        c.restore();
      }
    }
  return true;
}

// A big picture kept as a grid of blocks (ImageBitmaps of at most `bs` px): drawing a small part never touches the whole picture.
// Returns {sw, sh, draw(c, x0, y0, x1, y1)} (the form pictureTile takes as a source). `bmp` is closed. onProgress(0..1) per block.
export async function blockSource(bmp, bs = 2048, onProgress) {
  const sw = bmp.width,
    sh = bmp.height,
    blocks = [],
    nx = Math.ceil(sw / bs),
    ny = Math.ceil(sh / bs);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const x = i * bs,
        y = j * bs,
        w = Math.min(bs, sw - x),
        h = Math.min(bs, sh - y);
      blocks.push({ x, y, w, h, bmp: await createImageBitmap(bmp, x, y, w, h) });
      if (onProgress) onProgress(blocks.length / (nx * ny));
    }
  bmp.close();
  return {
    sw,
    sh,
    draw(c, x0, y0, x1, y1) {
      for (const b of blocks) {
        const ix0 = Math.max(x0, b.x),
          iy0 = Math.max(y0, b.y),
          ix1 = Math.min(x1, b.x + b.w),
          iy1 = Math.min(y1, b.y + b.h);
        if (ix1 > ix0 && iy1 > iy0)
          c.drawImage(b.bmp, ix0 - b.x, iy0 - b.y, ix1 - ix0, iy1 - iy0, ix0, iy0, ix1 - ix0, iy1 - iy0);
      }
    },
  };
}
