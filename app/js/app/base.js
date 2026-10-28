import { mergeConfig } from '../config/config.js';
import { CAM } from '../core/cam-core.js';
import { initWidgets } from '../core/widgets.js';
import { fileExists, writeBytes, makeDir, appDir, removeFile, join as joinPath } from '../platform/desktop.js';
import { ST } from './state.js';
import { atoHints, scrollKeep } from './ato.js';
import { wxPage } from './campaign.js';
import { view } from './dtcfile.js';
import { mapV, pfPage, sqPage } from './pages.js';
import { draw } from './cardview.js';
import { dcPage, kbRender } from './kneeboard.js';

export const $ = id => document.getElementById(id);
import { saveConfig, saveFailed } from '../platform/desktop.js';
// the program keeps the last DTC and campaign (for the "load the last ones at start" option); written to the settings only when it changes
export function rememberLast(k, v) {
  try {
    const u = (ST.CFG.ui = ST.CFG.ui || {});
    if (!v || u[k] === v) return;
    u[k] = v;
    saveConfig(ST.CFG).catch(e => saveFailed('config.json', e));
  } catch (e) {
    /* none */
  }
}
export const animOn = () =>
  (!ST.CFG.ui || ST.CFG.ui.animations !== false) &&
  !(window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches);
export const applyAnim = () => document.documentElement.classList.toggle('noanim', !animOn());
// Expand animation: grow and fade in the given elements (same 150 ms as collapse).
export function expand(els) {
  if (!animOn()) return;
  const LW = els[0] && els[0].closest && els[0].closest('#atolist');
  if (LW) {
    LW.style.minHeight = LW.offsetHeight + 'px';
    setTimeout(() => {
      LW.style.minHeight = '';
    }, 200);
  }
  [...els].slice(0, 80).forEach(e => {
    const h = e.offsetHeight;
    e.style.overflow = 'hidden';
    const a = e.animate(
      [
        {
          opacity: 0,
          maxHeight: '0px',
          paddingTop: '0px',
          paddingBottom: '0px',
          marginTop: '0px',
          marginBottom: '0px',
        },
        { opacity: 1, maxHeight: h + 'px' },
      ],
      { duration: 150, easing: 'ease-out' }
    );
    a.onfinish = a.oncancel = () => {
      e.style.overflow = '';
    };
  });
}
export let ddOpen, ddJustClosed;
// Collapse animation: shrink and fade the given elements, then run cb.
export function collapse(els, cb) {
  els = [...els];
  if (!animOn() || !els.length) {
    cb();
    return;
  }
  let n = els.length;
  // in the ATO list the height is held while the rows fold, so the view does not slide up; the position is put back after the list is drawn again
  const LW = els[0].closest && els[0].closest('#atolist'),
    keep = LW ? scrollKeep() : null;
  if (LW) LW.style.minHeight = LW.offsetHeight + 'px';
  const cb0 = cb;
  cb = () => {
    cb0();
    if (LW) {
      if (keep) keep();
      LW.style.minHeight = '';
    }
  };
  els.forEach(e => {
    const h = e.offsetHeight;
    e.style.overflow = 'hidden';
    const a = e.animate(
      [
        { opacity: 1, maxHeight: h + 'px' },
        {
          opacity: 0,
          maxHeight: '0px',
          paddingTop: '0px',
          paddingBottom: '0px',
          marginTop: '0px',
          marginBottom: '0px',
        },
      ],
      { duration: 150, easing: 'ease-in' }
    );
    a.onfinish = a.oncancel = () => {
      if (--n == 0) cb();
    };
  });
}
export const IO = { fileExists, writeBytes, makeDir, appDir, removeFile }; // (replaceable by the tests)
export const enc8 = t => new TextEncoder().encode(t);
export const jclone = o => {
  try {
    return JSON.parse(JSON.stringify(o));
  } catch (e) {
    return null;
  }
};
export function appToast(m) {
  let t = document.getElementById('apptoast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'apptoast';
    t.style.cssText =
      'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:1000;background:#1a212bf8;border:1px solid #3ddc84;color:#e6edf3;border-radius:10px;padding:10px 20px;font-size:13px;box-shadow:0 10px 30px #000a;max-width:min(80%,640px);text-align:center;transition:opacity .25s';
    document.body.append(t);
  }
  t.textContent = m;
  t.style.opacity = '1';
  t.style.display = '';
  clearTimeout(t._t);
  t._t = setTimeout(() => {
    t.style.opacity = '0';
    t._t = setTimeout(() => {
      t.style.display = 'none';
    }, 300);
  }, 5000);
}
export const esc = t =>
  String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const jp = (d, ...p) =>
  p
    .flatMap(x => (Array.isArray(x) ? x : String(x).split(/[\\/]+/)))
    .filter(Boolean)
    .reduce(joinPath, d);

