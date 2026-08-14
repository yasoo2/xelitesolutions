import path from 'path';
import { ToolDefinition, ToolPermission } from '../types';
import { executeTool } from '../../services/ToolService';
import { isArabicReply, say as pick } from '../../../shared/reply-language';

/**
 * ProjectPipelineTool — the production bridge to the canonical pipeline.
 *
 * The audit that created this file found the AGENTS.md chain — Plan →
 * PhaseExecutor → QualityGate → RepairTicket → SelfFix → Rerun — fully built,
 * tested by six manual verification harnesses… and called by NOTHING in
 * production. A user asking for a complete multi-file project got either a
 * single HTML page (build fast-path) or an unverified pile of write_file
 * steps from the generic DAG. Files that were never executed are not a
 * delivered project; they are a hope.
 *
 * This tool IS the missing call: plan the project (planner-only tool), then
 * hand the phases to AgentLoopService.runPlannedPhasesIfPresent, which
 * executes each phase with verification tasks, auto build checks after code
 * phases, and the repair-ticket/self-fix loop when a phase fails.
 */

/**
 * THE PLAN A DEAD MESH CAN STILL PRODUCE.
 *
 * Nothing here matches a product name or a business domain — it reads the
 * two things the request states out loud: what is being built (scope) and
 * which entities it names. A page needs no server; a system with its own
 * rows does, and its interface depends on it. Those are engineering
 * relations, not a stored template, and they hold for a plant nursery, a
 * freight company and a domain nobody has thought of yet.
 *
 * Exported so the gate that guards it can measure it directly.
 */
export function deterministicPhasesFor(request: string): {
    projectName: string; reason: string; phases: Array<{ name: string; tasks: any[] }>;
} | null {
    const { PlanningEngine } = require('../../../core/orchestrator/PlanningEngine');
    if (!PlanningEngine.looksLikeBuild(request)) return null;
    const scope: 'page' | 'app' | 'system' = PlanningEngine.classifyBuildScope(request);

    let projectName = 'project';
    try { projectName = require('../../../core/design/subject-phrase').subjectPhrase(request, 48) || 'project'; } catch { /* naming is cosmetic */ }

    if (scope === 'system') {
        // The interface depends on the service that holds the rows — declared
        // as an ordered pair of phases, so the dependency is enforced by the
        // plan rather than left to whoever executes it.
        return {
            projectName,
            reason: 'declared entities require their own data service, and the interface depends on it',
            phases: [
                { name: 'Data service and schema', tasks: [{ tool: 'api_project', description: `Backend and database for: ${request}`, args: { request } }] },
                { name: 'Interface on the service', tasks: [{ tool: 'react_project', description: `Interface for: ${request}`, args: { request } }] },
            ],
        };
    }
    return {
        projectName,
        reason: scope === 'page' ? 'a single page was asked for; no data service is implied' : 'an application was asked for with no declared data service',
        phases: [{
            name: scope === 'page' ? 'Page' : 'Application',
            tasks: [{ tool: scope === 'page' ? 'web_page_builder' : 'react_project', description: request, args: { request } }],
        }],
    };
}

