/**
 * THE WIRING POLICY — «لا أريد أن نضيف ونرمي، ثم نتفاجأ بعد فترة أنه لا يعمل
 * لأنه غير مرتبط بمسار صحيح».
 *
 * A feature is not finished when it exists. It is finished when the system
 * REACHES it. This file is the standing enforcement of that rule, and it runs
 * on every commit — so an addition that is not connected fails the build on
 * the day it lands, not in the field weeks later.
 *
 * What it refuses to let through:
 *   1. an alias that points at a tool which does not exist
 *   2. an alias whose target does a DIFFERENT JOB than its name promises
 *      (five names meaning «find this text» pointed at a filename glob and
 *      answered `{files: []}` — confident, empty and wrong)
 *   3. a tool named by the planner or by the orchestrator's deterministic
 *      list that resolves to nothing
 *   4. a generated component written to disk but never imported or rendered
 *   5. a capability the system depends on with no tool behind it at all
 *   6. a helper introduced with no caller
 */
import fs from 'fs';
import path from 'path';
import { tools } from '../modules/tools/registry';
import { TOOL_ALIASES } from '../modules/services/ToolService';

const NAMES = tools.map((t: any) => t.name);
const SRC = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf-8');
const resolves = (n: string) => NAMES.includes(n) || NAMES.includes(TOOL_ALIASES[n] || '');

describe('every name the system can utter reaches something real', () => {
    it('no alias points at a tool that does not exist', () => {
        const broken = Object.entries(TOOL_ALIASES).filter(([, target]) => !NAMES.includes(target));
        expect(broken).toEqual([]);
    });

    it('no alias shadows a registered tool of the same name', () => {
        const shadowed = Object.keys(TOOL_ALIASES).filter(a => NAMES.includes(a) && TOOL_ALIASES[a] !== a);
        expect(shadowed).toEqual([]);
    });

    it('a name that means CONTENT search never lands on the filename glob', () => {
        // The exact mis-wiring the audit found: grep and its synonyms answered
        // with an empty file list instead of ever reading a file.
        for (const n of ['grep', 'grep_search', 'ripgrep', 'code_search', 'search_code', 'find_in_files']) {
            expect(TOOL_ALIASES[n]).toBe('search_text');
        }
        for (const n of ['file_search', 'find_files', 'glob_search']) {
            expect(TOOL_ALIASES[n]).toBe('search_files');
        }
        // …and both tools really exist, doing their two different jobs.
        expect(NAMES).toContain('search_text');
        expect(NAMES).toContain('search_files');
    });

    it('every tool the PLANNER names resolves', () => {
        const planner = SRC('core', 'orchestrator', 'PlanningEngine.ts');
        const named = [...new Set([...planner.matchAll(/tool:\s*'([a-z_]+)'/g)].map(m => m[1]))]
            .filter(n => !['direct_response', 'central_answer'].includes(n));
        expect(named.filter(n => !resolves(n))).toEqual([]);
        expect(named.length).toBeGreaterThan(5);          // the fast paths are still there
    });

    it('every tool in the orchestrator\'s deterministic list resolves', () => {
        const orch = SRC('orchestration', 'AgentOrchestrator.ts');
        const block = (orch.match(/DETERMINISTIC_TOOLS\s*=\s*\[([\s\S]*?)\]/) || [])[1] || '';
        const named = [...block.matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
        expect(named.filter(n => !resolves(n))).toEqual([]);
        for (const must of ['react_project', 'project_edit', 'web_page_builder']) expect(named).toContain(must);
    });

    it('the file-lifecycle capabilities all exist — create, read, edit, list, search, DELETE', () => {
        // Deletion was missing entirely across 149 tools until the audit ran.
        for (const cap of ['write_file', 'read_file', 'file_edit', 'inspect_directory', 'search_files', 'search_text', 'delete_file']) {
            expect(NAMES).toContain(cap);
        }
    });
});

describe('nothing is written and then abandoned', () => {
    it('every helper introduced for the panels has real callers', () => {
        const ws = SRC('api', 'ws.ts');
        expect(ws).toContain('export function broadcastTerminalLine');
        for (const f of ['ReactProjectTool', 'ApiProjectTool', 'ImportProjectTool', 'WebPageBuilderTool']) {
            expect(SRC('modules', 'tools', 'definitions', `${f}.ts`)).toContain('broadcastTerminalLine(');
        }
        expect(SRC('modules', 'services', 'ToolService.ts')).toContain('broadcastTerminalLine(');
        // The observer hook exists because a proof needs it — and that proof uses it.
        expect(ws).toContain('export function observeBroadcasts');
        expect(fs.readFileSync(path.join(__dirname, '..', 'tests', 'manual', 'verify_build_e2e.ts'), 'utf-8'))
            .toContain('observeBroadcasts(');
    });

    it('the surgical editor is wired to the SAME audit engine the builder uses', () => {
        const edit = SRC('modules', 'tools', 'definitions', 'ProjectEditTool.ts');
        const build = SRC('modules', 'tools', 'definitions', 'ReactProjectTool.ts');
        expect(edit).toContain('app-audit');
        expect(build).toContain('app-audit');
        expect(edit).toContain('auditBuiltApp');
    });

    it('the local-brain breaker is consumed by the code that pays its cost', () => {
        expect(SRC('core', 'agents', 'narrator.ts')).toContain('isLocalBrainOpen');
        const router = SRC('core', 'llm', 'intelligent-router.ts');
        expect(router).toContain('export function isLocalBrainOpen');
        expect(router).toContain('noteLocalBrainTimeout()');
        expect(router).toContain('noteLocalBrainOk()');
    });
});

/**
 * The generated app is held to the same rule: a section component written to
 * disk that App.jsx never imports is the same «added and thrown» defect,
 * shipped to the user's own project.
 */
describe('a generated project imports and renders everything it writes', () => {
    const { ReactProjectTool, sectionsForKind } = require('../modules/tools/definitions/ReactProjectTool');
    const os = require('os');
    let out: any, root: string;
    beforeAll(async () => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-wirepolicy-'));
        out = await new ReactProjectTool().execute(
            { request: 'ابنِ متجر react للعطور', root, skipInstall: true }, { sessionId: 'wire-policy' });
    });
    afterAll(() => { fs.rmSync(root, { recursive: true, force: true }); delete (global as any).joeProjects?.['wire-policy']; });

    it('every section is written, imported AND rendered', () => {
        const app = fs.readFileSync(path.join(out.output.path, 'src', 'App.jsx'), 'utf-8');
        const shipped = fs.readdirSync(path.join(out.output.path, 'src', 'components')).map(f => f.replace('.jsx', ''));
        for (const s of sectionsForKind('store')) {
            expect(shipped).toContain(s);
            expect(app).toContain(`import ${s} from './components/${s}.jsx'`);
            expect(app).toContain(`<${s} content={content} />`);
        }
    });

    it('no component ships without a user — nothing is thrown into the folder', () => {
        const app = fs.readFileSync(path.join(out.output.path, 'src', 'App.jsx'), 'utf-8');
        const shipped = fs.readdirSync(path.join(out.output.path, 'src', 'components')).map(f => f.replace('.jsx', ''));
        const sections: string[] = sectionsForKind('store');
        for (const c of shipped) {
            const used = sections.includes(c) || app.includes(`<${c} `)
                || ['Navbar', 'Footer'].includes(c)
                // OrderButton and ProductView are imported BY other components.
                || ['OrderButton', 'ProductView'].some(x => x === c);
            expect({ component: c, used }).toEqual({ component: c, used: true });
        }
    });
});
