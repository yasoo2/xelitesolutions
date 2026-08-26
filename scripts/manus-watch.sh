#!/usr/bin/env bash
#
#  IS THE LAST WORD ON PR #82 STILL MANUS'S?
#
#  Not «has a new comment arrived». That question loses a comment for ever if
#  one poll fails, and it did: Manus stood still for eleven minutes and nobody
#  knew. This one is answered from scratch on every tick, so a missed tick
#  costs nothing and the alarm repeats until a reply actually lands.
#
#  WHO POSTED IT IS A FACT, NOT A GUESS. Manus and Claude post from the same
#  GitHub account, so the author field cannot separate them, and the first
#  watcher guessed from the text — «does it end with a Claude signature?» —
#  which failed the day Manus titled a report with my own name inside it and
#  the channel went quiet for seven minutes. Every comment carries a stable
#  id instead, and manus-say.sh records the id of everything I post. A comment
#  whose id is not in that ledger is not mine.
#
#  ⛔ AND A BLIND WATCHER SAYS SO. Silence while unable to read looks exactly
#  like silence while all is quiet. Every failure prints BLIND and exits 2.
#
#  ⛔ AND IT CARRIES NO DEPENDENCY IT CANNOT PROVE. The first version piped to
#  jq, which is not installed on the owner's machine, so it printed BLIND on a
#  channel that was perfectly readable — a watcher crying wolf about its own
#  blindness. gh ships its own jq; that is the one used.
#
#  Usage:
#      bash scripts/manus-watch.sh          once, one verdict, exit 0/1/2
#      bash scripts/manus-watch.sh --loop   every 150s until stopped
#
set -u

PR="${MANUS_PR:-82}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LEDGER="$ROOT/.manus-watch/mine.txt"
EVERY="${MANUS_WATCH_SECONDS:-150}"

check_once() {
    local line last_url last_at head last_id
    line="$(gh pr view "$PR" --json comments --jq '.comments | last | [.url, .createdAt, ((.body // "") | .[0:110])] | @tsv' 2>&1)"
    if [ $? -ne 0 ] || [ -z "$line" ]; then
        echo "MANUS-WATCH BLIND: cannot read PR #$PR — treat as UNKNOWN, never as quiet"
        return 2
    fi

    last_url="$(printf '%s' "$line" | head -1 | cut -f1)"
    last_at="$(printf '%s' "$line" | head -1 | cut -f2)"
    head="$(printf '%s' "$line" | head -1 | cut -f3- | tr -d '\r')"

    last_id="$(printf '%s' "$last_url" | grep -oE 'issuecomment-[0-9]+' | tail -1)"
    if [ -z "$last_id" ]; then
        echo "MANUS-WATCH BLIND: the last comment carries no readable id — treat as UNKNOWN"
        return 2
    fi

    if [ -f "$LEDGER" ] && grep -qxF "$last_id" "$LEDGER"; then
        echo "MANUS-WATCH quiet: the last word is mine ($last_id at $last_at)"
        return 0
    fi

    echo "MANUS IS WAITING — the last word on PR #$PR is NOT mine."
    echo "   when: $last_at"
    echo "   id:   $last_id"
    echo "   said: $head"
    echo "   reply with:  bash scripts/manus-say.sh <file>"
    return 1
}

if [ "${1:-}" = "--loop" ]; then
    while true; do
        check_once
        sleep "$EVERY"
    done
else
    check_once
fi
