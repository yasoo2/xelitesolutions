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

Available Tools:
- scaffold_project: { name, type, features }
- file_write: { path, content }
- shell_execute: { command, cwd }
- npm_install: { package }

Plan:
${planMarkdown}

Output ONLY valid JSON:
{
  "steps": [
    { "name": "Scaffold", "tool": "scaffold_project", "args": { ... } },
    { "name": "Create Component", "tool": "file_write", "args": { ... } }
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
