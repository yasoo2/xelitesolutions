# Git cross-tree read correction — 2026-10-03 (Muse cycle 171)

## What happened
An early command this cycle ran:

  git --git-dir=D:\Joe\xelitesolutions\.git diff --stat

from cwd D:\Joe\muse-worktree WITHOUT `-C`. With explicit `--git-dir` and no
`-C`/`GIT_WORK_TREE`, git resolves the worktree to the CALLER's cwd. The
output (49 files, 3408+/777-) compared NVIDIA's index against MUSE-WORKTREE
working files -- a cross-tree artifact, NOT NVIDIA's dirty state.

A related symptom: `git --git-dir=... status -- <path>` showed nothing for
`api/src/core/intelligence/requested-action.ts`, while `git -C
D:\Joe\xelitesolutions status` correctly shows it as `??` (untracked).

## Corrected values (all via `git -C <tree>`, read-only)
- NVIDIA true dirty: 17 tracked modified + 38 untracked (matches cycle-170's
  independently obtained "17 modified files" figure).
- Muse true dirty: 0 tracked modified + 946 untracked.
- Full TRUE NVIDIA numstat is recorded in RESULT165.md (NVIDIA comparison).

## Rule going forward
Always use `git -C <worktree>` (never bare `--git-dir`) when inspecting a
tree other than the shell's cwd. No conclusion in RESULT165.md depends on the
artifact; every git number there was re-verified with `-C`.

## Impact on prior cycles
Cycle-170's "same 17 modified files" and "no additions" statements are
CONSISTENT with the corrected 17 count (that cycle must have read state
correctly). No prior committed evidence is invalidated by this artifact.
