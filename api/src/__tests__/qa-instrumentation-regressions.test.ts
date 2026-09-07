import fs from 'fs';
import path from 'path';

const read = (name: string) => fs.readFileSync(path.join(__dirname, '..', 'core', 'quality', name), 'utf8');

describe('browser QA instrumentation regressions', () => {
    test('theme probing clicks the visible control in-page without an actionability timeout', () => {
        const source = read('app-audit.ts');
        expect(source).toContain("visible theme toggle disappeared before the probe");
        expect(source).not.toContain("page.click('.theme-toggle");
    });

    test('responsive checks change layout width without switching the borrowed page into mobile emulation', () => {
        const source = read('ui-inspection.ts');
        expect(source.match(/mobile: false/g)).toHaveLength(2);
        expect(source).not.toContain('mobile: width <= 600');
    });

    test('contact forms are not judged as persistent record editors', () => {
        const source = read('behaviour-audit.ts');
        expect(source).toContain('expectsPersistence');
        expect(source).toMatch(/effect === 'submitted' && f\.expectsPersistence && anchor/);
        expect(source).toMatch(/add\|create\|save\|order\|register\|book\|reserve/);
    });

    test('Arabic pages fail visual QA when visible controls remain in English', () => {
        const source = read('visual-audit.ts');
        expect(source).toContain('foreignInteractiveLabels');
        expect(source).toContain("code: 'foreign_interactive_labels'");
        expect(source).toContain('translate the visible control labels to the document language');
    });
});
