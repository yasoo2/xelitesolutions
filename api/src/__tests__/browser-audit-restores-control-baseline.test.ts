import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
    path.join(__dirname, '..', 'core', 'quality', 'behaviour-audit.ts'),
    'utf8',
);

describe('browser control QA isolates transient interaction state', () => {
    it('dismisses a surface opened by the previous control', () => {
        expect(source).toContain("if (attemptedControls++ > 0)");
        expect(source).toContain("page.keyboard.press('Escape')");
    });

    it('restores the exact starting URL before declaring a covered control unreachable', () => {
        const marker = 'A transient surface may not identify itself as a modal';
        const recovery = source.slice(source.indexOf(marker), source.indexOf(marker) + 1800);
        expect(recovery).toContain("page.goto(probeStartUrl");
        expect(recovery).toContain('controlKey(candidate) === controlKey(c)');
    });
});
