import { ToolDefinition, ToolPermission } from '../types';

import path from 'path';
import { callLLM } from '../../../core/llm';
import { isProviderFailure } from '../../../core/llm/intelligent-router';
import { plannerToolPrompt, sanitisePlanPhases } from '../../../core/orchestrator/plan-tools';
import { EngineeringEvidence } from './EngineeringDiscoveryTool';

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
        const { projectDescription, analysis, evidence } = input || ({} as any);
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
            const planningPrompt = this.createPlanningPrompt(projectDescription, analysis, this.planningEvidence(evidence));
            const response = await callLLM(planningPrompt, [
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
            });

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

            logs.push('LLM planning completed');

            let plan: any;
            try {
                plan = this.parsePlan(response);
                if (!this.hasPlanningShape(plan)) {
                    throw new Error('Planner returned valid JSON without a non-empty phases/tasks plan');
                }
            } catch (parseError) {
                logs.push(`Initial planner response was not executable JSON: ${parseError}`);
                // A provider can answer successfully with prose, `{ phases: [] }`,
                // or a truncated JSON object. Those are provider answers, not
                // engineering plans. Give the same provider one bounded, stricter
                // planning turn before declaring the run blocked; never invent a
                // scaffold from a malformed response.
                try {
                    const retryPrompt = this.createRecoveryPlanningPrompt(
                        projectDescription,
                        analysis,
                        this.planningEvidence(evidence),
                        String(parseError)
                    );
                    const retryResponse = await callLLM(retryPrompt, [
                        { role: 'system', content: 'You are a senior software project manager. Return only valid JSON with executable phases and tasks.' }
                    ], {
                        modelConfig: context?.modelConfig,
                        providerTimeoutMs: Number(context?.plannerTimeoutMs) > 0 ? Number(context.plannerTimeoutMs) : 120000,
                        maxCompletionTokens: Number(context?.plannerMaxCompletionTokens) > 0 ? Number(context.plannerMaxCompletionTokens) : 12000,
                        reasoningEffort: context?.plannerReasoningEffort || 'low',
                    });
                    if (isProviderFailure(retryResponse)) throw new Error(retryResponse);
                    plan = this.parsePlan(retryResponse);
                    if (!this.hasPlanningShape(plan)) {
                        throw new Error('Recovery planner returned valid JSON without a non-empty phases/tasks plan');
                    }
                    logs.push('Planner recovery completed with a non-empty execution plan');
                } catch (retryError: any) {
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
            const workspaceRoot = evidence?.workspaceRoot || evidence?.selectedProject?.root || '';
            const evidencedPaths = [
                ...(evidence?.selectedProject?.manifests || []).map(item => item.path),
                ...(evidence?.selectedProject?.likelyEntrypoints || []),
                ...(evidence?.instructionFiles || []).map(item => item.relativePath),
            ].map(item => {
                const source = String(item || '');
                return workspaceRoot && path.isAbsolute(source) ? path.relative(workspaceRoot, source) : source;
            }).filter(Boolean);
            let clean = sanitisePlanPhases(plan.phases, plan.projectName, {
                // In a blank root, a framework seed is a product decision rather
                // than a harmless implementation detail. The user must name a
                // stack, or discovery must prove one, before Joe can choose it.
                disallowImplicitScaffold: evidence?.mode === 'greenfield' && !hasExplicitStack,
                evidencedPaths,
                candidateCheckCommands: (evidence?.selectedProject?.candidateChecks || []).map(check => check.command),
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
                try {
                    const retryPrompt = this.createRecoveryPlanningPrompt(
                        projectDescription,
                        analysis,
                        this.planningEvidence(evidence),
                        `The parsed plan was non-empty, but contract sanitisation retained no non-document implementation artifact. Dropped-plan evidence: ${dropped}`
                    );
                    const retryResponse = await callLLM(retryPrompt, [
                        { role: 'system', content: 'You are a senior software project manager. Return only valid JSON with executable phases, exact tool contracts, and non-document implementation artifacts.' }
                    ], {
                        modelConfig: context?.modelConfig,
                        providerTimeoutMs: Number(context?.plannerTimeoutMs) > 0 ? Number(context.plannerTimeoutMs) : 120000,
                        maxCompletionTokens: Number(context?.plannerMaxCompletionTokens) > 0 ? Number(context.plannerMaxCompletionTokens) : 12000,
                        reasoningEffort: context?.plannerReasoningEffort || 'low',
                    });
                    if (isProviderFailure(retryResponse)) throw new Error(retryResponse);
                    const recoveredPlan = this.parsePlan(retryResponse);
                    if (!this.hasPlanningShape(recoveredPlan)) {
                        throw new Error('Contract recovery returned valid JSON without a non-empty phases/tasks plan');
                    }
                    const recoveredClean = sanitisePlanPhases(recoveredPlan.phases, recoveredPlan.projectName, {
                        disallowImplicitScaffold: evidence?.mode === 'greenfield' && !hasExplicitStack,
                        evidencedPaths,
                        candidateCheckCommands: (evidence?.selectedProject?.candidateChecks || []).map(check => check.command),
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
                }
            }

            // A malformed scaffold is a planning contract failure, not a reason
            // to manufacture a documentation artefact. Preserve the blocker so
            // the pipeline stops honestly and the user/model can supply evidence.
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
            let scopeAssessment = this.assessPlanScope(plan, projectDescription);
            if (!scopeAssessment.ok && requestedImplementation) {
                // A syntactically valid plan can still be materially incomplete. Do
                // not weaken the gate and do not invent missing phases locally: give
                // the planner one bounded, evidence-aware chance to cover the
                // requirement register it failed to map.
                logs.push(`[plan] scope coverage insufficient; starting one scope-aware recovery: ${scopeAssessment.message}`);
                try {
                    const scopeRecoveryPrompt = this.createRecoveryPlanningPrompt(
                        projectDescription,
                        analysis,
                        this.planningEvidence(evidence),
                        `The previous plan passed JSON and tool-contract validation but failed the coverage gate: ${scopeAssessment.message}. Re-plan the complete requirement register; do not preserve an under-scoped subset.`
                    );
                    const scopeRecoveryResponse = await callLLM(scopeRecoveryPrompt, [
                        { role: 'system', content: 'You are a senior software project manager. Return only valid JSON with complete requirement coverage, executable phases, exact tool contracts, and concrete non-document artifacts.' }
                    ], {
                        modelConfig: context?.modelConfig,
                        providerTimeoutMs: Number(context?.plannerTimeoutMs) > 0 ? Number(context.plannerTimeoutMs) : 120000,
                        maxCompletionTokens: Number(context?.plannerMaxCompletionTokens) > 0 ? Number(context.plannerMaxCompletionTokens) : 12000,
                        reasoningEffort: context?.plannerReasoningEffort || 'low',
                    });
                    if (isProviderFailure(scopeRecoveryResponse)) throw new Error(scopeRecoveryResponse);
                    const recoveredPlan = this.parsePlan(scopeRecoveryResponse);
                    if (!this.hasPlanningShape(recoveredPlan)) {
                        throw new Error('Scope recovery returned valid JSON without a non-empty phases/tasks plan');
                    }
                    const recoveredClean = sanitisePlanPhases(recoveredPlan.phases, recoveredPlan.projectName, {
                        disallowImplicitScaffold: evidence?.mode === 'greenfield' && !hasExplicitStack,
                        evidencedPaths,
                        candidateCheckCommands: (evidence?.selectedProject?.candidateChecks || []).map(check => check.command),
                    });
                    if (recoveredClean.blocker) {
                        throw new Error(`Scope recovery was blocked during contract sanitisation: ${recoveredClean.blocker.message}`);
                    }
                    if (this.countImplementationArtifacts(recoveredClean.phases) === 0) {
                        throw new Error('Scope recovery retained no non-document implementation artifact');
                    }
                    const recoveredValidatedPlan = this.validatePlan(recoveredPlan, projectDescription);
                    recoveredValidatedPlan.phases = recoveredClean.phases;
                    const recoveredAssessment = this.assessPlanScope(recoveredValidatedPlan, projectDescription);
                    if (!recoveredAssessment.ok) {
                        throw new Error(`Scope recovery remained under-scoped: ${recoveredAssessment.message}`);
                    }
                    plan = recoveredValidatedPlan;
                    clean = recoveredClean;
                    scopeAssessment = recoveredAssessment;
                    clean.notes.forEach(n => logs.push(n));
                    logs.push('Planner scope recovery completed with sufficient requirement coverage');
                } catch (scopeRecoveryError: any) {
                    logs.push(`Planner scope recovery failed: ${scopeRecoveryError?.message || scopeRecoveryError}`);
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
        return {
            ...evidence,
            workspaceRoot: '.',
            selectedProject: selected ? {
                ...selected,
                root: relative(selected.root) || '.',
                manifests: selected.manifests.map(item => ({ ...item, path: relative(item.path) })),
                likelyEntrypoints: selected.likelyEntrypoints.map(relative).filter(Boolean),
            } : undefined,
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

    private createPlanningPrompt(projectDescription: string, analysis?: any, evidence?: EngineeringEvidence) {
        // The vocabulary comes FIRST. Without it the model plans like a manager
        // — «Create project repository → Git», «Set up board → Jira» — and the
        // build dies on task one with unknown_tool. Telling it what this machine
        // can do is the difference between a plan and a wish.
        return `Create a realistic software engineering execution plan for this project.

${plannerToolPrompt()}

PROJECT:
${projectDescription}

${analysis ? `ANALYSIS:\n${JSON.stringify(analysis, null, 2)}\n` : ''}${evidence ? `ENGINEERING_EVIDENCE (facts, not suggestions):\n${JSON.stringify(evidence, null, 2)}\n` : ''}
	Rules: Inspect and modify an existing selected project before proposing a new scaffold. Every write task must refer to an evidence fact or an explicit user requirement. Use candidateChecks from the evidence for verification where available. Paths in every file-oriented tool argument must be safe workspace-relative paths; never use an absolute host path, a drive path, a network path, or the parent-directory marker '..'. A read_file task may read only an evidence path or a file created earlier in the same phase. Do not select product-named foundations or deployment tools solely because words in the request resemble them. If evidence is ambiguous or blocked, plan clarification or read-only analysis rather than writing files. If evidence.mode is greenfield and PROJECT does not explicitly name a programming stack or framework, do NOT use scaffold_project, scaffold_full_stack, react_project, api_project, web_page_builder, mobile_builder, npm_manager, dependency installers, or invented package scripts. Plan only the smallest independently testable portable slice as exact file-level tasks, or stop with a clear implementation-constraint question if that is not possible.
	${this.scopePlanningInstructions(projectDescription)}
	Return ONLY JSON with: projectName, projectVibe, totalPhases, estimatedDuration, phases, dependencies.
	Each phase must include: phaseNumber, name, description, tasks, verificationTask, deliverables, estimatedTime, requirementsCovered. The requirementsCovered field must be a non-empty array of requirement headings or requirement statements that this phase actually advances.
Tasks must include: task, tool, args, priority, realisticMinutes. A task using ai_write_file MUST include args.path (one safe relative destination inside the selected workspace) and args.description (specific technical contents for that one file); never use ai_write_file for a phase-level instruction without both fields. A task using write_file MUST include args.path and args.content. A task using doc_generator MUST include args.filePath for an existing evidenced source file. A task using test_generator MUST include args.filePath for one concrete source file, evidenced already or written by an earlier task in the same phase; never use it as a phase-level request to “test the application”. A task using auto_tester MUST include args.testType as exactly one of syntax, build, unit, integration and args.projectPath as a safe workspace-relative directory. A syntax test MUST also include args.files as a non-empty array of concrete source paths evidenced already or written earlier in the same phase. Build, unit, and integration tests may be planned only when discovery proved the corresponding package script exists; do not guess npm test or npm run build. A task using code_reviewer MUST include args.files as a non-empty array of concrete source paths, each evidenced already or written by an earlier task in the same phase; never use it as a vague phase-level request to “review quality”.
Every phase must produce something that EXISTS on disk when it finishes — code, a config, a test, a document.
Do not claim that anything was executed. The plan is for controlled orchestrator execution later.
Include build, browser QA, visual QA, and self-healing verification tasks where relevant.`;
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
        const targets = (numbered.length >= 5 ? numbered : headingCandidates).slice(0, 18);
        const requiresImplementation = /(?:\b(?:build|implement|develop|create|execute)\b|(?:ابن|نف[ّذذ]|طو[ّو]ر|طبق))/i.test(source);
        return {
            targets,
            minPhases: Math.min(8, Math.max(3, Math.ceil(targets.length / 3))),
            requiresImplementation,
        };
    }

    private scopePlanningInstructions(projectDescription: string): string {
        const scope = this.requirementScope(projectDescription);
        if (!scope.requiresImplementation || scope.targets.length < 5) {
            return 'Map each phase to the specific requirement statements it advances. Documentation may be a planning phase, but it is not evidence that an implementation request is delivered.';
        }
        return `SCOPE COVERAGE CONTRACT: the inspected specification has ${scope.targets.length} distinct requirement areas. Return at least ${scope.minPhases} execution phases. A documentation-only phase cannot be the complete delivery. Include concrete non-document implementation artifacts and verification phases, and map every requirement area below to one or more phases via requirementsCovered. Requirement register: ${scope.targets.map((target, index) => `R${index + 1}: ${target}`).join(' | ')}`;
    }

    private assessPlanScope(plan: any, projectDescription: string): { ok: boolean; message: string; targets: string[]; phases: number; implementationArtifacts: number; coveredTargets: number } {
        const scope = this.requirementScope(projectDescription);
        const phases = Array.isArray(plan?.phases) ? plan.phases : [];
        if (!scope.requiresImplementation || scope.targets.length < 5) {
            return { ok: true, message: 'Scope is not a large multi-domain implementation request.', targets: scope.targets, phases: phases.length, implementationArtifacts: 0, coveredTargets: 0 };
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
        const coveredTargets = scope.targets.filter(target => {
            const tokens = target.toLowerCase().match(/[\p{L}\p{N}_-]{4,}/gu) || [];
            return tokens.length > 0 && tokens.some(token => planText.includes(token));
        }).length;
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

    private countImplementationArtifacts(phases: any[]): number {
        const implementationTools = new Set([
            'ai_write_file', 'write_file', 'file_edit', 'edit_file', 'project_edit',
            'file_edit_advanced', 'scaffold_project', 'scaffold_full_stack',
            'react_project', 'api_project', 'web_page_builder', 'mobile_builder',
            'auth_builder', 'db_schema_migrator',
        ]);
        return (Array.isArray(phases) ? phases : []).flatMap((phase: any) => Array.isArray(phase?.tasks) ? phase.tasks : [])
            .filter((task: any) => {
                const tool = String(task?.tool || '').toLowerCase();
                if (!implementationTools.has(tool)) return false;
                const target = String(task?.args?.path || task?.args?.filePath || task?.args?.targetPath || '').toLowerCase();
                return !/\.(?:md|mdx|txt|rst|adoc)$/i.test(target);
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

    private createRecoveryPlanningPrompt(projectDescription: string, analysis?: any, evidence?: EngineeringEvidence, failureReason = ''): string {
        const scope = this.requirementScope(projectDescription);
        const register = scope.targets.length
            ? scope.targets.map((target, index) => `R${index + 1}: ${target}`).join(' | ')
            : '(No reliable heading register was extracted; use the explicit requirements only.)';
        return `The previous planning response was unusable: ${failureReason}

You must now produce the smallest honest, executable engineering plan for the request below.
Do not explain the failure. Do not return an empty phases array. Do not return prose or Markdown fences.
Return ONLY one JSON object with projectName, projectVibe, totalPhases, estimatedDuration, phases, dependencies.
Return at least ${scope.minPhases} phases when the requirement register is large, and every phase must contain a non-empty tasks array, a concrete deliverable that will exist on disk, and requirementsCovered.
Use only real tools from the executable catalogue below. At least one task in an implementation request must create or modify a non-document source/config/test artifact. Do not use documentation as a substitute for implementation. File tasks must have safe workspace-relative paths and complete arguments. Do not claim that any task has already run.

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
