// Pop-up engine: golden values (cross-checked against the UOAF bms_html_briefing computer on 300 random cases).
import { computePopup, bombFall, DEFAULTS, norm, project, dist, bearing, offsetRow } from '../app/js/core/popup.js';
let n = 0,
  bad = 0;
const ck = (name, ok) => {
  n++;
  if (!ok) {
    bad++;
    console.log('FAIL', name);
  }
};
const near = (a, b, t = 0.15) => Math.abs(a - b) <= t;
const T = { n: 120000, e: 100000 },
  R = { n: 100000, e: 100000 };
const a = computePopup(T, R, { turnG: 3.5 });
ck('defaults: PUP position', near(a.pup.n, 101411.1) && near(a.pup.e, 105943.2));
ck('defaults: pull-down altitude and AOD', near(a.v.pulldownAltitude, 2957.5) && near(a.v.aod, 2696.5));
ck('defaults: low-drag bomb range', near(a.v.bombRange, 4767.6));
ck(
  'defaults: offsets for the NAV OFFSETS rows (bearing 0.1 deg, range ft)',
  a.offsets.pup.brg === 76.6 && a.offsets.pup.rng === 6108 && a.offsets.oa.brg === 360 && a.offsets.oa.rng === 22697
);
ck(
  'defaults: MRA = altitude loss + 120 ft buffer',
  near(a.v.mra, 737.3) && near(a.v.mra - a.v.altitudeLoss, 120, 0.001)
);
const b = computePopup(T, R, {
  diveAngle: 30,
  releaseAltitude: 5000,
  releaseSpeed: 480,
  heading: 90,
  side: 'left',
  turnG: 5,
  ripplePulses: 4,
  stickSpacing: 200,
  rangeModel: 'high_drag',
});
ck(
  'left turn, high drag, ripple stick',
  near(b.pup.n, 130559.5) && near(b.pup.e, 89138.4) && near(b.v.pulldownAltitude, 6619.4) && near(b.v.mra, 1822.7)
);
const c = computePopup(T, R, {
  turnG: 3.5,
  diveAngle: 20,
  heading: 200,
  headingMode: 'ingress',
  rangeModel: 'manual',
  bombRange: 4800,
  stickMode: 'start',
  ripplePulses: 2,
  stickSpacing: 300,
});
ck(
  'ingress heading, manual range, stick from the start',
  near(c.pup.n, 130021.1) && near(c.pup.e, 115522.6) && near(c.v.aod, 695) && c.v.bombRange === 4800
);
ck(
  'attack and ingress headings differ by twice the climb angle',
  near(norm(a.v.attackHeading - a.v.ingressHeading), norm(2 * a.v.climbAngle)) ||
    near(norm(a.v.ingressHeading - a.v.attackHeading), 2 * a.v.climbAngle)
);
ck(
  'the route reaches the MAP: arc ends on it',
  dist(a.arc[a.arc.length - 1], a.map) < 5 && dist(a.map, T) > dist(a.release, T)
);
ck(
  'Type 2: PUP is on the pull heading, pupToPdp before the PDP; the line-up point (VRP) is behind it',
  near(bearing(a.pup, a.pdp), a.v.pullHeading, 0.01) &&
    near(dist(a.pup, a.pdp), a.v.pupToPdp, 0.5) &&
    near(dist(a.vrp, a.pup), 15000, 0.5) &&
    near(bearing(a.vrp, a.pup), a.v.pullHeading, 0.01)
);
ck(
  'errors: negative AOD, ingress above the pull-down, bad ranges',
  /AOD/.test(computePopup(T, R, { rangeModel: 'manual', bombRange: 20000 }).error) &&
    /Ingress altitude/.test(computePopup(T, R, { ingressAltitude: 4000 }).error) &&
    /outside valid/.test(computePopup(T, R, { diveAngle: 0 }).error)
);
const t1 = computePopup(T, R, {
    profileType: 1,
    heading: 251,
    diveAngle: 30,
    releaseAltitude: 5000,
    ingressAltitude: 150,
    vrpToPup: 8000,
  }),
  t1l = computePopup(T, R, { profileType: 1, side: 'left', heading: 251 });
