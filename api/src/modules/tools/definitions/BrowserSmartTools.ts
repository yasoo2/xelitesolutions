import fs from 'fs';
import path from 'path';
import { ToolDefinition } from '../types';
import { getBrowserSession, withBrowserConcurrency } from '../../browser/manager';
import { routeToModel } from '../../../core/llm/intelligent-router';
import { broadcast } from '../../../api/ws';

const ARTIFACT_DIR = process.env.ARTIFACT_DIR || '/tmp/joe-artifacts';

/** Normalise a user-supplied URL (add https:// when missing). */
function normalizeUrl(raw: string): string {
    const u = String(raw || '').trim();
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    return `https://${u}`;
}

/** Save a JPEG buffer to the artifact dir and broadcast it to the browser panel. */
function publishShot(sessionId: string | undefined, buf: Buffer, url: string): string | undefined {
    try {
        fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
        const name = `browser-${Date.now()}.jpg`;
        fs.writeFileSync(path.join(ARTIFACT_DIR, name), buf);
        const href = `/artifacts/${name}`;
        try { broadcast({ type: 'browser_screenshot', sessionId, data: { href, url, sessionId } } as any); } catch { /* ignore */ }
        return href;
    } catch { return undefined; }
}

/** Shared: get a page, optionally navigate, return { page, url }. */
async function openPage(sessionId: string, rawUrl?: string) {
    const s = await getBrowserSession(sessionId);
    const page = s.page;
    const target = normalizeUrl(rawUrl || '');
    if (target) {
        await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(600);
    }
    return { page, url: page.url() };
}

const isAr = (t: string) => /[؀-ۿ]/.test(String(t || ''));

/* ============================================================
   1) browser_summarize — read a page and summarise it
   ============================================================ */
export class BrowserSummarizeTool implements ToolDefinition {
    name = 'browser_summarize';
    version = '1.0.0';
    description = 'Open a web page in the browser, read its content, and return a concise summary (optionally answering a question about it).';
    tags = ['browser', 'web', 'summarize', 'research'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            url: { type: 'string' as const, description: 'Page URL to summarise' },
            question: { type: 'string' as const, description: 'Optional question to answer from the page' },
        },
        required: ['url'],
    };
    get parameters() { return this.inputSchema; }
    outputSchema = { type: 'object' as const };
    permissions = []; sideEffects = []; rateLimitPerMinute = 0; auditFields = []; mockSupported = false;

    async execute(input: any, context?: any) {
        const sessionId = String(context?.sessionId || 'default');
        const url = input?.url || input?.link || '';
        const question = String(input?.question || input?.instruction || '').trim();
        if (!url) return { ok: false, error: 'no_url' };
        const ar = isAr(question) || isAr(String(input?.request || ''));

        try {
            return await withBrowserConcurrency(async () => {
                const { page, url: finalUrl } = await openPage(sessionId, url);
                // Extract the meaningful text from the page.
                const data = await page.evaluate(() => {
                    const clean = (t: string) => (t || '').replace(/\s+/g, ' ').trim();
                    const title = document.title || '';
                    const desc = (document.querySelector('meta[name="description"]') as HTMLMetaElement)?.content || '';
                    const headings = Array.from(document.querySelectorAll('h1,h2,h3')).slice(0, 30).map(h => clean((h as HTMLElement).innerText)).filter(Boolean);
                    const main = (document.querySelector('main') || document.body) as HTMLElement;
                    const text = clean(main?.innerText || '').slice(0, 7000);
                    return { title, desc, headings, text };
                });
                const buf = await page.screenshot({ type: 'jpeg', quality: 60, animations: 'disabled' });
                const shot = publishShot(sessionId, Buffer.from(buf), finalUrl);

                const sys = ar
                    ? 'أنت محلّل محتوى. لخّص الصفحة التالية بإيجاز واضح بالعربية: النقاط الرئيسية في شكل قائمة قصيرة، ثم جملة خلاصة. إن وُجد سؤال فأجب عنه من محتوى الصفحة.'
                    : 'You are a content analyst. Summarise the page concisely: key points as a short bullet list, then a one-line takeaway. If a question is given, answer it from the page.';
                const userContent = `URL: ${finalUrl}\nTitle: ${data.title}\nDescription: ${data.desc}\nHeadings: ${data.headings.join(' | ')}\n\nContent:\n${data.text}\n\n${question ? `Question: ${question}` : ''}`;

                let summary = '';
                try {
                    summary = await routeToModel([{ role: 'system', content: sys }, { role: 'user', content: userContent }], undefined, undefined, undefined, undefined, undefined, undefined, context);
                } catch (e: any) { summary = ''; }
                if (!summary || summary.trim().length < 2) {
                    // Deterministic fallback so it never fails silently.
                    summary = (ar ? `تعذّر التلخيص بالذكاء الآن. عنوان الصفحة: ${data.title}. أبرز العناوين: ` : `Summary unavailable. Page title: ${data.title}. Top headings: `) + data.headings.slice(0, 6).join(' • ');
                }
                const message = (ar ? `📄 ملخّص الصفحة (${finalUrl}):\n\n` : `📄 Page summary (${finalUrl}):\n\n`) + summary;
                return { ok: true, output: { message, summary, url: finalUrl, title: data.title, screenshot: shot } };
            });
        } catch (e: any) {
            return { ok: false, error: `summarize_failed: ${e?.message || e}` };
        }
    }
}

