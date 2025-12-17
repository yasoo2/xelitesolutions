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
