import fs from 'fs';
import path from 'path';

// A lightweight Vector Store for Deep Memory
// Uses a hybrid TF-IDF + Keyword matching approach for speed and zero-dependency on Python/Heavy Models

interface Document {
    id: string;
    content: string;
    metadata: Record<string, any>;
    embedding?: number[]; // Placeholder if we add real embeddings later
    tokens?: Set<string>; // For TF-IDF/Jaccard
}

export class VectorDbService {
    private documents: Document[] = [];
    private storagePath: string;

    constructor(storageDir: string = 'data/memory') {
        this.storagePath = path.resolve(process.cwd(), storageDir);
        if (!fs.existsSync(this.storagePath)) {
            fs.mkdirSync(this.storagePath, { recursive: true });
        }
        this.load();
    }

    private normalizeForSearch(text: string): string {
        let t = (text || '').normalize('NFKC').toLowerCase();

        t = t
            .replace(/[\u0640]/g, '')
            .replace(/[\u064B-\u065F\u0670]/g, '')
            .replace(/[أإآٱ]/g, 'ا')
            .replace(/ؤ/g, 'و')
            .replace(/ئ/g, 'ي')
            .replace(/ى/g, 'ي');

        return t;
    }

    private minTokenLength(token: string): number {
        return /^[a-z0-9_]+$/i.test(token) ? 3 : 2;
    }

    private load() {
        const file = path.join(this.storagePath, 'index.json');
        if (fs.existsSync(file)) {
            try {
                const raw = fs.readFileSync(file, 'utf-8');
                this.documents = JSON.parse(raw).map((d: any) => ({
                    ...d,
                    tokens: new Set(d.tokens || [])
                }));
                console.log(`[VectorDB] Loaded ${this.documents.length} documents from memory.`);
            } catch (e) {
                console.error('[VectorDB] Failed to load index:', e);
            }
        }
    }

    private save() {
        const file = path.join(this.storagePath, 'index.json');
        const serializable = this.documents.map(d => ({
            ...d,
            tokens: Array.from(d.tokens || [])
        }));
        fs.writeFileSync(file, JSON.stringify(serializable, null, 2));
    }

    private tokenize(text: string): Set<string> {
        const normalized = this.normalizeForSearch(text)
            .replace(/[^\p{L}\p{N}_]+/gu, ' ')
            .trim();

        const words = normalized
            .split(/\s+/)
            .filter(Boolean)
            .filter(w => w.length >= this.minTokenLength(w));

        return new Set(words);
    }

    async addDocument(content: string, metadata: Record<string, any>) {
        // Basic chunking (if content is huge, we should split it, but we assume caller chunks it)
        const doc: Document = {
            id: Math.random().toString(36).substring(7),
            content,
            metadata,
            tokens: this.tokenize(content + ' ' + (metadata.filePath || ''))
        };
        this.documents.push(doc);
        // Auto-save every 50 docs or so? For now, save immediately for safety
        this.save();
    }

    async clear() {
        this.documents = [];
        this.save();
    }

    async search(query: string, limit: number = 5): Promise<{ doc: Document, score: number }[]> {
        const queryTokens = this.tokenize(query);
        if (queryTokens.size === 0) return [];

        const scored = this.documents.map(doc => {
            // Jaccard similarity / Keyword Overlap
            let intersection = 0;
            queryTokens.forEach(t => {
                if (doc.tokens?.has(t)) intersection++;
            });

            const union = (queryTokens.size + (doc.tokens?.size || 0)) - intersection;
            const score = union > 0 ? intersection / union : 0;

            // Bonus for filename matches (if present in metadata)
            const filenameMatch = doc.metadata.filePath &&
                queryTokens.has(path.basename(doc.metadata.filePath).toLowerCase().split('.')[0]);

            return { doc, score: score + (filenameMatch ? 0.3 : 0) };
        });

        return scored
            .filter(s => s.score > 0.05) // Minimum relevance
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }

    getStats() {
        return {
            documentCount: this.documents.length,
            storagePath: this.storagePath
        };
    }
}

export const vectorDb = new VectorDbService();
