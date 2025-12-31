import { Builder } from '../system/Builder';
import { Analyst } from '../system/Analyst';
import fs from 'fs';
import path from 'path';
import { ToolDefinition, ToolExecutionResult } from './types';
import { Buffer } from 'buffer';
import { config } from '../config';
import { spawn } from 'child_process';
import os from 'os';
import { JSDOM } from 'jsdom';
import { search as ddgSearch } from 'duck-duck-scrape';
import { Readability } from '@mozilla/readability';

const ARTIFACT_DIR = process.env.ARTIFACT_DIR || '/tmp/joe-artifacts';
if (!fs.existsSync(ARTIFACT_DIR)) {
  try { fs.mkdirSync(ARTIFACT_DIR, { recursive: true }); } catch {}
}

let browserWorkerBoot: Promise<void> | null = null;

function repoRoot() {
  const cwd = process.cwd();
  if (path.basename(cwd) === 'api') return path.resolve(cwd, '..');
  return cwd;
}

function resolveToolPath(p: string) {
  const root = repoRoot();
  const val = String(p ?? '').trim();
  if (!val || val === '.') return root;
  if (path.isAbsolute(val)) return val;
  const fromCwd = path.resolve(process.cwd(), val);
  if (fs.existsSync(fromCwd)) return fromCwd;
  return path.resolve(root, val);
}

