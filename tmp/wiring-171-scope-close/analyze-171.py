import json
r = json.load(open('bundle-run1.result.json'))
print('registeredCount=', r['registeredCount'], 'catalogueCount=', r['catalogueCount'])
for t in r['names']:
    p = r['perTool'][t]
    print(t + ': reg=%s exec=%s cat=%s alias=%s planBare=%s perm=%s se=%s rate=%s audit=%s req=%s def=%s regrefs=%s' % (
        p['registered'], p['hasExecute'], p['catalogue'], p['alias'],
        json.dumps(p['planResolveBareName']), p['permissions'], p['sideEffects'],
        p['rateLimitPerMinute'], p['auditFields'], p['inputRequired'], p['defFiles'], r['registryRefs'][t]))
print('## EXEC-REDIRECTS')
print(json.dumps(r['executorRedirects'], indent=1))
print('## RESOLVE')
for k, v in r['resolveOutcomes'].items():
    print(repr(k), '->', json.dumps(v, ensure_ascii=False))
print('## GATES')
for k, v in r['gateShapes'].items():
    print(k, '->', json.dumps(v))
print('## CROSSTREE')
for k, v in r['crossTree'].items():
    print(k, json.dumps(v))
