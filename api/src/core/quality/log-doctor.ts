/**
 * WHAT THE TERMINAL DISCOVERS, JOE FIXES — «سواء اكتشفها عن طريق المتصفح او
 * الثيرمال او اي اداه اخرى».
 *
 * The browser side of this is done: an audit finds a defect and the source is
 * repaired before delivery. The terminal side was not. A command failed, its
 * output was matched against a table of known problems, and the table returned
 * ADVICE — «Change port or kill process using the port» — printed at a user who
 * had asked Joe to do the work.
 *
 * One remedy already existed and proved the shape: a build that says «Failed to
 * resolve import "recharts"» is a shopping list, not a verdict. This
 * generalises that instinct. Every diagnosis here has to earn its place by
 * being three things at once:
 *
 *   • CERTAIN     — the log states the problem outright; no guessing
 *   • DETERMINISTIC — the remedy is a fixed action, not a judgement call
 *   • SAFE        — applying it to a healthy project would change nothing
 *
 * Anything failing one of those is left to a human on purpose. A wrong
 * automatic fix costs far more than an honest failure, and a diagnosis with
 * no remedy is still worth having: it is reported in his language instead of
 * as a wall of English stack trace.
 *
 * Bounded by construction: one remedy per run, one retry. A project that is
 * genuinely broken fails honestly instead of looping.
 */
import fs from 'fs';
import net from 'net';
import path from 'path';

export interface Diagnosis {
    id: 'missing_package' | 'no_node_modules' | 'port_in_use' | 'heap_out_of_memory'
    | 'stale_bundler_cache' | 'npm_missing' | 'dangling_import' | 'repairable_relative_import' | 'timeout';
    /** Said to the user in his own language — the log stays in the log. */
    ar: string;
    /** Whether this module can act on it, or only name it. */
    fixable: boolean;
    /** Details the remedy needs (package names, the port, the file). */
    data?: any;
}

export interface CommandOutcome {
    exitCode: number | null;
    log: string;
    /** Working directory of the command — remedies act inside it. */
    cwd: string;
    /** Set when the runner knows the command timed out. */
    timedOut?: boolean;
}

/* ── reading the log ─────────────────────────────────────────────────────── */

/** Is the port free? Asked by binding it, which is the only honest answer. */
export function portFree(port: number): Promise<boolean> {
    return new Promise(resolve => {
        const srv = net.createServer();
        srv.once('error', () => resolve(false));
        srv.once('listening', () => srv.close(() => resolve(true)));
        srv.listen(port, '127.0.0.1');
    });
}

export async function findFreePort(from = 4300, tries = 60): Promise<number> {
    for (let p = from; p < from + tries; p++) if (await portFree(p)) return p;
    return 0;
}

/**
 * Read a failed command's output and say what is wrong with it. Order matters:
 * the most specific cause wins, because «Cannot find module 'vite'» with no
 * node_modules is a missing install, not a missing dependency.
 */
