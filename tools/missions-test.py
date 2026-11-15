"""Squadron > Missions: many saved missions put in order. A stand-in of the missions folder (window.__msfIO, 250 missions in memory): the list a hundred at
a time, a new folder, missions moved into it (a range selected with Shift, Move to; one dragged), the search, the groups by campaign, rename and delete
of a folder (its missions go back to Unfiled), the index written with the folders.
Usage: CSP=1 python3 tools/missions-test.py [screenshot_dir]"""
import subprocess, sys, time, os, json
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
shots = sys.argv[1] if len(sys.argv) > 1 else None
PORT = 8966
srv = subprocess.Popen([sys.executable, R + '/tools/serve.py', str(PORT), '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
FAKE = """() => {
  const camps = ['Tiger Spirit', 'Balkan Fire', 'Desert Rain'], sqs = ['35th FS', '80th FS', ''], kinds = ['Strike', 'SEAD', 'OCA', 'CAP'];
  const M = [];
  for (let i = 0; i < 250; i++) {
    const d = new Date(Date.UTC(2026, 6 + (i % 5), 1 + (i % 27), 10)).toISOString();
    M.push({ key: 'M' + String(i).padStart(3, '0') + ' Falcon ' + (i % 4 + 1), id: 'file' + i,
      o: { created: d, squadron: sqs[i % 3], theater: { name: 'Korea KTO' },
           datacard: { label: 'Falcon ' + (i % 4 + 1) + ' · F-16C x4 · ' + kinds[i % 4] + ' · 10:00:00', final: { mis: camps[i % 3], cs: 'Falcon ' + (i % 4 + 1) } } } });
  }
  window.__IDX = '';
  window.__READS = 0;
  window.__msfIO = {
    list: async () => M.map(m => ({ key: m.key, id: m.id })),
    size: async id => 1000 + +id.slice(4),
    text: async id => { window.__READS++; return JSON.stringify(M.find(m => m.id == id).o); },
    readIndex: async () => { if (!window.__IDX) throw new Error('none'); return window.__IDX; },
    writeIndex: async t => { window.__IDX = t; },
  };
}"""
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); errs = []
        pg = br.new_page(viewport={'width': 1500, 'height': 1100}, reduced_motion='reduce')
        import dialogs; dialogs.install(pg)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errs.append(m.text))
        pg.goto('http://localhost:%d/app/index.html' % PORT); pg.wait_for_timeout(900)
        pg.evaluate(FAKE)
        pg.click('[data-t=sq]'); pg.wait_for_timeout(400)
        pg.click('#sqtabs [data-tab=missions]'); pg.wait_for_timeout(1500)
        hint = pg.inner_text('#sqmis > .hint')
        check('250 missions listed (%s)' % hint.split(' · ')[0], hint.startswith('250 missions'))
        check('a hundred shown, then "Show 100 more"', pg.locator('#sqmis .msr').count() == 100 and pg.locator('#sqmis [data-more]').count() == 1)
        check('each mission read once, then kept in the index (%d reads)' % pg.evaluate('()=>__READS'), pg.evaluate('()=>__READS') == 250 and 'Tiger Spirit' in pg.evaluate('()=>__IDX'))
        pg.click('#sqtabs [data-tab=members]'); pg.wait_for_timeout(200); pg.click('#sqtabs [data-tab=missions]'); pg.wait_for_timeout(800)
        check('...opened again: no file read again (the index has them)', pg.evaluate('()=>__READS') == 250)
        pg.click('#sqmis [data-more]'); pg.wait_for_timeout(200)
        check('...200 after Show more', pg.locator('#sqmis .msr').count() == 200)
        # a new folder
        pg.click('#sqmis [data-fnew]'); pg.wait_for_timeout(150)
        pg.fill('#sqmis .msfin', 'Korea week 1'); pg.press('#sqmis .msfin', 'Enter'); pg.wait_for_timeout(500)
        check('New folder: in the tree, chosen, empty', pg.locator('#sqmis .msf.on span').inner_text().strip().endswith('Korea week 1') and pg.locator('#sqmis .msr').count() == 0)
        fid = pg.get_attribute('#sqmis .msf.on', 'data-f')
        # three missions selected with Shift and moved
        pg.click('#sqmis .msf[data-f="all"]'); pg.wait_for_timeout(200)
        pg.click('#sqmis .msr >> nth=0 >> [data-ck]'); pg.wait_for_timeout(100)
        pg.click('#sqmis .msr >> nth=2 >> [data-ck]', modifiers=['Shift']); pg.wait_for_timeout(100)
        check('Shift selects a range: 3 selected', '3 selected' in pg.inner_text('#sqmis .mssel'))
        pg.select_option('#sqmis .msto', fid); pg.wait_for_timeout(500)
        cnt = lambda f: pg.inner_text('#sqmis .msf[data-f="%s"] b' % f)
        check('Move to: the folder holds 3 missions', cnt(fid) == '3' and json.loads(pg.evaluate('()=>__IDX'))['items'][pg.evaluate("()=>[...document.querySelectorAll('#sqmis .msr')][0].dataset.k")]['folder'] == fid)
        # one more dragged onto the folder
        pg.locator('#sqmis .msr >> nth=5').drag_to(pg.locator('#sqmis .msf[data-f="%s"]' % fid)); pg.wait_for_timeout(500)
        check('a mission dragged onto the folder: 4', cnt(fid) == '4')
        check('Unfiled holds the others (246)', cnt('') == '246')
        if shots: pg.locator('#sqmis').screenshot(path=shots + '/missions-folders.png')
        # search
        pg.fill('#sqmis .msq', 'balkan sead'); pg.wait_for_timeout(300)
        found = pg.locator('#sqmis .msr').count()
        check('search "balkan sead": only those (%d)' % found, 0 < found < 100 and all('Balkan Fire' in t and 'SEAD' in t for t in pg.locator('#sqmis .msr em').all_inner_texts()))
        pg.fill('#sqmis .msq', ''); pg.wait_for_timeout(200)
        # groups
        pg.click('#sqmis [data-g=campaign]'); pg.wait_for_timeout(300)
        heads = pg.locator('#sqmis .msgh').all_inner_texts()
        check('by campaign: three groups with their counts %s' % heads, len(heads) == 3 and all(h.split()[-1].isdigit() for h in heads) and pg.locator('#sqmis .msg.on').count() == 1)
        pg.click('#sqmis .msgh >> nth=1'); pg.wait_for_timeout(200)
        check('...a click opens another group', pg.locator('#sqmis .msg.on').count() == 2)
        if shots: pg.locator('#sqmis').screenshot(path=shots + '/missions-groups.png')
        pg.click('#sqmis [data-g=date]'); pg.wait_for_timeout(200)
        check('by date: one group a month, newest first', 'November 2026' in pg.locator('#sqmis .msgh >> nth=0').inner_text())
        pg.click('#sqmis [data-g=folder]'); pg.wait_for_timeout(200)
        # rename, then delete the folder
        pg.hover('#sqmis .msf[data-f="%s"]' % fid); pg.click('#sqmis .msf[data-f="%s"] [data-fren]' % fid); pg.wait_for_timeout(150)
        pg.fill('#sqmis .msfin', 'Korea W1'); pg.press('#sqmis .msfin', 'Enter'); pg.wait_for_timeout(400)
        check('the folder renamed', 'Korea W1' in pg.inner_text('#sqmis .msf[data-f="%s"]' % fid))
        pg.once('dialog', lambda d: d.accept())
        pg.hover('#sqmis .msf[data-f="%s"]' % fid); pg.click('#sqmis .msf[data-f="%s"] [data-fdel]' % fid); pg.wait_for_timeout(600)
        check('the folder deleted: its missions back in Unfiled (250), the index without it', cnt('') == '250' and json.loads(pg.evaluate('()=>__IDX'))['folders'] == [])
        check('no page error: %s' % errs[:3], not errs)
    srv.terminate()
except Exception as e:
    srv.terminate(); raise
sys.exit(0 if ok else 1)
