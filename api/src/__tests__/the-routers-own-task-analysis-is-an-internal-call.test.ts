/**
 * THE ROUTER'S OWN TASK ANALYSIS IS AN INTERNAL CALL.
 *
 * advancedAnalyzeTask asks a model to classify every long request
 * (type / complexity / language). Nobody reads that JSON but the router, so it
 * is internal work — and routeToModel decides that on one key:
 *
 *     const internalCall = String((context as any)?.purpose || '') === 'internal';
 *
 * The local-first branch passed `internalCall: true` instead. The router never
 * reads it, so the analysis counted as a user answer: with any fast cloud key
 * configured (the server's normal state) `hasFastCloud && !internalCall` moved
 * Local behind the cloud and the keyless mesh, and the analysis of every long
 * request spent the quota held for the final answer — the opposite of the
 * branch's own name, «local first».
 */

import fs from 'fs';
import path from 'path';

const ROUTER = fs.readFileSync(path.join(__dirname, '..', 'core', 'llm', 'intelligent-router.ts'), 'utf-8')
    .replace(/\r\n/g, '\n');
const code = (s: string) => s.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

/** The body of advancedAnalyzeTask, up to the next top-level declaration. */
const ANALYSIS = (() => {
    const start = ROUTER.indexOf('export async function advancedAnalyzeTask(');
    expect(start).toBeGreaterThanOrEqual(0);
    const rest = ROUTER.slice(start + 1);
    const end = rest.search(/\n(export |async function |function )/);
    return code(ROUTER.slice(start, end < 0 ? undefined : start + 1 + end));
})();

/** Every routeToModel(...) call inside it, by balanced parentheses. */
const CALLS = (() => {
    const out: string[] = [];
    let at = ANALYSIS.indexOf('routeToModel(');
    while (at >= 0) {
        let depth = 0, i = at + 'routeToModel'.length;
        for (; i < ANALYSIS.length; i++) {
            if (ANALYSIS[i] === '(') depth++;
            else if (ANALYSIS[i] === ')' && --depth === 0) break;
        }
        out.push(ANALYSIS.slice(at, i + 1));
        at = ANALYSIS.indexOf('routeToModel(', i);
    }
    return out;
})();

describe("the router's own task analysis is an internal call", () => {
    it('the router still decides «internal» on `purpose`, and reorders the mesh on it', () => {
        const router = code(ROUTER);
        expect(router).toContain("const internalCall = String((context as any)?.purpose || '') === 'internal';");
        expect(router).toContain('if (hasFastCloud && !internalCall) {');
    });

    it('both analysis paths (Gemini and local-first) call the model', () => {
        expect(CALLS.length).toBe(2);
    });

    it("every analysis call is marked purpose: 'internal'", () => {
        for (const call of CALLS) expect(call).toContain("purpose: 'internal'");
    });

    it('no analysis call passes a key the router does not read', () => {
        for (const call of CALLS) expect(call).not.toMatch(/\binternalCall\s*:/);
    });
});
