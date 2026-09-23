import type { CDPSession, Page } from 'playwright';

const sessions = new WeakMap<Page, CDPSession>();
const cleanupBarriers = new WeakMap<Page, Promise<void>>();
const taintedPages = new WeakSet<Page>();

function detach(session: CDPSession): void {
    // Cleanup must not retain the capture lock when a connection is stalled.
    try { void session.detach().catch(() => { }); } catch { }
}

export async function withCaptureSession<T>(
    page: Page,
    timeoutMs: number,
    action: (session: CDPSession, assertActive: () => void) => Promise<T>,
    holdsPageMutation = false,
): Promise<T> {
    let session: CDPSession | undefined;
    const previousCleanup = cleanupBarriers.get(page);
    let active = true;
    const deadline = Date.now() + timeoutMs;
    const assertActive = () => {
        if (!active || Date.now() >= deadline) throw new Error('browser_capture_timeout');
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const work = async () => {
        if (previousCleanup) await previousCleanup;
        assertActive();
        if (taintedPages.has(page)) throw new Error('browser_capture_page_requires_recovery');
        session = sessions.get(page);
        if (!session) {
            const attached = await page.context().newCDPSession(page);
            if (!active || Date.now() >= deadline) {
                detach(attached);
                throw new Error('browser_capture_timeout');
            }
            session = attached;
            sessions.set(page, attached);
        }
        const result = await action(session, assertActive);
        // Synchronous image processing can delay the timer callback itself.
        assertActive();
        return result;
    };
    const execution = work().catch(error => {
        if (String(error).includes('browser_mask_restoration_failed')) taintedPages.add(page);
        throw error;
    });
    if (holdsPageMutation) {
        // A caller may time out before DOM restoration settles. No subsequent
        // capture may race that restoration, even after its manager lock frees.
        const barrier = execution.then(() => {}, () => {});
        cleanupBarriers.set(page, barrier);
        void barrier.then(() => {
            if (cleanupBarriers.get(page) === barrier) cleanupBarriers.delete(page);
        });
    }
    try {
        return await Promise.race([
            execution,
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error('browser_capture_timeout')), timeoutMs);
            }),
        ]);
    } catch (error) {
        if (session) {
            if (sessions.get(page) === session) sessions.delete(page);
            detach(session);
        }
        throw error;
    } finally {
        active = false;
        if (timer) clearTimeout(timer);
    }
}

export function captureNativeJpeg(page: Page, quality: number, timeoutMs: number): Promise<Buffer> {
    return withCaptureSession(page, timeoutMs, async session => {
        const shot = await session.send('Page.captureScreenshot', {
            format: 'jpeg', quality, captureBeyondViewport: false,
        });
        return Buffer.from(shot.data, 'base64');
    });
}
