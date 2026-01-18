import OpenAI from 'openai';
import { ArchitectAgent } from './ArchitectAgent';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

interface TaskStep {
    name: string;
    tool: string;
    args: any;
}

export class GenesisAgent {
    private openai: OpenAI;
    private architect: ArchitectAgent;

    constructor() {
        this.openai = new OpenAI({ apiKey: OPENAI_API_KEY });
        this.architect = new ArchitectAgent();
    }

    async orchestrate(goal: string): Promise<{ plan: string, steps: TaskStep[] }> {
        // 1. Architect the solution
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

        const completion = await this.openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: 'system', content: conversionPrompt }],
            response_format: { type: "json_object" },
            temperature: 0.2, // Low temp for precise JSON
        });

        const result = JSON.parse(completion.choices[0].message.content || '{"steps": []}');
        return { plan: planMarkdown, steps: result.steps };
    }
}
