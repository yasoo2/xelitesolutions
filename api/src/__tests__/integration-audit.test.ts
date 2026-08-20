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
import { ProjectPipelineTool } from '../modules/tools/definitions/ProjectPipelineTool';
import { canBindRuntimeProjectEvidence, classifyStructuredRuntimeEvidence, projectRootFromWrittenFile } from '../modules/tools/definitions/PhaseExecutorTool';
import { resolveRunnableProject } from '../modules/tools/definitions/ProjectRunTool';
import { requestFidelityMismatch } from '../modules/tools/definitions/ReactProjectTool';
import { hasRequestFidelityMismatch } from '../modules/tools/definitions/ProjectPipelineTool';
import { blueprintFor, detectAppKind } from '../core/design/app-blueprints';

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

describe('greenfield runtime evidence binds the artifact before its manifest', () => {
    let tmp: string;
    let project: string;

    beforeAll(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-runtime-binding-'));
        project = path.join(tmp, 'TaskFlow AI');
        fs.mkdirSync(path.join(project, 'src'), { recursive: true });
        fs.writeFileSync(path.join(project, 'src', 'server.js'), 'require("http").createServer((req,res)=>res.end("ok")).listen(process.env.PORT || 3000);');
    });

    afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

    it('binds a named child from a server-shaped write before package.json exists', () => {
        expect(projectRootFromWrittenFile('TaskFlow AI/src/server.js', tmp, 'TaskFlow AI')).toBe(project);
        expect(fs.existsSync(path.join(project, 'package.json'))).toBe(false);
    });

    it('does not bind a browser App.tsx write as a pre-manifest runtime project', () => {
        const appFile = path.join(project, 'src', 'App.tsx');
        fs.writeFileSync(appFile, 'export default function App() { return null; }');
        expect(projectRootFromWrittenFile('TaskFlow AI/src/App.tsx', tmp, 'TaskFlow AI')).toBe('');
    });

    it('binds only evidence-backed incomplete artifacts and never the workspace root', () => {
        expect(canBindRuntimeProjectEvidence(project, tmp, project, false)).toBe(true);
        expect(canBindRuntimeProjectEvidence(project, tmp, '', false)).toBe(false);
        expect(canBindRuntimeProjectEvidence(tmp, tmp, project, false)).toBe(false);
        expect(canBindRuntimeProjectEvidence(project, tmp, '', true)).toBe(true);
    });

    it('resolves the same source-entrypoint project by its explicit name', () => {
        expect(resolveRunnableProject(tmp, '"TaskFlow AI"')).toMatchObject({ cwd: project, matched: true });
    });
});

