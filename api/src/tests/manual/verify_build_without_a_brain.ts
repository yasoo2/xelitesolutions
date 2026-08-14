/**
 * «بنِ نظاماً لمشتل نباتات: النباتات والموردون والطلبيات»  →  لا شيء.
 *
 * His log, in order:
 *
 *     [IntentParser] deep analysis: "بنِ نظاماً لمشتل نباتات…"
 *     [IntelligentRouter] Local (Auto) failed or timed out: TIMEOUT   ×3
 *     [IntelligentRouter] 429 … tokens per day (TPD): Limit 100000, Used 100000
 *     [LLM7] 401 · [DuckAI] 418 · [Pollinations] 402
 *     CRITICAL: All LLM providers failed.
 *     Node create_database failed: تعذّر الوصول إلى محرّك الذكاء
 *
 * Two defects, and neither is about intelligence:
 *
 *   1. «بنِ» — the bare imperative — was not in the build-verb list, which had
 *      «ابن» and «ابني». Every noun matched; no verb did. So the deterministic
 *      builders were never offered the request, and it went to a planner LLM.
 *   2. And when that planner could not be reached, the run DIED — although the
 *      scaffolder, the database, the CRUD, the screens and the self-QA are all
 *      deterministic and need no model at all.
 *
 * Measured here with EVERY provider unreachable, exactly as his machine was:
 *
 *   [1] his sentence is recognised as a build
 *   [2] and other bare imperatives too, without swallowing questions
 *   [3] a build request with a dead mesh is planned to the REAL builders
 *   [4] and a real system is built, booted, and driven over HTTP — brainless
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_build_without_a_brain.ts
 */
export {};
import fs from 'fs';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.ENABLE_AUTH_BYPASS = 'true';
process.env.AUTO_APPROVE_ALL = '1';
/** No model anywhere: no keys, and an Ollama address nothing answers on. */
process.env.OLLAMA_HOST = 'http://127.0.0.1:1';
process.env.LOCAL_LLM_BASE_URL = '';
for (const k of ['GROQ_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY',
    'CEREBRAS_API_KEY', 'MISTRAL_API_KEY', 'OPENROUTER_API_KEY', 'HUGGINGFACE_API_KEY']) delete process.env[k];
process.env.OFFLINE_MODE = 'true';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const HIS_WORDS = 'بنِ نظاماً لمشتل نباتات: النباتات والموردون والطلبيات';

