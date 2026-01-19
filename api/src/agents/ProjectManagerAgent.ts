import OpenAI from 'openai';
import fs from 'fs';
import { TaskExecutor } from './TaskExecutor';
import { tools } from '../tools/registry';
import { CortexState, TaskState } from '../services/CortexState';
import crypto from 'crypto';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export class ProjectManagerAgent {
    private openai: OpenAI;
    private name: string;
    private rootDir: string;
    private cortex: CortexState;
    private taskId: string;

    constructor(name: string, rootDir: string, taskId?: string) {
        this.name = name;
        this.rootDir = rootDir;
        this.openai = new OpenAI({ apiKey: OPENAI_API_KEY });
        this.cortex = CortexState.getInstance();
        // Generate a stable ID based on name if not provided, or use random
        this.taskId = taskId || crypto.createHash('md5').update(name + rootDir).digest('hex');
    }

    async init() {
        if (!fs.existsSync(this.rootDir)) {
            fs.mkdirSync(this.rootDir, { recursive: true });
        }
    }

    async execute(goal: string) {
        console.log(`[PM:${this.name}] 🧠 Starting Autonomous Persistent Agent for: "${goal}"`);

        // 1. Load or Initialize State
        let state = this.cortex.getTask(this.taskId);

        if (state && state.status === 'completed') {
            console.log(`[PM:${this.name}] ✅ Task already completed. Skipping.`);
            return { status: 'completed', history: state.history, reasoning: "Resumed: Already complete." };
        }

        if (state && state.status !== 'completed') {
            console.log(`[PM:${this.name}] 🔄 Resuming existing task (Step ${state.step})...`);
        } else {
            // New Task
            state = {
                id: this.taskId,
                goal,
                status: 'running',
                step: 0,
                history: [],
                rootDir: this.rootDir,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            this.cortex.saveTask(state);
        }

        const MAX_ITERATIONS = 50;
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

        // Resume from last step
        for (let i = state.step; i < MAX_ITERATIONS; i++) {

            // Financial Check
            if (!this.cortex.recordTransaction(-0.05, `Agent Step ${i}`, this.taskId)) {
                console.error(`[PM:${this.name}] 🛑 Out of Budget! Stopping.`);
                state.status = 'paused';
                this.cortex.saveTask(state);
                return { status: 'failed', error: 'Insufficient Funds' };
            }

            try {
                // 1. Decide
                const prompt = `History (Last 5):\n${JSON.stringify(state.history.slice(-5), null, 2)}\n\nWhat is your next move?`;

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
                    state.status = 'completed';
                    state.history.push({ step: i, thought: decision.thought, action: 'DONE' });
                    this.cortex.saveTask(state);
                    return { status: 'completed', history: state.history, reasoning: decision.thought };
                }

                if (!decision.tool) {
                    console.log(`[PM:${this.name}] No tool selected. Skipping.`);
                    continue;
                }

                // 2. Act
                console.log(`[PM:${this.name}] 🛠️ Action: ${decision.tool}`);
                const step = { name: `iteration_${i}`, tool: decision.tool, args: decision.args || {} };
                const result = await executor.executeStep(step);

                // 3. Update & Save State
                state.step = i + 1;
                state.history.push({
                    step: i + 1,
                    thought: decision.thought,
                    tool: decision.tool,
                    args: decision.args,
                    success: result.success,
                    output: result.output.slice(0, 1000)
                });

                if (!result.success) {
                    console.warn(`[PM:${this.name}] ⚠️ Action Failed: ${result.output}`);
                }

                this.cortex.saveTask(state); // <--- PERSISTENCE POINT

            } catch (e: any) {
                console.error(`[PM:${this.name}] ❌ Loop Exception:`, e);
                state.history.push({ step: i + 1, error: e.message });
                this.cortex.saveTask(state);
            }
        }

        state.status = 'failed';
        this.cortex.saveTask(state);
        return { status: 'failed', error: 'Max iterations reached', history: state.history };
    }
}
