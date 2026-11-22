// @ts-check
// The rules of the A-G pages that the manuals give, and the A-G block of the ROE of the flight. Pure functions, no DOM.
// TO 1F-16CM-34-1-1 BMS: the CCRP release angle 0-45° (a toss is at most 45°), the least release interval of the racks (MAU-12 / TER-9/A 60 ms, SUU-20
// 200 ms); the minimum acceptable release altitude is core/lethal.js. AFMAN 11-2F-16 Vol 3 (April 2026): 6.6 a pop-up is aborted under 350 KCAS (300
// KCAS above 10 000 ft AGL); 6.5 no climbing or diving delivery under a ceiling of 2 000 ft AGL (1 500 ft for a level one); 6.7 the target positively
// identified before the release, at night one more cue than the eyes.
export const POPUP_KCAS = 350,
  POPUP_KCAS_HIGH = 300,
  HIGH_AGL = 10000,
  CEIL_AGL = 2000,
  RACK_MS = 60,
  TOSS_MAX = 45;

// calibrated airspeed (kt) of a true airspeed at an altitude (ft MSL), standard atmosphere
export function casOf(tas, altFt) {
  const s = Math.pow(Math.max(0.05, 1 - 6.8756e-6 * Math.max(0, altFt)), 4.2559);
  return tas * Math.sqrt(s);
}

// THE CHECKS of an attack: o {mode: 'popup' | 'hadb' | 'toss', v (the inputs and values of the attack: releaseSpeed (TAS), releaseAltitude (ft AGL),
// stickSpacing (ft), ripplePulses), elev (ft MSL of the target) | null, base (the cloud base over the target, ft MSL) | null}
// -> {flags {slider: text} (the sliders turn red), list [text] (the red lines of the page)}
export function agChecks(o) {
  const flags = {},
    list = [],
    v = o.v || {},
    elev = o.elev || 0;
  if (o.mode == 'popup' && v.releaseSpeed) {
    const agl = +v.releaseAltitude || 0,
      lim = agl > HIGH_AGL ? POPUP_KCAS_HIGH : POPUP_KCAS,
      cas = casOf(+v.releaseSpeed, agl + elev);
    if (cas < lim) {
      const m =
        'Pop-up at ' + Math.round(cas) + ' KCAS: under ' + lim + ' KCAS the attack is aborted (AFMAN 11-2F-16V3 6.6).';
      flags.releaseSpeed = m;
      list.push(m);
    }
  }
  const n = +v.ripplePulses || 1,
    sp = +v.stickSpacing || 0;
  if (n > 1 && sp > 0 && v.releaseSpeed) {
    const ms = (sp / (+v.releaseSpeed * 1.68781)) * 1000;
    if (ms < RACK_MS) {
      const m =
        'Spacing ' +
        sp +
        ' ft at ' +
        Math.round(+v.releaseSpeed) +
        ' kt: ' +
        Math.round(ms) +
        ' ms between bombs, under the ' +
        RACK_MS +
        ' ms of the racks (TO 4.2.7.6).';
      flags.stickSpacing = m;
      list.push(m);
    }
  }
  if (o.base != null) {
    const b = o.base - elev;
    if (b < CEIL_AGL) {
      const m =
        'Cloud base ' +
        Math.max(0, Math.round(b / 100) * 100) +
        ' ft AGL over the target: no climbing or diving delivery under ' +
        CEIL_AGL +
        ' ft (AFMAN 11-2F-16V3 6.5).';
      list.push(m);
    }
  }
  return { flags, list };
}

// THE A-G BLOCK of the ROE (core/roesop.js sel.ag): kind POP-UP | HADB | TOSS | SEAD | DEAD; mra (ft AGL), abort (KCAS), night, ceil (ft AGL),
// harm ('POS EOM', 'HAS', 'HAD'...), tactic (DEAD)
const KINDS = ['POP-UP', 'HADB', 'TOSS', 'SEAD', 'DEAD'];
export function cleanAg(b) {
  if (!b || typeof b != 'object' || !KINDS.includes(b.kind)) return null;
  const n = (x, a, c) => Math.max(a, Math.min(c, Math.round(+x || 0))),
    t = (x, k) =>
      String(x || '')
        .replace(/[^A-Z0-9 /+-]/gi, '')
        .toUpperCase()
        .slice(0, k);
  return {
    kind: b.kind,
    mra: b.mra == null ? null : n(b.mra, 0, 60000),
    abort: b.abort == null ? null : n(b.abort, 0, 1000),
    night: !!b.night,
    ceil: b.ceil == null ? null : n(b.ceil, 0, 10000),
    harm: t(b.harm, 10),
    tactic: t(b.tactic, 16),
  };
}
const ft = v => Math.round(v).toLocaleString('en-US').replace(/,/g, ' ');
/** its lines: short (the ROE page, the Smart ROE card) or long (the ROE card) */
export function agLines(b, long) {
  if (!b) return [];
  if (b.kind == 'SEAD')
    return long
      ? ['HARM ' + b.harm, 'Preemptive: the HARMs hit before the package enters the WEZ', 'MAGNUM call at every launch']
      : ['HARM ' + b.harm, 'PREEMPTIVE: IMPACT BEFORE PKG IN WEZ', 'MAGNUM CALLS'];
  if (b.kind == 'DEAD')
    return long
      ? [
          'DEAD: ' + b.tactic,
          ...(b.harm ? ['HARM ' + b.harm] : []),
          'Positive ID of the SAM before the release',
          'MAGNUM (HARM) / RIFLE (Maverick) call at every launch',
        ]
      : ['DEAD ' + b.tactic, ...(b.harm ? ['HARM ' + b.harm] : []), 'PID BEF RLS', 'MAGNUM / RIFLE CALLS'];
  return long
    ? [
        ...(b.mra != null ? ['Minimum release altitude ' + ft(b.mra) + ' ft AGL'] : []),
        ...(b.abort ? ['Pop-up aborted under ' + b.abort + ' KCAS'] : []),
        'Positive ID of the target before the release',
        ...(b.night ? ['Night: one more cue than the eyes (radar, TGP, GPS, marks)'] : []),
        ...(b.ceil ? ['No diving or climbing delivery under a ceiling of ' + ft(b.ceil) + ' ft AGL'] : []),
      ]
    : [
        ...(b.mra != null ? ['MIN RLS ' + ft(b.mra) + ' AGL'] : []),
        ...(b.abort ? ['ABORT <' + b.abort + ' KCAS'] : []),
        'PID BEF RLS',
        ...(b.night ? ['NIGHT: +1 CUE'] : []),
        ...(b.ceil ? ['CEILING ' + ft(b.ceil) + ' AGL'] : []),
      ];
}
/** the block of an attack page */
export function agAttack(mode, mra, night) {
  return cleanAg({
    kind: mode == 'popup' ? 'POP-UP' : mode == 'hadb' ? 'HADB' : 'TOSS',
    mra,
    abort: mode == 'popup' ? POPUP_KCAS : null,
    night,
    ceil: CEIL_AGL,
  });
}
