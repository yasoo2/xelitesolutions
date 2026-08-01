/**
 * ANSI paint for build lines shown in the terminal panel.
 *
 * The terminal is xterm — it has had a full color palette all along, and every
 * build line arrived in it plain white. Color is not decoration here: during a
 * four-minute build the user is scanning for exactly three things — did
 * something fail (red), did something get fixed (green), and how did the page
 * score (by value). Painting happens ONLY at broadcast time; the logs array a
 * tool returns stays clean text, because logs are data and color is display.
 */

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';

export type LineTone = 'error' | 'success' | 'warning' | 'progress' | 'plain';

/**
 * Decide the tone of a build-log line from its text. Order matters: an audit
 * score line is judged by the SCORE ("visual audit: 55/100" is bad news even
 * though nothing in it says "failed"), and "repair rejected" is a failure even
 * though "repair" alone sounds like progress.
 */
export function classifyLine(line: string): LineTone {
    const score = line.match(/\baudit: (\d+)\/100\b/);
    if (score) {
        const n = parseInt(score[1], 10);
        return n >= 90 ? 'success' : n >= 70 ? 'warning' : 'error';
    }
    if (/\b(failed|error|aborted|rejected|refused|discarded|fatal|unknown_tool|404'?d)\b/i.test(line)) return 'error';
    if (/\b(skipped|warning|deferred|cooldown|falling back|unresolved|dead)\b/i.test(line)) return 'warning';
    if (/\b(accepted|repaired|recovered|rewritten|wrote|written|fixed|added|wired|drew)\b/i.test(line)) return 'success';
    if (/^section \d+ \(/.test(line) || /^site (build|edit)/.test(line)) return 'progress';
    return 'plain';
}

const TONE_COLOR: Record<LineTone, string> = {
    error: RED,
    success: GREEN,
    warning: YELLOW,
    progress: CYAN,
    plain: '',
};

/**
 * Paint one line for the terminal. `prefix` (e.g. "[joe]") renders dimmed so
 * the eye lands on the message, not the label. No trailing newline — the
 * broadcast site owns the \r\n.
 */
export function paintLine(line: string, prefix?: string): string {
    const color = TONE_COLOR[classifyLine(line)];
    const body = color ? `${color}${line}${RESET}` : line;
    return prefix ? `${DIM}${prefix}${RESET} ${body}` : body;
}
