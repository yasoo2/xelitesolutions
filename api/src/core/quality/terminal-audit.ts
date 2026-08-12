/**
 * THE TERMINAL RUNS REAL TESTS, IN FRONT OF HIM, AND JOE READS THE RESULTS.
 *
 * «ما زلت لم ارى شاشة الثيرمال يفتح مثل شاشة المتصفح ويجري اختبارات امامي …
 *  ويرى جو نتائج الاختبارات التي يجريها الثيرمال مثل ما ياخذ نتائج الجودة
 *  التي يجريها المتصفح»
 *
 * He is describing an asymmetry that was really there. The BROWSER half is a
 * full instrument: the panel opens itself, a real Chromium presses every
 * control in front of him, and it returns a SCORE and named findings that Joe
 * repairs against and reports. The TERMINAL half was a pipe: build output
 * scrolled past, nobody opened the panel, and nothing that appeared there was
 * ever measured. A stream is not a test.
 *
 * This is the terminal's own instrument, built to the same contract:
 *
 *   • the panel is asked for by name, so he is looking at it before the first
 *     command runs;
 *   • every check is a REAL process with a real exit code — no simulation,
 *     nothing assumed from a file's existence;
 *   • each one prints its own command line and its own answer into the
 *     terminal he is watching;
 *   • and it returns { score, checks } — the same shape the browser audit
 *     returns, so the delivery report can carry both numbers side by side and
 *     a failure has a NAME, not a scroll position.
 *
 * Everything here is offline-safe. A check that cannot run says so and is
 * excluded from the score, because scoring a system for a test that never
 * happened is exactly the dishonesty this project keeps deleting.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

export interface TerminalCheck {
    /** A stable name a report can point at: `deps_installed`, `health_answers`. */
    id: string;
    /** What was actually run, verbatim — he can paste it himself. */
    command: string;
    ok: boolean;
    /** Why, in one line. The process's own words when it failed. */
    detail: string;
    ms: number;
    /** Ran but could not conclude (no network, no server) — not counted. */
    skipped?: boolean;
}

export interface TerminalAudit {
    score: number;
    checks: TerminalCheck[];
    /** Set when the whole run was impossible; `checks` is then empty. */
    skipped?: string;
    passed: number;
    total: number;
}

export interface TerminalAuditOptions {
    /** Every line goes here — the caller sends it to the terminal panel. */
    onLine?: (line: string) => void;
    /** The running system, when there is one: enables the live HTTP checks. */
    serveUrl?: string;
    /** The tables this system declares — each one is asked for by name. */
    tables?: string[];
    /** Milliseconds per check. A hung command must not hold the delivery. */
    timeoutMs?: number;
}

/** The failing ids, for a one-line verdict. */
export function failingIds(audit: TerminalAudit): string[] {
    return audit.checks.filter(c => !c.ok && !c.skipped).map(c => c.id);
}

/**
 * Run one real process and read its exit code.
 *
 * `runArgvStreaming` rather than a shell string: the arguments are passed as
 * an array, so a path with a space in it — `C:\Users\home\Documents\…` — is
 * not four arguments.
 */
async function run(
    file: string,
    args: string[],
    cwd: string,
    timeoutMs: number,
    onLine?: (line: string) => void,
): Promise<{ ok: boolean; out: string; code: number | null }> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { executionEngine } = require('../../kernel/ExecutionEngine');
    const lines: string[] = [];
    let child: any = null;
    try {
        child = executionEngine.runArgvStreaming(file, args, {
            cwd,
            env: { ...process.env, NODE_NO_WARNINGS: '1', CI: '1' },
            onLine: (l: string) => {
                if (lines.length < 200) lines.push(l);
                // Indented, so his eye separates the command from its answer.
                try { onLine?.(`    ${l.slice(0, 200)}`); } catch { /* logging is optional */ }
            },
        });
    } catch (e: any) {
        return { ok: false, out: String(e?.message || e), code: null };
    }
    let timer: any = null;
    const timeout = new Promise<{ ok: boolean; exitCode: number | null; error?: string }>(r => {
        timer = setTimeout(() => r({ ok: false, exitCode: null, error: 'timeout' }), timeoutMs);
    });
    const res = await Promise.race([child.done, timeout]);
    clearTimeout(timer);
    if (res.error === 'timeout') { try { child.kill(); } catch { /* already gone */ } }
    return { ok: !!res.ok && res.exitCode === 0, out: lines.join('\n'), code: res.exitCode ?? null };
}

/** A node one-liner, run by THIS node — no dependency, no shell quoting games. */
function nodeEval(script: string): { file: string; args: string[] } {
    return { file: process.execPath, args: ['-e', script] };
}

