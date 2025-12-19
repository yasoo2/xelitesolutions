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
import { planNextStep, generateSessionTitle } from '../llm';
import { authenticate } from '../middleware/auth';
import { Session } from '../models/session';
import { Message } from '../models/message';
import { FileModel } from '../models/file';
import { MemoryService } from '../services/memory';

const router = Router();

// Connection verification endpoint
router.post('/verify', authenticate as any, async (req: Request, res: Response) => {
  const { provider, apiKey, baseUrl, model } = req.body || {};
  
  if (provider === 'llm') {
      // Default system check
      if (process.env.OPENAI_API_KEY) {
          return res.json({ status: 'ok', message: 'Joe System Ready' });
      } else {
          // If no key, it might still work via heuristics, but for "connection" status we warn
          return res.json({ status: 'ok', message: 'Joe System (Heuristic Only)' });
      }
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
    console.error('Verify error:', err);
    return res.status(401).json({ error: err.message || 'Connection failed' });
  }
});

function pickToolFromText(text: string) {
  const t = text.toLowerCase();
  const tn = t.replace(/[\u064B-\u065F\u0670]/g, '').replace(/ـ/g, '');
  const urlMatch = text.match(/https?:\/\/\S+/);
  if (/(سعر|قيمة).*(الدولار|usd).*(الليرة|الليره|try)/i.test(tn)) {
    return { name: 'http_fetch', input: { url: 'https://open.er-api.com/v6/latest/USD?sym=TRY', base: 'USD', sym: 'TRY' } };
  }
  // Currency pairs (Arabic) e.g., "سعر الدينار الكويتي مقابل الشيكل"
  const currencyMap: Record<string, string> = {
    'الدولار': 'USD', 'دولار': 'USD', 'usd': 'USD', 'امريكي': 'USD', 'أمريكي': 'USD',
    'اليورو': 'EUR', 'euro': 'EUR', 'eur': 'EUR',
    'الليرة التركية': 'TRY', 'الليره التركية': 'TRY', 'try': 'TRY', 'ليرة تركية': 'TRY',
    'الليرة': 'TRY', 'الليره': 'TRY', 'ليرة': 'TRY', 'ليره': 'TRY',
    'الشيكل': 'ILS', 'شيكل': 'ILS', 'ils': 'ILS',
    'الدينار الكويتي': 'KWD', 'دينار كويتي': 'KWD', 'kwd': 'KWD', 'دينار': 'KWD',
    'الريال السعودي': 'SAR', 'ريال سعودي': 'SAR', 'sar': 'SAR', 'ريال': 'SAR',
    'الدرهم الإماراتي': 'AED', 'درهم إماراتي': 'AED', 'aed': 'AED', 'درهم': 'AED',
    'الجنيه المصري': 'EGP', 'جنيه مصري': 'EGP', 'egp': 'EGP', 'جنيه': 'EGP'
  };
  const curMatch = tn.match(/(?:سعر|قيمة|صرف|تحويل)\s+(.+?)\s+(?:مقابل|ضد|إلى|الى|ب)\s+(.+?)(?:\s|$)/i);
  if (curMatch) {
    const baseName = curMatch[1].trim().toLowerCase();
    const symName = curMatch[2].trim().toLowerCase();
    
    // Helper to find code from map keys partial match
    const findCode = (name: string) => {
      if (currencyMap[name]) return currencyMap[name];
      for (const k in currencyMap) {
        if (name.includes(k)) return currencyMap[k];
      }
      return name.length === 3 ? name.toUpperCase() : null;
    };

    const base = findCode(baseName);
    const sym = findCode(symName);
    
    if (base && sym) {
      return { name: 'http_fetch', input: { url: `https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`, base, sym } };
    }
  }
  const names: Array<[string, string]> = [
    ['USD', '(الدولار|دولار|usd|امريكي|أمريكي)'],
    ['EUR', '(اليورو|euro|eur)'],
    ['TRY', '(الليرة|الليره|ليرة|ليره|try|turkish\\s+lira)'],
    ['ILS', '(الشيكل|شيكل|ils)'],
    ['KWD', '(الدينار|دينار|kwd)'],
    ['SAR', '(الريال|ريال|sar)'],
    ['AED', '(الدرهم|درهم|aed)'],
    ['EGP', '(الجنيه|جنيه|egp)'],
  ];
  const found: string[] = [];
  // Use a set to avoid duplicates
  const foundSet = new Set<string>();
  
  for (const [code, pat] of names) {
    if (new RegExp(pat, 'i').test(tn)) {
       foundSet.add(code);
    }
  }
  
  if (foundSet.size >= 2) {
    const arr = Array.from(foundSet);
    const base = arr[0];
    const sym = arr[1];
    return { name: 'http_fetch', input: { url: `https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`, base, sym } };
  }
  if (/(ابحث|بحث|search|find|lookup)/.test(t) || /^(من|ما|ماذا|متى|اين|أين|كيف|هل|لماذا|why|what|who|when|where|how)\s/.test(t)) {
    const qMatch = text.match(/(?:عن|حول)\s+(.+)/i);
    const query = qMatch ? qMatch[1] : text;
    return { name: 'web_search', input: { query } };
  }
  if (/(rss|feed)/i.test(t) && urlMatch) {
    return { name: 'rss_fetch', input: { url: urlMatch[0] } };
  }
  if (/(استخرج|تحليل|html|محتوى)/i.test(t) && urlMatch) {
    return { name: 'html_extract', input: { url: urlMatch[0] } };
  }
  if (/(لخص|خلاصة|summarize)/i.test(t)) {
    const m = text.match(/(?:لخص|خلاصة|summarize)\s*[:：]\s*(.+)/i);
    const tx = m ? m[1] : text;
    return { name: 'text_summarize', input: { text: tx } };
  }
  if (/(طقس|حرار[هة]|درجة|weather|temperature)/i.test(t) && /(اسطنبول|إسطنبول|istanbul)/i.test(t)) {
    const city = 'Istanbul';
    const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1`;
    return { name: 'http_fetch', input: { url, city } };
  }
  // Page design / HTML generation
  if (/(صفحة|landing|html)/.test(t)) {
    const html = `<!doctype html><html lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"/><title>صفحة مصممة</title><style>body{font-family:system-ui;background:#0b0b0d;color:#e5e7eb;margin:0}header{padding:24px;background:linear-gradient(90deg,rgba(234,179,8,.15),transparent);border-bottom:1px solid #2a2a30}h1{margin:0;color:#eab308}main{padding:24px;max-width:960px;margin:0 auto}section.card{background:rgba(24,24,27,.6);border:1px solid #2a2a30;border-radius:12px;padding:20px;margin-bottom:12px}</style></head><body><header><h1>صفحة تجريبية</h1></header><main><section class="card"><h2>وصف الطلب</h2><p>${text.replace(/</g,'&lt;')}</p></section><section class="card"><h2>محتوى</h2><p>تم إنشاء هذه الصفحة كأرتيفاكت يمكن فتحه من واجهة المستخدم.</p></section></main></body></html>`;
    return { name: 'file_write', input: { filename: 'page.html', content: html } };
  }
  // E-commerce site scaffold
  if (/(متجر|ecommerce|shop)/.test(t)) {
    const html = `<!doctype html><html lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"/><title>متجر إلكتروني</title><style>body{font-family:system-ui;background:#0b0b0d;color:#e5e7eb;margin:0}header{padding:24px;background:linear-gradient(90deg,rgba(234,179,8,.15),transparent);border-bottom:1px solid #2a2a30}h1{margin:0;color:#eab308}main{padding:24px;max-width:1024px;margin:0 auto;display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}.product{background:rgba(24,24,27,.6);border:1px solid #2a2a30;border-radius:12px;padding:16px}.product h3{margin:0 0 8px}.price{color:#60a5fa;font-weight:700}</style></head><body><header><h1>متجر تجريبي</h1></header><main>${Array.from({length:6}).map((_,i)=>`<div class="product"><h3>منتج ${i+1}</h3><p>وصف قصير للمنتج.</p><div class="price">$${(10+i*5).toFixed(2)}</div></div>`).join('')}</main></body></html>`;
    return { name: 'file_write', input: { filename: 'store.html', content: html } };
  }
  if (t.includes('fetch') && urlMatch) return { name: 'http_fetch', input: { url: urlMatch[0] } };
  if (t.includes('write')) return { name: 'file_write', input: { filename: 'note.txt', content: text } };
  return { name: 'echo', input: { text } };
}

