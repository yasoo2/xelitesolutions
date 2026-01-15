import OpenAI from 'openai';
import path from 'path';
import fs from 'fs';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MEMORY_DB_PATH = path.join(process.cwd(), 'data', 'joe_memory.json');

if (!fs.existsSync(path.dirname(MEMORY_DB_PATH))) {
    fs.mkdirSync(path.dirname(MEMORY_DB_PATH), { recursive: true });
}

interface MemoryRecord {
    id: string;
    vector: number[];
    text: string;
    metadata: any;
    timestamp: number;
}

export class VectorMemory {
    private openai: OpenAI | null = null;
    private memoryData: MemoryRecord[] = [];
    private loaded = false;

    constructor() {
        if (OPENAI_API_KEY) {
            this.openai = new OpenAI({ apiKey: OPENAI_API_KEY });
        }
    }

    private load() {
        if (this.loaded) return;
        try {
            if (fs.existsSync(MEMORY_DB_PATH)) {
                const raw = fs.readFileSync(MEMORY_DB_PATH, 'utf-8');
                this.memoryData = JSON.parse(raw);
            }
        } catch (e) {
            console.error('[VectorMemory] Failed to load memory:', e);
            this.memoryData = [];
        }
        this.loaded = true;
    }

    private save() {
        try {
            fs.writeFileSync(MEMORY_DB_PATH, JSON.stringify(this.memoryData, null, 2));
        } catch (e) {
            console.error('[VectorMemory] Failed to save memory:', e);
        }
    }

    async init() {
        this.load();
        console.log(`[VectorMemory] Initialized with ${this.memoryData.length} records.`);
    }

    async createEmbedding(text: string): Promise<number[]> {
        if (!this.openai) {
            console.warn('[VectorMemory] No OpenAI Key. Using random vector (MOCK).');
            return Array.from({ length: 1536 }, () => Math.random());
        }
        const response = await this.openai.embeddings.create({
            model: "text-embedding-3-small",
            input: text,
            encoding_format: "float",
        });
        return response.data[0].embedding;
    }

    private cosineSimilarity(vecA: number[], vecB: number[]) {
        let dot = 0.0;
        let normA = 0.0;
        let normB = 0.0;
        for (let i = 0; i < vecA.length; i++) {
            dot += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    async add(id: string, text: string, metadata: Record<string, any> = {}) {
        this.load();
        const vector = await this.createEmbedding(text);
        const record: MemoryRecord = { id, vector, text, metadata, timestamp: Date.now() };

        const existingIdx = this.memoryData.findIndex(m => m.id === id);
        if (existingIdx >= 0) {
            this.memoryData[existingIdx] = record;
        } else {
            this.memoryData.push(record);
        }
        this.save();
    }

    async search(query: string, limit: number = 5) {
        this.load();
        const queryVector = await this.createEmbedding(query);

        const scored = this.memoryData.map(record => ({
            record,
            score: this.cosineSimilarity(queryVector, record.vector)
        }));

        // Sort descending by score
        scored.sort((a, b) => b.score - a.score);
        const top = scored.slice(0, limit);

        return {
            ids: [top.map(r => r.record.id)],
            documents: [top.map(r => r.record.text)],
            distances: [top.map(r => r.score)]
        };
    }
}
