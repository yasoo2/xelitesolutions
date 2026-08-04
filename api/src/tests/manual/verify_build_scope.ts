/**
 * A PAGE IS NOT AN APPLICATION — «شرائح عليها صور وكتابات».
 *
 * The user's verdict, and it was right. Asked to «ابني تطبيق خرائط شبيه بتطبيق
 * خرائط جوجل», Joe produced index.html + styles.css + script.js: a POSTER of a
 * maps app. Measured across six real requests before this change, five came back
 * as a static page or as chat:
 *
 *   تطبيق خرائط                       → web_page_builder   (a page)
 *   تطبيق محادثة فوري                  → web_page_builder   (a page)
 *   نظام حجوزات عيادة + لوحة تحكم      → web_page_builder   (a page)
 *   نظام نقاط بيع + تقارير مبيعات      → central_answer     (only talk)
 *   نظام إدارة مخزون + تسجيل دخول      → api_project        (a server, no app)
 *   صفحة هبوط لمقهى                    → web_page_builder   (correct)
 *
 * Joe owns react_project — a real Vite + React project — and api_project — a
 * real Express + SQLite server — and the router almost never reached them.
 *
 * The scope is now read from the request itself, deterministically, so it holds
 * when the brain is unreachable:
 *   page   → one document
 *   app    → screens, state, interaction → a real React project
 *   system → an app that owns data → a backend, and the app built AFTER it,
 *            depending on it, so it is wired to a server that really exists
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_build_scope.ts
 */
export {};

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

/** goal → the tools that must appear, in order, for the delivery to be real. */
const ROUTES: Array<[string, RegExp]> = [
    // The request that started this. A real app, not a picture of one.
    ['ابني تطبيق خرائط شبيه بتطبيق خرائط جوجل', /react_project/],
    ['اعمل لي برنامج إدارة مهام بسيط', /react_project/],
    ['ابني محرر نصوص بسيط في المتصفح', /react_project/],

    // Owns data → gets a server of its own, and the app is built after it.
    ['ابن لي نظام حجوزات عيادة مع لوحة تحكم للطبيب', /api_project \+ react_project/],
    ['اعمل تطبيق محادثة فوري بين المستخدمين', /api_project \+ react_project/],
    ['أريد نظام نقاط بيع للمطاعم مع تقارير مبيعات', /api_project \+ react_project/],
    ['ابني منصة تعليمية مع حسابات للطلاب والمعلمين', /api_project \+ react_project/],
    ['ابني متجر إلكتروني مع سلة ودفع وحسابات', /api_project \+ react_project|project_pipeline/],
    ['ابني نظام إدارة مخزون مع تسجيل دخول وقاعدة بيانات', /api_project \+ react_project|project_pipeline/],

    // A page is still a page — the fix must not turn every request into a project.
    ['ابنِ لي صفحة هبوط لمقهى', /web_page_builder/],
    ['اعمل لي بورتفوليو شخصي', /web_page_builder/],
    ['صمم لي قائمة طعام لمطعم', /web_page_builder/],

    // A bare backend ask still gets exactly that.
    ['ابني API لإدارة المهام', /^api_project$/],

    // And a question is still answered, never built.
    ['ما رأيك في أنظمة نقاط البيع؟', /central_answer/],
];

async function main() {
    const { PlanningEngine } = require('../../core/orchestrator/PlanningEngine');

    console.log('\n[1] ماذا يُسلَّم فعلاً لكل طلب');
    for (const [goal, want] of ROUTES) {
        let tools = '(none)';
        try {
            const p = await PlanningEngine.generatePlan({ intent: { goal, complexity: 'high', riskLevel: 'low', rawIntent: {} } });
            tools = (p?.steps || []).map((s: any) => s.tool).join(' + ');
        } catch (e: any) { tools = `(threw: ${e?.message})`; }
        check(`«${goal.slice(0, 40)}${goal.length > 40 ? '…' : ''}» → ${tools}`, want.test(tools), `توقّعتُ ${want}`);
    }

    console.log('\n[2] وتطبيقٌ يملك بياناته يُبنى بعد خادمه لا قبله');
    const sys = await PlanningEngine.generatePlan({
        intent: { goal: 'ابن لي نظام حجوزات عيادة مع لوحة تحكم للطبيب', complexity: 'high', riskLevel: 'low', rawIntent: {} },
    });
    const api = sys.steps.find((s: any) => s.tool === 'api_project');
    const app = sys.steps.find((s: any) => s.tool === 'react_project');
    check('الخطّة فيها خادم وتطبيق معاً', !!api && !!app, JSON.stringify(sys.steps.map((s: any) => s.tool)));
    check('والتطبيق يعتمد على الخادم صراحةً — لا يُبنى في الهواء',
        (app?.dependsOn || []).includes(api?.id), JSON.stringify({ app: app?.dependsOn, api: api?.id }));

    console.log('\n[3] والتصنيف نفسه — بلا نموذج، يعمل والدماغ متوقّف');
    const cases: Array<[string, string]> = [
        ['ابني تطبيق خرائط شبيه بخرائط جوجل', 'app'],
        ['ابني نظام حجوزات مع تسجيل دخول', 'system'],
        ['ابنِ صفحة هبوط لمنتج', 'page'],
        ['اعمل بورتفوليو', 'page'],
        ['متجر مع حسابات ومدفوعات', 'system'],
        ['لوحة تحكم لعرض إحصائيات', 'system'],
        // A landing page ABOUT an app is a page — the document the user named
        // wins over the subject it describes.
        ['صفحة هبوط لتطبيق جوال', 'page'],
    ];
    for (const [goal, want] of cases) {
        const got = PlanningEngine.classifyBuildScope(goal);
        check(`«${goal.slice(0, 34)}» ⇒ ${got}`, got === want, `توقّعتُ ${want}`);
    }

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
