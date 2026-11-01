// DDS encoders of the datacard and kneeboard pictures: DXT1 (toDDS) and DXT5 with mipmaps (toDDS5). W = side in pixels, d = RGBA bytes of a W x W picture.
export function toDDS(W, d) {
  const out = new Uint8Array(128 + (W * W) / 2),
    dv = new DataView(out.buffer);
  const H = [0x20534444, 124, 0xa1007, W, W, (W * W) / 2, 0, 1];
  H.forEach((v, i) => dv.setUint32(i * 4, v, true));
  dv.setUint32(76, 32, true);
  dv.setUint32(80, 4, true);
  dv.setUint32(84, 0x31545844, true);
  dv.setUint32(108, 0x1000, true);
  const q = (r, g, b) => ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3),
    e = c => [(((c >> 11) & 31) * 255) / 31, (((c >> 5) & 63) * 255) / 63, ((c & 31) * 255) / 31];
  let o = 128;
  const px = [];
  for (let by = 0; by < W; by += 4)
    for (let bx = 0; bx < W; bx += 4) {
      let lo = 1e9,
        hi = -1,
        il = 0,
        ih = 0;
      px.length = 0;
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++) {
          const i = ((by + y) * W + bx + x) * 4,
            r = d[i],
            g = d[i + 1],
            b = d[i + 2],
            l = r * 3 + g * 6 + b;
          px.push([r, g, b]);
          if (l < lo) {
            lo = l;
            il = px.length - 1;
          }
          if (l > hi) {
            hi = l;
            ih = px.length - 1;
          }
        }
      let c0 = q(...px[ih]),
        c1 = q(...px[il]);
      if (c0 == c1) {
        dv.setUint16(o, c0, true);
        dv.setUint16(o + 2, c1, true);
        dv.setUint32(o + 4, 0, true);
        o += 8;
        continue;
      }
      if (c0 < c1) {
        const t = c0;
        c0 = c1;
        c1 = t;
      }
      const a = e(c0),
        b2 = e(c1),
        P = [a, b2, a.map((v, k) => (2 * v + b2[k]) / 3), a.map((v, k) => (v + 2 * b2[k]) / 3)];
      let bits = 0;
      for (let k = 0; k < 16; k++) {
        let best = 0,
          bd = 1e12;
        for (let j = 0; j < 4; j++) {
          const dd = (px[k][0] - P[j][0]) ** 2 + (px[k][1] - P[j][1]) ** 2 + (px[k][2] - P[j][2]) ** 2;
          if (dd < bd) {
            bd = dd;
            best = j;
          }
        }
        bits |= best << (2 * k);
      }
      dv.setUint16(o, c0, true);
      dv.setUint16(o + 2, c1, true);
      dv.setUint32(o + 4, bits >>> 0, true);
      o += 8;
    }
  return out;
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
  const q = (r, g, b) => ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3),
    e = c => [(((c >> 11) & 31) * 255) / 31, (((c >> 5) & 63) * 255) / 63, ((c & 31) * 255) / 31];
  let o = 128,
    cur = d;
  sizes.forEach((Z, li) => {
    if (li > 0) {
      const P = sizes[li - 1],
        n = new Uint8ClampedArray(Z * Z * 4);
      for (let y = 0; y < Z; y++)
        for (let x = 0; x < Z; x++)
          for (let c = 0; c < 4; c++) {
            let t = 0;
            for (let dy = 0; dy < 2; dy++)
              for (let dx = 0; dx < 2; dx++) t += cur[((y * 2 + dy) * P + x * 2 + dx) * 4 + c];
            n[(y * Z + x) * 4 + c] = Math.round(t / 4);
          }
      cur = n;
    }
    const px = [];
    for (let by = 0; by < Z; by += 4)
      for (let bx = 0; bx < Z; bx += 4) {
        let lo = 1e9,
          hi = -1,
          il = 0,
          ih = 0;
        px.length = 0;
        for (let y = 0; y < 4; y++)
          for (let x = 0; x < 4; x++) {
            const i = (Math.min(by + y, Z - 1) * Z + Math.min(bx + x, Z - 1)) * 4,
              r = cur[i],
              g = cur[i + 1],
              b = cur[i + 2],
              l = r * 3 + g * 6 + b;
            px.push([r, g, b]);
            if (l < lo) {
              lo = l;
              il = px.length - 1;
            }
            if (l > hi) {
              hi = l;
              ih = px.length - 1;
            }
          }
        out[o] = 255;
        out[o + 1] = 255;
        o += 8;
        let c0 = q(...px[ih]),
          c1 = q(...px[il]);
        if (c0 == c1) {
          dv.setUint16(o, c0, true);
          dv.setUint16(o + 2, c1, true);
          dv.setUint32(o + 4, 0, true);
          o += 8;
          continue;
        }
        if (c0 < c1) {
          const t = c0;
          c0 = c1;
          c1 = t;
        }
        const a = e(c0),
          b2 = e(c1),
          PL = [a, b2, a.map((v, k) => (2 * v + b2[k]) / 3), a.map((v, k) => (v + 2 * b2[k]) / 3)];
        let bits = 0;
        for (let k = 0; k < 16; k++) {
          let best = 0,
            bd = 1e12;
          for (let j = 0; j < 4; j++) {
            const dd = (px[k][0] - PL[j][0]) ** 2 + (px[k][1] - PL[j][1]) ** 2 + (px[k][2] - PL[j][2]) ** 2;
            if (dd < bd) {
              bd = dd;
              best = j;
            }
          }
          bits |= best << (2 * k);
        }
        dv.setUint16(o, c0, true);
        dv.setUint16(o + 2, c1, true);
        dv.setUint32(o + 4, bits >>> 0, true);
        o += 8;
      }
  });
  return out;
}
