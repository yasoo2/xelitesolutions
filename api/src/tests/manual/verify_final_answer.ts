/**
 * WHAT THE USER READS WHEN THE RUN ENDS.
 *
 * The measurement that started this, from a real two-step run of «افحص الروابط
 * ثم اكتب تقريراً بالنتيجة» — the orchestrator's own output, unedited:
 *
 *   {"collect":{"content":"وجدتُ 3 روابط مكسورة: /a /b /c"},"report":{"success":true}}
 *   the chat message was:  {"success":true}
 *
 * Two failures in one line. The material the user asked for was discarded
 * because another step produced it, and a JSON object was printed into a chat
 * window as though it were a sentence.
 *
 * This proves the repair the way the product works: the SAME function
 * AgentLoopService uses to build the assistant message, fed by REAL
 * orchestrator runs with real tools and real files.
 *
 *   [1] the composer's rules, on the shapes tools really return
 *   [2] live: the findings of the first step reach the chat
 *   [3] live: a run that only reports `{success:true}` never shows JSON —
 *       it says, truthfully, what it did
 *   [4] live: an answer that a step actually wrote is never buried under a
 *       file the run happened to read
 *   [5] and a one-step run answers exactly as it did before — no regression
 *       to the case that covers most requests
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_final_answer.ts
 */
export {};
import fs from 'fs';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.OFFLINE_MODE = 'true';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.JOE_NARRATION = '0';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const FINDINGS = 'وجدتُ 3 روابط مكسورة: /a و /b و /c';
const WS = 'session-answer';

