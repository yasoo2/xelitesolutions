#!/usr/bin/env python3
"""Parse a jest log into per-suite failure blocks.

For every `FAIL <path>` section, print each `● title` failure (Console blocks
skipped) with the first non-empty line of its body (the raw error line) and,
when present, the Expected/Received pair and the test-file location line.

usage: parse_fails.py <jest.log> [--json out.json]
"""
import json
import re
import sys

ANSI = re.compile(r'\x1b\[[0-9;]*m')

def parse(path):
    lines = [ANSI.sub('', l.rstrip('\n')) for l in open(path, encoding='utf-8', errors='replace')]
    suites = {}
    cur = None
    i = 0
    while i < len(lines):
        l = lines[i]
        if l.startswith('FAIL '):
            cur = l[5:].strip().split(' ')[0]
            suites.setdefault(cur, [])
            i += 1
            continue
        if l.startswith('PASS ') or l.startswith('Test Suites:') or l.startswith('Summary of all failing tests'):
            cur = None
            i += 1
            continue
        if cur and l.startswith('  ● ') and not l.startswith('  ● Console'):
            title = l[4:].strip()
            body = []
            j = i + 1
            while j < len(lines):
                m = lines[j]
                if m.startswith('  ● ') or m.startswith('FAIL ') or m.startswith('PASS ') or m.startswith('Test Suites:'):
                    break
                body.append(m)
                j += 1
            first = next((b.strip() for b in body if b.strip()), '')
            exp = next((b.strip() for b in body if b.strip().startswith('Expected')), '')
            rec = next((b.strip() for b in body if b.strip().startswith('Received')), '')
            at = next((b.strip() for b in body if re.search(r'at .*__tests__/', b)), '')
            suites[cur].append({'title': title, 'first': first, 'expected': exp, 'received': rec, 'at': at,
                                'body': '\n'.join(body[:40])})
            i = j
            continue
        i += 1
    return suites

if __name__ == '__main__':
    s = parse(sys.argv[1])
    if '--json' in sys.argv:
        json.dump(s, open(sys.argv[sys.argv.index('--json') + 1], 'w'), ensure_ascii=False, indent=1)
    for suite, fails in s.items():
        print(f'### {suite}  ({len(fails)} failing)')
        for f in fails:
            print(f'  ● {f["title"][:150]}')
            print(f'      first: {f["first"][:200]}')
            if f['expected']:
                print(f'      {f["expected"][:160]}')
            if f['received']:
                print(f'      {f["received"][:160]}')