ck(
  'Type 1: straight in over the target, first turn away by the offset angle onto the pull heading',
  t1.v.profileType === 1 &&
    near(bearing(t1.pup, T), t1.v.approachHeading, 0.01) &&
    t1.v.offsetAngle > 5 &&
    dist(t1.firstArc[t1.firstArc.length - 1], t1.climbStart) < 1 &&
    near(norm(t1.v.approachHeading - t1.v.pullHeading), t1.v.offsetAngle, 0.01)
);
ck(
  'Type 1: the line-up point is on the line through the PUP and the target',
  near(bearing(t1.vrp, T), t1.v.approachHeading, 0.01) &&
    near(dist(t1.vrp, t1.pup), 8000, 0.5) &&
    near(norm(t1l.v.pullHeading - t1l.v.approachHeading), t1l.v.offsetAngle, 0.01)
);
ck(
  'pull heading is the attack heading turned away by the angle off',
  near(norm(t1.v.attackHeading - t1.v.pullHeading), 80, 0.001) && t1.v.angleOff === 80
);
ck('bearings run 1-360: north is 360, never 0', offsetRow({ n: 0, e: 0 }, { n: 100, e: 0 }).brg === 360);
ck(
  'helpers',
  near(norm(-10), 350, 1e-9) &&
    near(dist({ n: 0, e: 0 }, project({ n: 0, e: 0 }, 90, 100)), 100, 1e-9) &&
    near(bombFall(2000, 520, 15, 'low_drag').range, 4767.6)
);
const d = computePopup(T, R, { oa2Mode: 'target' }),
  e = computePopup(T, R, { oa2Mode: 'egress', egressRange: 8000 }),
  f = computePopup(T, R, {});
ck(
  'OA2: off by default, on the target, or out along the egress',
  f.oa2 === null &&
    f.offsets.oa2 === null &&
    near(dist(d.oa2, T), 0, 0.001) &&
    near(dist(e.oa2, T), 8000, 0.01) &&
    near(bearing(T, e.oa2), e.v.attackHeading, 0.01) &&
    d.offsets.oa2.rng === 20000 &&
    d.offsets.oa2.brg === 360
);
const g1 = computePopup(T, R, { oa2Mode: 'egress', egressTurn: 'left', egressAngle: 60 }),
  g2 = computePopup(T, R, { oa2Mode: 'egress', egressTurn: 'right', egressAngle: 30 });
ck(
  'egress turn: none keeps the attack heading, left / right turn by the angle',
  near(norm(bearing(T, e.oa2) - e.v.attackHeading), 0, 0.01) &&
    near(norm(g1.v.attackHeading - bearing(T, g1.oa2)), 60, 0.01) &&
    near(norm(bearing(T, g2.oa2) - g2.v.attackHeading), 30, 0.01) &&
    near(dist(g1.oa2, T), 10000, 0.01)
);
ck(
  'turn G is a whole number 3-5 by default',
  DEFAULTS.turnG === 3 && computePopup(T, R, { turnG: 5 }).v.turnRadius < computePopup(T, R, { turnG: 3 }).v.turnRadius
);
const im = computePopup(T, R, {
    ripplePulses: 4,
    stickSpacing: 200,
    stickMode: 'mid',
    releaseMode: 'pair',
    heading: 90,
  }),
  is = computePopup(T, R, { ripplePulses: 3, stickSpacing: 100, stickMode: 'start' });
ck(
  'impact points: mid centres the stick on the target, start begins on it, pair doubles the bombs, time follows the spacing',
  im.impacts.length === 4 &&
    near(im.impacts[0].d, -300, 0.001) &&
    near(im.impacts[3].d, 300, 0.001) &&
    im.impacts.every(q => q.bombs === 2) &&
    near(dist(im.impacts[1], T), 100, 0.01) &&
    is.impacts[0].d === 0 &&
    is.impacts[2].d === 200 &&
    is.impacts[0].bombs === 1 &&
    near(is.impacts[1].t, 100 / is.v.groundSpeed / 1.68781, 0.001)
);
const fz = computePopup(T, R, { ad1: 4, ad2: 9 }),
  fc = computePopup(T, R, { fuzeMode: 'c2', ad1: 1.5, burstAltitude: 500 }),
  fh = computePopup(T, R, { fuzeMode: 'c2', burstAltitude: 5000 });
