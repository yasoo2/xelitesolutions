import fs from 'fs';
import os from 'os';
import path from 'path';
import { ReactProjectTool } from '../modules/tools/definitions/ReactProjectTool';
import { AIGeneratorTool } from '../modules/tools/definitions/AIGeneratorTool';
import { phaseAfterRepair } from '../modules/services/SelfFixExecutionService';

/**
 * Eval round 15, 2026-10-24: after SelfFix repaired a generated engine, the
 * phase rerun skipped react_project so the repair would not be overwritten.
 * The capability and acceptance gates that had blocked delivery live inside
 * react_project, so the rerun was reduced to «npm run build» + a start proof
 * and completed whether or not the repair had added the missing capability.
 * verifyExisting re-runs react_project on the project as it is: nothing is
 * authored, regenerated or repaired, and the same gates decide.
 */
jest.setTimeout(240_000);
const REQUEST = 'Build an admin panel to manage products with name, price and stock, with a summary page showing totals and a chart.';

const roots: string[] = [];
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });

/** Every file in the project except build output and dependencies, with its bytes. */
function snapshot(dir: string): Record<string, string> {
    const out: Record<string, string> = {};
    const walk = (d: string) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            if (e.name === 'node_modules' || e.name === 'dist') continue;
            const full = path.join(d, e.name);
            if (e.isDirectory()) walk(full);
            else out[path.relative(dir, full).replace(/\\/g, '/')] = fs.readFileSync(full, 'utf8');
        }
    };
    walk(dir);
    return out;
}

async function firstBuild(sessionId: string): Promise<{ root: string; proj: string; first: any }> {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-verify-existing-'));
    roots.push(root);
    const first: any = await new ReactProjectTool().execute({ request: REQUEST, root, skipInstall: true }, { sessionId });
    return { root, proj: String(first?.output?.path || ''), first };
}

/** The repair SelfFix would have applied: the missing capabilities, written into the generated view. */
function repairView(proj: string): string {
    const view = ['src/components/RecordsView.jsx', 'src/components/RecordsApp.jsx']
        .map(rel => path.join(proj, rel)).find(file => fs.existsSync(file))!;
    const source = fs.readFileSync(view, 'utf8');
    fs.writeFileSync(view, `${source}\nexport const RepairedSummary = () => (<section aria-label="with a summary page showing totals"><figure aria-label="a chart" /></section>);\n`, 'utf8');
    return view;
}

describe('react_project in verifyExisting mode', () => {
    it('the first build is refused for the capabilities it could not prove', async () => {
        const { first } = await firstBuild('verify-existing-baseline');
        expect(first.ok).toBe(false);
        expect(first.error).toBe('requested_features_not_proven: with a summary page showing totals');
    });

    it('a repaired engine that now has them is accepted — and not one file is written', async () => {
        const sessionId = 'verify-existing-repaired';
        const { root, proj } = await firstBuild(sessionId);
        repairView(proj);
        const before = snapshot(proj);
        const verified: any = await new ReactProjectTool().execute(
            { request: REQUEST, root, skipInstall: true, verifyExisting: true, projectDir: proj }, { sessionId });
        expect(snapshot(proj)).toEqual(before);
        expect(verified.output?.verifiedExisting).toBe(true);
        expect(verified.output?.delivery?.askedButMissing).toEqual([]);
        expect(String(verified.error || '')).not.toMatch(/requested_features_not_proven/);
        expect(verified.logs.join('\n')).toContain('verification: re-proving the existing project after a repair');
    });

    it('a repair that did not add them stays blocked, with the same verdict', async () => {
        const sessionId = 'verify-existing-unrepaired';
        const { root, proj, first } = await firstBuild(sessionId);
        const before = snapshot(proj);
        const verified: any = await new ReactProjectTool().execute(
            { request: REQUEST, root, skipInstall: true, verifyExisting: true, projectDir: proj }, { sessionId });
        expect(snapshot(proj)).toEqual(before);
        expect(verified.ok).toBe(false);
        expect(verified.error).toBe(first.error);
        expect(verified.output?.delivery?.askedButMissing).toEqual(['with a summary page showing totals']);
    });

    it('no authoring call is made, even where authoring is otherwise allowed', async () => {
        const sessionId = 'verify-existing-no-author';
        const { root, proj } = await firstBuild(sessionId);
        repairView(proj);
        const author = jest.spyOn(AIGeneratorTool.prototype, 'execute').mockResolvedValue({ ok: false, error: 'must not be called' } as any);
        try {
            const before = snapshot(proj);
            await new ReactProjectTool().execute(
                { request: REQUEST, root, skipInstall: true, verifyExisting: true, projectDir: proj },
                { sessionId, allowModelAuthoringInTest: true });
            expect(author).not.toHaveBeenCalled();
            expect(snapshot(proj)).toEqual(before);
        } finally {
            author.mockRestore();
        }
    });

    it('with no existing project it refuses instead of building one', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-verify-missing-'));
        roots.push(root);
        const result: any = await new ReactProjectTool().execute(
            { request: REQUEST, root, skipInstall: true, verifyExisting: true, projectDir: path.join(root, 'nothing-here') },
            { sessionId: 'verify-existing-missing' });
        expect(result).toMatchObject({ ok: false, error: 'verify_existing_project_missing' });
        expect(fs.readdirSync(root)).toEqual([]);
    });
});

