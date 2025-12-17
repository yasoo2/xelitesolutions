import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
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

const router = Router();

function pickToolFromText(text: string) {
  const t = text.toLowerCase();
  const tn = t.replace(/[\u064B-\u065F\u0670]/g, '').replace(/ـ/g, '');
  const urlMatch = text.match(/https?:\/\/\S+/);
  if (/(صورة|صوره|تصميم|صمم)/.test(t)) {
    if (/(قطة|قطه|قط|cat)/.test(t)) return { name: 'browser_snapshot', input: { url: 'https://cataas.com/cat' } };
    // Fallback to snapshot of a generated placeholder image (does not require API keys)
    const label = encodeURIComponent(text.slice(0, 24));
    const url = `https://dummyimage.com/1024x1024/111/eeee.png&text=${label}`;
    return { name: 'browser_snapshot', input: { url } };
  }
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
  if (t.includes('browser') && urlMatch) return { name: 'browser_snapshot', input: { url: urlMatch[0] } };
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
  let { text, sessionId, fileIds } = req.body || {};
  const ev = (e: LiveEvent) => broadcast(e);
  const isAuthed = Boolean((req as any).auth);
  const useMock = !isAuthed ? true : (process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1);

  // 1. Process Attachments
  let attachedContent = '';
  if (!useMock && fileIds && Array.isArray(fileIds) && fileIds.length > 0) {
    try {
      const files = await FileModel.find({ _id: { $in: fileIds } });
      for (const f of files) {
        if (f.content) {
           attachedContent += `\n\n--- [Attached File: ${f.originalName}] ---\n${f.content}\n--- [End of File] ---\n`;
        }
      }
    } catch (e) {
      console.error('Error loading files', e);
    }
  }

  const fullPrompt = (String(text || '') + attachedContent).trim();

  ev({ type: 'step_started', data: { name: 'plan' } });
  
  let plan = null;
  try {
      // Try LLM planning
      plan = await planNextStep([{ role: 'user', content: fullPrompt }]);
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
      
      const userId = (req as any).auth?.sub; 
      
      if (!userId) {
        return res.status(400).json({ error: 'Session ID required or must be logged in to create one' });
      }

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
            const messages = [{ role: 'user', content: fullPrompt }];
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
  const history: { role: 'user' | 'assistant' | 'system', content: string }[] = [
    { role: 'user', content: fullPrompt }
  ];

  let lastResult: any = null;
  let forcedText: string | null = null;

  while (steps < MAX_STEPS) {
    ev({ type: 'step_started', data: { name: `thinking_step_${steps + 1}` } });
    
    // Plan next step with history
    try {
        plan = await planNextStep(history);
    } catch (err) {
        console.warn('LLM planning error:', err);
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
        forcedText = `![Generated Image](${href})`;
        ev({ type: 'text', data: forcedText }); // Emit text event so UI shows it immediately
        break; 
      }
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
