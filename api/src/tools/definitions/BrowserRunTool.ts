
import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import { getBrowserSession, screenshotSessionJpeg, touchSession } from '../../browser/manager';
import { canAccessBrowserSession } from '../../browser/wsHub';
import { getSessionSecret, getUserSecret } from '../../services/secrets';
import path from 'path';
import fs from 'fs';

const ARTIFACT_DIR = process.env.ARTIFACT_DIR || '/tmp/joe-artifacts';

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
        if (/executable doesn't exist|playwright install/i.test(msg)) return { code: 'chromium_missing', message: msg };
        if (/no such file or directory/i.test(msg) && /chrome|chromium/i.test(lower)) return { code: 'chromium_missing', message: msg };
        if (/target page, context or browser has been closed/i.test(msg)) return { code: 'browser_closed', message: msg };
        if (/xvfb|display|cannot open display|missing x server/i.test(lower)) return { code: 'display_missing', message: msg };
        if (/sandbox|setuid/i.test(lower)) return { code: 'sandbox_blocked', message: msg };
        if (/glibc|gtk|nss|gbm|fontconfig/i.test(lower)) return { code: 'deps_missing', message: msg };
        return { code: 'browser_failed', message: msg || 'browser_failed' };
    }

    async execute(input: any) {
        const logs: string[] = [];
        const sid = String(input?.sessionId || '').trim();
        if (!sid) return { ok: false, error: 'sessionId_required', logs };
        const userId = String(input?.userId || input?.__userId || '').trim();
        const authBypass = process.env.ENABLE_AUTH_BYPASS === 'true';
        if (!authBypass) {
            if (!userId) return { ok: false, error: 'unauthorized', logs };
            const allowed = await canAccessBrowserSession(userId, sid);
            if (!allowed) return { ok: false, error: 'forbidden', logs };
        }

        const instructionText = String(input?.instructionText || '').trim();
        const rawActs = Array.isArray(input?.actions) ? input.actions : [];
        const mode = input?.mode || 'browser_test';

        // Normalize Goto
        const actions = rawActs.map((a: any) => {
            if (a && typeof a === 'object' && String(a.type || '').toLowerCase() === 'goto') {
                // (Assumes normalizeBrowserUrl is available or inline it. For brevity, assuming user inputs valid URLs or the executor handles it largely)
                // But let's restore the helper if we can. 
                // Better yet, executor.ts handles normalization too (normalizeUrlForGoto). 
                return a;
            }
            return a;
        });

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

        if (instructionText && (!Array.isArray(actions) || actions.length === 0)) {
            // [Wakil 5.4] High-level planner run with hard try/catch
            const { runBrowserInstruction } = await import('../../browser/runner');
            let r: any;
            try {
                r = await runBrowserInstruction({ userId, sessionId: sid, instructionText, mode: mode as any });
            } catch (err: any) {
                console.error('[BrowserRunTool] runBrowserInstruction threw exception:', err?.stack || err);
                r = {
                    ok: false,
                    error: err?.message || 'browser_run_exception',
                    detail: { message: err?.message, stack: err?.stack }
                };
            }
            if (r && typeof r === 'object' && (r as any).ok) {
                execOk = Boolean((r as any).result?.ok);
                const inner = (r as any).result;
                execSummary = String(inner?.summary || '');
                if (!execOk) {
                    const derived = this.deriveExecFailure(inner);
                    execError = derived.error;
                    execSummary = derived.summary;
                    const ms = (derived as any)?.missingSecrets;
                    if (Array.isArray(ms)) missingSecrets = ms.map((x: any) => String(x || '')).filter(Boolean);
                }
            } else {
                execOk = false;
                execError = String((r as any)?.error || '').trim() || 'browser_run_failed';
                const detail = (r as any)?.detail;
                if (execError === 'browser_unavailable' && detail && typeof detail === 'object') {
                    const code = String(detail?.code || '').trim();
                    const msg = String(detail?.message || '').trim();
                    execSummary = `${code || 'browser_unavailable'}: ${msg || execError}`.slice(0, 600);
                } else {
                    execSummary = execError;
                }
                const ms = (r as any)?.missingSecrets;
                if (Array.isArray(ms)) missingSecrets = ms.map((x: any) => String(x || '')).filter(Boolean);
            }
        } else {
            // Direct Action execution
            let r: any = null;
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