// run 1: statements that run when the program starts (in the order of the original file)
export async function init1() {
  ST.CFG = mergeConfig(undefined).config;
  window.CAM = CAM;
  ({ ddOpen, justClosed: ddJustClosed } = initWidgets(animOn));
  document.querySelectorAll('.tab').forEach(
    b =>
      (b.onclick = () => {
        document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x == b));
        ['dtc', 'kb', 'kn', 'mp', 'wp', 'ms', 'pf', 'wx', 'sq', 'dc'].forEach(i =>
          $(i).classList.toggle('hide', i != b.dataset.t)
        );
        document.body.classList.toggle('onms', b.dataset.t == 'ms');
        if (b.dataset.t != 'ms' && ST.msPage) ST.msPage.leave();
        if (b.dataset.t != 'wx' && typeof wxPage != 'undefined' && wxPage) wxPage.leave();
        if (b.dataset.t == 'ms') ST.msPage.render();
        if (b.dataset.t == 'dtc') view();
        if (b.dataset.t == 'sq') sqPage.refresh();
        if (b.dataset.t != 'wp' && ST.wpPage) ST.wpPage.leave();
        document.body.classList.toggle('onwp', b.dataset.t == 'wp');
        if (b.dataset.t == 'wp') ST.wpPage.render();
        $('kbtop').style.display = b.dataset.t == 'kb' ? 'flex' : 'none';
        if (b.dataset.t == 'kb') draw();
        $('mainbar').style.display =
          b.dataset.t == 'kn' || b.dataset.t == 'mp' || b.dataset.t == 'sq' || b.dataset.t == 'dc' ? 'none' : '';
        document
          .querySelector('main')
          .classList.toggle(
            'wide',
            b.dataset.t == 'kn' ||
              b.dataset.t == 'mp' ||
              b.dataset.t == 'wp' ||
              b.dataset.t == 'ms' ||
              b.dataset.t == 'pf' ||
              b.dataset.t == 'wx' ||
              b.dataset.t == 'dc'
          );
        if (b.dataset.t == 'pf') pfPage.render();
        if (b.dataset.t == 'dc') dcPage.render();
        if (b.dataset.t == 'wx') wxPage.render();
        if (b.dataset.t == 'kn') kbRender();
        if (b.dataset.t == 'mp') {
          let m = $('mpcam');
          if (!m) {
            m = document.createElement('div');
            m.id = 'mpcam';
            m.className = 'bar';
            $('mpside').prepend(m);
          }
          m.append($('csel'), $('tesel'), $('cam'));
          $('mpside').append($('ato'));
          atoHints();
          mapV.show();
          try {
            mapV.refreshDtc();
          } catch (e) {}
        } else {
          if ($('csel').parentElement.id == 'mpcam') {
            $('kbtop').prepend($('cam'));
            $('kbtop').prepend($('tesel'));
            $('kbtop').prepend($('csel'));
          }
          if ($('ato').parentElement.id == 'mpside') document.querySelector('#kb .k').prepend($('ato'));
          atoHints();
        }
      })
  );
}
