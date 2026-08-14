/**
 * PYTHON IS NOT GUARANTEED TO BE ON THE MACHINE — AND "ABSENT" IS NOT "FAILED".
 *
 * Two foundation tools (enterprise platform, ORION business core) write a
 * Python domain core and then prove it by running `compileall` and
 * `unittest` locally. That is the right instinct: nothing is delivered
 * until it is executed. But both of them treated the process failing to
 * START exactly like the tests failing to PASS, and those are opposite
 * facts:
 *
 *   - tests ran and failed  → the foundation is broken; say so, stop.
 *   - python is not installed → nothing was measured at all.
 *
 * On the user's Windows machine, where Python is frequently not installed,
 * the second case produced «ORION verification failed: spawn python ENOENT»
 * — a sentence that reads like the generated code is wrong, sent to the
 * orchestrator as a plain ok:false, which then handed it to recovery for an
 * LLM to "fix" a missing interpreter it cannot install.
 *
 * The house rule already exists elsewhere in this codebase: a check that
 * CANNOT RUN says SKIPPED and is excluded from the score — it never invents
 * a failure. The generated `test_contract.py` follows it with
 * `@unittest.skipUnless(HAS_FASTAPI, …)` for a missing PACKAGE. This module
 * applies the same rule one level up, to a missing INTERPRETER.
 *
 * Detection is by SHAPE, not by a list of message strings per platform:
 * a process that never started reports ENOENT, and the Windows Store
 * python alias exits 9009 / says "not recognized". Those are the shapes of
 * "no such program", in any locale-independent form we can rely on.
 */

import { executionEngine } from '../../kernel/ExecutionEngine';

export interface PythonRun {
    /** true only when the process ran AND exited 0. */
    ok: boolean;
    /** true when the interpreter itself could not be started. `ok` is false and means nothing. */
    missing: boolean;
    output: string;
    error: string;
    exitCode?: number | null;
}

/** `python` on Windows, `python3` everywhere else — the name each platform actually ships. */
export function pythonExecutable(): string {
    return process.platform === 'win32' ? 'python' : 'python3';
}

/**
 * Did the interpreter fail to start, as opposed to running and reporting a
 * real failure? Shapes only:
 *   - ENOENT            — POSIX and Node's spawn error for "no such program"
 *   - exit code 9009    — cmd.exe's "command not found"
 *   - "not recognized" / "not found" — the Windows Store python stub
 */
export function isMissingPython(result: { ok?: boolean; error?: string; output?: string; exitCode?: number | null }): boolean {
    if (result?.ok === true) return false;
    const text = `${result?.error || ''}\n${result?.output || ''}`;
    if (/\bENOENT\b/i.test(text)) return true;
    if (result?.exitCode === 9009) return true;
    if (/\b(?:not recognized|not found|no such file or directory)\b/i.test(text) && /python/i.test(text)) return true;
    return false;
}

/**
 * Run a python module locally and report honestly whether it ran at all.
 * Never throws: a foundation tool must be able to finish its report even
 * when the machine has no Python on it.
 */
export async function runPython(
    args: string[],
    options: { cwd: string; timeout?: number; env?: NodeJS.ProcessEnv },
): Promise<PythonRun> {
    let result: any;
    try {
        result = await executionEngine.runArgv(pythonExecutable(), args, {
            cwd: options.cwd,
            timeout: options.timeout ?? 30000,
            ...(options.env ? { env: options.env } : {}),
        } as any);
    } catch (err: any) {
        result = { ok: false, error: String(err?.message || err), output: '' };
    }
    const missing = isMissingPython(result);
    return {
        ok: result?.ok === true,
        missing,
        output: String(result?.output || ''),
        error: String(result?.error || ''),
        exitCode: result?.exitCode,
    };
}

/** The one sentence a user needs when the interpreter is absent: what was skipped, and the command that would run it. */
export function pythonMissingNote(command: string, isAr: boolean): string {
    return isAr
        ? `Python غير مثبت على هذا الجهاز — لم يُنفَّذ فحص القبول ولم يفشل. الملفات مكتوبة؛ بعد تثبيت Python شغّل: ${command}`
        : `Python is not installed on this machine — the acceptance run was skipped, not failed. The files are written; after installing Python run: ${command}`;
}
