/**
 * THE BROWSER INSTALLS ITSELF, ONCE, INSTEAD OF ASKING HIM FOR A COMMAND.
 *
 * Every build ends in a check inside a real Chromium. On a machine where the
 * browser binary was never downloaded, that check does not run — and until
 * now the honest outcome was a warning telling the user to type
 * `npx playwright install chromium` himself.
 *
 * That warning is correct and it is still a failure of the product. Joe has a
 * terminal, it is already open in front of him, and the missing piece is one
 * command he did not ask to be responsible for. So Joe runs it: visibly, in
 * the panel he is watching, with its own prompt and exit code like every other
 * command — and then retries the check that was blocked.
 *
 * Four rules keep it from becoming a nuisance:
 *
 *   1. ONCE PER PROCESS. A failed install is remembered, so a machine with no
 *      network does not re-download on every build for the rest of the day.
 *   2. ONLY WHEN IT IS THE REASON. It runs on a missing-browser error and on
 *      nothing else; a page that crashed for its own reasons is not a reason
 *      to download anything.
 *   3. NEVER AGAINST HIS INSTRUCTION. A request that said «لا تستخدم الشبكة»
 *      has said everything necessary: no download is attempted at all.
 *   4. HONESTLY. If it fails, the reason is the exit code and the last lines
 *      of the process's own output — never «something went wrong».
 */

export interface EnsureResult {
    ok: boolean;
    /** Already there, downloaded now, refused, or failed — in one word. */
    state: 'present' | 'installed' | 'refused' | 'failed';
    detail: string;
}

/** One attempt per process, whatever the outcome. */
let attempted: EnsureResult | null = null;

/** Does this error mean «the browser binary is not on this machine»? */
export function isMissingBrowser(err: any): boolean {
    const m = String(err?.message || err || '');
    return /executable doesn'?t exist|playwright install|browserType\.launch.*ENOENT|please run the following command/i.test(m);
}

/**
 * Make Chromium available, or explain why it is not.
 *
 * `say` writes into whatever the caller is showing the user — in a build that
 * is the terminal panel, so the download appears as the command it is.
 */
export async function ensureChromium(opts: {
    say?: (line: string) => void;
    /** The user forbade network use: do not even try. */
    offline?: boolean;
    timeoutMs?: number;
} = {}): Promise<EnsureResult> {
    const say = (l: string) => { try { opts.say?.(l); } catch { /* the UI is optional */ } };
    if (attempted) return attempted;

    if (opts.offline) {
        attempted = {
            ok: false, state: 'refused',
            detail: 'the request said not to use the network, so no browser was downloaded',
        };
        say(`# ${attempted.detail}`);
        return attempted;
    }

    const { executionEngine } = require('../../kernel/ExecutionEngine');
    say('# the browser check needs Chromium and it is not on this machine — fetching it once');
    say('$ npx playwright install chromium');

    const started = Date.now();
    let out = '';
    let code: number | null = null;
    try {
        const h = executionEngine.runArgvStreaming('npx', ['playwright', 'install', 'chromium'], {
            cwd: process.cwd(),
            timeout: opts.timeoutMs ?? 300_000,
            env: { NO_COLOR: '1' },
            onLine: (l: string) => { out += l + '\n'; say(`  ${String(l).slice(0, 160)}`); },
        });
        const r = await h.done;
        code = r.exitCode;
    } catch (e: any) {
        out += String(e?.message || e);
    }
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    say(`→ exit ${code === null ? 'not found' : code} · ${secs}s`);

    if (code === 0) {
        attempted = { ok: true, state: 'installed', detail: `Chromium downloaded in ${secs}s` };
        return attempted;
    }
    // The process's own last words, not a paraphrase of them.
    const tail = out.trim().split('\n').filter(Boolean).slice(-2).join(' · ').slice(0, 200);
    attempted = {
        ok: false, state: 'failed',
        detail: `npx playwright install chromium exited ${code === null ? 'without starting' : String(code)}${tail ? ` — ${tail}` : ''}`,
    };
    return attempted;
}

/** Tests need a clean slate; nothing else should call this. */
export function _resetEnsureChromium(): void {
    attempted = null;
}
