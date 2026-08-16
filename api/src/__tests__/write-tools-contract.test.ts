/**
 * THE OTHER HALF OF THE CATALOGUE.
 *
 * The registry lock runs every READ-ONLY tool. The 103 that write, execute,
 * deploy or drive a browser were catalogued and never invoked — «an audit must
 * not change what it audits» — which left more than two thirds of the tools
 * unproven. A ghost hides most comfortably there.
 *
 * So the doors are closed instead of the tools: the shell, the network and
 * Playwright are stubbed at their single choke points, and the workspace root
 * is bound to a temp folder under an audit-only workspace ID. Then every one
 * of them is called for real, with no arguments, and held to three rules:
 *
 *   1. ANSWER. `ok:false` with a sentence is a fine answer; an unhandled throw
 *      is not, and neither is silence.
 *   2. STAND STILL. No arguments means no work: nothing may reach the shell,
 *      the network or a browser on an empty call. Four tools legitimately
 *      default to the current project and are named below.
 *   3. STAY INSIDE. A tool handed a path outside the workspace must refuse —
 *      and the disk is checked afterwards, because refusing in words while
 *      writing anyway is the failure that matters.
 *
 * What the first run of this audit found, all of it real:
 *   - large_data_seeder wrote OUTSIDE the workspace (raw fs.writeFileSync on
 *     the path it was handed) and crashed on a missing one;
 *   - ai_write_file spent a full model call on an empty brief before dying;
 *   - website_full_pipeline scaffolded an entire e-commerce site nobody asked
 *     for, because its required `name` had a default;
 *   - shell_execute, kubernetes_ops and terraform_manager passed the STRING
 *     "undefined" to the shell (`String(undefined)` is truthy);
 *   - dev_server_start opened a public dev server on 0.0.0.0 with no project;
 *   - load_tester hammered fetch(undefined) with ten workers for ten seconds;
 *   - browser_vision, screenshot and browser_compare launched a real browser
 *     with nothing to open;
 *   - file_edit died on EISDIR because an empty filename resolved to the
 *     workspace root, which exists;
 *   - auth_builder resolved its output against process.cwd() and generated a
 *     whole auth module into JOE'S OWN api/src/auth — inside the repository,
 *     so no «escape» was detected while Joe's source tree was being written to.
 *
 * NOTE for running this file ALONE: some tools leave a timer or a listener
 * behind, and Jest runs a single file in-band, so the process does not exit on
 * its own — use `npx jest src/__tests__/write-tools-contract.test.ts
 * --forceExit`. In the full suite it runs in a worker and the suite exits
 * normally.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { tools } from '../modules/tools/registry';
import { workspaceService } from '../modules/services/WorkspaceService';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';

const AUDIT_WS = 'jest-write-audit';
const knocked = { shell: [] as string[], net: [] as string[], browser: [] as string[] };
let current = '(none)';

/** Tools that act with no arguments BY DESIGN — their schemas require nothing. */
const MAY_DEFAULT = new Set(['browser_launch', 'repo_diff_summary', 'dead_code_detector', 'dependency_audit']);

const UNSAFE = /(write|create|delete|remove|deploy|publish|push|commit|install|npm|exec|run|terminal|shell|browser|http|fetch|url|api_test|rss|search_api|clone|import|edit|generate|build|scaffold|project_pipeline|ask_user|screenshot|kill|move|rename|archive|extract|upload|mail|send)/i;
const writeClass: any[] = tools.filter((t: any) => UNSAFE.test(t.name)
    || (t.permissions || []).some((p: string) => p === 'write' || p === 'execute'));

const pathProp = (t: any) => Object.keys(t?.inputSchema?.properties || {})
    .find(k => /^(path|file|filePath|file_path|target|dest|destination|output|outputPath)$/i.test(k));

// A transpiled module exposes its exports as getters, so plain assignment throws.
const stub = (mod: any, key: string, fn: any) => {
    try { Object.defineProperty(mod, key, { value: fn, writable: true, configurable: true }); }
    catch { mod[key] = fn; }
};

/**
 * Run where the orchestrator runs: inside the execution firewall's system
 * context (some tools call other tools) and inside the audit workspace, so the
 * machine's own persisted workspace root is never touched.
 */
const call = (t: any, args: any) => workspaceService.runWithWorkspace(AUDIT_WS, () =>
    executionFirewall.runAsSystem(() =>
        Promise.resolve(t.execute(args, { sessionId: 'jest-write-audit', workspaceId: AUDIT_WS }))));

let sandbox = '';
let emptyCall: Array<{ name: string; error?: string; answered: boolean }> = [];

beforeAll(async () => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'jest-write-audit-'));
    // NEVER setActiveRoot without a workspace id here: that PERSISTS to disk.
    await workspaceService.setActiveRoot(sandbox, AUDIT_WS);

    const shellStub = async (cmd: any) => {
        knocked.shell.push(`${current}: ${String(cmd?.command ?? cmd).slice(0, 40)}`);
        return { success: false, stdout: '', stderr: 'audit: shell closed', exitCode: 1, durationMs: 0 };
    };
    const engine = require('../kernel/ExecutionEngine');
    stub(engine.executionEngine, 'run', shellStub);
    const gateway = require('../kernel/ExecutionGateway');
    stub(gateway.ExecutionGateway, 'execute', shellStub);
    stub(gateway.ExecutionGateway, 'executeLegacy', shellStub);

    stub(globalThis, 'fetch', async (url: any) => {
        knocked.net.push(`${current}: ${String(url).slice(0, 60)}`);
        throw new Error('audit: network closed');
    });

    const pw = require('playwright');
    const refuseBrowser = async () => { knocked.browser.push(current); throw new Error('audit: browser closed'); };
    for (const k of ['launch', 'launchPersistentContext', 'connect', 'connectOverCDP']) stub(pw.chromium, k, refuseBrowser);

    emptyCall = [];
    for (const t of writeClass) {
        current = t.name;
        try {
            const res: any = await Promise.race([
                call(t, {}),
                new Promise((_r, rej) => setTimeout(() => rej(new Error('TIMEOUT')), 12000)),
            ]);
            emptyCall.push({
                name: t.name,
                answered: !!res && typeof res === 'object'
                    && ('ok' in res || 'output' in res || 'error' in res || 'success' in res),
            });
        } catch (e: any) {
            emptyCall.push({ name: t.name, answered: false, error: String(e?.message || e).slice(0, 70) });
        }
    }
}, 180000);

