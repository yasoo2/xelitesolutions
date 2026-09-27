import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const read = (name: string) => fs.readFileSync(path.join(__dirname, '..', 'core', 'quality', name), 'utf8');

describe('browser QA instrumentation regressions', () => {
    test('theme probing clicks the visible control in-page without an actionability timeout', () => {
        const source = read('app-audit.ts');
        expect(source).toContain("visible theme toggle disappeared before the probe");
        expect(source).not.toContain("page.click('.theme-toggle");
    });

    test('responsive checks change layout width without switching the borrowed page into mobile emulation', () => {
        const source = read('ui-inspection.ts');
        const parsed = ts.createSourceFile('ui-inspection.ts', source, ts.ScriptTarget.Latest, true);
        const overrides: ts.CallExpression[] = [];
        const visit = (node: ts.Node) => {
            if (ts.isCallExpression(node) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])
                && node.arguments[0].text === 'Emulation.setDeviceMetricsOverride') {
                overrides.push(node);
            }
            ts.forEachChild(node, visit);
        };
        visit(parsed);

        expect(overrides.length).toBeGreaterThan(0);
        for (const override of overrides) {
            const parameters = override.arguments[1];
            expect(parameters && ts.isObjectLiteralExpression(parameters)).toBe(true);
            if (!parameters || !ts.isObjectLiteralExpression(parameters)) continue;
            // Inspect every initial/retry path without prescribing their count.
            // A spread could overwrite the explicit flag with mobile emulation.
            expect(parameters.properties.some(ts.isSpreadAssignment)).toBe(false);
            const mobile = parameters.properties.filter(property => property.name
                && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
                && property.name.text === 'mobile');
            expect(mobile.map(property => ts.isPropertyAssignment(property)
                ? property.initializer.kind : undefined)).toEqual([ts.SyntaxKind.FalseKeyword]);
        }
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
