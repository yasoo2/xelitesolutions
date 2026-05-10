import { StructuredIntent } from '../intelligence/IntentParser';
import { generateActionPlan, TaskAnalysis } from '../llm/intelligent-router';

export interface ExecutionStep {
    id: string;
    description: string;
    tool: string;
    input: Record<string, any>;
    dependsOn: string[];
    fallbackStrategy?: 'retry' | 'skip' | 'abort' | 'alternative';
    alternativeTool?: string;
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
        console.log(`[PlanningEngine] Generating plan for goal: ${intent.goal}`);

        const analysis: TaskAnalysis = {
            type: intent.rawIntent.primary === 'browser_task' ? 'browser_task' : 'code_generation',
            complexity: intent.complexity,
            requiresTools: true,
            estimatedTokens: 0,
            language: 'en', // Default, router will refine
            hasImages: false
        };

        const rawSteps = await generateActionPlan(intent.goal, analysis);
        
        const steps: ExecutionStep[] = rawSteps.map((stepDesc, index) => {
            // Basic heuristic for tool assignment
            let tool = 'shell_execute';
            if (stepDesc.toLowerCase().includes('search') || stepDesc.toLowerCase().includes('find')) tool = 'grep_search';
            if (stepDesc.toLowerCase().includes('browse') || stepDesc.toLowerCase().includes('click')) tool = 'browser_run';
            if (stepDesc.toLowerCase().includes('list') || stepDesc.toLowerCase().includes('files')) tool = 'ls';

            return {
                id: `step_${index + 1}`,
                description: stepDesc,
                tool,
                input: { instruction: stepDesc }, // Simplified input, Orchestrator will refine
                dependsOn: index > 0 ? [`step_${index}`] : [],
                fallbackStrategy: 'retry'
            };
        });

        // If no steps generated, create a single "intelligent" step
        if (steps.length === 0) {
            steps.push({
                id: 'step_1',
                description: intent.goal,
                tool: 'auto_agent', // A hypothetical unified tool or just delegation back to LLM
                input: { goal: intent.goal },
                dependsOn: []
            });
        }

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
}
