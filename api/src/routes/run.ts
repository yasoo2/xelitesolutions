import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { broadcast, LiveEvent } from '../ws';
import { executeTool } from '../tools/registry';
import { store } from '../mock/store';
import { ToolExecution } from '../models/toolExecution';
import { Artifact } from '../models/artifact';
import { Approval } from '../models/approval';
import { Run } from '../models/run';
import { planNextStep, generateSessionTitle, getSystemPrompt } from '../llm';
import { authenticate } from '../middleware/auth';
import { Session } from '../models/session';
import { Message } from '../models/message';
import { FileModel } from '../models/file';
import { MemoryService } from '../services/memory';
import { MemoryItem } from '../models/memoryItem';

const router = Router();

const loopPauseThrottle = new Map<string, number>();

function redactSecretsFromString(input: string): string {
  return input
    .replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, 'sk-[REDACTED]')
    .replace(/\bghp_[A-Za-z0-9_]{10,}\b/g, 'ghp_[REDACTED]')
    .replace(/\bgithub_pat_[A-Za-z0-9_]{10,}\b/g, 'github_pat_[REDACTED]')
    .replace(/\bBearer\s+[A-Za-z0-9._-]{10,}\b/g, 'Bearer [REDACTED]')
    .replace(/([?&]key=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/\bx-worker-key\b\s*[:=]\s*[A-Za-z0-9._-]{6,}/gi, 'x-worker-key:[REDACTED]')
    .replace(/\b(WORKER_API_KEY|BROWSER_WORKER_KEY|JWT_SECRET)\b\s*[:=]\s*[A-Za-z0-9._-]{6,}/gi, '$1=[REDACTED]');
}

function safeErrorMessage(err: any): string {
  const raw = typeof err?.message === 'string' ? err.message : String(err);
  return redactSecretsFromString(raw);
}

function hostFromUrlMaybe(raw: any): string | null {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) return null;
  try {
    return new URL(s).host;
  } catch {
    return s;
  }
}

function formatProviderConnectHint(errMsg: string, provider: any, model: any, baseUrl: any): string {
  const msg = String(errMsg || '');
  const s = msg.toLowerCase();
  const p = typeof provider === 'string' ? provider : '';
  const m = typeof model === 'string' ? model : '';
  const host = hostFromUrlMaybe(baseUrl);

  const parts: string[] = [];
  if (p) parts.push(`provider=${p}`);
  if (m) parts.push(`model=${m}`);
  if (host) parts.push(`baseUrl=${host}`);

  let hint = '';
  if (s.includes('model') && (s.includes('not found') || s.includes('does not exist') || s.includes('model_not_found'))) {
    hint = 'The selected model may be invalid for this provider or base URL.';
  } else if (s.includes('invalid url') || s.includes('only absolute urls') || s.includes('failed to parse url')) {
    hint = 'Base URL looks invalid. Try a full URL like https://api.openai.com/v1.';
  } else if (s.includes('enotfound') || s.includes('getaddrinfo') || s.includes('dns')) {
    hint = 'DNS/host is unreachable. Verify base URL and network access.';
  } else if (s.includes('timeout') || s.includes('timed out')) {
    hint = 'Provider request timed out. Verify network and try again.';
  } else if (s.includes('certificate') || s.includes('self signed') || s.includes('ssl')) {
    hint = 'TLS/SSL handshake failed. Check proxy/certificates or use a correct HTTPS endpoint.';
  } else if (s.includes('rate limit') || s.includes('429')) {
    hint = 'Rate limited by provider. Wait and retry, or use another key/model.';
  } else if (s.includes('401') || s.includes('unauthorized')) {
    hint = 'Authentication failed. Verify the API key and the provider endpoint.';
  }

  const context = parts.length ? `\nContext: ${parts.join(' | ')}` : '';
  const hintLine = hint ? `\nHint: ${hint}` : '';
  return `${context}${hintLine}`.trim();
}

function errorStatusCode(err: any): number | null {
  const candidates = [
    err?.status,
    err?.statusCode,
    err?.response?.status,
    err?.response?.statusCode,
  ];
  for (const v of candidates) {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
    if (Number.isFinite(n) && n >= 100 && n <= 599) return n;
  }
  return null;
}

function isProviderAuthError(err: any, errMsg?: string): boolean {
  const status = errorStatusCode(err);
  if (status === 401 || status === 403) return true;
  const s = String(errMsg ?? safeErrorMessage(err) ?? '').toLowerCase();
  return (
    s.includes('invalid_api_key') ||
    s.includes('invalid api key') ||
    s.includes('incorrect api key') ||
    (s.includes('api key') && (s.includes('unauthorized') || s.includes('forbidden') || s.includes('401') || s.includes('403'))) ||
    (s.includes('authentication') && s.includes('fail')) ||
    s.includes('unauthorized')
  );
}

function isProviderConfigError(err: any, errMsg?: string): boolean {
  const status = errorStatusCode(err);
  const s = String(errMsg ?? safeErrorMessage(err) ?? '').toLowerCase();
  return (
    status === 400 ||
    status === 404 ||
    s.includes('model not found') ||
    s.includes('deployment not found') ||
    s.includes('bad request')
  );
}

function isProviderRateLimitError(err: any, errMsg?: string): boolean {
  const status = errorStatusCode(err);
  if (status === 429) return true;
  const s = String(errMsg ?? safeErrorMessage(err) ?? '').toLowerCase();
  return s.includes('rate limit') || s.includes('too many requests') || s.includes('429');
}

function isProviderTimeoutError(err: any, errMsg?: string): boolean {
  const s = String(errMsg ?? safeErrorMessage(err) ?? '').toLowerCase();
  const status = errorStatusCode(err);
  return status === 408 || s.includes('timeout') || s.includes('timed out') || s.includes('etimedout');
}

function isGitAuthError(raw: string) {
  const s = String(raw || '');
  return (
    /could not read Username/i.test(s) ||
    /could not read Password/i.test(s) ||
    /Authentication failed/i.test(s) ||
    /Support for password authentication was removed/i.test(s) ||
    /Permission denied \(publickey\)/i.test(s) ||
    /fatal:.*could not read/i.test(s)
  );
}

function isGithubAuthError(raw: string) {
  const s = String(raw || '');
  return (
    /Missing GitHub token/i.test(s) ||
    /Bad credentials/i.test(s) ||
    /Requires authentication/i.test(s) ||
    /\b401\b/.test(s) ||
    /\b403\b/.test(s)
  );
}

function isArabicText(raw: string): boolean {
  return /[\u0600-\u06FF]/.test(String(raw || ''));
}

function normalizeToWords(raw: string): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  return s
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isGreetingOnly(raw: string): boolean {
  const s = normalizeToWords(raw);
  if (!s) return false;
  if (s.length > 80) return false;
  const lower = s.toLowerCase();
  const re =
    /^(?:(?:hi|hello|hey|yo|sup)(?:\s+(?:joe|jo|ai))?|good\s+(?:morning|evening)|how\s+are\s+you|مرحبا|اهلا|أهلا|هلا|السلام\s+عليكم|صباح\s+الخير|مساء\s+الخير|كيف\s+حال(?:ك|كم)|شلون(?:ك|كم))(?:\s+(?:joe|jo|ai|جو|جوي))?$/i;
  return re.test(lower);
}

function greetingReply(raw: string): string {
  if (isArabicText(raw)) return 'أهلًا! كيف أقدر أساعدك اليوم؟';
  return 'Hi! How can I help you today?';
}

function extractRequestedRepoName(raw: string): string | null {
  const s = String(raw || '');
  const m1 = s.match(/(?:سميه|اسم(?:ه|ها)?|سَمِّه)\s+([A-Za-z0-9._-]{1,100})/i);
  if (m1 && m1[1]) return m1[1].trim();
  const m2 = s.match(/(?:named|name it|call it)\s+([A-Za-z0-9._-]{1,100})/i);
  if (m2 && m2[1]) return m2[1].trim();
  const m3 = s.match(/\brepo(?:sitory)?\b.*?\b([A-Za-z0-9._-]{1,100})\b/i);
  if (m3 && m3[1]) return m3[1].trim();
  return null;
}

function isEcommerceRequest(raw: string): boolean {
  const s = String(raw || '');
  const hasEn = /(e[-\s]?commerce|online\s+store|web\s+shop|marketplace|ali\s*express|build\s+(a\s+)?store)/i.test(s);
  const t = normalizeArabicQuery(s);
  const hasAr =
    /(متجر|سوق|متجر\s+الكتروني|متجر\s+إلكتروني|موقع\s+متجر|علي\s*اكسبريس|علي\s*إكسبريس|اكسبرس|ابن|ابني|بناء)/.test(t);
  return hasEn || hasAr;
}

function extractTargetProjectRoot(raw: string): string {
  const s = String(raw || '');
  const m1 = s.match(/\b(vivos)\b/i);
  if (m1 && m1[1]) return m1[1].trim();
  const m2 = s.match(/(?:سميه|اسم(?:ه|ها)?|سَمِّه|named|name it|call it)\s+([A-Za-z0-9._-]{1,100})/i);
  if (m2 && m2[1]) return m2[1].trim();
  return 'ecommerce-store';
}

type WorkflowKind = 'ecommerce' | 'static_site' | 'node_api' | 'fullstack' | 'tool_shell';

