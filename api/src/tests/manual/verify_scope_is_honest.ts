/**
 * «منصّة عالمية شبيهة بشوبيفاي» — AND THE THIRTEEN FEATURES NOBODY MENTIONED.
 *
 * His request named fourteen capabilities. What arrived was a single-table
 * store — a catalogue, orders, an owner login, search and sort — under a
 * message that listed its files, its self-QA score, its design family and five
 * next commands, and never once said that multi-vendor, payments, shipping,
 * coupons, loyalty, a mobile app, analytics, support, marketing automation,
 * SEO, multi-language and multi-currency were not built.
 *
 * Measured here on a REAL build with HIS request, word for word:
 *
 *   [1] the comparison appears in the delivered message
 *   [2] what IS built is named from evidence in the code, not from optimism
 *   [3] what is NOT built is named too — all of it
 *   [4] and nothing is claimed that the code cannot show
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_scope_is_honest.ts
 */
export {};
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.ENABLE_AUTH_BYPASS = 'true';
process.env.AUTO_APPROVE_ALL = '1';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const HIS_REQUEST = 'Build a world-class e-commerce platform similar to Shopify. Features: '
    + 'Multi-vendor marketplace AI product generation Inventory management Payments Shipping '
    + 'Coupons Loyalty program Mobile app Analytics Customer support Marketing automation SEO '
    + 'Multi-language Multi-currency Generate complete production-ready code.';

async function main() {
    console.log('\n[0] المقارنة نفسها — على طلبه حرفياً');
    const { requestedCapabilities, scopeReport, formatScope, readProjectSource } = await import('../../core/quality/scope-audit');
    const named = requestedCapabilities(HIS_REQUEST);
    console.log(`   ℹ️ سمّى ${named.length}: ${named.map(c => c.id).join(', ')}`);
    check('قرأ الطلب وعدّ ما فيه', named.length >= 12, `${named.length}`);
    for (const id of ['multi_vendor', 'payments', 'shipping', 'coupons', 'loyalty', 'mobile_app', 'analytics', 'seo', 'i18n', 'multi_currency', 'inventory', 'support', 'marketing', 'ai_generation']) {
        check(`  وفيها ${id}`, named.some(c => c.id === id));
    }

    console.log('\n[1] وبناء حقيقي بهذا الطلب — ثم قراءة الرسالة التي تصله');
    const { executeTool } = await import('../../modules/services/ToolService');
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');
    const sessionId = `scope-${Date.now()}`;
    const res: any = await executionFirewall.runInContext(undefined, () =>
        executeTool('react_project', { request: HIS_REQUEST },
            { sessionId, userId: 'u1', workspaceId: `session-${sessionId}`, language: 'en' }));
    check('البناء نجح', res?.ok === true, String(res?.error || '').slice(0, 140));
    const message = String(res?.output?.message || '');
    const dir = String((global as any).joeProjects?.[sessionId]?.dir || '');

    console.log('\n[2] حدود ما يعرف scope-audit فحصه موجودة في الرسالة');
    const scopeHeading = 'The capabilities I know how to check and you named';
    check('قسم حدود القدرات الحالي موجود', message.includes(scopeHeading),
        message.split('\n').slice(0, 8).join(' | ').slice(0, 220));
    const at = message.indexOf(scopeHeading);
    const filesAt = message.indexOf('📂 Path');
    check('وقبل قائمة الملفات', at > 0 && filesAt > at, `${at} / ${filesAt}`);
    check('ويعلن عدد القدرات وحدود الفحص',
        /The capabilities I know how to check and you named — \d+ in this report; I did not inspect the rest of your request:/.test(message));

    console.log('\n[3] وما لم يُبنَ مذكور بالاسم');
    const notBuilt = (message.match(/❌ Not built \((\d+)\): (.+)/) || []);
    console.log(`   ℹ️ ${notBuilt[0] || 'لا سطر'}`);
    check('سطر «لم تُبنَ» موجود', !!notBuilt[0], message.slice(0, 200));
    for (const label of ['multi-vendor marketplace', 'payments', 'shipping', 'coupons', 'loyalty program', 'mobile app']) {
        check(`  ومذكور: ${label}`, String(notBuilt[2] || '').includes(label), String(notBuilt[2] || '').slice(0, 160));
    }

    console.log('\n[4] وما بُني مُثبت بالشيفرة لا بالتفاؤل');
    const r = scopeReport(HIS_REQUEST, [dir]);
    console.log(`   ℹ️ بُنيت: ${r.built.map(c => c.id).join(', ') || 'لا شيء'}`);
    check('ولم يدّعِ المدفوعات', !r.built.some(c => c.id === 'payments'), r.built.map(c => c.id).join(','));
    check('ولا سوق البائعين', !r.built.some(c => c.id === 'multi_vendor'));
    check('ولا تطبيق الجوال', !r.built.some(c => c.id === 'mobile_app'));

    console.log('\n[5] وطلب قصير لا يُحاسَب كمواصفة');
    const small = scopeReport('ابن لي متجراً بسيطاً', [dir]);
    check('لا مقارنة لطلب بكلمتين', formatScope(small, true) === '', formatScope(small, true).slice(0, 80));

    console.log('\n--- صدر الرسالة كما ستصل إليه ---');
    console.log(message.split('\n').slice(0, 12).join('\n'));

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
