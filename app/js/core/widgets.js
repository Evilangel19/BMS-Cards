// Animated drop-down list for every <select> and animated calendar for every <input type=date> (the browser's own ones cannot be animated).
// initWidgets(animOn) installs the listeners once and returns {ddOpen(select, button), justClosed()}; animOn() says whether animations are enabled.
export function initWidgets(animOn) {
  // Drop-down menus: the browser's own list cannot be animated, so a click on any <select> opens this list instead
  // (same options, colors and change events). Every new menu of the program gets it automatically.
  let DD = null;
  let ddJust = 0; // time of the last close caused by pressing the button that opened the list (so the same press does not open it again)
  function ddClose() {
    if (!DD) return;
    const d = DD.el;
    document.removeEventListener('mousedown', ddOut, true);
    document.removeEventListener('keydown', ddKey, true);
    DD = null;
    if (animOn()) {
      d.style.pointerEvents = 'none';
      d.animate(
        [
          { opacity: 1, transform: 'none' },
          { opacity: 0, transform: 'translateY(-4px)' },
        ],
        { duration: 100 }
      ).onfinish = () => d.remove();
    } else d.remove();
  }
  function ddOut(e) {
    if (DD && !DD.el.contains(e.target)) {
      const same = e.target.closest && e.target.closest('select') === DD.sel;
      if (DD.op && DD.op.contains(e.target)) ddJust = performance.now();
      ddClose();
      if (same) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
  }
  function ddPick(i) {
    const sel = DD.sel,
      o = sel.options[i];
    if (!o || o.disabled) return;
    const ch = sel.selectedIndex != i;
    ddClose();
    sel.selectedIndex = i;
    if (ch) {
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    sel.focus();
  }
  function ddKey(e) {
    if (!DD) return;
    const items = [...DD.el.children],
      cur = items.findIndex(x => x.classList.contains('hl')),
      mv = d => {
        let k = cur;
        do {
          k = (k + d + items.length) % items.length;
        } while (items[k].classList.contains('off') && k != cur);
        items.forEach(x => x.classList.remove('hl'));
        items[k].classList.add('hl');
        items[k].scrollIntoView({ block: 'nearest' });
      };
    if (e.key == 'Escape') {
      e.preventDefault();
      ddClose();
    } else if (e.key == 'ArrowDown') {
      e.preventDefault();
      mv(1);
    } else if (e.key == 'ArrowUp') {
      e.preventDefault();
      mv(-1);
    } else if (e.key == 'Enter' || e.key == ' ') {
      e.preventDefault();
      if (cur >= 0) ddPick(+items[cur].dataset.i);
    }
  }
  function ddOpen(sel, op) {
    if (DD) ddClose();
    const r = sel.getBoundingClientRect(),
      d = document.createElement('div');
    d.className = 'ddp';
    [...sel.options].forEach((o, i) => {
      const b = document.createElement('div');
      b.className = 'ddi' + (o.selected ? ' on hl' : '') + (o.disabled ? ' off' : '');
      b.textContent = o.textContent;
      b.dataset.i = i;
      if (o.style.backgroundColor) b.style.backgroundColor = o.style.backgroundColor;
      if (o.style.color) b.style.color = o.style.color;
      if (o.style.fontWeight) b.style.fontWeight = o.style.fontWeight;
      b.onmousedown = e => {
        e.preventDefault();
        e.stopPropagation();
      };
      b.onclick = () => ddPick(i);
      d.append(b);
    });
    (sel.closest('dialog') || document.body).append(d);
    DD = { el: d, sel, op };
    const w = Math.max(r.width, d.offsetWidth),
      below = innerHeight - r.bottom - 12,
      above = r.top - 12,
      h = Math.min(d.scrollHeight + 10, 340);
    d.style.minWidth = r.width + 'px';
    d.style.left = Math.max(4, Math.min(r.left, innerWidth - w - 8)) + 'px';
    if (below >= Math.min(h, 200) || below >= above) {
      d.style.top = r.bottom + 2 + 'px';
      d.style.maxHeight = Math.min(340, below) + 'px';
    } else {
      d.style.maxHeight = Math.min(340, above) + 'px';
      d.style.bottom = innerHeight - r.top + 2 + 'px';
    }
    const on = d.querySelector('.on');
    if (on) on.scrollIntoView({ block: 'nearest' });
    document.addEventListener('mousedown', ddOut, true);
    document.addEventListener('keydown', ddKey, true);
  }
  document.addEventListener(
    'mousedown',
    e => {
      const s = e.target.closest && e.target.closest('select');
      if (!s || s.multiple || s.disabled || (s.size || 1) > 1 || e.button !== 0) return;
      if (DD && DD.sel === s) return;
      e.preventDefault();
      s.focus();
      ddOpen(s);
    },
    true
  );

  // Calendar: the browser's own date picker cannot be animated, so a click on the calendar icon of any <input type=date>
  // opens this one instead (same value, same change events).
  let DC = null;
  function dcClose() {
    if (!DC) return;
    const d = DC.el;
    document.removeEventListener('mousedown', dcOut, true);
    document.removeEventListener('keydown', dcKey, true);
    DC = null;
    if (animOn()) {
      d.style.pointerEvents = 'none';
      d.animate(
        [
          { opacity: 1, transform: 'none' },
          { opacity: 0, transform: 'translateY(-4px)' },
        ],
        { duration: 100 }
      ).onfinish = () => d.remove();
    } else d.remove();
  }
  function dcOut(e) {
    if (DC && !DC.el.contains(e.target)) {
      dcClose();
    }
  }
  function dcKey(e) {
    if (e.key == 'Escape') {
      e.preventDefault();
      dcClose();
    }
  }
  function dcDraw() {
    const { el, inp } = DC,
      y = DC.y,
      m = DC.m,
      sel = inp.value,
      first = new Date(Date.UTC(y, m, 1)),
      lead = (first.getUTCDay() + 6) % 7,
      dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(),
      today = new Date().toISOString().slice(0, 10);
    const mn = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    let h = `<div class="dch"><button class="btn g" data-a="prev">◀</button><b>${mn[m]} ${y}</b><button class="btn g" data-a="next">▶</button></div><div class="dcg">${['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(x => `<span class="dcw">${x}</span>`).join('')}`;
    for (let i = 0; i < lead; i++) h += '<span></span>';
    for (let d = 1; d <= dim; d++) {
      const v = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      h += `<button class="dcd${v == sel ? ' on' : ''}${v == today ? ' td' : ''}" data-v="${v}">${d}</button>`;
    }
    h += `</div><div class="dcf"><button class="btn g" data-a="today">Today</button></div>`;
    el.innerHTML = h;
    const g = el.querySelector('.dcg');
    if (animOn() && DC.fx)
      g.animate(
        [
          { opacity: 0, transform: `translateX(${DC.fx * 14}px)` },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 140, easing: 'ease-out' }
      );
  }
  function dcOpen(inp) {
    if (DC) dcClose();
    const r = inp.getBoundingClientRect(),
      el = document.createElement('div');
    el.className = 'ddp dcp';
    const v = /^\d{4}-\d\d-\d\d$/.test(inp.value) ? inp.value : new Date().toISOString().slice(0, 10);
    (inp.closest('dialog') || document.body).append(el);
    DC = { el, inp, y: +v.slice(0, 4), m: +v.slice(5, 7) - 1, fx: 0 };
    dcDraw();
    el.style.left = Math.max(4, Math.min(r.left, innerWidth - el.offsetWidth - 8)) + 'px';
    el.style.top =
      (r.bottom + 2 + el.offsetHeight > innerHeight ? Math.max(4, r.top - el.offsetHeight - 2) : r.bottom + 2) + 'px';
    el.onmousedown = e => e.stopPropagation();
    el.onclick = e => {
      const a = e.target.dataset && e.target.dataset.a,
        v2 = e.target.dataset && e.target.dataset.v;
      if (a == 'prev' || a == 'next') {
        DC.m += a == 'next' ? 1 : -1;
        if (DC.m < 0) {
          DC.m = 11;
          DC.y--;
        }
        if (DC.m > 11) {
          DC.m = 0;
          DC.y++;
        }
        DC.fx = a == 'next' ? 1 : -1;
        dcDraw();
      } else if (a == 'today' || v2) {
        const val = v2 || new Date().toISOString().slice(0, 10),
          i = DC.inp;
        dcClose();
        i.value = val;
        i.dispatchEvent(new Event('input', { bubbles: true }));
        i.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };
    document.addEventListener('mousedown', dcOut, true);
    document.addEventListener('keydown', dcKey, true);
  }
  document.addEventListener(
    'keydown',
    e => {
      const i = e.target;
      if (i.tagName == 'INPUT' && i.type == 'date' && ((e.key == 'ArrowDown' && e.altKey) || e.key == 'F4')) {
        e.preventDefault();
        DC && DC.inp === i ? dcClose() : dcOpen(i);
      }
    },
    true
  );
  document.addEventListener(
    'mousedown',
    e => {
      const i = e.target;
      if (i.tagName != 'INPUT' || i.type != 'date' || e.button !== 0) return;
      if (e.offsetX > i.clientWidth - 30) {
        e.preventDefault();
        i.focus();
        DC && DC.inp === i ? dcClose() : dcOpen(i);
      }
    },
    true
  );
  return { ddOpen, justClosed: () => performance.now() - ddJust < 400 }; // for a button that opens a list of its own
}
