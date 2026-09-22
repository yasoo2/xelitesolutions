import { captureNativeJpeg, withCaptureSession } from '../modules/browser/native-capture';

describe('bounded native frame capture', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());
    const session = () => ({
        send: jest.fn(async () => ({ data: Buffer.from('jpeg').toString('base64') })),
        detach: jest.fn(async () => undefined),
    });

    it('reuses a healthy connection', async () => {
        const cdp = session();
        const attach = jest.fn(async () => cdp);
        const page: any = { context: () => ({ newCDPSession: attach }) };
        expect(await captureNativeJpeg(page, 55, 100)).toEqual(Buffer.from('jpeg'));
        await captureNativeJpeg(page, 55, 100);
        expect(attach).toHaveBeenCalledTimes(1);
        expect(cdp.detach).not.toHaveBeenCalled();
        expect(jest.getTimerCount()).toBe(0);
    });

    it('bounds stalled attachment and discards a connection arriving after timeout', async () => {
        let resolve!: (value: any) => void;
        const cdp = session();
        const attach = jest.fn().mockImplementationOnce(() => new Promise(r => { resolve = r; }))
            .mockResolvedValue(cdp);
        const page: any = { context: () => ({ newCDPSession: attach }) };
        const failed = expect(captureNativeJpeg(page, 55, 100)).rejects.toThrow('browser_capture_timeout');
        await jest.advanceTimersByTimeAsync(100);
        await failed;
        const late = session();
        resolve(late);
        await Promise.resolve();
        expect(late.detach).toHaveBeenCalledTimes(1);
        expect(late.send).not.toHaveBeenCalled();
        await captureNativeJpeg(page, 55, 100);
        expect(attach).toHaveBeenCalledTimes(2);
    });

    it('does not wait for stalled cleanup and permits a fresh connection', async () => {
        const stalled = { send: jest.fn(() => new Promise(() => { })), detach: jest.fn(() => new Promise(() => { })) };
        const fresh = session();
        const attach = jest.fn().mockResolvedValueOnce(stalled).mockResolvedValue(fresh);
        const page: any = { context: () => ({ newCDPSession: attach }) };
        const failed = expect(captureNativeJpeg(page, 55, 100)).rejects.toThrow('browser_capture_timeout');
        await jest.advanceTimersByTimeAsync(100);
        await failed;
        expect(stalled.detach).toHaveBeenCalledTimes(1);
        expect(await captureNativeJpeg(page, 55, 100)).toEqual(Buffer.from('jpeg'));
        expect(attach).toHaveBeenCalledTimes(2);
    });

    it('rejects processing that exceeds the deadline before the timer callback can run', async () => {
        const cdp = session();
        const page: any = { context: () => ({ newCDPSession: async () => cdp }) };
        await expect(withCaptureSession(page, 100, async () => {
            jest.setSystemTime(Date.now() + 101);
            return Buffer.from('late frame');
        })).rejects.toThrow('browser_capture_timeout');
        expect(cdp.detach).toHaveBeenCalledTimes(1);
    });

    it('blocks subsequent captures until timed-out DOM masking cleanup has settled', async () => {
        const cdp = session();
        const attach = jest.fn(async () => cdp);
        const page: any = { context: () => ({ newCDPSession: attach }) };
        let release!: () => void;
        const failed = expect(withCaptureSession(page, 100, async () => {
            await new Promise<void>(resolve => { release = resolve; });
            return Buffer.from('late masked frame');
        }, true)).rejects.toThrow('browser_capture_timeout');
        await jest.advanceTimersByTimeAsync(100);
        await failed;
        const waiting = expect(captureNativeJpeg(page, 55, 100)).rejects.toThrow('browser_capture_timeout');
        await jest.advanceTimersByTimeAsync(100);
        await waiting;
        expect(attach).toHaveBeenCalledTimes(1);
        expect(cdp.send).not.toHaveBeenCalled();
        release();
        await jest.advanceTimersByTimeAsync(0);
        expect(await captureNativeJpeg(page, 55, 100)).toEqual(Buffer.from('jpeg'));
        expect(attach).toHaveBeenCalledTimes(2);
    });

    it('requires a fresh page after mask restoration fails', async () => {
        const cdp = session();
        const page: any = { context: () => ({ newCDPSession: async () => cdp }) };
        await expect(withCaptureSession(page, 100, async () => {
            throw new Error('browser_mask_restoration_failed');
        }, true)).rejects.toThrow('browser_mask_restoration_failed');
        await expect(captureNativeJpeg(page, 55, 100)).rejects.toThrow('browser_capture_page_requires_recovery');
        expect(cdp.send).not.toHaveBeenCalled();
    });
});
