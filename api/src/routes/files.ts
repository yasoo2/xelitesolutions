import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import pdf from 'pdf-parse';
import { FileModel } from '../models/file';
import { authenticate } from '../middleware/auth';

const router = Router();

// Configure Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Upload endpoint
router.post('/upload', authenticate, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { sessionId } = req.body;
    let content = '';

    // Extract content based on type
    if (req.file.mimetype === 'application/pdf') {
      const dataBuffer = fs.readFileSync(req.file.path);
      const data = await pdf(dataBuffer);
      content = data.text;
    } else if (req.file.mimetype.startsWith('text/') || 
               req.file.mimetype === 'application/json' || 
               req.file.mimetype === 'application/javascript' ||
               req.file.mimetype.includes('code')) {
      content = fs.readFileSync(req.file.path, 'utf8');
    }

    const fileDoc = await FileModel.create({
      originalName: req.file.originalname,
      filename: req.file.filename,
      mimeType: req.file.mimetype,
      size: req.file.size,
      path: req.file.path,
      content: content.slice(0, 50000), // Limit content size for DB
      sessionId
    });

    res.json(fileDoc);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Get file content/metadata
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const file = await FileModel.findById(req.params.id);
    if (!file) return res.status(404).json({ error: 'File not found' });
    res.json(file);
  } catch (e) {
    res.status(500).json({ error: 'Error fetching file' });
  }
});

// Serve raw file
router.get('/:id/raw', authenticate, async (req: Request, res: Response) => {
  try {
    const file = await FileModel.findById(req.params.id);
    if (!file) return res.status(404).json({ error: 'File not found' });
    res.sendFile(file.path);
  } catch (e) {
    res.status(500).json({ error: 'Error serving file' });
  }
});

export default router;
