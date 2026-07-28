/* ============================================================
   REACT BROWSER LOOP  (Observe -> Decide -> Act -> Observe)
   ------------------------------------------------------------
   A REAL closed-loop autonomous browser agent. Instead of planning a whole
   action list blindly before seeing the page, this loop:
     1. OBSERVES the live page (url, title, a short text snippet, and a numbered
        list of the visible interactive elements WITH their on-screen x/y center).
     2. DECIDES the single next action by handing that observation + the task +
        the history so far to a "brain" (an LLM by default, but injectable so the
        loop itself can be tested deterministically).
     3. ACTS by executing that one action through the real executor (clicks/types
        BY COORDINATE, so it never has to guess a fragile CSS selector).
     4. Repeats until the brain says done / needs the user (2FA, CAPTCHA, a missing
        credential) or a step budget is exhausted.

   Credentials are referenced as {{SECRET:KEY}} in a `type` action's text and are
   resolved + masked by the executor, so passwords never appear in logs or the
   live view. A missing secret is surfaced to the caller as an ask_user outcome.
   ============================================================ */
import { getBrowserSession } from './manager';
import { executePlannedActions } from './executor';
import { broadcastBrowserEvent } from './wsHub';

/** Emit one live narration event to the session's panel (best-effort, never throws). */
function emitAgentStep(sessionId: string, ev: {
  phase: 'observe' | 'decide' | 'act' | 'result' | 'done' | 'needs_user';
  step: number; url?: string; title?: string; elementCount?: number;
  action?: string; reason?: string; ok?: boolean; note?: string; message?: string; secretKey?: string;
}) {
  try { broadcastBrowserEvent(sessionId, { type: 'agent_step', ts: Date.now(), ...ev } as any); } catch { /* panel optional */ }
}

/** Remembers the last task run per session so a user "provide credentials / 2FA"
 *  action can RESUME the exact same task on the same live session. */
const lastTaskBySession = new Map<string, string>();
export function getLastTaskForSession(sessionId: string): string | undefined {
  return lastTaskBySession.get(String(sessionId || '').trim());
}

/** A short, human-readable, CREDENTIAL-SAFE description of an action (never the
 *  real secret value — passwords/emails show as a label only). */
