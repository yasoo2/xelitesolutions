import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { broadcast, LiveEvent } from '../ws';
import { executeTool } from '../tools/registry';
import { store } from '../mock/store';
import { ToolExecution } from '../models/toolExecution';
import { Artifact } from '../models/artifact';
import { Approval } from '../models/approval';
import { Run } from '../models/run';
import { planNextStep } from '../llm';

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
    'الدولار': 'USD', 'دولار': 'USD', 'usd': 'USD',
    'اليورو': 'EUR', 'euro': 'EUR', 'eur': 'EUR',
    'الليرة التركية': 'TRY', 'الليره التركية': 'TRY', 'try': 'TRY', 'ليرة تركية': 'TRY',
    'الشيكل': 'ILS', 'شيكل': 'ILS', 'ils': 'ILS',
    'الدينار الكويتي': 'KWD', 'دينار كويتي': 'KWD', 'kwd': 'KWD'
  };
  const curMatch = tn.match(/(?:سعر|قيمة)\s+(.+?)\s+(?:مقابل|ضد)\s+(.+?)(?:\s|$)/i);
  if (curMatch) {
    const baseName = curMatch[1].trim().toLowerCase();
    const symName = curMatch[2].trim().toLowerCase();
    const base = currencyMap[baseName] || baseName.toUpperCase();
    const sym = currencyMap[symName] || symName.toUpperCase();
    if (base && sym && base.length <= 4 && sym.length <= 4) {
      return { name: 'http_fetch', input: { url: `https://open.er-api.com/v6/latest/${encodeURIComponent(base)}?sym=${encodeURIComponent(sym)}`, base, sym } };
    }
  }
  const names: Array<[string, string]> = [
    ['USD', '(الدولار|دولار|usd)'],
    ['EUR', '(اليورو|euro|eur)'],
    ['TRY', '(الليرة التركية|الليره التركية|ليرة تركية|try|turkish\\s+lira)'],
    ['ILS', '(الشيكل|شيكل|ils)'],
    ['KWD', '(الدينار الكويتي|دينار كويتي|kwd)'],
  ];
  const found: string[] = [];
  for (const [code, pat] of names) {
    if (new RegExp(pat, 'i').test(tn)) found.push(code);
  }
  if (found.length >= 2) {
    const base = found[0];
    const sym = found[1];
    return { name: 'http_fetch', input: { url: `https://open.er-api.com/v6/latest/${encodeURIComponent(base)}?sym=${encodeURIComponent(sym)}`, base, sym } };
  }
  // Web search detection
  if (/(ابحث|بحث|search)/.test(t)) {
    const qMatch = text.match(/(?:عن|حول)\s+(.+)/i);
    const query = qMatch ? qMatch[1] : text;
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    return { name: 'http_fetch', input: { url } };
  }
  // Weather detection (Istanbul)
  if (/(درجة\\s+الحرارة|طقس|weather|temperature)/i.test(tn) && /(اسطنبول|إسطنبول|istanbul)/i.test(tn)) {
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

router.post('/start', async (req: Request, res: Response) => {
  let { text, sessionId } = req.body || {};
  const ev = (e: LiveEvent) => broadcast(e);
  const isAuthed = Boolean((req as any).auth);
  const useMock = !isAuthed ? true : (process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1);

  ev({ type: 'step_started', data: { name: 'plan' } });
  
  let plan = null;
  try {
      // Try LLM planning
      plan = await planNextStep([{ role: 'user', content: String(text || '') }]);
  } catch (err) {
      console.warn('LLM planning error:', err);
  }

  if (!plan) {
    plan = pickToolFromText(String(text || ''));
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
      // Try to find a default user or use the one from auth if available
      // Since this is a public/open endpoint in some contexts, we might need a fallback
      // But ideally req.user should be there if authenticated.
      // If not authenticated, we can't really create a session for a user easily.
      // Assuming authenticated for now, or using a placeholder if needed.
      const userId = (req as any).auth?.sub; 
      
      if (!userId) {
        // If no user, we can't create a valid session per schema (userId required).
        // Return error or handle gracefully.
        return res.status(400).json({ error: 'Session ID required or must be logged in to create one' });
      }

      const s = await Session.create({ title: `Session ${new Date().toLocaleString()}`, mode: 'ADVISOR', userId, tenantId: tenantDoc._id });
      sessionId = s._id.toString();
    }
  }

  let runId: string;
  if (useMock) {
    const run = store.createRun(sessionId);
    runId = run.id;
    store.addStep(runId, 'plan', 'done');
  } else {
    const run = await Run.create({ sessionId, status: 'running', steps: [{ name: 'plan', status: 'done' }] });
    runId = run._id.toString();
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
    { role: 'user', content: String(text || '') }
  ];

  let lastResult: any = null;

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
    ev({ type: result.ok ? 'step_done' : 'step_failed', data: { name: `execute:${plan.name}`, result } });
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
          ev({ type: 'text', data: `سعر ${base} مقابل ${sym} اليوم: ${Number(rate).toFixed(4)} ${sym}` });
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
            ev({ type: 'text', data: `سعر ${base} مقابل ${sym} اليوم: ${Number(rate2).toFixed(4)} ${sym}` });
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
          if (tempC !== null && !Number.isNaN(tempC)) {
            ev({ type: 'text', data: `درجة الحرارة في ${city} اليوم: ${tempC.toFixed(0)}°C` });
          }
        }
      } catch {}
    }

    // Store execution
    if (useMock) {
        store.addExec(runId, plan.name, plan.input, result.output, result.ok, result.logs);
        if (result.artifacts) {
            result.artifacts.forEach(a => {
                store.addArtifact(runId, a.name, a.href);
                ev({ type: 'artifact_created', data: { name: a.name, href: a.href } });
            });
        }
    } else {
        await ToolExecution.create({ runId, name: plan.name, input: plan.input, output: result.output, ok: result.ok, logs: result.logs });
        if (result.artifacts) {
             for (const a of result.artifacts) {
                await Artifact.create({ runId, name: a.name, href: a.href });
                ev({ type: 'artifact_created', data: { name: a.name, href: a.href } });
             }
        }
    }

    // Add to history for next iteration
    history.push({ role: 'assistant', content: `I will execute tool: ${plan.name} with input: ${JSON.stringify(plan.input)}` });
    history.push({ role: 'user', content: `Tool ${plan.name} executed. Output: ${String(JSON.stringify(result.output) || '').slice(0, 1000)}` });

    if (plan.name === 'echo') {
      // Echo means the agent wants to speak to the user, usually finishing the task
      break;
    }

    steps++;
  }

  // Summarize final result
  let finalResponse = '';
  if (lastResult?.ok) {
    if (plan && plan.name === 'echo' && lastResult.output && typeof lastResult.output.text === 'string') {
        finalResponse = lastResult.output.text;
    } else {
        try {
            const { summarizeToolOutput } = await import('../llm');
            ev({ type: 'step_started', data: { name: 'summarize' } });
            // Summarize based on original request and last result
            finalResponse = await summarizeToolOutput(String(text || ''), plan?.name || 'unknown', lastResult.output);
            ev({ type: 'text', data: finalResponse });
            ev({ type: 'step_done', data: { name: 'summarize', result: { output: finalResponse } } });
        } catch (err) {
            console.warn('Summarization failed:', err);
            finalResponse = String(lastResult?.output ?? '').slice(0, 512);
        }
    }
  } else {
      finalResponse = String(lastResult?.error || 'Unknown error');
  }

  if (useMock) {
    store.updateRun(runId, { status: lastResult?.ok ? 'done' : 'failed' });
  } else {
    await Run.findByIdAndUpdate(runId, { $set: { status: lastResult?.ok ? 'done' : 'failed' }, $push: { steps: { name: `finish`, status: lastResult?.ok ? 'done' : 'failed' } } });
  }

  ev({ type: 'run_finished', data: { runId, ok: lastResult?.ok } });
  // persist messages if sessionId provided
  try {
    if (sessionId) {
      const isAuthed2 = Boolean((req as any).auth);
      const useMock2 = !isAuthed2 ? true : (process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1);
      if (useMock2) {
        store.addMessage(sessionId, 'user', String(text || ''));
        store.addMessage(sessionId, 'assistant', finalResponse || (lastResult?.output ? String(lastResult.output).slice(0, 512) : String(lastResult?.error || '')));
      } else {
        const { Message } = await import('../models/message');
        const userMsg = await Message.create({ sessionId, role: 'user', content: String(text || '') });
        
        const asstContent = finalResponse || (lastResult?.output ? String(lastResult.output).slice(0, 512) : String(lastResult?.error || ''));
        const asstMsg = await Message.create({ sessionId, role: 'assistant', content: asstContent });
        const { Session } = await import('../models/session');
        await Session.findByIdAndUpdate(sessionId, { $set: { lastSnippet: String(asstContent || '').slice(0, 140), lastUpdatedAt: new Date() } });
      }
    }
  } catch {}
  res.json({ runId, result: lastResult, sessionId });
});

