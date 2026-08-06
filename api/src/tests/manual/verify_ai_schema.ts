/**
 * «لماذا لا يملك جو الأدوات المناسبة ويتم تحريكه بواسطة الذكاء الاصطناعي؟»
 *
 * Because six hand-written domains is a ceiling with his name on it: a
 * veterinary clinic, a freight company, a gym — anything outside them fell back
 * to one table and waited for me to add a seventh domain by hand.
 *
 * The model is let in exactly where it is trustworthy on a 15-watt laptop: it
 * DESIGNS the tables under a decoder constrained by a JSON Schema, a strict
 * validator refuses anything unsafe, and the deterministic generator — already
 * proven — builds them.
 *
 * The local brain here is a REAL HTTP server speaking Ollama's protocol, so the
 * whole chain is exercised for real. What it stands in for is the one thing
 * this sandbox has no way to run: his own qwen. Everything downstream of the
 * model's answer — validation, tables, CRUD, foreign keys — is the real code.
 *
 *   [1] the request carries the schema in `format` — the decoder is constrained
 *   [2] a design outside the six domains becomes REAL TABLES
 *   [3] and real CRUD over HTTP, with a foreign key that refuses to dangle
 *   [4] a model that answers garbage cannot poison a build
 *   [5] a known domain is never handed to a model — it is already better
 *   [6] and with no model at all, yesterday's behaviour, exactly
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_ai_schema.ts
 */
export {};
import fs from 'fs';
import http from 'http';
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

/**
 * A freight company: none of the six domains covers it.
 *
 * The first draft of this proof asked for a «veterinary clinic» and the CLINIC
 * domain matched on the word «clinic» — so the model was never consulted and
 * four checks failed. The known domains win by design; a proof of the model
 * path has to stand outside all of them.
 */
const REQUEST = 'Build a system for a freight company: trucks, drivers and routes';

/** What a constrained 7B answers when it is asked to design that. */
const DESIGN = {
    entities: [
        {
            key: 'trucks', label_ar: 'الشاحنات', label_en: 'trucks',
            fields: [
                { key: 'plate', type: 'TEXT', required: true, label_ar: 'رقم اللوحة', label_en: 'plate' },
                { key: 'capacity', type: 'REAL', label_ar: 'الحمولة', label_en: 'capacity (t)' },
            ],
            belongs_to: 'drivers',
        },
        {
            key: 'drivers', label_ar: 'السائقون', label_en: 'drivers',
            fields: [
                { key: 'name', type: 'TEXT', required: true, label_ar: 'الاسم', label_en: 'name' },
                { key: 'phone', type: 'TEXT', label_ar: 'الهاتف', label_en: 'phone' },
            ],
        },
        {
            key: 'routes', label_ar: 'الرحلات', label_en: 'routes',
            fields: [
                { key: 'origin', type: 'TEXT', required: true, label_ar: 'من', label_en: 'origin' },
                { key: 'destination', type: 'TEXT', label_ar: 'إلى', label_en: 'destination' },
            ],
            belongs_to: 'trucks',
        },
    ],
};

/** A model that answers nonsense — the case that must not reach a build. */
const GARBAGE = { entities: [{ key: 'DROP TABLE x', label_ar: '', label_en: '', fields: [] }] };

let lastBody: any = null;
function fakeOllama(answer: () => any) {
    const srv = http.createServer((req, res) => {
        if (String(req.url || '').startsWith('/api/tags')) {
            res.writeHead(200, { 'content-type': 'application/json' });
            return res.end(JSON.stringify({ models: [{ name: 'qwen2.5-coder:7b' }] }));
        }
        let raw = '';
        req.on('data', c => { raw += c; });
        req.on('end', () => {
            try { lastBody = JSON.parse(raw); } catch { lastBody = null; }
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ response: JSON.stringify(answer()), done: true }));
        });
    });
    return srv;
}

