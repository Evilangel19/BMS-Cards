#!/usr/bin/env python3
"""Runs all the browser tests (tools/*-test.py), several at a time (every test has its own port).
Usage: python3 tools/run-all.py [-j N] [name ...]   (default: 2 at a time, all tests; the slowest first)
A test that fails is run once more alone, because some checks are timing-sensitive when the computer is busy."""
import subprocess, sys, os, re, time
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
SLOW = ['map', 'weapons', 'squadron', 'dtcpage', 'kneeboard', 'perf', 'missiles']
args = sys.argv[1:]; jobs = 2
if '-j' in args:
    i = args.index('-j'); jobs = int(args[i + 1]); del args[i:i + 2]
names = args or sorted(f[:-8] for f in os.listdir(HERE) if f.endswith('-test.py'))
names.sort(key=lambda n: (SLOW.index(n) if n in SLOW else len(SLOW), n))

def run(n):
    t = time.time(); out = ''
    for attempt in (1, 2):
        p = subprocess.run([sys.executable, os.path.join(HERE, n + '-test.py')], cwd=ROOT, capture_output=True, text=True, timeout=2400)
        out = p.stdout + p.stderr
        fails = [l for l in out.splitlines() if l.startswith('FAIL') or 'Traceback' in l]
        if not fails: break
    ok = sum(1 for l in out.splitlines() if l.startswith('OK'))
    print('%-18s ok=%-4d fails=%d  %3ds%s %s' % (n, ok, len(fails), time.time() - t, ' (2nd run)' if attempt == 2 else '', ' | '.join(fails[:3])), flush=True)
    return len(fails)

t0 = time.time()
with ThreadPoolExecutor(jobs) as ex: bad = sum(ex.map(run, names))
print('%d tests, %d failures, %d s' % (len(names), bad, time.time() - t0)); sys.exit(1 if bad else 0)
