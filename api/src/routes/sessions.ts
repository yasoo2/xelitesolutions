import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { Session } from '../models/session';
import { Message } from '../models/message';
import { store } from '../mock/store';
import { authenticate } from '../middleware/auth';
import { Run } from '../models/run';
import { ToolExecution } from '../models/toolExecution';
import { Summary } from '../models/summary';
import { MemoryService } from '../services/memory';
import { generateSummary, SYSTEM_PROMPT, planNextStep } from '../llm';
import { MemoryItem } from '../models/memoryItem';
import { broadcast } from '../ws';
import { executeTool } from '../tools/registry';
import { getSessionRunConfig, popPendingTool, setPendingTool, setSessionSecret, setUserSecretEncrypted } from '../services/secrets';
import { Tenant } from '../models/tenant';

const router = Router();

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

function isGitAuthError(raw: string) {
  const s = String(raw || '');
  return (
    /Authentication failed/i.test(s) ||
    /terminal prompts disabled/i.test(s) ||
    /could not read Username/i.test(s) ||
    /fatal: Authentication failed/i.test(s) ||
    /Missing GitHub token/i.test(s) ||
    /Bad credentials/i.test(s) ||
    /\b401\b/.test(s) ||
    /\b403\b/.test(s)
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

// Create Session
router.post('/', authenticate as any, async (req: Request, res: Response) => {
  const rawTitle = typeof req.body?.title === 'string' ? req.body.title : '';
  const title = rawTitle && rawTitle.trim() ? rawTitle.trim() : 'New Session';
  const kind: 'chat' | 'agent' = (typeof req.body?.kind === 'string' && req.body.kind === 'agent') ? 'agent' : 'chat';
  const mode: 'ADVISOR' | 'BUILDER' | 'SAFE' | 'OWNER' = 'ADVISOR';
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  const userId = (req as any).auth?.sub;

  try {
    if (useMock) {
      const session = store.createSession(title, mode, kind);
      return res.json(session);
    }

    const tenantName = process.env.DEFAULT_TENANT_NAME || 'XElite Solutions';
    const tenantDoc = await Tenant.findOneAndUpdate(
      { name: tenantName },
      { $setOnInsert: { name: tenantName } },
      { upsert: true, new: true }
    );

    try {
      const session = await Session.create({ title, mode, kind, userId, tenantId: tenantDoc._id });
      return res.json(session);
    } catch (err: any) {
      // Handle duplicate title per user gracefully
      if (err && err.code === 11000) {
        const uniqueTitle = `${title} - ${new Date().toLocaleString()}`;
        const session = await Session.create({ title: uniqueTitle, mode, kind, userId, tenantId: tenantDoc._id });
        return res.json(session);
      }
      throw err;
    }
  } catch (e) {
    return res.status(500).json({ error: 'Failed to create session' });
  }
});

// Pin/unpin a session
router.patch('/:id/pin', authenticate as any, async (req: Request, res: Response) => {
  const id = String(req.params.id || '').trim();
  const isPinned = !!req.body?.isPinned;
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  try {
    if (useMock) {
      const s = store.getSession(id);
      if (s) (s as any).isPinned = isPinned;
      return res.json({ ok: true });
    }
    await Session.findByIdAndUpdate(id, { $set: { isPinned, lastUpdatedAt: new Date() } });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to update pin' });
  }
});

// Move a session to a folder or root
router.patch('/:id/move', authenticate as any, async (req: Request, res: Response) => {
  const id = String(req.params.id || '').trim();
  const folderIdRaw = req.body?.folderId;
  const folderId = typeof folderIdRaw === 'string' && folderIdRaw.trim() ? folderIdRaw.trim() : null;
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  try {
    if (useMock) {
      const s = store.getSession(id);
      if (s) (s as any).folderId = folderId || undefined;
      return res.json({ ok: true });
    }
    await Session.findByIdAndUpdate(id, { $set: { folderId: folderId || undefined, lastUpdatedAt: new Date() } });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to move session' });
  }
});

router.post('/:id/secrets', authenticate as any, async (req: Request, res: Response) => {
  const sessionId = String(req.params.id || '').trim();
  const key = String(req.body?.key || '').trim();
  const value = typeof req.body?.value === 'string' ? req.body.value : String(req.body?.value ?? '');
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  const userId = (req as any).auth?.sub;

  if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });
  if (!key) return res.status(400).json({ error: 'Missing key' });
  if (!value) return res.status(400).json({ error: 'Missing value' });
  if (value.length > 8000) return res.status(400).json({ error: 'Value too large' });

  setSessionSecret(sessionId, key, value);

  if (!useMock && userId) {
    const providerRaw = typeof req.body?.provider === 'string' ? req.body.provider : '';
    const provider =
      providerRaw.trim() ||
      (key === 'GITHUB_TOKEN' ? 'github' : key === 'HTTP_BEARER_TOKEN' ? 'generic' : 'generic');
    try {
      await setUserSecretEncrypted(String(userId), provider, key, value);
    } catch {}
  }

  const pending = popPendingTool(sessionId);
  if (!pending) return res.json({ ok: true });

  if (useMock) {
    store.updateRun(pending.runId, { status: 'running' as any });
  } else {
    try { await Run.findByIdAndUpdate(pending.runId, { $set: { status: 'running' } }); } catch {}
  }

  const redactedPendingInput = redactToolInputForStorage(pending.name, pending.input);
  broadcast({ type: 'step_started', runId: pending.runId, data: { name: `execute:${pending.name}`, input: redactedPendingInput } });
  const callPendingInput =
    userId && pending.input && typeof pending.input === 'object' ? { ...(pending.input as any), userId: String(userId) } : pending.input;
  const result = await executeTool(pending.name, callPendingInput);
  broadcast({ type: result.ok ? 'step_done' : 'step_failed', runId: pending.runId, data: { name: `execute:${pending.name}`, result } });

  const toText = (r: any) => {
    const toolName = String(pending?.name || '');
    const outStr =
      typeof r?.output?.output === 'string'
        ? r.output.output
        : typeof r?.output?.text === 'string'
          ? r.output.text
          : r?.output != null
            ? JSON.stringify(r.output)
            : '';
    if (r?.ok) {
      if (toolName === 'github_create_repo') {
        const fullName = typeof r?.output?.fullName === 'string' ? r.output.fullName : '';
        const htmlUrl = typeof r?.output?.htmlUrl === 'string' ? r.output.htmlUrl : '';
        const parts = ['✅ تم إنشاء المستودع على GitHub.'];
        if (fullName) parts.push(`- الاسم: ${fullName}`);
        if (htmlUrl) parts.push(`- الرابط: ${htmlUrl}`);
        return parts.join('\n');
      }
      return outStr || 'تم التنفيذ بنجاح.';
    }
    const errStr = typeof r?.error === 'string' ? r.error : Array.isArray(r?.logs) ? r.logs.join('\n') : 'فشل التنفيذ.';
    if (toolName === 'github_create_repo') {
      const repoName = typeof pending?.input?.name === 'string' ? pending.input.name : '';
      const already = /already exists/i.test(errStr);
      const parts = [`❌ فشل إنشاء المستودع على GitHub.${repoName ? ` (الاسم المطلوب: ${repoName})` : ''}`, `- السبب: ${errStr}`];
      if (already) {
        parts.push('- الاسم موجود مسبقاً على الحساب. جرّب اسم مختلف (مثال: vivos-app أو vivos-2).');
      } else if (/422\b/.test(errStr)) {
        parts.push('- هذا عادةً يعني أن الاسم غير متاح/غير صالح. جرّب اسم مختلف أو تحقق من صلاحيات التوكن.');
      }
      return parts.join('\n');
    }
    return `فشل التنفيذ: ${errStr}`;
  };

  const assistantText = toText(result);
  broadcast({ type: 'text', runId: pending.runId, data: assistantText });

  if (useMock) {
    store.addExec(pending.runId, pending.name, redactedPendingInput, result.output, result.ok, result.logs);
    store.addMessage(sessionId, 'assistant', assistantText, pending.runId);
  } else {
    try {
      await ToolExecution.create({
        runId: pending.runId,
        name: pending.name || 'unknown',
        input: redactedPendingInput,
        output: result.output,
        ok: result.ok,
        logs: result.logs,
      });
    } catch {}
    try {
      await Message.create({ sessionId, role: 'assistant', content: assistantText, runId: pending.runId });
    } catch {}
  }

  const runCfg = getSessionRunConfig(sessionId);
  let kind: 'chat' | 'agent' = runCfg?.kind === 'agent' ? 'agent' : 'chat';
  if (!useMock) {
    try {
      const s = await Session.findById(sessionId).select({ kind: 1 }).lean();
      if (s?.kind === 'agent') kind = 'agent';
    } catch {}
  }

  const provider = typeof runCfg?.provider === 'string' ? runCfg.provider : undefined;
  const apiKey = typeof runCfg?.apiKey === 'string' ? runCfg.apiKey : undefined;
  const baseUrl = typeof runCfg?.baseUrl === 'string' ? runCfg.baseUrl : undefined;
  const model = typeof runCfg?.model === 'string' ? runCfg.model : undefined;
  let browserSessionId = typeof runCfg?.browserSessionId === 'string' ? runCfg.browserSessionId : undefined;

  const continueAgent = async () => {
    const MAX_STEPS = 25;
    const providerKey = String(provider || 'llm').trim().toLowerCase();
    const plannerMock = !apiKey && !process.env.OPENAI_API_KEY;

    const loadHistory = async () => {
      if (useMock) {
        const msgs = store
          .listMessages(sessionId)
          .filter((m) => m.role !== 'system')
          .slice(-20)
          .map((m) => ({ role: m.role as any, content: m.content }));
        return msgs as Array<{ role: 'user' | 'assistant' | 'system'; content: string | any[] }>;
      }
      const docs = await Message.find({ sessionId, role: { $ne: 'system' } })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();
      return docs
        .reverse()
        .map((d: any) => ({ role: d.role as any, content: d.content })) as Array<{
        role: 'user' | 'assistant' | 'system';
        content: string | any[];
      }>;
    };

    const history = await loadHistory();
    history.push({
      role: 'assistant',
      content: `Tool Call: ${pending.name}\nInput: ${JSON.stringify(redactedPendingInput)}\nOutput: ${JSON.stringify(
        result.output || result.error || 'Done'
      )}`,
    });

    let steps = 0;
    let lastResult: any = null;
    let forcedText: string | null = null;
    let assistantTextEmitted = false;
    let finalOk = true;

    while (steps < MAX_STEPS) {
      broadcast({ type: 'step_started', runId: pending.runId, data: { name: `thinking_step_${steps + 1}` } });
      let plan: { name: string; input: any; thought?: string | null } | null = null;
      try {
        plan = await planNextStep(history, { provider, apiKey, baseUrl, model, throwOnError: false, mock: plannerMock });
      } catch (e: any) {
        const msg = safeErrorMessage(e);
        broadcast({ type: 'text', runId: pending.runId, data: `⚠️ تعذّر التخطيط للخطوة التالية: ${msg}` });
        forcedText = `⚠️ تعذّر التخطيط للخطوة التالية: ${msg}`;
        assistantTextEmitted = true;
        finalOk = false;
        break;
      }

      if (!plan) break;

      const planName = String(plan?.name || '');
      if (planName === 'browser_open' && typeof browserSessionId === 'string' && browserSessionId.trim()) {
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

      broadcast({ type: 'step_done', runId: pending.runId, data: { name: `thinking_step_${steps + 1}`, plan } });
      if (plan?.thought) {
          console.log('[DEBUG] Thought broadcasted:', plan.thought);
      } else {
          console.log('[DEBUG] No thought in plan');
      }


      if (String(plan?.name || '') === 'browser_run') {
        const acts = Array.isArray((plan as any).input?.actions) ? (plan as any).input.actions : [];
        let sensitive = false;
        for (const a of acts) {
          const t = String(a?.type || '').toLowerCase();
          if (t === 'uploadfile') sensitive = true;
          if (t === 'fillform') {
            const fields = Array.isArray(a?.fields) ? a.fields : [];
            for (const f of fields) {
              const s = (String(f?.label || '') + ' ' + String(f?.selector || '')).toLowerCase();
              if (/(password|card|cvv|iban|ssn|بطاقة|دفع|كلمة المرور|حساسية|حساب)/.test(s)) {
                sensitive = true;
                break;
              }
            }
          }
          if (t === 'click') {
            const s = (String(a?.roleName || '') + ' ' + String(a?.selector || '')).toLowerCase();
            if (/(delete|pay|submit|login|حذف|دفع|ارسال|تسجيل دخول)/.test(s)) sensitive = true;
          }
          if (sensitive) break;
        }
        if (sensitive) {
          const { planContext } = await import('../approvals/context');
          const { Approval } = await import('../models/approval');
          const actionText = 'browser_run';
          const risk = 'high';
          if (useMock) {
            const ap = store.createApproval(
              pending.runId,
              actionText,
              risk,
              plan?.name || '',
              redactToolInputForStorage(plan?.name || '', plan?.input)
            );
            broadcast({ type: 'approval_required', runId: pending.runId, data: { id: ap.id, runId: pending.runId, risk, action: actionText } });
            store.updateRun(pending.runId, { status: 'blocked' as any });
            planContext.set(ap.id, { runId: pending.runId, name: plan?.name || '', input: plan?.input });
            return { blocked: true, approvalId: ap.id };
          }
          const ap = await Approval.create({ runId: pending.runId, action: actionText, risk, status: 'pending' });
          broadcast({ type: 'approval_required', runId: pending.runId, data: { id: ap._id.toString(), runId: pending.runId, risk, action: actionText } });
          try { await Run.findByIdAndUpdate(pending.runId, { $set: { status: 'blocked' } }); } catch {}
          planContext.set(ap._id.toString(), { runId: pending.runId, name: plan?.name || '', input: plan?.input });
          return { blocked: true, approvalId: ap._id.toString() };
        }
      }

      const persistedInput = redactToolInputForStorage(plan?.name || '', plan?.input);
      broadcast({ type: 'step_started', runId: pending.runId, data: { name: `execute:${plan?.name}`, input: persistedInput } });
      const callInput =
        userId && plan?.input && typeof plan.input === 'object' ? { ...(plan.input as any), userId: String(userId) } : plan?.input;
      const stepResult = await executeTool(plan?.name || '', callInput);

      if (stepResult?.ok && plan?.name === 'browser_open') {
        const sid = String(stepResult?.output?.sessionId || '').trim();
        if (sid) browserSessionId = sid;
      }

      if (stepResult.ok && String(plan?.name || '') === 'http_fetch') {
        const status = Number((stepResult as any)?.output?.status);
        if (status === 401 || status === 403) {
          const urlStr = String((plan as any)?.input?.url || '').trim();
          const msg = [
            `⚠️ الوصول لهذا الرابط يحتاج تسجيل دخول أو توكن.`,
            urlStr ? `- الرابط: ${urlStr}` : ``,
            `- أدخل Bearer Token في نافذة التوكن وأرسله.`,
            `- سيتم حفظ التوكن بشكل آمن لهذا الحساب ولن يظهر في المحادثة.`,
          ]
            .filter(Boolean)
            .join('\n');
          broadcast({ type: 'text', runId: pending.runId, data: msg });
          broadcast({
            type: 'secret_required',
            runId: pending.runId,
            data: { sessionId, runId: pending.runId, provider: 'generic', key: 'HTTP_BEARER_TOKEN', label: 'Bearer Token', reason: `HTTP ${status}` },
          });
          setPendingTool(String(sessionId), { runId: pending.runId, name: String(plan?.name || ''), input: plan?.input });
          if (useMock) store.updateRun(pending.runId, { status: 'blocked' as any });
          else try { await Run.findByIdAndUpdate(pending.runId, { $set: { status: 'blocked' } }); } catch {}
          return { blocked: true, secretRequired: true, secret: { provider: 'generic', key: 'HTTP_BEARER_TOKEN', label: 'Bearer Token' } };
        }
      }

      broadcast({ type: stepResult.ok ? 'step_done' : 'step_failed', runId: pending.runId, data: { name: `execute:${plan?.name}`, result: stepResult } });

      if (useMock) {
        store.addExec(pending.runId, plan?.name || 'unknown', persistedInput, stepResult.output, stepResult.ok, stepResult.logs || []);
      } else {
        try {
          await ToolExecution.create({
            runId: pending.runId,
            name: plan?.name || 'unknown',
            input: persistedInput,
            output: stepResult.output,
            ok: stepResult.ok,
            logs: stepResult.logs || [],
          });
        } catch {}
      }

      const toolCallSummary = `Tool Call: ${plan?.name}\nInput: ${JSON.stringify(persistedInput)}\nOutput: ${JSON.stringify(
        stepResult.output || stepResult.error || 'Done'
      )}`;
      history.push({ role: 'assistant', content: toolCallSummary });
      lastResult = stepResult;

      if (!stepResult.ok) {
        const errorMsg = safeErrorMessage(stepResult.error || (stepResult.logs ? stepResult.logs.join('\n') : 'Unknown error'));
        if (String(plan?.name || '') === 'git_ops' && isGitAuthError(errorMsg)) {
          const msg = [
            `⚠️ مطلوب تسجيل دخول قبل دفع التحديثات إلى GitHub.`,
            `- أدخل توكن GitHub (Personal Access Token) في نافذة التوكن وأرسله.`,
            `- سيتم حفظ التوكن بشكل آمن لهذا الحساب ولن يظهر في المحادثة.`,
          ].join('\n');
          broadcast({ type: 'text', runId: pending.runId, data: msg });
          broadcast({
            type: 'secret_required',
            runId: pending.runId,
            data: { sessionId, runId: pending.runId, provider: 'github', key: 'GITHUB_TOKEN', label: 'GitHub Token', reason: 'git push يحتاج مصادقة' },
          });
          setPendingTool(String(sessionId), { runId: pending.runId, name: String(plan?.name || ''), input: plan?.input });
          if (useMock) store.updateRun(pending.runId, { status: 'blocked' as any });
          else try { await Run.findByIdAndUpdate(pending.runId, { $set: { status: 'blocked' } }); } catch {}
          return { blocked: true, secretRequired: true, secret: { provider: 'github', key: 'GITHUB_TOKEN', label: 'GitHub Token' } };
        }
        if (String(plan?.name || '') === 'github_create_repo' && isGithubAuthError(errorMsg)) {
          const msg = [
            `⚠️ مطلوب توكن GitHub لإنشاء مستودع جديد عبر API.`,
            `- أدخل GitHub Personal Access Token في نافذة التوكن وأرسله.`,
            `- سيتم حفظ التوكن بشكل آمن لهذا الحساب ولن يظهر في المحادثة.`,
          ].join('\n');
          broadcast({ type: 'text', runId: pending.runId, data: msg });
          broadcast({
            type: 'secret_required',
            runId: pending.runId,
            data: { sessionId, runId: pending.runId, provider: 'github', key: 'GITHUB_TOKEN', label: 'GitHub Token', reason: 'إنشاء ريبو يحتاج مصادقة' },
          });
          setPendingTool(String(sessionId), { runId: pending.runId, name: String(plan?.name || ''), input: plan?.input });
          if (useMock) store.updateRun(pending.runId, { status: 'blocked' as any });
          else try { await Run.findByIdAndUpdate(pending.runId, { $set: { status: 'blocked' } }); } catch {}
          return { blocked: true, secretRequired: true, secret: { provider: 'github', key: 'GITHUB_TOKEN', label: 'GitHub Token' } };
        }
        if (String(plan?.name || '') === 'github_create_or_update_file' && isGithubAuthError(errorMsg)) {
          const msg = [
            `⚠️ مطلوب توكن GitHub لإنشاء/تعديل ملفات داخل المستودع عبر API.`,
            `- أدخل GitHub Personal Access Token في نافذة التوكن وأرسله.`,
            `- سيتم حفظ التوكن بشكل آمن لهذا الحساب ولن يظهر في المحادثة.`,
          ].join('\n');
          broadcast({ type: 'text', runId: pending.runId, data: msg });
          broadcast({
            type: 'secret_required',
            runId: pending.runId,
            data: { sessionId, runId: pending.runId, provider: 'github', key: 'GITHUB_TOKEN', label: 'GitHub Token', reason: 'تعديل ملفات الريبو يحتاج مصادقة' },
          });
          setPendingTool(String(sessionId), { runId: pending.runId, name: String(plan?.name || ''), input: plan?.input });
          if (useMock) store.updateRun(pending.runId, { status: 'blocked' as any });
          else try { await Run.findByIdAndUpdate(pending.runId, { $set: { status: 'blocked' } }); } catch {}
          return { blocked: true, secretRequired: true, secret: { provider: 'github', key: 'GITHUB_TOKEN', label: 'GitHub Token' } };
        }
        forcedText = `فشل التنفيذ: ${errorMsg}`;
        finalOk = false;
        break;
      }

      steps++;

      if (plan?.name === 'echo') {
        forcedText = String((plan as any)?.input?.text || '');
        break;
      }
    }

    const finalContent = forcedText || (lastResult?.output ? JSON.stringify(lastResult.output) : 'No output');
    if (!assistantTextEmitted) broadcast({ type: 'text', runId: pending.runId, data: finalContent });

    if (useMock) {
      store.addMessage(sessionId, 'assistant', finalContent, pending.runId);
      store.updateRun(pending.runId, { status: finalOk ? ('done' as any) : ('failed' as any) });
    } else {
      try { await Message.create({ sessionId, role: 'assistant', content: finalContent, runId: pending.runId }); } catch {}
      try { await Run.findByIdAndUpdate(pending.runId, { $set: { status: finalOk ? 'done' : 'failed' } }); } catch {}
    }
    broadcast({ type: 'run_finished', runId: pending.runId, data: { runId: pending.runId, ok: finalOk } });
    return { done: true, ok: finalOk };
  };

  if (!result.ok) {
    if (useMock) store.updateRun(pending.runId, { status: 'failed' as any });
    else try { await Run.findByIdAndUpdate(pending.runId, { $set: { status: 'failed' } }); } catch {}
    broadcast({ type: 'run_finished', runId: pending.runId, data: { runId: pending.runId, ok: false } });
    return res.json({ ok: true, resumed: true, result });
  }

  if (kind === 'agent') {
    try {
      const out = await continueAgent();
      if (out?.blocked) return res.json({ ok: true, resumed: true, continued: true, ...out });
      return res.json({ ok: true, resumed: true, continued: true, result });
    } catch (e: any) {
      const msg = safeErrorMessage(e);
      if (useMock) store.updateRun(pending.runId, { status: 'failed' as any });
      else try { await Run.findByIdAndUpdate(pending.runId, { $set: { status: 'failed' } }); } catch {}
      broadcast({ type: 'text', runId: pending.runId, data: `❌ توقف الاستكمال بعد التوكن: ${msg}` });
      broadcast({ type: 'run_finished', runId: pending.runId, data: { runId: pending.runId, ok: false } });
      return res.json({ ok: true, resumed: true, continued: false, error: msg });
    }
  }

  if (useMock) store.updateRun(pending.runId, { status: 'done' as any });
  else try { await Run.findByIdAndUpdate(pending.runId, { $set: { status: 'done' } }); } catch {}
  broadcast({ type: 'run_finished', runId: pending.runId, data: { runId: pending.runId, ok: true } });
  return res.json({ ok: true, resumed: true, result });
});

// Get Session Messages
router.get('/:id/messages', authenticate as any, async (req: Request, res: Response) => {
  const { id } = req.params;
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  
  try {
    if (useMock) {
      const messages = store.listMessages(id).filter(m => m.role !== 'system');
      return res.json({ messages });
    }
    
    const messages = await Message.find({ sessionId: id, role: { $ne: 'system' } }).sort({ createdAt: 1 }).lean();
    res.json({ messages });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Get Full Session Context
router.get('/:id/context', authenticate as any, async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = (req as any).auth?.sub;
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;

  try {
    let summary = '';
    let recentMessages: any[] = [];
    let memories: any[] = [];

    if (useMock) {
        summary = store.getSummary(id)?.content || '';
        recentMessages = store.listMessages(id).filter(m => m.role !== 'system').slice(-10);
    } else {
        const sumDoc = await Summary.findOne({ sessionId: id });
        summary = sumDoc?.content || '';
        
        recentMessages = await Message.find({ sessionId: id, role: { $ne: 'system' } })
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();
        // reverse to show in order
        recentMessages.reverse();

        if (userId) {
            memories = await MemoryItem.find({ userId }).sort({ createdAt: -1 }).lean();
        }
    }

    res.json({
        systemPrompt: SYSTEM_PROMPT,
        summary,
        recentMessages,
        memories
    });
  } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to fetch context' });
  }
});

// Get Session Summary
router.get('/:id/summary', authenticate as any, async (req: Request, res: Response) => {
  const { id } = req.params;
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  
  if (useMock) {
    const s = store.getSummary(id);
    return res.json({ summary: s });
  }

  try {
    const summary = await Summary.findOne({ sessionId: id });
    res.json({ summary });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// Manual Summarize
router.post('/:id/summarize', authenticate as any, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { content } = req.body;
  
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  if (useMock) {
    store.upsertSummary(id, content);
    return res.json({ ok: true });
  }

  try {
    await Summary.findOneAndUpdate(
      { sessionId: id },
      { content },
      { upsert: true, new: true }
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update summary' });
  }
});

// Auto Summarize
router.post('/:id/summarize/auto', authenticate as any, async (req: Request, res: Response) => {
  const { id } = req.params;
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;

  try {
    // Check if we have messages
    let messages: any[] = [];
    if (useMock) {
        messages = store.listMessages(id);
    } else {
        messages = await Message.find({ sessionId: id }).sort({ createdAt: 1 }).limit(100);
    }
    
    if (messages.length === 0) return res.json({ ok: true });

    const msgsForLLM = messages.map(m => ({ 
        role: m.role || 'user', 
        content: String(m.content || '') 
    }));
    
    const summaryContent = await generateSummary(msgsForLLM);
    
    if (useMock) {
        store.upsertSummary(id, summaryContent);
    } else {
        await Summary.findOneAndUpdate(
            { sessionId: id },
            { content: summaryContent },
            { upsert: true, new: true }
        );
    }

    res.json({ ok: true, summary: summaryContent });
  } catch (e) {
    console.error('Auto summary error:', e);
    res.status(500).json({ error: 'Auto summary failed' });
  }
});

router.post('/merge', authenticate as any, async (req: Request, res: Response) => {
  const { sourceId, targetId } = req.body || {};
  if (!sourceId || !targetId || sourceId === targetId) return res.status(400).json({ error: 'Invalid source/target' });
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  if (useMock) {
    const result = store.mergeSessions(String(sourceId), String(targetId));
    return res.json({ ok: true, ...result });
  }
  const source = await Session.findById(sourceId);
  const target = await Session.findById(targetId);
  if (!source || !target) return res.status(404).json({ error: 'Session not found' });
  await Message.updateMany({ sessionId: sourceId }, { $set: { sessionId: targetId } });
  await Run.updateMany({ sessionId: sourceId }, { $set: { sessionId: targetId } });
  await Session.deleteOne({ _id: sourceId });
  return res.json({ ok: true });
});

router.get('/', authenticate as any, async (_req: Request, res: Response) => {
  const kindRaw = String((_req.query as any)?.kind || '').trim();
  const kinds = kindRaw ? kindRaw.split(',').map(k => k.trim()).filter(Boolean) : [];
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  if (useMock) {
    const all = store.listSessions();
    const filtered = kinds.length > 0 ? all.filter((s: any) => kinds.includes((s as any).kind)) : all;
    return res.json({ sessions: filtered });
  }
  const query: any = {};
  if (kinds.length > 1) {
    query.kind = { $in: kinds };
  } else if (kinds.length === 1) {
    query.kind = kinds[0];
  }
  const sessions = await Session.find(query).sort({ isPinned: -1, updatedAt: -1 }).lean();
  return res.json({ sessions });
});

router.get('/search', authenticate as any, async (req: Request, res: Response) => {
  const query = String(req.query.q || '').trim();
  if (!query) return res.json({ results: [] });

  const kindRaw = String((req.query as any).kind || '').trim();
  const kind = kindRaw === 'agent' ? 'agent' : kindRaw === 'chat' ? 'chat' : null;

  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  if (useMock) {
    return res.json({ results: [] });
  }

  // Simple regex search for now. For production, use Atlas Search or Text Index.
  const messages = await Message.find({
    content: { $regex: query, $options: 'i' },
    role: { $ne: 'system' }
  }).sort({ createdAt: -1 }).limit(20).populate('sessionId', 'title kind');

  const filteredMessages = kind ? messages.filter(m => (m.sessionId as any)?.kind === kind) : messages;

  const results = filteredMessages.map(m => ({
    messageId: m._id,
    sessionId: (m.sessionId as any)._id,
    sessionTitle: (m.sessionId as any).title,
    content: m.content,
    createdAt: m.createdAt,
  }));

  return res.json({ results });
});

router.get('/:id/history', authenticate as any, async (req: Request, res: Response) => {
  const { id } = req.params;
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  if (useMock) {
    const msgs = store.listMessages(id).filter(m => m.role !== 'system');
    const events = msgs.map(m => ({
      type: m.role === 'user' ? 'user_input' : 'text',
      data: m.content,
      ts: m.ts,
    }));
    return res.json({ events });
  }
  try {
    const msgs = await Message.find({ sessionId: id, role: { $ne: 'system' } }).sort({ createdAt: 1 }).lean();
    const events = msgs.map(m => ({
      type: m.role === 'user' ? 'user_input' : 'text',
      data: m.content,
      ts: (m as any).createdAt ? new Date((m as any).createdAt).getTime() : Date.now(),
    }));
    return res.json({ events });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to fetch history' });
  }
});

router.get('/:id/analytics', authenticate as any, async (req: Request, res: Response) => {
  const { id } = req.params;
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  
  if (useMock) {
    const session = store.getSession(id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const msgs = store.listMessages(id);
    const runs = store.listRuns(id);
    
    let totalSteps = 0;
    let successfulRuns = 0;
    const runIds: string[] = [];
    
    runs.forEach(r => {
        totalSteps += r.steps?.length || 0;
        if (r.status === 'done') successfulRuns++;
        runIds.push(r.id);
    });

    const allExecs = store.listExecs(); // Get all execs then filter
    const tools = allExecs.filter(e => runIds.includes(e.runId));
    
    const toolUsage: Record<string, number> = {};
    let toolErrors = 0;
    
    tools.forEach(t => {
        toolUsage[t.name] = (toolUsage[t.name] || 0) + 1;
        if (!t.ok) toolErrors++;
    });

    return res.json({ 
        duration: (session.lastUpdatedAt || Date.now()) - (session.lastUpdatedAt || Date.now()), // Mock duration 0 for now
        messageCount: msgs.length, 
        runCount: runs.length, 
        totalSteps,
        successfulRuns,
        successRate: runs.length > 0 ? (successfulRuns / runs.length) * 100 : 0,
        toolUsage,
        totalToolCalls: tools.length,
        toolErrorRate: tools.length > 0 ? (toolErrors / tools.length) * 100 : 0
    });
  }

  try {
    const session = await Session.findById(id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const messageCount = await Message.countDocuments({ sessionId: id });
    const runs = await Run.find({ sessionId: id });
    const runCount = runs.length;
    
    // Calculate steps and tool usage
    let totalSteps = 0;
    let successfulRuns = 0;
    
    runs.forEach(r => {
        totalSteps += r.steps?.length || 0;
        if (r.status === 'done') successfulRuns++;
    });

    // Get tool executions for this session's runs
    const runIds = runs.map(r => r._id);
    const tools = await ToolExecution.find({ runId: { $in: runIds } });
    
    const toolUsage: Record<string, number> = {};
    let toolErrors = 0;
    
    tools.forEach(t => {
        toolUsage[t.name] = (toolUsage[t.name] || 0) + 1;
        if (!t.ok) toolErrors++;
    });

    const duration = session.lastUpdatedAt.getTime() - session.createdAt.getTime();

    return res.json({
        duration, // in ms
        messageCount,
        runCount,
        totalSteps,
        successfulRuns,
        successRate: runCount > 0 ? (successfulRuns / runCount) * 100 : 0,
        toolUsage,
        totalToolCalls: tools.length,
        toolErrorRate: tools.length > 0 ? (toolErrors / tools.length) * 100 : 0
    });
  } catch (error) {
    console.error('Analytics error:', error);
    return res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

router.delete('/', authenticate as any, async (_req: Request, res: Response) => {
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  if (useMock) {
    // store.clearAll();
    return res.json({ ok: true });
  }
  await Session.deleteMany({});
  await Message.deleteMany({});
  await Run.deleteMany({});
  return res.json({ ok: true });
});

router.get('/:id', authenticate as any, async (req: Request, res: Response) => {
  const { id } = req.params;
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  if (useMock) {
    return res.json({ session: store.getSession(id) });
  }
  const session = await Session.findById(id).lean();
  if (!session) return res.status(404).json({ error: 'Not found' });
  return res.json({ session });
});

router.delete('/:id', authenticate as any, async (req: Request, res: Response) => {
  const { id } = req.params;
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  if (useMock) {
    store.deleteSession(id);
    return res.json({ ok: true });
  }
  await Session.deleteOne({ _id: id });
  await Message.deleteMany({ sessionId: id });
  await Run.deleteMany({ sessionId: id });
  return res.json({ ok: true });
});

router.patch('/:id/state', authenticate as any, async (req: Request, res: Response) => {
    const { id } = req.params;
    const { terminalState } = req.body;
    
    const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
    if (useMock) return res.json({ ok: true });
    
    await Session.findByIdAndUpdate(id, {
        $set: {
            terminalState,
            lastUpdatedAt: new Date()
        }
    });
    
    return res.json({ ok: true });
});

export default router;
