"""Compare filed p1012 survey runs A/B for verdict-identity.

Compares ok + error-prefix + key compare fields. Exit 0 only when all
compared verdicts are identical. Paths with machine-specific content
(sessionRoot/defaultRoot/apiCwd/at) are excluded by construction.
"""
import json
import sys

KEYS = [
    'dcJsonOk', 'dcJsonErrPrefix', 'dcJsonHasSummary',
    'dcBadOk', 'dcBadErrPrefix', 'dcBadScannedFalse',
    'erCtlOk', 'erCtlRecovered', 'erCtlType',
    'erFixRecovered', 'erFixLogHasHealed', 'pathRestored',
    'rrOk', 'rrErrPrefix', 'rrExitCode',
    'rdOk', 'rdHasStatus',
    'ctrlOk', 'ctrlExit',
]

LEG_KEYS = ['ok', 'error', 'timedOut', 'threw']


def load(p):
    with open(p, encoding='utf-8') as f:
        return json.load(f)


def main():
    a = load(r'D:\Joe\muse-worktree\tmp\wiring-audit\p1012_runA.json')
    b = load(r'D:\Joe\muse-worktree\tmp\wiring-audit\p1012_runB.json')
    diffs = []
    for k in KEYS:
        va = (a['live'].get('compare') or {}).get(k)
        vb = (b['live'].get('compare') or {}).get(k)
        if json.dumps(va, sort_keys=True) != json.dumps(vb, sort_keys=True):
            diffs.append(f'compare.{k}: A={va!r} B={vb!r}')
    legs_a = sorted(k for k in a['live'] if k != 'compare')
    legs_b = sorted(k for k in b['live'] if k != 'compare')
    if legs_a != legs_b:
        diffs.append(f'leg-ids differ: A={legs_a} B={legs_b}')
    for leg in legs_a:
        if leg not in b['live']:
            continue
        for lk in LEG_KEYS:
            va = a['live'][leg].get(lk)
            vb = b['live'][leg].get(lk)
            if lk == 'error':
                va = (va or '')[:80]
                vb = (vb or '')[:80]
            if va != vb:
                diffs.append(f'{leg}.{lk}: A={va!r} B={vb!r}')
    for req in ('cleanup',):
        if a.get(req) != 'ok' or b.get(req) != 'ok':
            diffs.append(f'{req}: A={a.get(req)!r} B={b.get(req)!r}')
    print(f'verdictDiffs={len(diffs)}')
    for d in diffs:
        print('DIFF', d)
    sys.exit(1 if diffs else 0)


if __name__ == '__main__':
    main()
