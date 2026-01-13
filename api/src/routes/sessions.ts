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
import { getSessionRunConfig, popPendingTool, setPendingTool, setSessionRunConfig, setSessionSecret, setUserSecretEncrypted } from '../services/secrets';
import { Tenant } from '../models/tenant';

const router = Router();

function redactSecretsFromString(input: string): string {
  return input
    .replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, 'sk-[REDACTED]')
    .replace(/\bghp_[A-Za-z0-9_]{10,}\b/g, 'ghp_[REDACTED]')
    .replace(/\bgithub_pat_[A-Za-z0-9_]{10,}\b/g, 'github_pat_[REDACTED]')
    .replace(/\bBearer\s+[A-Za-z0-9._-]{10,}\b/g, 'Bearer [REDACTED]')
    .replace(/([?&]token=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/([?&]password=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/([?&]key=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/\bx-worker-key\b\s*[:=]\s*[A-Za-z0-9._-]{6,}/gi, 'x-worker-key:[REDACTED]')
    .replace(/\b(WORKER_API_KEY|BROWSER_WORKER_KEY|JWT_SECRET|OPENAI_API_KEY)\b\s*[:=]\s*[A-Za-z0-9._-]{6,}/gi, '$1=[REDACTED]');
}

function safeErrorMessage(err: any): string {
  const raw = typeof err?.message === 'string' ? err.message : String(err);
  return redactSecretsFromString(raw);
}

function extractTitleFromHtml(html: string) {
  const m = String(html || '').match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i);
  const t = String(m?.[1] || '').replace(/\s+/g, ' ').trim();
  return t || '';
}

function inferSiteLabel(url: string, dom: string) {
  const u = String(url || '').trim();
  try {
    if (u) {
      const host = new URL(u).hostname.replace(/^www\./i, '');
      if (host) return host;
    }
  } catch {}
  const d = String(dom || '');
  if (/youtube\.com|ytd-app/i.test(d)) return 'youtube.com';
  if (/accounts\.google\.com/i.test(d)) return 'accounts.google.com';
  if (/github\.com/i.test(d)) return 'github.com';
  const title = extractTitleFromHtml(d);
  return title || 'page';
}

function summarizeBrowserOutputForChat(out: any) {
  if (!out || typeof out !== 'object') return out;
  const isBrowserStateLike =
    typeof (out as any).url === 'string' ||
    typeof (out as any).pageUrl === 'string' ||
    typeof (out as any).dom === 'string' ||
    typeof (out as any).screenshot === 'string' ||
    typeof (out as any).screenshotHref === 'string';
  if (!isBrowserStateLike) return out;
  const url = typeof (out as any).url === 'string' ? (out as any).url : typeof (out as any).pageUrl === 'string' ? (out as any).pageUrl : '';
  const dom = typeof (out as any).dom === 'string' ? (out as any).dom : '';
  const title = dom ? extractTitleFromHtml(dom) : '';
  const site = inferSiteLabel(url, dom);
  const domLen = dom ? dom.length : 0;
  const redactionEnabled = typeof (out as any).redactionEnabled === 'boolean' ? Boolean((out as any).redactionEnabled) : undefined;
  const u = String(url || '').toLowerCase();
  const domLower = String(dom || '').toLowerCase();
  const hasPasswordField = /type=["']password["']|name=["']password["']|passw(or)?d|passwd/i.test(domLower);
  const hasLoginFormSignal = /<form\b[\s\S]{0,4000}(type=["']password["']|name=["']password["'])/i.test(dom);
  const urlLooksLogin = /serviceLogin|\/login\b|\/signin\b|accounts\.google\.com/i.test(u);
  const domStrongLogin = /<title[^>]*>[\s\S]*?(sign in|login|تسجيل\s+الدخول)[\s\S]*?<\/title>/i.test(dom) || /ServiceLogin/i.test(dom);
  const loginLike = Boolean((urlLooksLogin && (hasPasswordField || hasLoginFormSignal)) || (domStrongLogin && hasPasswordField));
  const summary: any = { site };
  if (url) summary.url = url;
  if (title) summary.title = title;
  if (loginLike) summary.pageType = 'login';
  if (domLen) summary.domLength = domLen;
  if (typeof redactionEnabled === 'boolean') summary.redactionEnabled = redactionEnabled;
  return summary;
}

function sanitizeToolResultForBroadcast(toolName: string, r: any) {
  const t = String(toolName || '');
  if (!/^browser_/.test(t) || !r || typeof r !== 'object') return r;
  const next: any = { ...r };
  if ('artifacts' in next) delete next.artifacts;
  if ('output' in next) next.output = summarizeBrowserOutputForChat((r as any).output);
  return next;
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

  if (name === 'shell_execute') {
    const cmd = typeof (input as any).command === 'string' ? (input as any).command : '';
    const cwd = typeof (input as any).cwd === 'string' ? (input as any).cwd : undefined;
    const timeout = typeof (input as any).timeout === 'number' ? (input as any).timeout : undefined;
    return { ...(input as any), command: redactSecretsFromString(cmd), ...(cwd ? { cwd } : {}), ...(timeout ? { timeout } : {}) };
  }

  if (name === 'http_fetch') {
    const url = typeof (input as any).url === 'string' ? redactSecretsFromString((input as any).url) : (input as any).url;
    const headersRaw = (input as any).headers;
    if (headersRaw && typeof headersRaw === 'object' && !Array.isArray(headersRaw)) {
      const headers: any = { ...headersRaw };
      for (const k of Object.keys(headers)) {
        if (/^authorization$/i.test(k)) headers[k] = '[REDACTED]';
      }
      return { ...(input as any), url, headers };
    }
    return { ...(input as any), url };
  }

  if (name === 'browser_run') {
    const sessionId = typeof (input as any).sessionId === 'string' ? (input as any).sessionId : undefined;
    const instructionText =
      typeof (input as any).instructionText === 'string' ? redactSecretsFromString((input as any).instructionText) : undefined;
    const actions = Array.isArray((input as any).actions) ? (input as any).actions : [];
    const redactedActions = actions.map((a: any) => {
      const t = String(a?.type || '').toLowerCase();
      if (t === 'type') {
        const text = typeof a?.text === 'string' ? a.text : typeof a?.value === 'string' ? a.value : '';
        return { ...a, text: `[redacted:${String(text || '').length}]`, value: undefined };
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
      const next: any = { ...a };
      if (typeof next.url === 'string') next.url = redactSecretsFromString(next.url);
      if (typeof next.text === 'string') next.text = redactSecretsFromString(next.text);
      if (typeof next.script === 'string' && next.sensitive) next.script = '[redacted]';
      return next;
    });
    const out: any = { ...(input as any), ...(sessionId ? { sessionId } : {}), ...(instructionText ? { instructionText } : {}) };
    if (Array.isArray(actions)) out.actions = redactedActions;
    return out;
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
    if (key === 'LLM_API_KEY') {
      try {
        const { getSessionRunConfig, setSessionRunConfig } = await import('../services/secrets');
        const cur = getSessionRunConfig(String(sessionId)) || ({} as any);
        setSessionRunConfig(String(sessionId), {
          provider,
          apiKey: value,
          baseUrl: typeof cur.baseUrl === 'string' ? cur.baseUrl : undefined,
          model: typeof cur.model === 'string' ? cur.model : undefined,
          kind: cur.kind === 'agent' ? 'agent' : cur.kind === 'chat' ? 'chat' : undefined,
          browserSessionId: typeof cur.browserSessionId === 'string' ? cur.browserSessionId : undefined,
          autoApproveAll: Boolean(cur.autoApproveAll),
          autoApproveSafe: Boolean(cur.autoApproveSafe),
        });
      } catch {}
    }
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
  const eventResult = sanitizeToolResultForBroadcast(pending.name, result);
  broadcast({ type: result.ok ? 'step_done' : 'step_failed', runId: pending.runId, data: { name: `execute:${pending.name}`, result: eventResult } });

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
      if (toolName === 'shell_execute') {
        const status = typeof (r as any)?.output?.status === 'string' ? String((r as any).output.status) : '';
        const exitCode = typeof (r as any)?.output?.exitCode === 'number' ? Number((r as any).output.exitCode) : undefined;
        const reason = typeof (r as any)?.output?.reason === 'string' ? String((r as any).output.reason).trim() : '';
        const out = typeof (r as any)?.output?.stdout === 'string' ? String((r as any).output.stdout).trim() : '';
        const head = out ? out.split('\n').slice(0, 12).join('\n') : '';
        const parts = [`✅ تم تنفيذ الأمر بنجاح.${typeof exitCode === 'number' ? ` (exit ${exitCode})` : ''}`];
        if (status) parts.push(`- الحالة: ${status}`);
        if (reason) parts.push(`- السبب: ${reason}`);
        if (head) parts.push(`\n${head}`);
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
    if (toolName === 'shell_execute') {
      const exitCode = typeof (r as any)?.output?.exitCode === 'number' ? Number((r as any).output.exitCode) : undefined;
      const reason = typeof (r as any)?.output?.reason === 'string' ? String((r as any).output.reason).trim() : '';
      const stderr = typeof (r as any)?.output?.stderr === 'string' ? String((r as any).output.stderr).trim() : '';
      const stderrHead = stderr ? stderr.split('\n').slice(0, 12).join('\n') : '';
      const parts = [`❌ فشل تنفيذ الأمر.${typeof exitCode === 'number' ? ` (exit ${exitCode})` : ''}`];
      if (reason) parts.push(`- السبب: ${reason}`);
      if (!reason && errStr) parts.push(`- السبب: ${errStr}`);
      if (stderrHead) parts.push(`\n${stderrHead}`);
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
    const MAX_INLINE_CHARS = 1800;
    const truncate = (s: string, max = MAX_INLINE_CHARS) => (s.length > max ? `${s.slice(0, max)}…[truncated]` : s);
    const extractTitleFromHtml = (html: string) => {
      const m = html.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i);
      const t = String(m?.[1] || '').replace(/\s+/g, ' ').trim();
      return t || '';
    };
    const inferSiteLabel = (url: string, dom: string) => {
      const u = String(url || '').trim();
      try {
        if (u) {
          const host = new URL(u).hostname.replace(/^www\./i, '');
          if (host) return host;
        }
      } catch {}
      const d = String(dom || '');
      if (/youtube\.com|ytd-app/i.test(d)) return 'youtube.com';
      if (/accounts\.google\.com/i.test(d)) return 'accounts.google.com';
      if (/github\.com/i.test(d)) return 'github.com';
      const title = extractTitleFromHtml(d);
      return title || 'page';
    };
    const summarizeBrowserOutput = (out: any) => {
      if (!out || typeof out !== 'object') return out;
      const url =
        typeof (out as any).url === 'string'
          ? (out as any).url
          : typeof (out as any).pageUrl === 'string'
            ? (out as any).pageUrl
            : '';
      const dom = typeof (out as any).dom === 'string' ? (out as any).dom : '';
      const title = dom ? extractTitleFromHtml(dom) : '';
      const site = inferSiteLabel(url, dom);
      const domLen = dom ? dom.length : 0;
      const redactionEnabled = typeof (out as any).redactionEnabled === 'boolean' ? Boolean((out as any).redactionEnabled) : undefined;
      const u = String(url || '').toLowerCase();
      const domLower = String(dom || '').toLowerCase();
      const hasPasswordField = /type=["']password["']|name=["']password["']|passw(or)?d|passwd/i.test(domLower);
      const hasLoginFormSignal = /<form\b[\s\S]{0,4000}(type=["']password["']|name=["']password["'])/i.test(dom);
      const urlLooksLogin = /serviceLogin|\/login\b|\/signin\b|accounts\.google\.com/i.test(u);
      const domStrongLogin = /<title[^>]*>[\s\S]*?(sign in|login|تسجيل\s+الدخول)[\s\S]*?<\/title>/i.test(dom) || /ServiceLogin/i.test(dom);
      const loginLike = Boolean((urlLooksLogin && (hasPasswordField || hasLoginFormSignal)) || (domStrongLogin && hasPasswordField));
      const summary: any = { site };
      if (url) summary.url = url;
      if (title) summary.title = title;
      if (loginLike) summary.pageType = 'login';
      if (domLen) summary.domLength = domLen;
      if (typeof redactionEnabled === 'boolean') summary.redactionEnabled = redactionEnabled;
      return summary;
    };
    const sanitizeForInline = (toolName: string, obj: any) => {
      if (obj == null) return obj;
      const t = String(toolName || '');
      if (/^browser_/.test(t)) return summarizeBrowserOutput(obj);
      if (typeof obj === 'string') return truncate(obj);
      if (typeof obj === 'object') {
        try {
          const raw = JSON.stringify(obj);
          if (raw.length <= MAX_INLINE_CHARS) return obj;
          return truncate(raw);
        } catch {
          return '[Result too large or circular]';
        }
      }
      return obj;
    };
    const safeOutput = (toolName: string, obj: any) => {
      try {
        return JSON.stringify(sanitizeForInline(toolName, obj));
      } catch {
        return '"[Result too large or circular]"';
      }
    };

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
      content: `Tool Call: ${pending.name}\nInput: ${safeOutput(pending.name, redactedPendingInput)}\nOutput: ${safeOutput(
        pending.name,
        result.output || result.error || 'Done'
      )}`,
    });

    let steps = 0;
      let lastResult: any = null;
      let lastToolName = '';
      let forcedText: string | null = null;
      let assistantTextEmitted = false;
      let finalOk = true;
      const lastUserText = (() => {
        for (let i = history.length - 1; i >= 0; i--) {
          const m = history[i];
          if (m && m.role === 'user') {
            if (typeof m.content === 'string') return m.content;
            try { return JSON.stringify(m.content || ''); } catch { return String(m.content || ''); }
          }
        }
        return '';
      })();
      const isArabicText = (s: any) => /[\u0600-\u06FF]/.test(String(s || ''));
      const normalizeUrlForGoto = (raw: any) => {
        let s = String(raw ?? '').trim();
        s = s.replace(/^[`"'“”‘’]+/, '').replace(/[`"'“”‘’]+$/, '').trim();
        return s;
      };
      const hostKeyFromHost = (host: string) => {
        const h = String(host || '').toLowerCase().trim();
        if (!h) return '';
        return h.startsWith('www.') ? h.slice(4) : h;
      };
      const isSameSiteHost = (targetHost: string, lockHost: string) => {
        const t = hostKeyFromHost(targetHost);
        const l = hostKeyFromHost(lockHost);
        if (!t || !l) return false;
        if (t === l) return true;
        return t.endsWith(`.${l}`);
      };
      const urlToHost = (u: string) => {
        try { return new URL(u).hostname || ''; } catch { return ''; }
      };
      const urlToOrigin = (u: string) => {
        try { return new URL(u).origin || ''; } catch { return ''; }
      };
      const isCrossSiteBlockedError = (err: any) => {
        const s = String(err || '');
        if (!s) return false;
        if (/cross_site_blocked/i.test(s)) return true;
        if (/browser navigation blocked/i.test(s)) return true;
        return false;
      };
      let browserHostLock = '';
      let browserOriginLock = '';
      const updateBrowserLockFromOutput = (out: any) => {
        const url = typeof out?.url === 'string' ? out.url : typeof out?.pageUrl === 'string' ? out.pageUrl : '';
        const host = url ? urlToHost(url) : '';
        if (host) browserHostLock = hostKeyFromHost(host);
        const origin = url ? urlToOrigin(url) : '';
        if (origin) browserOriginLock = origin;
      };
      const isStrictSameSiteUiTask = (() => {
        const s = String(lastUserText || '');
        if (/strict_same_site_ui/i.test(s)) return true;
        const looksLoginOrForm =
          /(login|log\s*in|sign\s*in|password|email|form|تسجيل\s*الدخول|سجل\s*دخول|كلمة\s*المرور|البريد|نموذج)/i.test(s);
        const asksSearch =
          /(google|جوجل|search|ابحث|بحث|lookup|find|duckduck|duck\s*duck)/i.test(s);
        return Boolean(looksLoginOrForm && !asksSearch);
      })();

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
        const raw = String((plan as any)?.input?.url || '').trim();
        const url = normalizeUrlForGoto(raw);
        if (!url) {
          plan = { name: 'browser_get_state', input: { sessionId: browserSessionId.trim() } } as any;
        } else {
          if (isStrictSameSiteUiTask && !browserHostLock) updateBrowserLockFromOutput((lastResult as any)?.output);
          const targetHost = urlToHost(url);
          if (isStrictSameSiteUiTask && browserHostLock && targetHost && !isSameSiteHost(targetHost, browserHostLock)) {
            plan = { name: 'browser_get_state', input: { sessionId: browserSessionId.trim() } } as any;
          } else {
            plan = {
              name: 'browser_run',
              input: {
                sessionId: browserSessionId.trim(),
                actions: [{ type: 'goto', url, waitUntil: 'domcontentloaded' }],
              },
            } as any;
          }
        }
      }

      if (isStrictSameSiteUiTask) {
        if (!browserHostLock) updateBrowserLockFromOutput((lastResult as any)?.output);
        if (plan?.name === 'browser_run') {
          const rawActions = Array.isArray((plan as any)?.input?.actions) ? (plan as any).input.actions : [];
          const actions = rawActions.map((a: any) => {
            if (!a || typeof a !== 'object') return a;
            if (String(a.type || '').toLowerCase() === 'goto') {
              const u = normalizeUrlForGoto(a.url);
              return { ...a, url: u };
            }
            return a;
          });

          const hasDisallowed = actions.some((a: any) => {
            const t = String(a?.type || '').toLowerCase();
            if (t === 'searchgoogle') return true;
            if (t !== 'goto') return false;
            const u = normalizeUrlForGoto(a?.url);
            if (!u) return true;
            const targetHost = urlToHost(u);
            if (targetHost && /(^|\.)google\./i.test(targetHost)) return true;
            if (!browserHostLock) return false;
            if (!targetHost) return false;
            return !isSameSiteHost(targetHost, browserHostLock);
          });

          if (hasDisallowed) {
            const sid = typeof browserSessionId === 'string' ? browserSessionId.trim() : String((plan as any)?.input?.sessionId || '').trim();
            const origin = browserOriginLock || (browserHostLock ? `https://${browserHostLock}` : '');
            if (sid && origin) {
              const safeLoginUrl = new URL('/login', origin).toString();
              const host = browserHostLock || urlToHost(origin);
              const isXelite = /(^|\.)xelitesolutions\.com$/i.test(String(host || ''));
              const fallbackActions = isXelite
                ? [
                    { type: 'clickText', text: 'Start Now', exact: false, timeoutMs: 9000, attempts: 3 },
                    { type: 'waitForLoad', state: 'domcontentloaded' },
                    { type: 'goto', url: safeLoginUrl, waitUntil: 'domcontentloaded' },
                  ]
                : [{ type: 'goto', url: safeLoginUrl, waitUntil: 'domcontentloaded' }];
              plan = { name: 'browser_run', input: { sessionId: sid, actions: fallbackActions } } as any;
            } else if (sid) {
              plan = { name: 'browser_get_state', input: { sessionId: sid } } as any;
            } else {
              plan = { name: 'echo', input: { text: 'تعذّر تنفيذ خطوة المتصفح: لا يوجد sessionId.' } } as any;
            }
          } else {
            (plan as any).input = { ...(plan as any).input, actions };
          }
        }
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

      const isMultiStepBrowserInstruction = (s: string) => {
        const t = String(s || '');
        return /(\bthen\b|\bafter\b|\bnext\b|and then|, then|; then|ثم|وبعد|بعد( ذلك)?|بعدها|ومن ثم|عدة\s+خطوات|خطوات|خطوة|تابع|نفذ|قم\s+ب|رجاء|من\s+فضلك|ابحث|بحث|search|find|lookup|سجل\s*دخول|تسجيل\s*الدخول|login|sign\s*in|انقر|اضغط|click|type|اكتب|املأ|fill|submit|إرسال|scroll|مرر|extract|استخرج|لخص|summarize)/i.test(
          t,
        );
      };

      if (String(plan?.name || '') === 'browser_run') {
        const acts = Array.isArray((plan as any)?.input?.actions) ? (plan as any).input.actions : [];
        const onlyGoto =
          acts.length === 1 && String(acts[0]?.type || '').toLowerCase() === 'goto' && typeof acts[0]?.url === 'string' && acts[0].url.trim();
        if (onlyGoto && isMultiStepBrowserInstruction(lastUserText)) {
          const sid = String((plan as any)?.input?.sessionId || browserSessionId || '').trim();
          if (sid) (plan as any).input = { sessionId: sid, instructionText: lastUserText };
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

      broadcast({ type: 'step_done', runId: pending.runId, data: { name: `thinking_step_${steps + 1}`, plan } });


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
        if (sid) {
          browserSessionId = sid;
          try {
            const { getSessionRunConfig, setSessionRunConfig } = await import('../services/secrets');
            const cur = getSessionRunConfig(String(sessionId)) || ({} as any);
            setSessionRunConfig(String(sessionId), {
              provider: typeof cur.provider === 'string' ? cur.provider : undefined,
              apiKey: typeof cur.apiKey === 'string' ? cur.apiKey : undefined,
              baseUrl: typeof cur.baseUrl === 'string' ? cur.baseUrl : undefined,
              model: typeof cur.model === 'string' ? cur.model : undefined,
              kind: cur.kind === 'agent' ? 'agent' : cur.kind === 'chat' ? 'chat' : kind,
              browserSessionId: sid,
              autoApproveAll: Boolean(cur.autoApproveAll),
              autoApproveSafe: Boolean(cur.autoApproveSafe),
            });
          } catch {}
        }
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

      const eventResult =
        /^browser_/.test(String(plan?.name || '')) && stepResult && typeof stepResult === 'object'
          ? { ...stepResult, output: summarizeBrowserOutput((stepResult as any).output) }
          : stepResult;
      broadcast({
        type: stepResult.ok ? 'step_done' : 'step_failed',
        runId: pending.runId,
        data: { name: `execute:${plan?.name}`, result: eventResult },
      });

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

      const toolCallSummary = `Tool Call: ${plan?.name}\nInput: ${safeOutput(plan?.name || '', persistedInput)}\nOutput: ${safeOutput(
        plan?.name || '',
        stepResult.output || stepResult.error || 'Done'
      )}`;
        history.push({ role: 'assistant', content: toolCallSummary });
        lastToolName = String(plan?.name || '');
        lastResult = stepResult;
        if (stepResult?.ok && /^browser_/.test(String(plan?.name || ''))) {
          updateBrowserLockFromOutput((stepResult as any)?.output);
        }

      if (!stepResult.ok) {
        if (isStrictSameSiteUiTask && /^browser_/.test(String(plan?.name || '')) && isCrossSiteBlockedError(stepResult.error)) {
          const lock = browserHostLock ? `\n- Locked site: ${browserHostLock}` : '';
          forcedText = isArabicText(lastUserText)
            ? `⚠️ تم منع محاولة الانتقال خارج نفس الموقع أثناء وضع STRICT_SAME_SITE_UI.\nلن أحاول جوجل/بحث/روابط خارجية تلقائياً.${lock}\n\nوجّهني بما تريد على نفس الصفحة (مثال: \"اضغط Start Now\" أو \"اذهب إلى /login\").`
            : `⚠️ Navigation was blocked by same-site policy in STRICT_SAME_SITE_UI.\nI won’t auto-switch to Google/search/external sites.${lock}\n\nTell me what to do on the current page (e.g. “click Start Now” or “go to /login”).`;
          finalOk = false;
          break;
        }
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

      const finalContent =
        forcedText ||
        (() => {
          const raw = (lastResult as any)?.output ?? (lastResult as any)?.error ?? 'No output';
          const sanitized = sanitizeForInline(lastToolName, raw);
          if (typeof sanitized === 'string') return sanitized;
          try {
            return JSON.stringify(sanitized);
          } catch {
            return 'Output too large';
          }
        })();
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
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'Missing session id' });
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
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ error: 'Invalid session id' });
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
    console.error('Failed to fetch history', { sessionId: id }, e);
    return res.json({ events: [], error: 'Failed to fetch history' });
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

router.post('/:id/run-config', authenticate as any, async (req: Request, res: Response) => {
  const id = String(req.params.id || '').trim();
  const autoApproveAll = req.body?.autoApproveAll === true || req.body?.autoApproveAll === 'true';
  const autoApproveSafe = req.body?.autoApproveSafe === true || req.body?.autoApproveSafe === 'true';
  const provider = typeof req.body?.provider === 'string' ? req.body.provider : undefined;
  const apiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey : undefined;
  const baseUrl = typeof req.body?.baseUrl === 'string' ? req.body.baseUrl : undefined;
  const model = typeof req.body?.model === 'string' ? req.body.model : undefined;
  const kind = req.body?.kind === 'agent' ? 'agent' : req.body?.kind === 'chat' ? 'chat' : undefined;
  if (!id) return res.status(400).json({ error: 'Missing sessionId' });
  try {
    const cur = getSessionRunConfig(id) || ({} as any);
    setSessionRunConfig(id, {
      provider: provider ?? cur.provider,
      apiKey: apiKey ?? cur.apiKey,
      baseUrl: baseUrl ?? cur.baseUrl,
      model: model ?? cur.model,
      kind: kind ?? cur.kind,
      browserSessionId: cur.browserSessionId,
      autoApproveAll: autoApproveAll || cur.autoApproveAll,
      autoApproveSafe: autoApproveSafe || cur.autoApproveSafe,
    });
    const next = getSessionRunConfig(id);
    return res.json({ ok: true, config: next });
  } catch {
    return res.status(500).json({ error: 'Failed to update run config' });
  }
});

export default router;
