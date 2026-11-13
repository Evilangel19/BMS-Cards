// Long ⓘ tooltips (the Automatic rules of the Datacard above all): the tooltip of the system cuts a long text ("... the..."), so a ⓘ with a long
// title opens on a click a panel that scrolls, with the headings (lines in capitals) and the name before ":" in bold. Esc, a click outside or × closes it.
export const LONG = 600;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// the text as blocks: a heading is a line without small letters; "Name: text" gets the name in bold (short names only)
export function tipHtml(t) {
  const A = String(t).split('\n');
  return A.map((l, i) => {
    const s = l.trim();
    if (!s) return '';
    // a heading: capitals, or a short line without ":" that opens a block ("FLIGHT PLAN (24 steerpoints)")
    const cap = /^[A-Z][A-Z0-9 /&-]+/.exec(s);
    if (
      (!/[a-z]/.test(s) && /[A-Z]/.test(s)) ||
      (i > 0 && !A[i - 1].trim() && s.length < 40 && !s.includes(':') && cap && cap[0].trim().length >= 4)
    )
      return `<h4>${esc(s)}</h4>`;
    const intro = i == 0 && /^[A-Z][A-Z ]+:\s/.exec(s); // "AUTOMATIC RULES: ..." is the title of the panel, the rest of the line its introduction
    if (intro) return `<p class="ltin">${esc(s.slice(intro[0].length).replace(/^\w/, c => c.toUpperCase()))}</p>`;
    const head = /^([^:]{2,40}):\s/.exec(s);
    return head ? `<p><b>${esc(head[1])}</b>: ${esc(s.slice(head[0].length))}</p>` : `<p>${esc(s)}</p>`;
  }).join('');
}
const anim = () => !document.documentElement.classList.contains('noanim');
let POP = null;
function shut() {
  const p = POP;
  if (!p) return;
  POP = null;
  if (anim())
    p.animate(
      [
        { opacity: 1, transform: 'none' },
        { opacity: 0, transform: 'translateY(-6px)' },
      ],
      { duration: 120, easing: 'ease-in' }
    ).onfinish = () => p.remove();
  else p.remove();
}
function open(el) {
  shut();
  const full = el.dataset.full,
    head = /^([A-Z][A-Z ]+):/.exec(full),
    p = (POP = document.createElement('div'));
  p.className = 'ltpop';
  p.setAttribute('role', 'dialog');
  p.innerHTML = `<div class="lth"><b>${esc(head ? head[1].toLowerCase().replace(/^\w/, c => c.toUpperCase()) : 'Details')}</b><button type="button" class="ltx" title="Close (Esc)">×</button></div><div class="ltb">${tipHtml(full)}</div>`;
  document.body.appendChild(p);
  const r = el.getBoundingClientRect(),
    w = p.offsetWidth,
    h = p.offsetHeight;
  p.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + 'px';
  // below the ⓘ when there is room (the panel scrolls), else above it
  const below = innerHeight - r.bottom - 14,
    above = r.top - 14;
  if (below >= Math.min(h, 260) || below >= above) {
    p.style.top = r.bottom + 6 + 'px';
    p.style.maxHeight = Math.min(h, below) + 'px';
  } else {
    p.style.maxHeight = Math.min(h, above) + 'px';
    p.style.top = r.top - 6 - p.offsetHeight + 'px';
  }
  if (anim())
    p.animate(
      [
        { opacity: 0, transform: 'translateY(-6px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 150, easing: 'ease-out' }
    );
  p.querySelector('.ltx').onclick = shut;
}
// a ⓘ with a long title: the title becomes "click to read", the text moves to data-full (also the ⓘ made later by the pages)
function mark(el) {
  if (!el || !el.classList || !el.classList.contains('wtip') || el.dataset.full) return;
  if ((el.title || '').length < LONG) return;
  el.dataset.full = el.title;
  el.title = 'Click to read';
  el.classList.add('ltk');
}
export function longTips() {
  document.querySelectorAll('.wtip').forEach(mark);
  document.addEventListener('mouseover', e => mark(e.target.closest && e.target.closest('.wtip')), true);
  document.addEventListener(
    'click',
    e => {
      const el = e.target.closest && e.target.closest('.wtip');
      if (el) mark(el);
      if (el && el.dataset.full) {
        e.preventDefault();
        e.stopPropagation();
        if (POP && POP.dataset.for === el.dataset.full.slice(0, 40)) return shut();
        open(el);
        POP.dataset.for = el.dataset.full.slice(0, 40);
        return;
      }
      if (POP && !POP.contains(e.target)) shut();
    },
    true
  );
  document.addEventListener('keydown', e => {
    if (e.key == 'Escape') shut();
  });
}
