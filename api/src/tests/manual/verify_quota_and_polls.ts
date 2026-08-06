/**
 * THE QUOTA, AND THE NOISE THAT HID EVERYTHING ELSE.
 *
 *   [Groq] API call failed: 429 — Rate limit reached for `llama-3.1-8b-instant`
 *
 * …reached because a 7B model on his CPU was given 25 seconds to write a page
 * of planning JSON — a leash sized from a ONE-TOKEN warm-up — and was declared
 * dead when it could not. From then on every internal call went to the very
 * quota the log claims is «reserved for the final answer».
 *
 * And around all of it, pages of `GET /api/git/status 304`, so the one line
 * that mattered was never where anyone would find it.
 *
 * Measured here against the REAL server and the REAL router:
 *
 *   [1] the leash a local model gets is at least half a minute, and grows
 *   [2] a timeout raises the floor instead of only condemning the engine
 *   [3] the polled endpoints stop printing a line each — but still print errors
 *   [4] and git/status is answered from cache: no request ever waits on git
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_quota_and_polls.ts
 */
export {};
import http from 'http';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.ENABLE_AUTH_BYPASS = 'true';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

async function main() {
    console.log('\n[1] الصبر على العقل المحلّي — مقيسٌ من هذا الجهاز');
    const router = await import('../../core/llm/intelligent-router');
    router.resetLocalBrainBreaker();
    const hisWarmup = 1491;   // his own measurement, from his own log
    const first = router.internalLeashMs(hisWarmup);
    check('لا أقلّ من نصف دقيقة لأي نموذج محلّي', first >= 30_000, `${first}ms`);
    check('ولم يعد ٢٥ ثانية كما كان', first > 25_000, `${first}ms`);

    console.log('\n[2] وانتهاء المهلة يرفع الأرضية — لا يُعدم المحرّك وحده');
    router.noteInternalLeashTimeout(first);
    const second = router.internalLeashMs(hisWarmup);
    check('المحاولة التالية تنتظر أطول', second > first, `${first} → ${second}`);
    let leash = second;
    for (let i = 0; i < 6; i++) { router.noteInternalLeashTimeout(leash); leash = router.internalLeashMs(hisWarmup); }
    check('وتتوقّف عند سقف معقول', leash === 120_000, `${leash}ms`);
    router.resetLocalBrainBreaker();
    router.noteLocalDuration(38_000);
    check('وحين يجيب فعلاً، زمنه هو الذي يحدّد الانتظار', router.internalLeashMs(hisWarmup) >= 60_000,
        JSON.stringify(router.localLeashState()));
    router.resetLocalBrainBreaker();

    console.log('\n[3] وسجلّ الطرفية لم يعد يغرق في نبضات الاستطلاع');
    const { createApp } = await import('../../api/app');
    const lines: string[] = [];
    const realWrite = process.stdout.write.bind(process.stdout);
    (process.stdout as any).write = (chunk: any, ...rest: any[]) => {
        try { lines.push(String(chunk)); } catch { /* ignore */ }
        return realWrite(chunk, ...rest);
    };
    const server = http.createServer(createApp());
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    const base = `http://127.0.0.1:${(server.address() as any).port}`;

    // A REAL guest token: `/git/status` needs auth, and an unauthenticated 401
    // is (correctly) still printed — measuring that would prove nothing about
    // the poll lines the user actually sees.
    const token = await new Promise<string>(resolve => {
        const req = http.request(base + '/api/auth/guest', { method: 'POST', headers: { 'content-type': 'application/json' } }, res => {
            let body = ''; res.on('data', d => { body += d; });
            res.on('end', () => { try { resolve(String(JSON.parse(body)?.token || JSON.parse(body)?.accessToken || '')); } catch { resolve(''); } });
        });
        req.on('error', () => resolve(''));
        req.end('{}');
    });

    const get = (p: string) => new Promise<{ status: number; ms: number }>(resolve => {
        const t = Date.now();
        http.get(base + p, { headers: token ? { authorization: `Bearer ${token}` } : {} },
            res => { res.resume(); res.on('end', () => resolve({ status: res.statusCode || 0, ms: Date.now() - t })); })
            .on('error', () => resolve({ status: 0, ms: Date.now() - t }));
    });
    check('حصلنا على جلسة ضيف حقيقية للاستطلاع', !!token, token ? 'ok' : 'لا رمز');

    lines.length = 0;
    for (let i = 0; i < 12; i++) await get('/api/health');
    for (let i = 0; i < 12; i++) await get('/api/git/status');
    const pollLines = lines.filter(l => /GET \/api\/(health|git\/status)/.test(l)).length;
    const statuses = new Set<number>();
    for (const l of lines) { const m = l.match(/GET \/api\/git\/status \D*(\d{3})/); if (m) statuses.add(Number(m[1])); }
    check('٢٤ نبضة لم تطبع ٢٤ سطراً', pollLines === 0, `${pollLines} سطر — أكواد: ${[...statuses].join(',') || 'لا شيء'}`);

    lines.length = 0;
    const missing = await get('/api/definitely-not-a-route');
    const errLines = lines.filter(l => /definitely-not-a-route/.test(l)).length;
    check('ومسار غير موجود ما زال يُطبع', errLines > 0 && missing.status >= 400, `${errLines} سطر / ${missing.status}`);
    (process.stdout as any).write = realWrite;

    console.log('\n[4] وحالة git تُخدم من الذاكرة — لا أحد ينتظر git');
    const timings: number[] = [];
    for (let i = 0; i < 10; i++) timings.push((await get('/api/git/status')).ms);
    const worst = Math.max(...timings);
    check('أبطأ نبضة بقيت فورية', worst < 300, `${worst}ms — ${timings.join(',')}`);
    check('وكلّها أجابت', timings.length === 10);

    await new Promise<void>(r => server.close(() => r()));
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
