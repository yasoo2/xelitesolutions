#!/usr/bin/env python3
"""Break one line on purpose, run the guard, restore — and prove the restore.

usage: mutate.py <label> <file> (<old-file> <new-file>)+ <jest-args...>

<old-file>/<new-file> hold the exact text to replace (must occur exactly once).
Prints the jest verdict lines (✓/✕, Expected/Received, Tests:) under the
mutation, then restores the file and checks its sha256 matches the original.
"""
import hashlib
import os
import re
import subprocess
import sys

label, target = sys.argv[1:3]
rest = sys.argv[3:]
pairs = []
while len(rest) >= 2 and os.path.isfile(rest[0]) and os.path.isfile(rest[1]) and not rest[0].endswith('.ts'):
    pairs.append((open(rest[0], encoding='utf-8', newline='').read(), open(rest[1], encoding='utf-8', newline='').read()))
    rest = rest[2:]
jest_args = rest
# Bytes, not text: a CRLF file read in text mode comes back LF, and the old
# digest compared two equally-translated strings and said «identical» while
# the file on disk had lost every \r (measured on AgentOrchestrator.ts).
raw = open(target, 'rb').read()
digest = hashlib.sha256(raw).hexdigest()
src = raw.decode('utf-8')
mutated = src
for old, new in pairs:
    # A line break in <old> matches LF or CRLF: files here mix both, so a
    # literal compare misses them and a whole-file conversion corrupts them.
    pattern = re.compile(r'\r?\n'.join(re.escape(part) for part in old.replace('\r\n', '\n').split('\n')))
    hits = pattern.findall(mutated)
    if len(hits) != 1:
        print(f'MUTATION {label}: old text occurs {len(hits)} times in {target} — refusing')
        sys.exit(2)
    mutated = pattern.sub(lambda _m: new, mutated, count=1)
open(target, 'wb').write(mutated.encode('utf-8'))
try:
    env = dict(os.environ, NODE_OPTIONS='--use-openssl-ca')
    # jest runs from the api/ directory of the checkout that owns <file>, so
    # the tool works the same in the main tree and in any worktree.
    api_dir = os.path.abspath(target)
    while os.path.basename(api_dir) != 'api':
        api_dir = os.path.dirname(api_dir)
        if api_dir in ('/', ''):
            print('MUTATION: <file> is not under an api/ directory'); sys.exit(2)
    p = subprocess.run(['npx', 'jest', '--verbose', '--runTestsByPath', *jest_args], cwd=api_dir,
                       capture_output=True, text=True, env=env)
    out = re.sub(r'\x1b\[[0-9;]*m', '', p.stdout + p.stderr)
    print(f'=== MUTATION {label} ({os.path.relpath(target, os.path.dirname(api_dir))}) — jest exit {p.returncode}')
    keep = re.compile(r'^\s*(✓|✕|●.*›|Expected|Received|Tests:|Test Suites:)')
    for line in out.split('\n'):
        if keep.search(line) and 'Console' not in line:
            print('   ' + line.strip()[:220])
finally:
    open(target, 'wb').write(raw)
    restored = hashlib.sha256(open(target, 'rb').read()).hexdigest()
    print(f'=== RESTORED {label}: sha256 {"identical" if restored == digest else "DIFFERS"}')
