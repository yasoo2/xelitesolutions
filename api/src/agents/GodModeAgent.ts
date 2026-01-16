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

        // 1. High Level Architecture Breakdown
        const breakdown = await this.createSystemBreakdown(userRequest);
        console.log(`[GodMode] Breakdown:`, breakdown);

        const results = [];

        // 2. Spawn Project Managers
        for (const sys of breakdown) {
            const sysPath = path.join(outputDir, sys.dir);
            const pm = new ProjectManagerAgent(sys.name, sysPath);
            await pm.init();

            console.log(`[GodMode] Spawning PM for ${sys.name}...`);
            const subResult = await pm.execute(sys.description);
            results.push({ system: sys.name, result: subResult });
        }

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
}`; // Simplified prompt

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
