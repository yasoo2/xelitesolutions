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
  | { action: 'key'; key: string; reason?: string }
  | { action: 'scroll'; direction?: 'up' | 'down'; reason?: string }
  | { action: 'done'; answer?: string; reason?: string }
  | { action: 'ask_user'; message: string; reason?: string };

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
      const label =
        (el.getAttribute('aria-label') || '').trim() ||
        (!isPw ? (el.value || '').trim() : '') ||   // never expose a password field's value
        (el.textContent || '').trim() ||
        (el.getAttribute('placeholder') || '').trim() ||
        (el.getAttribute('name') || '').trim() ||
        (el.getAttribute('title') || '').trim();
      out.push({
        index: i++,
        tag,
        type,
        text: String(label).replace(/\s+/g, ' ').slice(0, 80),
        x: Math.round(rect.x + rect.width / 2),
        y: Math.round(rect.y + rect.height / 2),
        isPassword: tag === 'input' && (type === 'password'),
      });
      if (out.length >= 40) break;
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
    const observation = await observePage(page);

    let action: ReactAction;
    try {
      action = await params.decide({ task, observation, history: steps, stepBudgetLeft: maxSteps - n });
    } catch (e: any) {
      return finish('error', false, `تعذّر اتخاذ القرار: ${String(e?.message || e)}`);
    }

    // Terminal decisions.
    if (action.action === 'done') {
      steps.push({ n, action, ok: true, url: observation.url });
      return finish('done', true, 'أنجز الوكيل المهمة.', action.answer, observation.url);
    }
    if (action.action === 'ask_user') {
      steps.push({ n, action, ok: true, url: observation.url });
      return finish('needs_user', false, action.message || 'المهمة تحتاج تدخّلك.', undefined, observation.url);
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
      continue; // let the brain see it failed and choose again
    }

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
      const out = finish('needs_user', false,
        `النظام يحتاج بيانات تسجيل الدخول (${missing}) لإكمال المهمة. زوّدني بها مرّة واحدة لتُحفظ بأمان.`,
        undefined, page.url());
      out.missingSecret = missing;
      return out;
    }

    steps.push({ n, action, ok: Boolean(res?.ok), note: res?.ok ? undefined : String(res?.summary || 'step_failed'), url: page.url() });
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
