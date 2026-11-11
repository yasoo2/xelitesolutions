/**
 * ⛔ LIVE PREVIEWS ARE BOUNDED BY THE MACHINE, NOT BY HOW MANY SESSIONS EVER RAN.
 *
 * The 500-prompt exam, 2026-11-03: after forty prompts, twenty-odd preview
 * servers of finished sessions were still serving on 4301, 4302, 4306 … — one
 * per session, kept on purpose because the delivery hands him its live
 * address. Nothing stopped the sessions from adding up; on a server with
 * thousands of users they grow until memory or ports run out.
 *
 * The bound scales with the machine (one preview per 512 MiB, at least eight),
 * the oldest previews of sessions not running now are the ones stopped, and a
 * running session's server is never taken from under it.
 */
import { livePreviewCap, previewsToRetire } from '../modules/tools/definitions/ProjectRunTool';

const GiB = 1024 * 1024 * 1024;

describe('how many previews a machine keeps', () => {
    it('scales with memory: a 16 GiB laptop keeps 32, a 512 GiB server keeps 1024', () => {
        expect(livePreviewCap(16 * GiB, {})).toBe(32);
        expect(livePreviewCap(512 * GiB, {})).toBe(1024);
    });

    it('never fewer than eight, and the operator can set it', () => {
        expect(livePreviewCap(2 * GiB, {})).toBe(8);
        expect(livePreviewCap(16 * GiB, { JOE_MAX_LIVE_PREVIEWS: '3' })).toBe(3);
        //  A value that is not a count is not an instruction.
        expect(livePreviewCap(16 * GiB, { JOE_MAX_LIVE_PREVIEWS: 'many' })).toBe(32);
        expect(livePreviewCap(16 * GiB, { JOE_MAX_LIVE_PREVIEWS: '0' })).toBe(32);
    });
});

describe('which previews are stopped past the bound', () => {
    const server = (startedAt: number, sessionId?: string) => ({ startedAt, ...(sessionId ? { sessionId } : {}) });
    const idle = () => false;

    it('the oldest, until the bound holds', () => {
        const servers: Array<[string, any]> = [['e', server(5, 's5')], ['a', server(1, 's1')], ['c', server(3, 's3')], ['b', server(2, 's2')], ['d', server(4, 's4')]];
        expect(previewsToRetire(servers, 'e', 3, idle)).toEqual(['a', 'b']);
    });

    it('within the bound nothing is stopped', () => {
        expect(previewsToRetire([['a', server(1, 's1')], ['b', server(2, 's2')]], 'b', 3, idle)).toEqual([]);
    });

    it('a running session keeps its server, and the next oldest goes instead', () => {
        const servers: Array<[string, any]> = [['a', server(1, 'busy')], ['b', server(2, 's2')], ['c', server(3, 's3')], ['d', server(4, 's4')]];
        expect(previewsToRetire(servers, 'd', 2, id => id === 'busy')).toEqual(['b', 'c']);
    });

    it('the preview just started is never the one stopped, even when it is the oldest record', () => {
        const servers: Array<[string, any]> = [['new', server(0, 's0')], ['b', server(2, 's2')], ['c', server(3, 's3')]];
        expect(previewsToRetire(servers, 'new', 2, idle)).toEqual(['b']);
    });

    it('when every other preview belongs to a running session, the bound waits — no running server is killed', () => {
        const servers: Array<[string, any]> = [['a', server(1, 'x')], ['b', server(2, 'y')], ['c', server(3, 's3')]];
        expect(previewsToRetire(servers, 'c', 1, () => true)).toEqual([]);
    });
});
