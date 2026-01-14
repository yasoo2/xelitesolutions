import { Builder } from '../system/Builder';
import { Analyst } from '../system/Analyst';
import fs from 'fs';
import path from 'path';
import { ToolDefinition, ToolExecutionResult } from './types';
import { Buffer } from 'buffer';
import { config } from '../config';
import { spawn } from 'child_process';
import os from 'os';
import { JSDOM, VirtualConsole } from 'jsdom';
import { search as ddgSearch } from 'duck-duck-scrape';
import { Readability } from '@mozilla/readability';
import { getBrowserSession, screenshotSessionJpeg, startStreaming, touchSession } from '../browser/manager';
import { executePlannedActions } from '../browser/executor';

const ARTIFACT_DIR = process.env.ARTIFACT_DIR || '/tmp/joe-artifacts';
if (!fs.existsSync(ARTIFACT_DIR)) {
  try { fs.mkdirSync(ARTIFACT_DIR, { recursive: true }); } catch {}
}

let browserWorkerBoot: Promise<void> | null = null;

function createDom(rawHtml: string, url?: string) {
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => {});
  return new JSDOM(rawHtml, url ? { url, virtualConsole: vc } : { virtualConsole: vc });
}

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

function stripUrlTrailingPunctuation(v: string) {
  return String(v || '').replace(/[)\].,;:!?]+$/g, '').trim();
}

