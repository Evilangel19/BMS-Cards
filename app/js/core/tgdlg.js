// the windows that choose Kneeboard cards on their pictures (.tgdlg: Target, SEAD, DEAD, Weather, Add all cards): a button that chooses them all, or none
// (it clicks the cards that differ, so each window counts them as when clicked by hand)
export function pickAll(d) {
  const bar = d.querySelector('.tgbar'),
    cards = () => [...d.querySelectorAll('.tgcard')];
  if (!bar || cards().length < 2) return;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn g tgall';
  const all = () => cards().every(c => c.classList.contains('on')),
    label = () => (b.textContent = all() ? 'Select none' : 'Select all');
  b.onclick = () => {
    const on = !all();
    cards().forEach(c => {
      if (c.classList.contains('on') != on) c.click();
    });
    label();
  };
  d.querySelector('.tgcards').addEventListener('click', () => setTimeout(label));
  bar.prepend(b);
  label();
}

// a window that chooses among cards already drawn, on their pictures: list [{label, c (canvas), on}] -> Promise of the chosen ones (none: [])
// (the Attack cards: the classic card and the Smart card of each role)
export function chooseCards(list, title = 'Add cards to the Kneeboard') {
  return new Promise(res => {
    const d = document.createElement('dialog');
    d.className = 'tgdlg' + (list.length > 4 ? ' kball' : ''); // many cards: smaller, in rows (as Add all cards)
    d.innerHTML = `<h3></h3><p class="hint">The cards go into the free slots of the Kneeboard; when there is no free slot, among the unused cards.</p><div class="tgcards"></div><div class="tgbar"><span class="hint tgn"></span><span class="tgsp"></span><button type="button" class="btn g" data-a="no">Cancel</button><button type="button" class="btn" data-a="ok">Add</button></div>`;
    /** @type {HTMLElement} */ (d.querySelector('h3')).textContent = title;
    document.body.append(d);
    const on = list.map(z => z.on !== false),
      cnt = () => {
        const n = on.filter(Boolean).length,
          b = /** @type {HTMLElement} */ (d.querySelector('[data-a=ok]'));
        b.textContent = n ? `Add ${n} card${n > 1 ? 's' : ''}` : 'Add';
        b.classList.toggle('nil', !n);
      };
    list.forEach((z, k) => {
      const it = document.createElement('button');
      it.type = 'button';
      it.className = 'tgcard' + (on[k] ? ' on' : '');
      const th = document.createElement('canvas');
      th.width = 300;
      th.height = 450;
      /** @type {CanvasRenderingContext2D} */ (th.getContext('2d')).drawImage(z.c, 0, 0, 300, 450);
      it.append(th);
      const s = document.createElement('span');
      s.textContent = z.label;
      it.append(s);
      it.onclick = () => {
        on[k] = !on[k];
        it.classList.toggle('on', on[k]);
        cnt();
      };
      /** @type {HTMLElement} */ (d.querySelector('.tgcards')).append(it);
    });
    cnt();
    const close = v => {
      d.close();
      setTimeout(() => d.remove(), 200);
      res(v);
    };
    pickAll(d);
    /** @type {HTMLElement} */ (d.querySelector('[data-a=no]')).onclick = () => close([]);
    d.addEventListener('cancel', e => {
      e.preventDefault();
      close([]);
    });
    /** @type {HTMLElement} */ (d.querySelector('[data-a=ok]')).onclick = () => {
      if (!on.some(Boolean)) return;
      close(list.filter((_, k) => on[k]));
    };
    d.showModal();
  });
}
