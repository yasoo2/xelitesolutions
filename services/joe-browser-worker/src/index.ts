import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import { chromium, devices } from 'playwright';
import type { Browser, BrowserContext, ConsoleMessage, Download, Frame, Page, Request as PWRequest, Response as PWResponse } from 'playwright';
import dotenv from 'dotenv';
import pino from 'pino';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import mime from 'mime-types';

dotenv.config();
const logger = pino({
  transport: { target: 'pino-pretty', options: { translateTime: 'SYS:standard', colorize: true } }
});

type Session = {
  id: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  tabs: Array<{ id: string; page: Page; createdAt: number; title?: string; url?: string }>;
  activeTabId: string;
  siteKey?: string;
  taskLockEnabled: boolean;
  taskId?: string;
  viewport: { width: number; height: number };
  userAgent?: string;
  locale?: string;
  streamFps: number;
  streamQuality: number;
  redactionEnabled: boolean;
  textBoxes: {
    enabled: boolean;
    intervalMs: number;
    maxBoxes: number;
    includeText: boolean;
    timer?: NodeJS.Timeout | null;
  };
  createdAt: number;
  lastActiveAt: number;
  streamPauseUntil?: number;
  lastAutoShotAt?: number;
  downloads: Array<{ id: string; filename: string; href: string; size: number }>;
  logs: Array<{ level: string; text: string; ts: number }>;
  network: Array<{ stage: 'request' | 'response'; url: string; method: string; status?: number; resourceType?: string; ts: number }>;
  ws?: WebSocket;
};

const SESSIONS = new Map<string, Session>();
const TTL_MS = Number(process.env.SESSION_TTL_MS || 30 * 60 * 1000);
const API_KEY = process.env.WORKER_API_KEY || process.env.BROWSER_WORKER_KEY || 'change-me';
const STORAGE_DIR = process.env.WORKER_STORAGE_DIR || '/tmp/joe-browser-worker';
const PORT = Number(process.env.PORT || 7070);

logger.info({ cwd: process.cwd(), playwrightBrowsersPath: process.env.PLAYWRIGHT_BROWSERS_PATH || null }, 'worker_env');

let SHARED_BROWSER: Browser | null = null;
let browserHealthy = false;
let startupError: string | null = null;

async function getSharedBrowser() {
  if (SHARED_BROWSER && SHARED_BROWSER.isConnected()) return SHARED_BROWSER;
  console.log('Launching new shared browser instance...');
  SHARED_BROWSER = await launchChromium();
  return SHARED_BROWSER;
}

if (!fs.existsSync(STORAGE_DIR)) {
  try { fs.mkdirSync(STORAGE_DIR, { recursive: true }); } catch {}
}

function notifySession(session: Session, type: string, data: any) {
  if (session.ws && session.ws.readyState === WebSocket.OPEN) {
    session.ws.send(JSON.stringify({ type, ...data }));
  }
}

function auth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const key = req.headers['x-worker-key'] || req.query.key;
  if (String(key) !== API_KEY) return res.status(401).json({ error: 'unauthorized' });
  next();
}

async function launchChromium() {
  const args = ['--no-sandbox', '--disable-dev-shm-usage'];
  // Default to visible (headless: false) unless explicitly enabled (HEADLESS=true or HEADLESS=1)
  const headless = process.env.HEADLESS === 'true' || process.env.HEADLESS === '1';
  const channel = String(process.env.PLAYWRIGHT_CHANNEL || process.env.BROWSER_CHANNEL || '').trim();
  try {
    if (channel) return await chromium.launch({ args, headless, channel: channel as any });
  } catch {}
  try {
    return await chromium.launch({ args, headless, channel: 'chrome' as any });
  } catch {}
  return await chromium.launch({ args, headless });
}

function listTabs(session: Session) {
  return session.tabs.map(t => ({ id: t.id, title: t.title || '', url: t.url || t.page.url(), createdAt: t.createdAt }));
}

function notifyTabs(session: Session) {
  notifySession(session, 'tabs', { tabs: listTabs(session), activeTabId: session.activeTabId });
}

function siteKeyFromHost(host: string) {
  const h = String(host || '').toLowerCase().trim();
  if (!h) return '';
  return h.startsWith('www.') ? h.slice(4) : h;
}

function hostAllowedForSite(host: string, siteKey: string) {
  const h = siteKeyFromHost(host);
  const sk = siteKeyFromHost(siteKey);
  if (!h || !sk) return true;
  if (h === sk) return true;
  return h.endsWith(`.${sk}`);
}

function shouldAllowUrl(session: Session, rawUrl: string, opts?: { allowCrossSite?: boolean }) {
  const v = String(rawUrl || '').trim();
  if (!v) return { allowed: false, reason: 'empty_url' as const };
  let parsed: URL | null = null;
  try {
    parsed = new URL(v);
  } catch {
    return { allowed: true, url: v };
  }

  const proto = String(parsed.protocol || '').toLowerCase();
  if (proto === 'data:' || proto === 'about:' || proto === 'blob:') {
    return { allowed: true, url: parsed.toString() };
  }
  if (proto !== 'http:' && proto !== 'https:') {
    return { allowed: true, url: parsed.toString() };
  }

  const allowlist = (process.env.WORKER_ALLOWLIST || '').split(',').map((s: string) => s.trim()).filter(Boolean);
  if (allowlist.length && !allowlist.includes(parsed.hostname)) {
    return { allowed: false, reason: 'domain_not_allowed' as const, url: parsed.toString() };
  }

  const hostKey = siteKeyFromHost(parsed.hostname);
  if (opts?.allowCrossSite) {
    session.siteKey = hostKey;
    return { allowed: true, url: parsed.toString() };
  }
  if (!session.siteKey) {
    session.siteKey = hostKey;
    return { allowed: true, url: parsed.toString() };
  }
  if (!hostAllowedForSite(parsed.hostname, session.siteKey)) {
    return { allowed: false, reason: 'cross_site_blocked' as const, url: parsed.toString(), siteKey: session.siteKey };
  }
  return { allowed: true, url: parsed.toString() };
}

async function safeGoto(session: Session, page: Page, rawUrl: string, options: any, outputs: any[], meta?: any) {
  const allowCrossSite = Boolean(meta && meta.allowCrossSite);
  const verdict = shouldAllowUrl(session, rawUrl, { allowCrossSite });
  if (!verdict.allowed) {
    outputs.push({ type: 'goto_blocked', url: rawUrl, reason: verdict.reason, siteKey: verdict.siteKey });
    return false;
  }
  await page.goto(verdict.url || rawUrl, options);
  outputs.push({ type: 'goto', url: verdict.url || rawUrl });
  return true;
}

function setupPageHooks(session: Session, page: Page, tabId: string) {
  const findTab = () => session.tabs.find(t => t.id === tabId);

  page.route('**/*', async (route) => {
    try {
      const req = route.request();
      if (!req.isNavigationRequest()) return route.continue();
      const url = req.url();
      const verdict = shouldAllowUrl(session, url);
      if (!verdict.allowed) {
        notifySession(session, 'goto_blocked', { url, reason: verdict.reason, siteKey: verdict.siteKey, tabId });
        return route.abort();
      }
      return route.continue();
    } catch {
      try { return route.continue(); } catch {}
    }
  }).catch(() => {});

  page.on('framenavigated', (frame: Frame) => {
    try {
      if (frame === page.mainFrame()) {
        const t = findTab();
        if (t) t.url = frame.url();
        notifySession(session, 'url', { url: frame.url(), tabId });
        if (t) {
          page.title().then((title: string) => {
            const tt = findTab();
            if (!tt) return;
            tt.title = title;
            notifyTabs(session);
          }).catch(() => {});
        }
      }
    } catch {}
  });

  page.on('console', (msg: ConsoleMessage) => {
    try {
      const entry = { level: msg.type(), text: msg.text(), ts: Date.now() };
      session.logs.push(entry);
      if (session.logs.length > 500) session.logs.shift();
      notifySession(session, 'console', { entry, tabId });
    } catch {}
  });

  page.on('request', (req: PWRequest) => {
    try {
      const entry = {
        stage: 'request' as const,
        url: req.url(),
        method: req.method(),
        resourceType: req.resourceType(),
        ts: Date.now()
      };
      session.network.push(entry);
      if (session.network.length > 500) session.network.shift();
      notifySession(session, 'network', { entry, tabId });
    } catch {}
  });

  page.on('response', (resp: PWResponse) => {
    try {
      const req = resp.request();
      const entry = {
        stage: 'response' as const,
        url: resp.url(),
        method: req.method(),
        status: resp.status(),
        resourceType: req.resourceType(),
        ts: Date.now()
      };
      session.network.push(entry);
      if (session.network.length > 500) session.network.shift();
      notifySession(session, 'network', { entry, tabId });
    } catch {}
  });

  page.on('download', async (dl: Download) => {
    try {
      const safeName = dl.suggestedFilename();
      const fileId = uuidv4();
      const filePath = path.join(STORAGE_DIR, 'downloads', `${fileId}-${safeName}`);
      const dir = path.dirname(filePath);
      try {
        await fs.promises.mkdir(dir, { recursive: true });
      } catch {}

      await dl.saveAs(filePath);
      const stat = await fs.promises.stat(filePath);
      const size = stat.size;
      const href = `/downloads/${path.basename(filePath)}`;
      const download = { id: fileId, filename: safeName, href, size };
      session.downloads.push(download);
      if (session.downloads.length > 50) session.downloads.shift();
      notifySession(session, 'download', { download, tabId });
      logger.info({ fileId, safeName, size }, 'download_saved');
    } catch (e: any) {
      logger.error(e, 'download_failed');
    }
  });
}

async function createSession(opts: { viewport?: { width: number; height: number }, userAgent?: string, locale?: string, recordVideo?: boolean }) {
  const browser = await getSharedBrowser();
  const recordVideoEnabled = Boolean(opts.recordVideo);
  const contextOptions: any = {
    viewport: opts.viewport || { width: 1280, height: 800 },
    userAgent: opts.userAgent,
    locale: opts.locale || 'en-US',
    ignoreHTTPSErrors: true,
    acceptDownloads: true,
  };
  if (recordVideoEnabled) contextOptions.recordVideo = { dir: path.join(STORAGE_DIR, 'videos') };
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const id = uuidv4();
  const tabId = uuidv4();
  const streamFps = Math.max(1, Math.min(30, Number(process.env.STREAM_FPS || 5)));
  const streamQuality = Math.max(20, Math.min(90, Number(process.env.STREAM_QUALITY || 50)));
  const session: Session = {
    id, browser, context, page,
    tabs: [{ id: tabId, page, createdAt: Date.now(), url: page.url() }],
    activeTabId: tabId,
    viewport: opts.viewport || { width: 1280, height: 800 },
    userAgent: opts.userAgent,
    locale: opts.locale,
    taskLockEnabled: true,
    streamFps,
    streamQuality,
    redactionEnabled: true,
    textBoxes: {
      enabled: false,
      intervalMs: 900,
      maxBoxes: 350,
      includeText: false,
      timer: null,
    },
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    downloads: [],
    logs: [],
    network: []
  };
  setupPageHooks(session, page, tabId);
  SESSIONS.set(id, session);
  return session;
}

async function closeSession(id: string) {
  const s = SESSIONS.get(id);
  if (!s) return;
  try {
    if (s.textBoxes?.timer) clearInterval(s.textBoxes.timer);
  } catch {}
  try {
    s.textBoxes.timer = null;
    s.textBoxes.enabled = false;
  } catch {}
  for (const t of s.tabs) {
    try { await t.page.close(); } catch {}
  }
  try { await s.context.close(); } catch {}
  // Do not close the shared browser
  SESSIONS.delete(id);
}

