/**
 * THE BACKEND FRONT, locked — api_project scaffolds a runnable Express API
 * over a real zero-native-dependency database (node:sqlite, or a JSON store
 * with the identical interface on older runtimes).
 *
 * These locks pin: the tool is registered and deterministically reachable,
 * the planner routes explicit backend asks to it (and does NOT steal
 * frontend or full-stack asks), the offline scaffold is complete and parses,
 * and the resources are kind-aware — a restaurant's API serves dishes, a
 * store's serves products. The live boot/write/read proof runs in
 * src/tests/manual/verify_api_project.ts against real processes.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import { ApiProjectTool, apiResourceForKind } from '../modules/tools/definitions/ApiProjectTool';
import { syntaxOk } from '../modules/tools/definitions/ProjectEditTool';

const FALLTHROUGH = 'llm-fallthrough';
const route = async (goal: string): Promise<string> => {
    const p = PlanningEngine.generatePlan(
        { intent: { goal, complexity: 'medium', riskLevel: 'low', rawIntent: {} } as any },
    ).then(x => x.steps[0].tool).catch(() => FALLTHROUGH);
    return Promise.race([p, new Promise<string>(r => setTimeout(() => r(FALLTHROUGH), 1500))]);
};

describe('api_project is registered and reachable', () => {
    it('the registry carries it; the orchestrator runs it deterministically', () => {
        const { tools } = require('../modules/tools/registry');
        expect(tools.some((t: any) => t.name === 'api_project')).toBe(true);
        const orch = fs.readFileSync(path.join(__dirname, '..', 'orchestration', 'AgentOrchestrator.ts'), 'utf-8');
        expect(orch.match(/DETERMINISTIC_TOOLS = \[([\s\S]*?)\]/)![1]).toContain("'api_project'");
    });
});

describe('routing — explicit backend asks reach api_project', () => {
    it('«ابنِ لي API لإدارة الطلبات» → api_project', async () => {
        expect(await route('ابنِ لي API لإدارة الطلبات')).toBe('api_project');
    });
    it('«اعمل باك اند بقاعدة بيانات للمخزون» → api_project', async () => {
        expect(await route('اعمل باك اند بقاعدة بيانات للمخزون')).toBe('api_project');
    });
    it('a request that ALSO names a frontend keeps its richer path', async () => {
        expect(await route('ابنِ لي متجر react مع قاعدة بيانات')).not.toBe('api_project');
    });
    it('a plain site request never lands on the backend tool', async () => {
        expect(await route('ابن لي موقع لمطعم')).not.toBe('api_project');
    });
});

describe('the offline scaffold — complete, parseable, kind-aware', () => {
    let tmp: string;
    beforeAll(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-api-')); });
    afterAll(() => {
        fs.rmSync(tmp, { recursive: true, force: true });
        delete (global as any).joeProjects?.['api-t'];
    });

    it('a restaurant API serves DISHES with seeded rows; every file parses', async () => {
        const res: any = await new ApiProjectTool().execute(
            { request: 'ابنِ لي API لإدارة أطباق مطعم الشواء', skipInstall: true, root: tmp }, { sessionId: 'api-t' });
        expect(res.ok).toBe(true);
        expect(res.output.resource).toBe('dishes');
        const proj = res.output.path;
        for (const f of ['package.json', 'server.js', 'db.js', 'seed.js', 'README.md', '.gitignore']) {
            expect(fs.existsSync(path.join(proj, f))).toBe(true);
        }
        for (const f of ['server.js', 'db.js', 'seed.js']) {
            const gate = syntaxOk(f, fs.readFileSync(path.join(proj, f), 'utf-8'));
            expect(`${f}:${gate.ok}`).toBe(`${f}:true`);
        }
        const pkg = JSON.parse(fs.readFileSync(path.join(proj, 'package.json'), 'utf-8'));
        expect(pkg.dependencies.express).toBeTruthy();
        expect(pkg.scripts.start).toBe('node server.js');
        expect(fs.readFileSync(path.join(proj, 'seed.js'), 'utf-8')).toContain('مشاوي مشكلة');
        expect(fs.readFileSync(path.join(proj, 'README.md'), 'utf-8')).toContain('/api/dishes');
        // The database files never reach git.
        expect(fs.readFileSync(path.join(proj, '.gitignore'), 'utf-8')).toMatch(/data\.db[\s\S]*data\.json/);
        // The scaffold registers as the session's active project (type api).
        expect((global as any).joeProjects['api-t'].type).toBe('api');
    });

    it('the kind map: store → products, generic → items — with distinct seeds', () => {
        expect(apiResourceForKind('store' as any, true).resource).toBe('products');
        expect(apiResourceForKind('restaurant' as any, true).resource).toBe('dishes');
        expect(apiResourceForKind('generic' as any, true).resource).toBe('items');
        expect(apiResourceForKind('store' as any, true).seeds.some(s => s.name === 'طقم الهدية')).toBe(true);
    });

    it('db.js is the dual-backend contract: sqlite first, same-interface JSON fallback, honest health', async () => {
        const res: any = await new ApiProjectTool().execute(
            { request: 'build an api for inventory', skipInstall: true, root: tmp }, { sessionId: 'api-t' });
        const db = fs.readFileSync(path.join(res.output.path, 'db.js'), 'utf-8');
        expect(db).toContain("await import('node:sqlite')");
        expect(db).toContain('JOE_FORCE_JSON_DB');
        expect(db).toContain("backend: 'json'");
        for (const method of ['list:', 'get:', 'create:', 'update:', 'remove:', 'count:']) {
            expect((db.match(new RegExp(method.replace(':', ': '), 'g')) || []).length).toBe(2);   // once per backend
        }
        const server = fs.readFileSync(path.join(res.output.path, 'server.js'), 'utf-8');
        expect(server).toContain('/api/health');
        expect(server).toContain("error: 'name_required'");
        expect(server).toContain('404');
    });
});
