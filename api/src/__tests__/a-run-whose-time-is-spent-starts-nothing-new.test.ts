/**
 * A RUN WHOSE TIME IS SPENT STARTS NOTHING NEW, AND NO STEP NARROWS A SHARED WORKSPACE.
 *
 * qa-live17b, 2026-11-12, one workspace, two requests one after the other:
 *
 *   L160 (a car-rental admin): the build node used the whole run budget
 *   (3600 s); the run ended «deadline_exceeded» and the user was told. The
 *   orchestrator loop, still alive behind the finished run, then planned a
 *   13-node repair, scaffolded «car-rental-admin» with the old pipeline, and
 *   that pipeline re-pointed — and persisted — the workspace root to it.
 *
 *   L236 (an electronics store), the next request: its project folder sat
 *   beside «car-rental-admin», no longer inside the workspace root. Every file
 *   and shell tool answered «The project folder is not inside this workspace»,
 *   four times, and the run ended with nothing built.
 */
import fs from 'fs';
import path from 'path';
import { isWithinRoot } from '../modules/tools/path-containment';

const ORCH = fs.readFileSync(path.join(__dirname, '..', 'orchestration', 'AgentOrchestrator.ts'), 'utf-8');
const PIPE = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'WebDevelopmentTools.ts'), 'utf-8');

describe('a run whose time is spent', () => {
    const coordinate = ORCH.slice(ORCH.indexOf('private async coordinate('));

    it('measures its time from the start of the coordination, against the run budget', () => {
        expect(coordinate).toMatch(/const coordinationStartedAt = Date\.now\(\);/);
        expect(coordinate).toMatch(/const runTimeSpent = \(\) => Date\.now\(\) - coordinationStartedAt >= RUN_DEADLINE_MS;/);
    });

    it('starts no further step once it is spent', () => {
        const loop = coordinate.indexOf('while (completedNodes.size < dag.nodes.length) {');
        const check = coordinate.indexOf('if (runTimeSpent())', loop);
        const nextIteration = coordinate.indexOf('iterations++;', loop);
        expect(loop).toBeGreaterThan(-1);
        expect(check).toBeGreaterThan(loop);
        expect(check).toBeLessThan(nextIteration);
        expect(coordinate.slice(check, nextIteration)).toMatch(/return giveUp\(/);
    });

    it('plans no repair once it is spent', () => {
        const recover = coordinate.indexOf('await this.attemptRecovery(');
        const decision = coordinate.lastIndexOf('// [DECISION] Intelligent recovery attempt', recover);
        const check = coordinate.lastIndexOf('if (runTimeSpent())', decision);
        expect(recover).toBeGreaterThan(-1);
        expect(check).toBeGreaterThan(-1);
        expect(check).toBeLessThan(decision);
        expect(coordinate.slice(check, decision)).toMatch(/return \{ ok: false, result: lastNodeError \?\? result\.error, steps: runSteps\(dag\) \};/);
    });
});

describe('a scaffold inside the workspace', () => {
    it('leaves the workspace root where it was', () => {
        const set = PIPE.indexOf('await workspaceService.setActiveRoot(projectPath, workspaceId);');
        const guard = PIPE.lastIndexOf('if (projectPath && workspaceId && !isGitHubWorkspace && !alreadyInside) {', set);
        expect(set).toBeGreaterThan(-1);
        expect(guard).toBeGreaterThan(-1);
        expect(PIPE.slice(guard, set)).not.toMatch(/\}\s*\n\s*if \(/);
        expect(PIPE).toMatch(/isWithinRoot\(projectPath, repoRoot \|\| workspaceService\.getActiveRoot\(workspaceId\)\)/);
    });

    it('is told apart from a project elsewhere by the shared containment rule', () => {
        const home = path.resolve('/joe/data/projects/ws1');
        expect(isWithinRoot(path.join(home, 'car-rental-admin'), home)).toBe(true);
        expect(isWithinRoot(path.resolve('/elsewhere/new-app'), home)).toBe(false);
        //  A sibling that only shares the prefix is elsewhere.
        expect(isWithinRoot(path.resolve('/joe/data/projects/ws1-copy/app'), home)).toBe(false);
    });
});