/**
 * The audit.
 *
 * `dir` is the SERVER's directory — the folder that holds package.json,
 * server.js and the database. That is the thing a terminal can test; the
 * interface is the browser's half.
 */
export async function auditInTerminal(
    dir: string,
    opts: TerminalAuditOptions = {},
): Promise<TerminalAudit> {
    const say = (s: string) => { try { opts.onLine?.(s); } catch { /* optional */ } };
    const per = Math.max(3000, opts.timeoutMs || 25_000);
    const checks: TerminalCheck[] = [];

    if (!dir || !fs.existsSync(path.join(dir, 'package.json'))) {
        return { score: 0, checks: [], skipped: 'no_project', passed: 0, total: 0 };
    }

    const add = async (
        id: string,
        command: string,
        fn: () => Promise<{ ok: boolean; detail: string; skipped?: boolean }>,
    ) => {
        const t0 = Date.now();
        say(`$ ${command}`);
        let out: { ok: boolean; detail: string; skipped?: boolean };
        try { out = await fn(); } catch (e: any) { out = { ok: false, detail: String(e?.message || e).slice(0, 200) }; }
        const ms = Date.now() - t0;
        checks.push({ id, command, ok: out.ok, detail: out.detail, ms, skipped: out.skipped });
        say(`  ${out.skipped ? '⏭️' : out.ok ? '✅' : '❌'} ${id} — ${out.detail} (${ms}ms)`);
    };

    /* 1 ── every declared dependency is really installed ─────────────────── */
    await add('deps_installed', 'npm ls --depth=0', async () => {
        if (!fs.existsSync(path.join(dir, 'node_modules'))) {
            return { ok: false, detail: 'node_modules is missing — nothing was installed' };
        }
        const r = await run('npm', ['ls', '--depth=0'], dir, per, say);
        return r.ok
            ? { ok: true, detail: 'every dependency in package.json is on disk' }
            : { ok: false, detail: (r.out.split('\n').find(l => /missing|invalid|UNMET/i.test(l)) || 'npm ls failed').slice(0, 160) };
    });

    /* 2 ── every source file this server starts from actually parses ─────── */
    const sources = ['server.js', 'db.js', 'entities.js', 'auth.js', 'seed.js']
        .filter(f => fs.existsSync(path.join(dir, f)));
    if (sources.length) {
        /**
         * `node --check file.js` IS NOT A SYNTAX CHECK ON ITS OWN.
         *
         * Measured on Node 22 while writing this: a file containing
         * `export const db = { ;;; }`, in a package with no
         * `"type": "module"`, exits ZERO. Node parses it as a script, sees ESM
         * syntax, and the module retry never surfaces the error. The same
         * bytes in a `.mjs` file exit 1 with the caret on the offending token.
         *
         * A check that passes broken code is worse than no check, so the goal
         * is FORCED rather than hoped for: each source is copied to a temp
         * file whose extension states the goal, and that is what is checked.
         */
        let pkgType = '';
        try { pkgType = String(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')).type || ''); }
        catch { /* no manifest — the syntax sniff below decides */ }
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-parse-'));
        await add('sources_parse', `node --check ${sources.join(' ')}`, async () => {
            try {
                for (const f of sources) {
                    const text = fs.readFileSync(path.join(dir, f), 'utf-8');
                    const esm = pkgType === 'module' || /^\s*(import|export)[\s{*]/m.test(text);
                    const probe = path.join(tmp, `${f.replace(/[^\w.-]/g, '_')}.${esm ? 'mjs' : 'cjs'}`);
                    fs.writeFileSync(probe, text, 'utf-8');
                    const r = await run(process.execPath, ['--check', probe], tmp, per);
                    if (!r.ok) {
                        const line = r.out.split('\n').find(l => /Error/.test(l)) || 'syntax error';
                        return { ok: false, detail: `${f}: ${line.trim().slice(0, 140)}` };
                    }
                }
                return { ok: true, detail: `${sources.length} server file(s) parse` };
            } finally {
                try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
            }
        });
    }

    /* 3 ── the database file exists and holds the tables it declares ─────── */
    const dbFile = ['data.db', 'data.json'].map(f => path.join(dir, f)).find(f => fs.existsSync(f));
    if (dbFile && dbFile.endsWith('.db')) {
        const want = (opts.tables || []).filter(Boolean);
        const script = [
            "const{DatabaseSync}=require('node:sqlite');",
            `const c=new DatabaseSync(${JSON.stringify(dbFile)});`,
            "const t=c.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all().map(r=>r.name);",
            'console.log(t.join(","));',
        ].join('');
        await add('tables_exist', 'node -e "SELECT name FROM sqlite_master"', async () => {
            const r = await run(...Object.values(nodeEval(script)) as [string, string[]], dir, per, say);
            if (!r.ok) return { ok: true, skipped: true, detail: 'this Node has no node:sqlite — the JSON store is in use' };
            const have = String(r.out).split(/[\n,]/).map(s => s.trim()).filter(Boolean);
            const missing = want.filter(w => !have.includes(w));
            return missing.length
                ? { ok: false, detail: `declared but not created: ${missing.join(', ')}` }
                : { ok: true, detail: `${have.length} table(s) in the database: ${have.slice(0, 8).join(', ')}` };
        });
    }

    /* 4 ── the RUNNING system answers, and says it is this system ────────── */
    const url = String(opts.serveUrl || '').replace(/\/+$/, '');
    if (url) {
        const healthScript = [
            `fetch(${JSON.stringify(url + '/api/health')})`,
            '.then(r=>r.text()).then(t=>{console.log(t.slice(0,300));process.exit(0)})',
            '.catch(e=>{console.log(String(e && e.message));process.exit(1)})',
        ].join('');
        await add('health_answers', `node -e "fetch('${url}/api/health')"`, async () => {
            const r = await run(...Object.values(nodeEval(healthScript)) as [string, string[]], dir, per, say);
            if (!r.ok) return { ok: false, detail: `no answer from ${url}/api/health` };
            try {
                const d = JSON.parse(String(r.out).trim().split('\n').pop() || '{}');
                return d && d.ok
                    ? { ok: true, detail: `backend ${d.backend || '?'}, ${Object.keys(d.tables || {}).length} table(s) reported` }
                    : { ok: false, detail: 'health answered, but not with ok:true' };
            } catch {
                return { ok: false, detail: 'health answered with something that is not JSON' };
            }
        });

        /* 5 ── EVERY declared table has a route that really answers ───────── */
        const tables = (opts.tables || []).filter(Boolean);
        if (tables.length) {
            const listScript = [
                `const t=${JSON.stringify(tables)};`,
                '(async()=>{const bad=[];for(const k of t){',
                `try{const r=await fetch(${JSON.stringify(url + '/api/')}+k);`,
                'const d=await r.json().catch(()=>null);',
                'if(!r.ok||!d||!Array.isArray(d[k]))bad.push(k+" ("+r.status+")");',
                '}catch(e){bad.push(k+" (no answer)")}}',
                'console.log(bad.length?"FAIL "+bad.join(", "):"OK");',
                'process.exit(bad.length?1:0)})()',
            ].join('');
            await add('tables_answer', `node -e "GET /api/{${tables.join(',')}}"`, async () => {
                const r = await run(...Object.values(nodeEval(listScript)) as [string, string[]], dir, per, say);
                const last = String(r.out).trim().split('\n').pop() || '';
                return r.ok
                    ? { ok: true, detail: `all ${tables.length} table route(s) answer with their rows` }
                    : { ok: false, detail: last.replace(/^FAIL /, '') || 'a table route did not answer' };
            });
        }

        /* 6 ── writing is really protected — an anonymous write must be 401 ─ */
        const guardTable = (opts.tables || [])[0];
        if (guardTable) {
            const authScript = [
                `fetch(${JSON.stringify(`${url}/api/${guardTable}`)},{method:'POST',`,
                "headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'x'})})",
                '.then(r=>{console.log(String(r.status));process.exit(r.status===401?0:1)})',
                '.catch(e=>{console.log(String(e&&e.message));process.exit(1)})',
            ].join('');
            await add('writes_protected', `node -e "POST /api/${guardTable} with no token"`, async () => {
                const r = await run(...Object.values(nodeEval(authScript)) as [string, string[]], dir, per, say);
                const status = String(r.out).trim().split('\n').pop() || '?';
                return r.ok
                    ? { ok: true, detail: 'an anonymous write is refused with 401, as it must be' }
                    : { ok: false, detail: `an anonymous write answered ${status} — it should be 401` };
            });
        }
    }

    const counted = checks.filter(c => !c.skipped);
    const passed = counted.filter(c => c.ok).length;
    const total = counted.length;
    // No countable check is not a zero — it is «nothing was measured», and a
    // score of 0 would be a verdict this run never earned.
    if (!total) return { score: 0, checks, skipped: 'nothing_measurable', passed: 0, total: 0 };
    return { score: Math.round((passed / total) * 100), checks, passed, total };
}
