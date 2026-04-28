import fs from 'fs';
import path from 'path';
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const KNOWLEDGE_FILE = path.join(DATA_DIR, 'knowledge.json');

// Ensure directory exists (sync is fine at startup, or make it async if called later)
if (!fs.existsSync(DATA_DIR)) {
    try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch { }
}

export interface Document {
    id: string;
    filename: string;
    content: string;
    tags: string[];
    createdAt: number;
    embedding?: number[]; // Placeholder for future
}

// Load knowledge base
async function loadKnowledge(): Promise<Document[]> {
    try {
        await fs.promises.access(KNOWLEDGE_FILE);
        const data = await fs.promises.readFile(KNOWLEDGE_FILE, 'utf-8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

// Save knowledge base
async function saveKnowledge(docs: Document[]) {
    await fs.promises.writeFile(KNOWLEDGE_FILE, JSON.stringify(docs, null, 2));
}

export const KnowledgeService = {
    getAll: async () => await loadKnowledge(),

    add: async (filename: string, content: string, tags: string[] = []) => {
        console.log(`[KnowledgeService] Adding: ${filename}`);
        const docs = await loadKnowledge();
        const newDoc: Document = {
            id: uuidv4(),
            filename,
            content,
            tags,
            createdAt: Date.now()
        };
        docs.push(newDoc);
        try {
            await saveKnowledge(docs);
            console.log(`[KnowledgeService] Saved ${docs.length} docs.`);
        } catch (e) {
            console.error('[KnowledgeService] Save failed', e);
        }
        return newDoc;
    },

    delete: async (id: string) => {
        const docs = await loadKnowledge();
        const filtered = docs.filter(d => d.id !== id);
        await saveKnowledge(filtered);
    },

    search: async (query: string): Promise<{ document: Document, score: number, snippet: string }[]> => {
        const docs = await loadKnowledge();
        const q = query.toLowerCase();
        const tokens = q.split(/\s+/).filter(t => t.length > 2);

        const results = docs.map(doc => {
            const text = doc.content.toLowerCase();
            const filename = doc.filename.toLowerCase();
            const tags = (doc.tags || []).map(t => t.toLowerCase());
            
            let score = 0;

            // 1. Exact phrase match (High weight)
            if (text.includes(q)) score += 20;
            if (filename.includes(q)) score += 30;

            // 2. Token matches with field weighting
            tokens.forEach(token => {
                // Filename match
                if (filename.includes(token)) score += 10;
                
                // Tag match (Very high relevance)
                if (tags.some(t => t.includes(token))) score += 15;

                // Content frequency match
                const regex = new RegExp(token, 'gi');
                const count = (text.match(regex) || []).length;
                score += Math.min(count, 5); // Cap frequency score
            });

            // 3. Recency boost (Small)
            const daysOld = (Date.now() - doc.createdAt) / (1000 * 60 * 60 * 24);
            if (daysOld < 7) score += 2;

            // Find best snippet
            const idx = text.indexOf(tokens[0] || q);
            const start = Math.max(0, idx - 60);
            const end = Math.min(text.length, start + 300);
            let snippet = doc.content.substring(start, end).trim();
            if (start > 0) snippet = '...' + snippet;
            if (end < text.length) snippet += '...';

            return { document: doc, score, snippet };
        });

        // Filter and Normalize
        return results
            .filter(r => r.score > 0)
            .sort((a, b) => b.score - a.score)
            .map(r => ({ ...r, score: Math.min(r.score / 50, 1) }));
    },

    parsePDF: async (buffer: Buffer): Promise<string> => {
        try {
            // Using dynamic import to avoid ESM/CJS require conflicts at startup
            const pdf = await import('pdf-parse');
            const data = await (pdf.default || pdf)(buffer);
            return data.text;
        } catch (e) {
            console.error('PDF Parse Error', e);
            throw new Error('Failed to parse PDF');
        }
    }
};
