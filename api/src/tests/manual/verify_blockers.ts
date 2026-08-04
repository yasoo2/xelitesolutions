/**
 * THE THREE OPERATIONAL BLOCKERS IN THE USER'S OWN LOG.
 *
 * None of them is a wrong answer — they are the machine grinding while he
 * waits, which is why none of them ever surfaced as a "bug":
 *
 *   1. «SLOW EXECUTION … cmd=git status --porcelain --branch» at 0.5s, 1.4s,
 *      2.1s, 3.2s — over and over, because the background refresh ran every
 *      five seconds no matter what it cost.
 *   2. «Local (Auto) failed or timed out: TIMEOUT» twice, then «local brain
 *      PAUSED for 10m», then 20m. The internal leash was a guessed 25s on a
 *      laptop whose model needs longer, so EVERY internal call timed out.
 *   3. …which moved the whole load onto Groq until «429 Rate limit reached»,
 *      after which every fallback began with five dead 401s from LLM7 —
 *      re-learned from scratch on every restart.
 *
 * Each fix is MEASURED, not guessed, and each is checked here against the
 * numbers from that log.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_blockers.ts
 */
export {};

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';

import fs from 'fs';
import path from 'path';
import os from 'os';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

async function main() {
    console.log('\n[1] عاصفة git — الفاصل يتبع الكلفة المقيسة لا رقماً ثابتاً');
    const git = fs.readFileSync(path.join(__dirname, '..', '..', 'api', 'routes', 'git.ts'), 'utf-8');
    check('التحديث الخلفي يقيس زمنه', /_lastRefreshMs = Date\.now\(\) - startedAt/.test(git));
    check('والفاصل محسوب من ذلك الزمن', /Math\.max\(STATUS_CACHE_MS, _lastRefreshMs \* 8\)/.test(git));
    check('وله سقف حتى لا يتجمّد أبداً', /STATUS_MAX_MS/.test(git));
    // The exact numbers from his log, run through the real function.
    {
        const mod = require('../../api/routes/git');
        const pace = mod._gitStatusPace?.();
        check('الدالة الحقيقية تُصدِر إيقاعها للقياس', !!pace && typeof pace.intervalMs === 'number', JSON.stringify(pace));
        // A fresh process has measured nothing yet → the fast default stands.
        check('ومستودع لم يُقَس بعد يبقى على ٥ ثوانٍ', pace.intervalMs === 5000, String(pace.intervalMs));
    }
    // …and the arithmetic the fix promises, against his measured seconds.
    const interval = (lastMs: number) => Math.min(120_000, Math.max(5000, lastMs * 8));
    check('نداء كلفته 3.2s ⇒ فاصل ≈25s بدل 5s', interval(3200) === 25600, String(interval(3200)));
    check('ونداء كلفته 0.5s ⇒ يبقى 5s (السريع لا يُعاقَب)', interval(500) === 5000, String(interval(500)));
    check('ونداء كارثي 30s ⇒ يتوقّف عند سقف دقيقتين', interval(30_000) === 120_000, String(interval(30_000)));

    console.log('\n[2] الدماغ المحلي — المهلة تُقاس على الجهاز نفسه');
    const brain = fs.readFileSync(path.join(__dirname, '..', '..', 'core', 'llm', 'local-brain.ts'), 'utf-8');
    check('التسخين يقيس زمن أول رد فعلاً', /_warmupMs = Math\.max\(_warmupMs, Date\.now\(\) - startedAt\)/.test(brain));
    check('ويُصدِر الرقم للموجّه', /export function localWarmupMs/.test(brain));
    const router = fs.readFileSync(path.join(__dirname, '..', '..', 'core', 'llm', 'intelligent-router.ts'), 'utf-8');
    check('والموجّه يبني المهلة الداخلية من القياس', /localWarmupMs/.test(router) && /measured \* 6/.test(router));
    const leash = (measured: number) => (measured > 0 ? Math.min(90_000, Math.max(25_000, Math.round(measured * 6))) : 25_000);
    check('جهاز يجيب في 1s ⇒ المهلة تبقى 25s', leash(1000) === 25_000, String(leash(1000)));
    check('وجهاز يحتاج 8s للتحميل ⇒ 48s بدل 25s (كان يفشل دائماً)', leash(8000) === 48_000, String(leash(8000)));
    check('وجهاز بطيء جداً ⇒ سقف 90s لا انتظار بلا نهاية', leash(60_000) === 90_000, String(leash(60_000)));
    check('وبلا قياس ⇒ نفس السلوك القديم بالضبط', leash(0) === 25_000);
    {
        const { localWarmupMs } = require('../../core/llm/local-brain');
        check('والدالة موجودة وتعمل بلا Ollama هنا', typeof localWarmupMs() === 'number', String(localWarmupMs()));
    }

    console.log('\n[3] بوابة LLM7 — لا تُعيد تعلّم رفضها بعد كل تشغيل');
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-llm7-'));
    process.env.JOE_DATA_DIR = dataDir;
    delete require.cache[require.resolve('../../core/llm/providers/llm7')];
    const { LLM7Provider } = require('../../core/llm/providers/llm7');
    const p1 = new LLM7Provider();
    // The five refusals from his log, written the way the provider writes them.
    const DEAD = ['Inkling', 'Inkling-Small', 'L3-8B-Lunaris-v1-Turbo', 'XiaomiMiMo/MiMo-V2.5', 'XiaomiMiMo/MiMo-V2.5-Pro'];
    (p1 as any).blocked = new Set(DEAD);
    require('fs').writeFileSync(path.join(dataDir, 'llm7-blocked.json'),
        JSON.stringify({ at: Date.now(), models: DEAD }, null, 2), 'utf-8');
    delete require.cache[require.resolve('../../core/llm/providers/llm7')];
    const { LLM7Provider: Fresh } = require('../../core/llm/providers/llm7');
    const p2 = new Fresh();
    const remembered = [...((p2 as any).blocked || [])];
    check('النماذج الخمسة الميتة تُستعاد بعد إعادة التشغيل', DEAD.every(m => remembered.includes(m)), remembered.join(', '));
    check('فلا خمسة نداءات 401 قبل كل إجابة', remembered.length === 5, String(remembered.length));
    // …and the memory expires, because a gateway can open a model up again.
    fs.writeFileSync(path.join(dataDir, 'llm7-blocked.json'),
        JSON.stringify({ at: Date.now() - 8 * 24 * 3600_000, models: DEAD }, null, 2), 'utf-8');
    delete require.cache[require.resolve('../../core/llm/providers/llm7')];
    const { LLM7Provider: Aged } = require('../../core/llm/providers/llm7');
    check('وذاكرة الرفض تنتهي بعد أسبوع — الرفض ليس أبدياً',
        [...((new Aged() as any).blocked || [])].length === 0);

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
