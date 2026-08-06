/**
 * «أصلح ما تبقّى» — THE PROMISE NEEDED A DOOR.
 *
 * When a build is handed over with defects still open, its message now ends:
 *
 *     ↳ قل «أصلح ما تبقّى» وسأفتح المتصفّح على هذه بالذات.
 *
 * Until this batch that sentence opened onto a wall. The phrase carried no
 * edit verb the router knew, so it fell through to the surgical text editor —
 * a model asked to rewrite something nobody had told it about. A sentence that
 * offers a command which does not exist spends trust on nothing.
 */
import fs from 'fs';
import path from 'path';
import { tools } from '../modules/tools/registry';

const ENGINE = () => fs.readFileSync(
    path.join(__dirname, '..', 'core', 'orchestrator', 'PlanningEngine.ts'), 'utf-8');
const TOOL = () => fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectRepairTool.ts'), 'utf-8');
const REACT = () => fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf-8');

describe('the tool the message points at really exists', () => {
    it('project_repair is registered', () => {
        const t = (tools as any[]).find(x => x.name === 'project_repair');
        expect(t).toBeTruthy();
        expect(t.permissions.length).toBeGreaterThan(0);   // the workspace gate needs these
        expect(t.rateLimitPerMinute).toBeGreaterThan(0);
    });

    it('and the message that offers it is the message that has blockers', () => {
        const src = REACT();
        const at = src.indexOf('const blockers =');
        expect(src.slice(at, at + 2200)).toMatch(/أصلح ما تبقّى/);
    });
});

describe('the phrase routes to it, and nothing else does', () => {
    /** The router's own predicate, lifted verbatim. */
    const hits = (probe: string) =>
        /(أصلح|اصلح|صلّ?ح)\s*(لي\s*)?(ما\s*)?(تبقّ?ى|بقي|المتبقّ?ي|الباقي|العيوب|الأعطال)/.test(probe)
        || /\bfix\s+(what(?:'?s| is)\s+left|the\s+(rest|remaining|defects|blockers))\b/i.test(probe);

    it.each([
        'أصلح ما تبقّى', 'اصلح ما تبقى', 'صلح لي الباقي', 'أصلح العيوب', 'اصلح الأعطال',
        'fix what is left', "fix what's left", 'fix the remaining', 'Fix The Defects',
    ])('routes: %s', (p) => { expect(hits(p)).toBe(true); });

    it.each([
        'غيّر لون الأزرار إلى الأخضر',
        'ضف صورة للمنتج الأول',
        'ابنِ لي متجراً جديداً',
        'fix the price of the second product',   // a real edit, not the repair command
        'ما رأيك في التصميم؟',
    ])('leaves alone: %s', (p) => { expect(hits(p)).toBe(false); });

    it('the route is deterministic and comes before the surgical editor', () => {
        const src = ENGINE();
        const repair = src.indexOf('const repairRemaining =');
        const edit = src.indexOf("id: 'project_edit',", repair);
        expect(repair).toBeGreaterThan(0);
        expect(edit).toBeGreaterThan(repair);
        expect(src).toMatch(/tool: 'project_repair'/);
    });

    it('and it needs a project — the phrase alone builds nothing', () => {
        const src = ENGINE();
        expect(src).toMatch(/if \(repairRemaining && !!projEntry\) \{/);
    });
});

describe('and the repair itself is honest', () => {
    it('measures before, repairs, rebuilds, measures again', () => {
        const src = TOOL();
        const before = src.indexOf('const before = await auditBuiltApp');
        const repair = src.indexOf('repairAndRebuild(dir');
        const after = src.indexOf('after = await auditBuiltApp');
        expect(before).toBeGreaterThan(0);
        expect(repair).toBeGreaterThan(before);
        expect(after).toBeGreaterThan(repair);
    });

    it('never claims a gain it did not measure', () => {
        const src = TOOL();
        expect(src).toMatch(/const gained = !after\.skipped && after\.score > before\.score/);
        expect(src).toMatch(/لم يتحسّن القياس — أبقيتُ الحكم الأول/);
    });

    it('refuses honestly when there is nothing to repair', () => {
        const src = TOOL();
        expect(src).toMatch(/لا مشروع مبنيّ في هذه الجلسة/);
        expect(src).toMatch(/البناء لم يكتمل/);
        expect(src).toMatch(/لا شيء لأصلحه/);
    });

    it('waits for the panel, exactly as the builder does', () => {
        const src = TOOL();
        const focus = src.indexOf("panel_focus");
        const wait = src.indexOf('waitForPanelWatcher');
        const audit = src.indexOf('const before = await auditBuiltApp');
        expect(focus).toBeGreaterThan(0);
        expect(wait).toBeGreaterThan(focus);
        expect(audit).toBeGreaterThan(wait);
    });

    it('and says what it cannot do, rather than looping on it', () => {
        expect(TOOL()).toMatch(/هذه لا أستطيع إصلاحها وحدي/);
    });
});
