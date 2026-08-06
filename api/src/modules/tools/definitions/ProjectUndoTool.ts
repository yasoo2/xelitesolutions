/**
 * project_undo — «تراجع» for a real project, not just a page.
 *
 * Pages have had instant rollback for a long time. React projects never did:
 * Joe edits them surgically, repairs their source before delivery, and mends
 * what its own audit measures — every one of those writes a door with no handle
 * on the inside. A system that can change your code and cannot put it back is
 * asking for a trust it has not earned.
 *
 * Restoring rebuilds afterwards, because a restored source with a stale `dist`
 * is a project that lies about itself in the preview panel.
 */
import fs from 'fs';
import path from 'path';
import { BaseTool } from '../base';
import { ToolPermission, ToolExecutionResult } from '../types';
import { broadcastThinkingDetail, broadcastTerminalLine } from '../../../api/ws';
import { listVersions, restoreVersion, snapshotProject } from '../../../core/project/versions';

export class ProjectUndoTool extends BaseTool {
    name = 'project_undo';
    version = '1.0.0';
    description = 'Restore a project to an earlier snapshot taken automatically before Joe changed it (undo/rollback), or list the available versions. Rebuilds after restoring.';
    tags = ['project', 'undo', 'rollback', 'history', 'versions'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            projectDir: { type: 'string' as const, description: 'Project folder. Defaults to this session\'s active project.' },
            versionId: { type: 'string' as const, description: 'Which snapshot to restore. Defaults to the most recent.' },
            list: { type: 'boolean' as const, description: 'List the snapshots instead of restoring.' },
            sessionId: { type: 'string' as const },
        },
    };
    get parameters() { return this.inputSchema; }
    outputSchema = { type: 'object' as const };

    permissions: ToolPermission[] = ['write', 'execute'];
    sideEffects: ToolPermission[] = ['write'];
    rateLimitPerMinute = 12;
    auditFields = ['projectDir', 'versionId'];
    mockSupported = false;

    async execute(input: any, context?: any): Promise<ToolExecutionResult> {
        const logs: string[] = [];
        const sessionId = context?.sessionId || input?.sessionId;
        const sessionKey = String(sessionId || 'default').replace(/[^a-zA-Z0-9._-]/g, '_');
        const term = (line: string) => {
            logs.push(line);
            try { broadcastTerminalLine(sessionId, line + '\r\n'); } catch { /* UI optional */ }
        };

        const projects: Record<string, any> = (global as any).joeProjects || {};
        const dir = String(input?.projectDir || projects[sessionKey]?.dir || '').trim();
        if (!dir || !fs.existsSync(dir)) return { ok: false, error: 'no_project', logs } as any;

        const versions = listVersions(dir);
        const when = (at: number) => new Date(at).toLocaleString('ar');

        if (input?.list === true) {
            const msg = versions.length
                ? [`📜 النسخ المحفوظة لهذا المشروع (${versions.length}):`, '',
                    ...versions.map((v, i) => `   ${i + 1}. ${when(v.at)} — ${v.label || 'بلا وصف'} (${v.files} ملف)\n      المعرّف: ${v.id}`),
                    '', 'قل «تراجع» للعودة إلى الأحدث، أو اذكر المعرّف للعودة إلى غيرها.'].join('\n')
                : '📜 لا توجد نسخ محفوظة بعد. تُؤخذ نسخة تلقائياً قبل كل تعديل يجريه جو على المشروع.';
            return { ok: true, output: { message: msg, versions }, logs } as any;
        }

        if (!versions.length) {
            return {
                ok: false, error: 'no_versions',
                output: { message: '📜 لا توجد نسخة أرجع إليها — لم يعدّل جو هذا المشروع بعد.' },
                logs,
            } as any;
        }

        if (sessionId) broadcastThinkingDetail(sessionId, '↩️ أرجع المشروع إلى نسخته السابقة…');
        const res = restoreVersion(dir, input?.versionId ? String(input.versionId) : undefined);
        if (!res.ok) {
            return { ok: false, error: res.error || 'restore_failed', logs } as any;
        }
        term(`undo: restored ${res.restored.length} file(s)${res.removed.length ? `, removed ${res.removed.length}` : ''} from ${res.version?.id}`);

        // A restored source with a stale dist lies in the preview panel.
        let rebuilt = true;
        let buildNote = '';
        if (fs.existsSync(path.join(dir, 'node_modules')) && fs.existsSync(path.join(dir, 'package.json'))) {
            if (sessionId) broadcastThinkingDetail(sessionId, '🏗️ وأعيد البناء ليطابق ما رجعنا إليه…');
            const { runDoctored } = require('../../../core/quality/log-doctor');
            const r = await runDoctored('npm', ['run', 'build'], {
                cwd: dir, timeoutMs: 240_000,
                onLine: (l: string) => term(`  ${l.slice(0, 200)}`),
                onNote: (n: string) => term(n),
            });
            rebuilt = r.ok === true;
            if (!rebuilt) buildNote = String(r.diagnosis?.ar || `رمز الخروج ${r.exitCode}`);
        }

        const message = [
            `↩️ رجعتُ بالمشروع إلى نسخة ${when(res.version!.at)}${res.version!.label ? ` — ${res.version!.label}` : ''}.`,
            ``,
            `   📄 أُعيد ${res.restored.length} ملف${res.removed.length ? `، وحُذف ${res.removed.length} ملف أُضيف بعدها` : ''}.`,
            rebuilt ? `   ✅ وأُعيد البناء فيطابق dist ما تراه في المصدر.` : `   ⚠️ لكن البناء لم يكتمل: ${buildNote}`,
            ``,
            res.undoOf
                ? `💡 وهذا التراجع نفسه محفوظ — قل «تراجع» مرة أخرى للعودة إلى ما قبله.`
                : '',
            `📜 قل «اعرض النسخ» لرؤية كل النسخ المحفوظة.`,
        ].filter(Boolean).join('\n');

        return {
            ok: true,
            output: { message, version: res.version, restored: res.restored, removed: res.removed, rebuilt },
            logs,
        } as any;
    }
}

/** Take a snapshot before a mutation. Never throws; never blocks the caller. */
export function snapshotBefore(dir: string, label: string): void {
    try { snapshotProject(dir, label); } catch { /* protection must not break what it protects */ }
}
