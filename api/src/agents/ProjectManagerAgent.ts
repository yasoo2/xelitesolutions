import OpenAI from 'openai';
import fs from 'fs';
import { TaskExecutor } from './TaskExecutor';
import { tools } from '../tools/registry';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export class ProjectManagerAgent {
    private openai: OpenAI;
    private name: string;
    private rootDir: string;

    constructor(name: string, rootDir: string) {
        this.name = name;
        this.rootDir = rootDir;
        this.openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    }

    async init() {
        if (!fs.existsSync(this.rootDir)) {
            fs.mkdirSync(this.rootDir, { recursive: true });
        }
    }

    async execute(goal: string) {
        console.log(`[PM:${this.name}] 🧠 Starting Autonomous ReAct Loop for: "${goal}"`);

        const MAX_ITERATIONS = 30;
        const history: any[] = [];
        const executor = new TaskExecutor(this.rootDir);

        // Get available tool signatures
        const availableTools = tools.map(t => ({
            name: t.name,
            description: t.description,
            schema: t.inputSchema
        }));

        const systemPrompt = `You are an Autonomous AI Agent named "${this.name}".
Current Working Directory: ${this.rootDir}

GOAL: "${goal}"

You operate in a Loop:
1. THINK: Analyze the current state (files, errors, history). Decide the single next step.
2. ACT: Execute a tool.

AVAILABLE TOOLS:
${JSON.stringify(availableTools.map(t => ({ name: t.name, usage: t.description })), null, 2)}

RULES:
- You must output valid JSON only.
- If the goal is fully achieved, use the "central_answer" tool or simply output { "done": true, "reason": "..." }.
- If an error occurs, analyze it and try a different approach (Self-Correction).
- Do not ask the user for input unless absolutely necessary (use 'ask_user' tool if available).
- Create files before reading them. Check if files exist before reading.

FORMAT:
{
  "thought": "I need to check if the file exists...",
  "tool": "shell_execute",
  "args": { "command": "ls -la" }
}
OR
{
  "thought": "The task is complete.",
  "done": true
}`;

        for (let i = 0; i < MAX_ITERATIONS; i++) {
            try {
                // 1. Decide
                const prompt = `History:\n${JSON.stringify(history.slice(-5), null, 2)}\n\nWhat is your next move?`;

                const completion = await this.openai.chat.completions.create({
                    model: "gpt-4o",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: prompt }
                    ],
                    response_format: { type: "json_object" },
                    temperature: 0.1
                });

                const content = completion.choices[0].message.content;
                if (!content) throw new Error("Empty response from LLM");

                const decision = JSON.parse(content);
                console.log(`[PM:${this.name}] 💭 Thought: ${decision.thought}`);

                if (decision.done) {
                    console.log(`[PM:${this.name}] ✅ Goal Achieved.`);
                    return { status: 'completed', history, reasoning: decision.thought };
                }

                if (!decision.tool) {
                    console.log(`[PM:${this.name}] No tool selected. Skipping.`);
                    continue;
                }

                // 2. Act
                console.log(`[PM:${this.name}] 🛠️ Action: ${decision.tool}`);
                const step = { name: `iteration_${i}`, tool: decision.tool, args: decision.args || {} };
                const result = await executor.executeStep(step);

                // 3. Update History
                history.push({
                    step: i + 1,
                    thought: decision.thought,
                    tool: decision.tool,
                    args: decision.args,
                    success: result.success,
                    output: result.output.slice(0, 1000) // Truncate log for context window
                });

                if (!result.success) {
                    console.warn(`[PM:${this.name}] ⚠️ Action Failed: ${result.output}`);
                }

            } catch (e: any) {
                console.error(`[PM:${this.name}] ❌ Loop Exception:`, e);
                history.push({ step: i + 1, error: e.message });
            }
        }

        return { status: 'failed', error: 'Max iterations reached', history };
    }
}
