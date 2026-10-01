# MUSE WIRING DISCOVERY 048 — grep_search vs search_text execute-body diff (both trees)

FOLLOWS=tmp/wiring-audit/MUSE-WIRING-DISCOVERY-047.md (closed its UNKNOWN item)
HEAD_MUSE=ef900429 MAIN=e8fd9589 working tree (read-only, dirty preserved, untouched)
ENV=source-read only, zero Joe imports, no provider calls, no source edits anywhere
METHOD=read both execute() bodies in full (Muse tree), then byte-compare the exact
class line ranges against MAIN working tree.

## F50 bodies compared

A. grep_search — GrepSearchTool, SystemTools.ts:1022-1129, ORPHANED (047/F49)
   - Mechanism: shells out to EXTERNAL grep/find via executionEngine (3 shell
     legs: grep_check, grep_gnu OR fallback find + fallback grep).
   - Requires grep + find binaries on PATH. Bare Windows/cmd hosts without a
     unix toolchain cannot satisfy this (portability gap).
   - Input: query (required), path, include, exclude. Output: matches string[]
     (raw `file:line:text`, cap 100), count. Permissions: read+execute.
   - Containment: safePath(searchPath).
   - SECURITY OBSERVATION (static, not exploited): raw `query`, `workDir` and
     up-to-500 file paths are interpolated into shell command strings without
     quoting (:1079 `grep ${args.join(' ')}`, :1087 `find ${workDir}...`,
     :1104 `grep -nI -- "${query}" ${files...}`). Shell-metacharacter input is
     a command-injection shape. Strengthens DO-NOT-REGISTER without rework.

B. search_text — SearchTextTool, UtilityTools.ts:139-212, REGISTERED
   - Mechanism: pure Node (glob + fs.readFileSync + RegExp). Zero shell, zero
     external binaries. Portable.
   - Input: query|pattern (requiredAny), path, regex, caseSensitive, glob,
     maxResults (default 200, cap 1000). Output: matches {file,line,text}[],
     total. Permissions: read only.
   - Containment: resolveToolPath funnel (isWithinRoot). Binary/>2MB skips.

## F51 verdict: DUPLICATE overlap confirmed, orphan stands

- Same user-visible capability (workspace text search, file+line results).
- search_text is strictly superior on: portability (no grep/find), security
  (no shell interpolation), contract richness (regex/case/glob/maxResults),
  structured output, least privilege (read vs read+execute).
- grep_search offers nothing search_text lacks except include/exclude-dir
  spellings, which glob covers.
- CLASSIFICATION: grep_search stays ORPHANED with DUPLICATE overlap.
- REPAIR-BACKLOG INPUT (not implemented this cycle): P3 — do NOT register
  grep_search; later reviewed decision to remove or justify. Owner UNASSIGNED.
  If anyone ever proposes registration, the shell-interpolation finding must
  be closed first. No deletion/registration performed (audit safety rule).

## Cross-tree parity (exact evidence)

- GrepSearchTool SystemTools.ts lines 1022-1129: byte-identical Muse HEAD vs
  MAIN working tree (GREP_CLASS_IDENTICAL=True).
- SearchTextTool UtilityTools.ts lines 139-212: byte-identical Muse HEAD vs
  MAIN working tree (SEARCH_CLASS_IDENTICAL=True).
- Therefore F50/F51 are SHARED-MAIN findings, not Muse-only drift.

## Counts (this checkpoint)

DUPLICATE_CONFIRMED_THIS_CYCLE=1 pair (grep_search/search_text, shared)
IMPLEMENTED_NOT_REGISTERED_STILL=1 (grep_search, both trees)
NEW_SECURITY_OBSERVATION=1 (grep_search unquoted shell interpolation, static)
UNKNOWN=none opened; 047 UNKNOWN closed.
