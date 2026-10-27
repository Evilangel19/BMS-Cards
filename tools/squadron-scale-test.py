"""Squadron with many pilots: simulated pilots (the real swarm and roster functions) spread over a few pages, linked through a mock tracker that hands each offer to a random pilot.
Measures: time until every pilot is linked with every other, until every roster is complete and every avatar arrived, and the delivery of one mission from the leader.
Usage: python3 tools/squadron-scale-test.py [pilots=24] [pages=2] [avatar_chars=9000] [mission_chars=1000000] [root=<dir of the program>]"""
import asyncio, json, os, random, subprocess, sys, threading, time
from playwright.sync_api import sync_playwright
N = int(sys.argv[1]) if len(sys.argv) > 1 else 24
H = int(sys.argv[2]) if len(sys.argv) > 2 else 2
AV = int(sys.argv[3]) if len(sys.argv) > 3 else 9000
MIS = int(sys.argv[4]) if len(sys.argv) > 4 else 1000000
R = sys.argv[5] if len(sys.argv) > 5 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8761 + (hash(R) % 50)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--directory', R], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
def tracker():
    import websockets
    sw = {}
    async def h(ws):
        mine = []
        try:
            async for raw in ws:
                m = json.loads(raw); ih = m.get('info_hash'); pid = m.get('peer_id'); S = sw.setdefault(ih, {}); S[pid] = ws; mine.append((ih, pid))
                if m.get('to_peer_id'):
                    t = S.get(m['to_peer_id'])
                    if t: await t.send(json.dumps({'action': 'announce', 'info_hash': ih, 'peer_id': pid, 'offer_id': m['offer_id'], 'answer': m['answer']}))
                else:
                    others = [w for k, w in S.items() if k != pid]
                    for o in m.get('offers') or []:
                        if others: await random.choice(others).send(json.dumps({'action': 'announce', 'info_hash': ih, 'peer_id': pid, 'offer_id': o['offer_id'], 'offer': o['offer']}))
                    await ws.send(json.dumps({'action': 'announce', 'info_hash': ih, 'interval': 120, 'complete': 0, 'incomplete': len(S)}))
        finally:
            for ih, pid in mine: sw.get(ih, {}).pop(pid, None)
    async def main():
        async with websockets.serve(h, 'localhost', 8799 + PORT - 8761, max_size=2**22): await asyncio.Future()
    threading.Thread(target=lambda: asyncio.run(main()), daemon=True).start()
tracker()
try:
    with sync_playwright() as p:
        br = p.chromium.launch(args=['--disable-features=WebRtcHideLocalIpsWithMdns'])
        pages = []
        for k in range(H):
            pg = br.new_context().new_page(); pg.goto('http://localhost:%d/tools/squadron-scale.html' % PORT); pg.wait_for_function('window.SC_READY'); pages.append(pg)
        new = pages[0].evaluate('SC.NEW'); print('program:', 'new (big squadron support)' if new else 'old (beta 37 behaviour)', '| pilots', N, 'pages', H, 'avatar chars', AV, flush=True)
        per = (N + H - 1) // H
        t0 = time.time()
        for k, pg in enumerate(pages):
            pg.evaluate('([idx,n,s,t,iv,av])=>SC.create(idx,n,s,t,iv,av)', [list(range(k * per, min(N, (k + 1) * per))), N, 'scale-secret', 'ws://localhost:%d' % (8799 + PORT - 8761), 25000, AV])
        t_mesh = t_roster = t_av = None; last = 0
        while time.time() - t0 < int(os.environ.get('MAXT', 900)):
            time.sleep(5)
            st = [x for pg in pages for x in pg.evaluate('SC.status()')]
            el = time.time() - t0
            if t_mesh is None and all(x['online'] >= N - 1 for x in st): t_mesh = el
            if t_roster is None and all(x['roster'] >= N for x in st): t_roster = el
            if t_av is None and all(x['av'] >= N for x in st): t_av = el
            if el - last >= 20:
                last = el; print('%4ds links min/avg %d/%.1f of %d | roster min %d | avatars min %d | peer objects avg %.0f' % (el, min(x['online'] for x in st), sum(x['online'] for x in st) / N, N - 1, min(x['roster'] for x in st), min(x['av'] for x in st), sum(x['peers'] for x in st) / N), flush=True)
            if t_mesh and t_roster and t_av: break
        fmt = lambda t: ('%ds' % t) if t else 'NOT REACHED'
        print('every pilot linked with every other:', fmt(t_mesh)); print('every roster complete:', fmt(t_roster)); print('every avatar arrived:', fmt(t_av), flush=True)
        st = [x for pg in pages for x in pg.evaluate('SC.status()')]
        for x in st:
            if x['miss']: print('  pilot %d lacks %s | peer objects %d | last error: %s | ice %s closed %s | relay offers/fwd/ans/acc %s' % (x['i'], [int(u[1:4]) for u in x['miss']], x['peers'], x['err'], x['ice'], x['closed'], x['rly']))
        for x in st:
            if x['miss']:
                for j in x['miss']:
                    jn = int(j[1:4]); pg_i = pages[x['i'] // per]; pg_j = pages[jn // per]
                    print('   inspect %d about %d: %s' % (x['i'], jn, json.dumps(pg_i.evaluate('([a,b])=>SC.inspect(a,b)', [x['i'], jn]))))
                    print('   inspect %d about %d: %s' % (jn, x['i'], json.dumps(pg_j.evaluate('([a,b])=>SC.inspect(a,b)', [jn, x['i']]))))
        print('now: links min %d, roster min %d, avatars min %d' % (min(x['online'] for x in st), min(x['roster'] for x in st), min(x['av'] for x in st)))
        if os.environ.get('PROBE'): print('time to make one offer now, per page (ms):', [pg.evaluate('SC.probe()') for pg in pages], flush=True)
        r = pages[0].evaluate('c=>SC.send(c)', MIS); time.sleep(4)
        st = [x for pg in pages for x in pg.evaluate('SC.status()')]
        got = sum(1 for x in st if x['i'] != 0 and x['recv'] >= 1)
        print('mission %d chars to %d linked pilots: %d ms | confirmed ok %d | failed %s' % (r['chars'], r['targets'], r['ms'], r['ok'], r['bad'][:3]))
        print('pilots that really received it: %d of %d | received more than once: %d' % (got, N - 1, sum(1 for x in st if x['recv'] > 1)))
        br.close()
finally:
    srv.kill()