// Action execution
type ActionMeta = {
  taskId?: string;
  newTask?: boolean;
  confidenceThreshold?: number;
  requireConfidence?: boolean;
};

type ActionCore =
  | { type: 'goto', url: string, waitUntil?: 'load' | 'domcontentloaded' | 'networkidle', allowCrossSite?: boolean }
  | { type: 'goBack' }
  | { type: 'goForward' }
  | { type: 'reload' }
  | { type: 'type', text: string, selector?: string, delay?: number, clear?: boolean, sensitive?: boolean }
  | { type: 'press', key: string }
  | { type: 'mouseMove', x: number, y: number, steps?: number }
  | { type: 'click', x?: number, y?: number, button?: 'left'|'right'|'middle', selector?: string, roleName?: string, role?: string, timeoutMs?: number, attempts?: number }
  | { type: 'clickText', text: string, exact?: boolean, timeoutMs?: number, attempts?: number }
  | { type: 'locate', selector?: string, roleName?: string, role?: string }
  | { type: 'waitForRole', role: string, roleName: string, timeoutMs?: number }
  | { type: 'waitForSelector', selector: string, timeoutMs?: number }
  | { type: 'scroll', deltaY: number }
  | { type: 'scrollTo', selector: string }
  | { type: 'wait', ms: number }
  | { type: 'waitForLoad', state: 'load'|'domcontentloaded'|'networkidle' }
  | { type: 'screenshot', fullPage?: boolean, quality?: number }
  | { type: 'snapshot.dom' }
  | { type: 'snapshot.a11y' }
  | { type: 'extract', schema: any, mode?: 'dom'|'a11y'|'hybrid' }
  | { type: 'fillForm', fields: Array<{ label?: string, selector?: string, value: any, kind?: 'text'|'select'|'checkbox'|'radio'|'date'|'file', sensitive?: boolean }>, sensitive?: boolean }
  | { type: 'fillByLabel', label: string, value: any, kind?: 'text'|'select'|'checkbox'|'radio'|'date', sensitive?: boolean }
  | { type: 'searchGoogle', query: string, lang?: string, sensitive?: boolean }
  | { type: 'uploadFile', selector: string, fileUrl: string }
  | { type: 'evaluate', script: string, sensitive?: boolean }
  | { type: 'tab.new', url?: string, waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }
  | { type: 'tab.switch', tabId: string }
  | { type: 'tab.close', tabId?: string }
  | { type: 'tabs.list' }
  | { type: 'pick', x: number, y: number }
  | { type: 'textBoxes.once', maxBoxes?: number, includeText?: boolean }
  | { type: 'textBoxes.start', intervalMs?: number, maxBoxes?: number, includeText?: boolean }
  | { type: 'textBoxes.stop' }
  | { type: 'stream.setFps', fps: number }
  | { type: 'stream.setQuality', quality: number }
  | { type: 'redaction.set', enabled: boolean }
  | { type: 'login.xelitesolutions', email: string, password: string, startUrl?: string }
  ;

type Action = ActionMeta & ActionCore;

type TextBox = { x: number; y: number; width: number; height: number; text?: string };

async function computeTextBoxes(session: Session, opts?: { maxBoxes?: number; includeText?: boolean }) {
  const maxBoxes = Math.max(1, Math.min(900, Number(opts?.maxBoxes ?? session.textBoxes.maxBoxes) || 350));
  const includeText = Boolean(opts?.includeText ?? session.textBoxes.includeText);
  const boxes: TextBox[] = await session.page.evaluate(({ maxBoxes, includeText }: { maxBoxes: number; includeText: boolean }) => {
    const out: Array<{ x: number; y: number; width: number; height: number; text?: string }> = [];
    const isHiddenEl = (el: Element | null) => {
      if (!el) return true;
      const style = window.getComputedStyle(el as any);
      return style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0';
    };
    const isBadParent = (el: Element | null) => {
      if (!el) return true;
      return Boolean((el as any).closest?.('script,style,noscript,svg,canvas,textarea,select,option'));
    };
    const inViewport = (r: DOMRect) => {
      if (!r || !Number.isFinite(r.left) || !Number.isFinite(r.top)) return false;
      if (r.width <= 0 || r.height <= 0) return false;
      const vw = window.innerWidth || 0;
      const vh = window.innerHeight || 0;
      if (!vw || !vh) return true;
      return r.right >= 0 && r.bottom >= 0 && r.left <= vw && r.top <= vh;
    };

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node: any) {
        try {
          const t = String((node as any).nodeValue || '');
          if (!t || !t.trim()) return NodeFilter.FILTER_REJECT;
          const parent = (node as any).parentElement as Element | null;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (isBadParent(parent)) return NodeFilter.FILTER_REJECT;
          if (isHiddenEl(parent)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        } catch {
          return NodeFilter.FILTER_REJECT;
        }
      }
    } as any);

    const range = document.createRange();
    while (out.length < maxBoxes) {
      const node = walker.nextNode();
      if (!node) break;
      const text = String((node as any).nodeValue || '');
      const tokens = text.match(/\S+/g) || [];
      let idx = 0;
      for (const tok of tokens) {
        if (out.length >= maxBoxes) break;
        const start = text.indexOf(tok, idx);
        if (start < 0) continue;
        const end = start + tok.length;
        idx = end;
        try {
          range.setStart(node, start);
          range.setEnd(node, end);
          const rects = Array.from(range.getClientRects());
          for (const rr of rects) {
            if (out.length >= maxBoxes) break;
            if (!inViewport(rr)) continue;
            if (rr.width > 1400 || rr.height > 400) continue;
            const item: any = { x: rr.left, y: rr.top, width: rr.width, height: rr.height };
            if (includeText) item.text = tok;
            out.push(item);
          }
        } catch {}
      }
    }
    try { range.detach(); } catch {}
    return out;
  }, { maxBoxes, includeText });
  return boxes;
}

async function pushTextBoxes(session: Session, reason: 'once' | 'interval' | 'start') {
  if (!session.ws || session.ws.readyState !== WebSocket.OPEN) return;
  const boxes = await computeTextBoxes(session).catch(() => [] as TextBox[]);
  notifySession(session, 'text_boxes', { boxes, ts: Date.now(), reason });
  return boxes;
}

function startTextBoxes(session: Session, opts?: { intervalMs?: number; maxBoxes?: number; includeText?: boolean }) {
  const intervalMs = Math.max(200, Math.min(5000, Number(opts?.intervalMs ?? session.textBoxes.intervalMs) || 900));
  const maxBoxes = Math.max(1, Math.min(900, Number(opts?.maxBoxes ?? session.textBoxes.maxBoxes) || 350));
  const includeText = Boolean(opts?.includeText ?? session.textBoxes.includeText);
  try {
    if (session.textBoxes.timer) clearInterval(session.textBoxes.timer);
  } catch {}
  session.textBoxes.enabled = true;
  session.textBoxes.intervalMs = intervalMs;
  session.textBoxes.maxBoxes = maxBoxes;
  session.textBoxes.includeText = includeText;
  session.textBoxes.timer = setInterval(() => {
    if (!session.textBoxes.enabled) return;
    void pushTextBoxes(session, 'interval');
  }, intervalMs);
  void pushTextBoxes(session, 'start');
}

function stopTextBoxes(session: Session) {
  session.textBoxes.enabled = false;
  try {
    if (session.textBoxes.timer) clearInterval(session.textBoxes.timer);
  } catch {}
  session.textBoxes.timer = null;
  try {
    notifySession(session, 'text_boxes', { boxes: [], ts: Date.now(), reason: 'stop' });
  } catch {}
}

function sanitizeAction(session: Session, a: Action) {
  if (!session.redactionEnabled) return a as any;
  if (a.type === 'type') {
    return { ...a, text: `[redacted:${a.text.length}]` } as any;
  }
  if (a.type === 'login.xelitesolutions') {
    const pw = (a as any).password == null ? '' : String((a as any).password);
    return { ...(a as any), password: `[redacted:${pw.length}]` } as any;
  }
  if (a.type === 'searchGoogle' && a.sensitive) {
    const q = a.query == null ? '' : String(a.query);
    return { ...a, query: `[redacted:${q.length}]` } as any;
  }
  if (a.type === 'fillForm') {
    const fields = a.fields.map(f => {
      const should = a.sensitive || f.sensitive;
      if (!should) return f;
      const v = f.value == null ? '' : String(f.value);
      return { ...f, value: `[redacted:${v.length}]` };
    });
    return { ...a, fields } as any;
  }
  if (a.type === 'fillByLabel' && a.sensitive) {
    const v = a.value == null ? '' : String(a.value);
    return { ...a, value: `[redacted:${v.length}]` } as any;
  }
  if (a.type === 'evaluate' && a.sensitive) return { ...a, script: '[redacted]' } as any;
  return a as any;
}

function switchToTab(session: Session, tabId: string) {
  const t = session.tabs.find(x => x.id === tabId);
  if (!t) return false;
  session.activeTabId = t.id;
  session.page = t.page;
  notifyTabs(session);
  notifySession(session, 'url', { url: t.url || t.page.url(), tabId: t.id });
  return true;
}

async function captureScreenshot(session: Session, opts?: { fullPage?: boolean; quality?: number }) {
  const buf = await session.page.screenshot({
    type: 'jpeg',
    quality: opts?.quality || 60,
    fullPage: opts?.fullPage || false,
    timeout: 15000,
    caret: 'hide',
    animations: 'disabled',
  });
  const name = `s-${Date.now()}.jpg`;
  const p = path.join(STORAGE_DIR, 'shots', name);
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, buf);
  const href = `/shots/${name}`;
  notifySession(session, 'screenshot', { href });
  return href;
}

async function maybeNotifyCursorForLocator(session: Session, locator: any) {
  try {
    await locator?.scrollIntoViewIfNeeded?.({ timeout: 1500 });
  } catch {}

  const box =
    (await locator?.boundingBox?.({ timeout: 1500 }).catch(() => null)) ||
    (await locator?.elementHandle?.().then((h: any) => h?.boundingBox?.()).catch(() => null));
  if (!box) return null;
  notifySession(session, 'highlight', { boundingBox: box });
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await session.page.mouse.move(x, y, { steps: 2 }).catch(() => {});
  notifySession(session, 'cursor_move', { x, y });
  await new Promise(r => setTimeout(r, 250));
  return { x, y, box };
}

async function clickLocatorWithCursor(session: Session, locator: any, options?: any) {
  const pt = await maybeNotifyCursorForLocator(session, locator);
  if (pt) notifySession(session, 'cursor_click', { x: pt.x, y: pt.y });
  await locator.click(options);
  return pt;
}

async function captureDebugShot(session: Session, meta: { stage: string; actionType: string; selector?: string; text?: string; role?: string; roleName?: string }, outputs: any[]) {
  try {
    const href = await captureScreenshot(session, { quality: 55, fullPage: false });
    outputs.push({
      type: 'screenshot',
      href,
      auto: true,
      stage: meta.stage,
      actionType: meta.actionType,
      selector: meta.selector,
      text: meta.text,
      role: meta.role,
      roleName: meta.roleName,
      url: session.page.url(),
      tabId: session.activeTabId,
    });
    return href;
  } catch (e: any) {
    outputs.push({
      type: 'debug',
      stage: meta.stage,
      actionType: meta.actionType,
      event: 'screenshot_failed',
      message: String(e?.message || e),
      url: session.page.url(),
      tabId: session.activeTabId,
    });
    return null;
  }
}

