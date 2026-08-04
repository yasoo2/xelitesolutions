/**
 * CAN THE BRAIN REACH ITS OWN HANDS?
 *
 * Joe registers 151 tools. Before this batch, the planner's prompt named
 * seven of them in a hardcoded line — two of which are aliases, not tools —
 * and the keyword fast-paths named about twenty more. Counted honestly:
 *
 *     26 of 151 tools could ever be chosen. 125 could not be reached by any
 *     request, phrased any way, in any language.
 *
 * Every browser audit, every extra language's builder, the database tools,
 * the translator, the load tester, the accessibility passes — all registered,
 * all tested, all invisible to the thing that decides what to do. That is not
 * a missing feature; it is a system that does not know what it owns.
 *
 * The fix is a RETRIEVED catalogue: score all 151 against the goal, in Arabic
 * or English, and hand the planner the ones that fit with their real
 * arguments. This proof measures the result rather than asserting it — over a
 * corpus of ordinary requests, how much of the catalogue becomes reachable,
 * and does the right specialist actually come first?
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_tool_reach.ts
 */
export {};
import fs from 'fs';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.OFFLINE_MODE = 'true';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

/** Ordinary requests, the way the owner actually types them. */
const CORPUS: Array<{ goal: string; expect?: string }> = [
    { goal: 'ترجم الموقع إلى الإنجليزية', expect: 'browser_translate' },
    { goal: 'حلّل قاعدة البيانات وأنشئ ترحيل', expect: 'db_schema_migrator' },
    { goal: 'اختبر سرعة الصفحة وأداءها', expect: 'load_tester' },
    { goal: 'ابنِ تطبيق جوال', expect: 'mobile_builder' },
    { goal: 'راجع الكود واقترح إعادة هيكلة', expect: 'code_reviewer' },
    { goal: 'افحص أمان المستودع وابحث عن ثغرات', expect: 'github_repo_manager' },
    { goal: 'شغّل الحاويات وتحقق من دوكر', expect: 'docker_manager' },
    { goal: 'دقّق إمكانية الوصول والتباين في الصفحة', expect: 'browser_contrast_audit' },
    { goal: 'اعمل لقطة شاشة كاملة للموقع', expect: 'browser_fullpage_shot' },
    { goal: 'افحص الروابط المكسورة في الموقع', expect: 'browser_check_links' },
    { goal: 'حوّل الصفحة إلى PDF', expect: 'browser_save_pdf' },
    { goal: 'دقّق السيو في موقعي', expect: 'browser_seo_audit' },
    { goal: 'راجع تبعيات المشروع بحثاً عن ثغرات', expect: 'dependency_audit' },
    { goal: 'ولّد وثائق swagger للـ API', expect: 'swagger_docs' },
    { goal: 'اكتب اختبارات للمشروع', expect: 'test_generator' },
    { goal: 'أنشئ خط أنابيب CI', expect: 'ci_generate_pipeline' },
    { goal: 'ابحث عن كلمة معينة داخل الملفات', expect: 'search_text' },
    { goal: 'أرسل لي تنبيهاً عند حدوث خطأ' },
    { goal: 'حلّل استهلاك السحابة وتكلفتها' },
    { goal: 'اقرأ الطلبات التي وصلت من الزوار' },
];

