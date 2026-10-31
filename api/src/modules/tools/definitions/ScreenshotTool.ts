import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import { chromium, Browser, BrowserContext, BrowserServer } from 'playwright';
import path from 'path';
import fs from 'fs';
import { broadcast } from '../../../api/ws';
import { getChromiumLaunchOptions } from '../../../modules/browser/manager';
import { workspaceService } from '../../services/WorkspaceService';
import { isWithinRoot } from '../path-containment';
import { createHash, randomUUID } from 'crypto';
import { traceManager } from '../../services/TraceManager';

class ScreenshotCaptureError extends Error {
    constructor(readonly code: string) { super(code); }
}
const captureFailure = (code: string): never => { throw new ScreenshotCaptureError(code); };
const SCREENSHOT_BYTES = 8 * 1024 * 1024;
const SCREENSHOT_PIXELS = 16 * 1024 * 1024;

function screenshotFilename(value: unknown): string {
    if (value === undefined) return 'screenshot.png';
    if (typeof value !== 'string' || !value || value.length > 128
        || /[<>:"/\\|?*\x00-\x1f\x7f]/.test(value) || /[. ]$/.test(value)
        || !/\.(png|jpe?g|webp)$/i.test(value) || !value.slice(0, value.lastIndexOf('.')).trim()) return captureFailure('invalid_filename');
    const device = value.split('.')[0].trimEnd();
    if (/^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])$/i.test(device)) return captureFailure('invalid_filename');
    return value; // Preserve valid Unicode exactly; do not sanitize into a different name.
}

function screenshotNumber(value: unknown, fallback: number, min: number, max: number): number {
    if (value === undefined) return fallback;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) return captureFailure('invalid_capture_options');
    return value;
}

function screenshotPngDimensions(bytes: Buffer): { width: number; height: number } {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (!Buffer.isBuffer(bytes) || bytes.length < 45 || bytes.length > SCREENSHOT_BYTES
        || !bytes.subarray(0, 8).equals(signature) || bytes.readUInt32BE(8) !== 13
        || bytes.toString('ascii', 12, 16) !== 'IHDR' || bytes.toString('ascii', bytes.length - 8, bytes.length - 4) !== 'IEND') return captureFailure('invalid_capture_png');
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    if (!width || !height || width * height > SCREENSHOT_PIXELS) return captureFailure('capture_resource_limit');
    return { width, height };
}

function screenshotImageDimensions(bytes: Buffer, type: 'png' | 'jpeg' | 'webp'): { width: number; height: number } {
    if (type === 'png') return screenshotPngDimensions(bytes);
    if (!Buffer.isBuffer(bytes) || bytes.length > SCREENSHOT_BYTES || bytes.length < 12) return captureFailure('invalid_capture_image');
    const boundedDimensions = (width: number, height: number) => {
        if (!width || !height || width * height > SCREENSHOT_PIXELS) return captureFailure('capture_resource_limit');
        return { width, height };
    };
    if (type === 'jpeg') {
        if (bytes.readUInt16BE(0) !== 0xffd8 || bytes.readUInt16BE(bytes.length - 2) !== 0xffd9) return captureFailure('invalid_capture_image');
        let offset = 2;
        for (let segments = 0; segments < 1024 && offset + 4 <= bytes.length; segments++) {
            if (bytes[offset] !== 0xff) return captureFailure('invalid_capture_image');
            while (offset < bytes.length && bytes[offset] === 0xff) offset++;
            if (offset >= bytes.length) break;
            const marker = bytes[offset++];
            if (marker === 0xd9 || marker === 0xda) break;
            if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
            if (offset + 2 > bytes.length) break;
            const length = bytes.readUInt16BE(offset);
            if (length < 2 || offset + length > bytes.length) return captureFailure('invalid_capture_image');
            if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
                if (length < 8) return captureFailure('invalid_capture_image');
                return boundedDimensions(bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3));
            }
            offset += length;
        }
    } else {
        if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP' || bytes.readUInt32LE(4) + 8 !== bytes.length) return captureFailure('invalid_capture_image');
        let offset = 12;
        for (let chunks = 0; chunks < 4096 && offset + 8 <= bytes.length; chunks++) {
            const name = bytes.toString('ascii', offset, offset + 4), length = bytes.readUInt32LE(offset + 4), data = offset + 8;
            if (data + length > bytes.length) return captureFailure('invalid_capture_image');
            if (name === 'VP8X' && length >= 10) return boundedDimensions(bytes.readUIntLE(data + 4, 3) + 1, bytes.readUIntLE(data + 7, 3) + 1);
            if (name === 'VP8L' && length >= 5 && bytes[data] === 0x2f) {
                const packed = bytes.readUInt32LE(data + 1);
                return boundedDimensions((packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1);
            }
            if (name === 'VP8 ' && length >= 10 && (bytes[data] & 1) === 0 && bytes.subarray(data + 3, data + 6).equals(Buffer.from([0x9d, 1, 0x2a]))) return boundedDimensions(bytes.readUInt16LE(data + 6) & 0x3fff, bytes.readUInt16LE(data + 8) & 0x3fff);
            offset = data + length + (length & 1);
        }
    }
    return captureFailure('invalid_capture_image');
}

