/**
 * A SERVER THAT DIES MUST LEAVE A NOTE.
 *
 * From his own terminal:
 *
 *     [!] Joe stopped (exit code: -1). Restarting in 3 seconds...
 *     [3/3] Starting Joe (attempt #9)
 *
 * Nine attempts. Eight deaths. Not one line anywhere saying what killed it —
 * because nothing in this process listened for the two events that kill a Node
 * server, so the reason went wherever the wrapper's stderr went and the next
 * attempt started on a clean screen.
 *
 * Two changes, both small, both overdue:
 *
 *   · every death is WRITTEN DOWN, with its time, its stack and the last
 *     thing Joe was doing, to `data/crash.log` — which survives the restart
 *     that erased the screen;
 *   · and an unhandled REJECTION no longer kills the server. Node's default
 *     since v15 is to terminate, so one tool forgetting a `.catch()` — in a
 *     build that may have been running for ten minutes — takes the whole
 *     process with it. A rejected promise inside one tool is that tool's
 *     failure, not the machine's.
 *
 * An uncaught EXCEPTION is different: the process state after one is not
 * trustworthy, so it is recorded and then the process exits deliberately, with
 * the reason on disk for the supervisor to print.
 */
import fs from 'fs';
import path from 'path';

/**
 * Where the note is left. Next to the other things Joe remembers.
 *
 * `JOE_CRASH_LOG` names the file outright — for a deployment whose working
 * directory is not the repository, and for tests, which must never reach for
 * `process.chdir()`: it moves the WHOLE process, and a Jest worker shares that
 * process with every other suite it is scheduled beside. One such test in this
 * repository quietly broke an unrelated path-containment suite the moment the
 * scheduler paired them.
 */
export function crashLogPath(): string {
    const override = String(process.env.JOE_CRASH_LOG || '').trim();
    if (override) return override;
    const isApiDir = path.basename(process.cwd()) === 'api';
    const root = isApiDir ? process.cwd() : path.join(process.cwd(), 'api');
    return path.join(root, 'data', 'crash.log');
}

/** The last thing Joe was doing — set by whoever is doing it. */
let breadcrumb = '';
export function noteActivity(what: string): void {
    breadcrumb = String(what || '').slice(0, 200);
}

const MAX_BYTES = 256 * 1024;

export function writeCrashNote(kind: string, err: any): string {
    const when = new Date().toISOString();
    const message = String(err?.message || err || 'unknown');
    const stack = String(err?.stack || '').split('\n').slice(0, 12).join('\n');
    const note = [
        '',
        '════════════════════════════════════════════════════════════',
        `[${when}] ${kind}`,
        `pid=${process.pid}  node=${process.version}  platform=${process.platform}`,
        breadcrumb ? `آخر ما كان يفعله جو: ${breadcrumb}` : '',
        `السبب: ${message}`,
        stack || '(بلا أثر)',
        '════════════════════════════════════════════════════════════',
    ].filter(Boolean).join('\n');

    try {
        const file = crashLogPath();
        fs.mkdirSync(path.dirname(file), { recursive: true });
        // Bounded: a crash loop must not fill the disk with its own diary.
        try {
            if (fs.existsSync(file) && fs.statSync(file).size > MAX_BYTES) {
                const kept = fs.readFileSync(file, 'utf-8').slice(-MAX_BYTES / 2);
                fs.writeFileSync(file, kept, 'utf-8');
            }
        } catch { /* rotation is best effort */ }
        fs.appendFileSync(file, note + '\n', 'utf-8');
    } catch { /* if even this fails, the console below is all we have */ }
    return note;
}

/**
 * Install the recorder. Idempotent — a second call is a no-op, so importing
 * this from a test never doubles the handlers.
 */
let installed = false;
export function installCrashRecorder(log?: { error: (...a: any[]) => void; warn: (...a: any[]) => void }): void {
    if (installed) return;
    installed = true;
    const say = (m: string) => { try { (log?.error || console.error)(m); } catch { console.error(m); } };
    const warn = (m: string) => { try { (log?.warn || console.warn)(m); } catch { console.warn(m); } };

    process.on('unhandledRejection', (reason: any) => {
        const note = writeCrashNote('UNHANDLED REJECTION — سُجّل، وجو مستمرّ', reason);
        warn(note);
        warn(`⚠️ وعد مرفوض بلا مُعالِج — كُتب في ${crashLogPath()}. جو لم يتوقّف.`);
    });

    process.on('uncaughtException', (err: any) => {
        const note = writeCrashNote('UNCAUGHT EXCEPTION — جو يتوقّف عمداً', err);
        say(note);
        say(`⛔ خطأ غير مُلتقط — كُتب في ${crashLogPath()}. أتوقّف عمداً؛ الحالة بعد هذا غير موثوقة.`);
        // Give the write and the console a tick before the process goes.
        setTimeout(() => process.exit(1), 150).unref?.();
    });

    // A deliberate stop is not a crash, and must not be recorded as one.
    for (const sig of ['SIGINT', 'SIGTERM'] as const) {
        process.on(sig, () => { warn(`\n👋 ${sig} — إيقاف مقصود، لا انهيار.`); process.exit(0); });
    }
}
