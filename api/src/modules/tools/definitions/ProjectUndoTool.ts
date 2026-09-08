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
import { isArabicReply, say } from '../../../shared/reply-language';
import path from 'path';
import { BaseTool } from '../base';
import { ToolPermission, ToolExecutionResult } from '../types';
import { broadcastThinkingDetail, broadcastTerminalLine } from '../../../api/ws';
import { listVersions, restoreVersion, snapshotProject } from '../../../core/project/versions';
import { persistJoeProjects, writeJoeProject } from '../../../api/page-store';

interface SurgicalHistoryEntry {
    file: string;
    before: string;
    at: number;
}

const SURGICAL_BATCH_WINDOW_MS = 5_000;

function surgicalHistory(entry: any): SurgicalHistoryEntry[] {
    return Array.isArray(entry?.history)
        ? entry.history.filter((item: any) => item
            && typeof item.file === 'string'
            && typeof item.before === 'string'
            && Number.isFinite(Number(item.at)))
        : [];
}

function latestSurgicalBatch(history: SurgicalHistoryEntry[]): { batch: SurgicalHistoryEntry[]; kept: SurgicalHistoryEntry[] } {
    if (!history.length) return { batch: [], kept: [] };
    const newest = Number(history[history.length - 1].at);
    return {
        batch: history.filter(item => newest - Number(item.at) < SURGICAL_BATCH_WINDOW_MS),
        kept: history.filter(item => newest - Number(item.at) >= SURGICAL_BATCH_WINDOW_MS),
    };
}

