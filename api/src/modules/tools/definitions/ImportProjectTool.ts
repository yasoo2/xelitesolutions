/**
 * STAGE 5 — «هذا مشروعي على GitHub، افهمه وطوّره».
 *
 * The import is a real, shallow git clone streamed live to the terminal; the
 * understanding is the deterministic analyzer (facts from the files, never a
 * hallucinated framework); and the payoff is COMPOSITION: the imported
 * project registers as the session's active project, so the Stage-3
 * surgical editor, «شغّل المشروع», and «تراجع» all work on it immediately —
 * nothing new to learn.
 */
import fs from 'fs';
import path from 'path';
import { BaseTool } from '../base';
import { ToolPermission, ToolExecutionResult } from '../types';
import { analyzeProject, formatAnalysis } from '../../../core/project/analyze';
import { broadcast, broadcastThinkingDetail, broadcastTerminalLine } from '../../../api/ws';
import { persistJoeProjects } from '../../../api/page-store';

export function githubUrlFrom(text: string): string | null {
    const m = String(text || '').match(/https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[\/#?\s]|$)/i)
        || String(text || '').match(/(?:^|\s)github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[\/#?\s]|$)/i);
    if (!m) return null;
    return `https://github.com/${m[1]}/${m[2].replace(/\.git$/i, '')}.git`;
}

export class ImportProjectTool extends BaseTool {
    name = 'import_project';
    description = 'Clone an existing GitHub repository (or open a local folder), understand its stack and structure, and make it the session\'s active project for surgical edits.';
    version = '1.0.0';
    tags = ['import', 'github', 'project', 'analyze'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            request: { type: 'string', description: 'The user\'s words — usually carrying the GitHub URL' },
            url: { type: 'string' },
            path: { type: 'string', description: 'A local folder to open instead of cloning' },
        },
        required: ['request'],
    };
    permissions: ToolPermission[] = ['execute', 'write', 'internet'];
    sideEffects: ToolPermission[] = ['write'];
    rateLimitPerMinute = 6;
    auditFields = ['request', 'url'];

    async execute(input: any, context?: any): Promise<ToolExecutionResult> {
        const logs: string[] = [];
        const request = String(input?.request || '').trim();
        const sessionId = context?.sessionId;
        const sessionKey = String(sessionId || 'default').replace(/[^a-zA-Z0-9._-]/g, '_');
        const isAr = /[؀-ۿ]/.test(request) || !request;
        try { broadcast({ type: 'build_started', sessionId, data: { tool: 'import_project', sessionId } } as any); } catch { /* UI optional */ }

        const term = (line: string) => {
            logs.push(line);
            try {
                broadcastTerminalLine(sessionId, line + '\r\n');
            } catch { /* UI optional */ }
        };

        let dir = '';
        const localPath = String(input?.path || '').trim();
        if (localPath) {
            if (!fs.existsSync(localPath)) return { ok: false, error: `no_such_path: ${localPath}`, logs };
            dir = localPath;
            term(`import_project: opening local folder ${dir}`);
        } else {
            const url = String(input?.url || '').trim() || githubUrlFrom(request) || '';
            if (!url) {
                return {
                    ok: true,
                    output: { message: isAr ? 'أعطني رابط المستودع — مثال: «استورد https://github.com/user/repo وافهمه»' : 'Give me the repository URL, e.g. "import https://github.com/user/repo".' },
                    logs,
                } as any;
            }
            const repoName = (url.match(/\/([\w.-]+?)(?:\.git)?$/) || [, 'project'])[1];
            const { workspaceService } = require('../../services/WorkspaceService');
            const root = String(input?.root || workspaceService.getExplorerRoot());
            dir = path.join(root, repoName);
            if (fs.existsSync(dir)) dir = path.join(root, `${repoName}-${Date.now().toString(36).slice(-4)}`);
            if (sessionId) broadcastThinkingDetail(sessionId, isAr ? `📥 أستنسخ المستودع ${url}…` : `📥 Cloning ${url}…`);
            term(`git clone --depth 1 ${url}`);
            // Through the Single Execution Authority — a direct spawn here
            // BLOCKED STARTUP on the user's machine (ExecutionEnforcer).
            const { executionEngine } = require('../../../kernel/ExecutionEngine');
            const code = await (async () => {
                const h = executionEngine.runArgvStreaming('git', ['clone', '--depth', '1', url, dir], {
                    timeout: 180_000,
                    onLine: (l: string) => term(`  ${l.slice(0, 160)}`),
                });
                const r = await h.done;
                if (r.exitCode === null) return -1;
                if (r.exitCode === 124 && r.error === 'timeout') return -2;
                return r.exitCode;
            })();
            if (code !== 0) {
                return {
                    ok: false,
                    error: 'clone_failed',
                    output: { message: isAr ? `⚠️ تعذّر استنساخ المستودع (${code === -2 ? 'انتهت المهلة' : code === -1 ? 'git غير متاح' : 'رفض الخادم — تأكد أن المستودع عام وأن الرابط صحيح'}).` : 'Clone failed.' },
                    logs,
                } as any;
            }
            term(`clone OK → ${dir}`);
        }

        // Understand it — facts from the files, no model.
        if (sessionId) broadcastThinkingDetail(sessionId, isAr ? '🧠 أقرأ بنية المشروع وتقنياته…' : '🧠 Reading the project\'s structure and stack…');
        const analysis = analyzeProject(dir);
        logs.push(`analysis: ${analysis.stack.join(',') || 'unknown'} — ${analysis.totalFiles} files, ${analysis.totalLines} lines`);

        // Register as the ACTIVE project: the surgical editor, run, and undo
        // now all point here.
        const projects: Record<string, any> = (global as any).joeProjects || ((global as any).joeProjects = {});
        projects[sessionKey] = {
            dir, type: 'imported', brand: analysis.name, stack: analysis.stack,
            updatedAt: Date.now(), lastRequest: request.slice(0, 80),
        };
        persistJoeProjects();

        const nextSteps = isAr
            ? `\n\n🧭 المشروع الآن نشط في هذه الجلسة — أرسل أيّ سطر:
   • «عدل …» → تعديل جراحي بالأسطر مع بوابة فحص نحوي
   • «شغّل المشروع» → تشغيله ومعاينته
   • اسألني عن أي جزء منه`
            : '\n\nThe project is now active in this session — edit it surgically, run it, or ask about it.';
        return {
            ok: true,
            output: { message: `${formatAnalysis(analysis, isAr)}${nextSteps}`, dir, analysis },
            logs,
        } as any;
    }
}
