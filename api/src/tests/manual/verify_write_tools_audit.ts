/**
 * THE OTHER 103 — the tools an audit is afraid to run.
 *
 * The registry audit ran every READ-ONLY tool and left the write/execute half
 * catalogued but untouched: «an audit must not change what it audits». That is
 * a fair rule and a bad outcome, because it means 103 of 151 tools — every
 * builder, every browser tool, every deployer — were never once invoked. A
 * ghost hides more comfortably there than anywhere else.
 *
 * So the doors are closed instead of the tools. Every way a tool can affect
 * the machine is stubbed at its single choke point, and the stub REMEMBERS who
 * knocked:
 *
 *   - the shell        (executionEngine.run, ExecutionGateway.execute)
 *   - the network      (globalThis.fetch)
 *   - the browser      (browser/manager.getBrowserSession, createSession)
 *   - the filesystem   (the workspace root is moved to a fresh temp folder)
 *
 * With the doors shut, all 103 are called with NO arguments — the ordinary
 * case of a planner omitting a field — and each must ANSWER. `ok:false` with a
 * sentence is a fine answer. An unhandled throw is not, and neither is a
 * silent `undefined`.
 *
 * Then the containment probe: every tool that takes a path is handed
 * `../../../../tmp/joe-escape-<name>` and must refuse. Refusing is not enough —
 * the disk is checked afterwards, because a tool that says «done» and writes
 * outside the workspace is the failure that matters.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_write_tools_audit.ts
 */
export {};
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.OFFLINE_MODE = 'true';
process.env.PERSISTENCE_MODE = 'JSON';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const knocked = { shell: [] as string[], net: [] as string[], browser: [] as string[] };
let current = '(none)';

/** Shut every door out of the process, and remember who tried to walk through. */
function closeTheDoors() {
    // A transpiled module exposes its exports as GETTERS, so plain assignment
    // throws. defineProperty replaces the getter itself.
    const stub = (mod: any, key: string, fn: any) => {
        try { Object.defineProperty(mod, key, { value: fn, writable: true, configurable: true }); }
        catch { mod[key] = fn; }
    };

    const engine = require('../../kernel/ExecutionEngine');
    const shellStub = async (cmd: any) => {
        knocked.shell.push(`${current}: ${String(cmd?.command ?? cmd).slice(0, 40)}`);
        return { success: false, stdout: '', stderr: 'audit: shell closed', exitCode: 1, durationMs: 0 };
    };
    stub(engine.executionEngine, 'run', shellStub);
    const gateway = require('../../kernel/ExecutionGateway');
    stub(gateway.ExecutionGateway, 'execute', shellStub);
    stub(gateway.ExecutionGateway, 'executeLegacy', shellStub);

    stub(globalThis, 'fetch', async (url: any) => {
        knocked.net.push(`${current}: ${String(url).slice(0, 60)}`);
        throw new Error('audit: network closed');
    });

    // The manager's exports are ESM bindings and cannot be replaced, so the
    // browser is closed one level deeper — at Playwright itself, which is a
    // plain CommonJS object. Nothing can launch Chromium past this line.
    const refuse = async () => { knocked.browser.push(current); throw new Error('audit: browser closed'); };
    const pw = require('playwright');
    for (const k of ['launch', 'launchPersistentContext', 'connect', 'connectOverCDP']) stub(pw.chromium, k, refuse);
}

const answered = (res: any) => res && typeof res === 'object'
    && ('ok' in res || 'output' in res || 'error' in res || 'success' in res);

/**
 * Tools run inside the orchestrator's trusted context in production, and some
 * of them call OTHER tools through executeTool — which the execution firewall
 * blocks outside that context. Calling them bare would manufacture a failure
 * the real system never has, so the audit runs where the orchestrator runs.
 */
async function callWithTimeout(t: any, args: any, ms = 12000) {
    const { executionFirewall } = require('../../orchestration/AgentExecutionFirewall');
    const { workspaceService } = require('../../modules/services/WorkspaceService');
    return await Promise.race([
        workspaceService.runWithWorkspace(AUDIT_WS, () =>
            executionFirewall.runAsSystem(() =>
                Promise.resolve(t.execute(args, { sessionId: 'write-audit', workspaceId: AUDIT_WS })))),
        new Promise((_r, rej) => setTimeout(() => rej(new Error('TIMEOUT')), ms)),
    ]);
}

/**
 * A few tools legitimately act with no arguments, and it is their documented
 * job: browser_launch opens a browser, and the rest describe or audit the
 * project the session is already in — their schemas declare no required field
 * for exactly that reason. Everything else must stay still until it is told
 * something.
 */
const MAY_DEFAULT = new Set(['browser_launch', 'repo_diff_summary', 'dead_code_detector', 'dependency_audit']);

/**
 * The sandbox is bound to a workspace ID, never to the local root.
 *
 * Setting the local root PERSISTS the choice to disk — this audit did exactly
 * that on its first run and left the machine's real workspace pointing at a
 * temp folder it then deleted. A workspace-scoped root lives in memory only,
 * so the audit cannot outlive itself.
 */
const AUDIT_WS = 'write-audit-ws';

/** Whatever was already untracked before the audit is not the audit's doing. */
const BEFORE_UNTRACKED = new Set<string>(
    require('child_process')
        .execSync('git status --porcelain', { cwd: path.join(__dirname, '..', '..', '..', '..'), encoding: 'utf-8' })
        .split('\n').filter((l: string) => l.startsWith('??')).map((l: string) => l.slice(3).trim())
);

