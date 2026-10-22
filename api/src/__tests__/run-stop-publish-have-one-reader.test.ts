/**
 * RUN, STOP AND PUBLISH HAVE ONE READER — and the scorer asks it.
 *
 * Measured through generatePlan on 917c70e, with no provider configured:
 *
 *     how do I run the project   → capability match → project_run, project_stop
 *     انشر مقالاً عن القهوة       → capability match → deploy_pages, deploy_project
 *
 * The planner's own lifecycle guards had already refused both — a question
 * describes a topic, an article is not a site. The capability scorer, asked
 * later, re-claimed them. Before 97fa9f0d the same requests looked green only
 * because the model call hung past the suite's 1.5 s race; once the router
 * failed fast, the real route showed. A guard that passes on a hang is not a
 * guard, so these assertions read the decision itself, with no timer.
 */
import { capableTools, capabilityChain } from '../core/orchestrator/capability-match';
import { lifecycleOrder, LIFECYCLE_FAMILY } from '../core/orchestrator/lifecycle-order';

const names = (r: string) => capableTools(r, 4).map(c => c.name);
const LIFECYCLE = Object.keys(LIFECYCLE_FAMILY);

describe('the scorer never re-claims what the lifecycle guards refused', () => {
    it.each([
        ['a how-to question', 'how do I run the project'],
        ['an article, not a site', 'انشر مقالاً عن القهوة'],
        ['a blog post, not a site', 'انشر تدوينة عن موقعي'],
        ['a question in Arabic', 'كيف أشغّل المشروع؟'],
    ])('NEGATIVE — %s: no lifecycle tool', (_why, request) => {
        expect(lifecycleOrder(request)).toBeNull();
        expect(names(request).filter(n => LIFECYCLE.includes(n))).toEqual([]);
    });

    it.each([
        ['run', 'شغّل المشروع', 'project_run'],
        ['stop', 'أوقف الخادم', 'project_stop'],
        ['publish a site', 'انشر الموقع', 'deploy_pages'],
        ['deploy', 'deploy the project to github pages', 'deploy_pages'],
    ])('POSITIVE — an order the guards accept still reaches its tool: %s', (_why, request, tool) => {
        expect(lifecycleOrder(request)).toBe(tool);
    });

    it('POSITIVE — a chain keeps a lifecycle step its own clause orders', () => {
        expect(capabilityChain('خطّط المشروع ثم انشره على الاستضافة').map(c => c.name))
            .toEqual(['project_planner', 'deploy_pages']);
    });

    it('PROPERTY — every lifecycle tool the scorer returns is one the reader names', () => {
        const requests = [
            'how do I run the project', 'شغّل المشروع', 'انشر مقالاً', 'انشر الموقع', 'أوقف الخادم',
            'publish a blog post about coffee', 'deploy my app', 'ابحث عن كيفية تشغيل المشروع',
            'ابنِ وشغّل المشروع', 'what does project_run do?', 'host the site', 'اقفل السيرفر',
        ];
        for (const r of requests) {
            for (const n of names(r).filter(x => LIFECYCLE.includes(x))) {
                expect([r, LIFECYCLE_FAMILY[n]]).toEqual([r, lifecycleOrder(r)]);
            }
        }
    });
});