function detectRisk(text: string) {
  const risky = /(rm\s+-rf|delete|drop\s+table|shutdown|kill\s+process)/i;
  if (risky.test(text)) {
    return 'HIGH: instruction matches destructive pattern';
  }
  return null;
}

router.post('/start', authenticate as any, async (req: Request, res: Response) => {
  let { text, sessionId, fileIds, provider, apiKey, baseUrl, model } = req.body || {};
  const ev = (e: LiveEvent) => broadcast(e);
  const isAuthed = Boolean((req as any).auth);
  const userId = (req as any).auth?.sub;
  const useMock = !isAuthed ? true : (process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1);

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

  // Inject Memory
  if (userId && !useMock) {
      try {
        const memories = await MemoryService.searchMemories(userId, String(text || ''));
        if (memories.length > 0) {
          console.log(`[Memory] Found ${memories.length} relevant memories`);
          fullPromptText += `\n\n[System Note: Known facts about this user (Memory)]:\n${memories.join('\n')}\n`;
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

  ev({ type: 'step_started', data: { name: 'plan' } });
  
  let plan = null;
  try {
      // Try LLM planning
      plan = await planNextStep(
        [{ role: 'user', content: initialContent }],
        { provider, apiKey, baseUrl, model }
      );
  } catch (err) {
      console.warn('LLM planning error:', err);
  }

  if (!plan) {
    plan = pickToolFromText(String(text || ''));
  } else {
    const h = pickToolFromText(String(text || ''));
    if (plan?.name === 'echo' && h?.name && h.name !== 'echo') {
      plan = h;
    }
  }
  
  ev({ type: 'step_done', data: { name: 'plan', plan } });

  if (!sessionId) {
    if (useMock) {
      const s = store.createSession('Untitled Session');
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
      
      const s = await Session.create({ title: `Session ${new Date().toLocaleString()}`, mode: 'ADVISOR', userId, tenantId: tenantDoc._id });
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
    store.addStep(runId, 'plan', 'done');
  } else {
    const run = await Run.create({ sessionId, status: 'running', steps: [{ name: 'plan', status: 'done' }] });
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

  // Save User Message to DB
  if (useMock) {
    store.addMessage(sessionId, 'user', String(text || ''), runId);
  } else {
    await Message.create({ sessionId, role: 'user', content: String(text || ''), runId });
  }

  const risk = detectRisk(String(text || ''));
  if (risk) {
    if (useMock) {
      const ap = store.createApproval(runId, String(text || ''), risk, plan.name, plan.input);
      ev({ type: 'approval_required', data: { id: ap.id, runId, risk, action: text } });
      store.updateRun(runId, { status: 'blocked' });
      // store plan context for continuation
      const { planContext } = await import('../approvals/context');
      planContext.set(ap.id, { runId, name: plan.name, input: plan.input });
      return res.json({ runId, blocked: true, approvalId: ap.id });
    } else {
      const ap = await Approval.create({ runId, action: String(text || ''), risk, status: 'pending' });
      ev({ type: 'approval_required', data: { id: ap._id.toString(), runId, risk, action: text } });
      await Run.findByIdAndUpdate(runId, { $set: { status: 'blocked' } });
      const { planContext } = await import('../approvals/context');
      planContext.set(ap._id.toString(), { runId, name: plan.name, input: plan.input });
      return res.json({ runId, blocked: true, approvalId: ap._id.toString() });
    }
  }

  // --- Agent Loop ---
  let steps = 0;
  const MAX_STEPS = 10;
  const history: { role: 'user' | 'assistant' | 'system', content: string | any[] }[] = [
    { role: 'user', content: initialContent }
  ];

  let lastResult: any = null;
  let forcedText: string | null = null;

  while (steps < MAX_STEPS) {
    ev({ type: 'step_started', data: { name: `thinking_step_${steps + 1}` } });
    
    // Plan next step with history
    try {
        // DEBUG HISTORY
        console.log(`Step ${steps} History Last Item:`, JSON.stringify(history[history.length - 1]));
        
        // If default provider and no API key, do not throw (allow heuristic fallback)
        // If custom provider or API key provided, throw on error to notify user
        const shouldThrow = Boolean(apiKey || (provider !== 'llm' && provider));
        
        // If default provider has a system-wide key, we also want to know if it fails?
        // Actually, if system key is present but fails (e.g. quota), we might want to know.
        // But if system key is MISSING, we want fallback.
        // Let's refine:
        // - If apiKey is provided in request: throwOnError = true
        // - If provider is NOT 'llm' (and not null): throwOnError = true
        // - If provider IS 'llm' (or null):
        //    - If process.env.OPENAI_API_KEY is set: throwOnError = true (system is configured but failing)
        //    - If process.env.OPENAI_API_KEY is NOT set: throwOnError = false (system unconfigured, use heuristic)
        
        const isSystemConfigured = !!process.env.OPENAI_API_KEY;
        const throwOnError = !!apiKey || (provider && provider !== 'llm') || isSystemConfigured;

        plan = await planNextStep(history, { provider, apiKey, baseUrl, model, throwOnError });
    } catch (err: any) {
        console.warn('LLM planning error:', err);
        if (err?.status === 401 || err?.code === 'invalid_api_key' || (err?.error?.code === 'invalid_api_key')) {
             ev({ type: 'text', data: '⚠️ **Authentication Failed**: The AI provider rejected the API Key. Please check your settings in the provider menu.' });
             forcedText = 'Authentication Failed';
             break;
        }
        plan = null;
    }

    if (!plan) {
      // Fallback if LLM fails
      if (steps === 0) plan = pickToolFromText(String(text || ''));
      else break; // Stop if we can't plan anymore
    } else if (steps === 0 && plan?.name === 'echo') {
      const h0 = pickToolFromText(String(text || ''));
      if (h0?.name && h0.name !== 'echo') {
        plan = h0;
      }
    }

    ev({ type: 'step_done', data: { name: `thinking_step_${steps + 1}`, plan } });

    if (plan.name === 'browser_run') {
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
          const ap = store.createApproval(runId, actionText, risk, plan.name, plan.input);
          ev({ type: 'approval_required', data: { id: ap.id, runId, risk, action: actionText } });
          store.updateRun(runId, { status: 'blocked' });
          const { planContext } = await import('../approvals/context');
          planContext.set(ap.id, { runId, name: plan.name, input: plan.input });
          return res.json({ runId, blocked: true, approvalId: ap.id });
        } else {
          const ap = await Approval.create({ runId, action: actionText, risk, status: 'pending' });
          ev({ type: 'approval_required', data: { id: ap._id.toString(), runId, risk, action: actionText } });
          await Run.findByIdAndUpdate(runId, { $set: { status: 'blocked' } });
          const { planContext } = await import('../approvals/context');
          planContext.set(ap._id.toString(), { runId, name: plan.name, input: plan.input });
          return res.json({ runId, blocked: true, approvalId: ap._id.toString() });
        }
      }
    }

    // Execute tool
    ev({ type: 'step_started', data: { name: `execute:${plan.name}` } });
    const result = await executeTool(plan.name, plan.input);
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
      }
    }

    ev({ type: result.ok ? 'step_done' : 'step_failed', data: { name: `execute:${plan.name}`, result } });
    
    // Stop on fatal errors (403, verification, etc.)
    if (!result.ok && plan.name === 'image_generate') {
       const errorMsg = String(result.error || '');
       const logsStr = (result.logs || []).join('\n');
       if (errorMsg.includes('403') || errorMsg.includes('verification') || logsStr.includes('error=403')) {
           const msg = `❌ **Image Generation Failed**\n${errorMsg}\n\nPlease verify your OpenAI organization settings or try a different prompt.`;
           forcedText = msg;
           ev({ type: 'text', data: msg });
           break;
       }
    }

    if (result.ok && plan.name === 'echo') {
      const text = result.output?.text;
      if (text) {
        forcedText = text;
        ev({ type: 'text', data: text });
      }
    }

    if (result.ok && plan.name === 'image_generate') {
      const href = result.output?.href;
      if (href) {
        // Do not emit markdown image to avoid duplication. The UI handles artifact_created event.
        forcedText = `🎨 Image generated successfully.`;
        ev({ type: 'text', data: forcedText }); 
        break; 
      }
    }

    // Emit a user-visible confirmation when a file is created
    if (result.ok && plan.name === 'file_write') {
      const href = result.output?.href;
      const fname = String(plan.input?.filename || '').trim();
      const msgParts: string[] = [];
      msgParts.push(`### تم إنشاء ملف`);
      if (fname) msgParts.push(`- الاسم: ${fname}`);
      if (href) msgParts.push(`- رابط المعاينة: ${href}`);
      const msg = msgParts.join('\n');
      forcedText = msg;
      ev({ type: 'text', data: msg });
      break;
    }

    if (result.ok && plan.name === 'http_fetch') {
      try {
        const urlStr = String(plan.input?.url || '');
        const u = new URL(urlStr);
        let base = (u.searchParams.get('base') || '').toUpperCase();
        let sym = (u.searchParams.get('symbols') || u.searchParams.get('sym') || '').toUpperCase();
        if (!base) {
          const m = u.pathname.match(/\/latest\/([A-Z]{3,4})/i);
          if (m) base = m[1].toUpperCase();
        }
        if (!sym && typeof plan.input?.sym === 'string') {
          sym = String(plan.input.sym).toUpperCase();
        }
        if (!base && typeof plan.input?.base === 'string') {
          base = String(plan.input.base).toUpperCase();
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
          }
          if (useMock) {
            store.addExec(runId, 'http_fetch', { url: fbUrl }, fbRes.output, fbRes.ok, fbRes.logs);
          } else {
            await ToolExecution.create({ runId, name: 'http_fetch', input: { url: fbUrl }, output: fbRes.output, ok: fbRes.ok, logs: fbRes.logs });
          }
        }
        if (u.hostname.includes('wttr.in')) {
          const city = String(plan.input?.city || 'Istanbul');
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
          }
        }
      } catch {}
    }
    if (result.ok && plan.name === 'web_search') {
      try {
        const results = Array.isArray(result.output?.results) ? result.output.results : [];
        if (results.length > 0) {
          const mdParts: string[] = [];
          mdParts.push(`### نتائج البحث`);
          for (let i = 0; i < results.length; i++) {
            const r = results[i];
            const title = String(r.title || '').trim();
            const url = String(r.url || '').trim();
            const desc = String(r.description || '').trim();
            let domain = '';
            try { domain = new URL(url).hostname; } catch {}
            const num = `${i + 1}.`;
            const head = domain ? `${num} [${title}](${url}) _(${domain})_` : `${num} [${title}](${url})`;
            mdParts.push(head);
            if (desc) mdParts.push(`   - ${desc.slice(0, 200)}`);
          }
          const mds = mdParts.join('\n');
          forcedText = mds;
          ev({ type: 'text', data: mds });
        }
      } catch {}
    }
    if (result.ok && plan.name === 'html_extract') {
      try {
        const o = result.output || {};
        const title = String(o.title || '').trim();
        const desc = String(o.metaDescription || '').trim();
        const heads = Array.isArray(o.headings) ? o.headings.slice(0, 8) : [];
        const links = Array.isArray(o.links) ? o.links.slice(0, 8) : [];
        const parts: string[] = [];
        parts.push(`### تحليل صفحة`);
        if (title) parts.push(`- العنوان: ${title}`);
        if (desc) parts.push(`- الوصف: ${desc}`);
        if (heads.length > 0) {
          parts.push(`- العناوين الرئيسية:`);
          heads.forEach((h: string) => parts.push(`  - ${h}`));
        }
        const mde = parts.join('\n');
        forcedText = mde;
        ev({ type: 'text', data: mde });
      } catch {}
    }

    if (useMock) {
      store.addExec(runId, plan.name, plan.input, result.output, result.ok, result.logs);
    } else {
      await ToolExecution.create({ runId, name: plan.name, input: plan.input, output: result.output, ok: result.ok, logs: result.logs });
    }

    if (!result.ok) {
        const errorMsg = result.error || (result.logs ? result.logs.join('\n') : 'Unknown error');
        
        // Self-Healing Notification
        ev({ type: 'text', data: `⚠️ **Self-Healing Activated**: Detected error in '${plan.name}'. Analyzing fix...` });
        
        history.push({ 
            role: 'assistant', 
            content: `Tool '${plan.name}' FAILED. Error: ${errorMsg}. \nYou must analyze this error and attempt to fix the issue in the next step. If it's a syntax error, correct it. If it's a missing file or dependency, resolve it.` 
        });
    } else {
        history.push({ role: 'assistant', content: `Tool '${plan.name}' executed. Result: ${JSON.stringify(result.output)}` });
    }
    
    steps++;

    // If echo, we are done
    if (plan.name === 'echo') {
      forcedText = String(plan.input?.text || '');
      break;
    }
  }

  ev({ type: 'run_completed', data: { runId, result: lastResult } });
  
  // Save message to DB
  const finalContent = forcedText || (lastResult?.output ? JSON.stringify(lastResult.output) : 'No output');
  
  if (useMock) {
    store.addMessage(sessionId, 'assistant', finalContent, runId);
    store.updateRun(runId, { status: 'done' });
  } else {
    await Message.create({ sessionId, role: 'assistant', content: finalContent, runId });
    await Run.findByIdAndUpdate(runId, { $set: { status: 'done' } });
  }
  
  res.json({ runId, status: 'done' });
});

export default router;
