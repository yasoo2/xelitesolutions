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
import { recoverPackagedQaAuth } from '../modules/tools/definitions/ProjectRepairTool';

const ENGINE = () => fs.readFileSync(
    path.join(__dirname, '..', 'core', 'orchestrator', 'PlanningEngine.ts'), 'utf-8');
const TOOL = () => fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectRepairTool.ts'), 'utf-8');
const REACT = () => fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf-8');

describe('the tool the message points at really exists', () => {
    it('can mint an in-memory QA token from a packaged project after Joe restarts', async () => {
        const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'joe-qa-auth-'));
        fs.writeFileSync(path.join(dir, 'db.js'), "module.exports={db:{listUsers:()=>[{id:7,email:'owner@test.local',role:'owner'}]}};");
        fs.writeFileSync(path.join(dir, 'auth.js'), "module.exports={signToken:(user)=>'qa-token-'+user.id};");
        try {
            await expect(recoverPackagedQaAuth(dir)).resolves.toMatchObject({
                token: 'qa-token-7', role: 'owner', tokenStorageKey: 'joe:auth', route: '/',
            });
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('project_repair is registered', () => {
        const t = (tools as any[]).find(x => x.name === 'project_repair');
        expect(t).toBeTruthy();
        expect(t.permissions.length).toBeGreaterThan(0);   // the workspace gate needs these
        expect(t.rateLimitPerMinute).toBeGreaterThan(0);
    });

    it('and the blocked message explains that Joe already attempted repair', () => {
        const src = REACT();
        const at = src.indexOf('const blockers =');
        //  ⛔ THE WINDOW IS THE REGION, NOT A CHARACTER COUNT.
        //
        //  This read slice(at, at + 2200) and went red the moment comments
        //  were added ABOVE the line it looks for -- the code was untouched
        //  and the guard failed anyway, which is a guard measuring the wrong
        //  thing. A magic length is a criterion nobody can reason about: it
        //  passes or fails on how much prose happens to sit nearby.
        //
        //  The region ends where the next named thing begins, so it grows and
        //  shrinks with the code it is about.
        expect(src.slice(at, src.indexOf('const message = isAr', at))).toMatch(/لم أدّعِ 100%/);
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
        expect(src).toMatch(/if \(\(repairRemaining \|\| repairExisting\) && !!repairProjectDir\) \{/);
    });
});

describe('and the repair itself is honest', () => {
    it('measures before, repairs, rebuilds, and measures every paid round again', () => {
        const src = TOOL();
        const before = src.indexOf('const before = await auditBuiltApp');
        const loop = src.indexOf('improveUntilItStops');
        const repair = src.indexOf('repairRound(');
        const rebuild = src.indexOf('const rebuild = async');
        const measure = src.indexOf('const measure = async');
        expect(before).toBeGreaterThan(0);
        expect(loop).toBeGreaterThan(before);
        expect(repair).toBeGreaterThan(before);
        expect(rebuild).toBeGreaterThan(before);
        expect(measure).toBeGreaterThan(before);
    });

    it('never claims a gain it did not measure and rolls back a non-gain', () => {
        const src = TOOL();
        expect(src).toMatch(/const finalMeasurement = loop\.final \|\| before/);
        expect(src).toMatch(/const gained = !finalMeasurement\.skipped && finalMeasurement\.score > before\.score/);
        expect(src).toMatch(/rollback,/);
        expect(src).toMatch(/stoppedBecause: loop\.stoppedBecause/);
    });

    it('refuses honestly when there is nothing to repair', () => {
        const src = TOOL();
        expect(src).toMatch(/لا مشروع مبنيّ في هذه الجلسة/);
        expect(src).toMatch(/البناء لم يكتمل/);
        expect(src).toMatch(/لا شيء لأصلحه/);
    });

    it('accepts the evidence-selected static root instead of requiring dist/index.html', () => {
        const src = TOOL();
        expect(src).toContain("findActiveBuiltProject(sessionId, input?.projectDir)");
        expect(src).toContain('auditBuiltApp(auditDir');
        expect(src).not.toContain("const dist = path.join(dir, 'dist')");
    });

    it('audits shared /artifacts assets from the real artifact root', () => {
        const src = TOOL();
        expect((src.match(/artifactRootDir:\s*\{/g) || []).length).toBe(1);
        expect((src.match(/artifactRootDir,/g) || []).length).toBe(2);
        expect(src).toContain("process.env.ARTIFACT_DIR || '/tmp/joe-artifacts'");
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

    it('blocks honestly when anything remains instead of downgrading it', () => {
        const src = TOOL();
        expect(src).toMatch(/ok: remaining\.length === 0/);
        expect(src).toMatch(/لم أقبل الإصلاح/);
        expect(src).toMatch(/verificationFailed: remaining\.length > 0/);
    });
});
