import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import pdf from 'pdf-parse';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const KNOWLEDGE_FILE = path.join(DATA_DIR, 'knowledge.json');

if (!fs.existsSync(DATA_DIR)) {
    try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
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
function loadKnowledge(): Document[] {
    if (!fs.existsSync(KNOWLEDGE_FILE)) return [];
    try {
        const data = fs.readFileSync(KNOWLEDGE_FILE, 'utf-8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

// Save knowledge base
function saveKnowledge(docs: Document[]) {
    fs.writeFileSync(KNOWLEDGE_FILE, JSON.stringify(docs, null, 2));
}

export const KnowledgeService = {
    getAll: () => loadKnowledge(),

    add: (filename: string, content: string, tags: string[] = []) => {
        const docs = loadKnowledge();
        const newDoc: Document = {
            id: uuidv4(),
            filename,
            content,
            tags,
            createdAt: Date.now()
        };
        docs.push(newDoc);
        saveKnowledge(docs);
        return newDoc;
    },

    delete: (id: string) => {
        const docs = loadKnowledge();
        const filtered = docs.filter(d => d.id !== id);
        saveKnowledge(filtered);
    },

    search: (query: string): { document: Document, score: number, snippet: string }[] => {
        const docs = loadKnowledge();
        const q = query.toLowerCase();
        
        // Simple keyword scoring
        const results = docs.map(doc => {
            const text = doc.content.toLowerCase();
            const filename = doc.filename.toLowerCase();
            let score = 0;
            
            // Exact phrase match
            if (text.includes(q)) score += 10;
            if (filename.includes(q)) score += 5;
            
            // Token match
            const tokens = q.split(/\s+/);
            let matches = 0;
            tokens.forEach(t => {
                if (text.includes(t)) matches++;
            });
            
            score += matches;

            // Find snippet
            const idx = text.indexOf(q.split(' ')[0]);
            const start = Math.max(0, idx - 50);
            const snippet = doc.content.substring(start, start + 300) + '...';

            return { document: doc, score, snippet };
        });

        return results.filter(r => r.score > 0).sort((a, b) => b.score - a.score);
    },

    parsePDF: async (buffer: Buffer): Promise<string> => {
        try {
            const data = await pdf(buffer);
            return data.text;
        } catch (e) {
            console.error('PDF Parse Error', e);
            throw new Error('Failed to parse PDF');
        }
    }
};
