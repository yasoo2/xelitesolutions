import { Router, Request, Response, RequestHandler } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
const pdf = require('pdf-parse');
import { FileModel } from '../models/file';
import { authenticate } from '../middleware/auth';

const router = Router();

// Configure Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    fs.mkdir(uploadDir, { recursive: true }, (err) => {
      if (err) return cb(err, uploadDir);
      cb(null, uploadDir);
    });
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit (Universal)
});

// Upload endpoint
router.post('/upload', authenticate as any, upload.single('file') as any, async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { sessionId } = req.body;
    let content = '';

    const lowerName = req.file.originalname.toLowerCase();

    // Universal Loader Logic
    if (req.file.mimetype === 'application/pdf') {
      try {
        const dataBuffer = await fs.promises.readFile(req.file.path);
        const data = await pdf(dataBuffer);
        content = data.text;
      } catch (err) {
        console.warn('[UniversalLoader] PDF parse warning:', err);
      }
    } else if (
      !req.file.mimetype.startsWith('image/') &&
      !req.file.mimetype.startsWith('audio/') &&
      !req.file.mimetype.startsWith('video/')
    ) {
      // Universal Text Reader: Try to read EVERYTHING else as text
      try {
        const buf = await fs.promises.readFile(req.file.path);
        // Heuristic: Check for null bytes (binary indicator) in the first 8000 bytes
        const sample = buf.slice(0, Math.min(buf.length, 8000));
        const isBinary = sample.includes(0);

        if (!isBinary) {
          content = buf.toString('utf8');
        } else {
          console.info(`[UniversalLoader] Skipping binary file: ${req.file.originalname} (${req.file.mimetype})`);
        }
      } catch (e) {
        console.warn('[UniversalLoader] Text read failed:', e);
      }
    }

    // Database BSON limit is 16MB. We keep it safe at 2MB per file content field.
    // If larger, we truncate and mark it.
    const MAX_DB_CONTENT = 2 * 1024 * 1024;
    let finalContent = content;
    if (Buffer.byteLength(content, 'utf8') > MAX_DB_CONTENT) {
      console.warn(`[UniversalLoader] Truncating content for DB: ${req.file.originalname}`);
      finalContent = content.slice(0, MAX_DB_CONTENT) + '\n\n...[Content Truncated due to size]...';
    }

    const fileDoc = await FileModel.create({
      originalName: req.file.originalname,
      filename: req.file.filename,
      mimeType: req.file.mimetype,
      size: req.file.size,
      path: req.file.path,
      content: finalContent,
      sessionId
    });

    res.json(fileDoc);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Get file content/metadata
router.get('/:id', authenticate as any, async (req: Request, res: Response) => {
  try {
    const file = await FileModel.findById(req.params.id);
    if (!file) return res.status(404).json({ error: 'File not found' });
    res.json(file);
  } catch (e) {
    res.status(500).json({ error: 'Error fetching file' });
  }
});

// Serve raw file
router.get('/:id/raw', authenticate as any, async (req: Request, res: Response) => {
  try {
    const file = await FileModel.findById(req.params.id);
    if (!file) return res.status(404).json({ error: 'File not found' });
    res.sendFile(file.path);
  } catch (e) {
    res.status(500).json({ error: 'Error serving file' });
  }
});

export default router;
