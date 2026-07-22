import { BaseAgent } from './BaseAgent';
import { executeTool } from '../../modules/services/ToolService';
import intelligentRouter from '../../core/llm/intelligent-router';

/**
 * BrowserAgent - Autonomous Web Interaction Specialist
 */
export class BrowserAgent extends BaseAgent {
    public readonly name = "Browser-Automation";
    public readonly type = "Browser";

    async execute(task: string, input: any, context: any): Promise<{ ok: boolean; output: any; error?: string }> {
        console.log(`[BrowserAgent] Executing Web Task: "${task}"`);
        const sessionId = input.sessionId || context.sessionId || 'default-browser-session';

        let actions: any[] = [];

        // Attempt LLM plan generation
        try {
            const systemPrompt = `You are a Browser Automation Expert.
Task: ${task}
Session: ${sessionId}

Translate this task into a sequence of browser actions.
Available Actions: goto, click, type, hover, scroll, wait, key, extract_text, get_elements, click_coordinates.

Return ONLY a JSON object with an "actions" array.
Example: { "actions": [ { "type": "goto", "url": "..." }, { "type": "click", "selector": "..." } ] }`;

            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: task }
            ];
            
            const responseText = await intelligentRouter.routeToModel(messages, {
                type: 'browser_task',
                complexity: 'medium',
                requiresTools: true,
                estimatedTokens: 1000,
                language: 'en'
            } as any);

            try {
                const jsonMatch = responseText.match(/\{[\s\S]*\}/);
                const plan = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(responseText);
                if (Array.isArray(plan.actions) && plan.actions.length > 0) {
                    actions = plan.actions;
                }
            } catch (e) {
                // Ignore parse errors, fallback will trigger
            }
        } catch (error: any) {
            console.warn(`[BrowserAgent] LLM plan generation failed (${error.message}), using deterministic browser fallback.`);
        }

        // [DETERMINISTIC FALLBACK] If LLM failed or generated empty actions, build actions from task keywords
        if (actions.length === 0) {
            const tLower = task.toLowerCase();
            let targetUrl = '';

            // Extract explicit URL
            const urlMatch = task.match(/https?:\/\/[^\s]+/i);
            if (urlMatch) {
                targetUrl = urlMatch[0];
            } else if (tLower.includes('ياهو') || tLower.includes('yahoo')) {
                // Extract search terms after "عن" or "about" if present
                const queryMatch = task.match(/(?:عن|about|for)\s+(.+)/i);
                const query = queryMatch ? queryMatch[1].trim() : task;
                targetUrl = `https://search.yahoo.com/search?p=${encodeURIComponent(query)}`;
            } else if (tLower.includes('جوجل') || tLower.includes('غوغل') || tLower.includes('google')) {
                const queryMatch = task.match(/(?:عن|about|for)\s+(.+)/i);
                const query = queryMatch ? queryMatch[1].trim() : task;
                targetUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
            } else if (tLower.includes('ويكيبيديا') || tLower.includes('wikipedia')) {
                targetUrl = `https://ar.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(task)}`;
            } else {
                targetUrl = `https://www.google.com/search?q=${encodeURIComponent(task)}`;
            }

            console.log(`[BrowserAgent] Generated fallback target URL: ${targetUrl}`);
            actions = [
                { type: 'goto', url: targetUrl },
                { type: 'wait', ms: 3000 }
            ];
        }

        try {
            // [EXECUTION] Call the browser_run tool with the generated actions
            const result = await executeTool('browser_run', { 
                sessionId,
                actions,
                instructionText: task
            }, {
                sessionId,
                workspaceId: context.workspaceId,
                userId: context.userId,
                traceId: context.traceId
            });

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
