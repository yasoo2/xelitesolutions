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
import { findActiveBuiltProject } from '../../../core/orchestrator/active-built-project';
import { BaseTool } from '../base';
import { ToolPermission, ToolExecutionResult } from '../types';
import { broadcast, broadcastTerminalLine, broadcastThinkingDetail } from '../../../api/ws';
import { isArabicReply } from '../../../shared/reply-language';

export async function recoverPackagedQaAuth(packagedDir: string): Promise<any | null> {
    const dbFile = path.join(packagedDir, 'db.js');
    const authFile = path.join(packagedDir, 'auth.js');
    if (!fs.existsSync(dbFile) || !fs.existsSync(authFile)) return null;
    try {
        const { pathToFileURL } = require('url');
        const nativeImport = new Function('specifier', 'return import(specifier)');
        const nonce = `joeqa=${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const load = async (file: string) => {
            try {
                const resolved = require.resolve(file);
                delete require.cache[resolved];
                return require(resolved);
            } catch (error: any) {
                if (!['ERR_REQUIRE_ESM', 'ERR_REQUIRE_ASYNC_MODULE'].includes(String(error?.code || ''))) throw error;
                return nativeImport(`${pathToFileURL(file).href}?${nonce}`);
            }
        };
        const [dbModule, authModule] = await Promise.all([load(dbFile), load(authFile)]);
        const users = typeof dbModule?.db?.listUsers === 'function' ? dbModule.db.listUsers() : [];
        const owner = users.find((user: any) => user?.role === 'owner') || users[0];
        if (!owner || typeof authModule?.signToken !== 'function') return null;
        const token = String(authModule.signToken(owner) || '');
        if (!token) return null;
        return { token, role: owner.role || 'owner', tokenStorageKey: 'joe:auth', route: '/' };
    } catch {
        return null;
    }
}

export class ProjectRepairTool extends BaseTool {
    name = 'project_repair';
    version = '1.0.0';
    description = 'Re-audit this session\'s built project in a real browser and repair what is still broken (dead images, failed requests, console errors), then rebuild and re-measure. The command behind «أصلح ما تبقّى».';
    tags = ['project', 'quality', 'repair', 'audit', 'browser'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            request: { type: 'string' as const, description: 'The user request, retained for response language and scope.' },
            projectDir: { type: 'string' as const, description: 'Project folder. Defaults to this session\'s active built project.' },
            auditDir: { type: 'string' as const, description: 'Optional built-output folder selected from workspace evidence.' },
            serveUrl: { type: 'string' as const, description: 'Optional live URL to audit instead of a private static preview.' },
            artifactRootDir: { type: 'string' as const, description: 'Optional trusted artifact root used by /artifacts requests during QA.' },
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
        const requestText = String(input?.request || input?.prompt || input?.text || '');
        const isAr = isArabicReply({ language: context?.language, text: requestText });
        const term = (line: string) => {
            logs.push(line);
            try { broadcastTerminalLine(sessionId, line + '\r\n'); } catch { /* UI optional */ }
        };
        const say = (line: string) => { try { broadcastThinkingDetail(sessionId, line); } catch { /* UI optional */ } };

        const projects: Record<string, any> = (global as any).joeProjects || {};
        const built = findActiveBuiltProject(sessionId, input?.projectDir);
        // An evidence-first pipeline may pass the selected project explicitly even
        // when the session registry was not populated by an earlier builder tool.
        // Prefer explicit evidence over stale session memory; never guess a sibling.
        const dir = String(input?.projectDir || built?.projectDir || projects[sessionKey]?.dir || '').trim();
        const auditDir = String(input?.auditDir || built?.auditDir || '').trim();
        if (!dir || !fs.existsSync(dir) || !auditDir || !fs.existsSync(auditDir)) {
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
        const watchSessionId = String(input?.watchSessionId || context?.browserSessionId || PANEL_BROWSER_SID || '').trim();
        const projectEntry = projects[sessionKey] || {};
        let serveUrl = String(input?.serveUrl || projectEntry?.live?.url || '').trim();
        let runtimeAuth = input?.credentials || projectEntry?.runtimeAuth;
        const artifactRootDir = String(input?.artifactRootDir || process.env.ARTIFACT_DIR || '/tmp/joe-artifacts').trim();

        // A same-session repair often arrives after the original API process
        // stopped. Auditing dist/ alone makes every real /api request look
        // "unverified", so revive the packaged full stack before measuring.
        // This is the system Joe built, not a mock QA server.
        const packagedDir = String(projectEntry?.packagedInto || '').trim();
        if (!runtimeAuth && packagedDir) {
            runtimeAuth = await recoverPackagedQaAuth(packagedDir);
            if (runtimeAuth) term('repair: recovered a short-lived local QA token — protected screens will be tested');
        }
        if ((!serveUrl || !(await this.urlAnswers(serveUrl)))
            && packagedDir && fs.existsSync(path.join(packagedDir, 'server.js'))
            && fs.existsSync(path.join(packagedDir, 'node_modules'))) {
            const port = 4600 + Math.floor(Math.random() * 300);
            try {
                const { executionEngine } = require('../../../kernel/ExecutionEngine');
                const child = executionEngine.runArgvStreaming(process.execPath, ['server.js'], {
                    cwd: packagedDir,
                    env: { PORT: String(port), NODE_NO_WARNINGS: '1' },
                    onLine: (line: string) => term(`  ${line.slice(0, 160)}`),
                });
                const candidate = `http://127.0.0.1:${port}/`;
                for (let i = 0; i < 30 && !(await this.urlAnswers(candidate)); i++) {
                    await new Promise(resolve => setTimeout(resolve, 250));
                }
                if (await this.urlAnswers(candidate)) {
                    serveUrl = candidate;
                    projectEntry.live = { url: candidate, port, pid: child.pid, cwd: packagedDir, at: Date.now() };
                    term(`repair: revived the packaged system at ${candidate} — browser QA includes its real API`);
                } else {
                    try { child.kill(); } catch { /* already stopped */ }
                }
            } catch (error: any) {
                term(`repair: packaged system could not be revived — ${String(error?.message || error).slice(0, 160)}`);
            }
        }

        // Open the panel and WAIT for it, exactly as the builder does: a repair
        // he was told he could watch must not be over before he can look.
        try { broadcast({ type: 'panel_focus', sessionId, data: { panel: 'browser', reason: 'repair' } } as any); } catch { /* UI optional */ }
        // Chromium starts while the panel is still downloading its chunk, so
        // the first frame he sees is the page and not four white seconds.
        try { require('../../browser/manager').warmBrowserSession(PANEL_BROWSER_SID); } catch { /* the audit launches its own */ }
        let watching = false;
        try {
            const { waitForPanelWatcher } = require('../../../browser/wsHub');
                // Rechecks must get the same realistic panel-attach window as
                // the initial pipeline audit; otherwise repair looks blind
                // even when the Browser panel is still mounting.
                watching = await waitForPanelWatcher(watchSessionId, 15_000);
            term(watching
                ? 'repair: the Browser panel is attached — you can watch this'
                : 'repair: no Browser panel attached — visual QA is blocked until the Browser panel is open');
        } catch { /* the hub is optional */ }

        say(isAr ? '🔎 أعيد القياس على البناء الحالي…' : '🔎 Re-measuring the current build…');
        const before = await auditBuiltApp(auditDir, {
            timeoutMs: 30_000, watchSessionId: watchSessionId || undefined,
                requireVisibleBrowser: true,
                requireAuthenticatedCoverage: true,
                ...(serveUrl ? { serveUrl } : {}),
                ...(runtimeAuth ? { credentials: runtimeAuth } : {}),
                artifactRootDir,
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

        const { findingText } = require('../../../core/quality/app-audit');
        if (before.findings.length) {
            const visible = before.findings.slice(0, 3).map((f: any) => `• ${findingText(f, isAr)}`).join('\n');
            say(isAr
                ? `وجد فحص المتصفح ${before.findings.length} مشكلة أو فجوة تغطية:\n${visible}\nأحدد ملفاتها، أصلحها، ثم أعيد الاختبار نفسه.`
                : `Browser QA found ${before.findings.length} defect or coverage gap:\n${visible}\nI am mapping each one to its source, repairing it, then rerunning the same test.`);
            for (const finding of before.findings) {
                term(`repair finding ${finding.id}: ${findingText(finding, false)}`);
                if (Array.isArray(finding.evidence) && finding.evidence.length) {
                    term(`repair evidence ${finding.id}: ${JSON.stringify(finding.evidence.slice(0, 8)).slice(0, 1400)}`);
                }
            }
        }

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
            if (rb.ok === true && packagedDir && fs.existsSync(auditDir)) {
                const target = path.join(packagedDir, 'public');
                fs.rmSync(target, { recursive: true, force: true });
                fs.cpSync(auditDir, target, { recursive: true });
                term('repair: copied the rebuilt interface into its live API before re-measuring');
            }
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
                watchSessionId: watchSessionId || undefined,
                requireVisibleBrowser: true,
                requireAuthenticatedCoverage: true,
                ...(serveUrl ? { serveUrl } : {}),
                ...(runtimeAuth ? { credentials: runtimeAuth } : {}),
                artifactRootDir,
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
        const said = (f: any) => findingText(f, isAr);
        const lines: string[] = [];
        lines.push(isAr
            ? `🔁 دورة التحسين المقيسة: ${before.score}/100 → ${finalMeasurement.score}/100 عبر ${loop.rounds.length} جولة، وتوقفت لأن: ${loop.stoppedBecause}.`
            : `🔁 Measured improvement loop: ${before.score}/100 → ${finalMeasurement.score}/100 across ${loop.rounds.length} round(s), stopped because: ${loop.stoppedBecause}.`);
        if (paidFiles.length) {
            lines.push(isAr
                ? `عُدّلت ${paidFiles.length} ملفات مرتبطة بالمشكلة؛ أسماؤها وتغييراتها في Logs.`
                : `Edited ${paidFiles.length} files tied to the finding; names and changes are in Logs.`);
        }
        lines.push(improveSummary(loop, isAr));
        if (remaining.length) {
            lines.push(isAr
                ? `⛔ لم أقبل الإصلاح — بقيت ${remaining.length} مشكلة أو فجوة تغطية:`
                : `⛔ Repair not accepted — ${remaining.length} defect or coverage gap remains:`);
            for (const f of remaining) lines.push(`   • ${said(f)}`);
            lines.push(isAr
                ? '   ↳ لم أنتقل للخطوة التالية، والأدلة الكاملة محفوظة في Logs.'
                : '   ↳ I did not move to the next phase; the complete evidence remains in Logs.');
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
            ok: remaining.length === 0,
            ...(remaining.length ? {
                error: `quality_findings_survived: ${remaining.slice(0, 5).map((f: any) => String(f.id || 'unnamed')).join(', ')}`,
            } : {}),
            output: {
                message: lines.join('\n'),
                before: before.score,
                after: finalMeasurement.score,
                changed: paidFiles,
                rounds: loop.rounds,
                stoppedBecause: loop.stoppedBecause,
                remaining: remaining.map((f: any) => f.id),
                blockersBefore: blockersBefore.map((f: any) => f.id),
                verificationFailed: remaining.length > 0,
            },
            logs,
        } as any;
    }

    private async urlAnswers(url: string): Promise<boolean> {
        try {
            const response = await fetch(String(url).replace(/\/+$/, '') + '/', { redirect: 'follow' });
            return response.status === 200;
        } catch { return false; }
    }
}
