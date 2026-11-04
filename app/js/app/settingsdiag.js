// The page Diagnostics of the Settings window: what the program found in the BMS folder (GAMEDATA, app/js/app/gamedata.js) and where it keeps its own files.
import { APP_VERSION } from '../core/version.js';
import { GAMEDATA } from './gamedata.js';
import { esc } from './base.js';
import { chip, ic, top } from './settingsui.js';

const kv = (k, v) => '<div class="s-kv"><span class="k">' + k + '</span><span class="v">' + v + '</span></div>';
const mono = t => '<span class="s-mono">' + esc(t) + '</span>';

/** How many warnings the game data reading has (shown on the entry of the list) */
export const warnCount = () => ((GAMEDATA && GAMEDATA.warn) || []).length;

/**
 * The page, without its frame (the frame stays, so the page does not appear again when it is drawn again).
 * @param {{dir?:string, ok?:boolean, why?:string, loc?:string, desktop?:boolean}} prog the folder of the program and the file of the settings
 * @param {boolean} reportOpen the full report is open
 */
export function diagInner(prog, reportOpen) {
  const g = GAMEDATA || {},
    info = g.info,
    warn = g.warn || [];
  let h = top('diag', 'Diagnostics', 'What the program found in your BMS folder, and where it keeps its own files.');
  if (warn.length)
    h +=
      '<div class="s-wb" id="cfgwarn"><div class="s-wt">' +
      ic('warn') +
      warn.length +
      (warn.length === 1 ? ' warning' : ' warnings') +
      '</div><ul>' +
      warn.map(w => '<li>' + esc(w) + '</li>').join('') +
      '</ul></div>';
  else if (info) h += '<div class="s-wb good"><div class="s-wt">' + ic('check') + 'No warnings</div></div>';

  h += '<h3 class="s-gt"' + (warn.length || info ? ' style="margin-top:20px"' : '') + '>Program</h3><div class="s-gp">';
  h += kv('Version', esc(APP_VERSION));
  if (prog.desktop)
    h += kv(
      'Program folder',
      mono(prog.dir || '') +
        (prog.ok
          ? chip('ok', 'Writable', 'check')
          : chip('wn', 'Cannot be written', 'warn') +
            (prog.why ? '<span class="hint" style="flex-basis:100%">' + esc(prog.why) + '</span>' : ''))
    );
  else h += kv('Program folder', 'None: this is the browser version, the settings are kept in the browser.');
  h += kv('Settings saved in', mono(prog.loc || ''));
  h += '</div>';

  h += '<h3 class="s-gt">Game</h3><div class="s-gp">';
  if (info) {
    const b = info.bms,
      f = info.files,
      rw = info.runways,
      ac = info.aircraft;
    h += kv(
      'Falcon BMS',
      esc(b.version || 'Version not available') +
        (b.level === 'ok'
          ? chip('ok', 'Checked version', 'check')
          : b.level === 'newer'
            ? chip('wn', 'Newer than ' + b.tested)
            : b.level === 'other'
              ? chip('wn', 'Not checked with this version')
              : chip('mu', 'Not checked')) +
        (b.note && b.level !== 'ok' && b.level !== 'newer' && b.level !== 'other'
          ? '<span class="hint" style="flex-basis:100%">' + esc(b.note) + '</span>'
          : '')
    );
    h += kv('Theater', esc(info.theater || 'Not read'));
    const pct = f.total ? Math.round((100 * f.found) / f.total) : 0;
    h += kv(
      'Game data',
      f.found +
        ' of ' +
        f.total +
        ' files found<span class="s-pbm" aria-hidden="true"><i style="width:' +
        pct +
        '%"></i></span>' +
        (f.missing.length ? chip('wn', f.missing.length + ' not found') : '') +
        (f.errors.length ? chip('wn', f.errors.length + ' could not be read') : '')
    );
    h += kv(
      'Runways',
      rw.error
        ? chip('wn', 'Could not be read')
        : rw.airbases
          ? rw.airbases +
            ' airbases · ' +
            rw.atc +
            ' ATC files' +
            (rw.aip === 'missing' ? chip('wn', 'AIP not found') : '')
          : chip('wn', 'Not found')
    );
    h += kv(
      'Aircraft data',
      ac.found
        ? ac.files + ' aircraft files' + chip('ok', 'OK', 'check')
        : chip('wn', ac.error ? 'Could not be read' : 'Not found')
    );
  } else h += kv('Game data', esc(g.status || 'Not read yet'));
  h += '</div>';

  h +=
    '<div style="margin-top:14px"><button type="button" class="btn g sm" data-a="report" aria-expanded="' +
    !!reportOpen +
    '" style="display:inline-flex;align-items:center;gap:6px"><svg class="s-cv' +
    (reportOpen ? ' open' : '') +
    '" viewBox="0 0 24 24" aria-hidden="true"><polyline points="9 6 15 12 9 18"/></svg>Full report</button>' +
    '<div class="s-xp' +
    (reportOpen ? ' open' : '') +
    '" id="cfgreport"><div><p class="s-report s-mono">' +
    esc(g.status || '') +
    '</p></div></div></div>';
  return h;
}
