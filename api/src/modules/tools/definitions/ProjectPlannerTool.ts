import { ToolDefinition, ToolPermission } from '../types';

import { callLLM } from '../../../core/llm';
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

    async execute(input: { projectDescription: string; analysis?: any; evidence?: EngineeringEvidence }) {
        const { projectDescription, analysis, evidence } = input || ({} as any);
        const logs: string[] = [];
        // A missing required argument is a QUESTION, not a crash. The registry
        // audit called every read-only tool with {} and six of them threw a raw
        // TypeError — which is what the user sees when a planner omits a field.
        if (!String(projectDescription || '').trim()) {
            return { ok: false, error: 'project_planner needs projectDescription — describe the project to plan.', logs } as any;
        }

        try {
            const planningPrompt = this.createPlanningPrompt(projectDescription, analysis, evidence);
            const response = await callLLM(planningPrompt, [
                { role: 'system', content: 'You are a senior software project manager. Return only valid JSON.' }
            ]);

            logs.push('LLM planning completed');

            let plan: any;
            try {
                plan = this.parsePlan(response);
            } catch (parseError) {
                logs.push(`JSON parse error: ${parseError}`);
                plan = this.fallbackPlan(projectDescription, analysis, evidence);
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
            const clean = sanitisePlanPhases(plan.phases, plan.projectName, {
                // In a blank root, a framework seed is a product decision rather
                // than a harmless implementation detail. The user must name a
                // stack, or discovery must prove one, before Joe can choose it.
                disallowImplicitScaffold: evidence?.mode === 'greenfield' && !hasExplicitStack,
            });
            plan.phases = clean.phases;
            clean.notes.forEach(n => logs.push(n));

            // A plan with nothing runnable in it is not a plan. The deterministic
            // fallback names only tools that exist, so it always executes.
            if (clean.executableTasks === 0) {
                logs.push('[plan] لم يبق في الخطة أي عمل قابل للتنفيذ — رجعتُ إلى خطة مضمونة بأدوات حقيقية.');
                plan = this.validatePlan(this.fallbackPlan(projectDescription, analysis, evidence), projectDescription);
            }
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
	Rules: Inspect and modify an existing selected project before proposing a new scaffold. Every write task must refer to an evidence fact or an explicit user requirement. Use candidateChecks from the evidence for verification where available. Do not select product-named foundations or deployment tools solely because words in the request resemble them. If evidence is ambiguous or blocked, plan clarification or read-only analysis rather than writing files. If evidence.mode is greenfield and PROJECT does not explicitly name a programming stack or framework, do NOT use scaffold_project, scaffold_full_stack, react_project, api_project, web_page_builder, mobile_builder, npm_manager, dependency installers, or invented package scripts. Plan only the smallest independently testable portable slice as exact file-level tasks, or stop with a clear implementation-constraint question if that is not possible.
	Return ONLY JSON with: projectName, projectVibe, totalPhases, estimatedDuration, phases, dependencies.
Each phase must include: phaseNumber, name, description, tasks, verificationTask, deliverables, estimatedTime.
Tasks must include: task, tool, args, priority, realisticMinutes. A task using ai_write_file MUST include args.path (one safe relative destination inside the selected workspace) and args.description (specific technical contents for that one file); never use ai_write_file for a phase-level instruction without both fields. A task using write_file MUST include args.path and args.content. A task using doc_generator MUST include args.filePath for an existing evidenced source file. A task using test_generator MUST include args.filePath for one concrete source file, evidenced already or written by an earlier task in the same phase; never use it as a phase-level request to “test the application”.
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