async function main() {
    console.log('\n[1] جملته هو — كما كتبها بالضبط');
    const { PlanningEngine } = await import('../../core/orchestrator/PlanningEngine');
    check('تُقرأ كطلب بناء', PlanningEngine.looksLikeBuild(HIS_WORDS) === true);
    // «الموردون» and «الطلبيات» are a DATABASE — the list knew «طلبات» and
    // «موظفين» and matched neither, so this used to come back «app» and he
    // would have received a front-end with nowhere to put a supplier.
    check('ونطاقها نظام كامل — خادم وقاعدة بيانات',
        PlanningEngine.classifyBuildScope(HIS_WORDS) === 'system',
        PlanningEngine.classifyBuildScope(HIS_WORDS));

    console.log('\n[2] وصيغ الأمر الأخرى — دون ابتلاع الأسئلة');
    for (const g of ['بنِ متجراً للعطور', 'بن نظام حجوزات', 'شيّد منصة تعليمية', 'أقم موقعاً لشركتي', 'ابنِ نظاماً']) {
        check(`  «${g.slice(0, 22)}»`, PlanningEngine.looksLikeBuild(g) === true);
    }
    for (const g of ['ما رأيك بالبن البرازيلي؟', 'كم سعر البن؟', 'اشرح لي ما هو النظام']) {
        check(`  وليست بناءً: «${g.slice(0, 22)}»`, PlanningEngine.looksLikeBuild(g) === false);
    }

    console.log('\n[3] وبلا أيّ مزوّد — الخطّة تذهب إلى البنّائين لا إلى رسالة اعتذار');
    const intent: any = { goal: HIS_WORDS, complexity: 'high', riskLevel: 'medium', suggestedAgent: 'Dev' };
    const dag: any = await (PlanningEngine as any).generatePlan({ intent }, 'trace-no-brain', { sessionId: `plan-${Date.now()}` });
    const tools = (dag?.steps || []).map((s: any) => String(s.tool));
    console.log(`   ℹ️ ${dag?.id} → ${tools.join(', ') || 'لا خطوات'}`);
    check('لا خطوة كلام', !tools.includes('central_answer'), tools.join(', '));
    /**
     * REPOINTED, NOT RELAXED — the guarantee moved one level down.
     *
     * The top-level plan used to name the builders itself. It now returns a
     * single `project_pipeline` step, and the builders are chosen inside it.
     * The promise being measured is unchanged — a build reaches real builders,
     * and a request with its own rows gets its data service BEFORE its
     * interface — so the check follows the promise to where it now lives
     * instead of pinning a topology.
     */
    const { deterministicPhasesFor } = await import('../../modules/tools/definitions/ProjectPipelineTool');
    const phaseTools = (deterministicPhasesFor(HIS_WORDS)?.phases || []).map(ph => String(ph.tasks?.[0]?.tool));
    check('بل بنّاء حقيقي',
        tools.includes('project_pipeline')
        && phaseTools.some((t: string) => ['api_project', 'react_project', 'web_page_builder'].includes(t)),
        `${tools.join(', ')} → ${phaseTools.join(', ')}`);
    check('وخادمٌ قبل الواجهة — لأنّ فيه موردين وطلبيات',
        phaseTools.indexOf('api_project') === 0 && phaseTools.includes('react_project'),
        phaseTools.join(' → '));

    console.log('\n[4] والنظام يُبنى فعلاً — بلا دماغ إطلاقاً');
    const { executeTool } = await import('../../modules/services/ToolService');
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');
    const sessionId = `no-brain-${Date.now()}`;
    const res: any = await executionFirewall.runInContext(undefined, () =>
        executeTool('api_project', { request: HIS_WORDS },
            { sessionId, userId: 'u1', workspaceId: `session-${sessionId}`, language: 'ar' }));
    check('البناء نجح', res?.ok === true, String(res?.error || '').slice(0, 140));
    const dir = String((global as any).joeProjects?.[sessionId]?.dir || '');
    console.log(`   ℹ️ ${dir}`);
    check('على القرص', !!dir && fs.existsSync(path.join(dir, 'server.js')), dir);
    // The wording of the announcement changed when the model came from the
    // request's own words rather than a canned domain — which is the better
    // outcome. What is measured is that the reason is SAID, not which of the
    // three reasons it happened to be.
    check('والسبب مُعلن: من أين جاء نموذج البيانات',
        (res?.logs || []).some((l: string) => /no domain matched and no model answered|a known domain matched|read from the request itself|the request declares its tables/.test(l)),
        (res?.logs || []).filter((l: string) => /data model/.test(l)).join(' | ').slice(0, 160));

    // The Arabic message's own shape: «البريد: …» then «كلمة المرور: …».
    const msg = String(res?.output?.message || '');
    const cred = !!(msg.match(/البريد:\s*(\S+@\S+)/) && msg.match(/كلمة المرور:\s*(\S+)/));
    if (fs.existsSync(path.join(dir, 'node_modules'))) {
        const { executionEngine } = require('../../kernel/ExecutionEngine');
        const port = 5200 + Math.floor(Math.random() * 90);
        let up: (v: boolean) => void = () => { /* set below */ };
        const listening = new Promise<boolean>(r => { up = r; });
        const child = executionEngine.runArgvStreaming(process.execPath, ['server.js'], {
            cwd: dir, env: { PORT: String(port), NODE_NO_WARNINGS: '1' },
            onLine: (l: string) => { if (/listening on/.test(l)) up(true); },
        });
        child.done.then(() => up(false));
        const booted = await Promise.race([listening, new Promise<boolean>(r => setTimeout(() => r(false), 20_000))]);
        check('ويقلع', booted === true);
        const health: any = await fetch(`http://127.0.0.1:${port}/api/health`).then(r => r.json()).catch(() => null);
        console.log(`   ℹ️ ${JSON.stringify(health || {}).slice(0, 120)}`);
        check('ويجيب بقاعدة بيانات حقيقية', health?.ok === true && !!health?.backend, JSON.stringify(health || {}).slice(0, 120));
        check('ومعه بيانات المالك كاملة', cred, msg.split('\n').filter(l => /البريد|كلمة المرور/.test(l)).join(' · ').slice(0, 100));
        try { child.kill(); } catch { /* already gone */ }
    } else check('الحزم مثبتة للتشغيل', false, 'npm install لم يكتمل');

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
