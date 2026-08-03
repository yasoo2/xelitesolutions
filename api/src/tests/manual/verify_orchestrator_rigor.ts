/**
 * WIRE PROOF — orchestrator rigor on the REAL dynamic-DAG path.
 *
 * The model is scripted to return a plan with the exact field diseases:
 * one node with corrupt JSON, a central_answer with NO question, a
 * write_file with NO path. The REAL generateDynamicDag must salvage the
 * valid nodes and hand every one of them runnable inputs — and the raw
 * ENOENT reply must reach the user wrapped in a human sentence.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_orchestrator_rigor.ts
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

// The plan a weak model actually produces: fences, a truly corrupt node in
// the middle (unescaped quote — the logged SyntaxError class), and two
// nodes whose inputs are missing what their tools die without.
const BROKEN_PLAN = '```json\n[' +
    '{"id":"node_1","description":"قراءة الصوره","tool":"central_answer","agent":"General","input":{},"dependsOn":[]},' +
    '{"id":"node_2","description":"say "hello" badly","tool":"shell_execute"},' +
    '{"id":"node_3","description":"كتابة النتائج في ملف","tool":"write_file","agent":"Dev","input":{"content":"النتائج"},"dependsOn":["node_1"]}' +
    ']\n```';

async function main() {
    // Script the model BEFORE the planner loads: every routeToModel call in
    // this process answers with the broken plan (require-cache interposition
    // — the ESM namespace itself is read-only).
    const Module = require('module');
    const origLoad = Module._load;
    Module._load = function (request: string, ...rest: any[]) {
        const exp = origLoad.apply(this, [request, ...rest]);
        if (/intelligent-router$/.test(String(request))) {
            return new Proxy(exp, {
                get: (t: any, k: string) => (k === 'routeToModel' ? async () => BROKEN_PLAN : t[k]),
            });
        }
        return exp;
    };

    console.log('\n[1] خطة مكسورة من نموذج ضعيف عبر generateDynamicDag الحقيقي');
    const { PlanningEngine } = await import('../../core/orchestrator/PlanningEngine');
    const dag = await (PlanningEngine as any).generateDynamicDag(
        { goal: 'قمم بتحليل هذه الصوره', complexity: 'medium', riskLevel: 'low' }, undefined, {});
    Module._load = origLoad;

    const tools = dag.steps.map((s: any) => s.tool);
    check('the valid nodes were salvaged (no failover, no empty plan)', dag.steps.length >= 2, `got ${dag.steps.length}: ${tools.join(',')}`);
    const ca = dag.steps.find((s: any) => s.tool === 'central_answer');
    check('central_answer left planning WITH a question', !!ca && String(ca.input.question || '').trim().length > 5, JSON.stringify(ca?.input || {}));
    check('…built from the USER words, not the injected blocks', !!ca && !String(ca.input.question).includes('ATTACHED FILES'));
    const wf = dag.steps.find((s: any) => s.tool === 'write_file');
    check('write_file left planning WITH a path', !!wf && /joe-output-\d+\.txt/.test(String(wf.input.path || '')), JSON.stringify(wf?.input || {}));
    check('every step carries the request context', dag.steps.every((s: any) => !!s.input.request));

    console.log('\n[2] الخطأ الخام يصل المستخدم جملة إنسانية، والتفصيل التقني محفوظ');
    const { AgentLoopService } = await import('../../modules/services/AgentLoopService');
    const wrapped = (AgentLoopService as any).humanizeFailure(
        "ENOENT: no such file or directory, scandir 'C:\\Users\\home\\Documents\\xelitesolutions\\data\\projects\\session-x\\path_to_directory'", 'ar');
    check('the reply opens with an Arabic human sentence', wrapped.startsWith('تعذّر إكمال الطلب'));
    check('the technical detail is kept for repair, clearly labelled', wrapped.includes('التفاصيل التقنية') && wrapped.includes('ENOENT'));

    console.log('\n[3] ميزانية الإصلاح على مستوى التشغيلة');
    const { AgentOrchestrator } = await import('../../orchestration/AgentOrchestrator');
    const orch: any = new AgentOrchestrator();
    check('a fresh run starts with a zeroed recovery budget', orch.recoveriesUsed === 0);

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
