import { executeTool } from '../../modules/services/ToolService';
import { advancedAnalyzeTask } from '../llm/intelligent-router';

/**
 * JoeAgent V2 - Core Task Execution Unit
 * 
 * In the new architecture, JoeAgent is a "Task Executor".
 * It receives atomic tasks from the AgentOrchestrator and uses 
 * real-time LLM reasoning to choose and execute the best tools.
 */
export class JoeAgent {
    private rootDir: string;

    constructor(rootDir: string) {
        this.rootDir = rootDir;
    }

    /**
     * DYNAMIC TASK EXECUTION (Professional-Grade)
     * Executes an atomic task using runtime reasoning.
     */
    async execute(task: string, input: any, context: any): Promise<{ ok: boolean; output?: any; error?: string }> {
        console.log(`[JoeAgent-V2] Executing Task: "${task}"`);

        // [RUNTIME REASONING] Dynamic tool selection for the specific task
        const toolSelectionPrompt = `You are a Professional AI Agent.
Task: ${task}
Input: ${JSON.stringify(input)}
Context: ${JSON.stringify(context)}

Choose the single best tool for this task: shell_execute, read_file, write_file, browser_run, grep_search, ls, npm_manager.
Explain your reasoning then return a JSON object.

JSON Format:
{ 
  "tool": "tool_name", 
  "args": { ... }, 
  "reasoning": "why this tool" 
}`;

        try {
            const decision = await advancedAnalyzeTask(task, toolSelectionPrompt);
            
            // Ensure CWD is passed for shell tools if not present
            if (decision.tool === 'shell_execute' && !decision.args.cwd) {
                decision.args.cwd = this.rootDir;
            }

            const result = await executeTool(decision.tool, decision.args, { sessionId: context.sessionId });
            
            return {
                ok: result.ok,
                output: result.output,
                error: result.error
            };
        } catch (error: any) {
            console.error(`[JoeAgent-V2] Task failed: ${error.message}`);
            return { ok: false, error: `Task execution failed: ${error.message}` };
        }
    }

    /**
     * Deprecated Entry point. Use AgentOrchestrator instead.
     */
    async ignite(goal: string): Promise<any> {
        console.error("[JoeAgent-V2] ignite() is DEPRECATED. Use AgentOrchestrator.execute() for full goals.");
        return { ok: false, error: "Use AgentOrchestrator.execute() instead." };
    }
}
