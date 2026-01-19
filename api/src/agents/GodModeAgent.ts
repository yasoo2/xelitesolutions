import OpenAI from 'openai';
import path from 'path';
import { ProjectManagerAgent } from './ProjectManagerAgent';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

interface SubSystem {
    name: string;
    description: string;
    dir: string;
}

export class GodModeAgent {
    private openai: OpenAI;

    constructor() {
        if (OPENAI_API_KEY) {
            this.openai = new OpenAI({ apiKey: OPENAI_API_KEY });
        } else {
            // Placeholder or throw on usage
            this.openai = null as any;
        }
    }

    async buildSystem(userRequest: string, outputDir: string) {
        console.log(`\n🌩️  GOD MODE ACTIVATED: "${userRequest}"\n`);
        console.log(`[GodMode] Deploying agents under: ${outputDir}`);

        // 1. High Level Architecture Breakdown
        const breakdown = await this.createSystemBreakdown(userRequest);
        console.log(`[GodMode] Breakdown:`, breakdown);

        const activeAgents: ProjectManagerAgent[] = [];
        const promises: Promise<any>[] = [];

        // 2. Spawn Project Managers in PARALLEL
        for (const sys of breakdown) {
            const sysPath = path.join(outputDir, sys.dir);

            // Create Agent
            const pm = new ProjectManagerAgent(sys.name, sysPath); // TaskID auto-generated
            await pm.init();
            activeAgents.push(pm);

            console.log(`[GodMode] 🚀 Launching Agent for: ${sys.name}...`);

            // Fire and collect promise
            const p = pm.execute(sys.description).then(res => ({
                system: sys.name,
                status: res.status,
                reasoning: res.reasoning,
                steps: res.history?.length
            })).catch(err => ({
                system: sys.name,
                status: 'failed',
                error: err.message
            }));

            promises.push(p);
        }

        // 3. Wait for the Swarm
        console.log(`[GodMode] ⏳ Accessing Cortex. Waiting for ${promises.length} agents to complete...`);
        const results = await Promise.all(promises);

        console.log('[GodMode] All Agents reported back.');
        return {
            status: 'success',
            breakdown,
            results
        };
    }

    private async createSystemBreakdown(request: string): Promise<SubSystem[]> {
        const prompt = `You are the System Orchestrator.
User Request: "${request}"

Break this system down into distinct subsystem components (e.g. Frontend, Backend, Mobile, Infrastructure).
Output ONLY valid JSON:
{
  "systems": [
    { "name": "Backend", "dir": "backend", "description": "Node.js API with Express and LanceDB" },
    { "name": "Frontend", "dir": "frontend", "description": "React Dashboard" }
  ]
}`;

        const completion = await this.openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: 'system', content: prompt }],
            response_format: { type: "json_object" },
            temperature: 0.2,
        });

        const raw = JSON.parse(completion.choices[0].message.content || '{"systems": []}');
        return raw.systems || [];
    }
}
