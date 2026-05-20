import { ToolDefinition, ToolPermission } from '../types';

import { callLLM } from '../../../core/llm';

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
            analysis: { type: 'object' as const, description: 'Optional analysis from RequestAnalyzer' }
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

    async execute(input: { projectDescription: string; analysis?: any }) {
        const { projectDescription, analysis } = input;
        const logs: string[] = [];

        try {
            const planningPrompt = this.createPlanningPrompt(projectDescription, analysis);
            const response = await callLLM(planningPrompt, [
                { role: 'system', content: 'You are a senior software project manager. Return only valid JSON.' }
            ]);

            logs.push('LLM planning completed');

            let plan: any;
            try {
                plan = this.parsePlan(response);
            } catch (parseError) {
                logs.push(`JSON parse error: ${parseError}`);
                plan = this.fallbackPlan(projectDescription, analysis);
            }

            plan = this.validatePlan(plan, projectDescription);
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
                    ...this.fallbackPlan(projectDescription, analysis),
                    autoExecuted: false,
                    executionPolicy: 'planner_only'
                },
                logs
            };
        }
    }

    private createPlanningPrompt(projectDescription: string, analysis?: any) {
        return `Create a realistic software engineering execution plan for this project.\n\nPROJECT:\n${projectDescription}\n\n${analysis ? `ANALYSIS:\n${JSON.stringify(analysis, null, 2)}\n` : ''}\nReturn ONLY JSON with: projectName, projectVibe, totalPhases, estimatedDuration, phases, dependencies.\nEach phase must include: phaseNumber, name, description, tasks, verificationTask, deliverables, estimatedTime.\nTasks must include: task, tool, args, priority, realisticMinutes.\nDo not claim that anything was executed. The plan is for controlled orchestrator execution later.\nInclude build, browser QA, visual QA, and self-healing verification tasks where relevant.`;
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

    private fallbackPlan(projectDescription: string, analysis?: any): any {
        const projectName = projectDescription.split(' ').slice(0, 3).join(' ') || 'New Project';
        const safeDirName = projectName.replace(/[^a-zA-Z0-9-_\u0600-\u06FF]/g, '-').replace(/-+/g, '-').slice(0, 30) || 'new-project';
        const complexity = analysis?.complexity || 'medium';
        const phaseCount = complexity === 'simple' ? 3 : complexity === 'complex' ? 5 : 4;

        return {
            projectName,
            projectVibe: 'Professional Engineering',
            totalPhases: phaseCount,
            estimatedDuration: `${phaseCount * 30} minutes`,
            phases: [
                {
                    phaseNumber: 1,
                    name: 'Project Setup',
                    description: 'Initialize project structure and dependencies',
                    tasks: [
                        {
                            task: 'Create project directory and base files',
                            tool: 'scaffold_project',
                            args: { baseDir: safeDirName },
                            priority: 'high',
                            realisticMinutes: 15
                        }
                    ],
                    verificationTask: { task: 'Detect project structure', tool: 'project_detect', args: {} },
                    deliverables: ['Base project structure'],
                    estimatedTime: '15 minutes'
                },
                {
                    phaseNumber: 2,
                    name: 'Core Implementation',
                    description: 'Implement core files and features',
                    tasks: [
                        {
                            task: 'Generate core application files',
                            tool: 'ai_write_file',
                            args: {
                                path: `${safeDirName}/README.md`,
                                description: `Document and scaffold the core implementation plan for: ${projectDescription}`
                            },
                            priority: 'high',
                            realisticMinutes: 45
                        }
                    ],
                    verificationTask: { task: 'Run build check', tool: 'shell_execute', args: { command: 'npm run build' } },
                    deliverables: ['Core implementation'],
                    estimatedTime: '45 minutes'
                },
                {
                    phaseNumber: 3,
                    name: 'QA & Production Readiness',
                    description: 'Verify build, browser behavior, visual quality, and readiness',
                    tasks: [
                        { task: 'Run quality checks', tool: 'quality_run', args: {}, priority: 'high', realisticMinutes: 20 },
                        { task: 'Run browser verification', tool: 'browser_run', args: { actions: [{ type: 'ui_audit' }] }, priority: 'high', realisticMinutes: 20 }
                    ],
                    verificationTask: { task: 'Final project detection', tool: 'project_detect', args: {} },
                    deliverables: ['QA report', 'Readiness summary'],
                    estimatedTime: '40 minutes'
                }
            ],
            dependencies: { phase2: ['phase1'], phase3: ['phase2'] },
            fallback: true
        };
    }

    private validatePlan(plan: any, projectDescription: string): any {
        return {
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
