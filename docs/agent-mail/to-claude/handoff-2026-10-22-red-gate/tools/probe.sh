#!/usr/bin/env bash
#  probe.sh <commit> <tests-file> <out-dir>
#
#  Checks <commit> out in the scratch worktree (never the main checkout), runs
#  the test files listed in <tests-file> that exist at that commit, and writes
#  jest's JSON report to <out-dir>/<commit>.json plus a one-line-per-suite
#  status file <out-dir>/<commit>.status ("ABSENT|PASS|FAIL <path>").
#
#  Batches of 12, like the gate, so one process never carries the whole list.
set -uo pipefail
C="$1"; LIST="$2"; OUT="$3"
SP=/tmp/claude-0/-home-user-xelitesolutions/4f04c649-b866-5556-be72-fb3fc47a0cfc/scratchpad
WT="$SP/wt"
mkdir -p "$OUT"; export JEST_EXTRA="${JEST_EXTRA:-}"
git -C "$WT" checkout -q --detach "$C" || { echo "checkout failed: $C"; exit 3; }
[ -e "$WT/api/node_modules" ] || ln -s /home/user/xelitesolutions/api/node_modules "$WT/api/node_modules"
STATUS="$OUT/$C.status"; : > "$STATUS"
PRESENT=()
while read -r f; do
    [ -z "$f" ] && continue
    if [ -f "$WT/api/$f" ]; then PRESENT+=("$f"); else echo "ABSENT $f" >> "$STATUS"; fi
done < "$LIST"
n=0
for ((i=0; i<${#PRESENT[@]}; i+=12)); do
    n=$((n+1))
    chunk=("${PRESENT[@]:i:12}")
    ( cd "$WT/api" && NODE_OPTIONS=--use-openssl-ca npx jest --runTestsByPath "${chunk[@]}" \
        --json --outputFile="$OUT/$C.$n.json" > "$OUT/$C.$n.log" 2>&1 )
done
python3 - "$OUT" "$C" "$STATUS" <<'PY'
import json, glob, os, sys
out, c, status = sys.argv[1:4]
seen = set()
with open(status, 'a') as st:
    for jf in sorted(glob.glob(os.path.join(out, f'{c}.*.json'))):
        try:
            d = json.load(open(jf))
        except Exception as e:
            st.write(f'NOJSON {jf}\n'); continue
        for r in d['testResults']:
            p = r['name'].split('/api/', 1)[1]
            seen.add(p)
            failed = [a['fullName'] for a in r['assertionResults'] if a['status'] == 'failed']
            if r['status'] == 'failed' and not failed:
                failed = ['<suite failed to run> ' + (r.get('message') or '')[:200].replace('\n', ' ')]
            st.write(('FAIL ' if r['status'] == 'failed' else 'PASS ') + p + '\n')
            for t in failed:
                st.write('  - ' + t.replace('\n', ' ') + '\n')
PY
echo "probe $C done: $(grep -c '^PASS' "$STATUS") pass, $(grep -c '^FAIL' "$STATUS") fail, $(grep -c '^ABSENT' "$STATUS") absent"
