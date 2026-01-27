import { chromium, type Browser, type BrowserContext, type Page, type Locator, type LaunchOptions } from 'playwright';
import fs from 'fs';
import path from 'path';
import { DEFAULT_BROWSER_CONFIG } from './config';
import { broadcastBrowserEvent } from './wsHub';

type SessionState = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  allowedOrigin: string | null;
  streaming: boolean;
  streamTimer: NodeJS.Timeout | null;
  maskLocators: Locator[];
  captureLocked: boolean;
  viewport: { w: number; h: number };
  lastUsedAt: number;
};

const sessions = new Map<string, SessionState>();

function broadcastStatus(sessionId: string, s: SessionState, extra?: { workerStatus?: string; blockingReason?: string }) {
  const sid = String(sessionId || '').trim();
  if (!sid) return;
  let url = '';
  try {
    url = s.page.url() || '';
  } catch {
    url = '';
  }
  broadcastBrowserEvent(sid, {
    type: 'session_status',
    ts: Date.now(),
    sessionId: sid,
    url,
    workerStatus: (extra?.workerStatus || 'idle') as any,
    blockingReason: extra?.blockingReason as any,
  });
}

function parseBool(raw: string | undefined) {
  if (raw === undefined) return undefined;
  const s = String(raw).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(s)) return false;
  return undefined;
}

function parseViewport(raw: string | undefined) {
  const fallback = { w: 1280, h: 720 };
  if (!raw) return fallback;
  const m = String(raw).trim().match(/^(\d{2,5})\s*[x,]\s*(\d{2,5})$/i);
  if (!m) return fallback;
  const w = Math.max(320, Math.min(3840, Number(m[1])));
  const h = Math.max(240, Math.min(2160, Number(m[2])));
  if (!Number.isFinite(w) || !Number.isFinite(h)) return fallback;
  return { w, h };
}

export function getBrowserViewport() {
  return parseViewport(process.env.BROWSER_VIEWPORT);
}

