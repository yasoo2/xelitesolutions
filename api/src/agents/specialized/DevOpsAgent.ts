import OpenAI from 'openai';
import { GenesisAgent } from '../GenesisAgent';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export class DevOpsAgent {
    private openai: OpenAI;
    private genesis: GenesisAgent;

    constructor() {
        this.openai = new OpenAI({ apiKey: OPENAI_API_KEY });
        this.genesis = new GenesisAgent();
    }

    async orchestrate(goal: string) {
        console.log(`[DevOpsAgent] 🏗️ Starting infrastructure task: "${goal}"`);

        // Enrich goal with DevOps Persona
        const devopsContext = `
        ROLE: DevOps Engineer / Infrastructure Architect.
        FOCUS: Docker, Kubernetes, Terraform, CI/CD Pipelines, Reliability, Scalability.
        TOOLS: terraform_manager, kubernetes_ops, docker_swarm_ops, load_tester, monitoring.
        
        GOAL: ${goal}
        `;

        return this.genesis.orchestrate(devopsContext);
    }
}
