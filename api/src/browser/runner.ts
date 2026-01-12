import type { BrowserWsEvent, FailureReason } from './types';
import { DEFAULT_BROWSER_CONFIG } from './config';
import { broadcastBrowserEvent } from './wsHub';
import { resolveSecretsInText, redactSecretsFromString } from './secrets';
import { planNextStep } from '../llm';
import { executePlannedActions } from './executor';
import { stopSession } from './manager';

function now() {
  return Date.now();
}

function newStepId(i: number) {
  return `step_${i + 1}`;
}

function asReason(v: any): FailureReason {
  const s = String(v || '').trim();
  if (
    s === 'element_not_found' ||
    s === 'overlay_blocking_click' ||
    s === 'needs_scroll' ||
    s === 'iframe_or_shadow_dom' ||
    s === 'timeout' ||
    s === 'same_site_blocked'
  ) {
    return s;
  }
  return 'unknown';
}

type Planned = {
  actions: Array<
    | { type: 'goto'; url: string }
    | { type: 'click'; selector?: string; role?: string; name?: string; text?: string }
    | { type: 'type'; selector?: string; role?: string; name?: string; text: string }
    | { type: 'scroll'; direction: 'down' | 'up'; amount?: number }
    | { type: 'wait'; ms: number }
    | { type: 'assert'; selector?: string; text?: string }
    | { type: 'ui_audit' }
  >;
};

const COMPILER_SYSTEM = `
You are an instruction compiler for a web browser agent.
You must output a SINGLE JSON object with shape:
{ "actions": [ ... ] }

Rules:
- Deterministic and concise.
- No Google/search unless explicitly requested.
- Same-site: you may start by opening a target domain if present.
- Use Arabic labels/text matching when applicable.
- If a secret token appears like {{SECRET:JOE_LOGIN_EMAIL}} or {{SECRET:JOE_LOGIN_PASSWORD}}, keep it as-is in output (do not expand).
- Max 80 actions.

Allowed action types:
- {"type":"goto","url":"https://example.com"}
- {"type":"click","text":"Start Now"} OR {"type":"click","role":"button","name":"Start Now"} OR {"type":"click","selector":"..."}
- {"type":"type","selector":"...","text":"..."} OR {"type":"type","role":"textbox","name":"Email","text":"..."}
- {"type":"scroll","direction":"down","amount":800}
- {"type":"wait","ms":1000}
- {"type":"assert","text":"..."} OR {"type":"assert","selector":"..."}
- {"type":"ui_audit"}
`;

