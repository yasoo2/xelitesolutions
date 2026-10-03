import json
r = json.load(open('bundle-run1.result.json'))
print('registeredCount=', r['registeredCount'], 'catalogueCount=', r['catalogueCount'])
for b, tools in r['batch'].items():
    print('##', b)
    for t in tools:
        p = r['perTool'][t]
        print(t + ': reg=%s exec=%s cat=%s alias=%s ver=%s perm=%s se=%s mock=%s def=%s regrefs=%s' % (
            p['registered'], p['hasExecute'], p['catalogue'], p['alias'],
            p['verificationUnconditional'], p['permissions'], p['sideEffects'],
            p['mockSupported'], p['defFiles'], r['registryRefs'][t]))
print('## RESOLVE')
for k, v in r['resolveOutcomes'].items():
    print(repr(k), '->', json.dumps(v, ensure_ascii=False))
print('## GATES')
for k, v in r['gateShapes'].items():
    print(k, '->', json.dumps(v))
print('## CROSSTREE')
for k, v in r['crossTree'].items():
    print(k, json.dumps(v))
