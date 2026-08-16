import { ToolDefinition, ToolPermission } from '../types';

import path from 'path';
import { callLLM } from '../../../core/llm';
import { isProviderFailure, retryAfterMsFrom } from '../../../core/llm/intelligent-router';
import { plannerToolPrompt, sanitisePlanPhases } from '../../../core/orchestrator/plan-tools';
import { EngineeringEvidence } from './EngineeringDiscoveryTool';
import { BOUNDED_REPAIR_CONSTITUTION, ENGINEERING_CONSTITUTION } from '../../../core/orchestrator/engineering-policy';

/**
 * ProjectPlannerTool - creates an execution plan only.
 *
 * This tool must never execute generated tasks. Controlled execution belongs to
 * the orchestrator / phase executor layer, where userId, workspaceId,
 * approvals, and quality gates can be enforced consistently.
 */
export class ProjectPlannerTool implements ToolDefinition {
    name = 'project_planner';
    version = '1.1.0';
    description = 'Break down complex projects into phases and tasks for systematic execution. Planner-only; does not execute tasks.';
    tags = ['planning', 'project', 'llm'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            projectDescription: { type: 'string' as const, description: 'Description of the project to plan' },
            analysis: { type: 'object' as const, description: 'Optional analysis from RequestAnalyzer' },
            evidence: { type: 'object' as const, description: 'Read-only engineering evidence collected from the active workspace before planning.' }
        },
        required: ['projectDescription']
    };

    outputSchema = {
        type: 'object' as const,
        properties: {
            projectName: { type: 'string' as const },
            totalPhases: { type: 'number' as const },
            estimatedDuration: { type: 'string' as const },
            autoExecuted: { type: 'boolean' as const },
            phases: { type: 'array' as const, items: { type: 'object' as const } }
        }
    };

    permissions: ToolPermission[] = [];
    sideEffects: ToolPermission[] = [];

    rateLimitPerMinute = 5;
    auditFields = ['projectDescription'];
    mockSupported = false;

    async execute(input: { projectDescription: string; analysis?: any; evidence?: EngineeringEvidence }, context?: any) {
        const { projectDescription, analysis } = input || ({} as any);
        // Tool calls may cross a JSON wrapper when they are routed through a
        // pipeline or persisted/replayed by the orchestrator. Accept only the
        // known evidence envelopes, while keeping the planner's internal shape
        // stable and preserving the evidence-first policy.
        const evidence = this.normaliseEvidence((input || ({} as any)).evidence);
        const logs: string[] = [];
        // A missing required argument is a QUESTION, not a crash. The registry
        // audit called every read-only tool with {} and six of them threw a raw
        // TypeError — which is what the user sees when a planner omits a field.
        if (!String(projectDescription || '').trim()) {
            return { ok: false, error: 'project_planner needs projectDescription — describe the project to plan.', logs } as any;
        }

        try {
            // A plan is portable workspace code, not a reflection of the host
            // machine. The raw evidence remains available for internal guards,
            // but the model receives no absolute host paths to copy into tools.
            const repairMode = context?.repairMode === true;
            const planningPrompt = this.createPlanningPrompt(projectDescription, analysis, this.planningEvidence(evidence), repairMode);
            let response: any = await callLLM(planningPrompt, [
                { role: 'system', content: 'You are a senior software project manager. Return only valid JSON.' }
            ], {
                // The user-selected compatible gateway is part of the live tool
                // context. Do not silently discard it and fall back to unrelated
                // keyless providers for a long planning request.
                modelConfig: context?.modelConfig,
                // Planning is a bounded long-running operation: the complete
                // specification has already been read and compressed, but a
                // multi-domain JSON plan can legitimately take longer than a
                // normal conversational turn. Keep the cap finite and explicit.
                providerTimeoutMs: Number(context?.plannerTimeoutMs) > 0 ? Number(context.plannerTimeoutMs) : 120000,
                maxCompletionTokens: Number(context?.plannerMaxCompletionTokens) > 0 ? Number(context.plannerMaxCompletionTokens) : 12000,
                reasoningEffort: context?.plannerReasoningEffort || 'low',
                purpose: 'internal',
            });

            if (isProviderFailure(response)) {
                console.warn(`[ProjectPlanner] provider-failure ${JSON.stringify({ response: this.responseDiagnostic(response) })}`);
                // A complete provider outage is normally an honest blocker.  The
                // engineering pipeline is the one bounded exception: after a
                // transient all-provider failure, make one compact planning turn
                // so the router can use a provider that recovered between calls.
                // Never do this for ordinary chat/planning calls and never invent
                // a plan from the outage string if the second turn also fails.
                if (context?.engineeringPipeline === true) {
                    let recoveryResponse: any = null;
                    try {
                        const recoveryTimeoutMs = Math.min(
                            Number(context?.plannerTimeoutMs) > 0 ? Number(context.plannerTimeoutMs) : 120000,
                            45000,
                        );
                        const recoveryPrompt = this.createCompactRecoveryPlanningPrompt(
                            projectDescription,
                            'The planning gateway failed before returning a plan. Re-attempt the same evidence-backed request once; do not invent facts or a framework.',
                            undefined,
                            repairMode
                        );
                        recoveryResponse = await callLLM(recoveryPrompt, [
                            { role: 'system', content: 'You are a senior software project manager. Return only compact valid JSON with executable phases and tasks.' }
                        ], {
                            modelConfig: context?.modelConfig,
                            providerTimeoutMs: recoveryTimeoutMs,
                            maxCompletionTokens: Math.min(Number(context?.plannerMaxCompletionTokens) > 0 ? Number(context.plannerMaxCompletionTokens) : 12000, 6000),
                            reasoningEffort: context?.plannerReasoningEffort || 'low',
                            purpose: 'internal',
                            engineeringPipeline: true,
                        });
                        if (!isProviderFailure(recoveryResponse)) {
                            response = recoveryResponse;
                            logs.push('Planner provider recovery completed; continuing with the recovered response.');
                        }
                    } catch (recoveryError: any) {
                        logs.push(`Planner provider recovery failed: ${recoveryError?.message || recoveryError}`);
                    }
                    if (!isProviderFailure(response)) {
                        // Continue through the normal parse, contract, and scope
                        // gates below. Provider recovery is not permission to
                        // bypass evidence validation.
                        logs.push('Planner provider outage recovered within the one-attempt engineering budget.');
                    }
                }
                if (isProviderFailure(response)) {
                    logs.push('Planner provider unavailable; no plan was invented from the outage message.');
                    return {
                        ok: false,
                        error: response,
                        output: {
                            ...this.fallbackPlan(projectDescription, analysis, evidence),
                            autoExecuted: false,
                            executionPolicy: 'planner_only',
                        },
                        logs,
                    } as any;
                }
            }

            logs.push('LLM planning completed');

            let plan: any;
            try {
                plan = this.parsePlan(response);
                if (!this.hasPlanningShape(plan)) {
                    throw new Error('Planner returned valid JSON without a non-empty phases/tasks plan');
                }
            } catch (parseError) {
                console.warn(`[ProjectPlanner] initial-parse-failed ${JSON.stringify({ error: String(parseError), response: this.responseDiagnostic(response) })}`);
                logs.push(`Initial planner response was not executable JSON: ${parseError}`);
                // A provider can answer successfully with prose, `{ phases: [] }`,
                // or a truncated JSON object. Those are provider answers, not
                // engineering plans. Give the same provider one bounded, stricter
                // planning turn before declaring the run blocked; never invent a
                // scaffold from a malformed response.
                let retryResponse: any = null;
                try {
                    const retryPrompt = this.createCompactRecoveryPlanningPrompt(
                        projectDescription,
                        String(parseError),
                        undefined,
                        repairMode
                    );
                    retryResponse = await callLLM(retryPrompt, [
                        { role: 'system', content: 'You are a senior software project manager. Return only valid JSON with executable phases and tasks.' }
                    ], {
                        modelConfig: context?.modelConfig,
                        providerTimeoutMs: Number(context?.plannerTimeoutMs) > 0 ? Number(context.plannerTimeoutMs) : 120000,
                        maxCompletionTokens: Number(context?.plannerMaxCompletionTokens) > 0 ? Number(context.plannerMaxCompletionTokens) : 12000,
                        reasoningEffort: context?.plannerReasoningEffort || 'low',
                        purpose: 'internal',
                    });
                    if (isProviderFailure(retryResponse)) throw new Error(retryResponse);
                    plan = this.parsePlan(retryResponse);
                    if (!this.hasPlanningShape(plan)) {
                        throw new Error('Recovery planner returned valid JSON without a non-empty phases/tasks plan');
                    }
                    logs.push('Planner recovery completed with a non-empty execution plan');
                } catch (retryError: any) {
                    console.warn(`[ProjectPlanner] parse-recovery-failed ${JSON.stringify({ error: retryError?.message || String(retryError), response: this.responseDiagnostic(typeof retryResponse === 'undefined' ? null : retryResponse) })}`);
                    logs.push(`Planner recovery failed: ${retryError?.message || retryError}`);
                    plan = this.fallbackPlan(projectDescription, analysis, evidence);
                }
            }

            plan = this.validatePlan(plan, projectDescription);

            /**
             * THE PLAN IS CODE THE SYSTEM IS ABOUT TO RUN.
             *
             * Telling the model the vocabulary makes it mostly obey; it does not
             * make it obey always, and «mostly» is how an eight-phase build ends
             * at 0/8. Every tool name is snapped onto a real tool here, and
             * anything that cannot be is dropped with a written reason — before
             * the executor ever sees it.
             */
            const hasExplicitStack = this.hasExplicitStackConstraint(projectDescription);
            const hasEvidenceBackedStack = this.hasEvidenceBackedStack(evidence);
            const hasPlannerStackDecision = this.hasPlannerStackDecision(plan);
            const referenceProjects = evidence?.referenceProjects || [];
            const typedReferenceProjects = referenceProjects.filter(project =>
                project.projectKinds.some(kind => kind === 'node' || kind === 'python' || kind === 'go')
                && project.manifests.some(manifest => Boolean(String(manifest.path || '').trim()))
            );
            logs.push(`[plan] stack evidence mode=${evidence?.mode || 'missing'} references=${referenceProjects.length} typedWithManifest=${typedReferenceProjects.length} explicit=${hasExplicitStack} plannerDecision=${hasPlannerStackDecision} allowed=${hasEvidenceBackedStack || hasPlannerStackDecision}`);
            const workspaceRoot = evidence?.workspaceRoot || evidence?.selectedProject?.root || '';
            const evidencedPaths = [
                ...(evidence?.selectedProject?.manifests || []).map(item => item.path),
                ...(evidence?.selectedProject?.likelyEntrypoints || []),
                ...(evidence?.selectedProject?.testFiles || []),
                ...(evidence?.referenceProjects || []).flatMap(project => [
                    ...project.manifests.map(item => item.path),
                    ...project.likelyEntrypoints,
                    ...(project.testFiles || []),
                ]),
                ...(evidence?.instructionFiles || []).map(item => item.relativePath),
            ].map(item => {
                const source = String(item || '');
                return workspaceRoot && path.isAbsolute(source) ? path.relative(workspaceRoot, source) : source;
            }).filter(Boolean);
            const rawPlanBeforeSanitise = JSON.parse(JSON.stringify(plan));
            let clean = sanitisePlanPhases(plan.phases, plan.projectName, {
                mode: evidence?.mode,
                // A greenfield plan may choose a stack only when the planner made
                // that choice explicit and tied it to a concrete implementation artifact.
                disallowImplicitScaffold: evidence?.mode === 'greenfield' && !hasExplicitStack && !hasEvidenceBackedStack && !hasPlannerStackDecision,
                evidencedPaths,
                testFiles: (evidence?.selectedProject?.testFiles || []).map(item => String(item || '').trim()).filter(Boolean),
                candidateCheckCommands: (evidence?.selectedProject?.candidateChecks || []).map(check => check.command),
                disallowUnportableNativeDependencies: evidence?.mode === 'greenfield',
                requireRunnableContract: context?.requireRunnableContract === true,
            });
            plan.phases = clean.phases;
            clean.notes.forEach(n => logs.push(n));

            // A response can be valid JSON and still contain only invented tools,
            // vague review tasks, or greenfield seeds rejected by the evidence
            // policy. The old recovery handled only parse/empty-shape failures,
            // so this exact case silently degraded to documentation. Give the
            // model one bounded contract-aware retry before declaring the request
            // blocked; never manufacture an implementation locally.
            const requestedImplementation = this.requirementScope(projectDescription).requiresImplementation;
            if (!clean.blocker && requestedImplementation && this.countImplementationArtifacts(clean.phases) === 0 && this.hasPlanningShape(plan)) {
                const dropped = clean.notes.slice(-16).join(' | ');
                logs.push('[plan] Parsed plan retained no non-document implementation artifact after contract sanitisation; starting one contract-aware recovery.');
                console.warn(`[ProjectPlanner] contract-drop ${JSON.stringify({ projectName: plan?.projectName, phases: this.planContractDiagnostic(plan), dropped: clean.notes.slice(-16) })}`);
                try {
                    const retryPrompt = this.createCompactRecoveryPlanningPrompt(
                        projectDescription,
                        `The parsed plan retained no non-document implementation artifact after sanitisation. Dropped-plan evidence: ${dropped}`,
                        undefined,
                        repairMode
                    );
                    const retryResponse = await callLLM(retryPrompt, [
                        { role: 'system', content: 'You are a senior software project manager. Return only valid JSON with executable phases, exact tool contracts, and non-document implementation artifacts.' }
                    ], {
                        modelConfig: context?.modelConfig,
                        providerTimeoutMs: Number(context?.plannerTimeoutMs) > 0 ? Number(context.plannerTimeoutMs) : 120000,
                        maxCompletionTokens: Number(context?.plannerMaxCompletionTokens) > 0 ? Number(context.plannerMaxCompletionTokens) : 12000,
                        reasoningEffort: context?.plannerReasoningEffort || 'low',
                        purpose: 'internal',
                    });
                    if (isProviderFailure(retryResponse)) throw new Error(retryResponse);
                    const recoveredPlan = this.parsePlan(retryResponse);
                    if (!this.hasPlanningShape(recoveredPlan)) {
                        throw new Error('Contract recovery returned valid JSON without a non-empty phases/tasks plan');
                    }
                    const recoveredHasPlannerStackDecision = this.hasPlannerStackDecision(recoveredPlan);
                    const recoveredClean = sanitisePlanPhases(recoveredPlan.phases, recoveredPlan.projectName, {
                        mode: evidence?.mode,
                        disallowImplicitScaffold: evidence?.mode === 'greenfield' && !hasExplicitStack && !hasEvidenceBackedStack && !recoveredHasPlannerStackDecision,
                        evidencedPaths,
                        testFiles: evidence?.selectedProject?.testFiles || [],
                        candidateCheckCommands: (evidence?.selectedProject?.candidateChecks || []).map(check => check.command),
                        disallowUnportableNativeDependencies: evidence?.mode === 'greenfield',
                        requireRunnableContract: context?.requireRunnableContract === true,
                    });
                    if (this.countImplementationArtifacts(recoveredClean.phases) === 0) {
                        throw new Error('Contract recovery still retained no non-document implementation artifact');
                    }
                    plan = this.validatePlan(recoveredPlan, projectDescription);
                    plan.phases = recoveredClean.phases;
                    clean = recoveredClean;
                    clean.notes.forEach(n => logs.push(n));
                    logs.push('Planner contract recovery completed with non-document implementation artifacts');
                } catch (recoveryError: any) {
                    logs.push(`Planner contract recovery failed: ${recoveryError?.message || recoveryError}`);
                    console.warn(`[ProjectPlanner] contract-recovery-failed ${JSON.stringify({ message: recoveryError?.message || String(recoveryError), plan: this.planContractDiagnostic(plan) })}`);
                }
            }

            // A malformed scaffold or an unportable native addon is a planning
            // contract failure, not a reason to manufacture a document or run a
            // blind npm install. Both are recoverable once: the model must supply
            // an evidence-backed, workspace-runnable alternative.
            const blocker = clean.blocker;
            const contractRecoveryBlocker = !!blocker
                && /^(?:scaffold_project_contract_invalid|implicit_scaffold_requires_explicit_stack|unportable_native_dependency|missing_runnable_contract)$/.test(String(blocker.code || ''));
            if (contractRecoveryBlocker) {
                logs.push(`[plan] ${blocker.code} detected; starting one bounded contract recovery.`);
                try {
                    const recoveryPrompt = this.createCompactRecoveryPlanningPrompt(
                        projectDescription,
                        `The parsed plan was rejected by a planning contract: ${blocker.code}: ${blocker.message}. ${blocker.remedy || ''} For missing_runnable_contract, add an explicit foundation task using write_file or ai_write_file for package.json and a real entrypoint (or a stack scaffold with an inspectable runnable structure) before any live-run. Do not use scaffold_project or native npm addons in this repair. Prefer node:sqlite when available, otherwise a JSON/file fallback with the same interface; use file-level implementation tasks instead. Re-plan from the original request and evidence; do not invent a fixed template locally.`,
                        undefined,
                        repairMode
                    );
                    const recoveryRequest = () => callLLM(recoveryPrompt, [
                        { role: 'system', content: 'You are a senior software project manager. Repair the rejected plan using the evidence and exact tool contracts. Return only valid JSON; never return prose or Markdown fences.' }
                    ], {
                        modelConfig: context?.modelConfig,
                        providerTimeoutMs: Number(context?.plannerTimeoutMs) > 0 ? Number(context.plannerTimeoutMs) : 120000,
                        maxCompletionTokens: Number(context?.plannerMaxCompletionTokens) > 0 ? Number(context.plannerMaxCompletionTokens) : 12000,
                        reasoningEffort: context?.plannerReasoningEffort || 'low',
                        purpose: 'internal',
                    });
                    let recoveryResponse: any;
                    let recoveryFailure: any = null;
                    for (let attempt = 0; attempt < 2; attempt++) {
                        try {
                            recoveryResponse = await recoveryRequest();
                            if (!isProviderFailure(recoveryResponse)) break;
                            recoveryFailure = recoveryResponse;
                        } catch (attemptError: any) {
                            recoveryFailure = attemptError;
                        }
                        const failureText = String(recoveryFailure?.message || recoveryFailure || '');
                        const rateLimited = /\b429\b|rate[ -]?limit|quota|الحصص اليومية|المزوّدات استُهلكت/i.test(failureText);
                        if (attempt === 0 && rateLimited) {
                            const configuredDelay = Number(context?.plannerRecoveryRetryDelayMs);
                            const advertisedDelay = retryAfterMsFrom(failureText);
                            const delayMs = Number.isFinite(configuredDelay)
                                ? Math.max(0, Math.min(configuredDelay, 65_000))
                                : Math.min(Math.max(61_000, (advertisedDelay || 0) + 1_000), 65_000);
                            logs.push(`[plan] portability recovery hit a provider rate limit; waiting ${delayMs}ms for one bounded retry.`);
                            await new Promise(resolve => setTimeout(resolve, delayMs));
                            continue;
                        }
                        break;
                    }
                    if (isProviderFailure(recoveryResponse)) throw new Error(recoveryResponse);
                    if (recoveryFailure && !recoveryResponse) throw recoveryFailure;
                    const recoveredPlan = this.parsePlan(recoveryResponse);
                    if (!this.hasPlanningShape(recoveredPlan)) {
                        throw new Error('Scaffold contract recovery returned valid JSON without a non-empty phases/tasks plan');
                    }
                    const recoveredHasPlannerStackDecision = this.hasPlannerStackDecision(recoveredPlan);
                    logs.push(`[plan] recovery stack decision=${recoveredHasPlannerStackDecision}`);
                    const recoveredClean = sanitisePlanPhases(recoveredPlan.phases, recoveredPlan.projectName, {
                        mode: evidence?.mode,
                        disallowImplicitScaffold: evidence?.mode === 'greenfield' && !hasExplicitStack && !hasEvidenceBackedStack && !recoveredHasPlannerStackDecision,
                        evidencedPaths,
                        testFiles: evidence?.selectedProject?.testFiles || [],
                        candidateCheckCommands: (evidence?.selectedProject?.candidateChecks || []).map(check => check.command),
                        disallowUnportableNativeDependencies: evidence?.mode === 'greenfield',
                        requireRunnableContract: context?.requireRunnableContract === true,
                    });
                    if (recoveredClean.blocker) {
                        throw new Error(`Contract recovery remained blocked: ${recoveredClean.blocker.code}: ${recoveredClean.blocker.message}`);
                    }
                    if (this.countImplementationArtifacts(recoveredClean.phases) === 0) {
                        throw new Error('Scaffold contract recovery retained no non-document implementation artifact');
                    }
                    plan = this.validatePlan(recoveredPlan, projectDescription);
                    plan.phases = recoveredClean.phases;
                    clean = recoveredClean;
                    clean.notes.forEach(n => logs.push(n));
                    logs.push('Planner scaffold contract recovery completed with executable implementation artifacts');
                } catch (recoveryError: any) {
                    logs.push(`Planner scaffold contract recovery failed: ${recoveryError?.message || recoveryError}`);
                }
            }

            // If the model ignored both portability-recovery prompts, perform one
            // deterministic dependency-only rewrite. This preserves the model's
            // architecture and task scope; it merely applies the already stated
            // contract (node:sqlite/JSON, node:crypto, sass, or a portable fallback)
            // before the same sanitiser and artifact gates run again.
            if (clean.blocker?.code === 'unportable_native_dependency' && evidence?.mode === 'greenfield') {
                const portablePlan = this.rewriteUnportableNativePlan(rawPlanBeforeSanitise);
                const portableClean = sanitisePlanPhases(portablePlan.phases, portablePlan.projectName, {
                    mode: evidence?.mode,
                    disallowImplicitScaffold: evidence?.mode === 'greenfield' && !hasExplicitStack && !hasEvidenceBackedStack && !this.hasPlannerStackDecision(portablePlan),
                    evidencedPaths,
                    testFiles: (evidence?.selectedProject?.testFiles || []).map(item => String(item || '').trim()).filter(Boolean),
                    candidateCheckCommands: (evidence?.selectedProject?.candidateChecks || []).map(check => check.command),
                    disallowUnportableNativeDependencies: true,
                    requireRunnableContract: context?.requireRunnableContract === true,
                    repairMode,
                });
                if (!portableClean.blocker && this.countImplementationArtifacts(portableClean.phases) > 0) {
                    plan = this.validatePlan(portablePlan, projectDescription);
                    plan.phases = portableClean.phases;
                    clean = portableClean;
                    clean.notes.forEach(n => logs.push(n));
                    logs.push('Planner portability normalization completed after bounded model recovery failed.');
                } else {
                    logs.push(`Planner portability normalization failed: ${portableClean.blocker?.message || 'no implementation artifact survived'}`);
                }
            }

            // Preserve any remaining blocker so the pipeline stops honestly and
            // the user/model can supply evidence; never manufacture a scaffold or
            // documentation artefact locally.
            if (clean.blocker) {
                plan = this.validatePlan({
                    ...plan,
                    phases: [],
                    totalPhases: 0,
                    fallback: true,
                    deliveryStatus: 'blocked',
                    executionStatus: 'not_started',
                    verificationStatus: 'not_run',
                    blocker: clean.blocker,
                }, projectDescription);
                logs.push(`[plan] blocked: ${clean.blocker.message}`);
                return {
                    ok: false,
                    error: clean.blocker.message,
                    output: { ...plan, autoExecuted: false, executionPolicy: 'planner_only' },
                    logs,
                } as any;
            }

            // A plan with no executable implementation for an implementation
            // request is not a deliverable. Documentation is useful evidence, but
            // it must never be counted as the requested product.
            if (requestedImplementation && this.countImplementationArtifacts(clean.phases) === 0) {
                const blocked = this.validatePlan(this.fallbackPlan(projectDescription, analysis, evidence), projectDescription);
                blocked.blocker = {
                    code: 'no_implementation_artifacts_after_contract_recovery',
                    message: 'No non-document implementation artifact survived planning and contract validation. No implementation was started.',
                    remedy: 'Return a concrete multi-phase plan using the registered tools and evidence-backed workspace-relative file outputs.'
                };
                blocked.planNotes = clean.notes;
                logs.push(`[plan] blocked: ${blocked.blocker.message}`);
                return {
                    ok: false,
                    error: blocked.blocker.message,
                    output: { ...blocked, autoExecuted: false, executionPolicy: 'planner_only' },
                    logs,
                } as any;
            }

            // A plan with nothing runnable in it is not a plan. The deterministic
            // fallback names only tools that exist, so it always executes.
            if (clean.executableTasks === 0) {
                logs.push('[plan] لم يبق في الخطة أي عمل قابل للتنفيذ — رجعتُ إلى خطة محجوبة صادقة بدلاً من اختراع scaffold.');
                plan = this.validatePlan(this.fallbackPlan(projectDescription, analysis, evidence), projectDescription);
            }

            // A fallback is evidence that planning did not produce executable
            // work. It must never be reported as a successful plan: the pipeline
            // needs the explicit failure to choose a safe recovery or stop, and
            // the user must not see a blocked result labelled as delivered.
            if (plan?.fallback === true) {
                const blockerMessage = plan?.blocker?.message || 'No executable engineering plan was produced.';
                logs.push(`[plan] blocked: ${blockerMessage}`);
                return {
                    ok: false,
                    error: blockerMessage,
                    output: { ...plan, autoExecuted: false, executionPolicy: 'planner_only' },
                    logs,
                } as any;
            }

            // A long, multi-domain requirement set must not be rebranded as a
            // delivered system merely because the model produced a well-written
            // architecture note.  This guard is based on requirement headings and
            // actual task/artifact types, never on a product name or keyword route.
            let scopeAssessment = this.assessPlanScope(plan, projectDescription, repairMode);
            if (!scopeAssessment.ok && requestedImplementation) {
                // A syntactically valid plan can still be materially incomplete. Do
                // not weaken the gate and do not invent missing phases locally: give
                // the planner a small, evidence-aware retry budget. Each retry gets
                // the validator's uncovered requirement ledger so it can repair the
                // plan rather than repeating the same first slice of the brief.
                const maxScopeRecoveryAttempts = 2;
                let scopeRecoveryAttempt = 0;
                while (!scopeAssessment.ok && scopeRecoveryAttempt < maxScopeRecoveryAttempts) {
                    scopeRecoveryAttempt += 1;
                    logs.push(`[plan] scope coverage insufficient; starting scope-aware recovery attempt ${scopeRecoveryAttempt}/${maxScopeRecoveryAttempts}: ${scopeAssessment.message}`);
                    try {
                        const scopeRecoveryPrompt = this.createCompactRecoveryPlanningPrompt(
                            projectDescription,
                            `The previous plan passed JSON and tool-contract validation but failed the coverage gate: ${scopeAssessment.message}. Repair the complete requirement register; do not preserve an under-scoped subset.`,
                            scopeAssessment,
                            repairMode
                        );
                        const scopeRecoveryResponse = await callLLM(scopeRecoveryPrompt, [
                            { role: 'system', content: 'You are a senior software project manager. Return only valid JSON with complete requirement coverage, executable phases, exact tool contracts, and concrete non-document artifacts.' }
                        ], {
                            modelConfig: context?.modelConfig,
                            providerTimeoutMs: Number(context?.plannerTimeoutMs) > 0 ? Number(context.plannerTimeoutMs) : 120000,
                            maxCompletionTokens: Number(context?.plannerMaxCompletionTokens) > 0 ? Number(context.plannerMaxCompletionTokens) : 12000,
                            reasoningEffort: context?.plannerReasoningEffort || 'low',
                            purpose: 'internal',
                        });
                        if (isProviderFailure(scopeRecoveryResponse)) throw new Error(scopeRecoveryResponse);
                        const recoveredPlan = this.parsePlan(scopeRecoveryResponse);
                        if (!this.hasPlanningShape(recoveredPlan)) {
                            throw new Error('Scope recovery returned valid JSON without a non-empty phases/tasks plan');
                        }
                        const recoveredHasPlannerStackDecision = this.hasPlannerStackDecision(recoveredPlan);
                        logs.push(`[plan] scope recovery stack decision=${recoveredHasPlannerStackDecision}`);
                        const recoveredClean = sanitisePlanPhases(recoveredPlan.phases, recoveredPlan.projectName, {
                            disallowImplicitScaffold: evidence?.mode === 'greenfield' && !hasExplicitStack && !hasEvidenceBackedStack && !recoveredHasPlannerStackDecision,
                            evidencedPaths,
                            testFiles: evidence?.selectedProject?.testFiles || [],
                             candidateCheckCommands: (evidence?.selectedProject?.candidateChecks || []).map(check => check.command),
                             disallowUnportableNativeDependencies: evidence?.mode === 'greenfield',
                             requireRunnableContract: context?.requireRunnableContract === true,
                             repairMode,
                         });
                        if (recoveredClean.blocker) {
                            throw new Error(`Scope recovery was blocked during contract sanitisation: ${recoveredClean.blocker.message}`);
                        }
                        if (this.countImplementationArtifacts(recoveredClean.phases) === 0) {
                            throw new Error('Scope recovery retained no non-document implementation artifact');
                        }
                        const recoveredValidatedPlan = this.validatePlan(recoveredPlan, projectDescription);
                        recoveredValidatedPlan.phases = recoveredClean.phases;
                        const recoveredAssessment = this.assessPlanScope(recoveredValidatedPlan, projectDescription, repairMode);
                        if (!recoveredAssessment.ok) {
                            scopeAssessment = recoveredAssessment;
                            logs.push(`Planner scope recovery attempt ${scopeRecoveryAttempt} remained under-scoped: ${recoveredAssessment.message}`);
                            continue;
                        }
                        plan = recoveredValidatedPlan;
                        clean = recoveredClean;
                        scopeAssessment = recoveredAssessment;
                        clean.notes.forEach(n => logs.push(n));
                        logs.push('Planner scope recovery completed with sufficient requirement coverage');
                    } catch (scopeRecoveryError: any) {
                        logs.push(`Planner scope recovery attempt ${scopeRecoveryAttempt} failed: ${scopeRecoveryError?.message || scopeRecoveryError}`);
                    }
                }
            }
            if (!scopeAssessment.ok) {
                const blocked = this.fallbackPlan(projectDescription, analysis, evidence);
                blocked.blocker = {
                    code: 'plan_scope_insufficient',
                    message: scopeAssessment.message,
                    remedy: 'Produce a multi-phase plan that maps the discovered requirements to concrete implementation artifacts and evidence-backed verification.'
                };
                blocked.scopeAssessment = scopeAssessment;
                logs.push(`[plan] scope gate blocked execution: ${scopeAssessment.message}`);
                return {
                    ok: false,
                    error: scopeAssessment.message,
                    output: { ...blocked, autoExecuted: false, executionPolicy: 'planner_only' },
                    logs,
                } as any;
            }
            // Preserve the evidence-backed scope decision in the successful
            // output as well as in logs. Consumers must be able to distinguish a
            // fully covered plan from one that merely parsed as JSON.
            plan.scopeAssessment = scopeAssessment;
            logs.push(`Plan created: ${plan.totalPhases} phases, ${plan.estimatedDuration}`);
            logs.push('Planner-only mode: generated tasks were not executed.');

            return {
                ok: true,
                output: {
                    ...plan,
                    autoExecuted: false,
                    executionPolicy: 'planner_only',
                    nextStep: 'Pass this plan to the orchestrator or phase_executor for controlled execution.'
                },
                logs
            };
        } catch (error: any) {
            logs.push(`Error: ${error.message}`);
            return {
                ok: false,
                error: error.message,
                output: {
                    ...this.fallbackPlan(projectDescription, analysis, evidence),
                    autoExecuted: false,
                    executionPolicy: 'planner_only'
                },
                logs
            };
        }
    }

    /**
     * Recover engineering evidence from the direct tool contract or one of the
     * wrappers used by pipeline/replay boundaries. Do not infer evidence from
     * arbitrary objects: a wrapper is accepted only when it contains the
     * discovery-shaped fields used by the planner.
     */
    private normaliseEvidence(raw: unknown): EngineeringEvidence | undefined {
        const parse = (value: unknown): any => {
            if (typeof value !== 'string') return value;
            try { return JSON.parse(value); } catch { return undefined; }
        };
        const root = parse(raw) as any;
        if (!root || typeof root !== 'object') return undefined;
        const candidates = [
            root,
            root.evidence,
            root.output?.evidence,
            root.discovery,
            root.discovery?.evidence,
        ].map(parse).filter((value: any) => value && typeof value === 'object');
        const base = candidates.find((value: any) =>
            typeof value.mode === 'string'
            || typeof value.workspaceRoot === 'string'
            || Array.isArray(value.referenceProjects)
            || Array.isArray(value.facts)
            || Array.isArray(value.blockers)
        );
        if (!base) return undefined;
        const referenceProjects = candidates.find((value: any) => Array.isArray(value.referenceProjects))?.referenceProjects;
        const selectedProject = candidates.find((value: any) => value.selectedProject)?.selectedProject;
        return {
            ...base,
            ...(referenceProjects ? { referenceProjects } : {}),
            ...(selectedProject && !base.selectedProject ? { selectedProject } : {}),
        } as EngineeringEvidence;
    }

    /**
     * Shape evidence for an LLM without leaking host-local absolute paths.
     * The execution boundary accepts only workspace-relative paths, therefore
     * those are the only path values a model is allowed to see and reuse.
     */
    private planningEvidence(evidence?: EngineeringEvidence): EngineeringEvidence | undefined {
        if (!evidence) return undefined;
        const root = String(evidence.workspaceRoot || '').trim();
        const relative = (value: unknown): string => {
            const raw = String(value || '').trim();
            if (!raw) return '';
            if (!path.isAbsolute(raw)) return raw.replace(/\\/g, '/').replace(/^\.\//, '');
            if (!root) return '';
            const rel = path.relative(root, raw).replace(/\\/g, '/');
            return rel && !rel.startsWith('../') && !path.isAbsolute(rel) ? rel : '';
        };
        const redact = (value: unknown): string => {
            const text = String(value || '');
            return root ? text.split(root).join('.') : text;
        };
        const selected = evidence.selectedProject;
        const referenceProjects = (evidence.referenceProjects || []).map(project => ({
            ...project,
            root: relative(project.root) || '.',
            manifests: project.manifests.map(item => ({ ...item, path: relative(item.path) })),
            likelyEntrypoints: project.likelyEntrypoints.map(relative).filter(Boolean),
            testFiles: (project.testFiles || []).map(relative).filter(Boolean),
        }));
        return {
            ...evidence,
            workspaceRoot: '.',
            selectedProject: selected ? {
                ...selected,
                root: relative(selected.root) || '.',
                manifests: selected.manifests.map(item => ({ ...item, path: relative(item.path) })),
                likelyEntrypoints: selected.likelyEntrypoints.map(relative).filter(Boolean),
                testFiles: (selected.testFiles || []).map(relative).filter(Boolean),
            } : undefined,
            referenceProjects,
            instructionFiles: (evidence.instructionFiles || []).map(item => ({
                relativePath: relative(item.relativePath),
                lineCount: item.lineCount,
            })).filter(item => Boolean(item.relativePath)),
            facts: (evidence.facts || []).map(fact => ({
                ...fact,
                statement: fact.id === 'workspace.root' ? 'Workspace root selected: .' : redact(fact.statement),
            })),
        };
    }

    private createPlanningPrompt(projectDescription: string, analysis?: any, evidence?: EngineeringEvidence, repairMode = false) {
        // The vocabulary comes FIRST. Without it the model plans like a manager
        // — «Create project repository → Git», «Set up board → Jira» — and the
        // build dies on task one with unknown_tool. Telling it what this machine
        // can do is the difference between a plan and a wish.
        return `Create a realistic software engineering execution plan for this project.

${plannerToolPrompt()}

${ENGINEERING_CONSTITUTION}

PROJECT:
${projectDescription}

${analysis ? `ANALYSIS:\n${JSON.stringify(analysis, null, 2)}\n` : ''}${evidence ? `ENGINEERING_EVIDENCE (facts, not suggestions):\n${JSON.stringify(evidence, null, 2)}\n` : ''}
	Rules: Inspect and modify an existing selected project before proposing a new scaffold. Every write task must refer to an evidence fact or an explicit user requirement. Use candidateChecks from the evidence for verification where available. Paths in every file-oriented tool argument must be safe workspace-relative paths; never use an absolute host path, a drive path, a network path, or the parent-directory marker '..'. A read_file task may read only an evidence path or a file created earlier in the same phase. Do not select product-named foundations or deployment tools solely because words in the request resemble them. If evidence is ambiguous or blocked, plan clarification or read-only analysis rather than writing files. If evidence.mode is greenfield and PROJECT does not explicitly name a programming stack or framework, do not silently assume one: first include a clearly labeled architecture/stack decision grounded in the requirements and registered tools, naming a concrete runtime, framework, or language. That decision may authorize scaffold_project only when the plan also contains a real implementation artifact reflecting it; never copy a fixed template. Do not use scaffold_full_stack, react_project, api_project, web_page_builder, mobile_builder, npm_manager, dependency installers, or invented package scripts solely to hide an unstated decision. If the requirements are insufficient even for a bounded decision, plan read-only analysis or stop with a clear implementation-constraint question. When using referenceProjects, preserve the new project write scope, cite the reference manifest in the plan, and never modify or run checks against the reference project as the deliverable target. Plan only the smallest independently testable portable slice as exact file-level tasks, or stop with a clear implementation-constraint question if that is not possible.
        ${this.scopePlanningInstructions(projectDescription, repairMode)}
	        OUTPUT BUDGET CONTRACT: Return a compact JSON plan that fits one response. Use no more than 8 phases and no more than 4 tasks per phase. Keep phase descriptions, task names, deliverables, verificationTask, and args.description to one short sentence (preferably under 180 characters each). Use requirement IDs such as R1, R2 in requirementsCovered instead of copying long requirement text. Never include source code, generated HTML, long Markdown, logs, or repeated catalogue text inside the plan. For implementation files, use ai_write_file with a precise short description and safe path; use scaffold_project only for a minimal runnable skeleton with package/config plus one small entrypoint, then write the real files in later tasks. Keep each args object to the fields required by the selected tool.
        Return ONLY JSON with: projectName, projectVibe, totalPhases, estimatedDuration, phases, dependencies.
        Each phase must include: phaseNumber, name, description, tasks, verificationTask, deliverables, estimatedTime, requirementsCovered. The requirementsCovered field must be a non-empty array of requirement IDs or concise requirement statements that this phase actually advances.
Tasks must include: task, tool, args, priority, realisticMinutes. Keep the complete response compact; do not inline file contents unless the exact tool contract requires a tiny bootstrap file. A task using ai_write_file MUST include args.path (one safe relative destination inside the selected workspace) and args.description (specific technical contents for that one file); never use ai_write_file for a phase-level instruction without both fields. A task using write_file MUST include args.path and args.content. A task using doc_generator MUST include args.filePath for an existing evidenced source file. A task using test_generator MUST include args.filePath for one concrete source file, evidenced already or written by an earlier task in the same phase; never use it as a phase-level request to “test the application”. A task using auto_tester MUST include args.testType as exactly one of syntax, build, unit, integration and args.projectPath as a safe workspace-relative directory. A syntax test MUST also include args.files as a non-empty array of concrete source paths evidenced already or written earlier in the same phase. Build, unit, and integration tests may be planned only when discovery proved the corresponding package script exists; do not guess npm test or npm run build. A task using code_reviewer MUST include args.files as a non-empty array of concrete source paths, each evidenced already or written by an earlier task in the same phase; never use it as a vague phase-level request to “review quality”.
Every phase must produce something that EXISTS on disk when it finishes — code, a config, a test, a document.
Do not claim that anything was executed. The plan is for controlled orchestrator execution later.
Include build, browser QA, visual QA, and self-healing verification tasks where relevant.`;
    }

    /**
     * A bounded recovery prompt for malformed/truncated plans. The normal
     * planner prompt intentionally carries the full catalogue; retrying that
     * catalogue after an output overflow makes the same failure likely again.
     * This prompt keeps the original requirement register and tool contracts
     * explicit, while requiring the model to emit only a small executable slice.
     */
    private createCompactRecoveryPlanningPrompt(projectDescription: string, failureReason: string, assessment?: { missingTargetNames?: string[]; message?: string }, repairMode = false): string {
        if (repairMode) {
            return `BOUNDED LIVE-REPAIR — fix only the evidence-backed runnable-contract failure; do not redesign or rebuild the product.

${BOUNDED_REPAIR_CONSTITUTION}

Failure evidence: ${String(failureReason || '').slice(0, 900)}

Original repair request and evidence:
${String(projectDescription || '').slice(0, 5000)}

Return ONLY one valid JSON object with 1-3 compact phases and no prose. Inspect the current workspace before deciding exact paths. Every task must be an executable file-level implementation task using ai_write_file or write_file with safe workspace-relative args.path and a precise args.description or args.content. Modify only the smallest existing artifact(s) required to make the current implementation build and start, such as package.json, an existing start/build command, or the missing entrypoint. Do not create a template, second project, documentation-only phase, or unrelated feature. Include a verification task for the existing build/tests and one real start/readiness check after the repair. Use requirementsCovered: ["R1"] for the bounded repair requirement. Keep totalPhases equal to the number of phases returned and keep each phase to at most 3 tasks.

Schema: {"projectName":"repair","projectVibe":"bounded runnable-contract repair","totalPhases":1,"estimatedDuration":"short estimate","phases":[{"phaseNumber":1,"name":"Fix runnable contract","description":"Repair the evidence-backed manifest or entrypoint without redesigning the project.","requirementsCovered":["R1"],"tasks":[{"task":"repair the failing artifact","tool":"ai_write_file","args":{"path":"package.json","description":"Update only the evidenced manifest or entrypoint contract using the existing workspace files."},"priority":"high","realisticMinutes":10}],"verificationTask":"Run the existing build or tests and make one real start/readiness check.","deliverables":["the repaired workspace artifact"],"estimatedTime":"10 minutes"}],"dependencies":[]}`;
        }
        const scope = this.requirementScope(projectDescription);
        const targets = scope.targets.map((target, index) => `R${index + 1}: ${target}`).join(' | ');
        const missing = (assessment?.missingTargetNames || []).join(' | ');
        const phaseLedger = Array.from({ length: scope.minPhases }, (_, phaseIndex) => {
            const start = phaseIndex * 4;
            const end = Math.min(scope.targets.length, start + 4);
            const ids = Array.from({ length: Math.max(0, end - start) }, (_, offset) => `R${start + offset + 1}`);
            return ids.length ? `Phase ${phaseIndex + 1}: ${ids.join(', ')}` : '';
        }).filter(Boolean).join(' | ');
        return `COMPACT PLANNER RECOVERY — OUTPUT LIMIT OVERRIDES ALL OTHER PLANNING VERBOSITY.

The previous planner response could not be safely used. Failure evidence: ${String(failureReason || '').slice(0, 900)}

REQUIREMENT REGISTER FROM THE ORIGINAL REQUEST:
${targets || 'R1: the requested implementation'}
${missing ? `MISSING COVERAGE TO REPAIR: ${missing}` : ''}
COVERAGE LEDGER (use every listed ID in at least one requirementsCovered array): ${phaseLedger}

Return ONLY one valid JSON object. No Markdown, prose, source code, HTML, logs, catalogue text, or explanations. Do not return an empty phases array.

SCAFFOLD RECOVERY CONTRACT: if the failure evidence mentions a scaffold contract, args.structure must be concrete and non-empty with at least one executable source/config file, and every path must be safe workspace-relative. Otherwise do not use scaffold_project in this compact recovery.
PORTABILITY RECOVERY CONTRACT: if the failure evidence mentions an unportable native dependency, do not choose better-sqlite3, sqlite3, bcrypt, sharp, canvas, node-sass, ffi-napi, or another native addon. Choose node:sqlite when the runtime supports it, or a JSON/file implementation with the same interface, and record the choice in the plan.

The plan must contain between ${scope.minPhases} and 8 phases, with up to 4 short implementation tasks per phase. Keep every phase name, description, verificationTask, deliverable, task name, and args.description to one short sentence. Use requirementsCovered with the complete R-number register above; collectively cover every listed R number, including every missing area named by the validator. Before returning JSON, audit that every ID from R1 through R${scope.targets.length} appears in requirementsCovered; do not stop at a partial subset.

Make an explicit technical stack/architecture decision in phase 1, grounded in the requirements (for example a concrete runtime, language, and framework). Do not infer a stack from the product name. Do not use scaffold_project in this recovery. Every task must be an executable file-level implementation task using the registered tool ai_write_file, with args.path and args.description. Each phase must create two non-document source, configuration, or test artifacts under a safe workspace-relative path; never put code in JSON. Use paths such as src/, server/, client/, tests/, or config/ and let the controlled executor generate the contents from the descriptions.

Use this exact compact schema:
{
  "projectName": "short-name",
  "projectVibe": "one short sentence",
  "totalPhases": ${scope.minPhases},
  "estimatedDuration": "short estimate",
  "phases": [
    {
      "phaseNumber": 1,
      "name": "short phase name",
      "description": "short sentence",
      "requirementsCovered": ["R1"],
      "tasks": [
        {"task": "short implementation task", "tool": "ai_write_file", "args": {"path": "src/file.ts", "description": "short technical file description"}, "priority": "high", "realisticMinutes": 15},
        {"task": "short implementation task", "tool": "ai_write_file", "args": {"path": "tests/file.test.ts", "description": "short technical test description"}, "priority": "high", "realisticMinutes": 15}
      ],
      "verificationTask": "short verification note",
      "deliverables": ["src/file.ts", "tests/file.test.ts"],
      "estimatedTime": "30 minutes"
    }
  ],
  "dependencies": []
}
Repeat the same compact phase shape for at least ${scope.minPhases} phases and no more than 8 phases, changing paths, descriptions, and R-number coverage according to the coverage ledger. Each R-ID must advance a concrete file-level implementation task; verification tasks may be included but must not replace implementation coverage. Do not output anything before or after the JSON object.`;
    }

    /**
     * A framework name in the user's own request is an explicit constraint; a
     * business noun such as "console", "warehouse", or "dashboard" is not.
     * This intentionally stays broad and technology-oriented so it never
     * identifies a product or template by name.
     */
    private hasExplicitStackConstraint(request: string): boolean {
        return /\b(?:react(?:\s+native)?|next(?:\.js)?|vue|angular|svelte|node(?:\.js)?|express|typescript|javascript|python|django|flask|fastapi|ruby|rails|php|laravel|java|spring|kotlin|go(?:lang)?|rust|dotnet|\.net|flutter|swift|postgres(?:ql)?|mysql|mongodb|sqlite|prisma)\b/i.test(String(request || ''));
    }

    /**
     * A greenfield plan may make its own bounded technology decision, but only
     * when the decision is explicit in the plan and tied to a real artifact.
     * This prevents product nouns or fixed templates from authorizing a scaffold.
     */
    private hasPlannerStackDecision(plan: any): boolean {
        const phases = Array.isArray(plan?.phases) ? plan.phases : [];
        const technical = /\b(?:react(?:\s+native)?|next(?:\.js)?|vue|angular|svelte|node(?:\.js)?|express|typescript|javascript|python|django|flask|fastapi|ruby|rails|php|laravel|java|spring|kotlin|go(?:lang)?|rust|dotnet|\.net|flutter|swift|postgres(?:ql)?|mysql|mongodb|sqlite|prisma)\b/i;
        const decisionLabel = /(?:stack|architecture|framework|runtime|technology|tech(?:nology)?\s+decision|decision)/i;
        const artifactPath = /(?:^|\/)(?:package\.json|tsconfig\.json|pyproject\.toml|requirements\.txt|go\.mod|[^/]+\.(?:ts|tsx|js|jsx|py|go|rs))$/i;
        const textParts: string[] = [];
        let hasArtifact = false;
        for (const phase of phases) {
            textParts.push(String(phase?.name || ''), String(phase?.description || ''));
            for (const task of Array.isArray(phase?.tasks) ? phase.tasks : []) {
                textParts.push(String(task?.task || ''), String(task?.description || ''), String(task?.args?.description || ''));
                const tool = String(task?.tool || '').toLowerCase();
                const structure = task?.args?.structure;
                if (tool === 'scaffold_project' && structure && typeof structure === 'object') {
                    hasArtifact = Object.keys(structure).some(key => artifactPath.test(String(key)));
                }
                const taskPath = String(task?.args?.path || task?.args?.filePath || '');
                if (taskPath && artifactPath.test(taskPath) && /(?:write|create|implement|scaffold|bootstrap|configure)/i.test(String(task?.task || task?.args?.description || ''))) {
                    hasArtifact = true;
                }
            }
        }
        const planText = textParts.join('\n');
        return technical.test(planText) && (decisionLabel.test(planText) || hasArtifact);
    }

    /**
     * A new project may inherit a technology decision only from a project that
     * discovery actually inspected. This is deliberately narrower than
     * "there is a directory on disk": a real manifest and a known project kind
     * are required. The returned boolean authorizes only scaffold selection;
     * reference candidate checks remain excluded from the target's execution.
     */
    private hasEvidenceBackedStack(evidence?: EngineeringEvidence): boolean {
        const projects = [
            evidence?.selectedProject,
            ...(evidence?.referenceProjects || []),
        ].filter(Boolean) as NonNullable<EngineeringEvidence['selectedProject']>[];
        return projects.some(project =>
            project.projectKinds.some(kind => kind === 'node' || kind === 'python' || kind === 'go')
            && project.manifests.some(manifest => Boolean(String(manifest.path || '').trim())),
        );
    }

    /**
     * Creates a small, evidence-derived requirement register from the compact
     * specification brief. It deliberately uses structural headings, rather than
     * product vocabulary, so the same rule applies to a library, an API, a CLI,
     * or a complete product specification.
     */
    private requirementScope(projectDescription: string): { targets: string[]; minPhases: number; requiresImplementation: boolean } {
        const source = String(projectDescription || '').replace(/\r\n?/g, '\n');
        const lines = source.split('\n').map(line => line.trim());
        const ignored = /^(?:source|authoritative requirements evidence|compact requirements evidence|end compact requirements evidence|project|requirements?|overview|introduction|table of contents)$/i;

        // Long prompts often begin with an execution protocol ("start Joe",
        // "observe", "diagnose", ...), followed by the actual product brief.
        // Those instructions are evidence about how to test the agent, not
        // product requirement areas. Prefer an explicit challenge/body marker
        // when one exists, while retaining the generic whole-request fallback.
        const startMarker = lines.findIndex(line => /^(?:(?:\d+[.)])\s*)?(?:main joe challenge|build (?:a )?production[ -]grade\b|authoritative requirements evidence)\s*$/i.test(line));
        const endMarker = lines.findIndex((line, index) => index > Math.max(0, startMarker) && /^(?:(?:\d+[.)])\s*)?(?:end of joe challenge|end compact requirements evidence)\s*$/i.test(line));
        const scopedLines = startMarker >= 0
            ? lines.slice(startMarker + 1, endMarker > startMarker ? endMarker : lines.length)
            : lines;

        // A contiguous numbered list is the most reliable register for specs
        // such as NEXUS. Stop only when numbering breaks after the list starts;
        // this avoids accidentally collecting later acceptance-test examples.
        const numbered: string[] = [];
        let expectedNumber: number | undefined;
        for (const line of scopedLines) {
            const match = line.match(/^(\d+)[.)]\s+(.+)$/);
            if (!match) {
                if (numbered.length && expectedNumber !== undefined && line) break;
                continue;
            }
            const number = Number(match[1]);
            if (expectedNumber !== undefined && number !== expectedNumber) {
                if (numbered.length >= 5) break;
                numbered.length = 0;
            }
            numbered.push(match[2].trim());
            expectedNumber = number + 1;
        }

        const headingCandidates = scopedLines
            .filter(line => /^(?:#{1,6}\s+|[A-Z][A-Z0-9 &/_-]{5,}$)/.test(line))
            .map(line => line.replace(/^#{1,6}\s+/, '').trim())
            .filter(line => line.length >= 5 && !ignored.test(line))
            .filter((line, index, values) => values.indexOf(line) === index);
        const targets = numbered.length >= 5 ? numbered : headingCandidates;
        // Keep the complete evidence-derived register. The executor still caps the
        // number of phases at eight, but truncating the register here made a
        // long implementation brief look complete after covering only its first
        // 18 areas (the observed NEXUS false-positive).
        const requiresImplementation = /(?:\b(?:build|implement|develop|create|execute|repair|fix|resolve|patch|refactor|modify|update)\b|(?:ابن|نف[ّذذ]|طو[ّو]ر|طبق|اصلح|أصلح|إصلاح|عال[جج]|عالج|عدّل|تعديل|طوّر))/i.test(source);
        return {
            targets,
            minPhases: Math.min(8, Math.max(3, Math.ceil(targets.length / 3))),
            requiresImplementation,
        };
    }

    private scopePlanningInstructions(projectDescription: string, repairMode = false): string {
        if (repairMode) {
            return 'BOUNDED REPAIR CONTRACT: this is a live-repair attempt after a concrete launchability or runnable-contract failure. Scope is limited to the evidence-backed manifest, entrypoint, start/build command, or smallest required dependency/configuration fix. Use 1-3 phases maximum, map the bounded repair to R1, create concrete file-level implementation artifacts, and verify the existing build/tests plus one real start/readiness check. Do not redesign, regenerate, or cover the original multi-domain request.';
        }
        const scope = this.requirementScope(projectDescription);
        if (!scope.requiresImplementation || scope.targets.length < 5) {
            return 'Map each phase to the specific requirement statements it advances. Documentation may be a planning phase, but it is not evidence that an implementation request is delivered.';
        }
        return `SCOPE COVERAGE CONTRACT: the inspected specification has ${scope.targets.length} distinct requirement areas. Return at least ${scope.minPhases} execution phases. A documentation-only phase cannot be the complete delivery. Include concrete non-document implementation artifacts and verification phases, and map every requirement area below to one or more phases via requirementsCovered. Requirement register: ${scope.targets.map((target, index) => `R${index + 1}: ${target}`).join(' | ')}`;
    }

    private assessPlanScope(plan: any, projectDescription: string, repairMode = false): { ok: boolean; message: string; targets: string[]; phases: number; implementationArtifacts: number; coveredTargets: number; coveredTargetNames: string[]; missingTargetNames: string[] } {
        const scope = this.requirementScope(projectDescription);
        const phases = Array.isArray(plan?.phases) ? plan.phases : [];
        if (repairMode) {
            const implementationArtifacts = this.countImplementationArtifacts(phases);
            const boundedTargets = ['bounded runnable-contract repair'];
            const boundedCovered = phases.some((phase: any) => {
                const covered = Array.isArray(phase?.requirementsCovered) ? phase.requirementsCovered : [];
                return covered.some((entry: any) => /^R1(?:\s*[:.)-]|\s|$)/i.test(String(entry || '').trim()))
                    || /(?:manifest|package\.json|entrypoint|start|build|launch|runnable|readiness|dependency|configuration)/i.test(JSON.stringify(phase));
            });
            const problems: string[] = [];
            if (phases.length < 1 || phases.length > 3) problems.push(`it has ${phases.length} phase(s), but bounded repair allows 1-3`);
            if (implementationArtifacts < 1) problems.push('it has no non-document implementation artifact task');
            if (!boundedCovered) problems.push('it does not reference the bounded runnable-contract repair');
            return {
                ok: problems.length === 0,
                message: problems.length ? `Bounded repair plan is invalid: ${problems.join('; ')}.` : 'Bounded repair scope is sufficient for controlled execution.',
                targets: boundedTargets,
                phases: phases.length,
                implementationArtifacts,
                coveredTargets: boundedCovered ? 1 : 0,
                coveredTargetNames: boundedCovered ? boundedTargets : [],
                missingTargetNames: boundedCovered ? [] : boundedTargets,
            };
        }
        if (!scope.requiresImplementation || scope.targets.length < 5) {
            return { ok: true, message: 'Scope is not a large multi-domain implementation request.', targets: scope.targets, phases: phases.length, implementationArtifacts: 0, coveredTargets: 0, coveredTargetNames: [], missingTargetNames: [] };
        }
        const allTasks = phases.flatMap((phase: any) => Array.isArray(phase?.tasks) ? phase.tasks : []);
        const implementationArtifacts = this.countImplementationArtifacts(phases);
        const planText = phases.map((phase: any) => JSON.stringify({
            name: phase?.name,
            description: phase?.description,
            requirementsCovered: phase?.requirementsCovered,
            deliverables: phase?.deliverables,
            tasks: (phase?.tasks || []).map((task: any) => ({ task: task?.task, description: task?.args?.description, path: task?.args?.path }))
        })).join('\n').toLowerCase();
        // The planning contract names register entries as R1, R2, … so a model
        // may correctly map a phase using those stable IDs instead of copying a
        // long requirement title. Count those references as evidence-backed
        // coverage, while retaining token matching for human-readable headings.
        const referencedRequirementNumbers = new Set<number>();
        phases.forEach((phase: any) => {
            const covered = Array.isArray(phase?.requirementsCovered) ? phase.requirementsCovered : [];
            covered.forEach((entry: any) => {
                const match = String(entry || '').trim().match(/^R(\d+)(?:\\s*[:.)-]|\\s|$)/i);
                if (match) referencedRequirementNumbers.add(Number(match[1]));
            });
        });
        const coveredTargetNames = scope.targets.filter((target, index) => {
            if (referencedRequirementNumbers.has(index + 1)) return true;
            const tokens = target.toLowerCase().match(/[\p{L}\p{N}_-]{4,}/gu) || [];
            return tokens.length > 0 && tokens.some(token => planText.includes(token));
        });
        const missingTargetNames = scope.targets.filter(target => !coveredTargetNames.includes(target));
        const coveredTargets = coveredTargetNames.length;
        const requiredCoverage = Math.max(3, Math.ceil(scope.targets.length * 0.7));
        const problems: string[] = [];
        if (phases.length < scope.minPhases) problems.push(`it has ${phases.length} phase(s), but the evidence requires at least ${scope.minPhases}`);
        if (implementationArtifacts < 2) problems.push(`it has only ${implementationArtifacts} non-document implementation artifact task(s)`);
        if (coveredTargets < requiredCoverage) problems.push(`it maps only ${coveredTargets}/${scope.targets.length} requirement areas (minimum ${requiredCoverage})`);
        return {
            ok: problems.length === 0,
            message: problems.length ? `Planner produced an under-scoped plan: ${problems.join('; ')}. No implementation was started.` : 'Plan coverage is sufficient for controlled execution.',
            targets: scope.targets,
            phases: phases.length,
            implementationArtifacts,
            coveredTargets,
            coveredTargetNames,
            missingTargetNames,
        };
    }

    private parsePlan(response: string) {
        const markdownMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        let jsonStr = markdownMatch ? markdownMatch[1] : response;
        if (!markdownMatch) {
            const braceMatch = jsonStr.match(/\{[\s\S]*\}/);
            if (braceMatch) jsonStr = braceMatch[0];
        }
        jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');
        const plan = JSON.parse(jsonStr);
        if (!Array.isArray(plan.phases)) throw new Error('Missing phases array in JSON');
        return plan;
    }

    private responseDiagnostic(response: any): { type: string; length: number; prefix: string; suffix: string } {
        const text = typeof response === 'string' ? response : JSON.stringify(response ?? null);
        return {
            type: typeof response,
            length: text.length,
            prefix: text.slice(0, 240),
            suffix: text.slice(-240),
        };
    }

    private planContractDiagnostic(plan: any): any[] {
        return (Array.isArray(plan?.phases) ? plan.phases : []).map((phase: any) => ({
            name: String(phase?.name || ''),
            tasks: (Array.isArray(phase?.tasks) ? phase.tasks : []).map((task: any) => ({
                tool: String(task?.tool || ''),
                task: String(task?.task || '').slice(0, 180),
                path: String(task?.args?.path || task?.args?.filePath || task?.args?.targetPath || ''),
                structureKeys: task?.args?.structure && typeof task.args.structure === 'object'
                    ? Object.keys(task.args.structure).slice(0, 20)
                    : [],
            })),
        }));
    }

    /**
     * Convert only the dependency choice that the portability contract rejected.
     * This is not a product template and it does not create files: it preserves
     * the model's phase/task structure, removes native install assumptions from
     * package manifests, and lets the normal sanitiser decide whether the result
     * is still executable. It is the bounded last mile after the model has failed
     * both portability-recovery turns.
     */
    private rewriteUnportableNativePlan(plan: any): any {
        const nativeNames = /(?:better-sqlite3|node-sqlite3|sqlite3|bcrypt|node-sass|sharp|canvas|ffi-napi|ref-napi|isolated-vm|@tensorflow\/tfjs-node|cpu-features|bufferutil|utf-8-validate|node-gyp|prebuild-install|binding\.gyp|C\+\+\s+compiler)/i;
        const rewriteText = (value: string): string => value
            .replace(/better-sqlite3|node-sqlite3|sqlite3/gi, 'node:sqlite or JSON file fallback')
            .replace(/\bbcrypt\b/gi, 'node:crypto scrypt')
            .replace(/\bnode-sass\b/gi, 'sass')
            .replace(/\b(?:sharp|canvas)\b/gi, 'portable runtime image processing')
            .replace(/\b(?:ffi-napi|ref-napi|isolated-vm|@tensorflow\/tfjs-node|cpu-features|bufferutil|utf-8-validate)\b/gi, 'portable runtime fallback')
            .replace(/\b(?:node-gyp|prebuild-install|binding\.gyp)\b/gi, 'native toolchain')
            .replace(/C\+\+\s+compiler/gi, 'host compiler');
        const rewritePackageContent = (raw: string): string => {
            try {
                const parsed = JSON.parse(raw);
                for (const bucket of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
                    if (!parsed || typeof parsed[bucket] !== 'object' || !parsed[bucket]) continue;
                    for (const dependency of Object.keys(parsed[bucket])) {
                        if (nativeNames.test(dependency)) delete parsed[bucket][dependency];
                    }
                }
                return JSON.stringify(parsed, null, 2);
            } catch {
                return rewriteText(raw);
            }
        };
        const visit = (value: any, key = ''): any => {
            if (typeof value === 'string') {
                return key === 'content' && /(?:^|[\\/])package\.json$/i.test(String((plan as any)?.path || ''))
                    ? rewritePackageContent(value)
                    : rewriteText(value);
            }
            if (Array.isArray(value)) return value.map(item => visit(item, key));
            if (!value || typeof value !== 'object') return value;
            const out: any = {};
            for (const [childKey, childValue] of Object.entries(value)) {
                if (childKey === 'tool') out[childKey] = childValue;
                else if (childKey === 'content' && typeof childValue === 'string' && /package\.json$/i.test(String(value.path || value.filePath || ''))) {
                    out[childKey] = rewritePackageContent(childValue);
                } else {
                    out[childKey] = visit(childValue, childKey);
                }
            }
            return out;
        };
        return visit(JSON.parse(JSON.stringify(plan || {})));
    }

    private countImplementationArtifacts(phases: any[]): number {
        const implementationTools = new Set([
            'ai_write_file', 'write_file', 'file_edit', 'edit_file', 'project_edit',
            'file_edit_advanced', 'scaffold_project', 'scaffold_full_stack',
            'react_project', 'api_project', 'web_page_builder', 'mobile_builder',
            'auth_builder', 'db_schema_migrator',
        ]);
        const isDocumentPath = (value: unknown): boolean =>
            /(?:^|[\\/])[^\\/]+\.(?:md|mdx|txt|rst|adoc)$/i.test(String(value || '').trim());
        const scaffoldHasImplementationFile = (task: any): boolean => {
            const structure = task?.args?.structure;
            if (!structure || typeof structure !== 'object' || Array.isArray(structure)) return false;
            return Object.entries(structure).some(([relativePath, contents]) => {
                // Null values represent directories in the scaffold contract, not
                // implementation artifacts. A scaffold containing only README or
                // challenge notes must not satisfy an implementation request.
                if (contents === null || isDocumentPath(relativePath)) return false;
                return Boolean(String(relativePath || '').trim());
            });
        };
        return (Array.isArray(phases) ? phases : []).flatMap((phase: any) => Array.isArray(phase?.tasks) ? phase.tasks : [])
            .filter((task: any) => {
                const tool = String(task?.tool || '').toLowerCase();
                if (!implementationTools.has(tool)) return false;
                if (tool === 'scaffold_project') return scaffoldHasImplementationFile(task);
                const target = String(task?.args?.path || task?.args?.filePath || task?.args?.targetPath || '').trim();
                return !isDocumentPath(target);
            }).length;
    }

    /**
     * JSON validity is weaker than a planning contract. A successful provider
     * response containing an empty phases array is not a plan and must be
     * retried before the pipeline can honestly stop. This shape check is
     * deliberately tool-agnostic: tool contracts are enforced later by the
     * plan sanitiser, while this guard only rejects empty/truncated planning.
     */
    private hasPlanningShape(plan: any): boolean {
        return Array.isArray(plan?.phases)
            && plan.phases.length > 0
            && plan.phases.some((phase: any) => Array.isArray(phase?.tasks) && phase.tasks.length > 0);
    }

    private createRecoveryPlanningPrompt(projectDescription: string, analysis?: any, evidence?: EngineeringEvidence, failureReason = '', coverage?: { coveredTargetNames?: string[]; missingTargetNames?: string[] }): string {
        const scope = this.requirementScope(projectDescription);
        const register = scope.targets.length
            ? scope.targets.map((target, index) => `R${index + 1}: ${target}`).join(' | ')
            : '(No reliable heading register was extracted; use the explicit requirements only.)';
        const missing = Array.isArray(coverage?.missingTargetNames) ? coverage.missingTargetNames : [];
        const covered = Array.isArray(coverage?.coveredTargetNames) ? coverage.coveredTargetNames : [];
        const coverageLedger = missing.length
            ? `VALIDATOR COVERAGE LEDGER:\nCovered areas (do not drop them): ${covered.join(' | ') || '(none)'}\nMissing areas (mandatory in the repaired plan): ${missing.join(' | ')}\nEvery missing area must appear in at least one phase requirementsCovered array and must be advanced by a concrete implementation task; do not merely mention it in prose.`
            : '';
        return `The previous planning response was unusable: ${failureReason}

${coverageLedger}

You must now produce the smallest honest, executable engineering plan for the request below.
Do not explain the failure. Do not return an empty phases array. Do not return prose or Markdown fences.
COMPACT OUTPUT CONTRACT: use no more than 8 phases and no more than 4 tasks per phase; keep every description, deliverable, verificationTask, and args.description to one short sentence (preferably under 180 characters); use R-number IDs in requirementsCovered; never inline source code, generated HTML, long Markdown, logs, or repeated evidence. For implementation files, prefer ai_write_file with a precise short description and safe path. If scaffold_project is necessary, include only a minimal runnable package/config and one small entrypoint, then create the real files in later tasks. Keep the whole JSON response small enough to finish before the output limit.
Return ONLY one JSON object with projectName, projectVibe, totalPhases, estimatedDuration, phases, dependencies.
Return at least ${scope.minPhases} phases when the requirement register is large, and every phase must contain a non-empty tasks array, a concrete deliverable that will exist on disk, and requirementsCovered.
Use only real tools from the executable catalogue below. At least one task in an implementation request must create or modify a non-document source/config/test artifact. Do not use documentation as a substitute for implementation. File tasks must have safe workspace-relative paths and complete arguments. Do not claim that any task has already run.

SCAFFOLD RECOVERY CONTRACT:
If you use scaffold_project, args.structure MUST be a non-empty JSON object. Its keys must be safe workspace-relative paths, and its values must be file contents or null only for empty directories. The structure must include at least one real implementation artifact such as a source file (.ts, .tsx, .js, .jsx, .py, .go), an executable test, or a configuration file such as package.json/tsconfig.json that belongs to the requested stack. A structure containing only README.md, Markdown/TXT notes, or null directories is invalid and will be rejected. For example, adapt this pattern to the evidence and requirements (do not copy the app or invent a stack): {"package.json":"{\\"private\\":true}","src/index.ts":"export const app = true;","test/app.test.ts":"import { app } from \\\"../src/index\\\"; test(\\\"app\\\", () => expect(app).toBe(true));"}. If the request is greenfield without an explicit or evidence-backed stack, the repaired plan may use scaffold_project only when it contains a clearly labeled, concrete planner stack decision grounded in the request and a non-document implementation artifact reflecting that decision. Do not silently inherit a hidden framework or copy a fixed template. Never satisfy a recovery by adding documentation alone.

EXECUTABLE TOOL CATALOGUE AND CONTRACT:
${plannerToolPrompt()}

Requirement register: ${register}

PROJECT REQUEST:
${projectDescription}

${analysis ? `ANALYSIS:\n${JSON.stringify(analysis, null, 2)}\n` : ''}${evidence ? `ENGINEERING_EVIDENCE:\n${JSON.stringify(evidence, null, 2)}\n` : ''}
${this.scopePlanningInstructions(projectDescription)}`;
    }

    /**
     * A planner outage must not turn into a hidden framework decision.  The old
     * fallback generated a scaffold and a README even when the model had not
     * produced a defensible plan.  This result is intentionally non-deliverable:
     * the pipeline reports it as blocked and preserves the discovery evidence for
     * a retry or an explicit user decision.
     */
    private fallbackPlan(projectDescription: string, analysis?: any, evidence?: EngineeringEvidence): any {
        const projectName = projectDescription.split(' ').slice(0, 3).join(' ') || 'Engineering task';
        const projectRoot = evidence?.selectedProject?.root || evidence?.workspaceRoot || '.';
        const mode = evidence?.mode || 'ambiguous';
        return {
            projectName,
            projectVibe: 'Evidence required before implementation',
            totalPhases: 0,
            estimatedDuration: 'blocked pending a valid evidence-backed plan',
            phases: [],
            dependencies: {},
            fallback: true,
            deliveryStatus: 'blocked',
            executionStatus: 'not_started',
            verificationStatus: 'not_run',
            blocker: {
                code: 'planner_unavailable_or_invalid',
                message: `No valid engineering plan was produced for ${mode} workspace ${projectRoot}.`,
                remedy: 'Retry planning after discovery, select one project when multiple roots exist, or provide an explicit implementation constraint.'
            },
            evidenceSummary: {
                mode,
                workspaceRoot: evidence?.workspaceRoot,
                selectedProject: evidence?.selectedProject?.root,
                candidateChecks: evidence?.selectedProject?.candidateChecks || [],
                blockerCount: evidence?.blockers?.length || 0,
            },
        };
    }

    private validatePlan(plan: any, projectDescription: string): any {
        // Keep the planner's execution-state contract intact.  In particular,
        // fallback/blocker are evidence that planning is intentionally blocked;
        // reconstructing only display fields erased that evidence and made the
        // pipeline report the misleading generic error “planner returned no phases”.
        return {
            ...plan,
            projectName: plan.projectName || 'New Project',
            projectVibe: plan.projectVibe || 'Professional Engineering',
            totalPhases: typeof plan.totalPhases === 'number' ? plan.totalPhases : 3,
            estimatedDuration: plan.estimatedDuration || '1-2 hours',
            phases: Array.isArray(plan.phases) ? plan.phases : [],
            dependencies: plan.dependencies || {},
            originalDescription: projectDescription.slice(0, 200)
        };
    }
}
