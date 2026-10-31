import { RequestResourceManager } from '../core/resources/RequestResourceManager';

// Exercise the real OCR admission/race boundary with an inert shared worker.
// No WASM, language assets, model, filesystem writes, or worker termination.
jest.mock('fs', () => ({ __esModule: true, default: {
    statSync: () => ({ isFile: () => true, size: 123 }),
} }));
let mockFree = 4 * 1024 ** 3;
const mockManager = new RequestResourceManager({ sampleMemory: () => ({ freeBytes: mockFree }) });
jest.mock('../core/resources/RequestResourceManager', () => {
    const actual = jest.requireActual('../core/resources/RequestResourceManager');
    return { ...actual, get requestResourceManager() { return mockManager; } };
});
const priorState = (globalThis as any).__joeOcrSharedState;
const recognize = jest.fn();
const terminate = jest.fn();
const fakeWorker = { recognize, terminate };
(globalThis as any).__joeOcrSharedState = { workerPromise: Promise.resolve(fakeWorker), disabledReason: '' };
const { extractImageText } = require('../shared/ocr');
function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
const result = { data: { text: 'Observed screenshot words', confidence: 90 } };
async function flush() { for (let i = 0; i < 20; i++) await Promise.resolve(); }
beforeEach(() => { mockFree = 4 * 1024 ** 3; recognize.mockReset(); terminate.mockClear(); });
afterEach(() => { jest.useRealTimers(); expect(terminate).not.toHaveBeenCalled(); });
afterAll(() => { (globalThis as any).__joeOcrSharedState = priorState; });

test('two real OCR calls serialize recognition and release their own leases', async () => {
    const firstWork = deferred<typeof result>();
    recognize.mockReturnValueOnce(firstWork.promise).mockResolvedValueOnce(result);
    const first = extractImageText('first.png');
    const second = extractImageText('second.png');
    await flush();
    expect(recognize).toHaveBeenCalledTimes(1);
    expect(mockManager.status().heavy).toEqual({ active: 1, queued: 1 });
    firstWork.resolve(result);
    await expect(first).resolves.toBe(result.data.text);
    await expect(second).resolves.toBe(result.data.text);
    expect(recognize.mock.calls.map(call => call[0])).toEqual(['first.png', 'second.png']);
    expect(mockManager.status().heavy).toEqual({ active: 0, queued: 0 });
    expect(mockManager.status().activeRequests).toBe(0);
});

test('an optional OCR timeout retains admission until actual recognition settles', async () => {
    jest.useFakeTimers();
    const firstWork = deferred<typeof result>();
    recognize.mockReturnValueOnce(firstWork.promise).mockResolvedValueOnce(result);
    const first = extractImageText('slow.png');
    await flush();
    const observed = first.then((value: string) => value);
    await jest.advanceTimersByTimeAsync(90_000);
    await expect(observed).resolves.toBe('');
    expect(mockManager.status().heavy).toEqual({ active: 1, queued: 0 });
    const next = extractImageText('next.png');
    await flush();
    expect(recognize).toHaveBeenCalledTimes(1);
    expect(mockManager.status().heavy).toEqual({ active: 1, queued: 1 });
    firstWork.resolve(result);
    await expect(next).resolves.toBe(result.data.text);
    expect(mockManager.status().heavy).toEqual({ active: 0, queued: 0 });
    expect(mockManager.status().activeRequests).toBe(0);
});

test('low physical RAM stops before invoking the existing shared worker', async () => {
    mockFree = 128 * 1024 ** 2;
    await expect(extractImageText('low-memory.png')).rejects.toMatchObject({ code: 'RESOURCE_LOW_MEMORY' });
    expect(recognize).not.toHaveBeenCalled();
    expect(mockManager.status().heavy).toEqual({ active: 0, queued: 0 });
});

test('recognition rejection preserves optional OCR behavior and releases admission', async () => {
    recognize.mockRejectedValueOnce(new Error('inert recognition failed'));
    await expect(extractImageText('failed.png')).resolves.toBe('');
    expect(mockManager.status().heavy).toEqual({ active: 0, queued: 0 });
    expect(mockManager.status().activeRequests).toBe(0);
});
