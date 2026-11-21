// @ts-check
// The cards of the kneeboard are drawn at 1600 x 2400 and go into a page of 1024 x 2048 of the BMS texture (0.64 of their width), which in the cockpit is
// often seen through a mipmap of half or a quarter of that. So:
// - their small text is raised (kbPx: below 26 px halfway up to 26, at least 22: smaller does not read in the cockpit) and their greys and thin lines are darker and thicker than on a screen;
// - inkCard(x): the text can be made heavier (WUP) and drawn with an edge of its own colour (INK of its size): both off now;
// - the light look: its greys darker (inkRGB); the dark look (setCardDark): the colours are turned for a dark page as they are set (fillStyle, strokeStyle, gradients): the greys turned over
//   (white -> near black, black -> near white), the dark colours made lighter, the pale tints made dark tints; see-through colours are left as they are.
//   Pictures (the maps, already dark) are not touched, nor what is drawn while x.__raw is set (the labels on a map picture).
export const kbPx = s => (s >= 26 ? s : Math.max(22, Math.round(26 - (26 - s) * 0.5)));
export const kbLw = w => Math.max(2, w);
// the weight added to the text and its edge (a share of its size): kept off, heavy letters fill in at the size of the cockpit (1.3.0-beta.48)
export const INK = 0,
  WUP = 0;
let DARK = false;
const MEMO = new Map(); // the colours already turned (cleared when the look changes)
export const setCardDark = v => {
  DARK = !!v;
  MEMO.clear();
};
export const cardDark = () => DARK;

