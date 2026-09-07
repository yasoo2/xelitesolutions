import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
    path.join(__dirname, '..', 'core', 'quality', 'behaviour-audit.ts'),
    'utf-8',
);

describe('browser QA keeps form evidence after its control pass', () => {
    it('returns a function-scoped form result instead of a block-scoped variable', () => {
        const functionStart = source.indexOf('export async function probeControls');
        const blockStart = source.indexOf('\n    {', functionStart);
        const declaration = source.indexOf('let filled: FormResult[] = [];', functionStart);
        const returnAt = source.indexOf('return { controls, metrics, forms: filled };', functionStart);

        expect(functionStart).toBeGreaterThanOrEqual(0);
        expect(declaration).toBeGreaterThan(functionStart);
        expect(declaration).toBeLessThan(blockStart);
        expect(returnAt).toBeGreaterThan(declaration);
    });
});
