import { StructuredIntent } from '../intelligence/IntentParser';
import { routeToModel, TaskAnalysis } from '../llm/intelligent-router';

export interface ExecutionStep {
    id: string;
    description: string;
    tool: string;
    agent: string;
    input: Record<string, any>;
    dependsOn: string[];
    fallbackStrategy?: 'retry' | 'skip' | 'abort' | 'alternative';
}

export interface ExecutionPlan {
    id: string;
    goal: string;
    steps: ExecutionStep[];
    metadata: {
        complexity: string;
        riskLevel: string;
        estimatedDurationMs?: number;
    };
}

export class PlanningEngine {
    /**
     * Generate a multi-step execution plan based on the intent
     */
    static async generatePlan(intent: StructuredIntent): Promise<ExecutionPlan> {
        console.log(`[PlanningEngine] Generating dynamic plan for goal: ${intent.goal}`);

        // [DYNAMIC PLANNING] Use LLM to generate a structured step-by-step plan
        const systemPrompt = `You are an Autonomous Software Engineering Planner.
Break down the goal into a logical sequence of execution steps.
Each step must specify:
1. "task": Clear description of what to do.
2. "tool": Best tool for the job (shell_execute, read_file, write_file, browser_run, grep_search, ls, npm_manager).
3. "agent": Specialization required (Dev, Security, Browser).

Return ONLY a JSON array of steps:
[
  { "id": "step_1", "task": "description", "tool": "tool_name", "agent": "agent_name", "dependsOn": [] }
]`;

        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Goal: ${intent.goal}\nComplexity: ${intent.complexity}` }
        ];

        try {
            const response = await routeToModel(messages, intent.rawIntent as TaskAnalysis);
            const jsonMatch = response.match(/\[[\s\S]*\]/);
            
            if (jsonMatch) {
                const rawSteps = JSON.parse(jsonMatch[0]);
                const steps: ExecutionStep[] = rawSteps.map((s: any) => ({
                    id: s.id,
                    description: s.task,
                    tool: s.tool || 'shell_execute',
                    agent: s.agent || 'Dev',
                    input: { instruction: s.task },
                    dependsOn: s.dependsOn || []
                }));

                return {
                    id: `plan_${Date.now()}`,
                    goal: intent.goal,
                    steps,
                    metadata: {
                        complexity: intent.complexity,
                        riskLevel: intent.riskLevel
                    }
                };
            }
        } catch (err) {
            console.error('[PlanningEngine] Dynamic planning failed, falling back to basic plan:', err);
        }

        // Emergency Fallback (Dynamic but minimal)
        return {
            id: `plan_${Date.now()}`,
            goal: intent.goal,
            steps: [{
                id: 'step_1',
                description: intent.goal,
                tool: 'auto_agent',
                agent: intent.suggestedAgent,
                input: { goal: intent.goal },
                dependsOn: []
            }],
            metadata: {
                complexity: intent.complexity,
                riskLevel: intent.riskLevel
            }
        };
    }
}
