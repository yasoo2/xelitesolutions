#!/usr/bin/env bash
#
#  POST TO THE MANUS CHANNEL, AND RECORD THAT IT WAS MINE — IN ONE COMMAND.
#
#  The watcher beside this file answers one question: «is the last word on
#  PR #82 still Manus's?» Answering it needs to know which comments are mine,
#  and Manus and I post from the SAME GitHub account, so the author field
#  cannot tell us apart.
#
#  The first watcher guessed from the text: «does it end with — Claude?». That
#  failed the day Manus wrote a report whose own title carried my name, and the
#  channel went quiet for seven minutes while he waited. A signature is a
#  claim about content; what is needed is a fact about identity.
#
#  Every comment has a stable id, and `gh pr comment` returns its URL. So the
#  fact is free — it only has to be WRITTEN DOWN. And it is written by the same
#  command that posts, because a ledger maintained separately from the posting
#  is two parties that must agree with nothing forcing them, which is the
#  defect this whole channel keeps paying for.
#
#  Usage:   bash scripts/manus-say.sh <file-with-the-comment-body>
#
set -u

PR="${MANUS_PR:-82}"
LEDGER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.manus-watch"
LEDGER="$LEDGER_DIR/mine.txt"

BODY_FILE="${1:-}"
if [ -z "$BODY_FILE" ] || [ ! -f "$BODY_FILE" ]; then
    echo "MANUS-SAY ERROR: give me a file holding the comment body." >&2
    echo "  usage: bash scripts/manus-say.sh <file>" >&2
    exit 2
fi

mkdir -p "$LEDGER_DIR"

OUT="$(gh pr comment "$PR" --body-file "$BODY_FILE" 2>&1)"
RC=$?
if [ $RC -ne 0 ]; then
    #  A failed post is never silent. The body is kept so nothing typed is
    #  lost, and the raw error is printed rather than summarised.
    echo "MANUS-SAY FAILED (exit $RC). Nothing was posted. Body kept at: $BODY_FILE" >&2
    echo "$OUT" >&2
    exit $RC
fi

#  The URL ends with #issuecomment-<number>. That number is the identity.
ID="$(printf '%s' "$OUT" | grep -oE 'issuecomment-[0-9]+' | tail -1)"
if [ -z "$ID" ]; then
    #  Posted, but the id did not come back. Say so LOUDLY: the watcher will
    #  now read my own comment as Manus waiting, and a false alarm that nobody
    #  was warned about is worse than no watcher.
    echo "MANUS-SAY POSTED BUT COULD NOT READ ITS ID — the watcher will raise a" >&2
    echo "  false alarm on this comment. Raw output follows:" >&2
    echo "$OUT" >&2
    exit 3
fi

printf '%s\n' "$ID" >> "$LEDGER"
echo "MANUS-SAY OK  $ID"
echo "$OUT"