function describeAction(a: ReactAction, o?: Observation): string {
  switch (a.action) {
    case 'goto': return `يفتح ${a.url}`;
    case 'click': { const el = o?.elements.find(e => e.index === a.index); return `ينقر #${a.index}${el?.text ? ` «${el.text.slice(0, 30)}»` : ''}`; }
    case 'type': {
      const el = o?.elements.find(e => e.index === a.index);
      const isSecret = /\{\{\s*SECRET\s*:/i.test(a.text || '');
      const label = isSecret ? (/PASSWORD/i.test(a.text || '') ? 'كلمة المرور' : 'بيانات الدخول') : `«${String(a.text || '').slice(0, 24)}»`;
      return `يكتب ${label}${el?.text ? ` في #${a.index} (${el.text.slice(0, 20)})` : ` في #${a.index}`}`;
    }
    case 'select': { const el = o?.elements.find(e => e.index === a.index); return `يختار «${a.value}»${el?.text ? ` من #${a.index}` : ` من #${a.index}`}`; }
    case 'key': return `يضغط زر ${a.key}`;
    case 'scroll': return `يمرّر ${a.direction === 'up' ? 'للأعلى' : 'للأسفل'}`;
    case 'done': return 'أنهى المهمة';
    case 'ask_user': return 'يطلب تدخّل المستخدم';
    default: return String((a as any).action || '');
  }
}

export interface ObservedElement {
  index: number;
  tag: string;
  type?: string;      // input type / role
  text: string;       // visible text / value / aria-label / placeholder
  x: number;          // on-screen center
  y: number;
  isPassword?: boolean;
}

export interface Observation {
  url: string;
  title: string;
  textSnippet: string;
  elements: ObservedElement[];
}

export type ReactAction =
  | { action: 'goto'; url: string; reason?: string }
  | { action: 'click'; index: number; reason?: string }
  | { action: 'type'; index: number; text: string; reason?: string }
  | { action: 'select'; index: number; value: string; reason?: string }
  | { action: 'key'; key: string; reason?: string }
  | { action: 'scroll'; direction?: 'up' | 'down'; reason?: string }
  | { action: 'done'; answer?: string; reason?: string }
  | { action: 'ask_user'; message: string; reason?: string; secretKey?: string };

export interface ReactStep {
  n: number;
  action: ReactAction;
  ok: boolean;
  note?: string;
  url?: string;
}

export interface ReactResult {
  ok: boolean;
  status: 'done' | 'needs_user' | 'max_steps' | 'stuck' | 'error';
  summary: string;
  answer?: string;
  finalUrl?: string;
  steps: ReactStep[];
  missingSecret?: string;
}

/** A pluggable "brain": given the task + current observation + history, return the
 *  next single action. The default implementation calls the LLM router; tests pass
 *  a scripted decider to verify the loop plumbing deterministically. */
export type Decider = (ctx: {
  task: string;
  observation: Observation;
  history: ReactStep[];
  stepBudgetLeft: number;
}) => Promise<ReactAction>;

/** Best-effort: dismiss a cookie/consent overlay so it doesn't block everything.
 *  Clicks the first visible button whose text matches a common accept/close label.
 *  Runs inside the page and returns what it clicked (for logging), or null. */
export async function dismissConsent(page: any): Promise<string | null> {
  try {
    return await page.evaluate(() => {
      const ACCEPT = /^(accept all|accept|agree|i agree|allow all|allow|got it|ok|okay|continue|قبول الكل|قبول|أوافق|موافق|موافقة|السماح|تم|فهمت|متابعة)$/i;
      const cands = Array.from(document.querySelectorAll('button, a, [role=button], input[type=button], input[type=submit]')) as any[];
      for (const el of cands) {
        const r = el.getBoundingClientRect();
        if (!(r.width > 0 && r.height > 0)) continue;
        const t = String((el.innerText || el.value || el.getAttribute('aria-label') || '')).trim();
        if (t && t.length <= 24 && ACCEPT.test(t)) { el.click(); return t; }
      }
      return null;
    });
  } catch { return null; }
}

/** Let dynamic content settle before observing (best-effort, short). */
async function settle(page: any): Promise<void> {
  try { await page.waitForLoadState('domcontentloaded', { timeout: 3000 }); } catch { /* ignore */ }
  try { await page.waitForLoadState('networkidle', { timeout: 2500 }); } catch { /* ignore */ }
}

/** Read the live page into a compact, LLM-friendly observation. Every interactive
 *  element carries its on-screen center so actions can target it by coordinate. */
export async function observePage(page: any): Promise<Observation> {
  const url = (() => { try { return page.url(); } catch { return ''; } })();
  const title = await page.title().catch(() => '');
  const raw = await page.evaluate(() => {
    const pick = 'a, button, input, select, textarea, [role=button], [role=link], [onclick], [tabindex]';
    const els = Array.from(document.querySelectorAll(pick)) as any[];
    const out: any[] = [];
    let i = 0;
    for (const el of els) {
      const rect = el.getBoundingClientRect();
      if (!(rect.width > 0 && rect.height > 0)) continue;           // visible only
      if (rect.y < -5 || rect.y > (window.innerHeight + 400)) continue; // roughly in view
      const tag = el.tagName.toLowerCase();
      const type = (el.getAttribute('type') || el.getAttribute('role') || '').toLowerCase() || undefined;
      const isPw = tag === 'input' && type === 'password';
      let label =
        (el.getAttribute('aria-label') || '').trim() ||
        (!isPw ? (el.value || '').trim() : '') ||   // never expose a password field's value
        (el.textContent || '').trim() ||
        (el.getAttribute('placeholder') || '').trim() ||
        (el.getAttribute('name') || '').trim() ||
        (el.getAttribute('title') || '').trim();
      // For a dropdown, expose its options so the brain can pick a valid value.
      if (tag === 'select') {
        const opts = Array.from(el.options || []).map((o: any) => (o.textContent || o.value || '').trim()).filter(Boolean).slice(0, 12);
        if (opts.length) label = `${label ? label + ' ' : ''}[options: ${opts.join(' | ')}]`;
      }
      out.push({
        index: i++,
        tag,
        type,
        text: String(label).replace(/\s+/g, ' ').slice(0, 140),
        x: Math.round(rect.x + rect.width / 2),
        y: Math.round(rect.y + rect.height / 2),
        isPassword: tag === 'input' && (type === 'password'),
      });
      if (out.length >= 50) break;
    }
    const snippet = (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
    return { elements: out, snippet };
  }).catch(() => ({ elements: [], snippet: '' }));

  return { url, title, textSnippet: raw.snippet || '', elements: raw.elements || [] };
}

/** Render an observation as compact text the brain can reason over. */
export function renderObservation(o: Observation): string {
  const lines = o.elements.map(e => {
    const kind = e.tag === 'input' ? `input:${e.type || 'text'}` : (e.type ? `${e.tag}:${e.type}` : e.tag);
    return `#${e.index} [${kind}] "${e.text}"${e.isPassword ? ' (PASSWORD)' : ''}`;
  });
  return [
    `URL: ${o.url}`,
    `TITLE: ${o.title}`,
    `TEXT: ${o.textSnippet.slice(0, 600)}`,
    `ELEMENTS (act on these by index):`,
    ...(lines.length ? lines : ['(no interactive elements found)']),
  ].join('\n');
}

/** Map a brain action onto a real executor action list (single step). */
function toExecutorActions(a: ReactAction, o: Observation): any[] | null {
  if (a.action === 'goto') return a.url ? [{ type: 'goto', url: a.url }, { type: 'wait', ms: 1200 }] : null;
  if (a.action === 'key') return a.key ? [{ type: 'key', key: a.key }, { type: 'wait', ms: 600 }] : null;
  if (a.action === 'scroll') return [{ type: 'scroll', direction: a.direction === 'up' ? 'up' : 'down' }];
  if (a.action === 'click') {
    const el = o.elements.find(e => e.index === a.index);
    if (!el) return null;
    return [{ type: 'click_coordinates', x: el.x, y: el.y }, { type: 'wait', ms: 800 }];
  }
  if (a.action === 'type') {
    const el = o.elements.find(e => e.index === a.index);
    if (!el) return null;
    return [{ type: 'type', x: el.x, y: el.y, text: String(a.text ?? '') }];
  }
  if (a.action === 'select') {
    const el = o.elements.find(e => e.index === a.index);
    if (!el) return null;
    return [{ type: 'select', x: el.x, y: el.y, value: String(a.value ?? '') }];
  }
  return null; // done / ask_user are terminal, not executor actions
}

/** Run the closed observe→decide→act loop to completion. */
export async function runReactBrowserTask(params: {
  sessionId: string;
  userId: string;
  task: string;
  startUrl?: string;
  maxSteps?: number;
  decide: Decider;
}): Promise<ReactResult> {
  const sessionId = String(params.sessionId || '').trim();
  const userId = String(params.userId || '').trim();
  const task = String(params.task || '').trim();
  const maxSteps = Math.max(1, Math.min(30, params.maxSteps || 12));
  const steps: ReactStep[] = [];

  lastTaskBySession.set(sessionId, task); // enable resume-after-user-input

  const session = await getBrowserSession(sessionId);
  const page = session.page;

  // Optional deterministic first hop when a start URL is known up-front.
  if (params.startUrl) {
    await executePlannedActions({ userId, sessionId, actions: [{ type: 'goto', url: params.startUrl }, { type: 'wait', ms: 1200 }] as any })
      .catch(() => { /* observed below regardless */ });
  }

  let lastSignature = '';
  let repeat = 0;

  for (let n = 1; n <= maxSteps; n++) {
    await settle(page); // wait for dynamic content to load
    // Auto-dismiss a cookie/consent wall so it doesn't block the real task.
    const dismissed = await dismissConsent(page);
    if (dismissed) {
      emitAgentStep(sessionId, { phase: 'act', step: n, action: `يتجاوز نافذة الموافقة («${dismissed}»)` });
      await settle(page);
    }
    const observation = await observePage(page);
    emitAgentStep(sessionId, { phase: 'observe', step: n, url: observation.url, title: observation.title, elementCount: observation.elements.length });

    let action: ReactAction;
    try {
      action = await params.decide({ task, observation, history: steps, stepBudgetLeft: maxSteps - n });
    } catch (e: any) {
      return finish('error', false, `تعذّر اتخاذ القرار: ${String(e?.message || e)}`);
    }
    emitAgentStep(sessionId, { phase: 'decide', step: n, action: describeAction(action, observation), reason: (action as any).reason });

    // Terminal decisions.
    if (action.action === 'done') {
      steps.push({ n, action, ok: true, url: observation.url });
      emitAgentStep(sessionId, { phase: 'done', step: n, message: action.answer, url: observation.url });
      return finish('done', true, 'أنجز الوكيل المهمة.', action.answer, observation.url);
    }
    if (action.action === 'ask_user') {
      steps.push({ n, action, ok: true, url: observation.url });
      // If the agent is stuck on a 2FA/OTP step, tell the panel which secret to collect.
      const key = (action as any).secretKey
        || (/2fa|otp|رمز|كود|تحقّ?ق|verification|one[- ]?time/i.test(action.message || '') ? 'JOE_2FA_CODE' : undefined);
      emitAgentStep(sessionId, { phase: 'needs_user', step: n, message: action.message, url: observation.url, secretKey: key });
      const out = finish('needs_user', false, action.message || 'المهمة تحتاج تدخّلك.', undefined, observation.url);
      if (key) out.missingSecret = key;
      return out;
    }

    // Loop guard: identical action + same URL repeated 3x => stuck.
    const sig = JSON.stringify(action) + '|' + observation.url;
    if (sig === lastSignature) { repeat++; } else { repeat = 0; lastSignature = sig; }
    if (repeat >= 2) {
      steps.push({ n, action, ok: false, note: 'repeated', url: observation.url });
      return finish('stuck', false, 'توقّف الوكيل عن التقدّم (تكرار نفس الخطوة).', undefined, observation.url);
    }

    const execActions = toExecutorActions(action, observation);
    if (!execActions) {
      steps.push({ n, action, ok: false, note: 'invalid_action', url: observation.url });
      emitAgentStep(sessionId, { phase: 'result', step: n, ok: false, note: 'إجراء غير صالح', action: describeAction(action, observation) });
      continue; // let the brain see it failed and choose again
    }

    emitAgentStep(sessionId, { phase: 'act', step: n, action: describeAction(action, observation) });

    let res: any;
    try {
      res = await executePlannedActions({ userId, sessionId, actions: execActions as any });
    } catch (e: any) {
      return finish('error', false, `فشل تنفيذ خطوة المتصفح: ${String(e?.message || e)}`);
    }

    // Surface a missing credential to the user instead of silently failing.
    const missing = firstMissingSecret(res);
    if (missing) {
      steps.push({ n, action, ok: false, note: `missing_secret:${missing}`, url: page.url() });
      emitAgentStep(sessionId, { phase: 'needs_user', step: n, message: `يحتاج بيانات: ${missing}`, url: page.url(), secretKey: missing });
      const out = finish('needs_user', false,
        `النظام يحتاج بيانات تسجيل الدخول (${missing}) لإكمال المهمة. زوّدني بها مرّة واحدة لتُحفظ بأمان.`,
        undefined, page.url());
      out.missingSecret = missing;
      return out;
    }

    steps.push({ n, action, ok: Boolean(res?.ok), note: res?.ok ? undefined : String(res?.summary || 'step_failed'), url: page.url() });
    emitAgentStep(sessionId, { phase: 'result', step: n, ok: Boolean(res?.ok), url: page.url(), note: res?.ok ? undefined : String(res?.summary || '').slice(0, 80) });
  }

  const finalUrl = (() => { try { return page.url(); } catch { return ''; } })();
  return finish('max_steps', false, `بلغ الوكيل الحدّ الأقصى للخطوات (${maxSteps}) دون إعلان الانتهاء.`, undefined, finalUrl);

  function finish(status: ReactResult['status'], ok: boolean, summary: string, answer?: string, finalUrl?: string): ReactResult {
    return { ok, status, summary, answer, finalUrl, steps };
  }
}

function firstMissingSecret(res: any): string | null {
  const steps = Array.isArray(res?.steps) ? res.steps : [];
  for (const s of steps) {
    const m = String(s?.message || '').match(/missing_secret:([A-Z0-9_]+)/);
    if (m && m[1]) return m[1];
  }
  return null;
}
