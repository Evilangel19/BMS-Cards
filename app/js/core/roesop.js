// ROE / SOP of the Datacard and of the MDC (the cell ROE / SOP): the choices of the menu, the text they write on the card, the presets.
// Pure: no screen, testable in Node. The page is app/roepage.js (Squadron > ROE / SOP).
// ROE: the rules of engagement (weapons status, ID criteria, commit, bugout, other rules). SOP: the habits of the squadron, phase by phase, written in the
// long form in the menu and in a short form on the card (only the topics marked "on card"). Values from the RoKAF F-16 Basic Employment Manual and the
// 8th FW / 51st FW in-flight guides (Kunsan, Osan) and AFMAN 11-2F-16V3 (its values added as more options, "AFMAN" where the others differ); the field altitudes of the patterns are left to the field ("the pattern altitude of the field").

import { cleanFaor, faorLines, faorBox } from './faor.js';
import { cleanAg, agLines, agBox } from './agrules.js';

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
      ['awacs', 'AWACS / GCI declares the group HOSTILE (DECLARE)', 'AWACS DECLARE'],
      ['l16', 'Link 16: surveillance track or PPLI', 'L16'],
      ['nctr', 'NCTR (radar print)', 'NCTR'],
      ['iff', 'IFF: no Mode 4 reply (one source, not hostile by itself)', 'M4 NEG'],
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
      ['spike', 'MUD SPIKE: a surface threat on the RWR that is not known', 'MUD SPIKE'],
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
      ['pid', 'Positive ID of the target before release', 'PID BEF RLS'],
      ['lines', 'No release over friendly lines', 'NO RLS OVER FRND'],
      ['fox', 'FOX call on every shot', 'FOX CALLS'],
    ],
  ],
  [
    'restr',
    'Restrictions',
    'many',
    '',
    [
      ['cbu', 'No cluster munitions in urban areas', 'NO CBU URBAN'],
      [
        'nostrike',
        'No attack on the no-strike list: hospitals, places of worship, schools, protected sites',
        'NO-STRIKE LIST',
      ],
      ['jtac', 'CAS: no release without the clearance of the JTAC ("cleared hot")', 'CAS: JTAC CLR'],
      ['border', 'No fire across the border / beyond the FLOT', 'NO FIRE X-BORDER'],
      ['minrls', 'Minimum release altitude 15,000 ft (out of the MANPADS)', 'MIN RLS 15K'],
      ['radio', 'Training: no missile or gun firing without two-way radio', 'NO FIRE NORDO'],
      ['nightcue', 'Night visual attack: one more cue besides the eyes (radar, TGP, GPS, marks)', 'NIGHT: +1 CUE'],
      ['doubt', 'No release with any doubt on the friendlies or on the target', 'NO RLS IF DOUBT'],
    ],
  ],
];

