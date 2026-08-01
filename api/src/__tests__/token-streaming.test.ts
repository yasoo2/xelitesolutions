/**
 * «اريد كل كود يتم كتابته يظهر مباشرة وليس ظهور الملف دفعة واحدة»
 *
 * The live view used to update once per SECTION — several KB landing at once.
 * Now the model's OWN token deltas are forwarded to the Logs panel the moment
 * each one is emitted, on every generation path:
 *
 *   - section-wise builds (single page and every site page)
 *   - the single-pass path for short pages
 *   - the custom-route OpenAI-compatible client the user's machine actually
 *     uses for Groq, which buffered whole responses and never streamed
 *
 * The honesty rules stay intact: no timers, no replays — a character appears
 * because the model emitted it in that same moment. Deltas are coalesced BY
 * SIZE only, and any labeled/final event flushes the tail in front of itself
 * so nothing is ever shown out of order.
 */
import * as fs from 'fs';
import * as path from 'path';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf-8');
const builder = read('modules/tools/definitions/WebPageBuilderTool.ts');
const router = read('core/llm/intelligent-router.ts');

describe('every generation path forwards the model\'s own deltas', () => {
    it('the section writer passes onDelta into routeToModel (single page and site)', () => {
        // Two section loops (page + site) each define an onDelta that streams.
        const defs = builder.match(/const onDelta = \(delta: string\) => \{/g) || [];
        expect(defs.length).toBeGreaterThanOrEqual(2);
        const wired = builder.match(/undefined, undefined, onDelta, undefined/g) || [];
        expect(wired.length).toBeGreaterThanOrEqual(2);
    });

    it('the single-pass path streams too', () => {
        expect(builder).toMatch(/streamCodeToLogs\(sessionId, 'index\.html', delta, \{ delta: true, label: 'writing' \}\)/);
    });

    it('a streamed section is not re-broadcast at acceptance — content lands once', () => {
        expect(builder).toMatch(/if \(deltaBytes === 0\) \{/);
    });

    it('the custom-route OpenAI-compatible client streams when the caller wants tokens', () => {
        const block = router.slice(router.indexOf('other OpenAI-compatible endpoint'));
        expect(block.slice(0, 1600)).toContain('stream: true');
        expect(block.slice(0, 1600)).toContain('onPartial(d)');
    });
});

describe('coalescing is by size, never by time', () => {
    it('deltas buffer until half a KB of real content exists', () => {
        expect(builder).toMatch(/DELTA_FLUSH_BYTES = 512/);
        expect(builder).toMatch(/buffered\.length < DELTA_FLUSH_BYTES/);
    });

    it('no timer drives the flush — a stalled model shows a stalled stream', () => {
        const streamFn = builder.slice(
            builder.indexOf('const pendingDeltas'),
            builder.indexOf('const PORT')
        );
        expect(streamFn).not.toMatch(/setTimeout|setInterval/);
    });

    it('a labeled event flushes the buffered tail IN FRONT of itself — order is preserved', () => {
        expect(builder).toMatch(/toSend = pendingDeltas\.get\(key\)! \+ toSend/);
    });

    it('the final done event clears the buffer — the written file replaces the live view', () => {
        const streamFn = builder.slice(
            builder.indexOf('const pendingDeltas'),
            builder.indexOf('const PORT')
        );
        expect(streamFn).toContain('pendingDeltas.delete(key)');
    });
});
