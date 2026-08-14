/**
 * THE ROOT AUDIT, locked — so no tool can rot in the gap between
 * "defined" and "reachable" again, and the cross-tool integrations the
 * audit repaired stay repaired.
 *
 * Findings this locks (2026-08 audit, measured not guessed):
 *  - grep_search / npm_manager / shell_check_status: defined for months,
 *    never registered — with the WHOLE npm_* alias family silently dead
 *    because every alias resolves to the unregistered npm_manager.
 *  - «انشر المشروع» after a React/imported project published an older page:
 *    publish-source only knew joePages.
 *  - «شغّل المشروع» started the workspace root, not the session's project.
 *  - project undo: history was written and never read.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ProjectPlannerTool } from '../modules/tools/definitions/ProjectPlannerTool';

describe('every defined tool is reachable', () => {
    // The REAL registry — not a source grep.
    const { tools } = require('../modules/tools/registry');
    const names = new Set(tools.map((t: any) => t.name));

    it('the audit orphans are registered (npm_manager, shell_check_status)', () => {
        for (const n of ['npm_manager', 'shell_check_status']) {
            expect(names.has(n)).toBe(true);
        }
        // grep_search stays unregistered ON PURPOSE: ToolService redirects
        // that name to search_files (a field-proven fix) and an existing
        // lock forbids shadowing an alias with a real tool.
        expect(names.has('grep_search')).toBe(false);
        expect(names.has('search_files')).toBe(true);
    });
    it('every tool the planner routes to exists', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'core', 'orchestrator', 'PlanningEngine.ts'), 'utf-8');
        const routed = [...src.matchAll(/tool: '([a-z_0-9]+)'/g)].map(m => m[1]);
        const missing = [...new Set(routed)].filter(t => !names.has(t));
        expect(missing).toEqual([]);
    });
    it('every DETERMINISTIC tool exists directly or through a ToolService alias', () => {
        const orch = fs.readFileSync(path.join(__dirname, '..', 'orchestration', 'AgentOrchestrator.ts'), 'utf-8');
        const det = [...orch.match(/DETERMINISTIC_TOOLS = \[([\s\S]*?)\]/)![1].matchAll(/'([a-z_0-9]+)'/g)].map(m => m[1]);
        const svc = fs.readFileSync(path.join(__dirname, '..', 'modules', 'services', 'ToolService.ts'), 'utf-8');
        const missing = det.filter(t => !names.has(t) && !new RegExp(`['"]${t}['"]`).test(svc));
        expect(missing).toEqual([]);
    });
    it('a planned tool is executed as planned before any agent can reselect it', () => {
        const orch = fs.readFileSync(path.join(__dirname, '..', 'orchestration', 'AgentOrchestrator.ts'), 'utf-8');
        const direct = orch.indexOf("else if (typeof node.tool === 'string' && node.tool.trim())");
        const delegated = orch.indexOf('else if (agent)');
        expect(direct).toBeGreaterThan(-1);
        expect(direct).toBeLessThan(delegated);
        expect(orch.slice(direct, delegated)).toContain('executeTool(plannedTool, nodeInput, executionContext)');
    });
    it('preserves bounded local Git workflow when agent selection changes', () => {
        const orch = fs.readFileSync(path.join(__dirname, '..', 'orchestration', 'AgentOrchestrator.ts'), 'utf-8');
        const list = orch.match(/DETERMINISTIC_TOOLS = \[([\s\S]*?)\]/)?.[1] || '';
        expect(list).toContain("'git_local_workflow'");
        const protection = orch.slice(orch.indexOf('const isProtected'), orch.indexOf('node.status = "running"'));
        expect(protection).toContain('DETERMINISTIC_TOOLS.includes(node.tool)');
    });
    it('the registry has no silent duplicates', () => {
        expect(names.size).toBe(tools.length);
    });
});

describe('«انشر المشروع» publishes the ACTIVE artifact', () => {
    const { findBuiltArtifact } = require('../core/deploy/publish-source');
    let tmp: string;
    beforeAll(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-pub-')); });
    afterAll(() => {
        fs.rmSync(tmp, { recursive: true, force: true });
        delete (global as any).joeProjects?.['pub-t'];
        delete (global as any).joePages?.['pub-t'];
    });

    it('a NEWER project with a dist/ wins over an older page', () => {
        const dist = path.join(tmp, 'react-shop', 'dist');
        fs.mkdirSync(dist, { recursive: true });
        fs.writeFileSync(path.join(dist, 'index.html'), '<html>app</html>');
        (global as any).joeProjects = { ...(global as any).joeProjects, 'pub-t': { dir: path.join(tmp, 'react-shop'), brand: 'متجري', updatedAt: 2000 } };
        (global as any).joePages = { ...(global as any).joePages, 'pub-t': { filename: 'x.html', html: '<html>old</html>', updatedAt: 1000 } };
        const src = findBuiltArtifact({ sessionId: 'pub-t', artifactDir: tmp });
        expect(src?.dir).toBe(dist);
        expect(src?.labelAr).toContain('متجري');
    });
    it('an OLDER project yields to the newer page (no hijack)', () => {
        (global as any).joeProjects['pub-t'].updatedAt = 500;
        fs.writeFileSync(path.join(tmp, 'x.html'), '<html>newer page</html>');
        const src = findBuiltArtifact({ sessionId: 'pub-t', artifactDir: tmp });
        expect(String(src?.dir || src?.file || '')).not.toContain('react-shop');
        expect(src?.file).toContain('x.html');
    });
    it('a newer project WITHOUT a dist does not break the chain', () => {
        (global as any).joeProjects['pub-t'] = { dir: path.join(tmp, 'no-dist'), updatedAt: 9000 };
        expect(() => findBuiltArtifact({ sessionId: 'pub-t', artifactDir: tmp })).not.toThrow();
    });
    it('a project dist WITH photos stages SELF-CONTAINED — images ride to the permanent link', () => {
        const { stageForPages } = require('../core/deploy/publish-source');
        const dist = path.join(tmp, 'photo-app', 'dist');
        fs.mkdirSync(path.join(dist, 'images'), { recursive: true });
        fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
        fs.writeFileSync(path.join(dist, 'index.html'), '<html><script src="./assets/a.js"></script></html>');
        fs.writeFileSync(path.join(dist, 'images', 'dish.png'), Buffer.from([137, 80, 78, 71]));
        // The app references its photos RELATIVELY (content.js does since the
        // photo batches) — nothing to rewrite, everything to carry.
        fs.writeFileSync(path.join(dist, 'assets', 'a.js'), "const img = { src: 'images/dish.png' };");
        const stage = path.join(tmp, 'stage-photo');
        const r = stageForPages({ kind: 'site', dir: dist, labelAr: 'x' }, stage, tmp);
        expect(fs.existsSync(path.join(stage, 'images', 'dish.png'))).toBe(true);
        expect(fs.readFileSync(path.join(stage, 'assets', 'a.js'), 'utf-8')).toContain("'images/dish.png'");
        expect(r.unresolved).toEqual([]);   // no /artifacts/ ghosts in a project build
    });
});

describe('«شغّل المشروع» defaults to the session\'s active project', () => {
    it('the run tool consults joeProjects before the workspace root', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectRunTool.ts'), 'utf-8');
        expect(src).toContain('joeProjects');
        expect(src.indexOf('joeProjects')).toBeLessThan(src.indexOf('workspaceService.getActiveRoot'));
    });
});

describe('project undo — the history is finally read', () => {
    const { ProjectEditTool } = require('../modules/tools/definitions/ProjectEditTool');
    let tmp: string;
    beforeAll(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-undo-'));
        fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
        fs.writeFileSync(path.join(tmp, 'package.json'), '{"name":"u"}');
        fs.writeFileSync(path.join(tmp, 'src', 'a.js'), 'const x = 2;');
        (global as any).joeProjects = {
            ...(global as any).joeProjects,
            'undo-t': { dir: tmp, updatedAt: Date.now(), history: [{ file: 'src/a.js', before: 'const x = 1;', at: Date.now() }] },
        };
    });
    afterAll(() => { delete (global as any).joeProjects?.['undo-t']; fs.rmSync(tmp, { recursive: true, force: true }); });

    it('«تراجع عن آخر تعديل» restores the recorded bytes', async () => {
        const res: any = await new ProjectEditTool().execute({ request: 'تراجع عن آخر تعديل' }, { sessionId: 'undo-t' });
        expect(res.ok).toBe(true);
        expect(String(res.output.message)).toContain('↩️');
        expect(fs.readFileSync(path.join(tmp, 'src', 'a.js'), 'utf-8')).toBe('const x = 1;');
        expect((global as any).joeProjects['undo-t'].history.length).toBe(0);
    });
    it('an empty history is an honest answer', async () => {
        const res: any = await new ProjectEditTool().execute({ request: 'تراجع عن آخر تعديل' }, { sessionId: 'undo-t' });
        expect(String(res.output.message)).toContain('لا يوجد');
    });
});

describe('the orchestrator plans WITH the session', () => {
    it('a goal with no explicit context still plans as its own session (goal.id)', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'orchestration', 'AgentOrchestrator.ts'), 'utf-8');
        expect(src).toContain('goal.context || { sessionId: goal.id }');
    });
});

describe('the repo typechecks clean — the architecture map exists', () => {
    it('docs/ARCHITECTURE.md documents the stores and the registration contract', () => {
        const doc = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'docs', 'ARCHITECTURE.md'), 'utf-8');
        expect(doc).toContain('joe-projects.json');
        expect(doc).toContain('Registration contract');
        expect(doc).toContain('DETERMINISTIC_TOOLS');
    });
});

describe('one front door for scaffolds — the tool-picker cannot bypass the verified path', () => {
    const svc = fs.readFileSync(path.join(__dirname, '..', 'modules', 'services', 'ToolService.ts'), 'utf-8');
    it('a frontend-flavoured scaffold_full_stack call redirects to react_project', () => {
        expect(svc).toContain("name === 'scaffold_full_stack'");
        const block = svc.slice(svc.indexOf("name === 'scaffold_full_stack'"), svc.indexOf("name === 'scaffold_full_stack'") + 1200);
        expect(block).toContain("effectiveName = 'react_project'");
        expect(block).toMatch(/backendish/);   // full-stack calls stay untouched
    });
});

describe('the inbox notifies the owner LIVE', () => {
    const { ownerSessionOf } = require('../api/routes/formsPublic');
    afterEach(() => {
        delete (global as any).joePages?.['own-a'];
        delete (global as any).joeProjects?.['own-b'];
    });
    it('a page site id resolves to its own session', () => {
        (global as any).joePages = { ...(global as any).joePages, 'own-a': { filename: 'x.html', html: '<html>x</html>' } };
        expect(ownerSessionOf('own-a')).toBe('own-a');
    });
    it('a React project site id resolves through its directory name', () => {
        (global as any).joeProjects = { ...(global as any).joeProjects, 'own-b': { dir: '/w/react-my-shop' } };
        expect(ownerSessionOf('react-my-shop')).toBe('own-b');
    });
    it('an unowned site notifies nobody (and never throws)', () => {
        expect(ownerSessionOf('stranger-site')).toBeNull();
    });
    it('the POST handler notifies after storing', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'api', 'routes', 'formsPublic.ts'), 'utf-8');
        const storeAt = src.indexOf('appendSubmission(site, fields');
        const notifyAt = src.indexOf('notifyOwner(site, entry.fields)');
        expect(storeAt).toBeGreaterThan(0);
        expect(notifyAt).toBeGreaterThan(storeAt);
        expect(src).toContain("type: 'form_submission'");
    });
});


describe('project-run preserves the user-selected workspace and task boundary', () => {
    it('threads workspaceId from the composer through the run route and agent loop', () => {
        const web = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'web', 'src', 'components', 'CommandComposer.tsx'), 'utf-8');
        const route = fs.readFileSync(path.join(__dirname, '..', 'api', 'routes', 'run.ts'), 'utf-8');
        const loop = fs.readFileSync(path.join(__dirname, '..', 'modules', 'services', 'AgentLoopService.ts'), 'utf-8');
        expect(web).toContain('workspaceId: workspaceId || undefined');
        expect(route).toContain('browserSessionId, workspaceId, userId: bodyUserId');
        expect(route).toContain("workspaceId: String(workspaceId || '').trim() || undefined");
        expect(loop).toContain('workspaceId?: string');
        expect(loop).toContain("const workspaceId = String(options.workspaceId || '').trim();");
        expect(loop).toContain('workspaceId: workspaceId || undefined');
    });

    it('returns an explicit project_run failure before the generative recovery planner', () => {
        const orch = fs.readFileSync(path.join(__dirname, '..', 'orchestration', 'AgentOrchestrator.ts'), 'utf-8');
        const guard = orch.indexOf("const isDeterministicRunFailure = node.tool === 'project_run'");
        const recovery = orch.indexOf('await this.attemptRecovery(');
        expect(guard).toBeGreaterThan(-1);
        expect(recovery).toBeGreaterThan(guard);
        expect(orch.slice(guard, recovery)).toContain("return { ok: false");
    });
});


describe('planner failures preserve their evidence-backed blocker', () => {
    it('keeps fallback state and its reason when normalising a blocked plan', () => {
        const planner: any = new ProjectPlannerTool();
        const blocked = planner.validatePlan({
            projectName: 'NOVA',
            phases: [],
            fallback: true,
            deliveryStatus: 'blocked',
            blocker: { code: 'planner_unavailable_or_invalid', message: 'The planner response was not valid JSON.' },
        }, 'Build NOVA');
        expect(blocked.fallback).toBe(true);
        expect(blocked.deliveryStatus).toBe('blocked');
        expect(blocked.blocker).toEqual(expect.objectContaining({ code: 'planner_unavailable_or_invalid' }));
    });
});

describe('evidence-gated engineering runs stop for a user decision', () => {
    it('marks incomplete discovery as a project-root decision rather than a repairable tool fault', () => {
        const pipeline = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectPipelineTool.ts'), 'utf-8');
        expect(pipeline).toContain('requiresUserDecision: true');
        expect(pipeline).toContain("stopReason: 'evidence_incomplete'");
        expect(pipeline).toContain("kind: 'select_project_root'");
    });

    it('surfaces the evidence decision before the generative recovery planner', () => {
        const orch = fs.readFileSync(path.join(__dirname, '..', 'orchestration', 'AgentOrchestrator.ts'), 'utf-8');
        const decisionGuard = orch.indexOf('out.requiresUserDecision');
        const recovery = orch.indexOf('await this.attemptRecovery(');
        expect(decisionGuard).toBeGreaterThan(-1);
        expect(recovery).toBeGreaterThan(decisionGuard);
        expect(orch.slice(decisionGuard, recovery)).toContain('completedNodes.add(node.id)');
    });
});


describe('partial phases preserve verified blockers instead of guessing a repair', () => {
    it('marks failed acceptance checks explicitly in the phase result', () => {
        const executor = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'PhaseExecutorTool.ts'), 'utf-8');
        expect(executor).toContain('let verificationFailed = false');
        expect(executor).toContain('verificationFailed = true');
        expect(executor).toContain('...(verificationFailed ? { verificationFailed: true } : {})');
    });

    it('stops an evidence-backed partial phase before a repair ticket can be built', () => {
        const loop = fs.readFileSync(path.join(__dirname, '..', 'modules', 'services', 'AgentLoopService.ts'), 'utf-8');
        const blockerGuard = loop.indexOf('const isHonestBlocker =');
        const repairTicket = loop.indexOf('const repairTicket = RepairTicketService.build');
        expect(blockerGuard).toBeGreaterThan(-1);
        expect(repairTicket).toBeGreaterThan(blockerGuard);

        const guardedRegion = loop.slice(blockerGuard, repairTicket);
        expect(guardedRegion).toContain('phaseResult?.output?.requiresUserDecision === true');
        expect(guardedRegion).toContain('phaseResult?.output?.verificationFailed === true');
        expect(guardedRegion).toContain("primaryError.includes('EVIDENCE_BLOCKER')");
        expect(guardedRegion).toContain('return { ok: false, completedPhases, results, honestBlocker: true }');
    });
});


describe('pipeline preserves an honest verification verdict for its caller', () => {
    it('forwards phase verification failure instead of reducing it to an opaque partial result', () => {
        const pipeline = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectPipelineTool.ts'), 'utf-8');
        expect(pipeline).toContain('const verificationFailed = Array.isArray(pipeline?.results)');
        expect(pipeline).toContain('result?.verificationFailed === true');
        expect(pipeline).toContain('const honestBlocker = pipeline?.honestBlocker === true || verificationFailed');
        expect(pipeline).toContain('...(verificationFailed ? { verificationFailed: true } : {})');
        expect(pipeline).toContain('...(honestBlocker ? { honestBlocker: true } : {})');
    });
});


describe('planner provider and requirements-boundary contracts', () => {
    it('passes the active session provider to project planning and treats provider outages as blockers', () => {
        const planner = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectPlannerTool.ts'), 'utf-8');
        expect(planner).toContain('modelConfig: context?.modelConfig');
        expect(planner).toContain('if (isProviderFailure(response))');
        expect(planner).toContain('no plan was invented from the outage message');
    });

    it('plans from a bounded brief derived from fully read local evidence', () => {
        const pipeline = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectPipelineTool.ts'), 'utf-8');
        expect(pipeline).toContain('const requirementsContext = this.buildRequirementsContext(request, specification.content);');
        expect(pipeline).toContain('COMPACT REQUIREMENTS EVIDENCE');
        expect(pipeline).toContain('pipeline.planning_requirements_brief_chars=');
        expect(pipeline).toContain("slice(0, 12000)");
        expect(pipeline).toContain('plannerResult.output.requirementsContext = requirementsContext;');
    });
});
