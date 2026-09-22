import { execFileSync } from 'child_process';
import path from 'path';

describe('whole-source record evidence has bounded missing-evidence cost', () => {
    it.each([
        ['filter items by tag', ["filterFields: ['tags']", 'filterKeys', 'setFilters']],
        ['الحفاظ على الصورة الأصلية', ['preserveOriginalImages: true', 'maxEdge === 0']],
    ])('requires all evidence for %s regardless of its order', (feature, terms) => {
        // A regressed synchronous regex must not hang Jest's own event loop.
        const script = `
            const { recordFeatureCovered } = require('./src/core/design/app-blueprints');
            const [feature, terms] = JSON.parse(process.argv[1]);
            const padding = 'unrelated source line\\n'.repeat(6000);
            const start = Date.now();
            const missing = terms.map((_, absent) => recordFeatureCovered(feature, feature,
                padding + terms.filter((_, index) => index !== absent).join(padding) + padding));
            const complete = [terms, [...terms].reverse()].map(parts =>
                recordFeatureCovered(feature, feature, padding + parts.join(padding)));
            console.log(JSON.stringify({ missing, complete, duration: Date.now() - start }));
        `;
        const output = execFileSync(process.execPath,
            ['-r', 'ts-node/register/transpile-only', '-e', script, JSON.stringify([feature, terms])],
            { cwd: path.resolve(__dirname, '../..'), timeout: 15000, encoding: 'utf8', maxBuffer: 100000 });
        const result = JSON.parse(output.trim());
        expect(result.missing).toEqual(terms.map(() => false));
        expect(result.complete).toEqual([true, true]);
        expect(result.duration).toBeLessThan(2000);
    }, 20000);
});
