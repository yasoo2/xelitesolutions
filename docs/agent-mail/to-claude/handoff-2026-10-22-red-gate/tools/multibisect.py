#!/usr/bin/env python3
"""Multi-test bisect over the first-parent chain GOOD..BAD.

For every test failing at BAD, find the first first-parent commit at which it
fails while it passed (or did not exist) at the previous probed commit.

Probes run through probe.sh in the scratch worktree; results are cached per
commit in probes/<sha>.*.json, so the script can be re-run and resumes.

usage: multibisect.py GOOD BAD
"""
import glob
import json
import os
import subprocess
import sys

SP = '/tmp/claude-0/-home-user-xelitesolutions/4f04c649-b866-5556-be72-fb3fc47a0cfc/scratchpad'
REPO = '/home/user/xelitesolutions'
OUT = f'{SP}/probes'
GOOD, BAD = sys.argv[1], sys.argv[2]

def sh(*a):
    return subprocess.check_output(a, cwd=REPO, text=True).strip()

chain = sh('git', 'rev-list', '--first-parent', '--reverse', f'{GOOD}..{BAD}').split('\n')
chain = [sh('git', 'rev-parse', GOOD)] + chain
short = [c[:8] for c in chain]
print(f'chain: {len(chain)} commits', flush=True)

def load(c):
    """suite -> {test fullName -> status} merged over every probe run of commit c."""
    runs = sorted(glob.glob(f'{OUT}/{c}-run*'))
    if not runs:
        return None
    res = {}
    for rd in runs:
        st = f'{rd}/{c}.status'
        if os.path.exists(st):
            for line in open(st):
                if line.startswith('ABSENT '):
                    res[line.split()[1]] = None
        for jf in glob.glob(f'{rd}/{c}.*.json'):
            try:
                d = json.load(open(jf))
            except Exception:
                continue
            for r in d['testResults']:
                p = r['name'].split('/api/', 1)[1]
                tests = {a['fullName']: a['status'] for a in r['assertionResults']}
                if r['status'] == 'failed' and not any(v == 'failed' for v in tests.values()):
                    tests['<suite>'] = 'failed'
                res[p] = tests
    return res

probed = {}

def probe(i, suites):
    c = short[i]
    have = load(c)
    if have is not None and all(s in have for s in suites):
        probed[i] = have
        return have
    need = [s for s in suites if have is None or s not in have]
    k = len(glob.glob(f'{OUT}/{c}-run*'))
    rd = f'{OUT}/{c}-run{k}'
    os.makedirs(rd, exist_ok=True)
    lst = f'{rd}/list.txt'
    with open(lst, 'w') as fh:
        fh.write('\n'.join(sorted(need)) + '\n')
    subprocess.run([f'{SP}/probe.sh', c, lst, rd], check=False)
    probed[i] = load(c) or {}
    return probed[i]

def status(res, suite, test):
    if res is None or suite not in res:
        return 'unknown'
    t = res[suite]
    if t is None:
        return 'absent'
    if test in t:
        return 'fail' if t[test] == 'failed' else ('pass' if t[test] == 'passed' else t[test])
    return 'absent'

# targets: failing tests at BAD
head = probe(len(chain) - 1, [l.strip() for l in open(f'{SP}/fail-run1.txt') if l.strip()])
targets = [(s, t) for s, tests in head.items() if tests for t, v in tests.items() if v == 'failed']
print(f'targets: {len(targets)} failing tests in {len({s for s, _ in targets})} suites', flush=True)
suites_all = sorted({s for s, _ in targets})

# coarse grid
step = int(os.environ.get('STEP', '12'))
grid = list(range(0, len(chain), step))
if grid[-1] != len(chain) - 1:
    grid.append(len(chain) - 1)
for i in grid:
    if i not in probed:
        print(f'grid probe {i} {short[i]}', flush=True)
        probe(i, suites_all)

def interval(s, t):
    """(lo, hi): lo = last probed index where test passed/absent before the first
    probed failing index hi that is preceded by a non-fail."""
    idx = sorted(probed)
    # walk from newest backwards: find the earliest fail in the final failing run
    hi = None
    for i in reversed(idx):
        st = status(probed[i], s, t)
        if st == 'fail':
            hi = i
        elif st in ('pass', 'absent', 'skipped', 'pending', 'todo'):
            return (i, hi)
    return (None, hi)

# refine
while True:
    work = {}
    for s, t in targets:
        lo, hi = interval(s, t)
        if lo is None or hi is None or hi - lo <= 1:
            continue
        mid = (lo + hi) // 2
        work.setdefault(mid, set()).add(s)
    if not work:
        break
    for mid, suites in sorted(work.items()):
        print(f'refine probe {mid} {short[mid]} ({len(suites)} suites)', flush=True)
        probe(mid, sorted(suites))

report = []
for s, t in targets:
    lo, hi = interval(s, t)
    before = status(probed[lo], s, t) if lo is not None else 'never-passed-in-range'
    report.append({'suite': s, 'test': t, 'culprit': short[hi] if hi is not None else None,
                   'parent_state': before, 'parent': short[lo] if lo is not None else None})
json.dump(report, open(f'{SP}/bisect-report.json', 'w'), ensure_ascii=False, indent=1)
from collections import Counter
cnt = Counter((r['culprit'], r['parent_state']) for r in report)
for (c, ps), n in sorted(cnt.items(), key=lambda x: -x[1]):
    msg = sh('git', 'log', '-1', '--format=%ad %s', '--date=short', c) if c else ''
    print(f'{n:4d}  {c}  (before: {ps})  {msg[:100]}')