// --- colours
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
function parse(c) {
  c = String(c).trim().toLowerCase();
  let m = /^#([0-9a-f]{3,8})$/.exec(c);
  if (m) {
    let h = m[1];
    if (h.length == 3 || h.length == 4) h = [...h].map(z => z + z).join('');
    const n = parseInt(h.slice(0, 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, h.length == 8 ? parseInt(h.slice(6), 16) / 255 : 1];
  }
  m = /^rgba?\(([^)]+)\)$/.exec(c);
  if (m) {
    const p = m[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(parseFloat);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  if (c == 'white') return [255, 255, 255, 1];
  if (c == 'black') return [0, 0, 0, 1];
  return null;
}
function hsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const mx = Math.max(r, g, b),
    mn = Math.min(r, g, b),
    l = (mx + mn) / 2,
    d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = mx == r ? ((g - b) / d) % 6 : mx == g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}
function rgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s,
    x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
    m = l - c / 2,
    [r, g, b] =
      h < 60
        ? [c, x, 0]
        : h < 120
          ? [x, c, 0]
          : h < 180
            ? [0, c, x]
            : h < 240
              ? [0, x, c]
              : h < 300
                ? [x, 0, c]
                : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
/** a colour [r, g, b] of the light look turned for the dark look */
export function darkRGB(r, g, b) {
  const [h, s, l] = hsl(r, g, b);
  let s2 = s,
    l2 = l;
  // one dark look for all the cards, as the Weather SIGWX card: the page #121212, the boxes and panels one dark grey (about #1a1e23), the text near white
  if (s < 0.18)
    l2 = 0.07 + (1 - l) * 0.86; // greys turned over: the page near black, the text near white
  else if (l > 0.94 && s < 0.35) {
    l2 = 0.07; // the page of a card in a pale grey-blue (SEAD, DEAD): the page of all of them
    s2 = 0;
  } else if (l > 0.8 && s < 0.35) {
    l2 = 0.115 + (0.94 - l) * 0.25; // the pale grey-blue of the boxes and headers: the dark grey of the panels
    s2 = Math.min(s, 0.12);
  } else if (l > 0.8) {
    l2 = 0.14 + (1 - l) * 0.4; // pale tints of a colour (a warning box): dark tints of the same colour
    s2 = s * 0.6;
  } else if (l < 0.55) l2 = Math.min(0.78, 1.1 - l); // dark colours (text, lines): lighter
  return rgb(h, clamp(s2), clamp(l2));
}
/** a colour [r, g, b] of the light look made for the cockpit: its greys darker (the text and the lines read black, not grey) */
export function inkRGB(r, g, b) {
  const [h, s, l] = hsl(r, g, b);
  if (s < 0.18 && l < 0.72) return rgb(h, s, l * 0.5);
  if (s >= 0.18 && l < 0.5) return rgb(h, s, l * 0.8);
  return [r, g, b];
}
/** a CSS colour as drawn on a card: turned for the dark look, or with the greys darker in the light look (see-through or not understood: as it is) */
export function themeColor(c) {
  if (typeof c != 'string') return c;
  if (MEMO.has(c)) return MEMO.get(c);
  const p = parse(c);
  let o = c;
  if (p && p[3] >= 0.9) {
    const [r, g, b] = (DARK ? darkRGB : inkRGB)(p[0], p[1], p[2]);
    o = `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
  }
  MEMO.set(c, o);
  return o;
}

// --- the context of a card: heavier text with an edge of its colour, and the colours of the dark look
const sizeOf = f => {
  const m = /(\d+(?:\.\d+)?)px/.exec(f);
  return m ? +m[1] : 20;
};
const heavier = f =>
  f.replace(/^((?:italic|oblique)\s+)?(bold|normal|[1-9]00)?(\s*)/, (_, it, w, sp) => {
    const n = w == 'bold' ? 700 : w == 'normal' || !w ? 400 : +w;
    return (it || '') + Math.min(900, n + WUP) + ' ' + (w ? '' : sp);
  });
/** @param {CanvasRenderingContext2D} x the context of a card: from here on its text is heavier and, with the dark look, its colours turned */
export function inkCard(x) {
  const X = /** @type {any} */ (x),
    proto = Object.getPrototypeOf(x),
    fill = proto.fillText,
    meas = proto.measureText;
  // the colours: set again on every card (the look may have changed since the last one drawn on this context)
  ['fillStyle', 'strokeStyle', 'shadowColor'].forEach(k => delete X[k]);
  ['createLinearGradient', 'createRadialGradient'].forEach(k => delete X[k]);
  X.__raw = false;
  darkColours(x, proto);
  if (X.__inked) return x;
  X.__inked = true;
  X.fillText = function (t, a, b, mw) {
    const f = this.font;
    this.font = heavier(f);
    const lw = this.lineWidth,
      ss = this.strokeStyle,
      lj = this.lineJoin,
      raw = this.__raw;
    this.__raw = true; // the colours read here are turned already: set as they are
    this.lineWidth = Math.max(0.6, sizeOf(f) * INK);
    this.strokeStyle = this.fillStyle;
    this.lineJoin = 'round';
    if (INK > 0) {
      if (mw === undefined) this.strokeText(t, a, b);
      else this.strokeText(t, a, b, mw);
    }
    if (mw === undefined) fill.call(this, t, a, b);
    else fill.call(this, t, a, b, mw);
    this.lineWidth = lw;
    this.strokeStyle = ss;
    this.lineJoin = lj;
    this.font = f;
    this.__raw = raw;
  };
  X.measureText = function (t) {
    const f = this.font;
    this.font = heavier(f);
    const m = meas.call(this, t);
    this.font = f;
    return m;
  };
  return x;
}
// the colours of the look, turned as they are set on the context
function darkColours(x, proto) {
  const X = /** @type {any} */ (x);
  // the colours of the dark look, as they are set
  for (const k of ['fillStyle', 'strokeStyle', 'shadowColor']) {
    const d = Object.getOwnPropertyDescriptor(proto, k);
    if (!d || !d.set) continue;
    Object.defineProperty(x, k, {
      configurable: true,
      get() {
        return d.get.call(this);
      },
      set(v) {
        d.set.call(this, this.__raw ? v : themeColor(v));
      },
    });
  }
  for (const k of ['createLinearGradient', 'createRadialGradient']) {
    const fn = proto[k];
    X[k] = function (...a) {
      const g = fn.apply(this, a),
        add = g.addColorStop.bind(g),
        raw = this.__raw;
      g.addColorStop = (o, c) => add(o, raw ? c : themeColor(c));
      return g;
    };
  }
}

/** draws with the other look (light <-> dark) and comes back: the second picture of a card, so that the look can be switched on the kneeboard later */
export function otherLook(fn) {
  const was = DARK;
  setCardDark(!was);
  try {
    return fn();
  } finally {
    setCardDark(was);
  }
}
