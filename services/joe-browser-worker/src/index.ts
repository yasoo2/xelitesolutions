import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import { chromium, devices } from 'playwright';
import type { Browser, BrowserContext, Page } from 'playwright';
import dotenv from 'dotenv';
import pino from 'pino';
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
  viewport: { width: number; height: number };
  userAgent?: string;
  locale?: string;
  streamFps: number;
  streamQuality: number;
  redactionEnabled: boolean;
  createdAt: number;
  lastActiveAt: number;
  downloads: Array<{ id: string; filename: string; href: string; size: number }>;
  logs: Array<{ level: string; text: string; ts: number }>;
  network: Array<{ stage: 'request' | 'response'; url: string; method: string; status?: number; resourceType?: string; ts: number }>;
  ws?: WebSocket;
};

const SESSIONS = new Map<string, Session>();
const TTL_MS = Number(process.env.SESSION_TTL_MS || 30 * 60 * 1000);
const API_KEY = process.env.WORKER_API_KEY || 'change-me';
const STORAGE_DIR = process.env.WORKER_STORAGE_DIR || '/tmp/joe-browser-worker';
const PORT = Number(process.env.PORT || 7070);

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
  const headless = String(process.env.HEADLESS ?? '0').trim() !== '0';
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

function setupPageHooks(session: Session, page: Page, tabId: string) {
  const findTab = () => session.tabs.find(t => t.id === tabId);

  page.on('framenavigated', (frame) => {
    try {
      if (frame === page.mainFrame()) {
        const t = findTab();
        if (t) t.url = frame.url();
        notifySession(session, 'url', { url: frame.url(), tabId });
        if (t) {
          page.title().then((title) => {
            const tt = findTab();
            if (!tt) return;
            tt.title = title;
            notifyTabs(session);
          }).catch(() => {});
        }
      }
    } catch {}
  });

  page.on('console', (msg) => {
    try {
      const entry = { level: msg.type(), text: msg.text(), ts: Date.now() };
      session.logs.push(entry);
      if (session.logs.length > 500) session.logs.shift();
      notifySession(session, 'console', { entry, tabId });
    } catch {}
  });

  page.on('request', (req) => {
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

  page.on('response', (resp) => {
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

  page.on('download', async (dl) => {
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

async function createSession(opts: { viewport?: { width: number; height: number }, userAgent?: string, locale?: string }) {
  const browser = await launchChromium();
  const context = await browser.newContext({
    viewport: opts.viewport || { width: 1280, height: 800 },
    userAgent: opts.userAgent,
    locale: opts.locale || 'en-US',
    ignoreHTTPSErrors: true,
    acceptDownloads: true,
    recordVideo: { dir: path.join(STORAGE_DIR, 'videos') }
  });
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
    streamFps,
    streamQuality,
    redactionEnabled: true,
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
  for (const t of s.tabs) {
    try { await t.page.close(); } catch {}
  }
  try { await s.context.close(); } catch {}
  try { await s.browser.close(); } catch {}
  SESSIONS.delete(id);
}

// Action execution
type Action =
  | { type: 'goto', url: string, waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }
  | { type: 'goBack' }
  | { type: 'goForward' }
  | { type: 'reload' }
  | { type: 'type', text: string, delay?: number, sensitive?: boolean }
  | { type: 'press', key: string }
  | { type: 'mouseMove', x: number, y: number, steps?: number }
  | { type: 'click', x?: number, y?: number, button?: 'left'|'right'|'middle', selector?: string, roleName?: string, role?: string }
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
  | { type: 'uploadFile', selector: string, fileUrl: string }
  | { type: 'evaluate', script: string, sensitive?: boolean }
  | { type: 'tab.new', url?: string, waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }
  | { type: 'tab.switch', tabId: string }
  | { type: 'tab.close', tabId?: string }
  | { type: 'tabs.list' }
  | { type: 'pick', x: number, y: number }
  | { type: 'stream.setFps', fps: number }
  | { type: 'stream.setQuality', quality: number }
  | { type: 'redaction.set', enabled: boolean }
  ;

function sanitizeAction(session: Session, a: Action) {
  if (!session.redactionEnabled) return a as any;
  if (a.type === 'type') {
    return { ...a, text: `[redacted:${a.text.length}]` } as any;
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

async function runActions(session: Session, actions: Action[]) {
  const outputs: any[] = [];

  for (const a of actions) {
    session.lastActiveAt = Date.now();
    notifySession(session, 'action_start', { action: sanitizeAction(session, a) });
    try {
      switch (a.type) {
        case 'goto': {
          const allowlist = (process.env.WORKER_ALLOWLIST || '').split(',').map(s => s.trim()).filter(Boolean);
          try {
            const u = new URL(a.url);
            if (allowlist.length && !allowlist.includes(u.hostname)) {
              outputs.push({ type: 'goto_blocked', url: a.url, reason: 'domain_not_allowed' });
              break;
            }
          } catch {}
          await session.page.goto(a.url, { waitUntil: a.waitUntil || 'load' });
          outputs.push({ type: 'goto', url: a.url });
          try {
            const u = new URL(a.url);
            if (/(^|\\.)google\\./i.test(u.hostname)) {
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
                  await loc.first().click({ timeout: 1000 });
                  outputs.push({ type: 'cookie_consent_click', selector: sel });
                  break;
                }
              }
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
          await session.page.keyboard.type(a.text, { delay: a.delay || 20 });
          outputs.push({ type: 'type', text: a.text.length });
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
          if (a.selector) {
            try {
              const loc = session.page.locator(a.selector).first();
              const box = await loc.boundingBox({ timeout: 1000 }).catch(() => null);
              if (box) {
                const cx = box.x + box.width / 2;
                const cy = box.y + box.height / 2;
                notifySession(session, 'cursor_move', { x: cx, y: cy });
                await new Promise(r => setTimeout(r, 150)); // Visual delay
                notifySession(session, 'cursor_click', { x: cx, y: cy });
              }
              await loc.click();
            } catch (e) {
              // Fallback if locator fails or something else happens, though click() would also fail
              await session.page.click(a.selector);
            }
          } else if (a.roleName && a.role) {
            try {
              const loc = session.page.getByRole(a.role as any, { name: a.roleName }).first();
              const box = await loc.boundingBox({ timeout: 1000 }).catch(() => null);
              if (box) {
                const cx = box.x + box.width / 2;
                const cy = box.y + box.height / 2;
                notifySession(session, 'cursor_move', { x: cx, y: cy });
                await new Promise(r => setTimeout(r, 150));
                notifySession(session, 'cursor_click', { x: cx, y: cy });
              }
              await loc.click();
            } catch {
              await session.page.getByRole(a.role as any, { name: a.roleName }).click();
            }
          } else if (typeof a.x === 'number' && typeof a.y === 'number') {
            await session.page.mouse.click(a.x, a.y, { button: a.button || 'left' });
            notifySession(session, 'cursor_click', { x: a.x, y: a.y });
          }
          outputs.push({ type: 'click' });
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
          await session.page.evaluate((dy) => window.scrollBy(0, dy), a.deltaY);
          outputs.push({ type: 'scroll', deltaY: a.deltaY });
          break;
        }
        case 'scrollTo': {
          await session.page.evaluate((sel) => {
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
          const buf = await session.page.screenshot({ type: 'jpeg', quality: a.quality || 60, fullPage: a.fullPage || false });
          const name = `s-${Date.now()}.jpg`;
          const p = path.join(STORAGE_DIR, 'shots', name);
          const dir = path.dirname(p);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(p, buf);
          const href = `/shots/${name}`;
          outputs.push({ type: 'screenshot', href });
          notifySession(session, 'screenshot', { href });
          break;
        }
        case 'snapshot.dom': {
          const html = await session.page.content();
          outputs.push({ type: 'snapshot.dom', length: html.length });
          break;
        }
        case 'snapshot.a11y': {
          const snap = await session.page.accessibility.snapshot();
          outputs.push({ type: 'snapshot.a11y', nodes: (snap?.children || []).length });
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
            if (f.selector) {
              if (f.kind === 'file') {
                // file handled via uploadFile
              } else {
                await session.page.fill(f.selector, String(f.value ?? ''));
              }
            } else if (f.label) {
              const locator = session.page.getByLabel(f.label);
              if (f.kind === 'checkbox') await locator.check();
              else if (f.kind === 'radio') await locator.check();
              else await locator.fill(String(f.value ?? ''));
            }
          }
          outputs.push({ type: 'fillForm', count: a.fields.length });
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
          const result = await session.page.evaluate((code) => {
            // eslint-disable-next-line no-eval
            return eval(code);
          }, a.script);
          outputs.push({ type: 'evaluate', result });
          break;
        }
        case 'tab.new': {
          const page = await session.context.newPage();
          const tabId = uuidv4();
          session.tabs.push({ id: tabId, page, createdAt: Date.now(), url: page.url() });
          setupPageHooks(session, page, tabId);
          switchToTab(session, tabId);
          if (a.url) {
            await page.goto(a.url, { waitUntil: a.waitUntil || 'load' });
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
          const info = await session.page.evaluate(({ x, y }) => {
            function cssPath(el: Element) {
              const id = (el as HTMLElement).id;
              if (id) return `#${CSS.escape(id)}`;
              const parts: string[] = [];
              let cur: Element | null = el;
              while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
                const tag = cur.tagName.toLowerCase();
                let part = tag;
                const parent = cur.parentElement;
                if (parent) {
                  const siblings = Array.from(parent.children).filter(c => c.tagName === cur!.tagName);
                  if (siblings.length > 1) {
                    const index = siblings.indexOf(cur) + 1;
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
      }
      notifySession(session, 'action_done', { action: sanitizeAction(session, a) });
    } catch (err: any) {
      logger.warn({ action: a, error: err.message }, 'action_failed');
      notifySession(session, 'action_error', { type: a.type, error: err.message });
      outputs.push({ type: 'error', action: a.type, message: err.message });
    }
  }
  return outputs;
}

const app = express();
app.use(express.json({ limit: '10mb' }));
app.get('/health', (_req, res) => res.json({ status: 'OK' }));
app.use('/downloads', express.static(path.join(STORAGE_DIR, 'downloads')));
app.use('/shots', express.static(path.join(STORAGE_DIR, 'shots')));

app.post('/session/create', auth, async (req, res) => {
  try {
    const { viewport, userAgent, locale, device } = req.body || {};
    const s = await createSession({ viewport, userAgent, locale });
    if (device && devices[device]) {
      // Close the default context and browser created in createSession
      await s.context.close();
      await s.browser.close();
      
      const browser = await launchChromium();
      const ctx = await browser.newContext({ ...devices[device], acceptDownloads: true, recordVideo: { dir: path.join(STORAGE_DIR, 'videos') } });
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
  const actions: Action[] = Array.isArray(req.body?.actions) ? req.body.actions : [];
  const outputs = await runActions(s, actions);
  res.json({ ok: true, outputs, artifacts: s.downloads });
});

app.post('/session/:id/snapshot', auth, async (req, res) => {
  const s = SESSIONS.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'session_not_found' });
  const [html, a11ySnap, buf] = await Promise.all([
    s.page.content(),
    s.page.accessibility ? s.page.accessibility.snapshot().catch(() => null) : Promise.resolve(null),
    s.page.screenshot({ type: 'jpeg', quality: 60 })
  ]);
  const name = `snap-${Date.now()}.jpg`;
  const p = path.join(STORAGE_DIR, 'shots', name);
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, buf);
  res.json({ dom: html.slice(0, 100000), a11y: a11ySnap, screenshot: `/shots/${name}` });
});

app.post('/session/:id/extract', auth, async (req, res) => {
  const s = SESSIONS.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'session_not_found' });
  const schema = req.body?.schema;
  if (!schema) return res.status(400).json({ error: 'schema_required' });
  const outputs = await runActions(s, [{ type: 'extract', schema }]);
  const out = outputs.find(o => o.type === 'extract');
  res.json({ json: out?.json, confidence: out?.confidence ?? 0.7 });
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
    ws.on('close', () => { running = false; s.ws = undefined; });
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
      } catch {}
    });
    const loop = async () => {
      while (running) {
        try {
          s.lastActiveAt = Date.now();
          const buf = await s.page.screenshot({ type: 'jpeg', quality: s.streamQuality });
          ws.send(JSON.stringify({ type: 'frame', jpegBase64: buf.toString('base64'), ts: Date.now(), w: s.viewport.width, h: s.viewport.height }));
          const delay = Math.max(33, Math.round(1000 / Math.max(1, Math.min(30, s.streamFps || 5))));
          await new Promise(r => setTimeout(r, delay));
        } catch (e) {
          break;
        }
      }
    };
    loop();
  });
});
