#!/usr/bin/env bash
#
#  THE SAME TOOLS IN EVERY CLOUD SESSION — law 8 in CLAUDE.md.
#
#  A cloud session does not install the plugins a repository declares in
#  .claude/settings.json — code.claude.com/docs/en/cloud-environments, the
#  table «What carries over», read before this file was written. So the
#  repository alone cannot keep the owner's order. This script can: pasted
#  once into the environment's «Setup script» field, it runs before Claude
#  Code starts, and the platform snapshots what it installs and reuses it in
#  every new session for about seven days, on any repository.
#
#  What it installs, each pinned to what was measured:
#    · Ponytail       plugin, tag v5.3.2 — its hooks were read before adoption
#    · Agent Skills   plugin, 0.6.13 — its marketplace fetches the plugin from
#                     the latest upstream commit; content only, no hooks
#    · Graphify       CLI, graphifyy==0.9.93 — tree-sitter, no model
#  and writes the measured rules for using them into ~/.claude/CLAUDE.md,
#  which a cloud session loads as user instructions.
#
#  ⛔ IT NEVER STOPS A SESSION, AND NEVER FAILS IN SILENCE. A setup script
#  that exits non-zero keeps the session from starting; one that hides a
#  failure leaves sessions without a tool, and nobody knows. So every step
#  prints OK or FAILED with its exit code, and the script always exits 0.
#
#  The owner pastes one line that fetches this file at a fixed commit, so
#  what runs is exactly what was reviewed. Changing a pin means measuring the
#  new version first, then giving the owner a new line.
#
set -u

LOG="$(mktemp)"
step() {   # step <name> <command...>
    local name="$1"; shift
    if "$@" >"$LOG" 2>&1; then
        echo "claude-env-setup: OK     $name"
    else
        echo "claude-env-setup: FAILED $name (exit $?) — $(tail -1 "$LOG")"
    fi
}

CLAUDE_BIN="$(command -v claude || ls /opt/node*/bin/claude 2>/dev/null | head -1)"
UV_BIN="$(command -v uv || ls "$HOME/.local/bin/uv" 2>/dev/null)"

step ponytail     "${CLAUDE_BIN:-claude}" plugin install ponytail     --marketplace "DietrichGebert/ponytail#v5.3.2"
step agent-skills "${CLAUDE_BIN:-claude}" plugin install agent-skills --marketplace "addyosmani/agent-skills#0.6.13"
step graphify     "${UV_BIN:-uv}" tool install graphifyy==0.9.93

#  graphify-out/ measured 11 MB on one repository and is rewritten on every
#  build: keep it out of every repository's commits, not only this one's.
mkdir -p "$HOME/.config/git"
grep -qx 'graphify-out/' "$HOME/.config/git/ignore" 2>/dev/null || echo 'graphify-out/' >> "$HOME/.config/git/ignore"

#  The rules, between markers, so a second run replaces them instead of
#  stacking a copy.
MEMORY="$HOME/.claude/CLAUDE.md"
mkdir -p "$HOME/.claude"
[ -f "$MEMORY" ] && sed -i '/<!-- claude-env-setup:begin -->/,/<!-- claude-env-setup:end -->/d' "$MEMORY"
cat >> "$MEMORY" <<'RULES'
<!-- claude-env-setup:begin -->
# Tools in every session — the owner's standing order (2026-10-22), measured before adoption

- **First, confirm they are here:** skills whose names start with `ponytail`, the skill `test-driven-development`, and `graphify --version` = `0.9.93`. If any is missing, say so plainly in your first reply — silence while blind looks exactly like silence while all is well.
- **Ponytail** and **Agent Skills** are installed as plugins. Use them without being asked: Ponytail's ladder before writing any code; an Agent Skill whenever one fits the task.
- **Graphify** (`graphify` CLI) maps code with tree-sitter — no model, no tokens.
  - Before exploring a codebase, start `graphify update .` in the background (about a minute for 1,450 files).
  - The graph for structure and broad concepts: 6,609 bytes against grep's 90,566 on a broad question. grep for exact names and literal text: 1,150 bytes against the graph's 6,629.
  - "No matching nodes found" is NOT proof of absence: text inside strings and comments is not indexed. Confirm with grep before relying on it.
  - Never run the full `/graphify` pipeline unless the owner asks: it reads every document through subagents, at token cost.
  - Never commit `graphify-out/`.
- **OmniRoute** was measured and rejected. Never connect it.
<!-- claude-env-setup:end -->
RULES
echo "claude-env-setup: OK     rules -> $MEMORY"

rm -f "$LOG"
exit 0