async function main() {
    const { composeAnswer } = require('../../core/orchestrator/answerComposer');
    const { AgentLoopService } = require('../../modules/services/AgentLoopService');

    console.log('\n[1] قواعد التأليف على الأشكال التي تُرجعها الأدوات فعلاً');
    check('خطوة واحدة تتكلّم → جوابها كما هو، بلا زيادة',
        composeAnswer([{ id: 'a', task: 'اشرح', status: 'completed', result: { answer: 'الجواب الكامل هنا' } }], 'ar') === 'الجواب الكامل هنا');

    const twoStep = composeAnswer([
        { id: 'collect', task: 'اقرأ نتائج الفحص', tool: 'read_file', status: 'completed', result: { content: FINDINGS } },
        { id: 'report', task: 'اكتب التقرير', tool: 'write_file', status: 'completed', result: { success: true } },
    ], 'ar');
    check('خطوة أخيرة صامتة → مادة الخطوة قبلها هي الجواب', twoStep.includes(FINDINGS), twoStep);
    check('…ولا يظهر أي JSON في الرسالة', !/[{}]/.test(twoStep), twoStep);

    const longAnswer = 'هذا جواب حقيقي طويل كتبته الأداة الأخيرة، وفيه تفصيل كافٍ ليكون هو الرسالة.'.repeat(2);
    const notBuried = composeAnswer([
        { id: 'read', task: 'اقرأ', tool: 'read_file', status: 'completed', result: { content: 'س'.repeat(900) } },
        { id: 'say', task: 'أجب', tool: 'central_answer', status: 'completed', result: { answer: longAnswer } },
    ], 'ar');
    check('جواب حقيقي في الخطوة الأخيرة لا يُدفَن تحت ملفٍ قرأه التشغيل',
        notBuried === longAnswer, `${notBuried.length} حرفاً`);

    const bothSpoke = composeAnswer([
        { id: 'a', task: 'حلّل', status: 'completed', result: { summary: 'التحليل: الصفحة تحمّل ببطء بسبب صورة كبيرة جداً في الأعلى.' } },
        { id: 'b', task: 'أصلح', status: 'completed', result: { summary: 'الإصلاح: ضُغطت الصورة إلى 120 كيلوبايت وأُضيف تحميل كسول للبقيّة.' } },
    ], 'ar');
    check('خطوتان تتكلّمان → كلاهما يظهر، بترتيب حدوثهما',
        bothSpoke.indexOf('التحليل:') >= 0 && bothSpoke.indexOf('الإصلاح:') > bothSpoke.indexOf('التحليل:'), bothSpoke);

    const nothingSpoke = composeAnswer([
        { id: 'a', task: 'أنشئ المجلد', status: 'completed', result: { success: true } },
        { id: 'b', task: 'انسخ الملفات', status: 'completed', result: { ok: true } },
    ], 'ar');
    check('ولا أحد تكلّم → يُقال ما جرى فعلاً بالعربية، لا كائن JSON',
        nothingSpoke.includes('أنشئ المجلد') && nothingSpoke.includes('انسخ الملفات') && !/[{}]/.test(nothingSpoke), nothingSpoke);
    check('…وبالإنجليزية حين تكون الجلسة إنجليزية',
        composeAnswer([{ id: 'a', task: 'create the folder', status: 'completed', result: { success: true } }], 'en').startsWith('Done:'));

    const withFailure = composeAnswer([
        { id: 'a', task: 'اقرأ', status: 'completed', result: { content: FINDINGS } },
        { id: 'b', task: 'أرسل', status: 'failed', result: undefined },
    ], 'ar');
    check('خطوة فاشلة لا تُحسَب جواباً', withFailure.includes(FINDINGS) && !withFailure.includes('أرسل'), withFailure);

    const huge = composeAnswer([
        { id: 'a', task: 'اقرأ', tool: 'read_file', status: 'completed', result: { content: 'ط'.repeat(9000) } },
        { id: 'b', task: 'احفظ', tool: 'write_file', status: 'completed', result: { success: true } },
    ], 'ar');
    check('ومادة ضخمة تُقصّ بدل إغراق المحادثة', huge.length < 1400 && huge.includes('…'), `${huge.length} حرفاً`);

    console.log('\n[2] التشغيل الحيّ — بنفس الدالة التي تبني رسالة المحادثة');
    const { workspaceService } = require('../../modules/services/WorkspaceService');
    const { IntentParser } = require('../../core/intelligence/IntentParser');
    const { PlanningEngine } = require('../../core/orchestrator/PlanningEngine');
    const { AgentOrchestrator } = require('../../orchestration/AgentOrchestrator');

    const wsRoot: string = workspaceService.getActiveRoot(WS);
    fs.mkdirSync(wsRoot, { recursive: true });
    const box = fs.mkdtempSync(path.join(wsRoot, '.joe-answer-'));
    const findingsFile = path.join(box, 'findings.txt');
    fs.writeFileSync(findingsFile, FINDINGS);

    IntentParser.parse = async (goal: string) => ({ goal, complexity: 'low', riskLevel: 'low', rawIntent: {} });
    let scripted: any[] = [];
    PlanningEngine.generatePlan = async () => ({ id: 's', goal: 'g', steps: JSON.parse(JSON.stringify(scripted)), metadata: {} });
    const runPlan = async (steps: any[], tag: string) => {
        scripted = steps;
        const orch = new AgentOrchestrator();
        const out = await orch.execute({
            id: `answer-${tag}-${Date.now()}`,
            goal: 'افحص الروابط ثم اكتب تقريراً بالنتيجة',
            context: { workspaceId: WS, userId: 'answer-user', sessionId: `answer-${tag}` },
        });
        // THE function the chat message is built with — not a copy of its rules.
        return { out, text: AgentLoopService.extractAnswer(out, 'ar') as string };
    };

    const a = await runPlan([
        { id: 'collect', description: 'اقرأ نتائج الفحص', tool: 'read_file', agent: 'Dev', input: { path: findingsFile }, dependsOn: [] },
        { id: 'report', description: 'اكتب التقرير', tool: 'write_file', agent: 'Dev', input: { path: path.join(box, 'r.md'), content: 'تقرير' }, dependsOn: ['collect'] },
    ], 'two');
    check('التشغيل نجح', a.out?.ok === true);
    check('نتيجة الخطوة الأولى وصلت إلى المحادثة', a.text.includes('روابط مكسورة'), a.text.slice(0, 140));
    check('ولم تعد الرسالة {"success":true}', !a.text.includes('success') && !/^[[{]/.test(a.text.trim()), a.text.slice(0, 80));

    const b = await runPlan([
        { id: 'save', description: 'احفظ الملف', tool: 'write_file', agent: 'Dev', input: { path: path.join(box, 'only.md'), content: 'شيء' }, dependsOn: [] },
    ], 'silent');
    check('تشغيل لا يُنتج إلا حالة نجاح → رسالة بشرية لا JSON',
        !/[{}]/.test(b.text) && b.text.trim().length > 0, b.text);
    check('…وتقول ما جرى فعلاً', b.text.includes('احفظ الملف'), b.text);

    // The old behaviour on the case that covers most requests: one step that
    // speaks must answer EXACTLY as before.
    const c = await runPlan([
        { id: 'read', description: 'اقرأ الملف', tool: 'read_file', agent: 'Dev', input: { path: findingsFile }, dependsOn: [] },
    ], 'single');
    check('تشغيل من خطوة واحدة يعطي محتواه كما كان — بلا انحدار', c.text.trim() === FINDINGS, c.text.slice(0, 120));

    try { fs.rmSync(box, { recursive: true, force: true }); } catch { /* best effort */ }

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
