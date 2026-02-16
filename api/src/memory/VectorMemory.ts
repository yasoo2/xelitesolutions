import OpenAI from 'openai';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MEMORY_DB_PATH = path.join(process.cwd(), 'data', 'lance_memory');

if (!fs.existsSync(path.dirname(MEMORY_DB_PATH))) {
    fs.mkdirSync(path.dirname(MEMORY_DB_PATH), { recursive: true });
}

interface MemoryRecord {
    id: string;
    vector: number[];
    text: string;
    metadata: string; // LanceDB handles complex types best if serialized or specific columns
    timestamp: number;
}

export class VectorMemory {
    private openai: OpenAI | null = null;
    private db: any = null;
    private table: any = null;
    private tableName: string;
    private embeddingMode: 'openai' | 'local';
    private localDims = 256;

    constructor() {
        if (OPENAI_API_KEY) {
            this.openai = new OpenAI({ apiKey: OPENAI_API_KEY });
        }
        this.embeddingMode = this.openai ? 'openai' : 'local';
        this.tableName = this.embeddingMode === 'openai' ? 'joe_memory' : `joe_memory_local_${this.localDims}`;
    }

    async init() {
        try {
            console.log('[VectorMemory] Attempting to load LanceDB...');
            const lancedb = require('@lancedb/lancedb');

            this.db = await lancedb.connect(MEMORY_DB_PATH);

            const existingTables = await this.db.tableNames();

            if (existingTables.includes(this.tableName)) {
                this.table = await this.db.openTable(this.tableName);
            } else {
                // Initial schema creation with a dummy row to define types, then delete it or keep it?
                // LanceDB usually infers from data. We can pass a schema but infer is easier for JS.
                // We'll lazy init on first add if not exists, OR create with empty data if possible.
                // For simplified flow: We won't create 'table' here if it doesn't exist.
                // We will handle it in `add`.
                console.log('[VectorMemory] Table does not exist yet. Will create on first add.');
            }

            console.log(`[VectorMemory] Connected to LanceDB at ${MEMORY_DB_PATH}`);
        } catch (e) {
            console.error('[VectorMemory] Failed to init LanceDB (Module might be missing or broken). Memory features disabled.', e);
        }
    }

    async createEmbedding(text: string): Promise<number[]> {
        if (this.openai) {
            try {
                const response = await this.openai.embeddings.create({
                    model: "text-embedding-3-small",
                    input: text,
                    encoding_format: "float",
                });
                return response.data[0].embedding;
            } catch (e) {
                console.error('[VectorMemory] Embedding failed:', e);
                throw new Error(`Failed to create embedding: ${e instanceof Error ? e.message : 'Unknown error'}`);
            }
        }
        return this.createLocalEmbedding(text);
    }

    private createLocalEmbedding(text: string): number[] {
        const dims = this.localDims;
        const vec = new Array<number>(dims).fill(0);
        const normalized = String(text || '').normalize('NFKC').toLowerCase();
        const tokens = normalized
            .split(/[^\p{L}\p{N}]+/gu)
            .map(t => t.trim())
            .filter(t => t.length >= 2)
            .slice(0, 5000);

        for (const tok of tokens) {
            const digest = crypto.createHash('sha256').update(tok).digest();
            const n = digest.readUInt32BE(0);
            const idx = n % dims;
            const sign = (n & 1) === 0 ? 1 : -1;
            vec[idx] += sign;
        }

        let norm = 0;
        for (const v of vec) norm += v * v;
        norm = Math.sqrt(norm) || 1;
        for (let i = 0; i < vec.length; i++) vec[i] = vec[i] / norm;
        return vec;
    }

    async add(id: string, text: string, metadata: Record<string, any> = {}) {
        if (!this.db) await this.init();
        if (!this.db) {
            throw new Error('[VectorMemory] Database not available. Cannot add memory.');
        }

        const vector = await this.createEmbedding(text);
        const record = {
            id,
            vector,
            text,
            metadata: JSON.stringify(metadata),
            timestamp: Date.now()
        };

        if (!this.table) {
            const tables = await this.db.tableNames();
            if (tables.includes(this.tableName)) {
                this.table = await this.db.openTable(this.tableName);
            } else {
                this.table = await this.db.createTable(this.tableName, [record]);
                return; // Created with the record
            }
        }

        // Add to existing
        await this.table.add([record]);
    }

    async search(query: string, limit: number = 5) {
        if (!this.db) await this.init();
        if (!this.table || !this.db) {
            // Table doesn't exist = no memory
            return { ids: [[]], documents: [[]], distances: [[]] };
        }

        const queryVector = await this.createEmbedding(query);

        try {
            const results = await this.table.vectorSearch(queryVector)
                .limit(limit)
                .toArray();

            // Map to old API format for compatibility
            const ids = results.map((r: any) => r.id as string);
            const docs = results.map((r: any) => r.text as string);
            // LanceDB returns 'score' or '_distance' depending on version/config. 
            // Usually '_distance'. Lower is better (L2) or Higher (Cosine)? 
            // Default is usually L2. We need to check docs or observe.
            // Assuming Euclidean distance for now (lower is better).
            // We'll normalize or just pass it through.
            const dists = results.map((r: any) => (r._distance || 0) as number);

            return {
                ids: [ids],
                documents: [docs],
                distances: [dists] // Note: Metrics might differ from Cosine Sim
            };
        } catch (e) {
            console.error('[VectorMemory] Search failed:', e);
            return { ids: [[]], documents: [[]], distances: [[]] };
        }
    }
}
