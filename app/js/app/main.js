// Entry point of the program: the modules (js/app) hold the code that used to sit in index.html; this runs their start-up statements in the original order.
import {init1} from './base.js';
import {init2} from './dtcfile.js';
import {init3} from './mission.js';
import {init4} from './datacard.js';
import {init5} from './cardview.js';
import {init6, init9, init11, init13} from './pages.js';
import {init7} from './ato.js';
import {init8} from './dtctargets.js';
import {init10} from './gamefiles.js';
import {init12} from './perf.js';
import {init14} from './campaign.js';
import {init15} from './editor.js';
import {init16} from './gamedata.js';
import {init17} from './kneeboard.js';
import {init18} from './settings.js';
import {init19} from './expose.js';
import {APP_VERSION} from '../core/version.js';

// start-up: a bar over the program says how far it is; the program cannot be used (no mission or campaign to open) until every step has run
const steps = [init1, init2, init3, init4, init5, init6, init7, init8, init9, init10, init11, init12, init13, init14, init15, init16, init17, init18, init19];
const boot = document.getElementById('boot'), bar = document.getElementById('bootbar'), msg = document.getElementById('bootmsg');
const show = (n) => { if (bar) bar.style.width = Math.round(n / steps.length * 100) + '%'; if (msg) msg.textContent = 'Loading tables and campaigns… ' + Math.round(n / steps.length * 100) + '%'; };
for (const id of ['bootver', 'appver']) { const e = document.getElementById(id); if (e) e.textContent = 'v' + APP_VERSION; }
show(0);
try {
  for (let i = 0; i < steps.length; i++) { await steps[i](); show(i + 1); }
} catch (e) {
  if (msg) { msg.textContent = 'The program could not start: ' + (e && e.message || e); msg.style.color = '#e55'; }
  throw e;
}
if (boot) boot.remove();
