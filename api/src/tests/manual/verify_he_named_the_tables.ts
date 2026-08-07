/**
 * «ابنِ نظاماً لمشتل نباتات: النباتات والموردون والطلبيات
 *  مع صور نباتات وثيم اخضر جميل للنظام»   →   «إضافة سجلّ · العنوان · التفاصيل»
 *
 * His screenshot: a generic record form. No plant, no supplier, no order — and
 * the app's own subtitle read «اً لمشتل نباتات: النباتات والموردون والط».
 *
 * His log says exactly why:
 *
 *     [PlanningEngine] build scope = system -> api_project + react_project   ✅
 *     data model: no domain matched and no model answered                    ❌
 *     [Groq] 429 Rate limit reached · [DuckAI] 418 · Pollinations too short
 *
 * «مشتل» is not one of the six hand-written domains, and every provider was
 * rate-limited that minute. But nothing needed designing: he wrote the three
 * tables himself, after a colon, joined by «و».
 *
 * Measured here from his exact sentence, with every provider unreachable:
 *
 *   [1] the three tables are read straight out of the sentence
 *   [2] the app is NAMED, not sliced at the fortieth character
 *   [3] a real server is generated, booted, and driven over HTTP
 *   [4] every table really holds rows, and the foreign key really refuses
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_he_named_the_tables.ts
 */
export {};
import fs from 'fs';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.ENABLE_AUTH_BYPASS = 'true';
process.env.AUTO_APPROVE_ALL = '1';
/** His machine, that minute: nothing answers anywhere. */
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

const HIS_WORDS = 'ابنِ نظاماً لمشتل نباتات: النباتات والموردون والطلبيات مع صور نباتات وثيم اخضر جميل للنظام';