describe('the SelfFix rerun after a source repair', () => {
    it('runs react_project in verifyExisting mode on the repaired project instead of skipping it', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-verify-phase-'));
        roots.push(root);
        fs.writeFileSync(path.join(root, 'package.json'), '{"name":"products"}');
        const file = path.join(root, 'src', 'components', 'RecordsView.jsx');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, 'export default function RecordsView() { return null; }');
        const phase = { phaseNumber: 1, name: 'React browser application', tasks: [
            { task: 'Build the app', tool: 'react_project', args: { request: REQUEST } },
            { task: 'Rewrite the view', tool: 'ai_write_file', args: { path: file } },
        ] };
        const after = phaseAfterRepair(phase, file);
        expect(after.phase.tasks).toEqual([
            { task: 'Build the app', tool: 'react_project', args: { request: REQUEST, verifyExisting: true, projectDir: root } },
        ]);
        expect(after.skipped).toEqual(['Rewrite the view']);
        expect(after.phase.name).toContain('post-repair verification');
    });
    it('a manifest repair keeps resumeExisting, not verification', () => {
        const phase = { phaseNumber: 1, name: 'Setup', tasks: [{ task: 'Build the app', tool: 'react_project', args: { request: REQUEST } }] };
        const after = phaseAfterRepair(phase, '/workspace/products/package.json');
        expect(after.phase.tasks[0].args).toEqual({ request: REQUEST, resumeExisting: true });
        expect(after.phase.tasks[0].args.verifyExisting).toBeUndefined();
    });
});

describe('the guards that need a real browser and build', () => {
    // These paths run only with a browser audit or a failing real build, which
    // this suite does not have; the wiring is asserted so a guard cannot vanish.
    const source = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf8');
    it('the audit measures and never opens its repair rounds while verifying', () => {
        expect(source).toContain('if (verifyExisting && doorTerminal) terminalAudit = doorTerminal;');
        expect(source).toContain('if (!verifyExisting && !audit.skipped && supportsSourceRepair && (worthRepairing(audit.findings)');
        expect(source).toContain('const canRestoreDeterministic = !verifyExisting && runtimeBlockers.length && !audit?.skipped');
    });
    it('a failing build is diagnosed but not remedied, rolled back or replaced', () => {
        expect(source).toMatch(/if \(d\?\.fixable && verifyExisting\) \{\s*term\('build remedy: not applied/);
        expect(source).toContain('if (!verifyExisting && !built && (Object.keys(authoredFallback).length > 0 || !!authoredEngineFallback)) {');
        expect(source).toContain('} else if (!verifyExisting && !noInstall && installExit !== null && dependencyFreeRecordsFallback) {');
    });
});
