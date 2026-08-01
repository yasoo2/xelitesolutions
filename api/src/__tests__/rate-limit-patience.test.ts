/**
 * A 429 is a timer, not an outage — and a dead brain must never invent commands.
 *
 * Two behaviors are pinned here, both born from real failures on the user's
 * machine (rate-limited Groq as the only live provider, Ollama not running):
 *
 * 1. RATE-LIMIT PATIENCE — when every provider fails but at least one failure
 *    was a rate limit, the router waits (bounded) for the earliest cooldown to
 *    expire and retries the mesh once, instead of aborting a half-finished
 *    build over a 60-second speed bump. The decision lives in a pure function,
 *    rateLimitPatienceMs, so it is tested as arithmetic, not with sleeps.
 *
 * 2. NO EMERGENCY FABRICATION — the router used to answer total provider
 *    failure on tool-choice prompts by KEYWORD-MATCHING the prompt and
 *    inventing a tool call ("افتح" → browser_run, "اكتب" → write_file,
 *    labeled "Emergency offline routing"). That is a fake brain: it once
 *    opened a browser on the user's machine with no model behind the wheel.
 *    The only honest answer with no provider is the provider-failure notice,
 *    for every kind of caller.
 */
import * as fs from 'fs';
import * as path from 'path';
import { rateLimitPatienceMs, RATE_LIMIT_RE } from '../core/llm/intelligent-router';

const routerSource = fs.readFileSync(
    path.join(__dirname, '..', 'core', 'llm', 'intelligent-router.ts'),
    'utf-8'
);

describe('rate-limit patience (pure decision function)', () => {
    const now = 1_000_000;

    it('does not wait when nothing was rate-limited — real outages are not timers', () => {
        expect(rateLimitPatienceMs(false, [now + 30_000], now, 75_000)).toBeNull();
    });

    it('waits until just past the earliest cooldown expiry', () => {
        const wait = rateLimitPatienceMs(true, [now + 30_000, now + 55_000], now, 75_000);
        expect(wait).not.toBeNull();
        expect(wait!).toBeGreaterThanOrEqual(30_000);
        expect(wait!).toBeLessThanOrEqual(33_000); // 30s remaining + small margin
    });

    it('refuses to stall longer than the cap — a 10-minute limit is an outage in practice', () => {
        expect(rateLimitPatienceMs(true, [now + 600_000], now, 75_000)).toBeNull();
    });

    it('expired cooldowns are ignored; with none in the future it still waits a short flat interval', () => {
        const wait = rateLimitPatienceMs(true, [now - 5_000], now, 75_000);
        expect(wait).not.toBeNull();
        expect(wait!).toBeGreaterThanOrEqual(2_000);
        expect(wait!).toBeLessThanOrEqual(25_000);
    });

    it('a cap of zero disables patience entirely', () => {
        expect(rateLimitPatienceMs(true, [now + 10_000], now, 0)).toBeNull();
    });

    it('never returns a wait so short it retries into the same closed window', () => {
        const wait = rateLimitPatienceMs(true, [now + 100], now, 75_000);
        expect(wait!).toBeGreaterThanOrEqual(2_000);
    });
});

describe('rate-limit recognition', () => {
    it.each([
        'Request failed with status 429',
        'rate limit exceeded, retry after 20s',
        'Rate-limited by upstream',
        'Too Many Requests',
    ])('recognizes: %s', (msg) => {
        expect(RATE_LIMIT_RE.test(msg)).toBe(true);
    });

    it.each([
        'ECONNREFUSED 127.0.0.1:11434',
        'TIMEOUT',
        'HTTP 500 internal server error',
        'model not found',
    ])('does not mistake an outage for a rate limit: %s', (msg) => {
        expect(RATE_LIMIT_RE.test(msg)).toBe(false);
    });
});

describe('no emergency fabrication when every provider is down', () => {
    it('the "Emergency offline routing" keyword-to-tool-call generator is gone', () => {
        expect(routerSource).not.toContain('Emergency offline routing');
    });

    it('the router no longer fabricates browser_run / write_file calls from prompt keywords', () => {
        // The old block JSON.stringify'd invented tool calls right inside the
        // final failure path. No tool name may be conjured there anymore.
        const failurePath = routerSource.slice(routerSource.indexOf('CRITICAL: All LLM providers failed'));
        expect(failurePath).not.toMatch(/JSON\.stringify\(\{\s*tool:/);
    });

    it('the mesh retries at most once — patience is bounded, not a loop', () => {
        expect(routerSource).toMatch(/meshAttempt < 2/);
    });

    it('the wait is surfaced to the user via onProgress, not silent', () => {
        const patienceBlock = routerSource.slice(routerSource.indexOf('Rate-limited, not dead'));
        expect(patienceBlock.slice(0, 600)).toContain('onProgress?.(');
    });
});
