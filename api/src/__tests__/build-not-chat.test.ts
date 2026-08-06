/**
 * «هذا غباء فاحش» — and he is right.
 *
 * He asked, in English:
 *
 *     Build a world-class e-commerce platform similar to Shopify.
 *     Features: Multi-vendor marketplace … Payments … Mobile app …
 *     Generate complete production-ready code.
 *
 * Joe answered with FIFTEEN nodes of `central_answer`:
 *
 *     «Good evening, Younes. As we embark on building a world-class
 *      e-commerce platform, I'll outline the optimal project structure…»
 *
 * Not one file. Not one line of code. Then it failed with `central_answer was
 * called without a question`, and its "repair" — remembered as PROVEN 2x —
 * was three more essays.
 *
 * Three defects, all pinned here.
 *
 * 1. The build gate is `buildVerb && webNoun`. `webNoun`'s English list was
 *    `page|site|website|web app|landing|portfolio|dashboard|form|store|shop|
 *    html|ui|interface` — no «platform», no «marketplace», no bare «app», no
 *    «system» — while the Arabic branch beside it has known «نظام», «منصّة»
 *    and «أداة» for months. His request matched nothing, the gate stayed
 *    shut, and the generic planner took a production-ready platform request.
 *
 * 2. Nothing refused a plan built entirely from tools that only talk.
 *
 * 3. And an essay always "succeeds", so the repair that followed a real
 *    failure was stamped a proven cure and prescribed again.
 */
import fs from 'fs';
import path from 'path';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';

/** His request, verbatim. */
const HIS = `Build a world-class e-commerce platform similar to Shopify.

Features:

Multi-vendor marketplace AI product generation Inventory management Payments Shipping Coupons Loyalty program Mobile app Analytics Customer support Marketing automation SEO Multi-language Multi-currency Generate complete production-ready code.`;

const ENGINE = () => fs.readFileSync(
    path.join(__dirname, '..', 'core', 'orchestrator', 'PlanningEngine.ts'), 'utf-8');

describe('an English build request reaches the builders', () => {
    it('recognises his request as a build at all', () => {
        expect(PlanningEngine.looksLikeBuild(HIS)).toBe(true);
    });

    it('and scopes it as a system — it owns payments, inventory and orders', () => {
        expect(PlanningEngine.classifyBuildScope(HIS)).toBe('system');
    });

    it.each([
        'Build a SaaS platform for clinics',
        'Create a multi-vendor marketplace',
        'Make a mobile app for deliveries',
        'Develop an inventory system',
        'Generate a CRM tool',
        'build an admin panel',
        'create a booking portal',
        'code a backend API for orders',
    ])('and so does: %s', (goal) => {
        expect(PlanningEngine.looksLikeBuild(goal)).toBe(true);
    });

    it('the English noun list finally matches the Arabic one', () => {
        const src = ENGINE();
        const at = src.indexOf('const webNoun =');
        const block = src.slice(at, at + 900);
        for (const noun of ['platform', 'marketplace', 'system', 'app', 'tool', 'service', 'portal', 'saas']) {
            expect(block).toContain(noun);
        }
    });

    it('but plain conversation is still conversation', () => {
        for (const chat of ['ما رأيك في هذا التصميم؟', 'What is a marketplace?',
            'اشرح لي الفرق بين React و Vue', 'hello']) {
            expect(PlanningEngine.looksLikeBuild(chat)).toBe(false);
        }
    });
});

describe('a plan made only of talking is refused for a build', () => {
    it('the answering tools are named, and central_answer is among them', () => {
        expect(PlanningEngine.ANSWER_ONLY.has('central_answer')).toBe(true);
        expect(PlanningEngine.ANSWER_ONLY.has('ask_user')).toBe(true);
        // …and a tool that really does something is NOT.
        for (const doer of ['react_project', 'api_project', 'web_page_builder', 'shell_execute', 'file_write']) {
            expect(PlanningEngine.ANSWER_ONLY.has(doer)).toBe(false);
        }
    });

    it('the planner refuses such a plan and hands the request to the builders', () => {
        const src = ENGINE();
        const at = src.indexOf('const talkOnly = steps.length > 0');
        expect(at).toBeGreaterThan(0);
        const block = src.slice(at, at + 1600);
        expect(block).toMatch(/looksLikeBuildRequest\(String\(intent\.goal/);
        expect(block).toMatch(/tool: 'api_project'/);
        expect(block).toMatch(/tool: scope === 'page' \? 'web_page_builder' : 'react_project'/);
        // The system case builds the backend first, and the app depends on it.
        expect(block).toMatch(/dependsOn: scope === 'system' \? \['backend'\] : \[\]/);
    });

    it('and says so out loud rather than silently swapping the plan', () => {
        expect(ENGINE()).toMatch(/talking step\(s\) for a BUILD — refused/);
    });

    it('a mixed plan — one real step among the talk — is left alone', () => {
        // `every` is the operative word: one doer means the model did plan work.
        const src = ENGINE();
        const at = src.indexOf('const talkOnly = steps.length > 0');
        expect(src.slice(at, at + 200)).toMatch(/steps\.every\(/);
    });
});

describe('a cure made of prose is never remembered as proven', () => {
    const ORCH = () => fs.readFileSync(
        path.join(__dirname, '..', 'orchestration', 'AgentOrchestrator.ts'), 'utf-8');

    it('the repair note is inspected for a step that actually did something', () => {
        const src = ORCH();
        expect(src).toMatch(/const curedByDoing = String\(node\.repairNote/);
        expect(src).toMatch(/!PlanningEngine\.ANSWER_ONLY\.has\(tool\)/);
    });

    it('and nothing is recorded when every step in it only answered', () => {
        const src = ORCH();
        const at = src.indexOf('const curedByDoing');
        const block = src.slice(at, at + 900);
        expect(block).toMatch(/&& curedByDoing\) \{\s*\n\s*repairMemory\.recordRepair/);
        expect(block).toMatch(/not remembering a repair made only of answers/);
    });

    it('the rule itself, on his exact repair note', () => {
        const his = 'central_answer: Formulate a question for central_answer to address the missing URL issue'
            + ' | project_planner: Re-plan the project based on the answer from central_answer';
        const doer = his.split('|').some(p => {
            const tool = p.split(':')[0].trim();
            return tool && !PlanningEngine.ANSWER_ONLY.has(tool);
        });
        // `project_planner` plans — it writes nothing — but it is not in the
        // answer-only set, so this note WOULD still be kept. What must never
        // be kept is a note that is nothing but central_answer.
        expect(doer).toBe(true);
        const pureTalk = 'central_answer: Formulate a question | ask_user: confirm the URL';
        expect(pureTalk.split('|').some(p => {
            const tool = p.split(':')[0].trim();
            return tool && !PlanningEngine.ANSWER_ONLY.has(tool);
        })).toBe(false);
    });
});
