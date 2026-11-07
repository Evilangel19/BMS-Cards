"""Link 16 of the DTC: the plan of BMS for the package of the flight (callsign letters, number, flight lead flag, STN slots: own flight 1-4, every other flight at the start of the
next block of four, then the donors), the changes of the pilot over it (a flight put in a slot or taken out, always whole; an STN typed by hand stays), file B (empty unless the
pilot puts something in), the window of a flight of the package on the map (Select flight / Add Link 16), the Link 16 page of the Data Cartridge (who is in each slot, the cross, Back to
auto) and the mission (the changes are kept). Usage: python3 tools/l16-test.py [screenshot_dir]"""
import subprocess, sys, time, os, base64, json
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, R + '/tools')
import dialogs
FX = R + '/tests/fixtures/beartrap/'
shots = sys.argv[1] if len(sys.argv) > 1 else None
PORT = '8851'; URL = 'http://localhost:%s/app/index.html' % PORT
srv = subprocess.Popen([sys.executable, R + '/tools/serve.py', PORT, '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
b64 = lambda n: base64.b64encode(open(FX + n, 'rb').read()).decode()
ok = True
def check(n, c):
    global ok; ok &= bool(c); print('OK  ' if c else 'FAIL', n)
LOAD = "async(a)=>{const f=(s,n)=>new File([Uint8Array.from(atob(s),c=>c.charCodeAt(0))],n);await __app[a[0]](f(a[1],a[2]))}"
# the lines of the Link 16 section, and the ones that are changed
LV = """()=>({v:Object.fromEntries(__app.lines.filter(l=>l.s=='LINK16').map(l=>[l.k,l.v])),dirty:__app.lines.filter(l=>l.dirty&&l.s=='LINK16').map(l=>l.k)})"""
def stns(d, f):  # the 16 slots of a file: 4 flight, 4 team, 8 donor
    return [d['v']['FILE_%s_%s_%d_STN' % (f, g, i)] for g, n in (('FLIGHT', 4), ('TEAM', 4), ('DONOR', 8)) for i in range(1, n + 1)]
E = '00000'
# a package of four flights on the card: the own flight (Cyborg 5, 4 aircraft, STN 7104 from the campaign) and three more with an STN each
PKG = """()=>{const F=__app.F;[['pk1','Falcon 2','2 F-16C','12341'],['pk2','Jackal 1','4 F-16C','23451'],['pk3','Mako 7','3 F-16C','34561']].forEach(([k,a,b,c])=>{F[k+'_0']=a;F[k+'_1']=b;F[k+'_2']='';F[k+'_4']=c})}"""
FALCON = {'cs': 'Falcon 2', 'stn': '1234', 'n': 2}; JACKAL = {'cs': 'Jackal 1', 'stn': '2345', 'n': 4}; MAKO = {'cs': 'Mako 7', 'stn': '3456', 'n': 3}
BASE = [  # the plan of BMS for that package
    '71041', '71042', '71043', '71044',  # own flight: Flight 1-4
    '12341', '12342', E, E,              # Falcon 2 (2 aircraft): the start of the next block of four
    '23451', '23452', '23453', '23454', '34561', '34562', '34563', E]  # Jackal 1 and Mako 7: the donors
try:
    ini = open(FX + 'Evil19_2_.ini', encoding='latin1').read()
    with sync_playwright() as p:
        br = p.chromium.launch(); errs = []
        def page(w=1500, h=1000):
            pg = br.new_page(viewport={'width': w, 'height': h}, reduced_motion='reduce')
            dialogs.install(pg)
            pg.on('dialog', lambda d: d.accept())  # a mission replaces a DTC with changes: yes
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.add_init_script("try{localStorage.setItem('bmsform','1');localStorage.setItem('bmsobs','1')}catch(e){}")
            pg.goto(URL); pg.wait_for_timeout(800)
            pg.evaluate("t=>__app.parse(t)", ini); pg.wait_for_timeout(300)
            pg.evaluate(LOAD, ['loadCam', b64('PSI_BEAR_TRAP_26.cam'), 'x.cam']); pg.wait_for_timeout(1200)
            pg.evaluate(LOAD, ['loadL16', b64('PSI_BEAR_TRAP_26.l16.txtpb'), 'x.txtpb']); pg.wait_for_timeout(400)
            pg.evaluate(LOAD, ['loadIFF', b64('PSI_BEAR_TRAP_26.iff'), 'x.iff']); pg.wait_for_timeout(400)
            return pg
        def flight(pg, rx):
            i = pg.evaluate("rx=>__app.CL.findIndex(x=>new RegExp(rx).test(x.label))", rx)
            pg.evaluate("i=>{document.getElementById('fsel').value=i;__app.apply(i)}", i); pg.wait_for_timeout(900)
        pg = page(); flight(pg, 'Cyborg 5')
        D = lambda: pg.evaluate(LV)
        # ---- 0. what the flight gives to the DTC whatever the seat: the channels of Link 16 and the radio presets (the campaign gives Cyborg 5: Mission 1, Fighter 65, no Special)
        c0 = D()
        RVf = "()=>Object.fromEntries(__app.lines.filter(l=>l.s=='Radio').map(l=>[l.k,l.v]))"
        r0 = pg.evaluate(RVf)
        check('opening the flight writes its channels into file A: Mission 001, Fighter 065, Special 000 (the campaign has none: 000 as BMS shows it) %s %s' % ([c0['v'][k] for k in ('FILE_A_MISSION_CHANNEL', 'FILE_A_FIGHTER_CHANNEL', 'FILE_A_SPECIAL_CHANNEL')], c0['dirty']),
              [c0['v'][k] for k in ('FILE_A_MISSION_CHANNEL', 'FILE_A_FIGHTER_CHANNEL', 'FILE_A_SPECIAL_CHANNEL')] == ['001', '065', '000'] and set(c0['dirty']) <= {'FILE_A_MISSION_CHANNEL', 'FILE_A_FIGHTER_CHANNEL', 'FILE_A_SPECIAL_CHANNEL'} and 'FILE_A_SPECIAL_CHANNEL' in c0['dirty'])
        check('file B has no channels written by the program', c0['v']['FILE_B_MISSION_CHANNEL'] == '000' and c0['v']['FILE_B_FIGHTER_CHANNEL'] == '000')
        check('the card shows the channels as MC / FC / SC of each pilot (and the Special channel is nothing when the flight has none) %s' % pg.evaluate("()=>__app.F.fl0_3"), pg.evaluate("()=>__app.F.fl0_3") == '71041 MC 1 FC 65')
        check('radio: 6 is the own flight (UHF 377.875, VHF 138.575), 13 the first tanker (253.325 / 39.225), 5 the AWACS (290.125 / 38.225)',
              [r0[k] for k in ('UHF_6', 'VHF_6', 'UHF_13', 'VHF_13', 'UHF_5', 'VHF_5')] == ['377875', '138575', '253325', '39225', '290125', '38225'])
        check('radio: UHF 15 is the intra-flight UHF of the first flight (230.700), VHF 15 the VHF of the first flight (138.575)', r0['UHF_15'] == '230700' and r0['VHF_15'] == '138575')
        pk = pg.evaluate("()=>[1,2,3,4].map(i=>__app.F['pk'+i+'_3']||'')")
        check('radio: VHF 16, 17... are the flights of the package in the order of the card %s' % pk, all((not v or v == '---') or r0['VHF_%d' % (16 + i)] == str(round(float(v) * 1000)) for i, v in enumerate(pk)))
        check('the notes of the presets are the ones of BMS, untouched; the presets the card has nothing for stay (UHF 16-20)', r0['UHF_COMMENT_5'] == 'AWACS Check-in' and r0['UHF_COMMENT_13'] == 'Tanker/AAR' and r0['UHF_16'] == '271325' and r0['UHF_20'] == '280500')
        # the switch "from Datacard" of the radio: off, the flights leave the presets as they are; on, they are written again
        pg.evaluate("()=>{__app.ST.DCS.radio=false;__app.lines.find(l=>l.s=='Radio'&&l.k=='UHF_6').v='111111'}")
        flight(pg, 'Cyborg 5')
        check('radio switch off: opening the flight leaves the DTC as it is (UHF 6 stays as typed)', pg.evaluate(RVf)['UHF_6'] == '111111')
        pg.evaluate("()=>__app.dcSync('radio', true)"); pg.wait_for_timeout(300)
        check('...switching it on writes the presets of the flight again', pg.evaluate(RVf)['UHF_6'] == '377875')
        pg.evaluate("()=>{__app.ST.DCS.l16=false;__app.lines.find(l=>l.k=='FILE_A_FIGHTER_CHANNEL').v='099'}")
        flight(pg, 'Cyborg 5')
        check('Link 16 switch off: the channels are left as they are (Fighter stays 099)', D()['v']['FILE_A_FIGHTER_CHANNEL'] == '099')
        pg.evaluate("()=>__app.dcSync('l16', true)"); pg.wait_for_timeout(300)
        check('...on again: the channel of the flight is back (065)', D()['v']['FILE_A_FIGHTER_CHANNEL'] == '065')
        pg.evaluate(PKG)
        d0 = D()
        check('the DTC is the one of the file, but for the channels: nothing else written before a seat is chosen (callsign CA, number 31, STNs 3514x)', [k for k in d0['dirty'] if 'CHANNEL' not in k] == [] and d0['v']['FILE_A_CALLSIGN'] == 'CA' and stns(d0, 'A')[:4] == ['35141', '35142', '35143', '35144'])

        # ---- 1. the plan of BMS when a seat is chosen
        pg.evaluate("()=>__app.seat.pick(1)"); pg.wait_for_timeout(500)
        d1 = D()
        check('seat 2: the letters CG (first and last of "Cyborg"), the number 52 (flight 5, position 2), not the flight lead %s' % [d1['v'][k] for k in ('FILE_A_CALLSIGN', 'FILE_A_CALLSIGN_NUMBER', 'FILE_A_FLIGHT_LEAD')], [d1['v'][k] for k in ('FILE_A_CALLSIGN', 'FILE_A_CALLSIGN_NUMBER', 'FILE_A_FLIGHT_LEAD')] == ['CG', '52', '0'])
        check('the plan of BMS: own flight 1-4, the second flight from slot 5 (the next block), the others as donors %s' % stns(d1, 'A'), stns(d1, 'A') == BASE)
        check('file B is not touched (it stays as it is: empty)', stns(d1, 'B') == [E] * 16 and not [k for k in d1['dirty'] if k.startswith('FILE_B')])
        pg.evaluate("()=>__app.seat.pick(0)"); pg.wait_for_timeout(400)
        d = D()
        check('the leader: the lead flag 1, the number 51, the same slots', [d['v'][k] for k in ('FILE_A_FLIGHT_LEAD', 'FILE_A_CALLSIGN_NUMBER')] == ['1', '51'] and stns(d, 'A') == BASE)
        pg.evaluate("()=>{__app.ST.DCS.l16=false}"); pg.evaluate("()=>__app.seat.pick(3)"); pg.wait_for_timeout(400)
        d = D()
        check('the switch "from Datacard" of Link 16 off: the DTC is left as it is (number 51, slots as they were)', d['v']['FILE_A_CALLSIGN_NUMBER'] == '51' and stns(d, 'A') == BASE)
        pg.evaluate("()=>{__app.ST.DCS.l16=true}"); pg.evaluate("()=>__app.seat.pick(2)"); pg.wait_for_timeout(400)
        check('on again: the next seat writes it (number 53)', D()['v']['FILE_A_CALLSIGN_NUMBER'] == '53')
        pg.evaluate("()=>__app.l16.recs()")  # (no records yet)
        check('no changes of the pilot yet: no records', pg.evaluate("()=>__app.l16.recs().length") == 0 and not pg.evaluate("()=>__app.l16.info().changedA"))
        # a seat chosen over a DTC where the pilot set donors in BMS: the plan replaces them (said in the notes)
        pg.evaluate("()=>{__app.lines.find(l=>l.k=='FILE_A_DONOR_8_STN').v='77777'}"); pg.evaluate("()=>__app.seat.pick(1)"); pg.wait_for_timeout(400)
        check('the seat writes the whole plan again: what was in a slot (set in BMS) is replaced', stns(D(), 'A')[15] == E)

        # ---- 2. changes of the pilot: a flight is put in or taken out whole
        add = lambda *a: pg.evaluate("a=>__app.l16.add(...a)", list(a))
        rem = lambda f, cs: pg.evaluate("a=>__app.l16.remove(...a)", [f, cs])
        why = add('A', 'team', 5, 'l', JACKAL)
        d = D()
        check('Jackal 1 (leader only) in Team 2: its 4 donor slots are emptied, Falcon 2 (in Team 1-2) loses both slots %s' % stns(d, 'A')[4:], why == '' and stns(d, 'A') == ['71041', '71042', '71043', '71044', E, '23451', E, E, E, E, E, E, '34561', '34562', '34563', E])
        check('the change is a record tied to the flight (put, file A, the callsign, the slot, leader only)', pg.evaluate("()=>JSON.stringify(__app.l16.recs())") == json.dumps([{'k': 'put', 'a': 'A', 'cs': 'Jackal 1', 'stn': '2345', 'n': 4, 's': 5, 'm': 'l'}], separators=(',', ':')))
        why = add('A', 'donor', 8, 'a', FALCON)
        d = D()
        check('Falcon 2 (whole) in Donor 1-2: only its own old place was touched, Jackal (Team 2) stays %s' % stns(d, 'A')[4:], why == '' and stns(d, 'A')[4:] == [E, '23451', E, E, '12341', '12342', E, E, '34561', '34562', '34563', E])
        why = add('A', 'donor', 8, 'a', MAKO)
        d = D()
        check('Mako 7 (3 aircraft) over Falcon 2 in Donor 1-3: Falcon 2 loses its 2 slots, Mako 7 takes 3 %s' % stns(d, 'A')[4:], why == '' and stns(d, 'A')[4:] == [E, '23451', E, E, '34561', '34562', '34563', E, E, E, E, E])
        why = add('A', 'donor', 8, 'l', JACKAL)
        d = D()
        check('Jackal 1 leader only in Donor 1, over Mako 7 (3 slots): Mako 7 is out whole, Jackal leaves Team 2 (moved) %s' % stns(d, 'A')[4:], why == '' and stns(d, 'A')[4:] == [E, E, E, E, '23451', E, E, E, E, E, E, E])
        check('Back to auto (file A): the plan of BMS again', pg.evaluate("()=>__app.l16.back('A')") == '' and stns(D(), 'A') == BASE and pg.evaluate("()=>__app.l16.recs().length") == 0)
        why = rem('A', 'Falcon 2')
        check('Falcon 2 taken out of the plan: both its slots are empty, the others stay %s' % stns(D(), 'A')[4:], why == '' and stns(D(), 'A') == BASE[:4] + [E] * 4 + BASE[8:])
        check('...and a taken-out flight can be put back from the map: the record "off" goes, "put" takes its place', add('A', 'team', 4, 'a', FALCON) == '' and stns(D(), 'A') == BASE)
        check('Falcon 2 in its own place again is a "put" (the plan is the same)', json.loads(pg.evaluate("()=>JSON.stringify(__app.l16.recs().map(r=>r.k+':'+r.cs))")) == ['put:Falcon 2'])
        pg.evaluate("()=>__app.l16.back('A')")
        check('the own flight cannot be added nor taken out', add('A', 'donor', 8, 'a', {'cs': 'Cyborg 5', 'stn': '7104', 'n': 4}) != '' and rem('A', 'Cyborg 5') != '' and stns(D(), 'A') == BASE)
        r1 = add('A', 'team', 7, 'a', FALCON); r2 = add('A', 'team', 8, 'l', FALCON); r3 = add('A', 'donor', 4, 'l', FALCON); r4 = add('A', 'donor', 14, 'a', MAKO)
        check('a place where the flight does not fit is refused with the reason, and nothing is written (%s | %s | %s | %s)' % (r1, r2, r3, r4), all([r1, r2, r3, r4]) and stns(D(), 'A') == BASE and pg.evaluate("()=>__app.l16.recs().length") == 0)

        # ---- 3. file B: empty, written only when the pilot puts something in it
        why = add('B', 'donor', 8, 'a', FALCON)
        d = D()
        check('Falcon 2 in file B, Donor 1-2: the slots of B, file A untouched %s' % stns(d, 'B')[4:], why == '' and stns(d, 'B') == [E] * 8 + ['12341', '12342'] + [E] * 6 and stns(d, 'A') == BASE)
        check('file B gets the callsign letters, the number and the lead flag of the seat (CG, 52 for seat 2)', [d['v'][k] for k in ('FILE_B_CALLSIGN', 'FILE_B_CALLSIGN_NUMBER', 'FILE_B_FLIGHT_LEAD')] == ['CG', '52', '0'] or [d['v'][k] for k in ('FILE_B_CALLSIGN', 'FILE_B_CALLSIGN_NUMBER', 'FILE_B_FLIGHT_LEAD')] == ['CG', '53', '0'])
        why = add('B', 'team', 4, 'l', JACKAL)
        check('a second flight in file B: its leader in Team 1 %s' % stns(D(), 'B')[4:], why == '' and stns(D(), 'B')[4:] == ['23451', E, E, E, '12341', '12342'] + [E] * 6)
        check('taking Falcon 2 out of B empties its slots only', rem('B', 'Falcon 2') == '' and stns(D(), 'B')[4:] == ['23451'] + [E] * 11)
        check('"Clear" of file B: empty again (as BMS leaves it)', pg.evaluate("()=>__app.l16.back('B')") == '' and stns(D(), 'B') == [E] * 16 and stns(D(), 'A') == BASE)

        # ---- 4. the reasons why nothing can be written
        pg.evaluate("()=>{__app.ST.DCS.l16=false}")
        check('the switch off: a change is refused with the reason, nothing is written', 'Switch on' in add('A', 'donor', 8, 'a', FALCON) and stns(D(), 'A') == BASE and pg.evaluate("()=>__app.l16.recs().length") == 0)
        pg.evaluate("()=>{__app.ST.DCS.l16=true}")
        check('the Data Cartridge page can say it (info: can, the plan of both files)', pg.evaluate("()=>{const i=__app.l16.info();return i.can.ok&&i.cs=='Cyborg 5'&&i.A.filter(Boolean).length==13&&i.B.filter(Boolean).length==0}"))

        # ---- 5. the page of the Data Cartridge: who is in each slot, the cross, Back to auto, a typed STN stays
        pg.click('[data-t=dtc]'); pg.wait_for_timeout(300); pg.click('#dnav [data-k=l16]'); pg.wait_for_timeout(400)
        chips = lambda f: pg.evaluate("f=>[...document.querySelectorAll('[data-card=l16'+f+'] .l16c')].map(e=>e.className.replace('l16c ','')+':'+e.firstChild.textContent)", f.lower())
        c = chips('A')
        check('the plan of BMS is written beside each STN: names and the grey colour of the plan (%d chips)' % len(c), len(c) == 13 and c[0] == 'auto:Cyborg 5-1' and c[4] == 'auto:Falcon 2-1' and c[6] == 'auto:Jackal 1-1' and c[12] == 'auto:Mako 7-3')
        check('file B has none (empty)', chips('B') == [])
        check('the cross is on the first slot of each flight, but not on the own flight', pg.evaluate("()=>[...document.querySelectorAll('[data-card=l16a] .l16x')].map(b=>b.closest('.l16c').firstChild.textContent)") == ['Falcon 2-1', 'Jackal 1-1', 'Mako 7-1'])
        check('a locked card (Edit not pressed) hides the crosses and Back to auto', pg.evaluate("()=>[...document.querySelectorAll('[data-card=l16a] .l16x')].every(b=>getComputedStyle(b).display=='none')") and pg.locator('[data-card=l16a] [data-l16back]').count() == 0)
        pg.click('[data-card=l16a] [data-edit]'); pg.wait_for_timeout(200)
        check('Edit shows the crosses', pg.evaluate("()=>[...document.querySelectorAll('[data-card=l16a] .l16x')].every(b=>getComputedStyle(b).display!='none')"))
        pg.locator('[data-card=l16a] .l16x').nth(0).click(); pg.wait_for_timeout(400)
        d = D()
        check('the cross of Falcon 2 takes it out of file A (both slots) %s' % stns(d, 'A')[4:8], stns(d, 'A') == BASE[:4] + [E] * 4 + BASE[8:] and 'auto:Falcon 2-1' not in chips('A'))
        check('Back to auto appears (file A changed) and brings the plan back', pg.locator('[data-card=l16a] [data-l16back]').count() == 1)
        pg.click('[data-card=l16a] [data-l16back]'); pg.wait_for_timeout(400)
        check('...the plan of BMS again, the button is gone, Falcon 2 is back', stns(D(), 'A') == BASE and pg.locator('[data-card=l16a] [data-l16back]').count() == 0 and 'auto:Falcon 2-1' in chips('A'))
        # an STN typed by hand stays in its slot; the plan goes on around it
        i = pg.locator('[data-card=l16a] input[data-k=FILE_A_DONOR_8_STN]'); i.fill('55555'); i.press('Tab'); pg.wait_for_timeout(300)
        c = chips('A')
        check('a typed STN is amber ("typed") with a cross that releases it', c[-1] == 'pin:typed' and pg.evaluate("()=>JSON.stringify(__app.l16.recs())") == json.dumps([{'k': 'pin', 'a': 'A', 's': 15, 'v': '55555'}], separators=(',', ':')))
        pg.evaluate("()=>__app.seat.pick(3)"); pg.wait_for_timeout(500)
        d = D()
        check('the next seat rewrites the plan but not the typed slot (Donor 8 stays 55555, number 54)', d['v']['FILE_A_DONOR_8_STN'] == '55555' and d['v']['FILE_A_CALLSIGN_NUMBER'] == '54' and stns(d, 'A')[:15] == BASE[:15])
        pg.locator('[data-card=l16a] .l16x').last.click(); pg.wait_for_timeout(400)
        check('the cross of a typed STN gives the slot back to the plan (empty again)', stns(D(), 'A') == BASE and pg.evaluate("()=>__app.l16.recs().length") == 0)
        i = pg.locator('[data-card=l16a] input[data-k=FILE_A_TEAM_3_STN]'); i.fill('00000'); i.press('Tab'); pg.wait_for_timeout(300)
        check('typing what the plan has there anyway keeps nothing', pg.evaluate("()=>__app.l16.recs().length") == 0 and pg.locator('[data-card=l16a] .l16c.pin').count() == 0)
        i = pg.locator('[data-card=l16b] input[data-k=FILE_B_TEAM_1_STN]'); pg.click('[data-card=l16b] [data-edit]'); pg.wait_for_timeout(150); i.fill('12341'); i.press('Tab'); pg.wait_for_timeout(300)
        check('file B can be typed too: an amber chip, a Clear button, and file A is not touched', chips('B') == ['pin:typed'] and pg.locator('[data-card=l16b] [data-l16back]').count() == 1 and stns(D(), 'A') == BASE)
        pg.click('[data-card=l16b] [data-l16back]'); pg.wait_for_timeout(400)
        check('Clear empties it (the typed slot too)', stns(D(), 'B') == [E] * 16 and chips('B') == [])
        check('the hints say how: the Datacard seat, Map > Add Link 16, typed STN stays; file B empty by default', 'Add Link 16' in pg.inner_text('[data-card=l16a] .hint') and 'Datacard' in pg.inner_text('[data-card=l16a] .hint') and 'Empty unless' in pg.inner_text('[data-card=l16b] .hint'))
        if shots: pg.screenshot(path=shots + '/l16-page.png')

        # ---- 6. the mission keeps the changes
        add('A', 'donor', 8, 'l', JACKAL); add('B', 'team', 4, 'a', FALCON)
        mj = pg.evaluate("async()=>JSON.stringify(await __app.msfBuild())"); m = json.loads(mj)
        want = [{'k': 'put', 'a': 'A', 'cs': 'Jackal 1', 'stn': '2345', 'n': 4, 's': 8, 'm': 'l'}, {'k': 'put', 'a': 'B', 'cs': 'Falcon 2', 'stn': '1234', 'n': 2, 's': 4, 'm': 'a'}]
        check('the mission holds the changes (datacard.l16) as the records of the flight', m['datacard'].get('l16') == want)
        dA, dB = stns(D(), 'A'), stns(D(), 'B')
        pg.evaluate("()=>__app.l16.back('A')"); pg.evaluate("()=>__app.l16.back('B')")
        pg.evaluate("async t=>__app.msfLoad(t)", mj); pg.wait_for_timeout(1200)
        pg.evaluate(PKG)
        check('opened again, the records are back and the DTC is the one of the mission', pg.evaluate("()=>JSON.stringify(__app.l16.recs())") == json.dumps(want, separators=(',', ':')) and stns(D(), 'A') == dA and stns(D(), 'B') == dB)
        old = json.loads(mj); old['datacard'].pop('l16')
        pg.evaluate("async t=>__app.msfLoad(t)", json.dumps(old)); pg.wait_for_timeout(1200); pg.evaluate(PKG)
        check('a mission from before this version (no l16) opens with no changes of the pilot, the plan is the one of BMS (its DTC lines stay as it saved them)', pg.evaluate("()=>__app.l16.recs().length") == 0 and not pg.evaluate("()=>__app.l16.info().changedA") and pg.evaluate("()=>__app.l16.info().A.filter(Boolean).length") == 13)
        # Reset of the DTC takes the Link 16 changes back with the other changes (the next seat must not bring them back)
        add('A', 'donor', 8, 'l', JACKAL)
        pg.click('#dtcrev'); pg.wait_for_timeout(600)
        check('Reset of the DTC: the lines are the ones of the file and the Link 16 changes are gone (%s)' % pg.evaluate("()=>__app.l16.recs().length"), pg.evaluate("()=>__app.l16.recs().length") == 0 and stns(D(), 'A')[:4] == ['35141', '35142', '35143', '35144'] and D()['dirty'] == [])
        pg.evaluate("()=>__app.seat.pick(1)"); pg.wait_for_timeout(500)
        check('...and the next seat writes the plan of BMS, not the old change', stns(D(), 'A') == BASE)
        pg.close()

        # ---- 7. the window of a flight of the package on the map (Cajun 6 with Mako 5, which has an STN in the campaign)
        pg = page(); flight(pg, 'Cajun 6')
        pg.evaluate("()=>__app.seat.pick(1)"); pg.wait_for_timeout(500)
        pg.click('[data-t=mp]'); pg.wait_for_selector('#mpmap .leaflet-pane', state='attached', timeout=8000); pg.wait_for_timeout(900)
        click_lb = lambda rx: pg.evaluate("rx=>{const d=[...document.querySelectorAll('#mpmap .flb.m div[data-lb]')].find(x=>new RegExp(rx).test(x.textContent));const r=d.getBoundingClientRect();d.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:r.left+5,clientY:r.top+5}))}", rx)
        pop = lambda: pg.inner_text('.mpop') if pg.locator('.mpop').count() else ''
        f0 = pg.evaluate("document.querySelector('#fsel').value")
        click_lb('MAKO'); pg.wait_for_timeout(400)
        check('a flight of the package: its label opens a window with Select flight and Add Link 16 (and where it is now)', pg.locator('.mpop [data-a=sel]').count() == 1 and pg.locator('.mpop [data-a=l16]:not([disabled])').count() == 1 and 'Mako 5' in pop() and 'file A · slot 5-6' in pop())
        check('the flight is not selected by the click alone', pg.evaluate("document.querySelector('#fsel').value") == f0)
        click_lb('TROJAN'); pg.wait_for_timeout(400)
        check('a flight with no STN in the campaign: Add Link 16 is dimmed, with the reason', pg.locator('.mpop [data-a=l16][disabled]').count() == 1 and 'no STN' in (pg.get_attribute('.mpop [data-a=l16]', 'title') or ''))
        click_lb('MAKO'); pg.wait_for_timeout(300); pg.click('.mpop [data-a=l16]'); pg.wait_for_timeout(300)
        t = pop()
        check('the panel: file A / B, Team 5-8 / Donor 9-16, only the leader / the whole flight, the start slot with what is in it, the lines of what changes', all(x in t for x in ('File A', 'File B', 'Team 5-8', 'Donor 9-16', 'Only leader', 'Whole flight', 'Start at slot', '9 · Donor 1 — empty', 'Add', 'Back')) and '5-6: Mako 5-1 … 5-2 → empty' in t and '9-10: empty → Mako 5-1 … 5-2' in t)
        check('it starts as the last choice of the pilot: file A, donor, the whole flight; the first free slot (9)', pg.evaluate("()=>[...document.querySelectorAll('.mpop .btn.on')].map(b=>b.dataset.k+'='+b.dataset.v).join()") == 'file=A,kind=donor,mode=a' and pg.evaluate("()=>document.querySelector('.mpop select').value") == '8')
        pg.click('.mpop [data-k=mode][data-v=l]'); pg.wait_for_timeout(250)
        check('"Only leader": the preview follows (5-6 emptied, 9: Mako 5-1)', '9: empty → Mako 5-1' in pop() and '5-6: Mako 5-1 … 5-2 → empty' in pop())
        pg.click('.mpop [data-k=kind][data-v=team]'); pg.wait_for_timeout(250)
        check('Team: slots 5-8 in the menu, the flight itself is marked, the preview says it stays', pg.evaluate("()=>[...document.querySelectorAll('.mpop select option')].map(o=>o.value).join()") == '4,5,6,7' and 'Mako 5-1 (this flight)' in pg.inner_text('.mpop select') and '6: Mako 5-2 → empty' in pop())
        pg.click('.mpop [data-k=mode][data-v=a]'); pg.wait_for_timeout(250)
        check('Team, whole flight (2 aircraft): the slots where it fits are free, the last one is dimmed', pg.evaluate("()=>[...document.querySelectorAll('.mpop select option')].map(o=>o.disabled?1:0).join('')") == '0001' and 'No change.' in pop())
        pg.click('.mpop [data-k=kind][data-v=donor]'); pg.wait_for_timeout(250)
        pg.select_option('.mpop select', '10'); pg.wait_for_timeout(300)
        check('a slot chosen in the menu: the preview goes there (11-12)', '11-12: empty → Mako 5-1 … 5-2' in pop() and pg.evaluate("()=>document.querySelector('.mpop select').value") == '10')
        if shots: pg.screenshot(path=shots + '/l16-popup.png')
        pg.click('.mpop [data-a=add]'); pg.wait_for_timeout(500)
        d = D(); sA = stns(d, 'A')
        check('Add: the flight is in Donor 3-4 and out of Team 1-2, the window closes and a message says where %s' % sA[4:], pg.locator('.mpop').count() == 0 and sA[4:] == [E] * 6 + ['42621', '42622'] + [E] * 4 and 'file A' in pg.inner_text('#mptoast'))
        click_lb('MAKO'); pg.wait_for_timeout(300)
        check('opened again: it says where the flight is now', 'file A · slot 11-12' in pop())
        pg.click('.mpop [data-a=l16]'); pg.wait_for_timeout(300)
        check('the panel keeps the last choice (donor, whole flight) and offers Remove', pg.locator('.mpop [data-a=rm]').count() == 1 and pg.evaluate("()=>document.querySelector('.mpop select').value") == '10')
        pg.click('.mpop [data-a=rm]'); pg.wait_for_timeout(400)
        check('Remove takes the flight out of the file A (all its slots)', stns(D(), 'A')[4:] == [E] * 12)
        click_lb('MAKO'); pg.wait_for_timeout(300); pg.click('.mpop [data-a=l16]'); pg.wait_for_timeout(300); pg.click('.mpop [data-k=file][data-v=B]'); pg.wait_for_timeout(250)
        check('file B: no Remove (it is not there), the first free slot, the lines of the preview', pg.locator('.mpop [data-a=rm]').count() == 0 and '9-10: empty → Mako 5-1 … 5-2' in pop() and '5-6' not in pop())
        pg.click('.mpop [data-a=add]'); pg.wait_for_timeout(400)
        check('Add to file B: slots 9-10 of B, file A is what it was', stns(D(), 'B')[8:10] == ['42621', '42622'] and stns(D(), 'A')[4:] == [E] * 12)
        click_lb('MAKO'); pg.wait_for_timeout(300); pg.click('.mpop [data-a=sel]'); pg.wait_for_timeout(900)
        check('Select flight loads the flight on the Datacard (the window closes)', pg.locator('.mpop').count() == 0 and pg.evaluate("document.querySelector('#fsel').value") != f0 and 'Mako' in pg.evaluate("()=>__app.F.cs"))
        # the changes of Cajun 6 are kept for Cajun 6 when another flight is on the card
        check('the changes belong to the flight: another flight on the card has its own (none), the first flight has them back', pg.evaluate("()=>__app.l16.recs().length") == 0)
        flight(pg, 'Cajun 6')
        check('back on Cajun 6: its records are there', pg.evaluate("()=>__app.l16.recs().map(r=>r.a+':'+r.cs).join()") == 'A:Mako 5,B:Mako 5')
        pg.evaluate("()=>{__app.ST.DCS.l16=false}")
        pg.click('[data-t=mp]'); pg.wait_for_timeout(900); click_lb('MAKO'); pg.wait_for_timeout(300)
        check('the switch of Link 16 off: Add Link 16 says why (title) and the panel refuses', 'Switch on' in (pg.get_attribute('.mpop [data-a=l16]', 'title') or ''))
        pg.click('.mpop [data-a=l16]'); pg.wait_for_timeout(300)
        check('the panel says it too, the Add button is dimmed', 'Switch on' in pop() and pg.locator('.mpop [data-a=add][disabled]').count() == 1)
        pg.close()

        # ---- 8. the map with the editing off (the Weapons pages, until "Edit points"): a click on the label only selects the flight, as before
        pg = page(); flight(pg, 'Cajun 6')
        pg.click('[data-t=mp]'); pg.wait_for_selector('#mpmap .leaflet-pane', state='attached', timeout=8000); pg.wait_for_timeout(900)
        pg.evaluate("()=>__app.mapV.toggleEdit()")
        f0 = pg.evaluate("document.querySelector('#fsel').value")
        click_lb('MAKO'); pg.wait_for_timeout(700)
        check('editing off: no window, the flight is selected at once (or the message says it cannot be)', pg.locator('.mpop [data-a=l16]').count() == 0 and (pg.evaluate("document.querySelector('#fsel').value") != f0 or 'cannot be selected' in pg.inner_text('#mptoast')))
        pg.close()
        check('no errors in the page %s' % errs[:2], not errs)
        br.close()
finally:
    srv.terminate()
print('ALL OK' if ok else 'FAILURES')
sys.exit(0 if ok else 1)
