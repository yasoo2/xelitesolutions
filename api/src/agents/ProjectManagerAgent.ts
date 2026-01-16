import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { ArchitectAgent } from './ArchitectAgent';
import { GenesisAgent } from './GenesisAgent';

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

        // 1. Create a sub-plan using Genesis (which uses Architect internally)
        // In a true God Mode, PM would have its own specific prompt tuning to manage "files" and "dependencies".
        // For now, delegating to Genesis is a good proxy for "Get this done".

        // Contextualize the goal for the subdirectory
        const contextGoal = `Project: ${this.name}\nDirectory: ${this.rootDir}\nGoal: ${goal}`;

        try {
            const result = await this.genesis.orchestrate(contextGoal);
            console.log(`[PM:${this.name}] Plan generated. Execution delegated to TaskRunner (mock)...`);

            // In the real system, we would run the steps here. 
            // GenesisAgent returns { plan, steps }.
            // We need a runner. 
            // For now, let's assume we just report the plan.

            return {
                status: 'planned',
                plan: result.plan,
                steps: result.steps
            };
        } catch (e: any) {
            console.error(`[PM:${this.name}] Execution failed:`, e);
            return { status: 'failed', error: e.message };
        }
    }
}
