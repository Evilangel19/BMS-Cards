// ROE / SOP of the Datacard and of the MDC (the cell ROE / SOP): the choices of the menu, the text they write on the card, the presets.
// Pure: no screen, testable in Node. The menu is app/roepanel.js.
// ROE: the rules of engagement (weapons status, ID criteria, commit, bugout, other rules). SOP: the habits of the squadron, phase by phase, written in the
// long form in the menu and in a short form on the card (only the topics marked "on card"). Values from the RoKAF F-16 Basic Employment Manual and the
// 8th FW / 51st FW in-flight guides (Kunsan, Osan); the field altitudes of the patterns are left to the field ("the pattern altitude of the field").

// [id, label, kind ('one' | 'many'), tag on the card, options [id, long, short]]
export const ROE = [
  [
    'ws',
    'Weapons status',
    'one',
    '',
    [
      ['free', 'WEAPONS FREE: fire at any target not identified as friendly', 'WPN FREE'],
      ['tight', 'WEAPONS TIGHT: fire only at targets identified as hostile', 'WPN TIGHT'],
      ['hold', 'WEAPONS HOLD: fire only in self-defence or when ordered', 'WPN HOLD'],
    ],
  ],
  [
    'id',
    'ID criteria',
    'many',
    'ID',
    [
      ['vid', 'Visual identification (VID)', 'VID'],
      ['awacs', 'AWACS DECLARE (hostile)', 'AWACS DECLARE'],
      ['l16', 'Link 16: surveillance track or PPLI', 'L16'],
      ['nctr', 'NCTR (radar print)', 'NCTR'],
      ['iff', 'IFF: no Mode 4 reply', 'M4 NEG'],
      ['two', 'Two independent sources', '2 SRC'],
    ],
  ],
  [
    'commit',
    'Commit',
    'one',
    'COMMIT',
    [
      ['n20', 'Hostile group within 20 NM', '20NM'],
      ['n30', 'Hostile group within 30 NM', '30NM'],
      ['n40', 'Hostile group within 40 NM', '40NM'],
      ['flot', 'Hostile group crossing the FLOT', 'FLOT'],
      ['cap', 'Hostile group crossing the CAP line', 'CAP LINE'],
    ],
  ],
  [
    'abort',
    'Abort / bugout',
    'many',
    'BUGOUT',
    [
      ['bingo', 'Bingo fuel', 'BINGO'],
      ['winch', 'Winchester (no weapons left)', 'WINCH'],
      ['spike', 'Unknown SAM spike', 'SAM SPIKE'],
      ['sa', 'Loss of SA', 'NO SA'],
      ['cms', 'No countermeasures left', 'NO CMS'],
    ],
  ],
  [
    'extra',
    'Other rules',
    'many',
    '',
    [
      ['mez', 'No fire into a friendly SAM MEZ', 'NO FIRE IN FRND MEZ'],
      ['pid', 'Positive ID of the target before release', 'PID B4 RLS'],
      ['lines', 'No release over friendly lines', 'NO RLS OVER FRND'],
      ['fox', 'FOX call on every shot', 'FOX CALLS'],
    ],
  ],
];