async function main() {
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-write-audit-'));
    const { workspaceService } = require('../../modules/services/WorkspaceService');
    await workspaceService.setActiveRoot(sandbox, AUDIT_WS);
    closeTheDoors();

    const { tools } = require('../../modules/tools/registry');
    const UNSAFE = /(write|create|delete|remove|deploy|publish|push|commit|install|npm|exec|run|terminal|shell|browser|http|fetch|url|api_test|rss|search_api|clone|import|edit|generate|build|scaffold|project_pipeline|ask_user|screenshot|kill|move|rename|archive|extract|upload|mail|send)/i;
    const writeClass = tools.filter((t: any) => UNSAFE.test(t.name)
        || (t.permissions || []).some((p: string) => p === 'write' || p === 'execute'));

    console.log(`\n[1] ${writeClass.length} أداة كاتبة/منفّذة — تُستدعى فعلاً لأول مرة، والأبواب مغلقة`);
    console.log(`      (مساحة العمل مؤقتة: ${sandbox})`);
    const crashed: string[] = [];
    const silent: string[] = [];
    const timedOut: string[] = [];
    for (const t of writeClass) {
        current = t.name;
        try {
            const res: any = await callWithTimeout(t, {});
            if (!answered(res)) silent.push(`${t.name}: ${JSON.stringify(res).slice(0, 50)}`);
        } catch (e: any) {
            const msg = String(e?.message || e);
            if (msg === 'TIMEOUT') timedOut.push(t.name);
            else crashed.push(`${t.name}: ${msg.slice(0, 70)}`);
        }
    }
    check(`لا أداة تنهار على إدخال فارغ (${writeClass.length - crashed.length}/${writeClass.length})`,
        crashed.length === 0, crashed.join(' | '));
    check('لا أداة تردّ بالعدم — كل استدعاء يعود بنتيجة يفهمها المنسّق',
        silent.length === 0, silent.join(' | '));
    check('لا أداة تعلّق بلا نهاية على إدخال فارغ', timedOut.length === 0, timedOut.join(', '));

    console.log('\n[2] بلا حجج، لا تطرق أداة باباً خارج العملية');
    // A tool asked for nothing should not be running a command, calling the
    // network or launching a browser: that is work started on no instruction.
    const uninvited = (list: string[]) => list.filter(l => !MAY_DEFAULT.has(l.split(':')[0].trim()));
    console.log(`      (${[...MAY_DEFAULT].join('، ')} تعمل بلا حجج عن قصد موثّق)`);
    check('لا صدفة تُستدعى بأمر فارغ', uninvited(knocked.shell).length === 0, uninvited(knocked.shell).slice(0, 6).join(' | '));
    check('لا شبكة تُطلب بلا عنوان', uninvited(knocked.net).length === 0, uninvited(knocked.net).slice(0, 6).join(' | '));
    check('لا متصفّح يُطلق بلا صفحة', uninvited(knocked.browser).length === 0,
        [...new Set(uninvited(knocked.browser))].slice(0, 8).join(', '));

    console.log('\n[3] الاحتواء: مسار خارج مساحة العمل يُرفض — والقرص هو الشاهد');
    const pathProp = (t: any) => Object.keys(t?.inputSchema?.properties || {})
        .find(k => /^(path|file|filePath|file_path|target|dest|destination|output|outputPath)$/i.test(k));
    const escapers = writeClass.filter((t: any) => pathProp(t));
    console.log(`      (${escapers.length} أداة تقبل مساراً)`);
    const escaped: string[] = [];
    const witnesses: string[] = [];
    for (const t of escapers) {
        current = t.name;
        const witness = path.join(os.tmpdir(), `joe-escape-${t.name}.txt`);
        try { fs.unlinkSync(witness); } catch { }
        const key = pathProp(t)!;
        const args: any = { [key]: `../../../../../../..${witness}`, content: 'ESCAPED', text: 'ESCAPED', data: 'ESCAPED' };
        try { await callWithTimeout(t, args, 12000); } catch { /* refusing by throwing is fine here */ }
        if (fs.existsSync(witness)) { escaped.push(t.name); witnesses.push(witness); }
    }
    check(`لا أداة كتبت خارج مساحة العمل (${escapers.length - escaped.length}/${escapers.length})`,
        escaped.length === 0, escaped.join(', '));
    for (const w of witnesses) { try { fs.unlinkSync(w); } catch { } }

    console.log('\n[4] لم يكتب أحد داخل شجرة جو نفسها');
    // The /tmp witness was not enough. auth_builder resolved its output against
    // process.cwd() instead of the workspace and generated a whole auth module
    // into api/src/auth — inside the repository, so no «escape» was detected
    // while Joe's own source tree was being edited by a tool given nothing.
    const repoDirty = require('child_process')
        .execSync('git status --porcelain', { cwd: path.join(__dirname, '..', '..', '..', '..'), encoding: 'utf-8' })
        .split('\n').filter((l: string) => l.startsWith('??'))
        .map((l: string) => l.slice(3).trim())
        .filter((f: string) => !BEFORE_UNTRACKED.has(f));
    check('لا ملف جديد ظهر في مستودع جو أثناء التدقيق', repoDirty.length === 0, repoDirty.join(' | '));

    console.log('\n[5] الجدار ما زال قائماً بعد كل هذا');
    const { executeTool } = require('../../modules/services/ToolService');
    let blocked = false;
    try { await executeTool('write_file', { path: 'x.txt', content: 'y' }, { sessionId: 'write-audit' }); }
    catch (e: any) { blocked = /bypass/i.test(String(e?.message || '')); }
    check('جدار التنفيذ ما زال يرفض استدعاء أداة خارج المنسّق', blocked);

    try { fs.rmSync(sandbox, { recursive: true, force: true }); } catch { }
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