describe('stale runtime evidence stays metadata-only', () => {
    it('preserves a runtime-contract diagnostic while classifying stale evidence structurally', () => {
        const projectRoot = '/workspace/WeatherGo';
        const manifest = `${projectRoot}/package.json`;
        const diagnostic = `runtime_contract_mismatch: ${projectRoot}/src/App.jsx imports undeclared package(s): react [verified root: ${projectRoot}; manifest: ${manifest}]. Update the project manifest only when necessary.`;
        const classification = classifyStructuredRuntimeEvidence(
            { error: diagnostic, evidenceStatus: 'stale_run_dropped' },
            {},
            { projectRoot, projectRootRuntimeBound: true, runId: 'run-current', workspaceId: 'workspace-test' },
            'run-current',
        );

        expect(classification.evidenceStatus).toBe('stale_run_dropped');
        expect(classification.staleEvidence).toBe(diagnostic);
        expect(classification.staleEvidence).toContain('imports undeclared package(s): react');
        expect(classification.staleEvidence).toContain(`manifest: ${manifest}`);
        expect(classification.staleEvidence).not.toContain('STALE_RUN_EVIDENCE_DROPPED');

        const fresh = classifyStructuredRuntimeEvidence(
            { error: diagnostic },
            { runId: 'run-current' },
            { projectRoot, projectRootRuntimeBound: true, runId: 'run-current', workspaceId: 'workspace-test' },
            'run-current',
        );
        expect(fresh).toEqual({ evidenceStatus: 'current_run' });
    });

    it('does not retain the old prose rewriter in the phase failure path', () => {
        const phaseExecutor = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'PhaseExecutorTool.ts'), 'utf8');
        expect(phaseExecutor).toContain('const currentRunError = errMsg;');
        expect(phaseExecutor).not.toContain('rebaseStaleRuntimeEvidenceText(');
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

    it('carries structured fidelity repair routing without inventing a file target', () => {
        const react = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf-8');
        const executor = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'PhaseExecutorTool.ts'), 'utf-8');
        const ticket = fs.readFileSync(path.join(__dirname, '..', 'modules', 'services', 'RepairTicketService.ts'), 'utf-8');
        expect(react).toContain("repairKind: 'regenerate_engine'");
        expect(react).toContain('fidelityMismatch ?');
        expect(executor).toContain("failedOutput.repairKind === 'regenerate_engine'");
        expect(executor).toContain("repairKind === 'code_fix' && typeof failedOutput.repairFile === 'string'");
        expect(ticket).toContain("repairKind?: 'regenerate_engine' | 'code_fix'");
        expect(ticket).toContain('repairKind === \'code_fix\' && typeof t?.repairFile === \'string\'');
    });

    it('passes compact requirements evidence into builder requests without duplicating it', () => {
        const executor = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'PhaseExecutorTool.ts'), 'utf-8');
        expect(executor).toContain("['api_project', 'react_project'].includes(toolName)");
        expect(executor).toContain('planned.request = taskRequest');
        expect(executor).toContain("const evidenceMarker = 'COMPACT REQUIREMENTS EVIDENCE'");
    });

    it('routes actionable build/lint evidence to self-fix while preserving honest blockers', () => {
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
        expect(loop).toContain('const hasActionableEvidence =');
        expect(loop).toContain('const isLocalImportError = /unresolved_local_import/i.test(evidenceText);');
        expect(loop).toContain('const explicitNonRepairableEvidence =');
        expect(loop).toContain('\\btoken\\b');
        expect(loop).toContain("const staleRunEvidence = failedEvidence.some((r: any) => r?.evidenceStatus === 'stale_run_dropped')");
        expect(loop).toContain('/stale_run_evidence_dropped|STALE_RUN_EVIDENCE_DROPPED/i.test(evidenceText)');
        expect(loop).toContain('const nonRepairableEvidence = staleRunEvidence || explicitNonRepairableEvidence || (!isLocalImportError && permissionEvidence);');
        expect(loop).toContain('unresolved_local_import|runtime_contract_mismatch');
        expect(loop).toContain('r?.toolName || r?.name || r?.operation');
        expect(loop).toContain('r?.errorMessage ||');
        expect(loop).toContain('const phaseResultForRepair =');
        expect(loop).toContain('phaseResult: phaseResultForRepair');
    });
});


describe('pipeline preserves an honest verification verdict for its caller', () => {
    it('forwards phase verification failure instead of reducing it to an opaque partial result', () => {
        const pipeline = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectPipelineTool.ts'), 'utf-8');
        expect(pipeline).toContain('const requestFidelityMismatch = hasRequestFidelityMismatch(pipeline?.results)');
        expect(pipeline).toContain('const verificationFailed = requestFidelityMismatch || (Array.isArray(pipeline?.results)');
        expect(pipeline).toContain('result?.verificationFailed === true');
        expect(pipeline).toContain('const partialDelivery = !requestFidelityMismatch &&');
        expect(pipeline).toContain('const honestBlocker = pipeline?.honestBlocker === true || verificationFailed');
        expect(pipeline).toContain('...(verificationFailed ? { verificationFailed: true } : {})');
        expect(pipeline).toContain('let finalHonestBlocker = honestBlocker');
        expect(pipeline).toContain('...(finalHonestBlocker ? { honestBlocker: true } : {})');
    });
});


