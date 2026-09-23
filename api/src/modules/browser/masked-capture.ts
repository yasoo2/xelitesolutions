import type { ElementHandle, JSHandle, Locator, Page } from 'playwright';
import { encode } from 'jpeg-js';
import { PNG } from 'pngjs';
import { withCaptureSession } from './native-capture';

type Rect = { x: number; y: number; width: number; height: number };

export function redactPngToJpeg(buffer: Buffer, viewport: { width: number; height: number }, regions: Rect[], quality: number): Buffer {
    if (!(viewport.width > 0 && viewport.height > 0)) throw new Error('browser_mask_invalid_viewport');
    // Reject oversized or unexpected input before the decoder allocates pixels.
    if (buffer.length < 33 || buffer.length > 32 * 1024 * 1024 ||
        !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
        buffer.readUInt32BE(8) !== 13 || buffer.toString('ascii', 12, 16) !== 'IHDR') {
        throw new Error('browser_mask_invalid_png');
    }
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    if (!width || !height || width * height > 8_000_000 || buffer[24] !== 8) {
        throw new Error('browser_mask_image_limit');
    }
    const frame = PNG.sync.read(buffer, { checkCRC: true });
    const sx = frame.width / viewport.width;
    const sy = frame.height / viewport.height;
    for (const rect of regions) {
        if (!Object.values(rect).every(Number.isFinite) || rect.width < 0 || rect.height < 0) {
            throw new Error('browser_mask_invalid_region');
        }
        const left = Math.max(0, Math.floor(rect.x * sx) - 2);
        const top = Math.max(0, Math.floor(rect.y * sy) - 2);
        const right = Math.min(frame.width, Math.ceil((rect.x + rect.width) * sx) + 2);
        const bottom = Math.min(frame.height, Math.ceil((rect.y + rect.height) * sy) + 2);
        for (let y = top; y < bottom; y++) {
            for (let x = left; x < right; x++) {
                const offset = (y * frame.width + x) * 4;
                frame.data[offset] = 255;
                frame.data[offset + 1] = 0;
                frame.data[offset + 2] = 255;
                frame.data[offset + 3] = 255;
            }
        }
    }
    return encode({ width: frame.width, height: frame.height, data: frame.data }, quality).data;
}

export function captureMaskedJpeg(page: Page, masks: Locator[], quality: number, timeoutMs: number): Promise<Buffer> {
    return withCaptureSession(page, timeoutMs, async (session, assertActive) => {
        const guards: JSHandle<any>[] = [];
        const acquired: ElementHandle[] = [];
        try {
            for (const locator of masks) {
                const elements = await locator.elementHandles();
                acquired.push(...elements);
                if (!elements.length) throw new Error('browser_mask_target_missing');
                if (guards.length + elements.length > 128) throw new Error('browser_mask_region_limit');
                for (const element of elements) {
                    assertActive();
                    const guard = await element.evaluateHandle(el => {
                        const target = el as HTMLElement;
                        const style = target.style;
                        if (!style) throw new Error('browser_mask_unsupported_element');
                        const hadStyleAttribute = target.hasAttribute('style');
                        const properties = ['filter', 'transition'];
                        const saved = properties.map(name => ({ name, value: style.getPropertyValue(name), priority: style.getPropertyPriority(name) }));
                        style.setProperty('transition', 'none', 'important');
                        style.setProperty('filter', 'opacity(0)', 'important');
                        let dirty = false;
                        const observer = new MutationObserver(() => { dirty = true; });
                        let root: Node = target.getRootNode();
                        while (true) {
                            observer.observe(root, { subtree: true, attributes: true, childList: true, characterData: true });
                            if (!(root instanceof ShadowRoot)) break;
                            root = root.host.getRootNode();
                        }
                        return {
                            reset() { observer.takeRecords(); dirty = false; },
                            changed() { return dirty || observer.takeRecords().length > 0; },
                            restore() {
                                observer.disconnect();
                                for (const property of saved) {
                                    const ours = property.name === 'filter' ? 'opacity(0)' : 'none';
                                    if (style.getPropertyValue(property.name) !== ours || style.getPropertyPriority(property.name) !== 'important') continue;
                                    if (property.value) style.setProperty(property.name, property.value, property.priority);
                                    else style.removeProperty(property.name);
                                }
                                if (!hadStyleAttribute && !style.length) target.removeAttribute('style');
                            },
                        };
                    });
                    guards.push(guard);
                }
            }
            for (const guard of guards) await guard.evaluate(value => value.reset());
        const snapshot = async () => {
            const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
            const regions: Array<Rect | null> = [];
            for (const locator of masks) {
                const count = await locator.count();
                if (regions.length + count > 128) throw new Error('browser_mask_region_limit');
                for (let i = 0; i < count; i++) {
                    assertActive();
                    regions.push(await locator.nth(i).boundingBox());
                }
            }
            assertActive();
            return { url: page.url(), viewport, regions };
        };
        const before = await snapshot();
        // Verify every currently matched node is hidden; a locator may have
        // acquired new matches while earlier targets were being prepared.
        for (const locator of masks) {
            if (!await locator.evaluateAll(elements => elements.every(el => {
                const style = (el as HTMLElement).style;
                return style?.getPropertyValue('filter') === 'opacity(0)' && style.getPropertyPriority('filter') === 'important'
                    && style.getPropertyValue('transition') === 'none' && style.getPropertyPriority('transition') === 'important';
            }))) throw new Error('browser_mask_targets_changed');
        }
        // Lossy compression must occur only after sensitive pixels are removed.
        const shot = await session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        const after = await snapshot();
        for (const guard of guards) {
            if (await guard.evaluate(value => value.changed())) throw new Error('browser_mask_document_changed');
        }
        // Moving targets make the captured mask coordinates untrustworthy.
        // Drop the frame rather than returning any potentially exposed pixels.
        if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('browser_mask_geometry_changed');
        assertActive();
        return redactPngToJpeg(Buffer.from(shot.data, 'base64'), before.viewport,
            before.regions.filter((region): region is Rect => region !== null), quality);
        } finally {
            let restorationFailed = false;
            for (const guard of guards.reverse()) {
                try { await guard.evaluate(value => value.restore()); }
                catch { restorationFailed = true; }
                finally { void guard.dispose().catch(() => {}); }
            }
            for (const element of acquired) void element.dispose().catch(() => {});
            if (restorationFailed) throw new Error('browser_mask_restoration_failed');
        }
    }, true);
}