// SOP: [phase, [[id, label, tag, options [id, long, short]], ...]]
export const SOP = [
  [
    'Ground',
    [
      [
        'lights',
        'Anti-collision / flash',
        'LTS',
        [
          ['start', 'On / flash at engine start, when ready', 'FLASH AT START'],
          ['move', 'Flash as soon as the aircraft moves', 'FLASH MOVING'],
          ['hold', 'Flash after the holding position', 'FLASH AT HOLD'],
          ['rwy', 'Steady while taxiing, flash on the runway', 'FLASH ON RWY'],
        ],
      ],
      [
        'tlight',
        'Taxi / landing light',
        'TAXI/LDG LT',
        [
          [
            'taxi',
            'Taxi light while taxiing, landing light at line-up and with the gear down',
            'TAXI LT, LDG AT LINEUP',
          ],
          ['ldg', 'Landing light at line-up and with the gear down only', 'LDG AT LINEUP'],
        ],
      ],
      [
        'taxi',
        'Taxi',
        'TAXI',
        [
          ['stag', 'Staggered, 150 ft; 25 kt max, 10 kt in turns', 'STAGGERED 150FT'],
          ['single', 'Single file, 300 ft; 25 kt max, 10 kt in turns', 'SINGLE FILE 300FT'],
        ],
      ],
      [
        'checkin',
        'Radio check-in',
        'CHK-IN',
        [
          ['start', 'At engine start: "(callsign) check-in" - "2" - "3" (PRI UHF, AUX VHF)', 'AT START'],
          ['taxi', 'Before taxi, then call Ground with the ATIS, departure and formation', 'BEFORE TAXI'],
        ],
      ],
      [
        'eor',
        'EOR',
        'EOR',
        [
          ['arm', 'Arming and de-arming at the EOR', 'ARM/DE-ARM'],
          ['none', 'No EOR', 'NONE'],
        ],
      ],
    ],
  ],
  [
    'Take-off and departure',
    [
      [
        'lineup',
        'Line-up',
        'LINEUP',
        [
          ['ech', 'Echelon, 3-5 ft wingtip spacing', 'ECHELON'],
          ['slot', '#3 in the slot', '#3 SLOT'],
        ],
      ],
      [
        'takeoff',
        'Take-off',
        'T/O',
        [
          ['form', 'Formation take-off (element)', 'FORMATION'],
          ['s10', 'Single ship, 10 s interval', '10S'],
          ['s20', 'Single ship, 20 s interval (nonstandard)', '20S'],
          ['s30', 'Single ship, 30 s interval', '30S'],
        ],
      ],
      [
        'power',
        'Take-off power',
        'PWR',
        [
          ['ab', 'Afterburner', 'AB'],
          ['mil', 'Military power', 'MIL'],
        ],
      ],
      [
        'cms',
        'Chaff / flares',
        'CMS',
        [
          ['before', 'Armed before take-off (combat only)', 'ARMED B4 T/O'],
          ['fence', 'Armed at FENCE in', 'AT FENCE IN'],
        ],
      ],
      [
        'dep',
        'Departure',
        'DEP',
        [
          [
            'sid',
            'Standard / IFR SID: at or below 1,000 ft MSL to the departure end when the overhead is open; with less than 1,500 ft / 3 NM no turn below 1,000 ft AGL',
            'SID',
          ],
          ['vfr', 'VFR: runway heading to the departure end, then to the first steerpoint', 'VFR'],
          ['trail', 'Radar trail: 2 NM, "Tied" calls, or calls every 5,000 ft and every turn', 'RADAR TRAIL 2NM'],
          [
            'combat',
            'Combat departure: AB, at or below 1,000 ft MSL while accelerating to 400 KCAS, climb in AB at 400 KCAS, normal climb from 10-11,000 ft, departure heading by 5 DME',
            'COMBAT',
          ],
          [
            'lowtac',
            'Low tactical: 500 ft AGL at the departure end, turn and accelerate, to the VFR entry point at or below 1,000 ft MSL',
            'LOW TAC',
          ],
          ['hightac', 'High tactical: spiral climb within 3 NM of the field, up to 6,500 ft MSL', 'HIGH TAC'],
        ],
      ],
      [
        'rejoin',
        'Rejoin',
        'REJOIN',
        [
          ['turn', 'Turning rejoin: lead 350 KCAS, 30-45° of bank, wingmen about 400 kt', 'TURNING 350'],
          ['straight', 'Straight-ahead rejoin: lead 350 KCAS', 'STRAIGHT 350'],
        ],
      ],
    ],
  ],
  [
    'En route',
    [
      [
        'form2',
        '2-ship formation',
        '2-SHIP',
        [
          ['wedge', 'Wedge: 30-60° aft, 3,000-6,000 ft back', 'WEDGE'],
          ['la', 'Line abreast: 6,000-9,000 ft', 'LINE ABREAST'],
          ['fw', 'Fighting wing: 500-3,000 ft', 'FIGHTING WING'],
        ],
      ],
      [
        'form4',
        '4-ship formation',
        '4-SHIP',
        [
          ['box', 'Box: elements 1.5-3 NM apart', 'BOX'],
          ['spread', 'Spread four: wingmen 6,000-9,000 ft', 'SPREAD 4'],
          ['viper', 'Viper four: wingmen 4,000-6,000 ft', 'VIPER 4'],
          ['fluid', 'Fluid four', 'FLUID 4'],
        ],
      ],
      [
        'turns',
        'Turns',
        'TURNS',
        [
          ['called', 'Called turns', 'CALLED'],
          ['silent', "Radio-silent contract: the wingman never more than 90° off the lead's heading", 'SILENT 90° MAX'],
        ],
      ],
      [
        'ops',
        'Ops check',
        'OPS CHK',
        [
          ['fence', 'At FENCE in', 'AT FENCE IN'],
          ['push', 'At every push', 'EACH PUSH'],
          ['t30', 'Every 30 minutes', 'EVERY 30MIN'],
        ],
      ],
    ],
  ],
  [
    'FENCE, comms and fuel',
    [
      [
        'fence',
        'FENCE in / out',
        'FENCE',
        [
          ['full', 'In: master arm and chaff / flares armed, IFF set, lights off. Out: switches safe', 'FULL CHECK'],
          ['arm', 'Master arm only after FENCE in', 'M-ARM AFTER FENCE'],
        ],
      ],
      [
        'intra',
        'Intra-flight radio',
        'INTRA',
        [
          ['uhf2', 'UHF 2 (AUX)', 'UHF2'],
          ['vhf', 'VHF', 'VHF'],
        ],
      ],
      [
        'chatter',
        'CHATTERMARK',
        'CHATTER',
        [
          ['lead', 'Called by the flight lead, on the AUX', 'LEAD, AUX'],
          ['mc', 'Called by the mission commander', 'MC'],
        ],
      ],
      [
        'bull',
        'Bullseye check',
        'BULL CHK',
        [
          ['yes', 'After the AWACS check-in (correlated within 3 NM)', 'AFTER CHK-IN'],
          ['no', 'Not done', 'NO'],
        ],
      ],
      [
        'fuel',
        'Joker / Bingo',
        'FUEL',
        [
          ['rtb', 'Joker and Bingo called by each pilot; Bingo = RTB, no exceptions', 'BINGO = RTB'],
          ['tanker', 'Bingo = to the tanker when one is planned', 'BINGO = TANKER'],
        ],
      ],
    ],
  ],
  [
    'Recovery',
    [
      [
        'rec',
        'Recovery',
        'REC',
        [
          ['ovhd', 'Overhead at the pattern altitude of the field, break over the approach end', 'OVERHEAD'],
          [
            'tac',
            'Tactical initial: 400 KCAS max, wingmen line abreast 4,000 ft, elements 1-1.5 NM, "five mile Tac Initial", break over the EOR, 4 aircraft max',
            'TAC INITIAL',
          ],
          [
            'mra',
            'Min-risk arrival: VFR at 5,000-9,000 ft MSL, "High Initial" at 5 NM, down to the base within 3 NM',
            'MIN-RISK',
          ],
          [
            'lowtrp',
            'Low TRP: VFR entry point at 2,500 ft MSL, dead reckoning to a 6 DME straight-in at 500 ft AGL, 400 kt max',
            'LOW TRP',
          ],
          ['hightrp', 'High TRP: direct to the field, down with one 360° at most to the base', 'HIGH TRP'],
          [
            'trail',
            'Radar trail recovery: 1.5-2 NM between aircraft, 5 NM between elements, 250 KIAS at 15 DME, 180 at 10, the lead calls the speeds',
            'RADAR TRAIL',
          ],
          ['si', 'Straight-in (instrument approach)', 'STRAIGHT-IN'],
        ],
      ],
      [
        'brk',
        'Break interval',
        'BREAK',
        [
          ['2', '2 seconds', '2S'],
          ['3', '3 seconds', '3S'],
          ['4', '4 seconds', '4S'],
        ],
      ],
      [
        'sep',
        'Landing separation',
        'LDG SEP',
        [['std', '3,000 ft by day (same type), 6,000 ft at night and between formation elements', '3000/6000FT']],
      ],
      [
        'formland',
        'Formation landing',
        'FORM LDG',
        [
          ['yes', 'Allowed with a crosswind below 15 kt on a dry runway', 'XW<15KT DRY'],
          ['no', 'Not allowed', 'NO'],
        ],
      ],
      ['hung', 'Hung ordnance', 'HUNG', [['esc', 'RTB escorted, tell the tower (live or training)', 'ESCORTED RTB']]],
    ],
  ],
  [
    'Night',
    [
      [
        'nlights',
        'Exterior lights',
        'NIGHT LTS',
        [
          ['overt', 'Overt', 'OVERT'],
          ['covert', 'Covert', 'COVERT'],
          ['lead', 'As briefed by the flight lead', 'FL BRIEF'],
        ],
      ],
      [
        'strobe',
        'Strobe',
        'STROBE',
        [['rla', 'On until in reduced-lighting airspace; lights on before leaving it', 'ON TO RLA']],
      ],
      [
        'lightsout',
        'Combat lights out',
        'LTS OUT',
        [
          ['fence', 'At FENCE in', 'AT FENCE IN'],
          ['no', 'No', 'NO'],
        ],
      ],
      [
        'nvg',
        'NVG',
        'NVG',
        [
          [
            'std',
            'Goggle above 1,500 ft AGL; never for take-off, landing, IMC or refuelling; "De-goggle" and "XMAS tree" before landing',
            '>1500AGL, DEGOG B4 LDG',
          ],
        ],
      ],
      [
        'nmin',
        'Minimum altitude',
        'NIGHT MIN',
        [
          [
            'std',
            'MSA without NVG or with low illumination; 1,000 ft AGL with NVG and high illumination',
            'MSA / NVG HI 1000AGL',
          ],
        ],
      ],
      [
        'nform',
        'Night formation',
        'NIGHT FORM',
        [['box', 'Box, elements 1.5-3 NM apart, 1,000 ft stack between wingmen', 'BOX, 1000FT STACK']],
      ],
    ],
  ],
  [
    'Emergencies',
    [
      [
        'lost',
        'Lost wingman',
        'LOST WG',
        [['std', "Change altitude by 1,000 ft or more from the lead's last altitude, and call", '±1000FT + CALL']],
      ],
      ['nordo', 'NORDO', 'NORDO', [['std', 'Lights on, rendezvous and escort as briefed', 'LTS ON, AS BRIEFED']]],
    ],
  ],
];
export const SOP_TOPICS = SOP.flatMap(([, t]) => t);

