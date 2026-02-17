import type { BrowserWsEvent } from './types';
import { DEFAULT_BROWSER_CONFIG } from './config';
import { broadcastBrowserEvent, canAccessBrowserSession } from './wsHub';
import { resolveSecretsInText, redactSecretsFromString, rewriteInlineLoginCredentialsToSecrets } from './secrets';
import { planNextStep } from '../llm';
import { executePlannedActions } from './executor';
import { getBrowserSession, stopSession, touchSession, screenshotSessionJpeg } from './manager';
import { getSessionRunConfig, setSessionSecretEncrypted } from '../services/secrets';

const cfg = DEFAULT_BROWSER_CONFIG;

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
    | { type: 'evaluate'; script: string; optional?: boolean }
    | { type: 'ui_audit'; optional?: boolean }
    | { type: 'back'; optional?: boolean }
    | { type: 'forward'; optional?: boolean }
    | { type: 'reload'; optional?: boolean }
    | { type: 'screenshot'; optional?: boolean }
  >;
};

const COMPILER_SYSTEM = `
You are an advanced, visually-aware browser autonomous agent. 
Your goal is to achieve the GLOBAL_GOAL by translating user instructions into precise browser actions.

Core Principles:
1. **Universal Login & Form Reasoning**: 
   - You must detect login, signup, and data entry pages automatically. 
   - Look for elements like <input type="password">, or labels like "Email", "Password", "Sign In".
   - If the GLOBAL_GOAL involves login, autonomously identify the fields and the submit button.
   - Use {{SECRET:JOE_LOGIN_EMAIL}} and {{SECRET:JOE_LOGIN_PASSWORD}} when provided.
   - DO NOT ask for selectors if they are inferable from the UI_GROUNDING_JSON or screenshot.

2. **Visual Analysis First**: 
   - Always check the screenshot and UI_GROUNDING_JSON before acting. 
   - If an element isn't visible, scroll or navigate.
   - If you see an error message (e.g., "Invalid password"), report it clearly.

3. **Multi-Step Autonomy**: 
   - Plan the entire flow (e.g., Navigate -> Type -> Click -> Wait -> Assert).
   - You can output up to 80 actions in one sequence.
   - Use 'wait' after navigations or button clicks that cause page transitions.

4. **Reliability**: 
   - Prefer selecting by ID or unique ARIA labels.
   - Use coordinates (x, y) as a robust fallback for complex canvases or custom widgets.

Available Actions:
- {"type":"goto","url":"..."}
- {"type":"click","selector":"..."} OR {"type":"click","text":"..."} OR {"type":"click","x":123,"y":456}
- {"type":"type","text":"...", "selector":"..."} OR {"type":"type","text":"...", "x":123, "y":456}
- {"type":"fill","text":"...", "selector":"..."} 
- {"type":"scroll","direction":"down"|"up","amount":500}
- {"type":"wait","ms":2000}
- {"type":"key","key":"Enter"|"Escape"|"ArrowDown"|...}
- {"type":"evaluate","script":"..."}
- {"type":"ui_audit"} - Analyze the DOM for significant changes.
- {"type":"back"} | {"type":"forward"} | {"type":"reload"}
- {"type":"screenshot"} - Take a visual snapshot for reasoning.
- {"type":"hover","selector":"..."} - Trigger dropdowns or tooltips.

Output Format:
Return a valid JSON object: { "actions": [ ... ], "thought": "Detailed reasoning about the current page state and your next steps." }
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
        if (rect.width < 1 || rect.height < 1) return false;
        const s = window.getComputedStyle(el as any);
        if (!s) return false;
        if (s.display === 'none' || s.visibility === 'hidden') return false;
        const o = Number(s.opacity || '1');
        if (Number.isFinite(o) && o < 0.01) return false;
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
      const role = (el: Element) => {
        const r = pickAttr(el, 'role');
        if (r) return r;
        return (el as any).getAttribute?.('type') === 'button' ? 'button' : '';
      };

      const kindOf = (el: Element) => {
        const t = tag(el);
        const r = role(el);
        if (t === 'button') return 'button';
        if (t === 'a' && pickAttr(el, 'href')) return 'link';
        if (t === 'input') {
          const ty = pickAttr(el, 'type').toLowerCase();
          if (ty === 'submit' || ty === 'button' || ty === 'reset') return 'button';
          if (ty === 'checkbox' || ty === 'radio') return 'checkbox';
          return 'input';
        }
        if (t === 'textarea') return 'textarea';
        if (t === 'select') return 'select';
        if (t === 'img') return 'image';
        const rKind = String(r || '').toLowerCase();
        if (rKind === 'button') return 'button';
        if (rKind === 'link') return 'link';
        if (rKind === 'textbox' || rKind === 'searchbox') return 'input';
        if ((el as any).isContentEditable) return 'input';
        const txt = clampText((el as any).innerText || '');
        if (txt) return 'text';
        return 'unknown';
      };

      const elements: any[] = [];
      const selectors = [
        'a[href]', 'button', 'input', 'textarea', 'select', '[role]',
        '[contenteditable="true"]', '[tabindex]', '[aria-label]', 'label', 'summary',
        'h1,h2,h3,h4,h5,h6,p,li,span'
      ];
      const candidates = Array.from(document.querySelectorAll(selectors.join(',')));

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

          if (k === 'text' && (!text || text.length > 100)) continue;

          elements.push({
            kind: k,
            tag: t,
            role: role(el),
            text,
            ariaLabel: pickAttr(el, 'aria-label'),
            placeholder: (t === 'input' || t === 'textarea') ? pickAttr(el, 'placeholder') : '',
            nameAttr: pickAttr(el, 'name'),
            idAttr: pickAttr(el, 'id'),
            href: t === 'a' ? pickAttr(el, 'href') : '',
            typeAttr: t === 'input' ? pickAttr(el, 'type') : '',
            ariaExpanded: pickAttr(el, 'aria-expanded'),
            ariaChecked: pickAttr(el, 'aria-checked'),
            value: (el as any).value || '',
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          });
        } catch { }
      }

      const byPos = (a: any, b: any) => (a.rect.y === b.rect.y ? a.rect.x - b.rect.x : a.rect.y - b.rect.y);
      elements.sort(byPos);

      return {
        viewport: {
          w: window.innerWidth,
          h: window.innerHeight,
          scrollX: window.scrollX,
          scrollY: window.scrollY
        },
        elements: elements.slice(0, 500)
      };
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
  const wantsInstagram = /(instagram|انستجرام|إنستغرام|انستغرام|انستقرام)/i.test(s);
  const wantsTwitter = /(twitter|تويتر)/i.test(s);
  const wantsGoogle = /(google|جوجل)/i.test(s);
  const wantsDDG = /(duckduckgo|داك\s*داك\s*جو)/i.test(s);
  const wantsAmazon = /(amazon|أمازون|امازون)/i.test(s);
  const wantsNetflix = /(netflix|نتفليكس|نتفلكس)/i.test(s);

  const hasSearchIntent = /(ابحث|بحث|search|find|lookup)/i.test(s);

  if (hasSearchIntent) {
    const queryMatch = s.match(/(?:search|find|lookup|research|بحث|عن|for)\s+["'“”]?([^"“”']+)["'“”]?/i);
    const q = queryMatch ? queryMatch[1].trim() : s.replace(/(ابحث|بحث|search|find|lookup|عن|for)/gi, '').trim();

    if (q) {
      if (wantsGoogle) {
        actions.push({ type: 'goto', url: `https://www.google.com/search?q=${encodeURIComponent(q)}` });
      } else {
        // DEFAULT TO DUCKDUCKGO TO AVOID CAPTCHAS
        actions.push({ type: 'goto', url: `https://duckduckgo.com/?q=${encodeURIComponent(q)}` });
      }
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
              : (wantsX || wantsTwitter)
                ? 'https://x.com'
                : wantsFacebook
                  ? 'https://www.facebook.com'
                  : wantsLinkedIn
                    ? 'https://www.linkedin.com'
                    : wantsInstagram
                      ? 'https://www.instagram.com'
                      : wantsAmazon
                        ? 'https://www.amazon.com'
                        : wantsNetflix
                          ? 'https://www.netflix.com'
                          : wantsYahoo
                            ? 'https://www.yahoo.com'
                            : wantsGoogle
                              ? 'https://www.google.com'
                              : wantsDDG
                                ? 'https://duckduckgo.com'
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
      actions.splice(1, 0, { type: 'wait', ms: cfg.defaultWaitMs });
    }
  }

  if (wantsYahoo && wantsLogin) {
    const base: Planned['actions'] = [];
    base.push({ type: 'goto', url: 'https://www.yahoo.com' });
    base.push({ type: 'wait', ms: cfg.defaultWaitMs });
    base.push({ type: 'click', selector: 'a[href*="login.yahoo.com"]', optional: true });
    base.push({ type: 'click', selector: 'a[href*="signin"],a[href*=\"sign-in\"],a[href*=\"sign_in\"]', optional: true });
    base.push({ type: 'click', text: 'Sign in', optional: true });
    base.push({ type: 'click', text: 'Log in', optional: true });
    base.push({ type: 'click', text: 'تسجيل الدخول', optional: true });
    base.push({ type: 'wait', ms: cfg.shortWaitMs, optional: true });
    base.push({ type: 'assert', selector: '#login-username, input[name=\"username\"], input#login-username' });
    return base;
  }

  if (wantsGithub && wantsLogin) {
    const base: Planned['actions'] = [];
    base.push({ type: 'goto', url: 'https://github.com/login' });
    base.push({ type: 'wait', ms: cfg.defaultWaitMs });
    base.push({ type: 'assert', selector: 'input#login_field, input[name="login"], input[autocomplete="username"]' });
    base.push({ type: 'type', text: '{{SECRET:JOE_LOGIN_EMAIL}}' });
    base.push({ type: 'type', text: '{{SECRET:JOE_LOGIN_PASSWORD}}' });
    base.push({
      type: 'click',
      selector: 'input[type="submit"][name="commit"], button[type="submit"]:has-text("Sign in"), button:has-text("Sign in")',
    });
    base.push({ type: 'wait', ms: cfg.longWaitMs });
    base.push({ type: 'ui_audit', optional: true });
    return base;
  }

  if (wantsLogin) {
    actions.push({ type: 'click', text: 'Sign in', optional: true });
    actions.push({ type: 'click', text: 'Log in', optional: true });
    actions.push({ type: 'click', text: 'تسجيل الدخول', optional: true });
    actions.push({ type: 'click', text: 'تسجيل دخول', optional: true });
    actions.push({ type: 'wait', ms: cfg.shortWaitMs, optional: true });
    actions.push({ type: 'type', text: '{{SECRET:JOE_LOGIN_EMAIL}}', optional: true });
    actions.push({ type: 'type', text: '{{SECRET:JOE_LOGIN_PASSWORD}}', optional: true });
    actions.push({ type: 'click', selector: 'button[type="submit"], input[type="submit"]', optional: true });
    actions.push({ type: 'click', text: 'Sign in', optional: true });
    actions.push({ type: 'click', text: 'Log in', optional: true });
    actions.push({ type: 'click', text: 'تسجيل الدخول', optional: true });
    actions.push({ type: 'wait', ms: cfg.longWaitMs, optional: true });
    actions.push({ type: 'ui_audit', optional: true });
    return actions;
  }

  if (wantsUiAudit) actions.push({ type: 'ui_audit' });

  if (actions.length === 0) return [{ type: 'ui_audit' }];
  if (hasSearchIntent && actions.length === 1 && actions[0]?.type === 'goto') return actions;
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