async function tryDismissOverlays(session: Session) {
  try { await session.page.keyboard.press('Escape'); } catch {}
  const selectors = [
    '#onetrust-accept-btn-handler',
    'button:has-text("Accept")',
    'button:has-text("Accept all")',
    'button:has-text("I agree")',
    'button:has-text("Agree")',
    'button:has-text("Got it")',
    'button:has-text("Close")',
    'button[aria-label="Close"]',
    'button[aria-label="close"]',
    '[role="dialog"] button[aria-label="Close"]',
    '[role="dialog"] button:has-text("Close")',
  ];
  for (const sel of selectors) {
    try {
      const loc = session.page.locator(sel).first();
      const c = await loc.count().catch(() => 0);
      if (c > 0) {
        await loc.click({ timeout: 900 }).catch(() => null);
      }
    } catch {}
  }
}

async function clickLocatorRobust(session: Session, locator: any, opts: { timeoutMs: number; attempts: number }, outputs: any[], meta: any) {
  let lastErr: any = null;
  for (let i = 0; i < opts.attempts; i++) {
    try {
      await locator.waitFor({ state: 'visible', timeout: Math.max(1000, Math.min(opts.timeoutMs, 12000)) });
    } catch (e) {
      lastErr = e;
    }

    try {
      await locator.scrollIntoViewIfNeeded({ timeout: 2500 }).catch(() => null);
    } catch {}

    try {
      await clickLocatorWithCursor(session, locator, { timeout: opts.timeoutMs });
      return { ok: true, attempt: i + 1, method: 'cursor.click' };
    } catch (e: any) {
      lastErr = e;
    }

    const cov = await getElementCoverage(locator);
    if (cov?.covered) {
      outputs.push({
        type: 'debug',
        event: 'overlay_blocking_click',
        attempt: i + 1,
        blocker: cov.blocker,
        url: session.page.url(),
        tabId: session.activeTabId,
        ...meta,
      });
    }

    try {
      await tryDismissOverlays(session);
    } catch {}

    try {
      await clickLocatorWithCursor(session, locator, { timeout: 2500 });
      return { ok: true, attempt: i + 1, method: 'cursor.click.after_overlay' };
    } catch (e: any) {
      lastErr = e;
    }

    try {
      await locator.evaluate((el: any) => {
        try {
          if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center', inline: 'center' });
        } catch {}
        try {
          if (el && typeof el.click === 'function') el.click();
        } catch {}
      });
      return { ok: true, attempt: i + 1, method: 'dom.click' };
    } catch (e: any) {
      lastErr = e;
    }

    outputs.push({
      type: 'debug',
      event: 'click_retry',
      attempt: i + 1,
      message: String(lastErr?.message || lastErr || ''),
      url: session.page.url(),
      tabId: session.activeTabId,
      ...meta,
    });
    await new Promise(r => setTimeout(r, 200 + i * 250));
  }

  const msg = String(lastErr?.message || lastErr || 'click_failed');
  throw new ActionFailure('click_failed', { message: msg }, msg);
}

async function findClickableInFrames(session: Session, finder: (ctx: any) => any, maxFrames = 12) {
  const frames = session.page.frames();
  const main = session.page.mainFrame();
  const rest = frames.filter((f: any) => f !== main).slice(0, Math.max(0, maxFrames - 1));
  const ordered = [main, ...rest];
  for (const frame of ordered) {
    try {
      const loc = finder(frame);
      const c = await loc.count().catch(() => 0);
      if (c > 0) return { locator: loc.first(), frameUrl: frame.url() };
    } catch {}
  }
  return { locator: null, frameUrl: '' };
}

