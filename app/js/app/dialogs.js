// The program's own message boxes (instead of the ones of Windows): alert() shows a message, confirm() asks and gives a promise (always await it). Fade in / out like the other menus.
(function () {
  const Q = [];
  let busy = false;
  const anim = () => !document.documentElement.classList.contains('noanim');
  function show(kind, msg) {
    return new Promise(res => {
      Q.push({ kind, msg: String(msg), res });
      next();
    });
  }
  function next() {
    if (busy || !Q.length) return;
    busy = true;
    const { kind, msg, res } = Q.shift();
    const d = document.createElement('dialog');
    d.className = 'msg';
    d.innerHTML =
      '<div class="mh"><span class="mi">' +
      (kind == 'confirm' ? '?' : 'i') +
      '</span><div class="mt"></div></div><div class="mb"><button class="btn" data-ok type="button">OK</button>' +
      (kind == 'confirm' ? '<button class="btn g" data-no type="button">Cancel</button>' : '') +
      '</div>';
    d.querySelector('.mt').textContent = msg;
    document.body.append(d);
    d.showModal();
    const ok = d.querySelector('[data-ok]');
    ok.focus();
    let done = false;
    const fin = v => {
      if (done) return;
      done = true;
      const end = () => {
        d.remove();
        busy = false;
        res(v);
        next();
      };
      if (anim()) {
        d.style.pointerEvents = 'none';
        const a = d.animate(
          [
            { opacity: 1, transform: 'none' },
            { opacity: 0, transform: 'scale(.97)' },
          ],
          { duration: 130, easing: 'ease-in' }
        );
        a.onfinish = a.oncancel = end;
      } else end();
    };
    ok.onclick = () => fin(true);
    const no = d.querySelector('[data-no]');
    if (no) no.onclick = () => fin(false);
    d.addEventListener('cancel', e => {
      e.preventDefault();
      fin(kind == 'confirm' ? false : true);
    });
  }
  // the other dialogs of the program (settings, page choice ...) fade out too
  const c0 = HTMLDialogElement.prototype.close;
  HTMLDialogElement.prototype.close = function (v) {
    if (!this.open || this._closing || !anim()) return c0.call(this, v);
    this._closing = true;
    const d = this;
    d.style.pointerEvents = 'none';
    const a = d.animate(
      [
        { opacity: 1, transform: 'none' },
        { opacity: 0, transform: 'scale(.97)' },
      ],
      { duration: 130, easing: 'ease-in' }
    );
    a.onfinish = a.oncancel = () => {
      d._closing = false;
      d.style.pointerEvents = '';
      c0.call(d, v);
    };
  };
  window.alert = msg => {
    show('alert', msg);
  };
  window.confirm = msg => show('confirm', msg);
})();