export function diagnose(out: CommandOutcome): Diagnosis | null {
    const log = String(out.log || '');
    if (out.exitCode === null && !log.trim()) {
        return { id: 'npm_missing', ar: 'الأمر لم يبدأ أصلاً — الأداة غير موجودة على هذا الجهاز.', fixable: false };
    }
    if (out.timedOut) {
        return { id: 'timeout', ar: 'الأمر تجاوز المهلة ولم ينتهِ.', fixable: false };
    }

    // The packages are gone entirely: install, don't guess names.
    const modulesMissing = !fs.existsSync(path.join(out.cwd, 'node_modules'));
    // `sh: 1: vite: not found`, `'vite' is not recognized…`, `Cannot find module`
    // — three shells, three wordings, one cause: nothing was ever installed.
    if (modulesMissing && /(cannot find module|command not found|is not recognized|ERR_MODULE_NOT_FOUND|:\s*[\w.-]+: not found|\bENOENT\b)/i.test(log)) {
        return { id: 'no_node_modules', ar: 'حزم المشروع غير مثبّتة — أثبّتها ثم أعيد المحاولة.', fixable: true };
    }

    if (/JavaScript heap out of memory|FATAL ERROR:.*allocation failed/i.test(log)) {
        return { id: 'heap_out_of_memory', ar: 'البناء نفدت ذاكرته — أعيده بذاكرة أكبر.', fixable: true };
    }

    if (/EADDRINUSE|address already in use|port \d+ is already in use/i.test(log)) {
        const port = Number((log.match(/(?:port\s+|:)(\d{2,5})\b/i) || [])[1] || 0);
        return { id: 'port_in_use', ar: `المنفذ ${port || ''} مشغول — أنتقل إلى منفذ حر وأعيد التشغيل.`.replace('  ', ' '), fixable: true, data: { port } };
    }

    // A named package the bundler could not resolve, and that the manifest does
    // not already declare: fetch it and build again.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { missingPackagesFrom } = require('../project/dependency-healer');
    let declared: string[] = [];
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(out.cwd, 'package.json'), 'utf-8'));
        declared = [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})];
    } catch { /* no readable manifest — nothing is declared */ }
    const missing: string[] = missingPackagesFrom(log, declared);
    if (missing.length) {
        return { id: 'missing_package', ar: `البناء ينقصه: ${missing.join('، ')} — أنزّلها ثم أكمل.`, fixable: true, data: { missing } };
    }

    // A relative import may be wrong only because the author wrote it from the
    // project root instead of from the importing file's directory. This is
    // repairable only when the bundler names both paths and exactly one existing
    // candidate is found in a nearby ancestor directory. Joe never invents a
    // file or guesses a destination.
    const dangling = (log.match(/Failed to resolve import "(\.[^"]+)" from "([^"]+)"/i) || []);
    if (dangling[1]) {
        const specifier = dangling[1];
        const from = dangling[2];
        const fromFile = path.resolve(out.cwd, from);
        const fromDir = path.dirname(fromFile);
        const directTarget = path.resolve(fromDir, specifier);
        const candidates: string[] = [];
        if (!fs.existsSync(directTarget)) {
            let ancestor = path.dirname(fromDir);
            for (let depth = 0; depth < 4; depth++, ancestor = path.dirname(ancestor)) {
                const candidate = path.resolve(ancestor, specifier);
                const relativeToCwd = path.relative(out.cwd, candidate);
                if (relativeToCwd.startsWith('..') || path.isAbsolute(relativeToCwd)) break;
                if (candidate !== directTarget && fs.existsSync(candidate)) candidates.push(candidate);
            }
        }
        if (candidates.length === 1) {
            const replacement = path.relative(fromDir, candidates[0]).split(path.sep).join('/');
            return {
                id: 'repairable_relative_import', fixable: true,
                ar: `مسار الاستيراد «${specifier}» في «${from}» خاطئ؛ وجدت الملف الحقيقي في «${replacement}» وأصلحه ثم أعيد البناء.`,
                data: { specifier, from, replacement },
            };
        }
        return {
            id: 'dangling_import', fixable: false,
            ar: `ملف مفقود: «${from || ''}» يستورد «${specifier}» وهو غير موجود.`,
            data: { specifier, from },
        };
    }

    if (/(Pre-transform error|Failed to load url|optimized dependencies changed|504 \(Outdated Optimize Dep\))/i.test(log)
        && fs.existsSync(path.join(out.cwd, 'node_modules', '.vite'))) {
        return { id: 'stale_bundler_cache', ar: 'ذاكرة المُجمِّع المؤقتة قديمة — أمسحها وأعيد البناء.', fixable: true };
    }
    return null;
}

/* ── acting on it ────────────────────────────────────────────────────────── */

export interface RemedyResult {
    applied: boolean;
    /** What to change about the retry — merged over the original options. */
    envPatch?: Record<string, string>;
    portPatch?: number;
    note: string;
}

/**
 * Do the one thing the diagnosis calls for. Returns what the retry must change;
 * it never runs the failed command again itself, so the caller stays in charge
 * of how many attempts there are (the answer is one).
 */
