/**
 * A CHANGE INSIDE ONE OF THE VERIFICATION'S OWN WINDOWS MAY BE THE CHECKS'; ONE OUTSIDE EVERY WINDOW IS TOLD
 * (design v13.3 §5b step 4). Each window counts until 1 s after its end; a long one (an open SSE stream, a tunnel)
 * only for its first second.
 */
import { createQaWindows, explained, unexplainedFiles, windowSpan, QA_WINDOW_GRACE_MS } from '../core/quality/qa-windows';

describe('the verification\'s windows', () => {
    it('records a window around work, even when the work throws', async () => {
        let t = 1000;
        const w = createQaWindows(() => t);
        const out = await w.around('project_run start', async () => { t = 1800; return 'up'; });
        expect(out).toBe('up');
        await expect(w.around('the project\'s own tests', async () => { t = 9000; throw new Error('red'); })).rejects.toThrow('red');
        expect(w.list()).toEqual([
            { start: 1000, end: 1800, long: false, what: 'project_run start' },
            { start: 1800, end: 9000, long: false, what: 'the project\'s own tests' },
        ]);
    });

    it('takes the fence\'s request windows as they are, long ones included', () => {
        const w = createQaWindows(() => 0);
        w.add({ start: 100, end: 160, long: false, what: 'POST 127.0.0.1:4317/api/customers' });
        w.add({ start: 200, end: 30_000, long: true, what: 'GET 127.0.0.1:4317/events' });
        w.add({ start: 300, end: NaN, long: false, what: 'still open' });
        expect(w.list().map(x => [x.start, x.end, x.long])).toEqual([[100, 160, false], [200, 30_000, true], [300, 300, false]]);
        //  The list is a copy: what a caller does with it never changes the windows.
        w.list()[0].end = 0;
        expect(w.list()[0].end).toBe(160);
    });

    it('explains a change up to 1 s after a window, and a long window only for its first second', () => {
        const windows = [
            { start: 100, end: 160, long: false, what: 'POST /api/customers' },
            { start: 5000, end: 60_000, long: true, what: 'GET /events' },
        ];
        expect(QA_WINDOW_GRACE_MS).toBe(1000);
        expect(windowSpan(windows[0])).toEqual({ from: 100, to: 1160 });
        expect(windowSpan(windows[1])).toEqual({ from: 5000, to: 6000 });
        expect(explained(150, windows)).toBe(true);
        expect(explained(1160, windows)).toBe(true);
        expect(explained(1161, windows)).toBe(false);
        expect(explained(99, windows)).toBe(false);
        expect(explained(5500, windows)).toBe(true);
        //  The owner's write in the middle of an open SSE stream is not hidden by it.
        expect(explained(20_000, windows)).toBe(false);
    });

    it('names each unexplained file once, in the order first seen', () => {
        const windows = [{ start: 0, end: 1000, long: false, what: 'walk' }];
        const changes = [
            { file: 'data/store.json', at: 500 },     // the walk's own write
            { file: 'data/orders.json', at: 4000 },   // nothing of the checks then
            { file: 'data/store.json', at: 9000 },
            { file: 'data/orders.json', at: 9100 },
        ];
        expect(unexplainedFiles(changes, windows)).toEqual(['data/orders.json', 'data/store.json']);
        expect(unexplainedFiles(changes.slice(0, 1), windows)).toEqual([]);
    });
});
