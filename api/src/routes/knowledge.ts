import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import pdf from 'pdf-parse';

const router = Router();
const upload = multer({ dest: '/tmp/joe-uploads' });

// Simple In-Memory Vector Store Placeholder
interface Document {
    id: string;
    filename: string;
    content: string;
    embedding?: number[]; // Placeholder
}

const knowledgeBase: Document[] = [];

router.post('/upload', authenticate, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const filePath = req.file.path;
        const buffer = fs.readFileSync(filePath);
        let content = '';

        if (req.file.mimetype === 'application/pdf') {
             try {
                 const data = await pdf(buffer);
                 content = data.text;
             } catch (err) {
                 console.error('PDF Parse error:', err);
                 return res.status(500).json({ error: 'Failed to parse PDF' });
             }
        } else {
             content = buffer.toString('utf-8');
        }

        // Cleanup temp file
        fs.unlinkSync(filePath);

        const doc: Document = {
            id: Math.random().toString(36).substring(7),
            filename: req.file.originalname,
            content: content
        };

        knowledgeBase.push(doc);

        res.json({ success: true, document: doc });
    } catch (error: any) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/list', authenticate, (req, res) => {
    res.json(knowledgeBase.map(d => ({ id: d.id, filename: d.filename, size: d.content.length })));
});

router.post('/query', authenticate, async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Query required' });

    // Simple keyword search for now (RAG placeholder)
    const results = knowledgeBase.filter(d => d.content.toLowerCase().includes(query.toLowerCase()));
    
    res.json({ results: results.map(d => ({ id: d.id, filename: d.filename, snippet: d.content.substring(0, 200) + '...' })) });
});

router.delete('/:id', authenticate, (req, res) => {
    const { id } = req.params;
    const index = knowledgeBase.findIndex(d => d.id === id);
    if (index === -1) {
        return res.status(404).json({ error: 'Document not found' });
    }
    knowledgeBase.splice(index, 1);
    res.json({ success: true });
});

export default router;