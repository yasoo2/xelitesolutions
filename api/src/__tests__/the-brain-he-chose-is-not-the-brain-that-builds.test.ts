/**
 * THE BRAIN HE CHOSE WAS NOT THE BRAIN THAT BUILT.
 *
 * The owner, having done his half: «I did my part and Joe's brain is now
 * Claude, but what is left on you, you have not finished.»
 *
 * He had. He pressed the providers button, chose Claude, and pasted a real key.
 * And measured against the source, `intelligent-router` reads the provider he
 * chose from exactly one place:
 *
 *     intelligent-router.ts:1454   if (context?.modelConfig) {
 *     intelligent-router.ts:1455   const { provider: cfgProvider, ... } = context.modelConfig;
 *
 * from `context` and from nowhere else. And `ReactProjectTool` — the generator
 * that writes his sites, shops and apps — made four model calls:
 *
 *     routeToModel([{ role: 'user', content: prompt }])
 *
 * one argument each, and the string `modelConfig` did not occur in the file at
 * all. So every model call that actually BUILT his project fell through to the
 * free mesh, whatever he selected. His key was live, and the thing he bought it
 * for never touched it.
 *
 * ⛔ THE CLASS IS THIS SESSION'S OLDEST: a layer computes the answer and the
 * reader above it never asks. `BrowserSmartTools` had been passing `context`
 * for a long time, so the idiom was known and simply never reached the builder.
 *
 * ⛔ AND THE INSTRUMENT MATTERS AS MUCH AS THE FINDING. Four hand-written
 * checkers answered this question four different ways before the number below
 * could be trusted — "the last argument is `context`" called a working
 * `{ ...(context || {}) }` broken; "`context` appears in the call" called a
 * prompt reading "the provided codebase context" fixed; and stripping the
 * strings first desynchronised on a NESTED template literal and swallowed a
 * real argument. Every one of them matched text where a question was asked.
 * So this guard uses the TypeScript compiler that is already in node_modules
 * and actually parses the language — the ready-made tool before the hand-made
 * one, and here the hand-made ones disagreeing with each other IS the proof.
 */

import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const DEFS = path.join(__dirname, '..', 'modules', 'tools', 'definitions');

/** Every `routeToModel(...)` call in a file, and whether an argument names `context`. */
function modelCalls(file: string): Array<{ line: number; carriesTheChosenProvider: boolean }> {
    const src = fs.readFileSync(file, 'utf-8');
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
    const found: Array<{ line: number; carriesTheChosenProvider: boolean }> = [];

    const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node)) {
            const name = node.expression.getText(sf);
            if (name === 'routeToModel' || name.endsWith('.routeToModel')) {
                let carries = false;
                const scan = (n: ts.Node): void => {
                    if (ts.isIdentifier(n) && n.text === 'context') carries = true;
                    ts.forEachChild(n, scan);
                };
                node.arguments.forEach(scan);
                found.push({
                    line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
                    carriesTheChosenProvider: carries,
                });
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return found;
}

/** The tools that turn his sentence into a project. These are the ones that must obey him. */
const BUILDERS = [
    'ReactProjectTool.ts',
    'WebPageBuilderTool.ts',
    'ProjectEditTool.ts',
    'AnalysisTools.ts',
];

describe('the provider he chose is the provider that builds', () => {
    it('⛔ POSITIVE — every model call in every builder carries his choice', () => {
        //  Not «the four I fixed» — every one, so the fifth call somebody adds
        //  next month cannot quietly go back to the free mesh. That is the
        //  second-writer defect, and it is the one this repository pays for
        //  most often.
        for (const f of BUILDERS) {
            const calls = modelCalls(path.join(DEFS, f));
            expect({ file: f, hasModelCalls: calls.length > 0 }).toEqual({ file: f, hasModelCalls: true });
            for (const c of calls) {
                expect({ at: `${f}:${c.line}`, carriesTheChosenProvider: c.carriesTheChosenProvider })
                    .toEqual({ at: `${f}:${c.line}`, carriesTheChosenProvider: true });
            }
        }
    });

    it('POSITIVE — the generator that writes his projects makes real model calls', () => {
        //  A guard over an empty list passes forever. `ReactProjectTool` is the
        //  file the defect lived in; if its calls ever vanish, the assertion
        //  above becomes a green that measures nothing.
        const calls = modelCalls(path.join(DEFS, 'ReactProjectTool.ts'));
        expect(calls.length).toBeGreaterThanOrEqual(4);
    });

    it('⛔ NEGATIVE — the router still reads his choice from ONE place only', () => {
        //  If a second source for the provider ever appears, the guard above
        //  stops meaning what it says: a call could carry `context` and still
        //  be overridden somewhere else. The single door is the reason passing
        //  `context` is sufficient.
        const router = fs.readFileSync(
            path.join(__dirname, '..', 'core', 'llm', 'intelligent-router.ts'),
            'utf-8',
        );
        const doors = router.match(/=\s*context\.modelConfig\b|context\?\.modelConfig\b/g) || [];
        expect(doors.length).toBeGreaterThan(0);
        expect(router).toContain('if (context?.modelConfig) {');
    });

    it('POSITIVE — an explicit provider remains authoritative across engineering calls', () => {
        const router = fs.readFileSync(
            path.join(__dirname, '..', 'core', 'llm', 'intelligent-router.ts'),
            'utf-8',
        );
        // Local-first is correct for hidden helper calls, but it must never
        // replace the provider selected for planning, authoring, QA, or repair.
        expect(router).toMatch(/internalCall\s*&&\s*isLocalBrainReady\(\)\s*&&\s*!engineeringPipeline/);
        expect(router).toContain('engineering provider selection remains authoritative');
    });

    it('NEGATIVE — a call with no arguments at all would not pass', () => {
        //  Proof that the instrument can say no. Written against a synthetic
        //  file rather than by breaking a real one, so the check that guards
        //  the repair is itself shown to have a failing side.
        const tmp = path.join(__dirname, '..', '..', 'node_modules', '.cache-routecheck.ts');
        fs.mkdirSync(path.dirname(tmp), { recursive: true });
        fs.writeFileSync(tmp, 'declare const routeToModel: any;\nrouteToModel([{ role: "user" }]);\n', 'utf-8');
        try {
            expect(modelCalls(tmp)).toEqual([{ line: 2, carriesTheChosenProvider: false }]);
        } finally {
            fs.unlinkSync(tmp);
        }
    });
});
