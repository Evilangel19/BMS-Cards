"""The notes of the Datacard (airfields, UHF2 backup, the targets of the other flights): a big package still fits the box at a size that reads,
long lines are wrapped (not squeezed), what does not fit is counted in "+N more". No BMS files. Usage: python3 tools/notes-test.py [shots dir]"""
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
BIG = ("Daegu TWR 365.000/126.200 ATIS 127.650\nGunsan TWR 236.600/122.600 ATIS 0.000\n\nUHF2 backup\nDevil 3 229.200 · Panther 4 288.775\n"
       "Jaguar 2 274.350 · Weasel 2 226.625\nRumble 1 283.475\n\nJaguar 2: SA-2 Site Kuum-ni 04:01\nWeasel 2: 1973rd AAA Battalion 03:56\n"
       "Rumble 1: Escort Devil 3, Panther 4, Jaguar 2, Weasel 2 03:58-04:02")
JS = """async([v,shot])=>{const m=await import('/app/js/app/cardview.js');const c=document.createElement('canvas');c.width=340;c.height=170;const x=c.getContext('2d');
  x.fillStyle='#fff';x.fillRect(0,0,340,170);x.strokeRect(10,2,320,150);x.fillStyle='#000';x.textBaseline='middle';x.textAlign='center';
  const d={x:10,y:12,w:320};const L=m.freeLayout(x,v,d.w-4);m.freeDraw(x,v,d,d.x+d.w/2);
  const H=L.rows.reduce((s,r)=>s+(r.sep?L.gp:L.lh),0);x.font=L.fs+'px Arial';const wide=L.rows.filter(r=>!r.sep).some(r=>x.measureText(r.t).width>d.w-4+0.5);
  if(shot){document.body.innerHTML='';document.body.appendChild(c)}
  return {fs:L.fs,H,wide,more:L.rows.filter(r=>r.more).map(r=>r.t),n:L.rows.length}}"""
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); pg = br.new_page(viewport={'width': 800, 'height': 600})
        pg.goto('http://localhost:%d/app/index.html' % PORT); pg.wait_for_timeout(1200)
        r = pg.evaluate(JS, [BIG, bool(shots)])
        if shots: pg.locator('canvas').first.screenshot(path=shots + '/notes.png')
        check('a package of five flights: the notes fit the box at 11 px or more, no line wider than the box, nothing left out %s' % r, r['fs'] >= 11 and r['H'] <= 140 and not r['wide'] and not r['more'])
        r2 = pg.evaluate(JS, [BIG + '\n\n' + '\n'.join('Flight %d: Some Long Target Name Battalion 04:%02d' % (i, i) for i in range(12)), False])
        check('far too much text: still in the box, the rest counted in "+N more" %s' % r2, r2['H'] <= 140 and len(r2['more']) == 1 and r2['fs'] == 11)
        r3 = pg.evaluate(JS, ['Daegu TWR 365.000/126.200 ATIS 127.650', False])
        check('one airfield: the biggest size (14) %s' % r3, r3['fs'] == 14 and not r3['more'])
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
