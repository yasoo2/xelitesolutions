import fs from 'fs';
import path from 'path';
import { ToolDefinition, ToolExecutionResult } from './types';
import { Buffer } from 'buffer';
import { browserService } from '../services/browser';

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
    name: 'html_extract',
    version: '1.0.0',
    tags: ['network', 'html', 'extract'],
    inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    outputSchema: { type: 'object', properties: { title: { type: 'string' }, metaDescription: { type: 'string' }, headings: { type: 'array', items: { type: 'string' } }, links: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, url: { type: 'string' } } } }, textSnippet: { type: 'string' } } },
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
        operation: { type: 'string', enum: ['status', 'add', 'commit', 'push', 'checkout', 'log'] },
        args: { type: 'array', items: { type: 'string' } }
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
    name: 'browser_snapshot',
    version: '1.0.0',
    tags: ['browser', 'artifact'],
    inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    outputSchema: { type: 'object', properties: { href: { type: 'string' }, title: { type: 'string' } } },
    permissions: ['read'],
    sideEffects: [],
    rateLimitPerMinute: 30,
    auditFields: ['filename'],
    mockSupported: false,
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

import { KnowledgeService } from '../services/knowledge';

export async function executeTool(name: string, input: any): Promise<ToolExecutionResult> {
  const logs: string[] = [];
  const t0 = Date.now();
  logs.push(`[${new Date().toISOString()}] start ${name}`);
  try {
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
      let reqBody: any = undefined;
      if (typeof input?.body === 'string') reqBody = input.body;
      else if (input?.json && typeof input.json === 'object') {
        reqBody = JSON.stringify(input.json);
        if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
      }
      const resp = await fetch(url, { method, headers, body: reqBody });
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
      const resp = await fetch(url);
      const html = await resp.text();
      const tMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = tMatch ? String(tMatch[1]).trim() : '';
      const mMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i) || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["'][^>]*>/i);
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
        const href = String(am[1]).trim();
        const txt = String(am[2]).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (href && txt) links.push({ text: txt.slice(0, 160), url: href });
      }
      const textSnippet = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 800);
      return { ok: true, output: { title, metaDescription, headings: headings.slice(0, 12), links: links.slice(0, 12), textSnippet }, logs };
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
    if (name === 'browser_snapshot') {
      const url = String(input?.url ?? '');
      const filename = `snapshot-${Date.now()}.png`;
      const full = path.join(ARTIFACT_DIR, filename);
      
      try {
          // Use persistent browser service
          await browserService.launch();
          const navResult = await browserService.navigate(url);
          const b64 = await browserService.screenshot();
          
          if (b64) {
              fs.writeFileSync(full, Buffer.from(b64, 'base64'));
              logs.push(`snapshot.saved=${full} title=${navResult.title}`);
              const href = `/artifacts/${encodeURIComponent(filename)}`;
              return { ok: true, output: { href, title: navResult.title }, logs, artifacts: [{ name: filename, href }] };
          } else {
              return { ok: false, error: 'Failed to capture screenshot', logs };
          }
      } catch (err: any) {
          logs.push(`browser.error=${err.message}`);
          return { ok: false, error: err.message, logs };
      }
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

      // 1. Search
      const searchRes = await executeTool('web_search', { query: topic });
      if (!searchRes.ok || !searchRes.output?.results?.length) {
        return { ok: false, error: 'No search results found', logs };
      }
      
      const results = (searchRes.output.results as any[]).slice(0, 3);
      logs.push(`research.sources=${results.length}`);
      
      const contents: string[] = [];
      
      // 2. Extract Content
      for (const res of results) {
        try {
          logs.push(`fetching=${res.url}`);
          const ext = await executeTool('html_extract', { url: res.url });
          if (ext.ok && ext.output?.textSnippet) {
            contents.push(`Source: ${res.title} (${res.url})\nContent: ${ext.output.textSnippet}\n`);
          }
        } catch (e) {
          logs.push(`fetch_error=${e}`);
        }
      }
      
      if (contents.length === 0) {
        return { ok: false, error: 'Failed to extract content from sources', logs };
      }

      // 3. Synthesize
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        // Fallback: just return concatenated text if no LLM
        return { 
          ok: true, 
          output: { 
            report: `## Research Results for ${topic}\n\n${contents.join('\n\n')}`, 
            sources: results.map(r => r.url) 
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
              content: 'You are a Research Assistant. Summarize the provided sources into a comprehensive, well-structured report (Markdown). Cite sources where appropriate. If Arabic content, write in Arabic.' 
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
            sources: results.map(r => r.url)
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
      const officialUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
      
      let results: any[] = [];
      
      // 1. Fast try on official API (often fails on servers, so short timeout)
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1500);
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
      } catch (err: any) {
        logs.push(`ddg_api.error=${err.name === 'AbortError' ? 'timeout' : err.message}`);
      }

      // 2. If few results, run Scraper + Wiki in parallel
      if (results.length < 3) {
        const [scrapeRes, wikiRes] = await Promise.allSettled([
          (async () => {
             const ddg = await import('duck-duck-scrape');
             const res = await ddg.search(query);
             return (res.results || []).map((r: any) => ({
               title: String(r.title).slice(0, 120),
               url: String(r.url),
               description: String(r.description)
             })).filter((x: any) => x.url && x.title);
          })(),
          (async () => {
             const hasArabic = /[\u0600-\u06FF]/.test(query);
             const lang = hasArabic ? 'ar' : 'en';
             const wurl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=5`;
             const r = await fetch(wurl);
             if (!r.ok) return [];
             const j = await r.json();
             return (j.query?.search || []).map((it: any) => ({
               title: String(it.title).slice(0, 120),
               url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(it.title.replace(/\s+/g, '_'))}`,
               description: String(it.snippet).replace(/<[^>]+>/g, '')
             })).filter((x: any) => x.url && x.title);
          })()
        ]);

        if (scrapeRes.status === 'fulfilled') results.push(...scrapeRes.value);
        else logs.push(`scrape.failed=${scrapeRes.reason}`);
        
        if (wikiRes.status === 'fulfilled') results.push(...wikiRes.value);
        else logs.push(`wiki.failed=${wikiRes.reason}`);
      }

      // Dedup
      const unique = new Map();
      for (const r of results) {
        const key = r.url;
        if (!unique.has(key)) unique.set(key, r);
      }
      
      const final = Array.from(unique.values()).slice(0, 10);
      logs.push(`search.final_count=${final.length}`);
      return { ok: final.length > 0, output: { results: final }, logs };
    }
    if (name === 'file_read') {
      const filename = String(input?.filename ?? '');
      // Allow full path access for system engineering
      const full = path.isAbsolute(filename) ? filename : path.resolve(process.cwd(), filename);
      
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
      const rootPath = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
      
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
      const dirPath = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
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
            
            const { stdout, stderr } = await execAsync(cmd, { cwd: process.cwd() });
            logs.push(`git.op=${op} success`);
            return { ok: true, output: { output: stdout || stderr }, logs };
        } catch (e: any) {
            return { ok: false, error: e.message || e.stderr, logs };
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

      const workDir = path.isAbsolute(searchPath) ? searchPath : path.resolve(process.cwd(), searchPath);
      
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
       const root = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
       
       if (!fs.existsSync(root)) return { ok: false, error: 'Path not found', logs };
       
       // Gather key info
       const pkgJsonPath = path.join(root, 'package.json');
       let pkgInfo = 'No package.json';
       if (fs.existsSync(pkgJsonPath)) {
           try {
               const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
               pkgInfo = `Name: ${pkg.name}\nDependencies: ${Object.keys(pkg.dependencies || {}).join(', ')}`;
           } catch {}
       }
       
       // Check for context file
       const contextPath = path.join(root, '.joe/context.json');
       let contextInfo = 'No .joe/context.json found';
       if (fs.existsSync(contextPath)) {
           contextInfo = fs.readFileSync(contextPath, 'utf-8').slice(0, 500);
       }
       
       // Check for architecture doc
       const archPath = path.join(root, 'ARCHITECTURE.md');
       let archInfo = 'No ARCHITECTURE.md found';
       if (fs.existsSync(archPath)) {
           archInfo = fs.readFileSync(archPath, 'utf-8').slice(0, 1000);
       }
       
       const summary = `
## Codebase Analysis for ${root}

### Package Info
${pkgInfo}

### Project Context (.joe/context.json)
${contextInfo}

### Architecture (ARCHITECTURE.md)
${archInfo}
       `.trim();
       
       logs.push('analyze.ok');
       return { ok: true, output: { summary }, logs };
    }
    if (name === 'knowledge_search') {
      const query = String(input?.query ?? '');
      const results = KnowledgeService.search(query);
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
      const doc = KnowledgeService.add(filename, content, tags);
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
