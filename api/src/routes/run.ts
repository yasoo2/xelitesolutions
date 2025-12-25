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
import { planNextStep, generateSessionTitle, SYSTEM_PROMPT } from '../llm';
import { authenticate } from '../middleware/auth';
import { Session } from '../models/session';
import { Message } from '../models/message';
import { FileModel } from '../models/file';
import { MemoryService } from '../services/memory';
import { MemoryItem } from '../models/memoryItem';

const router = Router();

function redactSecretsFromString(input: string): string {
  return input
    .replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, 'sk-[REDACTED]')
    .replace(/\bBearer\s+[A-Za-z0-9._-]{10,}\b/g, 'Bearer [REDACTED]')
    .replace(/([?&]key=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/\bx-worker-key\b\s*[:=]\s*[A-Za-z0-9._-]{6,}/gi, 'x-worker-key:[REDACTED]')
    .replace(/\b(WORKER_API_KEY|BROWSER_WORKER_KEY|JWT_SECRET)\b\s*[:=]\s*[A-Za-z0-9._-]{6,}/gi, '$1=[REDACTED]');
}

function safeErrorMessage(err: any): string {
  const raw = typeof err?.message === 'string' ? err.message : String(err);
  return redactSecretsFromString(raw);
}

function redactToolInputForStorage(name: string, input: any) {
  if (!input || typeof input !== 'object') return input;
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
  
  if (provider === 'llm') {
      return res.status(400).json({ error: 'Local intelligence is disabled. Please provide an API key.' });
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
    console.error('Verify error:', safeErrorMessage(err));
    return res.status(401).json({ error: safeErrorMessage(err) || 'Connection failed' });
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

  const systemPromptEventId = `system_prompt:${sessionId}`;
  let systemPromptCreated = false;
  let systemPromptText: string | null = null;

  const ev = (e: LiveEvent) => broadcast({ ...e, runId });

  try {
    if (useMock) {
      const hist = store.listMessages(sessionId);
      const already = hist.some(m => m.role === 'system');
      if (!already) {
        store.addMessage(sessionId, 'system', SYSTEM_PROMPT, runId);
        systemPromptCreated = true;
        systemPromptText = SYSTEM_PROMPT;
        ev({ type: 'text', id: systemPromptEventId, data: SYSTEM_PROMPT });
      }
    } else {
      const existing = await Message.findOne({ sessionId, role: 'system' }).select({ _id: 1 }).lean();
      if (!existing) {
        await Message.create({ sessionId, role: 'system', content: SYSTEM_PROMPT, runId });
        systemPromptCreated = true;
        systemPromptText = SYSTEM_PROMPT;
        ev({ type: 'text', id: systemPromptEventId, data: SYSTEM_PROMPT });
      }
    }
  } catch (e) {
    console.warn('Failed to create system prompt message:', safeErrorMessage(e));
  }

  ev({ type: 'step_started', data: { name: 'plan' } });

  let plan = null;
  try {
      plan = await planNextStep(
        [{ role: 'user', content: initialContent }],
        { provider, apiKey, baseUrl, model, mock: useMock }
      );
  } catch (err) {
      console.warn('LLM planning error:', safeErrorMessage(err));
  }

  ev({ type: 'step_done', data: { name: 'plan', plan } });
  if (useMock) {
    store.addStep(runId, 'plan', 'done');
  } else {
    try {
      await Run.findByIdAndUpdate(runId, { $push: { steps: { name: 'plan', status: 'done' } } });
    } catch {}
  }

  // Save User Message to DB
  if (useMock) {
    store.addMessage(sessionId, 'user', String(text || ''), runId);
  } else {
    await Message.create({ sessionId, role: 'user', content: String(text || ''), runId });
  }

  const risk = detectRisk(String(text || ''));
  if (risk && plan) {
    if (useMock) {
      const ap = store.createApproval(runId, String(text || ''), risk, plan.name, plan.input);
      ev({ type: 'approval_required', data: { id: ap.id, runId, risk, action: text } });
      store.updateRun(runId, { status: 'blocked' });
      // store plan context for continuation
      const { planContext } = await import('../approvals/context');
      planContext.set(ap.id, { runId, name: plan.name, input: plan.input });
      return res.json({
        runId,
        sessionId,
        blocked: true,
        approvalId: ap.id,
        ...(systemPromptCreated ? { systemPrompt: systemPromptText, systemPromptId: systemPromptEventId } : {})
      });
    } else {
      const ap = await Approval.create({ runId, action: String(text || ''), risk, status: 'pending' });
      ev({ type: 'approval_required', data: { id: ap._id.toString(), runId, risk, action: text } });
      await Run.findByIdAndUpdate(runId, { $set: { status: 'blocked' } });
      const { planContext } = await import('../approvals/context');
      planContext.set(ap._id.toString(), { runId, name: plan.name, input: plan.input });
      return res.json({
        runId,
        sessionId,
        blocked: true,
        approvalId: ap._id.toString(),
        ...(systemPromptCreated ? { systemPrompt: systemPromptText, systemPromptId: systemPromptEventId } : {})
      });
    }
  }

  // --- Agent Loop ---
  let steps = 0;
  const MAX_STEPS = 50;
  
  // Load Conversation History
  let previousMessages: { role: 'user' | 'assistant' | 'system', content: string }[] = [];
  if (sessionId) {
       if (useMock) {
           const hist = store.listMessages(sessionId);
           // Exclude the current message we just added (if any logic added it already? Line 335 adds it)
           // Store adds it to memory. We want all *previous* interactions.
           // Store.listMessages returns all. 
           // We filter out current run messages to avoid duplication with 'initialContent' which is added to history array manually.
           // And we take the last 20.
           previousMessages = hist.filter(m => m.runId !== runId).slice(-20).map(m => ({ role: m.role as any, content: m.content }));
       } else {
           const docs = await Message.find({ sessionId, runId: { $ne: runId } })
               .sort({ createdAt: -1 }) // Get newest first
               .limit(20); // Last 20 messages
           // Reverse to chronological order (Old -> New)
           previousMessages = docs.reverse().map(d => ({ role: d.role as any, content: d.content }));
       }
   }

  const history: { role: 'user' | 'assistant' | 'system', content: string | any[] }[] = [
    ...previousMessages,
    { role: 'user', content: initialContent }
  ];

  let lastResult: any = null;
  let forcedText: string | null = null;
  let assistantTextEmitted = false;

  while (steps < MAX_STEPS) {
    ev({ type: 'step_started', data: { name: `thinking_step_${steps + 1}` } });
    
    // Plan next step with history
    try {
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

        plan = await planNextStep(history, { provider, apiKey, baseUrl, model, throwOnError, mock: useMock });
    } catch (err: any) {
        console.warn('LLM planning error:', safeErrorMessage(err));
        if (err?.status === 401 || err?.code === 'invalid_api_key' || (err?.error?.code === 'invalid_api_key')) {
             ev({ type: 'text', data: '⚠️ **Authentication Failed**: The AI provider rejected the API Key. Please check your settings in the provider menu.' });
             forcedText = 'Authentication Failed';
             assistantTextEmitted = true;
             break;
        }
        plan = null;
    }

    if (!plan) {
      // Fallback if LLM fails
      if (steps === 0) {
        // No heuristics allowed. If LLM fails, we stop.
        // plan = pickToolFromText(String(text || '')); 
        plan = null;
      }
      else break; // Stop if we can't plan anymore
      
      if (!plan) {
          // If heuristics also failed (returned null), we have no way to handle this request.
          // This ensures we rely on AI Keys or specific hardcoded tools (browser, etc) only.
          const msg = !process.env.OPENAI_API_KEY && !apiKey 
              ? "⚠️ **No Intelligence Found**\nPlease add your OpenAI or Anthropic API Key in the settings menu to enable Joe AI."
              : "⚠️ **Connection Error**\nFailed to connect to the AI provider. Please check your internet connection or API key settings.";
          
          ev({ type: 'text', data: msg });
          forcedText = msg;
          assistantTextEmitted = true;
          break;
      }
    }
    
    if (kind === 'chat' && /^browser_/.test(String(plan.name || ''))) {
      const msg = 'أدوات المتصفح تعمل فقط داخل وضع الوكيل. انتقل إلى تبويب الوكيل لفتح المواقع داخل المتصفح.';
      ev({ type: 'text', data: msg });
      forcedText = msg;
      assistantTextEmitted = true;
      break;
    }

    const planName = String(plan.name || '');
    const isBrowserTool = /^browser_/.test(planName);
    if (kind === 'agent' && isBrowserTool) {
      const reqSid = typeof browserSessionId === 'string' ? browserSessionId.trim() : '';
      const inputSid = String((plan as any)?.input?.sessionId || '').trim();
      const hasSid = !!(reqSid || inputSid);
      if (!hasSid) {
        const userText = String(text || '');
        if (isWeatherLikeQuery(userText)) {
          const city = extractWeatherCity(userText);
          plan = {
            name: 'http_fetch',
            input: { url: `https://wttr.in/${encodeURIComponent(city)}?format=j1`, city },
          } as any;
        } else {
          const tn = normalizeArabicQuery(userText);
          const hasUrl = /https?:\/\/\S+/i.test(userText);
          const isExplicitOpen =
            hasUrl || /(open|افتح|اذهب|ادخل|دخول|فتح|زيارة|browser)/i.test(tn);
          if (!isExplicitOpen) {
            plan = { name: 'web_search', input: { query: userText || planName } } as any;
          } else {
            const msg = 'المتصفح غير مفتوح في وضع الوكيل. افتح المتصفح في الوسط أولاً ثم أعد تنفيذ أمر المتصفح.';
            ev({ type: 'text', data: msg });
            forcedText = msg;
            assistantTextEmitted = true;
            break;
          }
        }
      }
    }

    if (kind === 'agent' && String(plan.name || '') === 'browser_open' && typeof browserSessionId === 'string' && browserSessionId.trim()) {
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
      kind === 'agent' &&
      typeof browserSessionId === 'string' &&
      browserSessionId.trim() &&
      ['browser_run', 'browser_get_state', 'browser_extract'].includes(String(plan.name || ''))
    ) {
      const input = (plan as any).input;
      if (!input || typeof input !== 'object') (plan as any).input = {};
      if (!(plan as any).input.sessionId) (plan as any).input.sessionId = browserSessionId.trim();
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
          const ap = store.createApproval(runId, actionText, risk, plan.name, redactToolInputForStorage(plan.name, plan.input));
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

    const persistedInput = redactToolInputForStorage(plan.name, plan.input);
    ev({ type: 'step_started', data: { name: `execute:${plan.name}`, input: persistedInput } });
    const result = await executeTool(plan.name, plan.input);
    
    // Add result to history to prevent infinite loops
    history.push({ 
        role: 'assistant', 
        content: `Tool Call: ${plan.name}\nInput: ${JSON.stringify(persistedInput)}\nOutput: ${JSON.stringify(result.output || result.error || 'Done')}` 
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

    ev({ type: result.ok ? 'step_done' : 'step_failed', data: { name: `execute:${plan.name}`, result } });
    
    // Stop on fatal errors (403, verification, etc.)
    if (!result.ok && plan.name === 'image_generate') {
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

    if (result.ok && plan.name === 'echo') {
      const text = result.output?.text;
      if (text) {
        forcedText = text;
        ev({ type: 'text', data: text });
        assistantTextEmitted = true;
      }
    }

    if (result.ok && plan.name === 'image_generate') {
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
      assistantTextEmitted = true;
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
            assistantTextEmitted = true;
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
          const limit = 5;
          const displayResults = results.slice(0, limit);
          
          for (let i = 0; i < displayResults.length; i++) {
            const r = displayResults[i];
            const title = String(r.title || '').trim();
            const url = String(r.url || '').trim();
            const desc = String(r.description || '').trim();
            let domain = '';
            try { domain = new URL(url).hostname; } catch {}
            const num = `${i + 1}.`;
            const head = domain ? `${num} **[${title}](${url})** _(${domain})_` : `${num} **[${title}](${url})**`;
            mdParts.push(head);
            if (desc) mdParts.push(`   > ${desc.slice(0, 150)}...`);
            mdParts.push('');
          }
          const mds = mdParts.join('\n');
          forcedText = mds;
          ev({ type: 'text', data: mds });
          assistantTextEmitted = true;
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
        assistantTextEmitted = true;
      } catch {}
    }

    if (useMock) {
      store.addExec(runId, plan.name, persistedInput, result.output, result.ok, result.logs);
    } else {
      await ToolExecution.create({ runId, name: plan.name, input: persistedInput, output: result.output, ok: result.ok, logs: result.logs });
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

  const finalContent = forcedText || (lastResult?.output ? JSON.stringify(lastResult.output) : 'No output');

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
