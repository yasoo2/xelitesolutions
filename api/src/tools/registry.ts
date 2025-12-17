import fs from 'fs';
import path from 'path';
import { ToolDefinition, ToolExecutionResult } from './types';

const ARTIFACT_DIR = process.env.ARTIFACT_DIR || '/tmp/joe-artifacts';
if (!fs.existsSync(ARTIFACT_DIR)) {
  try { fs.mkdirSync(ARTIFACT_DIR, { recursive: true }); } catch {}
}

export const tools: ToolDefinition[] = [
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
    name: 'browser_snapshot',
    version: '1.0.0',
    tags: ['browser', 'artifact'],
    inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    outputSchema: { type: 'object', properties: { href: { type: 'string' }, title: { type: 'string' } } },
    permissions: ['read'],
    sideEffects: [],
    rateLimitPerMinute: 30,
    auditFields: ['url'],
    mockSupported: false,
  },
  {
    name: 'web_search',
    version: '1.0.0',
    tags: ['network', 'search'],
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    outputSchema: { type: 'object', properties: { results: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, url: { type: 'string' }, description: { type: 'string' } } } } } },
    permissions: ['read'],
    sideEffects: [],
    rateLimitPerMinute: 20,
    auditFields: ['query'],
    mockSupported: false,
  },
];

for (let i = 1; i <= 197; i++) {
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

export async function executeTool(name: string, input: any): Promise<ToolExecutionResult> {
  const logs: string[] = [];
  const t0 = Date.now();
  logs.push(`[${new Date().toISOString()}] start ${name}`);
  try {
    if (name === 'echo') {
      const text = String(input?.text ?? '');
      logs.push(`echo.text.length=${text.length}`);
      return { ok: true, output: { text }, logs };
    }
    if (name === 'http_fetch') {
      const url = String(input?.url ?? '');
      const resp = await fetch(url);
      const body = await resp.text();
      logs.push(`fetch.status=${resp.status}`);
      return { ok: true, output: { status: resp.status, bodySnippet: body.slice(0, 512) }, logs };
    }
    if (name === 'file_write') {
      const filename = path.basename(String(input?.filename ?? 'artifact.txt'));
      const content = String(input?.content ?? '');
      const full = path.join(ARTIFACT_DIR, filename);
      fs.writeFileSync(full, content);
      logs.push(`wrote=${full} bytes=${content.length}`);
      const href = `/artifacts/${encodeURIComponent(filename)}`;
      return { ok: true, output: { href }, logs, artifacts: [{ name: filename, href }] };
    }
    if (name === 'browser_snapshot') {
      const url = String(input?.url ?? '');
      const filename = `snapshot-${Date.now()}.png`;
      const full = path.join(ARTIFACT_DIR, filename);
      const { default: puppeteer } = await import('puppeteer');
      const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
      const title = await page.title();
      await page.setViewport({ width: 1280, height: 800 });
      await page.screenshot({ path: full });
      await browser.close();
      logs.push(`snapshot.saved=${full} title=${title}`);
      const href = `/artifacts/${encodeURIComponent(filename)}`;
      return { ok: true, output: { href, title }, logs, artifacts: [{ name: filename, href }] };
    }
    if (name === 'web_search') {
      const query = String(input?.query ?? '');
      const { search } = await import('duck-duck-scrape');
      const results = await search(query, { safeSearch: 0 });
      const simplified = results.results.slice(0, 5).map(r => ({
        title: r.title,
        url: r.url,
        description: r.description
      }));
      logs.push(`search.query=${query} results=${simplified.length}`);
      return { ok: true, output: { results: simplified }, logs };
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