async function tryAcceptGoogleConsent(session: Session, outputs?: any[]) {
  const selectors = [
    '#L2AGLb',
    'button[aria-label*="Agree"]',
    'text=I agree',
    'text=Agree',
    'text=Accept all',
    'text=Accept',
    'text=أوافق',
    'text=قبول الكل',
    'text=موافق'
  ];

  for (const sel of selectors) {
    const loc = session.page.locator(sel);
    const c = await loc.count().catch(() => 0);
    if (c > 0) {
      await loc.first().click({ timeout: 1000 }).catch(() => null);
      if (outputs) outputs.push({ type: 'cookie_consent_click', selector: sel });
      break;
    }
  }
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function collectClickableCandidates(session: Session, max = 25) {
  const n = Math.max(1, Math.min(100, Number(max || 25) || 25));
  try {
    const res = await session.page.evaluate((limit: number) => {
      function isVisible(el: Element) {
        const r = (el as HTMLElement).getBoundingClientRect?.();
        if (!r || r.width < 2 || r.height < 2) return false;
        const s = window.getComputedStyle(el as HTMLElement);
        if (!s || s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity || '1') === 0) return false;
        if (r.bottom < 0 || r.right < 0 || r.top > (window.innerHeight || 0) || r.left > (window.innerWidth || 0)) return false;
        return true;
      }

      function norm(t: string) {
        return String(t || '').replace(/\s+/g, ' ').trim();
      }

      const sel = [
        'button',
        'a',
        '[role="button"]',
        'input[type="button"]',
        'input[type="submit"]',
        '[onclick]',
      ].join(',');
      const els = Array.from(document.querySelectorAll(sel)).slice(0, 400);
      const out: Array<{ text: string; ariaLabel?: string; role?: string; tag: string }> = [];
      const seen = new Set<string>();

      for (const el of els) {
        if (!isVisible(el)) continue;
        const tag = (el as HTMLElement).tagName.toLowerCase();
        const text = norm((el as HTMLElement).innerText || (el as HTMLElement).textContent || '');
        const ariaLabel = norm((el as HTMLElement).getAttribute('aria-label') || '');
        const role = norm((el as HTMLElement).getAttribute('role') || '');
        const key = `${tag}|${role}|${ariaLabel || ''}|${text || ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!text && !ariaLabel) continue;
        out.push({ text, ariaLabel: ariaLabel || undefined, role: role || undefined, tag });
        if (out.length >= limit) break;
      }

      return out;
    }, n);
    return Array.isArray(res) ? res : [];
  } catch {
    return [];
  }
}

class ActionFailure extends Error {
  reason: string;
  detail: any;
  constructor(reason: string, detail?: any, message?: string) {
    super(message || reason);
    this.reason = reason;
    this.detail = detail;
  }
}

function normText(v: any) {
  return String(v || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function tokenizeNeedle(s: string) {
  const t = normText(s);
  if (!t) return [];
  return t.split(/[\s/|,;:.()\[\]{}"'+=_-]+/g).map(x => x.trim()).filter(Boolean).slice(0, 12);
}

function tokenPresenceScore(tokens: string[], haystack: string) {
  if (!tokens.length) return 0;
  const h = normText(haystack);
  if (!h) return 0;
  let hit = 0;
  for (const tok of tokens) {
    if (tok && h.includes(tok)) hit += 1;
  }
  return hit / Math.max(1, tokens.length);
}

async function smoothScrollBy(session: Session, dy: number, steps = 6) {
  const n = Math.max(1, Math.min(14, Math.floor(steps)));
  const step = dy / n;
  for (let i = 0; i < n; i++) {
    await session.page.evaluate((v: number) => window.scrollBy(0, v), step).catch(() => null);
    await new Promise(r => setTimeout(r, 120));
  }
}

async function getElementCoverage(locator: any) {
  try {
    const h = await locator.elementHandle().catch(() => null);
    if (!h) return { ok: false, covered: false, blocker: null };
    const res = await h.evaluate((el: any) => {
      try {
        const r = el.getBoundingClientRect?.();
        if (!r || r.width < 2 || r.height < 2) return { ok: false, covered: false, blocker: null };
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const top = document.elementFromPoint(cx, cy) as any;
        const covered = Boolean(top && top !== el && !(el.contains && el.contains(top)));
        if (!covered) return { ok: true, covered: false, blocker: null };
        const txt = String(top?.innerText || top?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120);
        const ariaLabel = String(top?.getAttribute?.('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 120);
        const role = String(top?.getAttribute?.('role') || '').trim().slice(0, 60);
        const s = top && top.nodeType === 1 ? window.getComputedStyle(top) : null;
        const pos = s ? String(s.position || '') : '';
        const z = s ? String(s.zIndex || '') : '';
        return {
          ok: true,
          covered: true,
          blocker: {
            tag: String(top?.tagName || '').toLowerCase(),
            id: String(top?.id || ''),
            className: String(top?.className || '').slice(0, 160),
            text: txt || undefined,
            ariaLabel: ariaLabel || undefined,
            role: role || undefined,
            position: pos || undefined,
            zIndex: z || undefined,
          }
        };
      } catch {
        return { ok: false, covered: false, blocker: null };
      }
    });
    return res || { ok: false, covered: false, blocker: null };
  } catch {
    return { ok: false, covered: false, blocker: null };
  }
}

async function computeTargetConfidence(session: Session, locator: any, expectedText: string) {
  const tokens = tokenizeNeedle(expectedText);
  try {
    const h = await locator.elementHandle().catch(() => null);
    if (!h) return { score: 0, tokens, diag: { elementHandle: false } };
    const diag = await h.evaluate((el: any, tokens: string[]) => {
      const safe = (v: any) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, 200);
      const out: any = { elementHandle: true };
      try {
        const r = el.getBoundingClientRect?.();
        out.box = r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
        const s = window.getComputedStyle(el);
        out.visible = Boolean(r && r.width > 1 && r.height > 1 && s && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity || '1') > 0);
        out.enabled = !Boolean((el as any).disabled);
        const vw = window.innerWidth || 0;
        const vh = window.innerHeight || 0;
        out.inViewport = Boolean(r && (!vw || !vh || (r.bottom >= 0 && r.right >= 0 && r.left <= vw && r.top <= vh)));
        const cx = r ? (r.left + r.width / 2) : 0;
        const cy = r ? (r.top + r.height / 2) : 0;
        const top = (r && r.width > 1 && r.height > 1) ? (document.elementFromPoint(cx, cy) as any) : null;
        out.covered = Boolean(top && top !== el && !(el.contains && el.contains(top)));
        if (out.covered) {
          out.blocker = {
            tag: String(top?.tagName || '').toLowerCase(),
            id: String(top?.id || ''),
            className: safe(top?.className || ''),
            text: safe(top?.innerText || top?.textContent || ''),
            ariaLabel: safe(top?.getAttribute?.('aria-label') || ''),
            role: safe(top?.getAttribute?.('role') || ''),
          };
        }
        const texts: string[] = [];
        texts.push(safe(el?.innerText || ''));
        texts.push(safe(el?.textContent || ''));
        texts.push(safe(el?.getAttribute?.('aria-label') || ''));
        texts.push(safe(el?.getAttribute?.('placeholder') || ''));
        out.textHaystack = texts.filter(Boolean).join(' | ');
        let labelHay = '';
        try {
          const labs = (el as any).labels ? Array.from((el as any).labels as any) : [];
          labelHay = labs.map((x: any) => safe(x?.innerText || x?.textContent || '')).filter(Boolean).join(' | ');
        } catch {}
        try {
          const ids = safe(el?.getAttribute?.('aria-labelledby') || '');
          if (ids) {
            const parts = ids.split(/\s+/g).filter(Boolean);
            const extra = parts.map((id: string) => document.getElementById(id)).filter(Boolean).map((n: any) => safe(n?.innerText || n?.textContent || '')).filter(Boolean).join(' | ');
            if (extra) labelHay = labelHay ? `${labelHay} | ${extra}` : extra;
          }
        } catch {}
        out.labelHaystack = labelHay || '';
      } catch {
        out.visible = false;
        out.enabled = true;
        out.inViewport = false;
        out.covered = false;
      }
      return out;
    }, tokens);

    const textScore = tokenPresenceScore(tokens, String(diag?.textHaystack || ''));
    const labelScore = tokenPresenceScore(tokens, String(diag?.labelHaystack || ''));
    const stateScore =
      (diag?.visible ? 0.28 : 0) +
      (diag?.enabled ? 0.10 : 0) +
      (diag?.inViewport ? 0.16 : 0) +
      (!diag?.covered ? 0.20 : 0);
    const matchScore =
      (!tokens.length ? 0.18 : 0) +
      (textScore >= 0.6 ? 0.24 : textScore >= 0.3 ? 0.14 : 0) +
      (labelScore >= 0.6 ? 0.22 : labelScore >= 0.3 ? 0.12 : 0);
    const score = Math.max(0, Math.min(1, stateScore + matchScore));
    return { score, tokens, diag: { ...diag, textScore, labelScore } };
  } catch (e: any) {
    return { score: 0, tokens, diag: { error: String(e?.message || e) } };
  }
}

function actionConfidenceThreshold(a: any) {
  const raw = a && typeof a.confidenceThreshold === 'number' ? a.confidenceThreshold : undefined;
  const env = Number(process.env.WORKER_CONFIDENCE_THRESHOLD || 0.75);
  const v = typeof raw === 'number' && Number.isFinite(raw) ? raw : env;
  return Math.max(0.05, Math.min(0.98, v));
}

function shouldRequireConfidence(a: any) {
  if (a && typeof a.requireConfidence === 'boolean') return a.requireConfidence;
  if (!a || typeof a.type !== 'string') return false;
  if (a.type === 'click' || a.type === 'clickText') return true;
  if (a.type === 'type' && typeof a.selector === 'string' && a.selector.trim()) return true;
  if (a.type === 'fillByLabel' || a.type === 'fillForm') return true;
  return false;
}

function applyTaskLock(session: Session, a: any) {
  if (!session.taskLockEnabled) return;
  const taskId = typeof a?.taskId === 'string' ? a.taskId.trim() : '';
  const newTask = Boolean(a?.newTask);
  if (newTask) {
    session.taskId = taskId || uuidv4();
    notifySession(session, 'task', { taskId: session.taskId, locked: true });
    return;
  }
  if (!session.taskId && taskId) {
    session.taskId = taskId;
    notifySession(session, 'task', { taskId: session.taskId, locked: true });
    return;
  }
  if (session.taskId && taskId && taskId !== session.taskId) {
    throw new ActionFailure('task_locked', { sessionTaskId: session.taskId, actionTaskId: taskId });
  }
}

async function runActions(session: Session, actions: Action[]) {
  const outputs: any[] = [];
  const autoScreenshotsEnabled = process.env.WORKER_AUTO_SCREENSHOT !== '0' && process.env.WORKER_AUTO_SCREENSHOT !== 'false';

  for (const a of actions) {
    const outputsStart = outputs.length;
    const now = Date.now();
    session.lastActiveAt = now;
    session.streamPauseUntil = now + 150;
    notifySession(session, 'action_start', { action: sanitizeAction(session, a) });
    try {
      applyTaskLock(session, a);
      switch (a.type) {
        case 'goto': {
          const did = await safeGoto(
            session,
            session.page,
            a.url,
            { waitUntil: a.waitUntil || 'load' },
            outputs,
            { allowCrossSite: Boolean((a as any).allowCrossSite) }
          );
          if (!did) break;
          try {
            const u = new URL(a.url);
            if (/(^|\.)google\./i.test(u.hostname)) {
              await tryAcceptGoogleConsent(session, outputs);
            }
          } catch {}
          break;
        }
        case 'goBack': {
          await session.page.goBack();
          outputs.push({ type: 'goBack' });
          break;
        }
        case 'goForward': {
          await session.page.goForward();
          outputs.push({ type: 'goForward' });
          break;
        }
        case 'reload': {
          await session.page.reload();
          outputs.push({ type: 'reload' });
          break;
        }
        case 'type': {
          const raw = String(a.text ?? '');
          const selector = typeof (a as any).selector === 'string' ? String((a as any).selector) : '';
          const wantsSelector = Boolean(selector && selector.trim());
          const shouldShot = wantsSelector || raw.length > 3;
          if (shouldShot) await captureDebugShot(session, { stage: 'before_type', actionType: 'type', selector: selector || undefined }, outputs);

          if (wantsSelector) {
            const found = await findClickableInFrames(session, (ctx) => ctx.locator(selector), 16);
            if (!found.locator) throw new ActionFailure('element_not_found', { selector, kind: 'type' }, 'selector_not_found');
            const threshold = actionConfidenceThreshold(a);
            if (shouldRequireConfidence(a)) {
              const conf = await computeTargetConfidence(session, found.locator, '');
              if (conf.score < threshold) {
                await tryDismissOverlays(session).catch(() => null);
                await found.locator.scrollIntoViewIfNeeded({ timeout: 2500 }).catch(() => null);
                const conf2 = await computeTargetConfidence(session, found.locator, '');
                if (conf2.score < threshold) {
                  throw new ActionFailure('confidence_too_low', { threshold, confidence: conf2, selector }, 'confidence_too_low');
                }
              }
            }
            await clickLocatorWithCursor(session, found.locator, { timeout: 6000 });
            await new Promise(r => setTimeout(r, 140));
            if (Boolean((a as any).clear)) {
              await session.page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A').catch(() => null);
              await session.page.keyboard.press('Backspace').catch(() => null);
              await new Promise(r => setTimeout(r, 120));
            }
          }

          await session.page.keyboard.type(raw, { delay: a.delay || 20 });

          let verified: boolean | null = null;
          if (wantsSelector) {
            try {
              const vLen = await session.page.locator(selector).first().evaluate((el: any) => {
                try {
                  const v = (el && 'value' in el) ? String((el as any).value || '') : '';
                  return v.length;
                } catch {
                  return null;
                }
              });
              verified = typeof vLen === 'number' ? (vLen >= raw.length) : null;
            } catch {
              verified = null;
            }
          }

          outputs.push({ type: 'type', len: raw.length, selector: wantsSelector ? selector : undefined, verified });
          if (shouldShot) await captureDebugShot(session, { stage: 'after_type', actionType: 'type', selector: selector || undefined }, outputs);
          break;
        }
        case 'press': {
          await session.page.keyboard.press(a.key);
          outputs.push({ type: 'press', key: a.key });
          break;
        }
        case 'mouseMove': {
          await session.page.mouse.move(a.x, a.y, { steps: a.steps || 1 });
          notifySession(session, 'cursor_move', { x: a.x, y: a.y });
          outputs.push({ type: 'mouseMove', x: a.x, y: a.y });
          break;
        }
        case 'click': {
          const meta = {
            selector: a.selector,
            role: a.role,
            roleName: a.roleName,
          };
          await captureDebugShot(session, { stage: 'before_click', actionType: 'click', selector: a.selector, role: a.role, roleName: a.roleName }, outputs);
          let used = '';
          let frameUrl = '';
          let confidence: any = null;
          const timeoutMsRaw = typeof a.timeoutMs === 'number' && Number.isFinite(a.timeoutMs) ? a.timeoutMs : 8000;
          const attemptsRaw = typeof a.attempts === 'number' && Number.isFinite(a.attempts) ? a.attempts : 3;
          const timeoutMs = Math.max(2000, Math.min(20000, Math.floor(timeoutMsRaw)));
          const attempts = Math.max(1, Math.min(6, Math.floor(attemptsRaw)));
          if (a.selector || a.roleName) {
            const strategies: Array<{ name: string; run: () => Promise<{ locator: any; frameUrl: string }> }> = [];
            if (a.selector) {
              strategies.push({ name: 'selector', run: async () => findClickableInFrames(session, (ctx) => ctx.locator(a.selector as string), 16) });
            }
            if (a.roleName && a.role) {
              strategies.push({ name: 'role', run: async () => findClickableInFrames(session, (ctx) => ctx.getByRole(a.role as any, { name: a.roleName as string }), 16) });
            }
            if (a.roleName && !a.role) {
              const n = a.roleName;
              strategies.push({ name: 'button_name', run: async () => findClickableInFrames(session, (ctx) => ctx.getByRole('button', { name: n as any }), 16) });
              strategies.push({ name: 'link_name', run: async () => findClickableInFrames(session, (ctx) => ctx.getByRole('link', { name: n as any }), 16) });
              strategies.push({ name: 'text', run: async () => findClickableInFrames(session, (ctx) => ctx.getByText(n as any), 16) });
            }

            let found: any = null;
            for (const s of strategies) {
              const res = await s.run().catch(() => ({ locator: null, frameUrl: '' }));
              if (res?.locator) { found = res; break; }
            }
            if (!found?.locator) throw new ActionFailure('element_not_found', { selector: a.selector, role: a.role, roleName: a.roleName }, 'element_not_found');
            frameUrl = found.frameUrl;

            if (shouldRequireConfidence(a)) {
              const threshold = actionConfidenceThreshold(a);
              const expectedText = String(a.roleName || '');
              let conf = await computeTargetConfidence(session, found.locator, expectedText);
              outputs.push({ type: 'debug', event: 'confidence', actionType: 'click', score: conf.score, threshold, expectedText, diag: conf.diag, url: session.page.url(), tabId: session.activeTabId, ...meta });
              if (conf.score < threshold) {
                await tryDismissOverlays(session).catch(() => null);
                if (!conf?.diag?.inViewport) {
                  await smoothScrollBy(session, Math.round((session.viewport?.height || 800) * 0.7), 8).catch(() => null);
                }
                await found.locator.scrollIntoViewIfNeeded({ timeout: 2500 }).catch(() => null);
                conf = await computeTargetConfidence(session, found.locator, expectedText);
                outputs.push({ type: 'debug', event: 'confidence', actionType: 'click', score: conf.score, threshold, expectedText, diag: conf.diag, url: session.page.url(), tabId: session.activeTabId, ...meta, retry: true });
                if (conf.score < threshold) throw new ActionFailure('confidence_too_low', { threshold, confidence: conf, expectedText, ...meta });
              }
              confidence = { score: conf.score, threshold, tokens: conf.tokens, diag: conf.diag };
            }

            const res = await clickLocatorRobust(session, found.locator, { timeoutMs, attempts }, outputs, meta);
            used = res.method;
          } else if (typeof a.x === 'number' && typeof a.y === 'number') {
            await session.page.mouse.move(a.x, a.y, { steps: 2 }).catch(() => {});
            notifySession(session, 'cursor_move', { x: a.x, y: a.y });
            notifySession(session, 'highlight', { boundingBox: { x: a.x - 10, y: a.y - 10, width: 20, height: 20 } });
            await new Promise(r => setTimeout(r, 120));
            await session.page.mouse.click(a.x, a.y, { button: a.button || 'left' });
            notifySession(session, 'cursor_click', { x: a.x, y: a.y });
            used = 'mouse.click';
          }
          outputs.push({ type: 'click', used, frameUrl, confidence, url: session.page.url(), tabId: session.activeTabId, ...meta });
          await captureDebugShot(session, { stage: 'after_click', actionType: 'click', selector: a.selector, role: a.role, roleName: a.roleName }, outputs);
          break;
        }
        case 'clickText': {
          const meta = { text: a.text, exact: Boolean(a.exact) };
          await captureDebugShot(session, { stage: 'before_click', actionType: 'clickText', text: a.text }, outputs);
          const needle = String(a.text ?? '').trim();
          if (!needle) throw new ActionFailure('element_not_found', { text: needle, exact: Boolean(a.exact) }, 'text_not_found');
          const rx = a.exact ? new RegExp(`^\\s*${escapeRegExp(needle)}\\s*$`, 'i') : new RegExp(escapeRegExp(needle), 'i');

          const candidates = await collectClickableCandidates(session, 25);
          if (candidates.length) {
            outputs.push({
              type: 'debug',
              event: 'clickText_candidates',
              text: needle,
              exact: Boolean(a.exact),
              candidates: candidates.slice(0, 25),
              url: session.page.url(),
              tabId: session.activeTabId,
            });
          }

          const disambiguation = await session.page.evaluate(({ needle, exact }: { needle: string; exact: boolean }) => {
            function norm(t: string) { return String(t || '').replace(/\s+/g, ' ').trim(); }
            function isVisible(el: Element) {
              const r = (el as HTMLElement).getBoundingClientRect?.();
              if (!r || r.width < 2 || r.height < 2) return false;
              const s = window.getComputedStyle(el as HTMLElement);
              if (!s || s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity || '1') === 0) return false;
              if (r.bottom < 0 || r.right < 0 || r.top > (window.innerHeight || 0) || r.left > (window.innerWidth || 0)) return false;
              return true;
            }
            function cssPath(el: Element) {
              const id = (el as HTMLElement).id;
              if (id) return `#${CSS.escape(id)}`;
              const parts: string[] = [];
              let cur: Element | null = el;
              while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
                const tag = cur.tagName.toLowerCase();
                let part = tag;
                const parent = cur.parentElement as Element | null;
                if (parent) {
                  const siblings = Array.from(parent.children as any as Element[]).filter((c: any) => (c as Element).tagName === (cur as Element).tagName);
                  if (siblings.length > 1) {
                    const index = siblings.indexOf(cur as any) + 1;
                    part = `${tag}:nth-of-type(${index})`;
                  }
                }
                parts.unshift(part);
                cur = parent;
              }
              return parts.join(' > ');
            }
            const nNeedle = norm(needle).toLowerCase();
            const sel = 'button,a,[role="button"],input[type="button"],input[type="submit"]';
            const els = Array.from(document.querySelectorAll(sel)).slice(0, 500);
            const out: any[] = [];
            for (const el of els) {
              if (!isVisible(el)) continue;
              const text = norm((el as any).innerText || (el as any).textContent || (el as any).value || '');
              const ariaLabel = norm((el as any).getAttribute?.('aria-label') || '');
              const hay = (text || ariaLabel).toLowerCase();
              if (!hay) continue;
              const ok = exact ? (hay === nNeedle) : hay.includes(nNeedle);
              if (!ok) continue;
              const r = (el as HTMLElement).getBoundingClientRect();
              out.push({
                text: text || undefined,
                ariaLabel: ariaLabel || undefined,
                tag: (el as HTMLElement).tagName.toLowerCase(),
                role: norm((el as any).getAttribute?.('role') || '') || undefined,
                selector: cssPath(el),
                boundingBox: { x: r.x, y: r.y, width: r.width, height: r.height },
              });
              if (out.length >= 4) break;
            }
            return out;
          }, { needle, exact: Boolean(a.exact) }).catch(() => [] as any[]);

          if (Array.isArray(disambiguation) && disambiguation.length > 1) {
            throw new ActionFailure('need_user_disambiguation', { text: needle, exact: Boolean(a.exact), candidates: disambiguation });
          }

          let found: any = { locator: null, frameUrl: '' };
          for (let s = 0; s < 3; s++) {
            found = await findClickableInFrames(session, (ctx) => ctx.getByRole('button', { name: rx, exact: false }), 16);
            if (!found.locator) found = await findClickableInFrames(session, (ctx) => ctx.getByRole('link', { name: rx, exact: false }), 16);
            if (!found.locator) found = await findClickableInFrames(session, (ctx) => ctx.getByText(rx as any), 16);
            if (!found.locator) found = await findClickableInFrames(session, (ctx) => ctx.getByText(needle, { exact: a.exact ?? false }), 16);
            if (found.locator) break;
            await smoothScrollBy(session, Math.round((session.viewport?.height || 800) * 0.75), 9).catch(() => null);
          }
          if (!found.locator) throw new ActionFailure('element_not_found', { text: needle, exact: Boolean(a.exact) }, 'text_not_found');

          if (shouldRequireConfidence(a)) {
            const threshold = actionConfidenceThreshold(a);
            let conf = await computeTargetConfidence(session, found.locator, needle);
            outputs.push({ type: 'debug', event: 'confidence', actionType: 'clickText', score: conf.score, threshold, expectedText: needle, diag: conf.diag, url: session.page.url(), tabId: session.activeTabId, ...meta });
            if (conf.score < threshold) {
              await tryDismissOverlays(session).catch(() => null);
              await found.locator.scrollIntoViewIfNeeded({ timeout: 2500 }).catch(() => null);
              conf = await computeTargetConfidence(session, found.locator, needle);
              outputs.push({ type: 'debug', event: 'confidence', actionType: 'clickText', score: conf.score, threshold, expectedText: needle, diag: conf.diag, url: session.page.url(), tabId: session.activeTabId, ...meta, retry: true });
              if (conf.score < threshold) throw new ActionFailure('confidence_too_low', { threshold, confidence: conf, expectedText: needle, ...meta });
            }
          }
          const timeoutMsRaw = typeof a.timeoutMs === 'number' && Number.isFinite(a.timeoutMs) ? a.timeoutMs : 9000;
          const attemptsRaw = typeof a.attempts === 'number' && Number.isFinite(a.attempts) ? a.attempts : 3;
          const timeoutMs = Math.max(2000, Math.min(25000, Math.floor(timeoutMsRaw)));
          const attempts = Math.max(1, Math.min(6, Math.floor(attemptsRaw)));
          const res = await clickLocatorRobust(session, found.locator, { timeoutMs, attempts }, outputs, meta);
          outputs.push({ type: 'clickText', text: a.text, exact: Boolean(a.exact), used: res.method, frameUrl: found.frameUrl, url: session.page.url(), tabId: session.activeTabId });
          await captureDebugShot(session, { stage: 'after_click', actionType: 'clickText', text: a.text }, outputs);
          break;
        }
        case 'locate': {
          let box: any = null;
          if (a.selector) {
            const el = await session.page.$(a.selector);
            if (el) box = await el.boundingBox();
          } else if (a.roleName && a.role) {
            const locator = session.page.getByRole(a.role as any, { name: a.roleName });
            const el = await locator.elementHandle();
            if (el) box = await el.boundingBox();
          }
          if (box) notifySession(session, 'highlight', { boundingBox: box });
          outputs.push({ type: 'locate', boundingBox: box });
          break;
        }
        case 'waitForRole': {
          const locator = session.page.getByRole(a.role as any, { name: a.roleName });
          await locator.waitFor({ state: 'visible', timeout: a.timeoutMs || 8000 });
          outputs.push({ type: 'waitForRole', role: a.role, roleName: a.roleName });
          break;
        }
        case 'waitForSelector': {
          await session.page.waitForSelector(a.selector, { state: 'visible', timeout: a.timeoutMs || 8000 });
          outputs.push({ type: 'waitForSelector', selector: a.selector });
          break;
        }
        case 'scroll': {
          await session.page.evaluate((dy: number) => window.scrollBy(0, dy), a.deltaY);
          outputs.push({ type: 'scroll', deltaY: a.deltaY });
          break;
        }
        case 'scrollTo': {
          await session.page.evaluate((sel: string) => {
            const el = document.querySelector(sel);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, a.selector);
          outputs.push({ type: 'scrollTo', selector: a.selector });
          break;
        }
        case 'wait': {
          await new Promise(r => setTimeout(r, a.ms));
          outputs.push({ type: 'wait', ms: a.ms });
          break;
        }
        case 'waitForLoad': {
          await session.page.waitForLoadState(a.state);
          outputs.push({ type: 'waitForLoad', state: a.state });
          break;
        }
        case 'screenshot': {
          const href = await captureScreenshot(session, { quality: a.quality || 60, fullPage: a.fullPage || false });
          outputs.push({ type: 'screenshot', href, auto: false });
          break;
        }
        case 'snapshot.dom': {
          const html = await session.page.content();
          outputs.push({ type: 'snapshot.dom', length: html.length });
          break;
        }
        case 'snapshot.a11y': {
          const accessibility = (session.page as any).accessibility;
          const snap = accessibility?.snapshot ? await accessibility.snapshot().catch(() => null) : null;
          outputs.push({ type: 'snapshot.a11y', nodes: Array.isArray(snap?.children) ? snap.children.length : 0 });
          break;
        }
        case 'extract': {
          // Simple schema-based extract: { selector, attr?, text? }
          const result = await session.page.evaluate((schema: any) => {
            function pick(el: Element, s: any) {
              const out: any = {};
              for (const [k, v] of Object.entries(s.fields || {})) {
                const sel = (v as any).selector || '';
                const node = sel ? el.querySelector(sel) : el;
                if (!node) { out[k] = null; continue; }
                const attr = (v as any).attr;
                let val: any = attr ? (node.getAttribute(attr) || null) : (node.textContent || '').trim();
                if (attr === 'href' && typeof val === 'string') {
                  try {
                    const u = new URL(val, location.origin);
                    if (u.hostname.includes('google') && u.pathname === '/url') {
                      const q = u.searchParams.get('q') || u.searchParams.get('url');
                      val = q || u.href;
                    } else {
                      val = u.href;
                    }
                  } catch {}
                }
                out[k] = val;
              }
              return out;
            }
            if (schema.list) {
              const elements = Array.from(document.querySelectorAll(schema.list.selector));
              return elements.map(el => pick(el, schema.list));
            }
            if (schema.single) {
              const base = document.querySelector(schema.single.selector);
              return base ? pick(base, schema.single) : null;
            }
            return null;
          }, a.schema);
          outputs.push({ type: 'extract', json: result, confidence: 0.7 });
          break;
        }
        case 'fillForm': {
          for (const f of a.fields) {
            let loc: any = null;
            const expectedText = String(f.label || '');
            if (f.selector) loc = session.page.locator(f.selector).first();
            else if (f.label) loc = session.page.getByLabel(f.label).first();
            if (!loc) continue;

            await loc.waitFor({ state: 'visible', timeout: 8000 }).catch(() => null);
            if (shouldRequireConfidence(a)) {
              const threshold = actionConfidenceThreshold(a);
              let conf = await computeTargetConfidence(session, loc, expectedText);
              outputs.push({ type: 'debug', event: 'confidence', actionType: 'fillForm', score: conf.score, threshold, expectedText, diag: conf.diag, url: session.page.url(), tabId: session.activeTabId, selector: f.selector, label: f.label });
              if (conf.score < threshold) {
                await tryDismissOverlays(session).catch(() => null);
                await loc.scrollIntoViewIfNeeded({ timeout: 2500 }).catch(() => null);
                conf = await computeTargetConfidence(session, loc, expectedText);
                outputs.push({ type: 'debug', event: 'confidence', actionType: 'fillForm', score: conf.score, threshold, expectedText, diag: conf.diag, url: session.page.url(), tabId: session.activeTabId, selector: f.selector, label: f.label, retry: true });
                if (conf.score < threshold) throw new ActionFailure('confidence_too_low', { threshold, confidence: conf, expectedText, selector: f.selector, label: f.label });
              }
            }

            try {
              const pt = await maybeNotifyCursorForLocator(session, loc);
              if (pt) notifySession(session, 'cursor_click', { x: pt.x, y: pt.y });
            } catch {}

            const v = String(f.value ?? '');
            if (f.kind === 'file') {
            } else if (f.kind === 'checkbox') {
              if (f.value === false || f.value === 'false' || f.value === 0 || f.value === '0') await loc.uncheck();
              else await loc.check();
            } else if (f.kind === 'radio') {
              await loc.check();
            } else if (f.kind === 'select') {
              await loc.selectOption(v);
            } else {
              await loc.fill(v);
            }
          }
          outputs.push({ type: 'fillForm', count: a.fields.length });
          break;
        }
        case 'fillByLabel': {
          const locator = session.page.getByLabel(a.label).first();
          await locator.waitFor({ state: 'visible', timeout: 8000 });
          if (shouldRequireConfidence(a)) {
            const threshold = actionConfidenceThreshold(a);
            let conf = await computeTargetConfidence(session, locator, String(a.label || ''));
            outputs.push({ type: 'debug', event: 'confidence', actionType: 'fillByLabel', score: conf.score, threshold, expectedText: String(a.label || ''), diag: conf.diag, url: session.page.url(), tabId: session.activeTabId, label: a.label });
            if (conf.score < threshold) {
              await tryDismissOverlays(session).catch(() => null);
              await locator.scrollIntoViewIfNeeded({ timeout: 2500 }).catch(() => null);
              conf = await computeTargetConfidence(session, locator, String(a.label || ''));
              outputs.push({ type: 'debug', event: 'confidence', actionType: 'fillByLabel', score: conf.score, threshold, expectedText: String(a.label || ''), diag: conf.diag, url: session.page.url(), tabId: session.activeTabId, label: a.label, retry: true });
              if (conf.score < threshold) throw new ActionFailure('confidence_too_low', { threshold, confidence: conf, expectedText: String(a.label || ''), label: a.label });
            }
          }
          const pt = await maybeNotifyCursorForLocator(session, locator);
          if (pt) notifySession(session, 'cursor_click', { x: pt.x, y: pt.y });
          const v = String(a.value ?? '');
          if (a.kind === 'checkbox') {
            if (a.value === false || a.value === 'false' || a.value === 0 || a.value === '0') await locator.uncheck();
            else await locator.check();
          } else if (a.kind === 'radio') {
            await locator.check();
          } else if (a.kind === 'select') {
            await locator.selectOption(v);
          } else {
            await locator.fill(v);
          }
          outputs.push({ type: 'fillByLabel', label: a.label });
          break;
        }
        case 'searchGoogle': {
          const enabled =
            process.env.WORKER_ENABLE_SEARCH_GOOGLE === '1' ||
            process.env.WORKER_ENABLE_SEARCH_GOOGLE === 'true' ||
            process.env.WORKER_ENABLE_SEARCH_GOOGLE === 'yes';
          if (!enabled) throw new Error('search_google_disabled');
          const q = String(a.query ?? '').trim();
          if (!q) throw new Error('query_required');
          const hl = String(a.lang || 'en').trim() || 'en';
          const did = await safeGoto(
            session,
            session.page,
            `https://www.google.com/?hl=${encodeURIComponent(hl)}`,
            { waitUntil: 'domcontentloaded' },
            outputs,
            { allowCrossSite: true }
          );
          if (!did) break;
          await tryAcceptGoogleConsent(session, outputs);
          const box = session.page.locator('textarea[name="q"], input[name="q"]:not([type="hidden"])').first();
          await box.waitFor({ state: 'visible', timeout: 8000 });
          await clickLocatorWithCursor(session, box);
          await session.page.keyboard.type(q, { delay: 25 });
          await session.page.keyboard.press('Enter');
          await session.page.waitForLoadState('domcontentloaded');
          outputs.push({ type: 'searchGoogle', queryLen: q.length, lang: hl });
          break;
        }
        case 'uploadFile': {
          const res = await fetch(a.fileUrl);
          const arrayBuf = await res.arrayBuffer();
          const ext = path.extname(new URL(a.fileUrl).pathname);
          const tmpPath = path.join(STORAGE_DIR, 'uploads', `u-${Date.now()}${ext}`);
          const dir = path.dirname(tmpPath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(tmpPath, Buffer.from(arrayBuf));
          await session.page.setInputFiles(a.selector, tmpPath);
          outputs.push({ type: 'uploadFile', selector: a.selector });
          break;
        }
        case 'evaluate': {
          const expr = String(a.script ?? '').trim();
          if (expr === 'location.href' || expr === 'window.location.href') {
            outputs.push({ type: 'evaluate', result: session.page.url() });
            break;
          }
          if (expr === 'document.title') {
            outputs.push({ type: 'evaluate', result: await session.page.title() });
            break;
          }
          throw new Error('evaluate_expression_not_supported');
          break;
        }
        case 'tab.new': {
          const page = await session.context.newPage();
          const tabId = uuidv4();
          session.tabs.push({ id: tabId, page, createdAt: Date.now(), url: page.url() });
          setupPageHooks(session, page, tabId);
          switchToTab(session, tabId);
          if (a.url) {
            await safeGoto(session, page, a.url, { waitUntil: a.waitUntil || 'load' }, outputs);
            const t = session.tabs.find(x => x.id === tabId);
            if (t) t.url = page.url();
          }
          outputs.push({ type: 'tab.new', tabId, url: a.url || '' });
          break;
        }
        case 'tab.switch': {
          const ok = switchToTab(session, a.tabId);
          outputs.push({ type: 'tab.switch', ok, tabId: a.tabId });
          break;
        }
        case 'tab.close': {
          const tabId = a.tabId || session.activeTabId;
          const idx = session.tabs.findIndex(t => t.id === tabId);
          if (idx === -1) {
            outputs.push({ type: 'tab.close', ok: false, tabId });
            break;
          }
          const [t] = session.tabs.splice(idx, 1);
          try { await t.page.close(); } catch {}
          if (session.tabs.length === 0) {
            const page = await session.context.newPage();
            const newId = uuidv4();
            session.tabs.push({ id: newId, page, createdAt: Date.now(), url: page.url() });
            setupPageHooks(session, page, newId);
            switchToTab(session, newId);
          } else if (session.activeTabId === tabId) {
            switchToTab(session, session.tabs[Math.max(0, idx - 1)]?.id || session.tabs[0].id);
          } else {
            notifyTabs(session);
          }
          outputs.push({ type: 'tab.close', ok: true, tabId });
          break;
        }
        case 'tabs.list': {
          outputs.push({ type: 'tabs.list', tabs: listTabs(session), activeTabId: session.activeTabId });
          break;
        }
        case 'pick': {
          const info = await session.page.evaluate(({ x, y }: { x: number; y: number }) => {
            function cssPath(el: Element) {
              const id = (el as HTMLElement).id;
              if (id) return `#${CSS.escape(id)}`;
              const parts: string[] = [];
              let cur: Element | null = el;
              while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
                const tag = cur.tagName.toLowerCase();
                let part = tag;
                const parent = cur.parentElement as Element | null;
                if (parent) {
                  const siblings = Array.from(parent.children as any as Element[]).filter((c: any) => (c as Element).tagName === (cur as Element).tagName);
                  if (siblings.length > 1) {
                    const index = siblings.indexOf(cur as any) + 1;
                    part = `${tag}:nth-of-type(${index})`;
                  }
                }
                parts.unshift(part);
                cur = parent;
              }
              return parts.join(' > ');
            }
            const el = document.elementFromPoint(x, y) as HTMLElement | null;
            if (!el) return null;
            const r = el.getBoundingClientRect();
            const text = (el.textContent || '').trim().slice(0, 200);
            const ariaLabel = el.getAttribute('aria-label') || '';
            const role = el.getAttribute('role') || '';
            return {
              tag: el.tagName.toLowerCase(),
              id: el.id || '',
              className: el.className || '',
              text,
              ariaLabel,
              role,
              selector: cssPath(el),
              boundingBox: { x: r.x, y: r.y, width: r.width, height: r.height }
            };
          }, { x: a.x, y: a.y });
          outputs.push({ type: 'pick', x: a.x, y: a.y, element: info });
          if (info?.boundingBox) notifySession(session, 'pick', { x: a.x, y: a.y, element: info });
          break;
        }
        case 'textBoxes.once': {
          const boxes = await pushTextBoxes(session, 'once');
          outputs.push({ type: 'textBoxes.once', count: Array.isArray(boxes) ? boxes.length : 0, boxes: (boxes || []).slice(0, 250) });
          break;
        }
        case 'textBoxes.start': {
          startTextBoxes(session, { intervalMs: a.intervalMs, maxBoxes: a.maxBoxes, includeText: a.includeText });
          outputs.push({ type: 'textBoxes.start', enabled: true, intervalMs: session.textBoxes.intervalMs, maxBoxes: session.textBoxes.maxBoxes, includeText: session.textBoxes.includeText });
          break;
        }
        case 'textBoxes.stop': {
          stopTextBoxes(session);
          outputs.push({ type: 'textBoxes.stop', enabled: false });
          break;
        }
        case 'stream.setFps': {
          const fps = Math.max(1, Math.min(30, Number(a.fps || 0) || 5));
          session.streamFps = fps;
          outputs.push({ type: 'stream.setFps', fps });
          notifySession(session, 'stream', { fps, quality: session.streamQuality });
          break;
        }
        case 'stream.setQuality': {
          const quality = Math.max(20, Math.min(90, Number(a.quality || 0) || 50));
          session.streamQuality = quality;
          outputs.push({ type: 'stream.setQuality', quality });
          notifySession(session, 'stream', { fps: session.streamFps, quality });
          break;
        }
        case 'redaction.set': {
          session.redactionEnabled = Boolean(a.enabled);
          outputs.push({ type: 'redaction.set', enabled: session.redactionEnabled });
          notifySession(session, 'redaction', { enabled: session.redactionEnabled });
          break;
        }
        case 'login.xelitesolutions': {
          const email = String((a as any).email ?? '').trim();
          const password = String((a as any).password ?? '');
          if (!email) throw new ActionFailure('input_required', { field: 'email' }, 'email_required');
          if (!password) throw new ActionFailure('input_required', { field: 'password' }, 'password_required');

          const baseUrlRaw = String((a as any).startUrl ?? 'https://xelitesolutions.com').trim() || 'https://xelitesolutions.com';
          const baseUrl = /^https?:\/\//i.test(baseUrlRaw) ? baseUrlRaw : `https://${baseUrlRaw}`;

          await captureDebugShot(session, { stage: 'login_start', actionType: 'login.xelitesolutions' }, outputs);

          const did = await safeGoto(session, session.page, baseUrl, { waitUntil: 'domcontentloaded' }, outputs);
          if (!did) throw new ActionFailure('navigation_blocked_same_site', { url: baseUrl }, 'goto_blocked');
          await session.page.waitForLoadState('domcontentloaded').catch(() => null);
          await tryDismissOverlays(session).catch(() => null);
          await captureDebugShot(session, { stage: 'home_loaded', actionType: 'login.xelitesolutions' }, outputs);

          const loginUrl = new URL('/login', baseUrl).toString();
          const goLogin = async () => {
            const didLogin = await safeGoto(session, session.page, loginUrl, { waitUntil: 'domcontentloaded' }, outputs);
            if (!didLogin) throw new ActionFailure('navigation_blocked_same_site', { url: loginUrl }, 'goto_blocked');
            await session.page.waitForLoadState('domcontentloaded').catch(() => null);
          };

          let reachedLogin = false;
          try {
            await goLogin();
            reachedLogin = true;
          } catch {}

          if (!reachedLogin) {
            const startNowTexts = ['Start Now', 'ابدأ الآن', 'ابدأ الان', 'ابدأ'];
            let clicked = false;
            for (const txt of startNowTexts) {
              try {
                const timeoutMs = 9000;
                const attempts = 3;
                const needle = txt;
                const rx = new RegExp(escapeRegExp(needle), 'i');

                const disambiguation = await session.page.evaluate(({ needle }: { needle: string }) => {
                  function norm(t: string) { return String(t || '').replace(/\s+/g, ' ').trim(); }
                  function isVisible(el: Element) {
                    const r = (el as HTMLElement).getBoundingClientRect?.();
                    if (!r || r.width < 2 || r.height < 2) return false;
                    const s = window.getComputedStyle(el as HTMLElement);
                    if (!s || s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity || '1') === 0) return false;
                    if (r.bottom < 0 || r.right < 0 || r.top > (window.innerHeight || 0) || r.left > (window.innerWidth || 0)) return false;
                    return true;
                  }
                  function cssPath(el: Element) {
                    const id = (el as HTMLElement).id;
                    if (id) return `#${CSS.escape(id)}`;
                    const parts: string[] = [];
                    let cur: Element | null = el;
                    while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
                      const tag = cur.tagName.toLowerCase();
                      let part = tag;
                      const parent = cur.parentElement as Element | null;
                      if (parent) {
                        const siblings = Array.from(parent.children as any as Element[]).filter((c: any) => (c as Element).tagName === (cur as Element).tagName);
                        if (siblings.length > 1) {
                          const index = siblings.indexOf(cur as any) + 1;
                          part = `${tag}:nth-of-type(${index})`;
                        }
                      }
                      parts.unshift(part);
                      cur = parent;
                    }
                    return parts.join(' > ');
                  }
                  const nNeedle = norm(needle).toLowerCase();
                  const sel = 'button,a,[role=\"button\"],input[type=\"button\"],input[type=\"submit\"]';
                  const els = Array.from(document.querySelectorAll(sel)).slice(0, 700);
                  const out: any[] = [];
                  for (const el of els) {
                    if (!isVisible(el)) continue;
                    const text = norm((el as any).innerText || (el as any).textContent || (el as any).value || '');
                    const ariaLabel = norm((el as any).getAttribute?.('aria-label') || '');
                    const hay = (text || ariaLabel).toLowerCase();
                    if (!hay) continue;
                    if (!hay.includes(nNeedle)) continue;
                    const r = (el as HTMLElement).getBoundingClientRect();
                    out.push({
                      text: text || undefined,
                      ariaLabel: ariaLabel || undefined,
                      tag: (el as HTMLElement).tagName.toLowerCase(),
                      role: norm((el as any).getAttribute?.('role') || '') || undefined,
                      selector: cssPath(el),
                      boundingBox: { x: r.x, y: r.y, width: r.width, height: r.height },
                    });
                    if (out.length >= 4) break;
                  }
                  return out;
                }, { needle }).catch(() => [] as any[]);

                if (Array.isArray(disambiguation) && disambiguation.length > 1) {
                  throw new ActionFailure('need_user_disambiguation', { text: needle, candidates: disambiguation, stage: 'start_now' });
                }

                let found: any = { locator: null, frameUrl: '' };
                for (let s = 0; s < 3; s++) {
                  found = await findClickableInFrames(session, (ctx) => ctx.getByRole('button', { name: rx as any, exact: false }), 16);
                  if (!found.locator) found = await findClickableInFrames(session, (ctx) => ctx.getByRole('link', { name: rx as any, exact: false }), 16);
                  if (!found.locator) found = await findClickableInFrames(session, (ctx) => ctx.getByText(rx as any), 16);
                  if (found.locator) break;
                  await smoothScrollBy(session, Math.round((session.viewport?.height || 800) * 0.75), 9).catch(() => null);
                }
                if (!found.locator) continue;

                const threshold = actionConfidenceThreshold(a);
                let conf = await computeTargetConfidence(session, found.locator, needle);
                outputs.push({ type: 'debug', event: 'confidence', actionType: 'login.xelitesolutions', step: 'start_now', score: conf.score, threshold, expectedText: needle, diag: conf.diag, url: session.page.url(), tabId: session.activeTabId });
                if (conf.score < threshold) {
                  await tryDismissOverlays(session).catch(() => null);
                  await found.locator.scrollIntoViewIfNeeded({ timeout: 2500 }).catch(() => null);
                  conf = await computeTargetConfidence(session, found.locator, needle);
                  outputs.push({ type: 'debug', event: 'confidence', actionType: 'login.xelitesolutions', step: 'start_now', score: conf.score, threshold, expectedText: needle, diag: conf.diag, url: session.page.url(), tabId: session.activeTabId, retry: true });
                  if (conf.score < threshold) throw new ActionFailure('confidence_too_low', { threshold, confidence: conf, expectedText: needle, step: 'start_now' });
                }

                await clickLocatorRobust(session, found.locator, { timeoutMs, attempts }, outputs, { text: needle });
                clicked = true;
                break;
              } catch (e) {
                if (e instanceof ActionFailure && e.reason === 'need_user_disambiguation') throw e;
              }
            }

            if (!clicked) throw new ActionFailure('element_not_found', { text: 'Start Now', step: 'start_now' }, 'start_now_not_found');
            await session.page.waitForLoadState('domcontentloaded').catch(() => null);
            await captureDebugShot(session, { stage: 'after_start_now', actionType: 'login.xelitesolutions' }, outputs);
          }

          const emailSelectors = [
            'input[type="email"]',
            'input[name="email"]',
            'input#email',
            'input[placeholder*="Email" i]',
            'input[autocomplete="email"]',
          ];
          const passSelectors = [
            'input[type="password"]',
            'input[name="password"]',
            'input#password',
            'input[autocomplete="current-password"]',
          ];
          const findFirst = async (sels: string[]) => {
            for (const sel of sels) {
              const found = await findClickableInFrames(session, (ctx) => ctx.locator(sel), 16);
              if (found.locator) return { ...found, selector: sel };
            }
            return { locator: null, frameUrl: '', selector: '' };
          };

          const emailLoc = await findFirst(emailSelectors);
          if (!emailLoc.locator) {
            const byLabel = await findClickableInFrames(session, (ctx) => ctx.getByLabel(/email/i), 16);
            if (byLabel.locator) Object.assign(emailLoc, { locator: byLabel.locator, frameUrl: byLabel.frameUrl, selector: 'label:/email/i' });
          }
          if (!emailLoc.locator) throw new ActionFailure('element_not_found', { step: 'email' }, 'email_input_not_found');

          const threshold = actionConfidenceThreshold(a);
          let confEmail = await computeTargetConfidence(session, emailLoc.locator, 'email');
          outputs.push({ type: 'debug', event: 'confidence', actionType: 'login.xelitesolutions', step: 'email', score: confEmail.score, threshold, expectedText: 'email', diag: confEmail.diag, url: session.page.url(), tabId: session.activeTabId });
          if (confEmail.score < threshold) throw new ActionFailure('confidence_too_low', { threshold, confidence: confEmail, expectedText: 'email', step: 'email' });

          await clickLocatorWithCursor(session, emailLoc.locator, { timeout: 6000 });
          await new Promise(r => setTimeout(r, 160));
          await session.page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A').catch(() => null);
          await session.page.keyboard.press('Backspace').catch(() => null);
          await new Promise(r => setTimeout(r, 140));
          await session.page.keyboard.type(email, { delay: 25 });
          const emailVerifiedLen = await emailLoc.locator.evaluate((el: any) => {
            try { return String((el as any).value || '').length; } catch { return null; }
          }).catch(() => null);
          outputs.push({ type: 'login_step', step: 'email', verified: typeof emailVerifiedLen === 'number' ? emailVerifiedLen >= email.length : null });
          await captureDebugShot(session, { stage: 'email_filled', actionType: 'login.xelitesolutions' }, outputs);

          const passLoc = await findFirst(passSelectors);
          if (!passLoc.locator) {
            const byLabel = await findClickableInFrames(session, (ctx) => ctx.getByLabel(/password/i), 16);
            if (byLabel.locator) Object.assign(passLoc, { locator: byLabel.locator, frameUrl: byLabel.frameUrl, selector: 'label:/password/i' });
          }
          if (!passLoc.locator) throw new ActionFailure('element_not_found', { step: 'password' }, 'password_input_not_found');

          let confPass = await computeTargetConfidence(session, passLoc.locator, 'password');
          outputs.push({ type: 'debug', event: 'confidence', actionType: 'login.xelitesolutions', step: 'password', score: confPass.score, threshold, expectedText: 'password', diag: confPass.diag, url: session.page.url(), tabId: session.activeTabId });
          if (confPass.score < threshold) throw new ActionFailure('confidence_too_low', { threshold, confidence: confPass, expectedText: 'password', step: 'password' });

          await clickLocatorWithCursor(session, passLoc.locator, { timeout: 6000 });
          await new Promise(r => setTimeout(r, 160));
          await session.page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A').catch(() => null);
          await session.page.keyboard.press('Backspace').catch(() => null);
          await new Promise(r => setTimeout(r, 140));
          await session.page.keyboard.type(password, { delay: 22 });
          outputs.push({ type: 'login_step', step: 'password', verified: null });
          await captureDebugShot(session, { stage: 'password_filled', actionType: 'login.xelitesolutions' }, outputs);

          const loginTexts = ['Login', 'Log in', 'Sign in', 'تسجيل الدخول', 'دخول'];
          let loginClicked = false;
          for (const txt of loginTexts) {
            try {
              const rx = new RegExp(escapeRegExp(txt), 'i');
              let found = await findClickableInFrames(session, (ctx) => ctx.getByRole('button', { name: rx as any, exact: false }), 16);
              if (!found.locator) found = await findClickableInFrames(session, (ctx) => ctx.getByRole('link', { name: rx as any, exact: false }), 16);
              if (!found.locator) continue;
              let conf = await computeTargetConfidence(session, found.locator, txt);
              outputs.push({ type: 'debug', event: 'confidence', actionType: 'login.xelitesolutions', step: 'login_click', score: conf.score, threshold, expectedText: txt, diag: conf.diag, url: session.page.url(), tabId: session.activeTabId });
              if (conf.score < threshold) continue;
              await clickLocatorRobust(session, found.locator, { timeoutMs: 12000, attempts: 3 }, outputs, { text: txt });
              loginClicked = true;
              break;
            } catch (e) {
              if (e instanceof ActionFailure && e.reason === 'need_user_disambiguation') throw e;
            }
          }
          if (!loginClicked) {
            const anySubmit = await findClickableInFrames(session, (ctx) => ctx.locator('button[type="submit"], input[type="submit"]').first(), 16);
            if (!anySubmit.locator) throw new ActionFailure('element_not_found', { step: 'login_button' }, 'login_button_not_found');
            await clickLocatorRobust(session, anySubmit.locator, { timeoutMs: 12000, attempts: 3 }, outputs, { selector: 'button[type=submit]' });
          }

          await session.page.waitForLoadState('domcontentloaded').catch(() => null);
          await new Promise(r => setTimeout(r, 500));
          await captureDebugShot(session, { stage: 'after_login_click', actionType: 'login.xelitesolutions' }, outputs);

          const finalUrl = session.page.url();
          const success = await session.page.evaluate(() => {
            const t = (document.body?.innerText || '').toLowerCase();
            if (t.includes('dashboard')) return true;
            if (t.includes('logout') || t.includes('log out')) return true;
            if (t.includes('welcome')) return true;
            return false;
          }).catch(() => null);

          outputs.push({ type: 'login.xelitesolutions', ok: Boolean(success), url: finalUrl });
          if (!success) {
            throw new ActionFailure('login_not_confirmed', { url: finalUrl }, 'login_not_confirmed');
          }
          break;
        }
      }

      if (autoScreenshotsEnabled) {
        const should =
          a.type === 'goto' ||
          a.type === 'click' ||
          a.type === 'clickText' ||
          (a.type === 'type' && (Boolean((a as any).selector) || String((a as any).text || '').length > 3)) ||
          a.type === 'login.xelitesolutions' ||
          a.type === 'fillForm' ||
          a.type === 'fillByLabel' ||
          a.type === 'searchGoogle' ||
          a.type === 'uploadFile' ||
          a.type === 'goBack' ||
          a.type === 'goForward' ||
          a.type === 'reload' ||
          a.type === 'tab.new' ||
          a.type === 'tab.switch' ||
          a.type === 'tab.close';

        const now = Date.now();
        if (should && (session.lastAutoShotAt == null || now - session.lastAutoShotAt > 900)) {
          session.lastAutoShotAt = now;
          const href = await captureScreenshot(session, { quality: 55, fullPage: false });
          outputs.push({ type: 'screenshot', href, auto: true, after: a.type });
        }
      }

      session.streamPauseUntil = Date.now() + 120;
      notifySession(session, 'action_done', { action: sanitizeAction(session, a) });
    } catch (err: any) {
      if (a.type === 'click') {
        await captureDebugShot(
          session,
          { stage: 'click_error', actionType: 'click', selector: a.selector, role: (a as any).role, roleName: (a as any).roleName },
          outputs
        );
      } else if (a.type === 'clickText') {
        await captureDebugShot(session, { stage: 'click_error', actionType: 'clickText', text: a.text }, outputs);
      } else if (a.type === 'type') {
        await captureDebugShot(session, { stage: 'type_error', actionType: 'type', selector: (a as any).selector }, outputs);
      } else if (a.type === 'fillByLabel') {
        await captureDebugShot(session, { stage: 'fill_error', actionType: 'fillByLabel', text: String((a as any).label || '') }, outputs);
      }
      const message = String(err?.message || err || 'action_failed');
      const reasonFromErr = (err && typeof err === 'object' && 'reason' in err) ? String((err as any).reason || '') : '';
      const detailFromErr = (err && typeof err === 'object' && 'detail' in err) ? (err as any).detail : undefined;
      const actionOutputs = outputs.slice(outputsStart);
      const screenshots = actionOutputs.filter((o: any) => o && o.type === 'screenshot' && o.href).map((o: any) => o.href);
      const overlay = actionOutputs.find((o: any) => o && o.type === 'debug' && o.event === 'overlay_blocking_click');
      let reason = reasonFromErr || '';
      if (!reason) {
        if (message === 'selector_not_found' || message === 'role_not_found' || message === 'text_not_found') reason = 'element_not_found';
        else if (message === 'confidence_too_low') reason = 'confidence_too_low';
        else if (message === 'click_failed') reason = 'click_failed';
        else if (/timeout/i.test(message)) reason = 'timeout_waiting_for_selector';
        else reason = 'action_failed';
      }
      if (overlay && (reason === 'click_failed' || reason === 'action_failed')) reason = 'overlay_blocking_click';
      const detail = detailFromErr != null ? detailFromErr : { message };

      logger.warn({ action: sanitizeAction(session, a), reason, message }, 'action_failed');
      session.streamPauseUntil = Date.now() + 250;
      notifySession(session, 'action_error', { type: a.type, error: message, reason, detail, screenshots, url: session.page.url(), tabId: session.activeTabId });
      outputs.push({
        type: 'error',
        action: a.type,
        reason,
        message,
        detail,
        screenshots,
        url: session.page.url(),
        tabId: session.activeTabId,
        actionInput: sanitizeAction(session, a),
      });
    }
  }
  return outputs;
}

