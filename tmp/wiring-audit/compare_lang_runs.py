import json, sys

a = json.load(open('D:/Joe/muse-worktree/tmp/wiring-audit/trunk_lang_runA.json'))
# run B is the just-written trunk_lang.json
b = json.load(open('D:/Joe/muse-worktree/tmp/wiring-audit/trunk_lang.json'))

def verdict(entry):
    if not isinstance(entry, dict):
        return repr(entry)
    if 'ok' in entry and ('error' in entry or 'outputShape' in entry):
        err = (entry.get('error') or '')
        return (entry.get('ok'), err[:90], entry.get('outputShape'))
    # compare-entry: full JSON minus volatile bits
    s = json.dumps(entry, sort_keys=True)
    return s

keys = sorted(set(a['live']) | set(b['live']))
diffs = []
for k in keys:
    va, vb = verdict(a['live'].get(k)), verdict(b['live'].get(k))
    if va != vb:
        diffs.append((k, va, vb))
print('legs_a=%d legs_b=%d' % (len(a['live']), len(b['live'])))
print('cleanup_a=%s cleanup_b=%s' % (a['cleanup'], b['cleanup']))
print('verdictDiffs=%d' % len(diffs))
for k, va, vb in diffs:
    print('DIFF', k)
    print('  A:', str(va)[:300])
    print('  B:', str(vb)[:300])
# declaration + verdict-table stability
print('declDiff=%s' % (a['decl'] != b['decl']))
print('verdictTableDiff=%s' % (a['verdictTable'] != b['verdictTable']))
sys.exit(1 if diffs else 0)
