// @ts-check
// A colour picker in the look of the program (not the system one): a saturation / brightness square, a hue bar and the R G B values.
// colorPicker(el, hex, {live, pick}): built inside el; live(hex) while a knob moves, pick(hex) when it is let go or a value is typed.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const hexRgb = h => {
  const n = parseInt(String(h).replace('#', ''), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const rgbHex = (r, g, b) =>
  [r, g, b]
    .map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
export function rgbHsv(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const mx = Math.max(r, g, b),
    mn = Math.min(r, g, b),
    d = mx - mn;
  let h = 0;
  if (d) h = mx == r ? ((g - b) / d) % 6 : mx == g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [((h * 60 + 360) % 360) / 360, mx ? d / mx : 0, mx];
}
export function hsvRgb(h, s, v) {
  const f = n => {
    const k = (n + h * 6) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5) * 255, f(3) * 255, f(1) * 255];
}
/** @param {HTMLElement} el @param {string} hex @param {{live?: (h: string) => void, pick: (h: string) => void}} o */
export function colorPicker(el, hex, o) {
  el.classList.add('cpk');
  el.innerHTML =
    '<div class="cpsv"><i class="cpk1"></i></div><div class="cphue"><i class="cpk2"></i></div>' +
    '<div class="cprgb">' +
    ['R', 'G', 'B']
      .map(c => `<label>${c}<input type="number" min="0" max="255" step="1" data-c="${c}"></label>`)
      .join('') +
    '</div>';
  const sv = /** @type {HTMLElement} */ (el.querySelector('.cpsv')),
    hue = /** @type {HTMLElement} */ (el.querySelector('.cphue')),
    k1 = /** @type {HTMLElement} */ (el.querySelector('.cpk1')),
    k2 = /** @type {HTMLElement} */ (el.querySelector('.cpk2')),
    ins = /** @type {HTMLInputElement[]} */ ([...el.querySelectorAll('input[data-c]')]);
  let [h, s, v] = rgbHsv(...hexRgb(hex));
  const cur = () => rgbHex(...hsvRgb(h, s, v));
  const show = () => {
    sv.style.background = `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, #${rgbHex(...hsvRgb(h, 1, 1))})`;
    k1.style.left = s * 100 + '%';
    k1.style.top = (1 - v) * 100 + '%';
    k1.style.background = '#' + cur();
    k2.style.left = h * 100 + '%';
    const rgb = hsvRgb(h, s, v);
    ins.forEach((i, n) => {
      if (document.activeElement !== i) i.value = String(Math.round(rgb[n]));
    });
  };
  const drag = (area, f) => {
    area.onpointerdown = e => {
      area.setPointerCapture(e.pointerId);
      const mv = ev => {
        const r = area.getBoundingClientRect();
        f(clamp((ev.clientX - r.left) / r.width, 0, 1), clamp((ev.clientY - r.top) / r.height, 0, 1));
        show();
        if (o.live) o.live(cur());
      };
      mv(e);
      area.onpointermove = mv;
      area.onpointerup = area.onpointercancel = () => {
        area.onpointermove = area.onpointerup = area.onpointercancel = null;
        o.pick(cur());
      };
    };
  };
  drag(sv, (x, y) => {
    s = x;
    v = 1 - y;
  });
  drag(hue, x => {
    h = Math.min(x, 0.9999);
  });
  ins.forEach(
    i =>
      (i.onchange = () => {
        const c = ins.map(x => clamp(Math.round(+x.value || 0), 0, 255));
        [h, s, v] = rgbHsv(c[0], c[1], c[2]);
        show();
        o.pick(cur());
      })
  );
  show();
  return {
    set: x => {
      [h, s, v] = rgbHsv(...hexRgb(x));
      show();
    },
  };
}