// an empty choice: nothing on the card
export const emptySel = () => ({
  roe: Object.fromEntries(ROE.map(([id, , k]) => [id, k == 'many' ? [] : null])),
  sop: {},
  free: '', // other ROE lines
  sfree: '', // other SOP lines
});
const str = (v, n) => String(v == null ? '' : v).slice(0, n);
// a choice that comes from outside (a file, a preset, the network) is checked: unknown ids are dropped
export function cleanSel(s) {
  const o = emptySel();
  if (!s || typeof s != 'object') return o;
  ROE.forEach(([id, , k, , opts]) => {
    const ok = x => opts.some(p => p[0] === x),
      v = s.roe && s.roe[id];
    if (k == 'many') o.roe[id] = Array.isArray(v) ? [...new Set(v.filter(ok))] : [];
    else o.roe[id] = ok(v) ? v : null;
  });
  SOP_TOPICS.forEach(([id, , , opts]) => {
    const v = s.sop && s.sop[id];
    if (!v || typeof v != 'object') return;
    const t = {
      o: opts.some(p => p[0] === v.o) ? v.o : null,
      t: str(v.t, 120).trim(),
      c: !!v.c,
    };
    if (t.o || t.t) o.sop[id] = t;
  });
  o.free = str(s.free, 600);
  o.sfree = str(s.sfree, 600);
  return o;
}
const joinLines = (a, b) => {
  const L = a ? a.split('\n') : [];
  (b ? b.split('\n') : []).forEach(l => {
    if (l.trim() && !L.includes(l)) L.push(l);
  });
  return L.join('\n');
};
// several presets together: a single choice (weapons status, commit, a SOP topic) is the one of the last preset that has it, the lists are joined
// without repeats, a topic is on the card when one of them puts it there, the other lines are joined without repeats
export function mergeSel(list) {
  const o = emptySel();
  (list || []).map(cleanSel).forEach(s => {
    ROE.forEach(([id, , k]) => {
      if (k == 'many') o.roe[id] = [...new Set([...o.roe[id], ...s.roe[id]])];
      else if (s.roe[id]) o.roe[id] = s.roe[id];
    });
    for (const [id, t] of Object.entries(s.sop)) {
      const was = o.sop[id];
      o.sop[id] = { ...t, c: t.c || !!(was && was.c) };
    }
    o.free = joinLines(o.free, s.free);
    o.sfree = joinLines(o.sfree, s.sfree);
  });
  return o;
}
// the short text of a SOP topic: the option, or what was typed for it
export function sopShort(topic, v) {
  if (!v) return '';
  if (v.t) return v.t;
  const p = topic[3].find(x => x[0] === v.o);
  return p ? p[2] : '';
}
// the ROE box of the card: one rule a line ("WPN TIGHT", "ID: AWACS DECLARE+L16", "COMMIT 40NM", "BUGOUT: BINGO/WINCH", ...), then the other ROE lines
export function roeText(sel) {
  const s = cleanSel(sel),
    R = [];
  ROE.forEach(([id, , k, tag, opts]) => {
    const sh = x => (opts.find(p => p[0] === x) || [])[2];
    if (k == 'many') {
      const v = s.roe[id].map(sh).filter(Boolean);
      if (!v.length) return;
      if (tag) R.push(tag + ': ' + v.join(id == 'abort' ? '/' : '+'));
      else R.push(...v);
    } else if (s.roe[id]) R.push((tag ? tag + ' ' : '') + sh(s.roe[id]));
  });
  if (s.free.trim()) R.push(...s.free.split('\n').filter(l => l.trim()));
  return R.join('\n');
}
// the SOP box: one topic a line ("LTS: FLASH MOVING"), only the topics ticked for the card, then the other SOP lines
export function sopText(sel) {
  const s = cleanSel(sel),
    R = SOP_TOPICS.filter(t => s.sop[t[0]] && s.sop[t[0]].c && sopShort(t, s.sop[t[0]])).map(
      t => t[2] + ': ' + sopShort(t, s.sop[t[0]])
    );
  if (s.sfree.trim()) R.push(...s.sfree.split('\n').filter(l => l.trim()));
  return R.join('\n');
}
// the mission categories a squadron preset can be the default of (the categories of the ATO, core/ato.js)
export const ROE_CATS = [
  'Offensive Counter Air',
  'Defensive Counter Air',
  'SEAD',
  'Airstrike',
  'Air Interdiction',
  'CAS',
  'C3I',
  'Countersea',
  'Support',
  'Other',
];
// the squadron presets: [{name, sel, cats}], cats = the mission categories it is the default of
export function cleanSqPresets(a) {
  return (Array.isArray(a) ? a : [])
    .filter(p => p && typeof p.name == 'string' && p.name.trim())
    .slice(0, 50)
    .map(p => ({
      name: str(p.name.trim(), 40),
      sel: cleanSel(p.sel),
      cats: Array.isArray(p.cats) ? [...new Set(p.cats.filter(c => ROE_CATS.includes(c)))] : [],
    }));
}
// the default of a mission category: the squadron presets marked for it, joined in their order; null when there is none
export function defaultFor(presets, cat) {
  const L = cleanSqPresets(presets).filter(p => p.cats.includes(cat));
  return L.length ? mergeSel(L.map(p => p.sel)) : null;
}
// the personal presets: [{name, sel}], checked (names up to 40 letters, 50 presets at most)
export function cleanPresets(a) {
  return (Array.isArray(a) ? a : [])
    .filter(p => p && typeof p.name == 'string' && p.name.trim())
    .slice(0, 50)
    .map(p => ({ name: str(p.name.trim(), 40), sel: cleanSel(p.sel) }));
}
