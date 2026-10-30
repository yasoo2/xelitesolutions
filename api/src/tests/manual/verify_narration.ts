/**
 * The narration is REAL: the model writes it, and a failure shows nothing.
 *
 *   npm run verify:narration
 *
 * Two properties, both driven through the actual orchestrator against a stub
 * model served over HTTP, so the real router and the real loop run:
 *
 *   1. The line varies with WHAT ACTUALLY HAPPENED. A template cannot do that,
 *      and that is the whole difference between narration and decoration.
 *   2. When the model refuses, times out or answers badly, NOTHING is broadcast.
 *      No fallback sentence — that would be the fake this replaced.
 */

import http from 'http';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'verify-narration-secret';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.MOCK_DB = 'true';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

import { narrate, narrationPrompt, extractNarration } from '../../core/agents/narrator';

/** A stub that answers a narration prompt by reading the prompt, like a model. */
function replyLikeAModel(prompt: string): string {
    const failed = /HOW IT WENT: it FAILED/.test(prompt);
    const first = /This is the first step\./.test(prompt);
    const what = (prompt.match(/WHAT YOU ARE ABOUT TO DO: ([^\n(]+)/) || [, 'العمل'])[1].trim();
    if (first) return `أبدأ بـ${what} لأنها أول خطوة في الخطة.`;
    if (failed) return `الخطوة السابقة فشلت، لذلك أعيد المحاولة عبر ${what}.`;
    return `اكتملت الخطوة السابقة، فأنتقل الآن إلى ${what}.`;
}

function serve(reply: (p: string) => string | null, delayMs = 0): Promise<{ url: string; close: () => void }> {
    return new Promise(resolve => {
        const s = http.createServer((req, res) => {
            let b = ''; req.on('data', c => { b += c; });
            req.on('end', () => setTimeout(() => {
                let prompt = '';
                try { prompt = (JSON.parse(b || '{}').messages || []).map((m: any) => String(m.content ?? '')).join('\n'); } catch { }
                const content = reply(prompt);
                if (content === null) { res.writeHead(500); res.end('boom'); return; }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ choices: [{ message: { content } }] }));
            }, delayMs));
        });
        s.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${(s.address() as any).port}/v1`, close: () => s.close() }));
    });
}

const checks: Array<[string, boolean, unknown]> = [];
const add = (n: string, pass: boolean, detail?: unknown) => checks.push([n, pass, detail]);

async function main() {
    const { routeToModel } = require('../../core/llm/intelligent-router');
    const stub = await serve(replyLikeAModel);
    const call = (prompt: string) => routeToModel(
        [{ role: 'user', content: prompt }], undefined, undefined, undefined, undefined, undefined, undefined,
        { modelConfig: { provider: 'openai', model: 'stub', apiKey: 'sk-stub', baseUrl: stub.url } });

    const base = { goal: 'ابني متجرًا إلكترونيًا لبيع العطور', total: 3, isArabic: true };

    // 1. The line depends on the real outcome of the previous step.
    const opening = await narrate({ ...base, next: { task: 'تخطيط الأقسام' }, index: 1 }, call);
    const afterOk = await narrate({ ...base, done: { task: 'تخطيط الأقسام', ok: true }, next: { task: 'كتابة الصفحة' }, index: 2 }, call);
    const afterFail = await narrate({ ...base, done: { task: 'كتابة الصفحة', ok: false, summary: 'انتهت المهلة' }, next: { task: 'إعادة المحاولة' }, index: 3 }, call);

    add('the opening line knows it is the first step', /أول خطوة/.test(opening.text), opening.text);
    add('a line after success reads as a continuation', /اكتملت/.test(afterOk.text), afterOk.text);
    add('a line after FAILURE reacts to the failure', /فشلت/.test(afterFail.text), afterFail.text);
    add('the three lines are all different', new Set([opening.text, afterOk.text, afterFail.text]).size === 3,
        [opening.text, afterOk.text, afterFail.text]);
    add('every line is in the requested language', [opening, afterOk, afterFail].every(l => /[ؠ-ٟ]/.test(l.text)), null);
    stub.close();

    // 2. Failure is SILENCE, not a stand-in sentence.
    const broken = await serve(() => null);
    const brokenCall = (p: string) => routeToModel([{ role: 'user', content: p }], undefined, undefined, undefined, undefined, undefined, undefined,
        { modelConfig: { provider: 'openai', model: 'stub', apiKey: 'sk-stub', baseUrl: broken.url } });
    const onError = await narrate({ ...base, next: { task: 'أي خطوة' }, index: 1 }, brokenCall);
    add('a broken model produces NO line', onError.text === '', onError);
    broken.close();

    const slow = await serve(replyLikeAModel, 3000);
    const slowCall = (p: string) => routeToModel([{ role: 'user', content: p }], undefined, undefined, undefined, undefined, undefined, undefined,
        { modelConfig: { provider: 'openai', model: 'stub', apiKey: 'sk-stub', baseUrl: slow.url } });
    const t0 = Date.now();
    const onSlow = await narrate({ ...base, next: { task: 'أي خطوة' }, index: 1 }, slowCall, { timeoutMs: 400 });
    const waited = Date.now() - t0;
    add('a slow model produces NO line', onSlow.text === '', onSlow);
    add('and does not hold the step up', waited < 1500, `${waited}ms`);
    slow.close();

    // 3. A model that ignores the instruction is refused, not displayed.
    for (const [label, bad] of [
        ['a whole paragraph', 'أولًا سأفعل هذا. ثم ذاك. ثم الآخر. وأخيرًا أنشر.'],
        ['markdown', '## أكتب قسم الأسعار الآن بعد اكتمال الخدمات'],
        ['the wrong language', 'Writing the pricing section now.'],
        ['nothing at all', '   '],
    ] as const) {
        const got = extractNarration(bad, { goal: base.goal, isArabic: true });
        add(`refuses ${label}`, got.text === '', got);
    }

    // 4. The prompt genuinely carries the outcome — not just the step name.
    const p = narrationPrompt({ ...base, done: { task: 'x', ok: false, summary: 'رفض الخادم' }, next: { task: 'y' }, index: 2 });
    add('the prompt carries the real outcome', /it FAILED/.test(p) && /رفض الخادم/.test(p), null);

    let failed = 0;
    for (const [n, pass, detail] of checks) {
        if (!pass) failed++;
        console.log(`${pass ? '✓' : '✗'} ${n}${pass ? '' : '  — ' + JSON.stringify(detail)}`);
    }
    console.log(`\n${checks.length - failed}/${checks.length} passed.`);
    process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