export function getChromiumLaunchOptions(): LaunchOptions {
  const headlessEnv = parseBool(process.env.BROWSER_HEADLESS);
  const headedEnv = parseBool(process.env.BROWSER_HEADED) ?? parseBool(process.env.BROWSER_HEADFUL);
  const headless = headlessEnv !== undefined ? headlessEnv : headedEnv ? false : true;

  const args: string[] = [
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--use-gl=swiftshader',
    '--use-angle=swiftshader',
  ];
  const noSandbox = parseBool(process.env.BROWSER_NO_SANDBOX) ?? parseBool(process.env.BROWSER_DISABLE_SANDBOX);
  if (noSandbox) args.push('--no-sandbox', '--disable-setuid-sandbox');

  return { headless, args };
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function tryAcquireCaptureLock(s: SessionState, wait: boolean, timeoutMs: number) {
  const startedAt = Date.now();
  while (s.captureLocked) {
    if (!wait) return false;
    if (Date.now() - startedAt > timeoutMs) return false;
    await sleep(50);
  }
  s.captureLocked = true;
  return true;
}

async function captureJpeg(
  s: SessionState,
  opts: { quality: number; timeoutMs: number; mask?: Locator[]; waitForLock: boolean },
) {
  const locked = await tryAcquireCaptureLock(s, opts.waitForLock, opts.timeoutMs);
  if (!locked) return null;
  try {
    return await s.page.screenshot({
      type: 'jpeg',
      quality: opts.quality,
      animations: 'disabled',
      timeout: opts.timeoutMs,
      mask: opts.mask && opts.mask.length ? opts.mask : undefined,
    });
  } finally {
    s.captureLocked = false;
  }
}

export async function screenshotSessionJpeg(sessionId: string, opts?: { quality?: number; timeoutMs?: number }) {
  const sid = String(sessionId || '').trim();
  const s = await getBrowserSession(sid);
  const quality = Math.max(1, Math.min(100, Number(opts?.quality ?? 55)));
  const timeoutMs = Math.max(1000, Number(opts?.timeoutMs ?? 60000));
  const buf = await captureJpeg(s, { quality, timeoutMs, waitForLock: true });
  if (!buf) throw new Error('screenshot_failed');
  return buf;
}

let activeRuns = 0;
const runWaiters: Array<() => void> = [];

export async function withBrowserConcurrency<T>(fn: () => Promise<T>) {
  const max = Math.max(1, Math.min(8, Number(process.env.BROWSER_MAX_CONCURRENCY || 1)));
  if (activeRuns >= max) {
    await new Promise<void>((resolve) => runWaiters.push(resolve));
  }
  activeRuns += 1;
  try {
    return await fn();
  } finally {
    activeRuns -= 1;
    const next = runWaiters.shift();
    if (next) next();
  }
}

export function touchSession(sessionId: string) {
  const sid = String(sessionId || '').trim();
  const s = sessions.get(sid);
  if (!s) return;
  s.lastUsedAt = Date.now();
}

let cleanupTimer: NodeJS.Timeout | null = null;
function ensureCleanupLoop() {
  if (cleanupTimer) return;
  const tickMs = 60_000;
  cleanupTimer = setInterval(() => {
    const idleMs = Math.max(60_000, Number(process.env.BROWSER_IDLE_TIMEOUT_MS || 900_000));
    const cutoff = Date.now() - idleMs;
    for (const [sid, s] of sessions.entries()) {
      if (s.lastUsedAt < cutoff) {
        void stopSession(sid);
      }
    }
  }, tickMs);
  try {
    (cleanupTimer as any).unref?.();
  } catch { }
}

export async function createSession(sessionId: string) {
  const cfg = DEFAULT_BROWSER_CONFIG;
  const viewport = getBrowserViewport();

  let browser: Browser | null = null;
  /* MODIFIED: Logging and Fallback */
  let wsEndpoint = process.env.BROWSER_WS_ENDPOINT || '';

  try {
    const logPath = path.join(__dirname, '../stream_debug.log');
    fs.appendFileSync(logPath, `[createSession] Env WS: '${wsEndpoint}'\n`);
  } catch (e) { }

  if (!wsEndpoint) {
    // No WS endpoint provided, will attempt local launch
  }

  const apiKey = process.env.WORKER_API_KEY || '';

  if (wsEndpoint) {
    // Determine connection URL (with auth if needed)
    // If wsEndpoint is the base URL (http://host:port), we might need to fetch the WS URL first or use connect({ wsEndpoint }) if it's direct.
    // However, playwright expects a direct WS url. 
    // Usually browser-worker returns { wsEndpoint: '...' } on start. But usually we want a persistent connection.
    // If the worker exposes `ws://host:port`, we use that.

    // Assuming standard Playwright server or compatible wrapper
    // If we have an API key, we might need to pass it in headers.
    // Retry logic for browser worker connection
    let attempt = 0;
    const maxRetries = 10;
    while (!browser) {
      try {
        browser = await chromium.connect(wsEndpoint, {
          headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : undefined
        });
        /* MODIFIED: Log success */
        try { fs.appendFileSync(path.join(__dirname, '../stream_debug.log'), `[createSession] Connected to ${wsEndpoint}\n`); } catch { }
      } catch (e) {
        attempt++;
        if (attempt >= maxRetries) {
          try { fs.appendFileSync(path.join(__dirname, '../stream_debug.log'), `[createSession] Failed to connect after ${maxRetries} attempts\n`); } catch { }
          throw e; // Final failure
        }
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000); // Exponential backoff max 10s
        try { fs.appendFileSync(path.join(__dirname, '../stream_debug.log'), `[createSession] Connection failed, retrying in ${delay}ms (Attempt ${attempt}/${maxRetries})\n`); } catch { }
        await new Promise(r => setTimeout(r, delay));
      }
    }
  } else {
    browser = await chromium.launch(getChromiumLaunchOptions());
  }

  if (!browser) throw new Error('browser_connection_failed_after_retries');
  const context = await browser.newContext({
    viewport: { width: viewport.w, height: viewport.h },
    locale: 'ar',
  });
  context.setDefaultNavigationTimeout(cfg.navTimeoutMs);
  context.setDefaultTimeout(cfg.actionTimeoutMs);
  const page = await context.newPage();

  const state: SessionState = {
    browser,
    context,
    page,
    allowedOrigin: null,
    streaming: false,
    streamTimer: null,
    maskLocators: [],
    captureLocked: false,
    viewport,
    lastUsedAt: Date.now(),
  };

  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame()) return;
    try {
      broadcastStatus(sessionId, state, { workerStatus: 'idle' });
    } catch { }
    try {
      const u = new URL(frame.url());
      const origin = u.origin;
      if (!state.allowedOrigin) {
        state.allowedOrigin = origin;
        return;
      }
      if (DEFAULT_BROWSER_CONFIG.strictSameSite && origin !== state.allowedOrigin) {
        broadcastBrowserEvent(sessionId, {
          type: 'goto_blocked',
          stepId: 'policy',
          ts: Date.now(),
          url: frame.url(),
          reason: 'same_site_blocked',
          message: 'cross_site_navigation_blocked',
        });
        try {
          broadcastStatus(sessionId, state, { workerStatus: 'idle', blockingReason: 'same_site_blocked' });
        } catch { }
        try {
          void page.goBack({ waitUntil: 'domcontentloaded' });
        } catch { }
      }
    } catch { }
  });

  try {
    broadcastStatus(sessionId, state, { workerStatus: 'idle' });
  } catch { }

  return state;
}

