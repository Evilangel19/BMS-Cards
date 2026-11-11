// "Ready to fly": one button in the tab bar says whether what the pilot prepared is where BMS reads it: the DTC written into its file, the kneeboard saved to the
// BMS folder, the mission saved. Amber with the list of what is missing, green when nothing is; a click opens the three rows, each with its button, and "Write all".
// Shown while a flight is chosen on the Datacard or something waits to be saved.
import { APP_VERSION, REPO, newerVersion } from '../core/version.js';
import { ST } from './state.js';
import { $, appToast, esc } from './base.js';
import { lines, dtcOverwrite } from './dtcfile.js';
import { dtcToWrite } from './dtcapply.js';
import { kbUnsaved, kbSave } from './kneeboard.js';
import { missionToSave, msfSave } from './mission.js';

const hasFlight = () =>
  !!($('fsel') && $('fsel').value && $('fsel').selectedIndex >= 0 && $('fsel').options.length > 1);
// [key, label, state: 'todo' | 'ok' | 'none', what it says, the button, the action]
export function readyItems() {
  const d = lines.length > 0;
  return [
    {
      k: 'dtc',
      n: 'DTC',
      st: !d ? 'none' : dtcToWrite() ? 'todo' : 'ok',
      t: !d ? 'No DTC file open' : dtcToWrite() ? 'Changes not written into the DTC file' : 'Written into the DTC file',
      b: 'Write DTC',
      go: dtcOverwrite,
    },
    {
      k: 'kb',
      n: 'Kneeboard',
      st: kbUnsaved() ? 'todo' : 'ok',
      t: kbUnsaved() ? 'Changed since it was last saved to the BMS folder' : 'Saved to the BMS folder',
      b: 'Save kneeboard',
      go: kbSave,
    },
    {
      k: 'msf',
      n: 'Mission',
      st: !hasFlight() ? 'none' : missionToSave() ? 'todo' : 'ok',
      t: !hasFlight() ? 'No flight chosen' : missionToSave() ? 'Not saved (or changed since it was saved)' : 'Saved',
      b: 'Save mission',
      go: msfSave,
    },
  ];
}
let busy = false,
  sig = '';
