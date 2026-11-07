// Small pieces of markup shared by the pages of the Settings window (settings.js, settingsdiag.js, settingsdata.js). The styles are in css/style-10.css.
import { esc } from './base.js';

const SHAPES = {
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  pulse: '<polyline points="3 12 7 12 10 5 14 19 17 12 21 12"/>',
  sliders:
    '<line x1="4" y1="7" x2="20" y2="7"/><circle cx="9" cy="7" r="2.2"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="15" cy="17" r="2.2"/>',
  card: '<rect x="5" y="3" width="14" height="18" rx="2"/><line x1="8.5" y1="8" x2="15.5" y2="8"/><line x1="8.5" y1="12" x2="15.5" y2="12"/><line x1="8.5" y1="16" x2="12.5" y2="16"/>',
  people:
    '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.5-3.6 3-5.5 6-5.5s5.5 1.9 6 5.5"/><circle cx="17" cy="9" r="2.4"/><path d="M16.5 14.3c2.6.1 4.1 1.8 4.5 4.7"/>',
  map: '<polygon points="3 6.5 9 4 15 6.5 21 4 21 17.5 15 20 9 17.5 3 20"/><line x1="9" y1="4" x2="9" y2="17.5"/><line x1="15" y1="6.5" x2="15" y2="20"/>',
  swap: '<polyline points="17 3 21 7 17 11"/><line x1="21" y1="7" x2="9" y2="7"/><polyline points="7 13 3 17 7 21"/><line x1="3" y1="17" x2="15" y2="17"/>',
  check: '<polyline points="5 12.5 10 17.5 19 7.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16.5"/><line x1="12" y1="7.5" x2="12.01" y2="7.5"/>',
  warn: '<path d="M12 4 21.5 20h-19z"/><line x1="12" y1="10" x2="12" y2="14"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  close: '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
  chev: '<polyline points="9 6 15 12 9 18"/>',
  up: '<polyline points="6 15 12 9 18 15"/>',
  down: '<polyline points="6 9 12 15 18 9"/>',
  imp: '<path d="M12 4v11"/><polyline points="7.5 10.5 12 15 16.5 10.5"/><path d="M4.5 19.5h15"/>',
  exp: '<path d="M12 16V5"/><polyline points="7.5 9.5 12 5 16.5 9.5"/><path d="M4.5 19.5h15"/>',
};
/** An icon (an svg that takes the color of the text). `cls`: 's' small, 'l' large. */
export const ic = (name, cls = '') =>
  '<svg class="s-ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + SHAPES[name] + '</svg>';
/** A small label: cls = ok | wn | mu */
export const chip = (cls, text, icon) =>
  '<span class="s-ch ' + cls + '">' + (icon ? ic(icon, 's') : '') + esc(text) + '</span>';
/** The title of a page of the window */
export const top = (id, title, sub) =>
  '<div class="s-top"><h2 id="h-' + id + '">' + esc(title) + '</h2><p class="hint">' + esc(sub) + '</p></div>';
/** A row with a switch (a button that is on or off); the page reads and sets it through data-k */
export const swRow = (key, title, hint, on) =>
  '<div class="s-rw"><div class="tx"><div class="tt">' +
  esc(title) +
  '</div><p class="hint">' +
  esc(hint) +
  '</p></div><button type="button" role="switch" class="s-sw' +
  (on ? ' on' : '') +
  '" aria-checked="' +
  !!on +
  '" aria-label="' +
  esc(title) +
  '" data-a="sw" data-k="' +
  key +
  '"></button></div>';
/** The switch is turned: the look and the state for the screen readers */
export const setSwitch = (b, on) => {
  b.classList.toggle('on', on);
  b.setAttribute('aria-checked', String(on));
};
/** A part that opens and closes (the height follows the content) */
export const setOpen = (el, on) => el.classList.toggle('open', on);
