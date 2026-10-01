import json
o = json.load(open('D:/Joe/muse-worktree/tmp/team-consultation/t2-535-probe-20261001.json'))
print('DECIDED:', o['pass'], '/', o['decided'], ' FLIPS:', o['flips535vs166'])
for r in o['rows']:
    flag = ('FAIL' if r['ok'] is False else ('flip' if r['flip'] else ''))
    if flag or r['expected'] is None:
        print('[%s] %s: 166=%s 535=%s exp=%s %s :: %s' % (
            r['section'], r['name'], r['got166'], r['got535'], r['expected'], flag, r['reason535'][:90]))
