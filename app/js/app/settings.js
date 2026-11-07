import {
  loadConfig,
  isDesktop,
  pickFolder,
  saveConfig,
  fileExists,
  readBytes,
  canWriteAppDir,
  onSaveFail,
  appDir,
  join,
} from '../platform/desktop.js';
import { APP_VERSION } from '../core/version.js';
import { ST } from './state.js';
import { $, applyAnim, esc } from './base.js';
import { campDir, dtcDir, fillCampaigns, selectCampaign } from './campaign.js';
import { kbDir, kbMemLoad, kbRender } from './kneeboard.js';
import { GAMEDATA, loadGameData } from './gamedata.js';
import { applyFormToggle, closeEd } from './editor.js';
import { mapV, sqPage } from './pages.js';
import { view, openDtc } from './dtcfile.js';
import { initAppear } from './appear.js';
import { ic, setOpen, setSwitch, swRow, top } from './settingsui.js';
import { diagInner, warnCount } from './settingsdiag.js';
import { dataBusy, dataPage, restartInfo } from './settingsdata.js';

/* ---------- Settings ---------- */
export const CFG_PATHS = [
  ['bmsInstall', 'BMS install folder'],
  ['campaigns', 'Campaigns folder'],
  ['dtc', 'DTC folder'],
  ['kneeboardDir', 'Kneeboard DDS folder'],
  ['missions', 'Missions folder'],
];
export const AUTO_HINT = { campaigns: () => campDir(), dtc: () => dtcDir(), kneeboardDir: () => kbDir() };
// start-up option: the last DTC and the last campaign / tactical engagement are opened again (desktop app)
export async function autoLoadLast() {
  const u = ST.CFG.ui || {};
  if (!isDesktop() || !u.autoLoad) return;
  const c = u.lastCamp;
  if (c && [...$('csel').options, ...$('tesel').options].some(o => o.value == c)) await selectCampaign(c);
  const d = u.lastDtc;
  if (d && (await fileExists(d))) {
    const b = await readBytes(d);
    await openDtc({
      name: d.split(/[\\/]/).pop(),
      path: d,
      arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
    });
  }
}

// The sections of the window. The switches and boxes of a section tell which section has unsaved changes (a dot on its entry).
const SECTIONS = ['folders', 'diag', 'general', 'datacard', 'mission', 'map', 'data'];
const SW_OF = { general: ['autoLoad', 'anim'], datacard: ['form', 'others', 'mfd'], map: ['sat'] };
let LAST = 'folders'; // the section shown the last time
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// What the pilot has typed or switched, as plain values (the same shape for the values at the start, to see what changed)
function readForm(dlg) {
  const q = id => dlg.querySelector('#' + id),
    on = k => dlg.querySelector('[data-a=sw][data-k=' + k + ']').classList.contains('on');
  const sw = {};
  Object.values(SW_OF)
    .flat()
    .forEach(k => (sw[k] = on(k)));
  const rad = q('c-rad').value.trim(),
    zoom = q('c-zoom').value.trim();
  return {
    paths: Object.fromEntries(CFG_PATHS.map(([k]) => [k, q('f-' + k).value.trim()])),
    sw,
    radius: rad === '' ? '' : clamp(+rad || 0, 0, 300),
    trackers: q('c-trk').value.trim(),
    sat: {
      url: q('c-url').value.trim(),
      key: q('c-key').value.trim(),
      attr: q('c-attr').value.trim(),
      zoom: zoom === '' ? 18 : clamp(Math.round(+zoom || 18), 5, 22),
    },
  };
}
// the part of the values that belongs to a section
const OF = {
  folders: v => v.paths,
  general: v => [v.sw.autoLoad, v.sw.anim],
  datacard: v => [v.sw.form, v.sw.others, v.sw.mfd],
  mission: v => [v.radius, v.trackers],
  map: v => [v.sw.sat, v.sat],
};

