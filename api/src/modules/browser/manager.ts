import { chromium, type Browser, type BrowserContext, type Page, type Locator, type LaunchOptions } from 'playwright';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DEFAULT_BROWSER_CONFIG } from './config';
import { broadcastBrowserEvent } from './wsHub';

/* ============================================================
   PER-USER ENCRYPTED SESSION PERSISTENCE
   ------------------------------------------------------------
   Each browser session (which is per-user in the online model) can persist its
   login state (cookies + origin localStorage = Playwright "storageState") so the
   user logs in ONCE and stays logged in — WITHOUT storing any password. The blob
   is encrypted at rest (AES-256-GCM) with a key derived per-session from a master
   secret, so one user's sessions are cryptographically isolated from another's.
   This is the shared foundation for both local (single user) and future online
   (hundreds of isolated users) operation.
   ============================================================ */
const SESSION_STATE_DIR = process.env.BROWSER_SESSION_DIR
  || path.join(process.env.ARTIFACT_DIR || '/tmp/joe-artifacts', 'browser-sessions');

/** A stable, filesystem-safe id for a session's stored state. */
function sessionStateFile(sessionId: string): string {
  const hash = crypto.createHash('sha256').update(String(sessionId || 'default')).digest('hex').slice(0, 40);
  return path.join(SESSION_STATE_DIR, `${hash}.enc`);
}

/** Per-session key derived from a master secret so users are isolated. */
function sessionKey(sessionId: string): Buffer {
  const master = process.env.BROWSER_SESSION_SECRET || process.env.JWT_SECRET || 'joe-local-browser-secret';
  return crypto.createHash('sha256').update(`${master}::${sessionId}`).digest(); // 32 bytes
}

/** Persist the current login/session state for a browser session (encrypted). */
export async function saveBrowserSession(sessionId: string): Promise<{ ok: boolean; error?: string; origins?: number; cookies?: number }> {
  const sid = String(sessionId || '').trim();
  const s = sessions.get(sid);
  if (!s) return { ok: false, error: 'no_active_session' };
  try {
    const storage = await s.context.storageState();
    const plaintext = Buffer.from(JSON.stringify(storage), 'utf-8');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey(sid), iv);
    const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    fs.mkdirSync(SESSION_STATE_DIR, { recursive: true });
    // Layout: [12-byte iv][16-byte tag][ciphertext]
    fs.writeFileSync(sessionStateFile(sid), Buffer.concat([iv, tag, enc]));
    return { ok: true, origins: storage.origins?.length || 0, cookies: storage.cookies?.length || 0 };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'save_failed' };
  }
}

/** Load & decrypt a saved session state (returns undefined if none/invalid). */
function loadBrowserSessionState(sessionId: string): any | undefined {
  const sid = String(sessionId || '').trim();
  const file = sessionStateFile(sid);
  try {
    if (!fs.existsSync(file)) return undefined;
    const blob = fs.readFileSync(file);
    if (blob.length < 28) return undefined;
    const iv = blob.subarray(0, 12);
    const tag = blob.subarray(12, 28);
    const enc = blob.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', sessionKey(sid), iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return JSON.parse(dec.toString('utf-8'));
  } catch {
    return undefined; // corrupt or wrong key -> start fresh
  }
}

/** Whether a saved (logged-in) session exists for this session id. */
export function hasSavedBrowserSession(sessionId: string): boolean {
  try { return fs.existsSync(sessionStateFile(String(sessionId || '').trim())); } catch { return false; }
}

/** Forget a saved session (logout / privacy). Also clears the live context. */
export async function clearBrowserSession(sessionId: string): Promise<{ ok: boolean }> {
  const sid = String(sessionId || '').trim();
  try { const f = sessionStateFile(sid); if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* ignore */ }
  try { const s = sessions.get(sid); if (s) await s.context.clearCookies(); } catch { /* ignore */ }
  return { ok: true };
}

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