afterAll(() => {
    // JSON/mock mode has one visible local root. This audit intentionally points
    // it at a temp directory, so restore the production default before Jest
    // exits; otherwise the next local API process inherits the deleted sandbox.
    try { workspaceService.resetToSystem(); } catch { }
    try { fs.rmSync(sandbox, { recursive: true, force: true }); } catch { }
});

describe('the write/execute half of the catalogue is real', () => {
    it('there are more of them than of the read-only half — this must cover the bulk', () => {
        expect(writeClass.length).toBeGreaterThan(90);
    });

    it('not one of them throws or falls silent when called with nothing', () => {
        expect(emptyCall.filter(r => r.error).map(r => `${r.name}: ${r.error}`)).toEqual([]);
        expect(emptyCall.filter(r => !r.answered && !r.error).map(r => r.name)).toEqual([]);
    });

    it('no arguments means no work — nothing reaches the shell, the network or a browser', () => {
        const uninvited = (list: string[]) => list.filter(l => !MAY_DEFAULT.has(l.split(':')[0].trim()));
        expect(uninvited(knocked.shell)).toEqual([]);
        expect(uninvited(knocked.net)).toEqual([]);
        expect([...new Set(uninvited(knocked.browser))]).toEqual([]);
    });

    it('a path outside the workspace is refused — and the disk agrees', async () => {
        const escapers = writeClass.filter(t => pathProp(t));
        expect(escapers.length).toBeGreaterThan(10);
        const escaped: string[] = [];
        for (const t of escapers) {
            current = t.name;
            const witness = path.join(os.tmpdir(), `jest-escape-${t.name}.txt`);
            try { fs.unlinkSync(witness); } catch { }
            const args: any = {
                [pathProp(t)!]: `../../../../../../..${witness}`,
                content: 'ESCAPED', text: 'ESCAPED', data: 'ESCAPED',
            };
            try {
                await Promise.race([call(t, args), new Promise((_r, rej) => setTimeout(() => rej(new Error('TIMEOUT')), 12000))]);
            } catch { /* refusing by throwing is still refusing */ }
            if (fs.existsSync(witness)) { escaped.push(t.name); try { fs.unlinkSync(witness); } catch { } }
        }
        expect(escaped).toEqual([]);
    }, 180000);
});

/**
 * The workspace root is persisted to disk. A saved path whose folder no longer
 * exists used to be handed back anyway — every build and the whole File
 * Explorer pointing at a directory that was not there. This audit caused that
 * exact corruption on its first run, which is how the healing was found.
 */
/**
 * file_edit with an empty `find` ran `content.replace('', x)`, which PREPENDS —
 * a silent corruption that reported success. The wiring proof had been passing
 * on exactly that, because the field it sends is called `search`, which this
 * tool did not accept.
 */
describe('file_edit edits, or says why not — it never quietly prepends', () => {
    const tool: any = tools.find((t: any) => t.name === 'file_edit');
    // Inside the audit workspace — anywhere else and containment refuses the
    // write first, which would prove nothing about the edit itself.
    let dir = '';
    beforeAll(() => { dir = path.join(sandbox, 'edits'); fs.mkdirSync(dir, { recursive: true }); });

    it('refuses an empty find instead of prepending to the file', async () => {
        const f = path.join(dir, 'note.txt');
        fs.writeFileSync(f, 'original');
        const res: any = await call(tool, { filename: f, find: '', replace: 'INJECTED' });
        expect(res.ok).toBe(false);
        expect(fs.readFileSync(f, 'utf-8')).toBe('original');
    });

    it('accepts the name every other editor uses for the field (`search`)', async () => {
        const f = path.join(dir, 'note2.txt');
        fs.writeFileSync(f, 'before-marker-after');
        const res: any = await call(tool, { filename: f, search: 'marker', replace: 'REPLACED' });
        expect(res.ok).toBe(true);
        expect(fs.readFileSync(f, 'utf-8')).toBe('before-REPLACED-after');
    });

    it('a folder is not a file', async () => {
        const res: any = await call(tool, { filename: dir, find: 'x', replace: 'y' });
        expect(res.ok).toBe(false);
        expect(String(res.error)).toMatch(/folder/i);
    });
});

describe('a vanished workspace root heals itself', () => {
    it('the service refuses to return a root that does not exist', () => {
        const root = workspaceService.getActiveRoot();
        expect(fs.existsSync(root)).toBe(true);
    });

    it('the loader checks the folder before trusting the saved choice', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'services', 'WorkspaceService.ts'), 'utf-8');
        expect(src).toMatch(/saved\s*===?\s*'string'\s*&&\s*fs\.existsSync\(saved\)/);
    });
});
