/**
 * ⛔ ONLY THE PROVIDER'S OWN BAD MINUTES ARE WAITED OUT (loop.ts transientModelFailure, retryAfterMs).
 *
 * The r40 review, 2026-11-15: with no status, any «timeout» or «overloaded» was waited on —
 * «Local inference timeout must be between 1 ms and …» (a setting) and «Ollama: model
 * overloaded, out of memory» (a local model that does not fit) got 30 s + 2 min + 5 min and a
 * fourth call; 501 and 505 counted as passing trouble; and a plain-object «Retry-After» was
 * not read. Pinned both ways: the provider's and the network's transient shapes are still
 * waited out (a-providers-bad-minutes-are-waited-out.test.ts keeps the run-level behaviour).
 */
import { retryAfterMs, transientModelFailure } from '../core/engine/loop';

const failure = (text: string, extra: Record<string, unknown> = {}) => Object.assign(new Error(text), extra);

describe('what is not waited on', () => {
    it('a setting, a local model out of memory, or a code of Joe\'s own', () => {
        expect(transientModelFailure(new Error('Local inference timeout must be between 1 ms and the local inference hard maximum.'))).toBe(false);
        expect(transientModelFailure(failure('Local inference timeout must be between 1 ms and the local inference hard maximum.', { code: 'OLLAMA_TIMEOUT_INPUT' }))).toBe(false);
        expect(transientModelFailure(new Error('Ollama: model overloaded, out of memory'))).toBe(false);
        expect(transientModelFailure(failure('Ollama: model overloaded, out of memory', { code: 'PROVIDER_FAILURE' }))).toBe(false);
        expect(transientModelFailure(failure('CUDA error: out of memory', { code: 'PROVIDER_FAILURE' }))).toBe(false);
        expect(transientModelFailure(failure('the request timed out', { code: 'OLLAMA_TIMEOUT' }))).toBe(false);
        expect(transientModelFailure(failure('Connection error.', { code: 'MODEL_AUTH' }))).toBe(false);
        expect(transientModelFailure(new Error('max_tokens must be at most 500'))).toBe(false);
        expect(transientModelFailure(new Error('the call ran for 500 ms then stopped'))).toBe(false);
    });

    it('501 and 505 are not trouble that passes', () => {
        expect(transientModelFailure({ status: 501, message: 'x' })).toBe(false);
        expect(transientModelFailure({ status: 505, message: 'x' })).toBe(false);
        expect(transientModelFailure(failure('The Claude API call failed: 501 Not Implemented', { code: 'PROVIDER_FAILURE' }))).toBe(false);
    });
});

describe('the must-not twin: the provider\'s and the network\'s bad minutes are still waited out', () => {
    it('by status, by network code, and by the provider\'s own words with no status', () => {
        for (const status of [408, 429, 500, 502, 503, 504, 529]) expect(transientModelFailure({ status, message: 'x' })).toBe(true);
        expect(transientModelFailure(failure('The Claude API call failed: Connection error.', { code: 'PROVIDER_FAILURE', status: NaN }))).toBe(true);
        expect(transientModelFailure(new Error('Request timed out.'))).toBe(true);
        expect(transientModelFailure(failure('socket hang up', { code: 'ECONNRESET' }))).toBe(true);
        expect(transientModelFailure(failure('connect ETIMEDOUT 1.2.3.4:443', { code: 'ETIMEDOUT' }))).toBe(true);
        expect(transientModelFailure(new TypeError('fetch failed'))).toBe(true);
        expect(transientModelFailure(failure('503 credential validation failed', { code: 'PROVIDER_FAILURE' }))).toBe(true);
        expect(transientModelFailure(failure('Provider error (429): Rate limit reached for requests', { code: 'PROVIDER_FAILURE' }))).toBe(true);
        expect(transientModelFailure(failure('{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}', { code: 'PROVIDER_FAILURE' }))).toBe(true);
        expect(transientModelFailure(failure('The model is currently overloaded. Please try again later.', { code: 'PROVIDER_FAILURE' }))).toBe(true);
        expect(transientModelFailure(failure('HTTP 502 Bad Gateway', { code: 'PROVIDER_FAILURE' }))).toBe(true);
        expect(transientModelFailure(new Error('direct_provider_check_failed: connect ECONNREFUSED 127.0.0.1:11434'))).toBe(false);
    });
});

describe('Retry-After', () => {
    it('is read from a plain object whatever the case of its name', () => {
        expect(retryAfterMs({ headers: { 'Retry-After': '120' } }, 0)).toBe(120_000);
        expect(retryAfterMs({ headers: { 'RETRY-AFTER-MS': '1500' } }, 0)).toBe(1_500);
        expect(retryAfterMs({ response: { headers: { 'Retry-After': '7' } } }, 0)).toBe(7_000);
        //  Still: lower case, a Headers-like object, nothing.
        expect(retryAfterMs({ headers: { 'retry-after': '12' } }, 0)).toBe(12_000);
        expect(retryAfterMs({ headers: new Map([['retry-after', '3']]) }, 0)).toBe(3_000);
        expect(retryAfterMs({ headers: { 'X-Other': '9' } }, 0)).toBe(0);
    });
});
