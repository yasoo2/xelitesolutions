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
import { findActiveBuiltProject } from '../../../core/orchestrator/active-built-project';
import { BaseTool } from '../base';
import { ToolPermission, ToolExecutionResult } from '../types';
import { broadcast, broadcastTerminalLine, broadcastThinkingDetail } from '../../../api/ws';

export class ProjectRepairTool extends BaseTool {
    name = 'project_repair';
    version = '1.0.0';
    description = 'Re-audit this session\'s built project in a real browser and repair what is still broken (dead images, failed requests, console errors), then rebuild and re-measure. The command behind «أصلح ما تبقّى».';
    tags = ['project', 'quality', 'repair', 'audit', 'browser'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            projectDir: { type: 'string' as const, description: 'Project folder. Defaults to this session\'s active built project.' },
            auditDir: { type: 'string' as const, description: 'Optional built-output folder selected from workspace evidence.' },
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
        const built = findActiveBuiltProject(sessionId, input?.projectDir);
        const dir = built?.projectDir || String(input?.projectDir || projects[sessionKey]?.dir || '').trim();
        const auditDir = built?.auditDir || String(input?.auditDir || '').trim();
        if (!built || !dir || !fs.existsSync(dir) || !auditDir || !fs.existsSync(auditDir)) {
            return {
                ok: false,
                error: isAr
                    ? (dir
                        ? `المشروع موجود في ${dir} لكن لم أعثر على index.html مبني قابل للتدقيق — البناء لم يكتمل.`
                        : 'لا مشروع مبنيّ في هذه الجلسة لأصلحه — ابنِ شيئاً أولاً.')
                    : (dir
                        ? `The project is at ${dir} but no built index.html was found to audit — the build never finished.`
                        : 'No built project in this session to repair — build something first.'),
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
        const before = await auditBuiltApp(auditDir, {
            timeoutMs: 30_000, watchSessionId: PANEL_BROWSER_SID,
            artifactRootDir: process.env.ARTIFACT_DIR || '/tmp/joe-artifacts',
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

        say(isAr ? '🛠️ أُصلح ما أستطيع، ثم أُعيد البناء والقياس حتى يتوقف التحسن الحقيقي…' : '🛠️ Repairing what I can, then rebuilding and measuring until the real improvement stops…');
        const { improveUntilItStops, improveSummary, repairRound, } = require('../../../core/quality/improve-loop');
        const { collectSources } = require('../../../core/quality/self-repair');
        const { snapshotProject, restoreVersion } = require('../../../core/project/versions');
        const { runDoctored } = require('../../../core/quality/log-doctor');
        const memorySnapshots = new Map<string, Record<string, string>>();

        const hasBuildScript = () => {
            try {
                const pkg = JSON.parse(fs.readFileSync(require('path').join(dir, 'package.json'), 'utf-8'));
                return typeof pkg?.scripts?.build === 'string' && pkg.scripts.build.trim().length > 0;
            } catch { return false; }
        };
        const rebuild = async (): Promise<boolean> => {
            if (!hasBuildScript()) {
                // A Joe Pages/static artifact is already its own served build. Its
                // source files are the measured files, so a second package build
                // would be theatre and is correctly treated as a verified no-op.
                term('repair: no package build script — measuring the repaired static artifact directly');
                return true;
            }
            const rb = await runDoctored('npm', ['run', 'build'], {
                cwd: dir,
                timeoutMs: 240_000,
                onLine: (line: string) => term(`  ${line.slice(0, 200)}`),
                onNote: term,
            }).catch(() => ({ ok: false }));
            return rb.ok === true;
        };
        const snapshot = (label: string): string => {
            try {
                if (hasBuildScript() || fs.existsSync(require('path').join(dir, 'package.json'))) {
                    return String(snapshotProject(dir, label)?.id || '');
                }
                const files = collectSources(dir);
                if (!Object.keys(files).length) return '';
                const id = `memory-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                memorySnapshots.set(id, files);
                return id;
            } catch { return ''; }
        };
        const rollback = async (id: string): Promise<boolean> => {
            try {
                const memory = memorySnapshots.get(id);
                if (memory) {
                    const now = collectSources(dir);
                    for (const rel of Object.keys(now)) {
                        if (!(rel in memory)) fs.rmSync(require('path').join(dir, rel), { force: true });
                    }
                    for (const [rel, text] of Object.entries(memory)) {
                        const abs = require('path').join(dir, rel);
                        fs.mkdirSync(require('path').dirname(abs), { recursive: true });
                        fs.writeFileSync(abs, text, 'utf-8');
                    }
                    memorySnapshots.delete(id);
                } else {
                    const restored = restoreVersion(dir, id);
                    if (!restored?.ok) return false;
                }
                const rebuilt = await rebuild();
                if (rebuilt) term('repair: rollback verified by a successful rebuild');
                return rebuilt;
            } catch { return false; }
        };
        const measure = async () => {
            const measured = await auditBuiltApp(auditDir, {
                timeoutMs: 30_000,
                watchSessionId: PANEL_BROWSER_SID,
                artifactRootDir: process.env.ARTIFACT_DIR || '/tmp/joe-artifacts',
                onProgress: (where: string) => {
                    if (where === 'watching') say(isAr ? '👁️ القياس المقيس يجري الآن أمامك في لوحة المتصفّح' : '👁️ The measured round is running in the Browser panel');
                },
            });
            return {
                score: Number(measured.score || 0),
                findingIds: (measured.findings || []).map((f: any) => String(f.id)),
                findings: (measured.findings || []).map((f: any) => ({ id: String(f.id), evidence: f.evidence, severity: f.severity, detail: f.detail, message: f.message })),
                skipped: measured.skipped,
            };
        };
        const loop = await improveUntilItStops(
            {
                score: Number(before.score || 0),
                findingIds: (before.findings || []).map((f: any) => String(f.id)),
                findings: (before.findings || []).map((f: any) => ({ id: String(f.id), evidence: f.evidence, severity: f.severity, detail: f.detail, message: f.message })),
                skipped: before.skipped,
            },
            {
                say,
                measure,
                repair: async (round: number, _ids: string[], findings: any[]) => {
                    const repaired = await repairRound(dir, round, { isArabic: isAr, findings });
                    for (const file of repaired.changed) term(`repair: round ${round} edited ${file}`);
                    return repaired.changed;
                },
                rebuild,
                snapshot,
                rollback,
                target: Math.max(1, Number(process.env.JOE_IMPROVE_TARGET || 95)),
                maxRounds: Math.max(1, Number(process.env.JOE_IMPROVE_ROUNDS || 4)),
            },
        );
        term(improveSummary(loop, isAr));

        const finalMeasurement = loop.final || before;
        const gained = !finalMeasurement.skipped && finalMeasurement.score > before.score;
        const remaining = (finalMeasurement.findings || []) as any[];
        const blockers = remaining.filter((f: any) => f.severity === 'high');
        const paidFiles = Array.from(new Set(loop.rounds
            .filter((r: any) => r.verdict === 'improved')
            .flatMap((r: any) => r.changed || []))) as string[];

        // «• 3 خطأ كونسول» inside an English message: the findings carry both
        // languages now, and this picks the reader's.
        const { findingText } = require('../../../core/quality/app-audit');
        const said = (f: any) => findingText(f, isAr);
        const lines: string[] = [];
        lines.push(isAr
            ? `🔁 دورة التحسين المقيسة: ${before.score}/100 → ${finalMeasurement.score}/100 عبر ${loop.rounds.length} جولة، وتوقفت لأن: ${loop.stoppedBecause}.`
            : `🔁 Measured improvement loop: ${before.score}/100 → ${finalMeasurement.score}/100 across ${loop.rounds.length} round(s), stopped because: ${loop.stoppedBecause}.`);
        for (const f of paidFiles) lines.push(`   • ${isAr ? 'عُدّل' : 'edited'}: ${f}`);
        lines.push(improveSummary(loop, isAr));
        if (blockers.length) {
            lines.push(isAr ? `⛔ وما زال لا يعمل كما ينبغي — ${blockers.length} عطل جوهري:` : `⛔ Still not working properly — ${blockers.length} blocking finding(s):`);
            for (const f of blockers) lines.push(`   • ${said(f)}`);
            lines.push(isAr
                ? '   ↳ هذه لا أستطيع إصلاحها وحدي — أخبرني بما تريده فيها بالضبط.'
                : '   ↳ These I cannot fix alone — tell me exactly what you want done about them.');
        } else if (remaining.length) {
            lines.push(isAr ? '⚠️ بقيت ملاحظات غير جوهرية:' : '⚠️ Non-blocking findings remain:');
            for (const f of remaining) lines.push(`   • ${said(f)}`);
        } else {
            lines.push(isAr ? '✅ ولم يبقَ شيء.' : '✅ Nothing left.');
        }

        try {
            const entry = projects[sessionKey];
            if (entry) {
                entry.lastAudit = {
                    score: finalMeasurement.score, at: Date.now(),
                    findings: remaining.slice(0, 12).map((f: any) => ({ severity: f.severity, message: String(f.detail || '').slice(0, 200) })),
                };
            }
        } catch { /* memory is a bonus */ }

        return {
            ok: true,
            output: {
                message: lines.join('\n'),
                before: before.score,
                after: finalMeasurement.score,
                changed: paidFiles,
                rounds: loop.rounds,
                stoppedBecause: loop.stoppedBecause,
                remaining: remaining.map((f: any) => f.id),
                blockersBefore: blockersBefore.map((f: any) => f.id),
            },
            logs,
        } as any;
    }
}
