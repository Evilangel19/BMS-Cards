"""The Smart cards (core/smartcard.js) drawn in the browser on made-up data: a pop-up computed by core/popup.js over a made-up hill with a town, a bridge
and an enemy unit, in the light and the dark look (the page white / near black, the red of the limits kept, the contour lines drawn), a text card and a
weather card (core/smartwx.js) of a made-up route.
Usage: python3 tools/smartcard-test.py [folder for the pictures]"""
import os, subprocess, sys, time, base64
HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE)
from playwright.sync_api import sync_playwright
PORT = 8951
OUT = sys.argv[1] if len(sys.argv) > 1 else ''
srv = subprocess.Popen([sys.executable, R + '/tools/serve.py', str(PORT), '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
JS = r"""async () => {
  const S = await import('/app/js/core/smartcard.js'), K = await import('/app/js/core/cardink.js'), Pp = await import('/app/js/core/popup.js');
  const T = { n: 0, e: 0 }, r = Pp.computePopup(T, T, { diveAngle: 20, releaseAltitude: 3500, ingressAltitude: 500, releaseSpeed: 480, heading: 339, headingMode: 'attack', side: 'right', egressHeading: 289, egressTurn: 'set', rangeModel: 'low_drag', ripplePulses: 2, stickSpacing: 75, profileType: 2 });
  const v = r.v, segs = [['ingress', [r.action, r.pup]], ['climb', [r.pup, r.pdp]], ['pull', r.arc], ['dive', [r.map, r.release]], ['fall', [r.release, T]], ['egress', [r.release, Pp.project(r.release, 289, 6000)]]];
  const marks = [[r.action, 'ACT', ''], [r.pup, 'PUP 279°', ''], [r.pdp, 'PDP', ''], [r.release, 'REL 339°', ''], [r.oa, 'OA1', 'dia']];
  const pts = [...segs.flatMap(z => z[1]), T], [e0, e1, n0, n1] = S.planBox(pts, 436 / 246), nx = 120, ny = Math.round(nx * 246 / 436), h = [];
  const H = (e, n) => 150 + 180 * Math.sin(e / 650) * Math.cos(n / 830) + 120 * Math.sin((e + n) / 410) + 2600 * Math.exp(-((e - 9000) ** 2 + (n + 8000) ** 2) / 4e7) + 1800 * Math.exp(-((e + 6000) ** 2 + (n - 9000) ** 2) / 3e7) - (e + n < -45000 ? 400 : 0);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) h.push(Math.max(0, H(e0 + (i + .5) / nx * (e1 - e0), n1 - (j + .5) / ny * (n1 - n0))));
  const al = p => -Math.hypot(p.n, p.e);
  const A = { title: 'ATK · POP-UP T2', right: 'HAMMER 6', key: [['TGT', 'STPT 6'], ['TOT', '09:25'], ['ATK HDG', '339°'], ['WPN', '2×MK82'], ['PUP', '3.4 NM'], ['APEX', S.fmt(v.apexAltitude)], ['REL', S.fmt(3500)], ['MRA', S.fmt(v.mra), true]],
    side: { segs: [['ingress', [[al(r.action), 500], [al(r.pup), 500]]], ['climb', [[al(r.pup), 500], [al(r.pdp), v.pulldownAltitude], [al(r.map) - 1500, v.apexAltitude], [al(r.map), v.trackAltitude], [al(r.release), 3500]]], ['fall', [[al(r.release), 3500], [0, 0]]]], marks: [[al(r.pup), 500], [al(r.pdp), v.pulldownAltitude], [al(r.release), 3500]], labels: [[al(r.pup), 500, 'PUP 30°'], [al(r.pdp), v.pulldownAltitude, 'PDWN ' + S.fmt(v.pulldownAltitude)], [al(r.release), 3500, 'REL 3 500']], line: { h: v.mra, label: 'MRA ' + S.fmt(v.mra) }, ter: [...Array(40)].map((_, k) => [al(r.action) * (1 - k / 39) + 2500 * k / 39, 150 + 900 * Math.exp(-(((al(r.action) * (1 - k / 39)) + 16000) ** 2) / 4e7)]), x0: al(r.action), x1: 2500 },
    plan: { segs, marks, target: T, grid: { e0, e1, n0, n1, nx, ny, h }, ingress: 500, refs: [{ k: 'town', n: 9000, e: -14000, label: 'HWACHEON' }, { k: 'bridge', n: -4000, e: -6000, label: 'BRG 12' }, { k: 'unit', n: -19000, e: 14000, label: 'ARMOR BN' }, { k: 'obst', n: -2000, e: 12000, label: 'TWR' }] },
    foot: [['INGRESS', 'PULL 279°', '480 KCAS', '500 ft'], ['ROLL-IN', 'CLIMB 30°', 'AOD ' + S.fmt(v.aod), 'TRACK 5 s'], ['BOMB', 'TOF ' + v.timeOfFall.toFixed(1) + ' s', 'AD1 4 s ARM', '2 × 75 ft']], last: 'OA1 339° ' + S.fmt(v.aod) + ' ft · EGR 289°' };
  const mk = (f, D) => { const c = document.createElement('canvas'); c.width = S.SC_W; c.height = S.SC_H; f(c.getContext('2d'), D); return c; };
  const px = (c, a, b) => Array.from(c.getContext('2d').getImageData(a, b, 1, 1).data.slice(0, 3));
  const reds = c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 16) if (d[i] > 160 && d[i] - d[i + 1] > 80 && d[i] - d[i + 2] > 80) n++; return n; };
  const light = mk(S.drawSmartAttack, A), dark = K.otherLook(() => mk(S.drawSmartAttack, A));
  const roe = mk(S.drawSmartText, { title: 'ROE / SOP · STRIKE', right: 'HAMMER 6', key: [['WPN STATE', 'TIGHT'], ['ID', '2 SRC'], ['MIN ALT', '500 AGL'], ['LASER', '1688'], ['JOKER', '4 500'], ['BINGO', '3 500', true], ['PUSH', '09:05'], ['ABORT', '09:30', true]], blocks: [['ENGAGE', ['Air: hostile by AWACS + NCTR, or visual', 'SAM / AAA: self-defence only', ['No release without TGT visual or TGP', true]]], ['SOP', ['Fence in at IP, fence out at egress', 'Deconfliction: #2 +30 s, 1.5 NM, 1000 ft above, and a long line that has to be wrapped onto the next line of the card']]], foot: [['ALTERNATE', 'RKTN', '140° 62 NM'], ['RTB', 'FL250', 'STPT 8-9'], ['HARD DECK', '5 000', 'FLOOR 1000 AGL']], last: 'ROE preset: STANDARD STRIKE' });
  const WX = await import('/app/js/core/smartwx.js');
  const route = [0, 20, 69, 100].map((d, i) => ({ x: d, y: 0, alt: i == 0 || i == 3 ? 500 : 25000, t: 9 * 3600000 + d * 8000, n: i + 1, d }));
  const prof = [...Array(81)].map((_, k) => { const d = k * 100 / 80; return { d, x: d, y: 0, t: 0, alt: 0, cond: d > 50 && d < 85 ? 2 : 1, cu: d > 50 && d < 85 ? 9000 : 6000, dens: d > 50 && d < 85 ? 9 : 5, size: 3, tcu: d > 60 && d < 70 ? 1 : 0, fogEnd: d > 95 ? 2 : 60, tt: 15, contrail: 29000, elev: 300 + 1800 * Math.exp(-((d - 45) ** 2) / 120) }; });
  const W = { at: () => ({ t: 15 }), wind: (x, y, a) => ({ hdg: 270, spd: Math.round(a / 600) }) };
  const wx = mk(WX.drawSmartWeather, { title: 'Hammer 6 · 2× F-16C · Strike', sub: 'Weather at 09:25Z (hourly maps)', dep: 9 * 3600000, tot: 9 * 3600000 + 25 * 60000, route, tgt: 2, depId: 'RKJK', ldgId: 'RKSO', prof, at: () => W, contrail: [29000], reports: [{ lab: 'DEP RKJK  METAR', text: 'RKJK 0900Z 24008KT 9999 SCT060 15/08 Q1013 NOSIG', col: 'GRN' }, { lab: 'TGT  TAF', text: 'TAF 0812 27015KT 6000 -SHRA BKN090 TEMPO 0910 3000 TSRA BKN040CB' }, { lab: 'LDG RKSO  METAR', text: 'RKSO 1100Z 25010KT 9999 FEW050 13/06 Q1012', col: 'BLU' }, { lab: 'ALTN RKTN  METAR', text: 'RKTN 1100Z 00000KT 0800 FG OVC003', col: 'RED' }] });
  const CB = await import('/app/js/core/smartcombo.js'), Wt = WX.wxAtTarget({ title: 'x', dep: 0, tot: 0, route, tgt: 2, prof, at: () => W, reports: [{ lab: 'DEP RKJK  METAR', text: 'RKJK 0900Z 24008KT 9999 SCT060 Q1013', col: 'GRN' }, { lab: 'TGT  TAF', text: 'TAF 0812 27015KT 6000 -SHRA BKN090 TEMPO 0910 3000 TSRA BKN040CB' }] }, 3000);
  const combo = mk(CB.drawSmartCombined, { title: 'MISSION · POP-UP T2', right: 'HAMMER 6 · PKG 4007', key: A.key, mod: { kind: 'attack', label: 'ATTACK · POP-UP T2', side: A.side, line: 'PULL 279° 480 KCAS 500 ft · CLIMB 30° · TOF 8.5 s AD1 4 s ARM' }, tgt: { key: [['TARGET', 'BRIDGE 12'], ['ELEV', '420'], ['DMPI', '2'], ['ATK HDG', '339°'], ['LAT', 'N38°23.45'], ['LONG', 'E126°48.94'], ['STATUS', '100 %']], cx: 0, cy: 0, feats: [{ x: -0.05, y: 0, kind: 'span' }, { x: 0.05, y: 0.02, kind: 'span' }, { x: 0.2, y: 0.15, kind: 'ware' }], dmpis: [{ x: -0.05, y: 0, n: 1 }, { x: 0.05, y: 0.02, n: 2 }], hdgTrue: 339 }, wx: Wt, windLabel: 'WIND 3k', check: { label: 'APEX 5 298 < BASE 9 000 \u2713' }, roe: { key: [['JOKER', '4500'], ['BINGO', '3500', true], ['LASER', '1688'], ['M3', '4521'], ['PRESET', 'STANDARD']], blocks: [['ENGAGE', ['No release without TGT visual / TGP', 'SAM / AAA: self-defence only']], ['SOP', ['#2 +30 s, 1.5 NM']]] }, last: ['OA1 339° 3 960 ft · EGR 289° · GS 451 kt', ''] });
  return { combo: combo.toDataURL(), wx: wx.toDataURL(), size: [light.width, light.height], bg: [px(light, 800, 2390), px(dark, 800, 2390)], bar: [px(light, 20, 20), px(dark, 20, 20)], reds: [reds(light), reds(dark)], png: [light.toDataURL(), dark.toDataURL(), roe.toDataURL()] };
}"""
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:%d/app/index.html' % PORT); pg.wait_for_timeout(1500)
        r = pg.evaluate(JS)
        check('the card: 1600 x 2400, as every card of the Kneeboard %s' % r['size'], r['size'] == [1600, 2400])
        check('light: white page, black title bar %s' % r['bg'][0], min(r['bg'][0]) > 240 and max(r['bar'][0]) < 60)
        check('dark: the page near black, the title bar turned light %s %s' % (r['bg'][1], r['bar'][1]), max(r['bg'][1]) < 40 and min(r['bar'][1]) > 150)
        check('the limits in red in both looks (MRA, the enemy unit) %s' % r['reds'], r['reds'][0] > 200 and r['reds'][1] > 200)
        check('the Smart Weather card drawn', len(r['wx']) > 20000)
        check('the combined Smart card drawn', len(r['combo']) > 20000)
        check('no page errors %s' % errs[:2], not errs)
        if OUT:
            for i, n in enumerate(('light', 'dark', 'roe')):
                open(os.path.join(OUT, 'sc_%s.png' % n), 'wb').write(base64.b64decode(r['png'][i].split(',')[1]))
            open(os.path.join(OUT, 'sc_wx.png'), 'wb').write(base64.b64decode(r['wx'].split(',')[1]))
            open(os.path.join(OUT, 'sc_combo.png'), 'wb').write(base64.b64decode(r['combo'].split(',')[1]))
        b.close()
finally:
    srv.terminate()
print('ALL OK' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
