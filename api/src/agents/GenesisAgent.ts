import { pollinationsProvider } from '../llm/providers/registry';
import { ArchitectAgent } from './ArchitectAgent';
import { analyzeTask } from '../llm/intelligent-router';
import { freeIntelligenceOptimizer } from '../llm/free-intelligence-optimizer';

interface TaskStep {
    name: string;
    tool: string;
    args: any;
}

export class GenesisAgent {
    private architect: ArchitectAgent;

    constructor() {
        this.architect = new ArchitectAgent();
    }

    async orchestrate(goal: string): Promise<{ plan: string, steps: TaskStep[] }> {
        // 0. Analyze Task Complexity
        const analysis = analyzeTask(goal);
        console.log(`[Genesis] Task Analysis: type=${analysis.type}, complexity=${analysis.complexity}`);

        // FAST PATH: Skip Architect for simple/medium tasks that aren't complex reasoning
        // We trust the direct execution planner for these to save time.
        if (analysis.complexity === 'low' || (analysis.complexity === 'medium' && analysis.type !== 'complex_reasoning')) {
            console.log('[Genesis] ⚡ FAST PATH ACTIVATED: Skipping Architect for speed.');

            // [OPTIMIZATION] Retrieve trained reflexes/knowledge
            // This reconnects the "6 months of training" to the new Fast Path engine
            const optimization = await freeIntelligenceOptimizer.optimizeRequest(goal, []);
            const contextInjection = optimization.cachedResponse
                ? `\n\n[Learned Reflex/Knowledge]:\n${optimization.cachedResponse}`
                : '';

            const fastPrompt = `You are a fast, efficient Task Executor.
The user wants: "${goal}"
${contextInjection}

Generate a concrete list of Tool Execution Steps to achieve this immediately.
Do NOT plan, just execute. Use the [Learned Knowledge] if relevant.

Available Tools:
- Core: scaffold_project, file_write, shell_execute, npm_install
- Files: grep_search, file_read, file_edit, ls
- Web: browser_action (for browsing/searching)

Output ONLY valid JSON:
{
  "steps": [
    { "name": "Step Name", "tool": "tool_name", "args": { ... } }
  ]
}`;

            try {
                const content = await pollinationsProvider.chatComplete([
                    { role: 'system', content: fastPrompt },
                ], 'jsonMode'); // 'jsonMode' hints json output

                const cleanJson = content.replace(/```json/g, '').replace(/```/g, '').trim();
                const result = JSON.parse(cleanJson || '{"steps": []}');

                return {
                    plan: `**Fast Track Execution**\n\nTask: ${goal}\n\nDecision: Skipped architecture phase for efficiency.\n[Knowledge Base]: ${optimization.shouldUseCache ? 'Used Learned Reflex ✅' : 'Standard Execution'}`,
                    steps: result.steps
                };
            } catch (e: any) {
                console.warn('[Genesis] Fast Path failed, falling back to Architect:', e.message);
                // Fallthrough to normal path if fast path crashes
            }
        }

        // 1. Architect the solution (Slow Path)
        console.log('[Genesis] summoning Architect...');
        const planMarkdown = await this.architect.planProject(goal);

        // 2. Convert Plan to Executable Steps
        console.log('[Genesis] converting plan to executable steps...');
        const conversionPrompt = `You are the Genesis Orchestrator.
Convert this Architectural Plan into a concrete list of Tool Execution Steps for the 'TaskLoop' agent.

Available Tools (Universal Registry):
- Core: scaffold_project, file_write, shell_execute, npm_install
- Analysis: codebase_outline, grep_search, symbol_inspector, analyze_project
- Quality: security_scanner, code_reviewer, sonar_analysis, load_tester, dependency_auditor
- DevOps: docker_swarm_ops, kubernetes_ops, terraform_manager, github_actions, github_pr
- Database: db_schema_migrator, db_data_seeder, query_optimizer
- Web: web_pipeline, dev_server, browser_action, visual_qa
- Knowledge: knowledge_search, knowledge_add

Plan:
${planMarkdown}

Output ONLY valid JSON:
{
  "steps": [
    { "name": "Scaffold", "tool": "scaffold_project", "args": { ... } },
    { "name": "Check DB", "tool": "db_schema_migrator", "args": { "action": "status" } }
  ]
}`;

        try {
            const content = await pollinationsProvider.chatComplete([
                { role: 'system', content: conversionPrompt },
            ], 'jsonMode');

            const cleanJson = content.replace(/```json/g, '').replace(/```/g, '').trim();
            const result = JSON.parse(cleanJson || '{"steps": []}');
            return { plan: planMarkdown, steps: result.steps };
        } catch (e: any) {
            console.error('[Genesis] Failed to generate steps:', e.message);
            return { plan: planMarkdown, steps: [] };
        }
    }
}
