import type { BrowserWsEvent } from './types';
import { DEFAULT_BROWSER_CONFIG } from './config';
import { broadcastBrowserEvent } from './wsHub';
import { resolveSecretsInText, redactSecretsFromString } from './secrets';
import { planNextStep } from '../llm';
import { executePlannedActions } from './executor';
import { stopSession } from './manager';
import { getSessionRunConfig } from '../services/secrets';

function now() {
  return Date.now();
}

type Planned = {
  actions: Array<
    | { type: 'goto'; url: string; optional?: boolean }
    | { type: 'click'; selector?: string; role?: string; name?: string; text?: string; optional?: boolean }
    | { type: 'type'; selector?: string; role?: string; name?: string; text: string; optional?: boolean }
    | { type: 'scroll'; direction: 'down' | 'up'; amount?: number; optional?: boolean }
    | { type: 'wait'; ms: number; optional?: boolean }
    | { type: 'assert'; selector?: string; text?: string; optional?: boolean }
    | { type: 'ui_audit'; optional?: boolean }
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
- If the user asks for login/sign-in, use {{SECRET:JOE_LOGIN_EMAIL}} and {{SECRET:JOE_LOGIN_PASSWORD}} for credentials (never invent or expand secrets).
- If a secret token appears like {{SECRET:...}}, keep it as-is in output (do not expand).
- If the instruction clearly includes multiple steps (e.g., open + click + login + type), output the full multi-step sequence. Do not output only a single goto unless the user only asked to open a page.
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

function extractJsonLike(text: string) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  if (raw.startsWith('{') && raw.endsWith('}')) return raw;
  if (raw.startsWith('[') && raw.endsWith(']')) return raw;
  const m = raw.match(/\{[\s\S]*\}/);
  return String(m?.[0] || '').trim();
}

function deepRedactForDebug(v: any): any {
  if (v == null) return v;
  if (typeof v === 'string') return redactSecretsFromString(v);
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.map((x) => deepRedactForDebug(x));
  if (typeof v === 'object') {
    const out: any = {};
    for (const k of Object.keys(v)) out[k] = deepRedactForDebug((v as any)[k]);
    return out;
  }
  return redactSecretsFromString(String(v));
}

function plannedFromUnknown(r: any): Planned | null {
  if (!r || typeof r !== 'object') return null;

  const input = (r as any).input;
  if (input && typeof input === 'object' && Array.isArray((input as any).actions)) {
    return { actions: (input as any).actions };
  }

  if (String((r as any).name || '') === 'echo') {
    const text =
      typeof input === 'string'
        ? input
        : typeof input?.text === 'string'
          ? input.text
          : typeof (r as any)?.text === 'string'
            ? (r as any).text
            : '';
    const jsonLike = extractJsonLike(text);
    if (!jsonLike) return null;
    try {
      const parsed = JSON.parse(jsonLike);
      if (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).actions)) {
        return { actions: (parsed as any).actions };
      }
    } catch {}
  }

  return null;
}