ck(
  'fuze C1: armed when the time of fall is longer than the delay, where the bomb is at that moment',
  fz.fuze.ad1.armed &&
    !fz.fuze.ad2.armed &&
    fz.fuze.ad1.alt > 0 &&
    fz.fuze.ad1.alt < 2000 &&
    fz.fuze.ad1.x > 0 &&
    fz.fuze.ad1.x < fz.v.bombRange &&
    near(fz.fuze.tof, fz.v.timeOfFall, 1e-9) &&
    fz.fuze.burst === null
);
ck(
  'fuze C2: burst at the set altitude, short of the impact point; above the release altitude it opens at once',
  fc.fuze.ad2 === null &&
    near(fc.fuze.burst.alt, 500, 5) &&
    fc.fuze.burst.shortBy > 0 &&
    fc.fuze.burst.shortBy < fc.v.bombRange &&
    fc.fuze.burst.armedFirst === true &&
    fh.fuze.burst.x === 0 &&
    fh.fuze.burst.alt === 2000
);
ck(
  'OA2 elevation: zero on the target, the egress altitude on the egress',
  computePopup(T, R, { oa2Mode: 'target' }).oa2Alt === 0 &&
    computePopup(T, R, { oa2Mode: 'egress', egressAltitude: 3500 }).oa2Alt === 3500
);
// turn direction: the final turn rolls out on the attack heading turning the way chosen (right = clockwise = heading increases), the climb is on the other side
{
  const hd = (p, q) => bearing(p, q),
    turned = a => {
      const h0 = hd(a.arc[0], a.arc[1]),
        h1 = hd(a.arc[a.arc.length - 2], a.arc[a.arc.length - 1]);
      return norm(h1 - h0);
    };
  for (const side of ['right', 'left']) {
    const t = computePopup(T, R, {
      side,
      heading: 90,
      headingMode: 'attack',
      diveAngle: 30,
      releaseAltitude: 5000,
      ingressAltitude: 500,
    });
    const tn = turned(t),
      right = side === 'right';
    ck(
      side + ' turn: the final arc turns ' + side + ' by the angle off',
      right ? near(tn, t.v.angleOff, 8) : near(tn, 360 - t.v.angleOff, 8)
    );
    ck(
      side + ' turn: climb heading is on the ' + (right ? 'left' : 'right') + ' of the attack heading',
      right
        ? near(norm(t.v.attackHeading - t.v.pullHeading), t.v.angleOff, 0.01)
        : near(norm(t.v.pullHeading - t.v.attackHeading), t.v.angleOff, 0.01)
    );
    const pr = computePopup(T, R, { side, profileType: 1, heading: 251, ingressAltitude: 150 }),
      f = pr.firstArc,
      fn = norm(hd(f[f.length - 2], f[f.length - 1]) - hd(f[0], f[1]));
    ck(side + ' turn, Type 1: the first turn goes the other way', right ? fn > 180 : fn < 180);
  }
  const e = d =>
    computePopup(T, R, { headingMode: 'attack', heading: 90, oa2Mode: 'egress', egressTurn: d, egressAngle: 30 }).v
      .egressHeading;
  ck(
    'egress left / right turn the heading the right way',
    near(e('left'), 60, 0.01) && near(e('right'), 120, 0.01) && near(e('none'), 90, 0.01)
  );
  const eh = h =>
    computePopup(T, R, { headingMode: 'attack', heading: 90, oa2Mode: 'egress', egressTurn: 'set', egressHeading: h });
  ck(
    'egress heading set: absolute heading 1-360, and the OA2 lies on it',
    near(eh(250).v.egressHeading, 250, 0.01) &&
      near(norm(eh(360).v.egressHeading), 0, 0.01) &&
      near(bearing(eh(250).target, eh(250).oa2), 250, 1)
  );
}
console.log(bad ? 'popup: ' + bad + ' FAILED' : 'popup: ' + n + '/' + n + ' checks passed');
process.exit(bad ? 1 : 0);
