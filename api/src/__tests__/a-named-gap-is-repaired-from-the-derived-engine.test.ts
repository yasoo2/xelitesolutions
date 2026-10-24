import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    repairDerivedEngineGaps,
    readRequestRequirements,
    deliveryErrorForMissingFeatures,
} from '../modules/tools/definitions/ReactProjectTool';
import { uncoveredFeatures } from '../core/design/app-blueprints';
import { readProjectSource } from '../core/quality/scope-audit';
import { RepairTicketService } from '../modules/services/RepairTicketService';
import { SelfFixService } from '../modules/services/SelfFixService';

/**
 * Eval round 15, 2026-10-24: P051 asked for «a summary page showing totals and
 * a chart», P151 for «each staff member only sees their own records». Both
 * builds took Joe's request-derived engine without an authoring wait, and the
 * one bounded capability repair was skipped for derived engines — so the gap
 * went straight to the final audit (requested_features_not_proven), SelfFix
 * refused it for want of a repair file, and nothing was ever tried.
 */
const REQUEST = 'Build an admin panel to manage products with name, price and stock, with a summary page showing totals and a chart.';
const DERIVED = [
    'export default function RecordsView({ content, controller }) {',
    "  const fields = [{ key: 'name', label: 'name' }, { key: 'price', label: 'price' }, { key: 'stock', label: 'stock' }];",
    '  return <section data-joe-presentation="request-derived">{fields.map(f => <p key={f.key}>{f.label}</p>)}</section>;',
    '}',
    '',
].join('\n');
const GENERATED = 'src/components/RecordsView.jsx';
const EXPORT = /export\s+default\s+function\s+RecordsView\b|export\s+default\s+RecordsView\b/;

const roots: string[] = [];
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });
function project(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-derived-gap-'));
    roots.push(root);
    fs.mkdirSync(path.join(root, 'src', 'components'), { recursive: true });
    fs.writeFileSync(path.join(root, GENERATED), DERIVED, 'utf8');
    return root;
}
const repairInput = (root: string, authorExecute: (payload: any, ctx: any) => Promise<any>, events: string[]) => ({
    request: REQUEST,
    engine: 'records' as const,
    apiLinked: false,
    projectRoot: root,
    generatedPath: GENERATED,
    authorExecute,
    authorDescription: 'Write the presentation for the requested records application.',
    language: 'en',
    aestheticMode: 'Use the existing app.css and design tokens.',
    context: 'projectRoot=' + root,
    executionContext: {},
    exportContract: EXPORT,
    onEvent: (line: string) => events.push(line),
});

describe('a named gap is repaired from the request-derived engine', () => {
    it('the derived engine starts with the two gaps the final audit would block on', () => {
        const root = project();
        expect(uncoveredFeatures(REQUEST, 'records', false, readProjectSource([root])))
            .toEqual(['with a summary page showing totals', 'a chart']);
    });

    it('an author that adds them: one repair, from the derived source, and the gaps are proven gone', async () => {
        const root = project();
        const events: string[] = [];
        const briefs: string[] = [];
        const result = await repairDerivedEngineGaps(repairInput(root, async (payload) => {
            briefs.push(String(payload.description));
            fs.writeFileSync(payload.path, DERIVED.replace('</section>;',
                '<div aria-label="with a summary page showing totals" /><figure aria-label="a chart" /></section>;'), 'utf8');
            return { ok: true };
        }, events));
        expect(briefs).toHaveLength(1);
        expect(briefs[0]).toContain('- Missing capability: "a chart"');
        expect(briefs[0]).toContain(DERIVED.trim());
        expect(result.repair).toMatchObject({ attempted: true, ok: true, remaining: [] });
        expect(result.restored).toBe(false);
        expect(fs.readFileSync(path.join(root, GENERATED), 'utf8')).toContain('aria-label="a chart"');
        expect(uncoveredFeatures(REQUEST, 'records', false, readProjectSource([root]))).toEqual([]);
        expect(events).toContain('capability repair: resolved (with a summary page showing totals, a chart)');
    });

    it('an author that fails: the derived engine is restored and the gate still blocks, naming what is unproven', async () => {
        const root = project();
        const result = await repairDerivedEngineGaps(repairInput(root, async (payload) => {
            fs.writeFileSync(payload.path, 'half a file', 'utf8');
            return { ok: false, error: 'provider unavailable' };
        }, []));
        expect(result.repair).toMatchObject({ attempted: true, ok: false });
        expect(result.restored).toBe(true);
        expect(fs.readFileSync(path.join(root, GENERATED), 'utf8')).toBe(DERIVED);
        const stillMissing = uncoveredFeatures(REQUEST, 'records', false, readProjectSource([root]));
        expect(stillMissing).toEqual(['with a summary page showing totals', 'a chart']);
        expect(deliveryErrorForMissingFeatures(stillMissing))
            .toBe('requested_features_not_proven: with a summary page showing totals, a chart');
    });

    it('a repair that names the capabilities but breaks the engine export is not kept', async () => {
        const root = project();
        const result = await repairDerivedEngineGaps(repairInput(root, async (payload) => {
            fs.writeFileSync(payload.path, 'const x = <div aria-label="with a summary page showing totals" /><figure aria-label="a chart" />;', 'utf8');
            return { ok: true };
        }, []));
        expect(result.repair.ok).toBe(false);
        expect(result.repair.error).toMatch(/broke the engine export/);
        expect(result.restored).toBe(true);
        expect(fs.readFileSync(path.join(root, GENERATED), 'utf8')).toBe(DERIVED);
    });
});

