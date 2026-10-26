// Data Cartridge page: vertical list of sections, each one a page of cards. A card is read-only until its "Edit" button is pressed.
// Everything here edits the lines of the open DTC (deps.S) and tells the rest of the program (deps.changed) so the map and the datacard follow.
import { STPT_RANGE } from './mapdtc.js';
export const SECTIONS = [
  ['stpt', 'Steerpoints'],
  ['tgt', 'Targets'],
  ['ews', 'EWS'],
  ['com', 'Comms & Nav'],
  ['iff', 'IFF'],
  ['l16', 'Link 16'],
  ['sys', 'Systems'],
  ['mfd', 'MFD'],
  ['harm', 'HARM'],
  ['wpn', 'Weapons'],
  ['nav', 'Nav offsets'],
];
// which page shows each section of the ini (everything else goes to "Other")
const SEC_OF = {
  STPT: 'stpt',
  EWS: 'ews',
  Radio: 'com',
  COMMS: 'com',
  IFF: 'iff',
  LINK16: 'l16',
  ICP: 'sys',
  Laser: 'sys',
  MFD: 'mfd',
  Bullseye: 'mfd',
  HARM: 'harm',
  FCC_AGB: 'wpn',
  'NAV OFFSETS': 'nav',
  FCC_AIM: 'wpn',
  FCC_AGM: 'wpn',
  MAP_POP: 'nav',
};
// keys that a page shows itself; the others of the same section are listed in "Other"
const COV = {
  STPT: /./,
  EWS: /./,
  LINK16: /./,
  Laser: /./,
  MFD: /./,
  Bullseye: /./,
  HARM: /./,
  FCC_AGB: /./,
  FCC_AIM: /./,
  FCC_AGM: /./,
  MAP_POP: /./,
  Radio: /^((UHF|VHF)(_COMMENT)?_\d+|ILS(_COMMENT)?_\d+)$/,
  COMMS: /^(Comm[12](_Comment)?|TACAN (Channel|Band|Domain)|ILS (Frequency|CRS))$/,
  IFF: /^(Mode\w+ (On|Code|Key)|AutoChange|TIME \d+ \w+( \w+)?|POS \d+ \w+)$/,
  ICP: /^(MasterMode|Alow AGL|Alow MSL|Alow TFAdv|Manual Wingspan|Bingo_Fuel)$/,
  'NAV OFFSETS': /^(Modesel|VIP|VIPPUP|VRP|VRPPUP|OA\d-\d+)$/,
};
import { ewsEvents, ewsSummary, createEwsFx } from './ewsfx.js';
import { readTarget, targetLine } from './targets.js';
import { openTargetPicker } from './targetpicker.js';
export const pageOf = s => SEC_OF[s] || 'raw';
const L16 = [
  ['MISSION_CHANNEL', 'Mission channel'],
  ['FIGHTER_CHANNEL', 'Fighter channel'],
  ['SPECIAL_CHANNEL', 'Special channel'],
  ['VOICE_GROUP_A_CHANNEL', 'Voice group A'],
  ['VOICE_GROUP_B_CHANNEL', 'Voice group B'],
  ['CALLSIGN', 'Callsign'],
  ['CALLSIGN_NUMBER', 'Callsign number'],
  ['FLIGHT_LEAD', 'Flight lead'],
  ['EXT_TIME_REFERENCE', 'External time reference'],
  ['TACAN_CHANNEL', 'TACAN channel'],
  ['TACAN_BAND', 'TACAN band'],
  ['FLIGHT_1_STN', 'Flight 1 STN'],
  ['FLIGHT_2_STN', 'Flight 2 STN'],
  ['FLIGHT_3_STN', 'Flight 3 STN'],
  ['FLIGHT_4_STN', 'Flight 4 STN'],
  ['TEAM_1_STN', 'Team 1 STN'],
  ['TEAM_2_STN', 'Team 2 STN'],
  ['TEAM_3_STN', 'Team 3 STN'],
  ['TEAM_4_STN', 'Team 4 STN'],
  ...[1, 2, 3, 4, 5, 6, 7, 8].map(n => ['DONOR_' + n + '_STN', 'Donor ' + n + ' STN']),
];
const STPT_TYPES = {
  0: 'Nav',
  1: 'TakeOff',
  2: 'Push',
  3: 'Split',
  4: 'Refuel',
  7: 'Land',
  8: 'Holding',
  14: 'GndStrike',
}; // inferred from the files seen so far
// MFD page codes of the DTC (decoded from files saved by WDP): the 3 slots are stored in reverse order (file slot 2 = first button on screen) and csel is the file slot that is selected
const MFD_PG = [
  [5, 'DTE'],
  [11, 'FCR'],
  [6, 'FLCS'],
  [3, 'FLIR'],
  [16, 'HAD'],
  [10, 'HSD'],
  [14, 'HUD'],
  [13, 'RWR'],
  [12, 'SMS'],
  [9, 'TCN'],
  [4, 'TEST'],
  [2, 'TFR'],
  [8, 'TGP'],
  [7, 'WPN'],
];
const MFD_NAME = new Map(MFD_PG.map(([c, n]) => [c, n]));
const MFD_MODES = ['A-G', 'A-A', 'NAV', 'MSL OVRD', 'DGFT OVRD', 'S-J'];
// HARM threat codes (ALIC codes of the BMS manual): [code, name, symbol, group]
const THREATS = [
  [102, 'SA2', '2', 'SAM'],
  [103, 'SA3', '3', 'SAM'],
  [104, 'SA4', '4', 'SAM'],
  [105, 'SA5', '5', 'SAM'],
  [106, 'SA6', '6', 'SAM'],
  [110, 'SA10', '10', 'SAM'],
  [111, 'SA11', '11', 'SAM'],
  [117, 'SA17', '17', 'SAM'],
  [130, 'HAWK', 'H', 'SAM'],
  [692, 'AAA', 'AAA', 'SAM'],
  [801, 'SEARCH', 'S', 'SAM'],
  [99, 'UNKNOWN', 'U', 'SAM'],
  [202, 'FAN SONG', '2T', 'FCR'],
  [203, 'LOW BLOW', '3T', 'FCR'],
  [204, 'PAT HAND', '4T', 'FCR'],
  [205, 'SQUARE PAIR', '5T', 'FCR'],
  [206, 'STRAIGHT FLUSH', '6T', 'FCR'],
  [608, 'SA8', '8', 'FCR'],
  [210, 'FLAPLID', '10T', 'FCR'],
  [211, 'FIREDOME', '11T', 'FCR'],
  [615, 'SCRUMHALF', '15', 'FCR'],
  [217, 'CHAIRBACK', '17T', 'FCR'],
  [619, 'HOTSHOT', '19', 'FCR'],
  [693, 'AN/MPQ-53', 'P', 'FCR'],
  [230, 'AN/MPQ-46', 'HT', 'FCR'],
  [696, 'NIKE', 'N', 'FCR'],
  [695, 'SKYGUARD', 'SKY', 'FCR'],
  [402, 'SPOON REST', '2A', 'EWR'],
  [403, 'FLATFACE', 'F', 'EWR'],
  [404, 'LONG TRACK', '4A', 'EWR'],
  [405, 'BARLOCK', '5A', 'EWR'],
  [609, 'DOGEAR', 'D', 'EWR'],
  [410, 'BIGBIRD', '10A', 'EWR'],
  [411, 'SNOWDRIFT 11A', '11A', 'EWR'],
  [417, 'SNOWDRIFT 17A', '17A', 'EWR'],
  [430, 'AN/MPQ-50', 'HA', 'EWR'],
];
const THR = new Map(THREATS.map(t => [t[0], t]));
const ICO = {
  save: '<svg width="14" height="14" viewBox="0 0 16 16" class="mpic" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M2 2h9l3 3v9H2z"/><path d="M5 2v4h5V2M4.5 14V9h7v5"/></svg>',
  trash:
    '<svg width="13" height="13" viewBox="0 0 16 16" class="mpic" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4M6.8 6.5v5M9.2 6.5v5"/></svg>',
};
export { ICO };

