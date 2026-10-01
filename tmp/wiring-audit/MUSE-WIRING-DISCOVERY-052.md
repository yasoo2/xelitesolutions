# MUSE wiring discovery checkpoint 052 (2026-10-01, HEAD 9cc1c053)

Scope: cross-tree corroboration of checkpoint 051 (executed main-tree
registry-vs-catalogue reconciliation, READ-ONLY). No source edits in either
tree. Probe: tmp/wiring-audit/revived52.ts, output
fx-revived52/revived52.json.

## 1. Main-tree executed counts (D:\Joe\xelitesolutions, real imports)

- REGISTERED_TOOLS = 164 (probe) — boot line "Registered 164 tools
  (71 revived)". First EXECUTED main count (was: /api/tools report).
- PLANNER_TOOL_CATALOGUE = 40 entries (probe) — same size as Muse tree.
- safeNew literal labels = 70; revived split 53 unlisted / 17 listed,
  IDENTICAL tool-name lists to Muse 051 (byte-equal sets).
- catalogueNotRegistered = [] — zero dangling entries on main too.
- registeredNotCatalogue = 124 (164-40, exact list in revived52.json).

## 2. Exact Muse-vs-main delta (executed, name-level)

- Compare-Object of the two `registeredNotCatalogue` lists: exactly ONE
  difference: `=> specification_verification` (present in main unlisted,
  absent from Muse tree entirely).
- This CONFIRMS checkpoint 045 ENTRY-B (MAIN+1 = spec_verification) with
  executed evidence on both sides. No other registration delta.
- Catalogue contents: static `tool: '...'` labels 41 vs 41 unique across
  plan-tools.ts in both trees, ZERO diff (executed catalogue = 40 in both;
  the 41st static label lives outside PLANNER_TOOL_CATALOGUE in both —
  same file shape, not a contradiction).

## 3. Muse 051 re-verified at new HEAD

- Re-ran revived51.ts at 9cc1c053: 163/40/70/123/[]/53/17 — IDENTICAL to
  051 at cb227faa. Docs-only commits since; counts stable.

## 4. Read-only proof (main tree untouched)

- Recursive mtime scan of D:\Joe\xelitesolutions\api\src: ZERO files
  modified within the probe window. All probe output landed in Muse
  tmp/wiring-audit/fx-revived52 only. NVIDIA dirty work preserved.

## 5. Sandbox method note (reproducibility)

- Sandbox cwd is `\\?\`-prefixed. Consequences observed this cycle:
  - `npx` fails (npm cache path error).
  - `node node_modules/ts-node/dist/bin.js ... ../tmp/...` fails with
    EISDIR lstat 'D:' on the relative script path.
  - `.bin\ts-node.cmd` fails: cmd.exe prints "UNC paths are not
    supported. Defaulting to Windows directory." — a live instance of
    the WIRING-P1-010 failure class in the worker environment itself.
  - WORKAROUND (used for all runs above): `Set-Location` to a plain
    `D:\...` path, then invoke ts-node bin.js with ABSOLUTE script +
    tsconfig paths. EXIT 0, full JSON output.
- Env pattern unchanged: OFFLINE_MODE/JOE_TEST_MODE/NODE_ENV=test +
  ephemeral test-only JWT_SECRET (not persisted).

## 6. Disposition vs audit summary

- REGISTERED_TOOLS: Muse 163 (re-confirmed executed), main 164
  (new executed evidence, was /api/tools report). Delta fully
  attributed to one tool.
- REGISTERED_NOT_PLANNER_PROMPT_LISTED: Muse 123, main 124 (exact).
- catalogueNotRegistered = [] on BOTH trees (no obsolete catalogue
  entries by this measure).
- OBSOLETE_REGISTRATION (dormant-priority-16) still UNKNOWN — artifacts
  still not located; next step unchanged (locate or regenerate).
- No repair attempted (discovery lane is read-only). Counts feed
  JOE-WIRING-AUDIT-SUMMARY reconciliation by the audit owner.
