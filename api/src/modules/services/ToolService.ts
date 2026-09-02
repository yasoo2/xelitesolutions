
import { tools } from '../tools/registry';
import { vectorDb } from './vectorDb';
import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import { ToolDefinition } from '../tools/types';
import { redactSecretsFromString } from '../../shared/utils/redaction';
import { paintLine } from '../../core/terminal/paint';
import { normalizeUrlForGoto } from '../../shared/utils/url';
import { traceManager } from './TraceManager';
import { isArabicReply, say } from '../../shared/reply-language';
import { executionFirewall } from '../../orchestration/AgentExecutionFirewall';
import { isApologyOnly, apologyText } from '../../shared/utils/honestResult';
import { agentSearchUrl } from '../browser/challenge';

// Rate Limiting Logic (Ported) with periodic cleanup to prevent memory leaks
const toolRateBuckets = new Map<string, { minute: number; count: number }>();
const TOOL_RATE_BUCKET_MAX = 1000;

// Clean up stale rate limit buckets every 5 minutes
const rateLimitCleanupTimer = setInterval(() => {
    const currentMinute = Math.floor(Date.now() / 60000);
    for (const [key, bucket] of toolRateBuckets) {
        if (currentMinute - bucket.minute > 5) {
            toolRateBuckets.delete(key);
        }
    }
    // Hard cap if still too large
    if (toolRateBuckets.size > TOOL_RATE_BUCKET_MAX) {
        const toDelete = toolRateBuckets.size - Math.floor(TOOL_RATE_BUCKET_MAX * 0.75);
        let deleted = 0;
        for (const key of toolRateBuckets.keys()) {
            if (deleted >= toDelete) break;
            toolRateBuckets.delete(key);
            deleted++;
        }
    }
}, 5 * 60 * 1000);
rateLimitCleanupTimer.unref?.();

export function formatToolError(err: any): string {
    if (!err) return 'Unknown error (no message provided)';
    if (typeof err === 'string') return err;
    if (err instanceof Error) return err.stack || err.message || String(err);
    try {
        return JSON.stringify(err, (key, value) => {
            if (value instanceof Error) return { message: value.message, stack: value.stack };
            return value;
        }, 2);
    } catch {
        return String(err);
    }
}

/**
 * Contain a path an alias is about to rewrite.
 *
 * This service renames the model's tool call (`file_write` → `write_file`) and
 * rewrites its path argument to an absolute one, so it is a containment boundary
 * whether or not it was designed as one — and it had its own hand-rolled check,
 * with its own holes. There is one rule now, shared with every tool.
 */
function containPath(p: string, workspaceId?: string): { ok: true; path: string } | { ok: false; error: string } {
    try {
        const { resolveToolPath } = require('../tools/utils');
        return { ok: true, path: resolveToolPath(p, { workspaceId }) };
    } catch (e: any) {
        return { ok: false, error: String(e?.message || e) };
    }
}

function rateLimitBucketKey(name: string, input: any) {
    if (name === 'browser_run' || name === 'browser_open' || name === 'visual_qa') {
        return `${name}:${input?.sessionId || 'global'} `;
    }
    return name;
}

function checkToolRateLimit(bucketKey: string, limitPerMinute?: number): { allowed: boolean; retryAfterMs?: number } {
    if (!limitPerMinute || limitPerMinute <= 0) return { allowed: true };
    const now = Date.now();
    const minute = Math.floor(now / 60000);
    const bucket = toolRateBuckets.get(bucketKey);

    if (bucket && bucket.minute === minute) {
        if (bucket.count >= limitPerMinute) {
            return { allowed: false, retryAfterMs: (minute + 1) * 60000 - now };
        }
        bucket.count++;
    } else {
        toolRateBuckets.set(bucketKey, { minute, count: 1 });
    }
    return { allowed: true };
}

export interface ToolContext {
    /** معرف جلسة الدردشة/التشغيل؛ ليس بالضرورة جلسة المتصفح. */
    sessionId?: string;
    /** معرف جلسة لوحة المتصفح المخصص لهذا التشغيل. */
    browserSessionId?: string;
    workspaceId?: string; // New: Strict Isolation Context
    userId?: string;
    language?: string;
    traceId?: string;
    onProgress?: (msg: string) => void;
    onThought?: (msg: string) => void;
    modelConfig?: any;
    /** جذر المنتج الذي ثبته pipeline بالدليل، وليس workspace العام. */
    projectRoot?: string;
    projectRootRuntimeBound?: boolean;
    projectName?: string;
}

function normalizeUserId(v: any) {
    const s = String(v ?? '').trim();
    return s || undefined;
}

function isLoopbackBrowserUrl(value: unknown): boolean {
    return /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/iu.test(String(value || '').trim());
}

/**
 * Local product QA is a development operation, not a public deployment.
 * Keep this exception deliberately narrow: it is opt-in via browser_test,
 * accepts only non-destructive inspection actions, and every explicit URL must
 * be loopback. Public exposure remains high risk and still needs all-risk
 * approval, which is required for the future multi-user server boundary too.
 */
function isSafeLocalBrowserQa(input: any, acts: any[], instructionText: string): boolean {
    if (String(input?.mode || '').trim().toLowerCase() !== 'browser_test') return false;
    const allowedActions = new Set(['goto', 'extract_text', 'get_elements', 'screenshot', 'wait', 'scroll']);
    if (!acts.length || acts.some((action: any) => !allowedActions.has(String(action?.type || '').trim().toLowerCase()))) return false;
    if (/(password|cvv|iban|ssn|card|otp|2fa|payment|checkout|pay|delete|drop|remove|submit|login|sign\s*in|حذف|دفع|بطاقة|كلمة المرور|تحقق|إرسال|تسجيل)/iu.test(instructionText)) return false;
    const urls = acts.map((action: any) => String(action?.url || '').trim()).filter(Boolean);
    return urls.every(isLoopbackBrowserUrl);
}

