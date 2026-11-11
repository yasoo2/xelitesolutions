/**
 * THE RESTORED LOG FIRST, THEN WHAT ARRIVED WHILE IT WAS ON ITS WAY.
 *
 * The Logs tab of a freshly opened conversation asks the server for the
 * session's record. It used to keep whichever came first: a single live line
 * that beat the request threw the whole record away — 93 lines on one load,
 * «No logs yet» on the next (UI/UX check, 2026-11-05). Now the record comes
 * first and the live lines follow, without the ones the record already holds:
 * those that arrived before the answer are its last lines, stamped a second
 * apart at most, so they are matched without their stamps.
 */
const unstamped = (line: string) => String(line || '').replace(/^\[[^\]]*\]\s*/, '');

export function mergeRestoredLogs(restored: string[], live: string[]): string[] {
    if (!live.length) return restored.slice();
    if (!restored.length) return live.slice();
    const max = Math.min(restored.length, live.length);
    let overlap = 0;
    for (let k = max; k > 0; k--) {
        let same = true;
        for (let i = 0; i < k; i++) {
            if (unstamped(restored[restored.length - k + i]) !== unstamped(live[i])) { same = false; break; }
        }
        if (same) { overlap = k; break; }
    }
    return [...restored, ...live.slice(overlap)];
}
