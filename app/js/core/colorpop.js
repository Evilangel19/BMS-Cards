// @ts-check
// The colour picker of the program in a small window under a button (A-G > Target and the Briefing room): colorPop(anchor, hex, pick).
// pick('#rrggbb') when a knob is let go or a value is typed. The window closes with a click outside it or Esc.
import { colorPicker } from './colorpick.js';

let OPEN = null;
/** @param {HTMLElement} anchor @param {string} hex @param {(h: string) => void} pick */
export function colorPop(anchor, hex, pick) {
  if (OPEN) {
    const was = OPEN.anchor;
    OPEN.close();
    if (was === anchor) return; // a second click on the button closes it
  }
  const w = document.createElement('div');
  w.className = 'cpop';
  document.body.append(w);
  colorPicker(w, String(hex || '#ff8c1a').replace('#', ''), { pick: h => pick('#' + h.toLowerCase()) });
  const r = anchor.getBoundingClientRect(),
    ww = 216;
  w.style.left = Math.max(6, Math.min(innerWidth - ww - 6, r.left + r.width / 2 - ww / 2)) + 'px';
  w.style.top = Math.min(innerHeight - 190, r.bottom + 6) + 'px';
  const out = e => {
    if (!w.contains(e.target) && !anchor.contains(e.target)) close();
  };
  const key = e => {
    if (e.key == 'Escape') close();
  };
  const close = () => {
    w.remove();
    document.removeEventListener('pointerdown', out, true);
    document.removeEventListener('keydown', key, true);
    OPEN = null;
  };
  document.addEventListener('pointerdown', out, true);
  document.addEventListener('keydown', key, true);
  OPEN = { anchor, close };
}
