import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { ArchitectAgent } from './ArchitectAgent';
import { GenesisAgent } from './GenesisAgent';
import { TaskExecutor } from './TaskExecutor';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export class ProjectManagerAgent {
    private openai: OpenAI;
    private name: string;
    private rootDir: string;
    private genesis: GenesisAgent; // We reuse Genesis for task execution for now

    constructor(name: string, rootDir: string) {
        this.name = name;
        this.rootDir = rootDir;
        this.openai = new OpenAI({ apiKey: OPENAI_API_KEY });
        this.genesis = new GenesisAgent();
    }

    async init() {
        if (!fs.existsSync(this.rootDir)) {
            fs.mkdirSync(this.rootDir, { recursive: true });
        }
        // distinct package.json if needed
    }



    async execute(goal: string) {
        console.log(`[PM:${this.name}] Starting execution for goal: "${goal}"`);

        // Contextualize the goal for the subdirectory
        const contextGoal = `Project: ${this.name}\nDirectory: ${this.rootDir}\nGoal: ${goal}`;

        try {
            // 1. Plan
            const result = await this.genesis.orchestrate(contextGoal);
            console.log(`[PM:${this.name}] Plan generated. Executing ${result.steps.length} steps...`);

            // 2. Execute
            const executor = new TaskExecutor(this.rootDir);
            const executionResults = [];

            for (const step of result.steps) {
                console.log(`[PM:${this.name}] Running step: ${step.name}`);
                const stepResult = await executor.executeStep(step);
                executionResults.push({ step: step.name, ...stepResult });

                if (!stepResult.success) {
                    console.error(`[PM:${this.name}] Step failed. Stopping execution.`);
                    break;
                    // Future: Add SelfHealingLoop here
                }
            }

            return {
                status: 'completed',
                plan: result.plan,
                steps: result.steps,
                results: executionResults
            };
        } catch (e: any) {
            console.error(`[PM:${this.name}] Execution failed:`, e);
            return { status: 'failed', error: e.message };
        }
    }
}