function splitBrowserInstructionIntoSteps(text: string) {
  const raw = String(text || '').trim();
  if (!raw) return [];

  const urls: string[] = [];
  const protectedText = raw.replace(/https?:\/\/[^\s"'<>]+/gi, (m) => {
    const i = urls.length;
    const mm = String(m || '');
    const suffixMatch = mm.match(/^(.*)([)\]}>.,،;؛!?؟]+)$/);
    const url = suffixMatch?.[1] ? suffixMatch[1] : mm;
    const suffix = suffixMatch?.[2] ? suffixMatch[2] : '';
    urls.push(url);
    return `__URL_${i}__${suffix}`;
  });

  const stripPrefix = (s: string) => s.replace(/^\s*(?:\d+\s*[\).:-]|[-*•]\s*)\s*/g, '').trim();
  const restoreUrls = (s: string) => s.replace(/__URL_(\d+)__/g, (_m, n) => urls[Number(n)] || '');
  const splitByConjunctions = (s: string) =>
    s
      .split(
        /(?:\s*(?:->|→|⇒)\s*|\s*(?:ثم|ثمّ|وبعدها|وبعد ذلك|بعد ذلك|وبعدين|بعدين|ومن ثم)\s*[,،;؛]?\s*|\s*(?:and\s+then|then|after\s+that|next)\s*[,،;؛]?\s*|\s*(?:et\s+puis|puis|ensuite|après\s+ça|apres\s+ça|après\s+cela|apres\s+cela)\s*[,،;؛]?\s*|\s*(?:und\s+dann|dann|danach|anschließend|anschliessend|als\s+nächstes|als\s+naechstes)\s*[,،;؛]?\s*|\s*(?:y\s+luego|y\s+después|y\s+despues|luego|después\s+de\s+eso|despues\s+de\s+eso|después|despues|a\s+continuación|a\s+continuacion)\s*[,،;؛]?\s*|\s*(?:и\s+потом|и\s+затем|затем|потом|далее|после\s+этого)\s*[,،;؛]?\s*)/gi,
      )
      .map((p) => p.trim())
      .filter(Boolean);
  const normalizePart = (s: string) =>
    stripPrefix(s).replace(/^[\s,،;؛]+/g, '').replace(/[\s,،;؛]+$/g, '').trim();

  const lines = protectedText
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const parts: string[] = [];
  for (const line of lines.length ? lines : [protectedText]) {
    for (const p of splitByConjunctions(line)) {
      const cleaned = normalizePart(p);
      if (cleaned) parts.push(restoreUrls(cleaned));
    }
  }

  const uniq: string[] = [];
  for (const p of parts) {
    const v = p.trim();
    if (!v) continue;
    if (uniq.length && uniq[uniq.length - 1] === v) continue;
    uniq.push(v);
  }

  if (uniq.length > 6) {
    const head = uniq.slice(0, 5);
    const joiner = /[\u0600-\u06FF]/.test(raw) ? ' ثم ' : ' then ';
    const tail = uniq.slice(5).join(joiner);
    return [...head, tail].filter(Boolean);
  }

  return uniq;
}

