/**
 *  THE RUN IS NOT THE SESSION.
 *
 *  Caught by reading what a new recorder had just written to disk, one live
 *  request, two owners:
 *
 *      proof-1787578607     [16:36:47] أقرأ طلبك وأفهم ما تريد بالضبط
 *      run-1787578607425    [16:36:48] Initializing Autonomous Brain for goal…
 *
 *  The orchestrator's first two broadcasts were addressed to goal.id — the
 *  RUN — while the caller had supplied a session. Twenty lines below, the
 *  same file already writes the rule out: «goal.context?.sessionId ||
 *  goal.id». And a run is not a session anybody has open, so the very first
 *  thing Joe says about a goal went to a listener that does not exist, and
 *  the session-scoped rule that makes such events fail closed dropped it
 *  rather than leak it.
 */
const sent: Array<{ fn: string; to: any }> = [];

jest.mock('../api/ws', () => {
    const actual = jest.requireActual('../api/ws');
    return {
        ...actual,
        broadcastThinkingDetail: (to: any) => { sent.push({ fn: 'thinkingDetail', to }); },
        broadcastThinkingPhase: (to: any) => { sent.push({ fn: 'thinkingPhase', to }); },
        broadcast: () => undefined,
    };
});

import { AgentOrchestrator } from '../orchestration/AgentOrchestrator';

/**
 *  The address is decided on the FIRST line of execute(). Waiting for the
 *  whole run would be waiting for a planner, a provider and a build — none
 *  of which this is about, and none of which belong in a unit test.
 */
async function firstAnnouncement(goal: any): Promise<void> {
    const o = new AgentOrchestrator();
    //  Deliberately not awaited: the run may never finish here.
    void o.execute(goal).catch(() => undefined);
    await new Promise(r => setTimeout(r, 60));
}

const firstAddress = () => (sent.length ? sent[0].to : undefined);

beforeEach(() => { sent.length = 0; });

describe('the first thing Joe says goes to the session that asked', () => {
    it('a goal carrying a session is announced to that session', async () => {
        await firstAnnouncement({
            id: 'run-1787578607425',
            goal: 'بدي جدول للكتب: العنوان والمؤلف والسعر',
            context: { sessionId: 'proof-1787578607', language: 'ar' },
        });
        expect(sent.length).toBeGreaterThan(0);
        expect(firstAddress()).toBe('proof-1787578607');
    });

    it('…and a goal with no session still has an address', async () => {
        //  The negative: the fallback is the whole reason the run id was there
        //  in the first place, and removing it would silence callers that pass
        //  no context at all (the REST /api/agent entry among them).
        await firstAnnouncement({
            id: 'run-alone',
            goal: 'build something',
        });
        expect(sent.length).toBeGreaterThan(0);
        expect(firstAddress()).toBe('run-alone');
    });

    it('…and it is never the run when a session exists', async () => {
        await firstAnnouncement({
            id: 'run-XYZ',
            goal: 'build something',
            context: { sessionId: 'session-ABC' },
        });
        expect(sent.map(s => s.to)).not.toContain('run-XYZ');
    });
});