export class ProjectPipelineTool implements ToolDefinition {
    name = 'project_pipeline';
    version = '1.0.0';
    description = 'Build a complete multi-file project through the canonical engineering pipeline: plan phases, execute each with verification and auto build checks, self-heal failures, and report honestly.';
    tags = ['execution', 'project', 'pipeline', 'builder', 'quality'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            request: { type: 'string' as const, description: 'The full project request, in the user\'s own words' },
            // The blocking message below tells the caller to select a project
            // root. It has to arrive somewhere: discovery accepts `path`, and
            // before this the pipeline never forwarded it, so the remedy it
            // printed was an instruction with no wire behind it.
            path: { type: 'string' as const, description: 'Workspace-relative project root to operate on. Answers a select_project_root decision.' },
        },
        required: ['request'],
    };

    outputSchema = {
        type: 'object' as const,
        properties: {
            projectName: { type: 'string' as const },
            completedPhases: { type: 'number' as const },
            totalPhases: { type: 'number' as const },
            verified: { type: 'boolean' as const },
            summary: { type: 'string' as const },
            report: { type: 'object' as const },
        },
    };

    permissions: ToolPermission[] = ['execute'];
    sideEffects: ToolPermission[] = ['execute'];

    rateLimitPerMinute = 3;
    auditFields = ['request'];
    mockSupported = false;

    async execute(input: { request: string; path?: string }, context?: any) {
        const logs: string[] = [];
        const request = String(input?.request || '').trim();
        if (!request) return { ok: false, error: 'request is required', logs };

        const say = (m: string) => { logs.push(m); context?.onProgress?.(m); };

        /**
         * ONE RUN, ONE LANGUAGE — AND THE PIPELINE WAS STILL DEAF TO IT.
         *
         * His English prompt, with Joe switched to English, produced a trace
         * in two languages at once:
         *
         *     [pipeline] plan ready: Build a complete system … — 3 phases
         *     ⚙️ المرحلة 1/3 — Backend & database
         *     ✅ اكتملت المرحلة 1/3 وتحقَّقت
         *     ▶️ أُشغّل النظام لتراه حيّاً…
         *
         * The rule lives in one file now; this tool simply never asked it.
         * Worse, the delivery report below defaulted to `'ar'` when the
         * interface said nothing, so silence meant Arabic — which is a guess
         * about the reader, not a fact. The request's own script is the fact.
         */
        const isAr = isArabicReply({ language: context?.language, text: request });

        // Discovery is mandatory before any engineering write. Product names and
        // business nouns are evidence only; they never select a named foundation.
        say(pick(isAr,
            '[pipeline] أستكشف مساحة العمل والمشروع والاختبارات قبل اختيار أي تنفيذ…',
            '[pipeline] Discovering the workspace, project, and declared checks before selecting implementation…'));
        const projectPath = String(input?.path || '').trim();
        const discoveryResult = await executeTool('engineering_discovery',
            projectPath ? { request, path: projectPath } : { request }, context);
        if (!discoveryResult?.ok || !discoveryResult?.output?.evidence) {
            const message = discoveryResult?.error || 'Engineering discovery did not return usable evidence.';
            return {
                ok: false,
                error: message,
                output: {
                    projectName: 'engineering-task', completedPhases: 0, totalPhases: 0, verified: false,
                    executionStatus: 'blocked', verificationStatus: 'not_run', deliveryStatus: 'blocked',
                    // The canonical pipeline evaluated this request and ended it;
                    // the outer orchestrator must surface this evidence, not invent
                    // a second generic repair plan from the error text.
                    pipelineFinal: true,
                    summary: pick(isAr, `## ⚠️ توقف قبل الكتابة\n\nتعذر جمع أدلة مساحة العمل: ${message}`, `## ⚠️ Stopped before writing\n\nWorkspace evidence could not be collected: ${message}`),
                },
                logs: [...logs, ...(discoveryResult?.logs || [])],
            };
        }
        const evidence = discoveryResult.output.evidence;
        logs.push(...(discoveryResult.logs || []));
        if (evidence.mode === 'remote_repository' || evidence.mode === 'ambiguous' || (Array.isArray(evidence.blockers) && evidence.blockers.length > 0)) {
            const details = (evidence.blockers || []).map((blocker: any) => `- ${blocker.message}${blocker.remedy ? ` (${blocker.remedy})` : ''}`).join('\n') || 'Select the project root and retry discovery.';
            const summary = pick(isAr,
                `## ⚠️ توقف قبل الكتابة لأن الدليل غير مكتمل\n\n${details}\n\nلم يُنشئ Joe قالباً بديلاً ولم يعدّل أي ملف.`,
                `## ⚠️ Stopped before writing because evidence is incomplete\n\n${details}\n\nJoe did not create a substitute template or modify files.`);
            say('[pipeline] evidence is incomplete — blocking writes honestly');
            return {
                ok: false,
                error: summary,
                output: {
                    projectName: 'engineering-task', completedPhases: 0, totalPhases: 0, verified: false,
                    executionStatus: 'not_started', verificationStatus: 'not_run', deliveryStatus: 'blocked',
                    // A discovery blocker is a product decision boundary, not an
                    // execution fault. The orchestrator must surface it to the user
                    // rather than inventing repair work or guessing a project root.
                    requiresUserDecision: true,
                    pipelineFinal: true,
                    stopReason: 'evidence_incomplete',
                    decision: {
                        kind: 'select_project_root',
                        blockers: evidence.blockers || [],
                        // Name the input that carries the answer back, so the
                        // caller can act on this instead of re-reading it.
                        answerWith: { tool: 'project_pipeline', field: 'path' },
                        candidates: (evidence.facts || [])
                            .filter((fact: any) => fact.id === 'workspace.multiple_projects')
                            .map((fact: any) => fact.statement),
                    },
                    evidence, summary,
                },
                logs,
            };
        }
        const specification = await this.readRequestedSpecifications(request, evidence, context, logs, say, isAr);
        if (specification.error) {
            const summary = pick(isAr,
                `## ⚠️ توقف قبل التخطيط\n\n${specification.error}\n\nلم يُخمّن Joe محتوى مواصفة أو أمر اختبار من دون مصدر مقروء.`,
                `## ⚠️ Stopped before planning\n\n${specification.error}\n\nJoe did not guess a specification or test command without a source it had read.`);
            return {
                ok: false,
                error: summary,
                output: {
                    projectName: 'engineering-task', completedPhases: 0, totalPhases: 0, verified: false,
                    executionStatus: 'not_started', verificationStatus: 'not_run', deliveryStatus: 'blocked',
                    pipelineFinal: true, honestBlocker: true, evidence, summary,
                },
                logs,
            };
        }
        // The specification is always read in full before planning, but a very
        // large document must not be copied wholesale into a single provider call.
        // That turns a documented local requirement into a timeout and makes the
        // planner less reliable, not more informed. The deterministic brief below
        // preserves scope, headings, and binding constraints with its source files;
        // the complete text remains recorded as read evidence and is carried as
        // bounded context to file-generation tasks after a plan is accepted.
        const requirementsContext = this.buildRequirementsContext(request, specification.content);
        const planningRequest = specification.content
            ? `${request}\n\n--- COMPACT REQUIREMENTS EVIDENCE (derived from complete local files read through read_file; do not invent beyond it) ---\n${requirementsContext}\n--- END COMPACT REQUIREMENTS EVIDENCE ---`
            : request;
        if (requirementsContext) logs.push(`pipeline.planning_requirements_brief_chars=${requirementsContext.length}`);
        const plannerEvidence = specification.sources.length
            ? { ...evidence, specificationSources: specification.sources }
            : evidence;

        say(pick(isAr,
            `[pipeline] دليل جاهز: ${evidence.mode}${evidence.selectedProject ? ` — ${evidence.selectedProject.root}` : ''}`,
            `[pipeline] Evidence ready: ${evidence.mode}${evidence.selectedProject ? ` — ${evidence.selectedProject.root}` : ''}`));

        // 1 — Plan from the evidence. A valid plan may choose a framework or a
        // foundation only when it records a reason grounded in requirements or
        // inspected workspace facts; no deterministic request classifier owns it.
        say('[pipeline] planning evidence-backed engineering phases…');
        let plannerResult: any = await executeTool('project_planner', { projectDescription: planningRequest, evidence: plannerEvidence }, context);
        if (!plannerResult?.ok || plannerResult?.output?.fallback) {
            const blocker = plannerResult?.output?.blocker?.message || plannerResult?.error || 'The planner did not produce a valid evidence-backed plan.';

            /**
             * A RESCUE THAT RE-CALLS THE THING THAT JUST FAILED IS NOT A RESCUE.
             *
             * When every provider is down, the planner returns nothing — and
             * the rescue plan upstream routes here, into a tool whose first
             * real step is that same planner. Measured on a clean workspace
             * with every provider unreachable: 0/0 phases, zero files, «توقف
             * التخطيط بصدق». The circle closed on the exact case the rescue
             * exists for.
             *
             * The answer is NOT a product-name template. It is to plan from
             * what the REQUEST ITSELF declares — the same shape path the rest
             * of this system uses: the entities he listed become the data
             * model, the scope decides whether that needs a server, and the
             * deterministic builders do work that never needed a model. If
             * the request declares too little to plan from, this falls through
             * and stops honestly, exactly as before.
             */
            const deterministic = evidence?.constraints?.createsNewProject
                ? deterministicPhasesFor(request)
                : null;
            if (deterministic) {
                say(pick(isAr,
                    `[pipeline] لا مخطِّط متاح — أخطّط حتمياً مما صرّح به الطلب: ${deterministic.reason}`,
                    `[pipeline] no planner available — planning deterministically from what the request declares: ${deterministic.reason}`));
                plannerResult = {
                    ok: true,
                    output: { projectName: deterministic.projectName, phases: deterministic.phases, deterministic: true, plannedWithoutModel: true },
                    logs: plannerResult?.logs || [],
                };
            } else {
            const summary = pick(isAr,
                `## ⚠️ توقف التخطيط بصدق\n\n${blocker}\n\nلم يُنشئ Joe مشروعاً أو قالباً كتعويض عن خطة مفقودة.`,
                `## ⚠️ Planning stopped honestly\n\n${blocker}\n\nJoe did not create a project or template as a substitute for a missing plan.`);
            return {
                ok: false,
                error: summary,
                output: {
                    projectName: plannerResult?.output?.projectName || 'engineering-task', completedPhases: 0, totalPhases: 0, verified: false,
                    executionStatus: 'not_started', verificationStatus: 'not_run', deliveryStatus: 'blocked',
                    pipelineFinal: true,
                    evidence, summary,
                },
                logs: [...logs, ...(plannerResult?.logs || [])],
            };
            }
        }
        /**
         * A PLAN OF ZERO PHASES IS A MISSING PLAN WEARING ok:true.
         *
         * The rescue above fires when the planner FAILS. A planner that
         * answers successfully with an empty `phases` array walked straight
         * past it into this exit — same outcome for the user, nothing built,
         * and the deterministic plan that could have run sitting one branch
         * away. Both are the same fact: no plan arrived.
         */
        if ((!Array.isArray(plannerResult?.output?.phases) || plannerResult.output.phases.length === 0)
            && evidence?.constraints?.createsNewProject) {
            const rescue = deterministicPhasesFor(request);
            if (rescue) {
                say(pick(isAr,
                    `[pipeline] الخطة عادت فارغة — أخطّط حتمياً مما صرّح به الطلب: ${rescue.reason}`,
                    `[pipeline] the plan came back empty — planning deterministically from what the request declares: ${rescue.reason}`));
                plannerResult = {
                    ok: true,
                    output: { projectName: rescue.projectName, phases: rescue.phases, deterministic: true, plannedWithoutModel: true },
                    logs: plannerResult?.logs || [],
                };
            }
        }

        const phases = plannerResult?.output?.phases;
        if (!Array.isArray(phases) || phases.length === 0) {
            return {
                ok: false,
                error: plannerResult?.error || 'planner returned no phases',
                output: {
                    pipelineFinal: true,
                    executionStatus: 'not_started',
                    verificationStatus: 'not_run',
                    deliveryStatus: 'blocked',
                },
                logs,
            };
        }
        // Each file-generation task runs later with only a short task description.
        // Carry the same bounded evidence brief that grounded the accepted plan so
        // workers cannot substitute a familiar template for a documented artifact.
        plannerResult.output.requirementsContext = requirementsContext;
        say(`[pipeline] evidence-backed plan ready: ${plannerResult.output.projectName || 'project'} — ${phases.length} phases`);

        // 2 — Execute through the canonical pipeline (verification tasks, auto
        // build checks, repair tickets, one self-fix attempt, honest stop).
        // Lazy require: ToolService -> definitions -> AgentLoopService -> ToolService
        // is a cycle if imported at module load.
        const { AgentLoopService } = require('../../services/AgentLoopService');
        const pipeline = await AgentLoopService.runPlannedPhasesIfPresent({
            sessionId: context?.sessionId || `pipeline-${Date.now()}`,
            runId: context?.runId || `run-${Date.now()}`,
            userId: context?.userId || 'anonymous',
            workspaceId: context?.workspaceId || context?.sessionId || 'default',
            plannerResult,
            modelConfig: context?.modelConfig,
            // The phase announcements are the loudest lines in the trace, and
            // they were the ones speaking the wrong language.
            language: isAr ? 'ar' : 'en',
            // The live voice: phase-by-phase progress reaches the same panel
            // stream the orchestrator wired into this tool's context.
            onProgress: (m: string) => say(m),
        });

        // 3 — Report with the numbers as they are. A partial delivery announced
        // as partial is engineering; announced as done, it is a lie.
        //
        // This summary IS what lands in the chat: extractAnswer picks the
        // `summary` field of the final node's output. Before this report
        // existed, a completed multi-phase build surfaced as ONE terse line
        // and the whole story (phases, files, how to run) was discarded.
        const total = Number(plannerResult.output.totalPhases || phases.length);
        const done = Number(pipeline?.completedPhases || 0);
        const verified = pipeline?.ok === true;
        // `ok` is retained as the compatibility success signal, but the report
        // must not force a reader to infer whether code ran, verification ran,
        // or a deliverable is usable. These are separate engineering facts.
        const executionStatus = verified ? 'completed' : done > 0 ? 'partial' : 'failed';
        const verificationStatus = verified ? 'passed' : String(pipeline?.verificationStatus || 'failed');
        const deliveryStatus = verified ? 'delivered' : done > 0 ? 'partial' : 'blocked';
        // A pipeline-level failure can already be a final, evidence-backed
        // verdict from phase execution. Carry the machine-readable marker out
        // to AgentOrchestrator so it cannot reopen a generative recovery loop.
        const verificationFailed = Array.isArray(pipeline?.results)
            && pipeline.results.some((result: any) => result?.verificationFailed === true);
        const honestBlocker = pipeline?.honestBlocker === true || verificationFailed;

        // 3 — The last mile: a VERIFIED system is RUN, not left inert on disk.
        // No button — the pipeline starts it and the live preview opens itself.
        // Best-effort: a run failure never turns a good build into a failure;
        // it just means the user starts it manually.
        let liveUrl = '';
        if (verified) {
            try {
                say(pick(isAr, '▶️ أُشغّل النظام لتراه حيّاً…', '▶️ Starting the system so you can see it live…'));
                // …and it speaks the run's language, not the interface default.
                const runRes = await executeTool('project_run', {}, { ...context, language: isAr ? 'ar' : 'en' });
                if (runRes?.ok && runRes.output?.url) liveUrl = String(runRes.output.url);
            } catch (e: any) {
                say(pick(isAr,
                    `ℹ️ اكتمل البناء، لكن التشغيل التلقائي تعثّر: ${e?.message || e}`,
                    `ℹ️ The build finished, but starting it automatically failed: ${e?.message || e}`));
            }
        }

        const summary = this.buildDeliveryReport({
            language: isAr ? 'ar' : 'en',
            projectName: String(plannerResult.output.projectName || 'project'),
            phases, pipeline, done, total, verified, liveUrl,
        });
        say(`[pipeline] ${verified ? `✅ ${done}/${total}` : `⚠️ ${done}/${total}`} — delivery report ready`);

        return {
            ok: verified,
            error: verified ? undefined : summary,
            output: {
                projectName: plannerResult.output.projectName,
                completedPhases: done,
                totalPhases: total,
                verified,
                executionStatus,
                verificationStatus,
                deliveryStatus,
                ...(verificationFailed ? { verificationFailed: true } : {}),
                ...(honestBlocker ? { honestBlocker: true } : {}),
                // `project_pipeline` already performed discovery, planning,
                // verification, and its bounded self-healing attempt. A false
                // result is therefore final evidence, not an invitation for the
                // outer generic recovery planner to guess a different project type.
                pipelineFinal: true,
                summary,
                liveUrl: liveUrl || undefined,
                report: pipeline?.engineeringReport,
                reportMarkdown: pipeline?.engineeringReportMarkdown,
                results: pipeline?.results,
                repairTicket: pipeline?.repairTicket,
            },
            logs,
        };
    }

    /**
     * The delivery report the user actually reads in the chat — markdown, in
     * the run's language, built ONLY from what provably happened: the phases
     * that ran, the files the plan wrote, and a run hint only when an entry
     * file is really there to run. No invented claims.
     */
    /**
     * A request to read a local specification is a binding source requirement,
     * not a suggestion for the language model.  We first identify only files
     * that discovery has actually observed, then read every page through Joe's
     * own read_file tool.  The planner receives the complete text or nothing.
     */
    private async readRequestedSpecifications(request: string, evidence: any, context: any, logs: string[], say: (message: string) => void, isAr: boolean): Promise<{ content: string; sources: Array<{ path: string; lineCount: number }>; error?: string }> {
        const asksToRead = /(?:اقرأ|قراءة|read|inspect|review)\s*(?:ال|a|the)?\s*(?:مواصف|spec(?:ification)?|requirements?|brief|document|ملف|file)|(?:مواصف|spec(?:ification)?|requirements?|brief)\s+(?:المحلي|local|المرفق|attached)/i.test(request);
        const asksToExecute = /(?:نف[ّذذ]|ابن|طو[ّو]ر|طبق|execute|implement|build|develop|create|run)/i.test(request);
        if (!asksToRead || !asksToExecute) return { content: '', sources: [] };

        const files = Array.isArray(evidence?.instructionFiles) ? evidence.instructionFiles : [];
        const named = files.filter((file: any) => /(?:spec|require|brief|مواصف|متطلبات)/i.test(String(file?.relativePath || '')));
        const selected = named.length ? named : files.length === 1 ? files : [];
        if (!selected.length) {
            return {
                content: '',
                sources: [],
                error: pick(isAr,
                    'طلبتَ قراءة مواصفة محلية قبل التنفيذ، لكن الاستكشاف لم يثبت ملف مواصفة واحداً يمكن قراءته بأمان. حدّد اسم الملف أو ضعه في مساحة العمل ثم أعد الطلب.',
                    'You asked Joe to read a local specification before execution, but discovery did not establish one safe specification file. Name the file or place it in the workspace, then retry.'),
            };
        }

        const sections: string[] = [];
        const sources: Array<{ path: string; lineCount: number }> = [];
        const workspaceRoot = String(evidence?.workspaceRoot || evidence?.selectedProject?.root || '').trim();
        for (const file of selected) {
            const suppliedPath = String(file?.relativePath || '').trim();
            const expectedLines = Number(file?.lineCount || 0);
            if (!suppliedPath || !Number.isFinite(expectedLines) || expectedLines < 1) continue;
            const relativePath = this.safeWorkspaceRelativePath(suppliedPath, workspaceRoot);
            if (!relativePath) {
                return {
                    content: '', sources: [],
                    error: pick(isAr,
                        `رفض Joe مسار المواصفة «${suppliedPath}» لأنه ليس مساراً نسبياً آمناً داخل مساحة العمل المكتشفة.`,
                        `Joe refused specification path “${suppliedPath}” because it is not a safe workspace-relative path.`),
                };
            }
            say(pick(isAr, `[pipeline] أقرأ المواصفة كاملة: ${relativePath}`, `[pipeline] Reading complete local specification: ${relativePath}`));
            const chunks: string[] = [];
            for (let startLine = 1; startLine <= expectedLines; startLine += 1000) {
                const readResult = await executeTool('read_file', {
                    path: relativePath,
                    startLine,
                    endLine: Math.min(startLine + 999, expectedLines),
                }, context);
                if (!readResult?.ok || typeof readResult?.output?.content !== 'string') {
                    return {
                        content: '', sources: [],
                        error: pick(isAr,
                            `تعذّر قراءة المواصفة المثبتة «${relativePath}» كاملة: ${readResult?.error || 'لم تُرجع أداة القراءة محتوى صالحاً'}.`,
                            `Joe could not fully read the established specification “${relativePath}”: ${readResult?.error || 'the read tool returned no valid content'}.`),
                    };
                }
                chunks.push(readResult.output.content);
                logs.push(...(readResult.logs || []));
            }
            const content = chunks.join('\n');
            sections.push(`SOURCE: ${relativePath}\n${content}`);
            sources.push({ path: relativePath, lineCount: expectedLines });
            logs.push(`pipeline.specification_read=${relativePath} lines=1-${expectedLines}`);
        }
        if (!sources.length) {
            return { content: '', sources: [], error: pick(isAr, 'لم تتوفر مواصفة مقروءة كاملة للتخطيط الآمن.', 'No complete specification was available for safe planning.') };
        }
        return { content: sections.join('\n\n'), sources };
    }

    /**
     * Compatibility boundary for persisted discovery evidence created before
     * instruction files became relative-only. A matching absolute path is
     * converted to a portable relative path; every escape is rejected.
     */
    private safeWorkspaceRelativePath(suppliedPath: string, workspaceRoot: string): string {
        const raw = String(suppliedPath || '').trim().replace(/\\/g, '/');
        if (!raw) return '';
        const normalisedRoot = String(workspaceRoot || '').trim();
        let relativePath = raw;
        if (path.isAbsolute(raw)) {
            if (!normalisedRoot) return '';
            relativePath = path.relative(normalisedRoot, raw).replace(/\\/g, '/');
        }
        relativePath = relativePath.replace(/^\.\//, '');
        if (!relativePath || relativePath.startsWith('/') || /^[a-zA-Z]:\//.test(relativePath)) return '';
        if (relativePath.split('/').some(segment => segment === '..')) return '';
        return relativePath;
    }

    /**
     * Produce a portable, bounded evidence brief for downstream workers.  The
     * complete specification is read and preserved as execution evidence; the
     * planner and individual workers receive this portable brief, which preserves
     * the request, opening scope, headings, and binding constraints without
     * sending an unbounded document to a single model request.
     */
    private buildRequirementsContext(request: string, specification: string): string {
        const source = String(specification || request || '').replace(/\r\n?/g, '\n').trim();
        if (!source) return '';
        const lines = source.split('\n');
        const chosen: string[] = [];
        const add = (line: string) => {
            const value = String(line || '').trim();
            if (value && !chosen.includes(value)) chosen.push(value);
        };

        // Preserve the introductory scope verbatim, then retain every section
        // marker, its immediate local intent, and binding constraints. This is a
        // deterministic compression of inspected evidence, not a product-specific
        // template and not an LLM summary that could omit an inconvenient rule.
        lines.slice(0, 60).forEach(add);
        for (let index = 0; index < lines.length; index += 1) {
            const value = lines[index].trim();
            if (!value) continue;
            const isHeading = /^(?:#{1,6}\s+|\d+(?:\.\d+)*[.)]\s+|[A-Z][A-Z0-9 &/_-]{5,})/.test(value);
            const isBinding = /\b(must|must not|never|required|approval|audit|security|tenant|lifecycle|rollback|health|metrics|traces|acceptance|deliverable)\b/i.test(value);
            if (isHeading) {
                add(value);
                // Preserve nearby explanation and acceptance notes, not just an
                // orphan heading, while keeping the request bounded.
                let captured = 0;
                for (let next = index + 1; next < lines.length && captured < 4; next += 1) {
                    const local = lines[next].trim();
                    if (!local) continue;
                    if (/^(?:#{1,6}\s+|\d+(?:\.\d+)*[.)]\s+)/.test(local)) break;
                    add(local);
                    captured += 1;
                }
            }
            if (isBinding) add(value);
            if (chosen.join('\n').length >= 12000) break;
        }
        const brief = chosen.join('\n').slice(0, 12000);
        return `AUTHORITATIVE REQUIREMENTS EVIDENCE (derived from the complete local specification; do not invent beyond it):\n${brief}`;
    }

    private buildDeliveryReport(args: {
        language: 'ar' | 'en';
        projectName: string;
        phases: any[];
        pipeline: any;
        done: number;
        total: number;
        verified: boolean;
        liveUrl?: string;
    }): string {
        const { language: lang, projectName, phases, pipeline, done, total, verified, liveUrl } = args;
        const ar = lang === 'ar';
        const lines: string[] = [];

        lines.push(verified
            ? (ar ? `## ✅ اكتمل المشروع: ${projectName}` : `## ✅ Project delivered: ${projectName}`)
            : (ar ? `## ⚠️ توقف البناء بصدق: ${projectName}` : `## ⚠️ Build stopped honestly: ${projectName}`));

        // The live system, front and center — it is RUNNING, not just built.
        if (verified && liveUrl) {
            lines.push('');
            lines.push(ar
                ? `### 🟢 نظامك يعمل الآن\nالمعاينة الحية مفتوحة على: **${liveUrl}**\nيمكنك استخدامه الآن. لإيقافه قل: «أوقف المشروع».`
                : `### 🟢 Your system is live\nOpen at: **${liveUrl}**\nUse it now. To stop it, say: "stop the project".`);
        }
        lines.push(ar
            ? `**المراحل:** ${done}/${total} نُفِّذت وتحقَّقت (تنفيذ فعلي + فحوص، لا مجرد كتابة ملفات).`
            : `**Phases:** ${done}/${total} executed and verified (real execution + checks, not just written files).`);

        // Phase-by-phase, from the pipeline's own results.
        const phaseResults: any[] = Array.isArray(pipeline?.results) ? pipeline.results : [];
        if (phaseResults.length) {
            lines.push('');
            lines.push(ar ? '### المراحل' : '### Phases');
            for (const p of phaseResults) {
                const okMark = p?.status === 'completed' ? '✅' : '❌';
                const name = String(p?.phaseName || `Phase ${p?.phaseNumber ?? '?'}`);
                const tasks = `${p?.completedTasks ?? '?'}/${p?.totalTasks ?? '?'}`;
                const healed = p?.selfFixExecution?.ok ? (ar ? ' — أُصلحت ذاتياً 🔧' : ' — self-healed 🔧') : '';
                lines.push(`- ${okMark} ${name} (${ar ? 'مهام' : 'tasks'}: ${tasks})${healed}`);
            }
        }

        /**
         * AND WHAT THE BUILDERS THEMSELVES SAID — INCLUDING WHAT THEY DID NOT
         * BUILD.
         *
         * His prompt ended: «At the end, show me plainly what you actually
         * built and what you did not». He got three phase names.
         *
         * The answer existed the whole time. `react_project` writes it: the
         * abilities the application really has, the two QA scores with every
         * finding named, the owner account — and an explicit «⚠️ You also
         * asked for things this step did NOT build» listing the live
         * streaming, the video calls, the AI diagnosis from photos and the
         * automatic vaccination recommendations. That message reached the
         * phase executor and was dropped there, and this report had nothing
         * to carry.
         *
         * A report that summarises phases instead of relaying what was
         * measured is a table of contents for a book nobody printed.
         */
        const spoken: string[] = [];
        for (const p of phaseResults) {
            for (const t of (Array.isArray(p?.results) ? p.results : [])) {
                const msg = String(t?.message || '').trim();
                if (msg && !spoken.includes(msg)) spoken.push(msg);
            }
        }
        if (spoken.length) {
            lines.push('');
            lines.push(ar ? '### ما بُني بالضبط — بكلام المحرّكات نفسها' : '### Exactly what was built — in the engines\' own words');
            for (const m of spoken) { lines.push(''); lines.push(m); }
        }

        // Files the PLAN wrote — the paths are in the plan itself, so this list
        // is exact, not guessed.
        const writeTools = new Set(['write_file', 'ai_write_file', 'file_write', 'create_file', 'write_to_file']);
        const files: string[] = [];
        for (const ph of phases) {
            for (const t of (Array.isArray(ph?.tasks) ? ph.tasks : [])) {
                if (!writeTools.has(String(t?.tool || ''))) continue;
                const p = String(t?.args?.path || t?.args?.filename || t?.input?.path || t?.input?.filename || '').trim();
                if (p && !files.includes(p)) files.push(p);
            }
        }
        if (files.length) {
            lines.push('');
            lines.push(ar ? '### الملفات' : '### Files');
            for (const f of files.slice(0, 15)) lines.push(`- \`${f}\``);
            if (files.length > 15) lines.push(ar ? `- … و${files.length - 15} ملفات أخرى` : `- … and ${files.length - 15} more`);
        }

        // A run hint ONLY when the plan really wrote an entry file.
        const entry = files.find(f => /(^|\/)(index|main|app|server)\.(js|mjs|cjs|ts)$/i.test(f));
        const wrotePackageJson = files.some(f => /(^|\/)package\.json$/i.test(f));
        if (verified && (entry || wrotePackageJson)) {
            lines.push('');
            lines.push(ar ? '### التشغيل' : '### Run it');
            if (wrotePackageJson) lines.push(ar ? '```\nnpm install\nnpm start\n```' : '```\nnpm install\nnpm start\n```');
            else if (entry) lines.push(`\`\`\`\nnode ${entry}\n\`\`\``);
        }

        // On failure: name the failed phase and the real error head, plus what
        // the self-fix tried — the user deserves the diagnosis, not a shrug.
        if (!verified) {
            const failedPhase = phaseResults.find(p => p?.status !== 'completed');
            const ticket = pipeline?.repairTicket;
            lines.push('');
            lines.push(ar ? '### ماذا حدث' : '### What happened');
            if (failedPhase) {
                lines.push(ar
                    ? `- المرحلة المتعثرة: **${failedPhase.phaseName || failedPhase.phaseNumber}**`
                    : `- Failed phase: **${failedPhase.phaseName || failedPhase.phaseNumber}**`);
            }
            if (ticket?.primaryError) {
                lines.push((ar ? '- الخطأ: ' : '- Error: ') + '`' + String(ticket.primaryError).slice(0, 220) + '`');
            }
            const sfReason = pipeline?.selfFixExecution?.reason || pipeline?.selfFixPlan?.reason;
            if (sfReason) {
                lines.push((ar ? '- محاولة الإصلاح الذاتي: ' : '- Self-fix attempt: ') + String(sfReason).slice(0, 220));
            }
            lines.push(ar
                ? `- ما اكتمل قبل التوقف (${done}/${total}) سليمٌ ومتحقَّق منه.`
                : `- Everything completed before the stop (${done}/${total}) is verified and intact.`);
        }

        return lines.join('\n').slice(0, 3500);
    }
}
