/**
 *  A DEFAULT IS NOT A MEASUREMENT.
 *
 *  Measured live, reading his own screen every four seconds through a whole
 *  clinic build:
 *
 *      phase="Joe is thinking"   ×14 ticks
 *      phase="Joe is executing"  ×8 ticks
 *      FRAMES [… ["thinking_phase", 2] …]
 *
 *  Two phase frames in the entire run, and «Joe is planning» never once —
 *  while the card had said «Joe is thinking» from its first second, because
 *  `useState('analyzing')` is what the component starts as. It was reporting a
 *  state nobody had sent it.
 *
 *  He asked for the opposite, in his own words: «وقت التفكير يكون جو يفكر وقت
 *  التخطيط جو يخطط». Three phases that are true, not one that is assumed.
 *
 *  These cases judge `phaseAnnounce`, which is now the only place that answers
 *  «which phase, and what do we call it» — every case runs the real function
 *  and reads what came back.
 */

import { phaseDetail, announcePhase } from '../core/orchestrator/phaseAnnounce';

const ARABIC = /[؀-ۿ]/;
const LATIN = /[A-Za-z]/;

describe('every phase has something to say, in the reader\'s language', () => {
    //  POSITIVE — the three phases a run actually passes through.
    it.each(['analyzing', 'synthesizing', 'executing'])('%s speaks Arabic to an Arabic reader', (phase) => {
        const said = phaseDetail(phase, 'ar');
        expect(said.length).toBeGreaterThan(0);
        expect(ARABIC.test(said)).toBe(true);
    });

    it.each(['analyzing', 'synthesizing', 'executing'])('%s speaks English to an English reader', (phase) => {
        const said = phaseDetail(phase, 'en');
        expect(said.length).toBeGreaterThan(0);
        expect(ARABIC.test(said)).toBe(false);
        expect(LATIN.test(said)).toBe(true);
    });

    //  POSITIVE — and the four other languages the rest of Joe already speaks
    //  are not an afterthought here either.
    it.each(['fr', 'de', 'ru', 'es'])('planning is written in %s too', (lang) => {
        const said = phaseDetail('synthesizing', lang);
        expect(said.length).toBeGreaterThan(0);
        expect(said).not.toBe(phaseDetail('synthesizing', 'en'));
        expect(ARABIC.test(said)).toBe(false);
    });

    //  POSITIVE — the three sentences are three different sentences. A single
    //  string shown under all three phases would pass every test above and
    //  tell him nothing.
    it('says a different thing for each phase', () => {
        const said = ['analyzing', 'synthesizing', 'executing'].map(p => phaseDetail(p, 'ar'));
        expect(new Set(said).size).toBe(3);
    });

    //  NEGATIVE — a phase with nothing to report says NOTHING. Inventing a
    //  sentence for `idle` is exactly the defect this file is named after.
    it.each(['idle', 'sleeping', '', 'ANALYZING', undefined as any])('%s is given no words to put in his mouth', (phase) => {
        expect(phaseDetail(phase, 'ar')).toBe('');
    });

    //  NEGATIVE — an unknown language falls back to Arabic rather than to an
    //  empty line. A missing translation must degrade, never disappear.
    it('an unknown language still gets a sentence', () => {
        expect(phaseDetail('synthesizing', 'sv').length).toBeGreaterThan(0);
        expect(phaseDetail('synthesizing', undefined).length).toBeGreaterThan(0);
    });
});

describe('announcing a phase', () => {
    //  NEGATIVE — a broadcast addressed to nobody must not happen and must not
    //  throw. A run that dies because no chat was attached is worse than a run
    //  that says nothing.
    it.each([undefined, '', '   '])('says nothing when there is no session (%s)', (sid) => {
        expect(() => announcePhase(sid as any, 'synthesizing', 'ar')).not.toThrow();
        expect(announcePhase(sid as any, 'synthesizing', 'ar')).toBe(false);
    });

    //  POSITIVE — with a session, it reaches the socket layer and reports that
    //  it did. The layer itself is mocked, because what is under test is the
    //  decision to announce and the words chosen — not the transport.
    it('hands the socket layer the phase and the sentence', () => {
        const sent: any[] = [];
        jest.resetModules();
        //  ⛔ `{ virtual: true }` TOLD JEST A REAL MODULE DOES NOT EXIST.
        //
        //  `src/api/ws.ts` is 29394 bytes on disk. `virtual` is for modules
        //  that are NOT there, and using it on one that is registers the mock
        //  under the literal specifier instead of the resolved path. Alone in
        //  its file that happened to work; in the full suite the real module
        //  was already resolved in the worker, `require('../../api/ws')` from
        //  inside `phaseAnnounce` reached the real one, and the assertion read:
        //
        //      Expected length: 1
        //      Received length: 0
        //
        //  — while `announcePhase` returned `true`, because it HAD reached a
        //  socket layer. Just not this one.
        //
        //  ⛔ AND IT FAILED ONLY IN THE FULL RUN, WHICH IS THE WORST SHAPE OF
        //  ALL: green in isolation, red in the gate, and every instinct says
        //  «flaky» rather than «wrong». It reproduced twice, and pairing it
        //  with all three other suites that mock this module did not — so the
        //  cause was never the neighbour, it was this argument.
        jest.doMock('../api/ws', () => ({ broadcastThinkingPhase: (...a: any[]) => sent.push(a) }));
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const fresh = require('../core/orchestrator/phaseAnnounce');

        expect(fresh.announcePhase('sid-1', 'synthesizing', 'ar')).toBe(true);
        expect(sent).toHaveLength(1);
        expect(sent[0][0]).toBe('sid-1');
        expect(sent[0][1]).toBe('synthesizing');
        expect(ARABIC.test(String(sent[0][2]))).toBe(true);

        jest.dontMock('../api/ws');
        jest.resetModules();
    });
});
