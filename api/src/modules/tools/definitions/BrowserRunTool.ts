
import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import { getBrowserSession, screenshotSessionJpeg, touchSession } from '../../browser/manager';
import { canAccessBrowserSession } from '../../browser/wsHub';
import { getSessionSecret, getUserSecret } from '../../services/secrets';
import path from 'path';
import fs from 'fs';
import { agentSearchUrl } from '../../browser/challenge';

const ARTIFACT_DIR = process.env.ARTIFACT_DIR || '/tmp/joe-artifacts';

export function localLivePreviewFor(sessionId: string): string {
    const key = String(sessionId || '').replace(/[^a-zA-Z0-9._-]/g, '_');
    const record = (global as any).joeProjects?.[key]?.live;
    const raw = String(record?.url || '').trim();
    if (!raw) return '';
    try {
        const u = new URL(raw);
        if (!['localhost', '127.0.0.1', '::1'].includes(u.hostname)) return '';
        return raw;
    } catch {
        return '';
    }
}

/**
 *  ⛔ DOES THIS INSTRUCTION NAME SOMEWHERE ELSE?
 *
 *  Measured live, on the simplest prompt anyone has run at Joe:
 *
 *      prompt : Build a simple counter app with a button that increments the count.
 *      step   : "Verify that the counter increments when the button is clicked"
 *      result : the browser opened a DuckDuckGo search FOR THAT SENTENCE
 *               browser_run returned ok:true
 *
 *  Joe built the app, then went looking for it on the internet.
 *
 *  ⛔ AND THE CAUSE WAS A CATALOGUE OF PAST PROJECTS. The reader that decides
 *  «is he talking about the app I just built?» matched a hard-coded noun list:
 *
 *      app · application · project · site · system · page ·
 *      weathergo · weather · city · cities · favorite · forecast ·
 *      temperature · settings · invalid · api · istanbul
 *
 *  which is the WeatherGo project's vocabulary, written into a general router.
 *  «counter» is not on it. «button» is not on it. So a counter app was
 *  invisible to the one function whose whole job was to see it, and the final
 *  `else` below searched the web for the sentence. **The fourth law broken in
 *  its most literal form: a decision routed from remembered projects instead
 *  of from the request** — the same disease as the acceptance catalogue, in a
 *  second organ nobody had looked at. Every future app whose nouns nobody
 *  thought to add — a todo list, an invoice table, this counter — got a search
 *  page instead of a verification.
 *
 *  **So the default is inverted.** A browser step inside a build asks about
 *  the thing that was just built unless the instruction NAMES somewhere else:
 *  a literal address, or an external site by name. That question can be
 *  answered without knowing anything about what kind of app it is, which is
 *  exactly why it survives the next request and the noun list could not.
 */
export function namesAnExternalTarget(instructionText: string): boolean {
    const text = String(instructionText || '').trim();
    if (!text) return false;
    //  An address he wrote down is unambiguous and outranks everything.
    if (/https?:\/\/[^\s]+/i.test(text)) return true;
    //  A search engine or a public site named out loud. This list may safely
    //  be incomplete: a name missing from it routes to the app he just built,
    //  which is the harmless direction. The old list failed the other way.
    if (/\b(?:google|yahoo|bing|duckduckgo|wikipedia|github\.com|stackoverflow|youtube|x\.com|twitter|facebook|linkedin|instagram|amazon|netflix|microsoft|openai|render\.com)\b/i.test(text)) return true;
    if (/(?:جوجل|غوغل|ياهو|ويكيبيديا|يوتيوب|تويتر|فيس\s*بوك|لينكد\s*ان|انستجرام|أمازون|امازون|نتفليكس|مايكروسوفت)/i.test(text)) return true;
    //  «search the web» / «بحث في الإنترنت» — the intent stated, not guessed
    //  from a verb that appears in ordinary prose.
    if (/search(?:ing)?\s+(?:the\s+)?(?:web|internet|online)\b/i.test(text)) return true;
    if (/بحث\s+(?:في|على)\s+(?:الويب|الإنترنت|الانترنت)/i.test(text)) return true;
    return false;
}

/**
 *  The question this used to ask by matching nouns, asked by elimination
 *  instead. Anything that does not name somewhere else is about the thing this
 *  session just built — and the caller still has to HAVE one, which is the
 *  half that must never be papered over with a search.
 */
export function asksToOpenTheActiveApp(instructionText: string): boolean {
    const text = String(instructionText || '').trim();
    if (!text) return false;
    return !namesAnExternalTarget(text);
}

