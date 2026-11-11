import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
    path.join(__dirname, '..', 'core', 'quality', 'behaviour-audit.ts'),
    'utf8',
);

describe('browser control QA isolates transient interaction state', () => {
    it('dismisses a surface opened by the previous control', () => {
        //  …after a control that was really pressed: one only checked within reach opened nothing (reachOnly, 2026-11-10).
        expect(source).toContain("if (attemptedControls++ > 0 && lastWasPressed)");
        expect(source).toContain("page.keyboard.press('Escape')");
        expect(source).toMatch(/baselineMayBeDirty = true;\s*lastWasPressed = true;/);
    });

    it('restores the exact starting URL before declaring a covered control unreachable', () => {
        const marker = 'A transient surface may not identify itself as a modal';
        const recovery = source.slice(source.indexOf(marker), source.indexOf(marker) + 1800);
        expect(source).toContain("await page.goto(probeStartUrl");
        expect(source).toContain('controlKey(candidate) === controlKey(c)');
        expect(recovery).toContain('await restoreProbeStart()');
    });
});