async function run(keys) {
  if (busy) return;
  busy = true;
  try {
    for (const k of keys) {
      const it = readyItems().find(x => x.k == k);
      if (it && it.st == 'todo') await it.go();
    }
  } catch (e) {
    appToast('Not everything was written: ' + ((e && e.message) || e));
  }
  busy = false;
  draw(true);
}
function pop() {
  let p = $('rdypop');
  if (p) {
    p.remove();
    return;
  }
  p = document.createElement('div');
  p.id = 'rdypop';
  p.className = 'rdypop';
  document.body.append(p);
  draw(true);
  const out = e => {
    if (!p.isConnected) return document.removeEventListener('mousedown', out, true);
    if (!p.contains(e.target) && e.target !== $('rdy')) {
      p.remove();
      document.removeEventListener('mousedown', out, true);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', out, true), 0);
}
function draw(force) {
  const L = readyItems(),
    todo = L.filter(x => x.st == 'todo'),
    show = todo.length > 0 || hasFlight();
  let b = $('rdy');
  if (!b) {
    b = document.createElement('button');
    b.id = 'rdy';
    b.type = 'button';
    b.onclick = pop;
    const cfg = $('cfgbtn');
    if (cfg && cfg.parentNode) cfg.parentNode.insertBefore(b, cfg);
    else document.body.append(b);
  }
  const s = JSON.stringify([show, L.map(x => x.st)]);
  if (s !== sig || force) {
    sig = s;
    b.hidden = !show;
    b.className = 'rdy' + (todo.length ? ' warn' : ' ok');
    b.textContent = todo.length ? '⚠ Not saved: ' + todo.map(x => x.n).join(' · ') : '✔ Ready to fly';
    b.title = todo.length
      ? 'Not where BMS reads it yet: ' + todo.map(x => x.n).join(', ') + '. Click to write.'
      : 'The DTC, the kneeboard and the mission are saved.';
  }
  const p = $('rdypop');
  if (!p) return;
  if (!show) return p.remove();
  const r = b.getBoundingClientRect();
  p.style.top = r.bottom + 6 + 'px';
  p.style.right = Math.max(8, innerWidth - r.right) + 'px';
  p.innerHTML =
    L.map(
      x =>
        `<div class="rdyr ${x.st}"><i></i><div><b>${esc(x.n)}</b><span>${esc(x.t)}</span></div>${x.st == 'todo' ? `<button type="button" class="btn g bl" data-r="${x.k}">${esc(x.b)}</button>` : ''}</div>`
    ).join('') +
    (todo.length > 1 ? '<button type="button" class="btn rdyall" data-r="all">Write all</button>' : '') +
    '<p class="hint">Each one asks before it writes, as its own button does.</p>';
  p.querySelectorAll('[data-r]').forEach(
    e => (e.onclick = () => run(e.dataset.r == 'all' ? todo.map(x => x.k) : [e.dataset.r]))
  );
}
export function readyWatch() {
  draw(true);
  setInterval(() => {
    if (!busy) draw(false);
  }, 1200);
}

// ---- a newer version of the program: asked once a day to GitHub (the tags of the repository), only when Settings > General allows it. Nothing is downloaded:
// the button shows where the new version is. Any error (no network, a private repository) is silent.
const VKEY = 'bmscards.vercheck';
export async function verLatest(fetchFn = fetch) {
  let c = null;
  try {
    c = JSON.parse(localStorage.getItem(VKEY) || 'null');
  } catch (e) {
    c = null;
  }
  if (c && c.for === APP_VERSION && Date.now() - c.t < 864e5) return c.v || '';
  const r = await fetchFn('https://api.github.com/repos/' + REPO + '/tags?per_page=100', {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const v = newerVersion(
    (await r.json()).map(t => t && t.name),
    APP_VERSION
  );
  try {
    localStorage.setItem(VKEY, JSON.stringify({ t: Date.now(), for: APP_VERSION, v }));
  } catch (e) {
    /* not kept */
  }
  return v;
}
export function verShow(v) {
  let b = $('verchip');
  if (!v) {
    if (b) b.hidden = true;
    return;
  }
  const url = 'https://github.com/' + REPO + '/releases';
  if (!b) {
    b = document.createElement('button');
    b.id = 'verchip';
    b.type = 'button';
    b.className = 'verchip';
    const cfg = $('cfgbtn');
    if (cfg && cfg.parentNode) cfg.parentNode.insertBefore(b, cfg);
    else document.body.append(b);
    b.onclick = () => {
      let p = $('verpop');
      if (p) return p.remove();
      p = document.createElement('div');
      p.id = 'verpop';
      p.className = 'rdypop';
      const r = b.getBoundingClientRect();
      p.style.top = r.bottom + 6 + 'px';
      p.style.right = Math.max(8, innerWidth - r.right) + 'px';
      p.innerHTML = `<div><b>Version ${esc(b.dataset.v)} is available</b></div><p class="hint">You have ${esc(APP_VERSION)}. The pilots of a squadron should fly the same version (missions and the Briefing travel between them). The program does not update itself: download the new one here.</p><input readonly value="${esc(url)}" aria-label="Address of the downloads"><div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn g" data-a="copy">Copy the address</button><a class="btn g bl" href="${esc(url)}" target="_blank" rel="noopener">Open</a></div><p class="hint">The check can be switched off in Settings &gt; General.</p>`;
      document.body.append(p);
      p.querySelector('[data-a=copy]').onclick = async () => {
        try {
          await navigator.clipboard.writeText(url);
          appToast('Copied.');
        } catch (e) {
          p.querySelector('input').select();
        }
      };
      const out = e => {
        if (!p.isConnected) return document.removeEventListener('mousedown', out, true);
        if (!p.contains(e.target) && e.target !== b) {
          p.remove();
          document.removeEventListener('mousedown', out, true);
        }
      };
      setTimeout(() => document.addEventListener('mousedown', out, true), 0);
    };
  }
  b.dataset.v = v;
  b.textContent = '⬆ Version ' + v;
  b.title = 'A newer version of BMS Cards is available: ' + v + ' (you have ' + APP_VERSION + ')';
  b.hidden = false;
}
export function verCheck() {
  if (ST.CFG && ST.CFG.ui && ST.CFG.ui.checkUpdates === false) return verShow('');
  verLatest()
    .then(verShow)
    .catch(() => {});
}