function normalizeBrowserUrl(raw: string) {
  const v = String(raw || '').trim();
  if (!v) return 'https://www.google.com';
  if (/^https?:\/\//i.test(v)) {
    const withStripped = stripUrlTrailingPunctuation(v);
    try {
      const u = new URL(withStripped);
      const h = u.hostname.toLowerCase();
      if (h === 'xelitesolutins.com' || h === 'www.xelitesolutins.com') {
        u.hostname = 'xelitesolutions.com';
        return u.toString();
      }
    } catch {}
    return withStripped;
  }
  if (/^(about:|data:|file:)/i.test(v)) return v;
  const cleaned = stripUrlTrailingPunctuation(v);
  if (!cleaned) return 'https://www.google.com';
  const withoutSchemeSlashes = cleaned.replace(/^\/\//, '');
  const isLocal =
    /^localhost(?::\d+)?(?:\/|$)/i.test(withoutSchemeSlashes) ||
    /^127\.0\.0\.1(?::\d+)?(?:\/|$)/.test(withoutSchemeSlashes) ||
    /^\d+\.\d+\.\d+\.\d+(?::\d+)?(?:\/|$)/.test(withoutSchemeSlashes);
  const url = `${isLocal ? 'http' : 'https'}://${withoutSchemeSlashes}`;
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    if (h === 'xelitesolutins.com' || h === 'www.xelitesolutins.com') {
      u.hostname = 'xelitesolutions.com';
      return u.toString();
    }
  } catch {}
  return url;
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
  
  // Quick check first (800ms)
  const healthy = await waitForWorkerHealth(base, 800);
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

function timeoutMsFromEnv(key: string, fallbackMs: number) {
  const raw = process.env[key];
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return fallbackMs;
}

async function fetchWithTimeout(url: string, init: any, timeoutMs: number, logs: string[]) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...(init || {}), signal: controller.signal });
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      try {
        const u = new URL(url);
        logs.push(`worker_timeout_ms=${timeoutMs} path=${u.pathname}`);
      } catch {
        logs.push(`worker_timeout_ms=${timeoutMs}`);
      }
      throw new Error(`worker_timeout timeoutMs=${timeoutMs}`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function readJsonWithTimeout(resp: any, timeoutMs: number, logs: string[]) {
  let didTimeout = false;
  const timer = setTimeout(() => {
    didTimeout = true;
    try {
      resp?.body?.cancel?.();
    } catch {}
  }, timeoutMs);
  try {
    return await Promise.race([
      resp.json(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('worker_json_timeout')), timeoutMs)),
    ]);
  } catch (e: any) {
    if (didTimeout || e?.message === 'worker_json_timeout') {
      logs.push(`worker_json_timeout_ms=${timeoutMs}`);
      throw new Error(`worker_timeout timeoutMs=${timeoutMs}`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export const tools: ToolDefinition[] = [
  {
    name: 'payments_create_checkout_session',
    version: '1.0.0',
    tags: ['payments', 'stripe'],
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'number' },
        currency: { type: 'string' },
        productName: { type: 'string' },
        successUrl: { type: 'string' },
        cancelUrl: { type: 'string' },
        sessionId: { type: 'string' },
        userId: { type: 'string' }
      },
      required: ['amount', 'currency', 'productName']
    },
    outputSchema: {
      type: 'object',
      properties: {
        checkoutUrl: { type: 'string' },
        id: { type: 'string' }
      }
    },
    permissions: ['internet', 'execute'],
    sideEffects: ['internet'],
    rateLimitPerMinute: 20,
    auditFields: ['amount', 'currency', 'productName'],
    mockSupported: true,
    async execute(input) {
      const logs: string[] = [];
      const amountRaw = Number(input?.amount);
      const amount = Number.isFinite(amountRaw) && amountRaw > 0 ? Math.round(amountRaw) : 0;
      const currency = String(input?.currency || 'usd').trim().toLowerCase();
      const productName = String(input?.productName || 'Product').trim();
      const successUrl = String(input?.successUrl || process.env.PAYMENT_SUCCESS_URL || 'https://xelitesolutions.com/?success=1').trim();
      const cancelUrl = String(input?.cancelUrl || process.env.PAYMENT_CANCEL_URL || 'https://xelitesolutions.com/?canceled=1').trim();
      if (!amount || !currency || !productName) {
        return { ok: false, error: 'Missing amount/currency/productName', logs };
      }
      const sessionId = typeof (input as any)?.sessionId === 'string' ? String((input as any).sessionId).trim() : '';
      const userId = typeof (input as any)?.userId === 'string' ? String((input as any).userId).trim() : '';
      let key = '';
      try {
        const { getSessionSecret, getUserSecret } = await import('../services/secrets');
        key =
          ((userId ? await getUserSecret(userId, 'stripe', 'STRIPE_API_KEY') : null) || '') ||
          (getSessionSecret(sessionId, 'STRIPE_API_KEY') || '') ||
          (process.env.STRIPE_API_KEY || '');
        key = String(key || '').trim();
      } catch {}
      if (!key) return { ok: false, error: 'Missing Stripe API key', logs };
      const body = new URLSearchParams();
      body.append('mode', 'payment');
      body.append('success_url', successUrl);
      body.append('cancel_url', cancelUrl);
      body.append('line_items[0][price_data][currency]', currency);
      body.append('line_items[0][price_data][product_data][name]', productName);
      body.append('line_items[0][price_data][unit_amount]', String(amount));
      body.append('line_items[0][quantity]', '1');
      const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });
      const txt = await resp.text();
      let json: any = null;
      try { json = JSON.parse(txt); } catch {}
      if (!resp.ok) {
        const msg = typeof json?.error?.message === 'string' ? json.error.message : txt.slice(0, 300);
        return { ok: false, error: `Stripe API ${resp.status}: ${msg}`, logs };
      }
      const url = String(json?.url || '').trim();
      const id = String(json?.id || '').trim();
      const artifacts = url ? [{ name: 'Checkout', href: url }] : [];
      return { ok: true, output: { checkoutUrl: url, id }, logs, artifacts };
    }
  },
  {
    name: 'website_full_pipeline',
    version: '1.0.0',
    tags: ['pipeline', 'web', 'scaffold', 'build', 'test'],
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        type: { type: 'string', enum: ['ecommerce', 'saas', 'blog'] },
        features: { type: 'array', items: { type: 'string' } },
        baseDir: { type: 'string' },
        skipDev: { type: 'boolean' },
        qualityTasks: { type: 'array', items: { type: 'string', enum: ['lint', 'typecheck', 'test', 'build'] } },
        securityChecks: { type: 'boolean' },
        autoFix: { type: 'boolean' }
      },
      required: ['name']
    },
    outputSchema: { type: 'object', properties: { path: { type: 'string' }, steps: { type: 'array' } } },
    permissions: ['write', 'execute'],
    sideEffects: ['write', 'execute'],
    rateLimitPerMinute: 3,
    auditFields: ['name'],
    mockSupported: true,
    async execute(input) {
      const logs: string[] = [];
      const steps: any[] = [];
      const name = String(input?.name || 'mega-web').trim();
      const type = String(input?.type || 'ecommerce').trim();
      const features = Array.isArray(input?.features) ? input.features : [];
      const baseDir = String(input?.baseDir || '').trim();
      const skipDev = input?.skipDev === true;
      const autoFix = input?.autoFix !== false;
      const securityChecks = input?.securityChecks !== false;
      const qualityTasks: Array<'lint' | 'typecheck' | 'test' | 'build'> = Array.isArray(input?.qualityTasks) && input.qualityTasks.length
        ? input.qualityTasks
        : ['lint', 'typecheck', 'test', 'build'];
      logs.push(`pipeline.name=${name} type=${type} features=${features.join(',')}`);
      const scRes = await executeTool('scaffold_full_stack', { name, type, features, baseDir });
      if (!scRes?.ok) {
        steps.push({ step: 'scaffold_full_stack', ok: false, error: scRes?.error });
        return { ok: false, output: { path: '', steps }, logs };
      }
      const projectPath = String(scRes.output?.path || '').trim();
      steps.push({ step: 'scaffold_full_stack', ok: true, output: scRes.output });

      const detectRes = await executeTool('project_detect', { path: projectPath });
      steps.push({ step: 'project_detect', ok: detectRes.ok, output: detectRes.output });
      const detectedNodeProjects: string[] = Array.isArray(detectRes.output?.nodeProjects) ? detectRes.output.nodeProjects : [];
      const allNodeProjects = Array.from(new Set([projectPath, ...detectedNodeProjects].map(p => String(p).trim()).filter(Boolean)));

      const rootPkgPath = path.join(projectPath, 'package.json');
      let rootHasWorkspaces = false;
      if (fs.existsSync(rootPkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf-8'));
          rootHasWorkspaces = !!pkg?.workspaces;
        } catch {}
      }

      const runInstall = async (p: string) => {
        let r = await executeTool('shell_execute', {
          command: `cd "${p}" && npm install --include=dev --legacy-peer-deps --no-audit --no-fund --quiet`,
          timeout: 10 * 60 * 1000
        });
        if (!r.ok) {
          r = await executeTool('shell_execute', {
            command: `cd "${p}" && npm ci --legacy-peer-deps --no-audit --no-fund --quiet`,
            timeout: 10 * 60 * 1000
          });
        }
        return r;
      };

      if (rootHasWorkspaces) {
        const installRes = await runInstall(projectPath);
        steps.push({ step: 'npm_install', ok: installRes.ok, output: installRes.output });
      } else {
        for (const proj of allNodeProjects) {
          const installRes = await runInstall(proj);
          steps.push({ step: 'npm_install', ok: installRes.ok, output: { project: proj, ...installRes.output } });
          if (!installRes.ok) break;
        }
      }

      const readScripts = (proj: string) => {
        const pkgPath = path.join(proj, 'package.json');
        if (!fs.existsSync(pkgPath)) return {};
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
          const scripts = pkg?.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
          return scripts;
        } catch {
          return {};
        }
      };

      for (const proj of allNodeProjects) {
        const qualityRes = await executeTool('quality_run', { path: proj, tasks: qualityTasks });
        steps.push({ step: 'quality_run', ok: qualityRes.ok, output: { project: proj, ...qualityRes.output } });
        if (!qualityRes.ok && autoFix) {
          const results = Array.isArray(qualityRes.output?.results) ? qualityRes.output.results : [];
          const lintFailed = results.some((r: any) => r && r.task === 'lint' && r.ok === false && !r.skipped);
          const scripts = readScripts(proj);
          if (lintFailed && typeof (scripts as any)?.lint === 'string') {
            const fixRes = await executeTool('shell_execute', { command: `cd "${proj}" && npm run lint -- --fix`, timeout: 10 * 60 * 1000 });
            steps.push({ step: 'lint_fix', ok: fixRes.ok, output: { project: proj, ...fixRes.output } });
            const lintRetry = await executeTool('quality_run', { path: proj, tasks: ['lint'] });
            steps.push({ step: 'quality_run', ok: lintRetry.ok, output: { project: proj, ...lintRetry.output, retry: true } });
          }
        }
      }

      if (securityChecks) {
        const secretsRes = await executeTool('secrets_scan_repo', { path: projectPath });
        steps.push({ step: 'secrets_scan_repo', ok: secretsRes.ok, output: secretsRes.output });
        const depRes = await executeTool('dependency_audit', { path: projectPath });
        steps.push({ step: 'dependency_audit', ok: depRes.ok, output: depRes.output });
      }

      const ciRes = await executeTool('ci_generate_pipeline', { path: projectPath, kind: 'node' });
      steps.push({ step: 'ci_generate_pipeline', ok: ciRes.ok, output: ciRes.output });
      const analyzeRes = await executeTool('analyze_codebase', { path: projectPath });
      steps.push({ step: 'analyze_codebase', ok: analyzeRes.ok, output: analyzeRes.output });
      const projectAnalyzeRes = await executeTool('analyze_project', { path: projectPath });
      steps.push({ step: 'analyze_project', ok: projectAnalyzeRes.ok, output: projectAnalyzeRes.output });
      if (!skipDev) {
        const devRes = await executeTool('dev_server_start', { cwd: projectPath });
        steps.push({ step: 'dev_server_start', ok: devRes.ok, output: devRes.output });
        if (devRes.ok) {
          steps.push({ step: 'dev_server_preview_ready', ok: true, output: { previewUrl: String(devRes.output?.previewUrl || 'http://localhost:5173/').trim() } });
        }
      }
      logs.push(`pipeline.complete path=${projectPath}`);
      const allOk = steps.every(s => s.ok);
      return { ok: allOk, output: { path: projectPath, steps }, logs };
    },
  },
  {
    name: 'dev_server_start',
    version: '1.0.0',
    tags: ['dev', 'server', 'preview'],
    inputSchema: { type: 'object', properties: { cwd: { type: 'string' }, command: { type: 'string' } }, required: ['cwd'] },
    outputSchema: { type: 'object', properties: { previewUrl: { type: 'string' } } },
    permissions: ['execute'],
    sideEffects: ['execute'],
    rateLimitPerMinute: 5,
    auditFields: ['cwd'],
    mockSupported: true,
    async execute(input) {
      const logs: string[] = [];
      const cwd = resolveToolPath(String(input?.cwd || '').trim());
      const command = String(input?.command || 'npm run dev').trim();
      try {
        const child = spawn(command.split(' ')[0], command.split(' ').slice(1), {
          cwd,
          env: process.env,
          stdio: 'ignore',
          detached: true,
        });
        child.unref();
        logs.push(`dev_started cwd=${cwd} cmd=${command}`);
        return { ok: true, output: { previewUrl: 'http://localhost:5173/' }, logs };
      } catch (e: any) {
        const msg = e?.message || String(e);
        logs.push(`dev_error=${msg}`);
        return { ok: false, error: msg, logs };
      }
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
    name: 'browser_open',
    version: '1.0.0',
    tags: ['browser', 'web', 'preview'],
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string' }, sessionId: { type: 'string' }, userId: { type: 'string' } },
      required: ['url'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        url: { type: 'string' },
        title: { type: 'string' },
        dom: { type: 'string' },
        screenshotHref: { type: 'string' },
      },
    },
    permissions: ['internet', 'execute'],
    sideEffects: ['execute', 'internet'],
    rateLimitPerMinute: 30,
    auditFields: ['url'],
    mockSupported: false,
    async execute(input) {
      const logs: string[] = [];
      const raw = String(input?.url || '').trim();
      const cleaned = raw.replace(/[`]/g, '').trim();
      const url = normalizeBrowserUrl(cleaned);
      const userId = String(input?.userId || input?.__userId || '').trim();
      const sidRaw = String(input?.sessionId || '').trim();
      const sid = sidRaw || (userId ? `browser:${userId}` : `browser:${Date.now()}`);
      const s = await getBrowserSession(sid);
      await s.page.goto(url, { waitUntil: 'domcontentloaded' });
      touchSession(sid);
      const dom = await s.page.content();
      const title = await s.page.title();
      let href = '';
      let artifacts: Array<{ name: string; href: string }> | undefined = undefined;
      try {
        const buf = await screenshotSessionJpeg(sid, { quality: 55, timeoutMs: 5000 });
        const fname = `browser-${sid.replace(/[^a-z0-9_-]/gi, '_')}-${Date.now()}.jpg`;
        const full = path.join(ARTIFACT_DIR, fname);
        try { fs.writeFileSync(full, buf); } catch {}
        href = `/artifacts/${encodeURIComponent(fname)}`;
        artifacts = [{ name: 'Screenshot', href }];
      } catch (e: any) {
        logs.push(`browser_open screenshot_failed=${String(e?.message || e || 'unknown')}`);
      }
      logs.push(`browser_open sid=${sid} url=${url}`);
      startStreaming(sid);
      return { ok: true, output: { sessionId: sid, url, title, dom, screenshotHref: href }, logs, artifacts };
    },
  },
  {
    name: 'browser_get_state',
    version: '1.0.0',
    tags: ['browser', 'web', 'preview'],
    inputSchema: {
      type: 'object',
      properties: { sessionId: { type: 'string' } },
      required: ['sessionId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        url: { type: 'string' },
        title: { type: 'string' },
        dom: { type: 'string' },
        screenshotHref: { type: 'string' },
      },
    },
    permissions: ['read'],
    sideEffects: [],
    rateLimitPerMinute: 60,
    auditFields: ['sessionId'],
    mockSupported: false,
    async execute(input) {
      const logs: string[] = [];
      const sid = String(input?.sessionId || '').trim();
      if (!sid) return { ok: false, error: 'sessionId_required', logs };
      const s = await getBrowserSession(sid);
      touchSession(sid);
      const url = s.page.url();
      const title = await s.page.title();
      const dom = await s.page.content();
      let href = '';
      let artifacts: Array<{ name: string; href: string }> | undefined = undefined;
      try {
        const buf = await screenshotSessionJpeg(sid, { quality: 55, timeoutMs: 1500 });
        const fname = `browser-${sid.replace(/[^a-z0-9_-]/gi, '_')}-${Date.now()}.jpg`;
        const full = path.join(ARTIFACT_DIR, fname);
        try { fs.writeFileSync(full, buf); } catch {}
        href = `/artifacts/${encodeURIComponent(fname)}`;
        artifacts = [{ name: 'Screenshot', href }];
      } catch (e: any) {
        logs.push(`browser_get_state screenshot_failed=${String(e?.message || e || 'unknown')}`);
      }
      logs.push(`browser_get_state sid=${sid} url=${url}`);
      startStreaming(sid);
      return { ok: true, output: { sessionId: sid, url, title, dom, screenshotHref: href }, logs, artifacts };
    },
  },
  {
    name: 'browser_run',
    description: 'Execute browser actions, or compile instructionText into a multi-step plan.',
    version: '1.0.0',
    tags: ['browser', 'web', 'actions'],
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        instructionText: { type: 'string' },
        actions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              url: { type: 'string' },
              text: { type: 'string' },
              selector: { type: 'string' },
              role: { type: 'string' },
              name: { type: 'string' },
              direction: { type: 'string' },
              amount: { type: 'number' },
              ms: { type: 'number' },
              x: { type: 'number' },
              y: { type: 'number' },
            },
            required: ['type'],
            additionalProperties: true,
          },
        },
        userId: { type: 'string' },
      },
      required: ['sessionId'],
      anyOf: [{ required: ['actions'] }, { required: ['instructionText'] }],
    },
    outputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        pageUrl: { type: 'string' },
        title: { type: 'string' },
        dom: { type: 'string' },
        screenshotHref: { type: 'string' },
        summary: { type: 'string' },
        missingSecrets: { type: 'array', items: { type: 'string' } },
      },
    },
    permissions: ['internet', 'execute'],
    sideEffects: ['execute', 'internet'],
    rateLimitPerMinute: 30,
    auditFields: ['sessionId'],
    mockSupported: false,
    async execute(input) {
      const logs: string[] = [];
      const sid = String(input?.sessionId || '').trim();
      if (!sid) return { ok: false, error: 'sessionId_required', logs };
      const userId = String(input?.userId || input?.__userId || '').trim();

      const classifyBrowserRuntimeError = (e: any) => {
        const msg = String(e?.message || e || '').trim();
        const lower = msg.toLowerCase();
        if (/executable doesn't exist|playwright install/i.test(msg)) return { code: 'chromium_missing', message: msg };
        if (/no such file or directory/i.test(msg) && /chrome|chromium/i.test(lower)) return { code: 'chromium_missing', message: msg };
        if (/target page, context or browser has been closed/i.test(msg)) return { code: 'browser_closed', message: msg };
        if (/xvfb|display|cannot open display|missing x server/i.test(lower)) return { code: 'display_missing', message: msg };
        if (/sandbox|setuid/i.test(lower)) return { code: 'sandbox_blocked', message: msg };
        if (/glibc|gtk|nss|gbm|fontconfig/i.test(lower)) return { code: 'deps_missing', message: msg };
        return { code: 'browser_failed', message: msg || 'browser_failed' };
      };

      const instructionText = String(input?.instructionText || '').trim();
      const rawActs = Array.isArray(input?.actions) ? input.actions : [];
      const actions = rawActs.map((a: any) => {
        if (a && typeof a === 'object' && String(a.type || '').toLowerCase() === 'goto') {
          const u = normalizeBrowserUrl(String(a.url || ''));
          return { ...a, url: u };
        }
        return a;
      });

      const loginAttempt =
        /(login|log\s*in|sign\s*in|signin|تسجيل\s*الدخول|سجل\s*دخول|سجّل\s*دخول)/i.test(instructionText) ||
        rawActs.some((a: any) => {
          if (!a || typeof a !== 'object') return false;
          if (String(a.type || '').toLowerCase() !== 'type') return false;
          return /\{\{\s*SECRET\s*:\s*JOE_LOGIN_(?:EMAIL|PASSWORD)\s*\}\}/i.test(String((a as any).text || ''));
        });

      const analyzeLoginOutcome = (pageUrl: string, dom: string) => {
        const url = String(pageUrl || '');
        const u = url.toLowerCase();
        const d = String(dom || '');
        const dl = d.toLowerCase();

        const github = /(^|\.)github\.com\b/i.test(u);
        const userLoginMeta = d.match(/<meta[^>]+name=["']user-login["'][^>]+content=["']([^"']+)["']/i)?.[1]?.trim() || '';
        const dataLogin = d.match(/\bdata-login=["']([^"']+)["']/i)?.[1]?.trim() || '';
        const user = userLoginMeta || dataLogin;

        const needs2fa =
          /two-factor|two_factor|otp|authentication code/i.test(u) ||
          /two-factor|two factor|authentication code|verification code|two_factor|otp/i.test(dl);
        const badCreds =
          /incorrect username or password|incorrect password|invalid username or password|account or password|invalid login/i.test(dl) ||
          /تعذّر|غير صحيح|خطأ|كلمة المرور غير صحيحة/i.test(d);
        const onLoginPage =
          /\/login\b|\/session\b|\/signin\b|\/sign-in\b/i.test(u) ||
          (/login_field/i.test(dl) && /type=["']password["']/.test(dl)) ||
          /sign in to github/i.test(dl);

        if (user && !onLoginPage && !needs2fa) return { state: 'logged_in' as const, user };
        if (needs2fa) return { state: 'needs_2fa' as const, user: user || '' };
        if (badCreds) return { state: 'login_failed' as const, user: user || '' };
        if (onLoginPage) return { state: 'login_page' as const, user: user || '' };
        return { state: 'unknown' as const, user: user || '' };
      };

      let execOk = false;
      let execSummary = '';
      let missingSecrets: string[] | undefined = undefined;
      let execError: string | undefined = undefined;

      const deriveExecFailure = (res: any) => {
        const steps = Array.isArray(res?.steps) ? res.steps : [];
        const failed = steps.filter((s: any) => s && s.ok === false);
        const total = steps.length;
        const failedCount = failed.length;
        if (!failedCount) {
          return { error: 'some_steps_failed', summary: String(res?.summary || 'فشل تنفيذ بعض الخطوات.').trim() };
        }
        const missing = new Set<string>();
        for (const s of failed) {
          const msg = String(s?.message || s?.error || '').trim();
          const m = msg.match(/missing_secret:([A-Z0-9_]+)/);
          if (m && m[1]) missing.add(String(m[1]).trim());
        }
        if (missing.size) {
          const keys = Array.from(missing);
          return { error: 'missing_secrets', summary: `missing_secrets: ${keys.join(', ')}`, missingSecrets: keys };
        }
        const counts = new Map<string, number>();
        for (const s of failed) {
          const r = String(s?.reason || 'unknown').trim() || 'unknown';
          counts.set(r, (counts.get(r) || 0) + 1);
        }
        let topReason = 'unknown';
        let topCount = 0;
        for (const [k, v] of counts) {
          if (v > topCount) {
            topReason = k;
            topCount = v;
          }
        }
        const error = topReason !== 'unknown' ? topReason : 'some_steps_failed';
        const first = failed[0] || null;
        const firstMsg = String(first?.message || '').trim() || String(first?.error || '').trim() || '';
        const shortMsg = firstMsg ? firstMsg.slice(0, 140) : '';
        const summary = `فشل تنفيذ بعض الخطوات (${failedCount}/${total || failedCount}). السبب: ${error}${shortMsg ? ` (${shortMsg})` : ''}`;
        return { error, summary };
      };

      if (instructionText && (!Array.isArray(actions) || actions.length === 0)) {
        const r = await (await import('../browser/runner')).runBrowserInstruction({ userId, sessionId: sid, instructionText });
        if (r && typeof r === 'object' && (r as any).ok) {
          execOk = Boolean((r as any).result?.ok);
          const inner = (r as any).result;
          execSummary = String(inner?.summary || '');
          if (!execOk) {
            const derived = deriveExecFailure(inner);
            execError = derived.error;
            execSummary = derived.summary;
            const ms = (derived as any)?.missingSecrets;
            if (Array.isArray(ms)) missingSecrets = ms.map((x: any) => String(x || '')).filter(Boolean);
          }
          try {
            const dbg = (r as any)?.debug;
            if (dbg && typeof dbg === 'object') {
              const safe = (v: any) => {
                try {
                  return JSON.stringify(v);
                } catch {
                  return '"[unserializable]"';
                }
              };
              logs.push(`compiled_plan_json=${safe(dbg.compiled_plan_json)}`);
              logs.push(`actions_json=${safe(dbg.actions_json)}`);
              logs.push(`action_count=${String(dbg.action_count ?? '')}`);
              logs.push(`stop_reason=${String(dbg.stop_reason ?? '')}`);
            }
          } catch {}
        } else {
          execOk = false;
          execError = String((r as any)?.error || '').trim() || 'browser_run_failed';
          const detail = (r as any)?.detail;
          if (execError === 'browser_unavailable' && detail && typeof detail === 'object') {
            const code = String(detail?.code || '').trim();
            const msg = String(detail?.message || '').trim();
            execSummary = `${code || 'browser_unavailable'}: ${msg || execError}`.slice(0, 600);
          } else {
            execSummary = execError;
          }
          const ms = (r as any)?.missingSecrets;
          if (Array.isArray(ms)) missingSecrets = ms.map((x: any) => String(x || '')).filter(Boolean);
          try {
            const dbg = (r as any)?.debug;
            if (dbg && typeof dbg === 'object') {
              const safe = (v: any) => {
                try {
                  return JSON.stringify(v);
                } catch {
                  return '"[unserializable]"';
                }
              };
              logs.push(`compiled_plan_json=${safe(dbg.compiled_plan_json)}`);
              logs.push(`actions_json=${safe(dbg.actions_json)}`);
              logs.push(`action_count=${String(dbg.action_count ?? '')}`);
              logs.push(`stop_reason=${String(dbg.stop_reason ?? '')}`);
            }
          } catch {}
        }
      } else {
        let r: any = null;
        try {
          r = (await executePlannedActions({ userId, sessionId: sid, actions: actions as any })) as any;
        } catch (e: any) {
          execOk = false;
          const c = classifyBrowserRuntimeError(e);
          execError = 'browser_unavailable';
          execSummary = `${c.code}: ${c.message}`.slice(0, 600);
          try {
            const { broadcastBrowserEvent } = await import('../browser/wsHub');
            broadcastBrowserEvent(sid, {
              type: 'action_error',
              ts: Date.now(),
              actionId: 'step_1',
              actionType: String(actions?.[0]?.type || 'unknown'),
              reason: 'unknown',
              error: execSummary,
            } as any);
          } catch {}
          r = null;
        }

        execOk = Boolean(r?.ok);
        execSummary = String(r?.summary || execSummary || '');
        if (!execOk) {
          const derived = deriveExecFailure(r);
          execError = derived.error;
          execSummary = derived.summary;
          const ms = (derived as any)?.missingSecrets;
          if (Array.isArray(ms)) missingSecrets = ms.map((x: any) => String(x || '')).filter(Boolean);
        }
      }

      let pageUrl = '';
      let title = '';
      let dom = '';
      try {
        const s = await getBrowserSession(sid);
        touchSession(sid);
        pageUrl = s.page.url();
        title = await s.page.title();
        dom = await s.page.content();
      } catch (e: any) {
        const c = classifyBrowserRuntimeError(e);
        execOk = false;
        execError = execError || 'browser_unavailable';
        execSummary = execSummary || `${c.code}: ${c.message}`.slice(0, 600);
        logs.push(`browser_run state_fetch_failed=${String(c.code || 'browser_failed')}`);
      }

      if (loginAttempt && pageUrl && dom) {
        const a = analyzeLoginOutcome(pageUrl, dom);
        if (a.state === 'logged_in') {
          execOk = true;
          execError = undefined;
          execSummary = a.user ? `✅ تم تسجيل الدخول بنجاح. الحساب: ${a.user}` : '✅ تم تسجيل الدخول بنجاح.';
        } else if (a.state === 'needs_2fa') {
          execOk = false;
          execError = 'login_2fa_required';
          execSummary = '⚠️ تم الوصول لخطوة المصادقة الثنائية (2FA). أدخل كود التحقق ثم أعد إرسال الأمر.';
        } else if (a.state === 'login_failed') {
          execOk = false;
          execError = 'login_failed';
          execSummary = '❌ فشل تسجيل الدخول: اسم المستخدم/الإيميل أو كلمة المرور غير صحيحة.';
        } else if (a.state === 'login_page') {
          execOk = false;
          execError = execError || 'login_not_completed';
          execSummary = execSummary || '⚠️ ما زلت على صفحة تسجيل الدخول ولم يظهر نجاح الدخول بعد.';
        }
      }

      let href = '';
      let artifacts: Array<{ name: string; href: string }> | undefined = undefined;
      try {
        const buf = await screenshotSessionJpeg(sid, { quality: 55, timeoutMs: 5000 });
        const fname = `browser-${sid.replace(/[^a-z0-9_-]/gi, '_')}-${Date.now()}.jpg`;
        const full = path.join(ARTIFACT_DIR, fname);
        try { fs.writeFileSync(full, buf); } catch {}
        href = `/artifacts/${encodeURIComponent(fname)}`;
        artifacts = [{ name: 'Screenshot', href }];
      } catch (e: any) {
        logs.push(`browser_run screenshot_failed=${String(e?.message || e || 'unknown')}`);
      }
      logs.push(`browser_run sid=${sid} steps=${Array.isArray(actions) ? actions.length : 0} compiled=${instructionText ? 1 : 0}`);
      return {
        ok: execOk,
        output: { sessionId: sid, pageUrl, title, dom, screenshotHref: href, summary: execSummary, missingSecrets },
        logs,
        artifacts,
        error: execOk ? undefined : missingSecrets && missingSecrets.length ? 'missing_secrets' : execError || 'browser_run_failed',
      };
    },
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
    name: 'analyze_project',
    version: '1.0.0',
    tags: ['analysis', 'project'],
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: [] },
    outputSchema: { type: 'object', properties: { status: { type: 'string' } } },
    permissions: ['read'],
    sideEffects: [],
    rateLimitPerMinute: 15,
    auditFields: ['path'],
    mockSupported: true,
  },
  {
    name: 'ui_theme_generator',
    version: '1.0.0',
    tags: ['ui', 'design', 'tailwind'],
    inputSchema: { type: 'object', properties: { path: { type: 'string' }, preset: { type: 'string' } }, required: ['path'] },
    outputSchema: { type: 'object', properties: { changed: { type: 'array', items: { type: 'string' } } } },
    permissions: ['write'],
    sideEffects: ['write'],
    rateLimitPerMinute: 30,
    auditFields: ['path'],
    mockSupported: false,
  },
  {
    name: 'ui_layout_polish',
    version: '1.0.0',
    tags: ['ui', 'design'],
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    outputSchema: { type: 'object', properties: { changed: { type: 'array', items: { type: 'string' } } } },
    permissions: ['write'],
    sideEffects: ['write'],
    rateLimitPerMinute: 30,
    auditFields: ['path'],
    mockSupported: false,
  },
  {
    name: 'animation_optimizer',
    version: '1.0.0',
    tags: ['ui', 'design', 'animation'],
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    outputSchema: { type: 'object', properties: { changed: { type: 'array', items: { type: 'string' } } } },
    permissions: ['write'],
    sideEffects: ['write'],
    rateLimitPerMinute: 30,
    auditFields: ['path'],
    mockSupported: false,
  },
  {
    name: 'component_library_import',
    version: '1.0.0',
    tags: ['ui', 'design', 'components'],
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    outputSchema: { type: 'object', properties: { changed: { type: 'array', items: { type: 'string' } } } },
    permissions: ['write'],
    sideEffects: ['write'],
    rateLimitPerMinute: 30,
    auditFields: ['path'],
    mockSupported: false,
  },
  {
    name: 'animation_sweep',
    version: '1.0.0',
    tags: ['ui', 'design', 'animation'],
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    outputSchema: { type: 'object', properties: { changed: { type: 'array', items: { type: 'string' } } } },
    permissions: ['write'],
    sideEffects: ['write'],
    rateLimitPerMinute: 30,
    auditFields: ['path'],
    mockSupported: false,
  },
  {
    name: 'component_library_import_plus',
    version: '1.0.0',
    tags: ['ui', 'design', 'components'],
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    outputSchema: { type: 'object', properties: { changed: { type: 'array', items: { type: 'string' } } } },
    permissions: ['write'],
    sideEffects: ['write'],
    rateLimitPerMinute: 30,
    auditFields: ['path'],
    mockSupported: false,
  },
  {
    name: 'animation_optimizer_plus',
    version: '1.0.0',
    tags: ['ui', 'design', 'animation'],
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    outputSchema: { type: 'object', properties: { changed: { type: 'array', items: { type: 'string' } } } },
    permissions: ['write'],
    sideEffects: ['write'],
    rateLimitPerMinute: 30,
    auditFields: ['path'],
    mockSupported: false,
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
    name: 'github_create_or_update_file',
    version: '1.0.0',
    tags: ['dev', 'github'],
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        path: { type: 'string' },
        content: { type: 'string' },
        message: { type: 'string' },
        branch: { type: 'string' },
        sessionId: { type: 'string' },
        userId: { type: 'string' },
        sha: { type: 'string' }
      },
      required: ['owner', 'repo', 'path', 'content', 'message']
    },
    outputSchema: {
      type: 'object',
      properties: {
        commitSha: { type: 'string' },
        htmlUrl: { type: 'string' },
        contentSha: { type: 'string' }
      }
    },
    permissions: ['read', 'write'],
    sideEffects: ['write'],
    rateLimitPerMinute: 30,
    auditFields: ['owner', 'repo', 'path'],
    mockSupported: true
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
      const debug = String(process.env.DEBUG_WEB_SEARCH || '').trim() === '1';
      let allResults: any[] = [];

      // Helper for parallel execution
      const searchTasks: Promise<void>[] = [];

      const hasArabic = /[\u0600-\u06FF]/.test(query);
      const lang = hasArabic ? 'ar' : 'en';

      const scrapeDuckDuckGoHtml = async (q: string) => {
        const urls = [`https://duckduckgo.com/html/?q=${encodeURIComponent(q)}`, `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q)}`];
        for (const u of urls) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);
            try {
              const r = await fetch(u, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                  'Accept-Language': lang,
                },
                signal: controller.signal,
              });
              if (!r.ok) continue;
              const html = await r.text();
              const dom = createDom(html, u);
              const doc = dom.window.document;

              const results: any[] = [];
              const anchors = Array.from(doc.querySelectorAll('a.result__a, a[data-testid="result-title-a"], a[href][rel="nofollow"]'));
              for (const a of anchors) {
                const href = String(a.getAttribute('href') || '').trim();
                const title = String(a.textContent || '').replace(/\s+/g, ' ').trim();
                if (!href || !title) continue;
                let abs = href;
                try {
                  abs = new URL(href, u).toString();
                } catch {}
                if (!/^https?:\/\//i.test(abs)) continue;
                const container = a.closest('.result, [data-testid="result"], article, tr') || a.parentElement;
                const snippetEl =
                  container?.querySelector('.result__snippet, [data-testid="result-snippet"], .result__body, .snippet') ||
                  container?.querySelector('td:nth-child(2)') ||
                  null;
                const description = String(snippetEl?.textContent || '').replace(/\s+/g, ' ').trim();
                results.push({ title, url: abs, description, source: 'duckduckgo_html' });
                if (results.length >= 12) break;
              }
              if (results.length) return results;
            } finally {
              clearTimeout(timeoutId);
            }
          } catch {}
        }
        return [];
      };

      const extractGoogleResultsFromHtml = (html: string) => {
        const dom = createDom(html, 'https://www.google.com');
        const doc = dom.window.document;

        const blocked =
          /enablejs|sorry|unusual traffic|consent/i.test(String(doc.title || '').toLowerCase()) ||
          /httpservice\/retry\/enablejs/i.test(html) ||
          /Our systems have detected unusual traffic/i.test(html);
        if (blocked) return [];

        const out: any[] = [];
        const containers = Array.from(doc.querySelectorAll('.g, div[data-hveid], div.MjjYud'));
        for (const div of containers) {
          const h3 = div.querySelector('h3');
          const a = h3?.closest('a') || div.querySelector('a');
          const title = String(h3?.textContent || '').replace(/\s+/g, ' ').trim();
          const url = String(a?.getAttribute('href') || '').trim();
          if (!title || !url || !url.startsWith('http')) continue;
          const snippet =
            div.querySelector('.VwiC3b, .IsZvec, .aCOpRe, .BNeawe.s3v9rd.AP7Wnd') ||
            div.querySelector('span.aCOpRe') ||
            null;
          const description = String(snippet?.textContent || '').replace(/\s+/g, ' ').trim();
          out.push({ title, url, description, source: 'google' });
          if (out.length >= 12) break;
        }

        if (out.length) return out;

        const h3Anchors = Array.from(doc.querySelectorAll('a h3'));
        for (const h3 of h3Anchors) {
          const a = h3.closest('a');
          const title = String(h3.textContent || '').replace(/\s+/g, ' ').trim();
          const url = String(a?.getAttribute('href') || '').trim();
          if (!title || !url || !url.startsWith('http')) continue;
          const wrap = a?.parentElement?.parentElement || a?.parentElement || null;
          const snippet = wrap?.querySelector('.VwiC3b, .IsZvec, .aCOpRe, .BNeawe.s3v9rd.AP7Wnd') || null;
          const description = String(snippet?.textContent || '').replace(/\s+/g, ' ').trim();
          out.push({ title, url, description, source: 'google' });
          if (out.length >= 12) break;
        }
        return out;
      };

      const scrapeGoogle = async (q: string) => {
        const gUrl = `https://www.google.com/search?q=${encodeURIComponent(q)}&hl=${lang}&num=10`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        try {
          const r = await fetch(gUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': lang,
              Cookie: 'CONSENT=YES+Cb.20210328-17-p0.en+FX+410;',
            },
            signal: controller.signal,
          });
          if (!r.ok) return [];
          const html = await r.text();
          if (debug) logs.push(`google.html.len=${html.length}`);
          return extractGoogleResultsFromHtml(html);
        } catch {
          return [];
        } finally {
          clearTimeout(timeoutId);
        }
      };

      // 1. DuckDuckGo (via HTML scraping)
      searchTasks.push((async () => {
        try {
          const res = await scrapeDuckDuckGoHtml(query);
          if (res.length) {
            logs.push(`ddg_html_results=${res.length}`);
            allResults.push(...res);
          }
        } catch {}
      })());

      // 2. Google Search (best-effort)
      searchTasks.push((async () => {
        const res = await scrapeGoogle(query);
        if (res.length) {
          logs.push(`google_results=${res.length}`);
          allResults.push(...res);
        }
      })());

      // 3. DuckDuckGo (library fallback)
      searchTasks.push((async () => {
        try {
          const searchRes = await Promise.race([
            ddgSearch(query),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
          ]);
          if (!searchRes) return;
          if (searchRes.results && searchRes.results.length) {
            const mapped = searchRes.results
              .map((r: any) => ({
                title: r.title || '',
                url: r.url || '',
                description: r.description || '',
                source: 'duckduckgo',
              }))
              .filter((x: any) => x.url && x.title);

            if (mapped.length) {
              logs.push(`ddg_results=${mapped.length}`);
              allResults.push(...mapped);
            }
          }
        } catch {}
      })());

      // Wait for parallel searches
      await Promise.allSettled(searchTasks);

      // 4. Fallback to Bing if we have few results (< 3)
      if (allResults.length < 3) {
        try {
          const bUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=${lang}`;
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
               const dom = createDom(html, bUrl);
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

      // 5. No browser-based fallback (legacy browser removed)
      
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
    name: 'product_search',
    version: '1.0.0',
    tags: ['network', 'search', 'shopping'],
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        store: { type: 'string', description: 'Optional store name or domain (e.g. "amazon.sa", "noon", "jarir")' },
        limit: { type: 'number', description: 'Max offers to return (default 10)' },
        maxCandidates: { type: 'number', description: 'Max URLs to try extracting from (default 15)' },
        render: { type: 'boolean', description: 'Force rendering with Puppeteer for extraction (default auto)' },
      },
      required: ['query'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        offers: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              url: { type: 'string' },
              store: { type: 'string' },
              price: { type: 'number' },
              currency: { type: 'string' },
              priceText: { type: 'string' },
              availability: { type: 'string' },
              image: { type: 'string' },
              source: { type: 'string' },
              confidence: { type: 'number' },
            },
          },
        },
        byCurrency: { type: 'object' },
        candidatesTried: { type: 'number' },
      },
    },
    permissions: ['read'],
    sideEffects: [],
    rateLimitPerMinute: 8,
    auditFields: ['query', 'store'],
    mockSupported: false,
    description:
      'Searches the web for product pages and extracts multiple offers with prices, then returns a price-comparison-ready list. Prefer this for shopping/product requests.',
    async execute(input) {
      const queryRaw = String(input?.query || '').trim();
      const storeRaw = String(input?.store || '').trim();
      const limit = Math.max(1, Math.min(25, Number.isFinite(Number(input?.limit)) ? Number(input.limit) : 10));
      const maxCandidates = Math.max(5, Math.min(40, Number.isFinite(Number(input?.maxCandidates)) ? Number(input.maxCandidates) : 15));
      const forceRender = input?.render === true;
      const logs: string[] = [];
      const startedAt = Date.now();
      const deadlineMs = startedAt + 120000;

      if (!queryRaw) return { ok: false, error: 'query_required', logs };

      const isArabic = /[\u0600-\u06FF]/.test(queryRaw);
      const storeMap: Record<string, string> = {
        amazon: 'amazon.',
        'amazon.sa': 'amazon.sa',
        'amazon.ae': 'amazon.ae',
        noon: 'noon.com',
        jarir: 'jarir.com',
        extra: 'extra.com',
        temu: 'temu.com',
        aliexpress: 'aliexpress.com',
        ebay: 'ebay.',
        walmart: 'walmart.com',
        'جرير': 'jarir.com',
        'نون': 'noon.com',
        'اكسترا': 'extra.com',
        'أمازون': 'amazon.',
        'امازون': 'amazon.',
      };

      const normalizeStoreToDomain = (s: string) => {
        const t = String(s || '').trim();
        if (!t) return '';
        try {
          if (/^https?:\/\//i.test(t)) return new URL(t).hostname;
        } catch {}
        const low = t.toLowerCase();
        if (low.includes('.')) return low.replace(/^www\./, '');
        if (storeMap[t]) return storeMap[t];
        if (storeMap[low]) return storeMap[low];
        return '';
      };

      const storeDomain = normalizeStoreToDomain(storeRaw);
      const wantsSiteOnly = !!storeRaw && !!storeDomain;

      const shopHints = isArabic ? 'سعر شراء' : 'price buy';
      const hasShoppingWord = /(price|buy|shop|سعر|شراء|متجر|تسوق|sale|discount)/i.test(queryRaw);
      const baseQ = hasShoppingWord ? queryRaw : `${queryRaw} ${shopHints}`;
      const hasSaHint = /(saudi|ksa|\bsa\b|السعودية|السعوديه|سعودي|ر\.?\s?س|SAR)/i.test(queryRaw);
      const wantsSaHint = wantsSiteOnly && !!storeDomain && /(^|\.)noon\.com$|(^|\.)extra\.com$|(^|\.)jarir\.com$/i.test(storeDomain) && !hasSaHint;
      const baseQ2 = wantsSaHint ? `${baseQ} ${isArabic ? 'السعودية' : 'Saudi'}` : baseQ;
      const searchQ = wantsSiteOnly ? `${baseQ2} site:${storeDomain}` : baseQ2;
      logs.push(`search.query=${searchQ}`);

      const searchRes = await executeTool('web_search', { query: searchQ });
      const rawResults = Array.isArray(searchRes?.output?.results) ? searchRes.output.results : [];
      logs.push(`search.results=${rawResults.length}`);
      if (!rawResults.length) return { ok: false, error: 'no_search_results', logs };

      const normalizeSearchResultUrl = (rawUrl: string) => {
        const s = String(rawUrl || '').trim();
        if (!s) return '';
        try {
          const u = new URL(s);
          const host = u.hostname.replace(/^www\./, '').toLowerCase();

          if ((host === 'google.com' || host.endsWith('.google.com')) && u.pathname === '/url') {
            const q = u.searchParams.get('q') || u.searchParams.get('url');
            if (q && /^https?:\/\//i.test(q)) return q;
          }

          if (host === 'duckduckgo.com' && u.pathname === '/l/') {
            const uddg = u.searchParams.get('uddg');
            if (uddg) {
              try {
                const decoded = decodeURIComponent(uddg);
                if (/^https?:\/\//i.test(decoded)) return decoded;
              } catch {
                if (/^https?:\/\//i.test(uddg)) return uddg;
              }
            }
          }

          if ((host === 'bing.com' || host.endsWith('.bing.com')) && u.pathname.startsWith('/ck/')) {
            const up = u.searchParams.get('u');
            if (up) {
              const b64 = up.replace(/^a1/i, '').replace(/-/g, '+').replace(/_/g, '/');
              const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
              try {
                const decoded = Buffer.from(b64 + pad, 'base64').toString('utf8');
                if (/^https?:\/\//i.test(decoded)) return decoded;
              } catch {}
            }
          }

          return s;
        } catch {
          return s;
        }
      };

      const results: Array<{ title: string; url: string; description: string }> = [];
      const normSeen = new Set<string>();
      for (const r of rawResults) {
        const url = normalizeSearchResultUrl(String((r as any)?.url || ''));
        const title = String((r as any)?.title || '').trim();
        const description = String((r as any)?.description || '').trim();
        if (!url || !/^https?:\/\//i.test(url)) continue;
        if (normSeen.has(url)) continue;
        normSeen.add(url);
        results.push({ title, url, description });
      }
      logs.push(`search.results.normalized=${results.length}`);
      if (!results.length) return { ok: false, error: 'no_search_results', logs };

      const isBadSearchUrl = (u: string) =>
        /(^|\.)google\./i.test(u) ||
        /(^|\.)bing\./i.test(u) ||
        /duckduckgo\.com/i.test(u) ||
        /youtube\.com|youtu\.be/i.test(u) ||
        /wikipedia\.org/i.test(u);

      const wantsTradeInOrUsed =
        /(trade[\s-]?in|sell|used|refurb|renewed|second\s*hand|مستعمل|تجديد|تجديده|تبادل|استبدال)/i.test(queryRaw);

      const scoreCandidate = (u: string, title: string, desc: string) => {
        let score = 0;
        const t = `${title} ${desc}`.toLowerCase();
        const urlLow = u.toLowerCase();
        let host = '';
        let path = '';
        try {
          const parsed = new URL(u);
          host = parsed.hostname.replace(/^www\./, '').toLowerCase();
          path = `${parsed.pathname || ''}${parsed.search || ''}`.toLowerCase();
        } catch {}

        const knownStoreRe =
          /amazon\.|noon\.com|jarir\.com|extra\.com|temu\.com|aliexpress\.com|shein\.com|ebay\.|walmart\.com/i;

        if (knownStoreRe.test(host)) score += 60;
        if (wantsSiteOnly && storeDomain && host.includes(storeDomain.toLowerCase())) score += 120;

        if (/\/dp\/|\/gp\/product\/|\/products?\//i.test(path)) score += 30;
        if (/\/p\//i.test(path)) score += 18;
        if (/-\d+\.html(\?|$)/i.test(path)) score += 22;
        if (/smartphones-\d+\.html(\?|$)/i.test(path)) score += 18;
        if (/sku|product|item|pid|asin/i.test(path)) score += 10;

        if (/price|buy|add to cart|checkout|سعر|شراء|أضف إلى السلة|اضف الى السلة|السلة/i.test(t)) score += 8;

        if (!wantsTradeInOrUsed && /(trade[\s-]?in|sell|used|refurb|renewed|second\s*hand|مستعمل|تبادل|استبدال)/i.test(t)) score -= 80;
        if (/(review|specs|vs\b|compare|comparison|best\b|top\b|guide|blog|news|wikipedia)/i.test(t)) score -= 35;
        if (/\/blog\/|\/news\/|\/guide\/|\/compare\/|\/reviews?\//i.test(path)) score -= 25;

        if (/utm_|gclid|fbclid|ref=|aff/i.test(urlLow)) score -= 2;
        if (isBadSearchUrl(u)) score -= 200;

        score += Math.min(20, Math.max(0, 220 - u.length) / 20);
        return score;
      };

      const rankedCandidates: Array<{ url: string; title: string; description: string; score: number }> = [];
      const seen = new Set<string>();
      for (const r of results) {
        const u = String(r?.url || '').trim();
        if (!u || !/^https?:\/\//i.test(u)) continue;
        if (seen.has(u)) continue;
        seen.add(u);
        if (isBadSearchUrl(u)) continue;
        if (wantsSiteOnly) {
          try {
            const h = new URL(u).hostname.replace(/^www\./, '').toLowerCase();
            if (!h.includes(storeDomain.toLowerCase())) continue;
          } catch {
            continue;
          }
        }
        const title = String(r?.title || '').trim();
        const description = String(r?.description || '').trim();
        rankedCandidates.push({ url: u, title, description, score: scoreCandidate(u, title, description) });
      }

      rankedCandidates.sort((a, b) => b.score - a.score);
      const dedupUrls = rankedCandidates.slice(0, maxCandidates).map(c => c.url);

      const currencyFromText = (txt: string) => {
        const t = String(txt || '');
        if (/SAR|ر\.?\s?س|ريال/i.test(t)) return 'SAR';
        if (/AED|د\.?\s?إ/i.test(t)) return 'AED';
        if (/KWD|د\.?\s?ك/i.test(t)) return 'KWD';
        if (/QAR|ر\.?\s?ق/i.test(t)) return 'QAR';
        if (/BHD|د\.?\s?ب/i.test(t)) return 'BHD';
        if (/OMR|ر\.?\s?ع/i.test(t)) return 'OMR';
        if (/EGP|ج\.?\s?م|جنيه/i.test(t)) return 'EGP';
        if (/USD|\$/i.test(t)) return 'USD';
        if (/EUR|€/i.test(t)) return 'EUR';
        if (/GBP|£/i.test(t)) return 'GBP';
        if (/TRY|₺/i.test(t)) return 'TRY';
        if (/INR|₹/i.test(t)) return 'INR';
        if (/JPY|¥/i.test(t)) return 'JPY';
        if (/CAD/i.test(t)) return 'CAD';
        if (/AUD/i.test(t)) return 'AUD';
        return '';
      };

      const parsePriceNumber = (raw: string) => {
        const s0 = String(raw || '').replace(/\s+/g, ' ').trim();
        if (!s0) return null;
        const cleaned = s0.replace(/[^\d.,-]/g, '');
        if (!/\d/.test(cleaned)) return null;
        const lastDot = cleaned.lastIndexOf('.');
        const lastComma = cleaned.lastIndexOf(',');
        let normalized = cleaned;
        if (lastDot >= 0 && lastComma >= 0) {
          if (lastDot > lastComma) normalized = cleaned.replace(/,/g, '');
          else normalized = cleaned.replace(/\./g, '').replace(/,/g, '.');
        } else if (lastComma >= 0 && lastDot < 0) {
          const parts = cleaned.split(',');
          if (parts.length === 2 && parts[1].length <= 2) normalized = parts[0].replace(/\./g, '') + '.' + parts[1];
          else normalized = cleaned.replace(/,/g, '');
        } else {
          normalized = cleaned.replace(/,/g, '');
        }
        const num = Number(normalized);
        if (!Number.isFinite(num) || num <= 0) return null;
        if (num > 10000000) return null;
        return num;
      };

      const extractJsonLdObjects = (html: string) => {
        const out: any[] = [];
        const re = /<script[^>]*type=["']application\/ld\+json[^"']*["'][^>]*>([\s\S]*?)<\/script>/gi;
        let m: RegExpExecArray | null;
        while ((m = re.exec(html))) {
          const raw = String(m[1] || '').trim();
          if (!raw) continue;
          try {
            const parsed = JSON.parse(raw);
            out.push(parsed);
          } catch {}
        }
        return out;
      };

      const collectProducts = (node: any, acc: any[]) => {
        if (!node) return;
        if (Array.isArray(node)) {
          for (const x of node) collectProducts(x, acc);
          return;
        }
        if (typeof node !== 'object') return;
        const t = node['@type'];
        const types = Array.isArray(t) ? t : t ? [t] : [];
        if (types.some((x: any) => String(x).toLowerCase() === 'product')) {
          acc.push(node);
        }
        if (node['@graph']) collectProducts(node['@graph'], acc);
        for (const v of Object.values(node)) collectProducts(v as any, acc);
      };

      const pick = <T,>(v: T | undefined | null, fallback: T) => (typeof v === 'undefined' || v === null ? fallback : v);

      const fetchHtml = async (u: string) => {
        if (Date.now() >= deadlineMs) {
          return { ok: false as const, error: 'deadline_exceeded', html: '', finalUrl: u, rendered: false };
        }
        const needsRender = false;

        try {
          const controller = new AbortController();
          const to = setTimeout(() => controller.abort(), 20000);
          try {
            const resp = await fetch(u, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': isArabic ? 'ar' : 'en',
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              },
              signal: controller.signal,
            });
            const status = Number(resp.status);
            const ok = !!resp.ok;
            const html = await resp.text();
            const finalUrl = (resp as any)?.url ? String((resp as any).url) : u;

            if (!ok) {
              if (!needsRender) return { ok: false as const, error: `http_${status}`, html: '', finalUrl, rendered: false };
            }

            const htmlLower = html.toLowerCase();
            const hasJsonLd = htmlLower.includes('application/ld+json');
            const hasMetaPrice =
              htmlLower.includes('product:price:amount') ||
              htmlLower.includes('og:price:amount') ||
              htmlLower.includes('pricecurrency') ||
              htmlLower.includes('itemprop="price"') ||
              htmlLower.includes('itemprop=price');
            const hasMoneyText =
              /(?:sar|aed|usd|eur|gbp|try|inr|jpy|cad|aud|ريال|ر\.?\s?س|د\.?\s?إ|€|\$|£|¥|₺|₹)[^\d]{0,3}\d[\d.,]{0,12}/i.test(
                html
              );

            if (!needsRender || hasJsonLd || hasMetaPrice || hasMoneyText) {
              return { ok: true as const, html, finalUrl, rendered: false };
            }
          } finally {
            clearTimeout(to);
          }
        } catch (e: any) {
          if (!needsRender) return { ok: false as const, error: String(e?.message || e), html: '', finalUrl: u, rendered: false };
        }

        return { ok: false as const, error: 'fetch_failed', html: '', finalUrl: u, rendered: false };
      };

      const extractOfferFromHtml = (html: string, pageUrl: string, titleHint: string) => {
        const host = (() => {
          try {
            return new URL(pageUrl).hostname.replace(/^www\./, '');
          } catch {
            return '';
          }
        })();
        const path = (() => {
          try {
            return new URL(pageUrl).pathname.toLowerCase();
          } catch {
            return '';
          }
        })();

        const decodeEntities = (s: string) =>
          String(s || '')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&quot;/gi, '"')
            .replace(/&#39;/g, "'")
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>');

        const extractMetaContent = (key: string) => {
          const k = String(key || '').trim();
          if (!k) return '';
          const re = new RegExp(
            `<meta[^>]+(?:property|name)=["']${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]+content=["']([^"']+)["']`,
            'i'
          );
          const m = html.match(re);
          return decodeEntities(String(m?.[1] || '')).trim();
        };

        const title =
          extractMetaContent('og:title') ||
          extractMetaContent('twitter:title') ||
          decodeEntities(String(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ''))
            .replace(/\s+/g, ' ')
            .trim() ||
          String(titleHint || '').trim();

        const image = extractMetaContent('og:image') || extractMetaContent('twitter:image');

        const isMerchantLike =
          /amazon\.|noon\.com|jarir\.com|extra\.com|temu\.com|aliexpress\.com|shein\.com|ebay\.|walmart\.com|bestbuy\.com|target\.com|bhphotovideo\.com|newegg\.com|microcenter\.com|fnac\.com|mediamarkt\.|saturn\.de/i.test(
            host
          ) ||
          /shop|store|market|cart|checkout|product|item|sku|buy/i.test(host + ' ' + path) ||
          /\/dp\/|\/gp\/product\/|\/products?\//i.test(path);

        const maxByCurrency: Record<string, number> = {
          SAR: 500000,
          AED: 500000,
          KWD: 500000,
          QAR: 500000,
          BHD: 500000,
          OMR: 500000,
          EGP: 5000000,
          USD: 200000,
          CAD: 200000,
          EUR: 200000,
          GBP: 200000,
          TRY: 2000000,
          INR: 20000000,
          JPY: 30000000,
          AUD: 200000,
        };
        const isReasonablePrice = (price: number, currency: string) => {
          const cur = String(currency || '').toUpperCase();
          const max = typeof maxByCurrency[cur] === 'number' ? maxByCurrency[cur] : 1000000;
          return Number.isFinite(price) && price > 0 && price <= max;
        };

        if (/(^|\.)noon\.com$/i.test(host)) {
          const matches: Array<{ price: number; currency: string; raw: string }> = [];
          const patterns: RegExp[] = [
            /"priceCurrency"\s*:\s*"([A-Z]{3})"[\s\S]{0,500}?"price"\s*:\s*"?(\d+(?:[.,]\d+)?)"?/gi,
            /"price"\s*:\s*"?(\d+(?:[.,]\d+)?)"?[\s\S]{0,500}?"priceCurrency"\s*:\s*"([A-Z]{3})"/gi,
            /"(?:offerPrice|salePrice|sellingPrice|nowPrice|priceNow)"\s*:\s*"?(\d+(?:[.,]\d+)?)"?[\s\S]{0,250}?"currency"\s*:\s*"([A-Z]{3})"/gi,
            /"currency"\s*:\s*"([A-Z]{3})"[\s\S]{0,250}?"(?:offerPrice|salePrice|sellingPrice|nowPrice|priceNow)"\s*:\s*"?(\d+(?:[.,]\d+)?)"?/gi,
            /"currencyCode"\s*:\s*"([A-Z]{3})"[\s\S]{0,600}?"(?:amount|price|value)"\s*:\s*"?(\d+(?:[.,]\d+)?)"?/gi,
            /"(?:amount|price|value)"\s*:\s*"?(\d+(?:[.,]\d+)?)"?[\s\S]{0,600}?"currencyCode"\s*:\s*"([A-Z]{3})"/gi,
          ];
          for (const re of patterns) {
            let m: RegExpExecArray | null;
            while ((m = re.exec(html))) {
              const a = String(m[1] || '');
              const b = String(m[2] || '');
              const currency = (/^[A-Z]{3}$/.test(a) ? a : /^[A-Z]{3}$/.test(b) ? b : '').toUpperCase();
              const priceRaw = currency === a ? b : a;
              const price = parsePriceNumber(priceRaw);
              if (price && currency && isReasonablePrice(price, currency)) matches.push({ price, currency, raw: String(m[0] || '') });
              if (matches.length >= 25) break;
            }
          }
          if (!matches.length) {
            const s = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1] || '';
            if (s) {
              try {
                const j = JSON.parse(s);
                const pushPair = (cur: string, price: number, raw: string) => {
                  if (price && cur && isReasonablePrice(price, cur)) matches.push({ price, currency: cur, raw });
                };
                const visit = (node: any) => {
                  if (!node) return;
                  if (Array.isArray(node)) { for (const el of node) visit(el); return; }
                  if (typeof node !== 'object') return;
                  const curRaw = String((node as any)?.currency || (node as any)?.priceCurrency || (node as any)?.currencyCode || '').trim().toUpperCase();
                  const priceRaw = String((node as any)?.price ?? (node as any)?.sellingPrice ?? (node as any)?.offerPrice ?? (node as any)?.nowPrice ?? (node as any)?.priceNow ?? (node as any)?.amount ?? (node as any)?.value ?? '').trim();
                  const priceNum = parsePriceNumber(priceRaw);
                  const rawStr = priceRaw || curRaw ? `${curRaw} ${priceRaw}` : '';
                  if (priceNum && curRaw) pushPair(curRaw, priceNum, rawStr);
                  for (const v of Object.values(node)) visit(v);
                };
                visit(j);
              } catch {}
            }
          }
          matches.sort((a, b) => a.price - b.price);
          const best = matches[0];
          if (best) {
            return {
              ok: true as const,
              offer: {
                title,
                url: pageUrl,
                store: host,
                price: best.price,
                currency: best.currency,
                priceText: best.raw.slice(0, 160),
                availability: '',
                image,
                source: 'noon_json',
                confidence: 0.65,
              },
            };
          }
        }

        if (/(^|\.)jarir\.com$/i.test(host)) {
          const candidates: Array<{ price: number; currency: string; text: string }> = [];
          const re1 = /(?:SAR|ر\.?\s?س|ريال)\s*([0-9][0-9.,]{0,12})/gi;
          const re2 = /([0-9][0-9.,]{0,12})\s*(?:SAR|ر\.?\s?س|ريال)/gi;
          for (const re of [re1, re2]) {
            let m: RegExpExecArray | null;
            while ((m = re.exec(html))) {
              const raw = String(m[1] || '');
              const price = parsePriceNumber(raw);
              const currency = currencyFromText(String(m[0] || '')) || 'SAR';
              const txt = String(m[0] || '').trim();
              if (/month|شهري|شهر|\/\s*mo/i.test(txt)) continue;
              const idx = (m as any).index ?? html.indexOf(m[0] || '');
              const ctx = idx >= 0 ? html.slice(Math.max(0, idx - 60), Math.min(html.length, idx + 120)) : txt;
              if (/(وفر|وفّر|خصم|قسط|قسّط|استبدل|trade[\s-]?in|installment|discount|save|off|حتى)/i.test(ctx)) continue;
              if (price && currency && isReasonablePrice(price, currency)) {
                const minByCur: Record<string, number> = { USD: 80, CAD: 100, EUR: 90, GBP: 70, SAR: 500, AED: 500, KWD: 20, QAR: 500, BHD: 20, OMR: 20, TRY: 1500, INR: 7000 };
                const curKey = String(currency).toUpperCase();
                const min = typeof minByCur[curKey] === 'number' ? minByCur[curKey] : 50;
                const accessory = /(case|cover|cable|adapter|charger|protector|stand|جراب|غلاف|سلك|كيبل|شاحن|حماية|حافظ)/i.test(queryRaw);
                if (!accessory && price < min) continue;
                candidates.push({ price, currency, text: txt });
              }
              if (candidates.length >= 25) break;
            }
            if (candidates.length >= 25) break;
          }
          candidates.sort((a, b) => a.price - b.price);
          const best = candidates[0];
          if (best) {
            return {
              ok: true as const,
              offer: {
                title,
                url: pageUrl,
                store: host,
                price: best.price,
                currency: best.currency,
                priceText: best.text,
                availability: '',
                image,
                source: 'jarir_regex',
                confidence: 0.6,
              },
            };
          }
        }

        const dom = createDom(html, pageUrl);
        const doc = dom.window.document;

        const jsonlds = extractJsonLdObjects(html);
        const products: any[] = [];
        for (const j of jsonlds) collectProducts(j, products);

        const offersFromJsonLd: Array<{ price: number; currency: string; availability: string; priceText: string }> = [];
        for (const p of products) {
          const offers = (p as any)?.offers;
          const pushOffer = (o: any) => {
            if (!o || typeof o !== 'object') return;
            const currency = String(o?.priceCurrency || o?.pricecurrency || '').trim().toUpperCase();
            const priceRaw = pick(o?.price, pick(o?.lowPrice, pick(o?.highPrice, '')));
            const priceNum = parsePriceNumber(String(priceRaw));
            const availabilityRaw = String(o?.availability || '').trim();
            const availability = availabilityRaw ? availabilityRaw.split('/').pop() || availabilityRaw : '';
            const cur = currency || currencyFromText(String(priceRaw)) || currencyFromText(availabilityRaw);
            if (!priceNum || !cur) return;
            if (!isReasonablePrice(priceNum, cur)) return;
            offersFromJsonLd.push({ price: priceNum, currency: cur, availability, priceText: String(priceRaw) });
          };
          if (Array.isArray(offers)) offers.forEach(pushOffer);
          else if (offers) pushOffer(offers);
        }

        const metaPriceAmount =
          String(doc.querySelector('meta[property="product:price:amount"]')?.getAttribute('content') || '').trim() ||
          String(doc.querySelector('meta[property="og:price:amount"]')?.getAttribute('content') || '').trim() ||
          String(doc.querySelector('meta[name="twitter:data1"]')?.getAttribute('content') || '').trim() ||
          String(doc.querySelector('[itemprop="price"]')?.getAttribute('content') || '').trim();

        const metaCurrency =
          String(doc.querySelector('meta[property="product:price:currency"]')?.getAttribute('content') || '').trim() ||
          String(doc.querySelector('meta[property="og:price:currency"]')?.getAttribute('content') || '').trim() ||
          String(doc.querySelector('[itemprop="priceCurrency"]')?.getAttribute('content') || '').trim();

        const metaPriceNum = parsePriceNumber(metaPriceAmount);
        const metaCur = String(metaCurrency || '').toUpperCase() || currencyFromText(metaPriceAmount);

        const fallbackPriceText = (() => {
          const txt = doc.body?.textContent ? String(doc.body.textContent) : '';
          const compact = txt.replace(/\s+/g, ' ').trim();
          const m =
            compact.match(/(?:SAR|AED|USD|EUR|GBP|TRY|INR|JPY|CAD|AUD)\s?\d{1,7}(?:[.,]\d{1,3})?(?:[.,]\d{1,2})?/i) ||
            compact.match(/\d{1,7}(?:[.,]\d{1,3})?(?:[.,]\d{1,2})?\s?(?:SAR|AED|USD|EUR|GBP|TRY|INR|JPY|CAD|AUD)\b/i) ||
            compact.match(
              /(?:ر\.?\s?س|ريال|د\.?\s?إ|درهم|د\.?\s?ك|دينار|ر\.?\s?ق|ر\.?\s?ع|د\.?\s?ب)\s?\d{1,7}(?:[.,]\d{1,3})?(?:[.,]\d{1,2})?/i
            ) ||
            compact.match(
              /\d{1,7}(?:[.,]\d{1,3})?(?:[.,]\d{1,2})?\s?(?:ر\.?\s?س|ريال|د\.?\s?إ|درهم|د\.?\s?ك|دينار|ر\.?\s?ق|ر\.?\s?ع|د\.?\s?ب)/i
            ) ||
            compact.match(/[\$€£¥₺₹]\s?\d{1,7}(?:[.,]\d{1,3})?(?:[.,]\d{1,2})?/);
          return String(m?.[0] || '').trim();
        })();
        const fallbackPriceNum = parsePriceNumber(fallbackPriceText);
        const fallbackCur = currencyFromText(fallbackPriceText);

        if (offersFromJsonLd.length) {
          offersFromJsonLd.sort((a, b) => a.price - b.price);
          const best = offersFromJsonLd[0];
          if (!isMerchantLike && !wantsTradeInOrUsed && !wantsSiteOnly) {
            return { ok: false as const, error: 'not_merchant' };
          }
          return {
            ok: true as const,
            offer: {
              title,
              url: pageUrl,
              store: host,
              price: best.price,
              currency: best.currency,
              priceText: best.priceText,
              availability: best.availability,
              image,
              source: 'jsonld',
              confidence: 0.9,
            },
          };
        }

        if (metaPriceNum && metaCur && isReasonablePrice(metaPriceNum, metaCur)) {
          if (!isMerchantLike && !wantsTradeInOrUsed && !wantsSiteOnly) {
            return { ok: false as const, error: 'not_merchant' };
          }
          return {
            ok: true as const,
            offer: {
              title,
              url: pageUrl,
              store: host,
              price: metaPriceNum,
              currency: metaCur,
              priceText: metaPriceAmount,
              availability: '',
              image,
              source: 'meta',
              confidence: 0.75,
            },
          };
        }

        if (/(^|\.)jarir\.com$/i.test(host)) {
          const priceEls = Array.from(
            doc.querySelectorAll(
              '.fixed-product__price, .price-box__row, .product-view__price, [class*="price"], [data-testid*="price"], [data-qa*="price"]'
            )
          );
          const candidates: Array<{ price: number; currency: string; text: string }> = [];
          for (const el of priceEls) {
            const text = String(el.textContent || '').replace(/\s+/g, ' ').trim();
            if (!text) continue;
            if (/month|شهري|شهر|\/\s*mo/i.test(text)) continue;
            if (/(وفر|وفّر|خصم|قسط|قسّط|استبدل|trade[\s-]?in|installment|discount|save|off|حتى)/i.test(text)) continue;
            const currency = currencyFromText(text) || 'SAR';
            const price = parsePriceNumber(text);
            if (price && isReasonablePrice(price, currency)) {
              const minByCur: Record<string, number> = { USD: 80, CAD: 100, EUR: 90, GBP: 70, SAR: 500, AED: 500, KWD: 20, QAR: 500, BHD: 20, OMR: 20, TRY: 1500, INR: 7000 };
              const curKey = String(currency).toUpperCase();
              const min = typeof minByCur[curKey] === 'number' ? minByCur[curKey] : 50;
              const accessory = /(case|cover|cable|adapter|charger|protector|stand|جراب|غلاف|سلك|كيبل|شاحن|حماية|حافظ)/i.test(queryRaw);
              if (!accessory && price < min) continue;
              candidates.push({ price, currency, text });
            }
            if (candidates.length >= 30) break;
          }
          candidates.sort((a, b) => a.price - b.price);
          const best = candidates[0];
          if (best) {
            return {
              ok: true as const,
              offer: {
                title,
                url: pageUrl,
                store: host,
                price: best.price,
                currency: best.currency,
                priceText: best.text,
                availability: '',
                image,
                source: 'jarir_dom',
                confidence: 0.7,
              },
            };
          }
        }

        if (/(^|\.)noon\.com$/i.test(host)) {
          const matches: Array<{ price: number; currency: string; raw: string }> = [];
          const patterns: RegExp[] = [
            /"priceCurrency"\s*:\s*"([A-Z]{3})"[\s\S]{0,500}?"price"\s*:\s*"?(\d+(?:[.,]\d+)?)"?/gi,
            /"price"\s*:\s*"?(\d+(?:[.,]\d+)?)"?[\s\S]{0,500}?"priceCurrency"\s*:\s*"([A-Z]{3})"/gi,
            /"(?:offerPrice|salePrice|sellingPrice|nowPrice|priceNow)"\s*:\s*"?(\d+(?:[.,]\d+)?)"?[\s\S]{0,250}?"currency"\s*:\s*"([A-Z]{3})"/gi,
            /"currency"\s*:\s*"([A-Z]{3})"[\s\S]{0,250}?"(?:offerPrice|salePrice|sellingPrice|nowPrice|priceNow)"\s*:\s*"?(\d+(?:[.,]\d+)?)"?/gi,
            /"currencyCode"\s*:\s*"([A-Z]{3})"[\s\S]{0,600}?"(?:amount|price|value)"\s*:\s*"?(\d+(?:[.,]\d+)?)"?/gi,
            /"(?:amount|price|value)"\s*:\s*"?(\d+(?:[.,]\d+)?)"?[\s\S]{0,600}?"currencyCode"\s*:\s*"([A-Z]{3})"/gi,
          ];
          for (const re of patterns) {
            let m: RegExpExecArray | null;
            while ((m = re.exec(html))) {
              const a = String(m[1] || '');
              const b = String(m[2] || '');
              const currency = (/^[A-Z]{3}$/.test(a) ? a : /^[A-Z]{3}$/.test(b) ? b : '').toUpperCase();
              const priceRaw = currency === a ? b : a;
              const price = parsePriceNumber(priceRaw);
              if (price && currency && isReasonablePrice(price, currency)) matches.push({ price, currency, raw: String(m[0] || '') });
              if (matches.length >= 30) break;
            }
          }
          if (!matches.length) {
            const s = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1] || '';
            if (s) {
              try {
                const j = JSON.parse(s);
                const pushPair = (cur: string, price: number, raw: string) => {
                  if (price && cur && isReasonablePrice(price, cur)) matches.push({ price, currency: cur, raw });
                };
                const visit = (node: any) => {
                  if (!node) return;
                  if (Array.isArray(node)) { for (const el of node) visit(el); return; }
                  if (typeof node !== 'object') return;
                  const curRaw = String((node as any)?.currency || (node as any)?.priceCurrency || (node as any)?.currencyCode || '').trim().toUpperCase();
                  const priceRaw = String((node as any)?.price ?? (node as any)?.sellingPrice ?? (node as any)?.offerPrice ?? (node as any)?.nowPrice ?? (node as any)?.priceNow ?? (node as any)?.amount ?? (node as any)?.value ?? '').trim();
                  const priceNum = parsePriceNumber(priceRaw);
                  const rawStr = priceRaw || curRaw ? `${curRaw} ${priceRaw}` : '';
                  if (priceNum && curRaw) pushPair(curRaw, priceNum, rawStr);
                  for (const v of Object.values(node)) visit(v);
                };
                visit(j);
              } catch {}
            }
          }
          matches.sort((a, b) => a.price - b.price);
          const best = matches[0];
          if (best) {
            return {
              ok: true as const,
              offer: {
                title,
                url: pageUrl,
                store: host,
                price: best.price,
                currency: best.currency,
                priceText: best.raw.slice(0, 160),
                availability: '',
                image,
                source: 'noon_json',
                confidence: 0.65,
              },
            };
          }
        }

        if (fallbackPriceNum && fallbackCur && isReasonablePrice(fallbackPriceNum, fallbackCur)) {
          if (!isMerchantLike) return { ok: false as const, error: 'not_merchant' };
          const minByCur: Record<string, number> = { USD: 5, CAD: 5, EUR: 5, GBP: 5, SAR: 10, AED: 10, KWD: 2, QAR: 10, BHD: 2, OMR: 2, TRY: 50, INR: 100 };
          const curKey = String(fallbackCur).toUpperCase();
          const min = typeof minByCur[curKey] === 'number' ? minByCur[curKey] : 5;
          const accessory =
            /(case|cover|cable|adapter|charger|protector|stand|جراب|غلاف|سلك|كيبل|شاحن|حماية|حافظ)/i.test(queryRaw);
          if (!accessory && fallbackPriceNum < min) return { ok: false as const, error: 'implausible_price' };
          return {
            ok: true as const,
            offer: {
              title,
              url: pageUrl,
              store: host,
              price: fallbackPriceNum,
              currency: fallbackCur,
              priceText: fallbackPriceText,
              availability: '',
              image,
              source: 'text',
              confidence: 0.55,
            },
          };
        }

        if (/(^|\.)noon\.com$/i.test(host)) {
          const localeCur = (() => {
            try {
              const p = new URL(pageUrl).pathname.toLowerCase();
              if (p.includes('/saudi-')) return 'SAR';
              if (p.includes('/uae-')) return 'AED';
              if (p.includes('/egypt-')) return 'EGP';
              if (p.includes('/kuwait-')) return 'KWD';
              if (p.includes('/qatar-')) return 'QAR';
              if (p.includes('/bahrain-')) return 'BHD';
              if (p.includes('/oman-')) return 'OMR';
            } catch {}
            return '';
          })();

          const curCandidate = localeCur || 'SAR';
          const priceNodes = Array.from(
            doc.querySelectorAll(
              'span[class*="priceNowText"], span[class*="priceNow"], div[class*="priceNow"], [data-qa*="price"], [data-testid*="price"]'
            )
          );
          const nums: number[] = [];
          for (const el of priceNodes) {
            const t = String((el as any)?.textContent || '').replace(/\s+/g, ' ').trim();
            if (/month|شهري|شهر|\/\s*mo/i.test(t)) continue;
            const n = parsePriceNumber(t);
            if (n && isReasonablePrice(n, curCandidate)) {
              const minByCur: Record<string, number> = { USD: 80, CAD: 100, EUR: 90, GBP: 70, SAR: 500, AED: 500, KWD: 20, QAR: 500, BHD: 20, OMR: 20, TRY: 1500, INR: 7000, EGP: 5000 };
              const accessory = /(case|cover|cable|adapter|charger|protector|stand|جراب|غلاف|سلك|كيبل|شاحن|حماية|حافظ)/i.test(queryRaw);
              const min = typeof minByCur[curCandidate] === 'number' ? minByCur[curCandidate] : 50;
              if (!accessory && n < min) continue;
              nums.push(n);
            }
          }
          nums.sort((a, b) => a - b);
          const best = nums[0];
          if (best) {
            return {
              ok: true as const,
              offer: {
                title,
                url: pageUrl,
                store: host,
                price: best,
                currency: curCandidate,
                priceText: `${curCandidate} ${best}`,
                availability: '',
                image,
                source: 'dom',
                confidence: 0.7,
              },
            };
          }
        }

        return { ok: false as const, error: 'no_price_found' };
      };

      const titleHintByUrl = new Map<string, string>();
      for (const r of results) {
        const u = String(r?.url || '').trim();
        const t = String(r?.title || '').trim();
        if (u && t) titleHintByUrl.set(u, t);
      }

      const mapLimit = async <T, R>(arr: T[], conc: number, fn: (t: T) => Promise<R>) => {
        const out: R[] = new Array(arr.length) as any;
        let idx = 0;
        const workers = new Array(Math.min(conc, arr.length)).fill(0).map(async () => {
          while (idx < arr.length && Date.now() < deadlineMs) {
            const cur = idx++;
            out[cur] = await fn(arr[cur]);
          }
        });
        await Promise.all(workers);
        return out;
      };

      const candidateUrls = dedupUrls.slice(0, maxCandidates);
      let settled: any[] = [];
      try {
        settled = await mapLimit(candidateUrls, 2, async (u) => {
          if (Date.now() >= deadlineMs) return { ok: false as const, url: u, error: 'deadline_exceeded' };
          const hint = titleHintByUrl.get(u) || '';
          const got = await Promise.race([
            fetchHtml(u),
            new Promise<{ ok: false; error: string; html: string; finalUrl: string; rendered: boolean }>((resolve) =>
              setTimeout(() => resolve({ ok: false, error: 'candidate_timeout', html: '', finalUrl: u, rendered: false }), 22000)
            ),
          ]);
          if (!got.ok) return { ok: false as const, url: u, error: got.error || 'fetch_failed' };
          const ext = extractOfferFromHtml(got.html, got.finalUrl || u, hint);
          if (!ext.ok) return { ok: false as const, url: got.finalUrl || u, error: (ext as any).error || 'extract_failed' };
          return { ok: true as const, offer: (ext as any).offer };
        });
      } finally {
        // await closeSharedBrowser(); // Keep browser alive for performance
      }

      const offers = settled.filter((x: any) => x && x.ok && x.offer).map((x: any) => x.offer);
      logs.push(`candidates.tried=${candidateUrls.length}`);
      logs.push(`offers.found=${offers.length}`);
      if (!offers.length) return { ok: false, error: 'no_offers_extracted', logs };

      const uniqOffers: any[] = [];
      const offerSeen = new Set<string>();
      for (const o of offers) {
        const key = `${String(o.url)}|${String(o.currency)}|${String(o.price)}`;
        if (offerSeen.has(key)) continue;
        offerSeen.add(key);
        uniqOffers.push(o);
      }

      const byCurrency: Record<string, any[]> = {};
      for (const o of uniqOffers) {
        const cur = String(o.currency || '').toUpperCase() || 'UNKNOWN';
        if (!byCurrency[cur]) byCurrency[cur] = [];
        byCurrency[cur].push(o);
      }
      for (const [cur, arr] of Object.entries(byCurrency)) {
        arr.sort((a: any, b: any) => Number(a.price) - Number(b.price));
        byCurrency[cur] = arr.slice(0, limit);
      }

      const flattened = Object.values(byCurrency).flat().slice(0, limit);
      return { ok: true, output: { offers: flattened, byCurrency, candidatesTried: candidateUrls.length }, logs };
    },
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
    name: 'shell_execute',
    version: '1.0.0',
    tags: ['shell', 'execute'],
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        cwd: { type: 'string' },
        timeout: { type: 'number' },
        dryRun: { type: 'boolean' },
      },
      required: ['command'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        stdout: { type: 'string' },
        stderr: { type: 'string' },
        exitCode: { type: 'number' },
        cwd: { type: 'string' },
      },
    },
    permissions: ['execute'],
    sideEffects: ['execute'],
    rateLimitPerMinute: 60,
    auditFields: ['command', 'cwd'],
    mockSupported: true,
  },
  {
    name: 'read_file_tree',
    version: '1.0.1',
    tags: ['fs', 'utility'],
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        maxDepth: { type: 'number', description: 'Maximum depth to traverse. Default is 3.' },
        maxEntries: { type: 'number', description: 'Maximum number of entries to return. Default is 1000.' },
        ignore: { type: 'array', items: { type: 'string' }, description: 'List of glob patterns to ignore. Default is [node_modules, .git, .DS_Store]' }
      }
    },
    outputSchema: { type: 'object', properties: { entries: { type: 'array', items: { type: 'string' } } } },
    permissions: ['read'],
    sideEffects: [],
    rateLimitPerMinute: 60,
    auditFields: ['path'],
    mockSupported: false,
    async execute(input) {
      const logs: string[] = [];
      const p = resolveToolPath(input?.path);
      const maxDepth = typeof input?.maxDepth === 'number' ? input.maxDepth : 3;
      const maxEntries = typeof input?.maxEntries === 'number' ? input.maxEntries : 1000;
      const ignorePatterns = Array.isArray(input?.ignore) ? input.ignore : ['node_modules', '.git', '.DS_Store'];
      
      const entries: string[] = [];
      let count = 0;

      const minimatchMod: any = await import('minimatch');
      const minimatch: any = minimatchMod?.minimatch || minimatchMod?.default || minimatchMod;

      function traverse(currentPath: string, depth: number) {
        if (depth > maxDepth || count >= maxEntries) return;

        const currentRelativePath = path.relative(p, currentPath);
        if (currentRelativePath && ignorePatterns.some((pattern: string) => minimatch(currentRelativePath, pattern, { dot: true }))) {
          return;
        }

        try {
          const files = fs.readdirSync(currentPath, { withFileTypes: true });
          
          for (const file of files) {
            if (count >= maxEntries) return;

            const fullPath = path.join(currentPath, file.name);
            const relativePath = path.relative(p, fullPath);

            if (ignorePatterns.some((pattern: string) => minimatch(relativePath, pattern, { dot: true }))) {
              continue;
            }
            
            count++;
            
            if (file.isDirectory()) {
              entries.push(relativePath + '/');
              traverse(fullPath, depth + 1);
            } else if (file.isSymbolicLink()) {
              try {
                const realPath = fs.realpathSync(fullPath);
                const stat = fs.statSync(realPath);
                if (stat.isDirectory()) {
                  entries.push(relativePath + '/');
                  traverse(realPath, depth + 1);
                } else {
                  entries.push(relativePath);
                }
              } catch (e: any) {
                logs.push(`symlink.error=${e.message}`);
              }
            } else {
              entries.push(relativePath);
            }
          }
        } catch (e: any) {
          logs.push(`readdir.error=${e.message}`);
        }
      }

      traverse(p, 0);
      
      if (count >= maxEntries) {
        logs.push(`warn_max_entries: Reached max entries limit of ${maxEntries}.`);
      }
      
      return { ok: true, output: { entries: entries.slice(0, maxEntries) }, logs };
    }
  },

  {
    name: 'file_edit',
    version: '1.0.1',
    tags: ['fs', 'utility'],
    inputSchema: { 
      type: 'object', 
      properties: { 
        filename: { type: 'string' }, 
        find: { type: 'string' }, 
        replace: { type: 'string' },
        dryRun: { type: 'boolean', description: 'If true, returns the potential changes without writing to disk.' }
      }, 
      required: ['filename', 'find', 'replace'] 
    },
    outputSchema: { 
      type: 'object', 
      properties: { 
        success: { type: 'boolean' },
        changes: { type: 'string', description: 'The proposed changes if dryRun is true.' },
        originalContent: { type: 'string' },
        newContent: { type: 'string' }
      } 
    },
    permissions: ['write'],
    sideEffects: ['write'],
    rateLimitPerMinute: 60,
    auditFields: ['filename'],
    mockSupported: false,
    async execute(input) {
      const p = resolveToolPath(String(input?.filename));
      const find = String(input?.find || '');
      const replace = String(input?.replace || '');
      const dryRun = input?.dryRun === true;

      if (!fs.existsSync(p)) {
        return { ok: false, error: 'file_not_found', logs: [`edit.fail file=${p}`] };
      }

      const originalContent = fs.readFileSync(p, 'utf-8');
      const newContent = originalContent.replace(find, replace);

      if (dryRun) {
        const changes = `--- a/${path.basename(p)}\n+++ b/${path.basename(p)}\n... (diff preview not implemented, showing full content) ...\n\n- ${originalContent}\n+ ${newContent}`;
        return { ok: true, output: { success: true, changes, originalContent, newContent }, logs: [`edit.dryrun file=${p}`] };
      }

      if (originalContent === newContent) {
        return { ok: true, output: { success: false, changes: 'no_change_needed' }, logs: [`edit.nochange file=${p}`] };
      }

      try {
        fs.writeFileSync(p, newContent, 'utf-8');
        return { ok: true, output: { success: true }, logs: [`edit.success file=${p}`] };
      } catch (e: any) {
        return { ok: false, error: e.message, logs: [`edit.fail file=${p} err=${e.message}`] };
      }
    }
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
    inputSchema: { ...opts.inputSchema, properties: { ...opts.inputSchema.properties, dryRun: { type: 'boolean' } } },
    outputSchema: {
      type: 'object',
      properties: {
        stdout: { type: 'string' },
        stderr: { type: 'string' },
        exitCode: { type: 'number' },
        cwd: { type: 'string' },
        dryRun: { type: 'boolean' },
        command: { type: 'string' },
      },
    },
    permissions: opts.permissions,
    sideEffects: opts.sideEffects,
    rateLimitPerMinute,
    auditFields: Array.isArray(opts.auditFields) ? opts.auditFields : [],
    mockSupported: false,
    async execute(input) {
      const { command, cwd, timeout } = opts.buildCommand(input);
      if (input?.dryRun) {
        return { ok: true, output: { dryRun: true, command, cwd, exitCode: 0, stdout: `[dry run] command: ${command}`, stderr: '' }, logs: [`dryRun: ${command}`] };
      }
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
      let dependencies: Record<string, string> = {};
      let devDependencies: Record<string, string> = {};
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
          scripts = pkg?.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
          dependencies = pkg?.dependencies && typeof pkg.dependencies === 'object' ? pkg.dependencies : {};
          devDependencies = pkg?.devDependencies && typeof pkg.devDependencies === 'object' ? pkg.devDependencies : {};
        } catch {}
      }
      const allDeps: Record<string, string> = { ...dependencies, ...devDependencies };
      const hasDep = (n: string) => typeof allDeps?.[n] === 'string';
      const hasFile = (rel: string) => fs.existsSync(path.join(p, rel));

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
        const cmdFromScript = scriptName ? `npm --prefix "${p}" run ${scriptName}` : '';

        const fallbackCmd = (() => {
          if (task === 'lint') {
            const hasEslintConfig =
              hasFile('eslint.config.js') ||
              hasFile('eslint.config.mjs') ||
              hasFile('.eslintrc') ||
              hasFile('.eslintrc.json') ||
              hasFile('.eslintrc.js') ||
              hasFile('.eslintrc.cjs');
            if (hasDep('eslint') || hasEslintConfig) return `cd "${p}" && npx --no-install eslint .`;
          }
          if (task === 'typecheck') {
            if (hasDep('typescript') && (hasFile('tsconfig.json') || hasFile('tsconfig.base.json'))) {
              const config = hasFile('tsconfig.json') ? 'tsconfig.json' : 'tsconfig.base.json';
              return `cd "${p}" && npx --no-install tsc -p "${config}" --noEmit`;
            }
          }
          if (task === 'test') {
            if (hasDep('vitest')) return `cd "${p}" && npx --no-install vitest run`;
            if (hasDep('jest')) return `cd "${p}" && npx --no-install jest`;
          }
          if (task === 'build') {
            if (hasDep('vite')) return `cd "${p}" && npx --no-install vite build`;
            if (hasDep('next')) return `cd "${p}" && npx --no-install next build`;
            if (hasDep('react-scripts')) return `cd "${p}" && npx --no-install react-scripts build`;
          }
          return '';
        })();

        if (!cmdFromScript && !fallbackCmd) {
          results.push({ task, ok: false, skipped: true, reason: 'missing_script' });
          return;
        }

        const cmd = cmdFromScript || fallbackCmd;
        const r = await executeTool('shell_execute', { command: cmd, cwd: repoRoot(), timeout: 10 * 60 * 1000 });
        results.push({
          task,
          ok: r.ok,
          skipped: false,
          command: cmd,
          stdout: r.output?.stdout,
          stderr: r.output?.stderr,
          exitCode: r.output?.exitCode
        });
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
      const globMod: any = await import('glob');
      const globSync: any = globMod?.globSync || globMod?.sync;
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

