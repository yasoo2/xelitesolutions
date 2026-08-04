import { Router } from 'express';
import mongoose from 'mongoose';
import { Approval } from '../../shared/models/approval';
import { broadcast } from '../ws';
import { planContext } from '../approvals/context';
import { executeTool } from '../../modules/services/ToolService';
import { Run } from '../../shared/models/run';
import { Session } from '../../shared/models/session';
import { authenticate } from '../middleware/auth';
import { executionFirewall } from '../../orchestration/AgentExecutionFirewall';

const router = Router();

function redactToolInputForBroadcast(name: string, input: any) {
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
    const safe = cmd
      .replace(/(authorization\s*:\s*bearer\s+)[^\s]+/gi, '$1[REDACTED]')
      .replace(/(\btoken\s*=\s*)[^&\s]+/gi, '$1[REDACTED]')
      .replace(/(\bpassword\s*=\s*)[^&\s]+/gi, '$1[REDACTED]')
      .replace(/(\bapi[_-]?key\s*=\s*)[^&\s]+/gi, '$1[REDACTED]')
      .replace(/(\bsecret\s*=\s*)[^&\s]+/gi, '$1[REDACTED]')
      .replace(/(\b--token\s+)[^\s]+/gi, '$1[REDACTED]')
      .replace(/(\b--password\s+)[^\s]+/gi, '$1[REDACTED]')
      .replace(/(ghp_[A-Za-z0-9]{20,})/g, '[REDACTED]')
      .replace(/(github_pat_[A-Za-z0-9_]{20,})/g, '[REDACTED]')
      .replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, 'sk-[REDACTED]')
      .replace(/\bBearer\s+[A-Za-z0-9._-]{10,}\b/g, 'Bearer [REDACTED]');
    return { ...(input as any), command: safe };
  }

  if (name === 'http_fetch') {
    const headersRaw = (input as any).headers;
    if (headersRaw && typeof headersRaw === 'object' && !Array.isArray(headersRaw)) {
      const headers: any = { ...headersRaw };
      for (const k of Object.keys(headers)) {
        if (/^authorization$/i.test(k)) headers[k] = '[REDACTED]';
      }
      return { ...(input as any), headers };
    }
    return input;
  }

  if (name === 'browser_run') {
    const sessionId = typeof (input as any).sessionId === 'string' ? (input as any).sessionId : undefined;
    const instructionText = typeof (input as any).instructionText === 'string' ? (input as any).instructionText : undefined;
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
    const out: any = { sessionId, actions: redactedActions };
    if (instructionText) out.instructionText = instructionText;
    return out;
  }
  return input;
}

function extractTitleFromHtml(html: string) {
  const m = String(html || '').match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i);
  const t = String(m?.[1] || '').replace(/\s+/g, ' ').trim();
  return t || '';
}

function normalizeDisplayUrl(raw: any) {
  let s = String(raw ?? '').trim();
  while (s.length >= 2) {
    const first = s[0];
    const last = s[s.length - 1];
    const wrap = (c: string) => c === '`' || c === '"' || c === "'" || c === '“' || c === '”' || c === '‘' || c === '’';
    if (wrap(first) && wrap(last)) s = s.slice(1, -1).trim();
    else break;
  }
  s = s.replace(/[)\]`.,;:!?،؛؟]+$/g, '').trim();
  if (!s) return s;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^\/\//.test(s)) return `https:${s}`;
  if (/^(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+(?:\:\d+)?(?:\/|$)/i.test(s)) return `https://${s}`;
  return s;
}

function inferSiteLabel(url: string, dom: string) {
  const u = normalizeDisplayUrl(url);
  try {
    if (u) {
      const host = new URL(u).hostname.replace(/^www\./i, '');
      if (host) return host;
    }
  } catch { }
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
  const urlRaw =
    typeof (out as any).url === 'string' ? (out as any).url : typeof (out as any).pageUrl === 'string' ? (out as any).pageUrl : '';
  const url = normalizeDisplayUrl(urlRaw);
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

router.post('/:id/decision', authenticate as any, async (req, res) => {
  const id = String(req.params.id);
  const { decision } = req.body || {};
  if (!['approved', 'denied'].includes(String(decision))) return res.status(400).json({ error: 'Invalid decision' });

  const ctx = planContext.get(id);

  const userId = String((req as any).auth?.sub || '').trim();
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const approval = await Approval.findById(id).lean();
  if (!approval || !ctx) return res.status(404).json({ error: 'Approval not found' });

  const run = await Run.findById((approval as any).runId).select({ sessionId: 1 }).lean();
  if (!run) return res.status(404).json({ error: 'Approval not found' });

  const allowed = await Session.findOne({ _id: (run as any).sessionId, userId }).select('_id').lean();
  if (!allowed) return res.status(403).json({ error: 'Forbidden' });

  const a = await Approval.findByIdAndUpdate(id, { $set: { status: decision } }, { new: true });
  if (!a) return res.status(404).json({ error: 'Approval not found' });
  broadcast({ type: 'approval_result', runId: ctx.runId, data: { id, decision } });
  /**
   * The chip's live dot is cleared by `run_finished`, and the UI can only match
   * it to a conversation by the sessionId it carries. This path used to send
   * the event without one, so a run that ended here left the session marked as
   * working forever. The id is right there on the Run — carry it.
   */
  const runSessionId = String((run as any).sessionId || '').trim() || undefined;
  if (decision === 'approved') {
    broadcast({ type: 'step_started', runId: ctx.runId, data: { name: `execute:${ctx.name}`, input: redactToolInputForBroadcast(ctx.name, ctx.input) } });
    const sessionId = typeof ctx.input?.sessionId === 'string' && ctx.input.sessionId.trim() ? ctx.input.sessionId.trim() : undefined;
    const workspaceId =
      typeof ctx.input?.workspaceId === 'string' && ctx.input.workspaceId.trim()
        ? ctx.input.workspaceId.trim()
        : typeof ctx.input?.__workspaceId === 'string' && ctx.input.__workspaceId.trim()
          ? ctx.input.__workspaceId.trim()
          : undefined;
    const result = await executionFirewall.runInContext(undefined, () =>
      executeTool(ctx.name, ctx.input, { sessionId, workspaceId, userId })
    );
    const eventResult = sanitizeToolResultForBroadcast(ctx.name, result);
    broadcast({ type: result.ok ? 'step_done' : 'step_failed', runId: ctx.runId, data: { name: `execute:${ctx.name}`, result: eventResult } });
    if (result.artifacts) {
      // Persist artifacts in DB using Artifact model if needed
    }
    await Run.findByIdAndUpdate(ctx.runId, { $set: { status: result.ok ? 'done' : 'failed' } });
    broadcast({ type: 'run_finished', runId: ctx.runId, sessionId: runSessionId, data: { runId: ctx.runId, ok: result.ok, sessionId: runSessionId } } as any);
    planContext.delete(id);
    return res.json({ ok: true, result });
  } else {
    await Run.findByIdAndUpdate(ctx.runId, { $set: { status: 'denied' } });
    broadcast({ type: 'run_finished', runId: ctx.runId, sessionId: runSessionId, data: { runId: ctx.runId, ok: false, sessionId: runSessionId } } as any);
    planContext.delete(id);
    return res.json({ ok: true, denied: true });
  }
});

export default router;
