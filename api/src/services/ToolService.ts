
import { tools } from '../tools/registry';
import { vectorDb } from '../services/vectorDb';
import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import { ToolDefinition } from '../tools/types';
import { redactSecretsFromString } from '../utils/redaction';
import { normalizeUrlForGoto } from '../utils/url';

// Rate Limiting Logic (Ported)
const toolRateBuckets = new Map<string, { minute: number; count: number }>();

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
    sessionId?: string;
    workspaceId?: string; // New: Strict Isolation Context
    userId?: string;
    language?: string;
    onProgress?: (msg: string) => void;
    onThought?: (msg: string) => void;
}

function normalizeUserId(v: any) {
    const s = String(v ?? '').trim();
    return s || undefined;
}

function classifyToolRisk(name: string, input: any): 'low' | 'medium' | 'high' | 'critical' {
    const n = String(name || '').trim();
    const s = (() => {
        try { return JSON.stringify(input || {}); } catch { return String(input || ''); }
    })();
    if (n === 'shell_execute') {
        const cmd = String((input as any)?.command || '').toLowerCase();
        if (/(rm\s+-rf|drop\s+table|shutdown|kill\s+process|\bsudo\b)/i.test(cmd)) return 'critical';
        if (/(chmod\s+777|chown\s+root|mkfs|dd\s+if=|:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;:)/i.test(cmd)) return 'critical';
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

export async function executeTool(name: string, input: any, context?: ToolContext) {
    const logs: string[] = [];
    const t0 = Date.now();
    let effectiveName = name;
    let effectiveInput = { ...input };


    // --- Aliasing & Compatibility Layer ---
    const contextSessionId = context?.sessionId;
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

    if (contextWorkspaceId && typeof (effectiveInput as any).__workspaceId !== 'string') {
        (effectiveInput as any).__workspaceId = contextWorkspaceId;
    }
    if (contextUserId && typeof (effectiveInput as any).__userId !== 'string') {
        (effectiveInput as any).__userId = contextUserId;
    }

    if (!contextWorkspaceId) {
        console.warn(`[ToolService] ⚠️ SECURITY WARNING: Tool '${name}' executed without Workspace Context! Defaults to global/shared.`);
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
            effectiveInput.actions.unshift({ type: 'goto', url: `https://www.google.com/search?q=${encodeURIComponent(query)}` });
            effectiveInput.actions.push({ type: 'wait', ms: 2000 });
        } else {
            effectiveInput.actions.push({ type: 'goto', url: 'https://www.google.com' });
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
    if (name === 'project_scaffold') {
        effectiveName = 'scaffold_project';
    }
    if (name === 'file_write' || name === 'write_to_file' || name === 'create_file') {
        effectiveName = 'write_file';
        const fp = String((effectiveInput as any)?.filePath ?? (effectiveInput as any)?.filename ?? (effectiveInput as any)?.path ?? '');
        if (fp) {
            const { workspaceService } = require('./WorkspaceService');
            const root = workspaceService.getActiveRoot() || process.cwd();
            const projectRoot = path.join(process.cwd(), path.basename(process.cwd()) === 'api' ? '..' : '.');
            const buildsDir = path.resolve(projectRoot, 'data/builds');
            const abs = path.isAbsolute(fp) ? fp : path.resolve(root, fp);

            if (abs.startsWith(root) || abs.startsWith(buildsDir)) {
                (effectiveInput as any).filename = abs;
                delete (effectiveInput as any).filePath;
                delete (effectiveInput as any).path;
            } else {
                return { ok: false, error: 'path_outside_workspace: ' + abs, logs };
            }
        }
    }
    if (name === 'edit_file' || name === 'modify_file' || name === 'file_edit') {
        effectiveName = 'file_edit';
        const fp = String((effectiveInput as any)?.filePath ?? (effectiveInput as any)?.filename ?? (effectiveInput as any)?.path ?? '');
        if (fp) {
            const { workspaceService } = require('./WorkspaceService');
            const root = workspaceService.getActiveRoot();
            (effectiveInput as any).path = path.isAbsolute(fp) ? fp : path.resolve(root, fp);
            delete (effectiveInput as any).filePath;
            delete (effectiveInput as any).filename;
        }
    }
    if (name === 'file_read' || name === 'read_file' || name === 'view_file' || name === 'get_file') {
        effectiveName = 'read_file';
        const fp = String((effectiveInput as any)?.filePath ?? (effectiveInput as any)?.filename ?? (effectiveInput as any)?.path ?? '');
        if (fp) {
            const { workspaceService } = require('./WorkspaceService');
            const root = workspaceService.getActiveRoot();
            (effectiveInput as any).path = path.isAbsolute(fp) ? fp : path.resolve(root, fp);
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
    if (name === 'search_code' || name === 'find_in_files') {
        effectiveName = 'grep_search';
    }
    if (name === 'grep') {
        effectiveName = 'grep_search';
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

    // Universal Session Injection
    if ((effectiveName === 'browser_run' || effectiveName === 'visual_qa' || effectiveName === 'codebase_navigator') && !effectiveInput.sessionId && contextSessionId) {
        effectiveInput.sessionId = contextSessionId;
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
            const root = input.directory || workspaceService.getActiveRoot();
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

    if (effectiveName === 'grep_search') {
        const { BinaryService } = require('./BinaryService');
        const check = BinaryService.checkBinary('grep');
        if (!check.exists || !check.compatible) {
            return { ok: false, error: `binary_issue: ${check.error || 'grep not found'}. ${BinaryService.getHint('grep', check)}`, logs };
        }
    }
    if (effectiveName === 'inspect_directory' || effectiveName === 'search_files') {
        const { BinaryService } = require('./BinaryService');
        const check = BinaryService.checkBinary('find');
        if (!check.exists || !check.compatible) {
            // These might use glob (JS) so we don't block UNLESS we know they use find
            // For now, let's be conservative. Grep definitely uses spawn('grep').
        }
    }

    logs.push(`[${new Date().toISOString()}] start ${effectiveName} (orig=${name})`);

    try {
        const tDef = tools.find(t => t.name === effectiveName);
        if (!tDef) {
            return { ok: false, error: 'unknown_tool', logs };
        }

        const authBypass = process.env.ENABLE_AUTH_BYPASS === 'true';
        if (!authBypass) {
            const perms = Array.isArray((tDef as any).permissions) ? (tDef as any).permissions : [];
            const effects = Array.isArray((tDef as any).sideEffects) ? (tDef as any).sideEffects : [];
            const needsWorkspace = perms.length > 0 || effects.length > 0;
            const needsUser = perms.length > 0 || effects.length > 0;
            const sid = String(effectiveContext.sessionId || (effectiveInput as any)?.sessionId || '').trim();
            if ((needsWorkspace && !contextWorkspaceId) || (needsUser && !effectiveContext.userId)) {
                try {
                    const m = await import('mongoose');
                    const mongoose: any = (m as any).default || m;
                    if (sid && mongoose?.Types?.ObjectId?.isValid?.(sid) && mongoose?.connection?.readyState === 1) {
                        const { Session } = await import('../models/session');
                        const sess: any = await Session.findById(sid).select({ userId: 1, workspaceId: 1 }).lean();
                        if (sess) {
                            const resolvedUserId = normalizeUserId(sess.userId);
                            const resolvedWorkspaceId = normalizeUserId(sess.workspaceId);
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
                    }
                } catch { }
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
            const cfg = sid ? (getSessionRunConfig(sid) as any) : ({} as any);
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
            const run = async () => {
                if (effectiveContext.userId && typeof (effectiveInput as any).userId !== 'string') {
                    (effectiveInput as any).userId = effectiveContext.userId;
                }
                return await (tDef as any).execute(effectiveInput, effectiveContext);
            };
            const { workspaceService } = require('./WorkspaceService');
            const res = contextWorkspaceId ? await workspaceService.runWithWorkspace(contextWorkspaceId, run) : await run();
            const ok = !!res?.ok;
            const output = res?.output ?? null;
            const artifacts = Array.isArray(res?.artifacts) ? res.artifacts : undefined;
            const toolLogs = Array.isArray(res?.logs) ? res.logs : [];
            logs.push(...toolLogs);
            return { ok, output, logs, artifacts, error: res?.error };
        }

        return { ok: false, error: 'tool_implementation_missing', logs };

    } catch (e: any) {
        const duration = Date.now() - t0;
        logs.push(`exception=${e.message} duration=${duration}ms`);
        return { ok: false, error: `exception: ${e.message}`, logs };
    }
}
