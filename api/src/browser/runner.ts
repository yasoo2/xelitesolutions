import type { BrowserWsEvent, FailureReason } from './types';
import { DEFAULT_BROWSER_CONFIG } from './config';
import { broadcastBrowserEvent } from './wsHub';
import { resolveSecretsInText, redactSecretsFromString } from './secrets';
import { planNextStep } from '../llm';
import { executePlannedActions } from './executor';

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

  const exec = await executePlannedActions({
    userId,
    sessionId,
    actions: planned.actions as any,
  });

  return { ok: true as const, result: exec };
}
