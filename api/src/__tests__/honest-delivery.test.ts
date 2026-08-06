/**
 * A DELIVERY THAT KNOWS IT IS BROKEN MUST SAY SO FIRST.
 *
 * His build was handed over at 67/100 with `failed_requests` still open — the
 * `%22C:/Users/…jpg%22 404` he was looking at on screen — under the headline
 * «A full React project, scaffolded AND verified to compile». Verified to
 * COMPILE it was. Nobody claimed it worked, and nobody said it did not; the
 * one fact he needed sat below a list of filenames, if it appeared at all.
 *
 * A score is a poor gate — 67 is not meaningfully different from 71. What is
 * not a matter of degree is a HIGH-severity finding: a page error, a console
 * error, a file that never arrived, an image that never drew. Any one of those
 * surviving the self-repair means the thing does not work.
 */
import fs from 'fs';
import path from 'path';

const SRC = () => fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf-8');
const AUDIT = () => fs.readFileSync(path.join(__dirname, '..', 'core', 'quality', 'app-audit.ts'), 'utf-8');

describe('what counts as broken is a severity, not a score', () => {
    it('the four failures that mean «it does not work» are all high severity', () => {
        const src = AUDIT();
        for (const id of ['page_errors', 'console_errors', 'failed_requests', 'dead_images']) {
            const at = src.indexOf(`id: '${id}'`);
            expect(at).toBeGreaterThan(0);
            expect(src.slice(at, at + 80)).toContain("severity: 'high'");
        }
    });

    it('and cosmetics are not — a small tap target does not block a delivery', () => {
        const src = AUDIT();
        for (const id of ['dead_links', 'small_targets']) {
            const at = src.indexOf(`id: '${id}'`);
            expect(src.slice(at, at + 80)).toContain("severity: 'medium'");
        }
    });

    it('the builder collects them AFTER the self-repair, from the final audit', () => {
        const src = SRC();
        const blockers = src.indexOf('const blockers =');
        const repair = src.indexOf('audit = after;');
        expect(blockers).toBeGreaterThan(0);
        expect(blockers).toBeGreaterThan(repair);   // the surviving ones, not the original ones
        expect(src.slice(blockers, blockers + 160)).toMatch(/f\.severity === 'high'/);
    });
});

describe('and the message leads with it', () => {
    it('the warning comes BEFORE the score and the file list', () => {
        const src = SRC();
        const at = src.indexOf('const qaBlock = (() => {');
        const block = src.slice(at, src.indexOf('const message = isAr', at));
        expect(block.indexOf('لا يعمل كما ينبغي')).toBeLessThan(block.indexOf('formatAudit(audit, isAr)'));
        expect(block).toMatch(/does NOT work properly/);
    });

    it('names each blocking finding in words', () => {
        const src = SRC();
        const at = src.indexOf('const blockers =');
        const block = src.slice(at, at + 2200);
        expect(block).toMatch(/for \(const f of blockers\) lines\.push\(`   • \$\{f\.detail\}`\)/);
    });

    it('and offers the one command that acts on exactly those', () => {
        expect(SRC()).toMatch(/أصلح ما تبقّى/);
    });

    it('the headline stops claiming more than it earned — in both languages', () => {
        const src = SRC();
        expect(src).toMatch(/blockers\.length \? 'بُني مشروع React وتجمّع — لكنه سُلّم بعيوب باقية'/);
        expect(src).toMatch(/blockers\.length \? 'A React project that compiles — delivered WITH open defects'/);
    });

    it('and a clean build is not tarnished — the warning is conditional', () => {
        const src = SRC();
        const at = src.indexOf('const qaBlock = (() => {');
        const block = src.slice(at, at + 900);
        expect(block).toMatch(/if \(blockers\.length\) \{/);
    });

    it('the terminal says it too, so it is in the log he pastes', () => {
        expect(SRC()).toMatch(/DELIVERED WITH \$\{blockers\.length\} BLOCKING FINDING\(S\)/);
    });
});
