/**
 * THE MYBUDGET FIELD RUN — three guarantees written in its blood.
 *
 * The user asked, in English, for a complete expense-tracker web application
 * and watched an empty preview for six minutes. The planner answered
 * confidently with five template phases — Technical Stack, Database, Business
 * Logic, Testing, Deployment — every task an ai_write_file with a bare path.
 * Ten loose .ts files and then a package.json landed in the WORKSPACE ROOT
 * beside twenty-four real projects; the runtime binding adopted the root as
 * «the project»; npm refused the LLM-authored manifest with ERESOLVE and the
 * self-healer repeated the same command byte for byte; and the delivery gate
 * finally said, honestly, that no runnable MyBudget existed.
 *
 * Each test below pins one of the seams that failure walked through.
 */
import fs from 'fs';
import path from 'path';
import { sanitisePlanPhases } from '../core/orchestrator/plan-tools';

const SRC = path.join(__dirname, '..');
const read = (...p: string[]) => fs.readFileSync(path.join(SRC, ...p), 'utf-8');

describe('a greenfield build lives in its own directory', () => {
    it('project-shaped relative paths are moved inside the project folder', () => {
        const clean = sanitisePlanPhases([
            {
                phaseNumber: 1,
                name: 'Foundation',
                tasks: [
                    { task: 'manifest', tool: 'ai_write_file', args: { path: 'package.json', description: 'manifest' } },
                    { task: 'entry', tool: 'ai_write_file', args: { path: 'src/main.ts', description: 'entry' } },
                    { task: 'tests', tool: 'ai_write_file', args: { path: 'tests/main.test.ts', description: 'tests' } },
                ],
                verificationTask: { task: 'run', tool: 'project_run', args: {} },
            },
        ], 'MyBudget', { mode: 'greenfield' });
        const paths = clean.phases[0].tasks.map((t: any) => t.args.path);
        expect(paths).toEqual(['MyBudget/package.json', 'MyBudget/src/main.ts', 'MyBudget/tests/main.test.ts']);
        expect(clean.notes.join('\n')).toMatch(/لا يكتب في جذر مساحة العمل/);
    });

    it('a bespoke folder is an intentional location and is left alone', () => {
        const clean = sanitisePlanPhases([
            {
                phaseNumber: 1,
                name: 'Foundation',
                tasks: [
                    { task: 'entry', tool: 'ai_write_file', args: { path: 'billing-service/src/main.ts', description: 'entry' } },
                ],
                verificationTask: { task: 'run', tool: 'project_run', args: {} },
            },
        ], 'MyBudget', { mode: 'greenfield' });
        expect(clean.phases[0].tasks[0].args.path).toBe('billing-service/src/main.ts');
    });

    it('an existing-project plan is never rewritten', () => {
        const clean = sanitisePlanPhases([
            {
                phaseNumber: 1,
                name: 'Patch',
                tasks: [
                    { task: 'entry', tool: 'ai_write_file', args: { path: 'src/main.ts', description: 'patch' } },
                ],
            },
        ], 'MyBudget', { mode: 'existing' });
        expect(clean.phases[0].tasks[0].args.path).toBe('src/main.ts');
    });
});

describe('the workspace root is never a project', () => {
    it('the runtime binding refuses to adopt the root, with its reason written down', () => {
        const p = read('modules', 'tools', 'definitions', 'PhaseExecutorTool.ts');
        expect(p).toMatch(/if \(path\.resolve\(candidate\) === workspaceRoot\)/);
        expect(p).toMatch(/refused to bind the workspace root as a project/);
    });
});

describe('a plan made only of paper is not a plan for an application', () => {
    it('the pipeline detects it and falls back to the deterministic chain', () => {
        const p = read('modules', 'tools', 'definitions', 'ProjectPipelineTool.ts');
        expect(p).toMatch(/const CAN_BUILD_OR_RUN = new Set\(/);
        expect(p).toMatch(/the plan is all paper/);
        // Gated exactly like the two earlier rescues: a new build, rescue allowed,
        // and never re-judging a plan the deterministic chain itself produced.
        expect(p).toMatch(/plannerResult\?\.output\?\.deterministic !== true/);
        expect(p).toMatch(/evidence\?\.constraints\?\.createsNewProject/);
    });
});

describe('npm speaks with the flag the rest of the repository uses', () => {
    it('npm_manager installs with --legacy-peer-deps', () => {
        const p = read('modules', 'tools', 'definitions', 'SystemTools.ts');
        expect(p).toMatch(/args\.push\('--legacy-peer-deps'\)/);
    });
    it('and the self-healer does not repeat the refused command byte for byte', () => {
        const p = read('modules', 'services', 'SelfFixService.ts');
        expect(p).toMatch(/npm install --no-audit --no-fund --legacy-peer-deps && npm run --if-present build/);
    });
});

describe('a quoted name after «called» is the whole name', () => {
    // «called "MyBudget". Requirements: a clean…» shipped as the brand
    // «MyBudget Requirements a clean» — title, header and folder name.
    it('the quotes say where the name ends', () => {
        const { brandFrom } = require('../core/design/page-head');
        expect(brandFrom('Build an expense tracker web application called "MyBudget". Requirements: a clean dashboard')).toBe('MyBudget');
        expect(brandFrom('a site for a bakery named Golden Crust. It should have a menu')).toBe('Golden Crust');
        expect(brandFrom('ابن لي موقعاً لمطعم اسمه «بيت المشاوي» مع قائمة')).toBe('بيت المشاوي');
    });
});

describe('an idle browser session dies once, quietly', () => {
    /**
     * Fifteen minutes after the panel was last touched, Joe died — on every
     * machine, the user's included, at ~1000s uptime with a 1.5GB heap. The
     * heap snapshot at the crash held 13,805 identical Playwright stacks
     * («storageState ← saveBrowserSession ← stopSession ← Timeout._onTimeout»)
     * and 13,803 queued Immediates: stopSession re-inserted the dying session
     * into the live Map so the by-id save could find it, the cleanup loop was
     * iterating that same Map, and a re-inserted entry goes to the tail of the
     * live iterator — an infinite stop-save-stop cycle, thousands per second.
     * Measured after the fix: four 60-second cleanup windows, RSS flat.
     */
    it('the cleanup loop iterates a snapshot, never the live map', () => {
        const m = read('modules', 'browser', 'manager.ts');
        expect(m).toMatch(/for \(const \[sid, s\] of \[\.\.\.sessions\.entries\(\)\]\)/);
    });
    it('and stopSession saves from the object without re-inserting into the map', () => {
        const m = read('modules', 'browser', 'manager.ts');
        expect(m).toMatch(/await saveSessionStateOf\(sid, s\)/);
        expect(m).not.toMatch(/sessions\.set\(sid, s\); await saveBrowserSession/);
    });
});