// SOP: [phase, [[id, label, tag, options [id, long, short]], ...]]
export const SOP = [
  [
    'Mission',
    [
      [
        'push',
        'Push / TOT window',
        'PUSH',
        [
          ['30', '±30 s', '±30S'],
          ['60', '±1 min', '±1MIN'],
          ['120', '±2 min', '±2MIN'],
        ],
      ],
      [
        'spare',
        'Ground abort / spare',
        'SPARE',
        [
          ['takes', 'The spare launches and takes the place', 'TAKES PLACE'],
          ['short', 'The flight goes short', 'GO SHORT'],
          ['wait', 'The flight waits for the spare', 'WAIT'],
        ],
      ],
      ['abortcw', 'Abort codeword', 'ABORT', [['brief', 'As briefed', 'AS BRIEFED']]],
      [
        'bda',
        'BDA',
        'BDA',
        [
          ['fence', 'Called at FENCE out', 'AT FENCE OUT'],
          ['awacs', 'Passed to AWACS', 'TO AWACS'],
          ['debrief', 'At the debrief', 'DEBRIEF'],
        ],
      ],
      [
        'iff',
        'IFF',
        'IFF',
        [
          ['m4', 'Mode 4 checked at FENCE in, Mode 3 as in the plan', 'M4 CHK FENCE IN'],
          ['plan', 'Modes as in the plan', 'AS PLANNED'],
        ],
      ],
    ],
  ],
  [
    'Ground',
    [
      [
        'lights',
        'Anti-collision / flash',
        'LTS',
        [
          ['start', 'On / flash at engine start, when ready', 'FLASH START'],
          ['move', 'Flash as soon as the aircraft moves', 'FLASH MOVING'],
          ['hold', 'Flash at the end of the runway / holding position', 'FLASH EOR/HOLD'],
          ['rwy', 'Steady while taxiing, flash on the runway', 'FLASH RWY'],
          [
            'steady',
            'Night: strobe off and position lights steady while taxiing when they distract (AFMAN)',
            'STEADY TAXI',
          ],
        ],
      ],
      [
        'tlight',
        'Taxi / landing light',
        'TAXI/LDG LT',
        [
          ['taxi', 'Taxi light while taxiing, landing light at line-up and with the gear down', 'TAXI LT, LDG LINEUP'],
          ['ldg', 'Landing light at line-up and with the gear down only', 'LDG LINEUP'],
        ],
      ],
      [
        'taxi',
        'Taxi',
        'TAXI',
        [
          ['stag', 'Staggered, 150 ft; 25 kt max, 10 kt in turns', 'STAG 150FT'],
          ['single', 'Single file, 300 ft; 25 kt max, 10 kt in turns', 'SINGLE 300FT'],
          [
            'afman',
            'AFMAN: 150 ft staggered or 300 ft in trail; 30 kt max, 15 kt over a raised cable, 10 kt in turns',
            '150/300FT 30KT',
          ],
          ['night', 'Night: single file 300 ft on the centerline, taxi light on', 'NIGHT 300FT CL'],
        ],
      ],
      [
        'checkin',
        'Radio check-in',
        'CHK-IN',
        [
          ['start', 'At engine start: "(callsign) check-in" - "2" - "3" (PRI UHF, AUX VHF)', 'START'],
          ['taxi', 'Before taxi, then call Ground with the ATIS, departure and formation', 'BEF TAXI'],
        ],
      ],
      [
        'eor',
        'EOR',
        'EOR',
        [
          ['arm', 'Arming and de-arming at the EOR', 'ARM/DE-ARM'],
          ['hold', 'Hold for take-off at the EOR instead of on the taxiway', 'HOLD'],
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
          ['ech', 'Echelon on the runway, wingtip clearance as briefed', 'ECHELON'],
          ['slot', '#3 in the slot', '#3 SLOT'],
          ['afman', 'Wingtip clearance between all aircraft; 500 ft between separate elements', 'WINGTIP, 500FT ELEM'],
        ],
      ],
      [
        'takeoff',
        'Take-off',
        'T/O',
        [
          ['form', 'Formation take-off (element)', 'FORM'],
          ['s10', 'Single ship, 10 s interval (MIL)', '10S'],
          ['s15', 'Single ship, 15 s interval (the AFMAN minimum in AB)', '15S'],
          ['s20', 'Single ship, 20 s interval (live A-G ordnance or join-up on top)', '20S'],
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
          ['auto', 'MIL; AB when the MIL take-off roll is over 50% of the runway', 'MIL, AB >50% RWY'],
        ],
      ],
      [
        'cms',
        'Chaff / flares',
        'CMS',
        [
          ['before', 'Armed before take-off (combat only)', 'ARM BEF T/O'],
          ['fence', 'Armed at FENCE in', 'FENCE IN'],
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
          [
            'trail3',
            'Trail departure (AFMAN): 20 s, 350 KCAS, 30° of bank, 2-3 NM, 1,000 ft stack until "Tied", calls every 5,000 ft',
            'TRAIL 20S/350',
          ],
        ],
      ],
      [
        'rejoin',
        'Rejoin',
        'REJOIN',
        [
          ['turn', 'Turning rejoin: lead 350 KCAS, 30-45° of bank, wingmen about 400 kt', 'TURNING 350'],
          ['straight', 'Straight-ahead rejoin: lead 350 KCAS', 'STRAIGHT 350'],
          [
            'afman',
            '350 KCAS in the climb, 300 KCAS level until joined; VFR below a ceiling 1,500 ft / 3 SM',
            '350 CLB / 300 LVL',
          ],
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
        'blind',
        'Blind',
        'BLIND',
        [
          [
            'std',
            '"Blind" + altitude ("Blind 16.9"), the other "Visual" and talks the eyes on; both blind: the lead deconflicts by 500 ft (1,000 ft above 5,000 ft AGL)',
            'BLIND + ALT',
          ],
        ],
      ],
      [
        'lchg',
        'Lead change',
        'LEAD CHG',
        [
          [
            'std',
            'From wings level, the wingman not aft of route or 30° back; not below 500 ft AGL over land, 1,000 ft over water',
            '500/1000FT AGL',
          ],
        ],
      ],
      [
        'ops',
        'Ops check',
        'OPS CHK',
        [
          ['fence', 'At FENCE in', 'FENCE IN'],
          ['push', 'At every push', 'EACH PUSH'],
          ['t30', 'Every 30 minutes', '30 MIN'],
          [
            'afman',
            'At the level-off after take-off, when the tanks are dry ("tanks dry"), before each engagement and each range',
            'LVL OFF/TANKS/ENG',
          ],
        ],
      ],
    ],
  ],
  [
    'Tanker',
    [
      [
        'rv',
        'Rendezvous',
        'AAR',
        [
          ['pp', 'Point parallel (RV Delta): the tanker turns in front of the flight', 'POINT PARALLEL'],
          ['enr', 'En route (RV Golf): the flight joins the tanker on its route', 'EN ROUTE'],
          ['anchor', 'Anchor (RV Alpha): the tanker orbits on its track', 'ANCHOR'],
        ],
      ],
      [
        'obs',
        'Observation position',
        'AAR',
        [
          ['left', 'Left wing of the tanker (the standard), then to the boom in order', 'OBS LEFT'],
          ['right', 'Right wing of the tanker, then to the boom in order', 'OBS RIGHT'],
        ],
      ],
      [
        'order',
        'Refuelling order',
        'AAR',
        [
          ['num', 'By number: #1, #2, #3, #4', 'BY NUMBER'],
          ['low', 'Lowest fuel first', 'LOW FUEL FIRST'],
          ['quick', 'Quick flow (ATP-56): the next receiver waits in pre-contact', 'QUICK FLOW'],
        ],
      ],
      [
        'offload',
        'Offload',
        'AAR',
        [
          ['full', 'Full tanks', 'FULL'],
          ['plan', 'As planned in the fuel plan', 'AS PLANNED'],
          ['topoff', 'Top off to the Joker of the mission, then cycle', 'TOP OFF'],
        ],
      ],
      [
        'aarlost',
        'Lost wingman at the tanker',
        'AAR',
        [['std', 'Turn away from the tanker, down 1,000 ft, call; rejoin only when cleared', 'LOST: AWAY -1000FT']],
      ],
      [
        'aarnordo',
        'NORDO refuelling',
        'AAR',
        [['std', 'Visual signals of the tanker, silent boom ops (EMCON)', 'NORDO: VISUAL']],
      ],
      [
        'breakaway',
        'BREAKAWAY',
        'AAR',
        [['std', 'On "BREAKAWAY": the receiver down and back, the tanker up and forward', 'BREAKAWAY: DOWN AFT']],
      ],
      [
        'aarjoin',
        'After refuelling',
        'AAR',
        [
          ['right', 'Right wing of the tanker until the whole flight is done', 'REJOIN RIGHT'],
          ['dep', 'Depart and continue the mission, the lead calls the flight', 'DEPART ON CALL'],
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
          ['arm', 'Master arm only after FENCE in', 'M-ARM AFT FENCE'],
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
          ['lead', 'Called by the flight lead: the briefed anti-jam comm plan', 'LEAD'],
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
      [
        'fuelmin',
        'Fuel minimums',
        'FUEL MIN',
        [
          [
            'b40',
            'Block 40+: recovery fuel 1,200 lb at the initial / FAF, MIN FUEL 1,000 lb, EMER FUEL 800 lb; no AB below 2,000 lb or Bingo',
            '1200/1000/800',
          ],
          [
            'b30',
            'Block 10-32: recovery fuel 1,000 lb at the initial / FAF, MIN FUEL 800 lb, EMER FUEL 600 lb; no AB below 2,000 lb or Bingo',
            '1000/800/600',
          ],
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
          [
            'inst',
            'Standard arrival (STAR), then a TACAN or ILS approach for each aircraft, radar trail between them, straight-in',
            'STAR + ILS/TACAN',
          ],
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
        [
          [
            'std',
            '3,000 ft by day (same type, dry runway); 6,000 ft at night, on a wet runway and between formation elements',
            '3000/6000FT',
          ],
          [
            'afman',
            'AFMAN: 3,000 ft same type; 6,000 ft behind another type, a 13° approach, or with a crosswind below 8 kt (wake)',
            '3000/6000 WAKE',
          ],
        ],
      ],
      [
        'formland',
        'Formation landing',
        'FORM LDG',
        [
          ['yes', 'Allowed with a crosswind below 15 kt on a dry runway', 'XW<15KT DRY'],
          [
            'afman',
            'Formation approach: symmetric loads, 500 ft / 1.5 SM, the wingman upwind with more than 5 kt of crosswind, 10 ft wingtip',
            'SYM, 500/1.5, UPWIND',
          ],
          ['no', 'Not allowed', 'PROHIBITED'],
        ],
      ],
      [
        'hung',
        'Hung ordnance',
        'HUNG',
        [
          ['esc', 'RTB escorted, tell the tower (live or training)', 'ESCORTED RTB'],
          [
            'afman',
            'Check for damage, declare an emergency (not for inert), chase, away from towns, no trail; straight-in, no overhead with heavy ordnance',
            'CHASE, STRAIGHT-IN',
          ],
        ],
      ],
      [
        'bdchk',
        'Battle damage check',
        'BD CHK',
        [['std', 'After expending any ordnance (20 mm too), on the way back', 'AFTER ANY RLS']],
      ],
      [
        'gear',
        'Gear call',
        'GEAR',
        [
          [
            'std',
            'Gear down: 3 NM final VFR, the FAF / glide slope on instruments, the perch in the overhead, base key in an SFO',
            '3NM/FAF/PERCH',
          ],
        ],
      ],
    ],
  ],
  [
    'Weather',
    [
      [
        'wxvfr',
        'VFR minimums',
        'VFR MIN',
        [
          ['ovhd', 'Overhead / VFR pattern: 2,500 ft ceiling, 3 SM; rectangular: 2,000 ft, 3 SM', 'OVHD 2500/3'],
          ['mra', 'Min-risk arrival: ceiling 1,000 ft above the MRA altitude, 5 NM visibility', 'MRA +1000/5NM'],
          ['join', 'Join-up below a ceiling: 1,500 ft / 3 SM by day, 3,000 ft / 5 SM at night', 'JOIN 1500/3, 3000/5'],
        ],
      ],
      [
        'wxdep',
        'Departure in low weather',
        'WX DEP',
        [
          [
            'std',
            'Below 1,500 ft ceiling or 3 NM: each aircraft climbs on runway heading, no turn below 1,000 ft AGL',
            '<1500/3: RWY HDG',
          ],
        ],
      ],
      [
        'wxclr',
        'Cloud clearance (VFR)',
        'CLR',
        [
          [
            'icao',
            'ICAO (Korea): below FL100 1,500 m horizontal, 1,000 ft vertical, 5 km; at and above FL100 the same, 8 km',
            'ICAO VMC',
          ],
          [
            'faa',
            'FAA: below 10,000 ft MSL 500 ft below, 1,000 ft above, 2,000 ft horizontal, 3 SM; above 10,000 ft 1,000 ft vertical, 1 SM horizontal, 5 SM',
            'FAA VMC',
          ],
        ],
      ],
      [
        'imc',
        'IMC formation',
        'IMC',
        [
          ['route', 'Route formation, the wingman on the lead', 'ROUTE'],
          ['trail', 'Radar trail, 2 NM', 'TRAIL 2NM'],
        ],
      ],
      [
        'recall',
        'Weather recall / divert',
        'RECALL',
        [
          ['recall', 'Weather recall below the minimums of the field: back to the field, the lead calls', 'RECALL'],
          ['divert', 'Divert to the alternate when the field is below its minimums', 'DIVERT ALTN'],
        ],
      ],
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
        [
          ['rla', 'On until in reduced-lighting airspace; lights on before leaving it', 'ON TO RLA'],
          [
            'last',
            'After the join-up strobe OFF and position lights STEADY, except the last aircraft (strobe ON, FLASH)',
            'LAST A/C ON',
          ],
        ],
      ],
      [
        'lightsout',
        'Combat lights out',
        'LTS OUT',
        [
          ['fence', 'At FENCE in', 'FENCE IN'],
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
            '>1500AGL, DEGOG BEF LDG',
          ],
          [
            'afman',
            'AFMAN: up above 2,000 ft AGL in VMC after take-off; stowed 5 min before landing; stowed from the stern to the disconnect at the tanker',
            '>2000AGL, STOW 5MIN',
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
      [
        'nchg',
        'Position changes',
        'POS CHG',
        [
          [
            'std',
            'Not below 1,500 ft AGL without NVG (radar downwind excepted), called on the radio, from wings level',
            '>1500AGL',
          ],
        ],
      ],
      [
        'n30',
        'NVG horizon check',
        '30 UP/DN',
        [
          [
            'std',
            '"30 up, 30 down" after the G-Ex, before tactical maneuvering: 350 KCAS, 6,000 ft between aircraft, VMC above the MSA',
            'AFTER G-EX',
          ],
        ],
      ],
      [
        'ntolt',
        'Night take-off lights',
        'T/O LTS',
        [['afman', 'Anti-collision light on, position lights flash for the take-off (AFMAN)', 'AC ON, POS FLASH']],
      ],
    ],
  ],
  [
    'Training',
    [
      [
        'kio',
        'Knock-it-off / Terminate',
        'KIO',
        [
          [
            'std',
            '"Knock it off" stops all the flight, "Terminate" one engagement; acknowledged by callsign',
            'KIO / TERMINATE',
          ],
        ],
      ],
      [
        'floor',
        'Training floor',
        'FLOOR',
        [
          ['5k', '5,000 ft AGL', '5000AGL'],
          ['10k', '10,000 ft AGL', '10000AGL'],
        ],
      ],
      [
        'bubble',
        'Bubble',
        'BUBBLE',
        [
          ['1000', '1,000 ft around each aircraft', '1000FT'],
          ['500', '500 ft around each aircraft', '500FT'],
        ],
      ],
      [
        'marm',
        'Master arm',
        'M-ARM',
        [
          ['sim', 'SIMULATE', 'SIM'],
          ['off', 'OFF', 'OFF'],
          ['chk', 'SIMULATE, trigger check pointed away; "Check zero quantity, uncarted station"', 'SIM + TRIGGER CHK'],
        ],
      ],
      [
        'gawe',
        'G-awareness',
        'G-AWE',
        [
          ['std', 'G-awareness exercise before the first engagement', 'BEF 1ST ENGAGEMENT'],
          ['afman', 'When the planned maneuvering is over 5 G; in VMC with a horizon only, else 5 G max', '>5G, VMC'],
        ],
      ],
      [
        'shots',
        'Shots',
        'SHOTS',
        [['std', 'Simulated shots called "Fox", the kill called with the position of the target', 'FOX + KILL CALL']],
      ],
      [
        'wxag',
        'A-G weather',
        'A-G WX',
        [['std', 'Ceiling for climbing / diving deliveries 2,000 ft AGL, for level ones 1,500 ft AGL', '2000/1500AGL']],
      ],
      ['popup', 'Pop-up', 'POP-UP', [['std', 'Abort below 350 KCAS (300 KCAS above 10,000 ft AGL)', 'ABORT <350']]],
    ],
  ],
  [
    'Emergencies',
    [
      [
        'lost',
        'Lost wingman',
        'LOST WG',
        [
          ['std', "Change altitude by 1,000 ft or more from the lead's last altitude, and call", '±1000FT + CALL'],
          [
            'afman',
            'AFMAN: away 15° of bank for 15 s (#4 30° for 30 s) and call; outside the turn reverse, inside it power back; separate clearance, rejoin when cleared',
            '15°/15S, #4 30/30',
          ],
        ],
      ],
      [
        'nordo',
        'NORDO',
        'NORDO',
        [
          ['std', 'Lights on, rendezvous and escort as briefed', 'LTS ON, BRIEFED'],
          [
            'join',
            'Rejoin in route ~500 ft on a flight member, wait for the wing rock, visual signals; led home, formation approach to a drop-off',
            'REJOIN, DROP-OFF',
          ],
          ['rv', 'Hold at the briefed rendezvous; nobody by Bingo: RTB or divert', 'RV TO BINGO'],
        ],
      ],
      [
        'csar',
        'Ejection / CSAR',
        'CSAR',
        [
          [
            'std',
            'Squawk 7700, call on Guard; the wingmen stay above the spot while the fuel allows and pass it to AWACS',
            '7700, GUARD, CAP',
          ],
          [
            'afman',
            'KIO; Squawk EMER; Talk: an on-scene commander, Guard; Mark the spot; Separate above the chutes; update the Bingo, never below it',
            'SQUAWK/TALK/MARK/SEP',
          ],
        ],
      ],
      [
        'jett',
        'Jettison',
        'JETT',
        [
          ['area', 'In the briefed jettison area', 'BRIEFED AREA'],
          ['sea', 'Over the sea, away from the route', 'SEA'],
        ],
      ],
      [
        'airabort',
        'Air abort',
        'AIR ABORT',
        [
          [
            'std',
            'Abort for a flight control anomaly or departure, a flameout or engine shutdown, a lightning strike, moderate icing; escort when an emergency; the callsign numbers stay',
            'MANDATORY, ESCORT',
          ],
        ],
      ],
      [
        'toabort',
        'Take-off abort',
        'T/O ABORT',
        [
          [
            'std',
            'Callsign + intentions, "Cable, cable, cable"; hook down at or above 100 KCAS; above 120 KCAS ground emergency, hot brakes',
            'CABLE x3, HOOK >100',
          ],
        ],
      ],
    ],
  ],
];
export const SOP_TOPICS = SOP.flatMap(([, t]) => t);

// ---- custom sections (personal on this PC, and of the squadron): {id, name, tag, topics: [{id, label, tag, opts: [[id, long, short]]}]}
// They join the SOP after the built-in phases; their topics are kept in the choices like the others (ids start with "x").
const rid = () => 'x' + Math.random().toString(36).slice(2, 9);
export function cleanCustom(list) {
  const str2 = (v, n) =>
    String(v == null ? '' : v)
      .slice(0, n)
      .trim();
  return (Array.isArray(list) ? list : [])
    .filter(c => c && typeof c == 'object' && str2(c.name, 40))
    .slice(0, 20)
    .map(c => ({
      id: /^x[a-z0-9]{3,12}$/.test(c.id) ? c.id : rid(),
      name: str2(c.name, 40),
      tag: str2(c.tag, 8).toUpperCase() || str2(c.name, 6).toUpperCase(),
      topics: (Array.isArray(c.topics) ? c.topics : [])
        .filter(t => t && str2(t.label, 40))
        .slice(0, 20)
        .map(t => ({
          id: /^x[a-z0-9]{3,12}$/.test(t.id) ? t.id : rid(),
          label: str2(t.label, 40),
          tag: str2(t.tag, 10).toUpperCase(),
          opts: (Array.isArray(t.opts) ? t.opts : [])
            .filter(o => Array.isArray(o) && str2(o[2], 30))
            .slice(0, 12)
            .map((o, i) => ['o' + i, str2(o[1], 200) || str2(o[2], 30), str2(o[2], 30).toUpperCase()]),
        })),
    }));
}
// "SHORT = full text" a line -> the options of a custom topic, and back
export const optsFromText = t =>
  String(t || '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map((l, i) => {
      const k = l.indexOf('=');
      return k < 0 ? ['o' + i, l, l] : ['o' + i, l.slice(k + 1).trim(), l.slice(0, k).trim()];
    });
export const optsToText = o => (o || []).map(x => (x[1] && x[1] != x[2] ? x[2] + ' = ' + x[1] : x[2])).join('\n');
let CUSTOM = [];
export function setCustom(list) {
  CUSTOM = cleanCustom(list);
}
export const customs = () => CUSTOM;
// the SOP with the custom sections: [phase, topics, tag] and every topic as [id, label, tag, options]
export const sopAll = () => [
  ...SOP.map(([ph, T]) => [ph, T, null]),
  ...CUSTOM.map(c => [c.name, c.topics.map(t => [t.id, t.label, t.tag, t.opts]), c.tag, c.id]),
];
export const topicsAll = () => sopAll().flatMap(([, T]) => T);

// an empty choice: nothing on the card
export const emptySel = () => ({
  roe: Object.fromEntries(ROE.map(([id, , k]) => [id, k == 'many' ? [] : null])),
  sop: {},
  free: '', // other ROE lines
  sfree: '', // other SOP lines
  faor: null, // the A-A block, written by A-A > DCA / OCA (core/faor.js): its weapons control and commit unless the pilot chose them above
  ag: null, // the A-G block, written by the A-G pages (core/agrules.js): on the ROE card, not in the ROE box of the datacard
  mode: 'auto', // the SOP of the Smart card: 'auto' (the program chooses them) or 'man' (the topics ticked Smart)
  adapt: true, // Adapt to mission: the ROE of the A-A and A-G pages, and the conditions of the day on the Smart card
  manroe: false, // Manual ROE: the ROE of the pilot only, without those of the mission (datacard and Smart card)
});
const str = (v, n) => String(v == null ? '' : v).slice(0, n);
// a choice that comes from outside (a file, a preset, the network) is checked: unknown ids are dropped
export function cleanSel(s) {
  const o = emptySel();
  if (!s || typeof s != 'object') return o;
  ROE.forEach(([id, , k, , opts]) => {
    const ok = x => opts.some(p => p[0] === x),
      v = s.roe && s.roe[id];
    if (k == 'many')
      o.roe[id] = Array.isArray(v) ? opts.map(p => p[0]).filter(x => v.includes(x)) : []; // in the order of the list
    else o.roe[id] = ok(v) ? v : null;
  });
  topicsAll().forEach(([id, , , opts]) => {
    const v = s.sop && s.sop[id];
    if (!v || typeof v != 'object') return;
    const t = {
      o: opts.some(p => p[0] === v.o) ? v.o : null,
      t: str(v.t, 120).trim(),
      c: !!v.c,
      s: !!v.s, // on the Smart card first
    };
    if (t.o || t.t) o.sop[id] = t;
  });
  // the topics of custom sections not known here (a squadron section not loaded yet): kept as they are, checked for their form
  if (s.sop && typeof s.sop == 'object')
    for (const [id, v] of Object.entries(s.sop)) {
      if (o.sop[id] || !/^x[a-z0-9]{3,12}$/.test(id) || !v || typeof v != 'object') continue;
      const t = { o: /^o\d{1,2}$/.test(v.o) ? v.o : null, t: str(v.t, 120).trim(), c: !!v.c, s: !!v.s };
      if (t.o || t.t) o.sop[id] = t;
    }
  o.free = str(s.free, 600);
  o.sfree = str(s.sfree, 600);
  o.faor = cleanFaor(s.faor);
  o.ag = cleanAg(s.ag);
  o.mode = s.mode === 'man' ? 'man' : 'auto';
  o.adapt = s.adapt !== false;
  o.manroe = !!s.manroe;
  return o;
}
// the short text of a SOP topic: the option, or what was typed for it
export function sopShort(topic, v) {
  if (!v) return '';
  if (v.t) return v.t;
  const p = topic[3].find(x => x[0] === v.o);
  return p ? p[2] : '';
}
// the ROE of the mission (the A-A and A-G blocks) count: Adapt to mission on, Manual ROE off. The blocks stay in the choices, they are only not written.
export const msnOn = s => !!(s && s.adapt !== false && !s.manroe);
const eff = s => (msnOn(s) ? s : { ...s, faor: null, ag: null });
// the lines of the A-A block without those that a choice of the pilot replaces (weapons status, commit): a choice of the pilot wins
export function faorOwn(s, long) {
  if (!s.faor) return [];
  return faorLines(s.faor, long).filter(
    l => !(s.roe.ws && /^(FEZ )?(WPN|Weapons) /.test(l)) && !(s.roe.commit && /^(COMMIT |Commit:)/.test(l))
  );
}
// the ROE box of the card: one rule a line ("WPN TIGHT", "ID: AWACS DECLARE+L16", "COMMIT 40NM", "BUGOUT: BINGO/WINCH", ...), then the other ROE lines
export function roeText(sel) {
  const s = eff(cleanSel(sel)),
    R = [];
  ROE.forEach(([id, , k, tag, opts]) => {
    const sh = x => (opts.find(p => p[0] === x) || [])[2];
    // the A-A block of the flight: its weapons control and commit when the pilot did not choose them, then its main rule
    if (s.faor && id == 'ws' && !s.roe.ws) return R.push('WPN ' + s.faor.wpn.toUpperCase());
    if (s.faor && id == 'commit')
      return R.push(s.roe.commit ? tag + ' ' + sh(s.roe.commit) : 'COMMIT ' + s.faor.commit + 'NM', faorBox(s.faor));
    if (k == 'many') {
      const v = s.roe[id]
        .filter(x => !(s.ag && (x == 'minrls' || x == 'pid'))) // in the A-G block
        .map(sh)
        .filter(Boolean);
      if (!v.length) return;
      if (tag) R.push(tag + ': ' + v.join(id == 'abort' ? '/' : '+'));
      else R.push(...v);
    } else if (s.roe[id]) R.push((tag ? tag + ' ' : '') + sh(s.roe[id]));
  });
  R.push(...agBox(s.ag)); // the A-G block of the flight
  if (s.free.trim()) R.push(...s.free.split('\n').filter(l => l.trim()));
  return R.join('\n');
}
// the SOP box: one topic a line ("LTS: FLASH MOVING"), only the topics ticked for the card, then the other SOP lines
// the SOP box: one line a phase with the topics ticked for the card, joined in the short form ("T/O: 20S · AB · DEP COMBAT"), then the other SOP lines.
// A word goes before the short form of the topics that would not read alone (MINI); the phase has its own short name (PHASE_TAG).
export const PHASE_TAG = {
  Mission: 'MSN',
  Training: 'TRNG',
  Ground: 'GND',
  'Take-off and departure': 'T/O',
  'En route': 'ENR',
  'FENCE, comms and fuel': 'COMMS',
  Tanker: 'AAR',
  Recovery: 'REC',
  Weather: 'WX',
  Night: 'NIGHT',
  Emergencies: 'EMER',
};
export const MINI = {
  taxi: 'TAXI',
  checkin: 'CHK-IN',
  eor: 'EOR',
  cms: 'CMS',
  dep: 'DEP',
  rejoin: 'REJOIN',
  form2: '2-SHIP',
  form4: '4-SHIP',
  turns: 'TURNS',
  ops: 'OPS CHK',
  fence: 'FENCE',
  intra: 'INTRA',
  chatter: 'CHATTER',
  bull: 'BULL CHK',
  brk: 'BRK',
  sep: 'SEP',
  formland: 'FORM LDG',
  hung: 'HUNG',
  strobe: 'STROBE',
  lightsout: 'LTS OUT',
  nvg: 'NVG',
  nmin: 'MIN ALT',
  nform: 'FORM',
  lost: 'LOST WG',
  nordo: 'NORDO',
  obs: '',
  offload: 'OFFLOAD',
  order: 'ORDER',
  wxdep: 'WX DEP',
  imc: 'IMC',
  wxvfr: 'VFR',
  push: 'PUSH',
  spare: 'SPARE',
  abortcw: 'ABORT',
  bda: 'BDA',
  iff: 'IFF',
  floor: 'FLOOR',
  bubble: 'BUBBLE',
  marm: 'M-ARM',
  gawe: 'G-AWE',
  csar: 'CSAR',
  jett: 'JETT',
  blind: '',
  lchg: 'LEAD CHG',
  fuelmin: 'REC/MIN/EMER',
  bdchk: 'BD CHK',
  gear: 'GEAR',
  nchg: 'POS CHG',
  n30: '30 UP/DN',
  wxag: 'A-G WX',
  popup: 'POP-UP',
  airabort: 'AIR ABORT',
  toabort: 'T/O ABORT',
};
export const phaseOf = id => (sopAll().find(([, T]) => T.some(t => t[0] == id)) || [''])[0];
export function sopText(sel) {
  const s = cleanSel(sel),
    R = [];
  sopAll().forEach(([ph, T, ctag]) => {
    const items = T.filter(t => s.sop[t[0]] && s.sop[t[0]].c && sopShort(t, s.sop[t[0]])).map(t => {
      const v = s.sop[t[0]],
        mini = ctag ? t[2] : MINI[t[0]];
      return v.t || (mini ? mini + ' ' : '') + sopShort(t, v);
    });
    if (items.length) R.push((ctag || PHASE_TAG[ph] || ph) + ': ' + items.join(' · '));
  });
  if (s.sfree.trim()) R.push(...s.sfree.split('\n').filter(l => l.trim()));
  return R.join('\n');
}
// what a box of the card holds: the program measures the text in the box (setBoxFit, app/roepage.js: as much as fits at the smallest size); without
// it (the tests in Node) BOX_MAX lines
export const BOX_MAX = 5;
const nl = t => (t ? t.split('\n').filter(l => l.trim()).length : 0);
let FITS = t => nl(t) <= BOX_MAX;
export const setBoxFit = f => (FITS = f);
export const boxFits = t => FITS(t);
// a choice cut to the boxes: the last SOP topics on the card lose the tick, the last ROE choices of the lists go, then the other lines
export function capSel(sel) {
  const s = cleanSel(sel);
  const sf = s.sfree.split('\n').filter(l => l.trim());
  while (!boxFits(sopText(s)) && sf.length) {
    sf.pop();
    s.sfree = sf.join('\n');
  }
  // the last phases on the card lose their ticks
  const T = topicsAll().filter(t => s.sop[t[0]] && s.sop[t[0]].c);
  for (let i = T.length - 1; i >= 0 && !boxFits(sopText(s)); i--) s.sop[T[i][0]].c = false;
  const rf = s.free.split('\n').filter(l => l.trim());
  while (!boxFits(roeText(s)) && rf.length) {
    rf.pop();
    s.free = rf.join('\n');
  }
  for (const [id, , kind] of [...ROE].reverse()) {
    while (kind == 'many' && s.roe[id].length && !boxFits(roeText(s))) s.roe[id].pop();
  }
  for (const [id, , kind] of [...ROE].reverse()) if (kind == 'one' && !boxFits(roeText(s))) s.roe[id] = null;
  return s;
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
// a preset copied back and forth got " (sq)" added to its name: the same name without them, to find the copies
const baseName = n => String(n || '').replace(/( \(sq\))+$/i, '');
const catsOf = c => (Array.isArray(c) ? [...new Set(c.filter(x => ROE_CATS.includes(x)))] : []);
// the same preset twice (same name without the " (sq)", same choices): the first stays; a name left with " (sq)" loses them when it is free
function dedupe(L) {
  const seen = new Set(),
    out = [];
  L.forEach(p => {
    const k = baseName(p.name).toLowerCase() + '\u0000' + JSON.stringify(p.sel);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(p);
  });
  out.forEach(p => {
    const b = baseName(p.name);
    if (b != p.name && b && !out.some(q => q !== p && q.name.toLowerCase() == b.toLowerCase())) p.name = b;
  });
  return out;
}
// the squadron presets: [{name, sel, cats, std}]. One of them is the Standard of the squadron (std: every flight starts from it); in the lists saved
// before there was a Standard, the first preset is it.
export function cleanSqPresets(a) {
  const L = dedupe(
    (Array.isArray(a) ? a : [])
      .filter(p => p && typeof p.name == 'string' && p.name.trim())
      .slice(0, 50)
      .map(p => ({
        name: str(p.name.trim(), 40),
        sel: { ...cleanSel(p.sel), faor: null, ag: null },
        cats: catsOf(p.cats),
        std: !!p.std,
      }))
  );
  const i = Math.max(
    0,
    L.findIndex(p => p.std)
  );
  L.forEach((p, j) => (p.std = j == i));
  return L;
}
// the preset a flight gets by itself (pure): src 'sq' = the squadron's presets win, 'me' = mine (the squadron's are not looked at); the first preset
// marked "Default for" the kind of mission of the flight, else the Standard of that list (Squadron: the squadron's; Flight: mine; the other one
// when that one is empty). {k, sel}: k = 'q<i>' (in the
// squadron list), 'm<i>' (in mine) or 'std'; null when there is nothing to put
export function pickDefault({ sq = [], mine = [], myStd = null, src = 'sq', cat = '' }) {
  const S = cleanSqPresets(sq),
    M = cleanPresets(mine),
    useSq = src == 'sq' && S.length;
  const i = useSq ? S.findIndex(p => !p.std && p.cats.includes(cat)) : M.findIndex(p => p.cats.includes(cat));
  if (cat && i >= 0) return { k: (useSq ? 'q' : 'm') + i, sel: capSel((useSq ? S : M)[i].sel) };
  const E = JSON.stringify(emptySel()),
    st = S.find(p => p.std),
    my = cleanSel(myStd),
    sqs = st && JSON.stringify(st.sel) != E ? st.sel : null,
    mys = JSON.stringify(my) != E ? my : null,
    sel = useSq ? sqs || mys : mys || sqs; // Squadron: its Standard (mine when it has none); Flight: mine (the squadron's when I have none)
  return sel ? { k: 'std', sel: capSel(sel) } : null;
}
// the personal presets: [{name, sel, cats}] (cats: the kinds of mission they are the default of), checked (names up to 40 letters, 50 presets at most)
export function cleanPresets(a) {
  return dedupe(
    (Array.isArray(a) ? a : [])
      .filter(p => p && typeof p.name == 'string' && p.name.trim())
      .slice(0, 50)
      .map(p => ({
        name: str(p.name.trim(), 40),
        sel: { ...cleanSel(p.sel), faor: null, ag: null },
        cats: catsOf(p.cats),
      }))
  );
}

// the whole text of the choices (the card for the kneeboard): ROE by section with the full text of each choice, SOP by phase with the topic and the full
// text of its option (every topic chosen, ticked for the card or not), then the other lines
export function fullText(sel) {
  const s = eff(cleanSel(sel)),
    roe = [],
    sop = [];
  if (s.faor) roe.push(['A-A' + (s.faor.kind ? ' · ' + s.faor.kind : ''), faorOwn(s, true)]);
  if (s.ag) roe.push(['A-G · ' + s.ag.kind, agLines(s.ag, true)]);
  ROE.forEach(([id, lab, k, , opts]) => {
    if (s.faor && (id == 'ws' || id == 'commit') && !s.roe[id]) return; // in the A-A block
    const L = (k == 'many' ? s.roe[id] : s.roe[id] ? [s.roe[id]] : [])
      .filter(v => !(s.ag && (v == 'minrls' || v == 'pid'))) // in the A-G block
      .map(v => (opts.find(o => o[0] === v) || [])[1])
      .filter(Boolean);
    if (L.length) roe.push([lab, L]);
  });
  sopAll().forEach(([ph, T]) => {
    const L = T.filter(t => s.sop[t[0]] && (s.sop[t[0]].o || s.sop[t[0]].t)).map(t => {
      const v = s.sop[t[0]];
      return [t[1], v.t || (t[3].find(o => o[0] === v.o) || [])[1] || ''];
    });
    if (L.length) sop.push([ph, L]);
  });
  const lines = t => t.split('\n').filter(l => l.trim());
  return { roe, sop, roeFree: lines(s.free), sopFree: lines(s.sfree) };
}

// ---- THE SMART ROE / SOP CARD (app/roepage.js): which SOP topics go on it, in which order of importance.
// The conditions of the mission (pages.js roeCtx), in the order they win when more than one is true: IMC at the departure / landing field, marginal
// weather (MVFR or worse) at the departure field / landing field / target, night, training, a tanker, an A-G mission, over the enemy.
export const SMART_CONDS = ['imcDep', 'imcArr', 'wxDep', 'wxArr', 'wxTgt', 'night', 'train', 'tank', 'ag', 'enemy'];
// THE RULES of each SOP topic: [tier, fixed, {condition: rule}]. Tier: A flight safety, B procedures, C routine (A goes first when everything does
// not fit). Fixed: always on the Smart card when it has a value. Rule of a condition that is true (the first one in SMART_CONDS wins): 'in' (the
// topic goes on the card when it has a value), 'first' (an Emergency at the top), 'out' (not on the card), {o, ok} / {t} (on the card with this
// option or text, even without a choice; a choice in ok is already right). The topics of the own sections: tier C, no rule.
// Checked with AFMAN 11-2F-16V3 (16 April 2026).
export const SMART_RULES = {
  // Mission
  push: ['B', 1],
  spare: ['C', 1],
  abortcw: ['B', 0],
  bda: ['C', 0, { enemy: 'in' }],
  iff: ['B', 1],
  // Ground
  lights: ['C', 0, { night: { o: 'steady' } }],
  tlight: ['C', 0],
  taxi: ['C', 0, { night: { o: 'night' } }],
  checkin: ['C', 0],
  eor: ['C', 0],
  // Take-off and departure
  lineup: ['C', 0],
  takeoff: ['B', 1],
  power: ['B', 0],
  cms: ['B', 0],
  dep: ['B', 1, { imcDep: { o: 'sid', ok: ['trail', 'trail3'] }, wxDep: { o: 'trail', ok: ['trail3', 'sid'] } }],
  rejoin: ['B', 1],
  // En route
  form2: ['C', 0],
  form4: ['C', 0],
  turns: ['C', 1, { imcDep: { o: 'called' }, imcArr: { o: 'called' }, enemy: { o: 'silent' } }],
  blind: ['B', 1],
  lchg: ['C', 0],
  ops: ['B', 1, { enemy: 'in' }],
  // Tanker
  rv: ['B', 0, { tank: 'in' }],
  obs: ['B', 0, { tank: 'in' }],
  order: ['B', 0, { tank: 'in' }],
  offload: ['B', 0, { tank: 'in' }],
  aarlost: ['A', 0, { tank: 'in' }],
  aarnordo: ['A', 0, { tank: 'in' }],
  breakaway: ['A', 0, { tank: 'in' }],
  aarjoin: ['B', 0, { tank: 'in' }],
  // FENCE, comms and fuel
  fence: ['B', 1],
  intra: ['C', 0],
  chatter: ['B', 0],
  bull: ['B', 1],
  fuel: ['A', 0],
  fuelmin: ['A', 1],
  // Recovery
  rec: ['B', 1, { imcArr: { o: 'inst', ok: ['trail', 'si'] }, wxArr: { o: 'trail', ok: ['inst', 'si'] } }],
  brk: ['B', 1, { imcArr: { t: 'SINGLE SHIP' }, wxArr: { t: 'STRAIGHT-IN, NO OVHD' } }],
  sep: ['B', 0],
  formland: ['B', 1, { imcArr: { o: 'no' }, wxArr: { o: 'no' } }],
  hung: ['B', 0, { ag: 'in' }],
  bdchk: ['B', 1, { ag: 'in' }],
  gear: ['C', 0],
  // Weather
  wxvfr: ['B', 0, { wxDep: 'in', wxArr: 'in', wxTgt: 'in' }],
  wxdep: ['B', 0, { wxDep: 'in' }],
  wxclr: ['C', 0, { wxDep: 'in', wxArr: 'in', wxTgt: 'in' }],
  imc: ['A', 0, { wxDep: 'in', wxArr: 'in', wxTgt: 'in' }],
  recall: ['A', 0, { wxArr: 'in' }],
  // Night
  nlights: ['C', 0, { night: 'in' }],
  strobe: ['C', 0, { night: 'in' }],
  lightsout: ['B', 0, { night: 'in' }],
  nvg: ['B', 0, { night: 'in' }],
  nmin: ['A', 0, { night: 'in' }],
  nform: ['B', 0, { night: 'in' }],
  nchg: ['C', 0, { night: 'in' }],
  n30: ['A', 0, { night: 'in' }],
  // Training
  kio: ['A', 0, { train: 'in' }],
  floor: ['A', 0, { train: 'in' }],
  bubble: ['A', 0, { train: 'in' }],
  marm: ['B', 0, { train: 'in' }],
  gawe: ['C', 0, { train: 'in' }],
  shots: ['C', 0, { train: 'in' }],
  wxag: ['B', 0, { train: 'in' }],
  popup: ['A', 0, { train: 'in' }],
  // Emergencies
  lost: ['A', 0],
  nordo: ['A', 0],
  csar: ['A', 0, { enemy: 'first' }],
  jett: ['A', 0],
  airabort: ['A', 0],
  toabort: ['A', 0],
  // Night
  ntolt: ['B', 0, { night: 'in' }],
};
// for the page: a condition in words, and its tag on the card
const WHY = {
  imcDep: 'IMC at take-off',
  imcArr: 'IMC at landing',
  wxDep: 'marginal weather at take-off',
  wxArr: 'marginal weather at landing',
  wxTgt: 'marginal weather at the target',
  night: 'night',
  train: 'training',
  tank: 'tanker',
  ag: 'A-G mission',
  enemy: 'over the enemy',
};
const TAG = { night: 'NIGHT', train: 'TRNG', tank: 'AAR', ag: 'A-G', enemy: 'THREAT' };
// THE RULES IN USE: the defaults above with the rows that the pilot or the squadron changed (rulesSet). A changed row:
// {tier: 'A' | 'B' | 'C', fx: true | false, c: {condition: rule}} (the rows of the table of the page, and of its Export / Import text)
let RULES = SMART_RULES;
const RULE_ID = /^x[a-z0-9]{3,12}$/; // a topic of an own section
const cleanRule = v =>
  v === 'in' || v === 'first' || v === 'out'
    ? v
    : v && typeof v == 'object' && typeof v.o == 'string' && /^[\w-]{1,12}$/.test(v.o)
      ? { o: v.o }
      : v && typeof v == 'object' && typeof v.t == 'string' && v.t.trim()
        ? {
            t: v.t
              .replace(/[\r\n]+/g, ' ')
              .trim()
              .slice(0, 60),
          }
        : null;
// the changed rows that come from outside (this PC, the squadron, a text pasted) are checked: unknown topics, conditions and values are dropped
export function cleanRules(o) {
  const out = {};
  if (!o || typeof o != 'object') return out;
  for (const [id, r] of Object.entries(o)) {
    if (!(SMART_RULES[id] || RULE_ID.test(id)) || !r || typeof r != 'object') continue;
    const c = {};
    if (r.c && typeof r.c == 'object')
      SMART_CONDS.forEach(k => {
        const v = cleanRule(r.c[k]);
        if (v) c[k] = v;
      });
    out[id] = { tier: ['A', 'B', 'C'].includes(r.tier) ? r.tier : 'C', fx: !!r.fx, c };
  }
  return out;
}
// a row of the defaults in the form of a changed row (the page compares and shows them)
export function ruleRow(id) {
  const d = SMART_RULES[id] || ['C', 0, {}],
    c = {};
  Object.entries(d[2] || {}).forEach(([k, v]) => (c[k] = typeof v == 'string' ? v : v.o ? { o: v.o } : { t: v.t }));
  return { tier: d[0], fx: !!d[1], c };
}
// the same as the default: the row is not kept
export const ruleSame = (id, r) => JSON.stringify(cleanRules({ [id]: r })[id]) === JSON.stringify(ruleRow(id));
// put the changed rows in use (none: the defaults). An option of the default keeps the options that are already right for it (ok)
export function rulesSet(over) {
  const o = cleanRules(over);
  RULES = { ...SMART_RULES };
  for (const [id, r] of Object.entries(o)) {
    const d = (SMART_RULES[id] && SMART_RULES[id][2]) || {},
      c = {};
    Object.entries(r.c).forEach(([k, v]) => (c[k] = typeof v == 'object' && v.o && d[k] && d[k].o === v.o ? d[k] : v));
    RULES[id] = [r.tier, r.fx ? 1 : 0, c];
  }
}
export const tierOf = id => (RULES[id] ? 'ABC'.indexOf(RULES[id][0]) : 2);
const fixedOf = id => !!(RULES[id] && RULES[id][1]);
// the rule of a topic that applies today: [condition, rule], or null
function ruleOf(id, ctx) {
  const R = RULES[id] && RULES[id][2];
  if (!R || !ctx) return null;
  const k = SMART_CONDS.find(c => ctx[c] && R[c]);
  return k ? [k, R[k]] : null;
}
// the change of a topic on the Smart card today (Adapt to mission), or null: {o (the option of the day, or null), t (a text), tag, say (for the page)}
export function smartLink(sel, id, ctx) {
  const s = cleanSel(sel),
    r = s.adapt && ruleOf(id, ctx);
  if (!r || typeof r[1] == 'string') return null;
  const [k, x] = r,
    v = s.sop[id];
  if (v && v.o && x.o && (v.o === x.o || (x.ok || []).includes(v.o))) return null; // the choice is already right for the day
  const T = topicsAll().find(t => t[0] === id),
    sh = x.o ? ((T && T[3].find(o => o[0] === x.o)) || [])[2] || x.o : x.t;
  return { o: x.o || null, t: x.t || '', tag: TAG[k] || 'WX', say: sh + ' (' + WHY[k] + ')' };
}
// the SOP topics of the Smart card, most important first (what the pilot wrote comes before the fixed topics): [{id, ph (phase), txt (short, with its MINI), tag}]; emerg: the Emergencies, for the
// box at the bottom. ctx: the conditions of SMART_CONDS (true / false); not used with Adapt to mission off. The rules: SMART_RULES. MANUAL: only the
// topics ticked Smart (the day changes their value), nothing to fill the space.
export function smartSop(sel, ctx0 = {}) {
  const s = cleanSel(sel),
    ctx = s.adapt ? ctx0 || {} : {},
    man = s.mode === 'man',
    all = sopAll(),
    T = all.flatMap(([ph, L, ctag]) => L.map(t => ({ t, ph, ctag }))),
    item = (x, lk) => {
      const v = lk && lk.o ? { o: lk.o, t: lk.t } : lk && lk.t ? { t: lk.t } : s.sop[x.t[0]],
        mini = x.ctag ? x.t[2] : MINI[x.t[0]],
        sh = v ? v.t || sopShort(x.t, v) : '';
      return sh
        ? { id: x.t[0], ph: x.ph, txt: v.t && !lk ? v.t : (mini ? mini + ' ' : '') + sh, tag: lk ? lk.tag : '' }
        : null;
    },
    out = [],
    seen = new Set(),
    kind = x => {
      const r = ruleOf(x.t[0], ctx);
      return r ? (typeof r[1] == 'string' ? r[1] : 'set') : '';
    },
    add = (x, force) => {
      if (!x || seen.has(x.t[0]) || kind(x) == 'out') return;
      const lk = smartLink(s, x.t[0], ctx);
      if (!force && !s.sop[x.t[0]] && !lk) return;
      const it = item(x, lk);
      if (it) {
        seen.add(x.t[0]);
        out.push(it);
      }
    },
    byTier = L => [...L].sort((a, b) => tierOf(a.t[0]) - tierOf(b.t[0])),
    body = x => x.ph != 'Emergencies';
  if (man) {
    // the topics that the day changes first, then by tier
    const lk = x => (smartLink(s, x.t[0], ctx) ? 1 : 0),
      E = byTier(T.filter(x => s.sop[x.t[0]] && s.sop[x.t[0]].s)).sort((a, b) => lk(b) - lk(a));
    E.filter(body).forEach(x => add(x));
    return {
      items: out,
      fill: [],
      emerg: E.filter(x => !body(x))
        .map(x => item(x, null))
        .filter(Boolean),
    };
  }
  // 1. the topics that the day changes (written even without a choice)
  byTier(T.filter(x => body(x) && smartLink(s, x.t[0], ctx))).forEach(x => add(x, true));
  // 2. what the pilot wrote (a free text, a topic of an own section): always, first
  byTier(
    T.filter(x => {
      const v = s.sop[x.t[0]];
      return body(x) && v && ((v.t && !v.o) || !!x.ctag);
    })
  ).forEach(x => add(x));
  // 3. the topics that a condition of the mission brings in, in the order of the conditions (IMC and weather first)
  SMART_CONDS.forEach(
    k => ctx[k] && byTier(T.filter(x => body(x) && kind(x) == 'in' && ruleOf(x.t[0], ctx)[0] == k)).forEach(x => add(x))
  );
  // 4. the fixed topics
  byTier(T.filter(x => fixedOf(x.t[0]))).forEach(x => add(x));
  const core = out.length;
  // 5. to fill the space left after the Emergencies: the other topics chosen, by tier
  byTier(T.filter(x => body(x) && s.sop[x.t[0]])).forEach(x => add(x));
  // the Emergencies: those that a condition puts first (CSAR over the enemy), then by tier
  const E = byTier(T.filter(x => !body(x) && s.sop[x.t[0]] && kind(x) != 'out'))
    .sort((a, b) => (kind(b) == 'first') - (kind(a) == 'first'))
    .map(x => item(x, null))
    .filter(Boolean);
  return { items: out.slice(0, core), fill: out.slice(core), emerg: E };
}
// the items that fit, back in the order of the flight (phase by phase, as the SOP lists them), one line for each phase: [tag of the phase, text]
export function smartSopLines(items) {
  const all = sopAll(),
    ord = id =>
      all.findIndex(([, T]) => T.some(t => t[0] === id)) * 100 +
      all.flatMap(([, T]) => T).findIndex(t => t[0] === id) / 1000,
    S = [...items].sort((a, b) => ord(a.id) - ord(b.id)),
    out = [];
  S.forEach(it => {
    const ctag = (all.find(([ph]) => ph === it.ph) || [])[2],
      head = ctag || PHASE_TAG[it.ph] || it.ph.toUpperCase(),
      t = it.txt + (it.tag ? ' (' + it.tag + ')' : ''),
      last = out[out.length - 1];
    if (last && last[0] === head) last[1] += ' · ' + t;
    else out.push([head, t]);
  });
  // [text, red, n]: the tag of the phase and its bar (n characters) in bold on the card: "ENR| TURNS CALLED · …"
  return out.map(([h, t]) => [h + '| ' + t, false, h.length + 1]);
}
// the four ROE of the key box of the Smart card, short: weapons status, ID, commit, bugout (the A-A block gives its weapons control and commit when
// the pilot did not choose them)
export function roeKey(sel) {
  const s = eff(cleanSel(sel)),
    sh = (id, v) => {
      const r = ROE.find(x => x[0] === id),
        o = r && r[4].find(x => x[0] === v);
      return o ? o[2] : '';
    },
    many = (id, j) =>
      (Array.isArray(s.roe[id]) ? s.roe[id] : [])
        .map(v => sh(id, v))
        .filter(Boolean)
        .join(j);
  return {
    wpn: s.faor && !s.roe.ws ? s.faor.wpn.toUpperCase() : sh('ws', s.roe.ws).replace(/^WPN(S)?\s*/i, ''),
    id: many('id', '+'),
    commit: s.faor && !s.roe.commit ? s.faor.commit + 'NM' : sh('commit', s.roe.commit).replace(/^COMMIT\s*/i, ''),
    bugout: many('abort', '/'),
  };
}
