import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import mongoose from 'mongoose';
import { Approval } from '../models/Approval';
import { Artifact } from '../models/Artifact';
import { ToolExecution } from '../models/ToolExecution';
import { Session } from '../models/Session';
import Anthropic from '@anthropic-ai/sdk';

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

function inferSiteLabel(url: string, dom: string) {
  const u = String(url || '').trim();
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

router.post('/:id/decision', authenticate as any, async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { decision } = req.body || {};

  if (!decision || !['approve', 'reject'].includes(decision)) {
    return res.status(400).json({ error: 'Invalid decision' });
  }

  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ error: 'Database unavailable' });
  }

  try {
    const approval = await Approval.findById(id);
    if (!approval) {
      return res.status(404).json({ error: 'Approval not found' });
    }

    const run = await Run.findById(approval.runId);
    if (!run) {
      return res.status(404).json({ error: 'Associated run not found' });
    }

    approval.status = decision;
    await approval.save();

    if (decision === 'approve') {
      // Logic for approved decision (e.g., execute tool, update run status)
      // This part would typically involve calling the actual tool execution service
      // and updating the run and tool execution records.
      // For now, we'll just update the run status to 'approved' or 'done'
      run.status = 'approved'; // Or 'done' if the approval completes the run
      await run.save();
      return res.json({ ok: true, message: 'Approval granted and run status updated.' });
    } else { // decision === 'reject'
      run.status = 'denied';
      await run.save();
      return res.json({ ok: true, message: 'Approval denied and run status updated.' });
    }
  } catch (error) {
    console.error('Error processing approval decision:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
