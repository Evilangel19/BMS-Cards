// The A-G rules of the manuals (core/agrules.js) and the A-G block of the ROE (core/roesop.js sel.ag). Made-up attacks, no campaign.
import { agChecks, agLines, agAttack, cleanAg, casOf, POPUP_KCAS, CEIL_AGL, TOSS_MAX } from '../app/js/core/agrules.js';
import { fullText, cleanSel, emptySel } from '../app/js/core/roesop.js';
import { TOSS_LIMITS } from '../app/js/core/strike.js';

let n = 0,
  bad = 0;
const ck = (name, ok) => {
  n++;
  if (!ok) {
    bad++;
    console.log('FAIL', name);
  }
};

// the airspeed: CAS = TAS at sea level, less up high
ck('CAS is the TAS at sea level', Math.abs(casOf(400, 0) - 400) < 0.01);
ck('CAS at 10 000 ft is about 85 % of the TAS', Math.abs(casOf(400, 10000) / 400 - 0.86) < 0.02);

// the pop-up: 380 kt TAS at 2 000 ft AGL is over 350 KCAS, 340 is not
{
  const ok = agChecks({ mode: 'popup', v: { releaseSpeed: 380, releaseAltitude: 2000 }, elev: 0, base: null }),
    slow = agChecks({ mode: 'popup', v: { releaseSpeed: 340, releaseAltitude: 2000 }, elev: 0, base: null });
  ck('pop-up at 380 kt: no flag', !ok.flags.releaseSpeed && ok.list.length == 0);
  ck('pop-up at 340 kt: the speed slider is red', /350 KCAS/.test(slow.flags.releaseSpeed || ''));
  ck('pop-up at 340 kt: one red line', slow.list.length == 1);
  // the same TAS over a high target is fewer KCAS
  const hi = agChecks({ mode: 'popup', v: { releaseSpeed: 380, releaseAltitude: 2000 }, elev: 6000, base: null });
  ck('pop-up at 380 kt over a target at 6 000 ft: under 350 KCAS', !!hi.flags.releaseSpeed);
  ck(
    'the limit is only for the pop-up',
    !agChecks({ mode: 'hadb', v: { releaseSpeed: 300 }, elev: 0 }).flags.releaseSpeed
  );
}

// the ripple: 10 ft at 450 kt is 13 ms (red), 75 ft is 99 ms
{
  const a = agChecks({ mode: 'hadb', v: { releaseSpeed: 450, stickSpacing: 10, ripplePulses: 4 } }),
    b = agChecks({ mode: 'hadb', v: { releaseSpeed: 450, stickSpacing: 75, ripplePulses: 4 } }),
    c = agChecks({ mode: 'hadb', v: { releaseSpeed: 450, stickSpacing: 10, ripplePulses: 1 } });
  ck('10 ft at 450 kt: under the 60 ms of the racks', /ms/.test(a.flags.stickSpacing || ''));
  ck('75 ft at 450 kt: fine', !b.flags.stickSpacing);
  ck('a single bomb has no spacing', !c.flags.stickSpacing);
}

// the ceiling: a base 1 500 ft over the target is red, 3 000 is not, no weather is no line
{
  const lo = agChecks({ mode: 'toss', v: {}, elev: 500, base: 2000 }),
    hi = agChecks({ mode: 'toss', v: {}, elev: 500, base: 3500 }),
    no = agChecks({ mode: 'toss', v: {}, elev: 500, base: null });
  ck(
    'base 1 500 ft AGL: a red line',
    lo.list.length == 1 && /1500 ft AGL/.test(lo.list[0]) && /2000 ft/.test(lo.list[0])
  );
  ck('base 3 000 ft AGL: nothing', hi.list.length == 0);
  ck('no weather: nothing', no.list.length == 0);
}

// the toss: at most 45°
ck('toss release angle ends at ' + TOSS_MAX + '°', TOSS_LIMITS.releaseAngle[1] == TOSS_MAX);

// the block
{
  const p = agAttack('popup', 1200, true),
    t = agAttack('toss', 800, false);
  ck(
    'pop-up block: kind, abort 350, ceiling',
    p.kind == 'POP-UP' && p.abort == POPUP_KCAS && p.ceil == CEIL_AGL && p.night
  );
  ck('toss block: no abort speed', t.kind == 'TOSS' && t.abort == null && !t.night);
  const L = agLines(p, false);
  ck(
    'pop-up lines',
    L.includes('MIN RLS 1 200 AGL') &&
      L.includes('ABORT <350 KCAS') &&
      L.includes('PID BEF RLS') &&
      L.includes('NIGHT: +1 CUE')
  );
  ck('no release heading, push time or attack axis', !L.some(x => /RLS HDG|PUSH|ATTACK AXIS/.test(x)));
  ck('toss lines: no night, no abort', !agLines(t, false).some(x => /NIGHT|ABORT/.test(x)));
  ck('SEAD lines', agLines(cleanAg({ kind: 'SEAD', harm: 'POS EOM' }), false)[0] == 'HARM POS EOM');
  const d = agLines(cleanAg({ kind: 'DEAD', tactic: 'shooter-cover', harm: '' }), true);
  ck('DEAD lines: tactic, no HARM line without HARM', d[0] == 'DEAD: SHOOTER-COVER' && !d.some(x => /^HARM/.test(x)));
  ck('an unknown kind is no block', cleanAg({ kind: 'NUKE' }) == null && cleanAg(null) == null);
  ck('text is cleaned', cleanAg({ kind: 'SEAD', harm: '<img src=x>' }).harm == 'IMG SRCX');
}

// the ROE: the block goes to the card, the PID and MIN RLS choices of the lists step aside
{
  const s = emptySel();
  s.roe.extra = ['pid'];
  s.roe.restr = ['minrls'];
  const plain = fullText(s).roe.flat(2).join('|');
  ck(
    'without the block the choices are there',
    /Positive ID of the target before release/.test(plain) && /15,000/.test(plain)
  );
  s.ag = agAttack('hadb', 900, false);
  const R = fullText(s).roe,
    txt = R.flat(2).join('|');
  ck(
    'with the block: the A-G section',
    R.some(r => r[0] == 'A-G · HADB')
  );
  ck(
    'with the block: the list choices step aside',
    !/15,000/.test(txt) && !txt.includes('Positive ID of the target before release')
  );
  ck(
    'cleanSel keeps the block, drops a bad one',
    cleanSel(s).ag.kind == 'HADB' && cleanSel({ ...s, ag: { kind: 'x' } }).ag == null
  );
}

console.log(bad ? 'FAIL - ' + bad + ' of ' + n : 'OK - ' + n + ' A-G rule checks');
process.exit(bad ? 1 : 0);
