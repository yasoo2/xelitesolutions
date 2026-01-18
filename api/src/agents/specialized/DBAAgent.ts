import OpenAI from 'openai';
import { GenesisAgent } from '../GenesisAgent';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export class DBAAgent {
    private openai: OpenAI;
    private genesis: GenesisAgent;

    constructor() {
        this.openai = new OpenAI({ apiKey: OPENAI_API_KEY });
        this.genesis = new GenesisAgent();
    }

    async orchestrate(goal: string) {
        console.log(`[DBAAgent] 💾 Starting database task: "${goal}"`);

        // Enrich goal with DBA Persona
        const dbaContext = `
        ROLE: Database Administrator (DBA).
        FOCUS: Schema Design, Migrations (Safety), Query Optimization (Indexing), Data Integrity.
        TOOLS: db_schema_migrator, query_optimizer, large_data_seeder.
        
        GOAL: ${goal}
        `;

        return this.genesis.orchestrate(dbaContext);
    }
}
