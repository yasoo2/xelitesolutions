import { BaseAgent } from './BaseAgent';
import { executeTool } from '../../modules/services/ToolService';
import { advancedAnalyzeTask } from '../../core/llm/intelligent-router';

/**
 * BrowserAgent - Autonomous Web Interaction Specialist
 */
export class BrowserAgent extends BaseAgent {
    public readonly name = "Browser-Automation";
    public readonly type = "Browser";

    async execute(task: string, input: any, context: any): Promise<{ ok: boolean; output: any; error?: string }> {
        console.log(`[BrowserAgent] Executing Web Task: "${task}"`);

        const systemPrompt = `You are a Browser Automation Expert.
Task: ${task}
Session: ${input.sessionId}

Translate this task into a sequence of browser actions.
Available Actions: goto, click, type, hover, scroll, wait, key, extract_text, get_elements, click_coordinates.

Return ONLY a JSON object with an "actions" array.
Example: { "actions": [ { "type": "goto", "url": "..." }, { "type": "click", "selector": "..." } ] }`;

        try {
            // [DYNAMIC PLANNING] The agent plans its own actions at runtime
            const plan: any = await advancedAnalyzeTask(task, systemPrompt as any);
            
            // [EXECUTION] Call the browser_run tool with the generated actions
            const result = await executeTool('browser_run', { 
                sessionId: input.sessionId,
                actions: plan.actions 
            }, { sessionId: context.sessionId, traceId: context.traceId });

            return {
                ok: result.ok,
                output: result.output ?? null,
                error: result.error
            };
        } catch (error: any) {
            return { ok: false, output: null, error: `Browser execution failed: ${error.message}` };
        }
    }

    public canHandle(task: string): number {
        const t = task.toLowerCase();
        if (t.includes('browser') || t.includes('web') || t.includes('click') || t.includes('navigate') || t.includes('متصفح')) return 0.9;
        if (t.includes('search') || t.includes('بحث') || t.includes('افتح')) return 0.7;
        return 0.1;
    }
}

