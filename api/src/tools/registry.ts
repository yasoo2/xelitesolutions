import fs from 'fs';
import path from 'path';
import { ToolDefinition, ToolExecutionResult } from './types';
import { Buffer } from 'buffer';

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
    rateLimitPerMinute: 10,
    auditFields: ['query'],
    mockSupported: false,
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
    tags: ['system', 'shell'],
    inputSchema: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
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
      const contentType = resp.headers.get('content-type') || '';
      const body = await resp.text();
      let json: any = null;
      if (contentType.includes('application/json')) {
        try { json = JSON.parse(body); } catch {}
      }
      logs.push(`fetch.status=${resp.status}`);
      return { ok: true, output: { status: resp.status, contentType, bodySnippet: body.slice(0, 1024), json }, logs };
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
    if (name === 'image_generate') {
      const prompt = String(input?.prompt ?? '').trim();
      const allowedSizes = ['auto','1024x1024','1536x1024','1024x1536','256x256','512x512','1792x1024','1024x1792'] as const;
      const sizeInput = String(input?.size ?? '1024x1024');
      const size = (allowedSizes as readonly string[]).includes(sizeInput) ? (sizeInput as (typeof allowedSizes)[number]) : '1024x1024';
      if (!prompt) return { ok: false, error: 'prompt_required', logs };
      const apiKey = process.env.OPENAI_API_KEY || '';
      if (!apiKey) {
        logs.push('openai.missing_api_key');
        return { ok: false, error: 'OPENAI_API_KEY not set', logs };
      }
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey });
      const resp = await client.images.generate({ model: 'gpt-image-1', prompt, size });
      const b64 = resp.data?.[0]?.b64_json;
      if (!b64) {
        return { ok: false, error: 'image_generation_failed', logs };
      }
      const buf = Buffer.from(b64, 'base64');
      const filename = `image-${Date.now()}.png`;
      const full = path.join(ARTIFACT_DIR, filename);
      fs.writeFileSync(full, buf);
      logs.push(`image.saved=${full} bytes=${buf.length}`);
      const href = `/artifacts/${encodeURIComponent(filename)}`;
      return { ok: true, output: { href }, logs, artifacts: [{ name: filename, href }] };
    }
    if (name === 'web_search') {
      const query = String(input?.query ?? '').trim();
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
      
      let retries = 0;
      const MAX_RETRIES = 2;
      let lastError = null;

      while (retries <= MAX_RETRIES) {
        try {
          const resp = await fetch(url);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const body = await resp.text();
          let json: any = null;
          try { json = JSON.parse(body); } catch {}
          
          const topics = Array.isArray(json?.RelatedTopics) ? json.RelatedTopics : [];
          const simplified = topics
            .map((t: any) => {
              const Text = t?.Text || '';
              const FirstURL = t?.FirstURL || '';
              return { title: String(Text).slice(0, 120), url: String(FirstURL), description: String(Text) };
            })
            .filter((x: any) => x.url && x.title)
            .slice(0, 5);
            
          logs.push(`search.query=${query} results=${simplified.length}`);
          if (simplified.length > 0) {
            return { ok: true, output: { results: simplified }, logs };
          }
        } catch (err: any) {
          lastError = err;
          retries++;
          if (retries <= MAX_RETRIES) {
            await new Promise(r => setTimeout(r, 1000 * retries));
          }
        }
      }
      try {
        const ddg = await import('duck-duck-scrape');
        const res = await ddg.search(query);
        const items = Array.isArray(res?.results) ? res.results : [];
        const simplified2 = items.slice(0, 5).map((r: any) => ({
          title: String(r?.title || '').slice(0, 120),
          url: String(r?.url || ''),
          description: String(r?.description || '')
        })).filter((x: any) => x.url && x.title);
        logs.push(`search.ddg_scrape=${simplified2.length}`);
        return { ok: simplified2.length > 0, output: { results: simplified2 }, logs };
      } catch (err: any) {
        lastError = err;
        return { ok: false, error: lastError?.message || 'Search failed', logs };
      }
    }
    if (name === 'file_read') {
      const filename = path.basename(String(input?.filename ?? ''));
      const full = path.join(ARTIFACT_DIR, filename);
      if (!fs.existsSync(full)) {
        return { ok: false, error: 'File not found', logs };
      }
      const content = fs.readFileSync(full, 'utf-8');
      logs.push(`read=${full} bytes=${content.length}`);
      return { ok: true, output: { content }, logs };
    }
    if (name === 'ls') {
      const dirPath = input?.path ? path.join(ARTIFACT_DIR, path.basename(input.path)) : ARTIFACT_DIR;
      if (!fs.existsSync(dirPath)) {
          return { ok: false, error: 'Directory not found', logs };
      }
      const files = fs.readdirSync(dirPath);
      logs.push(`ls=${dirPath} count=${files.length}`);
      return { ok: true, output: { files }, logs };
    }
    if (name === 'shell_execute') {
      const command = String(input?.command ?? '');
      // Safety: simplistic check, ideally we use a sandbox
      if (command.includes('rm -rf /') || command.includes('sudo')) {
         return { ok: false, error: 'Command not allowed', logs };
      }
      
      const { exec } = await import('child_process');
      const util = await import('util');
      const execAsync = util.promisify(exec);
      
      try {
        const { stdout, stderr } = await execAsync(command, { cwd: ARTIFACT_DIR, timeout: 30000 });
        logs.push(`exec=${command} exit=0`);
        return { ok: true, output: { stdout, stderr, exitCode: 0 }, logs };
      } catch (err: any) {
        logs.push(`exec=${command} err=${err.message}`);
        return { ok: false, output: { stdout: err.stdout, stderr: err.stderr, exitCode: err.code }, logs };
      }
    }
    if (name === 'file_edit') {
      const filename = path.basename(String(input?.filename ?? ''));
      const find = String(input?.find ?? '');
      const replace = String(input?.replace ?? '');
      const full = path.join(ARTIFACT_DIR, filename);
      
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
