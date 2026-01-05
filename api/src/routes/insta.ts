import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../middleware/auth';

type PostId = string;
type UserId = string;
type Comment = { userId: UserId; text: string; ts: number };
type Post = {
  id: PostId;
  userId: UserId;
  caption?: string;
  imageHref?: string;
  likes: Set<UserId>;
  comments: Comment[];
  ts: number;
};

const ARTIFACT_DIR = process.env.ARTIFACT_DIR || '/tmp/joe-artifacts';
const INSTA_DIR = path.join(ARTIFACT_DIR, 'insta');
try { if (!fs.existsSync(INSTA_DIR)) fs.mkdirSync(INSTA_DIR, { recursive: true }); } catch {}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, INSTA_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '') || '';
    const base = `post_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, base);
  },
});
const upload = multer({ storage });

const posts: Post[] = [];
function nextPostId(): PostId {
  return `p_${posts.length + 1}`;
}

const router = Router();

router.get('/feed', async (_req: Request, res: Response) => {
  const limitRaw = String((_req.query as any)?.limit || '').trim();
  const limit = Number(limitRaw) > 0 ? Number(limitRaw) : 20;
  const sorted = posts.slice().sort((a, b) => b.ts - a.ts);
  const sliced = sorted.slice(0, limit).map((p) => ({
    id: p.id,
    userId: p.userId,
    caption: p.caption,
    imageHref: p.imageHref,
    likes: p.likes.size,
    comments: p.comments,
    ts: p.ts,
  }));
  return res.json({ posts: sliced });
});

router.get('/post/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id || '').trim();
  const p = posts.find((x) => x.id === id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  return res.json({
    id: p.id,
    userId: p.userId,
    caption: p.caption,
    imageHref: p.imageHref,
    likes: p.likes.size,
    comments: p.comments,
    ts: p.ts,
  });
});

router.post('/post', authenticate as any, upload.single('image'), async (req: Request, res: Response) => {
  const userId = (req as any).auth?.sub as string;
  const caption = typeof (req.body as any)?.caption === 'string' ? (req.body as any).caption : undefined;
  const file = (req as any).file as Express.Multer.File | undefined;
  const id = nextPostId();
  const href = file ? `/artifacts/insta/${path.basename(file.filename)}` : undefined;
  const post: Post = {
    id,
    userId: String(userId || 'unknown'),
    caption: caption ? String(caption).trim() : undefined,
    imageHref: href,
    likes: new Set<UserId>(),
    comments: [],
    ts: Date.now(),
  };
  posts.push(post);
  return res.json({
    id: post.id,
    userId: post.userId,
    caption: post.caption,
    imageHref: post.imageHref,
    likes: post.likes.size,
    comments: post.comments,
    ts: post.ts,
  });
});

router.post('/like', authenticate as any, async (req: Request, res: Response) => {
  const userId = (req as any).auth?.sub as string;
  const postId = String((req.body as any)?.postId || '').trim();
  const p = posts.find((x) => x.id === postId);
  if (!p) return res.status(404).json({ error: 'Not found' });
  p.likes.add(String(userId || 'unknown'));
  return res.json({ id: p.id, likes: p.likes.size });
});

router.post('/comment', authenticate as any, async (req: Request, res: Response) => {
  const userId = (req as any).auth?.sub as string;
  const postId = String((req.body as any)?.postId || '').trim();
  const text = String((req.body as any)?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Missing text' });
  const p = posts.find((x) => x.id === postId);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const c: Comment = { userId: String(userId || 'unknown'), text, ts: Date.now() };
  p.comments.push(c);
  return res.json({ id: p.id, comments: p.comments });
});

export default router;