function fallbackActionsFromInstruction(text: string): Planned['actions'] {
  const s = String(text || '').trim();
  if (!s) return [];

  const actions: Planned['actions'] = [];

  const wantsLogin =
    /(login|log\s*in|sign\s*in|signin|تسجيل\s*الدخول|سجل\s*دخول|سجّل\s*دخول|دخول|تسجيل|ولوج|لوج\s*ان|لوجن|ساين\s*ان|ساين|ساين-?إن)/i.test(
      s,
    );
  const wantsYahoo = /(yahoo|ياهو)/i.test(s);

  const url =
    extractUrl(s) ||
    (/(google|جوجل)/i.test(s) || /(ابحث|بحث|search|find|lookup)/i.test(s)
      ? 'https://www.google.com'
      : /(youtube|يوتيوب)/i.test(s)
        ? 'https://www.youtube.com'
        : wantsYahoo
          ? 'https://www.yahoo.com'
        : /(github|جيتهاب|قيتهب)/i.test(s)
          ? 'https://github.com'
          : /(openai|اوبن\s*اي)/i.test(s)
            ? 'https://platform.openai.com/'
            : /(x\.com|\btwitter\b|تويتر)/i.test(s)
              ? 'https://x.com'
              : /(facebook|فيسبوك)/i.test(s)
                ? 'https://www.facebook.com'
                : /(linkedin|لينكد\s*ان|لينكدإن)/i.test(s)
                  ? 'https://www.linkedin.com'
                  : null);
  if (url) actions.push({ type: 'goto', url });

  const clickMatches = [
    ...Array.from(s.matchAll(/\b(?:click|tap|press)\s+(?:on\s+)?["“”']?([^"“”'\n\r]+)["“”']?/gi)),
    ...Array.from(s.matchAll(/(?:انقر|اضغط|بالضغط\s+على|دوس|اكبس|كبس|كبّس|كليك|اضغطلي|اضغط على)\s+["“”']?([^"“”'\n\r]+)["“”']?/gi)),
  ];
  for (const m of clickMatches) {
    const label = String(m?.[1] || '')
      .trim()
      .replace(/^زر\s+/i, '')
      .trim();
    if (!label) continue;
    actions.push({ type: 'click', text: label });
  }

  const typeMatches = [
    ...Array.from(s.matchAll(/\b(?:type|write|enter|input|paste)\s+["“”']([^"“”']+)["“”']/gi)),
    ...Array.from(s.matchAll(/(?:اكتب|اكتبلي|ادخل|أدخل|حط|املأ|عبّي|عبئ)\s+["“”']([^"“”']+)["“”']/gi)),
  ];
  for (const m of typeMatches) {
    const val = String(m?.[1] || '');
    if (!val) continue;
    actions.push({ type: 'type', text: val });
  }

  const wantsUiAudit =
    /(audit|ui\s*audit|لقطة|صورة|سكرين|screenshot|فحص|عاين|اعرض|عرض)/i.test(s) &&
    !/(click|type|scroll|assert|انقر|اضغط|اكتب|تمرير|تحقق)/i.test(s);

  if (actions.length >= 2 && actions[0]?.type === 'goto') {
    const second = actions[1] as any;
    if (!second || String(second.type || '') !== 'wait') {
      actions.splice(1, 0, { type: 'wait', ms: 450 });
    }
  }

  if (wantsYahoo && wantsLogin) {
    const base: Planned['actions'] = [];
    base.push({ type: 'goto', url: 'https://www.yahoo.com' });
    base.push({ type: 'wait', ms: 450 });
    base.push({ type: 'click', selector: 'a[href*="login.yahoo.com"]', optional: true });
    base.push({ type: 'click', selector: 'a[href*="signin"],a[href*=\"sign-in\"],a[href*=\"sign_in\"]', optional: true });
    base.push({ type: 'click', text: 'Sign in', optional: true });
    base.push({ type: 'click', text: 'Log in', optional: true });
    base.push({ type: 'click', text: 'تسجيل الدخول', optional: true });
    base.push({ type: 'wait', ms: 500, optional: true });
    base.push({ type: 'assert', selector: '#login-username, input[name=\"username\"], input#login-username' });
    return base;
  }

  if (wantsUiAudit) actions.push({ type: 'ui_audit' });

  if (actions.length === 0) return [{ type: 'ui_audit' }];
  return actions;
}

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
  const hasOtherSteps = /(click|type|scroll|assert|انقر|اضغط|اكتب|تمرير|تحقق)/i.test(s);
  if (hasOtherSteps) return false;
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

  const secretsCheck = await resolveSecretsInText(userId, instructionTextRaw);
  if (!secretsCheck.ok) {
    const msg = `missing_secrets: ${secretsCheck.missing.join(', ')}`;
    const ev: BrowserWsEvent = {
      type: 'final_report',
      ts: now(),
      ok: false,
      summary: msg,
      steps: [],
      evidence: [],
    };
    broadcastBrowserEvent(sessionId, ev);
    broadcastBrowserEvent(sessionId, { type: 'final_failed', ts: now(), summary: msg, reason: 'missing_secrets' });
    return { ok: false as const, error: msg, missingSecrets: secretsCheck.missing };
  }

  const cfg = DEFAULT_BROWSER_CONFIG;
  const safeInstruction = redactSecretsFromString(instructionTextRaw);
  const closeAfterRun = shouldCloseAfterRun();
  const debugBase = {
    instruction: safeInstruction,
    compiled_plan_json: null as any,
    actions_json: null as any,
    action_count: 0,
    stop_reason: '',
  };
  const emitDebugSnapshot = () => {
    try {
      broadcastBrowserEvent(sessionId, {
        type: 'debug_snapshot',
        ts: now(),
        compiledPlanJson: debugBase.compiled_plan_json,
        actionsJson: debugBase.actions_json,
        actionCount: Number(debugBase.action_count || 0),
        stopReason: String(debugBase.stop_reason || ''),
      } as any);
    } catch {}
  };

  if (shouldFastOpen(safeInstruction)) {
    const url = extractUrl(safeInstruction);
    if (url) {
      debugBase.compiled_plan_json = [{ type: 'goto' }, { type: 'wait' }];
      debugBase.actions_json = deepRedactForDebug([{ type: 'goto', url }, { type: 'wait', ms: 450 }]);
      debugBase.action_count = 2;
      debugBase.stop_reason = 'fast_open';
      try {
        const exec = await executePlannedActions({
          userId,
          sessionId,
          actions: [{ type: 'goto', url }, { type: 'wait', ms: 450 }] as any,
        });
        if (closeAfterRun) {
          try { await stopSession(sessionId); } catch {}
        }
        emitDebugSnapshot();
        return { ok: true as const, result: exec, debug: debugBase };
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
        broadcastBrowserEvent(sessionId, { type: 'final_failed', ts: now(), summary: ev.summary, reason: String(c.code || 'browser_unavailable') });
        debugBase.stop_reason = String(c.code || 'browser_unavailable');
        emitDebugSnapshot();
        return { ok: false as const, error: 'browser_unavailable', detail: c, debug: debugBase };
      }
    }
  }

  let planned: Planned | null = null;
  let compilerUsed = false;
  try {
    const runCfg = getSessionRunConfig(sessionId);
    const providerKey = String(runCfg?.provider || '').trim().toLowerCase();
    const provider = providerKey && providerKey !== 'llm' ? providerKey : 'openai';
    const r = await planNextStep(
      [
        { role: 'system', content: COMPILER_SYSTEM },
        { role: 'user', content: safeInstruction },
      ],
      {
        provider,
        apiKey: runCfg?.apiKey,
        baseUrl: runCfg?.baseUrl,
        model: runCfg?.model,
      } as any,
    );
    compilerUsed = true;
    planned = plannedFromUnknown(r);
  } catch {
    planned = null;
  }

  if (planned) {
    planned.actions = planned.actions.slice(0, cfg.maxSteps);
    debugBase.compiled_plan_json = planned.actions.map((a: any) => ({ type: String(a?.type || 'unknown') }));
    debugBase.actions_json = deepRedactForDebug(planned.actions);
    debugBase.action_count = planned.actions.length;
    debugBase.stop_reason = 'compiled';
    const multiStepHint = /(click|type|scroll|assert|انقر|اضغط|اكتب|تمرير|تحقق)/i.test(safeInstruction);
    if (multiStepHint && planned.actions.length < 2) {
      const fallback = fallbackActionsFromInstruction(safeInstruction).slice(0, cfg.maxSteps);
      if (fallback.length > planned.actions.length) {
        planned = { actions: fallback };
        debugBase.compiled_plan_json = planned.actions.map((a: any) => ({ type: String(a?.type || 'unknown') }));
        debugBase.actions_json = deepRedactForDebug(planned.actions);
        debugBase.action_count = planned.actions.length;
        debugBase.stop_reason = 'fallback_override';
      }
    }
    if (planned.actions.length === 0) {
      const summary = 'plan_to_actions_empty';
      const ev: BrowserWsEvent = { type: 'final_report', ts: now(), ok: false, summary, steps: [], evidence: [] };
      broadcastBrowserEvent(sessionId, ev);
      broadcastBrowserEvent(sessionId, { type: 'final_failed', ts: now(), summary, reason: 'plan_to_actions_empty' });
      debugBase.stop_reason = 'plan_to_actions_empty';
      emitDebugSnapshot();
      return { ok: false as const, error: 'plan_to_actions_empty', debug: debugBase };
    }
  }

  if (!planned) {
    const fallback = fallbackActionsFromInstruction(safeInstruction).slice(0, cfg.maxSteps);
    if (fallback.length) {
      planned = { actions: fallback };
      debugBase.compiled_plan_json = planned.actions.map((a: any) => ({ type: String(a?.type || 'unknown') }));
      debugBase.actions_json = deepRedactForDebug(planned.actions);
      debugBase.action_count = planned.actions.length;
      debugBase.stop_reason = compilerUsed ? 'fallback_after_compiler' : 'fallback_no_compiler';
    } else {
      const summary = 'compiler_failed';
      const ev: BrowserWsEvent = { type: 'final_report', ts: now(), ok: false, summary, steps: [], evidence: [] };
      broadcastBrowserEvent(sessionId, ev);
      broadcastBrowserEvent(sessionId, { type: 'final_failed', ts: now(), summary, reason: 'compiler_failed' });
      debugBase.stop_reason = 'compiler_failed';
      emitDebugSnapshot();
      return { ok: false as const, error: 'compiler_failed', debug: debugBase };
    }
  }

  try {
    const exec = await executePlannedActions({
      userId,
      sessionId,
      actions: planned.actions as any,
    });
    if (closeAfterRun) {
      try { await stopSession(sessionId); } catch {}
    }
    debugBase.stop_reason = debugBase.stop_reason || 'executed';
    emitDebugSnapshot();
    return { ok: true as const, result: exec, debug: debugBase };
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
        debugBase.stop_reason = 'browser_closed_retried';
        emitDebugSnapshot();
        return { ok: true as const, result: exec2, debug: debugBase };
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
        broadcastBrowserEvent(sessionId, { type: 'final_failed', ts: now(), summary: ev2.summary, reason: String(c2.code || 'browser_unavailable') });
        debugBase.stop_reason = String(c2.code || 'browser_unavailable');
        emitDebugSnapshot();
        return { ok: false as const, error: 'browser_unavailable', detail: c2, debug: debugBase };
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
    broadcastBrowserEvent(sessionId, { type: 'final_failed', ts: now(), summary: ev.summary, reason: String(c.code || 'browser_unavailable') });
    debugBase.stop_reason = String(c.code || 'browser_unavailable');
    emitDebugSnapshot();
    return { ok: false as const, error: 'browser_unavailable', detail: c, debug: debugBase };
  }
}
