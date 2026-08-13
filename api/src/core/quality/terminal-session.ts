/**
 * THE TERMINAL IS WHERE THE WORK HAPPENS — AND HE HAS TO SEE THAT.
 *
 * «جو لا يعتمد على الطرفية بشكل كبير وحقيقي ويجب أن يكون ذلك بشكل مرئي
 *  للمستخدم»
 *
 * He is right, and the reason is precise. Joe DOES run real processes — npm
 * install, vite build, node server.js, a dozen probes — but of all that only
 * the OUTPUT reached his screen. The command that produced it never did. So
 * the terminal panel filled with npm's chatter attached to nothing: no prompt,
 * no arguments, no exit code, no duration. That does not read as a machine
 * working. It reads as a log file scrolling.
 *
 * The difference between the two is entirely in what a shell shows you:
 *
 *     ~/projects/dar-al-rifq  $ npm install --no-audit --no-fund
 *       added 214 packages in 19s
 *     → exit 0 · 19.4s
 *
 * Same process, same bytes of output. One of them is a person working in a
 * terminal; the other is a program printing. This module makes every process
 * Joe starts look like the first one — the working directory, the command
 * verbatim, its own output, and how it ended.
 *
 * Three rules hold it honest:
 *
 *   1. NOTHING IS ECHOED THAT DID NOT RUN. The prompt line is printed by the
 *      runner itself, immediately before the spawn — it cannot describe a
 *      command that was never started.
 *   2. EVERY COMMAND ENDS OUT LOUD. Exit code and elapsed time, including the
 *      failures, including the ones that timed out. A command that vanishes
 *      mid-transcript is how a build hides.
 *   3. THE TRANSCRIPT IS COUNTED. What was run, how much of it passed, and the
 *      name of anything that did not — so the delivery report can say «17
 *      commands, 16 passed» and point at the seventeenth instead of asking him
 *      to scroll back through it.
 */
import path from 'path';

export interface RanCommand {
    /** Exactly what was typed, the way he could paste it himself. */
    command: string;
    exitCode: number | null;
    ms: number;
    timedOut?: boolean;
    /** Never started at all — the binary is not on this machine. */
    missing?: boolean;
}

export interface TerminalSession {
    /** Open the session: the machine, the directory, the tools and versions. */
    open(title: string, cwd: string): Promise<void>;
    /** Run a process VISIBLY: prompt, live output, exit line. */
    run(file: string, args: string[], opts?: {
        cwd?: string;
        timeout?: number;
        env?: Record<string, string>;
        /** Prefix each output line; default two spaces, like a real shell wrap. */
        quiet?: boolean;
    }): Promise<{ exitCode: number | null; out: string; ms: number; timedOut?: boolean; missing?: boolean }>;
    /** A line of Joe's own, marked as his — never dressed up as process output. */
    note(line: string): void;
    /** A section heading, so a long transcript stays readable. */
    section(title: string): void;
    /** What this session did: for the delivery report, not for decoration. */
    transcript(): { commands: number; passed: number; failed: RanCommand[]; ms: number };
}

/** `~/…/dar-al-rifq $` — short enough to read, long enough to locate. */
function prompt(cwd: string): string {
    const base = path.basename(cwd || '') || '/';
    const parent = path.basename(path.dirname(cwd || '')) || '';
    return `${parent ? `${parent}/` : ''}${base} $`;
}

/**
 * Open a visible terminal session that writes through `say`.
 *
 * `say` is the caller's line sink — in every builder it is the same `term()`
 * that broadcasts to the panel AND keeps the line in `logs`, so what he
 * watches live and what the report replays afterwards are the same transcript.
 */