export async function openSettings() {
  const dlg = $('cfg');
  if (dlg.open) return;
  const desk = isDesktop(),
    [loc, chk, app] = await Promise.all([
      loadConfig().then(r => r.location),
      APPCHK || canWriteAppDir(), // the check made at start (it writes a small file: not again each time the window opens)
      desk ? appDir() : '',
    ]);
  const prog = { desktop: desk, dir: chk.dir, ok: chk.ok, why: chk.why, loc };
  const C = ST.CFG,
    ui = C.ui || {},
    mp = C.map || {};
  const sw = swRow;
  const input = (id, v, extra = '') =>
    '<input id="' +
    id +
    '" class="s-fd" type="text" value="' +
    esc(v) +
    '" spellcheck="false" autocomplete="off"' +
    extra +
    '>';
  const page = (id, inner) =>
    '<section class="s-pg s-ap" data-p="' + id + '" id="p-' + id + '" hidden>' + inner + '</section>';
  const ph = k =>
    k === 'bmsInstall'
      ? 'C:\\Games\\Falcon BMS 4.38'
      : k === 'missions'
        ? 'default: ' + (app ? join(app, 'missions') : 'the missions folder next to BMS-Cards.exe')
        : 'automatic: ' + (AUTO_HINT[k]() || 'set the BMS install folder');
  const nav = (id, label, icon, extra = '') =>
    '<button type="button" class="s-nv" data-a="go" data-p="' +
    id +
    '" id="nv-' +
    id +
    '" aria-current="false">' +
    ic(icon) +
    '<span class="t">' +
    label +
    '</span><span class="s-nd" aria-hidden="true"></span>' +
    extra +
    '</button>';

  const folders =
    top(
      'folders',
      'Folders',
      'Where BMS Cards reads your game and keeps your files. Leave a field empty to use the automatic folder.'
    ) +
    '<div class="s-gp">' +
    CFG_PATHS.map(
      ([k, lab]) =>
        '<div class="s-fr"><div class="s-lr"><label for="f-' +
        k +
        '">' +
        lab +
        '</label><span class="s-st" id="fs-' +
        k +
        '" role="status"></span></div>' +
        '<div class="s-ir">' +
        input('f-' + k, C.paths[k] || '', ' placeholder="' + esc(ph(k)) + '"') +
        (desk ? '<button type="button" class="btn g" data-a="browse" data-k="' + k + '">Browse</button>' : '') +
        '</div>' +
        (k === 'bmsInstall'
          ? '<p class="hint" style="margin-top:6px">Aircraft, weapons, airbases and radio data are read from here. Nothing works without it.</p>'
          : '') +
        (k === 'missions'
          ? '<p class="hint" style="margin-top:6px">Saved missions go here, one folder for each.</p>'
          : '') +
        '</div>'
    ).join('') +
    '</div>';
  const general =
    top('general', 'General', 'How the program starts and how it looks.') +
    '<div class="s-gp">' +
    sw(
      'autoLoad',
      'Open last at start',
      'At start the last DTC and the last campaign / tactical engagement are opened again',
      !!ui.autoLoad
    ) +
    sw(
      'anim',
      'Animations',
      'Short transitions (ignored when the system asks for reduced motion)',
      ui.animations !== false
    ) +
    '</div>';
  const datacard =
    top('datacard', 'Datacard', 'What the Datacard and Data Cartridge pages show.') +
    '<div class="s-gp">' +
    sw('form', 'Datacard form', 'Show the form with all the fields on the Datacard page', !!ST.FORMON) +
    sw(
      'others',
      'Other factions',
      'Read the ATO and the map of the other factions (only without a squadron: in a squadron, only its commander can). Just for immersion: in BMS you can start the campaign as the other side.',
      !!ST.OBSERVER
    ) +
    sw('mfd', 'MFD 3 and 4', 'Show them in the Data Cartridge MFD page (BMS does not use them yet)', !!ui.showMfd34) +
    '</div>';
  const mission =
    top('mission', 'Mission & squadron', 'What a saved mission keeps, and how your squadron finds its pilots.').replace(
      'class="s-top"',
      'class="s-top" style="margin-bottom:6px"'
    ) +
    '<h3 class="s-gt">Mission</h3><div class="s-gp"><div class="s-rw"><div class="tx"><label class="tt" for="c-rad">Mission radius</label><p class="hint">A saved mission keeps the units within this distance (NM) of the route. 0 = only the units of the package.</p></div>' +
    '<div style="display:flex;align-items:center;gap:8px"><input id="c-rad" class="s-fd" type="text" inputmode="numeric" style="width:76px;text-align:right" value="' +
    (C.mission && C.mission.radiusNm != null ? C.mission.radiusNm : 60) +
    '" autocomplete="off">' +
    '<span class="s-nst"><button type="button" aria-label="Increase" data-a="step" data-d="1">' +
    ic('up') +
    '</button><button type="button" aria-label="Decrease" data-a="step" data-d="-1">' +
    ic('down') +
    '</button></span><span style="color:var(--mu)">NM</span></div></div></div>' +
    '<h3 class="s-gt">Squadron</h3><div class="s-gp"><div class="s-fr"><label for="c-trk">Squadron trackers</label><textarea id="c-trk" class="s-fd" rows="3" spellcheck="false" placeholder="empty = the built-in public trackers (wss://tracker.openwebtorrent.com …)">' +
    esc((C.squadron && C.squadron.trackers) || '') +
    '</textarea><p class="hint" style="margin-top:8px">WebTorrent trackers (ws:// or wss://, one per line) used to see which pilots of the squadron are online. You can use your own.</p></div></div>';
  const map =
    top('map', 'Map', 'The satellite layer of the maps.') +
    '<div class="s-gp">' +
    sw(
      'sat',
      'Own satellite layer',
      'Replace the satellite layer of the maps (built-in: Sentinel-2 by EOX) with your own tile provider',
      !!mp.satOn
    ) +
    '<div class="s-xp' +
    (mp.satOn ? ' open' : '') +
    '" id="satbox"><div>' +
    '<div class="s-fr"><label for="c-url">Tile address</label>' +
    input('c-url', mp.satUrl || '', ' placeholder="https://provider/{z}/{y}/{x}?token={key}"') +
    '</div>' +
    '<div class="s-fr"><label for="c-key">Key</label>' +
    input('c-key', mp.satKey || '', ' placeholder="replaces {key} in the address (optional)"') +
    '</div>' +
    '<div class="s-fr"><label for="c-attr">Credit</label>' +
    input('c-attr', mp.satAttr || '', ' placeholder="credit shown on the map, as the provider asks"') +
    '</div>' +
    '<div class="s-fr"><label for="c-zoom">Deepest zoom</label>' +
    input('c-zoom', String(mp.satMaxZoom || 18), ' inputmode="numeric" style="width:76px"') +
    '<p class="hint" style="margin-top:10px">Address with {z}, {x} and {y} (XYZ tiles); the provider must allow CORS. Use only a service whose terms let you do so, with your own account or key.</p></div>' +
    '</div></div></div>';

  dlg.innerHTML =
    '<div class="s-hd"><h1>Settings</h1><span class="s-ch mu">v' +
    esc(APP_VERSION) +
    '</span><span style="flex:1"></span><button type="button" class="s-ib" id="cfgx" data-a="close" aria-label="Close">' +
    ic('close') +
    '</button></div>' +
    '<div class="s-bd"><nav class="s-sb" aria-label="Settings sections">' +
    '<div class="s-eg"><div class="s-gl"><span>Essentials</span><i>needed to work</i></div>' +
    nav('folders', 'Folders', 'folder', '<span id="nvf"></span>') +
    nav('diag', 'Diagnostics', 'pulse', '<span class="s-nb" id="nvdiag" hidden></span>') +
    '</div><div class="s-gl s-gap"><span>Preferences</span><i>optional</i></div>' +
    nav('general', 'General', 'sliders') +
    nav('datacard', 'Datacard', 'card') +
    nav('mission', 'Mission &amp; squadron', 'people') +
    nav('map', 'Map', 'map') +
    '<div class="s-gl s-gap"><span>Data</span><i>move or back up</i></div>' +
    nav('data', 'Import &amp; backup', 'swap') +
    '</nav><div class="s-ct">' +
    page('folders', folders) +
    page('diag', '') +
    page('general', general) +
    page('datacard', datacard) +
    page('mission', mission) +
    page('map', map) +
    page('data', '') +
    '</div></div>' +
    '<div class="s-ft"><span class="s-note" id="cfgnote" role="status"></span><span style="flex:1"></span><button type="button" class="btn g" id="cfgcancel" data-a="close">Close</button><button type="button" class="btn" id="cfgsave" data-a="save" disabled>Save</button></div>';

  // ---------------- state of the window
  const q = id => dlg.querySelector('#' + id);
  let init = readForm(dlg),
    flash = 0,
    loading = false,
    reportOpen = false,
    busy = false;

  // the entry of the list that has something to say: unsaved changes (a dot), a folder that is not found, warnings of the game data
  function refresh() {
    const v = readForm(dlg);
    let any = false;
    Object.keys(OF).forEach(p => {
      const d = JSON.stringify(OF[p](v)) !== JSON.stringify(OF[p](init));
      q('nv-' + p)
        .querySelector('.s-nd')
        .classList.toggle('on', d);
      any = any || d;
    });
    const rs = restartInfo(),
      note = q('cfgnote');
    note.className = 's-note';
    if (loading) note.textContent = 'Reading the game data…';
    else if (any) note.innerHTML = '<span class="s-nd on" aria-hidden="true"></span>Unsaved changes';
    else if (flash) {
      note.classList.add('ok');
      note.innerHTML = ic('check', 's') + 'Saved';
    } else if (rs) {
      note.classList.add('wn');
      note.textContent = 'Restart BMS Cards to use the imported data.';
    } else note.textContent = '';
    q('cfgsave').disabled = !any || loading || busy || !!(rs && rs.cfg);
    q('cfgsave').title = rs && rs.cfg ? 'The settings were imported: restart BMS Cards first.' : '';
    q('cfgcancel').textContent = any ? 'Cancel' : 'Close';
    q('cfgcancel').disabled = q('cfgx').disabled = busy;
  }
  const show = id => {
    LAST = id;
    SECTIONS.forEach(p => {
      const on = p === id;
      dlg.querySelector('#p-' + p).hidden = !on;
      q('nv-' + p).classList.toggle('on', on);
      q('nv-' + p).setAttribute('aria-current', on ? 'page' : 'false');
    });
  };

  // folders: what each one is (found, automatic, not found ...), said next to its name
  const seq = {};
  async function folderState(k, v) {
    if (!desk) return { c: 'nf', t: 'Used by the desktop app' };
    if (k === 'bmsInstall') {
      if (!v) return { c: 'wn', t: 'Not set' };
      if (!(await fileExists(v))) return { c: 'wn', t: 'Not found on this computer' };
      const b = GAMEDATA && GAMEDATA.info && GAMEDATA.info.bms,
        ver = b && b.version && v === C.paths.bmsInstall ? ' · Falcon BMS ' + b.version : '';
      return { c: 'ok', t: 'Found' + ver };
    }
    if (k === 'missions') {
      const d = v || join(app, 'missions');
      return (await fileExists(d))
        ? { c: 'ok', t: v ? 'Found' : 'Automatic · found' }
        : { c: 'nf', t: 'Created when you save your first mission' };
    }
    if (v) return (await fileExists(v)) ? { c: 'ok', t: 'Found' } : { c: 'wn', t: 'Not found on this computer' };
    const a = AUTO_HINT[k]();
    if (!a) return { c: 'nf', t: 'Set the BMS install folder first' };
    return (await fileExists(a)) ? { c: 'ok', t: 'Automatic · found' } : { c: 'wn', t: 'Automatic · not found' };
  }
  async function folderStatus(k) {
    const n = (seq[k] = (seq[k] || 0) + 1),
      s = await folderState(k, q('f-' + k).value.trim());
    if (n !== seq[k] || !dlg.open) return;
    const el = q('fs-' + k);
    el.className = 's-st ' + s.c;
    el.innerHTML = (s.c === 'ok' ? ic('check', 's') : s.c === 'wn' ? ic('warn', 's') : ic('info', 's')) + esc(s.t);
    el.dataset.c = s.c;
    const bad = CFG_PATHS.filter(([x]) => q('fs-' + x).dataset.c === 'wn').length,
      allSet = CFG_PATHS.every(([x]) => q('fs-' + x).dataset.c);
    q('nvf').innerHTML =
      !desk || !allSet
        ? ''
        : bad
          ? '<span class="s-nb" aria-label="' + bad + ' to check">' + bad + '</span>'
          : '<span class="s-okm">' + ic('check', 's') + '</span>';
  }
  const allFolders = () => CFG_PATHS.forEach(([k]) => folderStatus(k));
  const placeholders = () => CFG_PATHS.forEach(([k]) => (q('f-' + k).placeholder = ph(k)));
  function fillDiag() {
    q('p-diag').innerHTML = diagInner(prog, reportOpen);
    const n = warnCount(),
      b = q('nvdiag');
    b.hidden = !n;
    b.textContent = n;
    b.setAttribute('aria-label', n + (n === 1 ? ' warning' : ' warnings'));
  }

  dataPage(q('p-data'), {
    busy: on => {
      busy = on;
      refresh();
    },
    imported: () => refresh(),
  });
  fillDiag();
  allFolders();
  show(LAST);
  refresh();

  // ---------------- Save
  async function save() {
    if (q('cfgsave').disabled) return;
    const v = readForm(dlg);
    const n = JSON.parse(JSON.stringify(ST.CFG));
    CFG_PATHS.forEach(([k]) => (n.paths[k] = v.paths[k]));
    n.ui = { ...(n.ui || {}), animations: v.sw.anim, showMfd34: v.sw.mfd, autoLoad: v.sw.autoLoad };
    n.squadron = { ...(n.squadron || {}), trackers: v.trackers };
    n.mission = {
      ...(n.mission || {}),
      radiusNm: v.radius === '' ? ((ST.CFG.mission && ST.CFG.mission.radiusNm) ?? 60) : v.radius,
    };
    n.map = {
      ...(n.map || {}),
      satOn: v.sw.sat,
      satUrl: v.sat.url,
      satKey: v.sat.key,
      satAttr: v.sat.attr,
      satMaxZoom: v.sat.zoom,
    };
    // a folder typed with a mistake would leave the program without its data or write nowhere: said before saving
    if (isDesktop()) {
      const missing = [];
      for (const [k, lab] of CFG_PATHS) {
        const p = n.paths[k];
        // the missions folder is made when the first mission is saved
        if (k != 'missions' && p && p !== ST.CFG.paths[k] && !(await fileExists(p))) missing.push(lab + ': ' + p);
      }
      if (
        missing.length &&
        !(await confirm(
          'These folders do not exist on this computer:\n\n' +
            missing.join('\n') +
            '\n\nSave the settings anyway? (Cancel = go back and correct them)'
        ))
      )
        return;
    }
    try {
      await saveConfig(n);
      const changed = n.paths.bmsInstall !== ST.CFG.paths.bmsInstall;
      const trk = n.squadron.trackers !== ((ST.CFG.squadron && ST.CFG.squadron.trackers) || '');
      ST.CFG = n;
      if (v.sw.form !== !!ST.FORMON) {
        closeEd(true);
        ST.FORMON = v.sw.form;
        try {
          localStorage.setItem('bmsform', ST.FORMON ? '1' : '0');
        } catch (e) {}
        applyFormToggle();
      }
      if (v.sw.others !== !!ST.OBSERVER) {
        ST.OBSERVER = v.sw.others;
        try {
          localStorage.setItem('bmsobs', ST.OBSERVER ? '1' : '0');
        } catch (e) {}
      }
      applyAnim();
      if (trk) sqPage.restart();
      try {
        mapV.rebase();
      } catch (e) {}
      view();
      if (!$('kn').classList.contains('hide')) kbRender();
      init = readForm(dlg);
      clearTimeout(flash);
      flash = setTimeout(() => {
        flash = 0;
        if (dlg.open) refresh();
      }, 2500);
      refresh();
      if (changed) {
        loading = true;
        refresh();
        try {
          await loadGameData();
        } finally {
          loading = false;
        }
      }
      fillCampaigns();
      if (dlg.open) {
        placeholders();
        allFolders();
        fillDiag();
        refresh();
      }
    } catch (e) {
      loading = false;
      if (dlg.open) refresh();
      alert('Could not save settings: ' + ((e && e.message) || e));
    }
  }

  // ---------------- the buttons and boxes
  dlg.onclick = async e => {
    const b = e.target.closest('[data-a]');
    if (!b || b.disabled || !dlg.contains(b)) return;
    const a = b.dataset.a;
    if (a === 'go') show(b.dataset.p);
    else if (a === 'close') dlg.close();
    else if (a === 'save') save();
    else if (a === 'sw') {
      const on = !b.classList.contains('on');
      setSwitch(b, on);
      if (b.dataset.k === 'sat') setOpen(q('satbox'), on);
      refresh();
    } else if (a === 'report') {
      reportOpen = !reportOpen;
      setOpen(q('cfgreport'), reportOpen);
      setOpen(b.querySelector('.s-cv'), reportOpen);
      b.setAttribute('aria-expanded', String(reportOpen));
    } else if (a === 'step') {
      const r = q('c-rad');
      r.value = clamp((+r.value || 0) + 5 * +b.dataset.d, 0, 300);
      refresh();
    } else if (a === 'browse') {
      const i = q('f-' + b.dataset.k),
        lab = CFG_PATHS.find(([k]) => k === b.dataset.k)[1],
        d = await pickFolder({ startDir: i.value, title: lab });
      if (d) {
        i.value = d;
        folderStatus(b.dataset.k);
        refresh();
      }
    }
  };
  const later = {};
  dlg.oninput = e => {
    const t = e.target;
    if (t.id === 'c-rad') t.value = t.value.replace(/\D/g, '').slice(0, 3);
    else if (t.id === 'c-zoom') t.value = t.value.replace(/\D/g, '').slice(0, 2);
    if (t.id === 'c-rad' && +t.value > 300) t.value = '300';
    const k = t.id.startsWith('f-') && t.id.slice(2);
    if (k) {
      clearTimeout(later[k]);
      later[k] = setTimeout(() => dlg.open && folderStatus(k), 350);
    }
    refresh();
  };
  dlg.onchange = e => {
    // a number box left empty goes back to what it was
    if (e.target.id === 'c-rad' && e.target.value === '')
      e.target.value = String(init.radius === '' ? 60 : init.radius);
    if (e.target.id === 'c-zoom' && e.target.value === '') e.target.value = String(init.sat.zoom);
    refresh();
  };
  dlg.oncancel = e => {
    if (busy || dataBusy()) e.preventDefault(); // Escape while something is being copied
  };
  dlg.onclose = () => {
    clearTimeout(flash);
    Object.values(later).forEach(clearTimeout);
    dlg.onclick = dlg.oninput = dlg.onchange = dlg.oncancel = dlg.onclose = null;
  };
  dlg.showModal();
  const cur = q('nv-' + LAST);
  if (cur) cur.focus();
}

