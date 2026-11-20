// DDS encoders of the datacard and kneeboard pictures: DXT1 (toDDS) and DXT5 with mipmaps (toDDS5). W = side in pixels, d = RGBA bytes of a W x W picture.
// Each 4x4 block takes its two colours along the main axis of its colours, then refined by least squares; the old choice (the lightest and the darkest
// pixel) is tried too and the block keeps whichever is closer, so it is never worse. The mipmaps lean to the dark side (dark text keeps its weight
// instead of fading to grey) and are lightly sharpened, as is done for textures with text.
const q565 = (r, g, b) =>
  ((Math.max(0, Math.min(255, Math.round(r))) >> 3) << 11) |
  ((Math.max(0, Math.min(255, Math.round(g))) >> 2) << 5) |
  (Math.max(0, Math.min(255, Math.round(b))) >> 3);
const e565 = c => [(((c >> 11) & 31) * 255) / 31, (((c >> 5) & 63) * 255) / 63, ((c & 31) * 255) / 31];
// the four colours of a block from its two (4-colour mode, c0 > c1) and the indices of its pixels: [error, bits]
function fitBlock(px, c0, c1) {
  const a = e565(c0),
    b = e565(c1),
    P = [a, b, a.map((v, k) => (2 * v + b[k]) / 3), a.map((v, k) => (v + 2 * b[k]) / 3)];
  let bits = 0,
    err = 0;
  for (let k = 0; k < 16; k++) {
    let best = 0,
      bd = 1e12;
    for (let j = 0; j < 4; j++) {
      const dd = (px[k * 3] - P[j][0]) ** 2 + (px[k * 3 + 1] - P[j][1]) ** 2 + (px[k * 3 + 2] - P[j][2]) ** 2;
      if (dd < bd) {
        bd = dd;
        best = j;
      }
    }
    bits |= best << (2 * k);
    err += bd;
  }
  return [err, bits >>> 0];
}
const W4 = [1, 0, 2 / 3, 1 / 3]; // the weight of the first colour in each of the four
// writes the 8 bytes of a colour block (px: 16 x [r, g, b] flat) at o
function colorBlock(px, dv, o) {
  let lo = 1e9,
    hi = -1,
    il = 0,
    ih = 0,
    mr = 0,
    mg = 0,
    mb = 0;
  for (let k = 0; k < 16; k++) {
    const r = px[k * 3],
      g = px[k * 3 + 1],
      b = px[k * 3 + 2],
      l = r * 3 + g * 6 + b;
    mr += r;
    mg += g;
    mb += b;
    if (l < lo) {
      lo = l;
      il = k;
    }
    if (l > hi) {
      hi = l;
      ih = k;
    }
  }
  const cands = [[q565(px[ih * 3], px[ih * 3 + 1], px[ih * 3 + 2]), q565(px[il * 3], px[il * 3 + 1], px[il * 3 + 2])]];
  if (lo != hi) {
    // the main axis of the colours (power iteration on the covariance), the two ends of the block along it
    mr /= 16;
    mg /= 16;
    mb /= 16;
    let crr = 0,
      crg = 0,
      crb = 0,
      cgg = 0,
      cgb = 0,
      cbb = 0;
    for (let k = 0; k < 16; k++) {
      const r = px[k * 3] - mr,
        g = px[k * 3 + 1] - mg,
        b = px[k * 3 + 2] - mb;
      crr += r * r;
      crg += r * g;
      crb += r * b;
      cgg += g * g;
      cgb += g * b;
      cbb += b * b;
    }
    let vr = 1,
      vg = 1,
      vb = 1;
    for (let it = 0; it < 6; it++) {
      const r = crr * vr + crg * vg + crb * vb,
        g = crg * vr + cgg * vg + cgb * vb,
        b = crb * vr + cgb * vg + cbb * vb,
        m = Math.max(Math.abs(r), Math.abs(g), Math.abs(b)) || 1;
      vr = r / m;
      vg = g / m;
      vb = b / m;
    }
    let tmin = 1e9,
      tmax = -1e9;
    for (let k = 0; k < 16; k++) {
      const t = (px[k * 3] - mr) * vr + (px[k * 3 + 1] - mg) * vg + (px[k * 3 + 2] - mb) * vb;
      if (t < tmin) tmin = t;
      if (t > tmax) tmax = t;
    }
    const n2 = vr * vr + vg * vg + vb * vb || 1;
    let A = [mr + (vr * tmax) / n2, mg + (vg * tmax) / n2, mb + (vb * tmax) / n2],
      B = [mr + (vr * tmin) / n2, mg + (vg * tmin) / n2, mb + (vb * tmin) / n2];
    cands.push([q565(...A), q565(...B)]);
    // least squares: the two colours that best explain the pixels with their current choice of the four, twice
    for (let it = 0; it < 2; it++) {
      let c0 = q565(...A),
        c1 = q565(...B);
      if (c0 == c1) break;
      if (c0 < c1) [c0, c1, A, B] = [c1, c0, B, A];
      const [, bits] = fitBlock(px, c0, c1);
      let aa = 0,
        ab = 0,
        bb = 0;
      const xa = [0, 0, 0],
        xb = [0, 0, 0];
      for (let k = 0; k < 16; k++) {
        const w = W4[(bits >>> (2 * k)) & 3],
          v = 1 - w;
        aa += w * w;
        ab += w * v;
        bb += v * v;
        for (let c = 0; c < 3; c++) {
          xa[c] += w * px[k * 3 + c];
          xb[c] += v * px[k * 3 + c];
        }
      }
      const det = aa * bb - ab * ab;
      if (Math.abs(det) < 1e-6) break;
      A = [0, 1, 2].map(c => (bb * xa[c] - ab * xb[c]) / det);
      B = [0, 1, 2].map(c => (aa * xb[c] - ab * xa[c]) / det);
      cands.push([q565(...A), q565(...B)]);
    }
  }
  let best = null;
  for (let [c0, c1] of cands) {
    if (c0 == c1) {
      const r = [fitBlock(px, c0, c1)[0], 0, c0, c1];
      if (!best || r[0] < best[0]) best = r;
      continue;
    }
    if (c0 < c1) [c0, c1] = [c1, c0];
    const [err, bits] = fitBlock(px, c0, c1);
    if (!best || err < best[0]) best = [err, bits, c0, c1];
  }
  // a block of one colour: all its pixels on the first one (4-colour mode needs c0 > c1: the same colour twice is read as 3-colour mode, still right for index 0)
  dv.setUint16(o, best[2], true);
  dv.setUint16(o + 2, best[3], true);
  dv.setUint32(o + 4, best[2] == best[3] ? 0 : best[1], true);
}
// the colour blocks of a Z x Z picture (RGBA) from o; alpha: the 8 bytes of an opaque alpha block before each (DXT5)
function blocks(cur, Z, dv, out, o, alpha) {
  const px = new Float64Array(48);
  for (let by = 0; by < Z; by += 4)
    for (let bx = 0; bx < Z; bx += 4) {
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++) {
          const i = (Math.min(by + y, Z - 1) * Z + Math.min(bx + x, Z - 1)) * 4,
            k = (y * 4 + x) * 3;
          px[k] = cur[i];
          px[k + 1] = cur[i + 1];
          px[k + 2] = cur[i + 2];
        }
      if (alpha) {
        out[o] = 255;
        out[o + 1] = 255;
        o += 8;
      }
      colorBlock(px, dv, o);
      o += 8;
    }
  return o;
}
export function toDDS(W, d) {
  const out = new Uint8Array(128 + (W * W) / 2),
    dv = new DataView(out.buffer);
  const H = [0x20534444, 124, 0xa1007, W, W, (W * W) / 2, 0, 1];
  H.forEach((v, i) => dv.setUint32(i * 4, v, true));
  dv.setUint32(76, 32, true);
  dv.setUint32(80, 4, true);
  dv.setUint32(84, 0x31545844, true);
  dv.setUint32(108, 0x1000, true);
  blocks(d, W, dv, out, 128, false);
  return out;
}
// the mipmaps keep the weight of dark text: averaged as a power mean (v^(1/G), G > 1), which leans to the dark side, where a plain average of a black
// stroke on white fades it to grey at every level (and an average in linear light even more)
// (a dark page, light text on it, leans the other way: G below 1)
const powTab = g => new Float64Array(256).map((_, i) => (i / 255) ** (1 / g)),
  PWD = powTab(1.8),
  PWL = powTab(1 / 1.8);
