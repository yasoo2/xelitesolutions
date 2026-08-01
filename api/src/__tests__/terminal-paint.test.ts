/**
 * Terminal color is display, not data.
 *
 * Build lines are painted with ANSI codes ONLY at the broadcast site; the logs
 * array a tool returns stays clean text (it is written into results, reports,
 * and tests — color codes there would be corruption). And the paint itself must
 * tell the truth: an audit that scored 55/100 is red even though the line
 * contains no failure word, and a "repair rejected" line is red even though
 * "repair" sounds like progress.
 */
import * as fs from 'fs';
import * as path from 'path';
import { classifyLine, paintLine } from '../core/terminal/paint';

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';

describe('classifyLine — tone follows meaning, not keywords alone', () => {
    it.each([
        ['behaviour repair rejected (72 -> 65, controls 14 -> 9)', 'error'],
        ['site build aborted on store.html: no LLM provider answered', 'error'],
        ['section edit hero failed: timeout', 'error'],
        ['edit refused: the reply dropped 40% of the text and 2 section(s); the page is unchanged', 'error'],
    ] as const)('failure line is red: %s', (line, tone) => {
        expect(classifyLine(line)).toBe(tone);
    });

    it.each([
        ['visual repair accepted: 60 → 85', 'success'],
        ['behaviour repair accepted: 72 -> 96', 'success'],
        ['content: repaired 3 issue(s)', 'success'],
        ['section 4 (features): rewritten in the requested language', 'success'],
    ] as const)('progress-made line is green: %s', (line, tone) => {
        expect(classifyLine(line)).toBe(tone);
    });

    it('an audit score line is judged by the SCORE, not by the absence of failure words', () => {
        expect(classifyLine('visual audit: 96/100, 1 finding(s)')).toBe('success');
        expect(classifyLine('visual audit: 78/100, 4 finding(s)')).toBe('warning');
        expect(classifyLine('behaviour audit: 55/100, 5/12 dead control(s), 2 dead anchor(s)')).toBe('error');
    });

    it('skips and fallbacks are yellow — quiet degradation must still be visible', () => {
        expect(classifyLine('visual audit skipped: no browser executable')).toBe('warning');
        expect(classifyLine('section-wise build produced only 2/9 sections — falling back to a single pass')).toBe('warning');
    });

    it('ordinary narration stays unpainted', () => {
        expect(classifyLine('reference https://example.com: read')).toBe('plain');
        expect(classifyLine('blueprint: 9 sections planned')).toBe('plain');
    });
});

describe('paintLine', () => {
    it('wraps the body in the tone color and resets at the end', () => {
        const painted = paintLine('section edit hero failed: timeout');
        expect(painted.startsWith(RED)).toBe(true);
        expect(painted.endsWith('\x1b[0m')).toBe(true);
        expect(painted).toContain('section edit hero failed: timeout');
    });

    it('dims the prefix so the message, not the label, carries the color', () => {
        const painted = paintLine('content: repaired 3 issue(s)', '[joe]');
        expect(painted.startsWith(`${DIM}[joe]\x1b[0m `)).toBe(true);
        expect(painted).toContain(GREEN);
    });

    it('plain lines pass through untouched except for the prefix', () => {
        expect(paintLine('blueprint: 9 sections planned')).toBe('blueprint: 9 sections planned');
    });

    it('uses yellow and cyan where promised', () => {
        expect(paintLine('visual audit skipped: no browser executable')).toContain(YELLOW);
        expect(paintLine('section 3 (pricing): 4812 bytes')).toContain(CYAN);
    });
});

describe('color exists only at the broadcast sites', () => {
    const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf-8');

    it('the page builder paints at broadcast and pushes clean text into logs', () => {
        const src = read('modules/tools/definitions/WebPageBuilderTool.ts');
        // The live-stream wrapper broadcasts painted lines...
        expect(src).toMatch(/paintLine\(line, '\[joe\]'\)/);
        // ...and hands the ORIGINAL lines to the real push, unpainted.
        expect(src).toMatch(/return rawPush\(\.\.\.lines\);/);
    });

    it('the ToolService fallback flush paints too, so both paths look the same', () => {
        const src = read('modules/services/ToolService.ts');
        expect(src).toMatch(/paintLine\(line\) \+ '\\r\\n'/);
    });
});