export async function getBrowserSession(sessionId: string) {
  const sid = String(sessionId || '').trim();
  if (!sid) throw new Error('sessionId_required');
  const existing = sessions.get(sid);
  if (existing) {
    existing.lastUsedAt = Date.now();
    ensureCleanupLoop();
    return existing;
  }
  const created = await createSession(sid);
  sessions.set(sid, created);
  ensureCleanupLoop();
  return created;
}

export function setStreamMask(sessionId: string, maskLocators: Locator[]) {
  const sid = String(sessionId || '').trim();
  const s = sessions.get(sid);
  if (!s) return;
  s.maskLocators = Array.isArray(maskLocators) ? maskLocators : [];
  s.lastUsedAt = Date.now();
}

export function startStreaming(sessionId: string) {
  const sid = String(sessionId || '').trim();
  const s = sessions.get(sid);
  if (!s) return;
  if (s.streaming) return;
  s.streaming = true;
  s.lastUsedAt = Date.now();
  try {
    broadcastStatus(sid, s, { workerStatus: 'idle' });
  } catch { }
  const cfg = DEFAULT_BROWSER_CONFIG;
  const intervalMs = Math.max(50, Math.floor(1000 / Math.max(1, cfg.streamFps)));
  s.streamTimer = setInterval(async () => {
    if (!s.streaming) return;
    try {
      const buf = await captureJpeg(s, {
        quality: 55,
        timeoutMs: Math.max(1000, Math.min(8000, cfg.actionTimeoutMs)),
        waitForLock: false,
        mask: s.maskLocators.length ? s.maskLocators : undefined,
      });

      // DEBUG LOGGING
      try {
        const logPath = path.join(__dirname, '../stream_debug.log');
        const msg = `[${new Date().toISOString()}] SID=${sid} Streaming Loop. Buf? ${!!buf} Len=${buf?.length}\n`;
        fs.appendFileSync(logPath, msg);
      } catch (e) { }

      if (!buf) return;
      broadcastBrowserEvent(sid, {
        type: 'stream_frame',
        ts: Date.now(),
        jpegBase64: Buffer.from(buf).toString('base64'),
        w: s.viewport.w,
        h: s.viewport.h,
      });
      s.lastUsedAt = Date.now();
    } catch { }
  }, intervalMs);
}

export function stopStreaming(sessionId: string) {
  const sid = String(sessionId || '').trim();
  const s = sessions.get(sid);
  if (!s) return;
  s.streaming = false;
  if (s.streamTimer) {
    try { clearInterval(s.streamTimer); } catch { }
    s.streamTimer = null;
  }
  try {
    broadcastStatus(sid, s, { workerStatus: 'idle' });
  } catch { }
}

export async function stopSession(sessionId: string) {
  const sid = String(sessionId || '').trim();
  const s = sessions.get(sid);
  if (!s) return;
  sessions.delete(sid);
  s.streaming = false;
  if (s.streamTimer) {
    try { clearInterval(s.streamTimer); } catch { }
    s.streamTimer = null;
  }
  try { await s.context.close(); } catch { }
  try { await s.browser.close(); } catch { }
}

export async function healthcheckBrowser() {
  const startedAt = Date.now();
  const viewport = getBrowserViewport();
  const browser = await chromium.launch(getChromiumLaunchOptions());
  try {
    const context = await browser.newContext({ viewport: { width: viewport.w, height: viewport.h } });
    try {
      const page = await context.newPage();
      const url = 'https://example.com';
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      const buf = await page.screenshot({ type: 'jpeg', quality: 65, animations: 'disabled' });
      const artifactDir = process.env.ARTIFACT_DIR || '/tmp/joe-artifacts';
      try {
        if (!fs.existsSync(artifactDir)) fs.mkdirSync(artifactDir, { recursive: true });
      } catch { }
      const fname = `health-browser-${Date.now()}.jpg`;
      const full = path.join(artifactDir, fname);
      try {
        fs.writeFileSync(full, buf);
      } catch { }
      const href = `/artifacts/${encodeURIComponent(fname)}`;
      return { ok: true as const, ms: Date.now() - startedAt, url, screenshotHref: href };
    } finally {
      try { await context.close(); } catch { }
    }
  } finally {
    try { await browser.close(); } catch { }
  }
  return { ok: true as const, ms: Date.now() - startedAt };
}