function screenshotDirectory(parent: string, segment: string, root: string): string {
    const target = path.join(parent, segment);
    let stat: fs.Stats;
    try { stat = fs.lstatSync(target); }
    catch (error: any) {
        if (error?.code !== 'ENOENT') throw error;
        fs.mkdirSync(target); // Parent has already been checked; never mkdir through a link.
        stat = fs.lstatSync(target);
    }
    if (stat.isSymbolicLink() || !stat.isDirectory() || !isWithinRoot(fs.realpathSync(target), root)) return captureFailure('capture_path_invalid');
    return target;
}

/**
 * ScreenshotTool - Captures screenshots of web pages for visual verification
 * Used by JoeStudio's Screenshot Gallery feature
 */
export class ScreenshotTool extends BaseTool {
    name = 'screenshot';
    description = 'Capture a screenshot of a web page for visual verification.';
    version = '1.0.0';
    tags = ['browser', 'visual', 'qa', 'screenshot'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            url: {
                type: 'string',
                description: 'URL of the page to capture'
            },
            filename: {
                type: 'string',
                description: 'PNG, JPEG or WebP basename; stored immutably under the selected workspace screenshots folder'
            },
            fullPage: {
                type: 'boolean',
                description: 'Capture full scrollable page (default: false)'
            },
            width: {
                type: 'number',
                description: 'Viewport width (default: 1280)'
            },
            height: {
                type: 'number',
                description: 'Viewport height (default: 720)'
            },
            waitFor: {
                type: 'number',
                description: 'Wait time in ms after page load (default: 1000)'
            }
        },
        required: ['url']
    };
    outputSchema = {
        type: 'object' as const,
        properties: {
            success: { type: 'boolean' },
            path: { type: 'string' },
            width: { type: 'number' },
            height: { type: 'number' }
        }
    };
    permissions: ToolPermission[] = ['read', 'write', 'internet'];
    sideEffects: ToolPermission[] = ['write'];
    rateLimitPerMinute = 30;
    auditFields = ['url'];

    async execute(input: any, context?: any) {
        const logs: string[] = [];
        const ids = ['sessionId', 'workspaceId', 'userId'].map(key => typeof context?.[key] === 'string' ? context[key].trim() : '');
        const [sessionId, workspaceId, userId] = ids;
        if (ids.some(value => !value || value.length > 180)) return { ok: false, error: 'capture_context_required', logs };
        const signal = context?.signal;
        if (signal != null && (typeof signal.aborted !== 'boolean' || typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function')) {
            return { ok: false, error: 'invalid_cancellation_context', logs };
        }
        let active = true, terminal: string | undefined, browser: Browser | undefined, browserServer: BrowserServer | undefined;
        let pendingServer: Promise<BrowserServer> | undefined;
        let rejectTerminal: (error: Error) => void = () => {};
        const terminalPromise = new Promise<never>((_, reject) => { rejectTerminal = reject; });
        void terminalPromise.catch(() => {});
        const stopped = (code: string) => {
            if (!active || terminal) return;
            terminal = code;
            rejectTerminal(new ScreenshotCaptureError(code));
        };
        const onAbort = () => stopped('cancelled');
        // Two bounded stages reserve time for browser disposal even if context close stalls.
        const ownedContexts = new WeakMap<Browser, BrowserContext>();
        const closedContexts = new WeakMap<BrowserContext, Promise<string | undefined>>();
        const closed = new WeakMap<Browser, Promise<string | undefined>>();
        const closeStage = async (work: () => Promise<void>, stage: 'context' | 'browser', limitMs = 5000,
            detail: 'context' | 'browser_client' | 'server_grace' | 'server_force' | 'launch_wait' = stage === 'context' ? 'context' : 'browser_client') => {
            const started = Date.now();
            let status: 'completed' | 'failed' | 'timeout' = 'completed';
            let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
            try {
                return await Promise.race([
                    Promise.resolve().then(work).then(() => undefined, () => { status = 'failed'; return 'capture_'+stage+'_cleanup_failed'; }),
                    new Promise<string>(resolve => { cleanupTimer = setTimeout(() => { status = 'timeout'; resolve('capture_'+stage+'_cleanup_timeout'); }, limitMs); })
                ]);
            } finally {
                clearTimeout(cleanupTimer);
                // Bounded stage names and timings only; no native details or credentials.
                if (context?.traceId) traceManager.logEvent(context.traceId, 'tool',
                    { name: this.name, event: 'capture_cleanup', stage: detail, status, elapsedMs: Date.now() - started });
                if (status !== 'completed') logs.push('Screenshot cleanup '+detail+': '+status+'.');
            }
        };
        const closeContextOnce = (owned: BrowserContext) => {
            const previous = closedContexts.get(owned);
            if (previous) return previous;
            const cleanup = closeStage(() => owned.close(), 'context');
            closedContexts.set(owned, cleanup);
            return cleanup;
        };
        // This handle comes only from this capture's launchServer call. Never
        // discover a PID by name or accept one from the request/context.
        const ownedServers = new WeakMap<Browser, BrowserServer>();
        const serverProcesses = new WeakMap<BrowserServer, ReturnType<BrowserServer['process']>>();
        const serverPids = new WeakMap<BrowserServer, number | undefined>();
        const closedServers = new WeakMap<BrowserServer, Promise<string | undefined>>();
        const closeServerOnce = (server?: BrowserServer): Promise<string | undefined> => {
            if (!server) return Promise.resolve(undefined);
            const previous = closedServers.get(server);
            if (previous) return previous;
            const cleanup = (async () => {
                const process = serverProcesses.get(server);
                const sameOwner = () => !!process && server.process() === process
                    && Number.isSafeInteger(process.pid) && process.pid! > 0 && process.pid === serverPids.get(server);
                const exited = () => sameOwner()
                    && (typeof process!.exitCode === 'number' || typeof process!.signalCode === 'string');
                const gracefulFailure = await closeStage(() => server.close(), 'browser', 5000, 'server_grace');
                if (!gracefulFailure && exited()) return undefined;
                if (!sameOwner()) return gracefulFailure || 'capture_browser_cleanup_failed';
                // Public Playwright API targets this spawned process and waits
                // for its exit. A fulfilled call without exit evidence is failure.
                const forcedFailure = await closeStage(() => server.kill(), 'browser', 5000, 'server_force');
                return forcedFailure || (exited() ? undefined : 'capture_browser_cleanup_failed');
            })();
            closedServers.set(server, cleanup);
            return cleanup;
        };
        const closeOnce = (owned?: Browser): Promise<string | undefined> => {
            if (!owned) return Promise.resolve(undefined);
            const previous = closed.get(owned);
            if (previous) return previous;
            const cleanup = (async () => {
                const ownedContext = ownedContexts.get(owned);
                const contextFailure = ownedContext ? await closeContextOnce(ownedContext) : undefined;
                // Always attempt owned browser disposal, including a failed/timed-out context.
                // A remote client may wait for the server's disconnection event.
                // Dispose the capture-owned server first, then close the client.
                const processFailure = await closeServerOnce(ownedServers.get(owned));
                const browserFailure = await closeStage(() => owned.close(), 'browser');
                return contextFailure || browserFailure || processFailure;
            })();
            closed.set(owned, cleanup);
            return cleanup;
        };
        const check = () => {
            if (ids.some((value, index) => value !== String(context?.[['sessionId', 'workspaceId', 'userId'][index]] || '').trim())) return captureFailure('capture_context_changed');
            if (signal?.aborted || context?.isCancelled?.()) stopped('cancelled');
            if (terminal) return captureFailure(terminal);
        };
        const bounded = async <T>(work: () => Promise<T>): Promise<T> => {
            check();
            const result = await Promise.race([work(), terminalPromise]);
            check();
            return result;
        };
        const timer = setTimeout(() => stopped('capture_timeout'), 60_000);
        signal?.addEventListener('abort', onAbort, { once: true });
        const pendingCancellation = context?.cancellation;
        if (pendingCancellation && typeof pendingCancellation.then === 'function') void pendingCancellation.then(onAbort, onAbort);
        try {
            check();
            if (typeof input?.url !== 'string' || !input.url.trim() || input.url.length > 4096 || /[\x00-\x1f\x7f\\]/.test(input.url)) return captureFailure('invalid_capture_url');
            let target: URL;
            try { target = new URL(input.url.trim()); } catch { return captureFailure('invalid_capture_url'); }
            if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) return captureFailure('invalid_capture_url');
            const filename = screenshotFilename(input?.filename);
            const format = /\.webp$/i.test(filename) ? 'webp' : /\.jpe?g$/i.test(filename) ? 'jpeg' : 'png';
            const width = screenshotNumber(input?.width, 1280, 1, 8192);
            const height = screenshotNumber(input?.height, 720, 1, 8192);
            const waitFor = screenshotNumber(input?.waitFor, 1000, 0, 10000);
            if (width * height > SCREENSHOT_PIXELS || (input?.fullPage !== undefined && typeof input.fullPage !== 'boolean')) return captureFailure('invalid_capture_options');
            if (!await bounded(() => workspaceService.canAccessAutonomousFiles(workspaceId, userId, true))) return captureFailure('workspace_permission_denied');
            const activeRoot = workspaceService.getActiveRoot(workspaceId);
            if (!path.isAbsolute(activeRoot) || !fs.lstatSync(activeRoot).isDirectory()) return captureFailure('capture_path_invalid');
            const realRoot = fs.realpathSync(activeRoot);
            const stableRoot = () => {
                check();
                if (workspaceService.getActiveRoot(workspaceId) !== activeRoot || fs.realpathSync(activeRoot) !== realRoot) return captureFailure('workspace_root_changed');
            };
            logs.push('Capturing the requested page.');
            check();
            // Own the launching promise, including a browser that resolves after Stop.
            pendingServer = chromium.launchServer({ ...getChromiumLaunchOptions(),
                headless: true, host: '127.0.0.1', port: 0, timeout: 30000 }).then(async owned => {
                browserServer = owned;
                const process = owned.process();
                serverProcesses.set(owned, process);
                serverPids.set(owned, process.pid);
                if (!active || terminal) {
                    await closeServerOnce(owned);
                    return captureFailure(terminal || 'cancelled');
                }
                return owned;
            });
            const ownedServer = await bounded(() => pendingServer!);
            const endpoint = new URL(ownedServer.wsEndpoint());
            if (endpoint.protocol !== 'ws:' || endpoint.hostname !== '127.0.0.1' || endpoint.username || endpoint.password
                || Number(endpoint.port) < 1024 || Number(endpoint.port) > 65535
                || !/^\/[^/]+$/.test(endpoint.pathname) || endpoint.search || endpoint.hash) {
                return captureFailure('capture_browser_endpoint_invalid');
            }
            const connecting = chromium.connect(endpoint.href, { timeout: 30000 }).then(async owned => {
                ownedServers.set(owned, ownedServer);
                if (!active || terminal) { await closeOnce(owned); return owned; }
                browser = owned;
                return owned;
            });
            const ownedBrowser = await bounded(() => connecting);
            browser = ownedBrowser;
            const creatingContext = ownedBrowser.newContext({ viewport: { width, height } }).then(async owned => {
                ownedContexts.set(ownedBrowser, owned);
                if (!active || terminal) await closeContextOnce(owned);
                return owned;
            });
            const browserContext = await bounded(() => creatingContext);
            const page = await bounded(() => browserContext.newPage());
            await bounded(() => page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: 30000 }));
            if (waitFor) await bounded(() => page.waitForTimeout(waitFor));
            const imageBytes = await bounded<Buffer>(() => page.screenshot({ type: format, fullPage: input?.fullPage === true, timeout: 30000 }));
            const dimensions = screenshotImageDimensions(imageBytes, format);
            const cleanupFailure = await bounded(() => closeOnce(browser));
            if (cleanupFailure) return captureFailure(cleanupFailure);
            if (!await bounded(() => workspaceService.canAccessAutonomousFiles(workspaceId, userId, true))) return captureFailure('workspace_permission_denied');
            stableRoot();
            const screenshots = screenshotDirectory(realRoot, 'screenshots', realRoot);
            const sessionKey = createHash('sha256').update(sessionId).digest('hex').slice(0, 32);
            const sessionDir = screenshotDirectory(screenshots, sessionKey, realRoot);
            const captureId = randomUUID();
            const captureDir = path.join(sessionDir, captureId);
            fs.mkdirSync(captureDir); // EEXIST is terminal; never reuse or overwrite an old capture.
            if (fs.lstatSync(captureDir).isSymbolicLink() || !isWithinRoot(fs.realpathSync(captureDir), realRoot)) return captureFailure('capture_path_invalid');
            stableRoot();
            const outputPath = path.join(captureDir, filename);
            fs.writeFileSync(outputPath, imageBytes, { flag: 'wx' });
            const createdAt = new Date().toISOString();
            const capture = { id: captureId, filename, mimeType: `image/${format}`, ...dimensions, bytes: imageBytes.length, createdAt };
            fs.writeFileSync(path.join(captureDir, '.joe-capture.json'), JSON.stringify({ version: 1, ...capture,
                sessionId, workspaceId, userId, sha256: createHash('sha256').update(imageBytes).digest('hex') }), { flag: 'wx' });
            // No async boundary between this verified commit and addressed publication.
            check();
            const href = `data:image/${format};base64,${imageBytes.toString('base64')}`;
            broadcast({ type: 'screenshot', sessionId, userId, workspaceId,
                data: { id: captureId, url: href, pageName: 'Screenshot', timestamp: new Date().toISOString(), status: 'success', ...dimensions, sessionId, capture } } as any);
            broadcast({ type: 'workspace_updated', sessionId, userId, workspaceId, data: { sessionId, workspaceId } } as any);
            logs.push('Screenshot saved in the selected workspace.');
            return { ok: true, output: { success: true, path: outputPath, publicUrl: href, ...dimensions }, artifacts: [{ name: filename, href }], logs };
        } catch (error: any) {
            const code = error instanceof ScreenshotCaptureError ? error.code : terminal || 'capture_failed';
            logs.push('Screenshot capture did not complete.');
            // No success pixels or raw native error details are published on failure.
            // Disposal failure is final evidence for this capture. A generative
            // repair cannot safely prove that the owned browser was released.
            // Preserve the failure and stop before a second browser or model call.
            const cleanupFailed = /^capture_(?:context|browser)_cleanup_(?:failed|timeout)$/.test(code);
            return { ok: false, error: code, output: { status: 'failed', reason: code,
                ...(cleanupFailed ? { nonRecoverable: true } : {}) }, logs };
        } finally {
            active = false;
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
            await closeOnce(browser);
            // A stopped capture waits for its tracked launch to settle. SDK launch
            // has its own 30s deadline; this bounded fence also covers late disposal.
            const launchFailure = pendingServer ? await closeStage(
                () => pendingServer!.then(() => {}, () => {}), 'browser', 45000, 'launch_wait') : undefined;
            const serverFailure = await closeServerOnce(browserServer);
            if (launchFailure || serverFailure) {
                const reason = launchFailure || serverFailure!;
                return { ok: false, error: reason,
                    output: { status: 'failed', reason, nonRecoverable: true }, logs };
            }
        }
    }
}

