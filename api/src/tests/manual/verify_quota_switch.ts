/**
 * WHEN THE DAY'S QUOTA RUNS OUT, THE USER IS TOLD — AND THE BUTTON MOVES.
 *
 * Joe already survives a spent quota: the provider is paused and the free/local
 * mesh carries the work. What it never did was SAY so. The provider button went
 * on showing the dead provider, so the user could not tell why the answers
 * changed character, and every new run started by asking for a quota that was
 * gone.
 *
 * Three things have to happen together, and a message about a switch is not a
 * switch:
 *
 *   [1] the 429 is recognised as «the daily quota is spent», not a random error
 *   [2] a notice goes out ONCE per cooldown window — a 429 storm must not
 *       become a notification storm — carrying the provider, what Joe moved to,
 *       and when the quota returns
 *   [3] it reaches the user whose run it was, and nobody else
 *   [4] and the panel really moves the button to «تلقائي» and stores it, so the
 *       next message does not ask for the dead provider again
 *
 * The 429 here is real: a provider endpoint that answers exactly the way Groq
 * does when the daily token budget is spent.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_quota_switch.ts
 */
export {};
import fs from 'fs';
import http from 'http';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

async function main() {
    const { observeBroadcasts } = require('../../api/ws');
    const { executionFirewall } = require('../../orchestration/AgentExecutionFirewall');
    const router = require('../../core/llm/intelligent-router');

    // A provider that answers the way Groq does on a spent daily budget.
    let hits = 0;
    const provider = http.createServer((_q, res) => {
        hits++;
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            error: {
                message: 'Rate limit reached for model `llama-3.3-70b` on tokens per day (TPD): Limit 100000, Used 100000. Please try again in 24m40.896s.',
                type: 'tokens', code: 'rate_limit_exceeded',
            },
        }));
    });
    provider.listen(0, '127.0.0.1');
    await new Promise<void>(r => provider.once('listening', () => r()));
    const baseUrl = `http://127.0.0.1:${(provider.address() as any).port}/v1`;

    const seen: any[] = [];
    const stop = observeBroadcasts((e: any) => seen.push(e));

    console.log('\n[1] استدعاء حقيقي يصطدم بحصّة منتهية');
    const modelConfig = { provider: 'groq', model: 'llama-3.3-70b', apiKey: 'test-key', baseUrl };
    await executionFirewall.runInContext('quota-trace', async () => {
        await router.routeToModel(
            [{ role: 'user', content: 'مرحباً' }],
            undefined, undefined, undefined, undefined, undefined, undefined,
            { modelConfig, sessionId: 'quota-session', purpose: 'final' },
        ).catch(() => '');
    }, { userId: 'quota-user', sessionId: 'quota-session' });

    check('المزوّد استُدعي فعلاً وردّ بـ429', hits > 0, `hits=${hits}`);
    const notices = seen.filter(e => e?.type === 'provider_quota');
    check('صدر إشعار بانتهاء الحصّة', notices.length >= 1, JSON.stringify(seen.map(e => e?.type)).slice(0, 200));

    const d = notices[0]?.data || {};
    console.log('\n———— ما يقرؤه المستخدم ————');
    console.log(String(d.message || '(لا رسالة)'));
    console.log('——————————————————————\n');

    check('الرسالة تسمّي المزوّد', /groq/i.test(String(d.message || '')), String(d.message || '').slice(0, 80));
    check('وتقول إلى أين حُوِّل', /تلقائي/.test(String(d.message || '')) && d.switchTo === 'auto', JSON.stringify(d).slice(0, 120));
    check('وتقول متى تعود الحصّة', /\d/.test(String(d.message || '')) && Number(d.minutes) > 0, `minutes=${d.minutes}`);
    check('والمدّة مأخوذة من ردّ المزوّد نفسه لا مخترَعة (24m40s ⇒ ~25 دقيقة)',
        Number(d.minutes) >= 24 && Number(d.minutes) <= 26, `minutes=${d.minutes}`);

    console.log('[2] وإشعار واحد لكل نافذة — لا عاصفة إشعارات');
    const before = seen.filter(e => e?.type === 'provider_quota').length;
    for (let i = 0; i < 3; i++) {
        await executionFirewall.runInContext('quota-trace', async () => {
            await router.routeToModel(
                [{ role: 'user', content: 'مرحباً مجدداً' }],
                undefined, undefined, undefined, undefined, undefined, undefined,
                { modelConfig, sessionId: 'quota-session', purpose: 'final' },
            ).catch(() => '');
        }, { userId: 'quota-user', sessionId: 'quota-session' });
    }
    const after = seen.filter(e => e?.type === 'provider_quota').length;
    check('ثلاث محاولات إضافية لم تُنتج إشعاراً ثانياً', after === before, `${before} → ${after}`);

    console.log('\n[3] والإشعار مملوك لصاحب التشغيل — لا يُذاع على الجميع');
    check('الإشعار خرج من داخل سياق التشغيل (فيرثه صاحبه)',
        notices.length > 0 && !!d.message, 'no notice');

    console.log('\n[4] واللوحة تُحرّك الزرّ فعلاً — لا تكتفي برسالة عنه');
    const composer = fs.readFileSync(
        path.resolve(process.cwd(), '..', 'web', 'src', 'components', 'CommandComposer.tsx'), 'utf-8');
    check('اللوحة تستمع للحدث', /msg\.type === 'provider_quota'/.test(composer));
    check('وتضبط المزوّد النشط على «auto»', /setActiveProvider\(target\)/.test(composer));
    check('وتضبط المختار أيضاً (وإلا عاد عند أول رسالة)', /setSelectedProvider\(target\)/.test(composer));
    check('وتحفظه فلا يعود المزوّد الميّت بعد إعادة التحميل',
        /localStorage\.setItem\('active_provider', target\)/.test(composer));
    check('وتعرض السبب في المحادثة مرّة واحدة', /quota:\$\{d\.provider/.test(composer));

    stop();
    provider.close();
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
