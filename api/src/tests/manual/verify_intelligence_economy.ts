/**
 * WIRE PROOF — the intelligence economy, measured on the REAL router with a
 * REAL (fake-Ollama) local brain over HTTP and an intercepted Groq:
 *
 *   1. purpose:'internal' + local brain ready → Groq receives ZERO requests,
 *      the local brain answers.
 *   2. A normal ANSWER call → the custom Groq route answers as before.
 *   3. Groq's daily quota dies (429 TPD, verbatim field format) → the route
 *      pauses itself for the window the 429 names; the NEXT answer call
 *      never touches Groq and the local mesh carries it.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_intelligence_economy.ts
 */
import http from 'http';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.LLM_CACHE_DISABLE = '1';
process.env.GROQ_API_KEY = 'gsk_wireproof_dummy';
delete process.env.GEMINI_API_KEY; delete process.env.GOOGLE_API_KEY;
delete process.env.CEREBRAS_API_KEY; delete process.env.MISTRAL_API_KEY;

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const TPD_429 = JSON.stringify({
    error: {
        message: 'Rate limit reached for model `llama-3.3-70b-versatile` in organization `org_x` service tier `on_demand` on tokens per day (TPD): Limit 100000, Used 100000, Requested 500. Please try again in 5m0.5s. Need more tokens? Upgrade to Dev Tier.',
        type: 'tokens', code: 'rate_limit_exceeded',
    },
});

async function main() {
    // ── fake Ollama: the local brain, over real HTTP ────────────────────
    const local = http.createServer((req, res) => {
        let body = ''; req.on('data', c => (body += c));
        req.on('end', () => {
            res.setHeader('Content-Type', 'application/json');
            if (req.url === '/api/tags') res.end(JSON.stringify({ models: [{ name: 'qwen2.5-coder:7b' }] }));
            else if (req.url?.includes('/chat/completions')) res.end(JSON.stringify({ choices: [{ message: { content: 'LOCAL-OK' } }] }));
            else if (req.url === '/api/generate' || req.url === '/api/pull') res.end(JSON.stringify({ done: true, status: 'success' }));
            else { res.statusCode = 404; res.end('{}'); }
        });
    });
    await new Promise<void>(r => local.listen(0, '127.0.0.1', r));
    process.env.LOCAL_LLM_BASE_URL = `http://127.0.0.1:${(local.address() as any).port}/v1`;
    process.env.LOCAL_LLM_MODEL = 'qwen2.5-coder:7b';

    // ── Groq interceptor: counts every hit; everything non-local is offline ──
    const realFetch = global.fetch;
    let groqHits = 0;
    let groqMode: 'ok' | 'tpd' = 'ok';
    global.fetch = (async (url: any, init?: any) => {
        const u = String(typeof url === 'object' ? url?.url || url : url);
        if (u.includes('api.groq.com')) {
            groqHits++;
            if (groqMode === 'tpd') return new Response(TPD_429, { status: 429, headers: { 'Content-Type': 'application/json' } });
            return new Response(JSON.stringify({ choices: [{ message: { content: 'GROQ-OK' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (u.includes('127.0.0.1') || u.includes('localhost')) return realFetch(url as any, init);
        throw new Error('offline (economy proof sandbox)');
    }) as any;

    const { detectLocalModels } = await import('../../core/llm/local-brain');
    await detectLocalModels();
    const { routeToModel, customRouteCooldownUntil } = await import('../../core/llm/intelligent-router');
    const groqCfg = { provider: 'groq', model: 'llama-3.3-70b-versatile', apiKey: 'gsk_wireproof_dummy', baseUrl: 'https://api.groq.com/openai/v1' };
    const ask = (text: string, purpose?: string) => routeToModel(
        [{ role: 'user', content: text }], undefined, undefined, undefined, undefined, undefined, undefined,
        { modelConfig: groqCfg, ...(purpose ? { purpose } : {}) });

    // ── 1. internal call: quota untouched, local answers ────────────────
    console.log('\n[1] استدعاء داخلي (تخطيط/نية) والدماغ المحلي جاهز');
    const r1 = await ask('Classify this request intent: build a landing page', 'internal');
    check('the local brain answered', r1 === 'LOCAL-OK', r1.slice(0, 60));
    check('Groq received ZERO requests', groqHits === 0, `hits=${groqHits}`);

    // ── 2. answer call: the custom route works exactly as before ────────
    console.log('\n[2] استدعاء إجابة عادي — مسار Groq المخصص كما كان');
    const r2 = await ask('اكتب فقرة ترحيبية للمستخدم');
    check('Groq answered the user-facing call', r2 === 'GROQ-OK', r2.slice(0, 60));
    check('exactly one Groq request was spent', groqHits === 1, `hits=${groqHits}`);

    // ── 3. quota death: the route pauses ITSELF for the named window ────
    console.log('\n[3] نفاد الحصة اليومية (429 TPD حرفي من السجل)');
    groqMode = 'tpd';
    const r3 = await ask('اكتب رد آخر للمستخدم');
    const hitsAfter429 = groqHits;
    check('the mesh still produced an answer (local carried it)', r3 === 'LOCAL-OK', r3.slice(0, 80));
    const paused = [...customRouteCooldownUntil.values()].some(v => v > Date.now() + 3 * 60_000);
    check('the custom route paused itself ~5min (parsed from the 429)', paused,
        JSON.stringify([...customRouteCooldownUntil.entries()].map(([k, v]) => [k.split(':')[0], Math.round((v - Date.now()) / 1000) + 's'])));

    const r4 = await ask('ورد ثالث بعد النفاد');
    check('the NEXT call never touched Groq (pause honoured)', groqHits === hitsAfter429, `hits ${hitsAfter429} → ${groqHits}`);
    check('and it was still answered', r4 === 'LOCAL-OK', r4.slice(0, 60));

    global.fetch = realFetch;
    local.close();
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
