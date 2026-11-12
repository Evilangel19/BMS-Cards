"""The notes of the Datacard (airfields, UHF2 backup, the targets of the other flights): one section a label on the left, the cells in columns, 13 px
(12 when needed), lines squeezed and never wrapped. No BMS files. Usage: python3 tools/notes-test.py [shots dir]"""
import os, subprocess, sys, time
HERE = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from playwright.sync_api import sync_playwright
PORT = 8993
srv = subprocess.Popen([sys.executable, R + '/tools/serve.py', str(PORT), '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
shots = sys.argv[1] if len(sys.argv) > 1 else None
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
# five flights: the notes as fillcard writes them for a big package (short callsigns, three backups a line, the labels and the cells divided by tabs)
BIG = ("TWR\tGunsan 292.300/128.500 · ATIS 120.225\n\tTaegu 254.600/126.200 · ATIS 128.875\n"
       "UHF2\tRD4 328.550\tCA6 342.825\tBT7 248.875\n\tJL7 325.550\tSN4 239.125\n"
       "TGT\tBT7 Munchon City 04:01\n\tJL7 1821st Base Def Bn 03:56\n\tSN4 ESC RD4 CA6 BT7 JL7 03:58-03:59")
JS = """async([v,shot])=>{const m=await import('/app/js/app/cardview.js');const c=document.createElement('canvas');c.width=340;c.height=130;const x=c.getContext('2d');
  x.fillStyle='#fff';x.fillRect(0,0,340,130);x.strokeRect(10,2,320,120);
  const T=[],o=x.fillText;x.fillText=function(t,a,b,mw){T.push([t,a,b,mw]);return o.call(this,t,a,b,mw)};
  const d={x:12,w:320};const L=m.notesLayout(x,v);m.notesDraw(x,v,d,4);x.fillText=o;
  if(shot){c.id='ntshot';c.style.cssText='position:fixed;left:0;top:0;z-index:99999;width:680px';document.body.appendChild(c)}
  const col=s=>(T.find(q=>q[0]==s)||[])[1];
  return {fs:L.fs,h:L.h,n:L.rows.filter(r=>!r.gap).length,gut:L.gut,cols:[col('RD4 328.550'),col('CA6 342.825'),col('JL7 325.550'),col('SN4 239.125')],lab:T.filter(q=>['TWR','UHF2','TGT'].includes(q[0])).map(q=>q[1])}}"""
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); pg = br.new_page(viewport={'width': 800, 'height': 600})
        pg.goto('http://localhost:%d/app/index.html' % PORT); pg.wait_for_timeout(1200)
        r = pg.evaluate(JS, [BIG, bool(shots)])
        if shots: pg.locator('#ntshot').screenshot(path=shots + '/notes.png'); pg.evaluate("()=>document.getElementById('ntshot').remove()")
        check('a package of five flights: every line at the biggest size that fits (13 px), in the box %s' % r, r['fs'] == 13 and r['h'] <= 116 and r['n'] == 7)
        check('the labels in their column on the left, the backups in columns that line up %s' % r, r['lab'] == [14, 14, 14] and r['cols'][0] == r['cols'][2] and r['cols'][1] == r['cols'][3] and r['cols'][1] > r['cols'][0] + 80)
        r2 = pg.evaluate(JS, [BIG + '\n' + '\n'.join('\tFlight %d Some Long Target Name Bn 04:%02d' % (i, i) for i in range(6)), False])
        check('more lines: 12 px, closer, still in the box, never smaller %s' % {k: r2[k] for k in ('fs', 'h', 'n')}, r2['fs'] == 12 and r2['h'] <= 116 and r2['n'] >= 9)
        r3 = pg.evaluate(JS, ['Notes typed by hand', False])
        check('notes typed by hand (no labels): from the left edge, at the size of the other cells (16 px) when there is room %s' % r3, r3['fs'] == 16 and r3['gut'] == 0)
        # MDC: every cell is written in black (the first one, the callsign, was white on white in beta 14), the Bingo in red; the loadout in its short form
        mdc = pg.evaluate("""async()=>{const cv=await import('/app/js/app/cardview.js'),dc=await import('/app/js/app/datacard.js');
          const ink=(x,d,red)=>{const s=2048/1600,t=2048/1200,id=x.getImageData(Math.round(d.x*s),Math.round(d.y0*t),Math.round(d.w*s),Math.round(d.h*t)).data;let n=0;for(let i=0;i<id.length;i+=4)if(red?id[i]>150&&id[i+1]<80:id[i]<100&&id[i+1]<100)n++;return n};
          const c=document.createElement('canvas');c.width=c.height=2048;const x=c.getContext('2d');
          const keep={cs:dc.F.cs,bingo:dc.F.bingo};dc.F.cs='';dc.F.bingo='';cv.mdcDraw(x);const D=k=>cv.MFD.find(d=>d.k==k);const e0=ink(x,D('cs')),b0=ink(x,D('bingo'),1);
          dc.F.cs='Gator 1';dc.F.bingo='3200';cv.mdcDraw(x);const r={cs:ink(x,D('cs'))-e0,bingo:ink(x,D('bingo'),1)-b0};Object.assign(dc.F,keep);return r}""")
        check('MDC: the callsign is written (black ink in its cell) and the Bingo is red %s' % mdc, mdc['cs'] > 30 and mdc['bingo'] > 10)
        # the long ⓘ of the Automatic rules opens a panel with the whole text
        pg.evaluate("()=>{const e=[...document.querySelectorAll('.wtip')].find(e=>/Automatic rules/.test(e.textContent));e.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));e.click()}"); pg.wait_for_timeout(400)
        t = pg.evaluate("()=>{const p=document.querySelector('.ltpop');return p?{h:[...p.querySelectorAll('h4')].map(e=>e.textContent),txt:p.textContent,tit:p.querySelector('.lth b').textContent}:null}")
        check('Automatic rules: a click opens the whole text in a panel, with its sections %s' % (t and t['h']), t and 'AIRBASES' in t['h'] and 'EPHEMERIDES' in t['h'] and t['tit'] == 'Automatic rules' and 'Moon' in t['txt'].split('EPHEMERIDES')[-1])
        tt = pg.evaluate("()=>[...document.querySelectorAll('.wtip')].find(e=>/Automatic rules/.test(e.textContent)).title")
        check('its tooltip is short now: %s' % tt, tt == 'Click to read')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
        check('Esc closes it', pg.locator('.ltpop').count() == 0)
        br.close()
finally:
    srv.terminate()
sys.exit(0 if ok else 1)
