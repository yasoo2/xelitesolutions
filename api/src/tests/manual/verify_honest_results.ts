/**
 * A TOOL THAT APOLOGISES DID NOT SUCCEED.
 *
 * Measured with every model provider unreachable — the state a laptop is in
 * whenever Ollama is not running:
 *
 *   central_answer     ok=true   «⚠️ تعذّر الوصول إلى محرّك الذكاء …»
 *   browser_summarize  ok=true   «📄 ملخّص الصفحة: ⚠️ تعذّر الوصول …»
 *   browser_translate  ok=true   «🌐 Page translation → English: ⚠️ …»
 *
 * `ok: true` is not a formality. It marks the step COMPLETED so nothing is
 * retried and the run claims success; it makes that text THE ANSWER; and — the
 * reason this became urgent — it feeds the apology to the next step as DATA.
 * «افحص ثم اكتب تقريراً بالنتيجة» would write «تعذّر الوصول إلى محرّك الذكاء»
 * into the report, exactly where the findings belong.
 *
 *   [1] the three now fail honestly, keeping their message as the reason
 *   [2] tools that really do the work still succeed — the rule must not turn
 *       a working product into a failure because a sentence mentions a model
 *   [3] the boundary, on the shapes tools really return
 *   [4] and the point of it all: a dependent step never receives an apology
 *       as its material — proven by a live two-step run whose report file is
 *       read back off disk
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_honest_results.ts
 */
export {};
import fs from 'fs';
import http from 'http';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';
process.env.BROWSER_HEADLESS = 'true';
process.env.BROWSER_NO_SANDBOX = 'true';
process.env.JOE_NARRATION = '0';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const WS = 'session-honest';

async function main() {
    const { executeTool } = require('../../modules/services/ToolService');
    const { executionFirewall } = require('../../orchestration/AgentExecutionFirewall');
    const { isApologyOnly } = require('../../shared/utils/honestResult');
    const { PROVIDER_FAILURE_PREFIX } = require('../../core/llm/intelligent-router');

    const site = http.createServer((_q, s) => {
        s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        s.end('<!doctype html><html lang="ar"><head><title>صفحة</title></head><body><h1>مرحباً</h1><a href="/x">رابط</a></body></html>');
    });
    site.listen(0, '127.0.0.1');
    await new Promise<void>(r => site.once('listening', () => r()));
    const url = `http://127.0.0.1:${(site.address() as any).port}/`;

    const ctx = { sessionId: WS, workspaceId: WS, userId: 'honest-user' };
    const run = (n: string, i: any) => executionFirewall.runAsSystem(() => executeTool(n, i, ctx), { userId: 'honest-user', sessionId: WS });

    console.log('\n[1] الأدوات التي لا تملك إلا اعتذاراً — تفشل بصدق');
    for (const [name, input] of [
        ['central_answer', { question: 'ما عاصمة فرنسا؟' }],
        ['browser_summarize', { url }],
        ['browser_translate', { url, target: 'en' }],
    ] as Array<[string, any]>) {
        const r: any = await run(name, input).catch((e: any) => ({ ok: false, error: String(e?.message || e) }));
        check(`${name} → ok=false`, r?.ok === false, JSON.stringify(r?.output || '').slice(0, 90));
        check(`…والسبب محفوظ كما هو لا مُخترَع`, String(r?.error || '').includes(PROVIDER_FAILURE_PREFIX), String(r?.error || '').slice(0, 80));
    }

    console.log('\n[2] والأدوات التي أنجزت شيئاً حقيقياً تبقى ناجحة');
    for (const [name, input] of [
        ['browser_check_links', { url }],
        ['browser_seo_audit', { url }],
        ['browser_fullpage_shot', { url }],
    ] as Array<[string, any]>) {
        const r: any = await run(name, input).catch((e: any) => ({ ok: false, error: String(e?.message || e) }));
        check(`${name} → ما زال ناجحاً`, r?.ok === true, String(r?.error || '').slice(0, 90));
    }

    console.log('\n[3] الحدّ بين الاثنين، على الأشكال التي تُرجعها الأدوات فعلاً');
    const APOLOGY = `${PROVIDER_FAILURE_PREFIX} (لم يستجب أي مزوّد).`;
    check('رسالة كلّها اعتذار = فشل', isApologyOnly({ message: APOLOGY }) === true);
    check('اعتذار داخل رسالة أطول = فشل أيضاً', isApologyOnly({ message: `📄 ملخّص الصفحة: ${APOLOGY}`, url }) === true);
    check('لكن صفحة بُنيت فعلاً تبقى نجاحاً رغم ذكر النموذج',
        isApologyOnly({ message: `تمّ البناء. ${APOLOGY}`, previewUrl: 'http://x/y.html', path: 'joe-1/index.html' }) === false);
    check('وملفات مكتوبة تبقى نجاحاً', isApologyOnly({ message: APOLOGY, files: ['a.tsx', 'b.tsx'] }) === false);
    check('ولقطة عابرة لا تُنقذ ملخّصاً فارغاً',
        isApologyOnly({ message: `📄 ملخّص: ${APOLOGY}`, screenshot: '/artifacts/s.jpg', url }) === true);
    check('ومخرَج بلا أي اعتذار لا يُمَسّ', isApologyOnly({ message: '🔗 كل الروابط تعمل.', url }) === false);

    console.log('\n[4] ولا تصل خطوةً تاليةً مادةٌ اسمها «اعتذار»');
    const { workspaceService } = require('../../modules/services/WorkspaceService');
    const { IntentParser } = require('../../core/intelligence/IntentParser');
    const { PlanningEngine } = require('../../core/orchestrator/PlanningEngine');
    const { AgentOrchestrator } = require('../../orchestration/AgentOrchestrator');

    const wsRoot: string = workspaceService.getActiveRoot(WS);
    fs.mkdirSync(wsRoot, { recursive: true });
    const report = path.join(wsRoot, 'honest-report.md');
    try { fs.unlinkSync(report); } catch { /* fresh */ }

    IntentParser.parse = async (goal: string) => ({ goal, complexity: 'low', riskLevel: 'low', rawIntent: {} });
    PlanningEngine.generatePlan = async () => ({
        id: 's', goal: 'g', metadata: {},
        steps: [
            { id: 'think', description: 'حلّل الموقع', tool: 'central_answer', agent: 'General', input: { question: 'حلّل الموقع' }, dependsOn: [] },
            { id: 'write', description: 'اكتب التقرير', tool: 'write_file', agent: 'Dev', input: { path: report, content: 'التقرير:' }, dependsOn: ['think'] },
        ],
    });
    const out: any = await new AgentOrchestrator().execute({
        id: `honest-${Date.now()}`, goal: 'حلّل الموقع ثم اكتب تقريراً',
        context: { workspaceId: WS, userId: 'honest-user', sessionId: WS },
    });
    const body = fs.existsSync(report) ? fs.readFileSync(report, 'utf-8') : '';
    check('التشغيل لم يدّعِ النجاح', out?.ok === false, JSON.stringify(out?.result || '').slice(0, 120));
    check('ولم يُكتب الاعتذار في التقرير كأنه نتيجة',
        !body.includes(PROVIDER_FAILURE_PREFIX), body.slice(0, 160));

    try { fs.unlinkSync(report); } catch { /* cleanup */ }
    site.close();
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