// our own number steppers (the browser's spin buttons are hidden by the CSS): a pair of small buttons after every number box, also for boxes drawn later
export function stepper(i) {
  if (i.dataset.nst || i.closest('#ed')) return;
  i.dataset.nst = 1;
  const b = document.createElement('span');
  b.className = 'nst';
  b.innerHTML =
    '<button type="button" tabindex="-1" title="Increase">▲</button><button type="button" tabindex="-1" title="Decrease">▼</button>';
  {
    const n = i.nextSibling,
      u = n && n.nodeType == 3 && n.textContent.trim();
    if (u) b.style.marginLeft = '3px';
    (u ? n : i).after(b);
  }
  b.onclick = e => {
    const t = e.target.closest('button');
    if (!t) return;
    try {
      t === b.firstChild ? i.stepUp() : i.stepDown();
    } catch (x) {}
    i.dispatchEvent(new Event('input', { bubbles: true }));
    i.dispatchEvent(new Event('change', { bubbles: true }));
  };
}

// The program keeps its files next to the exe (portable). A folder it cannot write to (Program Files, a protected, read-only or synced folder) would lose the settings,
// the squadron, the missions, the cards and the backups without a word: said once at start, or the first time a file of the program cannot be written.
let FOLDERWARN = false,
  APPCHK = null;
