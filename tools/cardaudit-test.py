"""The look check of the Kneeboard cards (1.3.0-beta.49): every card the program can draw here (Weather SIGWX / RADAR / WIND, ROE / SOP) and the card
pictures given (SEAD, DEAD from tools/sead-test.py and tools/dead-test.py, light and DARK=1) in both looks:
- centred: the space left of the drawing as wide as the space right of it (within 1.5% of the width);
- the pass for the cockpit: the page of the dark look dark, the text of the light look black (its darkest ink near black), no text smaller than the
  minimum (the drawing context of the card wrapped by inkCard);
- the two looks of a card: the light one light, the dark one dark.
No BMS files. The Target cards from the made-up data of tgtpage-test (Paper both looks, Program dark).
One dark look for all: the page of every dark card #121212, as Weather SIGWX. Usage: python3 tools/cardaudit-test.py [shots_dir] [card.png ...]"""
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
def edge_rgb(im):
    """the colour of the page: the most common colour of the edges of the card"""
    im = im.convert('RGB'); W, H = im.size; c = {}
    for box in ((0, 0, W, 12), (0, H - 12, W, H), (0, 0, 12, H), (W - 12, 0, W, H)):
        for n, k in im.crop(box).getcolors(1 << 20): c[k] = c.get(k, 0) + n
    return max(c, key=c.get)
def audit(name, im, dark, pic=False):
    """pic: a picture as wide as the card (the Target graphic): its edges are not the page"""
    W = im.size[0]; L, Rr = margins(im); mean, dk, lt = look(im)
    check('%s: centred (left %d px, right %d px)' % (name, L, Rr), abs(L - Rr) <= W * 0.015)
    if pic:
        check('%s: %s text (ink %d / %d)' % (name, 'light' if dark else 'black', dk, lt), lt > 200 if dark else dk < 40)
    elif dark:
        pc = edge_rgb(im)
        check('%s: the dark look, a dark page (%d), light text (lightest ink %d)' % (name, mean, lt), mean < 60 and lt > 200)
        check('%s: the page of all the dark cards, as Weather SIGWX: #121212 (%s)' % (name, '#%02x%02x%02x' % pc), all(abs(v - 18) <= 4 for v in pc))
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
        # the Target cards (the made-up depot of tools/tgtpage-test.py): Paper (BTG) in both looks, Program in the dark look (a dark page by design)
        T = open(os.path.join(R, 'tools', 'tgtpage-test.py')).read(); tg = {}
        exec(T[T.index('FT = 3280'):T.index('try:')], tg)
        pg.evaluate(tg['TD'], [list(f) for f in tg['FEATS']]); pg.evaluate("t=>__app.parse(t)", tg['INI']); pg.wait_for_timeout(300)
        pg.click('[data-t=wp]'); pg.wait_for_timeout(400); pg.click('#wp .wtabs [data-mode=tgt]'); pg.wait_for_timeout(900); pg.click('.tgp .tgfill'); pg.wait_for_timeout(300)
        for st, looks in (('prog', [True]), ('paper', [False, True])):
            pg.click('.tgp [data-seg=pst] [data-v=%s]' % st); pg.wait_for_timeout(300)
            for dark in looks:
                tc = pg.evaluate("async d=>{const m=await import('./js/core/cardink.js');m.setCardDark(d);const L=await __app.ST.tgPage.allCards();m.setCardDark(false);return L.map(c=>[c.label,c.c.toDataURL()])}", dark)
                for l, u in tc: audit('%s %s' % (l.replace('·', '-'), st), Image.open(BytesIO(base64.b64decode(u.split(',')[1]))), dark, 'Graphic' in l)
        pg.click('.tgp [data-seg=pst] [data-v=paper]'); pg.wait_for_timeout(200)
        h = pg.evaluate("()=>{const h=document.querySelector('.tgp .tgsth');return [h.textContent,h.classList.contains('warn')]}")
        pg.evaluate("()=>import('./js/core/cardink.js').then(m=>m.setCardDark(true))"); pg.click('.tgp [data-seg=pst] [data-v=prog]'); pg.click('.tgp [data-seg=pst] [data-v=paper]'); pg.wait_for_timeout(200)
        h2 = pg.evaluate("()=>{const h=document.querySelector('.tgp .tgsth');return [h.textContent,h.classList.contains('warn')]}")
        pg.evaluate("()=>import('./js/core/cardink.js').then(m=>m.setCardDark(false))")
        check('Target, under Style: Paper with light cards goes with them, with dark cards it is marked (%s / %s)' % (h, h2), not h[1] and h2[1] and 'Program goes with them' in h2[0])
        for f in extra:
            dark = '/dark/' in f or '-dark' in os.path.basename(f)
            audit(os.path.basename(f).replace('.png', ''), Image.open(f), dark)
        check('no errors %s' % errs[:2], not errs)
finally:
    srv.terminate()
print('ALL OK' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