async function main() {
    console.log('\n[1] الدماغ المحلّي يُسأل بمخطّط — لا بنصّ حرّ');
    let answer: () => any = () => DESIGN;
    const srv = fakeOllama(() => answer());
    await new Promise<void>(r => srv.listen(0, '127.0.0.1', () => r()));
    const port = (srv.address() as any).port;
    process.env.OLLAMA_HOST = `http://127.0.0.1:${port}`;
    process.env.LOCAL_LLM_MODEL = 'qwen2.5-coder:7b';

    const { designDataModel, validateDesign, ENTITY_SCHEMA } = await import('../../core/design/schema-designer');
    const notes: string[] = [];
    const designed = await designDataModel(REQUEST, { onNote: n => notes.push(n) });
    console.log(`   ℹ️ ${notes.join(' · ')}`);
    check('الطلب ذهب إلى /api/generate', !!lastBody, 'لا طلب');
    check('ومعه المخطّط في format — الترميز مقيَّد', JSON.stringify(lastBody?.format || {}) === JSON.stringify(ENTITY_SCHEMA),
        JSON.stringify(lastBody?.format || {}).slice(0, 80));
    check('وبحرارة صفر — تصميم لا ارتجال', lastBody?.options?.temperature === 0, JSON.stringify(lastBody?.options));
    check('وبالنموذج الذي اختاره جو', lastBody?.model === 'qwen2.5-coder:7b', String(lastBody?.model));

    console.log('\n[2] وما صمّمه صار جداول حقيقية');
    console.log(`   ℹ️ ${designed.map(e => e.key).join(', ') || 'لا شيء'}`);
    check('ثلاثة كيانات خارج المجالات الستّة', designed.length === 3, String(designed.length));
    check('ومنها الروابط', designed.filter(e => e.belongsTo).length === 2,
        designed.map(e => `${e.key}→${e.belongsTo?.entity || '—'}`).join(' '));
    check('والمفتاح الخارجي أُضيف كعمود حقيقي',
        designed.find(e => e.key === 'trucks')?.fields.some(f => f.key === 'driver_id') === true,
        JSON.stringify(designed.find(e => e.key === 'trucks')?.fields.map(f => f.key)));

    console.log('\n[3] وبناء حقيقي بها — ثم CRUD عبر HTTP');
    const { executeTool } = await import('../../modules/services/ToolService');
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');
    const sessionId = `ai-schema-${Date.now()}`;
    const res: any = await executionFirewall.runInContext(undefined, () =>
        executeTool('api_project', { request: REQUEST },
            { sessionId, userId: 'u1', workspaceId: `session-${sessionId}`, language: 'en' }));
    check('البناء نجح', res?.ok === true, String(res?.error || '').slice(0, 140));
    const dir = String((global as any).joeProjects?.[sessionId]?.dir || '');
    check('ملف الكيانات مكتوب', fs.existsSync(path.join(dir, 'entities.js')), dir);
    check('والسجلّ يقول إنّ النموذج صمّمه',
        (res?.logs || []).some((l: string) => /designed for this request/.test(l)),
        (res?.logs || []).filter((l: string) => /data model/.test(l)).join(' | ').slice(0, 160));

    const cred = String(res?.output?.message || '').match(/Owner account[^:]*:\s*(\S+@\S+)\s*\/\s*(\S+)/);
    if (cred && fs.existsSync(path.join(dir, 'node_modules'))) {
        const { executionEngine } = require('../../kernel/ExecutionEngine');
        const p2 = 5100 + Math.floor(Math.random() * 90);
        let up: (v: boolean) => void = () => { /* set below */ };
        const listening = new Promise<boolean>(r => { up = r; });
        const child = executionEngine.runArgvStreaming(process.execPath, ['server.js'], {
            cwd: dir, env: { PORT: String(p2), NODE_NO_WARNINGS: '1' },
            onLine: (l: string) => { if (/listening on/.test(l)) up(true); },
        });
        child.done.then(() => up(false));
        const booted = await Promise.race([listening, new Promise<boolean>(r => setTimeout(() => r(false), 20_000))]);
        check('الخادم أقلع', booted === true);
        const base = `http://127.0.0.1:${p2}`;
        const J = (r: Response) => r.json().catch(() => null) as any;
        const health: any = await fetch(`${base}/api/health`).then(J);
        console.log(`   ℹ️ ${JSON.stringify(health?.tables || null)}`);
        check('ثلاثة جداول في الصحة', Object.keys(health?.tables || {}).length === 3, JSON.stringify(health?.tables));

        const login: any = await fetch(`${base}/api/auth/login`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: cred[1], password: cred[2] }),
        }).then(J);
        const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${login?.token}` };
        const driver: any = await fetch(`${base}/api/drivers`, {
            method: 'POST', headers: auth, body: JSON.stringify({ name: 'يونس', phone: '0599' }),
        }).then(J);
        check('أُنشئ سائق', driver?.row?.id > 0, JSON.stringify(driver || {}).slice(0, 120));
        const orphan: any = await fetch(`${base}/api/trucks`, {
            method: 'POST', headers: auth, body: JSON.stringify({ plate: 'ABC-1', driver_id: 999 }),
        }).then(J);
        check('وشاحنة لسائق غير موجود مرفوضة', orphan?.ok === false && /driver_id_not_found/.test(String(orphan?.error)),
            JSON.stringify(orphan || {}).slice(0, 120));
        const truck: any = await fetch(`${base}/api/trucks`, {
            method: 'POST', headers: auth, body: JSON.stringify({ plate: 'ABC-1', capacity: 12, driver_id: driver.row.id }),
        }).then(J);
        check('ولسائق موجود مقبولة', truck?.row?.id > 0, JSON.stringify(truck || {}).slice(0, 120));
        try { child.kill(); } catch { /* already gone */ }
    } else check('الخادم جاهز للتجربة', false, 'لا حزم مثبتة');

    console.log('\n[4] ونموذج يهذي لا يُفسد بناءً');
    answer = () => GARBAGE;
    const notes2: string[] = [];
    const bad = await designDataModel('Build a system for a gym with members and monthly plans', { onNote: n => notes2.push(n) });
    console.log(`   ℹ️ ${notes2.join(' · ')}`);
    check('المصمّم رفضه', bad.length === 0, JSON.stringify(bad.map(e => e.key)));
    check('والمدقّق يرفض الاسم غير الآمن', validateDesign(GARBAGE) === null);
    check('ويرفض جدولاً واحداً — لا جديد فيه', validateDesign({ entities: [DESIGN.entities[1]] }) === null);
    check('ويرفض مفتاحاً يشير إلى جدول لم يُعلَن',
        (validateDesign({ entities: [DESIGN.entities[1], { ...DESIGN.entities[0], belongs_to: 'ghosts' }] }) || [])
            .every(e => !e.belongsTo));

    console.log('\n[5] ومجال معروف لا يُسأل عنه نموذج أصلاً');
    lastBody = null;
    const known = await designDataModel('Build a multi-vendor marketplace', {});
    check('المجالات الستّة أجابت', known.length === 4, String(known.length));
    check('ولم يُستدعَ النموذج', lastBody === null, JSON.stringify(lastBody?.model || null));

    console.log('\n[6] وبلا نموذج إطلاقاً — سلوك الأمس بالضبط');
    await new Promise<void>(r => srv.close(() => r()));
    delete process.env.LOCAL_LLM_MODEL;
    process.env.OLLAMA_HOST = 'http://127.0.0.1:1';
    const notes3: string[] = [];
    const none = await designDataModel('Build a system for a real estate agency with properties and viewings', { onNote: n => notes3.push(n), timeoutMs: 3000 });
    console.log(`   ℹ️ ${notes3.join(' · ')}`);
    check('لا جداول مُختلقة', none.length === 0, JSON.stringify(none.map(e => e.key)));
    check('والسبب مُعلن لا مبتلع', notes3.some(n => /no model answered|no domain matched/.test(n)), notes3.join(' | '));

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