import { KnowledgeService } from '../services/knowledge';

const toolRateBuckets = new Map<string, { minute: number; count: number }>();

function rateLimitBucketKey(toolName: string, input: any) {
  const safeId = (v: any) => (typeof v === 'string' ? v.trim().slice(0, 80) : '');
  const userId = safeId(input?.userId || input?.__userId);
  const sessionId = safeId(input?.sessionId);
  const scope = userId ? `user:${userId}` : sessionId ? `session:${sessionId}` : 'global';
  return `${toolName}:${scope}`;
}

function checkToolRateLimit(bucketKey: string, limitPerMinute: number) {
  const limit = Number(limitPerMinute);
  if (!Number.isFinite(limit)) return { allowed: true as const };
  if (limit <= 0) {
    return { allowed: false as const, retryAfterMs: 60000 };
  }
  const now = Date.now();
  const minute = Math.floor(now / 60000);
  const cur = toolRateBuckets.get(bucketKey);
  if (!cur || cur.minute !== minute) {
    toolRateBuckets.set(bucketKey, { minute, count: 1 });
    return { allowed: true as const };
  }
  const next = cur.count + 1;
  if (next > limit) {
    return { allowed: false as const, retryAfterMs: (minute + 1) * 60000 - now };
  }
  toolRateBuckets.set(bucketKey, { minute, count: next });
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
    const bucketKey = rateLimitBucketKey(name, input);
    const rl = checkToolRateLimit(bucketKey, tDef.rateLimitPerMinute);
    if (!rl.allowed) {
      logs.push(
        `rate_limited=1 bucket=${bucketKey} limit_per_minute=${tDef.rateLimitPerMinute} retry_after_ms=${rl.retryAfterMs}`,
      );
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
            const dom = createDom(rawHtml, baseUrl);
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

      let html = '';
      let finalUrl = url;
      let rendered = false;
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      finalUrl = (resp as any)?.url ? String((resp as any).url) : url;
      logs.push(`fetch.status=${resp.status}`);
      html = await resp.text();

      let parsed = parseHtml(html, finalUrl);
      
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
      const full = path.isAbsolute(filename) ? filename : path.join(ARTIFACT_DIR, filename);
      
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
    if (name === 'ui_theme_generator') {
      const base = resolveToolPath(String(input?.path || '.'));
      const presetRaw = String(input?.preset || 'elegant-dark').toLowerCase();
      const tryPaths = [
        path.join(base, 'tailwind.config.js'),
        path.join(base, 'apps', 'web', 'tailwind.config.js'),
        path.join(base, 'web', 'tailwind.config.js'),
      ];
      const configPath = tryPaths.find(p => fs.existsSync(p));
      if (!configPath) {
        return { ok: false, error: 'tailwind_config_not_found', logs };
      }
      const raw = fs.readFileSync(configPath, 'utf-8');
      const m = raw.match(/content\s*:\s*(\[[\s\S]*?\])/i);
      const contentStr = m ? m[1] : `["./index.html", "./src/**/*.{js,ts,jsx,tsx}"]`;
      const palette = (() => {
        const p = presetRaw;
        if (p === 'light' || p === 'light-classic') {
          return {
            primary: '#2563eb',
            secondary: '#7c3aed',
            accent: '#16a34a',
            muted: '#94a3b8',
            background: '#ffffff',
            foreground: '#0f172a',
            card: '#f8fafc',
          };
        }
        if (p === 'pastel') {
          return {
            primary: '#60a5fa',
            secondary: '#a78bfa',
            accent: '#86efac',
            muted: '#cbd5e1',
            background: '#0b0f19',
            foreground: '#e5e7eb',
            card: '#0f172a',
          };
        }
        return {
          primary: '#3b82f6',
          secondary: '#a855f7',
          accent: '#22c55e',
          muted: '#64748b',
          background: '#0b0f19',
          foreground: '#e5e7eb',
          card: '#111827',
        };
      })();
      const cfg = [
        `export default {`,
        `  content: ${contentStr},`,
        `  theme: {`,
        `    extend: {`,
        `      colors: {`,
        `        primary: "${palette.primary}",`,
        `        secondary: "${palette.secondary}",`,
        `        accent: "${palette.accent}",`,
        `        muted: "${palette.muted}",`,
        `        background: "${palette.background}",`,
        `        foreground: "${palette.foreground}",`,
        `        card: "${palette.card}"`,
        `      },`,
        `      container: { center: true, padding: "1rem", screens: { sm: "640px", md: "768px", lg: "1024px", xl: "1280px" } },`,
        `      borderRadius: { lg: "0.75rem", xl: "1rem" }`,
        `    }`,
        `  },`,
        `  plugins: []`,
        `}`,
        ``,
      ].join('\n');
      fs.writeFileSync(configPath, cfg);
      const changed: string[] = [configPath];
      const cssCandidates = [
        path.join(base, 'src', 'index.css'),
        path.join(base, 'apps', 'web', 'src', 'index.css'),
        path.join(base, 'web', 'src', 'index.css'),
      ];
      const cssPath = cssCandidates.find(p => fs.existsSync(p));
      if (cssPath) {
        const existing = fs.readFileSync(cssPath, 'utf-8');
        const addition = [
          '',
          '.btn { @apply inline-flex items-center gap-2 px-4 py-2 rounded-lg; }',
          '.btn-primary { @apply bg-primary text-white hover:bg-primary/90; }',
          '',
        ].join('\n');
        if (!existing.includes('.btn-primary')) {
          fs.appendFileSync(cssPath, addition);
          changed.push(cssPath);
        }
      }
      logs.push(`ui_theme_generator.updated=${changed.length}`);
      return { ok: true, output: { changed }, logs };
    }
    if (name === 'ui_layout_polish') {
      const base = resolveToolPath(String(input?.path || '.'));
      const candidates = [
        path.join(base, 'src', 'App.jsx'),
        path.join(base, 'apps', 'web', 'src', 'App.jsx'),
        path.join(base, 'web', 'src', 'App.jsx'),
      ];
      const appPath = candidates.find(p => fs.existsSync(p));
      if (!appPath) {
        return { ok: false, error: 'app_file_not_found', logs };
      }
      const content = [
        "import React, { useEffect, useRef, useState } from 'react';",
        "import { Send, MessageCircle } from 'lucide-react';",
        "export default function App() {",
        "  const [connected, setConnected] = useState(false);",
        "  const [messages, setMessages] = useState([]);",
        "  const [text, setText] = useState('');",
        "  const srcRef = useRef(null);",
        "  useEffect(() => {",
        "    const proto = window.location.protocol;",
        "    const host = 'localhost:4000';",
        "    const url = `${proto}//${host}/chat/sse`;",
        "    const src = new window.EventSource(url);",
        "    srcRef.current = src;",
        "    src.onopen = () => setConnected(true);",
        "    src.onerror = () => setConnected(false);",
        "    src.onmessage = (e) => {",
        "      let msg = null;",
        "      try { msg = JSON.parse(e.data); } catch { msg = null; }",
        "      if (msg && msg.type === 'history' && Array.isArray(msg.items)) {",
        "        setMessages(msg.items);",
        "      } else if (msg && msg.type === 'message' && msg.item) {",
        "        setMessages((prev) => [...prev, msg.item]);",
        "      }",
        "    };",
        "    return () => {",
        "      src.close();",
        "      srcRef.current = null;",
        "    };",
        "  }, []);",
        "  const send = () => {",
        "    const t = text.trim();",
        "    if (!t) return;",
        "    window.fetch('http://localhost:4000/chat/send', {",
        "      method: 'POST',",
        "      headers: { 'Content-Type': 'application/json' },",
        "      body: JSON.stringify({ text: t, from: 'me' })",
        "    }).then(() => setText('')).catch(() => {});",
        "  };",
        "  return (",
        "    <div className=\"min-h-screen bg-background text-foreground flex items-center justify-center\">",
        "      <div className=\"w-full max-w-md p-4\">",
        "        <div className=\"flex items-center justify-between mb-4\">",
        "          <div className=\"flex items-center gap-2\">",
        "            <MessageCircle className=\"w-6 h-6 text-primary\" />",
        "            <h1 className=\"text-xl font-semibold\">Chat</h1>",
        "          </div>",
        "          <div className=\"text-xs\">{connected ? 'Online' : 'Offline'}</div>",
        "        </div>",
        "        <div className=\"bg-card rounded-2xl p-3 h-72 overflow-auto mb-3 border border-muted/40 shadow\">",
        "          {messages.map((m, i) => {",
        "            const mine = m.from === 'me';",
        "            return (",
        "              <div key={i} className={`mb-2 ${mine ? 'text-right' : 'text-left'}`}>",
        "                <div className={`inline-block px-3 py-2 rounded-2xl shadow ${mine ? 'bg-primary text-white' : 'bg-muted/20'}`}>",
        "                  <div className=\"text-sm\">{m.text}</div>",
        "                  <div className=\"text-[10px] opacity-70\">{new Date(m.ts).toLocaleTimeString()}</div>",
        "                </div>",
        "              </div>",
        "            );",
        "          })}",
        "        </div>",
        "        <div className=\"flex gap-2\">",
        "          <input",
        "            value={text}",
        "            onChange={(e) => setText(e.target.value)}",
        "            className=\"flex-1 px-3 py-2 rounded-lg bg-card border border-muted/40\"",
        "            placeholder=\"Type a message\"",
        "          />",
        "          <button onClick={send} className=\"btn btn-primary\">",
        "            <Send className=\"w-4 h-4\" />",
        "            <span>Send</span>",
        "          </button>",
        "        </div>",
        "      </div>",
        "    </div>",
        "  );",
        "}",
        "",
      ].join('\n');
      fs.writeFileSync(appPath, content);
      logs.push(`ui_layout_polish.updated=1`);
      return { ok: true, output: { changed: [appPath] }, logs };
    }

    if (name === 'animation_optimizer') {
      const base = resolveToolPath(String(input?.path || '.'));
      const appCandidates = [
        path.join(base, 'src', 'App.jsx'),
        path.join(base, 'apps', 'web', 'src', 'App.jsx'),
        path.join(base, 'web', 'src', 'App.jsx'),
      ];
      const appPath = appCandidates.find(p => fs.existsSync(p));
      if (!appPath) {
        return { ok: false, error: 'app_file_not_found', logs };
      }
      const cssCandidates = [
        path.join(base, 'src', 'index.css'),
        path.join(base, 'apps', 'web', 'src', 'index.css'),
        path.join(base, 'web', 'src', 'index.css'),
      ];
      const cssPath = cssCandidates.find(p => fs.existsSync(p));
      const tailwindCandidates = [
        path.join(base, 'tailwind.config.js'),
        path.join(base, 'apps', 'web', 'tailwind.config.js'),
        path.join(base, 'web', 'tailwind.config.js'),
      ];
      const twPath = tailwindCandidates.find(p => fs.existsSync(p));
      let primaryColor = '#3b82f6';
      if (twPath) {
        try {
          const twRaw = fs.readFileSync(twPath, 'utf-8');
          const m = twRaw.match(/primary:\s*["'](#?[0-9a-fA-F]{3,8})["']/);
          if (m && m[1]) primaryColor = m[1];
        } catch {}
      }
      const changed: string[] = [];
      if (cssPath) {
        const existing = fs.readFileSync(cssPath, 'utf-8');
        let next = existing;
        if (/\.(btn-primary)\s*\{[\s\S]*?@apply\s+.*bg-primary[\s\S]*?\}/.test(existing)) {
          next = next.replace(
            /\.(btn-primary)\s*\{[\s\S]*?\}/,
            `.btn-primary { background-color: ${primaryColor}; color: #fff; transition: filter 120ms ease-out; }\n.btn-primary:hover { filter: brightness(0.95); }`
          );
        }
        if (!/\.btn\s*\{[\s\S]*?transition/.test(next)) {
          next += `\n.btn { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; border-radius: 0.5rem; transition: transform 120ms ease-out, box-shadow 120ms ease-out; }\n.btn:hover { transform: translateY(-0.5px); box-shadow: 0 6px 14px rgba(0,0,0,0.15); }\n`;
        }
        if (!/@keyframes\s+fadeIn/.test(next)) {
          next += `\n@keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }\n.fade-in { animation: fadeIn 160ms ease-out both; }\n`;
        }
        if (next !== existing) {
          fs.writeFileSync(cssPath, next);
          changed.push(cssPath);
        }
      }
      const appContent = [
        "import React, { useEffect, useRef, useState } from 'react';",
        "import { Send, MessageCircle } from 'lucide-react';",
        "export default function App() {",
        "  const [connected, setConnected] = useState(false);",
        "  const [messages, setMessages] = useState([]);",
        "  const [text, setText] = useState('');",
        "  const srcRef = useRef(null);",
        "  const listRef = useRef(null);",
        "  useEffect(() => {",
        "    const proto = window.location.protocol;",
        "    const host = 'localhost:4000';",
        "    const url = `${proto}//${host}/chat/sse`;",
        "    const src = new window.EventSource(url);",
        "    srcRef.current = src;",
        "    src.onopen = () => setConnected(true);",
        "    src.onerror = () => setConnected(false);",
        "    src.onmessage = (e) => {",
        "      let msg = null;",
        "      try { msg = JSON.parse(e.data); } catch { msg = null; }",
        "      if (msg && msg.type === 'history' && Array.isArray(msg.items)) {",
        "        setMessages(msg.items);",
        "      } else if (msg && msg.type === 'message' && msg.item) {",
        "        setMessages((prev) => [...prev, msg.item]);",
        "      }",
        "    };",
        "    return () => {",
        "      src.close();",
        "      srcRef.current = null;",
        "    };",
        "  }, []);",
        "  useEffect(() => {",
        "    const el = listRef.current;",
        "    if (!el) return;",
        "    el.scrollTop = el.scrollHeight;",
        "  }, [messages]);",
        "  const send = () => {",
        "    const t = text.trim();",
        "    if (!t) return;",
        "    window.fetch('http://localhost:4000/chat/send', {",
        "      method: 'POST',",
        "      headers: { 'Content-Type': 'application/json' },",
        "      body: JSON.stringify({ text: t, from: 'me' })",
        "    }).then(() => setText('')).catch(() => {});",
        "  };",
        "  return (",
        "    <div className=\"min-h-screen bg-background text-foreground flex items-center justify-center\">",
        "      <div className=\"w-full max-w-md p-4\">",
        "        <div className=\"flex items-center justify-between mb-4\">",
        "          <div className=\"flex items-center gap-2\">",
        "            <MessageCircle className=\"w-6 h-6 text-primary\" />",
        "            <h1 className=\"text-xl font-semibold\">Chat</h1>",
        "          </div>",
        "          <div className=\"text-xs\">{connected ? 'Online' : 'Offline'}</div>",
        "        </div>",
        "        <div ref={listRef} className=\"bg-card rounded-2xl p-3 h-72 overflow-auto mb-3 border border-muted/40 shadow scroll-smooth\">",
        "          {messages.map((m, i) => {",
        "            const mine = m.from === 'me';",
        "            return (",
        "              <div key={i} className={`mb-2 ${mine ? 'text-right' : 'text-left'} fade-in`}>",
        "                <div className={`inline-block px-3 py-2 rounded-2xl shadow transition-all duration-150 ${mine ? 'bg-primary text-white hover:shadow-lg' : 'bg-muted/20 hover:bg-muted/30'}`}>",
        "                  <div className=\"text-sm\">{m.text}</div>",
        "                  <div className=\"text-[10px] opacity-70\">{new Date(m.ts).toLocaleTimeString()}</div>",
        "                </div>",
        "              </div>",
        "            );",
        "          })}",
        "        </div>",
        "        <div className=\"flex gap-2\">",
        "          <input",
        "            value={text}",
        "            onChange={(e) => setText(e.target.value)}",
        "            onKeyDown={(e) => { if (e.key === 'Enter') send(); }}",
        "            className=\"flex-1 px-3 py-2 rounded-lg bg-card border border-muted/40 focus:outline-none focus:ring-2 focus:ring-primary/50\"",
        "            placeholder=\"Type a message\"",
        "          />",
        "          <button onClick={send} className=\"btn btn-primary\">",
        "            <Send className=\"w-4 h-4\" />",
        "            <span>Send</span>",
        "          </button>",
        "        </div>",
        "      </div>",
        "    </div>",
        "  );",
        "}",
        "",
      ].join('\n');
      fs.writeFileSync(appPath, appContent);
      changed.push(appPath);
      logs.push(`animation_optimizer.updated=${changed.length}`);
      return { ok: true, output: { changed }, logs };
    }
    if (name === 'component_library_import') {
      const base = resolveToolPath(String(input?.path || '.'));
      const cssCandidates = [
        path.join(base, 'src', 'index.css'),
        path.join(base, 'apps', 'web', 'src', 'index.css'),
        path.join(base, 'web', 'src', 'index.css'),
      ];
      const cssPath = cssCandidates.find(p => fs.existsSync(p));
      const twCandidates = [
        path.join(base, 'tailwind.config.js'),
        path.join(base, 'apps', 'web', 'tailwind.config.js'),
        path.join(base, 'web', 'tailwind.config.js'),
      ];
      const twPath = twCandidates.find(p => fs.existsSync(p));
      let primary = '#3b82f6', secondary = '#a855f7', muted = '#64748b', card = '#111827', foreground = '#e5e7eb';
      if (twPath) {
        try {
          const raw = fs.readFileSync(twPath, 'utf-8');
          const pick = (k: string, d: string) => {
            const m = raw.match(new RegExp(`${k}\\s*:\\s*["'](#?[0-9a-fA-F]{3,8})["']`));
            return m && m[1] ? m[1] : d;
          };
          primary = pick('primary', primary);
          secondary = pick('secondary', secondary);
          muted = pick('muted', muted);
          card = pick('card', card);
          foreground = pick('foreground', foreground);
        } catch {}
      }
      const toRgba = (hex: string, alpha: number) => {
        const h = hex.replace('#','');
        const r = parseInt(h.length>=6 ? h.slice(0,2) : h[0]+h[0], 16);
        const g = parseInt(h.length>=6 ? h.slice(2,4) : h[1]+h[1], 16);
        const b = parseInt(h.length>=6 ? h.slice(4,6) : h[2]+h[2], 16);
        return `rgba(${r},${g},${b},${alpha})`;
      };
      const changed: string[] = [];
      if (cssPath) {
        const existing = fs.readFileSync(cssPath, 'utf-8');
        let next = existing;
        if (!/\.card\s*\{/.test(next)) {
          next += `\n.card { background-color: ${card}; color: ${foreground}; border: 1px solid ${toRgba(muted,0.4)}; border-radius: 1rem; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }\n`;
        }
        if (!/\.input\s*\{/.test(next)) {
          next += `\n.input { background-color: ${card}; color: ${foreground}; border: 1px solid ${toRgba(muted,0.4)}; padding: 0.5rem 0.75rem; border-radius: 0.5rem; transition: box-shadow 120ms ease-out; }\n.input:focus { outline: none; box-shadow: 0 0 0 2px ${toRgba(primary,0.45)}; }\n`;
        }
        if (!/\.toolbar\s*\{/.test(next)) {
          next += `\n.toolbar { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.5rem; }\n`;
        }
        if (!/\.badge\s*\{/.test(next)) {
          next += `\n.badge { display: inline-block; border-radius: 999px; font-size: 12px; padding: 2px 8px; background-color: ${secondary}; color: #fff; }\n`;
        }
        if (next !== existing) {
          fs.writeFileSync(cssPath, next);
          changed.push(cssPath);
        }
      }
      logs.push(`component_library_import.updated=${changed.length}`);
      return { ok: true, output: { changed }, logs };
    }
    if (name === 'animation_sweep') {
      const base = resolveToolPath(String(input?.path || '.'));
      const cssCandidates = [
        path.join(base, 'src', 'index.css'),
        path.join(base, 'apps', 'web', 'src', 'index.css'),
        path.join(base, 'web', 'src', 'index.css'),
      ];
      const cssPath = cssCandidates.find(p => fs.existsSync(p));
      const changed: string[] = [];
      if (cssPath) {
        const existing = fs.readFileSync(cssPath, 'utf-8');
        let next = existing;
        if (!/@keyframes\s+slideUp/.test(next)) {
          next += `\n@keyframes slideUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }\n.slide-up { animation: slideUp 180ms ease-out both; }\n`;
        }
        if (!/@keyframes\s+pulseSoft/.test(next)) {
          next += `\n@keyframes pulseSoft { 0% { box-shadow: 0 0 0 0 rgba(0,0,0,0.0); } 50% { box-shadow: 0 0 0 6px rgba(0,0,0,0.06); } 100% { box-shadow: 0 0 0 0 rgba(0,0,0,0.0); } }\n.pulse-soft { animation: pulseSoft 1600ms ease-out infinite; }\n`;
        }
        if (next !== existing) {
          fs.writeFileSync(cssPath, next);
          changed.push(cssPath);
        }
      }
      logs.push(`animation_sweep.updated=${changed.length}`);
      return { ok: true, output: { changed }, logs };
    }
    if (name === 'component_library_import_plus') {
      const base = resolveToolPath(String(input?.path || '.'));
      const cssCandidates = [
        path.join(base, 'src', 'index.css'),
        path.join(base, 'apps', 'web', 'src', 'index.css'),
        path.join(base, 'web', 'src', 'index.css'),
      ];
      const cssPath = cssCandidates.find(p => fs.existsSync(p));
      const twCandidates = [
        path.join(base, 'tailwind.config.js'),
        path.join(base, 'apps', 'web', 'tailwind.config.js'),
        path.join(base, 'web', 'tailwind.config.js'),
      ];
      const twPath = twCandidates.find(p => fs.existsSync(p));
      let primary = '#3b82f6', secondary = '#a855f7', muted = '#64748b', card = '#111827', foreground = '#e5e7eb', accent = '#22c55e';
      if (twPath) {
        try {
          const raw = fs.readFileSync(twPath, 'utf-8');
          const pick = (k: string, d: string) => {
            const m = raw.match(new RegExp(`${k}\\s*:\\s*["'](#?[0-9a-fA-F]{3,8})["']`));
            return m && m[1] ? m[1] : d;
          };
          primary = pick('primary', primary);
          secondary = pick('secondary', secondary);
          muted = pick('muted', muted);
          card = pick('card', card);
          foreground = pick('foreground', foreground);
          accent = pick('accent', accent);
        } catch {}
      }
      const toRgba = (hex: string, alpha: number) => {
        const h = hex.replace('#','');
        const r = parseInt(h.length>=6 ? h.slice(0,2) : h[0]+h[0], 16);
        const g = parseInt(h.length>=6 ? h.slice(2,4) : h[1]+h[1], 16);
        const b = parseInt(h.length>=6 ? h.slice(4,6) : h[2]+h[2], 16);
        return `rgba(${r},${g},${b},${alpha})`;
      };
      const changed: string[] = [];
      if (cssPath) {
        const existing = fs.readFileSync(cssPath, 'utf-8');
        let next = existing;
        if (!/\.modal-overlay\s*\{/.test(next)) {
          next += `\n.modal-overlay { position: fixed; inset: 0; background: ${toRgba('#000000',0.5)}; display: grid; place-items: center; z-index: 50; }\n`;
        }
        if (!/\.modal\s*\{/.test(next)) {
          next += `\n.modal { background-color: ${card}; color: ${foreground}; border: 1px solid ${toRgba(muted,0.4)}; border-radius: 1rem; width: min(640px, 92vw); box-shadow: 0 16px 36px rgba(0,0,0,0.35); padding: 1rem; }\n`;
        }
        if (!/\.toast\s*\{/.test(next)) {
          next += `\n.toast { position: fixed; bottom: 1rem; right: 1rem; border-radius: 0.75rem; padding: 0.625rem 0.875rem; box-shadow: 0 10px 16px rgba(0,0,0,0.25); z-index: 60; }\n`;
        }
        if (!/\.toast-success\s*\{/.test(next)) {
          next += `\n.toast-success { background-color: ${toRgba(accent,0.15)}; border: 1px solid ${toRgba(accent,0.6)}; color: ${foreground}; }\n`;
        }
        if (!/\.toast-error\s*\{/.test(next)) {
          next += `\n.toast-error { background-color: ${toRgba('#ef4444',0.15)}; border: 1px solid ${toRgba('#ef4444',0.6)}; color: ${foreground}; }\n`;
        }
        if (!/@keyframes\s+skeletonPulse/.test(next)) {
          next += `\n@keyframes skeletonPulse { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }\n.skeleton { background-color: ${toRgba(muted,0.18)}; border-radius: 0.5rem; animation: skeletonPulse 1500ms ease-in-out infinite; }\n`;
        }
        if (next !== existing) {
          fs.writeFileSync(cssPath, next);
          changed.push(cssPath);
        }
      }
      logs.push(`component_library_import_plus.updated=${changed.length}`);
      return { ok: true, output: { changed }, logs };
    }
    if (name === 'animation_optimizer_plus') {
      const base = resolveToolPath(String(input?.path || '.'));
      const cssCandidates = [
        path.join(base, 'src', 'index.css'),
        path.join(base, 'apps', 'web', 'src', 'index.css'),
        path.join(base, 'web', 'src', 'index.css'),
      ];
      const cssPath = cssCandidates.find(p => fs.existsSync(p));
      const appCandidates = [
        path.join(base, 'src', 'App.jsx'),
        path.join(base, 'apps', 'web', 'src', 'App.jsx'),
        path.join(base, 'web', 'src', 'App.jsx'),
      ];
      const appPath = appCandidates.find(p => fs.existsSync(p));
      const changed: string[] = [];
      if (cssPath) {
        const existing = fs.readFileSync(cssPath, 'utf-8');
        let next = existing;
        if (!/@keyframes\s+popIn/.test(next)) {
          next += `\n@keyframes popIn { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }\n.animate-pop { animation: popIn 140ms ease-out both; }\n`;
        }
        if (!/@keyframes\s+scaleIn/.test(next)) {
          next += `\n@keyframes scaleIn { from { transform: scale(0.98); } to { transform: scale(1); } }\n.scale-in { animation: scaleIn 120ms ease-out both; }\n`;
        }
        if (!/\.hover-raise\s*\{/.test(next)) {
          next += `\n.hover-raise { transition: transform 140ms ease-out, box-shadow 140ms ease-out; }\n.hover-raise:hover { transform: translateY(-1px); box-shadow: 0 10px 18px rgba(0,0,0,0.25); }\n`;
        }
        if (next !== existing) {
          fs.writeFileSync(cssPath, next);
          changed.push(cssPath);
        }
      }
      if (appPath) {
        const src = fs.readFileSync(appPath, 'utf-8');
        let next = src;
        if (!/fade-in/.test(next) && /messages\.map/.test(next)) {
          next = next.replace(/className={`mb-2 \${mine \? 'text-right' : 'text-left'}(.*?)`}/, (m) => {
            if (/fade-in/.test(m)) return m;
            return m.replace(/`$/, ' fade-in`');
          });
        }
        if (next !== src) {
          fs.writeFileSync(appPath, next);
          changed.push(appPath);
        }
      }
      logs.push(`animation_optimizer_plus.updated=${changed.length}`);
      return { ok: true, output: { changed }, logs };
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

      // No Google/Puppeteer fallback (legacy browser removed)

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
        return { ok: false, error: 'No results found', logs };
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
      const startedAt = Date.now();
      const command = String(input?.command ?? '');
      let cwdInput = String(input?.cwd ?? '');
      const timeoutVal = Number(input?.timeout ?? 30000);
      const dryRun = !!input?.dryRun;

      const redactCmd = (s: string) => {
        let out = String(s || '');
        out = out.replace(/(authorization\s*:\s*bearer\s+)[^\s]+/gi, '$1[REDACTED]');
        out = out.replace(/(\btoken\s*=\s*)[^&\s]+/gi, '$1[REDACTED]');
        out = out.replace(/(\bpassword\s*=\s*)[^&\s]+/gi, '$1[REDACTED]');
        out = out.replace(/(\bapi[_-]?key\s*=\s*)[^&\s]+/gi, '$1[REDACTED]');
        out = out.replace(/(\bsecret\s*=\s*)[^&\s]+/gi, '$1[REDACTED]');
        out = out.replace(/(\b--token\s+)[^\s]+/gi, '$1[REDACTED]');
        out = out.replace(/(\b--password\s+)[^\s]+/gi, '$1[REDACTED]');
        out = out.replace(/(ghp_[A-Za-z0-9]{20,})/g, '[REDACTED]');
        out = out.replace(/(github_pat_[A-Za-z0-9_]{20,})/g, '[REDACTED]');
        out = out.replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, 'sk-[REDACTED]');
        out = out.replace(/\bBearer\s+[A-Za-z0-9._-]{10,}\b/g, 'Bearer [REDACTED]');
        return out;
      };

      if (dryRun) {
        const safeCmd = redactCmd(command);
        return {
          ok: true,
          output: {
            dryRun: true,
            status: 'success',
            reason: 'dry_run',
            command: safeCmd,
            cwd: cwdInput,
            exitCode: 0,
            stdout: `[dry run] command: ${safeCmd}`,
            stderr: '',
            durationMs: 0,
          },
          logs: [`dryRun: ${safeCmd}`],
        };
      }

      // Safety: simplistic check
      if (command.includes('rm -rf /') || command.includes('sudo')) {
         const safeCmd = redactCmd(command);
         const workDir = cwdInput ? (path.isAbsolute(cwdInput) ? cwdInput : path.resolve(process.cwd(), cwdInput)) : process.cwd();
         const durationMs = Date.now() - startedAt;
         logs.push(`exec=${safeCmd} blocked=1`);
         return {
           ok: false,
           error: 'command_not_allowed',
           output: { status: 'failed', reason: 'command_not_allowed', stdout: '', stderr: '', exitCode: 1, cwd: workDir, durationMs },
           logs,
         };
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

        const durationMs = Date.now() - startedAt;
        logs.push(`exec=${redactCmd(command)} cwd=${workDir} exit=0`);
        return {
          ok: true,
          output: {
            status: 'success',
            reason: 'ok',
            stdout: redactCmd(stdout),
            stderr: redactCmd(stderr),
            exitCode: 0,
            cwd: workDir,
            durationMs,
          },
          logs,
        };
      } catch (err: any) {
        const durationMs = Date.now() - startedAt;
        const exitCode = typeof err?.code === 'number' ? err.code : 1;
        const stderrRaw = typeof err?.stderr === 'string' ? err.stderr : '';
        const stdoutRaw = typeof err?.stdout === 'string' ? err.stdout : '';
        const reasonRaw = String((stderrRaw || stdoutRaw || err?.message || 'Command failed') ?? '').trim().split('\n')[0].slice(0, 300);
        const stderr = redactCmd(stderrRaw);
        const stdout = redactCmd(stdoutRaw);
        const reason = redactCmd(reasonRaw);
        logs.push(`exec=${redactCmd(command)} err=${redactCmd(String(err.message || 'command_failed'))}`);
        return { ok: false, error: reason || 'command_failed', output: { status: 'failed', reason, stdout, stderr, exitCode, cwd: workDir, durationMs }, logs };
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
          process.env.GITHUB_TOKEN ||
          process.env.GH_TOKEN ||
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
    if (name === 'github_create_or_update_file') {
        const owner = String(input?.owner || '').trim();
        const repo = String(input?.repo || '').trim();
        const filePath = String(input?.path || '').trim();
        const contentStr = String(input?.content || '');
        const message = String(input?.message || '').trim() || `Add ${filePath}`;
        const branch = String(input?.branch || '').trim();
        const sessionId = typeof (input as any)?.sessionId === 'string' ? String((input as any).sessionId).trim() : '';
        const userId = typeof (input as any)?.userId === 'string' ? String((input as any).userId).trim() : '';
        const shaInput = String(input?.sha || '').trim();
        if (!owner || !repo || !filePath) return { ok: false, error: 'Missing owner/repo/path', logs };
        const { getSessionSecret, getUserSecret } = await import('../services/secrets');
        const token = (
          (userId ? await getUserSecret(userId, 'github', 'GITHUB_TOKEN') : null) ||
          getSessionSecret(sessionId, 'GITHUB_TOKEN') ||
          process.env.GITHUB_TOKEN ||
          process.env.GH_TOKEN ||
          ''
        ).trim();
        if (!token) return { ok: false, error: 'Missing GitHub token', logs };
        const payload: any = {
          message,
          content: Buffer.from(contentStr, 'utf8').toString('base64')
        };
        if (branch) payload.branch = branch;
        let sha = shaInput;
        if (!sha) {
          try {
            const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(filePath)}${branch ? `?ref=${encodeURIComponent(branch)}` : ''}`;
            const r = await fetch(url, {
              method: 'GET',
              headers: {
                'Accept': 'application/vnd.github+json',
                'User-Agent': 'JOE AI',
                'Authorization': `Bearer ${token}`
              }
            });
            if (r.ok) {
              const txt = await r.text();
              let j: any = null;
              try { j = JSON.parse(txt); } catch {}
              const curSha = typeof j?.sha === 'string' ? j.sha : '';
              if (curSha) sha = curSha;
            }
          } catch {}
        }
        if (sha) payload.sha = sha;
        const putUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(filePath)}`;
        try {
          const resp = await fetch(putUrl, {
            method: 'PUT',
            headers: {
              'Accept': 'application/vnd.github+json',
              'Content-Type': 'application/json',
              'User-Agent': 'JOE AI',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
          });
          const text = await resp.text();
          let json: any = null;
          try { json = JSON.parse(text); } catch {}
          if (!resp.ok) {
            const msg = typeof json?.message === 'string' ? json.message : text.slice(0, 300);
            return { ok: false, error: `GitHub API ${resp.status}: ${msg}`, logs };
          }
          const commitSha = String(json?.commit?.sha || '');
          const htmlUrl = String(json?.content?.html_url || '');
          const contentSha = String(json?.content?.sha || '');
          return { ok: true, output: { commitSha, htmlUrl, contentSha }, logs };
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
    return { ok: false, error: 'unknown_tool', logs };
  } catch (e: any) {
    logs.push(`error=${e?.message || String(e)}`);
    return { ok: false, error: e?.message || 'error', logs };
  } finally {
    logs.push(`[${new Date().toISOString()}] end ${name} dt=${Date.now() - t0}ms`);
  }
}