function buildEcommerceScaffold(root: string) {
  const backendPkg = {
    name: `${root}-backend`,
    version: '1.0.0',
    private: true,
    type: 'module',
    scripts: {
      start: 'node src/index.js',
      dev: 'node src/index.js'
    },
    dependencies: {
      express: '^4.18.2',
      cors: '^2.8.5'
    }
  };
  const beIndexJs =
    "import express from 'express';\n" +
    "import cors from 'cors';\n" +
    "const app = express();\n" +
    "app.use(cors());\n" +
    "app.use(express.json());\n" +
    "const categories=[{id:'electronics',name:'Electronics'},{id:'fashion',name:'Fashion'},{id:'home',name:'Home'}];\n" +
    "const products=[\n" +
    " {id:'p1',name:'Wireless Earbuds',price:29.99,category:'electronics',image:'https://placehold.co/200'},\n" +
    " {id:'p2',name:'Smart Watch',price:49.99,category:'electronics',image:'https://placehold.co/200'},\n" +
    " {id:'p3',name:'Classic T-Shirt',price:12.5,category:'fashion',image:'https://placehold.co/200'},\n" +
    " {id:'p4',name:'Coffee Maker',price:39.0,category:'home',image:'https://placehold.co/200'}\n" +
    "];\n" +
    "const carts={};\n" +
    "app.get('/api/categories',(req,res)=>{res.json({ok:true,categories})});\n" +
    "app.get('/api/products',(req,res)=>{const c=req.query.category;const list=typeof c==='string'?products.filter(p=>p.category===c):products;res.json({ok:true,products:list})});\n" +
    "app.post('/api/cart',(req,res)=>{const {sessionId,productId,qty}=req.body||{};if(!sessionId||!productId||!qty)return res.status(400).json({error:'bad_request'});const cur=carts[sessionId]||[];const idx=cur.findIndex(i=>i.productId===productId);if(idx>=0){cur[idx].qty+=qty}else{cur.push({productId,qty})}carts[sessionId]=cur;res.json({ok:true,cart:cur})});\n" +
    "app.get('/api/cart',(req,res)=>{const sid=String(req.query.sessionId||'').trim();res.json({ok:true,cart:carts[sid]||[]})});\n" +
    "app.post('/api/orders',(req,res)=>{const {sessionId,address}=req.body||{};const cur=carts[sessionId]||[];if(!cur.length)return res.status(400).json({error:'empty_cart'});const total=cur.reduce((sum,i)=>{const p=products.find(p=>p.id===i.productId);return sum+(p?p.price*i.qty:0)},0);carts[sessionId]=[];res.json({ok:true,orderId:'order-'+Date.now(),total,address})});\n" +
    "const port=process.env.PORT||4000;\n" +
    "app.listen(port,()=>{console.log('E-commerce API running on',port)});\n";
  const feIndexHtml =
    "<!DOCTYPE html>\n" +
    "<html lang=\"en\">\n" +
    "<meta charset=\"UTF-8\" />\n" +
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n" +
    "<title>Vivos Shop</title>\n" +
    "<link rel=\"stylesheet\" href=\"styles.css\" />\n" +
    "<body>\n" +
    "<header><h1>Vivos Shop</h1></header>\n" +
    "<main>\n" +
    "<section id=\"filters\"><select id=\"category\"></select></section>\n" +
    "<section id=\"products\" class=\"grid\"></section>\n" +
    "<aside id=\"cart\"></aside>\n" +
    "</main>\n" +
    "<script src=\"app.js\"></script>\n" +
    "</body>\n" +
    "</html>\n";
  const feStyles =
    "body{font-family:system-ui,Arial,sans-serif;margin:0;padding:0;background:#f6f7f9;color:#111}\n" +
    "header{background:#1f2937;color:#fff;padding:16px}\n" +
    "main{display:grid;grid-template-columns:1fr 300px;gap:16px;padding:16px}\n" +
    ".grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}\n" +
    ".card{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:12px;display:flex;flex-direction:column}\n" +
    ".card img{width:100%;height:120px;object-fit:cover;border-radius:6px}\n" +
    ".card .name{font-weight:600;margin:8px 0}\n" +
    ".card .price{color:#16a34a}\n" +
    "#cart{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:12px}\n";
  const feAppJs =
    "const API=location.hostname==='localhost'||location.hostname==='127.0.0.1'? 'http://localhost:8080' : '';\n" +
    "const sid=localStorage.getItem('sid')||('sid-'+Math.random().toString(36).slice(2));localStorage.setItem('sid',sid);\n" +
    "const catSel=document.getElementById('category');const grid=document.getElementById('products');const cart=document.getElementById('cart');\n" +
    "async function loadCats(){const r=await fetch(API+'/api/categories');const j=await r.json();catSel.innerHTML='<option value=\"\">All</option>'+j.categories.map(c=>`<option value=\"${c.id}\">${c.name}</option>`).join('');}\n" +
    "async function loadProducts(){const c=catSel.value;const url=c?API+'/api/products?category='+encodeURIComponent(c):API+'/api/products';const r=await fetch(url);const j=await r.json();grid.innerHTML=j.products.map(p=>`\n" +
    "<div class=\"card\">\n" +
    "<img src=\"${p.image}\" alt=\"${p.name}\" />\n" +
    "<div class=\"name\">${p.name}</div>\n" +
    "<div class=\"price\">$${p.price.toFixed(2)}</div>\n" +
    "<button data-id=\"${p.id}\">Add to Cart</button>\n" +
    "</div>`).join('');Array.from(grid.querySelectorAll('button')).forEach(b=>b.onclick=()=>addToCart(b.dataset.id));}\n" +
    "async function addToCart(id){await fetch(API+'/api/cart',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:sid,productId:id,qty:1})});renderCart();}\n" +
    "async function renderCart(){const r=await fetch(API+'/api/cart?sessionId='+encodeURIComponent(sid));const j=await r.json();cart.innerHTML='<h3>Cart</h3>'+(j.cart||[]).map(i=>`<div>${i.productId} × ${i.qty}</div>`).join('')+`<button id=\"checkout\">Checkout</button>`;const btn=document.getElementById('checkout');if(btn)btn.onclick=checkout;}\n" +
    "async function checkout(){const r=await fetch(API+'/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:sid,address:'N/A'})});const j=await r.json();alert('Order '+j.orderId+' Total $'+j.total.toFixed(2));renderCart();}\n" +
    "catSel.onchange=loadProducts;loadCats().then(loadProducts).then(renderCart);\n";
  const structure: Record<string, string | null> = {};
  structure[`${root}`] = null;
  structure[`${root}/backend`] = null;
  structure[`${root}/backend/package.json`] = JSON.stringify(backendPkg, null, 2) + '\n';
  structure[`${root}/backend/src`] = null;
  structure[`${root}/backend/src/index.js`] = beIndexJs;
  structure[`${root}/frontend`] = null;
  structure[`${root}/frontend/index.html`] = feIndexHtml;
  structure[`${root}/frontend/styles.css`] = feStyles;
  structure[`${root}/frontend/app.js`] = feAppJs;
  return structure;
}

function buildStaticSiteScaffold(root: string) {
  const indexHtml =
    "<!DOCTYPE html>\n" +
    "<html lang=\"en\">\n" +
    "<meta charset=\"UTF-8\" />\n" +
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n" +
    "<title>Website</title>\n" +
    "<link rel=\"stylesheet\" href=\"styles.css\" />\n" +
    "<body>\n" +
    "<header class=\"top\">\n" +
    "<h1>Website</h1>\n" +
    "<nav class=\"nav\">\n" +
    "<a href=\"#features\">Features</a>\n" +
    "<a href=\"#contact\">Contact</a>\n" +
    "</nav>\n" +
    "</header>\n" +
    "<main class=\"container\">\n" +
    "<section class=\"hero\">\n" +
    "<h2>Build fast. Ship faster.</h2>\n" +
    "<p>Minimal landing page scaffold ready for customization.</p>\n" +
    "<button id=\"cta\">Get Started</button>\n" +
    "</section>\n" +
    "<section id=\"features\" class=\"grid\"></section>\n" +
    "<section id=\"contact\" class=\"card\">\n" +
    "<h3>Contact</h3>\n" +
    "<p>Replace this with your contact form or links.</p>\n" +
    "</section>\n" +
    "</main>\n" +
    "<script src=\"app.js\"></script>\n" +
    "</body>\n" +
    "</html>\n";
  const styles =
    "body{font-family:system-ui,Arial,sans-serif;margin:0;background:#0b1220;color:#e5e7eb}\n" +
    ".top{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #1f2937}\n" +
    ".nav a{color:#e5e7eb;margin-left:12px;text-decoration:none;opacity:.85}\n" +
    ".nav a:hover{opacity:1}\n" +
    ".container{max-width:1000px;margin:0 auto;padding:20px}\n" +
    ".hero{padding:24px;border:1px solid #1f2937;border-radius:12px;background:#0f172a}\n" +
    ".hero button{margin-top:12px;padding:10px 14px;border:0;border-radius:10px;background:#22c55e;color:#052e16;font-weight:700;cursor:pointer}\n" +
    ".grid{margin-top:16px;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}\n" +
    ".card{padding:14px;border:1px solid #1f2937;border-radius:12px;background:#0f172a}\n";
  const appJs =
    "const features=[\n" +
    " {t:'Fast scaffold',d:'Start with a clean structure.'},\n" +
    " {t:'Tool-driven',d:'Built via Joe tools step-by-step.'},\n" +
    " {t:'Customizable',d:'Swap content and styles easily.'}\n" +
    "];\n" +
    "const grid=document.getElementById('features');\n" +
    "grid.innerHTML=features.map(f=>`<div class=\"card\"><h3>${f.t}</h3><p>${f.d}</p></div>`).join('');\n" +
    "document.getElementById('cta').onclick=()=>alert('Ready. Customize this scaffold.');\n";
  const structure: Record<string, string | null> = {};
  structure[`${root}`] = null;
  structure[`${root}/index.html`] = indexHtml;
  structure[`${root}/styles.css`] = styles;
  structure[`${root}/app.js`] = appJs;
  return structure;
}

function buildNodeApiScaffold(root: string) {
  const pkg = {
    name: `${root}-api`,
    version: '1.0.0',
    private: true,
    type: 'module',
    scripts: { start: 'node src/index.js' },
    dependencies: { express: '^4.18.2', cors: '^2.8.5' },
  };
  const indexJs =
    "import express from 'express';\n" +
    "import cors from 'cors';\n" +
    "const app=express();\n" +
    "app.use(cors());\n" +
    "app.use(express.json());\n" +
    "app.get('/health',(req,res)=>res.json({ok:true,ts:Date.now()}));\n" +
    "app.get('/api/hello',(req,res)=>res.json({ok:true,message:'hello'}));\n" +
    "const port=process.env.PORT||4000;\n" +
    "app.listen(port,()=>console.log('API listening on http://localhost:'+port));\n";
  const structure: Record<string, string | null> = {};
  structure[`${root}`] = null;
  structure[`${root}/package.json`] = JSON.stringify(pkg, null, 2) + '\n';
  structure[`${root}/src`] = null;
  structure[`${root}/src/index.js`] = indexJs;
  return structure;
}

function buildFullstackScaffold(root: string) {
  const structure: Record<string, string | null> = {};
  structure[`${root}`] = null;
  for (const [k, v] of Object.entries(buildNodeApiScaffold(`${root}/backend`))) structure[k] = v;
  for (const [k, v] of Object.entries(buildStaticSiteScaffold(`${root}/frontend`))) structure[k] = v;
  return structure;
}

