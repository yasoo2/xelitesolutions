import { chromium, type Browser, type BrowserContext, type Page, type Locator } from 'playwright';
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
  viewport: { w: number; h: number };
};

const sessions = new Map<string, SessionState>();

async function createSession(sessionId: string) {
  const cfg = DEFAULT_BROWSER_CONFIG;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
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
    viewport: { w: 1280, h: 800 },
  };

  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame()) return;
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
          void page.goBack({ waitUntil: 'domcontentloaded' });
        } catch {}
      }
    } catch {}
  });

  return state;
}

export async function getBrowserSession(sessionId: string) {
  const sid = String(sessionId || '').trim();
  if (!sid) throw new Error('sessionId_required');
  const existing = sessions.get(sid);
  if (existing) return existing;
  const created = await createSession(sid);
  sessions.set(sid, created);
  return created;
}

export function setStreamMask(sessionId: string, maskLocators: Locator[]) {
  const sid = String(sessionId || '').trim();
  const s = sessions.get(sid);
  if (!s) return;
  s.maskLocators = Array.isArray(maskLocators) ? maskLocators : [];
}

export function startStreaming(sessionId: string) {
  const sid = String(sessionId || '').trim();
  const s = sessions.get(sid);
  if (!s) return;
  if (s.streaming) return;
  s.streaming = true;
  const cfg = DEFAULT_BROWSER_CONFIG;
  const intervalMs = Math.max(50, Math.floor(1000 / Math.max(1, cfg.streamFps)));
  s.streamTimer = setInterval(async () => {
    if (!s.streaming) return;
    try {
      const buf = await s.page.screenshot({
        type: 'jpeg',
        quality: 55,
        animations: 'disabled',
        mask: s.maskLocators.length ? s.maskLocators : undefined,
      });
      broadcastBrowserEvent(sid, {
        type: 'stream_frame',
        ts: Date.now(),
        jpegBase64: Buffer.from(buf).toString('base64'),
        w: s.viewport.w,
        h: s.viewport.h,
      });
    } catch {}
  }, intervalMs);
}

export async function stopSession(sessionId: string) {
  const sid = String(sessionId || '').trim();
  const s = sessions.get(sid);
  if (!s) return;
  sessions.delete(sid);
  s.streaming = false;
  if (s.streamTimer) {
    try { clearInterval(s.streamTimer); } catch {}
    s.streamTimer = null;
  }
  try { await s.context.close(); } catch {}
  try { await s.browser.close(); } catch {}
}