const MOVE_HINT =
  'Move the whole BMS Cards folder to a folder of yours (Documents, or C:\\Games for example) and start it from there.';
export async function checkAppFolder() {
  const r = await canWriteAppDir();
  APPCHK = r;
  if (r.ok || FOLDERWARN) return r.ok;
  FOLDERWARN = true;
  alert(
    'BMS Cards cannot write in its own folder:\n' +
      r.dir +
      '\n\nThe settings, the squadron, the missions, the kneeboard cards and the backups of the DTC and kneeboard files are kept there: nothing would be saved. ' +
      MOVE_HINT +
      (r.why ? '\n\n(' + r.why + ')' : '')
  );
  return false;
}
onSaveFail((name, e) => {
  if (FOLDERWARN) return;
  FOLDERWARN = true;
  alert(
    'Could not save ' +
      name +
      ' in the folder of the program (' +
      String((e && e.message) || e || 'error') +
      ').\n\nIf the folder cannot be written (Program Files, a protected, read-only or synced folder, a full disk), your changes are not kept. ' +
      MOVE_HINT
  );
});

// run 18: statements that run when the program starts (in the order of the original file)
export async function init18() {
  $('cfgbtn').onclick = openSettings;
  const boot = loadConfig()
    .then(async r => {
      ST.CFG = r.config;
      applyAnim();
      if (r.warnings.length) alert('Settings: ' + r.warnings.join('\n'));
      kbMemLoad();
      await loadGameData();
      await fillCampaigns();
    })
    .catch(() => {});
  await Promise.race([boot, new Promise(r => setTimeout(r, 30000))]); // the start-up bar waits for the game data and the campaign list (30 s at most)
  checkAppFolder().catch(() => {});
  document.querySelectorAll('input[type=number]').forEach(stepper);
  autoLoadLast().catch(() => {});
  initAppear();
  new MutationObserver(ms =>
    ms.forEach(r =>
      r.addedNodes.forEach(n => {
        if (n.nodeType != 1) return;
        if (n.matches('input[type=number]')) stepper(n);
        n.querySelectorAll('input[type=number]').forEach(stepper);
      })
    )
  ).observe(document.body, { childList: true, subtree: true });
}