export function splitBrowserInstructionIntoStepsForDebug(text: string) {
  return splitBrowserInstructionIntoSteps(text);
}

function classifyBrowserRuntimeError(e: any) {
  const msg = String(e?.message || e || '').trim();
  const lower = msg.toLowerCase();
  if (/executable doesn't exist|playwright install/i.test(msg)) return { code: 'chromium_missing', message: msg + '\nHint: Run "npx playwright install" in the api directory.' };
  if (/no such file or directory/i.test(msg) && /chrome|chromium/i.test(lower)) return { code: 'chromium_missing', message: msg + '\nHint: Run "npx playwright install" in the api directory.' };
  if (/target page, context or browser has been closed/i.test(msg)) return { code: 'browser_closed', message: msg };
  if (/xvfb|display|cannot open display|missing x server/i.test(lower)) return { code: 'display_missing', message: msg + '\nHint: Ensure a display server (Xvfb) is running if on a headless server.' };
  if (/sandbox|setuid/i.test(lower)) return { code: 'sandbox_blocked', message: msg };
  if (/glibc|gtk|nss|gbm|fontconfig/i.test(lower)) return { code: 'deps_missing', message: msg + '\nHint: Install missing system dependencies for Playwright.' };
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
  mode?: 'browser_test' | 'browser_secure';
  onProgress?: (msg: string) => void;
  onThought?: (msg: string) => void;
}) {
  const userId = String(params.userId || '').trim();
  const sessionId = String(params.sessionId || '').trim();
  const instructionTextRaw = String(params.instructionText || '').trim();
  const mode = params.mode || 'browser_test';

  if (!userId) throw new Error('userId_required');
  if (!sessionId) throw new Error('sessionId_required');
  if (!instructionTextRaw) throw new Error('instructionText_required');

  const authBypass = process.env.ENABLE_AUTH_BYPASS === 'true';
  if (!authBypass) {
    const ok = await canAccessBrowserSession(userId, sessionId);
    if (!ok) {
      const ev: BrowserWsEvent = { type: 'final_report', ts: now(), ok: false, summary: 'forbidden', steps: [], evidence: [] };
      broadcastBrowserEvent(sessionId, ev);
      broadcastBrowserEvent(sessionId, { type: 'final_failed', ts: now(), summary: 'forbidden', reason: 'forbidden' });
      return { ok: false as const, error: 'forbidden' };
    }
  }

  let instructionText = instructionTextRaw;
  try {
    const r = rewriteInlineLoginCredentialsToSecrets(instructionTextRaw);
    if (r.ok) {
      if (r.email) setSessionSecretEncrypted(sessionId, 'JOE_LOGIN_EMAIL', r.email, 60 * 60);
      if (r.password) setSessionSecretEncrypted(sessionId, 'JOE_LOGIN_PASSWORD', r.password, 60 * 60);
      instructionText = String(r.sanitizedText || instructionTextRaw).trim();
    }
  } catch { }

  const secretsCheck = await resolveSecretsInText(userId, sessionId, instructionText, { mode });
  if (!secretsCheck.ok) {
    const msg = `missing_secrets: ${secretsCheck.missing.join(', ')}`;
    // Suppression of redundant events here - we let the tool return the final error
    return { ok: false as const, error: 'missing_secrets', missingSecrets: secretsCheck.missing };
  }


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
          emitFinalReport: false, // Prevent duplication
        });
        if (closeAfterRun) {
          try { await stopSession(sessionId); } catch { }
        }
        emitDebugSnapshot();
        return { ok: true as const, result: exec, debug: debugBase };
      } catch (e: any) {
        const c = classifyBrowserRuntimeError(e);
        try { await stopSession(sessionId); } catch { }
        // Suppress redundant final_report broadcast here
        debugBase.stop_reason = String(c.code || 'browser_unavailable');
        emitDebugSnapshot();
        return { ok: false as const, error: 'browser_unavailable', detail: c, debug: debugBase };
      }
    }
  }

  const instructionSteps = splitBrowserInstructionIntoSteps(safeInstruction);
  if (instructionSteps.length >= 2) {
    const runCfg = getSessionRunConfig(sessionId);
    const providerKey = String(runCfg?.provider || '').trim().toLowerCase();
    const provider = providerKey && providerKey !== 'llm' ? providerKey : 'openai';

    const allSteps: Array<{ stepId: string; name: string; ok: boolean; reason?: any; message?: string }> = [];
    const allEvidence: Array<{ kind: 'screenshot'; jpegBase64: string; ts: number; stepId: string }> = [];
    const compiledPlan: any[] = [];
    const compiledActions: any[] = [];
    let stepOffset = 0;
    let overallOk = true;

    for (let i = 0; i < instructionSteps.length; i += 1) {
      const stepText = String(instructionSteps[i] || '').trim();
      if (!stepText) continue;

      let plannedStep: Planned | null = null;
      let compilerUsedStep = false;
      try {
        const wantsGrounding =
          /(click|type|scroll|assert|انقر|اضغط|اكتب|تمرير|تحقق|login|log\s*in|sign\s*in|signin|تسجيل\s*الدخول|سجل\s*دخول|سجّل\s*دخول|ابحث|بحث|search|find|lookup)/i.test(
            stepText,
          );
        const navUrl = extractUrl(stepText);
        const hasOpenKeyword = /(افتح|افتحي|افتحوا|اذهب|زيارة|open|go to|visit)/i.test(stepText);
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

        const userText = `GLOBAL_GOAL:\n${safeInstruction}\n\nCURRENT_STEP (${i + 1}/${instructionSteps.length}):\n${stepText}`;
        const userContent: any[] = [{ type: 'text', text: userText + groundingBlock }];
        if (screenshotBase64) {
          userContent.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${screenshotBase64}` } });
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
            onProgress: params.onProgress,
            onThought: params.onThought,
          } as any,
        );
        compilerUsedStep = true;
        plannedStep = plannedFromUnknown(r);
      } catch {
        plannedStep = null;
      }

      if (plannedStep) {
        plannedStep.actions = plannedStep.actions.slice(0, cfg.maxSteps);
        const multiStepHint =
          /(click|type|scroll|assert|انقر|اضغط|اكتب|تمرير|تحقق|login|log\s*in|sign\s*in|signin|تسجيل\s*الدخول|سجل\s*دخول|سجّل\s*دخول)/i.test(
            stepText,
          );
        if (multiStepHint && plannedStep.actions.length < 2) {
          const fallback = fallbackActionsFromInstruction(stepText).slice(0, cfg.maxSteps);
          if (fallback.length > plannedStep.actions.length) plannedStep = { actions: fallback };
        }
        const wantsLogin =
          /(login|log\s*in|sign\s*in|signin|تسجيل\s*الدخول|سجل\s*دخول|سجّل\s*دخول|دخول)/i.test(stepText) ||
          /\{\{\s*SECRET\s*:\s*JOE_LOGIN_(?:EMAIL|PASSWORD)\s*\}\}/i.test(stepText);
        const hasTypeOrClick = plannedStep.actions.some((a: any) => {
          const t = String(a?.type || '').toLowerCase();
          return t === 'type' || t === 'click';
        });
        if (wantsLogin && (!hasTypeOrClick || plannedStep.actions.length < 4)) {
          const fallback = fallbackActionsFromInstruction(stepText).slice(0, cfg.maxSteps);
          if (fallback.length > plannedStep.actions.length) plannedStep = { actions: fallback };
        }
      }

      if (!plannedStep) {
        const fallback = fallbackActionsFromInstruction(stepText).slice(0, cfg.maxSteps);
        if (fallback.length) plannedStep = { actions: fallback };
      }

      if (!plannedStep || plannedStep.actions.length === 0) {
        overallOk = false;
        debugBase.stop_reason = compilerUsedStep ? 'plan_to_actions_empty' : 'compiler_failed';
        break;
      }

      if (compiledActions.length + plannedStep.actions.length > cfg.maxSteps) {
        overallOk = false;
        debugBase.stop_reason = 'max_steps_exceeded';
        break;
      }

      compiledPlan.push(plannedStep.actions.map((a: any) => ({ type: String(a?.type || 'unknown') })));
      compiledActions.push(...plannedStep.actions);

      try {
        const exec = await executePlannedActions({
          userId,
          sessionId,
          actions: plannedStep.actions as any,
          stepOffset,
          emitFinalReport: false,
        });
        allSteps.push(...(exec.steps || []));
        allEvidence.push(...(exec.evidence || []));
        stepOffset += Array.isArray(exec.steps) ? exec.steps.length : 0;
        if (!exec.ok) {
          overallOk = false;
          break;
        }
      } catch (e: any) {
        overallOk = false;
        const c = classifyBrowserRuntimeError(e);
        debugBase.stop_reason = String(c.code || 'browser_unavailable');
        break;
      }
    }

    debugBase.compiled_plan_json = compiledPlan;
    debugBase.actions_json = deepRedactForDebug(compiledActions);
    debugBase.action_count = compiledActions.length;
    debugBase.stop_reason = debugBase.stop_reason || (overallOk ? 'executed_multi_step' : 'multi_step_failed');

    const summary = overallOk ? 'تم تنفيذ المهمة بنجاح.' : 'فشل تنفيذ بعض الخطوات.';
    // Single point of broadcast for final report in runner
    broadcastBrowserEvent(sessionId, {
      type: 'final_report',
      ts: now(),
      ok: overallOk,
      summary,
      steps: allSteps,
      evidence: allEvidence,
    });

    if (overallOk) {
      broadcastBrowserEvent(sessionId, { type: 'final_success', ts: now(), summary });
    } else {
      broadcastBrowserEvent(sessionId, { type: 'final_failed', ts: now(), summary, reason: 'some_steps_failed' });
    }
    try {
      const s = await getBrowserSession(sessionId);
      touchSession(sessionId);
      broadcastBrowserEvent(sessionId, { type: 'session_status', ts: now(), sessionId, url: s.page.url(), workerStatus: 'idle' });
    } catch { }

    if (closeAfterRun) {
      try { await stopSession(sessionId); } catch { }
    }
    emitDebugSnapshot();
    return { ok: true as const, result: { ok: overallOk, summary, steps: allSteps, evidence: allEvidence }, debug: debugBase };
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
        onProgress: params.onProgress,
        onThought: params.onThought,
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
      emitFinalReport: false, // runner will broadcast final_report
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
