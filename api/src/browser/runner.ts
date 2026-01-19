import type { BrowserWsEvent } from './types';
import { DEFAULT_BROWSER_CONFIG } from './config';
import { broadcastBrowserEvent } from './wsHub';
import { resolveSecretsInText, redactSecretsFromString, rewriteInlineLoginCredentialsToSecrets } from './secrets';
import { planNextStep } from '../llm';
import { executePlannedActions } from './executor';
import { getBrowserSession, stopSession, touchSession, screenshotSessionJpeg } from './manager';
import { getSessionRunConfig, setSessionSecretEncrypted } from '../services/secrets';

function now() {
  return Date.now();
}

type Planned = {
  actions: Array<
    | { type: 'goto'; url: string; optional?: boolean }
    | { type: 'click'; selector?: string; role?: string; name?: string; text?: string; x?: number; y?: number; optional?: boolean }
    | { type: 'hover'; selector?: string; role?: string; name?: string; text?: string; x?: number; y?: number; optional?: boolean }
    | { type: 'type'; selector?: string; role?: string; name?: string; text: string; x?: number; y?: number; optional?: boolean }
    | { type: 'scroll'; direction: 'down' | 'up'; amount?: number; optional?: boolean }
    | { type: 'wait'; ms: number; optional?: boolean }
    | { type: 'assert'; selector?: string; text?: string; optional?: boolean }
    | { type: 'key'; key: string; optional?: boolean }
    | { type: 'ui_audit'; optional?: boolean }
  >;
};

