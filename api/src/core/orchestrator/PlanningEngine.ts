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
     * Generate a dynamic multi-step execution DAG based on intent and optional memory
     */
    static async generatePlan(params: { intent: StructuredIntent, memory?: any }, traceId?: string, context?: any): Promise<ExecutionPlan> {
        const { intent, memory } = params;
        console.log(`[PlanningEngine] Generating REAL-TIME DAG for: ${intent.goal}`);

        const historyContext = memory ? `\nPrevious Execution History:\n${JSON.stringify(memory)}` : "";

        const entropySeed = Math.random().toString(36).substring(7);
        const systemPrompt = `You are a Professional Software Architecture Planner.
Generate a dynamic Execution DAG (Directed Acyclic Graph) for the given goal.

Entropy Seed: ${entropySeed} (Use this to explore different optimal paths if possible)

Constraints:
- Use ONLY existing tools: shell_execute, read_file, write_file, browser_run, grep_search, ls, npm_manager.
- Define explicit dependencies (dependsOn).
- Assign an agent to each node: Dev, Security, Browser, General.
- DO NOT use static templates. Analyze the specific goal from a fresh perspective.
- Provide a brief "reasoning" field for EACH step explaining why this path was chosen.

Goal: ${intent.goal}
Complexity: ${intent.complexity}
Risk: ${intent.riskLevel}${historyContext}

Return ONLY a JSON array of steps:
[
  { 
    "id": "node_id", 
    "task": "precise task description", 
    "tool": "tool_name", 
    "agent": "agent_type", 
    "input": { "instruction": "..." }, 
    "dependsOn": ["prev_node_id"] 
  }
]`;

        try {
            // Using routeToModel for planning
            const response = await routeToModel([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Analyze goal and generate DAG for: ${intent.goal}` }
            ], undefined, undefined, undefined, undefined, undefined, undefined, context);

            const jsonMatch = response.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                const rawSteps = JSON.parse(jsonMatch[0]);
                const steps: ExecutionStep[] = (Array.isArray(rawSteps) ? rawSteps : []).map((step: any) => ({
                    id: String(step.id || `step_${Math.random().toString(36).substring(7)}`),
                    description: String(step.description || step.task || step.task_description || `Execute task`),
                    tool: String(step.tool || 'shell_execute'),
                    agent: String(step.agent || 'General'),
                    input: step.input || {},
                    dependsOn: Array.isArray(step.dependsOn) ? step.dependsOn.map(String) : []
                }));
                
                return {
                    id: `dag_${Date.now()}`,
                    goal: intent.goal,
                    steps,
                    metadata: {
                        complexity: intent.complexity,
                        riskLevel: intent.riskLevel
                    }
                };
            }
        } catch (err) {
            console.error('[PlanningEngine] Dynamic DAG generation failed:', err);
        }

        // Emergency Fallback (Dynamic but minimal)
        console.warn(`[PlanningEngine] Using failover node for: ${intent.goal}`);
        return {
            id: `failover_${Date.now()}`,
            goal: intent.goal,
            steps: [{
                id: 'recovery_node',
                description: `Respond to: ${intent.goal}`,
                tool: 'central_answer', // Use central_answer instead of shell_execute
                agent: intent.suggestedAgent || 'General',
                input: { question: intent.goal }, // Use question for central_answer
                dependsOn: []
            }],
            metadata: { complexity: 'low', riskLevel: 'low' }
        };
    }
}
