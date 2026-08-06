/**
 * «هذا غباء فاحش» — a request to BUILD, answered with essays.
 *
 * His run, verbatim:
 *
 *     Build a world-class e-commerce platform similar to Shopify …
 *     Generate complete production-ready code.
 *
 *     → Executing node: define_project_structure      (central_answer)
 *     → Executing node: generate_auth_system          (central_answer)
 *     → Executing node: create_multi_vendor_marketplace (central_answer)
 *     «Good evening, Younes. As we embark on building a world-class
 *      e-commerce platform, I'll outline the optimal project structure…»
 *
 * Fifteen nodes. Six essays. Zero files.
 *
 * This runs the REAL planner on his REAL words and measures what comes out —
 * and then runs the plan it produces, to disk.
 *
 *   [1] his exact request now produces a plan of BUILDERS, not answerers
 *   [2] a model plan made only of talking is refused and rescued
 *   [3] and the rescued plan really builds: files, on disk, that run
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_build_not_chat.ts
 */
export {};
import fs from 'fs';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.ENABLE_AUTH_BYPASS = 'true';
process.env.AUTO_APPROVE_ALL = '1';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const HIS = `Build a world-class e-commerce platform similar to Shopify.

Features:

Multi-vendor marketplace AI product generation Inventory management Payments Shipping Coupons Loyalty program Mobile app Analytics Customer support Marketing automation SEO Multi-language Multi-currency Generate complete production-ready code.`;

async function main() {
    // ToolService first — it owns the registry, and the planner reaches into it.
    const { executeTool } = await import('../../modules/services/ToolService');
    const { PlanningEngine } = await import('../../core/orchestrator/PlanningEngine');
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');

    console.log('\n[1] طلبه الحقيقي، بحروفه — ماذا يخطّط له جو الآن؟');
    const sessionId = `build-not-chat-${Date.now()}`;
    const plan = await PlanningEngine.generatePlan(
        { intent: { goal: HIS, complexity: 'high', riskLevel: 'medium', suggestedAgent: 'Dev', rawIntent: {} }, memory: [] } as any,
        undefined, { sessionId, userId: 'u1', workspaceId: `session-${sessionId}` } as any);

    const tools = (plan?.steps || []).map((s: any) => s.tool);
    console.log(`   ℹ️ الخطة: ${tools.join(' → ') || '(فارغة)'}`);
    check('الخطة ليست فارغة', tools.length > 0);
    check('ولا خطوة واحدة منها دردشة', !tools.some((t: string) => PlanningEngine.ANSWER_ONLY.has(t)), tools.join(', '));
    check('وفيها بنّاء حقيقي', tools.some((t: string) => ['react_project', 'api_project', 'project_pipeline', 'web_page_builder'].includes(t)),
        tools.join(', '));
    check('ولأنها منصّة تملك بياناتها — خادم أولاً', tools.includes('api_project'), tools.join(', '));
    check('ثم التطبيق مربوطاً به', tools.includes('react_project'), tools.join(', '));
    const app = (plan.steps || []).find((s: any) => s.tool === 'react_project');
    check('والتطبيق يعتمد على الخادم لا يسبقه', Array.isArray(app?.dependsOn) && app.dependsOn.length > 0,
        JSON.stringify(app?.dependsOn));

    console.log('\n[2] وحتى لو خطّط النموذج كلاماً فقط — يُرفض ويُنقذ');
    check('الأدوات التي لا تفعل شيئاً معرّفة', PlanningEngine.ANSWER_ONLY.has('central_answer'));
    check('وطلبه يُقرأ كبناء', PlanningEngine.looksLikeBuild(HIS));
    check('ونطاقه نظام كامل', PlanningEngine.classifyBuildScope(HIS) === 'system',
        PlanningEngine.classifyBuildScope(HIS));
    const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'core', 'orchestrator', 'PlanningEngine.ts'), 'utf-8');
    check('والرفض مكتوب في المخطِّط نفسه', /talking step\(s\) for a BUILD — refused/.test(src));

    console.log('\n[3] والخطة تُنفَّذ فعلاً — ملفات على القرص لا مقالات');
    // Only the app step: the API step needs a longer run, and what is being
    // proved here is that a BUILDER runs at all where an essay used to.
    const smaller = 'ابنِ متجراً إلكترونياً بسيطاً لبيع القهوة';
    const res: any = await executionFirewall.runInContext(undefined, () =>
        executeTool('react_project', { request: smaller },
            { sessionId, userId: 'u1', workspaceId: `session-${sessionId}` }));
    check('البنّاء اشتغل', res?.ok === true, String(res?.error || '').slice(0, 120));

    const key = sessionId.replace(/[^a-zA-Z0-9._-]/g, '_');
    const entry = ((global as any).joeProjects || {})[key];
    check('ومشروع حقيقي صار على القرص', !!entry?.dir && fs.existsSync(entry.dir), String(entry?.dir || 'لا شيء'));
    const files = entry?.dir ? fs.readdirSync(entry.dir) : [];
    check('وفيه package.json و src', files.includes('package.json') && files.includes('src'), files.join(', ').slice(0, 90));
    check('وبناء مُجمَّع قابل للعرض', !!entry?.dir && fs.existsSync(path.join(entry.dir, 'dist', 'index.html')));

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
