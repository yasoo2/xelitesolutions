/**
 * browser_ui_fix — «اريده ان يصلح ui لاي نظام ولاي صفحة عندما يطلب منه».
 *
 * Joe's browser has been able to MEASURE a build for weeks and never able to
 * mend one. It would report «62/100 — small_targets, dead_links» and hand that
 * to the user as if a score were a deliverable. This closes the loop:
 *
 *   1. AUDIT the built interface in a real browser (the same audit as always)
 *   2. REPAIR the SOURCE deterministically — the DOM cannot be edited, the
 *      files can, and the files are what ships
 *   3. GATE every changed file through the syntax checker, so a repair can
 *      never be the thing that breaks the build
 *   4. REBUILD for real (vite), and refuse the whole repair if the build fails
 *   5. AUDIT AGAIN and report BOTH numbers
 *
 * The last step is the honest one: it does not claim an improvement, it
 * measures one. If the score did not move, it says so.
 */
import fs from 'fs';
import path from 'path';
import { BaseTool } from '../base';
import { ToolPermission, ToolExecutionResult } from '../types';
import { broadcast, broadcastThinkingDetail, broadcastTerminalLine } from '../../../api/ws';
import { repairProjectFiles } from '../../../core/quality/ui-repair';
import { syntaxOk } from './ProjectEditTool';

/** Every source file a UI repair could possibly touch, relative to the project. */
function collectSources(dir: string): Record<string, string> {
    const out: Record<string, string> = {};
    const skip = new Set(['node_modules', 'dist', '.git', 'public', 'fonts']);
    const walk = (abs: string, rel: string, depth: number) => {
        if (depth > 6) return;
        let entries: fs.Dirent[] = [];
        try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            if (skip.has(e.name)) continue;
            const childAbs = path.join(abs, e.name);
            const childRel = rel ? `${rel}/${e.name}` : e.name;
            if (e.isDirectory()) { walk(childAbs, childRel, depth + 1); continue; }
            if (!/\.(html|jsx|tsx|css)$/i.test(e.name)) continue;
            try { out[childRel] = fs.readFileSync(childAbs, 'utf-8'); } catch { /* unreadable */ }
        }
    };
    walk(dir, '', 0);
    return out;
}

