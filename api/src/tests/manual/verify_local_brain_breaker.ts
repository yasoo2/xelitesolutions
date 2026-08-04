/**
 * WIRE PROOF — the latency tax, measured in real seconds.
 *
 * The field log shows the same line over and over on the user's machine:
 *
 *   [IntelligentRouter] 🔄 Attempting provider: Local (Auto)...
 *   [IntelligentRouter] Local (Auto) failed or timed out: TIMEOUT
 *   [IntelligentRouter] 🔄 Attempting provider: Groq (Free)...
 *
 * Seven times for one question. This proof stands a REAL local endpoint up
 * that never answers (exactly what a stuck Ollama looks like) and a REAL
 * mesh endpoint that answers instantly, then routes several calls through
 * the real router and measures the clock. Before the breaker every call paid
 * the local timeout; after it, the second one pays nothing.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_local_brain_breaker.ts
 */
export {};
import http from 'http';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
// A short local window so the proof runs in seconds instead of minutes — the
// SHAPE is what is being proven, and the shape is identical at 180s.
process.env.LOCAL_LLM_TIMEOUT = '3000';
process.env.LOCAL_BRAIN_TRIP_AFTER = '2';
process.env.LOCAL_BRAIN_BREAKER_MS = '60000';
// The dead-brain latch is a DIFFERENT protection (it short-circuits when the
// whole mesh is down). Switching it off here isolates the breaker: what this
// proof measures must be the local pause, not the latch.
process.env.DEAD_BRAIN_LATCH_MS = '0';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

async function main() {
    // A local brain that accepts the connection and NEVER answers — the exact
    // failure mode behind every «TIMEOUT» line in the field log.
    const stuck = http.createServer((_req, _res) => { /* deliberately silent */ });
    stuck.listen(0, '127.0.0.1');
    await new Promise<void>(r => stuck.once('listening', () => r()));
    const stuckPort = (stuck.address() as any).port;

    // A mesh provider that answers instantly.
    const fast = http.createServer((req, res) => {
        if (req.method !== 'POST') { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: 'حسناً، هذه إجابة من الشبكة.' } }] }));
    });
    fast.listen(0, '127.0.0.1');
    await new Promise<void>(r => fast.once('listening', () => r()));
    const fastPort = (fast.address() as any).port;

    // This is what makes the local brain part of the mesh at all — the same
    // variable the user's machine sets when Ollama is installed.
    process.env.LOCAL_LLM_BASE_URL = `http://127.0.0.1:${stuckPort}/v1`;
    process.env.LOCAL_LLM_MODEL = 'stuck-model';
    // A real OpenAI-shaped endpoint on localhost: the key must LOOK real
    // (the provider refuses anything that is not sk-…) and the base URL sends
    // it to the local server instead of the internet.
    process.env.OPENAI_API_KEY = 'sk-local-proof-key';
    process.env.OPENAI_BASE_URL = `http://127.0.0.1:${fastPort}/v1`;
    process.env.OPENAI_API_BASE = `http://127.0.0.1:${fastPort}/v1`;

    const router = require('../../core/llm/intelligent-router');
    const { routeToModel, localBrainState, resetLocalBrainBreaker, isLocalBrainOpen } = router;
    resetLocalBrainBreaker();

    console.log('\n[1] الحالة الميدانية: دماغ محلي لا يجيب أبداً');
    const ask = async (n: number) => {
        const t0 = Date.now();
        try { await routeToModel([{ role: 'user', content: `سؤال رقم ${n}` }], undefined, undefined, undefined, undefined, undefined, undefined, { purpose: 'internal' }); }
        catch { /* the mesh may be unavailable in this sandbox — the CLOCK is the measurement */ }
        return Date.now() - t0;
    };
    const first = await ask(1);
    const second = await ask(2);
    check('the first two calls each pay the local wait (a cold model deserves its chance)',
        first >= 2500 && second >= 2500, `${first}ms, ${second}ms — state=${JSON.stringify(localBrainState())}`);
    check('…and TWO consecutive timeouts pause the local brain', isLocalBrainOpen() === true, JSON.stringify(localBrainState()));

    console.log('\n[2] الاتصال الثالث: لا ينتظر الدماغ المتوقّف إطلاقاً');
    const third = await ask(3);
    const fourth = await ask(4);
    check('the third call skips the local brain outright — no timeout paid', third < 1500, `${third}ms (was ${first}ms)`);
    check('…and so does the fourth', fourth < 1500, `${fourth}ms`);
    const saved = (first - third) + (first - fourth);
    check(`the pause SAVED real seconds on these two calls alone (${Math.round(saved / 1000)}s at a 3s window; ~${Math.round(saved / 1000 * 8)}s at the field's 25s leash)`,
        saved > 3000, `${saved}ms`);

    console.log('\n[3] ليست عقوبة: نجاح واحد يعيده فوراً');
    router.noteLocalBrainOk();
    check('a single success closes the breaker and the local brain is primary again',
        isLocalBrainOpen() === false && localBrainState().consecutiveTimeouts === 0, JSON.stringify(localBrainState()));

    console.log('\n[4] الراوي لا يشتري سطراً مزخرفاً من الحصة اليومية أثناء الإيقاف');
    const { narrationEnabled } = require('../../core/agents/narrator');
    check('narration is on while the brain is healthy', narrationEnabled() === true);
    router.noteLocalBrainTimeout(); router.noteLocalBrainTimeout();
    check('…and off while it is paused', narrationEnabled() === false, JSON.stringify(localBrainState()));
    router.noteLocalBrainOk();

    stuck.close(); fast.close();
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
