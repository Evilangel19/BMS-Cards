"""A-A > OCA (1.3.0-beta.75) in the browser on a made-up package: a SWEEP and an ESCORT, the position on the package, the checks, the A-A block written to
the ROE, the DTC lines, the classic, Smart OCA and Smart mission cards. No BMS file.
Usage: python3 tools/oca-test.py [folder for the pictures]"""
import os, subprocess, sys, time, base64
HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE)
sys.path.insert(0, HERE); import dialogs
from playwright.sync_api import sync_playwright
PORT = 8957
OUT = sys.argv[1] if len(sys.argv) > 1 else ''
srv = subprocess.Popen([sys.executable, R + '/tools/serve.py', str(PORT), '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
# strikers north at 480 kt from the push (09:00) to the target (09:10), egress east; my sweep 3 min ahead; an SA-6 on the way; the bullseye south-west
SETUP = r"""a => {
  const [kind, o] = Array.isArray(a) ? a : [a, {}];
  const K = 1.852, T0 = 9 * 3600000, mk = (n, x, y, t, act) => ({ x, y, z: -2500, arr: t, dep: t, act, n }),
    R = [mk(1, 600, 300, T0 - 600000, 1), mk(2, 600, 400, T0, 2), mk(3, 600, 400 + 40 * K, T0 + 300000, 0), mk(4, 600, 400 + 80 * K, T0 + 600000, 17), mk(5, 600 + 40 * K, 400 + 80 * K, T0 + 900000, 0), mk(6, 600 + 80 * K, 400 + 80 * K, T0 + 1200000, 0)],
    me = [mk(1, 590, 300, T0 - 900000, 1), mk(2, 590, 400 + 24 * K, T0, 2), mk(3, 600, 400 + 104 * K, T0 + 600000, 11), mk(4, 600, 300, T0 + 2400000, 7)];
  window.__OC = { roe: null };
  const X = { ok: true, me: { key: '88', name: 'Eagle 4', mission: kind, kind, n: 2, ac: 'F-15C', pkgNo: 4012, team: 2, tag: 'EAGLE 4 · PKG 4012', w: me },
    prot: [{ name: 'Hammer 6', w: R, tgt: { x: 600, y: 400 + 80 * K, n: 4, t: T0 + 600000 } }], sams: [{ x: 620, y: 400 + 60 * K, r: 15 * K, name: 'SA-6' }],
    bull: { x: 560, y: 380 }, joker: '6 000', bingo: '5 000', aa: '6× AIM-120C · 2× AIM-9M' };
  X.main = X.prot[0];
  if (o.sun != null) X.sun = () => o.sun;
  if (o.indep) {
    // a sweep alone in its package, three sweep steerpoints in a zig-zag (as BMS makes them)
    const z = [mk(1, 590, 300, T0 - 900000, 1), mk(2, 600, 380, T0 - 300000, 2), mk(3, 620, 470, T0, 11), mk(4, 560, 520, T0 + 400000, 11), mk(5, 650, 540, T0 + 900000, 11), mk(6, 600, 300, T0 + 2400000, 7)];
    X.me.w = z; X.prot = []; X.main = { name: 'Eagle 4', w: z, tgt: { x: 620, y: 470, n: 3, t: T0 }, end: 5 }; X.indep = true;
  }
  __app.ocaPage._test({ ctx: () => X, timeline: () => [{ cls: 'MiG-29A', mar: 12, dr: 18, dor: 25 }],
    roeGet: () => ({ roe: { ws: 'tight', id: ['awacs'], commit: 'n40', abort: ['bingo'], extra: [], restr: [] } }), roeSet: fa => (window.__OC.roe = fa) });
}"""
FT = 3280.84
INI = '\r\n'.join(['[MISSION]', 'title=x', '[STPT]'] + ['ppt_%d=0.000000, 0.000000, 0.000000, 0.000000,' % i for i in range(15)] +
                  ['lineSTPT_%d=0.000000, 0.000000, 0.000000' % i for i in range(24)] + ['[COMMS]', 'X=1', ''])
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1600, 'height': 1100}, reduced_motion='reduce'); errs = []
        dialogs.install(pg)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:%d/app/index.html' % PORT); pg.wait_for_timeout(1500)
        pg.evaluate(SETUP, 'SWEEP')
        pg.click('button.tab[data-t=ms]'); pg.wait_for_timeout(600)
        pg.click('#bvrtabs [data-bsub=oca]'); pg.wait_for_timeout(1500)
        check('A-A > OCA shown, the tab kept', pg.locator('#ocpage').is_visible() and pg.evaluate("()=>localStorage.getItem('aasub')") == 'oca')
        P = lambda: pg.evaluate("()=>{const P=__app.ocaPage.plan();return {code:P.code,lead:P.S.lead,n:P.T.length,red:P.W.filter(w=>w[1]).map(w=>w[0]),notes:P.W.filter(w=>!w[1]).map(w=>w[0])}}")
        q = P()
        check('SWEEP: FS-1A, the lead of the flight plan (+3 min), a track %s' % q, q['code'] == 'FS-1A' and q['lead'] == 3 and q['n'] > 10)
        check('the SA-6 on the track, in red %s' % q['red'], any(t.startswith('SA-6: inside its ring') for t in q['red']))
        check('the A-A block written to the ROE %s' % pg.evaluate("()=>JSON.stringify(__OC.roe)"), pg.evaluate("()=>__OC.roe && __OC.roe.kind=='SWEEP' && __OC.roe.pos=='FS-1A' && __OC.roe.wpn=='free' && __OC.roe.commit==40"))
        slide = lambda k, v: pg.evaluate("([k,v])=>{const e=document.querySelector('#ocpage [data-oc='+k+']');e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}", [k, str(v)])
        slide('lead', 1); pg.wait_for_timeout(300)
        check('lead 1 min within 10 NM: an escort, not a sweep (red); the lead is not a line of the ROE', any('not a sweep' in t for t in P()['red']) and pg.evaluate("()=>__OC.roe.lead") is None)
        pg.click('#ocpage [data-ocset=side][data-v="1"]'); slide('off', 12); pg.wait_for_timeout(300)
        q = P()
        check('12 NM right: FS-1C, no longer an escort %s' % q['code'], q['code'] == 'FS-1C' and not any('not a sweep' in t for t in q['red']))
        slide('cur', 4); pg.wait_for_timeout(300)
        check('the time slider moves the package (09:04)', '09:04' in pg.locator('#ocpage [data-oce=cur]').inner_text())
        pg.click('#ocpage [data-ocreset]'); pg.wait_for_timeout(400)
        check('Reset profile: FS-1A, +3 min again', P()['code'] == 'FS-1A' and P()['lead'] == 3)
        sm = pg.evaluate("()=>{const D=__app.ocaPage.smart();return {t:D.title,k:D.key.map(k=>k[0]),b:D.blocks.map(b=>b[0])}}")
        check('the Smart OCA data %s' % sm, sm['t'] == 'A-A · OCA · SWEEP' and sm['k'][:2] == ['POSITION', 'LEAD'] and sm['b'] == ['PACKAGE', 'ID / BUGOUT', 'LINES', 'CALLS'])
        r = pg.evaluate("""async () => {
          const s = await __app.ocaPage.cardCanvas('smart'), c = await __app.ocaPage.cardCanvas('combo'), m = await __app.ocaPage.cardCanvas('map');
          const px = (cv, x, y) => Array.from(cv.getContext('2d').getImageData(x, y, 1, 1).data.slice(0, 3));
          return { size: [s.width, s.height, m.width, m.height], mdark: px(m, 800, 1200), png: [s.toDataURL(), c.toDataURL(), m.toDataURL()] };
        }""")
        check('the cards: Smart 1600 x 2400, classic 1600 x 2400 with the map picture %s' % r['mdark'], r['size'] == [1600, 2400, 1600, 2400] and max(r['mdark']) < 140)
        check('the Smart mission card drawn', len(r['png'][1]) > 20000)
        if OUT:
            pg.screenshot(path=os.path.join(OUT, 'oca_sweep.png'))
            for i, n in enumerate(('smart', 'combo', 'map')):
                open(os.path.join(OUT, 'oca_%s.png' % n), 'wb').write(base64.b64decode(r['png'][i].split(',')[1]))
        pg.click('#bvrtabs [data-bcard]'); pg.wait_for_timeout(4000)
        check('Add card: With the map, Smart OCA, Smart mission', pg.locator('dialog.tgdlg .tgcard span').all_inner_texts() == ['With the map', 'Smart OCA', 'Smart mission'])
        pg.click('dialog.tgdlg [data-a=no]'); pg.wait_for_timeout(300)
        # DTC lines (F-16): the track and the target area
        pg.evaluate("t=>__app.parse(t)", INI); pg.wait_for_timeout(400)
        pg.click('#bvrtabs [data-bsub=oca]'); pg.wait_for_timeout(300)
        pg.click('#ocpage [data-ocdtc]'); pg.wait_for_timeout(1500)
        used = lambda a: pg.evaluate("a=>{let k=0;for(let i=a;i<a+6;i++){const l=__app.lines.find(l=>l.k=='lineSTPT_'+i);if(l&&!/^0\\.000000, 0\\.000000/.test(l.v))k++}return k}", a)
        cnt = [used(6 * i) for i in range(4)]
        check('DTC: LINE1 and LINE2 the two sides of the sweep area (6 each) %s' % cnt, cnt == [6, 6, 0, 0])
        # an ESCORT: detached first, then embedded at night
        pg.evaluate(SETUP, 'ESCORT'); pg.evaluate("()=>__app.ocaPage.setState({f:{}})"); pg.click('#bvrtabs [data-bsub=faor]'); pg.wait_for_timeout(300); pg.click('#bvrtabs [data-bsub=oca]'); pg.wait_for_timeout(800)
        q = P()
        check('ESCORT: detached, FS-2A, 1 min %s' % q, q['code'] == 'FS-2A' and q['lead'] == 1 and pg.evaluate("()=>__OC.roe.kind") == 'ESCORT')
        pg.click('#ocpage [data-ocset=esc][data-v=emb]'); pg.wait_for_timeout(300)
        check('no date of the campaign: the page says how to know the night', 'set the date of the campaign' in pg.locator('#ocsun').inner_text())
        pg.click('#ocpage [data-ocset=night][data-v=true]'); pg.wait_for_timeout(300)
        q = P()
        check('embedded in IMC: FS-3C, no close escort (red) %s' % q['code'], q['code'] == 'FS-3C' and 'IMC or low level: no close escort' in q['red'])
        pg.evaluate(SETUP, ['ESCORT', {'sun': -15}]); pg.click('#bvrtabs [data-bsub=faor]'); pg.wait_for_timeout(300); pg.click('#bvrtabs [data-bsub=oca]'); pg.wait_for_timeout(800)
        q = P()
        check('the Sun at -15° over the target: night, no close escort %s' % q['red'], 'Night over the target (Sun -15°): no close escort' in q['red'] and 'night' in pg.locator('#ocsun').inner_text())
        check('the position codes have their meaning as a tooltip', 'FS-1 sweep' in (pg.locator('#occode').get_attribute('title') or ''))
        check('DTC lines and Reset profile under the flight', pg.locator('#ocfl [data-ocdtc]').count() == 1 and pg.locator('#ocfl [data-ocreset]').count() == 1)
        # an independent sweep (alone in its package, as BMS makes them): its own route, FS-1D
        pg.evaluate(SETUP, ['SWEEP', {'indep': True}]); pg.evaluate("()=>__app.ocaPage.setState({f:{}})"); pg.click('#bvrtabs [data-bsub=faor]'); pg.wait_for_timeout(300); pg.click('#bvrtabs [data-bsub=oca]'); pg.wait_for_timeout(800)
        q = P()
        check('independent sweep: FS-1D, a track, the page says so %s' % q['code'], q['code'] == 'FS-1D' and q['n'] > 2 and 'Independent sweep (FS-1D)' in pg.locator('#ocpage').inner_text())
        if OUT: pg.screenshot(path=os.path.join(OUT, 'oca_escort.png'))
        check('Map, Display > OCA: off by default', pg.evaluate("()=>!__app.mapV.state().on.oc"))
        check('the SAMs are not drawn on the map of the page (the map has them): no SA-6 tag', pg.locator('#ocmap .sdtag', has_text='SA-6').count() == 0)
        check('no page errors %s' % errs[:3], not errs)
        b.close()
finally:
    srv.terminate()
sys.exit(0 if ok else 1)