/**
 * VisualComparisonTool - Compares two screenshots for visual regression testing
 */
export class VisualComparisonTool extends BaseTool {
    name = 'visual_compare';
    description = 'Compare two screenshots and report visual differences.';
    version = '1.0.0';
    tags = ['browser', 'visual', 'qa', 'testing'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            baseline: {
                type: 'string',
                description: 'Path to baseline screenshot'
            },
            current: {
                type: 'string',
                description: 'Path to current screenshot to compare'
            },
            threshold: {
                type: 'number',
                description: 'Difference threshold (0-1, default: 0.1)'
            }
        },
        required: ['baseline', 'current']
    };
    outputSchema = {
        type: 'object' as const,
        properties: {
            match: { type: 'boolean' },
            diffPercentage: { type: 'number' }
        }
    };
    permissions: ToolPermission[] = ['read'];
    sideEffects: ToolPermission[] = [];
    rateLimitPerMinute = 30;
    auditFields = ['baseline', 'current'];

    async execute(input: any) {
        const logs: string[] = [];
        const baseline = String(input?.baseline ?? '');
        const current = String(input?.current ?? '');
        const threshold = Number(input?.threshold) || 0.1;

        // Check files exist
        if (!fs.existsSync(baseline)) {
            return { ok: false, error: 'Baseline screenshot not found', logs };
        }
        if (!fs.existsSync(current)) {
            return { ok: false, error: 'Current screenshot not found', logs };
        }

        try {
            // Read both images
            const baselineBuffer = fs.readFileSync(baseline);
            const currentBuffer = fs.readFileSync(current);

            // Simple size comparison (basic check)
            const sizeDiff = Math.abs(baselineBuffer.length - currentBuffer.length);
            const maxSize = Math.max(baselineBuffer.length, currentBuffer.length);
            const diffPercentage = sizeDiff / maxSize;

            const match = diffPercentage <= threshold;

            logs.push(`Comparison complete: ${match ? 'MATCH' : 'DIFFERENT'}`);
            logs.push(`Diff: ${(diffPercentage * 100).toFixed(2)}%`);

            return {
                ok: true,
                output: {
                    match,
                    diffPercentage: diffPercentage * 100
                },
                logs
            };

        } catch (error: any) {
            logs.push(`Error: ${error.message}`);
            return { ok: false, error: error.message, logs };
        }
    }
}
