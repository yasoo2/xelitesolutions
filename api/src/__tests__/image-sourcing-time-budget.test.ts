import fs from 'fs';
import path from 'path';

describe('image sourcing time budget', () => {
    const source = () => fs.readFileSync(
        path.join(__dirname, '..', 'core', 'design', 'images.ts'),
        'utf-8',
    );
    const builder = () => fs.readFileSync(
        path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'WebPageBuilderTool.ts'),
        'utf-8',
    );

    it('gives the complete image-resolution pass one explicit deadline', () => {
        const code = source();
        expect(code).toMatch(/totalTimeoutMs\?: number/);
        expect(code).toMatch(/const deadline = startedAt \+ totalTimeoutMs/);
        expect(code).toMatch(/sourcing time budget \(\$\{Math\.round\(totalTimeoutMs \/ 1000\)\}s\) exhausted/);
    });

    it('races every archive attempt against the remaining global budget', () => {
        const code = source();
        expect(code).toMatch(/const sourceWithinBudget = async/);
        expect(code).toMatch(/return await Promise\.race\(/);
        expect(code).toMatch(/setTimeout\(\(\) => \{ sourcingTimedOut = true; resolve\(null\); \}, Math\.max\(1, remainingMs\)\)/);
    });

    it('makes the page builder reach its functional QA gate within 25 seconds of image sourcing', () => {
        const code = builder();
        expect(code).toMatch(/totalTimeoutMs: 25_000/);
        expect(code).toMatch(/slow photo archive gets one bounded opportunity/);
    });
});
