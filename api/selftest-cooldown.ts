/* selftest-cooldown.ts — proves the FREE-mesh provider cooldown (Wave 5): a provider
   that just failed is DEFERRED to the end of the try-order for a short TTL (so we don't
   pay a full dead-gateway round-trip on every request), a provider that succeeds has its
   cooldown cleared, the local brain is NEVER deferred, and the cooldown expires so a
   recovered provider is retried. Pure/deterministic — no network involved. */
// NOTE: run with PROVIDER_FAIL_COOLDOWN_MS=1000 on the command line — the module reads
// it at load time and ESM hoists this import above any in-file env assignment.
import {
    isProviderCoolingDown,
    markProviderFailed,
    markProviderOk,
    orderByCooldown,
} from './src/core/llm/intelligent-router';

async function main() {
    let failures = 0;
    const check = (n: string, c: boolean, x = '') => {
        console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${x ? '  -> ' + x : ''}`);
        if (!c) failures++;
    };

    const mesh = [
        { name: 'Local (Auto)' },
        { name: 'LLM7 (Keyless)' },
        { name: 'DuckAI (Keyless)' },
        { name: 'Pollinations (Backup)' },
    ];

    // Baseline: nothing cooling down -> order unchanged.
    check('fresh order preserved', orderByCooldown(mesh).map(p => p.name).join(',') ===
        'Local (Auto),LLM7 (Keyless),DuckAI (Keyless),Pollinations (Backup)');

    // Mark two providers failed -> they move to the END, working ones stay first.
    markProviderFailed('DuckAI (Keyless)');
    markProviderFailed('Pollinations (Backup)');
    check('DuckAI is cooling down', isProviderCoolingDown('DuckAI (Keyless)') === true);
    check('Pollinations is cooling down', isProviderCoolingDown('Pollinations (Backup)') === true);
    check('LLM7 is NOT cooling down', isProviderCoolingDown('LLM7 (Keyless)') === false);

    const ordered = orderByCooldown(mesh).map(p => p.name);
    check('failed providers deferred to the end', ordered.join(',') ===
        'Local (Auto),LLM7 (Keyless),DuckAI (Keyless),Pollinations (Backup)',
        ordered.join(','));
    // Concretely: neither failed provider appears before a fresh one.
    const idxLLM7 = ordered.indexOf('LLM7 (Keyless)');
    const idxDuck = ordered.indexOf('DuckAI (Keyless)');
    check('fresh LLM7 tried before failed DuckAI', idxLLM7 < idxDuck, `LLM7@${idxLLM7} DuckAI@${idxDuck}`);

    // Local brain must NEVER be deferred, even if marked failed.
    markProviderFailed('Local (Auto)');
    check('Local (Auto) never cools down', isProviderCoolingDown('Local (Auto)') === false);
    check('Local (Auto) stays first', orderByCooldown(mesh)[0].name === 'Local (Auto)');

    // Success clears the cooldown -> provider returns to normal order.
    markProviderOk('DuckAI (Keyless)');
    check('success clears DuckAI cooldown', isProviderCoolingDown('DuckAI (Keyless)') === false);

    // Cooldown expires on its own after the TTL (1000ms via env above) — a recovered
    // provider is retried, not blocked forever.
    markProviderFailed('LLM7 (Keyless)');
    check('LLM7 cooling down right after fail', isProviderCoolingDown('LLM7 (Keyless)') === true);
    await new Promise(r => setTimeout(r, 1200));
    check('LLM7 cooldown expired after TTL', isProviderCoolingDown('LLM7 (Keyless)') === false);
    check('expired provider back in normal order', orderByCooldown(mesh)[1].name === 'LLM7 (Keyless)');

    console.log(`\n${failures === 0 ? 'ALL GREEN' : failures + ' FAILURE(S)'}`);
    process.exit(failures === 0 ? 0 : 1);
}
main().catch(e => { console.error('crashed:', e); process.exit(2); });