async function main() {
    const { tools } = require('../../modules/tools/registry');
    const { TOOL_ALIASES } = require('../../modules/services/ToolService');
    const { selectToolsFor, catalogueFor, goalTerms, CORE_TOOLS } = require('../../core/orchestrator/toolCatalog');
    const all: string[] = tools.map((t: any) => t.name);

    console.log('\n[1] القياس قبل وبعد — كم أداة يستطيع العقل اختيارها أصلاً');
    const planner = fs.readFileSync(path.join(__dirname, '..', '..', 'core', 'orchestrator', 'PlanningEngine.ts'), 'utf-8');
    const namedByKeyword = new Set<string>();
    for (const m of planner.matchAll(/tool:\s*'([a-z_]+)'/g)) if (all.includes(m[1])) namedByKeyword.add(m[1]);
    console.log(`      (المسارات المفتاحية تسمّي ${namedByKeyword.size} أداة — وهذا كل ما كان مضموناً)`);
    check('السطر المتحجّر «Use ONLY existing tools: …» اختفى',
        !/Use ONLY existing tools: shell_execute/.test(planner));
    check('وحلّ محلّه فهرس مبنيّ من السجل الحقيقي', planner.includes('catalogueFor(intent.goal)'));

    const reachable = new Set<string>(namedByKeyword);
    for (const { goal } of CORPUS) for (const t of selectToolsFor(goal)) reachable.add(t.name);
    const before = namedByKeyword.size + 7;
    console.log(`      (بعد الفهرس: ${reachable.size} أداة مختلفة ظهرت أمام العقل عبر ${CORPUS.length} طلباً فقط)`);
    check(`الوصول اتّسع من ~${before} إلى ${reachable.size} أداة من ${all.length}`,
        reachable.size >= before * 2, `${reachable.size}/${all.length}`);

    console.log('\n[2] وهل يأتي المتخصّص أولاً؟ — كل طلب وأداته');
    const misses: string[] = [];
    for (const { goal, expect } of CORPUS) {
        if (!expect) continue;
        const picked = selectToolsFor(goal).filter((p: any) => p.score > 0).map((p: any) => p.name);
        const rank = picked.indexOf(expect);
        if (rank < 0 || rank > 4) misses.push(`${goal} → ${expect} (${rank < 0 ? 'غائب' : `المرتبة ${rank + 1}`})`);
    }
    check(`المتخصّص ضمن أول خمسة في كل طلب مُتوقَّع (${CORPUS.filter(c => c.expect).length - misses.length}/${CORPUS.filter(c => c.expect).length})`,
        misses.length === 0, misses.join(' | '));

    console.log('\n[3] الفهرس صادق ورخيص');
    for (const { goal } of CORPUS.slice(0, 6)) {
        const lines = catalogueFor(goal).split('\n').filter(Boolean);
        const names = lines.map((l: string) => (l.match(/^- ([a-z0-9_]+)\(/) || [])[1]).filter(Boolean) as string[];
        const ghosts = names.filter(n => !all.includes(n));
        if (ghosts.length) { check(`فهرس «${goal}» لا يحوي اسماً وهمياً`, false, ghosts.join(',')); break; }
    }
    check('كل سطر في الفهرس يسمّي أداة مسجّلة فعلاً وبأسمائها الحقيقية',
        CORPUS.every(({ goal }) => catalogueFor(goal).split('\n').filter(Boolean)
            .every((l: string) => all.includes((l.match(/^- ([a-z0-9_]+)\(/) || [])[1] || ''))));
    const sizes = CORPUS.map(({ goal }) => catalogueFor(goal).length);
    const biggest = Math.max(...sizes);
    console.log(`      (أكبر فهرس ${biggest} محرفاً ≈ ${Math.round(biggest / 4)} رمزاً — لا يقتل نموذجاً مجانياً)`);
    check('الفهرس يبقى مضغوطاً (أقل من 8000 محرف)', biggest < 8000, String(biggest));
    check('والأدوات الأساسية حاضرة دائماً مهما كان الطلب',
        CORPUS.every(({ goal }) => {
            const names = selectToolsFor(goal).map((p: any) => p.name);
            return CORE_TOOLS.every((c: string) => !all.includes(c) || names.includes(c));
        }));

    console.log('\n[4] ولا يصمت الفهرس أمام طلب إنجليزي أو غامض');
    check('طلب إنجليزي يجد أدواته', selectToolsFor('audit the accessibility of my landing page')
        .some((p: any) => /a11y|contrast|audit/.test(p.name) && p.score > 0));
    const vague = selectToolsFor('ساعدني');
    check('طلب غامض يعود بالأساسيات لا بالفراغ', vague.length >= 5, String(vague.length));

    console.log('\n[5] واسم أداة مخترَع لا يمرّ إلى المنفّذ');
    const { PlanningEngine } = require('../../core/orchestrator/PlanningEngine');
    const cleaned = PlanningEngine.sanitizeSteps([
        { id: 'a', tool: 'summon_a_unicorn', description: 'افعل شيئاً سحرياً', input: {}, dependsOn: [] },
        { id: 'b', tool: 'ls', description: 'اعرض الملفات', input: {}, dependsOn: [] },
        { id: 'c', tool: 'read_file', description: 'اقرأ', input: { path: 'package.json' }, dependsOn: [] },
    ] as any, 'اختبار');
    check('الاسم الوهمي يتحوّل إلى إجابة صادقة بدل «الأداة غير موجودة»',
        cleaned[0].tool === 'central_answer' && !!cleaned[0].input.question, cleaned[0].tool);
    check('والاسم المستعار يُحلّ إلى أداته الحقيقية',
        cleaned[1].tool === (TOOL_ALIASES['ls'] || 'ls') && all.includes(cleaned[1].tool), cleaned[1].tool);
    check('والاسم الصحيح يمرّ كما هو', cleaned[2].tool === 'read_file');

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