describe('planner provider and requirements-boundary contracts', () => {
    it('passes the active session provider to project planning and bounds provider-outage recovery', () => {
        const planner = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectPlannerTool.ts'), 'utf-8');
        expect(planner).toContain('modelConfig: context?.modelConfig');
        expect(planner).toContain('if (isProviderFailure(response))');
        expect(planner).toContain('context?.engineeringPipeline === true');
        expect(planner).toContain('createCompactRecoveryPlanningPrompt');
        expect(planner).toContain('no plan was invented from the outage message');
    });

    it('plans from a bounded brief derived from fully read local evidence', () => {
        const pipeline = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectPipelineTool.ts'), 'utf-8');
        expect(pipeline).toContain('const requirementsContext = this.buildRequirementsContext(productRequest, specification.content);');
        expect(pipeline).toContain('const productRequest = this.extractEmbeddedProductRequest(request);');
        expect(pipeline).toContain('projectPath ? { request: productRequest, path: projectPath } : { request: productRequest }');
        expect(pipeline).toContain('COMPACT REQUIREMENTS EVIDENCE');
        expect(pipeline).toContain('pipeline.planning_requirements_brief_chars=');
        expect(pipeline).toContain("slice(0, 12000)");
        expect(pipeline).toContain('plannerResult.output.requirementsContext = requirementsContext;');
        expect(pipeline).toContain('deterministicRescueForDeadPlanner(productRequest)');
        expect(pipeline).toContain('deterministicPhasesFor(productRequest)');
        expect(pipeline).toContain('const rescue = deterministicRescueForDeadPlanner(productRequest) ? deterministicPhasesFor(productRequest) : null;');
        expect(pipeline).toContain('deterministicRescueAllowed(productRequest) || requiresConcreteUiBuilder');
        expect(pipeline).not.toContain('deterministicRescueForDeadPlanner(request)');
        expect(pipeline).not.toContain('&& deterministicRescueAllowed(request))');
        expect(pipeline).not.toContain('const rescue = deterministicPhasesFor(request);');
        expect(pipeline).toContain('applyProjectQualityContractOutcome(liveSourceRoot || liveRuntimeRoot, productRequest, liveOutcome);');
        expect(pipeline).toContain('applyScopeAuditOutcome(productRequest, liveAuditRoots, qualityCheckedLiveOutcome);');
        expect(pipeline).toContain('applyProjectQualityContractOutcome(artifactRoot || scopeRetryRuntimeRoot, productRequest, scopeRetryLive);');
        expect(pipeline).toContain('applyScopeAuditOutcome(productRequest, scopeRetryAuditRoots, qualityCheckedScopeRetry);');
        expect(pipeline).toContain('`Original build request: ${productRequest.slice(0, 1200)}`,');
    });

    it('extracts only an explicitly delimited embedded product prompt', () => {
        const pipelineTool = new ProjectPipelineTool();
        const raw = [
            'You are evaluating Joe.',
            'Do not build this harness.',
            'Give Joe this EXACT prompt:',
            '------------------------------------------------------------',
            'Build a complete production-quality web application called:',
            'TaskFlow AI',
            'Implement authentication and a persistent Kanban board with responsive desktop and mobile layouts.',
            'The dashboard must support creating, editing, moving, filtering, and deleting cards with durable state.',
            'Include loading, empty, error, keyboard, accessibility, and dark-mode states with real local verification.',
            'END OF JOE CHALLENGE',
            'Observe the evaluator and write a final report.',
        ].join('\n');
        const extracted = (pipelineTool as any).extractEmbeddedProductRequest(raw);
        expect(extracted).toContain('TaskFlow AI');
        expect(extracted).toContain('persistent Kanban board');
        expect(extracted).not.toContain('You are evaluating Joe');
        expect(extracted).not.toContain('final report');
        expect((pipelineTool as any).extractEmbeddedProductRequest('Build an ordinary app')).toBe('Build an ordinary app');
    });
});


