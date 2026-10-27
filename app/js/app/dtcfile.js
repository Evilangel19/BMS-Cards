import { parseDtc } from '../parsers/dtc.js';
import { pickFile, join as joinPath, readBytes } from '../platform/desktop.js';
import * as PJ from '../core/mission.js';
import { ST } from './state.js';
import { $, IO, appToast, rememberLast } from './base.js';
import { applyDTC, dtcBtns, dtcReloaded } from './dtcapply.js';
import { mapV } from './pages.js';
import { apply } from './selection.js';
import { buildForm } from './datacard.js';
import { draw } from './cardview.js';
import { campDir, dtcDir } from './campaign.js';
import { campaignIni } from '../core/mapdtc.js';

/* ---------- DTC ---------- */
export let lines = [];
ST.name = 'DTC.ini';
export let DTCTEXT = ''; // the DTC text as opened: the mission keeps it apart from the changes
export function parse(t) {
  DTCTEXT = t;
  lines = parseDtc(t);
  view();
  try {
    ST.wpPage.render();
  } catch (e) {}
  try {
    ST.msPage.render();
  } catch (e) {}
  dtcBtns();
  try {
    if (mapV.isReady()) mapV.refreshDtc();
  } catch (e) {}
}
export const L = (s, k) => lines.find(l => l.s == s && l.k == k);
export const G = (s, k, d = '') => {
  const l = L(s, k);
  return l ? l.v : d;
};
export function S(s, k, v) {
  let l = L(s, k);
  if (!l) {
    let i = lines.map(x => x.s).lastIndexOf(s);
    if (i < 0) return;
    l = { k, s, raw: '' };
    lines.splice(i + 1, 0, l);
  }
  l.v = String(v);
  l.dirty = 1;
}
export function inp(v, fn, ph = '') {
  const i = document.createElement('input');
  i.value = v;
  i.placeholder = ph;
  i.onchange = () => fn(i.value);
  return i;
}
export function grid(cols, el, head) {
  const g = document.createElement('div');
  g.className = 'gr';
  g.style.gridTemplateColumns = cols;
  (head || []).forEach(h => {
    const d = document.createElement('div');
    d.className = 'hd';
    d.textContent = h;
    g.append(d);
  });
  el.append(g);
  return g;
}
// The Data Cartridge page lives in js/core/dtcpage.js (vertical sections of cards). view() redraws it, or notes that it must be drawn when its tab is shown.
ST.dtcPage = null;
ST.wpPage = null;
ST.msPage = null;
export function view() {
  if (!ST.dtcPage) return;
  if ($('dtc').classList.contains('hide')) return;
  ST.dtcPage.render();
}
export function stpts() {
  const o = [];
  lines
    .filter(l => l.s == 'STPT' && /^target_\d+$/.test(l.k) && +l.k.slice(7) < 80)
    .forEach(l => {
      const p = l.v.split(',').map(a => a.trim());
      if (+p[3] < 0 || (+p[0] == 0 && +p[1] == 0)) return;
      o.push({ l, n: +l.k.slice(7), x: p[0], y: p[1], alt: String(Math.round(-p[2])), t: p[3] });
    });
  return o.sort((a, b) => a.n - b.n);
}
ST.DTCF = null; // the open DTC file: {path (desktop app only), enc, bom, orig (bytes as read)}
export const encodeDtc = t => {
  if (ST.DTCF && ST.DTCF.enc == 'latin1')
    return Uint8Array.from(t, c => (c.charCodeAt(0) > 255 ? 63 : c.charCodeAt(0)));
  const b = new TextEncoder().encode(t);
  if (ST.DTCF && ST.DTCF.bom) {
    const o = new Uint8Array(b.length + 3);
    o.set([239, 187, 191]);
    o.set(b, 3);
    return o;
  }
  return b;
};
export const openDtc = async f => {
  ST.name = f.name;
  if (f.path) rememberLast('lastDtc', f.path);
  const bytes = new Uint8Array(await f.arrayBuffer());
  ST.DTCF = {
    path: f.path || null,
    enc: 'utf-8',
    bom: bytes[0] == 239 && bytes[1] == 187 && bytes[2] == 191,
    orig: bytes,
  };
  let t;
  try {
    t = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (e) {
    t = new TextDecoder('latin1').decode(bytes);
    ST.DTCF.enc = 'latin1';
  }
  parse(t);
  $('fn').textContent = ST.name;
  if (ST.C && ST.CL.length) apply(+$('fsel').value || 0);
  else {
    applyDTC();
    buildForm();
    draw();
  }
};
export const dtcOut = () => lines.map(l => (l.dirty ? l.k + '=' + l.v : l.raw)).join('\r\n') + '\r\n';
// Undo every change since the file was opened or last saved: edited lines get their original value back, lines added by an edit are dropped
export async function dtcRevert() {
  if (!lines.some(l => l.dirty)) return;
  if (!(await confirm('Undo all the changes made to this DTC since it was opened or last saved?'))) return;
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (!l.dirty) continue;
    if (!l.raw) {
      lines.splice(i, 1);
      continue;
    }
    l.v = l.raw.slice(l.raw.indexOf('=') + 1).trim();
    l.dirty = 0;
  }
  dtcReloaded();
  if ($('fn')) $('fn').textContent = ST.name;
}
// Write the changes into the open file itself. The first time, the original is kept in the program folder (backup\\dtc), never in the BMS folder.
// BMS reads the DTC of a campaign from <campaign name>.ini (Autosave.ini is written only when the campaign itself is the Autosave one, never otherwise): those files are written the way BMS writes them (campaignIni: [MISSION] title and the [STPT] data only, like the files BMS writes for a campaign and for a Tactical Engagement)
export async function dtcCampaignFiles() {
  const dirOf = p => p.replace(/[\\/][^\\/]*$/, ''),
    dirs = [
      ...new Set(
        [
          dirOf(ST.DTCF.path),
          dtcDir(),
          (() => {
            try {
              return campDir();
            } catch (e) {
              return '';
            }
          })(),
        ].filter(Boolean)
      ),
    ],
    stem = ST.C && ST.C.name ? PJ.safeName(ST.C.name) : '',
    names = [stem && stem + '.ini'].filter(Boolean),
    found = [];
  for (const n of names)
    for (const d of dirs) {
      const f = joinPath(d, n);
      if (f === ST.DTCF.path) continue;
      try {
        if (await IO.fileExists(f)) found.push(f);
      } catch (e) {}
    }
  if (
    stem &&
    !found.some(f => f.toLowerCase().endsWith(stem.toLowerCase() + '.ini')) &&
    joinPath(dirs[0], stem + '.ini') !== ST.DTCF.path
  )
    found.push(joinPath(dirs[0], stem + '.ini'));
  return found;
}
// The original of a DTC is copied once, with its own name, into <program folder>\backup\dtc (to restore it, move it back into the BMS folder). Another file with the same name from
// another folder gets " (2)", " (3)"... ; backup\dtc\index.json remembers which path each copy belongs to (so the copy is made only once per file and never overwritten).
export async function dtcBackupOnce(path, bytes) {
  const bd = joinPath(joinPath(await IO.appDir(), 'backup'), 'dtc'),
    ix = joinPath(bd, 'index.json'),
    base = path.split(/[\\/]/).pop();
  let map = {};
  try {
    if (await IO.fileExists(ix)) map = JSON.parse(new TextDecoder().decode(await readBytes(ix))) || {};
  } catch (e) {
    map = {};
  }
  const key = path.toLowerCase();
  if (map[key] && (await IO.fileExists(joinPath(bd, map[key])))) return;
  const used = new Set(Object.values(map).map(n => n.toLowerCase())),
    m = /^(.*?)(\.[^.]*)?$/.exec(base);
  let name = base,
    k = 2;
  while (used.has(name.toLowerCase()) || (await IO.fileExists(joinPath(bd, name))))
    name = m[1] + ' (' + k++ + ')' + (m[2] || '');
  await IO.makeDir(bd);
  await IO.writeBytes(joinPath(bd, name), bytes);
  map[key] = name;
  await IO.writeBytes(ix, new TextEncoder().encode(JSON.stringify(map, null, 1)));
}
export async function dtcOverwrite() {
  if (!lines.length) return alert('Open a DTC file first.');
  if (!ST.DTCF || !ST.DTCF.path)
    return alert('The location of this file is not known: set the DTC folder (or the BMS install folder) in Settings.');
  if (!lines.some(l => l.dirty)) return;
  let extra = [];
  try {
    extra = await dtcCampaignFiles();
  } catch (e) {}
  if (
    !(await confirm(
      'Overwrite this file with your changes?\n\n' +
        ST.DTCF.path +
        (extra.length
          ? '\n\nThe steerpoints, PPT, lines and weapon targets are also written, as BMS keeps them, to the campaign files BMS loads in the game:\n' +
            extra.join('\n')
          : '') +
        '\n\nThe originals are kept once in the program folder (backup\\dtc), not in the BMS folder.'
    ))
  )
    return;
  try {
    await dtcBackupOnce(ST.DTCF.path, ST.DTCF.orig);
    const out = encodeDtc(dtcOut());
    await IO.writeBytes(ST.DTCF.path, out);
    ST.DTCF.orig = out;
    const failed = []; // campaign files that could not be written: said to the pilot, and the changes stay "to save" so Write can be pressed again
    for (const f of extra) {
      try {
        let old = null;
        try {
          if (await IO.fileExists(f)) old = await readBytes(f);
        } catch (e) {}
        if (old) await dtcBackupOnce(f, old);
        await IO.writeBytes(
          f,
          new TextEncoder().encode(
            campaignIni(
              f
                .split(/[\\/]/)
                .pop()
                .replace(/\.ini$/i, ''),
              lines
            )
          )
        );
      } catch (e) {
        failed.push(f + ' (' + ((e && e.message) || e) + ')');
      }
    }
    if (!failed.length)
      lines.forEach(l => {
        if (l.dirty) {
          l.raw = l.k + '=' + l.v;
          l.dirty = 0;
        }
      });
    dtcBtns();
    $('fn').textContent = ST.name + (failed.length ? ' · saved, with errors' : ' · saved');
    if (failed.length)
      alert(
        'The DTC was saved, but these campaign files could NOT be written:\n\n' +
          failed.join('\n') +
          '\n\nThe changes are still marked as not saved: fix the problem (file in use? folder not writable?) and press Write again.'
      );
    else
      appToast(
        'DTC saved: ' +
          ST.DTCF.path +
          (extra.length ? ' (+ ' + extra.length + ' campaign file' + (extra.length > 1 ? 's' : '') + ')' : '')
      );
    try {
      if (mapV.isReady()) mapV.refreshDtc();
    } catch (e) {}
  } catch (e) {
    alert('Could not write the file: ' + ((e && e.message) || e));
  }
}

// run 2: statements that run when the program starts (in the order of the original file)
export async function init2() {
  {
    const m = $('openmenu'),
      b = $('openm'),
      close = () => {
        m.hidden = true;
      };
    b.onclick = e => {
      e.stopPropagation();
      m.hidden = !m.hidden;
    };
    m.onclick = e => {
      const x = e.target.closest('[data-o]');
      if (!x) return;
      close();
      $(x.dataset.o).click();
    };
    document.addEventListener('click', e => {
      if (!m.contains(e.target)) close();
    });
    document.addEventListener('keydown', e => {
      if (e.key == 'Escape') close();
    });
  }
  $('open').onclick = async () => {
    const f = await pickFile({ exts: ['ini'], startDir: dtcDir(), title: 'Open DTC' });
    if (f) openDtc(f);
  };
}