// the next mipmap: half the side, averaged as a power mean (above), then a light unsharp mask (amount SH) so that text stays crisp
const SH = 0.35;
export function mipDown(cur, P, dark = false) {
  const Z = P >> 1,
    lin = new Float64Array(Z * Z * 3),
    G = dark ? 1 / 1.8 : 1.8,
    PW = dark ? PWL : PWD,
    back = v => 255 * v ** G;
  for (let y = 0; y < Z; y++)
    for (let x = 0; x < Z; x++)
      for (let c = 0; c < 3; c++)
        lin[(y * Z + x) * 3 + c] =
          (PW[cur[(y * 2 * P + x * 2) * 4 + c]] +
            PW[cur[(y * 2 * P + x * 2 + 1) * 4 + c]] +
            PW[cur[((y * 2 + 1) * P + x * 2) * 4 + c]] +
            PW[cur[((y * 2 + 1) * P + x * 2 + 1) * 4 + c]]) /
          4;
  const s = new Float64Array(Z * Z * 3);
  for (let i = 0; i < lin.length; i++) s[i] = back(lin[i]);
  const n = new Uint8ClampedArray(Z * Z * 4);
  for (let y = 0; y < Z; y++)
    for (let x = 0; x < Z; x++) {
      const i = y * Z + x;
      for (let c = 0; c < 3; c++) {
        let t = 0,
          m = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const yy = y + dy,
              xx = x + dx;
            if (yy < 0 || xx < 0 || yy >= Z || xx >= Z) continue;
            const w = dx && dy ? 1 : dx || dy ? 2 : 4;
            t += s[(yy * Z + xx) * 3 + c] * w;
            m += w;
          }
        const v = s[i * 3 + c];
        n[i * 4 + c] = Z >= 8 ? v + SH * (v - t / m) : v;
      }
      n[i * 4 + 3] = 255;
    }
  return n;
}
export function toDDS5(W, d) {
  const sizes = [];
  let w = W;
  while (true) {
    sizes.push(w);
    if (w == 1) break;
    w >>= 1;
  }
  let tot = 0;
  sizes.forEach(z => (tot += Math.max(1, z >> 2) * Math.max(1, z >> 2) * 16));
  const out = new Uint8Array(128 + tot),
    dv = new DataView(out.buffer);
  [0x20534444, 124, 0xa1007, W, W, Math.max(1, W >> 2) * Math.max(1, W >> 2) * 16, 1, sizes.length].forEach((v, i) =>
    dv.setUint32(i * 4, v, true)
  );
  dv.setUint32(76, 32, true);
  dv.setUint32(80, 4, true);
  dv.setUint32(84, 0x35545844, true);
  dv.setUint32(108, 0x401008, true);
  // a dark page (the dark cards): its mipmaps lean to the light side, so that its light text keeps its weight
  let lum = 0,
    n = 0;
  for (let i = 0; i < d.length; i += 4 * 97) {
    lum += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
    n++;
  }
  const dark = n > 0 && lum / n < 110;
  let o = 128,
    cur = d;
  sizes.forEach((Z, li) => {
    if (li > 0) cur = mipDown(cur, sizes[li - 1], dark);
    o = blocks(cur, Z, dv, out, o, true);
  });
  return out;
}