export function createDtcPage(deps) {
  const { nav, view, esc } = deps,
    S = deps.S,
    G = deps.G;
  let cur = 'stpt',
    OPEN = new Set(),
    SYNC = {},
    q = '',
    IFFPOS = 0,
    IFFTIM = 0,
    EWSP = 0,
    FX = null,
    EWSM = 0,
    EWSH = 0,
    HPICK = '0:0',
    HFILT = 'all';
  try {
    cur = sessionStorage.getItem('dtcpage') || cur;
    EWSM = +sessionStorage.getItem('ewsm') || 0;
  } catch (e) {
    /* no storage */
  }
  if (!SECTIONS.some(x => x[0] == cur)) cur = 'stpt';
  const lines = () => deps.lines(),
    has = () => lines().length > 0;
  const val = (s, k) => G(s, k, ''),
    exists = (s, k) => lines().some(l => l.s == s && l.k === k);
  const secOn = s => lines().some(l => l.s == s && l.k !== undefined);
  // a number written the way the file already has it (6 decimals like "400.000000", or a plain integer)
  const like = (old, n) => (/\./.test(String(old)) ? (+n).toFixed(6) : String(Math.round(+n)));
  const num = x => {
    const n = +String(x).trim().replace(',', '.');
    return String(x).trim() === '' || isNaN(n) ? null : n;
  };
  const anim = () => deps.anim && deps.anim();
  const dirtyBy = () => {
    const o = {};
    lines().forEach(l => {
      if (l.dirty && l.s) o[pageOf(l.s)] = 1;
    });
    return o;
  };

  // ---- small pieces of markup ------------------------------------------------------------------
  const attrs = (s, k) => `data-s="${esc(s)}" data-k="${esc(k)}"`;
  const row = (label, inner, unit) =>
    `<div class="drow"><label>${label}</label>${inner}<span class="du">${unit || ''}</span></div>`;
  const plain = v => {
    const n = num(v);
    return n === null ? v : String(Math.round(n * 100) / 100);
  };
  const FMT = {
    int: plain,
    mhz: v => (v === '' ? '' : (+v / 1000).toFixed(3)),
    ils: v => (v === '' ? '' : (+v / 100).toFixed(2)),
    sec: v => (v === '' ? '' : (+v / 100).toFixed(2)),
  };
  const disp = (t, v) => (FMT[t] && v !== '' ? FMT[t](v) : v);
  const inp = (s, k, o = {}) => {
    const v = val(s, k),
      sh = disp(o.t, v);
    return `<input ${attrs(s, k)} data-t="${o.t || 'txt'}" data-o="${esc(sh)}" value="${esc(sh)}"${o.w ? ` style="width:${o.w}px"` : ''}${exists(s, k) || o.make ? '' : ' placeholder="—"'}>`;
  };
  const seg = (s, k, opts) => {
    const v = String(val(s, k)).trim();
    return `<span class="dseg">${opts.map(([a, t]) => `<button type="button" ${attrs(s, k)} data-v="${esc(String(a))}" class="${v === String(a) ? 'on' : ''}">${t}</button>`).join('')}</span>`;
  };
  const onoff = (s, k) =>
    seg(s, k, [
      [1, 'On'],
      [0, 'Off'],
    ]);
  const card = (id, title, body, o = {}) =>
    `<div class="dcard${OPEN.has(o.ok || id) || o.live ? '' : ' ro'}${o.full ? ' full' : ''}${o.cls ? ' ' + o.cls : ''}" data-card="${id}"><h3>${title}<span class="sp"></span>${o.right || ''}${o.sync ? `<button type="button" class="dsw${SYNC[o.sync] ? ' on' : ''}" data-sync="${o.sync}" title="${esc(o.syncTip || 'Keep these values equal to the ones of the Datacard: what you type in the Datacard is written into the DTC')}"><i></i>from Datacard</button>` : ''}${o.noedit ? '' : `<button type="button" class="btn g sm dpen" data-edit="${id}">${OPEN.has(id) ? '✔ Done' : '✎ Edit'}</button>`}</h3>${body}${o.hint ? `<div class="hint">${o.hint}</div>` : ''}</div>`;
  const absent = (what, sec) =>
    `<div class="hint">${what} is not in this file${sec ? ' (section [' + sec + '])' : ''}.</div>`;
  const head = (t, sub, right) =>
    right
      ? `<div class="dtophead"><div><h2>${t}</h2><p class="dsub">${sub}</p></div>${right}</div>`
      : `<h2>${t}</h2><p class="dsub">${sub}</p>`;
  // blue buttons that keep the values of a page as your default and put them back into any file
  const defBtn = g => {
    const d = deps.dtcDef;
    return `<span class="mfdbtn"><button type="button" class="btn g bl sm${d.same(g) ? ' nil' : ''}" data-def="${g}:save" title="Keep these values as your default">${ICO.save} Save as default</button><button type="button" class="btn g bl sm${!d.has(g) || d.same(g) ? ' nil' : ''}" data-def="${g}:load" title="Put your default values into this file">Load default</button></span>`;
  };
  const DEFN = { mfd: 'MFD pages', ews: 'EWS programs', harm: 'HARM threat tables' };

  // ---- pages -----------------------------------------------------------------------------------
  const ownTag = o => (o ? `<span class="dtag" title="From the campaign / Datacard">${esc(o)}</span>` : '');
  const pages = {
    stpt() {
      const P = deps.points(),
        rt = deps.route().filter(s => s.n < 30);
      let h = head(
        'Steerpoints',
        'The points of the DTC, also on the Map. Lines show where they come from when an AUTO button made them.'
      );
      const fp = deps.flight(),
        ft = deps.FT_KM;
      const cp = t =>
        t
          .replace(/° /g, '°')
          .replace(/'/g, '')
          .replace('  ', ' ')
          .replace(/^([NS]) /, '$1')
          .replace(/ ([EW]) /, ' $1');
      // the flight plan is never editable: it is the flight picked in the Datacard (campaign) or, without one, the route points saved in the file
      let rows = fp,
        ttl = fp.length ? 'Flight plan · STPT 1-' + fp.length + ' · ' + esc(fp.cs) : '';
      if (!fp.length && rt.length) {
        ttl = 'Flight plan in the file · STPT 1-' + rt.length;
        rows = rt.map((s, i) => {
          const q = rt[i - 1],
            dN = q ? s.x - q.x : 0,
            dE = q ? s.y - q.y : 0;
          return {
            n: s.n + 1,
            name: STPT_TYPES[s.t] || '#' + s.t,
            pos: deps.ll(+s.x, +s.y),
            alt: s.alt,
            hdg: q ? String((Math.round((Math.atan2(dE, dN) * 180) / Math.PI) + 360) % 360).padStart(3, '0') + '°' : '',
            dist: q ? (Math.hypot(dN, dE) / 6076.12).toFixed(1) : '',
            spd: '',
            form: '',
          };
        });
      }
      h +=
        '<div class="dgrid one">' +
        (rows.length
          ? card(
              'fplan',
              ttl,
              `<table class="dt"><tr><th>STPT</th><th>Type</th><th>Position</th><th>Alt (ft)</th><th>Hdg</th><th>Dist (NM)</th><th>Spd (kt)</th><th>Formation</th></tr>${rows.map(w => `<tr><td>${w.n}</td><td>${esc(w.name)}</td><td>${w.pos}</td><td>${w.alt}</td><td>${w.hdg}</td><td>${w.dist}</td><td>${w.spd}</td><td>${esc(w.form)}</td></tr>`).join('')}</table>`,
              { full: 1, noedit: 1 }
            )
          : card(
              'fplan',
              'Flight plan',
              '<div class="hint">None in this file: pick a flight in the Datacard (campaign) to see its steerpoints here.</div>',
              { full: 1, noedit: 1 }
            )) +
        '</div>';
      const pos = (g, p) =>
        `<input data-g="${g}" data-slot="${p.slot}" data-f="pos" data-t="txt" value="${esc(cp(deps.ll(p.y * ft, p.x * ft)))}" class="pos">`;
      const pin = (g, p, f, v, t = 'int', w) =>
        `<input data-g="${g}" data-slot="${p.slot}" data-f="${f}" data-t="${t}" value="${esc(v)}"${w ? ` style="width:${w}px"` : ''}>`;
      const del = (g, p) =>
        `<td><button type="button" class="btn g rd sm" data-pdel="${g}:${p.slot}" title="Delete this point">${ICO.trash}</button></td>`;
      const tab = (g, cols, rowf, title, none) => {
        const rs = P ? P[g].filter(p => !p.empty) : [];
        return card(
          't' + g,
          title + ' · ' + rs.length,
          rs.length
            ? `<table class="dt"><tr>${cols.map(c => `<th>${c}</th>`).join('')}<th></th></tr>${rs.map(p => rowf(p)).join('')}</table>`
            : `<div class="hint">${none}</div>`,
          {}
        );
      };
      const au = deps.autoPpt();
      h +=
        '<div class="dgrid two">' +
        tab(
          'prec',
          ['STPT', 'Name', 'Position', 'Alt (ft)'],
          p =>
            `<tr><td>${p.stpt}</td><td>${(n => pin('prec', p, 'name', p.name, 'txt', 150).replace('<input', '<input placeholder="' + (n ? 'near ' + esc(n) : '') + '"'))(deps.nearName && !p.name ? deps.nearName(p.x, p.y) : '')}</td><td>${pos('prec', p)}</td><td>${pin('prec', p, 'alt', p.altFt, 'int', 48)}</td>${del('prec', p)}</tr>`,
          'Precision targets (TGT steerpoint) · STPT ' + STPT_RANGE.prec,
          'None yet. Add them on the Map (DTC menu, bottom left).'
        ) +
        tab(
          'ppt',
          ['STPT', 'Threat', 'Position', 'Range (NM)', ''],
          p =>
            `<tr><td>${p.stpt}</td><td>${pin('ppt', p, 'name', p.name, 'txt', 100)}</td><td>${pos('ppt', p)}</td><td>${pin('ppt', p, 'rng', p.rngNm ? p.rngNm.toFixed(1) : '0', 'dec', 48)}</td><td>${au.has(p.slot) ? '<span class="dtag">AUTO</span>' : ''}</td>${del('ppt', p)}</tr>`,
          'Pre-planned threats (PPT) · STPT ' + STPT_RANGE.ppt,
          'None yet. Add them on the Map (DTC menu, bottom left).'
        ) +
        '</div>';
      const nt = deps.lineNotes(),
        lp = P ? P.line : [];
      const lcard = n => {
        let cnt = 0;
        const rows = [0, 1, 2, 3, 4, 5]
          .map(i => {
            const q = lp.find(z => z.slot == (n - 1) * 6 + i),
              st = 31 + (n - 1) * 6 + i;
            if (q && !q.empty) {
              cnt++;
              return `<div class="lnp"><b>${q.stpt}</b>${pos('line', q)}${pin('line', q, 'alt', q.altFt, 'int', 44)}<button type="button" class="btn g rd sm" data-pdel="line:${q.slot}" title="Delete this point">${ICO.trash}</button></div>`;
            }
            return `<div class="lnp nil"><b>${st}</b><span>—</span></div>`;
          })
          .join('');
        return card('ln' + n, 'Line ' + n + (nt[n] ? ` <span class="dtag">${esc(nt[n])}</span>` : ''), rows, {
          right: `<span class="cnt" title="Points on this line">${cnt}/6</span>`,
        });
      };
      h +=
        '<h3 class="dsubh">Geo lines · STPT ' +
        STPT_RANGE.line +
        '</h3><div class="dgrid four">' +
        [1, 2, 3, 4].map(lcard).join('') +
        '</div>';
      return h;
    },
    tgt() {
      let h = head(
        'Targets',
        'Weapon targets of the DTC, picked from the objectives of the campaign. The elevation is the terrain height under the target (read from the BMS terrain file; 0 when it is not available).'
      );
      const rows = [],
        free = [];
      for (let n = 0; n < 100; n++) {
        if (!exists('STPT', 'wpntarget_' + n)) continue;
        const t = readTarget(val('STPT', 'wpntarget_' + n));
        if (!t) {
          free.push(n);
          continue;
        }
        rows.push(
          `<tr><td>${n + 1}</td><td>${esc(t.name)}</td><td>${deps.ll(t.n, t.e)}</td><td>${t.elv}</td><td class="tact"><button type="button" class="btn g sm" data-tpick="${n}" title="Choose another target for this number">Change</button><button type="button" class="btn g bl sm" data-tstpt="${n}" title="Also keep this target as a TGT steerpoint (STPT ${STPT_RANGE.prec}): it is added to Steerpoints and to the Map">To STPT</button><button type="button" class="btn g rd sm" data-tdel="${n}" title="Clear this target">${ICO.trash}</button></td></tr>`
        );
      }
      const can = !!deps.targetData(),
        nxt = free[0];
      const add = `<div class="tadd"><button type="button" class="btn g sm${can && nxt !== undefined ? '' : ' nil'}" data-tpick="${nxt === undefined ? '' : nxt}">+ Add target</button>${can ? '' : '<span class="hint">Needs the BMS install folder (desktop app, Settings): the objectives are read from it.</span>'}${nxt === undefined ? '<span class="hint">All 100 slots are used.</span>' : ''}</div>`;
      const body =
        (rows.length
          ? `<table class="dt tgt"><tr><th>Wpn TGT</th><th>Name</th><th>Position</th><th>Elv (ft)</th><th></th></tr>${rows.join('')}</table>`
          : '<div class="hint">None set in this file yet.</div>') + add;
      return (
        h +
        '<div class="dgrid one">' +
        card('tgtl', 'Weapon targets · ' + rows.length, body, {
          full: 1,
          live: 1,
          noedit: 1,
          right: rows.length
            ? `<button type="button" class="btn g rd sm tclr" data-tclear="1" title="Clear all targets">Clear all</button>`
            : '',
        }) +
        '</div>'
      );
    },
    ews() {
      let h = head(
        'EWS',
        'Six chaff / flare programs. Burst quantity / interval (ms), salvo quantity / interval (ms).',
        defBtn('ews')
      );
      if (!secOn('EWS')) return h + absent('The EWS setup', 'EWS');
      const cell = (p, t, f) => `<td>${inp('EWS', `PGM ${p} ${t} ${f}`, { t: 'int', w: 58 })}</td>`;
      const t = `<table class="dt"><tr><th rowspan="2">PGM</th><th colspan="4" class="gc">Chaff</th><th colspan="4" class="gf">Flare</th><th rowspan="2">Note</th></tr><tr>${['BQ', 'BI', 'SQ', 'SI', 'BQ', 'BI', 'SQ', 'SI'].map((x, i) => `<th class="${i < 4 ? 'gc' : 'gf'}">${x}</th>`).join('')}</tr>${[0, 1, 2, 3, 4, 5].map(p => `<tr><td class="pg"><button type="button" class="eplay" data-eplay="${p}" title="Play this program in the preview">▶</button>${p + 1}${p == 4 ? ' <span class="du">slap</span>' : ''}</td>${['Chaff', 'Flare'].map(tt => ['BQ', 'BI', 'SQ', 'SI'].map(f => cell(p, tt, f)).join('')).join('')}<td>${inp('EWS', `PGM ${p} Comment`, { w: 110 })}</td></tr>`).join('')}</table>`;
      const SL = {
        BQ: ['Pieces (BQ)', 30, 1],
        BI: ['Between pieces (BI ms)', 6000, 50],
        SQ: ['Sequences (SQ)', 20, 1],
        SI: ['Between sequences (SI ms)', 10000, 50],
      };
      const blk = (tt, c) =>
        `<div class="slb ${c}"><h4>${tt}</h4>${['BQ', 'BI', 'SQ', 'SI']
          .map(f => {
            const k = `PGM ${EWSP} ${tt} ${f}`,
              v = +val('EWS', k) || 0,
              [lb, mx, st] = SL[f];
            return `<div class="slr"><label>${lb}</label><input type="range" data-s="EWS" data-k="${k}" data-t="int" data-sl="1" min="0" max="${Math.max(mx, v)}" step="${st}" value="${v}" oninput="this.nextElementSibling.value=this.value">${inp('EWS', k, { t: 'int', w: 62 }).replace('<input', '<input data-sl="1"')}</div>`;
          })
          .join('')}</div>`;
      const sl = `<div class="slv" style="min-height:${EWSH}px"><div class="slh"><span class="tgls">${[0, 1, 2, 3, 4, 5].map(n => `<button type="button" class="tgl${n == EWSP ? ' on' : ''}" data-sp="${n}">${n + 1}</button>`).join('')}</span><label class="slnote">Note ${inp('EWS', `PGM ${EWSP} Comment`, { w: 130 })}</label></div><div class="slg">${blk('Chaff', 'c')}${blk('Flare', 'f')}</div></div>`;
      const mt = `<button type="button" class="dsw${EWSM ? ' on' : ''}" data-ewsmode="1" title="Edit with sliders instead of the table"><i></i>Sliders</button>`;
      h +=
        '<div class="dgrid">' +
        card('ewsp', 'Programs', EWSM ? sl : t, {
          right: mt,
          full: 1,
          sync: 'ews',
          syncTip: 'Keep the notes equal to the ones of the Datacard (what you type there is written here)',
          hint: 'The notes (like C5X1) are the ones printed on the Datacard.',
        });
      h += card(
        'ewsv',
        'Preview',
        `<div class="ewsbar"><span class="tgls">${[0, 1, 2, 3, 4, 5].map(n => `<button type="button" class="tgl${n == EWSP ? ' on' : ''}" data-ep="${n}">${n + 1}</button>`).join('')}</span><button type="button" class="btn g bl sm" data-eplay>▶ Play</button><span class="hint" id="ewsum"></span></div><canvas id="ewsfx" class="ewsfx"></canvas>`,
        {
          full: 1,
          noedit: 1,
          live: 1,
          hint: 'Each piece released is a small burst: BQ pieces, BI ms apart; then SQ sequences, SI ms apart.',
        }
      );
      h += card(
        'ewsc',
        'Control',
        '<div class="ewsc2"><div>' +
          [
            ['Reqjam', 'REQ JAM'],
            ['Reqctr', 'REQ CTR'],
            ['Fdbk', 'Feedback'],
          ]
            .map(([k, l]) => row(l, onoff('EWS', k)))
            .join('') +
          '</div><div>' +
          row('Bingo', onoff('EWS', 'Bingo')) +
          row('Chaff bingo', inp('EWS', 'Chaff Bingo', { t: 'int', w: 70 })) +
          row('Flare bingo', inp('EWS', 'Flare Bingo', { t: 'int', w: 70 })) +
          '</div></div>',
        { cls: 's2' }
      );
      return h + '</div>';
    },
    com() {
      let h = head(
        'Comms & Nav',
        'When a frequency belongs to a flight, tanker or airbase of the campaign, it is shown beside the note.'
      );
      if (!secOn('Radio') && !secOn('COMMS')) return h + absent('The radio setup', 'Radio');
      const ow = deps.owners();
      const radio = (pre, title) => {
        const rows = [];
        for (let i = 1; i <= 20; i++) {
          if (!exists('Radio', pre + '_' + i)) continue;
          const f = val('Radio', pre + '_' + i),
            mhz = f === '' ? '' : (+f / 1000).toFixed(3),
            o = ow.get(mhz);
          rows.push(
            `<tr><td>${i}</td><td>${inp('Radio', pre + '_' + i, { t: 'mhz', w: 74 })}</td><td>${inp('Radio', pre + '_COMMENT_' + i, { w: 104, make: 1 })}</td><td class="own">${ownTag(o)}</td></tr>`
          );
        }
        return card(
          pre.toLowerCase(),
          title,
          rows.length
            ? `<table class="dt"><tr><th>#</th><th>MHz</th><th>Note</th><th>Used by</th></tr>${rows.join('')}</table>`
            : absent('These presets'),
          {}
        );
      };
      const start = card(
        'comdef',
        'Start presets',
        `<div class="drow2">${[1, 2].map(n => `<div class="drow"><label>COMM ${n}</label>${inp('COMMS', 'Comm' + n, { t: 'int', w: 40 })}<span class="du">note</span>${inp('COMMS', `Comm${n}_Comment`, { w: 190, make: 1 })}</div>`).join('')}</div>`,
        { cls: 'mini' }
      );
      const more = exists('Radio', 'ILS_1')
        ? card(
            'commore',
            'ILS presets',
            [1, 2, 3, 4]
              .filter(n => exists('Radio', 'ILS_' + n))
              .map(
                n =>
                  `<div class="ilsp"><div class="drow"><label>ILS ${n}</label>${inp('Radio', 'ILS_' + n, { t: 'ils', w: 84 })}<span class="du">MHz</span></div><div class="drow"><label>Note</label>${inp('Radio', 'ILS_COMMENT_' + n, { w: 150, make: 1 })}</div></div>`
              )
              .join(''),
            {}
          )
        : '';
      h +=
        start +
        '<div class="dgrid com3">' +
        radio('UHF', 'COMM 1 · UHF') +
        radio('VHF', 'COMM 2 · VHF') +
        '<div class="dcol">';
      h += card(
        'comnav',
        'TACAN / ILS',
        row('TACAN channel', inp('COMMS', 'TACAN Channel', { t: 'int', w: 64 })) +
          row(
            'Band',
            seg('COMMS', 'TACAN Band', [
              [0, 'X'],
              [1, 'Y'],
            ])
          ) +
          row(
            'Mode',
            seg('COMMS', 'TACAN Domain', [
              [0, 'T/R'],
              [1, 'A/A'],
            ])
          ) +
          row('ILS frequency', inp('COMMS', 'ILS Frequency', { t: 'ils', w: 84 }), 'MHz') +
          row('ILS course', inp('COMMS', 'ILS CRS', { t: 'int', w: 64 }), '°')
      );
      h += more + '</div></div>';
      return h;
    },
    iff() {
      let h = head('IFF', 'Status, change by position and change by time.');
      if (!secOn('IFF')) return h + absent('The IFF setup', 'IFF');
      const stat =
        `<table class="dt iffs"><tr><th></th><th>On</th><th>Code</th></tr>${[
          ['Mode1', 'M1', 'Mode1 Code', 'Mode1 On'],
          ['Mode2', 'M2', 'Mode2 Code', 'Mode2 On'],
          ['Mode3A', 'M3', 'Mode3A Code', 'Mode3A On'],
        ]
          .map(
            ([, l, ck, ok]) => `<tr><th>${l}</th><td>${onoff('IFF', ok)}</td><td>${inp('IFF', ck, { w: 64 })}</td></tr>`
          )
          .join('')}
        <tr><th>M4</th><td>${onoff('IFF', 'Mode4 On')}</td><td>${seg('IFF', 'Mode4 Key', [
          [1, 'A'],
          [2, 'B'],
        ])}</td></tr><tr><th>MC</th><td>${onoff('IFF', 'ModeC On')}</td><td></td></tr><tr><th>MS</th><td>${onoff('IFF', 'ModeS On')}</td><td></td></tr></table>` +
        row(
          'Auto change',
          seg('IFF', 'AutoChange', [
            [0, 'MAN'],
            [1, 'POS'],
            [2, 'TIM'],
            [3, 'P/T'],
          ])
        );
      const ev = (n, cur, key) =>
        `<span class="dseg evs">${Array.from({ length: n }, (_, i) => `<button type="button" data-iev="${key}:${i}" class="${i == cur ? 'on' : ''}">${i + 1}</button>`).join('')}</span>`;
      const pe = IFFPOS,
        pk = m => `POS ${pe} ${m}`;
      const pos =
        row('Event', ev(2, pe, 'pos')) +
        row('Waypoint', inp('IFF', pk('WayPoint'), { t: 'int', w: 48 }), 'STPT') +
        `<div class="drow stk"><label>Direction from the waypoint</label>${seg('IFF', pk('Direction'), [
          [0, '---'],
          [2, 'North'],
          [4, 'West'],
          [6, 'East'],
          [8, 'South'],
        ])}</div>` +
        `<div class="tgls">${[
          ['Mode1', 'M1'],
          ['Mode2', 'M2'],
          ['Mode3A', 'M3'],
          ['Mode4', 'M4'],
          ['ModeC', 'MC'],
          ['ModeS', 'MS'],
        ]
          .map(
            ([m, l]) =>
              `<button type="button" class="tgl${+val('IFF', pk(m)) ? ' on' : ''}" ${attrs('IFF', pk(m))} data-tg="1">${l}</button>`
          )
          .join('')}</div>`;
      const nT = [];
      for (let n = 0; n < 48 && exists('IFF', `TIME ${n} Criteria`); n++) nT.push(n);
      const te = Math.min(IFFTIM, Math.max(0, nT.length - 1)),
        tk = m => `TIME ${te} ${m}`,
        cr = +val('IFF', tk('Criteria')) || 0;
      const tim = nT.length
        ? row('Event', ev(nT.length, te, 'tim')) +
          `<div class="drow"><label>At (UTC)</label><input data-hm="${tk('Criteria')}" data-i="0" value="${Math.floor(cr / 100)}" style="width:44px"><span class="du">h</span><input data-hm="${tk('Criteria')}" data-i="1" value="${cr % 100}" style="width:44px"><span class="du">min</span></div>` +
          row('M1', inp('IFF', tk('Mode1 Code'), { w: 64 })) +
          row('M3', inp('IFF', tk('Mode3A Code'), { w: 64 })) +
          row(
            'M4',
            seg('IFF', tk('Mode4 Key'), [
              [1, 'A'],
              [2, 'B'],
            ])
          )
        : '<div class="hint">No scheduled changes.</div>';
      return (
        h +
        '<div class="dgrid">' +
        card('iffs', 'Status', stat) +
        card('iffp', 'Position event', pos) +
        card('ifft', 'Time event', tim) +
        '</div>'
      );
    },
    l16() {
      let h = head('Link 16', 'Link 16 files A and B.');
      if (!secOn('LINK16')) return h + absent('Link 16', 'LINK16');
      const f = ab => {
        const K = k => `FILE_${ab}_${k}`,
          I = (k, w = 64) => inp('LINK16', K(k), { w }),
          r = (l, c) => row(l, c);
        const stn = (t, pre, n) =>
          `<h4>${t}</h4>` +
          Array.from({ length: n }, (_, i) => r('#' + (i + 1), I(`${pre}_${i + 1}_STN`, 64))).join('');
        const left =
          r('Flight lead', onoff('LINK16', K('FLIGHT_LEAD'))) +
          r('ETR', onoff('LINK16', K('EXT_TIME_REFERENCE'))) +
          r('Callsign', I('CALLSIGN', 48)) +
          r('Number', I('CALLSIGN_NUMBER', 48)) +
          r('Voice A', I('VOICE_GROUP_A_CHANNEL', 48)) +
          r('Voice B', I('VOICE_GROUP_B_CHANNEL', 48)) +
          r('Mission', I('MISSION_CHANNEL', 48)) +
          r('Fighter', I('FIGHTER_CHANNEL', 48)) +
          r('Special', I('SPECIAL_CHANNEL', 48)) +
          r(
            'TACAN',
            I('TACAN_CHANNEL', 40) +
              ' ' +
              seg('LINK16', K('TACAN_BAND'), [
                ['X', 'X'],
                ['Y', 'Y'],
              ])
          );
        return `<div class="l16g"><div>${left}</div><div>${stn('Flight STNs', 'FLIGHT', 4)}${stn('Team STNs', 'TEAM', 4)}</div><div>${stn('Donor STNs', 'DONOR', 8)}</div></div>`;
      };
      return (
        h +
        '<div class="dgrid one l16two">' +
        card('l16a', 'File A', f('A'), {}) +
        card('l16b', 'File B', f('B'), {}) +
        '</div>'
      );
    },
    sys() {
      let h = head(
        'Systems',
        'Values you may prefer to type by hand (more simulative) or have taken from the Datacard.'
      );
      h += '<div class="dgrid">';
      h += secOn('ICP')
        ? card(
            'icp',
            'ICP',
            row(
              'Master mode',
              seg('ICP', 'MasterMode', [
                [0, 'NAV'],
                [1, 'AG'],
                [2, 'AA'],
              ])
            ) +
              row('Bingo fuel', inp('ICP', 'Bingo_Fuel', { t: 'int', w: 80 }), 'lbs') +
              row('ALOW MSL', inp('ICP', 'Alow MSL', { t: 'int', w: 80 }), 'ft') +
              row('ALOW AGL', inp('ICP', 'Alow AGL', { t: 'int', w: 80 }), 'ft') +
              row('ALOW TF advisory', inp('ICP', 'Alow TFAdv', { t: 'int', w: 80 }), 'ft'),
            {
              sync: 'icp',
              syncTip: 'Bingo and ALOW follow the Datacard: what you type there is written into the DTC',
              hint: 'Switch on to take bingo and ALOW from the Datacard; off to type them here (more simulative).',
            }
          )
        : card('icp', 'ICP', absent('The ICP data', 'ICP'), { noedit: 1 });
      h += secOn('Laser')
        ? card(
            'laser',
            'Laser',
            row('Laser start time', inp('Laser', 'LaserST', { t: 'int', w: 70 }), 's') +
              row('TGP code', inp('Laser', 'LaserTGP', { t: 'int', w: 70 })) +
              row('LST code', inp('Laser', 'LaserLST', { t: 'int', w: 70 }))
          )
        : card('laser', 'Laser', absent('The laser codes', 'Laser'), { noedit: 1 });
      h +=
        secOn('ICP') && exists('ICP', 'Manual Wingspan')
          ? card('wspan', 'Manual wingspan', row('Wingspan', inp('ICP', 'Manual Wingspan', { t: 'int', w: 80 }), 'ft'))
          : '';
      return h + '</div>';
    },
    mfd() {
      let h = head(
        'MFD',
        'The pages on the three buttons of each MFD, for every master mode. The marked button is the one shown at start.'
      );
      if (!secOn('MFD')) return h + absent('The MFD pages', 'MFD');
      const cell = (m, md, u) => {
        const k = `Display${m}-${md}-${2 - u}`,
          c = +val('MFD', k),
          sel = +val('MFD', `Display${m}-${md}-csel`) == 2 - u,
          nm = MFD_NAME.get(c);
        return `<span class="mfc"><button type="button" class="mfs${sel ? ' on' : ''}" data-ms="${m}:${md}:${u}" title="Page shown at start"></button><button type="button" class="mfp${nm ? '' : ' nil'}" data-mp="${m}:${md}:${u}" title="Choose the page">${nm || (c ? '#' + c : '—')}</button></span>`;
      };
      const tbl = (a, b) =>
        `<table class="dt mfd"><tr><th></th><th>MFD ${a + 1}</th><th>MFD ${b + 1}</th></tr>${MFD_MODES.map((t, md) => `<tr><th>${t}</th>${[a, b].map(m => `<td>${[0, 1, 2].map(u => cell(m, md, u)).join('')}</td>`).join('')}</tr>`).join('')}</table>`;
      const bull = card('mfdb', 'Bullseye', row('on MFD', onoff('Bullseye', 'BullseyeInfoOnMFD')), { cls: 'mini' });
      return (
        `<div class="dtophead mid"><div>${h}</div>${bull}</div><div class="dgrid one">` +
        card('mfd', 'MFD 1 and 2 · pages by master mode', tbl(0, 1), { full: 1, right: defBtn('mfd') }) +
        (deps.showMfd34() ? card('mfd34', 'MFD 3 and 4 · pages by master mode', tbl(2, 3), { full: 1 }) : '') +
        '</div>'
      );
    },
    harm() {
      const HC = ['#4aa3ff', '#f0b040', '#b07cff'],
        HE = OPEN.has('harm');
      let h = head(
        'HARM',
        'The three threat tables of the HARM and its delivery options.',
        defBtn('harm') +
          `<button type="button" class="btn g sm dpen" data-edit="harm">${HE ? '✔ Done' : '✎ Edit'}</button>`
      );
      if (!secOn('HARM')) return h + absent('The HARM setup', 'HARM');
      const code = (t, n) => parseInt(val('HARM', `THREAT ${t} ${n}`), 10);
      const tb = t =>
        card(
          'harm' + t,
          'Table ' + (t + 1),
          [0, 1, 2, 3, 4]
            .map(n => {
              const k = `THREAT ${t} ${n}`,
                c = code(t, n),
                e = THR.get(c);
              return `<div class="drow"><label>${n + 1}</label><button type="button" class="mfp thr${e ? '' : ' nil'}${HPICK == t + ':' + n ? ' on' : ''}" data-th="${t}:${n}" title="Choose the threat">${e ? esc(e[1]) : isNaN(c) ? '—' : '#' + c}</button>${inp('HARM', k, { w: 52, t: 'thr' })}<span class="du sy">${e ? esc(e[2]) : ''}</span></div>`;
            })
            .join(''),
          { cls: 'ht' + t, noedit: 1, ok: 'harm' }
        );
      const opt = card(
        'harmo',
        'Delivery',
        row(
          'Delivery mode',
          seg('HARM', 'MODE', [
            [1, 'HAS'],
            [0, 'POS'],
          ])
        ) +
          row(
            'Sub mode',
            seg('HARM', 'SUBMODE', [
              [0, 'PB'],
              [1, 'EOM'],
              [2, 'RUK'],
            ])
          ) +
          row(
            'Selected table',
            seg('HARM', 'TER', [
              [0, '1'],
              [1, '2'],
              [2, '3'],
            ])
          ),
        { noedit: 1, ok: 'harm' }
      );
      const [pt, pi] = HPICK.split(':').map(Number),
        GL = [
          ['SAM', 'SAM systems'],
          ['FCR', 'Fire control radars'],
          ['EWR', 'Early warning radars'],
        ];
      const used = new Map();
      [0, 1, 2].forEach(t =>
        [0, 1, 2, 3, 4].forEach(n => {
          const c = code(t, n);
          if (!isNaN(c)) used.set(c, (used.get(c) || []).concat(t));
        })
      );
      const pn = card(
        'harmp',
        `Threats · Table ${pt + 1}, slot ${pi + 1}`,
        `<div class="hpbar"><span class="hpf">${[['all', 'All']]
          .concat(GL)
          .map(([g, l]) => `<a href="#" class="${HFILT == g ? 'on' : ''}" data-hf="${g}">${l}</a>`)
          .join(
            ''
          )}</span><input type="search" id="hq" placeholder="Search name, symbol or code" autocomplete="off"></div>` +
          GL.map(
            ([g, l]) =>
              `<div class="hpg" data-g="${g}"><h5>${l}</h5><div class="hpl">${THREATS.filter(x => x[3] == g)
                .map(x => {
                  const u = used.get(x[0]);
                  return `<button type="button" class="hpi${u ? ' on' : ''}" data-hp="${x[0]}" data-n="${esc((x[1] + ' ' + x[2] + ' ' + x[0]).toLowerCase())}"${u ? ` style="--hc:${HC[u[0]]}"` : ''}><span>${esc(x[1])}</span>${u ? `<b class="hpd">${u.map(t => `<s style="background:${HC[t]}"></s>`).join('')}</b>` : ''}<em>${esc(x[2])}</em></button>`;
                })
                .join('')}</div></div>`
          ).join(''),
        { full: 1, noedit: 1, live: 1, cls: 'hpick hp' + pt + (HE ? '' : ' ro') }
      );
      return h + '<div class="dgrid harm">' + tb(0) + tb(1) + tb(2) + opt + pn + '</div>';
    },
    wpn() {
      let h = head('Weapons', 'Bomb profiles, air-to-air and Maverick settings.');
      const prof = n => {
        const K = s => `Profile${n}_${s}`;
        return (
          row(
            'Sub mode',
            seg('FCC_AGB', K('Submode'), [
              [7, 'CCIP'],
              [8, 'CCRP'],
            ])
          ) +
          row(
            'Fuze',
            seg('FCC_AGB', K('Fuze'), [
              [0, 'NSTL'],
              [1, 'NOSE'],
              [2, 'TAIL'],
            ])
          ) +
          row(
            'Release',
            seg('FCC_AGB', K('SGL/PAIR'), [
              [0, 'SGL'],
              [1, 'PAIR'],
            ])
          ) +
          row('Spacing', inp('FCC_AGB', K('Release_Spacing'), { t: 'int', w: 70 }), 'ft') +
          row('Release pulse', inp('FCC_AGB', K('Release_Pulse'), { t: 'int', w: 56 })) +
          row('Release angle', inp('FCC_AGB', K('Release_Angle'), { t: 'int', w: 56 }), '°') +
          row('C1 arming delay 1', inp('FCC_AGB', K('C1_AD1'), { t: 'sec', w: 70 }), 's') +
          row('C1 arming delay 2', inp('FCC_AGB', K('C1_AD2'), { t: 'sec', w: 70 }), 's') +
          row('C2 arming delay', inp('FCC_AGB', K('C2_AD'), { t: 'sec', w: 70 }), 's') +
          row('C2 burst altitude', inp('FCC_AGB', K('C2_BA'), { t: 'int', w: 70 }), 'ft')
        );
      };
      const sy = {
        sync: 'wpn',
        syncTip: 'The profiles follow the Datacard: what you type there is written into the DTC',
      };
      h +=
        '<div class="dgrid">' +
        (secOn('FCC_AGB')
          ? card('p1', 'Bombs · Prof. 1', prof(1), sy) + card('p2', 'Bombs · Prof. 2', prof(2), sy)
          : card('p1', 'Bombs', absent('The bomb profiles', 'FCC_AGB'), { noedit: 1 }));
      const st = (a, b) => `<div class="drow stk"><label>${a}</label>${b}</div>`;
      h += secOn('FCC_AIM')
        ? card(
            'aim',
            'A-A missiles',
            st(
              'AIM-9 Spot / Scan',
              seg('FCC_AIM', 'AIM-9_Spot/Scan', [
                [0, 'Spot'],
                [1, 'Scan'],
              ])
            ) +
              st(
                'AIM-9 BP / TD',
                seg('FCC_AIM', 'AIM-9_TD/BP', [
                  [0, 'BP'],
                  [1, 'TD'],
                ])
              ) +
              st(
                'AIM-120 target size',
                seg('FCC_AIM', 'AIM120_TargetSize', [
                  [0, 'Unkn'],
                  [1, 'Small'],
                  [2, 'Medium'],
                  [3, 'Large'],
                ])
              ),
            { cls: 'nl' }
          )
        : '';
      h += secOn('FCC_AGM')
        ? card(
            'agm',
            'A-G missiles',
            st(
              'Auto power',
              seg('FCC_AGM', 'Maverick_AutoPwr', [
                [0, 'OFF'],
                [1, 'ON'],
              ])
            ) +
              st(
                'Auto power direction',
                seg('FCC_AGM', 'Maverick_AutoPwrDir', [
                  [0, 'North of'],
                  [1, 'East of'],
                  [2, 'South of'],
                  [3, 'West of'],
                ])
              ) +
              st(
                'Auto power steerpoint',
                seg(
                  'FCC_AGM',
                  'Maverick_AutoPwrWpt',
                  [0, 1, 2, 3, 4, 5, 6, 7].map(n => [n, n])
                )
              )
          )
        : '';
      return h + '</div>';
    },
    nav() {
      let h = head('Nav offsets', 'VIP / VRP and their pop-up data and the other offsets.');
      if (!secOn('NAV OFFSETS')) return h + absent('The nav offsets', 'NAV OFFSETS');
      const tr = (k, n, lab) => {
        const v = val('NAV OFFSETS', k)
          .split(',')
          .map(x => x.trim());
        return `<tr><td>${lab || k}</td>${Array.from({ length: n }, (_, i) => `<td><input data-nv="${esc(k)}" data-i="${i}" data-n="${n}" data-t="dec" value="${esc(v[i] === undefined ? '' : v[i])}" style="width:74px"></td>`).join('')}</tr>`;
      };
      h += '<div class="dgrid wide">';
      if (secOn('NAV OFFSETS')) {
        const oa = lines()
          .filter(l => l.s == 'NAV OFFSETS' && /^OA\d-\d+$/.test(l.k))
          .map(l => l.k)
          .sort((x, y) => x.split('-')[1] - y.split('-')[1] || x[2] - y[2]);
        h +=
          '<div class="dstack">' +
          card(
            'navm',
            'Active reference',
            row(
              'Mode',
              seg('NAV OFFSETS', 'Modesel', [
                ['vrp', 'VRP'],
                ['vip', 'VIP'],
              ])
            ),
            {}
          ) +
          card(
            'navv',
            'Offsets',
            `<table class="dt"><tr><th></th><th>Steerpoint</th><th>Bearing</th><th>Range</th><th>Elevation</th></tr>${['VRP', 'VRPPUP', 'VIP', 'VIPPUP'].map(k => tr(k, 4)).join('')}</table>`,
            {}
          ) +
          '</div>';
        if (oa.length)
          h += card(
            'navo',
            'Offset aimpoints',
            `<table class="dt"><tr><th></th><th>1</th><th>2</th><th>3</th></tr>${oa.map(k => tr(k, 3)).join('')}</table>`,
            {}
          );
      }
      return h + '</div>';
    },
  };

  // ---- events ----------------------------------------------------------------------------------
  const parse = (t, x, old) => {
    if (t == 'txt') return String(x);
    if (t == 'thr') {
      const v = String(x).trim();
      return /^\d{1,4}$/.test(v) ? v.padStart(4, '0') : null;
    }
    if (t == 'int') {
      const n = num(x);
      return n === null ? null : like(old, n);
    }
    if (t == 'dec') {
      const n = num(x);
      return n === null ? null : String(n);
    }
    if (t == 'mhz') {
      const n = num(x);
      return n === null ? null : String(Math.round(n * 1000));
    }
    if (t == 'ils') {
      const n = num(x);
      return n === null ? null : String(Math.round(n * 100));
    }
    if (t == 'sec') {
      const n = num(x);
      return n === null ? null : like(old, n * 100);
    }
    return String(x);
  };
  // "N 35°56.220 E 126°53.443" (also with spaces instead of ° or decimal degrees) -> [lat, lon]
  function parseLL(t) {
    t = String(t)
      .replace(/[°'′,]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
    let m;
    if ((m = t.match(/^([NS]) ?(\d{1,2}) (\d{1,2}(?:\.\d+)?) ?([EW]) ?(\d{1,3}) (\d{1,2}(?:\.\d+)?)$/))) {
      const la = +m[2] + m[3] / 60,
        lo = +m[5] + m[6] / 60;
      if (m[3] < 60 && m[6] < 60 && la <= 90 && lo <= 180) return [m[1] == 'S' ? -la : la, m[4] == 'W' ? -lo : lo];
    }
    if ((m = t.match(/^([NS]) ?(\d{1,2}(?:\.\d+)?) ?([EW]) ?(\d{1,3}(?:\.\d+)?)$/)) && +m[2] <= 90 && +m[4] <= 180)
      return [m[1] == 'S' ? -m[2] : +m[2], m[3] == 'W' ? -m[4] : +m[4]];
    return null;
  }
  function commit(s, k, v) {
    if (String(val(s, k)) === String(v) && exists(s, k)) return;
    S(s, k, v);
    deps.changed(s, k);
    dots();
    if (s == 'EWS' && cur == 'ews') ewsRefresh();
  }
  function bind(root) {
    root.querySelectorAll('input[data-s]').forEach(
      i =>
        (i.onchange = () => {
          const s = i.dataset.s,
            k = i.dataset.k,
            old = val(s, k),
            v = parse(i.dataset.t, i.value, old);
          if (v === null) {
            i.classList.add('bad');
            setTimeout(() => i.classList.remove('bad'), 700);
            i.value = i.dataset.o;
            return;
          }
          commit(s, k, v);
          i.value = i.dataset.o = disp(i.dataset.t, val(s, k));
          if (s == 'HARM' || i.dataset.sl) render();
          if (i.dataset.t == 'mhz') {
            const c = i.closest('tr') && i.closest('tr').querySelector('td.own');
            if (c) c.innerHTML = ownTag(deps.owners().get(i.value));
          }
        })
    );
    root.querySelectorAll('.dseg button').forEach(
      b =>
        (b.onclick = () => {
          if (b.closest('.dcard.ro')) return;
          b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
          commit(b.dataset.s, b.dataset.k, b.dataset.v);
        })
    );
    root.querySelectorAll('[data-ms]').forEach(
      b =>
        (b.onclick = () => {
          if (b.closest('.dcard.ro')) return;
          const [m, md, u] = b.dataset.ms.split(':');
          commit('MFD', `Display${m}-${md}-csel`, String(2 - u));
          render();
        })
    );
    root.querySelectorAll('[data-def]').forEach(
      b =>
        (b.onclick = async () => {
          if (b.classList.contains('nil')) return;
          const [g, act] = b.dataset.def.split(':'),
            d = deps.dtcDef;
          if (act == 'save') {
            if (d.has(g) && !(await deps.confirm('Replace your saved default ' + DEFN[g] + ' with these?'))) return;
            d.save(g);
          } else {
            if (!(await deps.confirm('Replace the ' + DEFN[g] + ' of this file with your default?'))) return;
            const o = d.get(g);
            Object.keys(o).forEach(k => {
              const [sec, key] = k.split('|');
              if (secOn(sec)) commit(sec, key, o[k]);
            });
          }
          render();
        })
    );
    root.querySelectorAll('[data-tpick]').forEach(
      b =>
        (b.onclick = async () => {
          if (b.closest('.dcard.ro') || b.classList.contains('nil') || b.dataset.tpick === '') return;
          const n = +b.dataset.tpick,
            data = deps.targetData();
          if (!data) return;
          const t = await openTargetPicker({ data, fmt: deps.ll, esc, anim, title: 'Target ' + (n + 1) });
          if (!t) return;
          try {
            const h = deps.elev ? await deps.elev([t]) : null;
            if (h && h[0] !== null && h[0] !== undefined) t.elv = h[0];
          } catch (e) {
            /* no terrain file */
          }
          commit('STPT', 'wpntarget_' + n, targetLine(t, val('STPT', 'wpntarget_' + n)));
          render();
        })
    );
    root.querySelectorAll('[data-tstpt]').forEach(
      b =>
        (b.onclick = e => {
          if (b.closest('.dcard.ro')) return;
          e.stopPropagation();
          pickStpt(b);
        })
    );
    root.querySelectorAll('[data-tdel]').forEach(
      b =>
        (b.onclick = async () => {
          if (b.closest('.dcard.ro')) return;
          if (!(await deps.confirm('Clear target ' + (+b.dataset.tdel + 1) + '?'))) return;
          commit('STPT', 'wpntarget_' + b.dataset.tdel, targetLine(null));
          render();
        })
    );
    root.querySelectorAll('[data-tclear]').forEach(
      b =>
        (b.onclick = async () => {
          if (b.closest('.dcard.ro')) return;
          if (!(await deps.confirm('Clear all weapon targets?'))) return;
          for (let n = 0; n < 100; n++)
            if (exists('STPT', 'wpntarget_' + n) && readTarget(val('STPT', 'wpntarget_' + n)))
              commit('STPT', 'wpntarget_' + n, targetLine(null));
          render();
        })
    );
    root.querySelectorAll('[data-sp]').forEach(
      b =>
        (b.onclick = () => {
          EWSP = +b.dataset.sp;
          render();
        })
    );
    root.querySelectorAll('[data-ewsmode]').forEach(
      b =>
        (b.onclick = () => {
          const t = view.querySelector('[data-card=ewsp] table.dt');
          if (t) EWSH = t.offsetHeight;
          EWSM = EWSM ? 0 : 1;
          try {
            sessionStorage.setItem('ewsm', EWSM);
          } catch (e) {}
          render();
        })
    );
    root.querySelectorAll('[data-ep]').forEach(
      b =>
        (b.onclick = () => {
          EWSP = +b.dataset.ep;
          ewsRefresh();
        })
    );
    root.querySelectorAll('[data-eplay]').forEach(
      b =>
        (b.onclick = () => {
          if (b.dataset.eplay !== '') EWSP = +b.dataset.eplay;
          ewsRefresh();
          if (FX) FX.play();
        })
    );
    root.querySelectorAll('[data-th]').forEach(
      b =>
        (b.onclick = e => {
          if (b.closest('.dcard.ro')) return;
          e.stopPropagation();
          HPICK = b.dataset.th;
          render();
        })
    );
    root.querySelectorAll('[data-hp]').forEach(
      b =>
        (b.onclick = () => {
          const [t, n] = HPICK.split(':');
          commit('HARM', `THREAT ${t} ${n}`, String(b.dataset.hp).padStart(4, '0'));
          render();
        })
    );
    const hfApply = () => {
      const q = ((view.querySelector('#hq') || {}).value || '').trim().toLowerCase();
      view.querySelectorAll('.hpg').forEach(g => {
        let any = 0;
        g.querySelectorAll('.hpi').forEach(x => {
          const ok = (HFILT == 'all' || HFILT == g.dataset.g) && (!q || x.dataset.n.includes(q));
          x.hidden = !ok;
          if (ok) any++;
        });
        g.hidden = !any;
      });
      view.querySelectorAll('[data-hf]').forEach(x => x.classList.toggle('on', x.dataset.hf == HFILT));
    };
    root.querySelectorAll('[data-hf]').forEach(
      b =>
        (b.onclick = e => {
          e.preventDefault();
          HFILT = b.dataset.hf;
          hfApply();
        })
    );
    root.querySelectorAll('#hq').forEach(i => (i.oninput = hfApply));
    if (root.querySelector('.hpg')) hfApply();
    root.querySelectorAll('[data-mp]').forEach(
      b =>
        (b.onclick = e => {
          if (b.closest('.dcard.ro')) return;
          e.stopPropagation();
          pickPage(b);
        })
    );
    root.querySelectorAll('[data-tg]').forEach(
      b =>
        (b.onclick = () => {
          if (b.closest('.dcard.ro')) return;
          const on = !b.classList.contains('on');
          b.classList.toggle('on', on);
          commit(b.dataset.s, b.dataset.k, on ? '1' : '0');
        })
    );
    root.querySelectorAll('[data-iev]').forEach(
      b =>
        (b.onclick = () => {
          if (b.closest('.dcard.ro')) return;
          const [k, i] = b.dataset.iev.split(':');
          if (k == 'pos') IFFPOS = +i;
          else IFFTIM = +i;
          render();
        })
    );
    root.querySelectorAll('input[data-hm]').forEach(
      i =>
        (i.onchange = () => {
          const k = i.dataset.hm,
            cr = +val('IFF', k) || 0,
            n = num(i.value);
          if (n === null || n < 0 || (i.dataset.i == '0' ? n > 23 : n > 59)) {
            i.classList.add('bad');
            setTimeout(() => i.classList.remove('bad'), 700);
            i.value = i.dataset.i == '0' ? Math.floor(cr / 100) : cr % 100;
            return;
          }
          const h = i.dataset.i == '0' ? Math.round(n) : Math.floor(cr / 100),
            m = i.dataset.i == '0' ? cr % 100 : Math.round(n);
          commit('IFF', k, String(h * 100 + m));
        })
    );
    root.querySelectorAll('[data-edit]').forEach(
      b =>
        (b.onclick = () => {
          const id = b.dataset.edit,
            c = b.closest('.dcard');
          if (OPEN.has(id)) OPEN.delete(id);
          else OPEN.add(id);
          if (!c) {
            render();
            return;
          }
          c.classList.toggle('ro', !OPEN.has(id));
          b.textContent = OPEN.has(id) ? '✔ Done' : '✎ Edit';
        })
    );
    root.querySelectorAll('[data-sync]').forEach(
      b =>
        (b.onclick = () => {
          const g = b.dataset.sync;
          SYNC[g] = !SYNC[g];
          view.querySelectorAll(`[data-sync="${g}"]`).forEach(x => x.classList.toggle('on', SYNC[g]));
          deps.sync(g, SYNC[g]);
          dots();
        })
    );
    root.querySelectorAll('input[data-g]').forEach(
      i =>
        (i.onchange = () => {
          const g = i.dataset.g,
            slot = +i.dataset.slot,
            f = i.dataset.f,
            n = i.dataset.t == 'txt' ? 0 : num(i.value);
          if (i.dataset.t != 'txt' && n === null) {
            render();
            return;
          }
          if (f == 'pos') {
            const ll = parseLL(i.value);
            if (!ll) {
              i.classList.add('bad');
              setTimeout(render, 600);
              return;
            }
            const [gx, gy] = deps.llInv(ll[0], ll[1]);
            deps.pointSet(g, slot, { x: gx, y: gy });
            return;
          }
          const ft = deps.FT_KM,
            patch =
              f == 'name'
                ? { name: i.value }
                : f == 'alt'
                  ? { altFt: Math.round(n) }
                  : f == 'rng'
                    ? { rngNm: Math.max(0, n) }
                    : f == 'x'
                      ? { x: n / ft }
                      : { y: n / ft };
          deps.pointSet(g, slot, patch);
        })
    );
    root.querySelectorAll('[data-pdel]').forEach(
      b =>
        (b.onclick = () => {
          const [g, s] = b.dataset.pdel.split(':');
          deps.pointDel(g, +s);
        })
    );
    root.querySelectorAll('input[data-nv]').forEach(
      i =>
        (i.onchange = () => {
          const k = i.dataset.nv,
            v = val('NAV OFFSETS', k)
              .split(',')
              .map(x => x.trim());
          while (v.length < +i.dataset.n) v.push('0');
          const n = num(i.value);
          if (n === null) {
            i.value = v[+i.dataset.i];
            return;
          }
          v[+i.dataset.i] = String(n);
          commit('NAV OFFSETS', k, v.join(','));
        })
    );
  }
  // the blue default buttons are dimmed when there is nothing to save or load
  function defState() {
    const d = deps.dtcDef;
    view.querySelectorAll('[data-def]').forEach(b => {
      const [g, act] = b.dataset.def.split(':');
      b.classList.toggle('nil', act == 'save' ? d.same(g) : !d.has(g) || d.same(g));
    });
  }
  function dots() {
    defState();
    const d = dirtyBy();
    nav.querySelectorAll('button').forEach(b => {
      const m = !!d[b.dataset.k];
      b.querySelector('i').classList.toggle('m', m);
      b.title = m ? 'Changed since the file was opened or saved' : '';
    });
  }

  // small menu of buttons with the pages that can go on one MFD button (a page can be used once per MFD and mode)
  function pickPage(b) {
    closePick();
    const [m, md, u] = b.dataset.mp.split(':').map(Number),
      here = +val('MFD', `Display${m}-${md}-${2 - u}`);
    const used = new Set([0, 1, 2].filter(x => x != u).map(x => +val('MFD', `Display${m}-${md}-${2 - x}`)));
    const d = document.createElement('div');
    d.className = 'mfpick';
    d.innerHTML = [[0, 'none'], ...MFD_PG]
      .map(
        ([c, n]) =>
          `<button type="button" data-c="${c}" class="${c == here ? 'on' : ''}"${c && used.has(c) ? ' disabled' : ''}>${n}</button>`
      )
      .join('');
    document.body.appendChild(d);
    const r = b.getBoundingClientRect(),
      w = d.offsetWidth,
      hh = d.offsetHeight;
    d.style.left = Math.max(6, Math.min(innerWidth - w - 6, r.left)) + 'px';
    d.style.top = (r.bottom + hh + 8 > innerHeight ? Math.max(6, r.top - hh - 4) : r.bottom + 4) + 'px';
    if (anim())
      d.animate(
        [
          { opacity: 0, transform: 'translateY(-3px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 150, easing: 'ease-out' }
      );
    d.onclick = e => {
      const t = e.target.closest('button');
      if (!t || t.disabled) return;
      closePick();
      const c = +t.dataset.c,
        k = `Display${m}-${md}-${2 - u}`;
      commit('MFD', k, String(c));
      render();
    };
    setTimeout(() => document.addEventListener('click', closePick, { once: true }), 0);
  }
  // menu of the TGT steerpoints (STPT 81-99): the weapon target is copied to the one chosen (asks before replacing a used one)
  function pickStpt(b) {
    closePick();
    const n = +b.dataset.tstpt,
      t = readTarget(val('STPT', 'wpntarget_' + n)),
      P = deps.points();
    if (!t || !P) return;
    const d = document.createElement('div');
    d.className = 'mfpick wide';
    d.innerHTML =
      '<h5>Save as TGT steerpoint</h5>' +
      P.prec
        .map(
          p =>
            `<button type="button" data-s="${p.slot}" title="${p.empty ? 'Free' : esc(p.name || 'Used')}">${p.stpt}${p.empty ? '' : ' · ' + esc(p.name || 'used')}</button>`
        )
        .join('');
    document.body.appendChild(d);
    const r = b.getBoundingClientRect(),
      w = d.offsetWidth,
      hh = d.offsetHeight;
    d.style.left = Math.max(6, Math.min(innerWidth - w - 6, r.left - w + r.width)) + 'px';
    d.style.top = Math.max(6, Math.min(innerHeight - hh - 6, r.bottom + 4)) + 'px';
    if (anim())
      d.animate(
        [
          { opacity: 0, transform: 'translateY(-3px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 150, easing: 'ease-out' }
      );
    d.onclick = async e => {
      const x = e.target.closest('button');
      if (!x) return;
      closePick();
      const p = P.prec.find(q => q.slot == x.dataset.s);
      if (
        !p.empty &&
        !(await deps.confirm('Replace STPT ' + p.stpt + (p.name ? ' (' + p.name + ')' : '') + ' with this target?'))
      )
        return;
      deps.pointSet('prec', p.slot, { x: t.e / deps.FT_KM, y: t.n / deps.FT_KM, altFt: t.elv, name: t.name });
      render();
    };
    setTimeout(() => document.addEventListener('click', closePick, { once: true }), 0);
  }
  // EWS preview: the canvas is new after every drawing of the page, so it is (re)connected here
  function ewsRefresh() {
    const cv = view.querySelector('#ewsfx');
    if (!cv) {
      FX = null;
      return;
    }
    if (!FX || FX.cv !== cv) {
      if (FX) FX.stop();
      FX = createEwsFx(cv, { anim: () => anim() });
      FX.cv = cv;
    }
    const g = (t, f) => +val('EWS', `PGM ${EWSP} ${t} ${f}`) || 0,
      ev = ewsEvents(g);
    view.querySelectorAll('[data-ep]').forEach(x => x.classList.toggle('on', +x.dataset.ep == EWSP));
    FX.load(ev);
    const sm = view.querySelector('#ewsum');
    if (sm) sm.textContent = ewsSummary(ev);
  }
  function closePick() {
    document.querySelectorAll('.mfpick').forEach(x => x.remove());
  }

  // ---- drawing ---------------------------------------------------------------------------------
  let ST = { scroll: 0 };
  function drawNav() {
    nav.innerHTML = SECTIONS.map(
      ([k, t]) => `<button type="button" data-k="${k}" class="${k == cur ? 'on' : ''}">${t}<i></i></button>`
    ).join('');
    nav.querySelectorAll('button').forEach(
      b =>
        (b.onclick = () => {
          if (cur == b.dataset.k) return;
          cur = b.dataset.k;
          try {
            sessionStorage.setItem('dtcpage', cur);
          } catch (e) {
            /* no storage */
          }
          q = '';
          render({ fade: true });
        })
    );
    dots();
  }
  function render(o = {}) {
    drawNav();
    if (!has()) {
      view.innerHTML =
        '<p class="hint">Open a DTC file to begin (the Open button above). The DTC button writes into the file itself and keeps the original once in the program folder.</p>';
      return;
    }
    const sc = view.scrollTop,
      ae = document.activeElement,
      inputs = [...view.querySelectorAll('input')],
      idx = inputs.indexOf(ae),
      selS = ae && ae.selectionStart;
    view.innerHTML = pages[cur]();
    bind(view);
    if (cur == 'ews') ewsRefresh();
    view.scrollTop = sc;
    if (idx >= 0 && !o.fade) {
      const n = [...view.querySelectorAll('input')][idx];
      if (n) {
        n.focus();
        try {
          n.setSelectionRange(selS, selS);
        } catch (e) {
          /* not text */
        }
      }
    }
    if (o.fade && anim())
      view.animate(
        [
          { opacity: 0, transform: 'translateY(4px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 150, easing: 'ease-out' }
      );
  }
  return {
    render,
    dots,
    get cur() {
      return cur;
    },
    setSync(o) {
      SYNC = Object.assign({}, o);
    },
    get sync() {
      return SYNC;
    },
    card: id => view.querySelector(`[data-card="${id}"]`),
  };
}