export function openTerminal(say: (line: string) => void): TerminalSession {
    const ran: RanCommand[] = [];
    const t0 = Date.now();
    const emit = (l: string) => { try { say(l); } catch { /* the UI is optional; the work is not */ } };

    const session: TerminalSession = {
        async open(title: string, cwd: string) {
            emit('');
            emit(`┌─ ${title}`);
            emit(`│  ${cwd}`);
            /**
             * THE FIRST THING ANY ENGINEER TYPES.
             *
             * Not decoration: this is the check that decides whether the next
             * four minutes are possible at all. When npm is not on the PATH,
             * saying so in the first second is worth more than discovering it
             * after a scaffold, an install attempt and a timeout.
             */
            const versions: string[] = [];
            for (const [file, args] of [['node', ['-v']], ['npm', ['-v']]] as Array<[string, string[]]>) {
                const r = await session.run(file, args, { cwd, timeout: 15_000, quiet: true });
                const v = String(r.out || '').trim().split('\n').pop() || '';
                versions.push(`${file} ${r.missing ? '— not on this machine' : v || '(no answer)'}`);
            }
            emit(`└─ ${versions.join(' · ')}`);
            emit('');
        },

        section(title: string) {
            emit('');
            emit(`── ${title} ${'─'.repeat(Math.max(0, 58 - title.length))}`);
        },

        note(line: string) {
            emit(`# ${line}`);
        },

        async run(file: string, args: string[], opts = {}) {
            const cwd = opts.cwd || process.cwd();
            const shown = [file, ...args].join(' ');
            const started = Date.now();
            emit(`${prompt(cwd)} ${shown}`);
            let out = '';
            const { executionEngine } = require('../../kernel/ExecutionEngine');
            const h = executionEngine.runArgvStreaming(file, args, {
                cwd, timeout: opts.timeout || 120_000,
                env: { NO_COLOR: '1', ...(opts.env || {}) },
                onLine: (l: string) => {
                    out += l + '\n';
                    if (!opts.quiet) emit(`  ${String(l).slice(0, 200)}`);
                },
            });
            const r = await h.done;
            const ms = Date.now() - started;
            const timedOut = r.exitCode === 124 && r.error === 'timeout';
            const missing = r.exitCode === null && !timedOut;
            /**
             * The exit line is printed for EVERY outcome, including the ones
             * nobody wants to look at. A transcript where failures are silent
             * teaches him to distrust the successes too.
             */
            emit(missing
                ? `→ not found: ${file} is not installed on this machine`
                : timedOut
                    ? `→ timed out after ${(ms / 1000).toFixed(1)}s`
                    : `→ exit ${r.exitCode} · ${(ms / 1000).toFixed(1)}s`);
            ran.push({ command: shown, exitCode: r.exitCode, ms, timedOut, missing });
            return { exitCode: r.exitCode, out, ms, timedOut, missing };
        },

        transcript() {
            const failed = ran.filter(c => c.exitCode !== 0);
            return {
                commands: ran.length,
                passed: ran.length - failed.length,
                failed,
                ms: Date.now() - t0,
            };
        },
    };
    return session;
}

/**
 * One line for the delivery report: how much of this build was real work in a
 * real shell, and what did not survive it.
 *
 * The count is the point. «I ran the build» is a claim; «17 commands ran in
 * your terminal, 16 exited zero, `npm ls --depth=0` did not» is a fact he can
 * check by looking at the panel he was already watching.
 */
export function transcriptLine(t: { commands: number; passed: number; failed: RanCommand[] }, isAr: boolean): string {
    if (!t.commands) return '';
    const head = isAr
        ? `⌨️ الطرفية: ${t.commands} أمراً حقيقياً نُفّذت أمامك — ${t.passed} نجحت`
        : `⌨️ Terminal: ${t.commands} real commands ran in front of you — ${t.passed} exited clean`;
    if (!t.failed.length) return head;
    const named = t.failed.slice(0, 4).map(f => `\`${f.command}\`${f.missing ? (isAr ? ' (غير مثبّت)' : ' (not installed)') : f.timedOut ? (isAr ? ' (انتهت المهلة)' : ' (timed out)') : ` (exit ${f.exitCode})`}`);
    return `${head}\n   ${isAr ? 'ولم تنجح' : 'and these did not'}: ${named.join('، ')}`;
}
