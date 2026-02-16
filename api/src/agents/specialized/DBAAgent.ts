import { GenesisAgent } from '../GenesisAgent';

export class DBAAgent {
    private genesis: GenesisAgent;

    constructor() {
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