const app = express();
app.use(express.json({ limit: '10mb' }));
app.get('/', (_req, res) => {
  res.json({ status: 'OK', service: 'joe-browser-worker' });
});
app.get('/up', (_req, res) => {
  res.json({ status: 'UP' });
});
app.get('/health', (_req, res) => {
  if (startupError) return res.json({ status: 'ERROR', error: startupError, help: 'Ensure service configuration is correct' });
  if (!browserHealthy) return res.json({ status: 'STARTING' });
  res.json({ status: 'OK' });
});
app.use('/downloads', express.static(path.join(STORAGE_DIR, 'downloads')));
app.use('/shots', express.static(path.join(STORAGE_DIR, 'shots')));

app.post('/session/create', auth, async (req, res) => {
  try {
    const { viewport, userAgent, locale, device, recordVideo } = req.body || {};
    const s = await createSession({ viewport, userAgent, locale, recordVideo: Boolean(recordVideo) });
    if (device && devices[device]) {
      // Close the default context created in createSession
      await s.context.close();
      // Do NOT close s.browser as it is shared
      
      const browser = await getSharedBrowser();
      const recordVideoEnabled = Boolean(recordVideo);
      const contextOptions: any = { ...devices[device], acceptDownloads: true };
      if (recordVideoEnabled) contextOptions.recordVideo = { dir: path.join(STORAGE_DIR, 'videos') };
      const ctx = await browser.newContext(contextOptions);
      const page = await ctx.newPage();
      s.browser = browser;
      s.context = ctx;
      s.page = page;
      const preset = devices[device] as any;
      s.viewport = (preset && preset.viewport) ? preset.viewport : s.viewport;
      const tabId = uuidv4();
      s.tabs = [{ id: tabId, page, createdAt: Date.now(), url: page.url() }];
      s.activeTabId = tabId;
      setupPageHooks(s, page, tabId);
    }
    notifyTabs(s);
    res.json({ sessionId: s.id, wsUrl: `/ws/${s.id}` });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/session/:id/close', auth, async (req, res) => {
  await closeSession(req.params.id);
  res.json({ ok: true });
});

app.post('/session/:id/job/run', auth, async (req, res) => {
  const s = SESSIONS.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'session_not_found' });
  s.lastActiveAt = Date.now();
  const actions: Action[] = Array.isArray(req.body?.actions) ? req.body.actions : [];
  const outputs = await runActions(s, actions);
  res.json({ ok: true, outputs, artifacts: s.downloads });
});

