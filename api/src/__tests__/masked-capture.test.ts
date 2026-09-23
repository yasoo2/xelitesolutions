import { decode } from 'jpeg-js';
import { PNG } from 'pngjs';
import { captureMaskedJpeg, redactPngToJpeg } from '../modules/browser/masked-capture';

const source = () => PNG.sync.write({ width: 64, height: 64, data: Buffer.alloc(64 * 64 * 4, 255) } as PNG);

describe('capture-consistent image redaction', () => {
    it('rejects an unresolved mask before any screenshot can expose a transient match', async () => {
        const send = jest.fn();
        const page: any = { context: () => ({ newCDPSession: async () => ({ send, detach: async () => {} }) }) };
        const locator: any = { elementHandles: async () => [] };
        await expect(captureMaskedJpeg(page, [locator], 90, 1000)).rejects.toThrow('browser_mask_target_missing');
        expect(send).not.toHaveBeenCalled();
    });
    it('obscures scaled regions while preserving dimensions and other pixels', () => {
        const output = decode(redactPngToJpeg(source(), { width: 32, height: 32 }, [{ x: 8, y: 8, width: 8, height: 8 }], 100));
        expect([output.width, output.height]).toEqual([64, 64]);
        const pixel = (x: number, y: number) => Array.from(output.data.subarray((y * 64 + x) * 4, (y * 64 + x) * 4 + 3));
        const hidden = pixel(24, 24);
        expect(hidden[0]).toBeGreaterThan(240);
        expect(hidden[1]).toBeLessThan(10);
        expect(hidden[2]).toBeGreaterThan(240);
        expect(pixel(4, 4).every(value => value > 240)).toBe(true);
    });

    it('rejects malformed masks and images rather than returning exposed bytes', () => {
        expect(() => redactPngToJpeg(source(), { width: 0, height: 64 }, [], 90)).toThrow();
        expect(() => redactPngToJpeg(source(), { width: 64, height: 64 }, [{ x: NaN, y: 0, width: 4, height: 4 }], 90)).toThrow();
        expect(() => redactPngToJpeg(Buffer.from('invalid'), { width: 64, height: 64 }, [], 90)).toThrow();
    });

    it('produces identical output when only secret pixels differ, including unaligned edges', () => {
        const original = source();
        const changed = PNG.sync.read(original);
        for (let y = 11; y < 28; y++) {
            for (let x = 13; x < 30; x++) {
                const offset = (y * changed.width + x) * 4;
                changed.data[offset] = 0;
                changed.data[offset + 1] = 31;
                changed.data[offset + 2] = 127;
            }
        }
        const altered = PNG.sync.write(changed);
        expect(altered.equals(original)).toBe(false);
        const mask = [{ x: 13, y: 11, width: 17, height: 17 }];
        expect(redactPngToJpeg(altered, { width: 64, height: 64 }, mask, 80))
            .toEqual(redactPngToJpeg(original, { width: 64, height: 64 }, mask, 80));
    });

    it('rejects excessive dimensions before PNG decoding', () => {
        const oversized = Buffer.from(source());
        oversized.writeUInt32BE(200_000, 16);
        expect(() => redactPngToJpeg(oversized, { width: 64, height: 64 }, [], 90))
            .toThrow('browser_mask_image_limit');
    });

    it('drops a frame when a masked target moves during capture', async () => {
        const cdp = { send: jest.fn(async () => ({ data: source().toString('base64') })), detach: jest.fn(async () => undefined) };
        const page: any = {
            context: () => ({ newCDPSession: async () => cdp }),
            evaluate: async () => ({ width: 64, height: 64 }), url: () => 'http://localhost/',
        };
        const box = jest.fn().mockResolvedValueOnce({ x: 8, y: 8, width: 8, height: 8 })
            .mockResolvedValueOnce({ x: 24, y: 8, width: 8, height: 8 });
        const locator: any = { count: async () => 1, nth: () => ({ boundingBox: box }),
            elementHandles: async () => [{
                evaluateHandle: async () => ({
                    evaluate: async (fn: any) => fn({ reset() {}, changed: () => false, restore() {} }),
                    dispose: async () => {},
                }), dispose: async () => {},
            }], evaluateAll: async () => true };
        await expect(captureMaskedJpeg(page, [locator], 90, 1_000)).rejects.toThrow('browser_mask_geometry_changed');
        expect(cdp.send).toHaveBeenCalledWith('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    });
});