/* ============================================================
   2) browser_ui_audit — deterministic UI/accessibility audit
   ============================================================ */
export class BrowserUIAuditTool implements ToolDefinition {
    name = 'browser_ui_audit';
    version = '1.0.0';
    description = 'Open a web page and run a UI/UX and accessibility audit (missing alt text, unlabeled inputs, heading structure, broken images, viewport/lang, console errors) with a score.';
    tags = ['browser', 'web', 'ui', 'audit', 'accessibility', 'qa'];
    inputSchema = {
        type: 'object' as const,
        properties: { url: { type: 'string' as const, description: 'Page URL to audit' } },
        required: ['url'],
    };
    get parameters() { return this.inputSchema; }
    outputSchema = { type: 'object' as const };
    permissions = []; sideEffects = []; rateLimitPerMinute = 0; auditFields = []; mockSupported = false;

    async execute(input: any, context?: any) {
        const sessionId = String(context?.sessionId || 'default');
        const url = input?.url || input?.link || '';
        const ar = isAr(String(input?.request || input?.instruction || '')) || true; // default Arabic UI
        if (!url) return { ok: false, error: 'no_url' };
        try {
            return await withBrowserConcurrency(async () => {
                const s = await getBrowserSession(sessionId);
                const page = s.page;
                const consoleErrors: string[] = [];
                const onErr = (m: any) => { try { if (m.type?.() === 'error') consoleErrors.push(String(m.text()).slice(0, 200)); } catch { } };
                const onPageErr = (e: any) => { try { consoleErrors.push(String(e?.message || e).slice(0, 200)); } catch { } };
                page.on('console', onErr); page.on('pageerror', onPageErr);
                try {
                    const target = normalizeUrl(url);
                    await page.goto(target, { waitUntil: 'load', timeout: 30000 });
                    await page.waitForTimeout(700);

                    const audit = await page.evaluate(() => {
                        const issues: { severity: string; message: string }[] = [];
                        const q = (s: string) => Array.from(document.querySelectorAll(s));
                        // Language + viewport + title
                        if (!document.documentElement.getAttribute('lang')) issues.push({ severity: 'warning', message: 'وسم <html> بلا سمة lang (يضر الوصولية والـ RTL).' });
                        if (!document.querySelector('meta[name="viewport"]')) issues.push({ severity: 'critical', message: 'لا يوجد meta viewport — الصفحة غير متجاوبة على الجوال.' });
                        if (!document.querySelector('meta[charset]') && !document.characterSet) issues.push({ severity: 'warning', message: 'لا يوجد meta charset.' });
                        if (!(document.title || '').trim()) issues.push({ severity: 'warning', message: 'الصفحة بلا عنوان <title>.' });
                        // Images
                        const imgs = q('img') as HTMLImageElement[];
                        const noAlt = imgs.filter(i => !i.hasAttribute('alt')).length;
                        if (noAlt > 0) issues.push({ severity: 'warning', message: `${noAlt} صورة بلا نص بديل alt.` });
                        const broken = imgs.filter(i => i.complete && i.naturalWidth === 0).length;
                        if (broken > 0) issues.push({ severity: 'critical', message: `${broken} صورة مكسورة لا تُحمّل.` });
                        // Headings
                        const h1 = q('h1').length;
                        if (h1 === 0) issues.push({ severity: 'warning', message: 'لا يوجد عنوان رئيسي <h1>.' });
                        if (h1 > 1) issues.push({ severity: 'info', message: `يوجد ${h1} عناوين <h1> (يُفضّل واحد).` });
                        // Inputs without labels
                        const inputs = q('input, textarea, select').filter((el: any) => !['hidden', 'submit', 'button'].includes(el.type)) as HTMLElement[];
                        const unlabeled = inputs.filter((el: any) => {
                            const id = el.getAttribute('id');
                            const hasLabel = id && document.querySelector(`label[for="${id}"]`);
                            return !hasLabel && !el.getAttribute('aria-label') && !el.getAttribute('placeholder');
                        }).length;
                        if (unlabeled > 0) issues.push({ severity: 'warning', message: `${unlabeled} حقل إدخال بلا تسمية (label/aria-label/placeholder).` });
                        // Buttons/links without text
                        const emptyBtns = (q('button, a') as HTMLElement[]).filter(b => !b.innerText.trim() && !b.getAttribute('aria-label') && !b.querySelector('img[alt], svg')).length;
                        if (emptyBtns > 0) issues.push({ severity: 'warning', message: `${emptyBtns} زر/رابط بلا نص واضح.` });
                        // Tiny tap targets (quick heuristic)
                        const smallTargets = (q('a, button') as HTMLElement[]).filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.width < 24 || r.height < 24); }).length;
                        if (smallTargets > 3) issues.push({ severity: 'info', message: `${smallTargets} عنصر تفاعلي صغير (<24px) قد يصعب لمسه على الجوال.` });
                        return { issues, counts: { images: imgs.length, inputs: inputs.length, h1 } };
                    });

                    if (consoleErrors.length) audit.issues.push({ severity: 'critical', message: `${consoleErrors.length} خطأ في console: ${consoleErrors.slice(0, 2).join(' | ')}` } as any);

                    const buf = await page.screenshot({ type: 'jpeg', quality: 60, animations: 'disabled' });
                    const shot = publishShot(sessionId, Buffer.from(buf), page.url());

                    const crit = audit.issues.filter((i: any) => i.severity === 'critical').length;
                    const warn = audit.issues.filter((i: any) => i.severity === 'warning').length;
                    const info = audit.issues.filter((i: any) => i.severity === 'info').length;
                    const score = Math.max(0, 100 - crit * 20 - warn * 8 - info * 3);
                    const icon = (sv: string) => sv === 'critical' ? '🔴' : sv === 'warning' ? '🟡' : '🔵';
                    const lines = audit.issues.length
                        ? audit.issues.map((i: any) => `${icon(i.severity)} ${i.message}`).join('\n')
                        : '✅ لم أجد مشاكل واضحة.';
                    const message = `🔎 تدقيق واجهة الصفحة: ${page.url()}\n\nالدرجة: ${score}/100 (🔴 ${crit} · 🟡 ${warn} · 🔵 ${info})\n\n${lines}`;
                    return { ok: true, output: { message, score, issues: audit.issues, counts: audit.counts, url: page.url(), screenshot: shot } };
                } finally {
                    try { page.off('console', onErr); page.off('pageerror', onPageErr); } catch { }
                }
            });
        } catch (e: any) {
            return { ok: false, error: `ui_audit_failed: ${e?.message || e}` };
        }
    }
}

