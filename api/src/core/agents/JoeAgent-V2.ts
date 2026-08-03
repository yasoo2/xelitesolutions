import { executeTool } from '../../modules/services/ToolService';
import intelligentRouter from '../llm/intelligent-router';

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

Choose the single best tool for this task: central_answer, shell_execute, read_file, write_file, browser_run, grep_search, ls, npm_manager.
Use "central_answer" for greetings, conversation, or any question that should be answered directly in words (do NOT use browser_run for a simple reply).
Explain your reasoning then return a JSON object.

JSON Format:
{ 
  "tool": "tool_name", 
  "args": { ... }, 
  "reasoning": "why this tool" 
}`;

        try {
            const messages = [
                { role: 'system', content: toolSelectionPrompt },
                { role: 'user', content: task }
            ];
            
            const responseText = await intelligentRouter.routeToModel(messages, {
                type: 'code_generation',
                complexity: 'medium',
                requiresTools: true,
                estimatedTokens: 1000,
                language: 'en'
                // Tool selection is internal reasoning — local brain first,
                // the daily quota stays reserved for user-facing answers.
            } as any, undefined, undefined, undefined, undefined, undefined, { ...(context || {}), purpose: 'internal' });

            let decision: any;
            try {
                const jsonMatch = responseText.match(/\{[\s\S]*\}/);
                decision = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(responseText);
            } catch (e) {
                // Smart intent-based fallback when LLM output is not valid JSON
                const tLower = task.toLowerCase();
                if (tLower.includes('browser') || tLower.includes('web') || tLower.includes('متصفح') || tLower.includes('افتح') || tLower.includes('ابحث')) {
                    decision = { tool: 'browser_run', args: { sessionId: input.sessionId, instructionText: task }, reasoning: 'Browser fallback' };
                } else if (tLower.includes('read') || tLower.includes('اقرأ') || tLower.includes('عرض')) {
                    decision = { tool: 'read_file', args: { path: input.path || 'package.json' }, reasoning: 'Read file fallback' };
                } else if (tLower.includes('write') || tLower.includes('create') || tLower.includes('أنشئ') || tLower.includes('اكتب')) {
                    decision = { tool: 'write_file', args: { path: input.path || 'output.txt', content: task }, reasoning: 'Write file fallback' };
                } else if (tLower.startsWith('npm') || tLower.startsWith('git') || tLower.startsWith('node') || tLower.startsWith('cd ') || tLower.startsWith('dir') || tLower.startsWith('ls')) {
                    decision = { tool: 'shell_execute', args: { command: task, cwd: this.rootDir }, reasoning: 'Shell command fallback' };
                } else {
                    decision = { tool: 'central_answer', args: { question: task }, reasoning: 'General question fallback' };
                }
            }
            
            if (!decision || !decision.tool) {
                throw new Error(`Invalid tool decision from LLM: ${responseText}`);
            }
            
            // Ensure CWD is passed for shell tools if not present
            if (decision.tool === 'shell_execute' && !decision.args.cwd) {
                decision.args.cwd = this.rootDir;
            }

            const result = await executeTool(decision.tool, decision.args, { 
                sessionId: context.sessionId, 
                workspaceId: context.workspaceId,
                userId: context.userId,
                traceId: context.traceId,
                modelConfig: context.modelConfig
            });
            
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
