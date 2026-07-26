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

/** Extract a structural signature of the current page (for before/after diffing). */
async function pageSignature(page: any) {
    return await page.evaluate(() => {
        const txt = (el: Element) => ((el as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim();
        const list = (sel: string) => Array.from(document.querySelectorAll(sel)).map(txt).filter(Boolean).slice(0, 60);
        return {
            title: document.title || '',
            buttons: list('button, [role="button"], input[type="submit"]'),
            links: list('a'),
            headings: list('h1, h2, h3'),
            inputs: Array.from(document.querySelectorAll('input, textarea, select')).map(el => el.getAttribute('name') || el.getAttribute('id') || el.getAttribute('placeholder') || '').filter(Boolean).slice(0, 60),
            images: document.querySelectorAll('img').length,
            bodyLen: ((document.body?.innerText || '').replace(/\s+/g, ' ').trim()).length,
        };
    });
}

function setDiff(a: string[], b: string[]) {
    const nb = new Set((b || []).map(x => x.toLowerCase().trim()));
    return (a || []).filter(x => !nb.has(x.toLowerCase().trim()));
}

/* ============================================================
   4) browser_compare — before/after visual + structural diff
   ============================================================ */
export class BrowserCompareTool implements ToolDefinition {
    name = 'browser_compare';
    version = '1.0.0';
    description = 'Compare a page before/after a change: pass {before,after} URLs, or a single {url} to capture a baseline the first time and diff on the next call. Returns what was added/removed and a visual diff image + % changed.';
    tags = ['browser', 'web', 'compare', 'diff', 'visual', 'qa'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            url: { type: 'string' as const, description: 'Single URL: first call captures a baseline, next call diffs against it' },
            before: { type: 'string' as const, description: 'URL of the BEFORE state' },
            after: { type: 'string' as const, description: 'URL of the AFTER state' },
        },
    };
    get parameters() { return this.inputSchema; }
    outputSchema = { type: 'object' as const };
    permissions = []; sideEffects = []; rateLimitPerMinute = 0; auditFields = []; mockSupported = false;

    async execute(input: any, context?: any) {
        const sessionId = String(context?.sessionId || 'default');
        let before = normalizeUrl(input?.before || '');
        let after = normalizeUrl(input?.after || '');
        const single = normalizeUrl(input?.url || '');

        // Single-URL baseline workflow.
        const baselines: Record<string, { sig: any; png: string }> = (global as any).joeCompareBaselines || ((global as any).joeCompareBaselines = {});
        try {
            return await withBrowserConcurrency(async () => {
                const s = await getBrowserSession(sessionId);
                const page = s.page;

                const capture = async (url: string) => {
                    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
                    await page.waitForTimeout(600);
                    const sig = await pageSignature(page);
                    const png = (await page.screenshot({ type: 'png', animations: 'disabled' })) as Buffer;
                    return { sig, pngB64: png.toString('base64') };
                };

                let beforeCap: { sig: any; pngB64: string };
                let afterCap: { sig: any; pngB64: string };

                if (before && after) {
                    beforeCap = await capture(before);
                    afterCap = await capture(after);
                } else if (single) {
                    const cur = await capture(single);
                    const prev = baselines[single];
                    if (!prev) {
                        baselines[single] = { sig: cur.sig, png: cur.pngB64 };
                        return { ok: true, output: { message: `📸 التقطتُ لقطة أساس (baseline) للصفحة: ${single}\nأجرِ تعديلك ثم اطلب المقارنة مرة أخرى لِأُظهر لك ما تغيّر.`, baseline: true, url: single } };
                    }
                    beforeCap = { sig: prev.sig, pngB64: prev.png };
                    afterCap = cur;
                    before = single; after = single;
                    baselines[single] = { sig: cur.sig, png: cur.pngB64 }; // refresh baseline
                } else {
                    return { ok: false, error: 'need_before_after_or_url' };
                }

                // --- Structural diff (what changed) ---
                const a = beforeCap.sig, b = afterCap.sig;
                const changes: string[] = [];
                const addedBtns = setDiff(b.buttons, a.buttons); const remBtns = setDiff(a.buttons, b.buttons);
                const addedLinks = setDiff(b.links, a.links); const remLinks = setDiff(a.links, b.links);
                const addedH = setDiff(b.headings, a.headings); const remH = setDiff(a.headings, b.headings);
                if (addedBtns.length) changes.push(`➕ أزرار جديدة: ${addedBtns.join('، ')}`);
                if (remBtns.length) changes.push(`➖ أزرار محذوفة: ${remBtns.join('، ')}`);
                if (addedLinks.length) changes.push(`➕ روابط جديدة: ${addedLinks.slice(0, 8).join('، ')}`);
                if (remLinks.length) changes.push(`➖ روابط محذوفة: ${remLinks.slice(0, 8).join('، ')}`);
                if (addedH.length) changes.push(`➕ عناوين جديدة: ${addedH.join('، ')}`);
                if (remH.length) changes.push(`➖ عناوين محذوفة: ${remH.join('، ')}`);
                if (b.images !== a.images) changes.push(`🖼️ عدد الصور: ${a.images} ← ${b.images}`);
                if (b.title !== a.title) changes.push(`🏷️ العنوان: «${a.title}» ← «${b.title}»`);
                const lenDelta = b.bodyLen - a.bodyLen;
                if (Math.abs(lenDelta) > 20) changes.push(`📝 حجم النص: ${lenDelta > 0 ? '+' : ''}${lenDelta} حرف`);

                // --- Visual diff via canvas (no external libs) ---
                let pctChanged = -1;
                let compositeHref: string | undefined;
                try {
                    const compareHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
                      body{margin:0;background:#0f1113;font-family:sans-serif;color:#ddd}
                      .row{display:flex;gap:2px}.col{flex:1;text-align:center}
                      .lbl{font-size:13px;padding:6px;color:#9aa}img,canvas{width:100%;display:block;border-top:1px solid #333}
                    </style></head><body>
                      <div class="row">
                        <div class="col"><div class="lbl">قبل</div><img id="ib"></div>
                        <div class="col"><div class="lbl">بعد</div><img id="ia"></div>
                        <div class="col"><div class="lbl">الفرق</div><canvas id="cd"></canvas></div>
                      </div>
                      <script>
                        const ib=document.getElementById('ib'), ia=document.getElementById('ia'), cd=document.getElementById('cd');
                        function load(img,src){return new Promise(r=>{img.onload=()=>r(img);img.src=src;});}
                        (async()=>{
                          const b=await load(ib,'data:image/png;base64,${beforeCap.pngB64}');
                          const a=await load(ia,'data:image/png;base64,${afterCap.pngB64}');
                          const w=Math.min(b.naturalWidth,a.naturalWidth), h=Math.min(b.naturalHeight,a.naturalHeight);
                          const c1=document.createElement('canvas'),c2=document.createElement('canvas');
                          c1.width=c2.width=cd.width=w; c1.height=c2.height=cd.height=h;
                          const x1=c1.getContext('2d'),x2=c2.getContext('2d'),xd=cd.getContext('2d');
                          x1.drawImage(b,0,0,w,h); x2.drawImage(a,0,0,w,h);
                          const d1=x1.getImageData(0,0,w,h),d2=x2.getImageData(0,0,w,h),out=xd.createImageData(w,h);
                          let diff=0; const n=w*h;
                          for(let i=0;i<d1.data.length;i+=4){
                            const dr=Math.abs(d1.data[i]-d2.data[i]),dg=Math.abs(d1.data[i+1]-d2.data[i+1]),db=Math.abs(d1.data[i+2]-d2.data[i+2]);
                            if(dr+dg+db>60){diff++;out.data[i]=255;out.data[i+1]=40;out.data[i+2]=40;out.data[i+3]=255;}
                            else {out.data[i]=d2.data[i];out.data[i+1]=d2.data[i+1];out.data[i+2]=d2.data[i+2];out.data[i+3]=90;}
                          }
                          xd.putImageData(out,0,0);
                          (window).__pct=((diff/n)*100).toFixed(1);
                          document.title='PCT:'+(window).__pct;
                        })();
                      </script></body></html>`;
                    await page.setContent(compareHtml, { waitUntil: 'load' });
                    await page.waitForFunction(() => (window as any).__pct !== undefined, { timeout: 8000 }).catch(() => { });
                    pctChanged = parseFloat(await page.evaluate(() => (window as any).__pct ?? '-1'));
                    const comp = (await page.screenshot({ type: 'jpeg', quality: 70, fullPage: true })) as Buffer;
                    compositeHref = publishShot(sessionId, Buffer.from(comp), after);
                } catch { /* visual diff optional */ }

                const headline = changes.length ? changes.join('\n') : 'لا تغييرات بنيوية واضحة (قد يكون التغيير في الألوان/التنسيق فقط).';
                const pctLine = pctChanged >= 0 ? `\n\n👁️ نسبة التغيّر البصري: ${pctChanged}%` : '';
                const message = `🔀 مقارنة قبل/بعد:\n\n${headline}${pctLine}`;
                return { ok: true, output: { message, changes, pctChanged, url: after, composite: compositeHref } };
            });
        } catch (e: any) {
            return { ok: false, error: `compare_failed: ${e?.message || e}` };
        }
    }
}

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
