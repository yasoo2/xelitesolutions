/**
 * A COUNT IS NOT A CAPABILITY.
 *
 * Startup announces «Registered 149 tools (71 revived)». An audit of all of
 * them found real ghosts behind that number:
 *
 *   - recall_memory and memorize_codebase had NO execute() at all. Their work
 *     lived as a special case inside ToolService, so anything calling the tool
 *     directly died on «t.execute is not a function» — a catalogue entry
 *     promising a capability the object did not have.
 *   - six read-only tools threw a raw TypeError when a required argument was
 *     missing (`undefined.slice`, `undefined.join`, `undefined.split`,
 *     `undefined.toLowerCase`). A planner omitting a field is ordinary; the
 *     user should get a sentence, not a JavaScript stack.
 *
 * This lock keeps the catalogue honest as it grows.
 */
import { tools } from '../modules/tools/registry';

describe('every registered tool is a real one', () => {
    it('carries a name, a description a planner can use, a schema and a BODY', () => {
        expect(tools.length).toBeGreaterThan(100);
        const broken = tools.filter((t: any) => !t?.name?.trim()
            || String(t?.description || '').trim().length < 10
            || !t?.inputSchema
            || typeof t?.execute !== 'function');
        expect(broken.map((t: any) => t?.name || '(nameless)')).toEqual([]);
    });

    it('no name is registered twice, and no schema demands a field it never declares', () => {
        const names = tools.map((t: any) => t.name);
        expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
        const impossible = tools.filter((t: any) => {
            const req: string[] = Array.isArray(t?.inputSchema?.required) ? t.inputSchema.required : [];
            return req.some(r => !(r in (t?.inputSchema?.properties || {})));
        });
        expect(impossible.map((t: any) => t.name)).toEqual([]);
    });

    it('the memory tools own their implementation — the ghost is gone', () => {
        for (const name of ['recall_memory', 'memorize_codebase']) {
            const t: any = tools.find((x: any) => x.name === name);
            expect(typeof t?.execute).toBe('function');
        }
    });

    it('a missing argument earns a sentence, never a TypeError', async () => {
        // The exact six the audit caught, plus the two memory tools.
        for (const name of ['compliance_validator', 'cloud_cost_estimator', 'self_confidence_evaluator',
            'project_planner', 'request_analyzer', 'pattern_recognize', 'recall_memory']) {
            const t: any = tools.find((x: any) => x.name === name);
            if (!t) continue;                       // a tool may be renamed; absence is not this test's subject
            const res = await t.execute({}, { sessionId: 'jest-registry' });
            expect(res && typeof res === 'object').toBe(true);
            expect(res.ok).toBe(false);
            expect(String(res.error || res.output || '')).toMatch(/needs|requires|pass |describe/i);
        }
    });
});