const COMPILER_SYSTEM = `
You are an intelligent, visually-aware browser agent.
You must output a SINGLE JSON object: { "actions": [ ... ] }

Goal: Translate user instructions into precise browser actions using the provided UI_GROUNDING_JSON (snapshot of the page) and the attached screenshot. You can SEE the page.

Smart Detection Rules:
- If user says "Login" (or "دخول"), look for semantic visual cues: buttons labeled "Sign in", "Log in", "Profile", or icons/Avatars.
- If a specific text selector fails, fallback to coordinates (x,y) from the grounding data.
- For YouTube/Social Media: "Sign in" often hides behind an Avatar or "Accounts" menu. Look for \`[aria-label="Account"]\` or similar.
- Do NOT stop at the first step if the instruction implies a sequence (e.g., "Go to X and Login" -> goto + wait + click).
- **CRITICAL**: For requests like "Read", "Summarize", "Translate", "What are the headlines?": just \`{"type":"goto"}\` and \`{"type":"wait","ms":3000}\`. Do NOT click articles or buttons unless explicitly asked. The system reads the page automatically.

Output Config:
- Max 80 actions.
- Use explicit selectors when confident, otherwise use coordinates or 'text' match.
- PREFER \`aria-label\` or \`placeholder\` over strict innerText matching for icons/inputs.

Action Types:
- {"type":"goto","url":"..."}
- {"type":"click","text":"..."} OR {"type":"click","selector":"..."} OR {"type":"click","x":123,"y":456}
- {"type":"type","text":"...", "selector":"..."} (Always use selector/x,y if possible for inputs)
- {"type":"scroll","direction":"down","amount":500}
- {"type":"wait","ms":2000} (Use generous waits for complex apps like YouTube)
- {"type":"ui_audit"} (If lost or page changed drastically)
- {"type":"key","key":"Enter"}
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

async function collectUiGroundingSnapshot(sessionId: string) {
  const sid = String(sessionId || '').trim();
  if (!sid) return null;
  try {
    const s = await getBrowserSession(sid);
    touchSession(sid);
    const page = s.page;
    const viewport = { w: s.viewport?.w || 0, h: s.viewport?.h || 0 };
    const url = (() => {
      try {
        return page.url();
      } catch {
        return '';
      }
    })();
    const raw = await page.evaluate(() => {
      const maxTextLen = 120;
      const maxAttrLen = 120;
      const clampText = (v: any) =>
        String(v || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, maxTextLen);

      const isVisible = (el: Element, rect: DOMRect) => {
        if (rect.width < 2 || rect.height < 2) return false;
        const s = window.getComputedStyle(el as any);
        if (!s) return false;
        if (s.display === 'none' || s.visibility === 'hidden') return false;
        const o = Number(s.opacity || '1');
        if (Number.isFinite(o) && o < 0.02) return false;
        if ((el as any).hasAttribute?.('hidden')) return false;
        return true;
      };

      const pickAttr = (el: Element, name: string) => {
        try {
          const v = (el as any).getAttribute?.(name);
          if (typeof v !== 'string') return '';
          return v.slice(0, maxAttrLen);
        } catch {
          return '';
        }
      };

      const tag = (el: Element) => String((el as any).tagName || '').toLowerCase();
      const role = (el: Element) => pickAttr(el, 'role');

      const kindOf = (el: Element) => {
        const t = tag(el);
        const r = role(el);
        if (t === 'button') return 'button';
        if (t === 'a' && pickAttr(el, 'href')) return 'link';
        if (t === 'input') {
          const ty = pickAttr(el, 'type').toLowerCase();
          if (ty === 'submit' || ty === 'button' || ty === 'reset') return 'button';
          return 'input';
        }
        if (t === 'textarea') return 'textarea';
        if (t === 'select') return 'select';
        if (t === 'img') return 'image';
        if (r === 'button') return 'button';
        if (r === 'link') return 'link';
        if (r === 'textbox') return 'input';
        if ((el as any).isContentEditable) return 'input';
        const txt = clampText((el as any).innerText || '');
        if (txt) return 'text';
        return 'unknown';
      };

      const elements: any[] = [];
      const candidates = Array.from(
        document.querySelectorAll(
          [
            'a[href]',
            'button',
            'input',
            'textarea',
            'select',
            '[role="button"]',
            '[role="link"]',
            '[role="textbox"]',
            '[contenteditable="true"]',
            '[tabindex]',
            '[class*="btn"]',
            '[class*="button"]',
            '[id*="login"]',
            '[id*="signin"]',
            '[aria-label]',
            'label',
            'summary',
            'h1,h2,h3,h4,h5,h6,p,li,span',
          ].join(','),
        ),
      );

      for (const el of candidates) {
        try {
          const rect = (el as any).getBoundingClientRect?.();
          if (!rect) continue;
          if (!isVisible(el, rect)) continue;
          const k = kindOf(el);
          if (k === 'unknown') continue;

          const t = tag(el);
          const text =
            k === 'input' || k === 'textarea' || k === 'select'
              ? clampText((el as any).value || pickAttr(el, 'placeholder') || pickAttr(el, 'aria-label') || '')
              : clampText((el as any).innerText || pickAttr(el, 'aria-label') || pickAttr(el, 'title') || '');

          if (k === 'text') {
            if (!text) continue;
            if (text.length > 80) continue;
            const childCount = (el as any).children?.length || 0;
            if (childCount > 3) continue;
          }

          const ariaLabel = pickAttr(el, 'aria-label');
          const placeholder = t === 'input' || t === 'textarea' ? pickAttr(el, 'placeholder') : '';
          const nameAttr = pickAttr(el, 'name');
          const idAttr = pickAttr(el, 'id');
          const href = t === 'a' ? pickAttr(el, 'href') : '';
          const typeAttr = t === 'input' ? pickAttr(el, 'type') : '';

          elements.push({
            kind: k,
            tag: t,
            role: role(el),
            text,
            ariaLabel,
            placeholder,
            nameAttr,
            idAttr,
            href,
            typeAttr,
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          });
        } catch { }
      }

      const byPos = (a: any, b: any) => (a.rect.y === b.rect.y ? a.rect.x - b.rect.x : a.rect.y - b.rect.y);
      elements.sort(byPos);

      const viewport = {
        w: window.innerWidth || 0,
        h: window.innerHeight || 0,
        scrollX: window.scrollX || 0,
        scrollY: window.scrollY || 0,
        dpr: window.devicePixelRatio || 1,
      };

      return { viewport, elements: elements.slice(0, 400) };
    });

    const els = Array.isArray(raw?.elements) ? raw.elements : [];
    const elements = els.map((e: any, i: number) => {
      const rect = e?.rect || {};
      const x = Number(rect?.x || 0);
      const y = Number(rect?.y || 0);
      const w = Number(rect?.width || 0);
      const h = Number(rect?.height || 0);
      const cx = Math.round(x + w / 2);
      const cy = Math.round(y + h / 2);
      return {
        id: `e${i + 1}`,
        kind: String(e?.kind || 'unknown'),
        tag: String(e?.tag || ''),
        role: String(e?.role || ''),
        text: String(e?.text || ''),
        ariaLabel: String(e?.ariaLabel || ''),
        placeholder: String(e?.placeholder || ''),
        nameAttr: String(e?.nameAttr || ''),
        idAttr: String(e?.idAttr || ''),
        href: String(e?.href || ''),
        typeAttr: String(e?.typeAttr || ''),
        rect: { x, y, width: w, height: h },
        center: { x: cx, y: cy },
      };
    });

    const boxes = elements.slice(0, 350).map((e: any) => ({
      x: e.rect.x,
      y: e.rect.y,
      width: e.rect.width,
      height: e.rect.height,
      label: `${e.id}:${e.kind}`,
    }));
    broadcastBrowserEvent(sid, { type: 'highlight_boxes', ts: now(), boxes } as any);

    return { url, viewport, elements };
  } catch {
    return null;
  }
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
    } catch { }
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
  const wantsOpenAI = /(open\s*a\s*i|open\s*ai|openai|اوبن\s*اي\s*اي|اوبن\s*اي)/i.test(s);
  const wantsPricing = /(price|pricing|سعر|الاسعار|الأسعار|تكلفة|cost)/i.test(s);
  const wantsMicrosoft = /(microsoft|مايكروسوفت|مايكروسوت)/i.test(s);
  const wantsRender = /(render\.com|\brender\b|ريندر)/i.test(s);
  const wantsGithub = /(github|جيتهاب|قيتهب|كتهاب|كيتهاب)/i.test(s);
  const wantsYoutube = /(youtube|يوتيوب)/i.test(s);
  const wantsX = /(x\.com|\btwitter\b|تويتر)/i.test(s);
  const wantsFacebook = /(facebook|فيس\s*بوك|الفيس\s*بوك)/i.test(s);
  const wantsLinkedIn = /(linkedin|لينكد\s*ان|لينكدإن)/i.test(s);
  const wantsExplicitGoogle =
    /(google|جوجل)/i.test(s) || /(ابحث|بحث|search|find|lookup)\s+(?:في|على|ب)\s*(?:google|جوجل)/i.test(s);
  const hasSearchIntent = /(ابحث|بحث|search|find|lookup)/i.test(s);

  if (wantsExplicitGoogle && hasSearchIntent) {
    const queryMatch = s.match(/(?:search|find|lookup|research|بحث|عن|for)\s+["'“”]?([^"“”']+)["'“”]?/i);
    if (queryMatch && queryMatch[1]) {
      const q = encodeURIComponent(queryMatch[1].trim());
      actions.push({ type: 'goto', url: `https://www.google.com/search?q=${q}` });
      return actions;
    }
  }

  const url =
    extractUrl(s) ||
    (wantsOpenAI
      ? wantsPricing
        ? 'https://openai.com/pricing'
        : 'https://platform.openai.com/'
      : wantsRender
        ? 'https://render.com'
        : wantsMicrosoft
          ? 'https://www.microsoft.com'
          : wantsGithub
            ? 'https://github.com'
            : wantsYoutube
              ? 'https://www.youtube.com'
              : wantsX
                ? 'https://x.com'
                : wantsFacebook
                  ? 'https://www.facebook.com'
                  : wantsLinkedIn
                    ? 'https://www.linkedin.com'
                    : wantsYahoo
                      ? 'https://www.yahoo.com'
                      : wantsExplicitGoogle
                        ? 'https://www.google.com'
                        : null);
  if (url) actions.push({ type: 'goto', url });

  const clickMatches = [
    ...Array.from(s.matchAll(/\b(?:click|tap|press)\s+(?:on\s+)?["“”']?([^"“”'\n\r]+)["“”']?/gi)),
    ...Array.from(
      s.matchAll(
        /(?:بالضغط\s+على|اضغط\s+على|انقر\s+على|انقر|اضغط|دوس|اكبس|كبس|كبّس|كليك|اضغطلي)\s+["“”']?([^"“”'\n\r]+)["“”']?/gi,
      ),
    ),
  ];
  for (const m of clickMatches) {
    const label = String(m?.[1] || '')
      .trim()
      .replace(/^(?:ال)?زر\s+/i, '')
      .replace(/^(?:على|علي)\s+/, '')
      .replace(/^(?:the\s+)?button\s+/i, '')
      .replace(/[)\].,;:!?]+$/g, '')
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

  if (wantsGithub && wantsLogin) {
    const base: Planned['actions'] = [];
    base.push({ type: 'goto', url: 'https://github.com/login' });
    base.push({ type: 'wait', ms: 450 });
    base.push({ type: 'assert', selector: 'input#login_field, input[name="login"], input[autocomplete="username"]' });
    base.push({ type: 'type', text: '{{SECRET:JOE_LOGIN_EMAIL}}' });
    base.push({ type: 'type', text: '{{SECRET:JOE_LOGIN_PASSWORD}}' });
    base.push({
      type: 'click',
      selector: 'input[type="submit"][name="commit"], button[type="submit"]:has-text("Sign in"), button:has-text("Sign in")',
    });
    base.push({ type: 'wait', ms: 900 });
    base.push({ type: 'ui_audit', optional: true });
    return base;
  }

  if (wantsLogin) {
    actions.push({ type: 'click', text: 'Sign in', optional: true });
    actions.push({ type: 'click', text: 'Log in', optional: true });
    actions.push({ type: 'click', text: 'تسجيل الدخول', optional: true });
    actions.push({ type: 'click', text: 'تسجيل دخول', optional: true });
    actions.push({ type: 'wait', ms: 500, optional: true });
    actions.push({ type: 'type', text: '{{SECRET:JOE_LOGIN_EMAIL}}', optional: true });
    actions.push({ type: 'type', text: '{{SECRET:JOE_LOGIN_PASSWORD}}', optional: true });
    actions.push({ type: 'click', selector: 'button[type="submit"], input[type="submit"]', optional: true });
    actions.push({ type: 'click', text: 'Sign in', optional: true });
    actions.push({ type: 'click', text: 'Log in', optional: true });
    actions.push({ type: 'click', text: 'تسجيل الدخول', optional: true });
    actions.push({ type: 'wait', ms: 900, optional: true });
    actions.push({ type: 'ui_audit', optional: true });
    return actions;
  }

  if (wantsUiAudit) actions.push({ type: 'ui_audit' });

  if (actions.length === 0) return [{ type: 'ui_audit' }];
  if (hasSearchIntent && !wantsExplicitGoogle && actions.length === 1 && actions[0]?.type === 'goto') return actions;
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
  const hasOtherSteps =
    /(click|type|scroll|assert|انقر|اضغط|اكتب|تمرير|تحقق|login|log\s*in|sign\s*in|signin|تسجيل\s*الدخول|سجل\s*دخول|سجّل\s*دخول)/i.test(
      s,
    );
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
  if (raw === undefined) return false; // Default to FALSE to keep sessions alive
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

  let instructionText = instructionTextRaw;
  try {
    const r = rewriteInlineLoginCredentialsToSecrets(instructionTextRaw);
    if (r.ok) {
      if (r.email) setSessionSecretEncrypted(sessionId, 'JOE_LOGIN_EMAIL', r.email, 60 * 60);
      if (r.password) setSessionSecretEncrypted(sessionId, 'JOE_LOGIN_PASSWORD', r.password, 60 * 60);
      instructionText = String(r.sanitizedText || instructionTextRaw).trim();
    }
  } catch { }

  const secretsCheck = await resolveSecretsInText(userId, sessionId, instructionText);
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
    return { ok: false as const, error: 'missing_secrets', missingSecrets: secretsCheck.missing };
  }

  const cfg = DEFAULT_BROWSER_CONFIG;
  const safeInstruction = redactSecretsFromString(instructionText);
  const closeAfterRun = shouldCloseAfterRun();
  const debugBase = {
    instruction: safeInstruction,
    compiled_plan_json: null as any,
    actions_json: null as any,
    action_count: 0,
    stop_reason: '',
  };
  const allowDebugSnapshot = (() => {
    const raw = String(process.env.BROWSER_DEBUG_SNAPSHOT || '').trim().toLowerCase();
    return ['1', 'true', 'yes', 'y', 'on'].includes(raw);
  })();
  const emitDebugSnapshot = () => {
    if (!allowDebugSnapshot) return;
    try {
      broadcastBrowserEvent(sessionId, {
        type: 'debug_snapshot',
        ts: now(),
        compiledPlanJson: debugBase.compiled_plan_json,
        actionsJson: debugBase.actions_json,
        actionCount: Number(debugBase.action_count || 0),
        stopReason: String(debugBase.stop_reason || ''),
      } as any);
    } catch { }
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
          try { await stopSession(sessionId); } catch { }
        }
        emitDebugSnapshot();
        return { ok: true as const, result: exec, debug: debugBase };
      } catch (e: any) {
        const c = classifyBrowserRuntimeError(e);
        try { await stopSession(sessionId); } catch { }
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
    const wantsGrounding =
      /(click|type|scroll|assert|انقر|اضغط|اكتب|تمرير|تحقق|login|log\s*in|sign\s*in|signin|تسجيل\s*الدخول|سجل\s*دخول|سجّل\s*دخول|ابحث|بحث|search|find|lookup)/i.test(
        safeInstruction,
      );
    const navUrl = extractUrl(safeInstruction);
    const hasOpenKeyword = /(افتح|افتحي|افتحوا|اذهب|زيارة|open|go to|visit)/i.test(safeInstruction);
    if (wantsGrounding && navUrl && hasOpenKeyword) {
      try {
        const s = await getBrowserSession(sessionId);
        touchSession(sessionId);
        await s.page.goto(navUrl, { waitUntil: 'domcontentloaded', timeout: cfg.navTimeoutMs });
        await s.page.waitForTimeout(350);
      } catch { }
    }
    const grounding = wantsGrounding ? await collectUiGroundingSnapshot(sessionId) : null;
    let screenshotBase64: string | null = null;
    if (wantsGrounding) {
      try {
        const buf = await screenshotSessionJpeg(sessionId, { quality: 40, timeoutMs: 3000 });
        screenshotBase64 = buf.toString('base64');
      } catch { }
    }

    const groundingJson = grounding ? (() => { try { return JSON.stringify(grounding); } catch { return ''; } })() : '';
    const urlBlock = grounding?.url ? `\n\nCURRENT_URL:\n${String(grounding.url).slice(0, 800)}` : '';
    const groundingBlock = groundingJson ? `${urlBlock}\n\nUI_GROUNDING_JSON:\n${groundingJson.slice(0, 24000)}` : urlBlock;

    const userContent: any[] = [{ type: 'text', text: safeInstruction + groundingBlock }];
    if (screenshotBase64) {
      userContent.push({
        type: 'image_url',
        image_url: { url: `data:image/jpeg;base64,${screenshotBase64}` }
      });
    }

    const r = await planNextStep(
      [
        { role: 'system', content: COMPILER_SYSTEM },
        { role: 'user', content: userContent },
      ],
      {
        provider,
        apiKey: runCfg?.apiKey,
        baseUrl: runCfg?.baseUrl,
        model: runCfg?.model,
        userId,
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
    const multiStepHint =
      /(click|type|scroll|assert|انقر|اضغط|اكتب|تمرير|تحقق|login|log\s*in|sign\s*in|signin|تسجيل\s*الدخول|سجل\s*دخول|سجّل\s*دخول)/i.test(
        safeInstruction,
      );
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
    const wantsLogin =
      /(login|log\s*in|sign\s*in|signin|تسجيل\s*الدخول|سجل\s*دخول|سجّل\s*دخول|دخول)/i.test(safeInstruction) ||
      /\{\{\s*SECRET\s*:\s*JOE_LOGIN_(?:EMAIL|PASSWORD)\s*\}\}/i.test(safeInstruction);
    const hasTypeOrClick = planned.actions.some((a: any) => {
      const t = String(a?.type || '').toLowerCase();
      return t === 'type' || t === 'click';
    });
    if (wantsLogin && (!hasTypeOrClick || planned.actions.length < 4)) {
      const fallback = fallbackActionsFromInstruction(safeInstruction).slice(0, cfg.maxSteps);
      if (fallback.length > planned.actions.length) {
        planned = { actions: fallback };
        debugBase.compiled_plan_json = planned.actions.map((a: any) => ({ type: String(a?.type || 'unknown') }));
        debugBase.actions_json = deepRedactForDebug(planned.actions);
        debugBase.action_count = planned.actions.length;
        debugBase.stop_reason = 'fallback_override_login';
      }
    }
    if (planned.actions.length === 0) {
      const summary = 'plan_to_actions_empty';
      try {
        broadcastBrowserEvent(sessionId, {
          type: 'action_error',
          ts: now(),
          actionId: 'compiler',
          actionType: 'compiler',
          reason: 'unknown',
          error: summary,
        } as any);
      } catch { }
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
      try {
        broadcastBrowserEvent(sessionId, {
          type: 'action_error',
          ts: now(),
          actionId: 'compiler',
          actionType: 'compiler',
          reason: 'unknown',
          error: summary,
        } as any);
      } catch { }
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
      try { await stopSession(sessionId); } catch { }
    }
    debugBase.stop_reason = debugBase.stop_reason || 'executed';
    emitDebugSnapshot();
    return { ok: true as const, result: exec, debug: debugBase };
  } catch (e: any) {
    const c = classifyBrowserRuntimeError(e);
    try { await stopSession(sessionId); } catch { }
    if (c.code === 'browser_closed') {
      try {
        const exec2 = await executePlannedActions({
          userId,
          sessionId,
          actions: planned.actions as any,
        });
        if (closeAfterRun) {
          try { await stopSession(sessionId); } catch { }
        }
        debugBase.stop_reason = 'browser_closed_retried';
        emitDebugSnapshot();
        return { ok: true as const, result: exec2, debug: debugBase };
      } catch (e2: any) {
        const c2 = classifyBrowserRuntimeError(e2);
        try { await stopSession(sessionId); } catch { }
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
