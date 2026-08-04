/**
 * THE MIND MAY NOT SCHEDULE WORK THE TOOLS CANNOT BE FED.
 *
 * 132 of Joe's 151 tools declare required arguments. The plan sanitiser filled
 * exactly three of them, by hand. For the other 129, a step that named the
 * right tool and forgot its argument was scheduled anyway and died at run time
 * with a machine word. Measured, on a sentence that CONTAINED the answer:
 *
 *   «دقّق السيو في https://example.com»
 *   plan:   browser_seo_audit, input {}
 *   result: ok=false — «no_url»
 *
 * The URL was in the user's own sentence. The tool was the right one. And the
 * intelligence layer already knew how to fill that argument — it does exactly
 * this for the capability router. Three parts of Joe, none of them talking.
 *
 *   [1] the measured failure, now a completed run that used the sentence
 *   [2] across many real tools: no step is ever scheduled with a hole in it
 *   [3] what the planner DID write is never overwritten
 *   [4] a tool without required arguments is left alone
 *   [5] and when the argument genuinely is not there, Joe ASKS — by name —
 *       instead of failing with «no_url»
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_required_args.ts
 */
export {};
import http from 'http';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';
process.env.JOE_NARRATION = '0';
process.env.BROWSER_HEADLESS = 'true';
process.env.BROWSER_NO_SANDBOX = 'true';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

async function main() {
    const { PlanningEngine } = require('../../core/orchestrator/PlanningEngine');
    const { IntentParser } = require('../../core/intelligence/IntentParser');
    const { AgentOrchestrator } = require('../../orchestration/AgentOrchestrator');
    const { tools } = require('../../modules/tools/registry');

    const site = http.createServer((_q, s) => {
        s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        s.end('<!doctype html><html lang="ar"><head><title>صفحة</title></head><body><h1>مرحباً</h1></body></html>');
    });
    site.listen(0, '127.0.0.1');
    await new Promise<void>(r => site.once('listening', () => r()));
    const url = `http://127.0.0.1:${(site.address() as any).port}/`;

    console.log('\n[1] العطب المقيس: أداة صحيحة بلا وسيطها — والرابط في الجملة');
    IntentParser.parse = async (goal: string) => ({ goal, complexity: 'low', riskLevel: 'low', rawIntent: {} });
    PlanningEngine.generatePlan = async () => ({
        id: 'p', goal: 'g', metadata: {},
        steps: PlanningEngine.fillRequiredArgs(
            [{ id: 'seo', description: 'دقّق السيو', tool: 'browser_seo_audit', agent: 'Browser', input: {}, dependsOn: [] }],
            `دقّق السيو في ${url}`, { sessionId: 'req-args' }),
    });
    const out: any = await new AgentOrchestrator().execute({
        id: `req-${Date.now()}`, goal: `دقّق السيو في ${url}`,
        context: { workspaceId: 'req-args', userId: 'req-user', sessionId: 'req-args' },
    });
    check('التشغيل نجح بعد أن كان «no_url»', out?.ok === true, JSON.stringify(out?.result).slice(0, 140));
    check('والأداة هي نفسها لم تُستبدل', (out?.steps || [])[0]?.tool === 'browser_seo_audit',
        JSON.stringify((out?.steps || []).map((s: any) => s.tool)));
    check('والنتيجة عن الصفحة الحقيقية',
        JSON.stringify(out?.result || '').includes('SEO') || JSON.stringify(out?.result || '').includes('سيو'),
        JSON.stringify(out?.result).slice(0, 120));

    console.log('\n[2] ولا خطوة تُجدوَل بثقب فيها — عبر أدوات حقيقية كثيرة');
    const withRequired = (tools as any[]).filter(t => Array.isArray(t?.inputSchema?.required) && t.inputSchema.required.length);
    console.log(`      (${withRequired.length} أداة تُعلن وسائط إلزامية من أصل ${tools.length})`);
    let holes = 0; const examples: string[] = [];
    for (const t of withRequired) {
        const [step] = PlanningEngine.fillRequiredArgs(
            [{ id: 'x', description: `استعمل ${t.name}`, tool: t.name, input: {}, dependsOn: [] }],
            `افحص ${url} من فضلك`, { sessionId: 'req-args' });
        if (step.tool === 'central_answer') continue;                      // asked instead — fine
        // Arguments the runtime supplies (the signed-in user, the workspace, the
        // live session) are not the planner's to provide — ToolService injects
        // them at the door.
        const RUNTIME = new Set(['sessionId', 'userId', 'workspaceId', 'context', '__userId', '__workspaceId']);
        const req: string[] = t.inputSchema.required.filter((r: string) => !RUNTIME.has(r));
        const missing = req.filter(r => {
            const v = (step.input as any)[r];
            return v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);
        });
        if (missing.length) { holes++; if (examples.length < 6) examples.push(`${t.name}(${missing.join(',')})`); }
    }
    check('ولا واحدة خرجت ناقصة وسيطاً إلزامياً', holes === 0, `${holes}: ${examples.join(' · ')}`);

    console.log('\n[3] وما كتبه المخطِّط لا يُمَسّ');
    const [kept] = PlanningEngine.fillRequiredArgs(
        [{ id: 'k', description: 'دقّق', tool: 'browser_seo_audit', input: { url: 'https://chosen.example' }, dependsOn: [] }],
        `دقّق السيو في ${url}`, { sessionId: 'req-args' });
    check('الرابط الذي اختاره المخطِّط باقٍ', kept.input.url === 'https://chosen.example', JSON.stringify(kept.input));

    console.log('\n[4] وأداة بلا وسائط إلزامية لا تُلمَس');
    const noReq = (tools as any[]).find(t => !Array.isArray(t?.inputSchema?.required) || !t.inputSchema.required.length);
    const [free] = PlanningEngine.fillRequiredArgs(
        [{ id: 'f', description: 'شيء', tool: noReq.name, input: { keep: 'me' }, dependsOn: [] }], 'أي شيء', {});
    check(`«${noReq.name}» بقيت كما هي`, free.tool === noReq.name && free.input.keep === 'me', JSON.stringify(free.input));

    console.log('\n[5] وحين لا يوجد الوسيط فعلاً — يُسأل عنه بالاسم لا يُفشَل');
    const [asked] = PlanningEngine.fillRequiredArgs(
        [{ id: 'a', description: 'املأ النموذج', tool: 'browser_fill_form', input: {}, dependsOn: [] }],
        'املأ النموذج', { sessionId: 'nothing-open' });
    check('الخطوة تحوّلت إلى سؤال', asked.tool === 'central_answer', asked.tool);
    check('والسؤال يسمّي الوسيط الناقص', /fields/.test(String(asked.input.question)), String(asked.input.question).slice(0, 100));
    check('ويمنع اختلاق قيمة', /لا تختلق/.test(String(asked.input.question)));

    site.close();
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
