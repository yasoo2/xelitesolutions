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
        const goalLower = String(intent.goal || '').toLowerCase();

        // [BUILD FAST-PATH] "build/create a web page/site/app" -> ACTUALLY build it:
        // generate the code, write the file, and open it in the live preview. This is
        // deterministic (reliable even on weak free models) and makes Joe execute like
        // an engineering team instead of just replying with code text.
        const buildVerb = /\b(build|create|make|develop|design|generate|code|scaffold)\b/.test(goalLower)
            || /(ابن|ابني|انشئ|أنشئ|اصنع|صمم|طور|اعمل|اصمم|سو)/.test(intent.goal || '');
        const webNoun = /\b(page|site|website|web ?app|landing|portfolio|dashboard|form|store|shop|html|ui|interface)\b/.test(goalLower)
            || /(صفحة|موقع|تطبيق|واجهة|متجر|لوحة|نموذج|بورتفوليو|معرض|هبوط)/.test(intent.goal || '');
        // Route follow-up edits (add button / change colour / ...) to the SAME page.
        const activeKey = String((context && context.sessionId) || 'default').replace(/[^a-zA-Z0-9._-]/g, '_');
        const hasActivePage = !!((global as any).joePages && (global as any).joePages[activeKey]);
        const editIntent = /\b(add|change|modify|update|edit|remove|bigger|smaller|colou?r|button|background|header|footer|font|title)\b/i.test(goalLower)
            || /(أضف|اضف|غيّر|غير|عدّل|عدل|بدّل|بدل|اجعل|احذف|كبّر|صغّر|لون|زر|خلفية|حجم|عنوان|خط)/.test(intent.goal || '');
        if ((buildVerb && webNoun) || (hasActivePage && editIntent)) {
            return {
                id: `build_${Date.now()}`,
                goal: intent.goal,
                steps: [{
                    id: 'build_page',
                    description: `Building: ${intent.goal}`,
                    tool: 'web_page_builder',
                    agent: 'Dev',
                    input: { request: intent.goal },
                    dependsOn: []
                }],
                metadata: { complexity: 'medium', riskLevel: 'low' }
            };
        }

        // [BROWSER SMART TOOLS FAST-PATH] summarise / audit a URL reliably.
        const goalRaw = intent.goal || '';
        const urlMatch = goalRaw.match(/https?:\/\/[^\s]+|\b[a-z0-9-]+\.(?:com|org|net|io|dev|ai|co|app|sa|eg|me)(?:\/[^\s]*)?/i);
        const summarizeIntent = /(لخّ?ص|تلخيص|summari[sz]e|اقرأ\s*الصفحة|ما\s*مضمون)/i.test(goalRaw);
        const auditIntent = /(دقّ?ق|تدقيق|افحص\s*الواجهة|audit|فحص\s*ui|راجع\s*التصميم|مشاكل\s*الواجهة|accessib)/i.test(goalRaw);
        if (urlMatch && (summarizeIntent || auditIntent)) {
            const tool = auditIntent ? 'browser_ui_audit' : 'browser_summarize';
            return {
                id: `browser_${Date.now()}`,
                goal: intent.goal,
                steps: [{
                    id: 'browser_smart',
                    description: `${auditIntent ? 'Auditing' : 'Summarizing'} ${urlMatch[0]}`,
                    tool,
                    agent: 'Browser',
                    input: { url: urlMatch[0], question: intent.goal, request: intent.goal },
                    dependsOn: []
                }],
                metadata: { complexity: 'medium', riskLevel: 'low' }
            };
        }

        // [ELITE FAST-PATH] Direct answer for general questions or chat
        if ((intent as any).type === 'general' || (intent as any).type === 'chat' || intent.goal.length < 30) {
            return {
                id: `chat_${Date.now()}`,
                goal: intent.goal,
                steps: [{
                    id: 'direct_response',
                    description: `Answering: ${intent.goal}`,
                    tool: 'central_answer',
                    agent: 'General',
                    input: { question: intent.goal },
                    dependsOn: []
                }],
                metadata: { complexity: 'low', riskLevel: 'low' }
            };
        }

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
        const isBrowserFallback = (intent.suggestedAgent === 'Browser') || (intent.requiredTools && intent.requiredTools.includes('browser_run'));
        return {
            id: `failover_${Date.now()}`,
            goal: intent.goal,
            steps: [{
                id: 'recovery_node',
                description: `Respond to: ${intent.goal}`,
                tool: isBrowserFallback ? 'browser_run' : 'central_answer',
                agent: isBrowserFallback ? 'Browser' : (intent.suggestedAgent || 'General'),
                input: isBrowserFallback ? { instruction: intent.goal, task: intent.goal } : { question: intent.goal },
                dependsOn: []
            }],
            metadata: { complexity: 'low', riskLevel: 'low' }
        };
    }
}
