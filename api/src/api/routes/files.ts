import { Router, Request, Response, RequestHandler } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
const pdf = require('pdf-parse');
import { FileModel } from '../../shared/models/file';
import { authenticate } from '../middleware/auth';

/**
 * Ask MongoDB only when it is actually there. `FileModel.findById` on a
 * dead connection does not fail fast — mongoose BUFFERS the query for its
 * 10-second timeout, twice for two attachments. Measured on the live wire
 * proof: /runs/start took 20.0 seconds to deliver two files that were
 * sitting in the offline cache the whole time. The user's machine runs
 * without Mongo, so that stall would be on EVERY message with attachments.
 */
const mongoReady = () => mongoose.connection?.readyState === 1;

// Offline fallback: uploads are always written to .file-cache.json (see /upload),
// so file retrieval must read from it when MongoDB is unavailable (JSON/mock mode).
function readFileFromCache(id: string): any | null {
    try {
        const cacheFilePath = path.join(__dirname, '../../.file-cache.json');
        if (!fs.existsSync(cacheFilePath)) return null;
        const cache = JSON.parse(fs.readFileSync(cacheFilePath, 'utf-8'));
        return cache[id] || null;
    } catch { return null; }
}

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
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit (Universal)
  fileFilter: (req, file, cb) => {
    // AUDIT-117: Reject executables, HTML, and scripts
    const dangerousExtensions = ['.exe', '.sh', '.bat', '.cmd', '.msi', '.ps1', '.html', '.htm'];
    const lowerName = file.originalname.toLowerCase();
    
    if (dangerousExtensions.some(ext => lowerName.endsWith(ext))) {
      return cb(new Error('File type not allowed for security reasons.'));
    }

    const dangerousMimes = [
      'application/x-msdownload',
      'application/x-sh',
      'text/html'
    ];
    
    if (dangerousMimes.includes(file.mimetype)) {
      return cb(new Error('MIME type not allowed for security reasons.'));
    }
    
    cb(null, true);
  }
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

/** An uploaded file, in the shape a run carries it as an attachment. */
export interface UploadedAttachment {
    id: string;
    name: string;
    mimeType: string;
    size: number;
    /** The text extracted at upload time (PDF text, file text) — '' for media. */
    content: string;
    /** Where the raw bytes live on disk, for tools that can open them. */
    path: string;
}

/**
 * Load uploaded files by id so a run can actually READ what the user attached.
 *
 * This is the missing half of the paperclip button: the upload route above
 * extracts each file's text and stores it, the composer sends the ids with the
 * message — and /runs/start used to drop them on the floor, so Joe answered
 * every «لخص هذا الملف» without ever seeing the file.
 *
 * MongoDB first, the offline cache second — the same order the GET routes use.
 * An unknown id is skipped rather than thrown: a missing attachment must not
 * cost the user their whole message.
 */
export async function loadUploadedFiles(ids: string[]): Promise<UploadedAttachment[]> {
    const out: UploadedAttachment[] = [];
    for (const raw of (Array.isArray(ids) ? ids : []).slice(0, 12)) {
        const id = String(raw || '').trim();
        if (!id) continue;
        let f: any = null;
        if (mongoReady()) { try { f = await FileModel.findById(id); } catch { /* offline */ } }
        if (!f) f = readFileFromCache(id);
        if (!f) continue;
        out.push({
            id,
            name: String(f.originalName || f.filename || 'file'),
            mimeType: String(f.mimeType || ''),
            size: Number(f.size || 0),
            content: String(f.content || ''),
            path: String(f.path || ''),
        });
    }
    return out;
}

// Get file content/metadata
router.get('/:id', authenticate as any, async (req: Request, res: Response) => {
  try {
    let file: any = null;
    if (mongoReady()) { try { file = await FileModel.findById(req.params.id); } catch { /* offline */ } }
    if (!file) file = readFileFromCache(String(req.params.id));
    if (!file) return res.status(404).json({ error: 'File not found' });
    res.json(file);
  } catch (e) {
    res.status(500).json({ error: 'Error fetching file' });
  }
});

// Serve raw file
router.get('/:id/raw', authenticate as any, async (req: Request, res: Response) => {
  try {
    let file: any = null;
    if (mongoReady()) { try { file = await FileModel.findById(req.params.id); } catch { /* offline */ } }
    if (!file) file = readFileFromCache(String(req.params.id));
    if (!file || !file.path) return res.status(404).json({ error: 'File not found' });
    res.sendFile(file.path);
  } catch (e) {
    res.status(500).json({ error: 'Error serving file' });
  }
});

export default router;
