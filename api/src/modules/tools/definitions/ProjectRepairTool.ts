/**
 * project_repair — «أصلح ما تبقّى».
 *
 * The delivery message learned to say, at the top, that a build was handed over
 * with defects still open:
 *
 *     ⛔ سلّمتُه وهو لا يعمل كما ينبغي — 1 عطل جوهري باقٍ:
 *        • 1 ملف لم يصل: 404 /%22C:/Users/…jpg%22
 *        ↳ قل «أصلح ما تبقّى» وسأفتح المتصفّح على هذه بالذات.
 *
 * …and that last line was a promise with nothing behind it. A sentence
 * offering a command that does not exist is worse than no sentence: it spends
 * the user's trust on a door that opens onto a wall.
 *
 * This is the door. It re-measures the session's built project in a REAL
 * browser — in his panel, where he can watch it — repairs what it can, rebuilds,
 * measures again, and reports all three numbers. It never claims a gain it did
 * not measure, and if the repair made things worse the project is put back.
 */
import fs from 'fs';
import path from 'path';
import { BaseTool } from '../base';
import { ToolPermission, ToolExecutionResult } from '../types';
import { broadcast, broadcastTerminalLine, broadcastThinkingDetail } from '../../../api/ws';
import { repairAndRebuild } from '../../../core/quality/self-repair';