describe('a reader that throws still reads the clauses', () => {
    const throwing = async () => { throw new Error('parser exploded'); };

    it('the explicit clauses of his sentence become the criteria, and the request is not unread', async () => {
        const lines: string[] = [];
        const read = await readRequestRequirements(
            'Build a task tracker. Add tasks with a title. Show a running total of open tasks.',
            false, async () => '', line => lines.push(line), throwing as any);
        expect(read.named.map(r => r.text)).toEqual(['Add tasks with a title', 'Show a running total of open tasks']);
        expect(read.requestUnread).toBe(false);
        expect(read.modelUnavailable).toBe(true);
        expect(lines[0]).toBe('reading your request failed: parser exploded');
        expect(lines.some(l => l.startsWith('provider reading unavailable; retained 2 explicit clause(s)'))).toBe(true);
    });
    it('with no clause to read, it is unread — and says why', async () => {
        const read = await readRequestRequirements('Build me something nice.', false, async () => '', () => undefined, throwing as any);
        expect(read.named).toEqual([]);
        expect(read.requestUnread).toBe(true);
        expect(read.whyNotRead).toBe('the reader failed: parser exploded');
    });
});

describe('SelfFix gets an evidence-bound target for a capability gap', () => {
    const ticketFor = (task: Record<string, unknown>) => RepairTicketService.build({
        projectName: 'Products admin',
        phase: { phaseNumber: 1, name: 'React browser application' },
        phaseStatus: 'failed',
        phaseResult: { output: { status: 'failed', results: [{ ok: false, task: 'Build the app', tool: 'react_project', ...task }] } },
    });
    const file = path.join(os.tmpdir(), 'joe-products', 'src', 'components', 'RecordsView.jsx');

    it('requested_features_not_proven with the engine as repairFile → a code_fix of that file, naming the capabilities verbatim', () => {
        const plan = SelfFixService.plan(ticketFor({
            error: 'requested_features_not_proven: with a summary page showing totals, a chart',
            repairKind: 'code_fix', repairFile: file, description: REQUEST,
        }));
        expect(plan).toMatchObject({ allowed: true, strategy: 'code_fix', repairFile: file, suggestedTool: 'ai_write_file' });
        expect((plan.suggestedInput as any).path).toBe(file);
        expect(String((plan.suggestedInput as any).description))
            .toContain('Unproven capabilities, exactly as the delivery gate named them: with a summary page showing totals, a chart');
        expect(String((plan.suggestedInput as any).description)).toContain(REQUEST);
    });
    it('capability_gap_unresolved is repaired the same way', () => {
        const plan = SelfFixService.plan(ticketFor({
            error: 'capability_gap_unresolved: each staff member only sees their own records',
            repairKind: 'code_fix', repairFile: file,
        }));
        expect(plan).toMatchObject({ allowed: true, strategy: 'code_fix', repairFile: file });
        expect(String((plan.suggestedInput as any).description)).toContain('each staff member only sees their own records');
    });
    it('an unread request stops honestly, whatever file is attached', () => {
        const plan = SelfFixService.plan(ticketFor({
            error: 'acceptance_unverified: request_not_read — the model could not be reached: TIMEOUT',
            repairKind: 'code_fix', repairFile: file,
        }));
        expect(plan).toMatchObject({ allowed: false, strategy: 'manual_review' });
        expect(plan.reason).toMatch(/could not be read/);
    });
    it('a capability error with no file attached is still refused, as before', () => {
        const plan = SelfFixService.plan(ticketFor({ error: 'requested_features_not_proven: a chart' }));
        expect(plan.allowed).toBe(false);
        expect(plan.reason).toMatch(/no evidence-bound repair file/);
    });
});

describe('the wiring in react_project', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf8');

    it('a derived engine gets the one repair an authored engine did not already spend', () => {
        expect(source).toMatch(/if \(generatedEnginePath && blueprintFallbackEngine && !capabilityRepairAttempted && !unifiedTables && appBp\) \{[\s\S]{0,400}await repairDerivedEngineGaps\(\{/);
        expect(source).toContain('capabilityRepairAttempted = capabilityRepair.attempted;');
    });
    it('the delivery gate names the capabilities and the generated file', () => {
        expect(source).toMatch(/askedButMissing\.length\s*\?\s*deliveryErrorForMissingFeatures\(askedButMissing\)/);
        expect(source).toMatch(/&& !buildVerificationBlocked && askedButMissing\.length \? capabilityGapRepairTarget\(\) : \{\}\),/);
    });
});