function extractUrl(text: string) {
  const t = String(text || '').trim();
  if (!t) return null;

  const direct = t.match(/https?:\/\/[^\s"'<>]+/i)?.[0];
  if (direct) return direct;

  const www = t.match(/\bwww\.[^\s"'<>]+\b/i)?.[0];
  if (www) return `https://${www}`;

  const m = t.match(/\b[a-z0-9][a-z0-9-]{0,62}(?:\.[a-z0-9-]{1,63})+\b(?:\/[^\s"'<>]*)?/i);
  if (!m) return null;
  return `https://${m[0]}`;
}

function shouldFastOpen(text: string) {
  const s = String(text || '').trim();
  if (!s) return false;
  const hasOpenKeyword = /(افتح|افتحي|افتحوا|اذهب|زيارة|open|go to|visit)/i.test(s);
  const u = extractUrl(s);
  if (!u) return false;
  if (hasOpenKeyword) return true;
  if (s === u) return true;
  if (s.toLowerCase() === u.toLowerCase()) return true;
  return false;
}

function classifyBrowserRuntimeError(e: any) {
  const msg = String(e?.message || e || '').trim();
  const lower = msg.toLowerCase();
  if (/executable doesn't exist|playwright install/i.test(msg)) return { code: 'chromium_missing', message: msg };
  if (/no such file or directory/i.test(msg) && /chrome|chromium/i.test(lower)) return { code: 'chromium_missing', message: msg };
  if (/target page, context or browser has been closed/i.test(msg)) return { code: 'browser_closed', message: msg };
  if (/xvfb|display|cannot open display|missing x server/i.test(lower)) return { code: 'display_missing', message: msg };
  if (/sandbox|setuid/i.test(lower)) return { code: 'sandbox_blocked', message: msg };
  if (/glibc|gtk|nss|gbm|fontconfig/i.test(lower)) return { code: 'deps_missing', message: msg };
  return { code: 'browser_failed', message: msg || 'browser_failed' };
}

function shouldCloseAfterRun() {
  const raw = process.env.BROWSER_CLOSE_AFTER_RUN;
  if (raw === undefined) return process.env.NODE_ENV === 'production';
  const s = String(raw).trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on'].includes(s);
}

export async function runBrowserInstruction(params: {
  userId: string;
  sessionId: string;
  instructionText: string;
}) {
  const userId = String(params.userId || '').trim();
  const sessionId = String(params.sessionId || '').trim();
  const instructionTextRaw = String(params.instructionText || '').trim();

  if (!userId) throw new Error('userId_required');
  if (!sessionId) throw new Error('sessionId_required');
  if (!instructionTextRaw) throw new Error('instructionText_required');

  const resolvedSecrets = await resolveSecretsInText(userId, instructionTextRaw);
  if (!resolvedSecrets.ok) {
    const msg = `missing_secrets: ${resolvedSecrets.missing.join(', ')}`;
    const ev: BrowserWsEvent = {
      type: 'final_report',
      ts: now(),
      ok: false,
      summary: msg,
      steps: [],
      evidence: [],
    };
    broadcastBrowserEvent(sessionId, ev);
    return { ok: false as const, error: msg, missingSecrets: resolvedSecrets.missing };
  }

  const cfg = DEFAULT_BROWSER_CONFIG;
  const safeInstruction = redactSecretsFromString(resolvedSecrets.text);
  const closeAfterRun = shouldCloseAfterRun();

  if (shouldFastOpen(safeInstruction)) {
    const url = extractUrl(safeInstruction);
    if (url) {
      try {
        const exec = await executePlannedActions({
          userId,
          sessionId,
          actions: [{ type: 'goto', url }, { type: 'wait', ms: 450 }] as any,
        });
        if (closeAfterRun) {
          try { await stopSession(sessionId); } catch {}
        }
        return { ok: true as const, result: exec };
      } catch (e: any) {
        const c = classifyBrowserRuntimeError(e);
        try { await stopSession(sessionId); } catch {}
        const ev: BrowserWsEvent = {
          type: 'final_report',
          ts: now(),
          ok: false,
          summary: `${c.code}: ${c.message}`.slice(0, 600),
          steps: [],
          evidence: [],
        };
        broadcastBrowserEvent(sessionId, ev);
        return { ok: false as const, error: 'browser_unavailable', detail: c };
      }
    }
  }

  let planned: Planned | null = null;
  try {
    const r = await planNextStep(
      [
        { role: 'system', content: COMPILER_SYSTEM },
        { role: 'user', content: safeInstruction },
      ],
      { provider: 'openai' } as any,
    );
    if (r && typeof r === 'object' && r.name === 'echo') {
      planned = null;
    } else if (r && typeof r === 'object') {
      const maybe = (r as any).input;
      if (maybe && typeof maybe === 'object' && Array.isArray((maybe as any).actions)) {
        planned = { actions: (maybe as any).actions };
      }
    }
  } catch {
    planned = null;
  }

  if (!planned) {
    broadcastBrowserEvent(sessionId, {
      type: 'final_report',
      ts: now(),
      ok: false,
      summary: 'compiler_failed',
      steps: [],
      evidence: [],
    });
    return { ok: false as const, error: 'compiler_failed' };
  }

  planned.actions = planned.actions.slice(0, cfg.maxSteps);

  try {
    const exec = await executePlannedActions({
      userId,
      sessionId,
      actions: planned.actions as any,
    });
    if (closeAfterRun) {
      try { await stopSession(sessionId); } catch {}
    }
    return { ok: true as const, result: exec };
  } catch (e: any) {
    const c = classifyBrowserRuntimeError(e);
    try { await stopSession(sessionId); } catch {}
    if (c.code === 'browser_closed') {
      try {
        const exec2 = await executePlannedActions({
          userId,
          sessionId,
          actions: planned.actions as any,
        });
        if (closeAfterRun) {
          try { await stopSession(sessionId); } catch {}
        }
        return { ok: true as const, result: exec2 };
      } catch (e2: any) {
        const c2 = classifyBrowserRuntimeError(e2);
        try { await stopSession(sessionId); } catch {}
        const ev2: BrowserWsEvent = {
          type: 'final_report',
          ts: now(),
          ok: false,
          summary: `${c2.code}: ${c2.message}`.slice(0, 600),
          steps: [],
          evidence: [],
        };
        broadcastBrowserEvent(sessionId, ev2);
        return { ok: false as const, error: 'browser_unavailable', detail: c2 };
      }
    }
    const ev: BrowserWsEvent = {
      type: 'final_report',
      ts: now(),
      ok: false,
      summary: `${c.code}: ${c.message}`.slice(0, 600),
      steps: [],
      evidence: [],
    };
    broadcastBrowserEvent(sessionId, ev);
    return { ok: false as const, error: 'browser_unavailable', detail: c };
  }
}