export class ProjectRepairTool extends BaseTool {
    name = 'project_repair';
    version = '1.0.0';
    description = 'Re-audit this session\'s built project in a real browser and repair what is still broken (dead images, failed requests, console errors), then rebuild and re-measure. The command behind «أصلح ما تبقّى».';
    tags = ['project', 'quality', 'repair', 'audit', 'browser'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            projectDir: { type: 'string' as const, description: 'Project folder. Defaults to this session\'s active project.' },
            sessionId: { type: 'string' as const },
        },
    };
    get parameters() { return this.inputSchema; }
    outputSchema = { type: 'object' as const };

    permissions: ToolPermission[] = ['write', 'execute'];
    sideEffects: ToolPermission[] = ['write'];
    rateLimitPerMinute = 6;
    auditFields = ['projectDir'];
    mockSupported = false;

    async execute(input: any, context?: any): Promise<ToolExecutionResult> {
        const logs: string[] = [];
        const sessionId = context?.sessionId || input?.sessionId;
        const sessionKey = String(sessionId || 'default').replace(/[^a-zA-Z0-9._-]/g, '_');
        const isAr = String(context?.language || 'ar').toLowerCase().startsWith('ar');
        const term = (line: string) => {
            logs.push(line);
            try { broadcastTerminalLine(sessionId, line + '\r\n'); } catch { /* UI optional */ }
        };
        const say = (line: string) => { try { broadcastThinkingDetail(sessionId, line); } catch { /* UI optional */ } };

        const projects: Record<string, any> = (global as any).joeProjects || {};
        const dir = String(input?.projectDir || projects[sessionKey]?.dir || '').trim();
        if (!dir || !fs.existsSync(dir)) {
            return {
                ok: false,
                error: isAr
                    ? 'لا مشروع مبنيّ في هذه الجلسة لأصلحه — ابنِ شيئاً أولاً.'
                    : 'No built project in this session to repair — build something first.',
                logs,
            } as any;
        }
        const dist = path.join(dir, 'dist');
        if (!fs.existsSync(path.join(dist, 'index.html'))) {
            return {
                ok: false,
                error: isAr
                    ? `المشروع موجود في ${dir} لكن لا يوجد dist/index.html — البناء لم يكتمل.`
                    : `The project is at ${dir} but there is no dist/index.html — the build never finished.`,
                logs,
            } as any;
        }

        const { auditBuiltApp } = require('../../../core/quality/app-audit');
        const { PANEL_BROWSER_SID } = require('./BrowserSmartTools');

        // Open the panel and WAIT for it, exactly as the builder does: a repair
        // he was told he could watch must not be over before he can look.
        try { broadcast({ type: 'panel_focus', sessionId, data: { panel: 'browser', reason: 'repair' } } as any); } catch { /* UI optional */ }
        // Chromium starts while the panel is still downloading its chunk, so
        // the first frame he sees is the page and not four white seconds.
        try { require('../../browser/manager').warmBrowserSession(PANEL_BROWSER_SID); } catch { /* the audit launches its own */ }
        try {
            const { waitForPanelWatcher } = require('../../browser/wsHub');
            const watching = await waitForPanelWatcher(PANEL_BROWSER_SID, 4000);
            term(watching
                ? 'repair: the Browser panel is attached — you can watch this'
                : 'repair: no Browser panel attached — running anyway');
        } catch { /* the hub is optional */ }

        say(isAr ? '🔎 أعيد القياس على البناء الحالي…' : '🔎 Re-measuring the current build…');
        const before = await auditBuiltApp(dist, {
            timeoutMs: 30_000, watchSessionId: PANEL_BROWSER_SID,
            onProgress: (where: string) => {
                if (where.startsWith('private')) {
                    const why = where.slice('private'.length).replace(/^:/, '').trim();
                    say((isAr
                        ? '🔒 تعذّر استعمال لوحة المتصفّح — القياس يجري في متصفّح خاصّ، والنتيجة كاملة في الرسالة'
                        : '🔒 The Browser panel could not be used — measuring in a private browser; the full result is in the message')
                        + (why ? (isAr ? `\n   السبب: ${why}` : `\n   Reason: ${why}`) : ''));
                    term(`repair: panel not borrowed${why ? ` — ${why}` : ''}`);
                    return;
                }
                if (where === 'watching') say(isAr ? '👁️ القياس يجري الآن أمامك في لوحة المتصفّح' : '👁️ Watch it happen in the Browser panel');
            },
        });
        if (before.skipped) {
            return { ok: false, error: `audit_skipped: ${before.skipped}`, logs } as any;
        }
        const blockersBefore = (before.findings || []).filter((f: any) => f.severity === 'high');
        term(`repair: before = ${before.score}/100${before.findings.length ? ` — ${before.findings.map((f: any) => f.id).join(', ')}` : ' — clean'}`);

        if (!before.findings.length) {
            const clean = isAr
                ? `✅ لا شيء لأصلحه — البناء الحالي نظيف: ${before.score}/100 في متصفّح حقيقي.`
                : `✅ Nothing to repair — the current build is clean: ${before.score}/100 in a real browser.`;
            return { ok: true, output: { message: clean, before: before.score, after: before.score, changed: [], remaining: [] }, logs } as any;
        }

        say(isAr ? '🛠️ أُصلح ما أستطيع، ثم أُعيد البناء والقياس…' : '🛠️ Repairing what I can, then rebuilding and re-measuring…');
        const cycle = await repairAndRebuild(dir, { onLine: term, isArabic: isAr });

        let after = before;
        if (cycle.changed.length && cycle.built) {
            after = await auditBuiltApp(dist, { timeoutMs: 30_000, watchSessionId: PANEL_BROWSER_SID });
            term(`repair: ${before.score} → ${after.score}/100 (${cycle.changed.length} file(s))`);
        } else if (cycle.reverted) {
            term('repair: reverted — the project is exactly as it was');
        } else {
            term('repair: nothing was changed');
        }

        const gained = !after.skipped && after.score > before.score;
        const remaining = ((gained ? after : before).findings || []) as any[];
        const blockers = remaining.filter(f => f.severity === 'high');

        const lines: string[] = [];
        lines.push(gained
            ? (isAr ? `🛠️ أصلحتُ ما أستطيع: ${before.score}/100 ← ${after.score}/100 (${cycle.changed.length} ملف)`
                : `🛠️ Repaired what I could: ${before.score}/100 → ${after.score}/100 (${cycle.changed.length} file(s))`)
            : (isAr ? `🛠️ لم يتحسّن القياس — أبقيتُ الحكم الأول: ${before.score}/100`
                : `🛠️ No measured gain — keeping the first verdict: ${before.score}/100`));
        for (const f of cycle.changed) lines.push(`   • ${isAr ? 'عُدّل' : 'edited'}: ${f}`);
        if (blockers.length) {
            lines.push(isAr ? `⛔ وما زال لا يعمل كما ينبغي — ${blockers.length} عطل جوهري:` : `⛔ Still not working properly — ${blockers.length} blocking finding(s):`);
            for (const f of blockers) lines.push(`   • ${f.detail}`);
            lines.push(isAr
                ? '   ↳ هذه لا أستطيع إصلاحها وحدي — أخبرني بما تريده فيها بالضبط.'
                : '   ↳ These I cannot fix alone — tell me exactly what you want done about them.');
        } else if (remaining.length) {
            lines.push(isAr ? '⚠️ بقيت ملاحظات غير جوهرية:' : '⚠️ Non-blocking findings remain:');
            for (const f of remaining) lines.push(`   • ${f.detail}`);
        } else {
            lines.push(isAr ? '✅ ولم يبقَ شيء.' : '✅ Nothing left.');
        }

        try {
            const entry = projects[sessionKey];
            if (entry) {
                entry.lastAudit = {
                    score: (gained ? after : before).score, at: Date.now(),
                    findings: remaining.slice(0, 12).map((f: any) => ({ severity: f.severity, message: String(f.detail || '').slice(0, 200) })),
                };
            }
        } catch { /* memory is a bonus */ }

        return {
            ok: true,
            output: {
                message: lines.join('\n'),
                before: before.score,
                after: (gained ? after : before).score,
                changed: cycle.changed,
                remaining: remaining.map((f: any) => f.id),
                blockersBefore: blockersBefore.map((f: any) => f.id),
            },
            logs,
        } as any;
    }
}
