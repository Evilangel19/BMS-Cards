"""Checks the reading of the terrain in the desktop program with a mocked file plugin: the heights file is opened a few times (not once for every piece), the pieces are read side by side,
the rows are kept for the next question, and a read error closes every handle. Usage: python3 tools/terrain-test.py"""
import subprocess, sys, time, os
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
srv = subprocess.Popen([sys.executable, R + '/tools/serve.py', '8831', '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
# a fake file plugin: the "file" gives the sample (x, y) = (y * 7 + x) % 3000 - 500 feet at the offset of that sample; the handles are counted
INIT = """
window.__io={opens:0,closes:0,seeks:0,reads:0,live:0,maxLive:0,busy:0,maxBusy:0,fail:0,log:[]};
const side=1024, byteAt=o=>{const s=o>>1, x=s%side, y=Math.floor(s/side), v=(y*7+x)%3000-500; return (o&1)?((v>>8)&255):(v&255)};
window.__TAURI__={core:{invoke:async()=>null},dialog:{},fs:{SeekMode:{Start:0},
 open:async p=>{const io=window.__io;io.opens++;io.live++;io.maxLive=Math.max(io.maxLive,io.live);let pos=0;
  return {seek:async(o)=>{io.seeks++;pos=o;await new Promise(r=>setTimeout(r,2))},
   read:async b=>{io.reads++;io.busy++;io.maxBusy=Math.max(io.maxBusy,io.busy);await new Promise(r=>setTimeout(r,3));io.busy--;
     if(io.fail&&io.reads>io.fail)throw new Error('disk error');
     for(let i=0;i<b.length;i++)b[i]=byteAt(pos+i);io.log.push([pos,b.length]);return b.length},
   close:async()=>{io.closes++;io.live--}}}}};
"""
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); errs = []
        pg = br.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); pg.add_init_script(INIT)
        pg.goto('http://localhost:8831/app/index.html'); pg.wait_for_timeout(700)
        R1 = pg.evaluate("""async()=>{const d=await import('/app/js/platform/desktop.js');const io=window.__io;
          const spans=[];for(let k=0;k<20;k++)spans.push([k*4096+10,64]);
          const out=await d.readRanges('/x/HeightMap.raw',spans);
          let same=true;out.forEach((b,k)=>{for(let i=0;i<64;i++){const o=spans[k][0]+i,s=o>>1,x=s%1024,y=Math.floor(s/1024),v=(y*7+x)%3000-500,e=(o&1)?((v>>8)&255):(v&255);if(b[i]!==e)same=false}});
          return {opens:io.opens,closes:io.closes,reads:io.reads,maxLive:io.maxLive,maxBusy:io.maxBusy,same,n:out.length}}""")
        check('20 pieces: the file is opened 4 times, not 20', R1['opens'] == 4 and R1['closes'] == 4 and R1['reads'] == 20)
        check('the pieces are read side by side (at least 2 at a time)', R1['maxBusy'] >= 2 and R1['maxLive'] == 4)
        check('every piece comes back in the order asked, with the right bytes', R1['same'] and R1['n'] == 20)
        R2 = pg.evaluate("""async()=>{const d=await import('/app/js/platform/desktop.js');const io=window.__io;const a=io.opens;
          const one=await d.readRanges('/x/HeightMap.raw',[[100,2]]);const none=await d.readRanges('/x/HeightMap.raw',[]);
          return {opens:io.opens-a,one:one.length,len:one[0].length,none:none.length}}""")
        check('one piece opens the file once, no pieces open nothing', R2['opens'] == 1 and R2['one'] == 1 and R2['len'] == 2 and R2['none'] == 0)
        # heightsOf: whole rows, kept
        R3 = pg.evaluate("""async()=>{const g=await import('/app/js/app/gamefiles.js'),h=await import('/app/js/bmsdata/heightmap.js'),io=window.__io;
          const spec={side:1024,sizeFt:1024000/0.3048}, t={path:'/x/HeightMap.raw',spec,rows:h.createRowCache()};
          const S=spec.sizeFt, pts=[];for(let j=0;j<30;j++)for(let i=0;i<10;i++)pts.push({n:S*(0.2+j*0.01),e:S*(0.3+i*0.02)});
          const want=[];{const dv=pts.map(p=>h.heightOffset(spec,p.n,p.e));dv.forEach(o=>{const s=o>>1,x=s%1024,y=Math.floor(s/1024);want.push((y*7+x)%3000-500)})}
          io.opens=0;io.reads=0;io.log.length=0;
          const a=await g.heightsOf(t,pts);const r1=io.reads,o1=io.opens;
          const b=await g.heightsOf(t,pts.slice(5,100));
          const rowsRead=new Set(io.log.map(x=>Math.floor(x[0]/2048)));
          return {same:JSON.stringify(a)==JSON.stringify(want),same2:JSON.stringify(b)==JSON.stringify(want.slice(5,100)),r1,o1,r2:io.reads-r1,whole:io.log.every(x=>x[1]==2048),rows:rowsRead.size,kept:t.rows.size}}""")
        check('heightsOf: the right heights', R3['same'] and R3['same2'])
        check('heightsOf: one read per row, each row whole (2 KB here), the file opened 4 times', R3['r1'] == R3['rows'] and R3['whole'] and R3['o1'] == 4)
        check('heightsOf: the same rows asked again are not read again', R3['r2'] == 0 and R3['kept'] == R3['rows'])
        R4 = pg.evaluate("""async()=>{const d=await import('/app/js/platform/desktop.js');const io=window.__io;io.fail=io.reads+3;const a=io.opens,c=io.closes;let msg='';
          try{await d.readRanges('/x/HeightMap.raw',Array.from({length:12},(_,k)=>[k*100,10]))}catch(e){msg=e.message}
          io.fail=0;return {msg,opened:io.opens-a,closed:io.closes-c,live:io.live}}""")
        check('a read error is passed on and every handle is closed', R4['msg'] == 'disk error' and R4['opened'] == R4['closed'] and R4['live'] == 0)
        check('no page errors', not errs)
        br.close()
finally:
    srv.terminate()
print('ALL OK' if ok else 'FAILED'); sys.exit(0 if ok else 1)