app.post('/session/:id/snapshot', auth, async (req, res) => {
  const s = SESSIONS.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'session_not_found' });
  s.lastActiveAt = Date.now();
  let html = '';
  let a11ySnap: any = null;
  try {
    html = await s.page.content();
  } catch {}
  try {
    a11ySnap = (s.page as any).accessibility?.snapshot ? await (s.page as any).accessibility.snapshot().catch(() => null) : null;
  } catch {}

  let screenshot = '';
  try {
    const buf = await s.page.screenshot({ type: 'jpeg', quality: 55, timeout: 7000, caret: 'hide', animations: 'disabled' });
    const name = `snap-${Date.now()}.jpg`;
    const p = path.join(STORAGE_DIR, 'shots', name);
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, buf);
    screenshot = `/shots/${name}`;
  } catch {}

  res.json({
    dom: html.slice(0, 2000000),
    a11y: a11ySnap,
    screenshot,
    viewport: s.viewport,
    url: s.page.url(),
  });
});

app.post('/session/:id/extract', auth, async (req, res) => {
  const s = SESSIONS.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'session_not_found' });
  s.lastActiveAt = Date.now();
  const schema = req.body?.schema;
  if (!schema) return res.status(400).json({ error: 'schema_required' });
  const outputs = await runActions(s, [{ type: 'extract', schema }]);
  const out = outputs.find(o => o.type === 'extract');
  res.json({ json: out?.json, confidence: out?.confidence ?? 0.7 });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'not_found' });
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = String(err?.message || 'internal_error');
  res.status(500).json({ error: message });
});

