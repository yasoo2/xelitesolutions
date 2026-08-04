/**
 * INSTRUCTIONS ARE NOT THE REQUEST.
 *
 * From the user's own server log, verbatim:
 *
 *   Executing node: build_page (Building: قم ببناء صفحة جميله لشركةادوية ومعدات طبية
 *   [RESPONSE LANGUAGE — NON-NEGOTIABLE]: The user's language is Arabic … never mix a
 *   Latin name into an Arabic sentence.
 *   [ENGINEERING DISCIPLINE — apply when you build launch/update/deploy scripts …]:
 *   1. Dependency freshness … 2. Crash-loop guard … 3. Failure taxonomy …)
 *
 * Joe was asked to BUILD the language contract. Those blocks were concatenated
 * into the goal string, and the goal is what the planner plans, what the node's
 * task says, and what the page builder receives as the thing to make. Every
 * request in that session carried ~500 extra characters of instructions where
 * the subject matter belongs.
 *
 * And the same log shows what it cost, in the provider's own words:
 *
 *   413 Request too large … Requested 31712, Limit 12000 (TPM)
 *   → Dead-brain latch: all providers failed
 *   → the next, perfectly ordinary request failed instantly without being tried
 *
 *   [1] the goal is the user's sentence — nothing else
 *   [2] the instructions still travel, in the context the tools already read
 *   [3] the build tool receives a request it can actually build
 *   [4] and a 413 is «this request was too big», never «the provider is dead»
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_goal_purity.ts
 */
export {};
import fs from 'fs';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';
process.env.JOE_NARRATION = '0';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const FIELD_GOAL = 'قم ببناء صفحة جميله لشركةادوية ومعدات طبية';
const BLOCK_MARKERS = ['[RESPONSE LANGUAGE', '[ENGINEERING DISCIPLINE', '[STANDING USER INSTRUCTIONS'];

async function main() {
    const { AgentLoopService } = require('../../modules/services/AgentLoopService');
    const { AgentOrchestrator } = require('../../orchestration/AgentOrchestrator');

    console.log('\n[1] ما يصل المنسّق: جملة المستخدم وحدها');
    // Intercept the goal exactly where the orchestrator receives it.
    let seen: any = null;
    const realExecute = AgentOrchestrator.prototype.execute;
    AgentOrchestrator.prototype.execute = async function (goal: any) {
        seen = goal;
        return { ok: true, result: 'تم', steps: [] };
    };
    try {
        await AgentLoopService.execute(FIELD_GOAL, {
            sessionId: 'purity', userId: 'purity-user', language: 'ar',
            systemInstructions: 'استعمل الطرفية دائماً قبل البناء.',
        });
    } finally { AgentOrchestrator.prototype.execute = realExecute; }

    check('وصل الطلب إلى المنسّق', !!seen, 'لم يصل');
    console.log(`      (الهدف: «${String(seen?.goal || '').slice(0, 70)}…» — ${String(seen?.goal || '').length} حرفاً)`);
    check('الهدف يحمل جملة المستخدم', String(seen?.goal || '').includes('صفحة جميله'), String(seen?.goal).slice(0, 60));
    for (const m of BLOCK_MARKERS) {
        check(`ولا يحمل «${m}»`, !String(seen?.goal || '').includes(m), String(seen?.goal || '').slice(0, 120));
    }
    check('وطوله معقول — لا 500 حرف تعليمات فوق الطلب',
        String(seen?.goal || '').length < FIELD_GOAL.length + 40, `${String(seen?.goal || '').length}`);

    console.log('\n[2] والتعليمات لم تُفقَد — انتقلت إلى مكانها الصحيح');
    const ins = String(seen?.context?.systemInstructions || '');
    check('عقد اللغة موجود في التعليمات', ins.includes('[RESPONSE LANGUAGE'), ins.slice(0, 80));
    check('وتعليمات المستخدم الدائمة موجودة', ins.includes('استعمل الطرفية'), ins.slice(0, 120));
    check('والأداة التي تصوغ الجواب تقرأها فعلاً',
        fs.readFileSync(path.join(process.cwd(), 'src/modules/tools/definitions/CentralAnswerTool.ts'), 'utf-8')
            .includes('context?.systemInstructions'));

    console.log('\n[3] وأداة البناء تستلم طلباً قابلاً للبناء');
    const { PlanningEngine } = require('../../core/orchestrator/PlanningEngine');
    const plan = await PlanningEngine.generatePlan({ intent: { goal: seen.goal, complexity: 'medium', riskLevel: 'low', rawIntent: {} } });
    const step = plan.steps[0];
    const req = String(step?.input?.request || step?.input?.task || step?.description || '');
    check(`الخطوة: ${step?.tool}`, !!step?.tool);
    for (const m of BLOCK_MARKERS) {
        check(`وطلب الأداة خالٍ من «${m}»`, !req.includes(m), req.slice(0, 100));
    }

    console.log('\n[4] و413 تعني «الطلب كبير» لا «المزوّد ميّت»');
    const router = fs.readFileSync(path.join(process.cwd(), 'src/core/llm/intelligent-router.ts'), 'utf-8');
    check('413 لم تعد تُطفئ المزوّد', /const tooLarge = .*413/.test(router));
    check('و429 وحدها هي التي تُبرّده', /if \(!tooLarge && \/\\\\b429/.test(router) || /!tooLarge/.test(router));
    check('ويُقال ذلك في السجلّ صراحة', /413 = this request was too big/.test(router));

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
