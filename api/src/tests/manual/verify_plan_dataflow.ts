/**
 * DOES A PLAN'S SECOND STEP EVER SEE THE FIRST STEP'S WORK?
 *
 * The executor has understood `{{FROM:<id>}}` for a long time — a placeholder
 * inside a step's input that is replaced with an earlier step's real output.
 * But the planning prompt never taught the syntax, so only two hand-written
 * fast paths ever produced one. Every plan the model wrote carried `dependsOn`
 * as pure ORDERING: «افحص الروابط المكسورة ثم اكتب تقريراً بالنتيجة» ran a scan,
 * threw its findings away, and wrote a file whose content was the words
 * «تقرير بالنتائج». Two steps, never one job.
 *
 * Nothing here is argued. Every claim is a real run:
 *
 *   [1] the shipped planner really carries the rule in its prompt
 *   [2] the graph repair, case by case: dangling edges, self-edges, cycles,
 *       duplicate ids, references that were never declared as dependencies,
 *       references to steps that do not exist — each one used to end a run
 *       («Execution stopped») or to write an empty file, silently
 *   [3] THE LIVE RUN: a real orchestrator, real tools, a real file on disk.
 *       Step one reads a sentinel; step two writes a report and was given no
 *       content at all. The report must contain the sentinel.
 *   [4] the control: when the planner DID author the payload itself, the carry
 *       must keep its hands off — proven by a run whose file comes out with
 *       exactly what was planned and no sentinel in it
 *   [5] a dependency on a step that does not exist must not kill the run
 *   [6] and a reference the planner wrote WITHOUT declaring the edge must still
 *       resolve to the real data — never to an empty string
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_plan_dataflow.ts
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

const SENTINEL = 'SENTINEL-7f3a9c-النتيجة-الحقيقية';
const WS = 'session-dataflow';

async function main() {
    const { PlanningEngine } = require('../../core/orchestrator/PlanningEngine');
    const wire = (steps: any[]) => PlanningEngine.wireDataFlow(steps);

    console.log('\n[1] القاعدة موجودة فعلاً في دماغ المخطِّط لا في وثيقة');
    // The SHIPPED function, not the file: this is the exact prompt builder the
    // model will be handed at run time.
    const plannerSource = String(PlanningEngine.generateDynamicDag);
    check('نصّ التخطيط الحيّ يعلّم صيغة {{FROM:id}}', plannerSource.includes('{{FROM:'));
    check('…ويشترط أن يُعلَن المرجع ضمن dependsOn', /MUST also appear in that step's dependsOn/.test(plannerSource));

    console.log('\n[2] إصلاح الرسم البياني — كل حالة كانت تقتل تشغيلاً كاملاً');
    const dangling = wire([
        { id: 'a', tool: 'central_answer', input: { question: 'q' }, dependsOn: [] },
        { id: 'b', tool: 'write_file', input: { path: 'x.txt', content: 'c' }, dependsOn: ['ghost'] },
    ]);
    check('اعتماد على خطوة غير موجودة يُحذَف — كان يجمّد التشغيل حتى «Execution stopped»',
        dangling[1].dependsOn.length === 0, JSON.stringify(dangling[1].dependsOn));

    const selfDep = wire([
        { id: 'a', tool: 'central_answer', input: {}, dependsOn: [] },
        { id: 'b', tool: 'central_answer', input: {}, dependsOn: ['b', 'a'] },
    ]);
    check('اعتماد الخطوة على نفسها يُحذَف ويبقى الصحيح',
        JSON.stringify(selfDep[1].dependsOn) === JSON.stringify(['a']), JSON.stringify(selfDep[1].dependsOn));

    const cycle = wire([
        { id: 'a', tool: 'central_answer', input: {}, dependsOn: ['c'] },
        { id: 'b', tool: 'central_answer', input: {}, dependsOn: ['a'] },
        { id: 'c', tool: 'central_answer', input: {}, dependsOn: ['b'] },
    ]);
    const edges = cycle.map((s: any) => `${s.id}<-${s.dependsOn.join(',') || '∅'}`).join(' ');
    // Judged the way the executor judges it: run the real readiness rule until
    // nothing new becomes ready. Every node must get its turn — which order the
    // repair chose does not matter, only that the deadlock is gone.
    const schedulable = (steps: any[]): number => {
        const done = new Set<string>();
        for (let i = 0; i < steps.length + 1; i++) {
            const ready = steps.filter(s => !done.has(s.id) && s.dependsOn.every((d: string) => done.has(d)));
            if (!ready.length) break;
            ready.forEach(s => done.add(s.id));
        }
        return done.size;
    };
    check('الحلقة المغلقة تُكسَر فتُجدوَل كل العقد فعلاً', schedulable(cycle) === 3, `${schedulable(cycle)}/3 — ${edges}`);
    check('…وضلع واحد فقط هو الذي ضُحّي به', cycle.reduce((n: number, s: any) => n + s.dependsOn.length, 0) === 2, edges);

    const dupes = wire([
        { id: 'step', tool: 'central_answer', input: {}, dependsOn: [] },
        { id: 'step', tool: 'central_answer', input: {}, dependsOn: [] },
    ]);
    check('معرّفان متطابقان يُفَرَّقان — المجموعة كانت تعدّهما واحداً فلا ينتهي التشغيل أبداً',
        dupes[0].id !== dupes[1].id, `${dupes[0].id} / ${dupes[1].id}`);

    const undeclared = wire([
        { id: 'scan', tool: 'central_answer', input: {}, dependsOn: [] },
        { id: 'save', tool: 'write_file', input: { path: 'r.md', content: '{{FROM:scan}}' }, dependsOn: [] },
    ]);
    check('مرجع بلا اعتماد مُعلَن يصبح اعتماداً حقيقياً — وإلا قُرئ قبل أن تعمل الخطوة (ملف فارغ بصمت)',
        undeclared[1].dependsOn.includes('scan'), JSON.stringify(undeclared[1].dependsOn));

    const ghostRef = wire([
        { id: 'scan', tool: 'central_answer', input: {}, dependsOn: [] },
        { id: 'save', tool: 'write_file', input: { path: 'r.md', content: 'X {{FROM:nowhere}} Y' }, dependsOn: ['scan'] },
    ]);
    check('مرجع إلى خطوة غير موجودة يُعاد توجيهه إلى الاعتماد الحقيقي',
        ghostRef[1].input.content === 'X {{FROM:scan}} Y', ghostRef[1].input.content);
    const ghostAlone = wire([
        { id: 'a', tool: 'central_answer', input: {}, dependsOn: [] },
        { id: 'b', tool: 'write_file', input: { path: 'r.md', content: 'X{{FROM:nowhere}}Y' }, dependsOn: [] },
    ]);
    check('…وإن لم يكن له اعتماد أصلاً يُزال بدل أن يُكتب حرفياً في الملف',
        ghostAlone[1].input.content === 'XY', ghostAlone[1].input.content);

    console.log('\n[3] الحمل: خطوة تعتمد على عمل لا تذكره أبداً');
    const emptySlot = wire([
        { id: 'scan', tool: 'shell_execute', input: {}, dependsOn: [] },
        { id: 'save', tool: 'write_file', input: { path: 'r.md' }, dependsOn: ['scan'] },
    ]);
    check('خانة محتوى فارغة تُملأ بناتج الخطوة السابقة', emptySlot[1].input.content === '{{FROM:scan}}', emptySlot[1].input.content);
    const shortSlot = wire([
        { id: 'scan', tool: 'shell_execute', input: {}, dependsOn: [] },
        { id: 'save', tool: 'write_file', input: { path: 'r.md', content: 'تقرير بالنتائج' }, dependsOn: ['scan'] },
    ]);
    check('ووصفٌ قصير للمادة يُضاف إليه لا يُمحى', shortSlot[1].input.content === 'تقرير بالنتائج\n\n{{FROM:scan}}', shortSlot[1].input.content);
    const authored = 'م'.repeat(500);
    const longSlot = wire([
        { id: 'scan', tool: 'shell_execute', input: {}, dependsOn: [] },
        { id: 'save', tool: 'write_file', input: { path: 'r.md', content: authored }, dependsOn: ['scan'] },
    ]);
    check('والمحتوى الطويل الذي ألّفه المخطِّط بنفسه لا يُمَسّ', longSlot[1].input.content === authored);
    const answer = wire([
        { id: 'scan', tool: 'shell_execute', input: {}, dependsOn: [] },
        { id: 'say', tool: 'central_answer', input: { question: 'اكتب تقريراً' }, dependsOn: ['scan'] },
    ]);
    check('وخطوة الجواب النهائي تقرأ ما وجدته الخطوات قبلها',
        answer[1].input.question.includes('{{FROM:scan}}'), answer[1].input.question);

    const twice = wire(JSON.parse(JSON.stringify(shortSlot)));
    check('وتمرير الإصلاح مرتين لا يضاعف شيئاً (idempotent)',
        twice[1].input.content === shortSlot[1].input.content, twice[1].input.content);

    console.log('\n[4] التشغيل الحيّ: منسّق حقيقي، أدوات حقيقية، ملف على القرص');
    const { workspaceService } = require('../../modules/services/WorkspaceService');
    const { IntentParser } = require('../../core/intelligence/IntentParser');
    const { AgentOrchestrator } = require('../../orchestration/AgentOrchestrator');

    const wsRoot: string = workspaceService.getActiveRoot(WS);
    fs.mkdirSync(wsRoot, { recursive: true });
    const box = fs.mkdtempSync(path.join(wsRoot, '.joe-dataflow-'));
    const sourceFile = path.join(box, 'findings.txt');
    fs.writeFileSync(sourceFile, `تقرير الفحص:\n${SENTINEL}\n`);

    // The planner itself is not what is under test here — the wiring between a
    // plan and its execution is. So the plan is scripted, exactly as a model
    // would write it, and everything after it is the real system.
    IntentParser.parse = async (goal: string) => ({ goal, complexity: 'low', riskLevel: 'low', rawIntent: {} });
    let scripted: any[] = [];
    PlanningEngine.generatePlan = async () => ({ id: 'scripted', goal: 'scripted', steps: JSON.parse(JSON.stringify(scripted)), metadata: {} });

    const runPlan = async (steps: any[], tag: string) => {
        scripted = steps;
        const orch = new AgentOrchestrator();
        return orch.execute({ id: `dataflow-${tag}-${Date.now()}`, goal: 'افحص الملف ثم اكتب تقريراً بالنتيجة', context: { workspaceId: WS, userId: 'dataflow-user', sessionId: `dataflow-${tag}` } });
    };

    const reportA = path.join(box, 'report-carried.md');
    const outA = await runPlan([
        { id: 'collect', description: 'اقرأ نتائج الفحص', tool: 'read_file', agent: 'Dev', input: { path: sourceFile }, dependsOn: [] },
        // Exactly what a planner writes today: an ordering edge and a DESCRIPTION
        // of the material. No reference, no data — until the carry.
        { id: 'report', description: 'اكتب تقريراً بالنتيجة', tool: 'write_file', agent: 'Dev', input: { path: reportA, content: 'تقرير بالنتيجة' }, dependsOn: ['collect'] },
    ], 'carry');
    check('التشغيل انتهى بنجاح', outA?.ok === true, JSON.stringify(outA?.result)?.slice(0, 200));
    const bodyA = fs.existsSync(reportA) ? fs.readFileSync(reportA, 'utf-8') : '';
    check('الملف كُتب فعلاً على القرص', bodyA.length > 0, reportA);
    check('وفيه ناتج الخطوة الأولى الحقيقي — لا وصفه', bodyA.includes(SENTINEL), bodyA.slice(0, 160));
    check('ومع ذلك بقي ما كتبه المخطِّط', bodyA.includes('تقرير بالنتيجة'), bodyA.slice(0, 80));

    console.log('\n[5] الضبط المضاد: ما ألّفه المخطِّط بنفسه يبقى كما هو');
    const reportB = path.join(box, 'report-authored.md');
    const authoredBody = `# تقرير مكتوب بالكامل من المخطِّط\n${'تفاصيل. '.repeat(60)}`;
    await runPlan([
        { id: 'collect', description: 'اقرأ', tool: 'read_file', agent: 'Dev', input: { path: sourceFile }, dependsOn: [] },
        { id: 'report', description: 'اكتب', tool: 'write_file', agent: 'Dev', input: { path: reportB, content: authoredBody }, dependsOn: ['collect'] },
    ], 'authored');
    const bodyB = fs.existsSync(reportB) ? fs.readFileSync(reportB, 'utf-8') : '';
    check('المحتوى المؤلَّف وصل حرفياً بلا حشو', bodyB.trim() === authoredBody.trim(), `${bodyB.length} حرفاً`);
    check('ولم يُقحَم فيه ناتج خطوة أخرى', !bodyB.includes(SENTINEL));

    console.log('\n[6] اعتماد على خطوة غير موجودة لا يقتل التشغيل');
    const reportC = path.join(box, 'report-ghost.md');
    const outC = await runPlan([
        { id: 'report', description: 'اكتب', tool: 'write_file', agent: 'Dev', input: { path: reportC, content: 'محتوى مستقل' }, dependsOn: ['خطوة-غير-موجودة'] },
    ], 'ghost');
    check('التشغيل انتهى بدل أن يتجمّد عند «Execution stopped»', outC?.ok === true, JSON.stringify(outC?.result)?.slice(0, 160));
    check('والعمل تمّ فعلاً', fs.existsSync(reportC) && fs.readFileSync(reportC, 'utf-8').includes('محتوى مستقل'));

    console.log('\n[7] مرجع كتبه المخطِّط بلا إعلان الاعتماد — يصل بالبيانات لا بالفراغ');
    const reportD = path.join(box, 'report-ref.md');
    await runPlan([
        { id: 'collect', description: 'اقرأ', tool: 'read_file', agent: 'Dev', input: { path: sourceFile }, dependsOn: [] },
        { id: 'report', description: 'اكتب', tool: 'write_file', agent: 'Dev', input: { path: reportD, content: 'النتيجة: {{FROM:collect}}' }, dependsOn: [] },
    ], 'ref');
    const bodyD = fs.existsSync(reportD) ? fs.readFileSync(reportD, 'utf-8') : '';
    check('المرجع تحوّل إلى البيانات الحقيقية', bodyD.includes(SENTINEL), bodyD.slice(0, 160));
    check('ولم يبقَ العنصر النائب مكتوباً في الملف', !bodyD.includes('{{FROM:'), bodyD.slice(0, 120));

    try { fs.rmSync(box, { recursive: true, force: true }); } catch { /* best effort */ }

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