function projectPath(dir: string, rel: string): string | null {
    const root = path.resolve(dir);
    const target = path.resolve(root, String(rel || ''));
    return target === root || target.startsWith(root + path.sep) ? target : null;
}

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
        const isAr = isArabicReply({ language: (context as any)?.language, text: String((input as any)?.request || '') });
        const sessionKey = String(sessionId || 'default').replace(/[^a-zA-Z0-9._-]/g, '_');
        const term = (line: string) => {
            logs.push(line);
            try { broadcastTerminalLine(sessionId, line + '\r\n'); } catch { /* UI optional */ }
        };

        const projects: Record<string, any> = (global as any).joeProjects || {};
        const projectEntry = projects[sessionKey];
        const dir = String(input?.projectDir || projectEntry?.dir || '').trim();
        if (!dir || !fs.existsSync(dir)) return { ok: false, error: 'no_project', logs } as any;

        const versions = listVersions(dir);
        const history = surgicalHistory(projectEntry);
        const surgical = latestSurgicalBatch(history);
        const newestSurgicalAt = surgical.batch.reduce((latest, item) => Math.max(latest, Number(item.at) || 0), 0);
        const preferSurgical = !input?.versionId
            && surgical.batch.length > 0
            && (!versions.length || newestSurgicalAt >= Number(versions[0]?.at || 0));
        const when = (at: number) => new Date(at).toLocaleString('ar');

        if (input?.list === true) {
            const snapshotLines = versions.length
                ? [`📜 النسخ الكاملة المحفوظة (${versions.length}):`, '',
                    ...versions.map((v, i) => `   ${i + 1}. ${when(v.at)} — ${v.label || 'بلا وصف'} (${v.files} ملف)\n      المعرّف: ${v.id}`),
                ].join('\n')
                : '📜 لا توجد نسخة كاملة محفوظة بعد.';
            const editLine = surgical.batch.length
                ? `✏️ يوجد أيضاً آخر تعديل جراحي قابل للتراجع (${new Set(surgical.batch.map(item => item.file)).size} ملف).`
                : '✏️ لا يوجد تعديل جراحي أحدث قابل للتراجع.';
            const guidance = versions.length || surgical.batch.length
                ? 'قل «تراجع» للعودة إلى أحدث تغيير متاح، أو اذكر معرّف نسخة كاملة.'
                : 'ستُحفظ نقطة رجوع تلقائياً قبل أي تعديل لاحق يجريه جو.';
            return {
                ok: true,
                output: { message: [snapshotLines, '', editLine, '', guidance].join('\n'), versions, surgicalEdits: surgical.batch.length },
                logs,
            } as any;
        }

        if (preferSurgical) {
                if (sessionId) broadcastThinkingDetail(sessionId, say(isAr, '↩️ أرجع آخر دفعة تعديل…', '↩️ Rolling back the latest edit batch…'));

                // Keep the earliest pre-edit bytes for each file. Older writers
                // could record one file more than once inside the same batch.
                const restore = new Map<string, { abs: string; before: string }>();
                for (const item of surgical.batch) {
                    const abs = projectPath(dir, item.file);
                    if (!abs) {
                        return { ok: false, error: `unsafe_history_path:${item.file}`, logs } as any;
                    }
                    if (!restore.has(item.file)) restore.set(item.file, { abs, before: item.before });
                }

                // A surgical rollback must itself be undoable, even though its
                // source record predates the snapshot system.
                snapshotProject(dir, 'قبل استرجاع آخر تعديل جراحي');
                const present = new Map<string, { existed: boolean; body: Buffer }>();
                try {
                    for (const { abs } of restore.values()) {
                        present.set(abs, { existed: fs.existsSync(abs), body: fs.existsSync(abs) ? fs.readFileSync(abs) : Buffer.alloc(0) });
                    }
                    for (const { abs, before } of restore.values()) {
                        fs.mkdirSync(path.dirname(abs), { recursive: true });
                        fs.writeFileSync(abs, before, 'utf-8');
                    }
                    const mismatch = [...restore.entries()].find(([, item]) => {
                        try { return fs.readFileSync(item.abs, 'utf-8') !== item.before; } catch { return true; }
                    });
                    if (mismatch) throw new Error(`verification_failed:${mismatch[0]}`);
                } catch (error: any) {
                    for (const [abs, state] of present) {
                        try {
                            if (state.existed) fs.writeFileSync(abs, state.body);
                            else fs.rmSync(abs, { force: true });
                        } catch { /* best effort: preserve the original failure */ }
                    }
                    return { ok: false, error: String(error?.message || error).slice(0, 180), logs } as any;
                }

                writeJoeProject(sessionKey, {
                    ...(projectEntry || {}),
                    dir,
                    updatedAt: Date.now(),
                    history: surgical.kept,
                }, context?.runId ?? null);
                persistJoeProjects();
                term(`undo: restored surgical batch (${restore.size} file(s)) from persisted edit history`);

                const rebuilt = await this.rebuild(dir, sessionId, isAr, term);
                const message = isAr
                    ? `↩️ أعدتُ آخر دفعة تعديل كاملة (${restore.size} ملف).${rebuilt.ok ? '\n✅ وأعدتُ البناء ليطابق المصدر المستعاد.' : `\n⚠️ استُعيد المصدر، لكن البناء لم يكتمل: ${rebuilt.note}`}`
                    : `↩️ Restored the latest complete edit batch (${restore.size} file(s)).${rebuilt.ok ? '\n✅ Rebuilt the project to match the restored source.' : `\n⚠️ The source was restored, but the build did not complete: ${rebuilt.note}`}`;
                return {
                    ok: true,
                    output: { message, restored: [...restore.keys()], removed: [], rebuilt: rebuilt.ok, source: 'surgical_history' },
                    logs,
                } as any;
        }

        if (!versions.length) {
            return {
                ok: false, error: 'no_versions',
                output: { message: '📜 لا توجد نسخة أرجع إليها — لم يعدّل جو هذا المشروع بعد.' },
                logs,
            } as any;
        }

        if (sessionId) broadcastThinkingDetail(sessionId, say(isAr, '↩️ أرجع المشروع إلى نسخته السابقة…', '↩️ Rolling the project back to its previous version…'));
        const res = restoreVersion(dir, input?.versionId ? String(input.versionId) : undefined);
        if (!res.ok) {
            return { ok: false, error: res.error || 'restore_failed', logs } as any;
        }
        term(`undo: restored ${res.restored.length} file(s)${res.removed.length ? `, removed ${res.removed.length}` : ''} from ${res.version?.id}`);

        // A restored source with a stale dist lies in the preview panel.
        const rebuild = await this.rebuild(dir, sessionId, isAr, term);
        const rebuilt = rebuild.ok;
        const buildNote = rebuild.note;

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

    private async rebuild(
        dir: string,
        sessionId: string | undefined,
        isAr: boolean,
        term: (line: string) => void,
    ): Promise<{ ok: boolean; note: string }> {
        if (!fs.existsSync(path.join(dir, 'node_modules')) || !fs.existsSync(path.join(dir, 'package.json'))) {
            return { ok: true, note: '' };
        }
        if (sessionId) broadcastThinkingDetail(sessionId, say(isAr, '🏗️ وأعيد البناء ليطابق ما رجعنا إليه…', '🏗️ …and rebuilding so the output matches what we rolled back to'));
        const { runDoctored } = require('../../../core/quality/log-doctor');
        const result = await runDoctored('npm', ['run', 'build'], {
            cwd: dir,
            timeoutMs: 240_000,
            onLine: (line: string) => term(`  ${line.slice(0, 200)}`),
            onNote: (note: string) => term(note),
        });
        return {
            ok: result.ok === true,
            note: result.ok === true ? '' : String(result.diagnosis?.ar || `رمز الخروج ${result.exitCode}`),
        };
    }
}

/** Take a snapshot before a mutation. Never throws; never blocks the caller. */
export function snapshotBefore(dir: string, label: string): void {
    try { snapshotProject(dir, label); } catch { /* protection must not break what it protects */ }
}
