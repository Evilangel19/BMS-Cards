// A short fade for everything that appears: menus, panels and pages that are shown again (style display, "hidden" attribute or the "hide" class change),
// and the pop-ups and overlays added straight to the page. Opacity only, so it never fights the position of the element. Off with the Animations setting.
import { animOn } from './base.js';

const SKIP =
  '.leaflet-container,.leaflet-pane,.leaflet-control,.leaflet-tooltip,.leaflet-popup,canvas,dialog,option,[data-noanim]';
const fade = el => {
  if (
    !animOn() ||
    !el.animate ||
    !el.isConnected ||
    el.matches(SKIP) ||
    el.closest('.leaflet-container') ||
    (el.querySelector && el.querySelector('.leaflet-container'))
  )
    return;
  if (el.getAnimations && el.getAnimations().length) return; // it brings its own animation
  el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140, easing: 'ease-out' });
};

export function initAppear() {
  // page tabs (.wtabs): the pages draw the chosen tab from scratch, so what stands under the bar fades in (the bar stays). The click is seen before the page reacts
  // (capture), the bar is found again after it, even when the page drew it anew. Content that brings its own animation, or holds a map, is left alone by fade().
  document.addEventListener(
    'click',
    e => {
      const b = e.target.closest && e.target.closest('.wtabs button');
      if (!b || b.disabled || b.classList.contains('on')) return;
      const bar = b.closest('.wtabs'),
        id = bar.id,
        k = [...document.querySelectorAll('.wtabs')].indexOf(bar);
      setTimeout(() => {
        const now = (id && document.getElementById(id)) || document.querySelectorAll('.wtabs')[k];
        for (let x = now && now.nextElementSibling; x; x = x.nextElementSibling) fade(x);
      }, 0);
    },
    true
  );
  new MutationObserver(list => {
    for (const m of list) {
      if (m.type == 'childList') {
        if (m.target === document.body)
          m.addedNodes.forEach(n => {
            if (n.nodeType == 1 && n.id != 'apptoast') fade(n);
          });
        continue;
      }
      const el = m.target,
        old = m.oldValue || '';
      if (m.attributeName == 'style') {
        if (/display:\s*none/.test(old) && el.style.display != 'none') fade(el);
      } else if (m.attributeName == 'hidden') {
        if (m.oldValue !== null && !el.hidden) fade(el);
      } else if (m.attributeName == 'class') {
        if (/(^|\s)hide(\s|$)/.test(old) && !el.classList.contains('hide')) fade(el);
      }
    }
  }).observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: ['style', 'hidden', 'class'],
  });
}