export class UiFixTool extends BaseTool {
    name = 'browser_ui_fix';
    version = '1.0.0';
    description = 'Audit a built interface in a real browser, REPAIR the accessibility and usability defects in its source (alt text, labels, dead links, tap targets, document language, headings), rebuild it, and report the measured score before and after.';
    tags = ['browser', 'ui', 'quality', 'accessibility', 'repair', 'fix'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            projectDir: { type: 'string' as const, description: 'Project folder to repair. Defaults to this session\'s active project.' },
            sessionId: { type: 'string' as const },
        },
    };
    get parameters() { return this.inputSchema; }
    outputSchema = { type: 'object' as const };

    permissions: ToolPermission[] = ['write', 'execute'];
    sideEffects: ToolPermission[] = ['write', 'execute'];
    rateLimitPerMinute = 6;
    auditFields = ['projectDir'];
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
        if (!dir || !fs.existsSync(dir)) {
            return { ok: false, error: 'no_project', logs } as any;
        }
        const distDir = path.join(dir, 'dist');

        const { auditBuiltApp, formatAudit } = require('../../../core/quality/app-audit');
        const { PANEL_BROWSER_SID } = require('./BrowserSmartTools');

        try { broadcast({ type: 'panel_focus', sessionId, data: { panel: 'browser', reason: 'ui_fix' } } as any); } catch { /* UI optional */ }
        if (sessionId) broadcastThinkingDetail(sessionId, '🔎 أقيس الواجهة قبل الإصلاح — في المتصفح أمامك…');

        const before = await auditBuiltApp(distDir, { timeoutMs: 30_000, watchSessionId: PANEL_BROWSER_SID });
        if (before.skipped) {
            return { ok: false, error: `cannot_audit: ${before.skipped}`, logs } as any;
        }
        term(`ui_fix: before → ${before.score}/100 (${before.findings.map((f: any) => f.id).join(', ') || 'clean'})`);

        // ── 2/3: repair the SOURCE, gate every file, write only what parses ──
        if (sessionId) broadcastThinkingDetail(sessionId, '🛠️ أصلح المصدر نفسه — لا الصفحة المعروضة…');
        const sources = collectSources(dir);
        const isArabic = /[؀-ۿ]/.test(Object.values(sources).join('\n').slice(0, 20_000));
        const plan = repairProjectFiles(sources, { isArabic, brand: undefined } as any);

        const written: string[] = [];
        const refused: string[] = [];
        for (const [rel, text] of Object.entries(plan.files)) {
            const gate = syntaxOk(rel, text);
            if (!gate.ok) {
                // A repair that breaks the build is not a repair. It is dropped,
                // named, and the rest still land.
                refused.push(`${rel}: ${gate.error}`);
                continue;
            }
            try { fs.writeFileSync(path.join(dir, rel), text, 'utf-8'); written.push(rel); }
            catch (e: any) { refused.push(`${rel}: ${e?.message || e}`); }
        }
        term(`ui_fix: repaired ${written.length} file(s)${refused.length ? `, refused ${refused.length}` : ''}`);
        for (const r of refused) term(`  ⚠️ ${r}`);

        if (!written.length) {
            const msg = `🔎 قِستُ الواجهة: ${before.score}/100 — ولم أجد في المصدر ما أصلحه بأمان.\n`
                + `${formatAudit(before, true)}\n\n`
                + (refused.length ? `⚠️ رفضتُ ${refused.length} تعديلاً لأنه كان سيكسر البناء.` : 'الملاحظات المتبقّية تحتاج قراراً منك — قل لي أيّها أعالج.');
            return { ok: true, output: { message: msg, before: before.score, after: before.score, changed: [] }, logs } as any;
        }

        // ── 4: the real build. A repair that does not compile is reverted. ──
        const backup: Record<string, string> = {};
        for (const rel of written) backup[rel] = sources[rel];
        let built = true;
        if (fs.existsSync(path.join(dir, 'node_modules'))) {
            if (sessionId) broadcastThinkingDetail(sessionId, '🏗️ أعيد البناء للتحقّق أن الإصلاح لم يكسر شيئاً…');
            const { executionEngine } = require('../../../kernel/ExecutionEngine');
            const r = await executionEngine.runArgvStreaming('npm', ['run', 'build'], {
                cwd: dir, timeout: 240_000, env: { NO_COLOR: '1' },
                onLine: (l: string) => term(`  ${l.slice(0, 200)}`),
            }).done;
            built = r.ok === true;
        }
        if (!built) {
            for (const [rel, text] of Object.entries(backup)) {
                try { fs.writeFileSync(path.join(dir, rel), text, 'utf-8'); } catch { /* best effort */ }
            }
            term('ui_fix: build FAILED after repair — every change reverted');
            return {
                ok: false,
                error: 'build_failed_after_repair',
                output: { message: '⚠️ الإصلاح كسر البناء، فأرجعتُ كل ملف كما كان. لم يتغيّر شيء في مشروعك.' },
                logs,
            } as any;
        }

        // ── 5: measure again. The number is the claim. ──
        if (sessionId) broadcastThinkingDetail(sessionId, '🔎 أقيس مرة أخرى بعد الإصلاح…');
        const after = await auditBuiltApp(distDir, { timeoutMs: 30_000, watchSessionId: PANEL_BROWSER_SID });
        term(`ui_fix: after → ${after.score}/100 (${after.findings.map((f: any) => f.id).join(', ') || 'clean'})`);

        const gone = before.findings
            .filter((f: any) => !after.findings.some((g: any) => g.id === f.id))
            .map((f: any) => f.id);
        const delta = after.score - before.score;

        const message = [
            `🛠️ أصلحتُ الواجهة — والنتيجة مقيسة لا مُدّعاة:`,
            ``,
            `   قبل: ${before.score}/100`,
            `   بعد: ${after.score}/100 ${delta > 0 ? `(+${delta})` : delta < 0 ? `(${delta})` : '(بلا تغيّر)'}`,
            ``,
            `🔧 ما غيّرتُه في المصدر:`,
            ...plan.repairs.map(r => `   • ${r.detail}${r.count > 1 ? ` (${r.count})` : ''}`),
            ``,
            `📄 الملفات: ${written.length}`,
            ...written.slice(0, 12).map(f => `   • ${f}`),
            gone.length ? `\n✅ اختفت الملاحظات: ${gone.join('، ')}` : '',
            after.findings.length
                ? `\n⚠️ ما زال قائماً (يحتاج قراراً منك):\n${after.findings.map((f: any) => `   • ${f.detail}`).join('\n')}`
                : '\n✅ لا ملاحظات متبقّية — الواجهة نظيفة.',
            refused.length ? `\n⚠️ رفضتُ ${refused.length} تعديلاً كان سيكسر البناء.` : '',
        ].filter(Boolean).join('\n');

        return {
            ok: true,
            output: {
                message, before: before.score, after: after.score, delta,
                changed: written, repairs: plan.repairs, remaining: after.findings,
            },
            logs,
        } as any;
    }
}
