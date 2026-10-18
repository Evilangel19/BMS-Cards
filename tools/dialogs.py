"""The program draws its own message boxes (dialog.msg) instead of the browser's alert / confirm.
install(pg) lets the tests keep using Playwright's dialog API: pg.on('dialog', h) / pg.once('dialog', h) handlers receive an object with
.message, .type, .accept() and .dismiss(); the matching button of the program's box is then really clicked. With no handler the box is dismissed (like Playwright does)."""

class _D:
    def __init__(self, kind, msg): self.type, self.message, self.choice = kind, msg, None
    def accept(self, *a, **k): self.choice = True
    def dismiss(self): self.choice = False

INIT = """
new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType == 1 && n.matches && n.matches('dialog.msg')) {
  const kind = n.querySelector('[data-no]') ? 'confirm' : 'alert', msg = n.querySelector('.mt').textContent;
  Promise.resolve(window.__pyDialog(kind, msg)).then(ok => { const b = (ok && n.querySelector('[data-ok]')) || n.querySelector('[data-no]') || n.querySelector('[data-ok]'); setTimeout(() => b.click(), 60); });
} }).observe(document, {childList: true, subtree: true});
"""

def install(pg):
    handlers = []
    def py_dialog(kind, msg):
        d = _D(kind, msg)
        for h in list(handlers):
            h[0](d)
            if h[1]: handlers.remove(h)
        return bool(d.choice)
    pg.expose_function('__pyDialog', py_dialog)
    pg.add_init_script(INIT)
    on, once = pg.on, pg.once
    def on2(ev, fn):
        if ev == 'dialog': handlers.append([fn, False])
        else: on(ev, fn)
    def once2(ev, fn):
        if ev == 'dialog': handlers.append([fn, True])
        else: once(ev, fn)
    pg.on, pg.once = on2, once2