function isLocalWorkerUrl(base: string) {
  try {
    const u = new URL(base);
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

async function waitForWorkerHealth(base: string, timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${base}/health`, { method: 'GET' });
      if (r.ok) {
        const contentType = String(r.headers.get('content-type') || '').toLowerCase();
        if (!contentType.includes('application/json')) {
          await r.text().catch(() => '');
        } else {
          const j: any = await r.json().catch(() => null);
          if (j && String(j.status || '').toUpperCase() === 'OK') return true;
        }
      } else {
        await r.text().catch(() => '');
      }
    } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
}

async function ensureBrowserWorker(base: string, key: string, logs: string[]) {
  // Performance: Reduce health check timeout and frequency
  const autoSetting = String(process.env.AUTO_START_BROWSER_WORKER ?? '').trim().toLowerCase();
  const auto =
    autoSetting === ''
      ? true
      : autoSetting === '1' || autoSetting === 'true' || autoSetting === 'yes';

  if (!auto || process.env.NODE_ENV === 'production' || !isLocalWorkerUrl(base)) return;
  
  // Quick check first (50ms)
  const healthy = await waitForWorkerHealth(base, 50);
  if (healthy) return;


  if (!browserWorkerBoot) {
    browserWorkerBoot = (async () => {
      const root = repoRoot();
      const workerDir = path.join(root, 'services', 'joe-browser-worker');
      const workerEnv = { ...process.env, PORT: String(new URL(base).port || 7070), WORKER_API_KEY: key };
      logs.push(`worker_autostart=1 base=${base}`);

      const runAndWait = (
        command: string,
        args: string[],
        opts: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number }
      ) =>
        new Promise<void>((resolve, reject) => {
          const child = spawn(command, args, { cwd: opts.cwd, env: opts.env, stdio: 'ignore' });
          const timer = setTimeout(() => {
            try {
              child.kill('SIGKILL');
            } catch {}
            reject(new Error(`worker_cmd_timeout cmd=${command} args=${args.join(' ')}`));
          }, opts.timeoutMs);
          child.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
          });
          child.on('close', (code) => {
            clearTimeout(timer);
            if (code === 0) resolve();
            else reject(new Error(`worker_cmd_failed cmd=${command} exit=${code}`));
          });
        });

      const hasNodeModules = fs.existsSync(path.join(workerDir, 'node_modules'));
      if (!hasNodeModules) {
        logs.push('worker_install=1');
        await runAndWait('npm', ['--prefix', workerDir, 'install', '--silent'], {
          cwd: root,
          env: workerEnv,
          timeoutMs: 10 * 60 * 1000,
        });
      }

      const autoInstallSetting = String(process.env.AUTO_INSTALL_PLAYWRIGHT ?? '').trim().toLowerCase();
      const autoInstall =
        autoInstallSetting === ''
          ? true
          : autoInstallSetting === '1' || autoInstallSetting === 'true' || autoInstallSetting === 'yes';

      const hasChromium = (() => {
        const envPath = String(process.env.PLAYWRIGHT_BROWSERS_PATH || '').trim();
        const rootCandidates: string[] = [];
        if (envPath && envPath !== '0') rootCandidates.push(envPath);
        rootCandidates.push(path.join(workerDir, 'node_modules', 'playwright', '.local-browsers'));

        const home = os.homedir();
        if (home) {
          rootCandidates.push(path.join(home, 'Library', 'Caches', 'ms-playwright'));
          rootCandidates.push(path.join(home, '.cache', 'ms-playwright'));
          rootCandidates.push(path.join(home, 'AppData', 'Local', 'ms-playwright'));
        }

        for (const dir of rootCandidates) {
          try {
            if (!fs.existsSync(dir)) continue;
            const entries = fs.readdirSync(dir);
            if (entries.some((e) => /chromium/i.test(e))) return true;
          } catch {}
        }
        return false;
      })();

      if (autoInstall && !hasChromium) {
        logs.push('worker_playwright_install=1');
        await runAndWait('npm', ['--prefix', workerDir, 'run', 'install-chromium'], {
          cwd: root,
          env: workerEnv,
          timeoutMs: 10 * 60 * 1000,
        });
      }

      const child = spawn('npm', ['--prefix', workerDir, 'run', 'dev'], {
        cwd: root,
        env: workerEnv,
        stdio: 'ignore',
        detached: true,
      });
      child.unref();
      const ok = await waitForWorkerHealth(base, 20000);
      if (!ok) throw new Error(`worker_autostart_failed base=${base}`);
    })();
  }

  await browserWorkerBoot;
}

function isProbablyHtml(text: string, contentType?: string | null) {
  const ct = String(contentType || '').toLowerCase();
  if (ct.includes('text/html')) return true;
  const t = String(text || '').trimStart().toLowerCase();
  return t.startsWith('<!doctype html') || t.startsWith('<html') || t.includes('<head') || t.includes('<body');
}

async function workerHealthOrThrow(base: string, logs: string[]) {
  const healthy = await waitForWorkerHealth(base, 2500);
  logs.push(`worker_health=${healthy ? 1 : 0}`);
  if (!healthy) {
    throw new Error(`worker_unhealthy base=${base}`);
  }
}

async function formatWorkerHttpError(resp: any, base: string) {
  const status = resp.status;
  const contentType = resp.headers?.get?.('content-type');
  const text = await resp.text().catch(() => '');
  if (isProbablyHtml(text, contentType)) {
    return `worker_error=${status} base=${base} (HTML response detected)`;
  }
  const snippet = String(text || '').replace(/\s+/g, ' ').slice(0, 300);
  return `worker_error=${status} base=${base} ${snippet}`.trim();
}

export const tools: ToolDefinition[] = [
  {
    name: 'browser_open',
    description: 'Opens a real browser session to a URL. Use this to view live websites, search Google/Bing, or debug UI. Returns a sessionId and a WebSocket URL for live streaming.',
    version: '1.0.0',
    tags: ['browser', 'agent', 'stream'],
    inputSchema: { type: 'object', properties: { viewport: { type: 'object' }, url: { type: 'string' }, device: { type: 'string' } }, required: ['url'] },
    outputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, wsUrl: { type: 'string' } } },
    permissions: ['internet'],
    sideEffects: [],
    rateLimitPerMinute: 20,
    auditFields: ['url'],
    mockSupported: false,
    async execute(input) {
      const logs: string[] = [];
      const key = config.browserWorkerKey;
      const base = config.browserWorkerUrl;
      try {
        await ensureBrowserWorker(base, key, logs);
        await workerHealthOrThrow(base, logs);
        const resp = await fetch(`${base}/session/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-worker-key': key },
          body: JSON.stringify({ viewport: input?.viewport, device: input?.device })
        });
        if (!resp.ok) {
          return { ok: false, error: await formatWorkerHttpError(resp, base), logs };
        }
        const j = await resp.json();
        const sessionId = j.sessionId;
        const wsUrl = `/browser/ws/${encodeURIComponent(String(sessionId))}`;
        // Navigate
        const nav = await fetch(`${base}/session/${encodeURIComponent(sessionId)}/job/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-worker-key': key },
          body: JSON.stringify({ actions: [{ type: 'goto', url: String(input?.url || 'https://www.google.com'), waitUntil: 'domcontentloaded' }] })
        });
        if (!nav.ok) {
          logs.push(`nav_error=${nav.status}`);
          const errDetail = await formatWorkerHttpError(nav, base);
          return { ok: false, error: `Browser navigation failed: ${errDetail}`, logs };
        }
        const artifacts = [
          { name: 'Agent Browser Stream', href: wsUrl, kind: 'browser_stream' }
        ];
        return { ok: true, output: { sessionId, wsUrl }, logs, artifacts };
      } catch (e: any) {
        const msg = e.message || String(e);
        const cause = e.cause ? ` cause=${String(e.cause)}` : '';
        logs.push(`error=${msg}${cause}`);
        console.error(`[browser_open] failed: ${msg}${cause}`);
        return { ok: false, error: msg + cause, logs };
      }
    }
  },
  {
    name: 'browser_run',
    version: '1.0.0',
    tags: ['browser', 'agent'],
    inputSchema: { 
      type: 'object', 
      properties: { 
        sessionId: { type: 'string' }, 
        actions: { 
          type: 'array',
          items: { 
            type: 'object',
            properties: {
              type: { type: 'string', description: 'Action type (e.g. goto, click, type, scroll, wait)' },
              url: { type: 'string' },
              selector: { type: 'string' },
              text: { type: 'string' },
              key: { type: 'string' }
            },
            required: ['type'],
            additionalProperties: true
          }
        } 
      }, 
      required: ['sessionId', 'actions'] 
    },
    outputSchema: { type: 'object', properties: { outputs: { type: 'array' } } },
    permissions: ['internet'],
    sideEffects: [],
    rateLimitPerMinute: 30,
    auditFields: ['sessionId'],
    mockSupported: false,
    async execute(input) {
      const key = config.browserWorkerKey;
      const base = config.browserWorkerUrl;
      const logs: string[] = [];
      try {
        await ensureBrowserWorker(base, key, logs);
      } catch {}
      try {
        await workerHealthOrThrow(base, logs);
      } catch (e: any) {
        return { ok: false, error: e?.message || String(e), logs };
      }
      const resp = await fetch(`${base}/session/${encodeURIComponent(String(input?.sessionId))}/job/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-worker-key': key },
        body: JSON.stringify({ actions: input?.actions || [] })
      });
      if (!resp.ok) {
        return { ok: false, error: await formatWorkerHttpError(resp, base), logs };
      }
      const j = await resp.json();
      const artifacts = (j.artifacts || []).map((a: any) => ({ name: a.filename, href: `${base}/downloads/${encodeURIComponent(path.basename(a.href))}` }));
      return { ok: true, output: { outputs: j.outputs }, logs, artifacts };
    }
  },
  {
    name: 'browser_extract',
    version: '1.0.0',
    tags: ['browser', 'extract'],
    inputSchema: { type: 'object', properties: { sessionId: { type: 'string' }, schema: { type: 'object' } }, required: ['sessionId', 'schema'] },
    outputSchema: { type: 'object', properties: { json: { type: 'object' }, confidence: { type: 'number' } } },
    permissions: ['internet'],
    sideEffects: [],
    rateLimitPerMinute: 20,
    auditFields: ['sessionId'],
    mockSupported: false,
    async execute(input) {
      const key = config.browserWorkerKey;
      const base = config.browserWorkerUrl;
      const logs: string[] = [];
      try {
        await ensureBrowserWorker(base, key, logs);
      } catch {}
      try {
        await workerHealthOrThrow(base, logs);
      } catch (e: any) {
        return { ok: false, error: e?.message || String(e), logs };
      }
      const resp = await fetch(`${base}/session/${encodeURIComponent(String(input?.sessionId))}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-worker-key': key },
        body: JSON.stringify({ schema: input?.schema })
      });
      if (!resp.ok) {
        return { ok: false, error: await formatWorkerHttpError(resp, base), logs };
      }
      const j = await resp.json();
      return { ok: true, output: { json: j.json, confidence: j.confidence }, logs };
    }
  },
  {
    name: 'browser_get_state',
    description: 'Captures the current state of the browser (DOM, Accessibility Tree, Screenshot). Use this to "see" the page content after navigation.',
    version: '1.0.0',
    tags: ['browser', 'snapshot'],
    inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] },
    outputSchema: { type: 'object', properties: { dom: { type: 'string' }, a11y: { type: 'object' }, screenshot: { type: 'string' } } },
    permissions: ['internet'],
    sideEffects: [],
    rateLimitPerMinute: 30,
    auditFields: ['sessionId'],
    mockSupported: false,
    async execute(input) {
      const key = config.browserWorkerKey;
      const base = config.browserWorkerUrl;
      const logs: string[] = [];
      try {
        await ensureBrowserWorker(base, key, logs);
      } catch {}
      try {
        await workerHealthOrThrow(base, logs);
      } catch (e: any) {
        return { ok: false, error: e?.message || String(e), logs };
      }
      const resp = await fetch(`${base}/session/${encodeURIComponent(String(input?.sessionId))}/snapshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-worker-key': key }
      });
      if (!resp.ok) {
        return { ok: false, error: await formatWorkerHttpError(resp, base), logs };
      }
      const j = await resp.json();
      // User requested to hide screenshots from chat. We keep the data in output for internal use (or potential future use),
      // but we do NOT emit an artifact so the UI doesn't show a large image.
      // const artifacts = [{ name: 'snapshot.jpg', href: `${base}/shots/${path.basename(j.screenshot)}` }];
      const domLen = (j.dom || '').length;
      const a11yNodes = j.a11y ? JSON.stringify(j.a11y).length : 0;
      logs.push(`dom_len=${domLen} a11y_len=${a11yNodes} shot=${j.screenshot}`);
      
      let finalDom = j.dom || '';
      
      // Clean DOM: Remove scripts and styles to save tokens
      finalDom = finalDom.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "");
      finalDom = finalDom.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, "");
      finalDom = finalDom.replace(/<!--[\s\S]*?-->/g, ""); // Remove comments
      finalDom = finalDom.replace(/\s+/g, " ").trim(); // Collapse whitespace

      const MAX_DOM_LEN = 50000;
      if (finalDom.length > MAX_DOM_LEN) {
        logs.push(`warn_dom_truncated: DOM length ${finalDom.length} > ${MAX_DOM_LEN}. Truncating.`);
        // Try to keep the body content if possible
        const bodyMatch = finalDom.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        if (bodyMatch && bodyMatch[1]) {
            finalDom = bodyMatch[1].slice(0, MAX_DOM_LEN);
        } else {
            finalDom = finalDom.slice(0, MAX_DOM_LEN);
        }
        finalDom += '\n...[DOM Truncated]...';
      }

      if (domLen < 500) {
        logs.push(`warn_empty_dom: DOM is very short (${domLen} chars). Page might be empty or loading.`);
      }
      return { ok: true, output: { dom: finalDom, a11y: j.a11y, screenshot: j.screenshot }, logs };
    }
  },
  {
    name: 'echo',
    version: '1.0.0',
    tags: ['utility', 'string'],
    inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    outputSchema: { type: 'object', properties: { text: { type: 'string' } } },
    permissions: [],
    sideEffects: [],
    rateLimitPerMinute: 120,
    auditFields: ['text'],
    mockSupported: true,
  },
  {
    name: 'image_generate',
    version: '1.0.0',
    tags: ['ai', 'image', 'artifact'],
    inputSchema: { 
      type: 'object', 
      properties: { 
        prompt: { type: 'string' }, 
        size: { type: 'string', enum: ['512x512', '768x768', '1024x1024'] } 
      }, 
      required: ['prompt'] 
    },
    outputSchema: { type: 'object', properties: { href: { type: 'string' } } },
    permissions: ['read'],
    sideEffects: [],
    rateLimitPerMinute: 20,
    auditFields: ['prompt'],
    mockSupported: false,
  },
  {
    name: 'http_fetch',
    version: '1.0.0',
    tags: ['network', 'http'],
    inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    outputSchema: { type: 'object', properties: { status: { type: 'number' }, bodySnippet: { type: 'string' } } },
    permissions: ['read'],
    sideEffects: [],
    rateLimitPerMinute: 60,
    auditFields: ['url'],
    mockSupported: true,
  },
  {
    name: 'html_extract',
    version: '1.0.0',
    tags: ['network', 'html', 'extract'],
    inputSchema: { type: 'object', properties: { url: { type: 'string' }, render: { type: 'boolean' } }, required: ['url'] },
    outputSchema: { type: 'object', properties: { title: { type: 'string' }, metaDescription: { type: 'string' }, headings: { type: 'array', items: { type: 'string' } }, links: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, url: { type: 'string' } } } }, textSnippet: { type: 'string' }, url: { type: 'string' }, rendered: { type: 'boolean' } } },
    permissions: ['read'],
    sideEffects: [],
    rateLimitPerMinute: 30,
    auditFields: ['url'],
    mockSupported: false,
  },
  {
    name: 'rss_fetch',
    version: '1.0.0',
    tags: ['network', 'rss'],
    inputSchema: { type: 'object', properties: { url: { type: 'string' }, limit: { type: 'number' } }, required: ['url'] },
    outputSchema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, link: { type: 'string' }, pubDate: { type: 'string' }, description: { type: 'string' } } } } } },
    permissions: ['read'],
    sideEffects: [],
    rateLimitPerMinute: 20,
    auditFields: ['url'],
    mockSupported: false,
  },
  {
    name: 'json_query',
    version: '1.0.0',
    tags: ['data', 'json'],
    inputSchema: { type: 'object', properties: { json: { type: 'object' }, path: { type: 'string' } }, required: ['json', 'path'] },
    outputSchema: { type: 'object', properties: { value: { type: ['object', 'string', 'number', 'boolean', 'null'] } } },
    permissions: ['read'],
    sideEffects: [],
    rateLimitPerMinute: 120,
    auditFields: ['path'],
    mockSupported: true,
  },
  {
    name: 'csv_parse',
    version: '1.0.0',
    tags: ['data', 'csv'],
    inputSchema: { type: 'object', properties: { csv: { type: 'string' }, delimiter: { type: 'string' } }, required: ['csv'] },
    outputSchema: { type: 'object', properties: { headers: { type: 'array', items: { type: 'string' } }, rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } } } },
    permissions: ['read'],
    sideEffects: [],
    rateLimitPerMinute: 120,
    auditFields: [],
    mockSupported: true,
  },
  {
    name: 'text_summarize',
    version: '1.0.0',
    tags: ['nlp', 'summarize'],
    inputSchema: { type: 'object', properties: { text: { type: 'string' }, maxSentences: { type: 'number' } }, required: ['text'] },
    outputSchema: { type: 'object', properties: { summary: { type: 'string' } } },
    permissions: ['read'],
    sideEffects: [],
    rateLimitPerMinute: 120,
    auditFields: [],
    mockSupported: true,
  },
  {
    name: 'file_write',
    version: '1.0.0',
    tags: ['fs', 'artifact'],
    inputSchema: { type: 'object', properties: { filename: { type: 'string' }, content: { type: 'string' } }, required: ['filename', 'content'] },
    outputSchema: { type: 'object', properties: { href: { type: 'string' } } },
    permissions: ['write'],
    sideEffects: ['write'],
    rateLimitPerMinute: 60,
    auditFields: ['filename'],
    mockSupported: false,
  },
  {
    name: 'grep_search',
    version: '1.0.0',
    tags: ['fs', 'search', 'grep'],
    inputSchema: { 
      type: 'object', 
      properties: { 
        query: { type: 'string' }, 
        path: { type: 'string' },
        include: { type: 'string' },
        exclude: { type: 'string' }
      }, 
      required: ['query'] 
    },
    outputSchema: { type: 'object', properties: { matches: { type: 'array', items: { type: 'string' } } } },
    permissions: ['read'],
    sideEffects: [],
    rateLimitPerMinute: 60,
    auditFields: ['query'],
    mockSupported: true,
  },
  {
    name: 'scaffold_project',
    version: '1.0.0',
    tags: ['fs', 'scaffold', 'batch'],
    inputSchema: { 
      type: 'object', 
      properties: { 
        structure: { 
          type: 'object',
          description: 'Key-value pairs where key is file path and value is content (string) or null (for directory)'
        },
        baseDir: { type: 'string' }
      }, 
      required: ['structure'] 
    },
    outputSchema: { type: 'object', properties: { created: { type: 'array', items: { type: 'string' } } } },
    permissions: ['write'],
    sideEffects: ['write'],
    rateLimitPerMinute: 10,
    auditFields: [],
    mockSupported: true,
  },
  {
    name: 'scaffold_full_stack',
    version: '1.0.0',
    tags: ['fs', 'scaffold', 'stack'],
    inputSchema: { 
      type: 'object', 
      properties: { 
        name: { type: 'string', description: 'Project name (e.g., "viva-store")' },
        type: { type: 'string', enum: ['ecommerce', 'saas', 'blog'], default: 'ecommerce' },
        features: { type: 'array', items: { type: 'string' }, description: 'List of features to scaffold (e.g. ["auth", "products", "cart"])' }
      },
      required: ['name']
    },
    outputSchema: { type: 'object', properties: { path: { type: 'string' }, info: { type: 'string' } } },
    permissions: ['write'],
    sideEffects: ['write'],
    rateLimitPerMinute: 5,
    auditFields: ['name'],
    mockSupported: true,
  },
  {
    name: 'analyze_codebase',
    version: '1.0.0',
    tags: ['analysis', 'system'],
    inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
    outputSchema: { type: 'object', properties: { summary: { type: 'string' } } },
    permissions: ['read'],
    sideEffects: [],
    rateLimitPerMinute: 10,
    auditFields: [],
    mockSupported: true,
  },
  {
    name: 'check_syntax',
    version: '1.0.0',
    tags: ['dev', 'debug'],
    inputSchema: { type: 'object', properties: { filename: { type: 'string' } }, required: ['filename'] },
    outputSchema: { type: 'object', properties: { status: { type: 'string' }, errors: { type: 'string' } } },
    permissions: ['read', 'execute'],
    sideEffects: [],
    rateLimitPerMinute: 60,
    auditFields: ['filename'],
    mockSupported: true,
  },
  {
    name: 'generate_tests',
    version: '1.0.0',
    tags: ['dev', 'test', 'ai'],
    inputSchema: { type: 'object', properties: { filename: { type: 'string' } }, required: ['filename'] },
    outputSchema: { type: 'object', properties: { testFile: { type: 'string' } } },
    permissions: ['read', 'write'],
    sideEffects: ['write'],
    rateLimitPerMinute: 20,
    auditFields: ['filename'],
    mockSupported: true,
  },
  {
    name: 'db_inspect',
    version: '1.0.0',
    tags: ['db', 'inspect'],
    inputSchema: { type: 'object', properties: { connectionString: { type: 'string' } } },
    outputSchema: { type: 'object', properties: { collections: { type: 'object' } } },
    permissions: ['read'],
    sideEffects: [],
    rateLimitPerMinute: 30,
    auditFields: [],
    mockSupported: true,
  },
  {
    name: 'generate_docs',
    version: '1.0.0',
    tags: ['dev', 'docs', 'ai'],
    inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
    outputSchema: { type: 'object', properties: { file: { type: 'string' } } },
    permissions: ['read', 'write'],
    sideEffects: ['write'],
    rateLimitPerMinute: 10,
    auditFields: ['path'],
    mockSupported: true,
  },
  {
    name: 'git_ops',
    version: '1.0.0',
    tags: ['dev', 'git'],
    inputSchema: { 
      type: 'object', 
      properties: { 
        operation: { type: 'string', enum: ['status', 'add', 'commit', 'push', 'checkout', 'log', 'fetch', 'pull', 'clone'] },
        args: { type: 'array', items: { type: 'string' } },
        sessionId: { type: 'string' }
      },
      required: ['operation']
    },
    outputSchema: { type: 'object', properties: { output: { type: 'string' } } },
    permissions: ['read', 'write', 'execute'],
    sideEffects: ['write', 'execute'],
    rateLimitPerMinute: 60,
    auditFields: ['operation'],
    mockSupported: true,
  },
  {
    name: 'github_create_repo',
    version: '1.0.0',
    tags: ['dev', 'github'],
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        private: { type: 'boolean' },
        description: { type: 'string' },
        sessionId: { type: 'string' },
      },
      required: ['name'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        fullName: { type: 'string' },
        htmlUrl: { type: 'string' },
        apiUrl: { type: 'string' },
      },
    },
    permissions: ['read', 'write'],
    sideEffects: ['write'],
    rateLimitPerMinute: 20,
    auditFields: ['name'],
    mockSupported: true,
  },
  {
    name: 'npm_manager',
    version: '1.0.0',
    tags: ['dev', 'npm'],
    inputSchema: { 
      type: 'object', 
      properties: { 
        command: { type: 'string', enum: ['install', 'uninstall', 'list', 'audit', 'run'] },
        packages: { type: 'array', items: { type: 'string' } },
        dev: { type: 'boolean' }
      },
      required: ['command']
    },
    outputSchema: { type: 'object', properties: { output: { type: 'string' } } },
    permissions: ['read', 'write', 'execute'],
    sideEffects: ['write', 'execute'],
    rateLimitPerMinute: 20,
    auditFields: ['command', 'packages'],
    mockSupported: true,
  },
  {
    name: 'deep_research',
    version: '1.0.0',
    tags: ['ai', 'research', 'agent'],
    inputSchema: { type: 'object', properties: { topic: { type: 'string' } }, required: ['topic'] },
    outputSchema: { type: 'object', properties: { report: { type: 'string' }, sources: { type: 'array', items: { type: 'string' } } } },
    permissions: ['read', 'internet'],
    sideEffects: [],
    rateLimitPerMinute: 5,
    auditFields: ['topic'],
    mockSupported: false,
    description: 'Perform a comprehensive deep dive into a topic. Uses recursive search, browsing, and synthesis to generate a detailed report. Best for "analyze", "research", or complex questions requiring multiple sources.',
    async execute(input) {
      const topic = String(input?.topic || '').trim();
      const logs: string[] = [];
      logs.push(`start_deep_research topic=${topic}`);
      
      try {
          // 1. Initial Search
          const searchRes = await executeTool('web_search', { query: topic });
          const items = searchRes.output?.results || [];
          if (!items.length) {
              return { ok: false, error: 'No initial search results found', logs };
          }
          
          // 2. Select top 5 for deep reading
          const toRead = items.slice(0, 5);
          logs.push(`reading_count=${toRead.length}`);
          
          // 3. Read pages in parallel
          const contents = await Promise.all(toRead.map(async (item: any) => {
              const ext = await executeTool('html_extract', { url: item.url });
              return {
                  title: item.title,
                  url: item.url,
                  content: ext.output?.textSnippet || item.description || ''
              };
          }));
          
          // 4. Synthesize Report using LLM
          const context = contents.map((c, i) => `[${i+1}] ${c.title} (${c.url})\n${c.content}\n---`).join('\n');
          
          const oai = String(process.env.OPENAI_API_KEY || process.env.AI_GATEWAY_API_KEY || process.env.OPEN_ROUTER_API_KEY || '').trim();
          const baseUrl = String(process.env.OPENAI_BASE_URL || (process.env.OPEN_ROUTER_API_KEY ? 'https://openrouter.ai/api/v1' : '') || '').trim();
          const gkey = String(process.env.GOOGLE_API_KEY || '').trim();
          
          let report = '';
          
          if (oai) {
             try {
                 const { default: OpenAI } = await import('openai');
                 const client = new OpenAI({ apiKey: oai, baseURL: baseUrl || undefined });
                 const completion = await client.chat.completions.create({
                     model: 'gpt-4o', // Use strong model
                     messages: [
                         { role: 'system', content: 'You are a deep research assistant. Write a comprehensive, detailed report based on the provided sources. Structure with headings. Cite sources inline like [1].' },
                         { role: 'user', content: `Topic: ${topic}\n\nSources:\n${context}` }
                     ]
                 });
                 report = completion.choices[0].message.content || '';
             } catch (e: any) { logs.push(`openai_err=${e.message}`); }
          }
          
          if (!report && gkey) {
             try {
                 const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(gkey)}`;
                 const body = {
                    contents: [{ role: 'user', parts: [{ text: `Write a comprehensive research report on: ${topic}\n\nSources:\n${context}` }] }]
                 };
                 const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                 const j: any = await r.json().catch(() => null);
                 report = String(j?.candidates?.[0]?.content?.parts?.[0]?.text || '');
             } catch (e: any) { logs.push(`gemini_err=${e.message}`); }
          }
          
          if (!report) {
             report = 'Unable to generate report (AI keys missing or failed). Here is the raw data:\n\n' + context.slice(0, 2000);
          }
          
          return { ok: true, output: { report, sources: toRead.map((x: any) => x.url) }, logs };
      } catch (e: any) {
          return { ok: false, error: e.message, logs };
      }
    }
  },
  {
    name: 'web_search',
    version: '1.0.0',
    tags: ['network', 'search'],
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    outputSchema: { type: 'object', properties: { results: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, url: { type: 'string' }, description: { type: 'string' } } } } } },
    permissions: ['read'],
    sideEffects: [],
    rateLimitPerMinute: 10,
    auditFields: ['query'],
    mockSupported: false,
    description: 'Perform a standard web search (like Google/DuckDuckGo). Best for quick facts, current events, or checking if a library exists. Returns a list of titles and snippets. Use deep_research for complex topics.',
    async execute(input) {
      const query = String(input?.query || '').trim();
      const logs: string[] = [];
      const debug = true; // Force debug for now
      let allResults: any[] = [];

      console.log(`[web_search] called with query: ${query}`);

      // Helper for parallel execution
      const searchTasks: Promise<void>[] = [];

      // 1. DuckDuckGo (via library)
      searchTasks.push((async () => {
        try {
          console.log(`[web_search] fetching DDG (lib): ${query}`);
          const searchRes = await ddgSearch(query); 
          
          if (searchRes.results && searchRes.results.length) {
            const mapped = searchRes.results.map((r: any) => ({
              title: r.title || '',
              url: r.url || '',
              description: r.description || '', 
              source: 'duckduckgo'
            })).filter((x: any) => x.url && x.title);

            logs.push(`ddg_results=${mapped.length}`);
            allResults.push(...mapped);
          }
        } catch (e) {
          console.error(`[DEBUG] DDG failed: ${e}`);
        }
      })());

      // 2. Google Search (Scraping)
      searchTasks.push((async () => {
        try {
           const lang = /[\u0600-\u06FF]/.test(query) ? 'ar' : 'en';
           const gUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=${lang}&num=10`;
           if (debug) console.log(`[DEBUG] fetching Google: ${gUrl}`);

           const controller = new AbortController();
           const timeoutId = setTimeout(() => controller.abort(), 6000);
           try {
             const r = await fetch(gUrl, {
               headers: {
                 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                 'Accept-Language': lang,
                 'Cookie': 'CONSENT=YES+Cb.20210328-17-p0.en+FX+410;'
               },
               signal: controller.signal
             });
             
             if (r.ok) {
               const html = await r.text();
               if (debug) console.log(`[DEBUG] Google html snippet: ${html.slice(0, 500)}`);
               const dom = new JSDOM(html);
               const doc = dom.window.document;
               
               // Debug selectors
               const h3s = doc.querySelectorAll('h3');
               if (debug) console.log(`[DEBUG] Google h3 count: ${h3s.length}`);

               // Generic Google selectors
               let items = Array.from(doc.querySelectorAll('.g'));
               if (!items.length) items = Array.from(doc.querySelectorAll('div[data-hveid]'));
               
               if (debug) console.log(`[DEBUG] Google items found: ${items.length}`);
               const results = items.map(div => {
                  const h3 = div.querySelector('h3');
                  const a = div.querySelector('a');
                  const snippet = div.querySelector('.VwiC3b, .IsZvec, .aCOpRe') || div.querySelector('div[style*="-webkit-line-clamp"]');
                  
                  return {
                    title: h3?.textContent?.trim() || '',
                    url: a?.getAttribute('href') || '',
                    description: snippet?.textContent?.trim() || '',
                    source: 'google'
                  };
               }).filter(x => x.url && x.url.startsWith('http') && x.title);
               
               if (results.length) {
                  logs.push(`google_results=${results.length}`);
                  allResults.push(...results);
               }
             }
           } finally {
             clearTimeout(timeoutId);
           }
        } catch (e) {
           if (debug) console.log(`[DEBUG] Google failed: ${e}`);
        }
      })());

      // Wait for both DDG and Google (parallel)
      await Promise.allSettled(searchTasks);

      // 3. Fallback to Bing if we have few results (< 3)
      if (allResults.length < 3) {
        try {
          const lang = /[\u0600-\u06FF]/.test(query) ? 'ar' : 'en';
          const bUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=${lang}`;
          // ... Bing logic ...
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);
          try {
             const r2 = await fetch(bUrl, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                  'Accept-Language': lang,
                },
                signal: controller.signal,
             });
             if (r2.ok) {
               const html = await r2.text();
               const dom = new JSDOM(html);
               const doc = dom.window.document;
               let items = Array.from(doc.querySelectorAll('li.b_algo'));
               if (!items.length) items = Array.from(doc.querySelectorAll('.b_algo'));
               const results = items.map(li => {
                  const h2 = li.querySelector('h2 a');
                  const p = li.querySelector('p');
                  return {
                    title: h2?.textContent?.trim() || '',
                    url: h2?.getAttribute('href') || '',
                    description: p?.textContent?.trim() || '',
                    source: 'bing'
                  };
               }).filter(x => x.url && x.title);
               if (results.length) {
                 logs.push(`bing_results=${results.length}`);
                 allResults.push(...results);
               }
             }
          } finally {
            clearTimeout(timeoutId);
          }
        } catch(e) {}
      }

      // 4. Fallback to Browser Worker if no results
      if (allResults.length === 0) {
        try {
           console.log('[web_search] No results from fetch, falling back to browser worker...');
           await ensureBrowserWorker(config.browserWorkerUrl, config.browserWorkerKey, logs);
           console.log('[web_search] Worker ensured');
           
           const lang = /[\u0600-\u06FF]/.test(query) ? 'ar' : 'en';
           const gUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=${lang}&num=10`;
           
           console.log(`[web_search] Worker creating session...`);
           const createRes = await fetch(`${config.browserWorkerUrl}/session/create`, {
               method: 'POST',
               headers: { 'Content-Type': 'application/json', 'x-worker-key': config.browserWorkerKey },
               body: JSON.stringify({ viewport: { width: 1280, height: 800 } })
           });

           if (!createRes.ok) {
               const txt = await createRes.text();
               throw new Error(`Session create failed: ${createRes.status} ${txt}`);
           }

           const { sessionId } = await createRes.json();
           console.log(`[web_search] Worker session: ${sessionId}`);

           try {
               console.log(`[web_search] Worker navigating: ${gUrl}`);
               const runRes = await fetch(`${config.browserWorkerUrl}/session/${sessionId}/job/run`, {
                   method: 'POST',
                   headers: { 'Content-Type': 'application/json', 'x-worker-key': config.browserWorkerKey },
                   body: JSON.stringify({
                       actions: [
                           { type: 'goto', url: gUrl, waitUntil: 'domcontentloaded' },
                           { type: 'wait', ms: 2000 }
                       ]
                   })
               });

               if (!runRes.ok) {
                   console.error(`[web_search] Worker run failed: ${runRes.status}`);
               }

               console.log(`[web_search] Worker snapshotting...`);
               const snapRes = await fetch(`${config.browserWorkerUrl}/session/${sessionId}/snapshot`, {
                   method: 'POST',
                   headers: { 'Content-Type': 'application/json', 'x-worker-key': config.browserWorkerKey },
                   body: JSON.stringify({})
               });

               if (snapRes.ok) {
                   const json: any = await snapRes.json();
                   const html = json.dom || '';
                   console.log(`[web_search] Worker HTML len: ${html.length}`);
                   if (html.length < 10000) {
                       console.log(`[web_search] Worker HTML snippet: ${html.slice(0, 500)}`);
                   }
                   
                   const dom = new JSDOM(html);
                   const doc = dom.window.document;
                   
                   let items = Array.from(doc.querySelectorAll('.g'));
                   if (!items.length) items = Array.from(doc.querySelectorAll('div[data-hveid]'));
                   console.log(`[web_search] Worker items found: ${items.length}`);
                   
                   const results = items.map(div => {
                       const h3 = div.querySelector('h3');
                       const a = div.querySelector('a');
                       const snippet = div.querySelector('.VwiC3b, .IsZvec, .aCOpRe') || div.querySelector('div[style*="-webkit-line-clamp"]');
                       
                       return {
                         title: h3?.textContent?.trim() || '',
                         url: a?.getAttribute('href') || '',
                         description: snippet?.textContent?.trim() || '',
                         source: 'google_browser'
                       };
                    }).filter(x => x.url && x.url.startsWith('http') && x.title);
                    
                    if (results.length) {
                       logs.push(`google_browser_results=${results.length}`);
                       allResults.push(...results);
                    } else {
                        // Try DuckDuckGo in worker if Google failed
                        console.log('[web_search] Worker Google failed (0 items), trying DuckDuckGo...');
                        const ddgUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&t=h_`;
                        
                        await fetch(`${config.browserWorkerUrl}/session/${sessionId}/job/run`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'x-worker-key': config.browserWorkerKey },
                            body: JSON.stringify({
                                actions: [
                                    { type: 'goto', url: ddgUrl, waitUntil: 'domcontentloaded' },
                                    { type: 'wait', ms: 3000 }
                                ]
                            })
                        });
                        
                        const ddgSnapRes = await fetch(`${config.browserWorkerUrl}/session/${sessionId}/snapshot`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'x-worker-key': config.browserWorkerKey },
                            body: JSON.stringify({})
                        });
                        
                        if (ddgSnapRes.ok) {
                            const dJson: any = await ddgSnapRes.json();
                            const dHtml = dJson.dom || '';
                            console.log(`[web_search] Worker DDG HTML len: ${dHtml.length}`);
                            
                            const dDom = new JSDOM(dHtml);
                            const dDoc = dDom.window.document;
                            
                            // Try multiple DDG selectors
                            let dItems = Array.from(dDoc.querySelectorAll('article'));
                            if (!dItems.length) dItems = Array.from(dDoc.querySelectorAll('.result'));
                            if (!dItems.length) dItems = Array.from(dDoc.querySelectorAll('[data-testid="result"]'));
                             
                            console.log(`[web_search] Worker DDG items found: ${dItems.length}`);
                            
                            const dResults = dItems.map(div => {
                                const h2 = div.querySelector('h2') || div.querySelector('a[data-testid="result-title-a"]');
                                const a = div.querySelector('a[data-testid="result-title-a"]') || div.querySelector('a');
                                const snippet = div.querySelector('.result__snippet') || div.querySelector('[data-testid="result-snippet"]');
                                
                                const title = h2?.textContent?.trim() || '';
                                const url = a?.getAttribute('href') || '';
                                const description = snippet?.textContent?.trim() || '';

                                if (!title || !url) {
                                   // console.log(`[web_search] Debug filtered item: t=${title} u=${url}`);
                                }

                                return {
                                    title,
                                    url,
                                    description,
                                    source: 'duckduckgo_browser'
                                };
                            }).filter(x => x.url && x.url.startsWith('http') && x.title);
                            
                            console.log(`[web_search] Worker DDG valid results: ${dResults.length}`);

                            if (dResults.length) {
                                logs.push(`ddg_browser_results=${dResults.length}`);
                                allResults.push(...dResults);
                            }
                        }
                    }
                } else {
                   const txt = await snapRes.text();
                   console.error(`[web_search] Worker snapshot error: ${txt}`);
               }
           } finally {
               // Cleanup
               await fetch(`${config.browserWorkerUrl}/session/${sessionId}/close`, {
                   method: 'POST',
                   headers: { 'Content-Type': 'application/json', 'x-worker-key': config.browserWorkerKey },
                   body: JSON.stringify({})
               }).catch(() => {});
           }

        } catch (e: any) {
           console.error(`[web_search] Browser fallback failed: ${e.message}`);
        }
      }
      
      if (allResults.length) {
         // Deduplicate
         const seen = new Set();
         const unique = [];
         for (const item of allResults) {
           if (!seen.has(item.url)) {
             seen.add(item.url);
             unique.push(item);
           }
         }
         return { ok: true, output: { results: unique }, logs };
      }
      
      return { ok: false, error: 'No results found', logs };

    }
  },
  {
    name: 'central_answer',
    version: '1.0.0',
    tags: ['ai', 'answer', 'research'],
    inputSchema: { type: 'object', properties: { question: { type: 'string' } }, required: ['question'] },
    outputSchema: { type: 'object', properties: { answer: { type: 'string' }, sources: { type: 'array', items: { type: 'string' } } } },
    permissions: ['read', 'internet'],
    sideEffects: [],
    rateLimitPerMinute: 10,
    auditFields: ['question'],
    mockSupported: false,
    async execute(input) {
      const question = String(input?.question || '').trim();
      const logs: string[] = [];
      
      // Detect store specific intent
      const storeMap: Record<string, string> = {
        'jarir': 'site:jarir.com',
        'noon': 'site:noon.com',
        'amazon': 'site:amazon.sa',
        'extra': 'site:extra.com',
        'جرير': 'site:jarir.com',
        'نون': 'site:noon.com',
        'امازون': 'site:amazon.sa',
        'اكسترا': 'site:extra.com'
      };
      
      const extraQueries: string[] = [];
      const lowerQ = question.toLowerCase();
      for (const [key, site] of Object.entries(storeMap)) {
        if (lowerQ.includes(key)) {
           extraQueries.push(`${question} ${site}`);
        }
      }
      
      // Execute main search + extra searches in parallel
      const searchProms = [executeTool('web_search', { query: question })];
      for (const eq of extraQueries) {
         searchProms.push(executeTool('web_search', { query: eq }));
      }
      
      const searchResults = await Promise.all(searchProms);
      
      let allItems: any[] = [];
      for (const res of searchResults) {
          if (res.output?.results && Array.isArray(res.output.results)) {
              allItems.push(...res.output.results);
          }
      }
      
      // Deduplicate by URL
      const seenUrls = new Set();
      let items: Array<{ title: string; url: string; description: string }> = [];
      for (const it of allItems) {
          if (!seenUrls.has(it.url)) {
              seenUrls.add(it.url);
              items.push(it);
          }
      }
      
      // Sort: Store URLs first to prioritize pricing ONLY if shopping intent is detected
      const isShopping = /(buy|price|cost|shop|store|سعر|شراء|متجر|تسوق|بيع|عرض|خصم|sale|discount)/i.test(question);
      
      if (isShopping) {
          items.sort((a, b) => {
             const aStore = /jarir|noon|amazon|extra|temu|aliexpress/.test(a.url);
             const bStore = /jarir|noon|amazon|extra|temu|aliexpress/.test(b.url);
             if (aStore && !bStore) return -1;
             if (!aStore && bStore) return 1;
             return 0;
          });
      }
      
      // Slice top 10 (reduced from 15 to prevent timeout)
      items = items.slice(0, 10);

      logs.push(`web_search.total_results=${items.length}`);
      if (items.length) logs.push(`top_url=${items[0].url}`);
      
      let segments: Array<{ title: string; url: string; text: string }> = [];
      
      // Process in batches of 3 to avoid overloading with Puppeteer
      const BATCH_SIZE = 3;
      console.log(`[central_answer] Processing ${items.length} items in batches of ${BATCH_SIZE}`);
      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        console.log(`[central_answer] Processing batch ${i / BATCH_SIZE + 1}/${Math.ceil(items.length / BATCH_SIZE)}`);
        const batch = items.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
            batch.map(async (it: { title: string; url: string; description: string }) => {
                try {
                    console.log(`[central_answer] Extracting: ${it.url}`);
                    const ext = await executeTool('html_extract', { url: it.url });
                    console.log(`[central_answer] Extracted: ${it.url} (${ext.output?.textSnippet?.length || 0} chars)`);
                    const text = String(ext.output?.textSnippet || it.description || '').trim();
                    return { title: it.title, url: it.url, text };
                } catch (e: any) {
                    console.error(`[central_answer] Failed to extract ${it.url}:`, e.message);
                    return null;
                }
            })
        );
        
        for (const res of results) {
            if (res.status === 'fulfilled' && res.value) {
                segments.push(res.value);
            }
        }
      }
      
      if (!segments.length && items.length) {
        segments = items.map(it => ({ title: it.title, url: it.url, text: String(it.description || it.title) }));
      }
      const context = segments.map(s => `TITLE: ${s.title}\nURL: ${s.url}\n${s.text}`).join('\n---\n').slice(0, 20000);
      const sources = segments.map(s => s.url).slice(0, 10);
      const makeConcise = (q: string, segs: Array<{ title: string; url: string; text: string }>) => {
        const qTokens = q.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(t => t && t.length >= 3);
        let best: { title: string; url: string; text: string } | null = null;
        let bestScore = -1;
        for (const s of segs) {
          const t = s.text.toLowerCase();
          let sc = 0;
          for (const k of qTokens) sc += (t.match(new RegExp(k, 'g')) || []).length;
          if (sc > bestScore) { bestScore = sc; best = s; }
        }
        const target = best || segs[0];
        const chunks = String(target.text).split(/(?<=[\.\!\?\u061F])/).map(x => x.trim()).filter(Boolean).slice(0, 6);
        const head = chunks.slice(0, 3).join(' ');
        const bullets = chunks.slice(3, 6).map(x => `- ${x}`).join('\n');
        const srcs = sources.slice(0, 3).join('\n');
        const langAr = /[\u0600-\u06FF]/.test(q);
        const title = langAr ? 'الجواب المختصر:' : 'Direct Answer:';
        const srcTitle = langAr ? 'المصادر:' : 'Sources:';
        return `${title}\n${head}${bullets ? `\n\n${bullets}` : ''}\n\n${srcTitle}\n${srcs}`.trim();
      };
      const oai = String(process.env.OPENAI_API_KEY || process.env.AI_GATEWAY_API_KEY || process.env.OPEN_ROUTER_API_KEY || '').trim();
      const baseUrl = String(process.env.OPENAI_BASE_URL || (process.env.OPEN_ROUTER_API_KEY ? 'https://openrouter.ai/api/v1' : '') || '').trim();
      const gkey = String(process.env.GOOGLE_API_KEY || '').trim();
      
      if (!items.length) {
        try {
          const lang = /[\u0600-\u06FF]/.test(question) ? 'ar' : 'en';
          const bUrl = `https://www.bing.com/search?q=${encodeURIComponent(question)}&setlang=${lang}`;
          const r = await fetch(bUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': lang
            }
          });
          if (r.ok) {
            const html = await r.text();
            const found: Array<{ title: string; url: string; description: string }> = [];
            const regex = /<li class="b_algo"><h2><a href="([^"]+)"[^>]*>([^<]+)<\/a><\/h2>.*?<p[^>]*>(.*?)<\/p>/g;
            let m;
            while ((m = regex.exec(html)) !== null) {
              if (found.length >= 5) break;
              found.push({ title: m[2].replace(/<[^>]+>/g, ''), url: m[1], description: m[3].replace(/<[^>]+>/g, '') });
            }
            if (found.length) items = found;
          }
        } catch {}
      }
      
      // Smart Synthesis Strategy
      if (oai) {
        try {
          const { default: OpenAI } = await import('openai');
          const client = new OpenAI({ apiKey: oai, baseURL: baseUrl || undefined });
          
          // Use GPT-4o for "Lethal" intelligence
          const model = process.env.OPENAI_MODEL || 'gpt-4o'; 
          
          const c = await client.chat.completions.create({
            model: model,
            messages: [
              { 
                role: 'system', 
                content: `You are an elite, comprehensive AI research engine. 
                Your goal is to provide a "Lethal Answer" - one that is 100% accurate, deep, and leaves no room for ambiguity.
                
                Protocol:
                1. Analyze the user's question and the provided context.
                2. If the user asks for a price/number, find the EXACT current value from the context.
                3. If the context is missing specific details, state clearly what is missing but provide the best approximation.
                4. Do NOT be concise. Be comprehensive. Explain the "Why" and "How" if relevant.
                5. Structure your answer with clear headings, bullet points, and bold text for key facts.
                6. End with a "Sources" section listing the URLs used.
                
                Language: Matches the user's question language (Arabic/English).` 
              },
              { role: 'user', content: `Question: ${question}\n\nContext:\n${context}` }
            ]
          });
          const answer = c.choices[0].message.content || '';
          return { ok: true, output: { answer, sources }, logs };
        } catch (e: any) {
          logs.push(`openai.fail=${e.message}`);
        }
      }
      if (gkey) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(gkey)}`;
          const body = {
            contents: [
              {
                role: 'user',
                parts: [{ text: `You are an elite research engine. Provide a comprehensive, detailed answer. Question: ${question}\n\nContext:\n${context}` }]
              }
            ]
          };
          const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          const j: any = await r.json().catch(() => null);
          const answer = String(j?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
          if (answer) return { ok: true, output: { answer, sources }, logs };
        } catch (e: any) {
          logs.push(`gemini.fail=${e.message}`);
        }
      }
      const fallback = segments.length ? makeConcise(question, segments) : 'لم تتوفر سياقات كافية للإجابة بدقة. يرجى المحاولة مرة أخرى.';
      return { ok: true, output: { answer: fallback, sources }, logs };
    },

  },
  {
    name: 'file_read',
    version: '1.0.0',
    tags: ['fs', 'utility'],
    inputSchema: { type: 'object', properties: { filename: { type: 'string' } }, required: ['filename'] },
    outputSchema: { type: 'object', properties: { content: { type: 'string' } } },
    permissions: ['read'],
    sideEffects: [],
    rateLimitPerMinute: 60,
    auditFields: ['filename'],
    mockSupported: false,
  },
  {
    name: 'ls',
    version: '1.0.0',
    tags: ['fs', 'utility'],
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: [] },
    outputSchema: { type: 'object', properties: { files: { type: 'array', items: { type: 'string' } } } },
    permissions: ['read'],
    sideEffects: [],
    rateLimitPerMinute: 60,
    auditFields: ['path'],
    mockSupported: false,
  },
  {
    name: 'read_file_tree',
    version: '1.0.0',
    tags: ['fs', 'utility'],
    inputSchema: { type: 'object', properties: { path: { type: 'string' }, depth: { type: 'number' } }, required: [] },
    outputSchema: { type: 'object', properties: { tree: { type: 'string' } } },
    permissions: ['read'],
    sideEffects: [],
    rateLimitPerMinute: 60,
    auditFields: ['path'],
    mockSupported: false,
  },
  {
    name: 'shell_execute',
    version: '1.0.0',
    tags: ['system', 'shell'],
    inputSchema: { type: 'object', properties: { command: { type: 'string' }, cwd: { type: 'string' }, timeout: { type: 'number' } }, required: ['command'] },
    outputSchema: { type: 'object', properties: { stdout: { type: 'string' }, stderr: { type: 'string' }, exitCode: { type: 'number' } } },
    permissions: ['execute'],
    sideEffects: ['execute'],
    rateLimitPerMinute: 30,
    auditFields: ['command'],
    mockSupported: false,
  },
  {
    name: 'file_edit',
    version: '1.0.0',
    tags: ['fs', 'utility'],
    inputSchema: { type: 'object', properties: { filename: { type: 'string' }, find: { type: 'string' }, replace: { type: 'string' } }, required: ['filename', 'find', 'replace'] },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' } } },
    permissions: ['write'],
    sideEffects: ['write'],
    rateLimitPerMinute: 60,
    auditFields: ['filename'],
    mockSupported: false,
  },
  {
    name: 'knowledge_search',
    version: '1.0.0',
    tags: ['knowledge', 'search'],
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    outputSchema: { type: 'object', properties: { results: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, filename: { type: 'string' }, snippet: { type: 'string' }, score: { type: 'number' } } } } } },
    permissions: ['read'],
    sideEffects: [],
    rateLimitPerMinute: 60,
    auditFields: ['query'],
    mockSupported: false,
  },
  {
    name: 'knowledge_add',
    version: '1.0.0',
    tags: ['knowledge', 'write'],
    inputSchema: { type: 'object', properties: { filename: { type: 'string' }, content: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } }, required: ['filename', 'content'] },
    outputSchema: { type: 'object', properties: { id: { type: 'string' } } },
    permissions: ['write'],
    sideEffects: ['write'],
    rateLimitPerMinute: 60,
    auditFields: ['filename'],
    mockSupported: false,
  },
];

const generatedTools: ToolDefinition[] = [];
const TARGET_TOOL_COUNT = 200;

function hasToolName(n: string) {
  const name = String(n || '').trim();
  if (!name) return false;
  return tools.some(t => t.name === name) || generatedTools.some(t => t.name === name);
}

function addGeneratedTool(t: ToolDefinition) {
  if (!t?.name) return;
  if (tools.length + generatedTools.length >= TARGET_TOOL_COUNT) return;
  if (hasToolName(t.name)) return;
  generatedTools.push(t);
}

function makeShellTool(opts: {
  name: string;
  tags: string[];
  description?: string;
  permissions: ToolDefinition['permissions'];
  sideEffects: ToolDefinition['sideEffects'];
  rateLimitPerMinute?: number;
  inputSchema: Record<string, any>;
  auditFields?: string[];
  buildCommand: (input: any) => { command: string; cwd?: string; timeout?: number };
}) {
  const rateLimitPerMinute = Number.isFinite(Number(opts.rateLimitPerMinute)) ? Number(opts.rateLimitPerMinute) : 30;
  addGeneratedTool({
    name: opts.name,
    version: '1.0.0',
    tags: opts.tags,
    description: opts.description,
    inputSchema: opts.inputSchema,
    outputSchema: {
      type: 'object',
      properties: {
        stdout: { type: 'string' },
        stderr: { type: 'string' },
        exitCode: { type: 'number' },
        cwd: { type: 'string' },
      },
    },
    permissions: opts.permissions,
    sideEffects: opts.sideEffects,
    rateLimitPerMinute,
    auditFields: Array.isArray(opts.auditFields) ? opts.auditFields : [],
    mockSupported: false,
    async execute(input) {
      const { command, cwd, timeout } = opts.buildCommand(input);
      return executeTool('shell_execute', { command, cwd, timeout });
    },
  });
}

function addPhase2AndCoreDevTools() {
  addGeneratedTool({
    name: 'command_policy_check',
    version: '1.0.0',
    tags: ['dev', 'safety', 'policy'],
    inputSchema: {
      type: 'object',
      properties: {
        tool: { type: 'string' },
        input: { type: 'object' },
        userText: { type: 'string' },
      },
      required: ['tool'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        decision: { type: 'string', enum: ['allow', 'require_approval', 'deny'] },
        risk: { type: 'string' },
        reasons: { type: 'array', items: { type: 'string' } },
      },
    },
    permissions: ['read'],
    sideEffects: [],
    rateLimitPerMinute: 120,
    auditFields: ['tool'],
    mockSupported: true,
    async execute(input) {
      const tool = String(input?.tool || '').trim();
      const userText = String(input?.userText || '');
      const inObj = input?.input ?? null;

      const reasons: string[] = [];
      let decision: 'allow' | 'require_approval' | 'deny' = 'allow';
      let risk = 'LOW';

      const text = `${tool}\n${userText}\n${JSON.stringify(inObj ?? {})}`;
      if (/(rm\s+-rf|drop\s+table|shutdown|kill\s+process)/i.test(text)) {
        decision = 'require_approval';
        risk = 'HIGH';
        reasons.push('matches_destructive_pattern');
      }
      if (/sudo\b/i.test(text)) {
        decision = 'deny';
        risk = 'CRITICAL';
        reasons.push('sudo_not_allowed');
      }
      if (tool === 'shell_execute') {
        if (decision === 'allow') {
          decision = 'require_approval';
          risk = 'MEDIUM';
          reasons.push('raw_shell_requires_approval');
        }
      }
      if (tool === 'file_write' || tool === 'file_edit' || tool === 'scaffold_project') {
        const filename = String(inObj?.filename || '').trim();
        const baseDir = String(inObj?.baseDir || '').trim();
        const target = filename || baseDir;
        if (/\b\.env\b/i.test(target) || /id_rsa|ssh|pem|secret|token/i.test(target)) {
          decision = 'require_approval';
          risk = 'HIGH';
          reasons.push('touches_sensitive_path');
        }
      }
      if (tool === 'git_ops') {
        const op = String(inObj?.operation || '').trim().toLowerCase();
        if (['push', 'clone'].includes(op)) {
          decision = 'require_approval';
          risk = 'HIGH';
          reasons.push('git_remote_operation');
        }
      }
      if (!reasons.length) reasons.push('no_specific_risk_rule_matched');
      return { ok: true, output: { decision, risk, reasons }, logs: [`policy.tool=${tool} decision=${decision} risk=${risk}`] };
    },
  });

  addGeneratedTool({
    name: 'approve_on_tool',
    version: '1.0.0',
    tags: ['dev', 'safety', 'policy'],
    inputSchema: { type: 'object', properties: { tool: { type: 'string' }, input: { type: 'object' } }, required: ['tool'] },
    outputSchema: { type: 'object', properties: { ok: { type: 'boolean' }, decision: { type: 'string' } } },
    permissions: ['read'],
    sideEffects: [],
    rateLimitPerMinute: 120,
    auditFields: ['tool'],
    mockSupported: true,
    async execute(input) {
      const res = await executeTool('command_policy_check', input);
      const decision = String(res?.output?.decision || 'allow');
      return { ok: true, output: { ok: decision === 'allow', decision }, logs: res.logs || [] };
    },
  });

  addGeneratedTool({
    name: 'tool_create_shell',
    version: '1.0.0',
    tags: ['dev', 'tools', 'shell'],
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        command: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        allowArgs: { type: 'boolean' },
      },
      required: ['name', 'command'],
    },
    outputSchema: { type: 'object', properties: { ok: { type: 'boolean' }, name: { type: 'string' } } },
    permissions: ['write'],
    sideEffects: ['write'],
    rateLimitPerMinute: 30,
    auditFields: ['name'],
    mockSupported: true,
    async execute(input) {
      const name = String(input?.name || '').trim();
      const command = String(input?.command || '').trim();
      const tags = Array.isArray(input?.tags) ? input.tags.map((x: any) => String(x)).filter(Boolean) : [];
      const allowArgs = input?.allowArgs !== false;
      if (!name || !command) return { ok: false, error: 'missing_name_or_command', logs: [] };
      if (!/^[A-Za-z][A-Za-z0-9_-]{2,60}$/.test(name)) return { ok: false, error: 'invalid_tool_name', logs: [] };
      if (hasToolName(name)) return { ok: false, error: 'tool_already_exists', logs: [] };
      if (/(rm\s+-rf|drop\s+table|shutdown|kill\s+process|\bsudo\b)/i.test(command)) {
        return { ok: false, error: 'unsafe_command', logs: [] };
      }

      const toolTags = tags.length ? tags : ['dev', 'shell', 'runtime'];
      tools.push({
        name,
        version: '1.0.0',
        tags: toolTags,
        description: `Runtime shell tool: ${name}`,
        inputSchema: allowArgs
          ? { type: 'object', properties: { args: { type: 'array', items: { type: 'string' } }, cwd: { type: 'string' }, timeout: { type: 'number' } }, required: [] }
          : { type: 'object', properties: { cwd: { type: 'string' }, timeout: { type: 'number' } }, required: [] },
        outputSchema: {
          type: 'object',
          properties: { stdout: { type: 'string' }, stderr: { type: 'string' }, exitCode: { type: 'number' }, cwd: { type: 'string' } },
        },
        permissions: ['read', 'execute'],
        sideEffects: ['execute'],
        rateLimitPerMinute: 60,
        auditFields: [],
        mockSupported: true,
        async execute(toolInput: any) {
          const args = allowArgs && Array.isArray(toolInput?.args) ? toolInput.args.map((x: any) => String(x)) : [];
          const cwd = typeof toolInput?.cwd === 'string' && toolInput.cwd.trim() ? String(toolInput.cwd).trim() : repoRoot();
          const timeout = Number(toolInput?.timeout ?? 30000);
          const cmd = `${command}${args.length ? ` ${args.join(' ')}` : ''}`.trim();
          return executeTool('shell_execute', { command: cmd, cwd, timeout });
        },
      });

      return { ok: true, output: { ok: true, name }, logs: [`tool.created=${name}`] };
    },
  });

  addGeneratedTool({
    name: 'secrets_store_encrypted',
    version: '1.0.0',
    tags: ['dev', 'secrets', 'security'],
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        key: { type: 'string' },
        value: { type: 'string' },
        ttlSeconds: { type: 'number' },
      },
      required: ['sessionId', 'key', 'value'],
    },
    outputSchema: { type: 'object', properties: { ok: { type: 'boolean' }, expiresAt: { type: 'number' } } },
    permissions: ['write'],
    sideEffects: ['write'],
    rateLimitPerMinute: 120,
    auditFields: ['key'],
    mockSupported: false,
    async execute(input) {
      const sessionId = String(input?.sessionId || '').trim();
      const key = String(input?.key || '').trim();
      const value = String(input?.value ?? '');
      const ttlSeconds = Number(input?.ttlSeconds ?? 0);
      if (!sessionId || !key) return { ok: false, error: 'Missing sessionId or key', logs: [] };
      const { setSessionSecretEncrypted } = await import('../services/secrets');
      const expiresAt = setSessionSecretEncrypted(sessionId, key, value, ttlSeconds > 0 ? ttlSeconds : undefined);
      return { ok: true, output: { ok: true, expiresAt: expiresAt ?? null }, logs: [`secret_set=${key}`] };
    },
  });

  addGeneratedTool({
    name: 'secrets_provider_connect',
    version: '1.0.0',
    tags: ['dev', 'secrets'],
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        key: { type: 'string' },
        envVar: { type: 'string' },
        ttlSeconds: { type: 'number' },
      },
      required: ['sessionId', 'key', 'envVar'],
    },
    outputSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
    permissions: ['write'],
    sideEffects: ['write'],
    rateLimitPerMinute: 60,
    auditFields: ['key'],
    mockSupported: false,
    async execute(input) {
      const sessionId = String(input?.sessionId || '').trim();
      const key = String(input?.key || '').trim();
      const envVar = String(input?.envVar || '').trim();
      const ttlSeconds = Number(input?.ttlSeconds ?? 0);
      if (!sessionId || !key || !envVar) return { ok: false, error: 'Missing sessionId/key/envVar', logs: [] };
      const v = String(process.env[envVar] || '');
      if (!v) return { ok: false, error: `Env var not set: ${envVar}`, logs: [] };
      const { setSessionSecretEncrypted } = await import('../services/secrets');
      setSessionSecretEncrypted(sessionId, key, v, ttlSeconds > 0 ? ttlSeconds : undefined);
      return { ok: true, output: { ok: true }, logs: [`secret_from_env=${envVar} -> ${key}`] };
    },
  });

  addGeneratedTool({
    name: 'project_detect',
    version: '1.0.0',
    tags: ['dev', 'analysis'],
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: [] },
    outputSchema: {
      type: 'object',
      properties: {
        root: { type: 'string' },
        hasGit: { type: 'boolean' },
        nodeProjects: { type: 'array', items: { type: 'string' } },
        pythonProjects: { type: 'array', items: { type: 'string' } },
        goProjects: { type: 'array', items: { type: 'string' } },
      },
    },
    permissions: ['read'],
    sideEffects: [],
    rateLimitPerMinute: 30,
    auditFields: ['path'],
    mockSupported: true,
    async execute(input) {
      const root = resolveToolPath(String(input?.path || '.'));
      const hasGit = fs.existsSync(path.join(root, '.git'));
      const candidates: string[] = [];
      const walk = (dir: string, depth: number) => {
        if (depth > 4) return;
        let entries: fs.Dirent[] = [];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
          if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist' || e.name === 'build') continue;
          const full = path.join(dir, e.name);
          if (e.isDirectory()) walk(full, depth + 1);
          else candidates.push(full);
        }
      };
      walk(root, 0);
      const dirs = new Set<string>();
      for (const f of candidates) dirs.add(path.dirname(f));
      const nodeProjects = Array.from(dirs).filter(d => fs.existsSync(path.join(d, 'package.json'))).sort();
      const pythonProjects = Array.from(dirs).filter(d => fs.existsSync(path.join(d, 'pyproject.toml')) || fs.existsSync(path.join(d, 'requirements.txt'))).sort();
      const goProjects = Array.from(dirs).filter(d => fs.existsSync(path.join(d, 'go.mod'))).sort();
      return { ok: true, output: { root, hasGit, nodeProjects, pythonProjects, goProjects }, logs: [`project.root=${root}`] };
    },
  });

  addGeneratedTool({
    name: 'quality_run',
    version: '1.0.0',
    tags: ['dev', 'quality'],
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        tasks: { type: 'array', items: { type: 'string', enum: ['lint', 'typecheck', 'test', 'build'] } },
      },
      required: ['tasks'],
    },
    outputSchema: { type: 'object', properties: { results: { type: 'array', items: { type: 'object' } } } },
    permissions: ['read', 'execute'],
    sideEffects: ['execute'],
    rateLimitPerMinute: 10,
    auditFields: [],
    mockSupported: false,
    async execute(input) {
      const p = resolveToolPath(String(input?.path || '.'));
      const tasks: string[] = Array.isArray(input?.tasks) ? input.tasks.map((x: any) => String(x)) : [];
      const logs: string[] = [];
      const results: any[] = [];

      const pkgPath = path.join(p, 'package.json');
      let scripts: Record<string, string> = {};
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
          scripts = pkg?.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
        } catch {}
      }

      const runScript = async (task: string) => {
        const scriptName =
          task === 'lint'
            ? (scripts.lint ? 'lint' : '')
            : task === 'typecheck'
              ? (scripts.typecheck ? 'typecheck' : scripts['check-types'] ? 'check-types' : '')
              : task === 'test'
                ? (scripts.test ? 'test' : '')
                : task === 'build'
                  ? (scripts.build ? 'build' : '')
                  : '';
        if (!scriptName) {
          results.push({ task, ok: false, skipped: true, reason: 'missing_script' });
          return;
        }
        const cmd = `npm --prefix "${p}" run ${scriptName}`;
        const r = await executeTool('shell_execute', { command: cmd, cwd: repoRoot(), timeout: 10 * 60 * 1000 });
        results.push({ task, ok: r.ok, stdout: r.output?.stdout, stderr: r.output?.stderr, exitCode: r.output?.exitCode });
      };

      for (const t of tasks) await runScript(t);
      logs.push(`quality.path=${p} tasks=${tasks.join(',')}`);
      return { ok: results.every(r => r.ok || r.skipped), output: { results }, logs };
    },
  });

  addGeneratedTool({
    name: 'dependency_audit',
    version: '1.0.0',
    tags: ['dev', 'security', 'deps'],
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: [] },
    outputSchema: { type: 'object', properties: { summary: { type: 'object' }, raw: { type: 'object' } } },
    permissions: ['read', 'execute'],
    sideEffects: ['execute'],
    rateLimitPerMinute: 10,
    auditFields: ['path'],
    mockSupported: false,
    async execute(input) {
      const p = resolveToolPath(String(input?.path || '.'));
      const cmd = `npm --prefix "${p}" audit --json`;
      const r = await executeTool('shell_execute', { command: cmd, cwd: repoRoot(), timeout: 5 * 60 * 1000 });
      if (!r.ok) return { ok: false, error: String(r.output?.stderr || r.error || 'audit_failed'), logs: r.logs || [] };
      const rawText = String(r.output?.stdout || '');
      let raw: any = null;
      try { raw = JSON.parse(rawText); } catch { raw = { parseError: true, rawText: rawText.slice(0, 5000) }; }
      const summary = raw?.metadata?.vulnerabilities || raw?.vulnerabilities || {};
      return { ok: true, output: { summary, raw }, logs: r.logs || [] };
    },
  });

  addGeneratedTool({
    name: 'secrets_scan_repo',
    version: '1.0.0',
    tags: ['dev', 'security', 'secrets'],
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: [] },
    outputSchema: { type: 'object', properties: { matches: { type: 'array', items: { type: 'string' } }, truncated: { type: 'boolean' } } },
    permissions: ['read'],
    sideEffects: [],
    rateLimitPerMinute: 10,
    auditFields: ['path'],
    mockSupported: true,
    async execute(input) {
      const searchPath = resolveToolPath(String(input?.path || '.'));
      const patterns = [
        'sk-[A-Za-z0-9_-]{10,}',
        'ghp_[A-Za-z0-9_]{10,}',
        'github_pat_[A-Za-z0-9_]{10,}',
        'AKIA[0-9A-Z]{16}',
        'Bearer\\s+[A-Za-z0-9._-]{10,}',
      ];
      const all: string[] = [];
      for (const pat of patterns) {
        const r = await executeTool('grep_search', { query: pat, path: searchPath, include: '*.*', exclude: '' });
        const m = Array.isArray(r.output?.matches) ? r.output.matches : [];
        for (const line of m) all.push(String(line));
      }
      const unique = Array.from(new Set(all)).slice(0, 200);
      return { ok: true, output: { matches: unique, truncated: unique.length === 200 }, logs: [`scan.path=${searchPath} matches=${unique.length}`] };
    },
  });

  addGeneratedTool({
    name: 'ci_generate_pipeline',
    version: '1.0.0',
    tags: ['dev', 'ci'],
    inputSchema: { type: 'object', properties: { path: { type: 'string' }, kind: { type: 'string', enum: ['node'] } }, required: [] },
    outputSchema: { type: 'object', properties: { created: { type: 'array', items: { type: 'string' } } } },
    permissions: ['write'],
    sideEffects: ['write'],
    rateLimitPerMinute: 5,
    auditFields: ['path'],
    mockSupported: false,
    async execute(input) {
      const p = resolveToolPath(String(input?.path || '.'));
      const wfDir = path.join(p, '.github', 'workflows');
      const wfFile = path.join(wfDir, 'ci.yml');
      try { fs.mkdirSync(wfDir, { recursive: true }); } catch {}
      const yaml = [
        'name: CI',
        'on:',
        '  push:',
        '  pull_request:',
        'jobs:',
        '  build:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - uses: actions/setup-node@v4',
        '        with:',
        '          node-version: 20',
        '      - run: npm ci',
        '      - run: npm run lint --if-present',
        '      - run: npm run typecheck --if-present',
        '      - run: npm test --if-present',
        '      - run: npm run build --if-present',
        '',
      ].join('\n');
      fs.writeFileSync(wfFile, yaml);
      return { ok: true, output: { created: [wfFile] }, logs: [`ci.created=${wfFile}`] };
    },
  });

  addGeneratedTool({
    name: 'ci_run_status',
    version: '1.0.0',
    tags: ['dev', 'ci', 'github'],
    inputSchema: { type: 'object', properties: { repo: { type: 'string' }, branch: { type: 'string' } }, required: ['repo'] },
    outputSchema: { type: 'object', properties: { note: { type: 'string' } } },
    permissions: ['read'],
    sideEffects: [],
    rateLimitPerMinute: 10,
    auditFields: ['repo'],
    mockSupported: true,
    async execute(input) {
      const repo = String(input?.repo || '').trim();
      const branch = String(input?.branch || 'main').trim();
      return { ok: true, output: { note: `Connect a CI provider to query status: repo=${repo} branch=${branch}` }, logs: [`ci.status.repo=${repo}`] };
    },
  });

  makeShellTool({
    name: 'docker_ops',
    tags: ['dev', 'docker'],
    permissions: ['execute'],
    sideEffects: ['execute'],
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['version', 'build', 'run'] },
        args: { type: 'array', items: { type: 'string' } },
        cwd: { type: 'string' },
        timeout: { type: 'number' },
      },
      required: ['operation'],
    },
    auditFields: ['operation'],
    buildCommand: (input) => {
      const op = String(input?.operation || '').trim();
      const args = Array.isArray(input?.args) ? input.args.map((x: any) => String(x)) : [];
      const cwd = typeof input?.cwd === 'string' ? input.cwd : undefined;
      const timeout = Number(input?.timeout ?? 30000);
      const cmd = `docker ${op} ${args.join(' ')}`.trim();
      return { command: cmd, cwd, timeout };
    },
  });

  makeShellTool({
    name: 'deploy_ops',
    tags: ['dev', 'deploy'],
    permissions: ['execute'],
    sideEffects: ['execute'],
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['kubectl'] },
        args: { type: 'array', items: { type: 'string' } },
        cwd: { type: 'string' },
        timeout: { type: 'number' },
      },
      required: ['operation', 'args'],
    },
    auditFields: ['operation'],
    buildCommand: (input) => {
      const args = Array.isArray(input?.args) ? input.args.map((x: any) => String(x)) : [];
      const cwd = typeof input?.cwd === 'string' ? input.cwd : undefined;
      const timeout = Number(input?.timeout ?? 30000);
      const cmd = `kubectl ${args.join(' ')}`.trim();
      return { command: cmd, cwd, timeout };
    },
  });
}

function addBulkToolPackToReach200() {
  const root = repoRoot();

  const gitSimple: Array<{ name: string; command: string }> = [
    { name: 'git_status', command: 'git status -sb' },
    { name: 'git_diff', command: 'git diff' },
    { name: 'git_diff_cached', command: 'git diff --cached' },
    { name: 'git_log', command: 'git log -n 50 --oneline --decorate' },
    { name: 'git_branch_list', command: 'git branch -a' },
    { name: 'git_remote_list', command: 'git remote -v' },
    { name: 'git_tags', command: 'git tag -l' },
  ];
  for (const g of gitSimple) {
    makeShellTool({
      name: g.name,
      tags: ['dev', 'git'],
      permissions: ['read', 'execute'],
      sideEffects: ['execute'],
      inputSchema: { type: 'object', properties: { cwd: { type: 'string' }, timeout: { type: 'number' } }, required: [] },
      auditFields: [],
      buildCommand: (input) => ({ command: g.command, cwd: input?.cwd ? String(input.cwd) : root, timeout: Number(input?.timeout ?? 30000) }),
    });
  }

  const npmSimple: Array<{ name: string; command: string }> = [
    { name: 'npm_install', command: 'npm install --no-audit --no-fund --quiet' },
    { name: 'npm_ci', command: 'npm ci --no-audit --no-fund --quiet' },
    { name: 'npm_lint', command: 'npm run lint --if-present' },
    { name: 'npm_typecheck', command: 'npm run typecheck --if-present' },
    { name: 'npm_test', command: 'npm test --if-present' },
    { name: 'npm_build', command: 'npm run build --if-present' },
    { name: 'npm_audit', command: 'npm audit' },
  ];
  for (const n of npmSimple) {
    makeShellTool({
      name: n.name,
      tags: ['dev', 'npm'],
      permissions: ['read', 'execute', 'write'],
      sideEffects: ['execute', 'write'],
      inputSchema: { type: 'object', properties: { cwd: { type: 'string' }, timeout: { type: 'number' } }, required: [] },
      auditFields: [],
      buildCommand: (input) => ({ command: n.command, cwd: input?.cwd ? String(input.cwd) : root, timeout: Number(input?.timeout ?? 10 * 60 * 1000) }),
    });
  }

  const fsShellOps: Array<{ name: string; build: (input: any) => string; perms: ToolDefinition['permissions']; effects: ToolDefinition['sideEffects'] }> = [
    { name: 'fs_pwd', build: () => 'pwd', perms: ['read', 'execute'], effects: ['execute'] },
    { name: 'fs_ls', build: (i) => `ls -la "${resolveToolPath(String(i?.path || '.'))}"`, perms: ['read', 'execute'], effects: ['execute'] },
    { name: 'fs_find_large', build: (i) => `find "${resolveToolPath(String(i?.path || '.'))}" -type f -size +${Number(i?.mb ?? 50)}M -maxdepth 6 -print`, perms: ['read', 'execute'], effects: ['execute'] },
  ];
  for (const f of fsShellOps) {
    makeShellTool({
      name: f.name,
      tags: ['fs', 'utility'],
      permissions: f.perms,
      sideEffects: f.effects,
      inputSchema: { type: 'object', properties: { path: { type: 'string' }, mb: { type: 'number' }, cwd: { type: 'string' }, timeout: { type: 'number' } }, required: [] },
      auditFields: ['path'],
      buildCommand: (input) => ({ command: f.build(input), cwd: input?.cwd ? String(input.cwd) : root, timeout: Number(input?.timeout ?? 30000) }),
    });
  }

  const codeSearchByType: Array<{ name: string; include: string }> = [
    { name: 'code_search_ts', include: '*.{ts,tsx}' },
    { name: 'code_search_js', include: '*.{js,mjs,cjs,jsx}' },
    { name: 'code_search_py', include: '*.py' },
    { name: 'code_search_go', include: '*.go' },
    { name: 'code_search_java', include: '*.java' },
    { name: 'code_search_rust', include: '*.rs' },
    { name: 'code_search_cpp', include: '*.{c,cc,cpp,h,hpp}' },
    { name: 'code_search_yaml', include: '*.{yml,yaml}' },
    { name: 'code_search_json', include: '*.json' },
    { name: 'code_search_md', include: '*.md' },
    { name: 'code_search_sql', include: '*.sql' },
    { name: 'code_search_sh', include: '*.{sh,bash,zsh}' },
    { name: 'code_search_docker', include: '*Dockerfile*' },
    { name: 'code_search_terraform', include: '*.{tf,tfvars}' },
    { name: 'code_search_k8s', include: '*.{yaml,yml}' },
    { name: 'code_search_html', include: '*.{html,htm}' },
    { name: 'code_search_css', include: '*.{css,scss,sass,less}' },
    { name: 'code_search_graphql', include: '*.{graphql,gql}' },
    { name: 'code_search_proto', include: '*.proto' },
    { name: 'code_search_swift', include: '*.swift' },
  ];
  for (const s of codeSearchByType) {
    addGeneratedTool({
      name: s.name,
      version: '1.0.0',
      tags: ['fs', 'search'],
      inputSchema: { type: 'object', properties: { query: { type: 'string' }, path: { type: 'string' }, exclude: { type: 'string' } }, required: ['query'] },
      outputSchema: { type: 'object', properties: { matches: { type: 'array', items: { type: 'string' } }, count: { type: 'number' }, truncated: { type: 'boolean' } } },
      permissions: ['read'],
      sideEffects: [],
      rateLimitPerMinute: 120,
      auditFields: ['query'],
      mockSupported: true,
      async execute(input) {
        const query = String(input?.query ?? '');
        const searchPath = String(input?.path ?? '.');
        const exclude = String(input?.exclude ?? '');
        return executeTool('grep_search', { query, path: searchPath, include: s.include, exclude });
      },
    });
  }

  addGeneratedTool({
    name: 'code_loc_count',
    version: '1.0.0',
    tags: ['dev', 'analysis', 'code'],
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: [] },
    outputSchema: { type: 'object', properties: { totalFiles: { type: 'number' }, totalLines: { type: 'number' }, byExt: { type: 'object' } } },
    permissions: ['read'],
    sideEffects: [],
    rateLimitPerMinute: 10,
    auditFields: ['path'],
    mockSupported: true,
    async execute(input) {
      const rootPath = resolveToolPath(String(input?.path || '.'));
      const byExt: Record<string, { files: number; lines: number }> = {};
      let totalFiles = 0;
      let totalLines = 0;

      const shouldSkipDir = (name: string) =>
        name === 'node_modules' || name === '.git' || name === 'dist' || name === 'build' || name === '.next' || name === '.turbo';

      const walk = (dir: string, depth: number) => {
        if (depth > 12) return;
        let ents: fs.Dirent[] = [];
        try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
          if (e.isDirectory()) {
            if (shouldSkipDir(e.name)) continue;
            walk(path.join(dir, e.name), depth + 1);
            continue;
          }
          const full = path.join(dir, e.name);
          const ext = path.extname(e.name).toLowerCase() || '(none)';
          let content = '';
          try { content = fs.readFileSync(full, 'utf-8'); } catch { continue; }
          const lines = content.split('\n').length;
          totalFiles += 1;
          totalLines += lines;
          byExt[ext] = byExt[ext] || { files: 0, lines: 0 };
          byExt[ext].files += 1;
          byExt[ext].lines += lines;
        }
      };

      walk(rootPath, 0);
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(byExt)) out[k] = v;
      return { ok: true, output: { totalFiles, totalLines, byExt: out }, logs: [`loc.path=${rootPath}`] };
    },
  });

  const filler: Array<{ name: string; command: string; tags: string[]; perms: ToolDefinition['permissions']; effects: ToolDefinition['sideEffects'] }> = [
    { name: 'sys_node_version', command: 'node -v', tags: ['system', 'info'], perms: ['read', 'execute'], effects: ['execute'] },
    { name: 'sys_npm_version', command: 'npm -v', tags: ['system', 'info'], perms: ['read', 'execute'], effects: ['execute'] },
    { name: 'sys_git_version', command: 'git --version', tags: ['system', 'info'], perms: ['read', 'execute'], effects: ['execute'] },
    { name: 'sys_uname', command: 'uname -a', tags: ['system', 'info'], perms: ['read', 'execute'], effects: ['execute'] },
    { name: 'sys_disk', command: 'df -h', tags: ['system', 'info'], perms: ['read', 'execute'], effects: ['execute'] },
    { name: 'sys_mem', command: 'vm_stat', tags: ['system', 'info'], perms: ['read', 'execute'], effects: ['execute'] },
  ];
  for (const x of filler) {
    makeShellTool({
      name: x.name,
      tags: x.tags,
      permissions: x.perms,
      sideEffects: x.effects,
      inputSchema: { type: 'object', properties: { timeout: { type: 'number' } }, required: [] },
      buildCommand: (input) => ({ command: x.command, cwd: root, timeout: Number(input?.timeout ?? 30000) }),
    });
  }

  addGeneratedTool({
    name: 'fs_glob',
    version: '1.0.0',
    tags: ['fs', 'search'],
    inputSchema: { type: 'object', properties: { pattern: { type: 'string' }, cwd: { type: 'string' } }, required: ['pattern'] },
    outputSchema: { type: 'object', properties: { matches: { type: 'array', items: { type: 'string' } } } },
    permissions: ['read'],
    sideEffects: [],
    rateLimitPerMinute: 60,
    auditFields: ['pattern'],
    mockSupported: true,
    async execute(input) {
      const pattern = String(input?.pattern || '').trim();
      const cwd = input?.cwd ? resolveToolPath(String(input.cwd)) : repoRoot();
      if (!pattern) return { ok: false, error: 'pattern_required', logs: [] };
      const { globSync } = await import('glob');
      const matches = globSync(pattern, { cwd, nodir: true, dot: true, absolute: true }).slice(0, 500);
      return { ok: true, output: { matches }, logs: [`glob.cwd=${cwd} count=${matches.length}`] };
    },
  });

  const keywordChecks: Array<{ slug: string; query: string }> = [
    { slug: 'todo', query: 'TODO' },
    { slug: 'fixme', query: 'FIXME' },
    { slug: 'hack', query: 'HACK' },
    { slug: 'debugger', query: 'debugger' },
    { slug: 'console_log', query: 'console.log' },
    { slug: 'eval', query: 'eval(' },
    { slug: 'exec', query: 'child_process.exec' },
    { slug: 'secret', query: 'SECRET' },
  ];

  for (const s of codeSearchByType) {
    const suffix = s.name.replace(/^code_search_/, '');
    for (const k of keywordChecks) {
      const toolName = `code_find_${k.slug}_${suffix}`;
      addGeneratedTool({
        name: toolName,
        version: '1.0.0',
        tags: ['fs', 'search', 'code'],
        inputSchema: { type: 'object', properties: { path: { type: 'string' }, exclude: { type: 'string' } }, required: [] },
        outputSchema: { type: 'object', properties: { matches: { type: 'array', items: { type: 'string' } }, count: { type: 'number' }, truncated: { type: 'boolean' } } },
        permissions: ['read'],
        sideEffects: [],
        rateLimitPerMinute: 120,
        auditFields: [],
        mockSupported: true,
        async execute(input) {
          const searchPath = String(input?.path ?? '.');
          const exclude = String(input?.exclude ?? '');
          return executeTool('grep_search', { query: k.query, path: searchPath, include: s.include, exclude });
        },
      });
    }
  }
}

addPhase2AndCoreDevTools();
addBulkToolPackToReach200();
if (tools.length < TARGET_TOOL_COUNT) {
  tools.push(...generatedTools.slice(0, Math.max(0, TARGET_TOOL_COUNT - tools.length)));
}

const enableNoopTools =
  process.env.ENABLE_NOOP_TOOLS === '1' ||
  process.env.ENABLE_NOOP_TOOLS === 'true';

if (enableNoopTools) {
  const remaining = Math.max(0, TARGET_TOOL_COUNT - tools.length);
  for (let i = 1; i <= remaining; i++) {
    tools.push({
      name: `noop_${i}`,
      version: '1.0.0',
      tags: ['utility'],
      inputSchema: { type: 'object', properties: { note: { type: 'string' } } },
      outputSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
      permissions: [],
      sideEffects: [],
      rateLimitPerMinute: 600,
      auditFields: [],
      mockSupported: true,
    });
  }
}

import { KnowledgeService } from '../services/knowledge';

const toolRateBuckets = new Map<string, { minute: number; count: number }>();

function checkToolRateLimit(toolName: string, limitPerMinute: number) {
  const limit = Number(limitPerMinute);
  if (!Number.isFinite(limit)) return { allowed: true as const };
  if (limit <= 0) {
    return { allowed: false as const, retryAfterMs: 60000 };
  }
  const now = Date.now();
  const minute = Math.floor(now / 60000);
  const cur = toolRateBuckets.get(toolName);
  if (!cur || cur.minute !== minute) {
    toolRateBuckets.set(toolName, { minute, count: 1 });
    return { allowed: true as const };
  }
  const next = cur.count + 1;
  if (next > limit) {
    return { allowed: false as const, retryAfterMs: (minute + 1) * 60000 - now };
  }
  toolRateBuckets.set(toolName, { minute, count: next });
  return { allowed: true as const };
}

export async function executeTool(name: string, input: any): Promise<ToolExecutionResult> {
  const logs: string[] = [];
  const t0 = Date.now();
  logs.push(`[${new Date().toISOString()}] start ${name}`);
  try {
    const tDef = tools.find(t => t.name === name);
    if (!tDef) {
      return { ok: false, error: 'unknown_tool', logs };
    }
    const rl = checkToolRateLimit(name, tDef.rateLimitPerMinute);
    if (!rl.allowed) {
      logs.push(`rate_limited=1 limit_per_minute=${tDef.rateLimitPerMinute} retry_after_ms=${rl.retryAfterMs}`);
      return { ok: false, error: 'rate_limited', output: { retryAfterMs: rl.retryAfterMs }, logs };
    }
    if (tDef && typeof (tDef as any).execute === 'function') {
      const res = await (tDef as any).execute(input);
      const ok = !!res?.ok;
      const output = res?.output ?? null;
      const artifacts = Array.isArray(res?.artifacts) ? res.artifacts : undefined;
      const toolLogs = Array.isArray(res?.logs) ? res.logs : [];
      logs.push(...toolLogs);
      return { ok, output, logs, artifacts, error: res?.error };
    }
    if (name === 'echo') {
      const text = String(input?.text ?? '');
      // If input is an object (due to nested parsing), try to extract text property or stringify
      const val = typeof input === 'object' && input !== null && input.text ? input.text : text;
      const finalStr = typeof val === 'string' ? val : JSON.stringify(val);
      logs.push(`echo.text.length=${finalStr.length}`);
      return { ok: true, output: { text: finalStr }, logs };
    }
    if (name === 'http_fetch') {
      const url = String(input?.url ?? '');
      const method = String(input?.method ?? 'GET').toUpperCase();
      const headers = (typeof input?.headers === 'object' && input?.headers) ? input.headers : {};
      const reqHeaders: Record<string, string> = { ...headers };
      const sessionId = typeof (input as any)?.sessionId === 'string' ? String((input as any).sessionId).trim() : '';
      const userId = typeof (input as any)?.userId === 'string' ? String((input as any).userId).trim() : '';
      if (sessionId || userId) {
        try {
          const { getSessionSecret, getUserSecret } = await import('../services/secrets');
          if (!reqHeaders.Authorization && !reqHeaders.authorization) {
            const token =
              (userId ? (await getUserSecret(userId, 'generic', 'HTTP_BEARER_TOKEN')) : null) ||
              getSessionSecret(sessionId, 'HTTP_BEARER_TOKEN') ||
              '';
            if (token) reqHeaders.Authorization = `Bearer ${token}`;
          }
        } catch {}
      }
      let reqBody: any = undefined;
      if (typeof input?.body === 'string') reqBody = input.body;
      else if (input?.json && typeof input.json === 'object') {
        reqBody = JSON.stringify(input.json);
        if (!reqHeaders['Content-Type']) reqHeaders['Content-Type'] = 'application/json';
      }
      const resp = await fetch(url, { method, headers: reqHeaders, body: reqBody });
      const contentType = resp.headers.get('content-type') || '';
      const respText = await resp.text();
      let json: any = null;
      if (contentType.includes('application/json')) {
        try { json = JSON.parse(respText); } catch {}
      }
      logs.push(`fetch.status=${resp.status}`);
      const headObj: Record<string,string> = {};
      resp.headers.forEach((v, k) => { headObj[k] = v; });
      return { ok: true, output: { status: resp.status, contentType, bodySnippet: respText.slice(0, 2048), json, headers: headObj, url }, logs };
    }
    if (name === 'html_extract') {
      const url = String(input?.url ?? '');
      const renderRequested = input?.render === true;

      const parseHtml = (rawHtml: string, baseUrl: string) => {
        // 1. Try Mozilla Readability (The "Smart" Way)
        try {
            const dom = new JSDOM(rawHtml, { url: baseUrl });
            const reader = new Readability(dom.window.document);
            const article = reader.parse();
            if (article) {
                return {
                    title: article.title,
                    metaDescription: article.excerpt,
                    headings: [], // Readability abstracts this
                    links: [], // We could extract, but text is king
                    textSnippet: `TITLE: ${article.title}\nBYLINE: ${article.byline || 'Unknown'}\n\n${(article.textContent || '').trim().slice(0, 40000)}`,
                    isArticle: true
                };
            }
        } catch (e) {
            // Fallback
        }

        // 2. Fallback to Regex (The "Dumb" Way - but sometimes necessary for non-articles)
        const html = String(rawHtml || '');
        const tMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const title = tMatch ? String(tMatch[1]).trim() : '';
        const mMatch =
          html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i) ||
          html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["'][^>]*>/i);
        const metaDescription = mMatch ? String(mMatch[1]).trim() : '';
        const headings: string[] = [];
        const hRegex = /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi;
        let hm;
        while ((hm = hRegex.exec(html))) {
          const txt = String(hm[2]).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          if (txt) headings.push(txt);
        }
        const links: Array<{ text: string; url: string }> = [];
        const aRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let am;
        while ((am = aRegex.exec(html))) {
          const hrefRaw = String(am[1]).trim();
          const txt = String(am[2]).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          if (!hrefRaw || !txt) continue;
          let abs = hrefRaw;
          try { abs = new URL(hrefRaw, baseUrl).toString(); } catch {}
          links.push({ text: txt.slice(0, 160), url: abs });
        }
        const textSnippet = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
          .replace(/<\/(p|div|section|article|h[1-6]|li|tr)>/gi, '\n')
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 25000); 
        return { title, metaDescription, headings: headings.slice(0, 20), links: links.slice(0, 20), textSnippet, isArticle: false };
      };

      const renderWithPuppeteer = async (targetUrl: string) => {
        const puppeteer = await import('puppeteer');
        const browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
        });
        try {
          const page = await browser.newPage();
          await page.setRequestInterception(true);
          page.on('request', (req) => {
            const type = req.resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(type)) req.abort();
            else req.continue();
          });
          // Fake a good User Agent
          await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
          
          await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
          
          // Try to scroll to load lazy content
          try {
              await page.evaluate(async () => {
                  await new Promise<void>((resolve) => {
                      let totalHeight = 0;
                      const distance = 100;
                      const timer = setInterval(() => {
                          const scrollHeight = document.body.scrollHeight;
                          window.scrollBy(0, distance);
                          totalHeight += distance;
                          if (totalHeight >= scrollHeight || totalHeight > 5000) {
                              clearInterval(timer);
                              resolve();
                          }
                      }, 50);
                  });
              });
          } catch {}

          const finalUrl = page.url();
          const html = await page.content();
          return { html, finalUrl };
        } finally {
          try { await browser.close(); } catch {}
        }
      };

      let html = '';
      let finalUrl = url;
      let rendered = false;

      // Smart Logic: If it's a dynamic site (like Twitter/X, SPA) or e-commerce, force render
      const needsRender = renderRequested || 
                          /twitter\.com|x\.com|youtube\.com|linkedin\.com|instagram\.com|tiktok\.com|facebook\.com/.test(url) ||
                          /amazon\.|noon\.|jarir\.|extra\.|temu\.|aliexpress\.|shein\.|ebay\.|walmart\./.test(url);

      if (needsRender) {
        try {
            const out = await renderWithPuppeteer(url);
            html = out.html;
            finalUrl = out.finalUrl;
            rendered = true;
            logs.push('html_extract.rendered=1');
        } catch (e: any) {
            // Fallback to fetch if puppeteer fails
            logs.push(`html_extract.puppeteer_failed=${e.message}`);
            const resp = await fetch(url);
            finalUrl = (resp as any)?.url ? String((resp as any).url) : url;
            html = await resp.text();
        }
      } else {
        const resp = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        finalUrl = (resp as any)?.url ? String((resp as any).url) : url;
        logs.push(`fetch.status=${resp.status}`);
        html = await resp.text();
      }

      let parsed = parseHtml(html, finalUrl);
      
      // Auto-Upgrade to Puppeteer if fetch yielded garbage
      const weak =
        !rendered &&
        !parsed.isArticle &&
        String(parsed.textSnippet || '').trim().length < 200; // Stricter threshold

      if (weak) {
        try {
          const out = await renderWithPuppeteer(url);
          html = out.html;
          finalUrl = out.finalUrl;
          rendered = true;
          logs.push('html_extract.auto_rendered=1');
          parsed = parseHtml(html, finalUrl);
        } catch (e: any) {
          logs.push(`html_extract.auto_render_failed=${String(e?.message || e)}`);
        }
      }

      return { ok: true, output: { ...parsed, url: finalUrl, rendered }, logs };
    }
    if (name === 'rss_fetch') {
      const url = String(input?.url ?? '');
      const limit = Math.max(1, Math.min(20, Number(input?.limit ?? 5)));
      const resp = await fetch(url);
      const xml = await resp.text();
      const items: Array<{ title: string; link: string; pubDate: string; description: string }> = [];
      const itemRegex = /<item[\s\S]*?<\/item>/gi;
      let im;
      while ((im = itemRegex.exec(xml))) {
        const block = String(im[0]);
        const t = (block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
        const l = (block.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
        const p = (block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1] || '').trim();
        const d = (block.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1] || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        items.push({ title: t.slice(0, 200), link: l, pubDate: p, description: d.slice(0, 300) });
        if (items.length >= limit) break;
      }
      return { ok: items.length > 0, output: { items }, logs };
    }
    if (name === 'json_query') {
      const obj = input?.json ?? null;
      const path = String(input?.path ?? '');
      const norm = path.replace(/\[(\d+)\]/g, '.$1');
      const parts = norm.split('.').filter(Boolean);
      let cur: any = obj;
      for (const p of parts) {
        if (cur && typeof cur === 'object' && p in cur) cur = cur[p];
        else { cur = undefined; break; }
      }
      return { ok: typeof cur !== 'undefined', output: { value: cur }, logs };
    }
    if (name === 'csv_parse') {
      const text = String(input?.csv ?? '');
      const delim = String(input?.delimiter ?? ',');
      const rows: string[][] = [];
      let i = 0; 
      let cell = ''; 
      let row: string[] = []; 
      let inQuotes = false;
      while (i < text.length) {
        const ch = text[i];
        if (inQuotes) {
          if (ch === '"') {
            if (text[i+1] === '"') { cell += '"'; i++; }
            else { inQuotes = false; }
          } else {
            cell += ch;
          }
        } else {
          if (ch === '"') { inQuotes = true; }
          else if (ch === delim) { row.push(cell); cell = ''; }
          else if (ch === '\n') { row.push(cell); cell = ''; rows.push(row); row = []; }
          else if (ch === '\r') { }
          else { cell += ch; }
        }
        i++;
      }
      row.push(cell);
      rows.push(row);
      const headers = rows[0] || [];
      return { ok: rows.length > 0, output: { headers, rows }, logs };
    }
    if (name === 'text_summarize') {
      const text = String(input?.text ?? '').trim();
      const maxS = Math.max(1, Math.min(10, Number(input?.maxSentences ?? 3)));
      const parts = text.split(/(?<=[\.!\?؟])\s+/).map(s => s.trim()).filter(s => s.length > 3);
      const summary = parts.slice(0, maxS).join(' ');
      return { ok: !!summary, output: { summary }, logs };
    }
    if (name === 'file_write') {
      const filename = String(input?.filename ?? 'artifact.txt');
      const content = String(input?.content ?? '');
      // Allow full path access for system engineering
      const full = path.isAbsolute(filename) ? filename : path.resolve(process.cwd(), filename);
      
      // Ensure directory exists
      const dir = path.dirname(full);
      if (!fs.existsSync(dir)) {
        try { fs.mkdirSync(dir, { recursive: true }); } catch {}
      }

      fs.writeFileSync(full, content);
      logs.push(`wrote=${full} bytes=${content.length}`);
      
      // Only generate href if inside ARTIFACT_DIR
      let href = '';
      const artifactDirAbs = path.resolve(ARTIFACT_DIR);
      if (full.startsWith(artifactDirAbs)) {
          href = `/artifacts/${encodeURIComponent(path.relative(artifactDirAbs, full))}`;
      }
      
      return { ok: true, output: { href }, logs, artifacts: href ? [{ name: path.basename(full), href }] : [] };
    }

    if (name === 'image_generate') {
      const prompt = String(input?.prompt ?? '').trim();
      const allowedSizes = ['1024x1024', '1024x1792', '1792x1024'] as const;
      const sizeInput = String(input?.size ?? '1024x1024');
      // Map unsupported sizes to 1024x1024
      const size = (allowedSizes as readonly string[]).includes(sizeInput) ? (sizeInput as (typeof allowedSizes)[number]) : '1024x1024';
      
      if (!prompt) return { ok: false, error: 'prompt_required', logs };
      
      const apiKey = process.env.OPENAI_API_KEY || '';
      if (!apiKey) {
        logs.push('openai.missing_api_key');
        return { ok: false, error: 'OPENAI_API_KEY not set', logs };
      }

      try {
        const { default: OpenAI } = await import('openai');
        const client = new OpenAI({ apiKey });
        
        // Use dall-e-3 for better quality and standard access
        const resp = await client.images.generate({ 
          model: 'dall-e-3', 
          prompt, 
          size,
          quality: 'standard',
          n: 1,
        });

        const b64 = resp.data?.[0]?.b64_json;
        const url = resp.data?.[0]?.url;

        // DALL-E 3 usually returns URL by default unless response_format is b64_json
        // But let's try to get b64 if we can, or download from URL
        
        let buf: Buffer;
        if (b64) {
          buf = Buffer.from(b64, 'base64');
        } else if (url) {
          const r = await fetch(url);
          const arrayBuffer = await r.arrayBuffer();
          buf = Buffer.from(arrayBuffer);
        } else {
          // If we explicitly asked for b64_json (default is url)
          // We didn't specify response_format above, so it defaults to url.
          // Let's retry with response_format or just fetch the URL.
          // Actually, let's just re-run with response_format in the call if we want b64.
          // For now, let's assume we can fetch the URL if b64 is missing.
          return { ok: false, error: 'image_generation_failed_no_data', logs };
        }

        const filename = `image-${Date.now()}.png`;
        const full = path.join(ARTIFACT_DIR, filename);
        fs.writeFileSync(full, buf);
        logs.push(`image.saved=${full} bytes=${buf.length}`);
        
        const href = `/artifacts/${encodeURIComponent(filename)}`;
        return { ok: true, output: { href }, logs, artifacts: [{ name: filename, href }] };
      } catch (err: any) {
        logs.push(`openai_error=${err.message}`);
        // Return a fatal error if it's 403 or 400 to stop retries? 
        // The LLM planner should decide. But we can hint "fatal: true" in result if we supported it.
        return { ok: false, error: `OpenAI Error: ${err.message}`, logs };
      }
    }
    if (name === 'deep_research') {
      const topic = String(input?.topic ?? '').trim();
      const logs: string[] = [];
      logs.push(`research.topic=${topic}`);

      const apiKey = String(process.env.OPENAI_API_KEY || process.env.AI_GATEWAY_API_KEY || process.env.OPEN_ROUTER_API_KEY || '').trim();
      const baseUrl = String(process.env.OPENAI_BASE_URL || (process.env.OPEN_ROUTER_API_KEY ? 'https://openrouter.ai/api/v1' : '') || '').trim();
      const MAX_DEPTH = 1;
      const QUERIES_PER_STEP = 4;
      
      const uniqueUrls = new Set<string>();
      const collectedContext: string[] = [];
      let currentQueries = [topic];

      // Helper to run a tool safely
      const runTool = async (toolName: string, toolInput: any) => {
          try { return await executeTool(toolName, toolInput); } 
          catch (e: any) { return { ok: false, error: e.message }; }
      };

      // --- ITERATIVE RESEARCH LOOP ---
      for (let step = 0; step < MAX_DEPTH; step++) {
          logs.push(`research.step=${step + 1} queries=${currentQueries.length}`);
          
          // 1. Parallel Search
          const searchResults = await Promise.all(
              currentQueries.map(q => runTool('web_search', { query: q }))
          );

          // 2. Aggregate Results
          const candidates: any[] = [];
          for (const res of searchResults) {
              const r = res as any;
              if (r.ok && Array.isArray(r.output?.results)) {
                  for (const item of r.output.results) {
                      if (!uniqueUrls.has(item.url)) {
                          uniqueUrls.add(item.url);
                          candidates.push(item);
                      }
                  }
              }
          }
          
          const targets = candidates.slice(0, 10);
          if (targets.length === 0) {
              logs.push('research.stop=no_new_targets');
              if (step === 0) return { ok: false, error: 'No search results found', logs };
              break;
          }

          // 3. Extract Content (Parallel with limit)
          const extractionsSettled = await Promise.allSettled(
              targets.map(async (t) => {
                  const ext = await runTool('html_extract', { url: t.url }) as any;
                  if (ext.ok && ext.output?.textSnippet) {
                      return `SOURCE: ${t.title}\nURL: ${t.url}\nCONTENT: ${ext.output.textSnippet}\n---\n`;
                  } else {
                      return `SOURCE: ${t.title}\nURL: ${t.url}\nSUMMARY: ${t.description}\n---\n`;
                  }
              })
          );
          const extractions = extractionsSettled.filter(x => x.status === 'fulfilled').map((x: any) => x.value);
          
          collectedContext.push(...extractions);

          // 4. Analyze & Plan Next Step (if AI available and not last step)
          if (!apiKey || step === MAX_DEPTH - 1) break;

          try {
              const { default: OpenAI } = await import('openai');
              const client = new OpenAI({ apiKey, baseURL: baseUrl || undefined });
              
              const analysis = await client.chat.completions.create({
                  model: 'gpt-4o',
                  messages: [
                      { 
                          role: 'system', 
                          content: 'You are a Research Director. Analyze the gathered info. Return JSON: { "sufficient": boolean, "newQueries": string[] }. If missing info, generate 2-3 targeted queries.' 
                      },
                      { 
                          role: 'user', 
                          content: `Topic: ${topic}\n\nCollected Info (Last 15k chars):\n${collectedContext.join('\n').slice(-15000)}` 
                      }
                  ],
                  response_format: { type: 'json_object' }
              });
              
              const analysisJson = JSON.parse(analysis.choices[0].message.content || '{}');
              if (analysisJson.sufficient) {
                  logs.push('research.stop=sufficient_info');
                  break;
              }
              if (Array.isArray(analysisJson.newQueries) && analysisJson.newQueries.length > 0) {
                  currentQueries = analysisJson.newQueries.slice(0, QUERIES_PER_STEP);
                  logs.push(`research.next_plan=${currentQueries.join('|')}`);
              } else {
                  break;
              }
          } catch (e: any) {
              logs.push(`research.planning_failed=${e.message}`);
              break;
          }
      }

      // --- FINAL SYNTHESIS ---
      const sources = Array.from(uniqueUrls).slice(0, 20); // List all found sources
      
      if (!apiKey) {
          return { 
              ok: true, 
              output: { 
                  report: collectedContext.slice(0, 6).map(s => s.slice(0, 500)).join('\n\n'), 
                  sources 
              }, 
              logs 
          };
      }

      try {
        const { default: OpenAI } = await import('openai');
        const client = new OpenAI({ apiKey, baseURL: baseUrl || undefined });
        
        const completion = await client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { 
              role: 'system', 
              content: `Answer concisely and accurately. Start with a 3–6 line direct answer, then up to 3 bullet points for key facts. Add a short Sources section with top URLs. Match the user's language.` 
            },
            {
              role: 'user',
              content: `Topic: ${topic}\n\nResearch Data:\n${collectedContext.join('\n')}`
            }
          ]
        });

        const report = completion.choices[0].message.content || 'No report generated.';
        return {
          ok: true,
          output: {
            report,
            sources
          },
          logs
        };

      } catch (err: any) {
        return { ok: false, error: `Synthesis failed: ${err.message}`, logs };
      }
    }
    if (name === 'web_search') {
      const query = String(input?.query ?? '').trim();
      const logs: string[] = [];
      let results: any[] = [];

      const q = query;
      const norm = q.toLowerCase();
      const hasArabic = /[\u0600-\u06FF]/.test(q);

      const looksLikeWeather =
        /(?:\bweather\b|الطقس|حالة\s+الطقس|درجة\s+الحرارة|حرارة)/i.test(q);

      // --- 0. Special Handlers: Time, Date, Math ---
      
      // Time/Date
      const looksLikeTime = /(?:time|date|الساعة|التاريخ|وقت|توقيت)\s+(?:in|في)?\s*([a-zA-Z\u0600-\u06FF\s]+)?/i.test(q);
      if (looksLikeTime) {
          try {
             const m = q.match(/(?:in|في)\s+([a-zA-Z\u0600-\u06FF][a-zA-Z\u0600-\u06FF\s-]{1,40})/i);
             const location = m ? m[1].trim() : null;
             
             let timeString = '';
             if (location) {
                // Simple heuristics for major cities (expand as needed or use a library if available)
                // For now, we will rely on a quick lookup or just return server time if unknown
                // But to be "lethal", let's try to be smart.
                // actually, let's just use the search for this if it's a specific city we don't know,
                // BUT if it's just "time" or "date", return server time.
                if (!location) {
                    timeString = new Date().toLocaleString(hasArabic ? 'ar-SA' : 'en-US');
                }
             } else {
                 timeString = new Date().toLocaleString(hasArabic ? 'ar-SA' : 'en-US');
             }

             if (timeString) {
                 results.push({
                     title: 'Current Time/Date',
                     url: 'local',
                     description: `**ANSWER**: ${timeString}`
                 });
                 if (!location) return { ok: true, output: { results }, logs };
             }
          } catch {}
      }

      // Math / Calculator
      if (/^[\d\s\+\-\*\/\(\)\.]+$/.test(q) && /\d/.test(q)) {
          try {
              // Safety check: only allow digits and operators
              if (!/[^\d\s\+\-\*\/\(\)\.]/.test(q)) {
                  // eslint-disable-next-line no-new-func
                  const res = new Function(`return ${q}`)();
                  if (typeof res === 'number' && isFinite(res)) {
                      results.push({
                          title: 'Calculator',
                          url: 'calculator',
                          description: `**ANSWER**: ${q} = ${res}`
                      });
                      return { ok: true, output: { results }, logs };
                  }
              }
          } catch {}
      }

      if (looksLikeWeather) {
        // Known cities cache to speed up common queries
        const CITY_COORDS: Record<string, { lat: number; lon: number; name: string; country: string }> = {
            'istanbul': { lat: 41.0082, lon: 28.9784, name: 'Istanbul', country: 'Turkey' },
            'إسطنبول': { lat: 41.0082, lon: 28.9784, name: 'إسطنبول', country: 'تركيا' },
            'اسطنبول': { lat: 41.0082, lon: 28.9784, name: 'إسطنبول', country: 'تركيا' },
            'riyadh': { lat: 24.7136, lon: 46.6753, name: 'Riyadh', country: 'Saudi Arabia' },
            'الرياض': { lat: 24.7136, lon: 46.6753, name: 'الرياض', country: 'السعودية' },
            'cairo': { lat: 30.0444, lon: 31.2357, name: 'Cairo', country: 'Egypt' },
            'القاهرة': { lat: 30.0444, lon: 31.2357, name: 'القاهرة', country: 'مصر' },
            'dubai': { lat: 25.2048, lon: 55.2708, name: 'Dubai', country: 'UAE' },
            'دبي': { lat: 25.2048, lon: 55.2708, name: 'دبي', country: 'الإمارات' },
            'jeddah': { lat: 21.4858, lon: 39.1925, name: 'Jeddah', country: 'Saudi Arabia' },
            'جدة': { lat: 21.4858, lon: 39.1925, name: 'جدة', country: 'السعودية' },
            'mecca': { lat: 21.3891, lon: 39.8579, name: 'Mecca', country: 'Saudi Arabia' },
            'مكة': { lat: 21.3891, lon: 39.8579, name: 'مكة', country: 'السعودية' },
            'london': { lat: 51.5074, lon: -0.1278, name: 'London', country: 'UK' },
            'لندن': { lat: 51.5074, lon: -0.1278, name: 'لندن', country: 'بريطانيا' }
        };

        const extractCity = () => {
            // Check hardcoded first
            for (const key of Object.keys(CITY_COORDS)) {
                if (q.toLowerCase().includes(key)) return key;
            }
            // Regex fallback
            const m =
              q.match(/(?:in|في)\s+([a-zA-Z\u0600-\u06FF][a-zA-Z\u0600-\u06FF\s-]{1,40})/i) ||
              q.match(/([a-zA-Z\u0600-\u06FF][a-zA-Z\u0600-\u06FF\s-]{1,40})\s+(?:weather|الطقس|حالة\s+الطقس|درجة\s+الحرارة|حرارة)/i);
            return String(m?.[1] || '').trim();
        };

        const cityKey = extractCity();
        // Default to Riyadh if absolutely nothing found
        const citySearch = cityKey || 'Riyadh';
        const cached = CITY_COORDS[citySearch.toLowerCase()];

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);
          try {
            let lat, lon, placeName, country;

            if (cached) {
                lat = cached.lat;
                lon = cached.lon;
                placeName = cached.name;
                country = cached.country;
            } else {
                const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(citySearch)}&count=1&language=${hasArabic ? 'ar' : 'en'}&format=json`;
                const geoResp = await fetch(geoUrl, { signal: controller.signal });
                if (!geoResp.ok) throw new Error(`geocode_http_${geoResp.status}`);
                const geo: any = await geoResp.json().catch(() => null);
                const hit = Array.isArray(geo?.results) ? geo.results[0] : null;
                lat = typeof hit?.latitude === 'number' ? hit.latitude : null;
                lon = typeof hit?.longitude === 'number' ? hit.longitude : null;
                placeName = String(hit?.name || citySearch).trim() || citySearch;
                country = String(hit?.country || '').trim();
            }

            const label = hasArabic
              ? `${placeName}${country ? `، ${country}` : ''}`
              : `${placeName}${country ? `, ${country}` : ''}`;
            
            if (typeof lat !== 'number' || typeof lon !== 'number') throw new Error('geocode_no_results');

            const fcUrl =
              `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(String(lat))}&longitude=${encodeURIComponent(String(lon))}` +
              `&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m` +
              `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum` +
              `&timezone=auto`;
            const fcResp = await fetch(fcUrl, { signal: controller.signal });
            if (!fcResp.ok) throw new Error(`forecast_http_${fcResp.status}`);
            const fc: any = await fcResp.json().catch(() => null);

            const current = fc?.current || {};
            const daily = fc?.daily || {};
            const t = current?.temperature_2m;
            const feels = current?.apparent_temperature;
            const wind = current?.wind_speed_10m;
            const precip = current?.precipitation;
            const time = String(current?.time || '');
            const tz = String(fc?.timezone || '');

            const tMax = Array.isArray(daily?.temperature_2m_max) ? daily.temperature_2m_max[0] : undefined;
            const tMin = Array.isArray(daily?.temperature_2m_min) ? daily.temperature_2m_min[0] : undefined;
            const pSum = Array.isArray(daily?.precipitation_sum) ? daily.precipitation_sum[0] : undefined;

            const partsAr: string[] = [];
            if (typeof t === 'number') partsAr.push(`الحرارة: ${t}°C`);
            if (typeof feels === 'number') partsAr.push(`المحسوسة: ${feels}°C`);
            if (typeof wind === 'number') partsAr.push(`الرياح: ${wind} كم/س`);
            if (typeof precip === 'number') partsAr.push(`هطول الآن: ${precip} مم`);
            if (typeof tMax === 'number' && typeof tMin === 'number') partsAr.push(`أعلى/أدنى اليوم: ${tMax}°/${tMin}°`);
            if (typeof pSum === 'number') partsAr.push(`إجمالي هطول اليوم: ${pSum} مم`);
            if (time) partsAr.push(`الوقت: ${time}${tz ? ` (${tz})` : ''}`);

            const partsEn: string[] = [];
            if (typeof t === 'number') partsEn.push(`Temp: ${t}°C`);
            if (typeof feels === 'number') partsEn.push(`Feels: ${feels}°C`);
            if (typeof wind === 'number') partsEn.push(`Wind: ${wind} km/h`);
            if (typeof precip === 'number') partsEn.push(`Precip now: ${precip} mm`);
            if (typeof tMax === 'number' && typeof tMin === 'number') partsEn.push(`High/Low: ${tMax}°/${tMin}°`);
            if (typeof pSum === 'number') partsEn.push(`Daily precip: ${pSum} mm`);
            if (time) partsEn.push(`Time: ${time}${tz ? ` (${tz})` : ''}`);

            const desc = hasArabic
              ? `**ANSWER**: طقس ${label} اليوم.\n${partsAr.join('، ')}`
              : `**ANSWER**: Weather in ${label} today.\n${partsEn.join(', ')}`;

            results.push({
              title: hasArabic ? 'الطقس (Open-Meteo)' : 'Weather (Open-Meteo)',
              url: `https://open-meteo.com/`,
              description: desc,
            });
            logs.push(`weather.open_meteo=1 city=${citySearch}`);
            logs.push(`search.final_count=${results.length}`);
            return { ok: true, output: { results }, logs };
          } finally {
            clearTimeout(timeoutId);
          }
        } catch (e: any) {
          logs.push(`weather.open_meteo_failed=${String(e?.message || e)}`);
        }
      }
      const candidates: Array<{ code: string; idx: number }> = [];
      const pushCandidate = (code: string, idx: number) => {
        if (idx < 0) return;
        const upper = code.toUpperCase();
        if (!/^[A-Z]{3}$/.test(upper)) return;
        if (candidates.some(c => c.code === upper)) return;
        candidates.push({ code: upper, idx });
      };

      const isoMatches = q.match(/\b[A-Z]{3}\b/gi) || [];
      for (const m of isoMatches) {
        pushCandidate(m.toUpperCase(), q.toUpperCase().indexOf(m.toUpperCase()));
      }

      const aliasRules: Array<{ re: RegExp; code: string }> = [
        { re: /\b(usd|u\.s\.?\s*dollars?)\b/i, code: 'USD' },
        { re: /\b(try)\b/i, code: 'TRY' },
        { re: /\b(jod)\b/i, code: 'JOD' },
        { re: /\b(ils)\b/i, code: 'ILS' },
        { re: /\b(egp)\b/i, code: 'EGP' },
        { re: /\b(sar)\b/i, code: 'SAR' },
        { re: /\b(aed)\b/i, code: 'AED' },
        { re: /\b(eur)\b/i, code: 'EUR' },
        { re: /\b(gbp)\b/i, code: 'GBP' },
        { re: /\b(cad)\b/i, code: 'CAD' },
        { re: /\b(jpy)\b/i, code: 'JPY' },
        { re: /\b(cny)\b/i, code: 'CNY' },
        { re: /(دولار|الدولار)/i, code: 'USD' },
        { re: /(الليرة التركية|ليرة تركية|التركية)/i, code: 'TRY' },
        { re: /(الدينار الأردني|دينار أردني|الأردني)/i, code: 'JOD' },
        { re: /(الشيكل|شيكل|₪)/i, code: 'ILS' },
        { re: /(اليورو)/i, code: 'EUR' },
        { re: /(الجنيه الإسترليني|الجنيه الاسترليني|إسترليني)/i, code: 'GBP' },
        { re: /(الريال السعودي|ريال سعودي)/i, code: 'SAR' },
        { re: /(الدرهم الإماراتي|درهم إماراتي|الدرهم الاماراتي)/i, code: 'AED' },
        { re: /(الجنيه المصري|جنيه مصري)/i, code: 'EGP' },
      ];

      for (const r of aliasRules) {
        pushCandidate(r.code, norm.search(r.re));
      }

      candidates.sort((a, b) => a.idx - b.idx);
      const codeA = candidates[0]?.code;
      const codeB = candidates[1]?.code;

      const looksLikeFx =
        /(\bto\b|\/|->|=|مقابل|تحويل|سعر|كم|يساوي)/i.test(q) &&
        !!codeA &&
        !!codeB &&
        codeA !== codeB;

      if (looksLikeFx) {
        const base = codeA!;
        const quote = codeB!;
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 3500);
          const resp = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`, { signal: controller.signal });
          clearTimeout(timeout);
          if (resp.ok) {
            const j: any = await resp.json().catch(() => null);
            const rate = j?.rates?.[quote];
            if (typeof rate === 'number' && Number.isFinite(rate)) {
              const updated = typeof j?.time_last_update_utc === 'string' ? j.time_last_update_utc : '';
              const desc = `**ANSWER**: 1 ${base} = ${rate} ${quote}${updated ? ` (updated: ${updated})` : ''}`;
              results.push({ title: 'Currency Rate (API)', url: `https://open.er-api.com/v6/latest/${base}`, description: desc });
              logs.push(`fx.api=1 base=${base} quote=${quote}`);
              logs.push(`search.final_count=${results.length}`);
              return { ok: true, output: { results }, logs };
            }
          }
        } catch (e: any) {
          logs.push(`fx.api_failed=${String(e?.message || e)}`);
        }
      }
      
      // 1. Try DuckDuckGo + Wikipedia + Bing (Fast & Lightweight)
      try {
        const [ddgRes, wikiRes, bingRes] = await Promise.allSettled([
          (async () => {
             try {
                const { search, SafeSearchType } = await import('duck-duck-scrape');
                const locale = hasArabic ? 'ar-sa' : 'en-us';
                const ddgResp = await search(query, { locale, safeSearch: SafeSearchType.STRICT });
                if (ddgResp.results?.length) {
                    return ddgResp.results.map(r => ({
                        title: r.title,
                        url: r.url,
                        description: r.description ? r.description.replace(/<[^>]+>/g, '') : ''
                    }));
                }
             } catch (e: any) {
                logs.push(`ddg.error=${e.message}`);
             }
             return [];
          })(),
          (async () => {
             const lang = hasArabic ? 'ar' : 'en';
             try {
                const wurl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=10`;
                const r = await fetch(wurl);
                if (!r.ok) return [];
                const j = await r.json();
                return (j.query?.search || []).map((it: any) => ({
                   title: String(it.title),
                   url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(it.title.replace(/\s+/g, '_'))}`,
                   description: String(it.snippet).replace(/<[^>]+>/g, '')
                }));
             } catch { return []; }
          })(),
          (async () => {
              // Simple Bing Scrape (HTML)
              try {
                  const lang = hasArabic ? 'ar' : 'en';
                  const bUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=${lang}`;
                  const r = await fetch(bUrl, {
                      headers: {
                          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                          'Accept-Language': lang
                      }
                  });
                  if (!r.ok) return [];
                  const html = await r.text();
                  // Basic Regex Extraction for Bing (fragile but fast)
                  const items: any[] = [];
                  const regex = /<li class="b_algo"><h2><a href="([^"]+)"[^>]*>([^<]+)<\/a><\/h2>.*?<p[^>]*>(.*?)<\/p>/g;
                  let match;
                  while ((match = regex.exec(html)) !== null) {
                      if (items.length >= 10) break;
                      items.push({
                          title: match[2].replace(/<[^>]+>/g, ''),
                          url: match[1],
                          description: match[3].replace(/<[^>]+>/g, '')
                      });
                  }
                  return items;
              } catch (e: any) {
                  logs.push(`bing.error=${e.message}`);
                  return [];
              }
          })()
        ]);

        let raw: any[] = [];
        if (ddgRes.status === 'fulfilled') raw.push(...ddgRes.value);
        if (wikiRes.status === 'fulfilled') raw.push(...wikiRes.value);
        if (bingRes.status === 'fulfilled') raw.push(...bingRes.value);
        
        // Deduplicate & Rank
        const seen = new Set<string>();
        // Normalize helper
        const normUrl = (u: string) => u.toLowerCase().replace(/\/$/, '');
        
        for (const r of raw) {
            const n = normUrl(r.url);
            if (!seen.has(n)) {
                seen.add(n);
                results.push(r);
            }
        }

        // Smart Ranking: Float "Wikipedia" or "Definition" to top for definition queries
        const isDefinition = /^(what is|define|ما هو|تعريف|معنى|من هو)/i.test(q);
        if (isDefinition) {
            results.sort((a, b) => {
                const aWiki = a.url.includes('wikipedia') ? 1 : 0;
                const bWiki = b.url.includes('wikipedia') ? 1 : 0;
                return bWiki - aWiki;
            });
        }

        logs.push(`search.fast_results=${results.length}`);

      } catch (e: any) {
        logs.push(`search.fast_failed=${e.message}`);
      }

      // 2. Fallback to Puppeteer (Google) if results are weak
      if (results.length < 2) {
          logs.push('search.low_results_triggering_google');
          try {
            const puppeteer = await import('puppeteer');
            // Launch standard headless browser
            const browser = await puppeteer.launch({
                headless: true,
                args: [
                    '--no-sandbox', 
                    '--disable-setuid-sandbox', 
                    '--disable-dev-shm-usage', 
                    '--disable-gpu',
                    '--disable-features=site-per-process',
                    '--window-size=1280,800',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-infobars',
                    '--hide-scrollbars',
                    '--mute-audio',
                ],
                ignoreDefaultArgs: ['--enable-automation'],
            });
            
            const page = await browser.newPage();
            
            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
                Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en', 'ar'] });
            });
            
            await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                const type = req.resourceType();
                if (['image', 'stylesheet', 'font', 'media', 'other'].includes(type)) req.abort();
                else req.continue();
            });

            // Search Google
            const response = await page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}&hl=ar`, { waitUntil: 'domcontentloaded', timeout: 15000 });
            
            const pageTitle = await page.title();
            const content = await page.content();
            
            if (pageTitle.includes('Just a moment') || content.includes('challenge-platform') || content.includes('I am not a robot')) {
                logs.push('google.blocked=captcha_detected');
                await browser.close();
            } else {
                try { await page.waitForSelector('#search', { timeout: 3000 }); } catch {}

                // Consent check
                const title = await page.title();
                if (title.includes('Consent') || title.includes('Before you continue') || (title.includes('Google') && !title.includes(' - '))) {
                    try {
                        const buttons = await page.$$('button');
                        for (const btn of buttons) {
                            const text = await page.evaluate(el => el.textContent, btn);
                            if (text && (text.includes('Reject all') || text.includes('رفض الكل') || text.includes('I agree') || text.includes('أوافق'))) {
                                await btn.click();
                                await page.waitForNavigation({ waitUntil: 'domcontentloaded' });
                                break;
                            }
                        }
                    } catch {}
                }

                const googleResults = await page.evaluate(() => {
                    const items: any[] = [];
                    // Featured Snippet
                    const snippetEl = document.querySelector('.hgKElc') || document.querySelector('.kno-rdesc span');
                    if (snippetEl && snippetEl.textContent) {
                        items.push({
                            title: 'Direct Answer',
                            url: 'https://www.google.com',
                            description: `**ANSWER**: ${snippetEl.textContent.trim()}`
                        });
                    }
                    // Standard Results
                    const results = document.querySelectorAll('#search .g');
                    results.forEach(div => {
                        const titleEl = div.querySelector('h3');
                        const linkEl = div.querySelector('a');
                        const descEl = div.querySelector('.VwiC3b') || div.querySelector('.IsZvec') || div.querySelector('.st'); 
                        if (titleEl && linkEl) {
                            items.push({
                                title: titleEl.textContent?.trim(),
                                url: linkEl.href,
                                description: descEl?.textContent?.trim() || ''
                            });
                        }
                    });
                    return items;
                });

                await browser.close();
                if (googleResults.length > 0) {
                    results.push(...googleResults);
                    logs.push(`google.success=${googleResults.length}`);
                }
            }
          } catch (err: any) {
             logs.push(`google.failed=${err.message}`);
          }
      }

      // Final Deduplication & Return
      const unique = new Map();
      for (const r of results) {
          if (r.title.includes('Direct Answer')) {
              unique.set('direct_' + Math.random(), r);
          } else {
              // Normalize URL
              const u = r.url.replace(/\/$/, '');
              if (!unique.has(u)) unique.set(u, r);
          }
      }
      
      const final = Array.from(unique.values()).slice(0, 10);
      logs.push(`search.final_count=${final.length}`);
      
      if (final.length === 0) {
           return { ok: false, error: 'No results found in Web or Google Fallback', logs };
      }
      
      return { ok: true, output: { results: final }, logs };
    }
    if (name === 'file_read') {
      const filename = String(input?.filename ?? '');
      // Allow full path access for system engineering
      const full = resolveToolPath(filename);
      
      // Check if it's a directory
      if (fs.existsSync(full) && fs.lstatSync(full).isDirectory()) {
          return { ok: false, error: 'EISDIR: illegal operation on a directory, read', logs };
      }

      if (!fs.existsSync(full)) {
        return { ok: false, error: 'File not found', logs };
      }
      const content = fs.readFileSync(full, 'utf-8');
      logs.push(`read=${full} bytes=${content.length}`);
      return { ok: true, output: { content }, logs };
    }
    if (name === 'read_file_tree') {
      const p = String(input?.path || '.');
      const maxDepth = Math.min(5, Number(input?.depth ?? 2));
      const rootPath = resolveToolPath(p);
      
      if (!fs.existsSync(rootPath)) {
         return { ok: false, error: 'Directory not found', logs };
      }

      const getTree = (dir: string, currentDepth: number): string => {
        if (currentDepth > maxDepth) return '';
        try {
            const files = fs.readdirSync(dir, { withFileTypes: true });
            let result = '';
            // Sort directories first, then files
            files.sort((a, b) => {
                if (a.isDirectory() && !b.isDirectory()) return -1;
                if (!a.isDirectory() && b.isDirectory()) return 1;
                return a.name.localeCompare(b.name);
            });

            for (const f of files) {
                if (f.name.startsWith('.') && f.name !== '.env') continue; // Skip hidden except .env
                if (f.name === 'node_modules' || f.name === 'dist' || f.name === 'build' || f.name === '.git') {
                    result += '  '.repeat(currentDepth) + `/${f.name} (ignored)\n`;
                    continue;
                }
                
                if (f.isDirectory()) {
                    result += '  '.repeat(currentDepth) + `/${f.name}\n`;
                    result += getTree(path.join(dir, f.name), currentDepth + 1);
                } else {
                    result += '  '.repeat(currentDepth) + ` ${f.name}\n`;
                }
            }
            return result;
        } catch (e) {
            return '  '.repeat(currentDepth) + ` (error accessing dir)\n`;
        }
      };
      
      const tree = getTree(rootPath, 0);
      logs.push(`tree=${rootPath} depth=${maxDepth}`);
      return { ok: true, output: { tree }, logs };
    }
    if (name === 'ls') {
      const p = String(input?.path || '.');
      const dirPath = resolveToolPath(p);
      if (!fs.existsSync(dirPath)) {
          return { ok: false, error: 'Directory not found', logs };
      }
      const files = fs.readdirSync(dirPath);
      logs.push(`ls=${dirPath} count=${files.length}`);
      return { ok: true, output: { files }, logs };
    }
    if (name === 'shell_execute') {
      const command = String(input?.command ?? '');
      let cwdInput = String(input?.cwd ?? '');
      const timeoutVal = Number(input?.timeout ?? 30000);

      // Safety: simplistic check
      if (command.includes('rm -rf /') || command.includes('sudo')) {
         return { ok: false, error: 'Command not allowed', logs };
      }
      
      // Persistent CWD logic
      const stateFile = path.join(process.cwd(), '.joe', 'shell_state.json');
      if (!cwdInput && fs.existsSync(stateFile)) {
          try {
              const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
              if (state.cwd && fs.existsSync(state.cwd)) {
                  cwdInput = state.cwd;
              }
          } catch {}
      }
      
      const { exec } = await import('child_process');
      const util = await import('util');
      const execAsync = util.promisify(exec);
      
      const workDir = cwdInput ? (path.isAbsolute(cwdInput) ? cwdInput : path.resolve(process.cwd(), cwdInput)) : process.cwd();

      // Ensure .joe dir exists
      if (!fs.existsSync(path.join(process.cwd(), '.joe'))) {
          try { fs.mkdirSync(path.join(process.cwd(), '.joe')); } catch {}
      }

      try {
        const { stdout, stderr } = await execAsync(command, { cwd: workDir, timeout: timeoutVal, maxBuffer: 20 * 1024 * 1024 });
        
        // Update CWD if command was a cd
        // Note: 'cd' in child_process doesn't affect parent, but we can try to guess where the user wanted to go
        // Actually, since it's a separate process, 'cd' does nothing for the next command unless we chain it.
        // But if the user runs "mkdir foo && cd foo", we can't easily know they want to stay in foo.
        // However, if the command is JUST "cd path", we can simulate it.
        if (command.trim().startsWith('cd ')) {
            const target = command.trim().split(/\s+/)[1];
            if (target) {
                const newCwd = path.resolve(workDir, target);
                if (fs.existsSync(newCwd)) {
                    fs.writeFileSync(stateFile, JSON.stringify({ cwd: newCwd }));
                    logs.push(`shell.cwd_updated=${newCwd}`);
                }
            }
        }

        logs.push(`exec=${command} cwd=${workDir} exit=0`);
        return { ok: true, output: { stdout, stderr, exitCode: 0, cwd: workDir }, logs };
      } catch (err: any) {
        logs.push(`exec=${command} err=${err.message}`);
        return { ok: false, output: { stdout: err.stdout, stderr: err.stderr, exitCode: err.code || 1 }, logs };
      }
    }
    if (name === 'check_syntax') {
        const filename = String(input?.filename ?? '');
        const full = path.isAbsolute(filename) ? filename : path.resolve(process.cwd(), filename);
        
        if (!fs.existsSync(full)) return { ok: false, error: 'File not found', logs };
        
        const ext = path.extname(full).toLowerCase();
        
        if (ext === '.json') {
            try {
                JSON.parse(fs.readFileSync(full, 'utf-8'));
                return { ok: true, output: { status: 'OK' }, logs };
            } catch (e: any) {
                return { ok: false, error: e.message, logs };
            }
        }
        
        if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
            // Use node -c
            const { exec } = await import('child_process');
            const util = await import('util');
            const execAsync = util.promisify(exec);
            try {
                await execAsync(`node --check "${full}"`);
                return { ok: true, output: { status: 'OK' }, logs };
            } catch (e: any) {
                 return { ok: false, error: e.stderr || e.message, logs };
            }
        }

        if (ext === '.ts' || ext === '.tsx') {
            // Try tsc if available, else skip
            const { exec } = await import('child_process');
            const util = await import('util');
            const execAsync = util.promisify(exec);
            try {
                // Assuming tsc is in path or npx is available
                // npx tsc --noEmit is slow, maybe try local?
                // For now, let's try a simple compile check using npx if local tsc missing
                await execAsync(`npx -y tsc --noEmit "${full}" --esModuleInterop --skipLibCheck --target es2020 --moduleResolution node`);
                return { ok: true, output: { status: 'OK' }, logs };
            } catch (e: any) {
                // If it's just type errors, we return them as output, not tool failure
                return { ok: true, output: { status: 'Errors', errors: e.stdout }, logs };
            }
        }
        
        return { ok: true, output: { status: 'Skipped (unsupported type)' }, logs };
    }
    if (name === 'generate_tests') {
        const filename = String(input?.filename ?? '');
        const full = path.isAbsolute(filename) ? filename : path.resolve(process.cwd(), filename);
        
        if (!fs.existsSync(full)) return { ok: false, error: 'File not found', logs };
        
        const content = fs.readFileSync(full, 'utf-8');
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) return { ok: false, error: 'No API Key for generation', logs };
        
        try {
            const { default: OpenAI } = await import('openai');
            const client = new OpenAI({ apiKey, baseURL: process.env.OPENAI_BASE_URL });
            
            const completion = await client.chat.completions.create({
                model: process.env.OPENAI_MODEL || 'gpt-4o',
                messages: [
                    { role: 'system', content: 'You are a Senior QA Engineer. Generate a comprehensive test file for the provided code. Use Jest/Vitest syntax. Return ONLY the code, no markdown.' },
                    { role: 'user', content: `File: ${path.basename(filename)}\n\n${content}` }
                ]
            });
            
            let testCode = completion.choices[0].message.content || '';
            // Strip markdown code blocks if present
            testCode = testCode.replace(/^```(typescript|ts|javascript|js)?\n/, '').replace(/\n```$/, '');
            
            const testDir = path.join(path.dirname(full), '__tests__');
            if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
            
            const testFile = path.join(testDir, `${path.basename(filename, path.extname(filename))}.test${path.extname(filename)}`);
            fs.writeFileSync(testFile, testCode);
            
            logs.push(`tests.generated=${testFile}`);
            return { ok: true, output: { testFile }, logs };
            
        } catch (e: any) {
            return { ok: false, error: e.message, logs };
        }
    }
    if (name === 'db_inspect') {
        const connStr = String(input?.connectionString || process.env.MONGO_URI || '');
        if (!connStr) return { ok: false, error: 'No connection string provided', logs };
        
        if (connStr.startsWith('mongodb')) {
             try {
                 const mongoose = await import('mongoose');
                 // Create a separate connection to avoid messing with main app
                 const conn = await mongoose.createConnection(connStr).asPromise();
                 
                 if (!conn.db) {
                     await conn.close();
                     return { ok: false, error: 'Failed to connect to DB', logs };
                 }

                 const collections = await conn.db.listCollections().toArray();
                 const schema: any = {};
                 
                 for (const col of collections) {
                     const sample = await conn.db.collection(col.name).findOne({});
                     schema[col.name] = sample ? Object.keys(sample) : [];
                 }
                 
                 await conn.close();
                 return { ok: true, output: { type: 'mongodb', collections: schema }, logs };
             } catch (e: any) {
                 return { ok: false, error: e.message, logs };
             }
        }
        
        return { ok: false, error: 'Unsupported DB type (only mongodb for now)', logs };
    }
    if (name === 'generate_docs') {
        const p = String(input?.path || '.');
        const root = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) return { ok: false, error: 'No API Key', logs };
        
        // Naive implementation: just do top-level files for now to save tokens
        // A real one would use a recursive walker with context window management
        const files = fs.readdirSync(root).filter(f => /\.(ts|js|py|go)$/.test(f)).slice(0, 5);
        
        const docs: any = {};
        
        try {
            const { default: OpenAI } = await import('openai');
            const client = new OpenAI({ apiKey, baseURL: process.env.OPENAI_BASE_URL });
            
            for (const f of files) {
                const content = fs.readFileSync(path.join(root, f), 'utf-8');
                const completion = await client.chat.completions.create({
                    model: 'gpt-4o',
                    messages: [
                        { role: 'system', content: 'Generate a professional JSDoc/docstring summary for this file. Return ONLY the documentation comment.' },
                        { role: 'user', content }
                    ]
                });
                docs[f] = completion.choices[0].message.content;
            }
            
            // Write a README_API.md
            let md = '# API Documentation\n\n';
            for (const [f, doc] of Object.entries(docs)) {
                md += `## ${f}\n\n${doc}\n\n`;
            }
            fs.writeFileSync(path.join(root, 'README_API.md'), md);
            
            return { ok: true, output: { file: 'README_API.md' }, logs };
        } catch (e: any) {
            return { ok: false, error: e.message, logs };
        }
    }
    if (name === 'git_ops') {
        const op = String(input?.operation);
        const args = (input?.args as string[]) || [];
        const { exec } = await import('child_process');
        const util = await import('util');
        const execAsync = util.promisify(exec);
        let askpassDir = '';
        
        try {
            let cmd = `git ${op} ${args.join(' ')}`;
            // Safety: Ensure user identity exists before commit
            if (op === 'commit') {
                 try {
                    await execAsync('git config user.name');
                 } catch {
                    await execAsync('git config user.name "Joe AI"');
                    await execAsync('git config user.email "joe@xelitesolutions.com"');
                 }
            }

            const env: Record<string, string> = {};
            const sessionId = typeof (input as any)?.sessionId === 'string' ? String((input as any).sessionId).trim() : '';
            const userId = typeof (input as any)?.userId === 'string' ? String((input as any).userId).trim() : '';
            const wantsAuth = ['push', 'fetch', 'pull', 'clone'].includes(op);
            let askpassPath = '';
            if (wantsAuth && (sessionId || userId)) {
              try {
                const { getSessionSecret, getUserSecret } = await import('../services/secrets');
                const token =
                  (userId ? (await getUserSecret(userId, 'github', 'GITHUB_TOKEN')) : null) ||
                  getSessionSecret(sessionId, 'GITHUB_TOKEN') ||
                  '';
                if (token) {
                  const fs = await import('fs');
                  const os = await import('os');
                  const path = await import('path');
                  askpassDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'joe-askpass-'));
                  askpassPath = path.join(askpassDir, 'askpass.sh');
                  const script = `#!/bin/sh\ncase \"$1\" in\n*Username*) echo \"x-access-token\";;\n*) echo \"$JOE_GIT_TOKEN\";;\nesac\n`;
                  await fs.promises.writeFile(askpassPath, script, { mode: 0o700 });
                  env.GIT_ASKPASS = askpassPath;
                  env.GIT_TERMINAL_PROMPT = '0';
                  env.DISPLAY = '1';
                  env.JOE_GIT_TOKEN = token;
                }
              } catch {}
            }

            try {
              const { stdout, stderr } = await execAsync(cmd, { cwd: process.cwd(), env: { ...process.env, ...env } });
              logs.push(`git.op=${op} success`);
              return { ok: true, output: { output: stdout || stderr }, logs };
            } finally {
              if (askpassDir) {
                try {
                  const fs = await import('fs');
                  await fs.promises.rm(askpassDir, { recursive: true, force: true });
                } catch {}
              }
            }
        } catch (e: any) {
            if (askpassDir) {
              try {
                const fs = await import('fs');
                await fs.promises.rm(askpassDir, { recursive: true, force: true });
              } catch {}
            }
            return { ok: false, error: e.message || e.stderr, logs };
        }
    }
    if (name === 'github_create_repo') {
        const repoName = String(input?.name || '').trim();
        const isPrivate = Boolean(input?.private);
        const description = typeof input?.description === 'string' ? input.description : undefined;
        const sessionId = typeof (input as any)?.sessionId === 'string' ? String((input as any).sessionId).trim() : '';
        const userId = typeof (input as any)?.userId === 'string' ? String((input as any).userId).trim() : '';
        if (!repoName) return { ok: false, error: 'Missing repo name', logs };
        if (!sessionId) return { ok: false, error: 'Missing sessionId', logs };

        const { getSessionSecret, getUserSecret } = await import('../services/secrets');
        const token = (
          (userId ? await getUserSecret(userId, 'github', 'GITHUB_TOKEN') : null) ||
          getSessionSecret(sessionId, 'GITHUB_TOKEN') ||
          ''
        ).trim();
        if (!token) return { ok: false, error: 'Missing GitHub token', logs };

        const payload: any = { name: repoName, private: isPrivate };
        if (description && description.trim()) payload.description = description.trim();

        try {
          const resp = await fetch('https://api.github.com/user/repos', {
            method: 'POST',
            headers: {
              'Accept': 'application/vnd.github+json',
              'Content-Type': 'application/json',
              'User-Agent': 'JOE AI',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          });

          const text = await resp.text();
          let json: any = null;
          try { json = JSON.parse(text); } catch {}

          if (!resp.ok) {
            const msg = typeof json?.message === 'string' ? json.message : text.slice(0, 300);
            const errs = Array.isArray(json?.errors) ? json.errors : [];
            const errMsg = errs
              .map((e: any) => (typeof e?.message === 'string' ? e.message : typeof e === 'string' ? e : ''))
              .filter(Boolean)
              .slice(0, 3)
              .join(' | ');

            if (resp.status === 422) {
              try {
                const meResp = await fetch('https://api.github.com/user', {
                  method: 'GET',
                  headers: {
                    'Accept': 'application/vnd.github+json',
                    'User-Agent': 'JOE AI',
                    'Authorization': `Bearer ${token}`,
                  },
                });
                const meText = await meResp.text();
                let meJson: any = null;
                try { meJson = JSON.parse(meText); } catch {}
                const login = typeof meJson?.login === 'string' ? meJson.login.trim() : '';
                if (login) {
                  const checkResp = await fetch(`https://api.github.com/repos/${encodeURIComponent(login)}/${encodeURIComponent(repoName)}`, {
                    method: 'GET',
                    headers: {
                      'Accept': 'application/vnd.github+json',
                      'User-Agent': 'JOE AI',
                      'Authorization': `Bearer ${token}`,
                    },
                  });
                  if (checkResp.ok) {
                    return { ok: false, error: `GitHub API 422: Repository "${login}/${repoName}" already exists.`, logs };
                  }
                }
              } catch {}
            }

            const details = errMsg ? ` (${errMsg})` : '';
            return { ok: false, error: `GitHub API ${resp.status}: ${msg}${details}`, logs };
          }

          return {
            ok: true,
            output: {
              fullName: typeof json?.full_name === 'string' ? json.full_name : '',
              htmlUrl: typeof json?.html_url === 'string' ? json.html_url : '',
              apiUrl: typeof json?.url === 'string' ? json.url : '',
            },
            logs,
          };
        } catch (e: any) {
          return { ok: false, error: e?.message || String(e), logs };
        }
    }
    if (name === 'npm_manager') {
        const cmd = String(input?.command);
        const pkgs = (input?.packages as string[]) || [];
        const isDev = !!input?.dev;
        const { exec } = await import('child_process');
        const util = await import('util');
        const execAsync = util.promisify(exec);
        
        try {
            let fullCmd = `npm ${cmd}`;
            if (pkgs.length > 0) fullCmd += ` ${pkgs.join(' ')}`;
            if (isDev && (cmd === 'install' || cmd === 'i')) fullCmd += ' -D';
            
            logs.push(`npm.cmd=${fullCmd} starting...`);
            const { stdout, stderr } = await execAsync(fullCmd, { cwd: process.cwd() });
            
            // Auto-install types for TS projects
            if ((cmd === 'install' || cmd === 'i') && pkgs.length > 0) {
                 const tsConfig = path.join(process.cwd(), 'tsconfig.json');
                 if (fs.existsSync(tsConfig)) {
                     const typesToInstall = pkgs
                         .filter(p => !p.startsWith('@types/'))
                         .map(p => `@types/${p.split('@')[0]}`); // handle versioned pkg@1.0.0
                     
                     if (typesToInstall.length > 0) {
                         try {
                             logs.push(`npm.auto_types=${typesToInstall.join(' ')}`);
                             await execAsync(`npm install -D ${typesToInstall.join(' ')}`, { cwd: process.cwd() });
                         } catch (e) {
                             // Ignore type install errors (maybe types don't exist)
                             logs.push('npm.auto_types_failed (ignored)');
                         }
                     }
                 }
            }
            
            return { ok: true, output: { output: stdout }, logs };
        } catch (e: any) {
             return { ok: false, error: e.message || e.stderr, logs };
        }
    }
    if (name === 'file_edit') {
      const filename = String(input?.filename ?? '');
      const find = String(input?.find ?? '');
      const replace = String(input?.replace ?? '');
      // Allow full path access for system engineering
      const full = path.isAbsolute(filename) ? filename : path.resolve(process.cwd(), filename);
      
      if (!fs.existsSync(full)) return { ok: false, error: 'File not found', logs };
      
      let content = fs.readFileSync(full, 'utf-8');
      if (!content.includes(find)) {
          return { ok: false, error: 'Text to replace not found', logs };
      }
      content = content.replace(find, replace);
      fs.writeFileSync(full, content);
      logs.push(`edit=${filename}`);
      return { ok: true, output: { success: true }, logs };
    }
    if (name === 'grep_search') {
      const query = String(input?.query ?? '');
      const searchPath = String(input?.path ?? '.');
      const include = String(input?.include ?? ''); // e.g., "*.ts"
      const exclude = String(input?.exclude ?? ''); // e.g., "node_modules"

      const root = repoRoot();
      const workDir = path.isAbsolute(searchPath) ? searchPath : path.resolve(root, searchPath);
      
      // Construct grep command
      // -r: recursive
      // -n: line number
      // -I: ignore binary
      let cmd = `grep -rnI "${query.replace(/"/g, '\\"')}" "${workDir}"`;
      
      if (include) {
         cmd += ` --include="${include}"`;
      }
      if (exclude) {
         cmd += ` --exclude-dir="${exclude}"`;
      } else {
         cmd += ` --exclude-dir="node_modules" --exclude-dir=".git" --exclude-dir="dist" --exclude-dir="build"`;
      }

      logs.push(`grep.cmd=${cmd}`);
      
      const { exec } = await import('child_process');
      const util = await import('util');
      const execAsync = util.promisify(exec);
      
      try {
        const { stdout } = await execAsync(cmd, { maxBuffer: 1024 * 1024 * 5 }); // 5MB buffer
        const lines = stdout.split('\n').filter(Boolean).slice(0, 100); // Limit to 100 matches
        logs.push(`grep.matches=${lines.length}`);
        return { ok: true, output: { matches: lines, count: lines.length, truncated: lines.length === 100 }, logs };
      } catch (err: any) {
        // grep returns 1 if no matches found, which is not an error for us
        if (err.code === 1) {
            return { ok: true, output: { matches: [], count: 0 }, logs };
        }
        logs.push(`grep.error=${err.message}`);
        return { ok: false, error: err.message, logs };
      }
    }
    if (name === 'scaffold_project') {
      const structure = input?.structure || {};
      const baseDir = String(input?.baseDir || '.');
      const resolvedBase = path.isAbsolute(baseDir) ? baseDir : path.resolve(process.cwd(), baseDir);
      
      const created: string[] = [];
      const errors: string[] = [];
      
      for (const [relativePath, content] of Object.entries(structure)) {
          const fullPath = path.join(resolvedBase, relativePath);
          
          try {
              if (content === null) {
                  // Directory
                  if (!fs.existsSync(fullPath)) {
                      fs.mkdirSync(fullPath, { recursive: true });
                      created.push(`${relativePath}/`);
                  }
              } else {
                  // File
                  const dir = path.dirname(fullPath);
                  if (!fs.existsSync(dir)) {
                      fs.mkdirSync(dir, { recursive: true });
                  }
                  fs.writeFileSync(fullPath, String(content));
                  created.push(relativePath);
              }
          } catch (e: any) {
              errors.push(`${relativePath}: ${e.message}`);
          }
      }
      
      logs.push(`scaffold.created=${created.length} errors=${errors.length}`);
      return { 
          ok: errors.length === 0, 
          output: { created, errors }, 
          logs 
      };
    }

    if (name === 'scaffold_full_stack') {
        const projectName = String(input?.name || 'my-app').trim();
        const type = String(input?.type || 'ecommerce') as any;
        const features = Array.isArray(input?.features) ? input.features : [];
        const preferredBase = String(input?.baseDir || '').trim();
        
        // Determine base directory: respect explicit baseDir, else repo root; if user requested "vivos", use it
        const root = repoRoot();
        const baseDir = (() => {
            if (preferredBase) return resolveToolPath(preferredBase);
            // Heuristic: if project name mentioned alongside 'vivos' repository, create inside that folder
            const vivosDir = path.join(root, 'vivos');
            try { if (fs.existsSync(vivosDir) && fs.lstatSync(vivosDir).isDirectory()) return vivosDir; } catch {}
            return root;
        })();
        
        try {
            const result = Builder.scaffold(projectName, type, features, baseDir);
            logs.push(`builder.scaffold.success=${projectName} base=${baseDir}`);
            return { ok: true, output: result, logs };
        } catch (e: any) {
            return { ok: false, error: e.message, logs };
        }
    }

    if (name === 'analyze_project') {
        const root = String(input?.path || process.cwd()).trim();
        try {
            const result = Analyst.analyze(root);
            logs.push(`analyst.analyze.success=${root}`);
            return { ok: true, output: result, logs };
        } catch (e: any) {
            return { ok: false, error: e.message, logs };
        }
    }
    if (name === 'analyze_codebase') {
       const p = String(input?.path || '.');
       const root = resolveToolPath(p);
       const logs: string[] = [];
       
       if (!fs.existsSync(root)) return { ok: false, error: 'Path not found', logs };
       
       logs.push(`analyze.root=${root}`);

       // 1. Get File Structure (limited to depth 3)
       const getStructure = (dir: string, depth: number): string[] => {
           if (depth > 3) return [];
           try {
               const items = fs.readdirSync(dir, { withFileTypes: true });
               let res: string[] = [];
               for (const item of items) {
                   if (item.name.startsWith('.') || item.name === 'node_modules' || item.name === 'dist' || item.name === 'build' || item.name === 'coverage') continue;
                   if (item.isDirectory()) {
                       res.push(`${item.name}/`);
                       const subs = getStructure(path.join(dir, item.name), depth + 1);
                       res = res.concat(subs.map(s => `${item.name}/${s}`));
                   } else {
                       res.push(item.name);
                   }
               }
               return res;
           } catch { return []; }
       };
       const allFiles = getStructure(root, 0);
       // Smart filter: prioritize root files and src/
       const structure = allFiles
           .filter(f => !f.includes('test/') && !f.includes('__tests__/')) // Hide tests in summary to save space
           .slice(0, 60)
           .join('\n');

       // 2. Identify and Read Key Files
       const keyFiles = ['package.json', 'README.md', 'tsconfig.json', 'Dockerfile', 'docker-compose.yml', 'go.mod', 'requirements.txt', 'Cargo.toml', 'Gemfile', 'pyproject.toml'];
       const fileContents: string[] = [];
       
       for (const kf of keyFiles) {
           const kp = path.join(root, kf);
           if (fs.existsSync(kp)) {
               const content = fs.readFileSync(kp, 'utf-8');
               // For package.json, just take scripts and dependencies to save tokens
               if (kf === 'package.json') {
                   try {
                       const pkg = JSON.parse(content);
                       const slim = { name: pkg.name, version: pkg.version, scripts: pkg.scripts, dependencies: pkg.dependencies, devDependencies: pkg.devDependencies };
                       fileContents.push(`=== ${kf} ===\n${JSON.stringify(slim, null, 2)}\n`);
                   } catch {
                       fileContents.push(`=== ${kf} ===\n${content.slice(0, 1000)}\n`);
                   }
               } else {
                   fileContents.push(`=== ${kf} ===\n${content.slice(0, 1500)}\n`);
               }
           }
       }
       
       // Add some source code samples (entry points)
       const sourceFiles = allFiles.filter(f => /^(src\/|app\/|lib\/)?(index|main|server|app|root)\.(ts|js|py|go|rb|java)$/.test(f)).slice(0, 2);
       for (const sf of sourceFiles) {
           const sp = path.join(root, sf);
            if (fs.existsSync(sp)) {
               const content = fs.readFileSync(sp, 'utf-8').slice(0, 1000);
               fileContents.push(`=== ${sf} ===\n${content}\n`);
           }
       }
       
       // Context file
       const contextPath = path.join(root, '.joe/context.json');
       if (fs.existsSync(contextPath)) {
           fileContents.push(`=== .joe/context.json ===\n${fs.readFileSync(contextPath, 'utf-8').slice(0, 1000)}\n`);
       }

       // 3. Generate Summary with LLM
       const apiKey = process.env.OPENAI_API_KEY;
       if (!apiKey) {
           return { ok: true, output: { summary: `## File Structure\n${structure}\n\n## Key Files Found\n${fileContents.map(f => f.split('\n')[0]).join('\n')}` }, logs };
       }

       try {
           const { default: OpenAI } = await import('openai');
           const client = new OpenAI({ apiKey, baseURL: process.env.OPENAI_BASE_URL });
           
           const completion = await client.chat.completions.create({
               model: 'gpt-4o',
               messages: [
                   { role: 'system', content: 'You are a Senior Software Architect. Analyze the provided codebase context and generate a high-level architectural summary. Focus on: Tech Stack, Key Components, Entry Points, and Project Structure. Be concise.' },
                   { role: 'user', content: `File Structure (partial):\n${structure}\n\nKey File Contents:\n${fileContents.join('\n')}` }
               ]
           });
           
           const summary = completion.choices[0].message.content || 'Analysis failed';
           return { ok: true, output: { summary }, logs };
       } catch (e: any) {
           logs.push(`analyze.llm_error=${e.message}`);
           // Fallback to raw dump
           return { ok: true, output: { summary: `## File Structure\n${structure}\n\n## Key Files Found\n${fileContents.map(f => f.split('\n')[0]).join('\n')}\n(LLM Analysis Failed: ${e.message})` }, logs };
       }
    }
    if (name === 'knowledge_search') {
      const query = String(input?.query ?? '');
      const results = await KnowledgeService.search(query);
      logs.push(`knowledge.search=${query} count=${results.length}`);
      const mapped = results.map(r => ({
          id: r.document.id,
          filename: r.document.filename,
          snippet: r.snippet,
          score: r.score
      })).slice(0, 10);
      return { ok: true, output: { results: mapped }, logs };
    }
    if (name === 'knowledge_add') {
      const filename = String(input?.filename ?? 'unknown.txt');
      const content = String(input?.content ?? '');
      const tags = Array.isArray(input?.tags) ? input.tags : [];
      const doc = await KnowledgeService.add(filename, content, tags);
      logs.push(`knowledge.add=${filename} id=${doc.id}`);
      return { ok: true, output: { id: doc.id }, logs };
    }
    if (name.startsWith('noop_')) {
      logs.push('noop.ok=true');
      return { ok: true, output: { ok: true }, logs };
    }
    return { ok: false, error: 'unknown_tool', logs };
  } catch (e: any) {
    logs.push(`error=${e?.message || String(e)}`);
    return { ok: false, error: e?.message || 'error', logs };
  } finally {
    logs.push(`[${new Date().toISOString()}] end ${name} dt=${Date.now() - t0}ms`);
  }
}
