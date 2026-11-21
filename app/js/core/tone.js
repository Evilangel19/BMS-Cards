// COCKPIT TONE: a filter put on the kneeboard pages when they are written (and on the preview of the Kneeboard page), for the light of the BMS cockpit,
// that shows the pages lighter and flatter than on screen. Brightness and Contrast as in Photoshop (Image > Adjustments > Brightness/Contrast, not
// Legacy): the pilot's -50 / 100 made the page of the curve measured on each channel: a black point at 26 (contrast) and a gamma of 1.53 (brightness), the
// white kept white. A dark page (the dark cards) gets it only when asked. Settings > Kneeboard; the cards themselves are kept without it.
//   tone: {on, bright: -100..100, contrast: -50..100, dark}

/** the curve of each channel: 256 values */
export function toneLUT(t) {
  const L = new Uint8ClampedArray(256),
    c = Math.max(-50, Math.min(100, +t.contrast || 0)),
    b = Math.max(-100, Math.min(100, +t.bright || 0)),
    g = Math.pow(2, -b / 81.5), // -50: 1.53, the gamma measured
    bp = c > 0 ? 0.26 * c : 0, // 100: the black at 26, as measured
    lo = c < 0 ? -0.9 * c : 0; // less contrast: the black lifted (and the white lowered as much)
  for (let v = 0; v < 256; v++) {
    const u = Math.max(0, Math.min(1, (v - bp) / (255 - bp)));
    L[v] = Math.round(lo + (255 - 2 * lo) * Math.pow(u, g));
  }
  return L;
}
/** a tone that changes something */
export const toneOn = t => !!(t && t.on && ((+t.bright || 0) != 0 || (+t.contrast || 0) != 0));

/** the tone put on RGBA pixels (W x H, in place): each half of the width is a page of its own (the two pages of a kneeboard file), a dark page only
 * with t.dark */
export function toneRGBA(d, W, H, t) {
  if (!toneOn(t)) return d;
  const L = toneLUT(t),
    hw = W >> 1;
  for (const x0 of [0, hw]) {
    // a dark page: the mean light of the page (a sample of its pixels)
    let lum = 0,
      n = 0;
    for (let y = 0; y < H; y += 7)
      for (let x = x0; x < x0 + hw; x += 7) {
        const i = (y * W + x) * 4;
        lum += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
        n++;
      }
    if (n && lum / n < 110 && !t.dark) continue;
    for (let y = 0; y < H; y++) {
      let i = (y * W + x0) * 4;
      for (let x = 0; x < hw; x++, i += 4) {
        d[i] = L[d[i]];
        d[i + 1] = L[d[i + 1]];
        d[i + 2] = L[d[i + 2]];
      }
    }
  }
  return d;
}
