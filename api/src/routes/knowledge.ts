import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import multer from 'multer';
import fs from 'fs';
import { KnowledgeService } from '../services/knowledge';

const router = Router();
const upload = multer({ dest: '/tmp/joe-uploads' });

router.post('/upload', authenticate, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const filePath = req.file.path;
        const buffer = await fs.promises.readFile(filePath);
        let content = '';

        if (req.file.mimetype === 'application/pdf') {
             try {
                 content = await KnowledgeService.parsePDF(buffer);
             } catch (err) {
                 console.error('PDF Parse error:', err);
                 return res.status(500).json({ error: 'Failed to parse PDF' });
             }
        } else {
             content = buffer.toString('utf-8');
        }

        // Cleanup temp file
        await fs.promises.unlink(filePath);

        const doc = await KnowledgeService.add(req.file.originalname, content);

        res.json({ success: true, document: doc });
    } catch (error: any) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/list', authenticate, async (req, res) => {
    const docs = await KnowledgeService.getAll();
    res.json(docs.map(d => ({ id: d.id, filename: d.filename, size: d.content.length })));
});

router.post('/query', authenticate, async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Query required' });

    const results = await KnowledgeService.search(query);
    
    res.json({ results: results.map(r => ({ id: r.document.id, filename: r.document.filename, snippet: r.snippet, score: r.score })) });
});

router.delete('/:id', authenticate, async (req, res) => {
    const { id } = req.params;
    await KnowledgeService.delete(id);
    res.json({ success: true });
});

export default router;