"""The look check of the Kneeboard cards (1.3.0-beta.49): every card the program can draw here (Weather SIGWX / RADAR / WIND, ROE / SOP) and the card
pictures given (SEAD, DEAD from tools/sead-test.py and tools/dead-test.py, light and DARK=1) in both looks:
- centred: the space left of the drawing as wide as the space right of it (within 1.5% of the width);
- the pass for the cockpit: the page of the dark look dark, the text of the light look black (its darkest ink near black), no text smaller than the
  minimum (the drawing context of the card wrapped by inkCard);
- the two looks of a card: the light one light, the dark one dark.
No BMS files. Usage: python3 tools/cardaudit-test.py [shots_dir] [card.png ...]"""
import subprocess, sys, time, os, base64, glob
from io import BytesIO
from PIL import Image
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
shots = sys.argv[1] if len(sys.argv) > 1 else None
extra = sys.argv[2:]
PORT = 8795
srv = subprocess.Popen([sys.executable, R + '/tools/serve.py', str(PORT), '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)

def margins(im):
    """the space left and right of the drawing: per row, the first and the last pixel far from the colour of the edge of that row"""
    im = im.convert('RGB'); W, H = im.size; px = im.load(); L = R_ = W
    for y in range(0, H, 3):
        e = px[1, y]
        far = lambda c: abs(c[0] - e[0]) + abs(c[1] - e[1]) + abs(c[2] - e[2]) > 60
        for x in range(1, W // 2):
            if far(px[x, y]): L = min(L, x); break
        e = px[W - 2, y]
        for x in range(W - 2, W // 2, -1):
            if far(px[x, y]): R_ = min(R_, W - 1 - x); break
    return L, R_
def lum(c): return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]
def look(im):
    """the page: its colour (the most common lightness), and the darkest / lightest ink (full size: thin text counts)"""
    s = im.convert('L'); h = s.histogram(); n = sum(h); W, H = s.size
    # the page: the most common lightness of the edge of the card (a big map in the middle is not the page)
    e = s.crop((0, 0, W, 12)).histogram(); b = s.crop((0, H - 12, W, H)).histogram(); l = s.crop((0, 0, 12, H)).histogram(); r = s.crop((W - 12, 0, W, H)).histogram()
    page = max(range(256), key=lambda i: e[i] + b[i] + l[i] + r[i])
    dk = next(i for i in range(256) if sum(h[:i + 1]) > n * 0.0005)
    lt = next(i for i in range(255, -1, -1) if sum(h[i:]) > n * 0.0005)
    return page, dk, lt
def audit(name, im, dark):
    W = im.size[0]; L, Rr = margins(im); mean, dk, lt = look(im)
    check('%s: centred (left %d px, right %d px)' % (name, L, Rr), abs(L - Rr) <= W * 0.015)
    if dark: check('%s: the dark look, a dark page (%d), light text (lightest ink %d)' % (name, mean, lt), mean < 60 and lt > 200)
    else: check('%s: the light look, a light page (%d), black text (darkest ink %d)' % (name, mean, dk), mean > 200 and dk < 40)
    if shots: im.save(os.path.join(shots, 'audit-' + name.replace(' ', '-').replace('/', '') + ('-dark' if dark else '') + '.png'))
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1400, 'height': 900}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://localhost:%d/app/index.html' % PORT); pg.wait_for_timeout(1500)
        got = pg.evaluate("""async()=>{
          const M=await import('./js/core/cardink.js'),WX=await import('./js/core/wxcard.js'),WD=await import('/tests/wxdata.mjs'),
            RC=await import('./js/app/roecard.js'),RS=await import('./js/core/roesop.js');
          const out={},wrapped={};
          const cv=()=>{const c=document.createElement('canvas');c.width=1600;c.height=2400;return c};
          // the smallest text drawn: every font set on the context, after inkCard
          const watch=x=>{let min=99;const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(x),'font');Object.defineProperty(x,'font',{configurable:true,get(){return d.get.call(this)},set(v){const m=/(\\d+(?:\\.\\d+)?)px/.exec(v);if(m&&+m[1]<min)min=+m[1];d.set.call(this,v)}});return ()=>min};
          for(const dark of [false,true]){
            M.setCardDark(dark);
            for(const st of ['sigwx','radar','wind']){const c=cv(),x=c.getContext('2d'),mn=watch(x);WX.drawWxCard(x,WD.D,st);out['Weather '+st+(dark?' dark':'')]=[c.toDataURL(),mn(),!!x.__inked]}
            const sel=RS.emptySel();RS.ROE.forEach(([id,,k,,o])=>{if(o&&o.length)sel.roe[id]=k=='many'?[o[0][0]]:o[0][0]});RS.topicsAll().forEach(t=>{if(t[3]&&t[3].length)sel.sop[t[0]]=t[3][0][0]});
            const c=cv(),x=c.getContext('2d'),mn=watch(x),plan=RC.roeCardPlan(sel,x);RC.roeCardDraw(plan[0],x,'Flight Test 1');out['ROE SOP'+(dark?' dark':'')]=[c.toDataURL(),mn(),!!x.__inked];
          }
          M.setCardDark(false);return out}""")
        for k, (u, mn, ink) in got.items():
            im = Image.open(BytesIO(base64.b64decode(u.split(',')[1])))
            dark = k.endswith(' dark'); nm = k[:-5] if dark else k
            audit(nm, im, dark)
            check('%s%s: drawn for the cockpit (inkCard), smallest text %.0f px' % (nm, ' (dark)' if dark else '', mn), ink and mn >= 13)
        for f in extra:
            dark = '/dark/' in f or '-dark' in os.path.basename(f)
            audit(os.path.basename(f).replace('.png', ''), Image.open(f), dark)
        check('no errors %s' % errs[:2], not errs)
finally:
    srv.terminate()
print('ALL OK' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
