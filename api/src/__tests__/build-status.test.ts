/**
 * The build-status strip must never invent progress.
 *
 * Every status event is derived from a REAL log line at the moment it was
 * pushed — the same interception point that streams the terminal. This suite
 * feeds statusFromLine the exact line shapes the builder emits (copied from
 * its logs.push call sites) and pins that: stages map correctly, audit scores
 * ride along, the written-file line is the terminal stage, and ordinary
 * narration produces NO event (silence is not progress).
 */
import * as fs from 'fs';
import * as path from 'path';
import { statusFromLine } from '../core/terminal/build-status';

describe('statusFromLine — stages come from lines that really happened', () => {
    it('a section line carries its index and id', () => {
        const s = statusFromLine('section 3 (pricing): 4812 bytes');
        expect(s?.stage).toBe('sections');
        expect(s?.section).toEqual({ index: 3, id: 'pricing' });
        expect(s?.labelAr).toContain('3');
        expect(s?.labelAr).toContain('pricing');
    });

    it('audit lines carry their scores', () => {
        const v = statusFromLine('visual audit: 86/100, 3 finding(s)');
        expect(v?.stage).toBe('audit-visual');
        expect(v?.score).toBe(86);

        const b = statusFromLine('behaviour audit: 100/100, 0/14 dead control(s), 0 dead anchor(s)');
        expect(b?.stage).toBe('audit-behaviour');
        expect(b?.score).toBe(100);
    });

    it('repair lines stay in their audit stage without a score', () => {
        const s = statusFromLine('visual repair accepted: 60 -> 85');
        expect(s?.stage).toBe('audit-visual');
        expect(s?.score).toBeUndefined();
    });

    it('the written-file line is the terminal stage — the preview is about to open', () => {
        const s = statusFromLine('web_page_builder: wrote landing.html (48210 bytes) in /artifacts');
        expect(s?.stage).toBe('written');
        expect(s?.terminal).toBe(true);
    });

    it.each([
        ['images: 4/5 real, 312 KB, rest gradient', 'images'],
        ['content: repaired 2 issue(s)', 'content'],
        ['site links after edit: 12 checked, 0 dead', 'links'],
        ['blueprint: added a "تسجيل الدخول" section because the request asked for that control', 'planning'],
        ['section-wise build: 9/9 sections, 51023 bytes', 'assemble'],
        ['site build aborted on store.html: no LLM provider answered', 'site'],
    ])('%s → stage %s', (line, stage) => {
        expect(statusFromLine(line)?.stage).toBe(stage);
    });

    it('every status carries the raw line as its detail — the proof travels with the claim', () => {
        const line = 'behaviour audit: 55/100, 5/12 dead control(s), 2 dead anchor(s)';
        expect(statusFromLine(line)?.detail).toBe(line);
    });

    it('ordinary narration produces no event — silence is not progress', () => {
        expect(statusFromLine('targeted edit discarded: the spliced document lost 40% of the page')).toBeNull();
        expect(statusFromLine('continuation 2: +18211 bytes')).toBeNull();
        expect(statusFromLine('')).toBeNull();
    });

    it('labels exist in both languages on every stage', () => {
        for (const line of [
            'section 1 (hero): 3000 bytes',
            'images: 3/3 real, 200 KB',
            'visual audit: 90/100, 1 finding(s)',
            'web_page_builder: wrote a.html (1 bytes) in /x',
        ]) {
            const s = statusFromLine(line)!;
            expect(s.labelAr.length).toBeGreaterThan(0);
            expect(s.label.length).toBeGreaterThan(0);
        }
    });
});

describe('the builder broadcasts the status where the line is pushed', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'WebPageBuilderTool.ts'),
        'utf-8'
    );

    it('statusFromLine runs inside the logs.push wrapper, next to the terminal broadcast', () => {
        const wrapper = src.slice(src.indexOf('logs.push = ('), src.indexOf('return rawPush'));
        expect(wrapper).toContain('statusFromLine(line)');
        expect(wrapper).toContain("type: 'build_status'");
    });

    it('no timer fakes the strip — the builder contains no interval-driven status', () => {
        expect(src).not.toMatch(/setInterval\([^)]*status/i);
    });
});