/**
 * Locate an installed Chromium executable so the browser launches reliably even
 * when Playwright's default resolved path doesn't match what's installed (the
 * "browser doesn't work at all" case). Checks an explicit env override, then
 * Playwright's own resolved path, then scans PLAYWRIGHT_BROWSERS_PATH.
 */
export function findChromiumExecutable(): string | undefined {
  const envPath = (process.env.BROWSER_EXECUTABLE_PATH || process.env.CHROMIUM_PATH || '').trim();
  if (envPath && fs.existsSync(envPath)) return envPath;

  // Playwright's own resolved path (works when the matching build is installed).
  try {
    const pw = require('playwright');
    const p = pw?.chromium?.executablePath?.();
    if (p && fs.existsSync(p)) return p;
  } catch { /* ignore */ }

  // Scan the browsers cache for any installed chromium build (any version).
  const base = (process.env.PLAYWRIGHT_BROWSERS_PATH || '').trim();
  if (base && fs.existsSync(base)) {
    try {
      const dirs = fs.readdirSync(base).filter((d) => /^chromium(-|_)/.test(d));
      for (const d of dirs) {
        const candidates = [
          path.join(base, d, 'chrome-linux', 'chrome'),
          path.join(base, d, 'chrome-linux', 'headless_shell'),
          path.join(base, d, 'chrome-win', 'chrome.exe'),
          path.join(base, d, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
        ];
        for (const c of candidates) { if (fs.existsSync(c)) return c; }
      }
    } catch { /* ignore */ }
  }
  return undefined;
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

  const opts: LaunchOptions = { headless, args };
  const exe = findChromiumExecutable();
  if (exe) opts.executablePath = exe;
  return opts;
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
  const { BinaryService } = require('../services/BinaryService');

  /* MODIFIED: Logging and Fallback */
  let wsEndpoint = process.env.BROWSER_WS_ENDPOINT || '';

  if (process.env.BROWSER_DEBUG_LOG === 'true') {
    try {
      const logPath = path.join(__dirname, '../stream_debug.log');
      fs.appendFileSync(logPath, `[createSession] Env WS: '${wsEndpoint}'\n`);
    } catch { }
  }

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
        if (process.env.BROWSER_DEBUG_LOG === 'true') { try { fs.appendFileSync(path.join(__dirname, '../stream_debug.log'), `[createSession] Connected to ${wsEndpoint}\n`); } catch { } }
      } catch (e) {
        attempt++;
        if (attempt >= maxRetries) {
          if (process.env.BROWSER_DEBUG_LOG === 'true') { try { fs.appendFileSync(path.join(__dirname, '../stream_debug.log'), `[createSession] Failed to connect after ${maxRetries} attempts\n`); } catch { } }
          throw e; // Final failure
        }
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000); // Exponential backoff max 10s
        if (process.env.BROWSER_DEBUG_LOG === 'true') { try { fs.appendFileSync(path.join(__dirname, '../stream_debug.log'), `[createSession] Connection failed, retrying in ${delay}ms (Attempt ${attempt}/${maxRetries})\n`); } catch { } }
        await new Promise(r => setTimeout(r, delay));
      }
    }
  } else {
    try {
      browser = await chromium.launch(getChromiumLaunchOptions());
    } catch (e: any) {
      // The browser engine isn't installed / can't launch. Give an actionable hint
      // instead of a raw error so the user knows exactly how to fix it.
      throw new Error(
        `browser_launch_failed: ${e?.message || e}. ` +
        `تعذّر تشغيل متصفح Joe. شغّل هذا الأمر مرة واحدة داخل مجلد النظام: ` +
        `"npx playwright install chromium" ثم أعد التشغيل. ` +
        `(يمكن أيضاً ضبط BROWSER_EXECUTABLE_PATH على مسار Chrome/Chromium مثبّت لديك.)`
      );
    }
  }

  if (!browser) throw new Error('browser_connection_failed_after_retries');

  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ];
  const selectedUA = userAgents[Math.floor(Math.random() * userAgents.length)];

  // Restore this session's saved login state (per-user isolated, encrypted) so
  // the user stays logged in across tasks without re-entering credentials.
  const savedState = loadBrowserSessionState(sessionId);
  if (savedState) {
    try { console.log(`[BrowserManager] Restoring saved session for ${sessionId} (${savedState.cookies?.length || 0} cookies)`); } catch { }
  }

  const context = await browser.newContext({
    viewport: { width: viewport.w, height: viewport.h },
    locale: 'ar',
    userAgent: selectedUA,
    extraHTTPHeaders: {
      'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
    },
    ...(savedState ? { storageState: savedState } : {}),
  });

  // Apply Stealth
  try {
    const { stealth } = require('playwright-stealth');
    await stealth(context);
  } catch (e) {
    if (process.env.BROWSER_DEBUG_LOG === 'true') { try { fs.appendFileSync(path.join(__dirname, '../stream_debug.log'), `[createSession] Stealth plugin failed: ${String(e)}\n`); } catch { } }
  }

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
  if (!sid) return;
  void (async () => {
    let s = sessions.get(sid);
    if (!s) {
      try {
        s = await getBrowserSession(sid);
      } catch {
        return;
      }
    }
    if (!s || s.streaming) return;
    s.streaming = true;
    s.lastUsedAt = Date.now();
    try {
      broadcastStatus(sid, s, { workerStatus: 'idle' });
    } catch { }
    const cfg = DEFAULT_BROWSER_CONFIG;
    const intervalMs = Math.max(50, Math.floor(1000 / Math.max(1, cfg.streamFps)));
    s.streamTimer = setInterval(async () => {
      if (!s || !s.streaming) return;
      try {
        const buf = await captureJpeg(s, {
          quality: 55,
          timeoutMs: Math.max(1000, Math.min(8000, cfg.actionTimeoutMs)),
          waitForLock: false,
          mask: s.maskLocators.length ? s.maskLocators : undefined,
        });

        // Debug logging disabled in production to avoid excessive disk I/O
        // Enable via BROWSER_DEBUG_LOG=true for troubleshooting
        if (process.env.BROWSER_DEBUG_LOG === 'true') {
          try {
            const logPath = path.join(__dirname, '../stream_debug.log');
            const msg = `[${new Date().toISOString()}] SID=${sid} Streaming Loop. Buf? ${!!buf} Len=${buf?.length}\n`;
            fs.appendFileSync(logPath, msg);
          } catch { }
        }

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
  })();
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
  let browser: Browser | null = null;
  const wsEndpoint = process.env.BROWSER_WS_ENDPOINT;
  const apiKey = process.env.WORKER_API_KEY;

  try {
    if (wsEndpoint) {
      // Use connect logic for healthcheck
      browser = await chromium.connect(wsEndpoint, {
        headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : undefined
      });
    } else {
      // Fallback
      browser = await chromium.launch(getChromiumLaunchOptions());
    }

    const context = await browser.newContext({ viewport: { width: viewport.w, height: viewport.h } });
    try {
      const page = await context.newPage();
      const url = 'https://example.com';
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      const buf = await page.screenshot({ type: 'jpeg', quality: 65, animations: 'disabled' });

      // Save artifact if possible
      const artifactDir = process.env.ARTIFACT_DIR || '/tmp/joe-artifacts';
      try {
        if (!fs.existsSync(artifactDir)) fs.mkdirSync(artifactDir, { recursive: true });
        const fname = `health-browser-${Date.now()}.jpg`;
        const full = path.join(artifactDir, fname);
        fs.writeFileSync(full, buf);
        const href = `/artifacts/${encodeURIComponent(fname)}`;
        return { ok: true as const, ms: Date.now() - startedAt, url, screenshotHref: href };
      } catch {
        // If write fails, still return ok
        return { ok: true as const, ms: Date.now() - startedAt, url };
      }
    } finally {
      try { await context.close(); } catch { }
    }
  } catch (e: any) {
    throw e;
  } finally {
    try { await browser?.close(); } catch { }
  }
}
