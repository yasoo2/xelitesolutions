# probe-batch011.cjs — RESULT (Muse cycle 2026-10-03)
RUN=local node v24.18.0, exact-byte extraction from NVIDIA dirty sources, transpile via local typescript 5.9.3.
NVIDIA tree untouched (read-only); no network except pre-existing local port/health probes.

```
SRC ledger sha256=9b62ff0eeb9aec96cd3fac8020e432b294c4adf28845b03c345bcede190a1e93 mtime=2026-10-02T19:41:20.916Z
SRC visual sha256=07003a667fb193716c75b7366b917c41ad3740fe2f65cdab4d1b9e6f8759ab93 mtime=2026-10-03T07:43:08.080Z
SRC bulk sha256=75a19fd767a2572d2307fe0e81e482570fc2965cafe622edf3dde97967a4798f mtime=2026-10-03T07:27:26.074Z
SRC containment sha256=6e906f95bf24c0c1b089d04625d7f09a5eff6a3f41d85d7b66021288becbbd05 mtime=2026-09-24T19:52:15.862Z
PASS L1 prose-substituted read_file accepted actual=true expected=true
PASS L2 structured read_file still rejected actual=false expected=false
PASS L3 traversal path rejected actual=false expected=false
PASS L4 multi-path args rejected actual=false expected=false
PASS L5 empty args rejected actual=false expected=false
PASS L6 leading ./ stripped+accepted actual=true expected=true
PASS L7 tool name case-insensitive actual=true expected=true
PASS L8 project_detect leg still stops actual=false expected=false
PASS L9 shell npm-test still accepted actual=true expected=true
PASS L10 shell npm-install still rejected actual=false expected=false
PASS L11 custom checker still rejected actual=false expected=false
PASS L12a visual_qa in gate set actual=true expected=true
PASS L12b quality_run in gate set actual=true expected=true
PASS L13 dotdot-mid-path conservatively rejected actual=false expected=false
PASS L14 absolute path accepted-at-gate actual=true expected=true // execution containment stays with ToolService
PASS L15 final-gate 2-arg read rejected actual=false expected=false
PREDICATE-SPAN sha256=717688b19e9ff96263a7a1f76214d1caf56ce1a8a4933752a1a5dd945816ff2b
PASS B0 bulk predicate shape identical actual=true expected=true
PASS C1 inside allowed actual=false expected=false
PASS C2 traversal denied actual=true expected=true
PASS C3 absolute-outside denied actual=true expected=true
PASS C4 sibling-prefix denied actual=true expected=true
PASS C5a inline case-variant denied (false refusal) actual=true expected=true
PASS C5b shared primitive case-variant allowed actual=true expected=true
PASS C5c DIVERGENCE proven (deny-vs-allow) actual=true expected=true // platform=win32
PASS C6 relative-from-foreign-cwd denied actual=true expected=true // anchored at process.cwd, not workspace root
PASS C7 root-equal allowed actual=false expected=false
PASS C8 empty path fail-closed actual=true expected=true
PASS C9 shared: traversal denied actual=false expected=false
PASS C10 shared: sibling denied actual=false expected=false
PASS T1 extra-arg call is TS2554 actual=true expected=true // codes=[2554]

TOTAL pass=30 fail=0
```

VERDICT: 30/30 GREEN. Isolated/focused evidence only — not REAL_JOE_UI. Bytes may drift (NVIDIA tree live); re-verify hashes before adoption.