function classifyToolRisk(name: string, input: any): 'low' | 'medium' | 'high' | 'critical' {
    const n = String(name || '').trim();
    const s = (() => {
        try { return JSON.stringify(input || {}); } catch { return String(input || ''); }
    })();
    if (n === 'deploy_project') {
        const action = String((input as any)?.action || '').trim().toLowerCase();
        // Local build/start/package actions are part of the normal engineering
        // loop and must remain usable under AUTO_APPROVE_SAFE. Only the action
        // that creates a public tunnel is an external side effect requiring
        // explicit all-risk approval.
        return action === 'expose_port' ? 'high' : 'medium';
    }
    if (n === 'shell_execute') {
        const cmd = String((input as any)?.command || '').toLowerCase();
        if (/(rm\s+-rf|drop\s+table|shutdown|kill\s+process|\bsudo\b)/i.test(cmd)) return 'critical';
        if (/(chmod\s+777|chown\s+root|mkfs|dd\s+if=|:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;:)/i.test(cmd)) return 'critical';
        if (/(curl|wget|scp|ssh|docker|systemctl|service\s+|kubectl|terraform|ansible|git\s+push|npm\s+publish)/i.test(cmd)) return 'high';
        // Read-only diagnostics must not be held behind the broad shell approval
        // gate. The command itself remains subject to ShellExecuteTool's safety
        // policy; this branch only permits an exact, single diagnostic command.
        // Reject chaining/redirection/substitution so `pwd && …` cannot borrow
        // this safe classification.
        const readOnlyDiagnostic = /^(?:pwd|ls(?:\s+[-\w./]+)*|git\s+(?:status|diff)(?:\s+[-\w./]+)*|node\s+(?:--version|-v)|npm\s+(?:--version|-v)|echo\s+[A-Za-z0-9_.:/=-]+)$/i;
        if (!/[;&|`$><\n\r]/.test(cmd) && readOnlyDiagnostic.test(cmd.trim())) return 'low';
        if (/(^|[;&|])\s*(node|npm|npx|pnpm|yarn|ts-node|tsc)\b/i.test(cmd)) return 'medium';
        return 'high';
    }
    if (n === 'git_ops') {
        const op = String((input as any)?.operation || '').toLowerCase();
        if (op === 'push' || op === 'commit') return 'high';
        return 'medium';
    }
    if (n === 'browser_run') {
        const acts = Array.isArray((input as any)?.actions) ? (input as any).actions : [];
        const txt = String((input as any)?.instructionText || '');
        if (isSafeLocalBrowserQa(input, acts, txt)) return 'medium';
        if (/(password|cvv|iban|ssn|card|otp|2fa|payment|checkout|pay|delete|drop|remove|حذف|دفع|بطاقة|كلمة المرور|تحقق)/i.test(txt)) return 'high';
        for (const a of acts) {
            const t = String(a?.type || '').toLowerCase();
            if (t === 'uploadfile') return 'high';
            if (t === 'fillform') return 'high';
            if (t === 'evaluate') return 'high';
            if (t === 'type') {
                const v = String(a?.text || '');
                if (/\{\{\s*SECRET\s*:/i.test(v)) return 'high';
            }
            if (t === 'click') {
                const combined = `${String(a?.text || '')} ${String(a?.selector || '')} ${String(a?.name || '')} ${String(a?.role || '')}`.toLowerCase();
                if (/(delete|remove|drop|pay|checkout|submit|login|sign\s*in|حذف|دفع|ارسال|تسجيل)/i.test(combined)) return 'high';
            }
        }
        return 'medium';
    }
    if (/(delete|deploy)/.test(n)) return 'high';
    if (/(write_file|file_edit|scaffold_project|npm_manager|auto_tester|java_builder)/.test(n)) return 'medium';
    if (/(read_file|inspect_directory|inspect_symbol|grep_search|codebase_navigator|project_detect|analyze_codebase)/.test(n)) return 'low';
    if (/(http_fetch|payments_create_checkout_session)/.test(n)) return 'medium';
    if (/(echo|central_answer|task_lifecycle)/.test(n)) return 'low';
    if (/(rm\s+-rf|drop\s+table|shutdown|kill\s+process|\bsudo\b)/i.test(s)) return 'critical';
    return 'medium';
}

/**
 * Names a planner reaches for that this registry spells differently.
 *
 * Every entry is a synonym for a tool that EXISTS — no entry may point at
 * something merely similar. `grep_search` is the one that cost a real user
 * their request; the rest are the same class of well-known name.
 */
export const TOOL_ALIASES: Record<string, string> = {
    // CONTENT search — these names all mean «find this TEXT». They used to
    // point at search_files, which matches FILENAMES with a glob and answered
    // `{ files: [] }`: a confident, empty, wrong answer that never once looked
    // inside a file. The wiring audit caught it.
    grep_search: 'search_text',
    grep: 'search_text',
    ripgrep: 'search_text',
    code_search: 'search_text',
    search_code: 'search_text',
    find_in_files: 'search_text',
    search_in_files: 'search_text',
    // FILENAME search keeps the glob tool.
    file_search: 'search_files',
    find_files: 'search_files',
    glob_search: 'search_files',
    file_read: 'read_file',
    cat_file: 'read_file',
    open_file: 'read_file',
    file_write: 'write_file',
    create_file: 'write_file',
    // Named in the orchestrator's deterministic list and by several model
    // families; it resolved to NOTHING until the wiring audit called it out.
    write_to_file: 'write_file',
    // The deletion synonyms every model reaches for.
    remove_file: 'delete_file',
    rm_file: 'delete_file',
    unlink_file: 'delete_file',
    edit_file: 'file_edit',
    str_replace: 'file_edit',
    list_directory: 'inspect_directory',
    list_files: 'inspect_directory',
    run_command: 'terminal_manager',
    bash: 'terminal_manager',
    shell: 'shell_execute',
    web_search: 'search_api',
    fetch_url: 'http_fetch',
};

export async function executeTool(name: string, input: any, context?: ToolContext) {
    // [FIREWALL] Strict Single Brain Enforcement
    executionFirewall.validateExecution(`ToolService:${name}`);
    const logs: string[] = [];
    const t0 = Date.now();
    let effectiveName = name;
    let effectiveInput = { ...input };

    if (context?.traceId) {
        traceManager.logEvent(context.traceId, 'tool', {
            name: effectiveName,
            input: effectiveInput,
            status: 'started'
        });
    }


    // --- Aliasing & Compatibility Layer ---
    const contextSessionId = context?.sessionId;
    // جلسة المتصفح مستقلة عن جلسة المحادثة. استخدام معرّف الدردشة هنا كان
    // يفتح صفحة في جلسة لا تستمع إليها لوحة المستخدم (أو يفشل تفويضها).
    const contextBrowserSessionId = String(context?.browserSessionId || '').trim();
    let contextWorkspaceId =
        typeof context?.workspaceId === 'string' && context.workspaceId.trim()
            ? context.workspaceId.trim()
            : typeof (effectiveInput as any)?.workspaceId === 'string' && String((effectiveInput as any).workspaceId).trim()
                ? String((effectiveInput as any).workspaceId).trim()
                : typeof (effectiveInput as any)?.__workspaceId === 'string' && String((effectiveInput as any).__workspaceId).trim()
                    ? String((effectiveInput as any).__workspaceId).trim()
                    : undefined;
    const contextUserId =
        normalizeUserId(context?.userId) ||
        normalizeUserId((effectiveInput as any)?.userId) ||
        normalizeUserId((effectiveInput as any)?.__userId);
    const effectiveContext: ToolContext = { ...(context || {}), workspaceId: contextWorkspaceId, userId: contextUserId };

    /**
     * EVERY PIPELINE LINE IN HIS LOG WAS PRINTED TWICE.
     *
     *     [11:01:29 PM] ⚙️ المرحلة 1/3 — Backend & database
     *     …six minutes of real work…
     *     [11:07:29 PM] ⚙️ المرحلة 1/3 — Backend & database
     *
     * A tool that speaks live does two things with one line: hands it to
     * `context.onProgress` as it happens, and keeps it in `logs` for the
     * record. The post-run flush below then broadcasts `logs` again — so the
     * whole build replays itself at the end, out of order with reality and
     * timestamped to the moment it finished.
     *
     * There is already a flag for this, `logsStreamedLive`, and exactly ONE
     * tool of the dozens that stream remembers to set it. A flag every author
     * must remember is a list of tools that behave, which is the same disease
     * one floor down: it grows with the codebase and is wrong by default.
     *
     * So nothing is declared. The line that was already spoken is REMEMBERED
     * as it goes past, and the flush skips what the user has already read.
     * That is a fact about this run, not a promise about a tool.
     */
    const spokenLive = new Set<string>();
    const outerProgress = (effectiveContext as any).onProgress;
    if (typeof outerProgress === 'function') {
        (effectiveContext as any).onProgress = (m: string) => {
            try { spokenLive.add(String(m)); } catch { /* a message that cannot be a key is simply not deduped */ }
            return outerProgress(m);
        };
    }

    if (contextWorkspaceId && typeof (effectiveInput as any).__workspaceId !== 'string') {
        (effectiveInput as any).__workspaceId = contextWorkspaceId;
    }
    if (contextUserId && typeof (effectiveInput as any).__userId !== 'string') {
        (effectiveInput as any).__userId = contextUserId;
    }
    // The UI language travels with the run, but tools only receive `input` — so
    // pass it down the same way workspaceId/userId are passed. Without this a tool
    // that writes its own report (the GitHub analysis, for one) has no way to know
    // which language the user is reading in and falls back to hardcoded text.
    if (typeof (effectiveInput as any).__language !== 'string') {
        const lang = String(context?.language || (effectiveInput as any)?.language || '').trim();
        if (lang) (effectiveInput as any).__language = lang;
    }

    // Auto-assign default workspace if missing
    if (!contextWorkspaceId) {
        contextWorkspaceId = contextSessionId ? `session-${contextSessionId}` : 'default-workspace';
        effectiveContext.workspaceId = contextWorkspaceId;
        (effectiveInput as any).__workspaceId = contextWorkspaceId;
        console.info(`[ToolService] ✅ Auto-assigned workspace context: ${contextWorkspaceId}`);
    }

    if (name === 'browser_open') {
        effectiveName = 'browser_run';
        const url = normalizeUrlForGoto(effectiveInput.url || effectiveInput.input || '');
        if (!Array.isArray(effectiveInput.actions)) effectiveInput.actions = [];
        if (url) {
            effectiveInput.actions.unshift({ type: 'goto', url });
        } else if (effectiveInput.actions.length === 0) {
            effectiveInput.actions.push({ type: 'goto', url: 'https://www.google.com' });
        }
    }
    if (name === 'browser_get_state') {
        effectiveName = 'browser_run';
        if (!Array.isArray(effectiveInput.actions)) effectiveInput.actions = [];
        if (effectiveInput.actions.length === 0) {
            effectiveInput.actions.push({ type: 'ui_audit' });
        }
    }
    if (name === 'browser_snapshot') {
        effectiveName = 'browser_run';
        if (!Array.isArray(effectiveInput.actions)) effectiveInput.actions = [];
        if (effectiveInput.actions.length === 0) {
            effectiveInput.actions.push({ type: 'ui_audit' });
        }
    }
    if (name === 'web_search') {
        effectiveName = 'browser_run';
        const query = effectiveInput.query || effectiveInput.q || effectiveInput.input || '';
        if (!Array.isArray(effectiveInput.actions)) effectiveInput.actions = [];
        if (query) {
            effectiveInput.actions.unshift({ type: 'goto', url: agentSearchUrl(query) });
            effectiveInput.actions.push({ type: 'wait', ms: 2000 });
        } else {
            effectiveInput.actions.push({ type: 'goto', url: 'https://www.google.com' });
        }
    }

    /**
     * [ONE FRONT DOOR FOR SCAFFOLDS — audit follow-up] Three generators can
     * plausibly answer «ابن لي تطبيق React»: react_project (deterministic
     * templates, verified npm install + vite build), scaffold_full_stack (its
     * own unverified stack), and the generic scaffolder. The planner already
     * sends explicit requests to react_project; this catches the WEAK-MODEL
     * TOOL-PICKER choosing scaffold_full_stack for a frontend-flavoured app,
     * and redirects it to the verified path. Genuinely full-stack calls
     * (backend/database words present) keep their tool untouched.
     */
    if (name === 'scaffold_full_stack') {
        const flavour = JSON.stringify(effectiveInput || {});
        const frontendish = /react|vite|\bspa\b|frontend|landing|واجهة|ريأكت|رياكت/i.test(flavour);
        const backendish = /back\s*-?end|\bapi\b|server|database|mongo|postgres|express|fastify|auth|قاعدة|خادم|باك/i.test(flavour);
        if (frontendish && !backendish) {
            effectiveName = 'react_project';
            if (!(effectiveInput as any).request) {
                (effectiveInput as any).request = [
                    (effectiveInput as any).name, (effectiveInput as any).type,
                    ...((effectiveInput as any).features || []),
                ].filter(Boolean).join(' ') || 'react app';
            }
        }
    }

    // [FIX] Aliasing for commonly hallucinated tool names
    if (name === 'npm_install' || name === 'install_package') {
        effectiveName = 'npm_manager';
        if (!effectiveInput.command) effectiveInput.command = 'install';
    }
    if (name === 'npm_build') {
        effectiveName = 'npm_manager';
        effectiveInput.command = 'run';
        effectiveInput.script = 'build';
    }
    if (name === 'npm_run') {
        effectiveName = 'npm_manager';
        effectiveInput.command = 'run';
    }
    if (name === 'npm_start') {
        effectiveName = 'npm_manager';
        effectiveInput.command = 'run';
        effectiveInput.script = 'dev';
    }
    if (name === 'npm_test') {
        effectiveName = 'npm_manager';
        effectiveInput.command = 'run';
        effectiveInput.script = 'test';
    }
    if (name === 'command_execute' || name === 'run_command' || name === 'exec' || name === 'terminal') {
        effectiveName = 'shell_execute';
    }
    if (name === 'manual_test' || name === 'verify_build') {
        effectiveName = 'project_detect'; // Safe fallback that returns project info
    }
    if (name === 'project_scaffold') {
        effectiveName = 'scaffold_project';
    }
    if (name === 'file_write' || name === 'write_to_file' || name === 'create_file' || name === 'ai_write_file') {
        effectiveName = name === 'ai_write_file' ? 'ai_write_file' : 'write_file';
        const fp = String((effectiveInput as any)?.path ?? (effectiveInput as any)?.filePath ?? (effectiveInput as any)?.filename ?? '');
        if (fp && name === 'ai_write_file') {
            // ai_write_file receives a logical artifact path. It must resolve that
            // path against the runtime-bound projectRoot inside AIGeneratorTool;
            // applying workspace containment here first turns Project/src/x.tsx
            // into the wrong absolute path before the artifact root is known.
            (effectiveInput as any).path = fp;
            delete (effectiveInput as any).filePath;
            delete (effectiveInput as any).filename;
        } else if (fp) {
            // The gate here was `abs.startsWith(root)`, which admits a SIBLING
            // that merely shares a prefix — a root of "/srv/joe" accepted
            // "/srv/joe-backup/anything" because the characters matched. It also
            // created the destination directory BEFORE deciding, so a refused
            // write still left attacker-chosen directories on disk.
            //
            // Both are gone: one containment rule, applied before anything is
            // created. Keep this path unchanged for file_write, write_to_file,
            // and create_file; only ai_write_file has the runtime-bound contract.
            const abs = containPath(fp, contextWorkspaceId);
            if (!abs.ok) return { ok: false, error: abs.error, logs };

            try {
                const dir = path.dirname(abs.path);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            } catch { }

            (effectiveInput as any).path = abs.path;
            (effectiveInput as any).filename = abs.path;
            delete (effectiveInput as any).filePath;
        }
    }

    if (name === 'edit_file' || name === 'modify_file' || name === 'file_edit') {
        effectiveName = 'file_edit';
        const fp = String((effectiveInput as any)?.filePath ?? (effectiveInput as any)?.filename ?? (effectiveInput as any)?.path ?? '');
        if (fp) {
            const abs = containPath(fp, contextWorkspaceId);
            if (!abs.ok) return { ok: false, error: abs.error, logs };
            (effectiveInput as any).path = abs.path;
            delete (effectiveInput as any).filePath;
            delete (effectiveInput as any).filename;
        }
    }
    if (name === 'file_read' || name === 'read_file' || name === 'view_file' || name === 'get_file') {
        effectiveName = 'read_file';
        const fp = String((effectiveInput as any)?.filePath ?? (effectiveInput as any)?.filename ?? (effectiveInput as any)?.path ?? '');
        if (fp) {
            const abs = containPath(fp, contextWorkspaceId);
            if (!abs.ok) return { ok: false, error: abs.error, logs };
            (effectiveInput as any).path = abs.path;
            delete (effectiveInput as any).filePath;
            delete (effectiveInput as any).filename;
        }
    }
    if (name === 'audit' || name === 'dependency_scan' || name === 'security_audit') {
        effectiveName = 'dependency_audit';
    }
    if (name === 'run_quality' || name === 'lint_project') {
        effectiveName = 'quality_run';
    }
    if (name === 'detect_project' || name === 'scan_project') {
        effectiveName = 'project_detect';
    }
    if (name === 'web_pipeline' || name === 'scaffold_website') {
        effectiveName = 'website_full_pipeline';
    }
    if (name === 'read_file_tree') {
        effectiveName = 'inspect_directory';
        if ((effectiveInput as any)?.path == null && (effectiveInput as any)?.dir != null) {
            (effectiveInput as any).path = (effectiveInput as any).dir;
            delete (effectiveInput as any).dir;
        }
        if ((effectiveInput as any)?.depth == null) (effectiveInput as any).depth = 3;
    }
    if (name === 'list_files' || name === 'list_directory' || name === 'dir') {
        effectiveName = 'inspect_directory';
        if ((effectiveInput as any)?.depth == null) (effectiveInput as any).depth = 1;
    }
    // These hand-written redirects pointed at «grep_search», which is itself
    // an alias — a two-hop path that ended at the filename glob. One hop, to
    // the tool that actually reads the files.
    if (name === 'search_code' || name === 'find_in_files' || name === 'grep' || name === 'grep_search') {
        effectiveName = 'search_text';
    }
    if (name === 'browse' || name === 'open_browser' || name === 'web_browse') {
        effectiveName = 'browser_run';
    }
    if (name === 'git_commit' || name === 'commit') {
        effectiveName = 'git_ops';
        effectiveInput.operation = 'commit';
    }
    if (name === 'git_push' || name === 'push') {
        effectiveName = 'git_ops';
        effectiveInput.operation = 'push';
    }

    // [GHOST TOOL FIX] Alias legacy/hallucinated names to real implementations
    if (name === 'github_create_repo') {
        effectiveName = 'github_repo_manager';
        effectiveInput.action = 'create';
        effectiveInput.repoName = input.name || input.repoName;
    }
    if (name === 'github_repo_manager' && effectiveInput.action === 'push') {
        effectiveName = 'git_ops';
        effectiveInput.operation = 'push';
    }
    if (name === 'image_generate') {
        effectiveName = 'generate_image';
    }

    // Universal Browser Session Injection. A dedicated panel session is an
    // execution invariant, not an optional hint: the planner/LLM is allowed to
    // describe browser actions, but it must never redirect them to a different
    // Chromium page by inventing its own sessionId. This was the direct cause
    // of a real run ending with `forbidden` while the visible panel was attached
    // to `panel-browser`. Keep the old chat-session fallback for callers that
    // predate browserSessionId.
    if (effectiveName === 'browser_run' || effectiveName === 'visual_qa' || effectiveName === 'codebase_navigator') {
        if (contextBrowserSessionId) {
            effectiveInput.sessionId = contextBrowserSessionId;
        } else if (!effectiveInput.sessionId && contextSessionId) {
            effectiveInput.sessionId = contextSessionId;
        }
    }

    // [NEW] Deep Memory Handlers
    if (name === 'recall_memory') {
        try {
            const results = await vectorDb.search(input.query, input.limit || 5);
            const output = results.map(r =>
                `[File: ${r.doc.metadata.filePath}]\nScore: ${r.score.toFixed(2)}\nContent:\n${r.doc.content}`
            ).join('\n---\n');
            return { ok: true, output: output || 'No relevant memory found.', logs };
        } catch (e: any) {
            return { ok: false, output: `Memory Recall Failed: ${e.message}`, logs };
        }
    }

    if (name === 'memorize_codebase') {
        try {
            const { workspaceService } = require('./WorkspaceService');
            const root = input.directory || workspaceService.getActiveRoot(contextWorkspaceId);
            const exts = input.extensions || ['ts', 'tsx', 'js', 'json', 'md', 'py', 'css', 'html'];
            const pattern = `**/*.{${exts.join(',')}}`;
            const files = await glob(pattern, { cwd: root, ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**'] });
            console.log(`[Memory] Indexing ${files.length} files from ${root}...`);
            await vectorDb.clear();
            let count = 0;
            for (const file of files) {
                const fullPath = path.join(root, file);
                if (fs.statSync(fullPath).isDirectory()) continue;
                const content = fs.readFileSync(fullPath, 'utf-8');
                if (content.length > 50000) {
                    await vectorDb.addDocument(content.slice(0, 20000), { filePath: file });
                } else {
                    await vectorDb.addDocument(content, { filePath: file });
                }
                count++;
            }
            return { ok: true, output: `Successfully indexed ${count} files into Deep Memory.`, logs };
        } catch (e: any) {
            return { ok: false, output: `Memorization Failed: ${e.message}`, logs };
        }
    }

    // The old grep_search path needed the system `grep` binary. search_text
    // reads the files in JavaScript, so a machine without grep — every stock
    // Windows box — can finally search its own code.

    if (effectiveName === 'inspect_directory' || effectiveName === 'search_files') {
        const { BinaryService } = require('./BinaryService');
        const check = await BinaryService.checkBinary('find');
        if (!check.exists || !check.compatible) {
            // These might use glob (JS) so we don't block UNLESS we know they use find
            // For now, let's be conservative. Grep definitely uses internal execution.
        }
    }

    logs.push(`[${new Date().toISOString()}] start ${effectiveName} (orig=${name})`);

    // [ELITE SYNC] Broadcast tool-specific thinking status
    if (contextSessionId) {
        const { broadcastThinkingPhase } = require('../../api/ws');
        /**
         * AND IN THE LANGUAGE HE ASKED IN — «يجب ان تكون النتيجة والذكاء
         * العصبي كلها انجليزية».
         *
         * Every line below was hardcoded Arabic, so an English prompt in
         * English mode produced «جاري تنفيذ: api project…» directly above
         * «🗄️ Building a real backend with a database» — two languages, one
         * request. The rule the build tools already follow lives in one file
         * now, and the trace follows it too.
         */
        const isAr = isArabicReply({
            language: (context as any)?.language,
            text: `${String((input as any)?.request || '')} ${String((input as any)?.prompt || '')}`,
        });
        let status = '';
        if (effectiveName === 'browser_run') status = say(isAr, 'جاري استخدام المتصفح...', 'Using the browser…');
        else if (effectiveName === 'web_search') status = say(isAr, 'جاري البحث في الويب...', 'Searching the web…');
        else if (effectiveName === 'scaffold_project' || effectiveName === 'scaffold_full_stack') status = say(isAr, 'جاري إنشاء هيكل المشروع...', 'Scaffolding the project…');
        else if (effectiveName === 'npm_manager') status = say(isAr, 'جاري معالجة المكتبات...', 'Working through the packages…');
        else if (effectiveName === 'git_ops') status = say(isAr, 'جاري تحديث المستودع...', 'Updating the repository…');
        else if (effectiveName === 'write_file' || effectiveName === 'file_edit') status = say(isAr, 'جاري كتابة الكود...', 'Writing the code…');
        else if (effectiveName === 'read_file' || effectiveName === 'inspect_directory') status = say(isAr, 'جاري مراجعة الملفات...', 'Reading the files…');
        else if (effectiveName === 'analyze_codebase') status = say(isAr, 'جاري تحليل بنية المشروع...', 'Analysing the project structure…');
        else if (effectiveName === 'web_page_builder') status = say(isAr, 'جاري تصميم الصفحة وبناؤها...', 'Designing and building the page…');

        /**
         * EVERY tool announces itself, not eight of them.
         *
         * `status` was set from a hardcoded list of eight names, and
         * `web_page_builder` — the single most common thing Joe does — was not
         * on it. So building a page broadcast no phase at all, the frontend's
         * phase never left 'idle', and the live thinking panel had nothing to
         * turn on for. The user's words: «التفكير العصبي الحي لا يعمل».
         *
         * A tool with no bespoke sentence gets a truthful generic one built from
         * its own name rather than being invisible.
         */
        if (!status) {
            const pretty = String(effectiveName || '').replace(/[_-]+/g, ' ').trim();
            status = pretty
                ? say(isAr, `جاري تنفيذ: ${pretty}…`, `Running: ${pretty}…`)
                : say(isAr, 'جاري التنفيذ…', 'Running…');
        }
        broadcastThinkingPhase(contextSessionId, 'executing', status);
    }

    try {
        let tDef = tools.find(t => t.name === effectiveName);

        /**
         * A NAME THE PLANNER INVENTED IS NOT A REASON TO ABANDON THE RUN.
         *
         * A real session died here. The user asked to recolour a page; the
         * planner emitted a step calling `grep_search`, which is not registered
         * — the tool is `search_files`. It failed, retried, failed identically,
         * hit "max retries" and took the whole request down with it. The user
         * got nothing, for a synonym.
         *
         * These are SYNONYMS, not guesses: each name below is a well-known name
         * for a tool that exists here under a different one. Anything not on the
         * list still fails, and fails loudly — silently running a tool nobody
         * asked for would be far worse than an honest dead end.
         */
        if (!tDef) {
            const alias = TOOL_ALIASES[effectiveName];
            if (alias && tools.some(t => t.name === alias)) {
                logs.push(`tool alias: "${effectiveName}" is not registered — using "${alias}", which is the same tool under its real name`);
                effectiveName = alias;
                tDef = tools.find(t => t.name === effectiveName);
            }
        }

        if (!tDef) {
            // A bare "unknown_tool" says nothing: it reaches the user as a dead end
            // and the log never records WHICH name failed. Name it, and offer the
            // closest registered tools so a mis-picked name is obvious at a glance.
            // Any SHARED SEGMENT, not just the first one. `grep_search` against
            // `search_files` shares "search" and matched neither the substring
            // test nor the first-segment test, so the log that was supposed to
            // make a mis-picked name obvious printed no suggestion at all.
            const parts = new Set(effectiveName.split(/[_-]+/).filter(Boolean));
            const near = tools
                .map(t => t.name)
                .filter(n => n.includes(effectiveName) || effectiveName.includes(n)
                    || n.split(/[_-]+/).some(seg => parts.has(seg)))
                .slice(0, 5);
            logs.push(`unknown_tool: "${effectiveName}" is not registered${near.length ? ` (closest: ${near.join(', ')})` : ''}`);
            return {
                ok: false,
                error: `unknown_tool: "${effectiveName}"${near.length ? ` — did you mean: ${near.join(', ')}?` : ''}`,
                logs,
            };
        }

        const authBypass = process.env.ENABLE_AUTH_BYPASS === 'true' || executionFirewall.isSystemContext();
        if (!authBypass) {
            const perms = Array.isArray((tDef as any).permissions) ? (tDef as any).permissions : [];
            const effects = Array.isArray((tDef as any).sideEffects) ? (tDef as any).sideEffects : [];
            const needsWorkspace = perms.length > 0 || effects.length > 0;
            const needsUser = perms.length > 0 || effects.length > 0;
            const sid = String(effectiveContext.sessionId || (effectiveInput as any)?.sessionId || '').trim();
            /**
             * THE SESSION IS READ ONCE — TO FILL WHAT IS MISSING, AND TO CHECK
             * WHO IS ASKING.
             *
             * The lookup used to run only when userId or workspaceId was absent,
             * and it only ever FILLED them. It never compared a supplied userId
             * against the session's owner — so a caller who knew (or guessed)
             * somebody else's sessionId could pass their own userId, satisfy
             * «needsUser», and have the workspace resolved to that session's
             * workspace. Their files, under someone else's name.
             *
             * Invisible today: Joe runs single-user with the bypass on. Load
             * bearing the moment he serves anyone else, which is the whole point
             * of running this path before that day rather than after it.
             */
            const { resolveSessionIdentity } = await import('./session-identity');
            const owner = sid ? await resolveSessionIdentity(sid) : null;
            if (owner) {
                const resolvedUserId = normalizeUserId(owner.userId);
                const resolvedWorkspaceId = normalizeUserId(owner.workspaceId);
                const asked = normalizeUserId(effectiveContext.userId);
                if (resolvedUserId && asked && asked !== resolvedUserId) {
                    logs.push('blocked=1 reason=session_forbidden');
                    return { ok: false, error: 'session_forbidden', logs };
                }
                if (!effectiveContext.userId && resolvedUserId) {
                    effectiveContext.userId = resolvedUserId;
                    if (typeof (effectiveInput as any).__userId !== 'string') (effectiveInput as any).__userId = resolvedUserId;
                }
                if (!contextWorkspaceId && resolvedWorkspaceId) {
                    contextWorkspaceId = resolvedWorkspaceId;
                    effectiveContext.workspaceId = resolvedWorkspaceId;
                    if (typeof (effectiveInput as any).__workspaceId !== 'string') (effectiveInput as any).__workspaceId = resolvedWorkspaceId;
                }
            }
            if (needsWorkspace && !contextWorkspaceId) {
                logs.push('blocked=1 reason=workspace_required');
                return { ok: false, error: 'workspace_required', logs };
            }
            if (needsUser && !effectiveContext.userId) {
                logs.push('blocked=1 reason=unauthorized');
                return { ok: false, error: 'unauthorized', logs };
            }
            const { getSessionRunConfig } = await import('./secrets');
            const cfg = (sid ? getSessionRunConfig(sid) : null) || ({} as any);
            const envAutoAll = process.env.AUTO_APPROVE_ALL;
            const envAutoSafe = process.env.AUTO_APPROVE_SAFE;
            const autoAll = cfg.autoApproveAll === true ? true : envAutoAll === '1';
            const autoSafe = autoAll || cfg.autoApproveSafe === true ? true : envAutoSafe ? envAutoSafe === '1' : true;
            const risk = classifyToolRisk(effectiveName, effectiveInput);
            const requiresAll = risk === 'high' || risk === 'critical';
            const allowed = requiresAll ? autoAll : (autoAll || autoSafe);
            if (!allowed) {
                logs.push(`blocked=1 reason=approval_required risk=${risk}`);
                return { ok: false, error: 'approval_required', output: { risk }, logs };
            }
        }

        // Rate Limit Check
        const bucketKey = rateLimitBucketKey(effectiveName, effectiveInput);
        const rl = checkToolRateLimit(bucketKey, tDef.rateLimitPerMinute);
        if (!rl.allowed) {
            logs.push(`rate_limited=1 bucket=${bucketKey} retry_after_ms=${rl.retryAfterMs}`);
            return { ok: false, error: 'rate_limited', output: { retryAfterMs: rl.retryAfterMs }, logs };
        }

        // Execute
        // Genesis Wrapper Special Case Handling to avoid circular dependency issues in registry
        // If we want to move the Genesis wrapper logic HERE instead of in registry, we can.
        // But for now, we assume tDef has the handler.

        if (typeof (tDef as any).execute === 'function') {
            const { broadcast, broadcastTerminalLine } = require('../../api/ws');
            
            // [NEW] Broadcast tool start
            broadcast({
                type: 'tool_started',
                id: 'panel-terminal',
                // Without the session this event belongs to nobody, and an event
                // that belongs to nobody is delivered to everybody.
                sessionId: contextSessionId,
                data: { tool: effectiveName, input: effectiveInput, sessionId: contextSessionId }
            });

            const { attendRun, registerRun, releaseHandle } = require('../../core/session/attended-run');
            const stopHandle = registerRun(contextSessionId, (effectiveContext as any)?.runId);
            // The run-level stop must reach child processes too. Without this
            // handoff, attendRun stops waiting while npm/build keeps running.
            const executionContext = {
                ...(effectiveContext || {}),
                cancellation: stopHandle.whenCancelled,
            };
            const run = async () => {
                if (effectiveContext.userId && typeof (effectiveInput as any).userId !== 'string') {
                    (effectiveInput as any).userId = effectiveContext.userId;
                }
                return await (tDef as any).execute(effectiveInput, executionContext);
            };
            const { workspaceService } = require('./WorkspaceService');
            /**
             *  ⛔ AND SOMETHING SPEAKS WHILE IT RUNS, BECAUSE NOTHING DID.
             *
             *  This line read `await run()` with no deadline and no voice, and
             *  the comment forty lines below says what that costs: the tool's
             *  own logs are flushed only AFTER it returns, «which for a page
             *  build means minutes of silence and then a flood».
             *
             *  When the tool does not return, the flood never comes. Measured
             *  on the owner's machine: `▶ react_project` at 17:30:26, and at
             *  18:39:55 the log count was still 271 with that same last line —
             *  sixty-nine minutes, zero sentences, a counter ticking.
             *
             *  ⛔ NOT A TIMEOUT. A guessed ceiling kills legitimate long builds
             *  and would be one more number nothing measured — 18000 was right
             *  until the input changed. What was missing is a VOICE, and a stop
             *  that works: the run registers here, so `/runs/stop` can find it.
             */
            let res: any;
            try {
                res = await attendRun({
                    work: () => (contextWorkspaceId
                        ? workspaceService.runWithWorkspace(contextWorkspaceId, run)
                        : run()),
                    what: effectiveName,
                    handle: stopHandle,
                    say: (line: string) => {
                        try { broadcastTerminalLine(contextSessionId, paintLine(line) + '\r\n'); } catch { /* ws optional */ }
                    },
                });
            } finally {
                //  ITS handle, not the key: a sibling tool in the same
                //  `Promise.all` batch shares this sessionId and is still
                //  running.
                releaseHandle(stopHandle, contextSessionId, (effectiveContext as any)?.runId);
            }
            let ok = !!res?.ok;
            const output = res?.output ?? null;
            const artifacts = Array.isArray(res?.artifacts) ? res.artifacts : undefined;
            const toolLogs = Array.isArray(res?.logs) ? res.logs : [];
            const duration = Date.now() - t0;

            if (context?.traceId) {
                traceManager.logEvent(context.traceId, 'tool', {
                    name: effectiveName,
                    status: ok ? 'success' : 'failed',
                    duration,
                    output: typeof output === 'string' ? output.substring(0, 1000) : 'object/binary',
                    error: res?.error
                });
            }
            
            /**
             * Post-run log flush to the frontend terminals.
             *
             * Honest name: this is NOT real-time — it runs after the tool has
             * returned, which for a page build means minutes of silence and
             * then a flood. Tools that stream their own lines live (the page
             * builder does, line by line as the work happens) say so with
             * `logsStreamedLive`, and re-broadcasting them here would print
             * every line twice.
             *
             * The SESSION id is included because that is the id the terminal
             * panel actually listens on — the legacy trio alone never reached
             * a live session's terminal at all.
             */
            if (!(res as any)?.logsStreamedLive) {
                // ONE message per line, addressed to every tab that wants it.
                // Ownership is established where the work starts — the only place
                // that knows both the session and the user. Without it every
                // build log resolved to «nobody» and was broadcast to ALL.
                try {
                    const { registerSessionOwner } = require('../../api/ws');
                    if (contextSessionId && effectiveContext?.userId) registerSessionOwner(contextSessionId, effectiveContext.userId);
                } catch { /* ws optional in unit tests */ }
                toolLogs
                    .filter((line: string) => !spokenLive.has(String(line)))
                    .forEach((line: string) => broadcastTerminalLine(contextSessionId, paintLine(line) + '\r\n'));
            }

            logs.push(...toolLogs);

            let error = res?.error;
            // A TOOL THAT APOLOGISES DID NOT SUCCEED. With every model provider
            // unreachable, central_answer, browser_summarize and
            // browser_translate all returned ok:true carrying «تعذّر الوصول إلى
            // محرّك الذكاء» as their answer. The orchestrator then marked the
            // step completed, the run claimed success, and any dependent step
            // reading {{FROM:…}} received the apology AS ITS DATA. Asked once,
            // here, of every tool: a real artifact keeps its success; an answer
            // that is only the apology becomes the failure it always was.
            if (ok && isApologyOnly(output)) {
                ok = false;
                error = apologyText(output);
                logs.push('honest_result=apology_only');
            }
            if (!ok && !error) {
                error = 'Tool reported failure without an error message';
            } else if (error) {
                error = formatToolError(error);
                // Terminal failures are user-visible work, too.  A raw event
                // with only `panel-terminal` has no owner and is intentionally
                // dropped by the socket privacy filter.
                broadcastTerminalLine(contextSessionId, `\x1b[31mERROR: ${error}\x1b[0m\r\n`);
            }

            // [NEW] Broadcast tool completion
            broadcast({
                type: 'tool_done',
                id: 'panel-terminal',
                sessionId: contextSessionId,
                data: { tool: effectiveName, ok, sessionId: contextSessionId }
            });

            return { ok, output, logs, artifacts, error };
        }

        return { ok: false, error: 'tool_implementation_missing', logs };

    } catch (e: any) {
        const duration = Date.now() - t0;
        const errStr = formatToolError(e);
        logs.push(`exception=${errStr} duration=${duration}ms`);
        try {
            const { broadcastTerminalLine } = require('../../api/ws');
            broadcastTerminalLine(contextSessionId, `\x1b[31mERROR: internal_exception: ${errStr}\x1b[0m\r\n`);
        } catch { /* ws is optional in isolated unit tests */ }
        return { ok: false, error: `internal_exception: ${errStr}`, logs };
    }
}
