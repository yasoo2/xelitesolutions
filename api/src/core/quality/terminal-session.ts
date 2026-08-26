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
    /**
     *  A VERSION CHECK IS NOT WORK, AND THE COUNT SAID IT WAS.
     *
     *  «4 real commands ran in front of you — 4 exited clean» was measured on
     *  a build whose four were `node -v`, `npm -v`, an install and a build.
     *  Two of them ask the machine what it is; they prove the shell answers,
     *  not that anything was built. Counting them doubled the apparent
     *  evidence, and the owner reads that number as work done.
     *
     *  So a probe is marked as one, counted apart, and still SHOWN — it is
     *  real output, it is just not a claim about his project.
     */
    probe?: boolean;
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
        /** Asking the machine what it is, not doing work on his project. */
        probe?: boolean;
    }): Promise<{ exitCode: number | null; out: string; ms: number; timedOut?: boolean; missing?: boolean }>;
    /** A line of Joe's own, marked as his — never dressed up as process output. */
    note(line: string): void;
    /** A section heading, so a long transcript stays readable. */
    section(title: string): void;
    /** What this session did: for the delivery report, not for decoration. */
    transcript(): { commands: number; passed: number; probes: number; failed: RanCommand[]; ms: number };
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
            /**
             *  A PROBE THAT PROMISES THE FIRST SECOND MUST NOT COST THIRTY.
             *
             *  Measured on his machine, in three places:
             *
             *      npm -v, plain shell            2332 / 2673 / 2145 ms
             *      npm -v, through this engine    1563 / 1283 ms
             *      npm -v, inside a built project 1227 / 1603 ms
             *
             *  And measured in his own transcript, twice in one evening:
             *
             *      → timed out after 15.1s   └─ node v24.18.0 · npm (no answer)
             *      → timed out after 28.7s
             *
             *  A command that answers in 1.3 seconds was given fifteen, and
             *  the two were run one after the other — so a busy machine could
             *  spend thirty seconds of his time on a question the comment
             *  above says is worth asking «in the first second». Then the run
             *  carried on regardless, having printed him a failure.
             *
             *  A budget states what the caller is willing to wait, so it must
             *  be scaled to the answer, not to the fear. Five seconds is four
             *  times the slowest reading here. And the two are independent
             *  questions, so they are asked at once: the worst case stops
             *  being the sum and becomes the slower of the two.
             */
            const versions = await Promise.all(
                ([['node', ['-v']], ['npm', ['-v']]] as Array<[string, string[]]>).map(async ([file, args]) => {
                    const r = await session.run(file, args, { cwd, timeout: 5_000, quiet: true, probe: true });
                    const v = String(r.out || '').trim().split('\n').pop() || '';
                    //  «no answer» told him nothing. Name which of the three
                    //  things happened: absent, too slow, or silent.
                    const why = r.missing ? '— not on this machine'
                        : r.timedOut ? '— did not answer in 5s'
                            : v || '(no version printed)';
                    return `${file} ${why}`;
                }),
            );
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
            ran.push({ command: shown, exitCode: r.exitCode, ms, timedOut, missing, probe: (opts as any).probe === true });
            return { exitCode: r.exitCode, out, ms, timedOut, missing };
        },

        transcript() {
            //  The count he reads is the count of WORK. Probes are reported
            //  separately rather than hidden: they ran, and he can see they
            //  were version checks instead of being told they were builds.
            const work = ran.filter(c => !c.probe);
            const failed = work.filter(c => c.exitCode !== 0);
            return {
                commands: work.length,
                passed: work.length - failed.length,
                probes: ran.length - work.length,
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
export function transcriptLine(t: { commands: number; passed: number; probes?: number; failed: RanCommand[] }, isAr: boolean): string {
    if (!t.commands) return '';
    //  The version checks are named for what they are, beside the work, so
    //  the number he reads as «work done» is only ever work done.
    const probes = Number(t.probes || 0);
    const aside = probes
        ? (isAr ? ` (وفحصا إصدارٍ لا يُحسبان عملاً)` : ` (plus ${probes} version check${probes === 1 ? '' : 's'}, which are not work)`)
        : '';
    const head = isAr
        ? `⌨️ الطرفية: ${t.commands} أمراً حقيقياً نُفّذت أمامك — ${t.passed} نجحت${aside}`
        : `⌨️ Terminal: ${t.commands} real commands ran in front of you — ${t.passed} exited clean${aside}`;
    if (!t.failed.length) return head;
    const named = t.failed.slice(0, 4).map(f => `\`${f.command}\`${f.missing ? (isAr ? ' (غير مثبّت)' : ' (not installed)') : f.timedOut ? (isAr ? ' (انتهت المهلة)' : ' (timed out)') : ` (exit ${f.exitCode})`}`);
    return `${head}\n   ${isAr ? 'ولم تنجح' : 'and these did not'}: ${named.join('، ')}`;
}