router.get('/', async (_req: Request, res: Response) => {
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  if (useMock) {
    res.json({ runs: store.listRuns() });
  } else {
    const runs = await Run.find().lean();
    res.json({ runs });
  }
});

router.post('/plan', async (req: Request, res: Response) => {
  const { text } = req.body || {};
  const ev = (e: LiveEvent) => broadcast(e);
  ev({ type: 'step_started', data: { name: 'plan' } });
  const plan = pickToolFromText(String(text || ''));
  ev({ type: 'step_done', data: { name: 'plan', plan } });
  res.json({ plan });
});

router.post('/qa', async (_req: Request, res: Response) => {
  const prompts: string[] = [
    'كم سعر الدولار اليوم بالنسبة لليرة التركية',
    'سعر الدينار الكويتي مقابل الشيكل اليوم',
    'أريد سعر اليورو مقابل الدولار الأمريكي',
    'صمم صورة قطة لطيفة',
    'صمم صورة شعار بسيط بألوان الأزرق والأبيض',
    'تصميم صورة أيقونية لمتجر الكتروني',
    'ابحث عن أفضل مكتبات React للأداء',
    'بحث عن أحدث أخبار الذكاء الاصطناعي',
    'search حول تاريخ العملة التركية',
    'صمم صفحة هبوط بسيطة',
    'أريد صفحة HTML تعرض بطاقات منتجات',
    'landing page بالعربية',
    'بناء موقع لمتجر الكتروني وعرضه أمامي',
    'أريد متجر إلكتروني بسيط',
    'ecommerce demo site',
    'browser https://example.com',
    'خذ لقطة شاشة لصفحة https://www.wikipedia.org',
    'browser snapshot لهذه الصفحة https://news.ycombinator.com',
    'write هذه ملاحظة مهمة',
    'write سجل الملاحظات اليوم',
    'write قائمة المهام',
    'تصميم صفحة ثم عرضها',
    'صمم صورة ثم أعرض الرابط',
    'ابحث ثم لخص النتائج',
    'قيمة الدولار مقابل الليرة التركية',
    'سعر دينار كويتي ضد شيكل',
    'قيمة اليورو مقابل دولار',
    'تصميم صورة كلب مرح',
    'تصميم صورة طائر ملون',
    'صمم صورة خلفية بدرجات الأزرق',
    'صفحة HTML تحتوي عنوان ومحتوى',
    'landing عربية مع بطاقات',
    'إنشاء صفحة منتجات',
    'متجر بسيط يعرض 6 منتجات',
    'shop demo',
    'ecommerce Arabic',
    'ابحث عن أطر CSS الحديثة',
    'بحث عن أدوات اختبار الواجهة',
    'search new js features',
    'browser https://www.google.com',
    'browser https://www.bbc.com',
    'browser https://vercel.com',
    'echo مرحباً جو',
    'echo هذا اختبار موسع',
    'echo النهاية',
    'سعر الدولار مقابل الشيكل',
    'ابحث عن سعر الذهب اليوم',
    'landing page dark mode',
    'متجر متعدد الصفحات بسيط',
    'write مذكرة للفريق بالعربية',
  ];
  const results: Array<{ text: string; ok: boolean; reason?: string }> = [];
  for (const text of prompts) {
    try {
      const plan = pickToolFromText(text);
      if (plan.name === 'web_search') {
        await new Promise(r => setTimeout(r, 1200));
      } else {
        await new Promise(r => setTimeout(r, 200));
      }
      const result = await executeTool(plan.name, plan.input);
      const ok = !!result.ok;
      results.push({ text, ok, reason: ok ? undefined : (result.error || 'error') });
    } catch (e: any) {
      results.push({ text, ok: false, reason: e?.message || 'error' });
    }
  }
  const passed = results.filter(r => r.ok).length;
  const failed = results.length - passed;
  res.json({ passed, failed, results });
});

export default router;
