// The page Import & backup of the Settings window: bring the data of another copy of the program (its folder, or a backup file) into this one, and save a backup of this one.
// The rules and the copying are in core/transfer.js and core/transferrun.js, the files are reached through platform/desktop.js; here are the pictures and the buttons.
import { APP_VERSION } from '../core/version.js';
import { dateStamp, fmtSize, plural } from '../core/transfer.js';
import {
  buildBackup,
  describeSource,
  findProgramFolder,
  runImport,
  sourceFromFolder,
  sourceFromZip,
} from '../core/transferrun.js';
import {
  appDir,
  dataIo,
  flushAll,
  freezeFiles,
  isDesktop,
  join,
  pickFile,
  pickFolder,
  saveFileBytes,
} from '../platform/desktop.js';
import { ST } from './state.js';
import { esc } from './base.js';
import { kbMemFreeze } from './kneeboard.js';
import { ic, top } from './settingsui.js';

const msg = e => String((e && e.message) || e || 'error');
const dirOf = p => p.replace(/[\\/][^\\/]*$/, '');
class Fail extends Error {} // a mistake of the pilot (the wrong folder ...): its text is shown as it is

// What stays when the window is closed and opened again: an import that is done (the program has to start again to use it)
let DONE = null; // { res, label, kind }
const S = {
  view: 'idle',
  err: '',
  busy: false,
  src: null,
  desc: null,
  label: '',
  chip: '',
  pick: {},
  pol: 'replace',
  prog: null,
};
const X = { view: 'idle', err: '', pct: 0, stage: '', name: '', res: null };

/** The import that was done and needs the program to start again: null, or { cfg: the settings file was replaced } */
export const restartInfo = () => (DONE && DONE.res.changed ? { cfg: DONE.res.written.includes('config.json') } : null);
/** An import or an export is running: the window must not be closed */
export const dataBusy = () => S.busy || X.view === 'running';

const errHtml = t => '<div class="s-err" role="alert">' + ic('warn', 's') + '<div>' + esc(t) + '</div></div>';
const infoLine = t =>
  '<div class="s-st nf" style="align-items:flex-start;margin-top:12px">' +
  ic('info', 's') +
  '<span style="color:var(--mu)">' +
  t +
  '</span></div>';
const mono = t => '<span class="s-mono">' + esc(t) + '</span>';
const bar = (id, label, pct) =>
  '<div class="s-pb" role="progressbar" aria-label="' +
  label +
  '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
  pct +
  '" id="' +
  id +
  '"><i style="width:' +
  pct +
  '%"></i></div>';

/**
 * Fills the page. hooks: busy(on) while something runs, imported(result) when an import changed the files.
 * @param {HTMLElement} host the frame of the page
 * @param {{busy:(on:boolean)=>void, imported:(res:any)=>void}} hooks
 */