// Cleanup stale sessions
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of SESSIONS.entries()) {
    if (now - s.lastActiveAt > TTL_MS) {
      logger.info({ id }, 'session_ttl_close');
      closeSession(id).catch(() => {});
    }
  }
}, 30000);

// WS streaming (simple JPEG polling)
const wss = new WebSocketServer({ noServer: true });
const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info({ port: PORT }, 'worker_listening');
  
  // Startup Check
  (async () => {
    try {
      logger.info('Running startup browser dependency check...');
      await getSharedBrowser();
      browserHealthy = true;
      logger.info('Startup browser dependency check PASSED');
    } catch (err: any) {
      startupError = err.message;
      logger.error({ err }, 'Startup browser dependency check FAILED - Missing system dependencies? Ensure Docker is used.');
    }
  })();
});

(server as any).on('upgrade', async (req: any, socket: any, head: any) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const reject = (status: number, message: string) => {
    try {
      socket.write(
        `HTTP/1.1 ${status} ${message}\r\n` +
          'Connection: close\r\n' +
          'Content-Type: text/plain\r\n' +
          `Content-Length: ${Buffer.byteLength(message)}\r\n` +
          '\r\n' +
          message
      );
    } catch {}
    try { socket.destroy(); } catch {}
  };

  if (!url.pathname.startsWith('/ws/')) return reject(404, 'Not Found');
  const sessionId = url.pathname.split('/').pop();
  const key = url.searchParams.get('key');
  if (key !== API_KEY) return reject(401, 'Unauthorized');
  const s = SESSIONS.get(String(sessionId));
  if (!s) return reject(404, 'Session Not Found');
  wss.handleUpgrade(req, socket, head, (ws) => {
    s.ws = ws;
    s.lastActiveAt = Date.now();
    ws.send(JSON.stringify({ type: 'stream_start', w: s.viewport.width, h: s.viewport.height }));
    try {
      ws.send(JSON.stringify({
        type: 'state',
        url: s.page.url(),
        viewport: s.viewport,
        tabs: listTabs(s),
        activeTabId: s.activeTabId,
        stream: { fps: s.streamFps, quality: s.streamQuality },
        redactionEnabled: s.redactionEnabled,
        downloads: s.downloads.slice(-20),
        logs: s.logs.slice(-100),
        network: s.network.slice(-100)
      }));
    } catch {}
    let running = true;
    ws.on('close', () => {
      running = false;
      s.ws = undefined;
      try { stopTextBoxes(s); } catch {}
    });
    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'action') {
           s.lastActiveAt = Date.now();
           // Execute single action directly
           const a = msg.action;
           // We reuse the switch case from runActions logic or extract it.
           // For safety and simplicity, we can just call runActions with one action.
           // But runActions sends HTTP response. We want fire-and-forget or WS ack.
           // Let's refactor the action logic to be reusable.
           // Or just call runActions and ignore return? runActions uses 'session' which we have.
           await runActions(s, [a]);
        }
        if (msg.type === 'actions' && Array.isArray(msg.actions)) {
           s.lastActiveAt = Date.now();
           await runActions(s, msg.actions);
        }
      } catch {}
    });
    const loop = async () => {
      while (running) {
        try {
          const pauseUntil = Number(s.streamPauseUntil || 0);
          if (pauseUntil && Date.now() < pauseUntil) {
            const waitMs = Math.min(250, Math.max(10, pauseUntil - Date.now()));
            await new Promise(r => setTimeout(r, waitMs));
            continue;
          }
          s.lastActiveAt = Date.now();
          const buf = await s.page.screenshot({
            type: 'jpeg',
            quality: s.streamQuality,
            timeout: 7000,
            caret: 'hide',
            animations: 'disabled',
          });
          ws.send(JSON.stringify({ type: 'frame', jpegBase64: buf.toString('base64'), ts: Date.now(), w: s.viewport.width, h: s.viewport.height }));
          const delay = Math.max(33, Math.round(1000 / Math.max(1, Math.min(30, s.streamFps || 5))));
          await new Promise(r => setTimeout(r, delay));
        } catch (e: any) {
          logger.warn({ id: s.id, error: String(e?.message || e) }, 'stream_frame_error');
          if (!running) break;
          if (ws.readyState !== WebSocket.OPEN) break;
          await new Promise(r => setTimeout(r, 250));
        }
      }
    };
    loop();
  });
});
