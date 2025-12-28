import fs from 'fs';
import path from 'path';
import { ToolDefinition, ToolExecutionResult } from './types';
import { Buffer } from 'buffer';
import { config } from '../config';
import { spawn } from 'child_process';
import os from 'os';

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
  const autoSetting = String(process.env.AUTO_START_BROWSER_WORKER ?? '').trim().toLowerCase();
  const auto =
    autoSetting === ''
      ? true
      : autoSetting === '1' || autoSetting === 'true' || autoSetting === 'yes';

  if (!auto || process.env.NODE_ENV === 'production' || !isLocalWorkerUrl(base)) return;
  const healthy = await waitForWorkerHealth(base, 250);
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
        if (!nav.ok) logs.push(`nav_error=${nav.status}`);
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
      const artifacts = [{ name: 'snapshot.jpg', href: `${base}/shots/${path.basename(j.screenshot)}` }];
      return { ok: true, output: { dom: j.dom, a11y: j.a11y, screenshot: j.screenshot }, logs, artifacts };
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
    { name: 'npm_install', command: 'npm install' },
    { name: 'npm_ci', command: 'npm ci' },
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
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 1200);
        return { title, metaDescription, headings: headings.slice(0, 12), links: links.slice(0, 12), textSnippet };
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
          await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
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

      if (renderRequested) {
        const out = await renderWithPuppeteer(url);
        html = out.html;
        finalUrl = out.finalUrl;
        rendered = true;
        logs.push('html_extract.rendered=1');
      } else {
        const resp = await fetch(url);
        finalUrl = (resp as any)?.url ? String((resp as any).url) : url;
        logs.push(`fetch.status=${resp.status}`);
        html = await resp.text();
      }

      let parsed = parseHtml(html, finalUrl);
      const weak =
        !rendered &&
        String(parsed.title || '').trim().length === 0 &&
        String(parsed.textSnippet || '').trim().length < 80 &&
        (parsed.headings?.length || 0) === 0;

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

      const apiKey = process.env.OPENAI_API_KEY;
      let searchQueries = [topic];

      // 1. PLAN: Generate search queries if we have an LLM
      if (apiKey) {
        try {
          const { default: OpenAI } = await import('openai');
          const client = new OpenAI({ apiKey, baseURL: process.env.OPENAI_BASE_URL });
          
          const planCompletion = await client.chat.completions.create({
            model: 'gpt-4o',
            messages: [
              { 
                role: 'system', 
                content: 'You are a Senior Research Planner. Breakdown the user topic into 3-5 distinct, targeted web search queries to gather comprehensive information. Return ONLY a JSON array of strings, e.g. ["query1", "query2"].' 
              },
              { role: 'user', content: `Topic: ${topic}` }
            ],
            response_format: { type: 'json_object' }
          });
          
          const planText = planCompletion.choices[0].message.content || '{}';
          const planJson = JSON.parse(planText);
          if (Array.isArray(planJson.queries)) {
            searchQueries = planJson.queries.slice(0, 5);
          } else if (Array.isArray(planJson)) {
             searchQueries = planJson.slice(0, 5);
          }
          logs.push(`research.plan=${searchQueries.join('|')}`);
        } catch (e: any) {
          logs.push(`planning_failed=${e.message}`);
        }
      }

      // 2. SEARCH: Execute searches in parallel
      const allResults: any[] = [];
      const searchPromises = searchQueries.map(q => executeTool('web_search', { query: q }));
      const searchOutcomes = await Promise.all(searchPromises);
      
      for (const res of searchOutcomes) {
        if (res.ok && Array.isArray(res.output?.results)) {
          allResults.push(...res.output.results);
        }
      }

      if (allResults.length === 0) {
        return { ok: false, error: 'No search results found for any query', logs };
      }
      
      // Dedup results by URL
      const uniqueResults = new Map();
      for (const r of allResults) {
        if (!uniqueResults.has(r.url)) uniqueResults.set(r.url, r);
      }
      const topResults = Array.from(uniqueResults.values()).slice(0, 8); // Increase from 3 to 8
      logs.push(`research.sources_found=${topResults.length}`);
      
      const contents: string[] = [];
      
      // 3. EXTRACT: Fetch content (sequential to be nice to rate limits/network, or parallel with limit)
      // Let's do parallel with a limit of 4 at a time
      const chunkSize = 4;
      for (let i = 0; i < topResults.length; i += chunkSize) {
          const chunk = topResults.slice(i, i + chunkSize);
          await Promise.all(chunk.map(async (res: any) => {
            try {
                // logs.push(`fetching=${res.url}`); // Reduce log spam
                const ext = await executeTool('html_extract', { url: res.url });
                if (ext.ok && ext.output?.textSnippet) {
                    contents.push(`Source: ${res.title} (${res.url})\nContent: ${ext.output.textSnippet}\n`);
                }
            } catch (e) {
                // Ignore
            }
          }));
      }
      
      if (contents.length === 0) {
        return { ok: false, error: 'Failed to extract content from sources', logs };
      }

      // 4. SYNTHESIZE
      if (!apiKey) {
        return { 
          ok: true, 
          output: { 
            report: `## Research Results for ${topic}\n\n${contents.join('\n\n')}`, 
            sources: topResults.map(r => r.url) 
          }, 
          logs 
        };
      }

      try {
        const { default: OpenAI } = await import('openai');
        const client = new OpenAI({ apiKey, baseURL: process.env.OPENAI_BASE_URL });
        
        const completion = await client.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { 
              role: 'system', 
              content: `You are an Elite Research Assistant. Your goal is to produce a definitive, comprehensive report on the topic.
Instructions:
1. Synthesize information from multiple sources.
2. Resolve conflicts if any.
3. Structure with clear headings, bullet points, and sections.
4. Cite sources using [1], [2] notation and provide a reference list at the end.
5. If the topic or sources are in Arabic, write the report in Arabic.
6. Be objective, detailed, and professional.` 
            },
            {
              role: 'user',
              content: `Topic: ${topic}\n\nSources:\n${contents.join('\n---\n')}`
            }
          ]
        });

        const report = completion.choices[0].message.content || 'No report generated.';
        return {
          ok: true,
          output: {
            report,
            sources: topResults.map(r => r.url)
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
        /(?:\bweather\b|الطقس|حالة\s+الطقس|درجة\s+الحرارة)/i.test(q) &&
        /(?:\btoday\b|اليوم|\bnow\b|الآن|\bcurrent\b|حالي(?:اً|ا)?)/i.test(q);

      if (looksLikeWeather) {
        const city =
          /(?:istanbul|إسطنبول|اسطنبول)/i.test(q)
            ? 'Istanbul'
            : (() => {
                const m =
                  q.match(/(?:in|في)\s+([a-zA-Z\u0600-\u06FF][a-zA-Z\u0600-\u06FF\s-]{1,40})/i) ||
                  q.match(/([a-zA-Z\u0600-\u06FF][a-zA-Z\u0600-\u06FF\s-]{1,40})\s+(?:weather|الطقس|حالة\s+الطقس)/i);
                return String(m?.[1] || 'Istanbul').trim();
              })();

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          try {
            const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=${hasArabic ? 'ar' : 'en'}&format=json`;
            const geoResp = await fetch(geoUrl, { signal: controller.signal });
            if (!geoResp.ok) throw new Error(`geocode_http_${geoResp.status}`);
            const geo: any = await geoResp.json().catch(() => null);
            const hit = Array.isArray(geo?.results) ? geo.results[0] : null;
            const lat = typeof hit?.latitude === 'number' ? hit.latitude : null;
            const lon = typeof hit?.longitude === 'number' ? hit.longitude : null;
            const placeName = String(hit?.name || city).trim() || city;
            const country = String(hit?.country || '').trim();
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
            logs.push(`weather.open_meteo=1 city=${city}`);
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
      
      // 1. Try Puppeteer (Google)
      try {
        const puppeteer = await import('puppeteer');
        // Launch standard headless browser
        const browser = await puppeteer.launch({
            headless: true, // Use boolean true for stability
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        });
        
        const page = await browser.newPage();
        
        // Use Desktop User Agent for better structure
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');
        
        // Block heavy resources
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const type = req.resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(type)) req.abort();
            else req.continue();
        });

        // Search Google (force English for consistency or Arabic if preferred? Let's use auto but maybe add hl=ar if query is arabic?)
        // Actually, let's just use the query as is.
        await page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}&hl=ar`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        
        // Wait briefly for content
        try { await page.waitForSelector('#search', { timeout: 3000 }); } catch {}

        // Check for Consent Page
        const title = await page.title();
        logs.push(`google.title=${title}`);
        
        if (title.includes('Consent') || title.includes('Before you continue') || title.includes('Google') && !title.includes(' - ')) {
             // Try to find and click "Reject all" or "Accept all"
             // Buttons usually have class "QS5gu sy4vM"
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
            
            // Desktop Selectors
            
            // 1. Currency Converter Specifics (often has class DFlfde SwHCTb for value)
            const currencyValue = document.querySelector('.DFlfde.SwHCTb');
            const currencySource = document.querySelector('.vLqKYe'); // "1 Jordanian Dinar equals"
            const currencyTarget = document.querySelector('.MWvIVe'); // "New Israeli Shekel"
            
            if (currencyValue && currencySource) {
                 items.push({
                    title: 'Currency Rate (Direct)',
                    url: 'https://www.google.com',
                    description: `**ANSWER**: ${currencySource.textContent} ${currencyValue.textContent} ${currencyTarget?.textContent || ''}`
                });
            }

            // 2. Featured Snippet / Direct Answer
            const snippetEl = document.querySelector('.hgKElc') || document.querySelector('.kno-rdesc span');
            if (snippetEl && snippetEl.textContent) {
                 items.push({
                    title: 'Direct Answer',
                    url: 'https://www.google.com',
                    description: `**ANSWER**: ${snippetEl.textContent.trim()}`
                });
            }
            
            // 3. Standard Results (.g)
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

            if (items.length < 3) {
              const h3s = Array.from(document.querySelectorAll('#search a h3'));
              for (const h3 of h3s) {
                const a = h3.closest('a') as HTMLAnchorElement | null;
                if (!a?.href) continue;
                const title = (h3.textContent || '').trim();
                if (!title) continue;
                let desc = '';
                const container = a.closest('div');
                if (container) {
                  const t = container.textContent || '';
                  desc = t.replace(title, '').replace(/\s+/g, ' ').trim().slice(0, 220);
                }
                items.push({ title, url: a.href, description: desc });
                if (items.length >= 10) break;
              }
            }
            
            return items;
        });

        await browser.close();
        
        if (googleResults.length > 0) {
            results.push(...googleResults);
            logs.push(`google.success=${googleResults.length}`);
        } else {
            throw new Error('No Google results found');
        }

      } catch (err: any) {
         logs.push(`google.failed=${err.message}. Switching to fallback...`);
         
         // 2. Fallback: DuckDuckGo + Wiki (The Old Reliable Method)
         try {
             // 2a. DDG API (Fastest)
             const officialUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
             try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 2000);
                const resp = await fetch(officialUrl, { signal: controller.signal });
                clearTimeout(timeout);
                if (resp.ok) {
                    const body = await resp.text();
                    let json: any = null;
                    try { json = JSON.parse(body); } catch {}
                    const topics = Array.isArray(json?.RelatedTopics) ? json.RelatedTopics : [];
                    const items = topics.map((t: any) => ({
                        title: String(t?.Text || '').slice(0, 120),
                        url: String(t?.FirstURL || ''),
                        description: String(t?.Text || '')
                    })).filter((x: any) => x.url && x.title).slice(0, 5);
                    results.push(...items);
                }
             } catch {}

             // 2b. Scraper + Wiki
             if (results.length < 2) {
                 const [scrapeRes, wikiRes] = await Promise.allSettled([
                   (async () => {
                      const ddg = await import('duck-duck-scrape');
                      try {
                         const timeout = new Promise<any>((_, reject) => setTimeout(() => reject(new Error('DDG Timeout')), 5000));
                         const search = ddg.search(query);
                         const res = await Promise.race([search, timeout]);
                         return (res.results || []).map((r: any) => ({
                           title: String(r.title).slice(0, 120),
                           url: String(r.url),
                           description: String(r.description)
                         })).filter((x: any) => x.url && x.title);
                      } catch (e) { return []; }
                   })(),
                   (async () => {
                      const hasArabic = /[\u0600-\u06FF]/.test(query);
                      const lang = hasArabic ? 'ar' : 'en';
                      const trySearch = async (q: string) => {
                          try {
                             const wurl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&srlimit=5`;
                             const r = await fetch(wurl);
                             if (!r.ok) return [];
                             const j = await r.json();
                             return (j.query?.search || []).map((it: any) => ({
                               title: String(it.title),
                               url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(it.title.replace(/\s+/g, '_'))}`,
                               description: String(it.snippet).replace(/<[^>]+>/g, '')
                             }));
                          } catch { return []; }
                      };
                      return await trySearch(query);
                   })()
                 ]);

                 if (scrapeRes.status === 'fulfilled') results.push(...scrapeRes.value);
                 if (wikiRes.status === 'fulfilled') results.push(...wikiRes.value);
             }
         } catch (fallbackErr: any) {
             logs.push(`fallback.failed=${fallbackErr.message}`);
         }
      }

      // Final Deduplication & Return
      const unique = new Map();
      for (const r of results) {
          if (r.title.includes('Direct Answer')) {
              unique.set('direct_' + Math.random(), r);
          } else {
              if (!unique.has(r.url)) unique.set(r.url, r);
          }
      }
      
      const final = Array.from(unique.values()).slice(0, 10);
      logs.push(`search.final_count=${final.length}`);
      
      if (final.length === 0) {
           return { ok: false, error: 'No results found in Google or Fallbacks', logs };
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
        const { stdout, stderr } = await execAsync(command, { cwd: workDir, timeout: timeoutVal });
        
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
