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
      // Universal Text Reader: Try to read text smartly
      try {
        const stats = await fs.promises.stat(req.file.path);
        const fileSize = stats.size;
        const CHUNK_SIZE = 1024 * 1024; // 1MB

        let finalContent = '';
        let isBinary = false;

        // If file is "massive" (larger than 2 chunks), read Head + Tail
        if (fileSize > 2 * CHUNK_SIZE) {
          console.info(`[UniversalLoader] Optimizing massive file: ${req.file.originalname} (${(fileSize / 1024 / 1024).toFixed(2)}MB)`);
          const handle = await fs.promises.open(req.file.path, 'r');

          try {
            // Read Head
            const headBuf = Buffer.alloc(CHUNK_SIZE);
            await handle.read(headBuf, 0, CHUNK_SIZE, 0);

            // Binary Check on Head
            if (headBuf.includes(0)) {
              isBinary = true;
            } else {
              // Read Tail
              const tailBuf = Buffer.alloc(CHUNK_SIZE);
              await handle.read(tailBuf, 0, CHUNK_SIZE, fileSize - CHUNK_SIZE);

              finalContent = headBuf.toString('utf8') +
                '\n...[Content Truncated (Included Start and End of file)]...\n' +
                tailBuf.toString('utf8');
            }
          } finally {
            await handle.close();
          }

        } else {
          // Small enough to read normally
          const buf = await fs.promises.readFile(req.file.path);
          // Check for null bytes (binary indicator) in the first 8000 bytes
          const sample = buf.slice(0, Math.min(buf.length, 8000));
          if (sample.includes(0)) {
            isBinary = true;
          } else {
            finalContent = buf.toString('utf8');
          }
        }

        if (!isBinary) {
          // Safe Truncate for DB (Secondary check, mostly for the 'else' case or if 2MB is still too big)
          const MAX_DB_CONTENT = 2 * 1024 * 1024;
          if (Buffer.byteLength(finalContent, 'utf8') > MAX_DB_CONTENT) {
            console.warn(`[UniversalLoader] Additional truncation for DB: ${req.file.originalname}`);
            finalContent = finalContent.slice(0, MAX_DB_CONTENT) + '\n\n...[Content Truncated due to size]...';
          }
          content = finalContent;
        } else {
          console.info(`[UniversalLoader] Skipping binary file: ${req.file.originalname} (${req.file.mimetype})`);
        }
      } catch (e) {
        console.warn('[UniversalLoader] Text read failed:', e);
      }
    }

    // Assign content directly since we handled truncation logic above
    let finalContent = content;

    // Generate a unique ID (MongoDB-compatible format)
    const crypto = require('crypto');
    const generatedId = crypto.randomBytes(12).toString('hex'); // 24 char hex (like MongoDB ObjectId)

    // Prepare file data
    const fileData = {
      _id: generatedId,
      id: generatedId,
      originalName: req.file.originalname,
      filename: req.file.filename,
      mimeType: req.file.mimetype,
      size: req.file.size,
      path: req.file.path,
      content: finalContent,
      sessionId,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // [PRIORITY 1] Save to cache FIRST (works offline)
    try {
      const cacheFilePath = path.join(__dirname, '../../.file-cache.json');
      let cache: any = {};
      if (fs.existsSync(cacheFilePath)) {
        cache = JSON.parse(fs.readFileSync(cacheFilePath, 'utf-8'));
      }
      cache[generatedId] = {
        id: generatedId,
        originalName: fileData.originalName,
        filename: fileData.filename,
        mimeType: fileData.mimeType,
        size: fileData.size,
        path: fileData.path,
        content: fileData.content
      };
      fs.writeFileSync(cacheFilePath, JSON.stringify(cache, null, 2));
      console.log('[File Cache] Saved file to cache:', generatedId);
    } catch (cacheErr) {
      console.error('[File Cache] Failed to write cache:', cacheErr);
      return res.status(500).json({ error: 'Failed to save file' });
    }

    // [PRIORITY 2] Try to save to MongoDB (fire-and-forget, non-blocking)
    FileModel.create(fileData)
      .then((fileDoc) => {
        console.log('[MongoDB] File saved to DB successfully:', fileDoc._id);
      })
      .catch((dbErr) => {
        console.warn('[MongoDB] Failed to save to DB (continuing with cache):', dbErr.message);
      });

    // Return success immediately with generated ID
    res.json(fileData);
  } catch (e) {
    console.error('[Upload Error] Exception occurred:', e instanceof Error ? e.message : String(e));
    console.error('[Upload Error] Stack:', e instanceof Error ? e.stack : 'No stack trace');
    console.error('[Upload Error] Full error object:', e);
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
