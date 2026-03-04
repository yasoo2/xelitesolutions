import fs from 'fs';
import { TaskExecutor } from './TaskExecutor';
import { tools } from '../tools/registry';
import { CortexState, TaskState } from '../services/CortexState';
import crypto from 'crypto';
import { routeToModel, analyzeTask } from '../llm/intelligent-router';

export class ProjectManagerAgent {
    private name: string;
    private rootDir: string;
    private cortex: CortexState;
    private taskId: string;

    constructor(name: string, rootDir: string, taskId?: string) {
        this.name = name;
        this.rootDir = rootDir;
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
        const extractJsonLike = (text: string) => {
            const raw = String(text || '').trim();
            if (!raw) return '';
            if (raw.startsWith('{') && raw.endsWith('}')) return raw;
            const m = raw.match(/\{[\s\S]*\}/);
            return String(m?.[0] || '').trim();
        };

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

        const MAX_ITERATIONS = 500; // God-Mode: Increased for massive project construction
        const executor = new TaskExecutor(this.rootDir);

        // Get available tool signatures
        const availableTools = tools.map(t => ({
            name: t.name,
            description: t.description,
            schema: t.inputSchema
        }));

        const systemPrompt = `You are a God-Tier Autonomous AI Architect named "${this.name}".
Current Working Directory: ${this.rootDir}

YOU ARE NOT A CHATBOT. YOU ARE A SYSTEM CONSTRUCTOR.
Your goal is: "${goal}"

MASTER OF MILLIONS (JOE PRO PROTOCOL):
You have absolute control and mastery over the entire codebase, consisting of "millions of files and codes." 
You are not just building a feature; you are governing a massive ecosystem.
Every tool, file, and line of code is your instrument.

KNOWLEDGE ACCESS:
You have absolute access to the "6 Floors of Wisdom" and the "Universal Engineering Atlas" located in the 'knowledge/' and 'knowledge/blueprints/' directories. 
ALWAYS search those directories first for boilerplate and patterns before starting.

YOUR OPERATIONAL PROTOCOL (GOD-MODE):
1. THINK SCALE: Do not build small things. Build entire systems. If a user asks for a bank, build a mission-critical, high-availability ledger with real-time UI.
2. TOOL MASTERY: Use the 'tools_encyclopedia.md' to understand your 20+ physical tools. 
3. SELF-CORRECTION: If a command fails (e.g., 'unknown_tool' or 'build error'), analyze the root cause in the 'TaskExecutor' logic and fix it or use an alternative.
4. MILLION-LINE AMBITION: Do not hesitate to generate massive file structures using 'scaffold_project'.
5. INTERNAL CONSTRUCTION FIRST: Use local tools (scaffold_project, shell_execute, file_write, file_edit, npm_install) for ALL construction tasks. You MUST build the entire codebase locally and verify it with 'ls' before touching the browser.
6. BROWSER IS A PRIVILEGE FOR VERIFICATION: Use the 'browser_run' or 'browser_action' tools ONLY AFTER:
   - The codebase is 100% written and verified by local file checks.
   - You need to verify the UI/UX or page transitions.
   - DO NOT use the browser for research, documentation searching, or early "exploration". This consumes massive resources and is strictly forbidden.
7. VISUAL FEEDBACK LOOP (SEE-FIX-VERIFY): 
   - Use the browser only as a pair of "eyes" to see your completed work.
   - If you see a UI bug (overlapping, broken alignment):
     1. Analyze the browser evidence.
     2. Identify and fix the source code locally.
     3. Return to the browser to verify.

11. TERMINAL PRESENCE: To provide live feedback to the user on the dashboard's 'Terminal' (Thermal) screen, you MUST:
    - Use 'terminal_manager' (action: 'create') to start a session.
    - Use 'terminal_manager' (action: 'write') to run audit scripts or long-running tasks.
    - This is the ONLY way the user can see your console work in real-time. 'shell_execute' is for silent background tasks.
12. PREVIEW SYNC: After building a UI, always confirm the dev server is running (use 'dev_server' or 'web_pipeline') so the 'Preview' screen remains active.
${JSON.stringify(availableTools.map(t => ({ name: t.name, usage: t.description })), null, 2)}

RULES:
- RESPONSE FORMAT: VALID JSON ONLY.
- DONENESS: Only use "done": true when the system is fully verified and matches the 'Elite' design standards of Floor 5.
- PERSISTENCE: Every action you take is saved in the Cortex. Act as if you are building a legacy.

FORMAT:
{
  "thought": "I will decompose the goal into actionable steps and select the optimal tools for construction.",
  "tool": "inspect_directory",
  "args": { "path": "." }
}
OR
{
  "thought": "System constructed, verified, and pushed to main.",
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

                const responseText = await routeToModel(
                    [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: prompt }
                    ],
                    {
                        type: 'code_generation',
                        complexity: 'medium',
                        requiresTools: true,
                        estimatedTokens: 3000,
                        language: analyzeTask(goal).language,
                    },
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    tools as any
                );

                const jsonStr = extractJsonLike(responseText);
                const decision = JSON.parse(jsonStr || '{}');
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