export async function applyRemedy(
    d: Diagnosis,
    cwd: string,
    run: (cmd: string, args: string[], timeoutMs: number) => Promise<{ exitCode: number | null }>,
): Promise<RemedyResult> {
    switch (d.id) {
        case 'no_node_modules': {
            const r = await run('npm', ['install', '--no-audit', '--no-fund'], 300_000);
            return { applied: r.exitCode === 0, note: r.exitCode === 0 ? 'ثبّتُّ الحزم' : 'تعذّر تثبيت الحزم' };
        }
        case 'missing_package': {
            const pkgs: string[] = d.data?.missing || [];
            if (!pkgs.length) return { applied: false, note: 'لا أسماء لأنزّلها' };
            const r = await run('npm', ['install', '--no-audit', '--no-fund', ...pkgs], 300_000);
            return { applied: r.exitCode === 0, note: r.exitCode === 0 ? `نزّلتُ ${pkgs.join('، ')}` : `تعذّر تنزيل ${pkgs.join('، ')}` };
        }
        case 'heap_out_of_memory':
            return { applied: true, envPatch: { NODE_OPTIONS: '--max-old-space-size=4096' }, note: 'رفعتُ حدّ الذاكرة إلى 4GB' };
        case 'port_in_use': {
            const port = await findFreePort(Math.max(4300, (d.data?.port || 0) + 1));
            if (!port) return { applied: false, note: 'لم أجد منفذاً حراً' };
            return { applied: true, portPatch: port, envPatch: { PORT: String(port) }, note: `انتقلتُ إلى المنفذ ${port}` };
        }
        case 'stale_bundler_cache': {
            try { fs.rmSync(path.join(cwd, 'node_modules', '.vite'), { recursive: true, force: true }); }
            catch { return { applied: false, note: 'تعذّر مسح الذاكرة المؤقتة' }; }
            return { applied: true, note: 'مسحتُ ذاكرة المُجمِّع المؤقتة' };
        }
        case 'repairable_relative_import': {
            const from = String(d.data?.from || '');
            const specifier = String(d.data?.specifier || '');
            const replacement = String(d.data?.replacement || '');
            const file = path.resolve(cwd, from);
            const relativeFile = path.relative(cwd, file);
            if (!from || !specifier || !replacement || relativeFile.startsWith('..') || path.isAbsolute(relativeFile) || !fs.existsSync(file)) {
                return { applied: false, note: 'لم أجد ملف الاستيراد الموثق لإصلاحه' };
            }
            const source = fs.readFileSync(file, 'utf8');
            const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const importPattern = new RegExp('(\\b(?:from\\s*|import\\s*|export\\s*from\\s*)[\\\"\\\'])' + escaped + '([\\\"\\\'])');
            if (!importPattern.test(source)) return { applied: false, note: 'لم أجد import مطابقاً للنص الذي سجله Vite' };
            const updated = source.replace(importPattern, `$1${replacement}$2`);
            if (updated === source || !fs.existsSync(path.resolve(path.dirname(file), replacement))) {
                return { applied: false, note: 'الإصلاح الموثق لم يغيّر ملفاً صالحاً' };
            }
            fs.writeFileSync(file, updated);
            return { applied: true, note: `صححتُ import النسبي في ${from} إلى ${replacement}` };
        }
        default:
            return { applied: false, note: d.ar };
    }
}

export interface DoctoredRun {
    ok: boolean;
    exitCode: number | null;
    log: string;
    /** Present when something was wrong and this module could name it. */
    diagnosis?: Diagnosis;
    /** Present when a remedy was applied and the command was retried. */
    remedy?: RemedyResult;
    /** The port the command ended up on, when a port conflict was resolved. */
    port?: number;
}

/**
 * Run a command; if it fails, diagnose the output, apply the one known remedy,
 * and run it exactly once more. Everything else — including a diagnosis with no
 * safe remedy — comes back named and unfixed rather than dressed up.
 */
export async function runDoctored(
    cmd: string,
    args: string[],
    opts: { cwd: string; timeoutMs?: number; env?: Record<string, string>; onLine?: (l: string) => void; onNote?: (s: string) => void },
): Promise<DoctoredRun> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { executionEngine } = require('../../kernel/ExecutionEngine');
    const timeoutMs = opts.timeoutMs ?? 240_000;

    /** Any command, streamed and captured — used for the run and for remedies. */
    const runCmd = async (c: string, a: string[], t: number, env: Record<string, string>) => {
        let log = '';
        const h = executionEngine.runArgvStreaming(c, a, {
            cwd: opts.cwd, timeout: t, env: { NO_COLOR: '1', ...env },
            onLine: (l: string) => { log += l + '\n'; opts.onLine?.(l); },
        });
        const r = await h.done;
        return { exitCode: r.exitCode as number | null, log, timedOut: r.error === 'timeout' };
    };

    const env = { ...(opts.env || {}) };
    const first = await runCmd(cmd, args, timeoutMs, env);
    if (first.exitCode === 0) return { ok: true, exitCode: 0, log: first.log };

    const diagnosis = diagnose({ exitCode: first.exitCode, log: first.log, cwd: opts.cwd, timedOut: first.timedOut });
    if (!diagnosis) return { ok: false, exitCode: first.exitCode, log: first.log };
    opts.onNote?.(`🩺 ${diagnosis.ar}`);
    if (!diagnosis.fixable) return { ok: false, exitCode: first.exitCode, log: first.log, diagnosis };

    const remedy = await applyRemedy(diagnosis, opts.cwd, (c, a, t) => runCmd(c, a, t, env))
        .catch(() => ({ applied: false, note: 'تعذّر تطبيق العلاج' } as RemedyResult));
    if (!remedy.applied) {
        opts.onNote?.(`⚠️ ${remedy.note}`);
        return { ok: false, exitCode: first.exitCode, log: first.log, diagnosis, remedy };
    }
    opts.onNote?.(`✅ ${remedy.note} — أعيد المحاولة`);

    // THE ONE RETRY. A project that is genuinely broken fails honestly here
    // rather than looping while the user watches the same error scroll past.
    const second = await runCmd(cmd, args, timeoutMs, { ...env, ...(remedy.envPatch || {}) });
    return {
        ok: second.exitCode === 0,
        exitCode: second.exitCode,
        log: first.log + second.log,
        diagnosis, remedy,
        ...(remedy.portPatch ? { port: remedy.portPatch } : {}),
    };
}