export class BrowserRunTool extends BaseTool {
    name = 'browser_run';
    description = 'Execute browser actions, or compile instructionText into a multi-step plan.';
    version = '2.0.0'; // Updated to 2.0 (Class based)
    tags = ['browser', 'web', 'actions', 'smart'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            sessionId: { type: 'string' },
            instructionText: { type: 'string' },
            actions: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        type: { type: 'string' },
                        url: { type: 'string' },
                        text: { type: 'string' },
                        selector: { type: 'string' },
                        role: { type: 'string' },
                        name: { type: 'string' },
                        direction: { type: 'string' },
                        amount: { type: 'number' },
                        ms: { type: 'number' },
                        x: { type: 'number' },
                        y: { type: 'number' },
                    },
                    required: ['type'],
                    additionalProperties: true,
                },
                description: 'List of browser actions. Supported: goto, click, type, hover, scroll, scroll_to_element, wait, key, extract_text, get_elements, click_coordinates.',
            },
            userId: { type: 'string' },
            mode: { type: 'string', enum: ['browser_test', 'browser_secure'], default: 'browser_test' },
        },
        required: ['sessionId'],
        // anyOf: [{ required: ['actions'] }, { required: ['instructionText'] }],
    };

    outputSchema = {
        type: 'object' as const,
        properties: {
            sessionId: { type: 'string' },
            pageUrl: { type: 'string' },
            title: { type: 'string' },
            dom: { type: 'string' },
            screenshotHref: { type: 'string' },
            summary: { type: 'string' },
            missingSecrets: { type: 'array', items: { type: 'string' } },
        },
    };


    permissions: ToolPermission[] = ['internet', 'execute'];
    sideEffects: ToolPermission[] = ['execute', 'internet'];
    rateLimitPerMinute = Number(process.env.BROWSER_TOOL_RATE_LIMIT_PER_MINUTE || 120);
    auditFields = ['sessionId'];

    // Helper method to analyze login state (logic ported from registry.ts)
    private analyzeLoginOutcome(pageUrl: string, dom: string) {
        const url = String(pageUrl || '');
        const u = url.toLowerCase();
        const d = String(dom || '');
        const dl = d.toLowerCase();

        const github = /(^|\.)github\.com\b/i.test(u);
        const userLoginMeta = d.match(/<meta[^>]+name=["']user-login["'][^>]+content=["']([^"']+)["']/i)?.[1]?.trim() || '';
        const dataLogin = d.match(/\bdata-login=["']([^"']+)["']/i)?.[1]?.trim() || '';
        const user = userLoginMeta || dataLogin;

        const needs2fa =
            /two-factor|two_factor|otp|authentication code/i.test(u) ||
            /two-factor|two factor|authentication code|verification code|two_factor|otp/i.test(dl);
        const badCreds =
            /incorrect username or password|incorrect password|invalid username or password|account or password|invalid login/i.test(dl) ||
            /تعذّر|غير صحيح|خطأ|كلمة المرور غير صحيحة/i.test(d);
        const onLoginPage =
            /\/login\b|\/session\b|\/signin\b|\/sign-in\b/i.test(u) ||
            (/login_field/i.test(dl) && /type=["']password["']/.test(dl)) ||
            /sign in to github/i.test(dl);

        if (user && !onLoginPage && !needs2fa) return { state: 'logged_in' as const, user };
        if (needs2fa) return { state: 'needs_2fa' as const, user: user || '' };
        if (badCreds) return { state: 'login_failed' as const, user: user || '' };
        if (onLoginPage) return { state: 'login_page' as const, user: user || '' };
        return { state: 'unknown' as const, user: user || '' };
    }

    private deriveExecFailure(res: any) {
        const steps = Array.isArray(res?.steps) ? res.steps : [];
        const failed = steps.filter((s: any) => s && s.ok === false);
        const total = steps.length;
        const failedCount = failed.length;
        if (!failedCount) {
            return { error: 'some_steps_failed', summary: String(res?.summary || 'فشل تنفيذ بعض الخطوات.').trim() };
        }
        const missing = new Set<string>();
        for (const s of failed) {
            const msg = String(s?.message || s?.error || '').trim();
            const m = msg.match(/missing_secret:([A-Z0-9_]+)/);
            if (m && m[1]) missing.add(String(m[1]).trim());
        }
        if (missing.size) {
            const keys = Array.from(missing);
            return { error: 'missing_secrets', summary: `missing_secrets: ${keys.join(', ')}`, missingSecrets: keys };
        }
        const counts = new Map<string, number>();
        for (const s of failed) {
            const r = String(s?.reason || 'unknown').trim() || 'unknown';
            counts.set(r, (counts.get(r) || 0) + 1);
        }
        let topReason = 'unknown';
        let topCount = 0;
        for (const [k, v] of counts) {
            if (v > topCount) {
                topReason = k;
                topCount = v;
            }
        }
        const error = topReason !== 'unknown' ? topReason : 'some_steps_failed';
        const first = failed[0] || null;
        const firstMsg = String(first?.message || '').trim() || String(first?.error || '').trim() || '';
        const shortMsg = firstMsg ? firstMsg.slice(0, 140) : '';
        const summary = `فشل تنفيذ بعض الخطوات (${failedCount}/${total || failedCount}). السبب: ${error}${shortMsg ? ` (${shortMsg})` : ''}`;
        return { error, summary };
    }

    private classifyBrowserRuntimeError(e: any) {
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

    async execute(input: any, context?: any) {
        const logs: string[] = [];
        const sid = String(input?.sessionId || '').trim();
        if (!sid) return { ok: false, error: 'sessionId_required', logs };
        // The signed-in user arrives in the CONTEXT; only some callers repeat it
        // in the body. Reading the body alone made every direct call unauthorized.
        // The execution context is authoritative: a planner may describe a browser action,
        // but it must never choose which signed-in user's panel the action runs as.
        // Prefer context.userId over model-controlled input fields so a stale or
        // hallucinated input.userId cannot turn a valid visible panel into `forbidden`.
        const userId = String(context?.userId || input?.__userId || input?.userId || '').trim();
        const authBypass = process.env.ENABLE_AUTH_BYPASS === 'true';
        if (!authBypass) {
            if (!userId) return { ok: false, error: 'unauthorized', logs };
            const allowed = await canAccessBrowserSession(userId, sid);
            // «forbidden» is not an answer a person can act on. Say whose
            // session it is and what to do about it.
            if (!allowed) return {
                ok: false,
                error: 'forbidden',
                output: { message: 'هذه الجلسة تخصّ مستخدماً آخر — افتح لوحة المتصفّح في جلستك ثم أعد المحاولة.' },
                logs,
            };
        }

        const instructionText = String(input?.instructionText || '').trim();
        const rawActs = Array.isArray(input?.actions) ? input.actions : [];
        const mode = input?.mode || 'browser_test';

        // Normalize Goto
        let actions = rawActs.map((a: any) => {
            if (a && typeof a === 'object' && String(a.type || '').toLowerCase() === 'goto') {
                return a;
            }
            return a;
        });

        if (actions.length === 0 && instructionText) {
            const activePreview = asksToOpenTheActiveApp(instructionText) ? localLivePreviewFor(sid) : '';
            if (activePreview) {
                actions = [{ type: 'goto', url: activePreview }, { type: 'wait', ms: 3000 }];
                logs.push(`browser_run: resolved active live preview ${activePreview}`);
            }
            /**
             *  ⛔ AND WITH NO ADDRESS AT ALL, IT REFUSES.
             *
             *  The chain below ends in `targetUrl = agentSearchUrl(instructionText)`
             *  — any instruction with no recognised destination became a web
             *  search of itself. That is how «Verify that the counter increments»
             *  became a DuckDuckGo query, and `browser_run` returned ok:true
             *  because a search page really did load: 105 steps, a real Browser
             *  panel, a real page, and zero evidence.
             *
             *  **A search result can never verify a build.** With no preview to
             *  open and nothing external named, the honest answer is that there
             *  is no address — said out loud, not wandered away from.
             */
            if (actions.length === 0 && !namesAnExternalTarget(instructionText)) {
                return {
                    ok: false,
                    error: 'no_target_for_this_instruction',
                    message: 'لا أملك عنواناً للتطبيق المطلوب فحصه، ولن أبحث في الإنترنت بدلاً منه.',
                    logs,
                } as any;
            }
            const tLower = instructionText.toLowerCase();
            let targetUrl = '';
            const urlMatch = instructionText.match(/https?:\/\/[^\s]+/i);
            if (urlMatch) {
                targetUrl = urlMatch[0];
            } else if (tLower.includes('ياهو') || tLower.includes('yahoo')) {
                const queryMatch = instructionText.match(/(?:عن|about|for)\s+(.+)/i);
                const query = queryMatch ? queryMatch[1].trim() : instructionText;
                targetUrl = `https://search.yahoo.com/search?p=${encodeURIComponent(query)}`;
            } else if (tLower.includes('جوجل') || tLower.includes('غوغل') || tLower.includes('google')) {
                const queryMatch = instructionText.match(/(?:عن|about|for)\s+(.+)/i);
                const query = queryMatch ? queryMatch[1].trim() : instructionText;
                targetUrl = agentSearchUrl(query);
            } else if (tLower.includes('ويكيبيديا') || tLower.includes('wikipedia')) {
                targetUrl = `https://ar.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(instructionText)}`;
            } else {
                targetUrl = agentSearchUrl(instructionText);
            }
            if (actions.length === 0) actions = [{ type: 'goto', url: targetUrl }, { type: 'wait', ms: 3000 }];
        }

        if (!instructionText && actions.length === 0) return { ok: false, error: 'actions_or_instruction_required', logs };

        // Check for login intent in actions to set flag
        const loginAttempt = /(login|log\s*in|sign\s*in|signin|تسجيل\s*الدخول|سجل\s*دخول|سجّل\s*دخول)/i.test(instructionText) ||
            rawActs.some((a: any) => {
                if (!a || typeof a !== 'object') return false;
                if (String(a.type || '').toLowerCase() !== 'type') return false;
                return /\{\{\s*SECRET\s*:\s*JOE_LOGIN_(?:EMAIL|PASSWORD)\s*\}\}/i.test(String((a as any).text || ''));
            });

        let execOk = false;
        let execSummary = '';
        let missingSecrets: string[] | undefined = undefined;
        let execError: string | undefined = undefined;

        let r: any = null;
        
        // Direct Action execution ONLY (Pure Execution Engine)
        try {
            const { executePlannedActions } = await import('../../browser/executor');
            r = (await executePlannedActions({ userId, sessionId: sid, actions: actions as any })) as any;
        } catch (e: any) {
            execOk = false;
            const c = this.classifyBrowserRuntimeError(e);
            execError = 'browser_unavailable';
            execSummary = `${c.code}: ${c.message}`.slice(0, 600);
            r = null;
        }

        if (r) {
            execOk = Boolean(r?.ok);
            execSummary = String(r?.summary || execSummary || '');
            if (!execOk) {
                const derived = this.deriveExecFailure(r);
                execError = derived.error;
                execSummary = derived.summary;
                const ms = (derived as any)?.missingSecrets;
                if (Array.isArray(ms)) missingSecrets = ms.map((x: any) => String(x || '')).filter(Boolean);
            }
        }

        // Capture state
        let pageUrl = '';
        let title = '';
        let dom = '';
        try {
            const s = await getBrowserSession(sid);
            touchSession(sid);
            pageUrl = s.page.url();
            title = await s.page.title();
            dom = await s.page.content();
        } catch (e: any) {
            const c = this.classifyBrowserRuntimeError(e);
            execOk = false;
            execError = execError || 'browser_unavailable';
            execSummary = execSummary || `${c.code}: ${c.message}`.slice(0, 600);
            logs.push(`browser_run state_fetch_failed=${String(c.code || 'browser_failed')}`);
        }

        // Login logic
        if (loginAttempt && pageUrl && dom) {
            const a = this.analyzeLoginOutcome(pageUrl, dom);
            if (a.state === 'logged_in') {
                execOk = true;
                execError = undefined;
                execSummary = a.user ? `✅ تم تسجيل الدخول بنجاح. الحساب: ${a.user}` : '✅ تم تسجيل الدخول بنجاح.';
            } else if (a.state === 'needs_2fa') {
                execOk = false;
                execError = 'login_2fa_required';
                execSummary = '⚠️ تم الوصول لخطوة المصادقة الثنائية (2FA). أدخل كود التحقق ثم أعد إرسال الأمر.';
            } else if (a.state === 'login_failed') {
                execOk = false;
                execError = 'login_failed';
                execSummary = '❌ فشل تسجيل الدخول: اسم المستخدم/الإيميل أو كلمة المرور غير صحيحة.';
            } else if (a.state === 'login_page') {
                execOk = false;
                execError = execError || 'login_not_completed';
                execSummary = execSummary || '⚠️ ما زلت على صفحة تسجيل الدخول ولم يظهر نجاح الدخول بعد.';
            }
        }

        // Screenshot
        let href = '';
        let artifacts: Array<{ name: string; href: string }> | undefined = undefined;
        try {
            const buf = await screenshotSessionJpeg(sid, { quality: 55, timeoutMs: 5000 });
            const fname = `browser-${sid.replace(/[^a-z0-9_-]/gi, '_')}-${Date.now()}.jpg`;
            const full = path.join(ARTIFACT_DIR, fname);
            try { fs.writeFileSync(full, buf); } catch { }
            href = `/artifacts/${encodeURIComponent(fname)}`;
            artifacts = [{ name: 'Screenshot', href }];
        } catch (e: any) {
            logs.push(`browser_run screenshot_failed=${String(e?.message || e || 'unknown')}`);
        }

        return {
            ok: execOk,
            output: {
                sessionId: sid,
                pageUrl,
                title,
                // dom: dom.slice(0, 1000), // Reduce payload if not needed in chat
                screenshotHref: href,
                summary: execOk ? 'Check browser window for results.' : execSummary, // Use minimal summary on success to avoid duplication
                missingSecrets
            },
            logs,
            artifacts,
            error: execOk ? undefined : missingSecrets && missingSecrets.length ? 'missing_secrets' : execError || 'browser_run_failed',
        };
    }
}