/* ============================================================
   3) browser_fill_form — fill a form from provided fields
   ============================================================ */
export class BrowserFillFormTool implements ToolDefinition {
    name = 'browser_fill_form';
    version = '1.0.0';
    description = 'Open a page and fill a form. Provide fields as { "label or name or placeholder": "value" }. Optionally submit.';
    tags = ['browser', 'web', 'form', 'automation'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            url: { type: 'string' as const, description: 'Page URL containing the form' },
            fields: { type: 'object' as const, description: 'Map of field identifier (label/name/id/placeholder) to value' },
            submit: { type: 'boolean' as const, description: 'Click the submit button after filling' },
        },
        required: ['fields'],
    };
    get parameters() { return this.inputSchema; }
    outputSchema = { type: 'object' as const };
    permissions = []; sideEffects = []; rateLimitPerMinute = 0; auditFields = []; mockSupported = false;

    async execute(input: any, context?: any) {
        const sessionId = String(context?.sessionId || 'default');
        const url = input?.url || input?.link || '';
        const fields = (input?.fields && typeof input.fields === 'object') ? input.fields : {};
        const submit = !!input?.submit;
        const keys = Object.keys(fields);
        if (keys.length === 0) return { ok: false, error: 'no_fields' };
        try {
            return await withBrowserConcurrency(async () => {
                const { page, url: finalUrl } = await openPage(sessionId, url);
                const filled: string[] = [];
                const missed: string[] = [];
                for (const key of keys) {
                    const value = String(fields[key] ?? '');
                    const ok = await page.evaluate(({ key, value }) => {
                        const norm = (s: string) => (s || '').toLowerCase().trim();
                        const k = norm(key);
                        const inputs = Array.from(document.querySelectorAll('input, textarea, select')) as HTMLInputElement[];
                        const match = inputs.find(el => {
                            const t = (el.type || '').toLowerCase();
                            if (['hidden', 'submit', 'button'].includes(t)) return false;
                            if (norm(el.getAttribute('name') || '') === k) return true;
                            if (norm(el.getAttribute('id') || '') === k) return true;
                            if (norm(el.getAttribute('placeholder') || '').includes(k)) return true;
                            if (norm(el.getAttribute('aria-label') || '').includes(k)) return true;
                            const id = el.getAttribute('id');
                            if (id) { const lbl = document.querySelector(`label[for="${id}"]`) as HTMLElement; if (lbl && norm(lbl.innerText).includes(k)) return true; }
                            return false;
                        });
                        if (!match) return false;
                        const tag = match.tagName.toLowerCase();
                        const type = (match.type || '').toLowerCase();
                        if (type === 'checkbox' || type === 'radio') { (match as HTMLInputElement).checked = /^(true|1|yes|on|نعم|صح)$/i.test(value); }
                        else if (tag === 'select') {
                            const sel = match as unknown as HTMLSelectElement;
                            const opt = Array.from(sel.options).find(o => norm(o.text).includes(norm(value)) || norm(o.value) === norm(value));
                            if (opt) sel.value = opt.value;
                        } else { match.value = value; }
                        match.dispatchEvent(new Event('input', { bubbles: true }));
                        match.dispatchEvent(new Event('change', { bubbles: true }));
                        return true;
                    }, { key, value });
                    if (ok) filled.push(key); else missed.push(key);
                }

                let submitted = false;
                if (submit) {
                    submitted = await page.evaluate(() => {
                        const btn = (document.querySelector('button[type="submit"], input[type="submit"]') ||
                            Array.from(document.querySelectorAll('button')).find(b => /submit|send|إرسال|ارسال|تسجيل|حفظ/i.test(b.textContent || ''))) as HTMLElement | null;
                        if (btn) { btn.click(); return true; }
                        const form = document.querySelector('form') as HTMLFormElement | null;
                        if (form) { form.requestSubmit ? form.requestSubmit() : form.submit(); return true; }
                        return false;
                    }).catch(() => false);
                    await page.waitForTimeout(800);
                }
                const buf = await page.screenshot({ type: 'jpeg', quality: 60, animations: 'disabled' });
                const shot = publishShot(sessionId, Buffer.from(buf), page.url());

                const message = `📝 تعبئة النموذج (${finalUrl}):\n✅ عُبّئت: ${filled.join('، ') || 'لا شيء'}` +
                    (missed.length ? `\n⚠️ لم أجد: ${missed.join('، ')}` : '') +
                    (submit ? `\n📤 الإرسال: ${submitted ? 'تم' : 'لم أجد زر إرسال'}` : '');
                return { ok: filled.length > 0, output: { message, filled, missed, submitted, url: page.url(), screenshot: shot } };
            });
        } catch (e: any) {
            return { ok: false, error: `fill_form_failed: ${e?.message || e}` };
        }
    }
}
