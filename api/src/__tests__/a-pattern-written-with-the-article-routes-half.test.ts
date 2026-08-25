/**
 *  A PATTERN WRITTEN WITH THE ARTICLE ROUTES HALF THE LANGUAGE.
 *
 *  Measured through generatePlan — the road a request actually takes,
 *  not a helper beside it:
 *
 *      شغّل الخادم   → project_run
 *      شغّل خادم     → central_answer
 *      أوقف الخادم   → project_stop
 *      أوقف خادم     → central_answer
 *
 *  The same sentence, one article apart, and one of them does nothing at
 *  all. «المشروع» already carried its bare twin «مشروع» right beside it
 *  in the same alternation; «النظام», «الخادم», «السيرفر» and «المعاينة»
 *  did not.
 *
 *  «ال» is a PREFIX: a bare form matches both, a prefixed one matches
 *  half, so writing the article into a pattern can only ever subtract.
 *
 *  A tree-wide count of the same shape stands at 107 alternatives across
 *  22 files. They are NOT being changed in bulk — a definite form is
 *  sometimes deliberate, and 107 unverified edits is the fix-by-word-list
 *  the owner forbids, running backwards. Each one gets a measured pair,
 *  and this file is the first.
 *
 *  A CORRECTION RECORDED HERE BECAUSE IT COST A WRONG DIAGNOSIS:
 *  my first probe called capabilityPlan directly and reported that
 *  «انشر مقالاً» routed to deploy_pages — the very collision the code's
 *  own comment says was fixed. It was measuring a function the request
 *  does not travel through. Through generatePlan the guard holds, and it
 *  is asserted below so the correction cannot be lost.
 */
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';

const routeOf = async (goal: string): Promise<string> => {
    const plan: any = await (PlanningEngine as any).generatePlan(
        { intent: { goal, type: 'action', entities: {} } }, 'guard', {});
    return String(plan?.steps?.[0]?.tool || '—');
};

describe('the same order works with the article and without it', () => {
    const PAIRS: Array<[string, string, string]> = [
        ['a server, run', 'شغّل الخادم', 'شغّل خادم'],
        ['a server, stopped', 'أوقف الخادم', 'أوقف خادم'],
        ['a system, run', 'شغّل النظام', 'شغّل نظام'],
        ['a «سيرفر», run', 'شغّل السيرفر', 'شغّل سيرفر'],
    ];
    for (const [name, definite, bare] of PAIRS) {
        it(name, async () => {
            const withArticle = await routeOf(definite);
            const without = await routeOf(bare);
            expect(withArticle).not.toBe('central_answer');
            expect(without).toBe(withArticle);
        }, 120000);
    }
});

describe('and the same prefix, one line down: publishing', () => {
    it('«انشر موقع» publishes, as «انشر الموقع» always did', async () => {
        //  Measured before the fix:
        //      انشر الموقع  → deploy_pages
        //      انشر موقع    → browser_launch
        //  One article apart, and the bare one opened a BROWSER instead
        //  of publishing anything: the deploy guard did not match, so the
        //  request fell through to the browser router, which takes «انشر»
        //  and a noun as something to go and look at. The definite form
        //  was not more correct — it was accidentally protected.
        const withArticle = await routeOf('انشر الموقع');
        expect(withArticle).toBe('deploy_pages');
        expect(await routeOf('انشر موقع')).toBe(withArticle);
    }, 120000);

    it('…and publishing an ARTICLE is still not publishing a site', async () => {
        //  The negative the widened pattern must not swallow: the
        //  content guard stands in front of it.
        expect(await routeOf('انشر مقالاً')).toBe('central_answer');
        expect(await routeOf('انشر تدوينة عن موقعي')).toBe('central_answer');
    }, 120000);
});

describe('…and nothing else became a project', () => {
    it('a washing machine is not a server', async () => {
        expect(await routeOf('شغّل الغسالة')).toBe('central_answer');
    }, 120000);

    it('a greeting is not an order', async () => {
        expect(await routeOf('مرحبا')).toBe('central_answer');
    }, 120000);

    it('publishing an article is still not deploying a site', async () => {
        //  The code's own comment names this collision as fixed. It is —
        //  through this entry point. A probe on capabilityPlan said
        //  otherwise and was measuring the wrong road.
        expect(await routeOf('انشر مقالاً')).toBe('central_answer');
    }, 120000);
});
