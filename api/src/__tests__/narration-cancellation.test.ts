import { narrate } from '../core/agents/narrator';

const context = { goal: 'Explain a concept', next: { task: 'Answer', tool: 'central_answer' }, index: 1, total: 1, isArabic: false };

describe('narration request lifetime', () => {
    it('cancels a slow provider with the timeout reason and returns silence', async () => {
        let observed: AbortSignal | undefined;
        let cancelled = false;
        const result = await narrate(context, (_prompt, signal) => {
            observed = signal;
            return new Promise((_resolve, reject) => signal?.addEventListener('abort', () => {
                cancelled = true;
                reject(signal.reason);
            }, { once: true }));
        }, { timeoutMs: 20 });
        expect(result).toEqual({ text: '', reject: 'timeout' });
        expect(observed?.aborted).toBe(true);
        expect(observed?.reason.message).toBe('narration_timeout');
        expect(cancelled).toBe(true);
    });

    it('preserves a fast answer and leaves its signal un-aborted', async () => {
        let observed: AbortSignal | undefined;
        const result = await narrate(context, async (_prompt, signal) => {
            observed = signal;
            return 'I explain the concept before proceeding.';
        }, { timeoutMs: 20 });
        await new Promise(resolve => setTimeout(resolve, 30));
        expect(result.text).toBe('I explain the concept before proceeding.');
        expect(observed?.aborted).toBe(false);
    });

    it('observes a late provider rejection after a timeout', async () => {
        const unhandled = jest.fn();
        process.on('unhandledRejection', unhandled);
        try {
            let rejectLate!: (reason: Error) => void;
            const result = await narrate(context, () => new Promise((_resolve, reject) => { rejectLate = reject; }), { timeoutMs: 20 });
            rejectLate(new Error('late transport failure'));
            await new Promise(resolve => setImmediate(resolve));
            expect(result).toEqual({ text: '', reject: 'timeout' });
            expect(unhandled).not.toHaveBeenCalled();
        } finally {
            process.removeListener('unhandledRejection', unhandled);
        }
    });
});
