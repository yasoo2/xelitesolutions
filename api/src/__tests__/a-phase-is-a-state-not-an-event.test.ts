/**
 *  A PHASE IS A STATE, NOT AN EVENT.
 *
 *  Live round, his screen, one request — «بدي جدول للموظفين فيه الاسم
 *  والراتب، وصفحة ثانية تعرض مجموع الرواتب» — and the same sentence four
 *  times:
 *
 *      Reading your request and working out exactly what you want
 *      Reading your request and working out exactly what you want
 *      Reading your request and working out exactly what you want
 *      Reading your request and working out exactly what you want
 *
 *  Two callers announce that moment and each is right to: the loop service
 *  before it hands over, the orchestrator as it begins. What is wrong is
 *  treating «I am analyzing» as news. Announcing a state you are already in
 *  says nothing and costs a line on his screen.
 */
const sent: Array<{ to: string; phase: string }> = [];

jest.mock('../api/ws', () => ({
    broadcastThinkingPhase: (to: string, phase: string) => { sent.push({ to, phase }); },
}));

import { announcePhase, forgetPhase } from '../core/orchestrator/phaseAnnounce';

beforeEach(() => { sent.length = 0; forgetPhase('s1'); forgetPhase('s2'); });

describe('the same moment is announced once', () => {
    it('the first announcement speaks', () => {
        expect(announcePhase('s1', 'analyzing', 'ar')).toBe(true);
        expect(sent).toHaveLength(1);
    });

    it('…and a second caller saying the same thing is silent', () => {
        announcePhase('s1', 'analyzing', 'ar');
        expect(announcePhase('s1', 'analyzing', 'ar')).toBe(false);
        expect(sent).toHaveLength(1);
    });

    it('…however many callers there are', () => {
        for (let i = 0; i < 6; i += 1) announcePhase('s1', 'analyzing', 'ar');
        expect(sent).toHaveLength(1);
    });
});

describe('…and a real change still speaks', () => {
    it('a different phase is news', () => {
        announcePhase('s1', 'analyzing', 'ar');
        expect(announcePhase('s1', 'synthesizing', 'ar')).toBe(true);
        expect(sent.map(s => s.phase)).toEqual(['analyzing', 'synthesizing']);
    });

    it('…and going back to it later is news again', () => {
        //  The negative that matters: silencing a repeat must not silence a
        //  return. A run that analyses, plans, then analyses again is saying
        //  something true the second time.
        announcePhase('s1', 'analyzing', 'ar');
        announcePhase('s1', 'executing', 'ar');
        expect(announcePhase('s1', 'analyzing', 'ar')).toBe(true);
        expect(sent).toHaveLength(3);
    });

    it('another session is not silenced by the first', () => {
        announcePhase('s1', 'analyzing', 'ar');
        expect(announcePhase('s2', 'analyzing', 'ar')).toBe(true);
        expect(sent.map(s => s.to)).toEqual(['s1', 's2']);
    });

    it('going idle forgets, so the next request can start again', () => {
        announcePhase('s1', 'analyzing', 'ar');
        announcePhase('s1', 'idle', 'ar');
        expect(announcePhase('s1', 'analyzing', 'ar')).toBe(true);
    });

    it('a session with no id is never announced', () => {
        expect(announcePhase('', 'analyzing', 'ar')).toBe(false);
        expect(announcePhase(undefined, 'analyzing', 'ar')).toBe(false);
        expect(sent).toHaveLength(0);
    });
});