function extractRootFromText(raw: string, fallback: string): string {
  const s = String(raw || '');
  const mV = s.match(/\b(vivos)\b/i);
  if (mV && mV[1]) return mV[1].trim();
  
  const mNamed = s.match(/(?:سميه|اسم(?:ه|ها)?|سَمِّه|named|name it|call it)(?:\s+(?:the|a|an))?(?:\s+(?:project|app|api|site))?\s+(?:['"]?)([A-Za-z0-9._-]{1,100})(?:['"]?)/i);
  if (mNamed && mNamed[1]) return mNamed[1].trim();
  
  const mIn = s.match(/(?:in|into|inside|within|داخل)(?:\s+(?:the|a|an))?(?:\s+(?:folder|directory|dir|مجلد))?\s+(?:['"]?)([A-Za-z0-9._-]{1,100})(?:['"]?)/i);
  if (mIn && mIn[1]) return mIn[1].trim();
  
  const mFi = s.match(/(?:في)\s+([A-Za-z0-9._-]{1,100})/i);
  if (mFi && mFi[1]) return mFi[1].trim();
  return fallback;
}

function extractToolSpec(raw: string): { name: string; command: string } | null {
  const s = String(raw || '').trim();
  const mEn = s.match(/create\s+tool\s+([A-Za-z][A-Za-z0-9_-]{1,50})[\s\S]*?(?:runs?|command)\s*[:：]?\s*([^\n]+)$/i);
  if (mEn && mEn[1] && mEn[2]) return { name: mEn[1].trim(), command: mEn[2].trim() };
  const mAr =
    s.match(/(?:انشئ|أنشئ|سوي|سوِّ|قم\s+ب(?:إنشاء|انشاء))\s+(?:اداة|أداة)\s*(?:باسم|اسمها|اسم)\s*([A-Za-z][A-Za-z0-9_-]{1,50})[\s\S]*?(?:ت(?:نفذ|شغل)|تشغل)\s*[:：]?\s*([^\n]+)$/i);
  if (mAr && mAr[1] && mAr[2]) return { name: mAr[1].trim(), command: mAr[2].trim() };
  return null;
}

function isUnsafeShellCommand(cmd: string): boolean {
  const s = String(cmd || '');
  return /(rm\s+-rf|drop\s+table|shutdown|kill\s+process|\bsudo\b)/i.test(s);
}

function detectWorkflow(raw: string): { kind: WorkflowKind; root: string; tool?: { name: string; command: string } } | null {
  const s = String(raw || '');
  if (!s.trim()) return null;
  if (isEcommerceRequest(s)) return { kind: 'ecommerce', root: extractTargetProjectRoot(s) };

  const tool = extractToolSpec(s);
  if (tool) return { kind: 'tool_shell', root: 'api', tool };

  const t = normalizeArabicQuery(s);
  const wantsWebsite = /(website|site|landing|webpage|page)/i.test(s) || /(موقع|صفحه|صفحة|واجهه|واجهة)/.test(t);
  const wantsApi = /(api|backend|server)/i.test(s) || /(باك|خلفي|خلفيه|خلفية|سيرفر|خادم|واجهه\s+برمجه|واجهة\s+برمجه)/.test(t);
  const wantsApp = /(app|application|system)/i.test(s) || /(تطبيق|نظام|منصه|منصة)/.test(t);
  if (!wantsWebsite && !wantsApi && !wantsApp) return null;

  const kind: WorkflowKind =
    wantsWebsite && wantsApi ? 'fullstack' : wantsApi ? 'node_api' : wantsWebsite ? 'static_site' : 'fullstack';
  const root =
    kind === 'static_site'
      ? extractRootFromText(s, 'website')
      : kind === 'node_api'
        ? extractRootFromText(s, 'api-service')
        : extractRootFromText(s, 'app');
  return { kind, root };
}

function repoBaseDirForTools(): string {
  return path.basename(process.cwd()) === 'api' ? '..' : '.';
}

function historyHasToolCall(history: Array<{ role: string; content: any }>, toolName: string): boolean {
  const needle = String(toolName || '').trim().toLowerCase();
  if (!needle) return false;
  return history.some(h => {
    const c = (typeof h?.content === 'string' ? h.content : JSON.stringify(h?.content || '')).toLowerCase();
    return (
      c.includes(`tool call: ${needle}`) ||
      c.includes(`execute:${needle}`) ||
      c.includes(`tool '${needle}' executed`) ||
      c.includes(`tool "${needle}" executed`)
    );
  });
}

function historyHasMarker(history: Array<{ role: string; content: any }>, marker: string): boolean {
  const needle = String(marker || '').trim();
  if (!needle) return false;
  return history.some(h => {
    const c = typeof h?.content === 'string' ? h.content : JSON.stringify(h?.content || '');
    return c.includes(needle);
  });
}

function historyAfterMarker(history: Array<{ role: string; content: any }>, marker: string) {
  const needle = String(marker || '').trim();
  if (!needle) return history;
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    const c = typeof h?.content === 'string' ? h.content : '';
    if (c === needle) return history.slice(i + 1);
  }
  return history;
}

function redactToolInputForStorage(name: string, input: any) {
  if (!input || typeof input !== 'object') return input;

  if (name === 'scaffold_project' && input.structure) {
    const s = input.structure;
    const keys = Object.keys(s);
    const redactedStructure: Record<string, string> = {};
    for (const k of keys) {
      redactedStructure[k] = '[Content Redacted]';
    }
    return { ...input, structure: redactedStructure, _fileCount: keys.length };
  }

  if (name === 'browser_run') {
    const sessionId = typeof (input as any).sessionId === 'string' ? (input as any).sessionId : undefined;
    const actions = Array.isArray((input as any).actions) ? (input as any).actions : [];
    const redactedActions = actions.map((a: any) => {
      const t = String(a?.type || '').toLowerCase();
      if (t === 'type') {
        const text = typeof a?.text === 'string' ? a.text : '';
        return { ...a, text: `[redacted:${text.length}]` };
      }
      if (t === 'fillform') {
        const fields = Array.isArray(a?.fields) ? a.fields : [];
        const nextFields = fields.map((f: any) => {
          const label = String(f?.label || '').toLowerCase();
          const selector = String(f?.selector || '').toLowerCase();
          const combined = `${label} ${selector}`;
          const v = f?.value == null ? '' : String(f.value);
          const shouldRedact =
            Boolean(a?.sensitive) ||
            Boolean(f?.sensitive) ||
            /(password|card|cvv|iban|ssn|بطاقة|دفع|كلمة المرور|حساسية|حساب)/.test(combined);
          if (!shouldRedact) return f;
          return { ...f, value: `[redacted:${v.length}]` };
        });
        return { ...a, fields: nextFields };
      }
      if (t === 'evaluate' && typeof a?.script === 'string') {
        if (a?.sensitive) return { ...a, script: '[redacted]' };
      }
      return a;
    });
    return { sessionId, actions: redactedActions };
  }
  return input;
}

// Connection verification endpoint
router.post('/verify', authenticate as any, async (req: Request, res: Response) => {
  const { provider, apiKey, baseUrl, model } = req.body || {};
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  const providerKey = String(provider || '').trim().toLowerCase();
  
  if (!providerKey || providerKey === 'llm') {
    return res.status(400).json({ error: 'مزود llm المحلي مُعطّل. اختر مزودًا وأدخل API Key.' });
  }
  const hasBaseUrl = typeof baseUrl === 'string' && baseUrl.trim().length > 0;
  if (providerKey && providerKey !== 'openai' && !hasBaseUrl) {
    return res.status(400).json({
      error: `Provider "${providerKey}" requires an OpenAI-compatible Base URL (or select OpenAI).`,
    });
  }

  try {
    // Try a simple planning step
    const result = await planNextStep(
        [{ role: 'user', content: 'hello' }], 
        { provider, apiKey, baseUrl, model, throwOnError: true }
    );
    
    if (result) {
        return res.json({ status: 'ok', message: 'Connected successfully', result });
    } else {
        return res.status(500).json({ error: 'No response from provider' });
    }
  } catch (err: any) {
    const msg = safeErrorMessage(err);
    const hint = msg ? formatProviderConnectHint(msg, provider, model, baseUrl) : '';
    const out = msg && hint ? `${msg}\n${hint}` : (msg || hint || 'Connection failed');
    console.error('Verify error:', msg);

    if (isProviderAuthError(err, msg)) return res.status(401).json({ error: out });
    if (isProviderRateLimitError(err, msg)) return res.status(429).json({ error: out });
    if (isProviderTimeoutError(err, msg)) return res.status(408).json({ error: out });
    return res.status(502).json({ error: out });
  }
});

function detectRisk(text: string) {
  const risky = /(rm\s+-rf|delete|drop\s+table|shutdown|kill\s+process)/i;
  if (risky.test(text)) {
    return 'HIGH: instruction matches destructive pattern';
  }
  return null;
}

function normalizeArabicQuery(input: string) {
  return String(input || '')
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/ـ/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .trim();
}

function containsBuilderPlanText(raw: string): boolean {
  const s = normalizeArabicQuery(raw);
  if (!s) return false;
  if (/خطة\s+بناء\s+موقع/.test(s)) return true;
  if (/plan\s+(to\s+)?build\s+(a\s+)?website/.test(s)) return true;
  if (/سأبدأ\s+الان\s+بالتنفيذ/.test(s) || /سأبدأ\s+الان\s+بالتنفيذ/.test(s)) return true;
  if (/سأبدأ\s+الان/.test(s)) return true;
  return false;
}

function isWeatherLikeQuery(text: string) {
  const t = normalizeArabicQuery(text);
  if (!t) return false;
  if (/(weather|temperature|forecast)/i.test(text)) return true;
  if (/(طقس|درجه|درجة|حراره|الحراره|الجو|الجوّ|الاجواء|توقعات|تنبؤات)/.test(t)) return true;
  if (/كم\s+.*(درجه|درجة|حراره|حرارة)/.test(t)) return true;
  return false;
}

function extractWeatherCity(text: string) {
  const raw = String(text || '').trim();
  const t = normalizeArabicQuery(raw);
  if (!t) return 'Istanbul';

  if (/(istanbul|اسطنبول|اسطنبول|اسطنبول|إسطنبول)/i.test(raw) || /اسطنبول/.test(t)) return 'Istanbul';

  const m1 = raw.match(/(?:في|ب|بال)\s*([^\s؟?!.,،؛:]+(?:\s+[^\s؟?!.,،؛:]+){0,2})/);
  const candidate = m1 ? String(m1[1] || '').trim() : '';
  if (candidate) return candidate;

  return 'Istanbul';
}

router.post('/start', authenticate as any, async (req: Request, res: Response) => {
  let { text, sessionId, fileIds, provider, apiKey, baseUrl, model, sessionKind, browserSessionId, clientContext } = req.body || {};
  const isAuthed = Boolean((req as any).auth);
  const userId = (req as any).auth?.sub;
  const useMock = !isAuthed ? true : (process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1);
  const kind = sessionKind === 'agent' ? 'agent' : 'chat';

  if (typeof provider === 'string') provider = provider.trim();
  if (typeof apiKey === 'string') apiKey = apiKey.trim();
  if (typeof baseUrl === 'string') baseUrl = baseUrl.trim();
  if (typeof model === 'string') model = model.trim();
  if (apiKey === '') apiKey = undefined;
  if (baseUrl === '') baseUrl = undefined;
  if (model === '') model = undefined;

  const providerKey = String(provider || 'openai').trim().toLowerCase();
  const hasBaseUrl = typeof baseUrl === 'string' && baseUrl.trim().length > 0;
  const hasAnyKey = Boolean((typeof apiKey === 'string' && apiKey.trim()) || (typeof process.env.OPENAI_API_KEY === 'string' && process.env.OPENAI_API_KEY.trim()));

  if (providerKey === 'llm') {
    return res.status(400).json({
      error: '⚠️ مزوّد llm المحلي مُعطّل. اختر مزوّدًا من زر المزودين وأدخل API Key.',
    });
  }
  if (!hasAnyKey) {
    return res.status(400).json({
      error: '⚠️ لا يوجد API Key. أدخل مفتاح المزود من زر المزودين قبل التشغيل.',
    });
  }
  if (providerKey && providerKey !== 'openai' && !hasBaseUrl) {
    return res.status(400).json({
      error: `⚠️ المزوّد "${providerKey}" يحتاج Base URL متوافق مع OpenAI (أو اختر OpenAI).`,
    });
  }

  // 1. Process Attachments
  let attachedText = '';
  const contentParts: any[] = [];
  
  if (!useMock && fileIds && Array.isArray(fileIds) && fileIds.length > 0) {
    try {
      const files = await FileModel.find({ _id: { $in: fileIds } });
      for (const f of files) {
        if (f.mimeType && f.mimeType.startsWith('image/')) {
           try {
              if (fs.existsSync(f.path)) {
                  const imageBuffer = fs.readFileSync(f.path);
                  const base64Image = imageBuffer.toString('base64');
                  contentParts.push({
                     type: 'image_url',
                     image_url: {
                        url: `data:${f.mimeType};base64,${base64Image}`
                     }
                  });
              }
           } catch (err) {
              console.error('Failed to read image', err);
           }
        } else if (f.content) {
           attachedText += `\n\n--- [Attached File: ${f.originalName}] ---\n${f.content}\n--- [End of File] ---\n`;
        }
      }
    } catch (e) {
      console.error('Error loading files', e);
    }
  }

  let fullPromptText = (String(text || '') + attachedText).trim();
  const ctxLines: string[] = [];
  if (typeof browserSessionId === 'string' && browserSessionId.trim()) {
    ctxLines.push(`browserSessionId=${browserSessionId.trim()}`);
  }
  if (typeof clientContext === 'string' && clientContext.trim()) {
    ctxLines.push(clientContext.trim());
  }
  if (ctxLines.length > 0) {
    fullPromptText += `\n\n[Client Context]:\n${ctxLines.join('\n')}\n`;
  }

  // Inject Memory
  if (userId && !useMock) {
      try {
        const [relevant, recentItems] = await Promise.all([
          MemoryService.searchMemories(userId, String(text || '')),
          MemoryItem.find({ userId, scope: 'user' }).sort({ updatedAt: -1 }).limit(20).lean(),
        ]);

        const recent = (recentItems || []).map((item: any) => {
          const v =
            typeof item.value === 'string'
              ? item.value
              : item.value == null
                ? ''
                : JSON.stringify(item.value);
          return `${item.key}: ${v}`;
        }).filter(Boolean);

        const merged: string[] = [];
        const seen = new Set<string>();
        for (const line of [...relevant, ...recent]) {
          const k = String(line || '');
          if (!k || seen.has(k)) continue;
          seen.add(k);
          merged.push(k);
          if (merged.length >= 20) break;
        }

        if (merged.length > 0) {
          console.info(`[Memory] Injecting ${merged.length} memories (relevant+recent)`);
          fullPromptText += `\n\n[System Note: Known facts about this user (Memory)]:\n${merged.join('\n')}\n`;
        }
      } catch (e) {
        console.error('[Memory] Search failed', e);
      }
      
      // Fire-and-forget memory extraction
      MemoryService.extractAndSaveMemories(userId, String(text || ''), { provider, apiKey, baseUrl, model, sessionId })
        .catch(err => console.error('[Memory] Extraction failed', err));
  }

  let initialContent: string | any[] = fullPromptText;
  if (contentParts.length > 0) {
      initialContent = [
          { type: 'text', text: fullPromptText },
          ...contentParts
      ];
  }

  if (!sessionId) {
    if (useMock) {
      const s = store.createSession('Untitled Session', 'ADVISOR', kind);
      sessionId = s.id;
    } else {
      const { Session } = await import('../models/session');
      const { Tenant } = await import('../models/tenant');
      const tenantName = process.env.DEFAULT_TENANT_NAME || 'XElite Solutions';
      const tenantDoc = await Tenant.findOneAndUpdate(
        { name: tenantName },
        { $setOnInsert: { name: tenantName } },
        { upsert: true, new: true }
      );
      
      const s = await Session.create({ title: `Session ${new Date().toLocaleString()}`, mode: 'ADVISOR', kind, userId, tenantId: tenantDoc._id });
      sessionId = s._id.toString();
    }
  }

  // Update session with new files if any
  if (!useMock && fileIds && Array.isArray(fileIds)) {
     // Optionally link files to session if not already
     await FileModel.updateMany({ _id: { $in: fileIds } }, { $set: { sessionId } });
  }

  let runId: string;
  if (useMock) {
    const run = store.createRun(sessionId);
    runId = run.id;
  } else {
    const run = await Run.create({ sessionId, status: 'running', steps: [] });
    runId = run._id.toString();

    // Auto-Title Logic
    (async () => {
      try {
        const session = await Session.findById(sessionId);
        if (session && (session.title.startsWith('Session ') || session.title.startsWith('جلسة ') || session.title === 'New Session')) {
          const messageCount = await Message.countDocuments({ sessionId });
          // Only trigger if it's the first or second message
          if (messageCount <= 2) {
            // Get the user message and potential context
            const messages = [{ role: 'user', content: fullPromptText }];
            const newTitle = await generateSessionTitle(messages);
            if (newTitle && newTitle !== 'New Session') {
               await Session.findByIdAndUpdate(sessionId, { title: newTitle });
            }
          }
        }
      } catch (e) {
        console.error('Auto-title background task failed', e);
      }
    })();
  }

  try {
    const { setSessionRunConfig } = await import('../services/secrets');
    setSessionRunConfig(String(sessionId), {
      provider: typeof provider === 'string' ? provider : undefined,
      apiKey: typeof apiKey === 'string' ? apiKey : undefined,
      baseUrl: typeof baseUrl === 'string' ? baseUrl : undefined,
      model: typeof model === 'string' ? model : undefined,
      kind,
      browserSessionId: typeof browserSessionId === 'string' ? browserSessionId : undefined,
    });
  } catch {}

  const systemPromptEventId = `system_prompt:${sessionId}`;
  let systemPromptCreated = false;
  let systemPromptText: string | null = null;

  const ev = (e: LiveEvent) => broadcast({ ...e, runId });

  try {
    const currentSystemPrompt = getSystemPrompt();
    if (useMock) {
      const hist = store.listMessages(sessionId);
      const already = hist.some(m => m.role === 'system');
      if (!already) {
        store.addMessage(sessionId, 'system', currentSystemPrompt, runId);
        systemPromptCreated = true;
        systemPromptText = currentSystemPrompt;
        // System prompt is internal, do not emit to UI
        // ev({ type: 'text', id: systemPromptEventId, data: currentSystemPrompt });
      }
    } else {
      const existing = await Message.findOne({ sessionId, role: 'system' }).select({ _id: 1 }).lean();
      if (!existing) {
        await Message.create({ sessionId, role: 'system', content: currentSystemPrompt, runId });
        systemPromptCreated = true;
        systemPromptText = currentSystemPrompt;
        // System prompt is internal, do not emit to UI
        // ev({ type: 'text', id: systemPromptEventId, data: currentSystemPrompt });
      }
    }
  } catch (e) {
    console.warn('Failed to create system prompt message:', safeErrorMessage(e));
  }

  // Load Conversation History
  let previousMessages: { role: 'user' | 'assistant' | 'system', content: string }[] = [];
  if (sessionId) {
       if (useMock) {
           const hist = store.listMessages(sessionId);
           // Exclude the current message we just added (if any logic added it already? Line 335 adds it)
           // Store adds it to memory. We want all *previous* interactions.
           // Store.listMessages returns all. 
           // We filter out current run messages to avoid duplication with 'initialContent' which is added to history array manually.
           // And we take the last 50 to ensure context retention.
           previousMessages = hist.filter(m => m.runId !== runId && m.role !== 'system').slice(-50).map(m => ({ role: m.role as any, content: m.content }));
       } else {
           const docs = await Message.find({ sessionId, runId: { $ne: runId }, role: { $ne: 'system' } })
               .sort({ createdAt: -1 }) // Get newest first
               .limit(50); // Last 50 messages
           // Reverse to chronological order (Old -> New)
           previousMessages = docs.reverse().map(d => ({ role: d.role as any, content: d.content }));
       }
   }

  // Merge consecutive user messages to avoid context fragmentation
  // And limit total history size to prevent slow LLM responses
  const MAX_HISTORY_CHARS = 15000; // Approx 4-5k tokens
  let mergedHistory: typeof previousMessages = [];
  
  for (const msg of previousMessages) {
      const last = mergedHistory[mergedHistory.length - 1];
      if (last && last.role === 'user' && msg.role === 'user') {
          last.content += `\n\n[Follow-up]: ${msg.content}`;
      } else {
          mergedHistory.push(msg);
      }
  }

  // Truncate history if too long, keeping the most recent messages
  let totalChars = 0;
  const truncatedHistory: typeof mergedHistory = [];
  for (let i = mergedHistory.length - 1; i >= 0; i--) {
      const msg = mergedHistory[i];
      const contentLen = typeof msg.content === 'string' ? msg.content.length : JSON.stringify(msg.content).length;
      if (totalChars + contentLen > MAX_HISTORY_CHARS) {
          break;
      }
      totalChars += contentLen;
      truncatedHistory.unshift(msg);
  }
  mergedHistory = truncatedHistory;

  const history: { role: 'user' | 'assistant' | 'system', content: string | any[] }[] = [
    ...mergedHistory,
    { role: 'user', content: initialContent }
  ];

  ev({ type: 'step_started', data: { name: 'plan' } });

  let initialPlan = null;
  try {
      const rawUserText = String(text || '');
      const hasAttachments = Boolean(attachedText.trim()) || contentParts.length > 0;
      if (isGreetingOnly(rawUserText) && !hasAttachments) {
        initialPlan = { name: 'echo', input: { text: greetingReply(rawUserText) } };
      } else {
        // Use full history for planning to ensure context awareness
        initialPlan = await planNextStep(
          history,
          { provider, apiKey, baseUrl, model, throwOnError: true }
        );
      }
  } catch (err) {
      console.warn('LLM planning error:', safeErrorMessage(err));
  }

  ev({ type: 'step_done', data: { name: 'plan', plan: initialPlan } });
  if (useMock) {
    store.addStep(runId, 'plan', 'done');
  } else {
    try {
      await Run.findByIdAndUpdate(runId, { $push: { steps: { name: 'plan', status: 'done' } } });
    } catch {}
  }

  // Save User Message to DB
  const persistedUserText = redactSecretsFromString(String(text || ''));
  if (useMock) {
    store.addMessage(sessionId, 'user', persistedUserText, runId);
  } else {
    await Message.create({ sessionId, role: 'user', content: persistedUserText, runId });
  }

  const risk = detectRisk(String(text || ''));
  if (risk && initialPlan) {
    if (useMock) {
      const ap = store.createApproval(runId, String(text || ''), risk, initialPlan.name, initialPlan.input);
      ev({ type: 'approval_required', data: { id: ap.id, runId, risk, action: text } });
      store.updateRun(runId, { status: 'blocked' });
      // store plan context for continuation
      const { planContext } = await import('../approvals/context');
      planContext.set(ap.id, { runId, name: initialPlan.name, input: initialPlan.input });
      const auto = process.env.AUTO_APPROVE_SAFE === '1';
      const safe = !/HIGH|CRITICAL/i.test(String(risk));
      if (auto && safe) {
        ev({ type: 'step_started', data: { name: `execute:${initialPlan.name}`, input: redactToolInputForStorage(initialPlan.name, initialPlan.input) } });
        const result = await executeTool(initialPlan.name, initialPlan.input);
        ev({ type: result.ok ? 'step_done' : 'step_failed', data: { name: `execute:${initialPlan.name}`, result } });
        if (result.artifacts) {
          for (const a of result.artifacts) {
            store.addArtifact(runId, a.name, a.href);
            ev({ type: 'artifact_created', data: { name: a.name, href: a.href } });
          }
        }
        store.updateRun(runId, { status: result.ok ? 'done' : 'failed' });
        ev({ type: 'run_finished', data: { runId, ok: result.ok } });
        planContext.delete(ap.id);
        return res.json({ ok: true, runId, result });
      }
      return res.json({ runId, sessionId, blocked: true, approvalId: ap.id, ...(systemPromptCreated ? { systemPrompt: systemPromptText, systemPromptId: systemPromptEventId } : {}) });
    } else {
      const ap = await Approval.create({ runId, action: String(text || ''), risk, status: 'pending' });
      ev({ type: 'approval_required', data: { id: ap._id.toString(), runId, risk, action: text } });
      await Run.findByIdAndUpdate(runId, { $set: { status: 'blocked' } });
      const { planContext } = await import('../approvals/context');
      planContext.set(ap._id.toString(), { runId, name: initialPlan.name, input: initialPlan.input });
      const auto = process.env.AUTO_APPROVE_SAFE === '1';
      const safe = !/HIGH|CRITICAL/i.test(String(risk));
      if (auto && safe) {
        ev({ type: 'step_started', data: { name: `execute:${initialPlan.name}`, input: redactToolInputForStorage(initialPlan.name, initialPlan.input) } });
        const result = await executeTool(initialPlan.name, initialPlan.input);
        ev({ type: result.ok ? 'step_done' : 'step_failed', data: { name: `execute:${initialPlan.name}`, result } });
        if (result.artifacts) {
          // Persist artifacts in DB using Artifact model if needed
        }
        await Run.findByIdAndUpdate(runId, { $set: { status: result.ok ? 'done' : 'failed' } });
        ev({ type: 'run_finished', data: { runId, ok: result.ok } });
        planContext.delete(ap._id.toString());
        return res.json({ ok: true, runId, result });
      }
      return res.json({ runId, sessionId, blocked: true, approvalId: ap._id.toString(), ...(systemPromptCreated ? { systemPrompt: systemPromptText, systemPromptId: systemPromptEventId } : {}) });
    }
  }

  // --- Agent Loop ---
  let steps = 0;
  const MAX_STEPS = 50;
  
  // History already loaded above

  // Track executed tools to prevent loops
  const executedTools = new Set<string>();
  const executedToolSigs = new Set<string>();
  let consecutiveThoughtSteps = 0;
  let thoughtLoopPauseEmitted = false;
  let postScaffoldScheduled = false;
  let postInstallScheduled = false;

  let lastResult: any = null;
  let forcedText: string | null = null;
  let assistantTextEmitted = false;
  let plan: { name: string, input: any } | null = null;
  let pendingPlan: { name: string, input: any } | null = null;
  let lastPlanError: string | null = null;

  while (steps < MAX_STEPS) {
    ev({ type: 'step_started', data: { name: `thinking_step_${steps + 1}` } });
    
    // Optimization: Reuse initial plan if available for the first step to reduce latency
    if (pendingPlan) {
        plan = pendingPlan;
        pendingPlan = null;
    } else if (steps === 0 && initialPlan) {
        plan = initialPlan;
        initialPlan = null; // Prevent reuse
    } else {
        // Plan next step with history
        try {
            plan = await planNextStep(history, { provider, apiKey, baseUrl, model, throwOnError: true });
        } catch (err: any) {
            lastPlanError = safeErrorMessage(err);
            const status = errorStatusCode(err);
            console.warn(`LLM planning error (status=${status}):`, lastPlanError);
            
            if (isProviderAuthError(err, lastPlanError)) {
              const msg = '⚠️ **Authentication Failed**\nThe AI provider rejected the API key. Please verify the key and provider endpoint in the settings.';
              ev({ type: 'text', data: msg });
              forcedText = msg;
              assistantTextEmitted = true;
              break;
            }
            if (isProviderConfigError(err, lastPlanError)) {
               const msg = `⚠️ **Configuration Error**\nThe AI provider returned an error (Status: ${status}). This usually means the Model Name is invalid or not available for your API Key.\nDetails: ${lastPlanError}`;
               ev({ type: 'text', data: msg });
               forcedText = msg;
               assistantTextEmitted = true;
               break;
            }
            if (!plan) plan = null;
        }
    }

    if (!plan) {
      const hint = lastPlanError ? formatProviderConnectHint(lastPlanError, provider, model, baseUrl) : '';
      const extra = lastPlanError ? `\n\nDetails: ${lastPlanError}${hint ? `\n${hint}` : ''}` : '';
      const msg = lastPlanError && isProviderAuthError(null, lastPlanError)
        ? `⚠️ فشل التحقق من المفتاح\nالمزوّد رفض الـ API Key. تحقق من المفتاح وإعدادات المزود.${extra}`
        : `⚠️ تعذّر التخطيط للخطوة التالية عبر المزود.\nتحقق من المزوّد/الموديل/الـ Base URL ثم أعد المحاولة.${extra}`;
      ev({ type: 'text', data: msg });
      forcedText = msg;
      assistantTextEmitted = true;
      break;
    }
    
    let planName = String(plan?.name || '');
    
    // Safety: Prevent infinite loops of same tool execution
    if (['project_detect', 'scaffold_project', 'npm_install', 'npm_build', 'analyze_codebase'].includes(planName)) {
        const sig = `${planName}:${JSON.stringify((plan as any)?.input || {})}`;
        if (executedToolSigs.has(sig)) {
             console.log(`[Safety] Skipping repeated execution of ${planName}`);
             plan = {
                 name: 'echo',
                 input: { text: `(System) Skipped repeated step: ${planName}. Moving to next step.` }
             } as any;
             planName = 'echo';
        } else {
            executedToolSigs.add(sig);
        }
    }
    
    // Safety: Prevent infinite thought loops
    if (planName === 'echo' || !planName) {
        consecutiveThoughtSteps++;
        if (consecutiveThoughtSteps > 3) {
             if (!thoughtLoopPauseEmitted) {
                 const needsKey = !process.env.OPENAI_API_KEY && !apiKey;
                 const hint = lastPlanError ? formatProviderConnectHint(lastPlanError, provider, model, baseUrl) : '';
                 const providerLabel = String(providerKey || 'llm').trim() || 'llm';
                 const modelLabel = typeof model === 'string' && model.trim() ? model.trim() : '';
                 const keyLabel = apiKey ? 'موجود' : (process.env.OPENAI_API_KEY ? 'موجود (System)' : 'غير موجود');
                 const baseHost = hostFromUrlMaybe(baseUrl);
                 const msg = [
                   `⚠️ تم إيقاف التنفيذ مؤقتًا: النظام عالق في حلقة تفكير.`,
                   `- المزوّد: ${providerLabel}${modelLabel ? ` / ${modelLabel}` : ''}${baseHost ? ` / ${baseHost}` : ''}`,
                   `- المفتاح: ${keyLabel}`,
                   needsKey ? `- فعّل مزوّد ذكاء (OpenAI/Anthropic) وأضف API Key من الإعدادات.` : `- جرّب إعادة صياغة الطلب أو أعطني تفاصيل إضافية.`,
                   hint ? `${hint}` : ``,
                 ].filter(Boolean).join('\n');
                 forcedText = msg;
                 const now = Date.now();
                 const last = loopPauseThrottle.get(String(sessionId));
                 if (!last || now - last > 6000) {
                     ev({ type: 'text', data: msg });
                     assistantTextEmitted = true;
                     loopPauseThrottle.set(String(sessionId), now);
                 }
                 thoughtLoopPauseEmitted = true;
             }
             break;
        }
    } else {
        consecutiveThoughtSteps = 0;
        executedTools.add(planName);
    }

    const isBrowserTool = /^browser_/.test(planName);
    const userTextForOverrides = String(text || '');
    const userTextNorm = normalizeArabicQuery(userTextForOverrides);
    const requestedRepoName = extractRequestedRepoName(userTextForOverrides);
    const wantsGithubRepo =
      /(github|جيت\s*هاب|جيتهاب|كتهاب|كيتهاب)/i.test(userTextForOverrides) &&
      /(repo|repository|ريبو|مستودع)/i.test(userTextForOverrides) &&
      /(create|new|انش(?:ئ|ي)|أنشئ|انشاء|إنشاء)/i.test(userTextForOverrides);
    if (wantsGithubRepo) {
      if (requestedRepoName) {
        plan = {
          name: 'github_create_repo',
          input: {
            name: requestedRepoName,
            private: /(private|خاص)/i.test(userTextForOverrides),
            sessionId: String(sessionId),
          },
        } as any;
      }
    }
    // Special: List tools command
    const wantsToolsList =
      /(list\s+tools|tools\s+list|show\s+tools)/i.test(userTextForOverrides) ||
      /(سرد|عرض|قائمه|قائمة)\s+الادوات/.test(userTextNorm);
    if (wantsToolsList && (!planName || planName === 'echo')) {
      const base = `${req.protocol}://${req.get('host')}`;
      plan = { name: 'http_fetch', input: { url: `${base}/tools` } } as any;
      planName = 'http_fetch';
    }
    // Quick actions: files and code
    const wantsListFiles =
      /\bls\b/i.test(userTextForOverrides) ||
      /(عرض|اظهر|اعرض)\s+(الملفات|مجلد|مجلدات)/.test(userTextNorm) ||
      /(list\s+files|show\s+files)/i.test(userTextForOverrides);
    if (wantsListFiles && (!planName || planName === 'echo')) {
      plan = { name: 'ls', input: { path: '.' } } as any;
      planName = 'ls';
    }
    const wantsFileTree =
      /(هيكل|شجره|شجرة|بنيه|structure|tree)/.test(userTextNorm) &&
      /(المشروع|الملفات|code|files)/.test(userTextNorm);
    if (wantsFileTree && (!planName || planName === 'echo')) {
      plan = { name: 'read_file_tree', input: { path: '.', depth: 3 } } as any;
      planName = 'read_file_tree';
    }
    const readFileMatch = userTextForOverrides.match(/(?:read\s+file|اقرأ\s+ملف)\s+([^\s'"]+)/i);
    if (readFileMatch && (!planName || planName === 'echo')) {
      const filename = readFileMatch[1];
      plan = { name: 'file_read', input: { filename } } as any;
      planName = 'file_read';
    }
    const grepMatchAr = userTextNorm.match(/ابحث\s+في\s+الكود\s+عن\s+(.+)/);
    const grepMatchEn = userTextForOverrides.match(/(?:grep|search\s+code\s+for)\s+(.+)/i);
    const grepQuery = (grepMatchAr && grepMatchAr[1]) || (grepMatchEn && grepMatchEn[1]);
    if (grepQuery && (!planName || planName === 'echo')) {
      plan = { name: 'grep_search', input: { query: String(grepQuery).trim(), path: '.' } } as any;
      planName = 'grep_search';
    }
    const wantsShop = isEcommerceRequest(userTextForOverrides);
      if (wantsShop) {
        // Extract project name if provided, else default
        const nameMatch = userTextForOverrides.match(/(?:named|called|اسم|اسمه)\s+([a-zA-Z0-9_-]+)/i);
        const projName = nameMatch ? nameMatch[1] : 'vivos-store';

        if (steps === 0 && !historyHasMarker(history as any, 'ECOMMERCE_PLAN_EMITTED')) {
          // Silent execution - no text emitted to chat
          // ev({ type: 'text', data: md }); 
          history.push({ role: 'assistant', content: 'ECOMMERCE_PLAN_EMITTED' } as any);
          try {
            if (useMock) {
              store.addMessage(sessionId, 'assistant', 'ECOMMERCE_PLAN_EMITTED', runId);
            } else {
              await Message.create({ sessionId, role: 'assistant', content: 'ECOMMERCE_PLAN_EMITTED', runId });
            }
          } catch {}
          
          // Force the smart tool
          plan = { 
              name: 'scaffold_full_stack', 
              input: { 
                  name: projName, 
                type: 'ecommerce',
                features: ['auth', 'products', 'cart'] // Smart default features
            } 
        } as any;
        planName = 'scaffold_full_stack';
        pendingPlan = plan; // ensure immediate execution on first loop
      }
      
      // Force execution even if AI tries to think
      if (planName === 'echo' || !planName) {
          // If we haven't scaffolded yet (and steps > 0), maybe AI missed it?
          // But if steps=0 we forced it above.
          // If steps > 0, we assume scaffolding is done.
      }
    }

    const wantsWeather = isWeatherLikeQuery(userTextForOverrides);
    if (wantsWeather && (!planName || planName === 'echo')) {
      const city = extractWeatherCity(userTextForOverrides);
      const q = isArabicText(userTextForOverrides)
        ? `كم درجة الحرارة الآن في ${city}؟`
        : `current temperature in ${city} now`;
      plan = { name: 'central_answer', input: { question: q } } as any;
      planName = 'central_answer';
    }

    const wf = !wantsShop ? detectWorkflow(userTextForOverrides) : null;
    if (wf && wf.kind !== 'ecommerce' && (!planName || planName === 'echo')) {
      const marker =
        wf.kind === 'tool_shell' && wf.tool
          ? `WF_START:${wf.kind}:${wf.tool.name}`
          : `WF_START:${wf.kind}:${wf.root}`;

      const alreadyExecuted =
        historyHasToolCall(history as any, 'project_detect') ||
        historyHasToolCall(history as any, 'scaffold_project') ||
        historyHasToolCall(history as any, 'analyze_codebase');

      if (steps === 0 && !historyHasMarker(history as any, marker) && !alreadyExecuted) {
        const title =
          wf.kind === 'tool_shell'
            ? `### خطة إنشاء أداة (Shell Tool)`
            : wf.kind === 'static_site'
              ? `### خطة بناء موقع (Static Website)`
              : wf.kind === 'node_api'
                ? `### خطة بناء API (Node/Express)`
                : `### خطة بناء تطبيق (Fullstack)`;
        const stepList =
          wf.kind === 'tool_shell'
            ? [
                `- 1) project_detect: فحص المشروع والمسارات`,
                `- 2) command_policy_check: فحص أمان الأمر`,
                `- 3) tool_create_shell: إنشاء الأداة داخل المصنع (Runtime)`,
                `- 4) quality_run: تشغيل lint للتأكد`,
                `- 5) echo: إنهاء`,
              ]
            : [
                `- 1) project_detect: فحص هيكل المشروع والمسارات`,
                `- 2) analyze_codebase: تحليل سريع للمجلدات والمشاريع`,
                `- 3) scaffold_project: إنشاء هيكل المشروع`,
                wf.kind === 'static_site' ? `- 4) echo: إنهاء` : `- 4) npm_install: تثبيت الاعتمادات`,
                wf.kind === 'static_site' ? `- 5) echo: إنهاء` : `- 5) quality_run: lint/test/build إن وجدت`,
              ];

        const contextLine =
          wf.kind === 'tool_shell' && wf.tool
            ? `- الاسم: ${wf.tool.name}\n- الأمر: ${wf.tool.command}`
            : `- المجلد: ${wf.root}`;

      const md = [title, contextLine, ...stepList, ``, `سأبدأ الآن بالتنفيذ باستخدام الأدوات.`].join('\n');
      if (!containsBuilderPlanText(userTextForOverrides)) {
        ev({ type: 'text', data: md });
      }
      history.push({ role: 'assistant', content: marker } as any);
      try {
        if (useMock) {
          store.addMessage(sessionId, 'assistant', marker, runId);
        } else {
          await Message.create({ sessionId, role: 'assistant', content: marker, runId });
        }
      } catch {}
      
      // Inject directive for the AI
      history.push({ 
        role: 'system', 
        content: `BUILD DIRECTIVE: You are executing a workflow (${wf.kind}).
          Follow the plan shown above. Check history for completed steps.
          For scaffolding, use structure: {} and the system will inject the template.`
        } as any);
      }
      
      // Builder Mode: Start execution if the planner returned echo or empty
      if (!planName || planName === 'echo') {
        const textLower = userTextForOverrides.toLowerCase();
        
        // Handle "Access/Open GitHub" or generic website access requests
        const wantsAccess = /(ادخل|افتح|access|open|browse|visit|go to)\s+(الى\s+)?(github|جيت\s*هاب|جيتهاب|كتهاب)/i.test(userTextForOverrides);
        if (wantsAccess) {
             plan = { name: 'browser_open', input: { url: 'https://github.com' } } as any;
             planName = 'browser_open';
        } else if (/(ادخل|افتح|access|open|browse|visit|go to)\s+(الى\s+)?(google|جوجل)/i.test(userTextForOverrides)) {
             plan = { name: 'browser_open', input: { url: 'https://www.google.com' } } as any;
             planName = 'browser_open';
        } else if (/(ادخل|افتح|access|open|browse|visit|go to)\s+(الى\s+)?(youtube|يوتيوب)/i.test(userTextForOverrides)) {
             plan = { name: 'browser_open', input: { url: 'https://www.youtube.com' } } as any;
             planName = 'browser_open';
        } else if (/(list|سرد|قائمة)\s*(tools|الأدوات|الادوات)/i.test(userTextForOverrides)) {
             plan = { name: 'http_fetch', input: { url: 'http://localhost:' + (process.env.PORT || 4000) + '/tools' } } as any;
             planName = 'http_fetch';
        } else if (/(show|list|عرض|اعرض)\s*(files|الملفات)/i.test(userTextForOverrides) || /^ls$/.test(textLower)) {
             plan = { name: 'ls', input: { path: '.' } } as any;
             planName = 'ls';
        } else if (/(project|file)\s*(structure|tree|هيكل|شجرة)/i.test(userTextForOverrides)) {
             plan = { name: 'read_file_tree', input: { path: '.', depth: 3 } } as any;
             planName = 'read_file_tree';
        } else if (/(read|اقرأ|قراءة)\s*(file|ملف)\s+(.+)/i.test(userTextForOverrides)) {
             const m = userTextForOverrides.match(/(read|اقرأ|قراءة)\s*(file|ملف)\s+(.+)/i);
             if (m && m[3]) {
                 plan = { name: 'file_read', input: { filePath: m[3].trim() } } as any;
                 planName = 'file_read';
             }
        } else if (/(search|find|grep|ابحث|بحث)\s*(in code|code|الكود|في الكود)?\s*(for|عن)?\s*(.+)/i.test(userTextForOverrides)) {
             const m = userTextForOverrides.match(/(search|find|grep|ابحث|بحث)\s*(in code|code|الكود|في الكود)?\s*(for|عن)?\s*(.+)/i);
             if (m && m[4]) {
                 plan = { name: 'grep_search', input: { pattern: m[4].trim(), path: '.' } } as any;
                 planName = 'grep_search';
             }
        } else {
             plan = { name: 'project_detect', input: { path: '.' } } as any;
             planName = 'project_detect';
        }
      }
    }

    if (String(plan?.name || '') === 'github_create_repo') {
      const wantsAccess = /(ادخل|افتح|access|open|browse|visit|go to)\s+(الى\s+)?(github|جيت\s*هاب|جيتهاب|كتهاب)/i.test(userTextForOverrides);
      if (wantsAccess) {
         plan = { name: 'browser_open', input: { url: 'https://github.com' } } as any;
    } else if (!wantsGithubRepo && (!planName || planName === 'echo')) {
        plan = { name: 'echo', input: { text: isArabicText(userTextForOverrides) ? 'أقدر أساعدك. ماذا تريد أن أفعل؟' : 'How can I help?' } } as any;
    } else if (!requestedRepoName) {
        plan = { name: 'echo', input: { text: isArabicText(userTextForOverrides) ? 'أكيد. ما اسم المستودع الذي تريد إنشاؤه على GitHub؟' : 'Sure — what should the new GitHub repository be named?' } } as any;
    }
    }
    if (isBrowserTool) {
      const reqSid = typeof browserSessionId === 'string' ? browserSessionId.trim() : '';
      const inputSid = String((plan as any)?.input?.sessionId || '').trim();
      const hasSid = !!(reqSid || inputSid);
      if (!hasSid) {
        const userText = String(text || '');
        if (isWeatherLikeQuery(userText)) {
          const city = extractWeatherCity(userText);
          plan = {
            name: 'central_answer',
            input: { question: isArabicText(userText) ? `كم درجة الحرارة الآن في ${city}؟` : `current temperature in ${city} now` },
          } as any;
        } else {
          const urlMatch = userText.match(/https?:\/\/[^\s"'<>]+/i);
          const urlFromUser = urlMatch?.[0];
          const urlFromInput = String((plan as any)?.input?.url || '').trim();
          const actions = Array.isArray((plan as any)?.input?.actions) ? (plan as any).input.actions : [];
          const goto = actions.find((a: any) => String(a?.type || '').toLowerCase() === 'goto' && typeof a?.url === 'string' && a.url.trim());
          const urlFromActions = goto ? String(goto.url).trim() : '';
          const wantsYoutube = /youtube|يوتيوب/i.test(userText);
          const wantsGithub = /(github|جيتهاب|كتهاب|كيتهاب)/i.test(userText);
          const desiredUrl =
            (urlFromUser || urlFromInput || urlFromActions || '').trim() ||
            (wantsYoutube ? 'https://www.youtube.com' : wantsGithub ? 'https://github.com' : 'https://www.google.com');

          if (planName !== 'browser_open') pendingPlan = plan as any;
          plan = { name: 'browser_open', input: { url: desiredUrl } } as any;
        }
      }
    }

    if (kind === 'agent' && String(plan?.name || '') === 'browser_open' && typeof browserSessionId === 'string' && browserSessionId.trim()) {
      const url = String((plan as any)?.input?.url || 'https://www.google.com').trim() || 'https://www.google.com';
      plan = {
        name: 'browser_run',
        input: {
          sessionId: browserSessionId.trim(),
          actions: [{ type: 'goto', url, waitUntil: 'domcontentloaded' }],
        },
      } as any;
    }

    if (
      typeof browserSessionId === 'string' &&
      browserSessionId.trim() &&
      ['browser_run', 'browser_get_state', 'browser_extract'].includes(String(plan?.name || ''))
    ) {
      const input = (plan as any).input;
      if (!input || typeof input !== 'object') (plan as any).input = {};
      if (!(plan as any).input.sessionId) (plan as any).input.sessionId = browserSessionId.trim();
    }

    ev({ type: 'step_done', data: { name: `thinking_step_${steps + 1}`, plan } });

    if (plan?.name === 'browser_run') {
      const acts = Array.isArray((plan as any).input?.actions) ? (plan as any).input.actions : [];
      let sensitive = false;
      let actionText = 'browser_run';
      for (const a of acts) {
        const t = String(a?.type || '').toLowerCase();
        if (t === 'uploadfile') sensitive = true;
        if (t === 'fillform') {
          const fields = Array.isArray(a?.fields) ? a.fields : [];
          for (const f of fields) {
            const s = (String(f?.label || '') + ' ' + String(f?.selector || '')).toLowerCase();
            if (/(password|card|cvv|iban|ssn|بطاقة|دفع|كلمة المرور|حساسية|حساب)/.test(s)) { sensitive = true; break; }
          }
        }
        if (t === 'click') {
          const s = (String(a?.roleName || '') + ' ' + String(a?.selector || '')).toLowerCase();
          if (/(delete|pay|submit|login|حذف|دفع|ارسال|تسجيل دخول)/.test(s)) sensitive = true;
        }
        if (sensitive) break;
      }
      if (sensitive) {
        const risk = 'high';
        if (useMock) {
          const ap = store.createApproval(runId, actionText, risk, plan?.name || '', redactToolInputForStorage(plan?.name || '', plan?.input));
          ev({ type: 'approval_required', data: { id: ap.id, runId, risk, action: actionText } });
          store.updateRun(runId, { status: 'blocked' });
          const { planContext } = await import('../approvals/context');
          planContext.set(ap.id, { runId, name: plan?.name || '', input: plan?.input });
          const auto = process.env.AUTO_APPROVE_SAFE === '1';
          const safe = !/HIGH|CRITICAL/i.test(String(risk));
          if (auto && safe) {
            ev({ type: 'step_started', data: { name: `execute:${plan?.name}`, input: redactToolInputForStorage(plan?.name || '', plan?.input) } });
            const result = await executeTool(plan?.name || '', plan?.input);
            ev({ type: result.ok ? 'step_done' : 'step_failed', data: { name: `execute:${plan?.name}`, result } });
            if (result.artifacts) {
              for (const a of result.artifacts) {
                store.addArtifact(runId, a.name, a.href);
                ev({ type: 'artifact_created', data: { name: a.name, href: a.href } });
              }
            }
            store.updateRun(runId, { status: result.ok ? 'done' : 'failed' });
            ev({ type: 'run_finished', data: { runId, ok: result.ok } });
            planContext.delete(ap.id);
            return res.json({ ok: true, runId, result });
          }
          return res.json({ runId, blocked: true, approvalId: ap.id });
        } else {
          const ap = await Approval.create({ runId, action: actionText, risk, status: 'pending' });
          ev({ type: 'approval_required', data: { id: ap._id.toString(), runId, risk, action: actionText } });
          await Run.findByIdAndUpdate(runId, { $set: { status: 'blocked' } });
          const { planContext } = await import('../approvals/context');
          planContext.set(ap._id.toString(), { runId, name: plan?.name || '', input: plan?.input });
          const auto = process.env.AUTO_APPROVE_SAFE === '1';
          const safe = !/HIGH|CRITICAL/i.test(String(risk));
          if (auto && safe) {
            ev({ type: 'step_started', data: { name: `execute:${plan?.name}`, input: redactToolInputForStorage(plan?.name || '', plan?.input) } });
            const result = await executeTool(plan?.name || '', plan?.input);
            ev({ type: result.ok ? 'step_done' : 'step_failed', data: { name: `execute:${plan?.name}`, result } });
            await Run.findByIdAndUpdate(runId, { $set: { status: result.ok ? 'done' : 'failed' } });
            ev({ type: 'run_finished', data: { runId, ok: result.ok } });
            planContext.delete(ap._id.toString());
            return res.json({ ok: true, runId, result });
          }
          return res.json({ runId, blocked: true, approvalId: ap._id.toString() });
        }
      }
    }

    if (String(plan?.name || '') === 'git_ops') {
      const input = (plan as any).input;
      if (!input || typeof input !== 'object') (plan as any).input = {};
      if (!(plan as any).input.sessionId) (plan as any).input.sessionId = String(sessionId);
    }
    if (String(plan?.name || '') === 'http_fetch') {
      const input = (plan as any).input;
      if (!input || typeof input !== 'object') (plan as any).input = {};
      if (!(plan as any).input.sessionId) (plan as any).input.sessionId = String(sessionId);
    }

    // Intercept scaffold_project to inject templates if structure is missing/empty
    if (plan?.name === 'scaffold_project') {
       const inp = (plan.input as any) || {};
       if (!inp.structure || Object.keys(inp.structure).length === 0) {
           const root = extractTargetProjectRoot(userTextForOverrides) || '.';
           const baseDir = repoBaseDirForTools();
           if (wantsShop) {
               (plan as any).input = { structure: buildEcommerceScaffold(root), baseDir };
               ev({ type: 'text', data: `ℹ️ Injecting E-Commerce scaffold template into empty scaffold_project call.` });
           } else if (wf) {
               const structure = wf.kind === 'static_site' ? buildStaticSiteScaffold(wf.root) :
                                 wf.kind === 'node_api' ? buildNodeApiScaffold(wf.root) :
                                 wf.kind === 'fullstack' ? buildFullstackScaffold(wf.root) : {};
               if (Object.keys(structure).length > 0) {
                   (plan as any).input = { structure, baseDir };
                   ev({ type: 'text', data: `ℹ️ Injecting ${wf.kind} scaffold template into empty scaffold_project call.` });
               }
           }
       }
    }

    const persistedInput = redactToolInputForStorage(plan?.name || '', plan?.input);
    ev({ type: 'step_started', data: { name: `execute:${plan?.name}`, input: persistedInput } });
    const callInput =
      userId && plan?.input && typeof plan.input === 'object' ? { ...(plan.input as any), userId: String(userId) } : plan?.input;
    const result = await executeTool(plan?.name || '', callInput);
    if (result?.ok && plan?.name === 'browser_open') {
      const sid = String(result?.output?.sessionId || '').trim();
      if (sid) browserSessionId = sid;
    }
    
    // Add result to history to prevent infinite loops
    const safeOutput = (obj: any) => {
        try { return JSON.stringify(obj); } catch { return '"[Result too large or circular]"'; }
    };

    history.push({ 
        role: 'assistant', 
        content: `Tool Call: ${plan?.name}\nInput: ${safeOutput(persistedInput)}\nOutput: ${safeOutput(result.output || result.error || 'Done')}` 
    });

    lastResult = result;

    if (result.logs?.length) {
      for (const line of result.logs) {
        ev({ type: 'evidence_added', data: { kind: 'log', text: line } });
      }
    }
    
    // Emit artifacts if any
    if (result.artifacts && Array.isArray(result.artifacts)) {
      for (const art of result.artifacts) {
        ev({ type: 'artifact_created', data: art });
        if (useMock) {
          try { store.addArtifact(runId, String(art.name || 'artifact'), String(art.href || '')); } catch {}
        } else {
          try { await Artifact.create({ runId, name: String(art.name || 'artifact'), href: String(art.href || '') }); } catch {}
        }
      }
    }

    ev({ type: result.ok ? 'step_done' : 'step_failed', data: { name: `execute:${plan?.name}`, result } });
    // After browser actions, capture page state for accurate reading/sync
    if (result.ok && (String(plan?.name || '') === 'browser_open' || String(plan?.name || '') === 'browser_run')) {
      const sidNext = typeof browserSessionId === 'string' ? browserSessionId.trim() : '';
      if (sidNext) pendingPlan = { name: 'browser_get_state', input: { sessionId: sidNext } } as any;
    }
    // Auto post-scaffold steps: install and build
    if (result.ok && String(plan?.name || '') === 'scaffold_full_stack') {
      const rootCreated = String((result as any)?.output?.path || '').trim();
      if (rootCreated && !postScaffoldScheduled) {
        pendingPlan = { name: 'npm_install', input: { cwd: rootCreated } } as any;
        postScaffoldScheduled = true;
      }
    } else if (result.ok && String(plan?.name || '') === 'npm_install') {
      const cwd = String((plan as any)?.input?.cwd || '').trim();
      if (cwd && !postInstallScheduled) {
        pendingPlan = { name: 'npm_build', input: { cwd } } as any;
        postInstallScheduled = true;
      }
    }
    
    // Stop on fatal errors (403, verification, etc.)
    if (!result.ok && plan?.name === 'image_generate') {
       const errorMsg = String(result.error || '');
       const logsStr = (result.logs || []).join('\n');
       if (errorMsg.includes('403') || errorMsg.includes('verification') || logsStr.includes('error=403')) {
           const msg = `❌ **Image Generation Failed**\n${errorMsg}\n\nPlease verify your OpenAI organization settings or try a different prompt.`;
           forcedText = msg;
           ev({ type: 'text', data: msg });
           assistantTextEmitted = true;
           break;
       }
    }

    if (result.ok && plan?.name === 'project_detect') {
       const out = result.output as any;
       // Smart Context: If we found Node projects, try to read the root package.json immediately
       // to give the AI context about dependencies without wasting a turn.
       if (out && Array.isArray(out.nodeProjects) && out.nodeProjects.length > 0) {
           const rootNode = out.nodeProjects[0]; // Usually the first one is relevant
           const pkgPath = `${rootNode}/package.json`;
           // Execute file_read silently and inject into history
           console.log(`[Smart Context] Auto-reading ${pkgPath}`);
           const subResult = await executeTool('file_read', { filePath: pkgPath });
           if (subResult.ok) {
               ev({ type: 'evidence_added', data: { kind: 'log', text: `[Auto-Read] Read ${pkgPath} for context.` } });
               history.push({ 
                   role: 'assistant', 
                   content: `Tool Call: file_read\nInput: {"filePath":"${pkgPath}"}\nOutput: ${JSON.stringify(subResult.output)}` 
               });
           }
       }
    }

    if (!result.ok && plan?.name === 'file_read') {
       const err = String(result.error || '');
       if (err.includes('ENOENT') || err.includes('not found')) {
           // Auto-Correction: File not found? List the directory to help user see what's there.
           const fpath = String(plan?.input?.filePath || '.');
           const dir = fpath.includes('/') ? fpath.split('/').slice(0, -1).join('/') || '.' : '.';
           console.log(`[Auto-Correction] file_read failed for ${fpath}. Listing ${dir}`);
           const subResult = await executeTool('ls', { path: dir });
           if (subResult.ok) {
               ev({ type: 'text', data: `⚠️ لم أجد الملف "${fpath}". إليك محتويات المجلد "${dir}" للمساعدة:` });
               ev({ type: 'evidence_added', data: { kind: 'log', text: `[Auto-Correction] ls ${dir}: ${JSON.stringify(subResult.output)}` } });
               history.push({ 
                   role: 'assistant', 
                   content: `Tool Call: ls\nInput: {"path":"${dir}"}\nOutput: ${JSON.stringify(subResult.output)}` 
               });
           }
       }
    }

    if (result.ok && plan?.name === 'echo') {
      const text = result.output?.text;
      if (text) {
        const s = String(text).trim();
        forcedText = s;
        ev({ type: 'text', data: s });
        assistantTextEmitted = true;
        if (s && !/^\(system\)/i.test(s)) break;
      }
    }

    if (result.ok && plan?.name === 'image_generate') {
      const href = result.output?.href;
      if (href) {
        // Do not emit markdown image to avoid duplication. The UI handles artifact_created event.
        forcedText = `🎨 Image generated successfully.`;
        ev({ type: 'text', data: forcedText }); 
        assistantTextEmitted = true;
        break; 
      }
    }

    // Emit a user-visible confirmation when a file is created
    if (result.ok && plan?.name === 'file_write') {
      const href = result.output?.href;
      const fname = String(plan?.input?.filename || '').trim();
      const msgParts: string[] = [];
      msgParts.push(`### تم إنشاء ملف`);
      if (fname) msgParts.push(`- الاسم: ${fname}`);
      if (href) msgParts.push(`- رابط المعاينة: ${href}`);
      const msg = msgParts.join('\n');
      forcedText = msg;
      ev({ type: 'text', data: msg });
      assistantTextEmitted = true;
      break;
    }

    const wfForProgress = detectWorkflow(String(text || ''));
    if (result.ok && wfForProgress) {
      if (plan?.name === 'project_detect') ev({ type: 'text', data: `- تم فحص المشروع (project_detect)` });
      if (plan?.name === 'analyze_codebase') ev({ type: 'text', data: `- تم تحليل هيكل الملفات (analyze_codebase)` });
      if (plan?.name === 'command_policy_check') ev({ type: 'text', data: `- تم فحص سياسة الأوامر (command_policy_check)` });
      if (plan?.name === 'grep_search') ev({ type: 'text', data: `- تم البحث في الكود (grep_search)` });
      if (plan?.name === 'file_edit') ev({ type: 'text', data: `- تم تعديل ملف (file_edit)` });
      if (plan?.name === 'scaffold_project') {
        const created = Array.isArray(result.output?.created) ? result.output.created : [];
        const label =
          wfForProgress.kind === 'ecommerce'
            ? 'المتجر'
            : wfForProgress.kind === 'static_site'
              ? 'الموقع'
              : wfForProgress.kind === 'node_api'
                ? 'الـ API'
                : wfForProgress.kind === 'fullstack'
                  ? 'التطبيق'
                  : 'المشروع';
        ev({ type: 'text', data: `- تم إنشاء هيكل ${label} (scaffold_project): ${created.length} عنصر` });
      }
      if (plan?.name === 'npm_install') ev({ type: 'text', data: `- تم تثبيت الحزم (npm_install)` });
      if (plan?.name === 'quality_run') {
        const results = Array.isArray(result.output?.results) ? result.output.results : [];
        const ok = results.filter((r: any) => r && r.ok).length;
        const skipped = results.filter((r: any) => r && r.skipped).length;
        ev({ type: 'text', data: `- تم تشغيل فحوص الجودة (quality_run): ناجح ${ok} / متجاوز ${skipped}` });
      }
    }

    if (result.ok && plan?.name === 'http_fetch') {
      try {
        const urlStr = String(plan?.input?.url || '');
        const u = new URL(urlStr);
        // Tools listing formatting
        if (u.pathname === '/tools') {
          const j = (result as any)?.output?.json || null;
          const total = Number(j?.count || 0);
          const real = Number(j?.realCount || 0);
          const noop = Number(j?.noopCount || 0);
          const names = Array.isArray(j?.tools) ? j.tools.slice(0, 10).map((t: any) => String(t?.name || '')).filter(Boolean) : [];
          const md = [
            `### سرد الأدوات`,
            `- العدد الكلي: ${total}`,
            `- الفعلية: ${real}`,
            `- الوهمية (noop): ${noop}`,
            names.length ? `- أمثلة: ${names.join(', ')}` : ''
          ].filter(Boolean).join('\n');
          forcedText = md;
          ev({ type: 'text', data: md });
          assistantTextEmitted = true;
        }
        let base = (u.searchParams.get('base') || '').toUpperCase();
        let sym = (u.searchParams.get('symbols') || u.searchParams.get('sym') || '').toUpperCase();
        if (!base) {
          const m = u.pathname.match(/\/latest\/([A-Z]{3,4})/i);
          if (m) base = m[1].toUpperCase();
        }
        if (!sym && typeof plan?.input?.sym === 'string') {
          sym = String(plan?.input?.sym).toUpperCase();
        }
        if (!base && typeof plan?.input?.base === 'string') {
          base = String(plan?.input?.base).toUpperCase();
        }
        const rates = result.output?.json?.rates || {};
        let rate: number | null = null;
        if (sym && typeof rates[sym] === 'number') {
          rate = rates[sym];
        } else if (typeof result.output?.bodySnippet === 'string') {
          const m = result.output.bodySnippet.match(new RegExp(`"${sym}"\\s*:\\s*([\\d.]+)`));
          if (m) rate = Number(m[1]);
        }
        if (rate !== null && base && sym) {
          const md = [
            `### سعر العملة`,
            `- العملة الأساسية: ${base}`,
            `- العملة المقابلة: ${sym}`,
            `- السعر اليوم: ${Number(rate).toFixed(4)} ${sym}`
          ].join('\n');
          forcedText = md;
          ev({ type: 'text', data: md });
          assistantTextEmitted = true;
        } else if (base && sym) {
          const fbUrl = `https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`;
          ev({ type: 'step_started', data: { name: `execute:http_fetch(fallback)` } });
          const fbRes = await executeTool('http_fetch', { url: fbUrl });
          ev({ type: fbRes.ok ? 'step_done' : 'step_failed', data: { name: `execute:http_fetch(fallback)`, result: fbRes } });
          let rate2: number | null = null;
          if (typeof fbRes.output?.json?.rates?.[sym] === 'number') {
            rate2 = fbRes.output.json.rates[sym];
          } else if (typeof fbRes.output?.bodySnippet === 'string') {
            const m2 = fbRes.output.bodySnippet.match(new RegExp(`"${sym}"\\s*:\\s*([\\d.]+)`));
            if (m2) rate2 = Number(m2[1]);
          }
          if (rate2 !== null) {
            const md2 = [
              `### سعر العملة`,
              `- العملة الأساسية: ${base}`,
              `- العملة المقابلة: ${sym}`,
              `- السعر اليوم: ${Number(rate2).toFixed(4)} ${sym}`
            ].join('\n');
            forcedText = md2;
            ev({ type: 'text', data: md2 });
            assistantTextEmitted = true;
          }
          if (useMock) {
            store.addExec(runId, 'http_fetch', { url: fbUrl }, fbRes.output, fbRes.ok, fbRes.logs);
          } else {
            await ToolExecution.create({ runId, name: 'http_fetch', input: { url: fbUrl }, output: fbRes.output, ok: fbRes.ok, logs: fbRes.logs });
          }
        }
        if (u.hostname.includes('wttr.in')) {
          const city = String(plan?.input?.city || 'Istanbul');
          const cc = Array.isArray(result.output?.json?.current_condition) ? result.output.json.current_condition[0] : null;
          const tempC = cc ? Number(cc.temp_C) : null;
          const desc = cc && Array.isArray(cc.weatherDesc) && cc.weatherDesc[0] ? String(cc.weatherDesc[0].value || '') : '';
          const hum = cc && typeof cc.humidity !== 'undefined' ? Number(cc.humidity) : null;
          if (tempC !== null && !Number.isNaN(tempC)) {
            const parts = [
              `### الطقس`,
              `- المدينة: ${city}`,
              `- درجة الحرارة: ${tempC.toFixed(0)}°C`
            ];
            if (desc) parts.push(`- الحالة: ${desc}`);
            if (hum !== null && !Number.isNaN(hum)) parts.push(`- الرطوبة: ${hum}%`);
            const mdw = parts.join('\n');
            forcedText = mdw;
            ev({ type: 'text', data: mdw });
            assistantTextEmitted = true;
          }
        }
      } catch {}
    }
    if (result.ok && plan?.name === 'web_search') {
      try {
        const results = Array.isArray(result.output?.results) ? result.output.results : [];
        const top = results && results[0] ? results[0] : null;
        const title = top ? String(top.title || '').trim() : '';
        const url = top ? String(top.url || '').trim() : '';
        if (title || url) {
          ev({ type: 'evidence_added', data: { kind: 'search', text: `${title}${title && url ? ' — ' : ''}${url}` } });
        }
      } catch {}
    }
    if (result.ok && plan?.name === 'html_extract') {
      try {
        const title = String(result.output?.title || '').trim();
        const url = String(plan?.input?.url || '').trim();
        if (title || url) {
          ev({ type: 'evidence_added', data: { kind: 'page', text: `${title}${title && url ? ' — ' : ''}${url}` } });
        }
      } catch {}
    }

    if (useMock) {
      store.addExec(runId, plan?.name || 'unknown', persistedInput, result.output, result.ok, result.logs);
    } else {
      await ToolExecution.create({ runId, name: plan?.name || 'unknown', input: persistedInput, output: result.output, ok: result.ok, logs: result.logs });
    }

    if (result.ok && plan?.name === 'central_answer') {
      const ans = String(result.output?.answer || '').trim();
      if (ans) {
        forcedText = ans;
        ev({ type: 'text', data: ans });
        assistantTextEmitted = true;
        break;
      }
    }

    if (result.ok && String(plan?.name || '') === 'http_fetch') {
      const status = Number((result as any)?.output?.status);
      if (status === 401 || status === 403) {
        const urlStr = String((plan as any)?.input?.url || '').trim();
        const msg = [
          `⚠️ الوصول لهذا الرابط يحتاج تسجيل دخول أو توكن.`,
          urlStr ? `- الرابط: ${urlStr}` : ``,
          `- أدخل Bearer Token في نافذة التوكن وأرسله.`,
          `- سيتم حفظ التوكن بشكل آمن لهذا الحساب ولن يظهر في المحادثة.`,
        ].filter(Boolean).join('\n');

        ev({ type: 'text', data: msg });
        ev({
          type: 'secret_required',
          data: {
            sessionId,
            runId,
            provider: 'generic',
            key: 'HTTP_BEARER_TOKEN',
            label: 'Bearer Token',
            reason: `HTTP ${status}`,
          },
        });

        const { setPendingTool } = await import('../services/secrets');
        setPendingTool(String(sessionId), { runId, name: String(plan?.name || ''), input: plan?.input });

        if (useMock) {
          store.updateRun(runId, { status: 'blocked' as any });
        } else {
          try { await Run.findByIdAndUpdate(runId, { $set: { status: 'blocked' } }); } catch {}
        }

        return res.json({
          runId,
          sessionId,
          blocked: true,
          secretRequired: true,
          secret: { provider: 'generic', key: 'HTTP_BEARER_TOKEN', label: 'Bearer Token' },
          ...(systemPromptCreated ? { systemPrompt: systemPromptText, systemPromptId: systemPromptEventId } : {}),
        });
      }
    }

    if (!result.ok) {
        const errorMsg = result.error || (result.logs ? result.logs.join('\n') : 'Unknown error');

        if (String(plan?.name || '') === 'git_ops' && isGitAuthError(errorMsg)) {
          const msg = [
            `⚠️ مطلوب تسجيل دخول قبل دفع التحديثات إلى GitHub.`,
            `- أدخل توكن GitHub (Personal Access Token) في نافذة التوكن وأرسله.`,
            `- سيتم حفظ التوكن بشكل آمن لهذا الحساب ولن يظهر في المحادثة.`,
          ].join('\n');

          ev({ type: 'text', data: msg });
          ev({
            type: 'secret_required',
            data: {
              sessionId,
              runId,
              provider: 'github',
              key: 'GITHUB_TOKEN',
              label: 'GitHub Token',
              reason: 'git push يحتاج مصادقة',
            },
          });

          const { setPendingTool } = await import('../services/secrets');
          setPendingTool(String(sessionId), { runId, name: String(plan?.name || ''), input: plan?.input });

          if (useMock) {
            store.updateRun(runId, { status: 'blocked' as any });
          } else {
            try { await Run.findByIdAndUpdate(runId, { $set: { status: 'blocked' } }); } catch {}
          }

          return res.json({
            runId,
            sessionId,
            blocked: true,
            secretRequired: true,
            secret: { provider: 'github', key: 'GITHUB_TOKEN', label: 'GitHub Token' },
            ...(systemPromptCreated ? { systemPrompt: systemPromptText, systemPromptId: systemPromptEventId } : {}),
          });
        }

        if (String(plan?.name || '') === 'github_create_repo' && isGithubAuthError(errorMsg)) {
          const msg = [
            `⚠️ مطلوب توكن GitHub لإنشاء مستودع جديد عبر API.`,
            `- أدخل GitHub Personal Access Token في نافذة التوكن وأرسله.`,
            `- سيتم حفظ التوكن بشكل آمن لهذا الحساب ولن يظهر في المحادثة.`,
          ].join('\n');

          ev({ type: 'text', data: msg });
          ev({
            type: 'secret_required',
            data: {
              sessionId,
              runId,
              provider: 'github',
              key: 'GITHUB_TOKEN',
              label: 'GitHub Token',
              reason: 'إنشاء ريبو يحتاج مصادقة',
            },
          });

          const { setPendingTool } = await import('../services/secrets');
          setPendingTool(String(sessionId), { runId, name: String(plan?.name || ''), input: plan?.input });

          if (useMock) {
            store.updateRun(runId, { status: 'blocked' as any });
          } else {
            try { await Run.findByIdAndUpdate(runId, { $set: { status: 'blocked' } }); } catch {}
          }

          return res.json({
            runId,
            sessionId,
            blocked: true,
            secretRequired: true,
            secret: { provider: 'github', key: 'GITHUB_TOKEN', label: 'GitHub Token' },
            ...(systemPromptCreated ? { systemPrompt: systemPromptText, systemPromptId: systemPromptEventId } : {}),
          });
        }
        if (String(plan?.name || '') === 'github_create_or_update_file' && isGithubAuthError(errorMsg)) {
          const msg = [
            `⚠️ مطلوب توكن GitHub لإنشاء/تعديل ملفات داخل المستودع عبر API.`,
            `- أدخل GitHub Personal Access Token في نافذة التوكن وأرسله.`,
            `- سيتم حفظ التوكن بشكل آمن لهذا الحساب ولن يظهر في المحادثة.`,
          ].join('\n');

          ev({ type: 'text', data: msg });
          ev({
            type: 'secret_required',
            data: {
              sessionId,
              runId,
              provider: 'github',
              key: 'GITHUB_TOKEN',
              label: 'GitHub Token',
              reason: 'تعديل ملفات الريبو يحتاج مصادقة',
            },
          });

          const { setPendingTool } = await import('../services/secrets');
          setPendingTool(String(sessionId), { runId, name: String(plan?.name || ''), input: plan?.input });

          if (useMock) {
            store.updateRun(runId, { status: 'blocked' as any });
          } else {
            try { await Run.findByIdAndUpdate(runId, { $set: { status: 'blocked' } }); } catch {}
          }

          return res.json({
            runId,
            sessionId,
            blocked: true,
            secretRequired: true,
            secret: { provider: 'github', key: 'GITHUB_TOKEN', label: 'GitHub Token' },
            ...(systemPromptCreated ? { systemPrompt: systemPromptText, systemPromptId: systemPromptEventId } : {}),
          });
        }
        
        // Self-Healing Notification
        ev({ type: 'text', data: `⚠️ **Self-Healing Activated**: Detected error in '${plan?.name}'. Analyzing fix...` });
        
        history.push({ 
            role: 'assistant', 
            content: `Tool '${plan?.name}' FAILED. Error: ${errorMsg}. \nYou must analyze this error and attempt to fix the issue in the next step. If it's a syntax error, correct it. If it's a missing file or dependency, resolve it.` 
        });
    } else {
        history.push({ role: 'assistant', content: `Tool '${plan?.name}' executed. tool call: ${plan?.name}. Result: ${safeOutput(result.output)}` });
    }
    
    steps++;

    // If echo, we are done
    if (plan?.name === 'echo') {
      forcedText = String(plan?.input?.text || '');
      break;
    }
  }

  const finalContent = forcedText || (lastResult?.output ? (() => { try { return JSON.stringify(lastResult.output); } catch { return 'Output too large'; } })() : 'No output');

  if (!assistantTextEmitted) {
    ev({ type: 'text', data: finalContent });
  }

  ev({ type: 'run_completed', data: { runId, result: lastResult } });
  ev({ type: 'run_finished', data: { runId, status: 'done' } });
  
  if (useMock) {
    store.addMessage(sessionId, 'assistant', finalContent, runId);
    store.updateRun(runId, { status: 'done' });
  } else {
    await Message.create({ sessionId, role: 'assistant', content: finalContent, runId });
    await Run.findByIdAndUpdate(runId, { $set: { status: 'done' } });
  }
  
  return res.json({
    runId,
    sessionId,
    status: 'done',
    ...(systemPromptCreated ? { systemPrompt: systemPromptText, systemPromptId: systemPromptEventId } : {}),
  });
});

export default router;