export function dataPage(host, hooks) {
  host.insertAdjacentHTML(
    'beforeend',
    top('data', 'Import & backup', 'Move your data to a new version, or keep a copy of it.') +
      (isDesktop()
        ? '<div class="s-gp s-cd" id="imp"></div><div class="s-gp s-cd" id="exp"></div>' +
          '<p class="hint" style="margin-top:14px">Import and export run right away and do not need Save. To restore a backup, use Import &gt; Choose backup file.</p>'
        : '<div class="s-gp s-cd"><div class="s-ds"><span class="s-ico">' +
          ic('swap', 'l') +
          '</span><div style="flex:1;min-width:0"><h3>Only in the desktop app</h3><p class="hint" style="margin-top:6px">Import and export work on the folder of the program, which only the desktop app has. Open BMS Cards.exe to use them.</p></div></div></div>')
  );
  if (!isDesktop()) return;
  if (S.view !== 'done') Object.assign(S, { view: 'idle', err: '', src: null, desc: null, pick: {}, pol: 'replace' });
  if (X.view !== 'running') Object.assign(X, { view: 'idle', err: '', res: null });

  const $i = () => host.querySelector('#imp'),
    $e = () => host.querySelector('#exp');
  const curMissions = app => (ST.CFG.paths && ST.CFG.paths.missions) || join(app, 'missions');

  // ---------------- import
  const idleHtml = () =>
    '<div class="s-ap s-ds"><span class="s-ico">' +
    ic('imp', 'l') +
    '</span><div style="flex:1;min-width:0"><h3>Import from another version</h3>' +
    '<p class="hint" style="margin-top:6px">Bring your settings, squadrons, missions and kneeboard cards from an older BMS Cards. Choose its program folder (the one with BMS-Cards.exe) or a backup file. The older folder is never changed.</p>' +
    (S.err ? errHtml(S.err) : '') +
    (S.busy
      ? '<div class="s-st nf" role="status" style="margin-top:14px">Reading…</div>'
      : '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"><button type="button" class="btn" data-a="pickfolder">Choose folder…</button><button type="button" class="btn g" data-a="pickfile">Choose backup file…</button></div>') +
    infoLine(
      'Close the older version first and use only one version from now on: your squadron identity is copied too.'
    ) +
    '</div></div>';

  const itemHtml = it => {
    const off = !!it.problem || !!it.same,
      on = !!S.pick[it.k];
    return (
      '<div class="s-li"><button type="button" role="checkbox" class="s-cb' +
      (on ? ' on' : '') +
      '" aria-checked="' +
      on +
      '" aria-label="' +
      esc(it.title) +
      '" data-a="pick" data-k="' +
      it.k +
      '"' +
      (off ? ' disabled' : '') +
      '>' +
      ic('check', 's') +
      '</button><div class="tx"><div style="font-weight:600">' +
      esc(it.title) +
      '</div><div class="hint">' +
      esc(it.detail) +
      '</div></div>' +
      (it.chip ? '<span class="s-ch ' + it.chip[0] + '">' + esc(it.chip[1]) + '</span>' : '') +
      '<span class="hint sz">' +
      esc(fmtSize(it.size)) +
      '</span>' +
      (it.problem ? '<div class="s-pr">' + esc(it.problem) + '</div>' : '') +
      '</div>'
    );
  };
  const polText = () =>
    S.pol === 'replace'
      ? 'Imported items replace the ones here. Whatever is replaced is first saved in backup\\before-import-' +
        dateStamp() +
        '.'
      : 'Items you already have here stay as they are; only what is missing is added.';
  const nPicked = () => Object.values(S.pick).filter(Boolean).length;
  const startLabel = () => (nPicked() === 1 ? 'Import 1 item' : 'Import ' + nPicked() + ' items');
  const reviewHtml = () =>
    '<div class="s-ap"><h3>Import from another version</h3><div class="s-src">' +
    ic('folder') +
    '<span class="s-mono" style="flex:1 1 180px;min-width:0">' +
    esc(S.label) +
    '</span><span class="s-ch ok">' +
    esc(S.chip) +
    '</span><button type="button" class="btn g sm" data-a="back">Change…</button></div>' +
    '<p class="hint" style="margin:14px 0 8px">Found here. Choose what to bring:</p><div class="s-lst" id="items">' +
    S.desc.items.map(itemHtml).join('') +
    '</div>' +
    (S.desc.unsafe
      ? '<p class="hint" style="margin-top:8px">' +
        plural(S.desc.unsafe, 'entry', 'entries') +
        ' of the file with an unsafe name was left out.</p>'
      : '') +
    '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:16px"><span style="font-weight:600">If something exists here</span>' +
    '<div class="s-sg" role="group" aria-label="If something exists here"><button type="button" data-a="pol" data-k="replace" class="' +
    (S.pol === 'replace' ? 'on' : '') +
    '">Use imported</button><button type="button" data-a="pol" data-k="keep" class="' +
    (S.pol === 'keep' ? 'on' : '') +
    '">Keep mine</button></div></div><p class="hint" id="pol" style="margin-top:8px">' +
    esc(polText()) +
    '</p>' +
    infoLine(
      'Not carried over: the copies of the map picture and a few view choices kept in the browser storage. They are rebuilt automatically.'
    ).replace('margin-top:12px', 'margin-top:10px') +
    '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px"><button type="button" class="btn g" data-a="back">Back</button><button type="button" class="btn" id="go" data-a="start"' +
    (nPicked() ? '' : ' disabled') +
    '>' +
    startLabel() +
    '</button></div></div>';
  const runHtml = () =>
    '<div class="s-ap"><h3>Importing…</h3><p class="hint" id="stage" style="margin:6px 0 14px">' +
    esc((S.prog && S.prog.stage) || '') +
    '</p>' +
    bar('ibar', 'Import progress', 0) +
    '<p class="hint" id="pct" style="margin-top:8px">0%</p></div>';
  const doneHtml = () => {
    const r = DONE.res,
      okN = r.rows.filter(x => x.state === 'done').length,
      problem = r.errors.length > 0 || r.rows.some(x => x.state === 'failed'),
      what = DONE.kind === 'zip' ? 'The backup file' : 'The older folder',
      icon = { done: ic('check', 's'), kept: ic('info', 's'), failed: ic('warn', 's') };
    return (
      '<div class="s-ap s-dn"><div style="display:flex;align-items:center;gap:12px"><span class="' +
      (okN || !problem ? 's-okc' : 's-badc') +
      ' s-pop">' +
      ic(okN || !problem ? 'check' : 'warn', 'l') +
      '</span><div><h3>' +
      (problem ? 'Import finished with problems' : okN ? 'Import complete' : 'Nothing to change') +
      '</h3><p class="hint" style="margin-top:2px">' +
      esc(
        okN
          ? plural(okN, 'item') + ' brought from ' + (DONE.kind === 'zip' ? 'the backup file' : 'the older folder')
          : 'Nothing was copied.'
      ) +
      '</p></div></div><div class="s-lst" style="margin-top:14px">' +
      r.rows
        .map(
          (x, i) =>
            '<div class="s-li" style="animation-delay:' +
            (80 + i * 90) +
            'ms"><span style="color:' +
            (x.state === 'done' ? 'var(--ac)' : x.state === 'failed' ? 'var(--warn)' : 'var(--mu)') +
            ';display:inline-flex">' +
            icon[x.state] +
            '</span><span style="font-weight:600">' +
            esc(x.title) +
            '</span><span class="hint" style="flex:1 1 140px;min-width:0">' +
            esc(x.detail) +
            '</span></div>'
        )
        .join('') +
      '</div>' +
      (r.errors.length
        ? '<div class="s-err" role="alert">' +
          ic('warn', 's') +
          '<div>Some files could not be copied:<ul>' +
          r.errors
            .slice(0, 5)
            .map(x => '<li>' + esc(x.file) + ': ' + esc(x.error) + '</li>')
            .join('') +
          (r.errors.length > 5 ? '<li>and ' + (r.errors.length - 5) + ' more</li>' : '') +
          '</ul></div></div>'
        : '') +
      (r.safety
        ? '<p class="hint" style="margin-top:12px">What was replaced is saved in ' + mono(r.safety) + '.</p>'
        : '') +
      '<p class="hint" style="margin-top:' +
      (r.safety ? '6' : '12') +
      'px">' +
      what +
      ' was not changed.' +
      (r.changed ? ' Restart BMS Cards to use the imported data.' : '') +
      '</p><div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px"><button type="button" class="btn g" data-a="dismiss">Close</button>' +
      (r.changed ? '<button type="button" class="btn" data-a="restart">Restart now</button>' : '') +
      '</div></div>'
    );
  };
  const VIEWS = { review: reviewHtml, running: runHtml, done: doneHtml };
  const drawImport = () => {
    $i().innerHTML = (VIEWS[S.view] || idleHtml)();
  };
  const paintImport = () => {
    const p = S.prog || { done: 0, total: 1, stage: '' },
      pct = Math.round((100 * p.done) / Math.max(1, p.total)),
      b = host.querySelector('#ibar');
    if (!b) return;
    b.firstChild.style.width = pct + '%';
    b.setAttribute('aria-valuenow', pct);
    host.querySelector('#stage').textContent = p.stage;
    host.querySelector('#pct').textContent = pct + '%';
  };

  // reads what a folder or a file holds and shows it; `get` gives { src, label, chip } (or nothing: the pilot cancelled)
  async function intake(get) {
    if (S.busy) return;
    S.busy = true;
    S.err = '';
    hooks.busy(true);
    drawImport();
    try {
      const r = await get();
      if (r) {
        const desc = await describeSource(r.src, { missionsDir: curMissions(await appDir()) });
        if (!desc.items.length) throw new Fail('There is nothing to import in ' + r.label + '.');
        Object.assign(S, {
          view: 'review',
          src: r.src,
          desc,
          label: r.label,
          chip: r.chip(desc),
          pol: 'replace',
          pick: Object.fromEntries(desc.items.map(it => [it.k, !it.problem && !it.same])),
        });
      }
    } catch (e) {
      S.err = e instanceof Fail ? e.message : msg(e);
    }
    S.busy = false;
    hooks.busy(false);
    drawImport();
  }
  async function chooseFolder() {
    const app = await appDir();
    const dir = await pickFolder({ title: 'Choose the folder of the older BMS Cards', startDir: dirOf(app) });
    if (!dir) return;
    await intake(async () => {
      const r = await findProgramFolder(dataIo(), dir, app);
      if (r.error === 'self')
        throw new Fail('This is the folder of the program you are using now. Choose the folder of the older version.');
      if (r.error === 'none')
        throw new Fail(
          'No data of BMS Cards was found in ' +
            dir +
            '. Choose the program folder of the older version (the one with BMS-Cards.exe).'
        );
      if (r.error === 'several')
        throw new Fail(
          'Several folders with data of BMS Cards were found in ' +
            dir +
            ': ' +
            r.options.join(', ') +
            '. Choose the one you want to import.'
        );
      return { src: await sourceFromFolder(dataIo(), r.dir), label: r.dir, chip: () => 'Older BMS Cards' };
    });
  }
  async function chooseFile() {
    const f = await pickFile({ exts: ['zip'], title: 'Choose a backup file', startDir: dirOf(await appDir()) });
    if (!f) return;
    await intake(async () => {
      const src = sourceFromZip(new Uint8Array(await f.arrayBuffer()), f.path || f.name);
      return {
        src,
        label: f.path || f.name,
        chip: d =>
          d.manifest && d.manifest.appVersion ? 'Backup of BMS Cards ' + d.manifest.appVersion : 'Backup file',
      };
    });
  }
  async function startImport() {
    const picks = Object.keys(S.pick).filter(k => S.pick[k]);
    if (!picks.length || S.busy) return;
    Object.assign(S, { view: 'running', busy: true, prog: { done: 0, total: 1, stage: 'Starting…' } });
    hooks.busy(true);
    drawImport();
    try {
      const app = await appDir();
      await flushAll(); // what the pages still hold back is written first, so the copy of what is replaced is complete
      const res = await runImport({
        io: dataIo(),
        src: S.src,
        appDir: app,
        picks,
        policy: S.pol,
        cur: { config: ST.CFG, missionsDir: curMissions(app) },
        progress: p => {
          S.prog = p;
          paintImport();
        },
      });
      // the program holds the old state of what was replaced: it must not write it back
      if (res.written.length) {
        freezeFiles(res.written);
        if (res.written.includes('cardmemory')) kbMemFreeze();
      }
      DONE = { res, label: S.label, kind: S.src.kind };
      S.view = 'done';
      hooks.imported(res);
    } catch (e) {
      S.view = 'idle';
      S.err = 'The import stopped: ' + msg(e) + '. Some files may be copied already; the older folder was not changed.';
    }
    S.busy = false;
    hooks.busy(false);
    drawImport();
  }
  async function restart() {
    try {
      const m = await import('./mission.js');
      if (
        m.unsaved() &&
        !(await confirm('There are changes not saved in a mission (and not written to the DTC). Restart anyway?'))
      )
        return;
    } catch (e) {
      /* the question is only a help */
    }
    try {
      await flushAll();
    } catch (e) {
      /* nothing waits */
    }
    location.reload();
  }

  // ---------------- export
  const exName = () => 'BMS-Cards-backup-' + dateStamp() + '.zip';
  const exIdle = () =>
    '<div class="s-ap s-ds"><span class="s-ico">' +
    ic('exp', 'l') +
    '</span><div style="flex:1;min-width:0"><h3>Export my data</h3><p class="hint" style="margin-top:6px">Save everything that makes this copy yours in one file: settings, squadrons, missions, kneeboard cards and the backups of your original DTC and kneeboard files. Use it as a backup, or to move to another PC.</p>' +
    (X.err ? errHtml(X.err) : '') +
    '<div style="margin-top:14px"><button type="button" class="btn g" data-a="export">Export…</button></div></div></div>';
  const exRun = () =>
    '<div class="s-ap"><h3>Exporting…</h3><p class="hint" id="xstage" style="margin:6px 0 14px">' +
    esc(X.stage) +
    '</p>' +
    bar('xbar', 'Export progress', 0) +
    '</div>';
  const exDone = () =>
    '<div class="s-ap" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><span class="s-okc s-pop">' +
    ic('check', 'l') +
    '</span><div style="flex:1;min-width:200px"><h3>Backup saved</h3><p class="hint" style="margin-top:2px">' +
    esc(X.res.name) +
    ' · ' +
    esc(fmtSize(X.res.size)) +
    ' · in ' +
    mono(X.res.dir) +
    '</p>' +
    (X.res.errors.length
      ? '<p class="hint" style="margin-top:6px;color:var(--warn)">' +
        plural(X.res.errors.length, 'file') +
        ' could not be read and is not in the backup: ' +
        esc(
          X.res.errors
            .slice(0, 3)
            .map(x => x.file)
            .join(', ')
        ) +
        (X.res.errors.length > 3 ? ' …' : '') +
        '</p>'
      : '') +
    '</div><button type="button" class="btn g" data-a="again">Export again</button></div>';
  const drawExport = () => {
    $e().innerHTML = X.view === 'running' ? exRun() : X.view === 'done' ? exDone() : exIdle();
  };
  async function exportAll() {
    Object.assign(X, { view: 'running', err: '', pct: 0, stage: 'Packing your data into ' + exName() });
    hooks.busy(true);
    drawExport();
    try {
      const app = await appDir();
      await flushAll(); // the pages hand over what still waits: the backup is up to date
      const r = await buildBackup({
        io: dataIo(),
        appDir: app,
        version: APP_VERSION,
        progress: p => {
          const b = host.querySelector('#xbar'),
            pct = Math.round((100 * p.done) / Math.max(1, p.total));
          if (b) {
            b.firstChild.style.width = pct + '%';
            b.setAttribute('aria-valuenow', pct);
          }
        },
      });
      const xs = host.querySelector('#xstage');
      if (xs) xs.textContent = 'Choose where to save the file…';
      const path = await saveFileBytes(r.bytes, r.name, '');
      if (!path) X.view = 'idle';
      else
        Object.assign(X, {
          view: 'done',
          res: { name: path.split(/[\\/]/).pop(), dir: dirOf(path), size: r.bytes.length, errors: r.errors },
        });
    } catch (e) {
      X.view = 'idle';
      X.err = 'The backup could not be saved: ' + msg(e);
    }
    hooks.busy(false);
    drawExport();
  }

  host.onclick = e => {
    const b = e.target.closest('[data-a]');
    if (!b || b.disabled || !host.contains(b)) return;
    const a = b.dataset.a;
    if (a === 'pickfolder') chooseFolder().catch(x => fail(x));
    else if (a === 'pickfile') chooseFile().catch(x => fail(x));
    else if (a === 'back') {
      Object.assign(S, { view: 'idle', err: '', src: null, desc: null });
      drawImport();
    } else if (a === 'dismiss') {
      S.view = 'idle';
      drawImport();
    } else if (a === 'pick') {
      S.pick[b.dataset.k] = !S.pick[b.dataset.k];
      b.classList.toggle('on', S.pick[b.dataset.k]);
      b.setAttribute('aria-checked', String(S.pick[b.dataset.k]));
      const go = host.querySelector('#go');
      go.disabled = !nPicked();
      go.textContent = startLabel();
    } else if (a === 'pol') {
      S.pol = b.dataset.k;
      b.parentNode.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      host.querySelector('#pol').textContent = polText();
    } else if (a === 'start') startImport();
    else if (a === 'restart') restart();
    else if (a === 'export') exportAll();
    else if (a === 'again') {
      X.view = 'idle';
      drawExport();
    }
  };
  const fail = x => {
    S.busy = false;
    S.err = msg(x);
    hooks.busy(false);
    drawImport();
  };
  drawImport();
  drawExport();
}
