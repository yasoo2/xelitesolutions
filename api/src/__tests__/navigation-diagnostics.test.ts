import { readDocumentState } from '../modules/browser/navigation-diagnostics';

describe('bounded document-state diagnostics', () => {
    test.each(['loading', 'interactive', 'complete'])('retains only state %s', async state => {
        expect(await readDocumentState(async () => state)).toBe(state);
    });
    test('discards arbitrary content and handles a closed page', async () => {
        expect(await readDocumentState(async () => 'private document text')).toBe('unavailable');
        expect(await readDocumentState(async () => { throw new Error('closed'); })).toBe('unavailable');
    });
    test('a stalled renderer cannot hold the error response open', async () => {
        jest.useFakeTimers();
        try {
            const read = jest.fn(() => new Promise<unknown>(() => {}));
            const result = readDocumentState(read);
            await jest.advanceTimersByTimeAsync(300);
            expect(await result).toBe('unavailable');
            expect(read).toHaveBeenCalledTimes(1);
            expect(jest.getTimerCount()).toBe(0);
        } finally { jest.useRealTimers(); }
    });
});
