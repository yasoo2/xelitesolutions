/**
 * «اختبر جميع الحلقات وتأكد أنها متصلة بشكل صحيح»
 *
 * Running all fourteen loops live found two wires cut, and both were cut in
 * the same way: a path that exists, is tested, and is simply never REACHED
 * from the words a person actually types.
 *
 *   1. «اقرأ رسائل نموذج التواصل» — the messages visitors left in the contact
 *      form of the site Joe built him. The word «رسائل» was owned outright by
 *      the Gmail fast-path, so a question about his own site came back asking
 *      him to connect a Google account he never mentioned. The form inbox knew
 *      the verbs اعرض/شوف/كم/هل and not اقرأ — the plainest one of them.
 *
 *   2. «غيّر اسم الموقع إلى …» — the first thing anyone says after seeing
 *      their build. It had no deterministic path at all: the row editor looks
 *      for a NAMED row, finds none, and the comment there says a rowless
 *      «اسم» request «belongs to the model path below». So the simplest edit
 *      in the product needed a network, and on a machine with no key it
 *      answered «لم أجد ما يطابق الطلب» about a name sitting in one line.
 *
 * This file holds both wires down, from both ends.
 */
import fs from 'fs';
import path from 'path';
import { SITE_INBOX, PlanningEngine } from '../core/orchestrator/PlanningEngine';

const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf-8');
const PLANNER = read('core', 'orchestrator', 'PlanningEngine.ts');
const EDIT = read('modules', 'tools', 'definitions', 'ProjectEditTool.ts');

describe('«رسائل» belongs to two worlds, and the site\'s is one of them', () => {
    it('the site\'s own inbox is recognised, in either word order', () => {
        for (const s of [
            'اقرأ رسائل نموذج التواصل',
            'اعرض رسائل الموقع',
            'كم رسالة وصلت من نموذج التواصل',
            'رسائل الزوار',
            'show me the contact form messages',
            'form submissions',
        ]) expect(SITE_INBOX.test(s)).toBe(true);
    });

    /**
     * The guard has to be narrow. If «رسائل» alone matched, the fix would
     * break the Gmail loop to repair the inbox loop — trading one cut wire
     * for another.
     */
    it('and his actual mailbox is NOT — the guard stays narrow', () => {
        for (const s of [
            'اقرأ بريدي',
            'اعرض رسائلي',
            'كم رسالة عندي في الجيميل',
            'أرسل رسالة إلى أحمد',
            'read my email',
        ]) expect(SITE_INBOX.test(s)).toBe(false);
    });

    it('the Gmail fast-path steps aside for it, alongside its other four guards', () => {
        expect(PLANNER).toMatch(/const siteInbox = SITE_INBOX\.test\(probe\);/);
        expect(PLANNER).toMatch(/&& !pageInteraction && !siteInbox\) \{/);
    });

    it('and the inbox path answers to «اقرأ» — the verb that was missing', () => {
        expect(PLANNER).toMatch(/const inboxAsk = SITE_INBOX\.test\(probe\)/);
        expect(PLANNER).toMatch(/اعرض\|أعرض\|شوف\|كم\|هل\\s\*\(وصل\|فيه\)\|اقرأ\|اقرا\|أقرأ/);
    });

    it('one constant decides both ends, so the two regexes cannot drift apart', () => {
        // Exported, and used in exactly the two places that must agree.
        expect((PLANNER.match(/SITE_INBOX\.test\(probe\)/g) || []).length).toBe(2);
    });
});

describe('THE WIRING: the planner really lands where it says', () => {
    const SESSION = 'jest-loops';
    const plan = async (goal: string, withSession = false) => {
        const p = await PlanningEngine.generatePlan(
            { intent: { goal } as any }, undefined, withSession ? { sessionId: SESSION } : undefined);
        return (p?.steps || []).map((s: any) => String(s?.tool || ''));
    };

    beforeAll(() => {
        // The inbox and undo routes are gated on an ACTIVE project — refusing
        // to read the inbox of a site that does not exist is correct, so the
        // route is only meaningful with one.
        (global as any).joeProjects = { [SESSION]: { dir: '/tmp/jest-project', at: Date.now() } };
    });
    afterAll(() => { delete (global as any).joeProjects; });

    it('«اقرأ رسائل نموذج التواصل» reaches the site\'s inbox', async () => {
        expect(await plan('اقرأ رسائل نموذج التواصل', true)).toEqual(['form_inbox']);
    });

    it('…and «اقرأ بريدي» still reaches Google', async () => {
        expect(await plan('اقرأ بريدي', true)).toEqual(['google_account']);
    });

    it('«غيّر اسم الموقع إلى …» reaches the surgical editor', async () => {
        expect(await plan('غيّر اسم الموقع إلى «دار الرفق»', true)).toContain('project_edit');
    });

    it('«ارجع للنسخة السابقة» reaches the undo', async () => {
        expect(await plan('ارجع للنسخة السابقة', true)).toContain('project_undo');
    });
});

describe('renaming the site never needed a model', () => {
    it('it is decided before the model path, not after it', () => {
        expect(EDIT.indexOf('THE COMMONEST EDIT OF ALL'))
            .toBeLessThan(EDIT.indexOf('── the general path: SEARCH/REPLACE from the model'));
    });

    it('it needs BOTH a site word and a name word — «غيّر اسم المنتج» is not this', () => {
        expect(EDIT).toMatch(/const siteWord = \/\(الموقع\|موقعي\|التطبيق/);
        expect(EDIT).toMatch(/const nameWord = /);
        expect(EDIT).toMatch(/if \(siteWord && nameWord && val && val\.length <= 60/);
    });

    it('and it only runs when nothing else already handled the request', () => {
        // The row-level editor above owns «غيّر سعر/اسم <صف>»; this path is
        // the rowless case its own comment hands over.
        const at = EDIT.indexOf('THE COMMONEST EDIT OF ALL');
        expect(EDIT.slice(at, at + 1400)).toContain('if (!touched.length) {');
    });

    it('the brand is rewritten in content.js, through the same syntax gate as every other edit', () => {
        expect(EDIT).toMatch(/const next = body\.replace\(\/\(\\n\\s\*brand:\\s\*\)'\[\^'\]\*'\/, `\$1'\$\{safe\}'`\);/);
        expect(EDIT).toMatch(/const gate = syntaxOk\(contentRel, next\);/);
        expect(EDIT).toMatch(/refused\.push\(`\$\{contentRel\}: renaming breaks the syntax/);
    });

    /**
     * A rename that stops at content.js leaves the header saying one name and
     * the browser tab saying the old one — which reads to the user like the
     * edit silently failed.
     */
    it('and in the tab title too, so the rename is not half done', () => {
        expect(EDIT).toMatch(/const htmlAbs = path\.join\(dir, 'index\.html'\);/);
        expect(EDIT).toMatch(/<title>\$\{String\(inner\)\.split\(oldBrand\)\.join\(val\)\}<\/title>/);
        // Only when the old name is actually known — never a blind overwrite.
        expect(EDIT).toMatch(/if \(oldBrand && fs\.existsSync\(htmlAbs\)\)/);
    });

    it('the value is quoted safely — a name with an apostrophe cannot break the file', () => {
        expect(EDIT).toMatch(/\.replace\(\/\\\\\/g, '\\\\\\\\'\)\.replace\(\/'\/g, "\\\\'"\)/);
    });

    it('and it says so in the log: no model was called', () => {
        expect(EDIT).toMatch(/brand edit: \$\{oldBrand \|\| '\(unset\)'\} → \$\{val\} — no model call/);
    });
});