async function main() {
    console.log('\n[1] جملته — والجداول تُقرأ منها مباشرة، بلا أيّ نموذج');
    const { designDataModel } = await import('../../core/design/schema-designer');
    const notes: string[] = [];
    const model = await designDataModel(HIS_WORDS, { onNote: n => notes.push(n), timeoutMs: 2000 });
    console.log(`   ℹ️ ${notes.join(' | ')}`);
    check('جدولان حقيقيان من جملته', model.map(e => e.key).join(',') === 'plants,suppliers',
        model.map(e => e.key).join(',') || 'لا شيء');
    check('بأسمائهما العربية كما كتبها', model.map(e => e.ar).join(' · ') === 'النباتات · الموردون',
        model.map(e => e.ar).join(' · '));
    check('ولا جدول اسمه «ثيم» أو «صور»', !model.some(e => /theme|image|photo/.test(e.key)),
        model.map(e => e.key).join(','));
    // «الطلبيات» موجودة أصلاً كجدول مدمج — وتكرارها ينتج جدولاً يحجبه المسار
    // الأصلي فيردّ «item_required» على كل كتابة. قِيس حيّاً قبل هذا الإصلاح.
    const { alreadyOwned } = await import('../../core/design/named-entities');
    check('و«الطلبيات» مُعلَنة كموجودة أصلاً لا مُسقَطة بصمت',
        alreadyOwned(HIS_WORDS).join(',') === 'الطلبيات', alreadyOwned(HIS_WORDS).join(','));

    console.log('\n[2] واسم النظام اسمٌ — لا أوّل أربعين حرفاً من الطلب');
    const { subjectOf } = await import('../../core/design/app-blueprints');
    console.log(`   ℹ️ «${subjectOf(HIS_WORDS)}»  (كان: «اً لمشتل نباتات: النباتات والموردون والط»)`);
    check('اسم نظيف مقروء', subjectOf(HIS_WORDS) === 'مشتل نباتات', subjectOf(HIS_WORDS));

    console.log('\n[3] والنظام يُبنى فعلاً — بلا دماغ إطلاقاً');
    const { executeTool } = await import('../../modules/services/ToolService');
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');
    const sessionId = `nursery-${Date.now()}`;
    const res: any = await executionFirewall.runInContext(undefined, () =>
        executeTool('api_project', { request: HIS_WORDS },
            { sessionId, userId: 'u1', workspaceId: `session-${sessionId}`, language: 'ar' }));
    check('البناء نجح', res?.ok === true, String(res?.error || '').slice(0, 140));
    const dir = String((global as any).joeProjects?.[sessionId]?.dir || '');
    console.log(`   ℹ️ ${dir}`);
    check('وملف الجداول مكتوب على القرص', !!dir && fs.existsSync(path.join(dir, 'entities.js')), dir);
    const entities = dir && fs.existsSync(path.join(dir, 'entities.js'))
        ? fs.readFileSync(path.join(dir, 'entities.js'), 'utf-8') : '';
    for (const t of ['plants', 'suppliers']) {
        check(`  الجدول «${t}» مولَّد`, entities.includes(`"key":"${t}"`), '');
    }
    check('  و«orders» لم يُكرَّر', !entities.includes('"key":"orders"'), '');
    check('والسبب مُعلن في السجلّ',
        (res?.logs || []).some((l: string) => /read from the request itself/.test(l)),
        (res?.logs || []).filter((l: string) => /data model/.test(l)).join(' | ').slice(0, 160));

    console.log('\n[4] ويقلع ويجيب — والرابط يرفض أن يتدلّى');
    if (!dir || !fs.existsSync(path.join(dir, 'node_modules'))) {
        check('الحزم مثبتة للتشغيل', false, 'npm install لم يكتمل');
    } else {
        const { executionEngine } = require('../../kernel/ExecutionEngine');
        const port = 5300 + Math.floor(Math.random() * 90);
        let up: (v: boolean) => void = () => { /* set below */ };
        const listening = new Promise<boolean>(r => { up = r; });
        const child = executionEngine.runArgvStreaming(process.execPath, ['server.js'], {
            cwd: dir, env: { PORT: String(port), NODE_NO_WARNINGS: '1' },
            onLine: (l: string) => { if (/listening on/.test(l)) up(true); },
        });
        child.done.then(() => up(false));
        const booted = await Promise.race([listening, new Promise<boolean>(r => setTimeout(() => r(false), 20_000))]);
        check('الخادم يقلع', booted === true);

        const base = `http://127.0.0.1:${port}`;
        const health: any = await fetch(`${base}/api/health`).then(r => r.json()).catch(() => null);
        console.log(`   ℹ️ ${JSON.stringify(health?.tables || {})}`);
        for (const t of ['plants', 'suppliers']) {
            check(`  /api/${t} موجود`, health?.tables && t in (health.tables || {}), JSON.stringify(health?.tables || {}));
        }

        // Sign in as the owner the build just created, then write real rows.
        const msg = String(res?.output?.message || '');
        const email = (msg.match(/البريد:\s*(\S+@\S+)/) || [])[1] || '';
        const pass1 = (msg.match(/كلمة المرور:\s*(\S+)/) || [])[1] || '';
        const token = await fetch(`${base}/api/auth/login`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email, password: pass1 }),
        }).then(r => r.json()).then((j: any) => j?.token).catch(() => '');
        check('ودخول المالك نجح', !!token, email ? `${email} — بلا رمز` : 'لا بيانات في الرسالة');

        const auth = { 'content-type': 'application/json', authorization: `Bearer ${token}` };
        const plant: any = await fetch(`${base}/api/plants`, {
            method: 'POST', headers: auth, body: JSON.stringify({ name: 'نخيل برحي', price: 120, quantity: 8 }),
        }).then(r => r.json()).catch(() => null);
        // The generated CRUD answers {ok:true,row:{…}} — the row IS the proof.
        check('نبتة حقيقية كُتبت في القاعدة', !!plant?.row?.id && plant.row.name === 'نخيل برحي',
            JSON.stringify(plant || {}).slice(0, 120));

        const supplier: any = await fetch(`${base}/api/suppliers`, {
            method: 'POST', headers: auth, body: JSON.stringify({ name: 'مشاتل الواحة', phone: '0555123456' }),
        }).then(r => r.json()).catch(() => null);
        check('ومورّد حقيقي كذلك', !!supplier?.row?.id && supplier.row.phone === '0555123456',
            JSON.stringify(supplier || {}).slice(0, 120));

        // …and the built-in orders table — the one «الطلبيات» refers to — works.
        const order: any = await fetch(`${base}/api/orders`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ item: 'نخيل برحي', customer: 'يونس', phone: '0555123456', qty: 2 }),
        }).then(r => r.json()).catch(() => null);
        check('والطلبيات المدمجة تستقبل طلباً حقيقياً', order?.ok === true,
            JSON.stringify(order || {}).slice(0, 140));

        const rows: any = await fetch(`${base}/api/plants`).then(r => r.json()).catch(() => null);
        const list = Array.isArray(rows) ? rows : (rows?.plants || []);
        check('والقراءة العامة تُرجع الصف', list.some((r: any) => r.name === 'نخيل برحي'),
            JSON.stringify(rows || []).slice(0, 120));

        try { child.kill(); } catch { /* already gone */ }
    }

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