describe('request fidelity blocks a silent engine fallback', () => {
    const weatherRequest = 'Build WeatherGo, a real weather application with city search and a live Open-Meteo forecast.';

    it('accepts a weather blueprint only when the generated source proves a weather engine', () => {
        const kind = detectAppKind(weatherRequest);
        const blueprint = kind ? blueprintFor(kind, weatherRequest, false) : null;
        expect(blueprint?.engine).toBe('weather');
        expect(requestFidelityMismatch(blueprint, [
            'export default function WeatherApp({ content }) {',
            '  const forecast = fetch("https://api.open-meteo.com/v1/forecast");',
            '  return <section>{temperature}</section>;',
            '}',
        ].join('\n'))).toBe(false);
    });

    it('keeps a deterministic records engine admissible when providers are unavailable', () => {
        const request = 'Build a complete inventory management application with searchable records and CSV export.';
        const kind = detectAppKind(request);
        const blueprint = kind ? blueprintFor(kind, request, false) : null;
        expect(blueprint?.engine).toBe('records');
        expect(requestFidelityMismatch(blueprint, [
            'export default function RecordsApp({ rows }) {',
            '  return <table aria-label="Inventory records">{rows.map(renderRow)}</table>;',
            '}',
        ].join('\n'))).toBe(false);
    });

    it('keeps a generic landing-page request permissive when no app engine was requested', () => {
        const request = 'Build a polished landing page for a design studio with a hero, testimonials, and contact form.';
        expect(detectAppKind(request)).toBeNull();
        expect(requestFidelityMismatch(null, [
            'export default function LandingPage() {',
            '  return <main><h1>Welcome to our beautiful brand</h1></main>;',
            '}',
        ].join('\n'))).toBe(false);
    });

    it('blocks a brochure source and prevents it from riding partial delivery', () => {
        const kind = detectAppKind(weatherRequest);
        const blueprint = kind ? blueprintFor(kind, weatherRequest, false) : null;
        expect(requestFidelityMismatch(blueprint, [
            'export default function LandingPage() {',
            '  return <main><h1>Welcome to our beautiful brand</h1></main>;',
            '}',
        ].join('\n'))).toBe(true);
        expect(hasRequestFidelityMismatch([{
            ok: false,
            error: 'request_fidelity_mismatch',
            output: { delivery: { fidelityMismatch: true } },
        }])).toBe(true);
        expect(hasRequestFidelityMismatch([{
            ok: false,
            error: 'requested_features_not_proven',
            output: { delivery: { fidelityMismatch: false } },
        }])).toBe(false);
    });
});

describe('planner portability recovery preserves executable npm contracts', () => {
    it('removes native package specs without putting prose into npm_manager commands', () => {
        const planner: any = new ProjectPlannerTool();
        const rawPlan = {
            projectName: 'TaskFlow AI',
            phases: [{
                name: 'Foundation',
                tasks: [
                    {
                        tool: 'ai_write_file',
                        task: 'Write the package manifest',
                        args: {
                            path: 'package.json',
                            content: JSON.stringify({
                                scripts: { start: 'node server.js' },
                                dependencies: { express: '^4.0.0', sqlite3: '^5.1.0' },
                            }),
                        },
                    },
                    {
                        tool: 'npm_manager',
                        task: 'Install sqlite3 and express',
                        args: { command: 'npm install sqlite3 express', packages: ['sqlite3', 'express'] },
                    },
                    {
                        tool: 'write_file',
                        task: 'Write the runnable server',
                        args: { path: 'server.js', content: 'console.log("ok")' },
                    },
                ],
            }],
        };

        const portable = planner.rewriteUnportableNativePlan(rawPlan);
        const tasks = portable.phases[0].tasks;
        const manifest = JSON.parse(tasks[0].args.content);

        expect(manifest.dependencies).toEqual({ express: '^4.0.0' });
        expect(tasks[1].args.command).toBe('install express');
        expect(tasks[1].args.packages).toEqual(['express']);
        expect(JSON.stringify(portable)).not.toMatch(/sqlite3/i);
        expect(tasks[2].args.path).toBe('server.js');
    });
});
