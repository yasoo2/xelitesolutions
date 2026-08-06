/**
 * THE BACKEND FRONT — Joe builds real APIs, not just faces.
 *
 * Every world-class builder eventually hits the same wall: a beautiful
 * frontend with nowhere to PUT anything. This tool scaffolds a complete,
 * runnable Express API with a REAL database and ZERO native dependencies:
 *
 *   - node:sqlite when the runtime carries it (Node ≥ 22.5 — the user's
 *     machine runs Node 24, where it is stable);
 *   - a JSON file store with the IDENTICAL interface otherwise, chosen at
 *     boot by the generated db.js itself — the API works on every Node, and
 *     /api/health tells you honestly which backend you got.
 *
 * The discipline is the same as the React scaffolder: hand-written
 * parameterized templates that run by construction (no model writes code),
 * kind-aware resources (a restaurant's API serves dishes, a store's serves
 * products), bounded validation, parameterized statements, and a LIVE PROOF
 * at the end — the tool boots the real server (through the Execution
 * Authority), POSTs a real row over real HTTP, reads it back, and only
 * then reports the API as working.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { BaseTool } from '../base';
import { ToolPermission, ToolExecutionResult } from '../types';
import { brandFrom } from '../../../core/design/page-head';
import { detectPageKind, type PageKind } from '../../../core/design/blueprints';
import { broadcast, broadcastThinkingDetail, broadcastTerminalLine } from '../../../api/ws';
import { persistJoeProjects } from '../../../api/page-store';

const slug = (s: string) => (String(s || '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 32)) || 'api';
const js = (s: string) => String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ');

/** What this kind of business stores — the resource and its seed rows. */
export function apiResourceForKind(kind: PageKind, isAr: boolean, probe?: string): {
    resource: string; labelAr: string; seeds: Array<{ name: string; details: string; price: string }>;
} {
    if (kind === 'restaurant') {
        return {
            resource: 'dishes', labelAr: 'الأطباق',
            seeds: isAr ? [
                { name: 'طبق اليوم', details: 'وصفة الشيف الموسمية بمكونات طازجة', price: '48 ر.س' },
                { name: 'مشاوي مشكلة', details: 'تشكيلة مشاوي على الفحم مع الأرز', price: '65 ر.س' },
                { name: 'سلطة الموسم', details: 'خضار المزرعة مع صلصة الليمون', price: '24 ر.س' },
            ] : [
                { name: 'Dish of the day', details: 'The chef\'s seasonal recipe', price: '$18' },
                { name: 'Mixed grill', details: 'Charcoal grill selection with rice', price: '$24' },
            ],
        };
    }
    if (kind === 'store') {
        return {
            resource: 'products', labelAr: 'المنتجات',
            seeds: isAr ? [
                { name: 'الإصدار الكلاسيكي', details: 'الخيار الأقرب لقلوب عملائنا', price: '120 ر.س' },
                { name: 'الإصدار الفاخر', details: 'خامات أرقى ولمسة نهائية مميزة', price: '220 ر.س' },
                { name: 'طقم الهدية', details: 'تغليف أنيق جاهز للإهداء', price: '180 ر.س' },
            ] : [
                { name: 'Classic edition', details: 'The customer favourite', price: '$39' },
                { name: 'Premium edition', details: 'Finer materials, finished by hand', price: '$69' },
            ],
        };
    }
    // THE SERVER MUST STORE WHAT THE APP TALKS ABOUT.
    // Measured in the field: «social media platform … Messaging …» produced a
    // chat app pointed at /api/items — a conversation reading a CATALOGUE.
    // When the same request names an application, the resource is named after
    // it, so the two halves of the full stack are about the same thing.
    {
        const { detectAppKind } = require('../../../core/design/app-blueprints');
        const appKind = detectAppKind(String(probe || ''));
        const BY_APP: Record<string, [string, string]> = {
            social: ['posts', 'المنشورات'], chat: ['messages', 'الرسائل'], maps: ['places', 'الأماكن'], tasks: ['tasks', 'المهام'],
            notes: ['notes', 'الملاحظات'], expenses: ['expenses', 'المصاريف'], inventory: ['items', 'الأصناف'],
            booking: ['bookings', 'الحجوزات'], pos: ['sales', 'المبيعات'], crm: ['customers', 'العملاء'],
            lms: ['enrolments', 'التسجيلات'], contacts: ['contacts', 'جهات الاتصال'], habits: ['habits', 'العادات'],
        };
        const named = appKind ? BY_APP[appKind] : null;
        if (named) {
            return {
                resource: named[0], labelAr: named[1],
                seeds: [],           // a real app starts empty — no fabricated rows
            };
        }
    }
    return {
        resource: 'items', labelAr: 'العناصر',
        seeds: isAr ? [
            { name: 'عنصر تجريبي أول', details: 'أضيف مع بذر القاعدة — عدّله أو احذفه', price: '' },
            { name: 'عنصر تجريبي ثانٍ', details: 'المسارات جاهزة: أضف، عدّل، احذف', price: '' },
        ] : [
            { name: 'First sample item', details: 'Seeded with the database — edit or delete it', price: '' },
        ],
    };
}

/**
 * THE SERVER MUST STORE THE FIELDS THE APP ACTUALLY SENDS.
 *
 * Every generated backend used to store name/details/price — whatever the
 * system was about. So a clinic's React app posted
 * {name, phone, service, date, time, status} and the database kept `name`.
 * Five of six fields were dropped on the floor, silently, on every save. The
 * two halves of the full stack agreed on the resource's NAME and on nothing
 * else, which is exactly the «شغل كلام» this keeps being accused of.
 *
 * The columns now come from the same blueprint the frontend renders from, so
 * a booking system's table has date/time/status and a CRM's has the customer.
 * Presentation sites (a boutique, a restaurant menu) keep the catalogue shape:
 * their frontends are section builders that really do send name/details/price.
 */
export interface ApiColumn { key: string; type: 'TEXT' | 'REAL' | 'INT'; required: boolean }

export const CATALOGUE_COLUMNS: ApiColumn[] = [
    { key: 'name', type: 'TEXT', required: true },
    { key: 'details', type: 'TEXT', required: false },
    { key: 'price', type: 'TEXT', required: false },
];

/** SQL identifiers only — a field key is never interpolated unchecked. */
const safeKey = (k: string) => String(k || '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 40);

/** One blueprint field → one column. Shared by the child table and the parent. */
function columnsFromFields(fields: any[]): ApiColumn[] {
    return (fields || [])
        .map((f: any) => ({
            key: safeKey(f.key),
            type: f.type === 'number' ? 'REAL' as const : 'TEXT' as const,
            required: !!f.required,
        }))
        .filter((c: ApiColumn) => c.key && c.key !== 'id' && c.key !== 'created_at');
}

/**
 * THE PARENT TABLE, AS THE SERVER SEES IT.
 *
 * A blueprint that declares a relation («طبيب ← مواعيده») gets a SECOND real
 * table here: its own columns, its own CRUD, and a foreign key on the child
 * that the API refuses to accept unless the parent it points at exists. That
 * refusal is the whole point — a link that can dangle is not a relation.
 */
export interface ApiRelation {
    /** The parent collection: its table name and its URL segment. */
    resource: string;
    /** The foreign-key column carried by the CHILD row. */
    key: string;
    /** Which parent column names it in a child's response. */
    labelKey: string;
    /** Arabic heading for the README and the chat message. */
    labelAr: string;
    columns: ApiColumn[];
}

/** A collection name is a SQL identifier and a URL segment — both, or neither. */
const safeResource = (r: string) => String(r || '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 40);

export function apiRelationForRequest(probe: string): ApiRelation | null {
    try {
        const { detectAppKind, blueprintFor } = require('../../../core/design/app-blueprints');
        const kind = detectAppKind(String(probe || ''));
        if (!kind) return null;
        const bp = blueprintFor(kind, String(probe || ''), false);
        if (bp.engine !== 'records' && bp.engine !== 'shop') return null;
        if (!bp.relation) return null;
        const resource = safeResource(bp.relation.resource);
        const key = safeKey(bp.relation.key);
        const labelKey = safeKey(bp.relation.labelKey);
        const columns = columnsFromFields(bp.relation.fields);
        if (!resource || !key || !columns.length) return null;
        // The label must be a column that really exists, or a child would refer
        // to its parent by a field the parent has not got.
        if (!columns.some(c => c.key === labelKey)) return null;
        const ar = blueprintFor(kind, String(probe || ''), true);
        return { resource, key, labelKey, labelAr: String(ar?.relation?.many || resource), columns };
    } catch {
        return null;
    }
}

export function apiColumnsForRequest(probe: string): ApiColumn[] {
    try {
        const { detectAppKind, blueprintFor } = require('../../../core/design/app-blueprints');
        const kind = detectAppKind(String(probe || ''));
        if (!kind) return CATALOGUE_COLUMNS;
        const bp = blueprintFor(kind, String(probe || ''), false);
        // Only the engines that own ROWS have a table to shape. A map, a chat
        // and a feed have their own servers already.
        if (bp.engine !== 'records' && bp.engine !== 'shop') return CATALOGUE_COLUMNS;
        const cols = columnsFromFields(bp.fields);
        // A blueprint with no usable fields is not a schema; keep the catalogue.
        if (!cols.length) return CATALOGUE_COLUMNS;
        // The link itself is a column of the child, so validation, storage and
        // the SELECT all treat it exactly like any other field.
        const rel = apiRelationForRequest(probe);
        if (rel && !cols.some(c => c.key === rel.key)) {
            cols.push({ key: rel.key, type: 'INT', required: false });
        }
        return cols;
    } catch {
        return CATALOGUE_COLUMNS;
    }
}

function filePackageJson(name: string): string {
    return JSON.stringify({
        name: `api-${slug(name)}`, private: true, version: '0.1.0', type: 'module',
        scripts: { start: 'node server.js', dev: 'node --watch server.js' },
        dependencies: { express: '^4.21.2' },
    }, null, 2);
}

/**
 * db.js — the dual-backend heart. SQLite when the runtime carries it, a
 * JSON file with the identical interface otherwise. The column is `details`
 * (not `desc` — a reserved SQL word that would refuse the CREATE TABLE).
 */
/**
 * A SOCIAL TABLE IS NOT A CATALOGUE WITH A NEW NAME.
 *
 * Measured in the field: the social build produced `/api/posts` whose columns
 * were name/details/price and whose POST demanded an owner token. The feed
 * sent {author, handle, text, at} — so every write answered 400, every read
 * returned a shape the app could not parse, and the log still printed «full
 * stack link». The link was decorative. A post has an author, a handle, a
 * body and a picture, and in a social network the MEMBERS write it, so the
 * write is public exactly like a visitor's order.
 */
export function isFeedResource(resource: string): boolean { return resource === 'posts'; }

function filePostsDbJs(): string {
    return `// The feed's data layer: node:sqlite when this Node has it (>= 22.5), a JSON
// file with the SAME interface otherwise. Zero native dependencies either way.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
let db;

if (process.env.JOE_FORCE_JSON_DB !== '1') {
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const conn = new DatabaseSync(path.join(HERE, 'data.db'));
    conn.exec(\`CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      author TEXT NOT NULL,
      handle TEXT DEFAULT '',
      text TEXT DEFAULT '',
      image TEXT DEFAULT '',
      at TEXT DEFAULT (datetime('now'))
    )\`);
    // A like, a comment and a follow are SHARED FACTS. A feed where each
    // browser keeps its own hearts is not a network — two people looking at
    // the same post would see two different numbers. They live here instead.
    conn.exec(\`CREATE TABLE IF NOT EXISTS likes (
      post_id INTEGER NOT NULL, handle TEXT NOT NULL,
      PRIMARY KEY (post_id, handle)
    )\`);
    conn.exec(\`CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL, author TEXT NOT NULL, handle TEXT DEFAULT '',
      text TEXT NOT NULL, at TEXT DEFAULT (datetime('now'))
    )\`);
    conn.exec(\`CREATE TABLE IF NOT EXISTS follows (
      follower TEXT NOT NULL, target TEXT NOT NULL,
      PRIMARY KEY (follower, target)
    )\`);
    const rowOf = (r) => (r ? { id: r.id, author: r.author, handle: r.handle, text: r.text, image: r.image || null, at: r.at } : null);
    db = {
      backend: 'sqlite',
      list: () => conn.prepare('SELECT * FROM posts ORDER BY id DESC LIMIT 500').all().map(rowOf),
      get: (id) => rowOf(conn.prepare('SELECT * FROM posts WHERE id = ?').get(Number(id))),
      create: ({ author, handle = '', text = '', image = '', at }) => {
        const r = conn.prepare('INSERT INTO posts (author, handle, text, image, at) VALUES (?, ?, ?, ?, ?)')
          .run(String(author), String(handle), String(text), String(image || ''), String(at || new Date().toISOString()));
        return db.get(r.lastInsertRowid);
      },
      remove: (id) => {
        // A deleted post takes its hearts and its thread with it — no orphans.
        conn.prepare('DELETE FROM likes WHERE post_id = ?').run(Number(id));
        conn.prepare('DELETE FROM comments WHERE post_id = ?').run(Number(id));
        return conn.prepare('DELETE FROM posts WHERE id = ?').run(Number(id)).changes > 0;
      },
      count: () => Number(conn.prepare('SELECT COUNT(*) AS n FROM posts').get().n),

      likesFor: (id) => conn.prepare('SELECT handle FROM likes WHERE post_id = ?').all(Number(id)).map((r) => r.handle),
      toggleLike: (id, handle) => {
        const has = conn.prepare('SELECT 1 AS n FROM likes WHERE post_id = ? AND handle = ?').get(Number(id), String(handle));
        if (has) conn.prepare('DELETE FROM likes WHERE post_id = ? AND handle = ?').run(Number(id), String(handle));
        else conn.prepare('INSERT INTO likes (post_id, handle) VALUES (?, ?)').run(Number(id), String(handle));
        return { liked: !has, handles: db.likesFor(id) };
      },
      commentsFor: (id) => conn.prepare('SELECT * FROM comments WHERE post_id = ? ORDER BY id ASC').all(Number(id))
        .map((c) => ({ id: String(c.id), author: c.author, handle: c.handle, text: c.text, at: c.at })),
      addComment: (id, { author, handle = '', text, at }) => {
        const r = conn.prepare('INSERT INTO comments (post_id, author, handle, text, at) VALUES (?, ?, ?, ?, ?)')
          .run(Number(id), String(author), String(handle), String(text), String(at || new Date().toISOString()));
        return db.commentsFor(id).find((c) => c.id === String(r.lastInsertRowid)) || null;
      },
      following: (follower) => conn.prepare('SELECT target FROM follows WHERE follower = ?').all(String(follower)).map((r) => r.target),
      toggleFollow: (follower, target) => {
        const has = conn.prepare('SELECT 1 AS n FROM follows WHERE follower = ? AND target = ?').get(String(follower), String(target));
        if (has) conn.prepare('DELETE FROM follows WHERE follower = ? AND target = ?').run(String(follower), String(target));
        else conn.prepare('INSERT INTO follows (follower, target) VALUES (?, ?)').run(String(follower), String(target));
        return !has;
      },
    };
  } catch { /* an older Node — the JSON backend below serves instead */ }
}

if (!db) {
  const FILE = path.join(HERE, 'data.json');
  const blank = { seq: 0, rows: [], likes: [], comments: [], cseq: 0, follows: [] };
  const load = () => {
    try { return { ...blank, ...JSON.parse(fs.readFileSync(FILE, 'utf-8')) }; } catch { return { ...blank }; }
  };
  const save = (s) => fs.writeFileSync(FILE, JSON.stringify(s, null, 2));
  db = {
    backend: 'json',
    list: () => load().rows.slice().reverse().slice(0, 500),
    get: (id) => load().rows.find((r) => r.id === Number(id)) || null,
    create: ({ author, handle = '', text = '', image = '', at }) => {
      const s = load();
      const row = { id: ++s.seq, author: String(author), handle: String(handle), text: String(text), image: image || null, at: at || new Date().toISOString() };
      s.rows.push(row); save(s); return row;
    },
    remove: (id) => {
      const s = load(); const before = s.rows.length;
      s.rows = s.rows.filter((r) => r.id !== Number(id));
      s.likes = s.likes.filter((l) => l.post_id !== Number(id));
      s.comments = s.comments.filter((c) => c.post_id !== Number(id));
      save(s);
      return s.rows.length < before;
    },
    count: () => load().rows.length,

    likesFor: (id) => load().likes.filter((l) => l.post_id === Number(id)).map((l) => l.handle),
    toggleLike: (id, handle) => {
      const s = load();
      const at = s.likes.findIndex((l) => l.post_id === Number(id) && l.handle === String(handle));
      if (at >= 0) s.likes.splice(at, 1); else s.likes.push({ post_id: Number(id), handle: String(handle) });
      save(s);
      return { liked: at < 0, handles: s.likes.filter((l) => l.post_id === Number(id)).map((l) => l.handle) };
    },
    commentsFor: (id) => load().comments.filter((c) => c.post_id === Number(id))
      .map((c) => ({ id: String(c.id), author: c.author, handle: c.handle, text: c.text, at: c.at })),
    addComment: (id, { author, handle = '', text, at }) => {
      const s = load();
      const row = {
        id: ++s.cseq, post_id: Number(id), author: String(author), handle: String(handle),
        text: String(text), at: at || new Date().toISOString(),
      };
      s.comments.push(row); save(s);
      return { id: String(row.id), author: row.author, handle: row.handle, text: row.text, at: row.at };
    },
    following: (follower) => load().follows.filter((f) => f.follower === String(follower)).map((f) => f.target),
    toggleFollow: (follower, target) => {
      const s = load();
      const at = s.follows.findIndex((f) => f.follower === String(follower) && f.target === String(target));
      if (at >= 0) s.follows.splice(at, 1); else s.follows.push({ follower: String(follower), target: String(target) });
      save(s);
      return at < 0;
    },
  };
}

export { db };
`;
}

function filePostsServerJs(brand: string): string {
    return `// ${brand} — the feed's API. Members post; everyone reads.
//   npm start            (port 4100)
//   PORT=5050 npm start
import express from 'express';
import { db } from './db.js';

const app = express();
// A post can carry a downscaled photo as a data URL — the limit is generous
// on purpose, and still bounded so one request cannot exhaust memory.
app.use(express.json({ limit: '6mb' }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.end();
  next();
});

app.get('/api/health', (_req, res) => res.json({ ok: true, backend: db.backend, posts: db.count(), joe: 'api_project', resource: 'posts' }));

// The feed. The response carries BOTH shapes on purpose: \`posts\` reads well
// for a human with curl, and \`data\` is what the generated app parses.
//
// Every post arrives WITH its hearts and its thread, in one request. The app
// polls this endpoint anyway, so a second round trip per post would buy
// nothing but latency — and a feed that needed N+1 calls to show a like
// count would fall over on the first busy day.
app.get('/api/posts', (_req, res) => {
  const posts = db.list().map((p) => ({ ...p, likes: db.likesFor(p.id), comments: db.commentsFor(p.id) }));
  res.json({ ok: true, posts, data: posts });
});

app.post('/api/posts', (req, res) => {
  const { author, handle, text, image, at } = req.body || {};
  if (typeof author !== 'string' || !author.trim() || author.length > 60) {
    return res.status(400).json({ ok: false, error: 'author_required' });
  }
  const body = typeof text === 'string' ? text : '';
  if (!body.trim() && !image) return res.status(400).json({ ok: false, error: 'empty_post' });
  if (body.length > 5000) return res.status(400).json({ ok: false, error: 'text_too_long' });
  if (image !== undefined && image !== null && (typeof image !== 'string' || image.length > 4_000_000)) {
    return res.status(400).json({ ok: false, error: 'bad_image' });
  }
  const post = db.create({
    author: author.trim(),
    handle: typeof handle === 'string' ? handle.slice(0, 30) : '',
    text: body, image: image || '', at: typeof at === 'string' ? at : new Date().toISOString(),
  });
  res.status(201).json({ ok: true, post });
});

app.delete('/api/posts/:id', (req, res) => {
  if (!db.remove(req.params.id)) return res.status(404).json({ ok: false, error: 'not_found' });
  res.json({ ok: true });
});

// A heart is a fact about a post, not about one browser. Toggling returns the
// WHOLE list of handles so the caller never has to guess the new count.
app.post('/api/posts/:id/like', (req, res) => {
  const handle = String((req.body || {}).handle || '').trim();
  if (!handle) return res.status(400).json({ ok: false, error: 'handle_required' });
  if (!db.get(req.params.id)) return res.status(404).json({ ok: false, error: 'not_found' });
  const { liked, handles } = db.toggleLike(req.params.id, handle);
  res.json({ ok: true, liked, likes: handles, count: handles.length });
});

app.get('/api/posts/:id/comments', (req, res) => {
  if (!db.get(req.params.id)) return res.status(404).json({ ok: false, error: 'not_found' });
  res.json({ ok: true, comments: db.commentsFor(req.params.id) });
});

app.post('/api/posts/:id/comments', (req, res) => {
  const { author, handle, text, at } = req.body || {};
  if (typeof author !== 'string' || !author.trim()) return res.status(400).json({ ok: false, error: 'author_required' });
  const body = typeof text === 'string' ? text.trim() : '';
  if (!body) return res.status(400).json({ ok: false, error: 'empty_comment' });
  if (body.length > 2000) return res.status(400).json({ ok: false, error: 'text_too_long' });
  if (!db.get(req.params.id)) return res.status(404).json({ ok: false, error: 'not_found' });
  const comment = db.addComment(req.params.id, {
    author: author.trim(), handle: typeof handle === 'string' ? handle.slice(0, 30) : '',
    text: body, at: typeof at === 'string' ? at : new Date().toISOString(),
  });
  res.status(201).json({ ok: true, comment });
});

// Following is shared too: open the app on a second device and the people you
// follow are still the people you follow.
app.get('/api/follows', (req, res) => {
  const follower = String(req.query.follower || '').trim();
  if (!follower) return res.status(400).json({ ok: false, error: 'follower_required' });
  res.json({ ok: true, following: db.following(follower) });
});

app.post('/api/follows', (req, res) => {
  const follower = String((req.body || {}).follower || '').trim();
  const target = String((req.body || {}).target || '').trim();
  if (!follower || !target) return res.status(400).json({ ok: false, error: 'follower_and_target_required' });
  if (follower === target) return res.status(400).json({ ok: false, error: 'cannot_follow_self' });
  const now = db.toggleFollow(follower, target);
  res.json({ ok: true, following: now, list: db.following(follower) });
});

const port = Number(process.env.PORT || 4100);
app.listen(port, () => {
  console.log(\`[api] feed listening on http://localhost:\${port} — backend: \${db.backend}, \${db.count()} posts\`);
  console.log('[api] GET/POST /api/posts · DELETE /api/posts/:id · POST /api/posts/:id/like');
  console.log('[api] GET/POST /api/posts/:id/comments · GET/POST /api/follows · GET /api/health');
});
`;
}

function filePostsReadme(brand: string): string {
    return `# ${brand} — خادم الخيط

خادم Express حقيقي فوق قاعدة بيانات حقيقية، بلا أي اعتماديات أصلية.

\`\`\`bash
npm install
npm start          # المنفذ 4100
\`\`\`

| المسار | ماذا يفعل |
|---|---|
| \`GET /api/posts\` | كل المنشورات (الأحدث أولاً) ومعها إعجاباتها وتعليقاتها |
| \`POST /api/posts\` | نشر: \`{author, handle, text, image, at}\` |
| \`DELETE /api/posts/:id\` | حذف منشور — ومعه إعجاباته وتعليقاته |
| \`POST /api/posts/:id/like\` | إعجاب/إلغاء: \`{handle}\` → \`{liked, likes, count}\` |
| \`GET /api/posts/:id/comments\` | تعليقات منشور |
| \`POST /api/posts/:id/comments\` | تعليق: \`{author, handle, text}\` |
| \`GET /api/follows?follower=@me\` | من أتابع |
| \`POST /api/follows\` | متابعة/إلغاء: \`{follower, target}\` |
| \`GET /api/health\` | حالة الخادم وعدد المنشورات |

في شبكة اجتماعية **الأعضاء هم من ينشرون**، فالكتابة عامّة عن قصد — لا رمز
مالك. هذا خادم محلي لمشروعك؛ قبل نشره على الإنترنت أضِف حسابات وصلاحيات.

الإعجاب والتعليق والمتابعة **حقائق مشتركة** ومحفوظة هنا لا في المتصفح: من
يفتح التطبيق على جهاز آخر يرى العدد نفسه والخيط نفسه. الهوية ما تزال اسماً
يكتبه المستخدم بلا كلمة مرور — ومع الاسم وحده لا يمكن للخادم أن يمنع أحداً
من انتحال صفة غيره، فأضِف حسابات قبل النشر على الإنترنت.

البيانات على القرص (\`data.db\` أو \`data.json\`) وتنجو من إعادة التشغيل.
`;
}

function fileDbJs(resource: string, columns: ApiColumn[] = CATALOGUE_COLUMNS, relation: ApiRelation | null = null): string {
    const COLS = JSON.stringify(columns);
    const REL = relation ? JSON.stringify({
        resource: relation.resource, key: relation.key, labelKey: relation.labelKey, columns: relation.columns,
    }) : 'null';
    return `// The data layer: node:sqlite when this Node has it (>= 22.5), a JSON
// file with the SAME interface otherwise. Zero native dependencies either
// way — and /api/health reports which backend you actually got.
// Force the JSON path (tests, comparisons): JOE_FORCE_JSON_DB=1
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * The columns of this system, taken from the same blueprint the interface is
 * built from — so what the app sends is what the database keeps. A fixed
 * name/details/price table silently dropped every other field on every save.
 */
const COLS = ${COLS};
const KEYS = COLS.map((c) => c.key);
/**
 * INT is the link column: it holds the id of a row in the PARENT table, and an
 * empty one means «not linked yet» — which is null, never 0, because 0 would
 * be a claim to own a row that cannot exist.
 */
const cast = (c, v) => {
  if (c.type === 'REAL') return Number(v || 0);
  if (c.type === 'INT') return v === '' || v === null || v === undefined ? null : Number(v);
  return String(v ?? '');
};
const sqlType = (c) => (c.type === 'INT' ? 'INTEGER' : c.type);
const sqlDefault = (c) => (c.required ? 'NOT NULL' : c.type === 'INT' ? 'DEFAULT NULL' : "DEFAULT ''");

/**
 * THE PARENT TABLE — «طبيب ← مواعيده». Null for a one-table system, and then
 * every line below that mentions it simply never runs.
 */
const REL = ${REL};
const REL_COLS = REL ? REL.columns : [];
const REL_KEYS = REL_COLS.map((c) => c.key);

let db;

if (process.env.JOE_FORCE_JSON_DB !== '1') {
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const conn = new DatabaseSync(path.join(HERE, 'data.db'));
    conn.exec(\`CREATE TABLE IF NOT EXISTS ${resource} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      \${COLS.map((c) => \`\${c.key} \${sqlType(c)} \${sqlDefault(c)}\`).join(',\\n      ')},
      created_at TEXT DEFAULT (datetime('now'))
    )\`);
    // An existing database from an older build has no link column — add it
    // rather than refusing to start on data the owner already has.
    for (const c of COLS) {
      try { conn.exec(\`ALTER TABLE ${resource} ADD COLUMN \${c.key} \${sqlType(c)} \${sqlDefault(c)}\`); }
      catch { /* the column is already there — the normal case */ }
    }
    const rowOf = (r) => {
      if (!r) return null;
      const out = { id: r.id };
      for (const k of KEYS) out[k] = r[k];
      out.created_at = r.created_at;
      return out;
    };
    db = {
      backend: 'sqlite',
      columns: COLS,
      list: () => conn.prepare('SELECT * FROM ${resource} ORDER BY id DESC LIMIT 500').all().map(rowOf),
      get: (id) => rowOf(conn.prepare('SELECT * FROM ${resource} WHERE id = ?').get(Number(id))),
      create: (body) => {
        const r = conn.prepare(
          'INSERT INTO ${resource} (' + KEYS.join(', ') + ') VALUES (' + KEYS.map(() => '?').join(', ') + ')',
        ).run(...COLS.map((c) => cast(c, (body || {})[c.key])));
        return db.get(r.lastInsertRowid);
      },
      update: (id, patch) => {
        const cur = db.get(id);
        if (!cur) return null;
        conn.prepare('UPDATE ${resource} SET ' + KEYS.map((k) => k + ' = ?').join(', ') + ' WHERE id = ?')
          .run(...COLS.map((c) => cast(c, (patch || {})[c.key] !== undefined ? patch[c.key] : cur[c.key])), Number(id));
        return db.get(id);
      },
      remove: (id) => conn.prepare('DELETE FROM ${resource} WHERE id = ?').run(Number(id)).changes > 0,
      count: () => Number(conn.prepare('SELECT COUNT(*) AS n FROM ${resource}').get().n),
      listOrders: () => conn.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 500').all()
        .map((o) => ({ id: o.id, item: o.item, qty: o.qty, customer: o.customer, phone: o.phone, note: o.note, created_at: o.created_at })),
      createOrder: ({ item, qty = 1, customer, phone = '', note = '' }) => {
        const r = conn.prepare('INSERT INTO orders (item, qty, customer, phone, note) VALUES (?, ?, ?, ?, ?)')
          .run(String(item), Number(qty), String(customer), String(phone), String(note));
        const o = conn.prepare('SELECT * FROM orders WHERE id = ?').get(r.lastInsertRowid);
        return { id: o.id, item: o.item, qty: o.qty, customer: o.customer, phone: o.phone, note: o.note, created_at: o.created_at };
      },
      countOrders: () => Number(conn.prepare('SELECT COUNT(*) AS n FROM orders').get().n),
    };
    conn.exec(\`CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item TEXT NOT NULL,
      qty INTEGER DEFAULT 1,
      customer TEXT NOT NULL,
      phone TEXT DEFAULT '',
      note TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    )\`);
    // Accounts. The password NEVER lands here in the clear: only the scrypt
    // salt and hash, and they are never selected into any response body.
    conn.exec(\`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      salt TEXT NOT NULL,
      hash TEXT NOT NULL,
      role TEXT DEFAULT 'owner',
      created_at TEXT DEFAULT (datetime('now'))
    )\`);
    const userOf = (u) => (u ? { id: u.id, email: u.email, salt: u.salt, hash: u.hash, role: u.role, created_at: u.created_at } : null);
    db.countUsers = () => Number(conn.prepare('SELECT COUNT(*) AS n FROM users').get().n);
    db.userByEmail = (email) => userOf(conn.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase()));
    db.userById = (id) => userOf(conn.prepare('SELECT * FROM users WHERE id = ?').get(Number(id)));
    db.createUser = ({ email, salt, hash, role = 'owner' }) => {
      const r = conn.prepare('INSERT INTO users (email, salt, hash, role) VALUES (?, ?, ?, ?)')
        .run(String(email).toLowerCase(), String(salt), String(hash), String(role));
      return db.userById(r.lastInsertRowid);
    };
    db.setPassword = (id, salt, hash) =>
      conn.prepare('UPDATE users SET salt = ?, hash = ? WHERE id = ?').run(String(salt), String(hash), Number(id)).changes > 0;

    // ── the parent table, when this system has one ──────────────────────────
    if (REL) {
      conn.exec(\`CREATE TABLE IF NOT EXISTS \${REL.resource} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        \${REL_COLS.map((c) => \`\${c.key} \${sqlType(c)} \${sqlDefault(c)}\`).join(',\\n        ')},
        created_at TEXT DEFAULT (datetime('now'))
      )\`);
      const prowOf = (r) => {
        if (!r) return null;
        const out = { id: r.id };
        for (const k of REL_KEYS) out[k] = r[k];
        out.created_at = r.created_at;
        return out;
      };
      db.rel = {
        list: () => conn.prepare('SELECT * FROM ' + REL.resource + ' ORDER BY id DESC LIMIT 500').all().map(prowOf),
        get: (id) => prowOf(conn.prepare('SELECT * FROM ' + REL.resource + ' WHERE id = ?').get(Number(id))),
        create: (body) => {
          const r = conn.prepare(
            'INSERT INTO ' + REL.resource + ' (' + REL_KEYS.join(', ') + ') VALUES (' + REL_KEYS.map(() => '?').join(', ') + ')',
          ).run(...REL_COLS.map((c) => cast(c, (body || {})[c.key])));
          return db.rel.get(r.lastInsertRowid);
        },
        update: (id, patch) => {
          const cur = db.rel.get(id);
          if (!cur) return null;
          conn.prepare('UPDATE ' + REL.resource + ' SET ' + REL_KEYS.map((k) => k + ' = ?').join(', ') + ' WHERE id = ?')
            .run(...REL_COLS.map((c) => cast(c, (patch || {})[c.key] !== undefined ? patch[c.key] : cur[c.key])), Number(id));
          return db.rel.get(id);
        },
        remove: (id) => conn.prepare('DELETE FROM ' + REL.resource + ' WHERE id = ?').run(Number(id)).changes > 0,
        count: () => Number(conn.prepare('SELECT COUNT(*) AS n FROM ' + REL.resource).get().n),
      };
      db.childrenOf = (id) => conn.prepare('SELECT * FROM ${resource} WHERE ' + REL.key + ' = ? ORDER BY id DESC LIMIT 500')
        .all(Number(id)).map(rowOf);
    }
  } catch { /* an older Node — the JSON backend below serves instead */ }
}

if (!db) {
  const FILE = path.join(HERE, 'data.json');
  const load = () => {
    try {
      const s = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
      s.orders = s.orders || []; s.oseq = s.oseq || 0;
      s.users = s.users || []; s.useq = s.useq || 0;
      s.parents = s.parents || []; s.pseq = s.pseq || 0;
      return s;
    } catch { return { seq: 0, rows: [], oseq: 0, orders: [], useq: 0, users: [], pseq: 0, parents: [] }; }
  };
  const save = (s) => fs.writeFileSync(FILE, JSON.stringify(s, null, 2));
  db = {
    backend: 'json',
    columns: COLS,
    list: () => load().rows.slice().reverse().slice(0, 500),
    get: (id) => load().rows.find((r) => r.id === Number(id)) || null,
    create: (body) => {
      const s = load();
      const row = { id: ++s.seq };
      for (const c of COLS) row[c.key] = cast(c, (body || {})[c.key]);
      row.created_at = new Date().toISOString();
      s.rows.push(row);
      save(s);
      return row;
    },
    update: (id, patch) => {
      const s = load();
      const row = s.rows.find((r) => r.id === Number(id));
      if (!row) return null;
      for (const c of COLS) if ((patch || {})[c.key] !== undefined) row[c.key] = cast(c, patch[c.key]);
      save(s);
      return row;
    },
    remove: (id) => {
      const s = load();
      const before = s.rows.length;
      s.rows = s.rows.filter((r) => r.id !== Number(id));
      save(s);
      return s.rows.length < before;
    },
    count: () => load().rows.length,
    listOrders: () => load().orders.slice().reverse().slice(0, 500),
    createOrder: ({ item, qty = 1, customer, phone = '', note = '' }) => {
      const s = load();
      const order = { id: ++s.oseq, item: String(item), qty: Number(qty), customer: String(customer), phone: String(phone), note: String(note), created_at: new Date().toISOString() };
      s.orders.push(order);
      save(s);
      return order;
    },
    countOrders: () => load().orders.length,
    countUsers: () => (load().users || []).length,
    userByEmail: (email) => (load().users || []).find((u) => u.email === String(email).toLowerCase()) || null,
    userById: (id) => (load().users || []).find((u) => u.id === Number(id)) || null,
    createUser: ({ email, salt, hash, role = 'owner' }) => {
      const s = load();
      s.users = s.users || []; s.useq = s.useq || 0;
      const user = { id: ++s.useq, email: String(email).toLowerCase(), salt: String(salt), hash: String(hash), role: String(role), created_at: new Date().toISOString() };
      s.users.push(user);
      save(s);
      return user;
    },
    setPassword: (id, salt, hash) => {
      const s = load();
      const u = (s.users || []).find((x) => x.id === Number(id));
      if (!u) return false;
      u.salt = String(salt); u.hash = String(hash);
      save(s);
      return true;
    },
  };
  if (REL) {
    db.rel = {
      list: () => load().parents.slice().reverse().slice(0, 500),
      get: (id) => load().parents.find((p) => p.id === Number(id)) || null,
      create: (body) => {
        const s = load();
        const row = { id: ++s.pseq };
        for (const c of REL_COLS) row[c.key] = cast(c, (body || {})[c.key]);
        row.created_at = new Date().toISOString();
        s.parents.push(row);
        save(s);
        return row;
      },
      update: (id, patch) => {
        const s = load();
        const row = s.parents.find((p) => p.id === Number(id));
        if (!row) return null;
        for (const c of REL_COLS) if ((patch || {})[c.key] !== undefined) row[c.key] = cast(c, patch[c.key]);
        save(s);
        return row;
      },
      remove: (id) => {
        const s = load();
        const before = s.parents.length;
        s.parents = s.parents.filter((p) => p.id !== Number(id));
        save(s);
        return s.parents.length < before;
      },
      count: () => load().parents.length,
    };
    db.childrenOf = (id) => load().rows.filter((r) => Number(r[REL.key]) === Number(id)).reverse().slice(0, 500);
  }
}

/**
 * THE LINK, READ BACK.
 *
 * A child that answers only \`provider_id: 3\` makes every screen fetch the
 * parent table just to print a name. So every row that leaves this layer
 * carries \`parent_label\` — the parent's own label field, or an empty string
 * when the row is not linked yet. Written once here, so BOTH backends behave
 * identically and no route has to remember to join.
 */
if (REL && db.rel && db.childrenOf) {
  const rawList = db.list, rawGet = db.get, rawCreate = db.create, rawUpdate = db.update, rawKids = db.childrenOf;
  const attach = (row) => {
    if (!row) return row;
    const id = row[REL.key];
    const parent = id === null || id === undefined || id === '' ? null : db.rel.get(id);
    row.parent_label = parent ? String(parent[REL.labelKey] ?? '') : '';
    return row;
  };
  db.list = () => rawList().map(attach);
  db.get = (id) => attach(rawGet(id));
  db.create = (body) => attach(rawCreate(body));
  db.update = (id, patch) => attach(rawUpdate(id, patch));
  db.childrenOf = (id) => rawKids(id).map(attach);
  db.relation = { resource: REL.resource, key: REL.key, labelKey: REL.labelKey, columns: REL_COLS };
}

export { db };
`;
}

function fileAuthJs(): string {
    return `
/**
 * auth.js — real accounts, with nothing but Node's own crypto.
 *
 * Until now every generated API was WIDE OPEN: anyone who could reach the port
 * could rewrite the catalogue and read every visitor order — names and phone
 * numbers included. This closes it without adding a single dependency:
 *
 *   - passwords are stored as scrypt(salt, 64) — never in the clear, never
 *     reversible, and compared with timingSafeEqual so a wrong password takes
 *     the same time as a right one;
 *   - the session token is a real HS256 JWT, signed here and verified here;
 *   - the signing secret is generated on FIRST boot and kept in .auth-secret
 *     (mode 0600, gitignored), so tokens survive a restart and the secret
 *     never enters the repository. Set API_JWT_SECRET to override it.
 *   - failed logins are throttled per email+ip: five misses buy a lockout.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, domainToASCII } from 'node:url';
import { db } from './db.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SECRET_FILE = path.join(HERE, '.auth-secret');

function readSecret() {
  const fromEnv = String(process.env.API_JWT_SECRET || '').trim();
  if (fromEnv) return fromEnv;
  try { return fs.readFileSync(SECRET_FILE, 'utf-8').trim(); } catch { /* first boot */ }
  const made = crypto.randomBytes(48).toString('hex');
  try { fs.writeFileSync(SECRET_FILE, made, { mode: 0o600 }); } catch { /* read-only disk: memory-only secret */ }
  return made;
}
const SECRET = readSecret();
const TTL_SECONDS = Number(process.env.API_TOKEN_TTL || 60 * 60 * 12);

const b64 = (buf) => Buffer.from(buf).toString('base64url');

/**
 * One spelling for one address.
 *
 * A browser's <input type="email"> punycodes a unicode domain before your code
 * ever sees it: «owner@مشروعي.local» arrives as «owner@xn--wgbfq9brn.local».
 * Store and compare the ASCII form and the two spellings become one, so an
 * owner can sign in from a browser, from curl, or from anything else.
 */
export function normalizeEmail(raw) {
  const s = String(raw || '').trim().toLowerCase();
  const at = s.lastIndexOf('@');
  if (at < 1) return s;
  const domain = domainToASCII(s.slice(at + 1)) || s.slice(at + 1);
  return s.slice(0, at) + '@' + domain;
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(String(password), salt, 64).toString('hex') };
}

export function verifyPassword(password, salt, hash) {
  const want = Buffer.from(String(hash), 'hex');
  const got = crypto.scryptSync(String(password), String(salt), 64);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

export function signToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64(JSON.stringify({ sub: user.id, email: user.email, role: user.role, iat: now, exp: now + TTL_SECONDS }));
  const sig = b64(crypto.createHmac('sha256', SECRET).update(\`\${header}.\${payload}\`).digest());
  return \`\${header}.\${payload}.\${sig}\`;
}

export function verifyToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const expect = b64(crypto.createHmac('sha256', SECRET).update(\`\${header}.\${payload}\`).digest());
  // Length-checked before timingSafeEqual: it THROWS on a length mismatch,
  // which would turn a forged token into a 500 instead of a 401.
  if (sig.length !== expect.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    if (!claims?.exp || claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch { return null; }
}

/** Five wrong passwords per email+ip buy a fifteen-minute lockout. */
const misses = new Map();
const LOCK_AFTER = 5;
const LOCK_MS = 15 * 60 * 1000;
export function throttleKey(req, email) { return \`\${String(email || '').toLowerCase()}|\${req.ip || ''}\`; }
export function isLocked(key) {
  const m = misses.get(key);
  if (!m) return 0;
  if (Date.now() - m.at > LOCK_MS) { misses.delete(key); return 0; }
  return m.n >= LOCK_AFTER ? Math.ceil((LOCK_MS - (Date.now() - m.at)) / 1000) : 0;
}
export function noteMiss(key) {
  const m = misses.get(key);
  if (m && Date.now() - m.at <= LOCK_MS) { m.n += 1; } else { misses.set(key, { n: 1, at: Date.now() }); }
}
export function clearMisses(key) { misses.delete(key); }

/** Express guard: a valid Bearer token, or 401 with a reason. */
export function requireAuth(req, res, next) {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ ok: false, error: 'auth_required' });
  const claims = verifyToken(token);
  if (!claims) return res.status(401).json({ ok: false, error: 'bad_token' });
  const user = db.userById(claims.sub);
  if (!user) return res.status(401).json({ ok: false, error: 'unknown_user' });
  req.user = { id: user.id, email: user.email, role: user.role };
  next();
}
`;
}

function fileSeedJs(
    seeds: Array<{ name: string; details: string; price: string }>,
    owner: { email: string; salt: string; hash: string },
): string {
    return `// Idempotent seed: rows land ONCE, on the first boot of an empty database.
import { db } from './db.js';
import { normalizeEmail } from './auth.js';

export function seed() {
  if (db.count() > 0) return 0;
  const rows = [
${seeds.map(s => `    { name: '${js(s.name)}', details: '${js(s.details)}', price: '${js(s.price)}' },`).join('\n')}
  ];
  for (const r of rows) db.create(r);
  return rows.length;
}

/**
 * The owner account, seeded once. The password was generated when this project
 * was scaffolded and shown to you IN THE CHAT — it is not stored here and not
 * recoverable from these files: only its scrypt salt and hash are, and a hash
 * cannot be turned back into a password. Change it any time with
 * POST /api/auth/password.
 */
export function seedOwner() {
  if (db.countUsers() > 0) return null;
  // normalizeEmail so the stored spelling is the one a BROWSER will send.
  const u = db.createUser({ email: normalizeEmail('${js(owner.email)}'), salt: '${owner.salt}', hash: '${owner.hash}', role: 'owner' });
  return u.email;
}
`;
}

function fileServerJs(resource: string, brand: string, dirName: string, relation: ApiRelation | null = null): string {
    /**
     * THE PARENT'S OWN ROUTES.
     *
     * Reading is public — a visitor may see which doctors exist. Writing is the
     * owner's, like every other write. And a parent that still has children
     * cannot be deleted: answering 409 with the count is the difference between
     * a relation and a decoration, and it behaves the same on SQLite and on the
     * JSON store because the rule lives here, not in a database dialect.
     */
    const relRoutes = !relation ? '' : `
// ── ${relation.resource}: the parent table, and the link back to ${resource} ──
const validateRel = (body, partial) => {
  const out = {};
  for (const c of db.relation.columns) {
    const v = (body || {})[c.key];
    if (v === undefined || v === null || v === '') {
      if (c.required && !partial) return { error: c.key + '_required' };
      continue;
    }
    if (c.type === 'REAL') {
      const n = Number(v);
      if (!Number.isFinite(n)) return { error: 'bad_' + c.key };
      out[c.key] = n;
    } else {
      const str = String(v);
      if (str.length > 2000) return { error: 'bad_' + c.key };
      out[c.key] = str.trim();
    }
  }
  return { value: out };
};

app.get('/api/${relation.resource}', (_req, res) => res.json({ ok: true, ${relation.resource}: db.rel.list() }));

app.get('/api/${relation.resource}/:id', (req, res) => {
  const row = db.rel.get(req.params.id);
  if (!row) return res.status(404).json({ ok: false, error: 'not_found' });
  res.json({ ok: true, item: row });
});

// «مواعيد هذا الطبيب» — the whole reason the two tables are linked.
app.get('/api/${relation.resource}/:id/${resource}', (req, res) => {
  const parent = db.rel.get(req.params.id);
  if (!parent) return res.status(404).json({ ok: false, error: 'not_found' });
  res.json({ ok: true, parent, ${resource}: db.childrenOf(req.params.id) });
});

app.post('/api/${relation.resource}', requireAuth, (req, res) => {
  const { value, error } = validateRel(req.body, false);
  if (error) return res.status(400).json({ ok: false, error });
  res.status(201).json({ ok: true, item: db.rel.create(value) });
});

app.put('/api/${relation.resource}/:id', requireAuth, (req, res) => {
  const { value, error } = validateRel(req.body, true);
  if (error) return res.status(400).json({ ok: false, error });
  const row = db.rel.update(req.params.id, value);
  if (!row) return res.status(404).json({ ok: false, error: 'not_found' });
  res.json({ ok: true, item: row });
});

app.delete('/api/${relation.resource}/:id', requireAuth, (req, res) => {
  const kids = db.childrenOf(req.params.id).length;
  // Deleting the parent would leave every child pointing at nothing. The
  // owner is told exactly how many rows stand in the way.
  if (kids) return res.status(409).json({ ok: false, error: 'has_children', count: kids });
  if (!db.rel.remove(req.params.id)) return res.status(404).json({ ok: false, error: 'not_found' });
  res.json({ ok: true });
});
`;
    return fileServerJsBody(resource, brand, dirName, relation, relRoutes);
}

function fileServerJsBody(resource: string, brand: string, dirName: string, relation: ApiRelation | null, relRoutes: string): string {
    return `// ${brand} — a real Express API over a real database. Runs with:
//   npm start            (port 4100)
//   PORT=5050 npm start  (any port)
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { seed, seedOwner } from './seed.js';
import { hashPassword, verifyPassword, signToken, requireAuth, throttleKey, isLocked, noteMiss, clearMisses, normalizeEmail } from './auth.js';

// THE LIVE BRIDGE to Joe: every new order is announced into the owner's
// chat through Joe's existing public inbox — fire-and-forget, so the
// visitor's response NEVER waits on it and a stopped Joe changes nothing.
const JOE_INBOX = process.env.JOE_INBOX_URL || 'http://localhost:5002/api/public/forms/${dirName}';
function notifyJoe(order) {
  const fields = { 'طلب جديد': \`\${order.item} ×\${order.qty}\`, 'العميل': order.customer };
  if (order.phone) fields['الجوال'] = order.phone;
  fetch(JOE_INBOX, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields, page: 'orders-api' }),
  }).catch(() => { /* Joe offline — the order is safe in OUR database */ });
}

const HERE_DIR = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json({ limit: '100kb' }));

// The local previews live on other ports — they must be able to reach us.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.end();
  next();
});

/**
 * HEALTH SAYS WHOSE HEALTH IT IS.
 *
 * The built interface asks one question to find its API: «does THIS origin
 * answer /api/health?». Measured in the field, that question was too generous
 * — Joe's own preview route serves the app from Joe's server, Joe answers
 * /api/health too, and the store cheerfully rewired itself to Joe's API and
 * got «GET /api/products 404» twice on every load. The catalogue was empty and
 * the self-QA scored it 62/100 for failed requests.
 *
 * So the answer carries a name now: this server's own resource. An origin that
 * does not claim THIS resource is not this system's server.
 */
app.get('/api/health', (_req, res) => res.json({
  ok: true, backend: db.backend, count: db.count(), orders: db.countOrders(),
  joe: 'api_project', resource: '${resource}',
  ${relation ? `${relation.resource}: db.rel.count(), relation: db.relation,` : ''}
}));

// ── ACCOUNTS ───────────────────────────────────────────────────────────────
// Public: reading the catalogue and placing an order (that is what visitors
// do). Protected: everything that CHANGES the catalogue, and reading the
// orders — those carry customers' names and phone numbers.

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    return res.status(400).json({ ok: false, error: 'email_and_password_required' });
  }
  const key = throttleKey(req, normalizeEmail(email));
  const wait = isLocked(key);
  if (wait) return res.status(429).json({ ok: false, error: 'too_many_attempts', retry_after_seconds: wait });

  const user = db.userByEmail(normalizeEmail(email));
  // The same answer either way: a different message for an unknown email tells
  // an attacker which addresses are real.
  if (!user || !verifyPassword(password, user.salt, user.hash)) {
    noteMiss(key);
    return res.status(401).json({ ok: false, error: 'bad_credentials' });
  }
  clearMisses(key);
  res.json({ ok: true, token: signToken(user), user: { id: user.id, email: user.email, role: user.role } });
});

app.get('/api/auth/me', requireAuth, (req, res) => res.json({ ok: true, user: req.user }));

app.post('/api/auth/password', requireAuth, (req, res) => {
  const { current, next } = req.body || {};
  if (typeof next !== 'string' || next.length < 8 || next.length > 200) {
    return res.status(400).json({ ok: false, error: 'weak_password', message: 'at least 8 characters' });
  }
  const user = db.userById(req.user.id);
  if (!user || typeof current !== 'string' || !verifyPassword(current, user.salt, user.hash)) {
    return res.status(401).json({ ok: false, error: 'bad_credentials' });
  }
  const { salt, hash } = hashPassword(next);
  db.setPassword(user.id, salt, hash);
  res.json({ ok: true });
});

// Visitor ORDERS — the frontend's «اطلب الآن» writes real rows here.
// Reading them is the OWNER's business: names and phone numbers live here.
app.get('/api/orders', requireAuth, (_req, res) => res.json({ ok: true, orders: db.listOrders() }));

app.post('/api/orders', (req, res) => {
  const { item, qty, customer, phone, note } = req.body || {};
  if (typeof item !== 'string' || !item.trim() || item.length > 200) {
    return res.status(400).json({ ok: false, error: 'item_required' });
  }
  if (typeof customer !== 'string' || !customer.trim() || customer.length > 100) {
    return res.status(400).json({ ok: false, error: 'customer_required' });
  }
  const q = qty === undefined ? 1 : Number(qty);
  if (!Number.isInteger(q) || q < 1 || q > 99) {
    return res.status(400).json({ ok: false, error: 'bad_qty' });
  }
  if ((phone !== undefined && (typeof phone !== 'string' || phone.length > 30))
    || (note !== undefined && (typeof note !== 'string' || note.length > 500))) {
    return res.status(400).json({ ok: false, error: 'bad_fields' });
  }
  const order = db.createOrder({ item: item.trim(), qty: q, customer: customer.trim(), phone, note });
  notifyJoe(order);
  res.status(201).json({ ok: true, order });
});

${relRoutes}
app.get('/api/${resource}', (_req, res) => res.json({ ok: true, ${resource}: db.list() }));

app.get('/api/${resource}/:id', (req, res) => {
  const row = db.get(req.params.id);
  if (!row) return res.status(404).json({ ok: false, error: 'not_found' });
  res.json({ ok: true, item: row });
});

/**
 * Honest validation, bounded fields, and the SAME fields the interface sends.
 * The route used to name name/details/price by hand, so a system whose app
 * posts {date, time, status} had them rejected or dropped. It now validates
 * the schema this server was actually built with.
 */
const validate = (body, partial) => {
  const out = {};
  for (const c of db.columns) {
    const v = (body || {})[c.key];
    if (v === undefined || v === null || v === '') {
      if (c.required && !partial) return { error: c.key + '_required' };
      continue;
    }
    if (c.type === 'REAL') {
      const n = Number(v);
      if (!Number.isFinite(n)) return { error: 'bad_' + c.key };
      out[c.key] = n;
    } else if (c.type === 'INT') {
      /**
       * THE LINK IS CHECKED, NOT TRUSTED.
       *
       * A foreign key that may point at a row which does not exist is not a
       * relation — it is a number. An appointment for doctor #99 in a clinic
       * with three doctors is refused here, with the name of the field that
       * was wrong.
       */
      const n = Number(v);
      if (!Number.isInteger(n) || n <= 0) return { error: 'bad_' + c.key };
      if (db.relation && c.key === db.relation.key && !db.rel.get(n)) return { error: 'unknown_' + c.key };
      out[c.key] = n;
    } else {
      const str = String(v);
      if (str.length > 2000) return { error: 'bad_' + c.key };
      out[c.key] = str.trim();
    }
  }
  return { value: out };
};

app.post('/api/${resource}', requireAuth, (req, res) => {
  const { value, error } = validate(req.body, false);
  if (error) return res.status(400).json({ ok: false, error });
  res.status(201).json({ ok: true, item: db.create(value) });
});

app.put('/api/${resource}/:id', requireAuth, (req, res) => {
  const { value, error } = validate(req.body, true);   // a patch may be partial
  if (error) return res.status(400).json({ ok: false, error });
  const row = db.update(req.params.id, value);
  if (!row) return res.status(404).json({ ok: false, error: 'not_found' });
  res.json({ ok: true, item: row });
});

app.delete('/api/${resource}/:id', requireAuth, (req, res) => {
  if (!db.remove(req.params.id)) return res.status(404).json({ ok: false, error: 'not_found' });
  res.json({ ok: true });
});

const seeded = seed();
const owner = seedOwner();
const port = Number(process.env.PORT || 4100);
/**
 * THE WHOLE SYSTEM ON ONE ORIGIN — «حتى يتم نقله الى دومين والعمل مباشره».
 *
 * A built interface in public/ is served by THIS server, so the site and its
 * API share one origin, one port and one process. That is what makes the
 * system deployable: upload the folder, run npm start behind your domain,
 * and it works — no CORS, no second port, no address baked into the bundle.
 * Without public/ the server is exactly what it was: an API on its own.
 */
{
  const PUBLIC = path.join(HERE_DIR, 'public');
  if (fs.existsSync(path.join(PUBLIC, 'index.html'))) {
    app.use(express.static(PUBLIC, { index: false, maxAge: '1h' }));
    // Anything that is not an API route is the single-page app. Assets are
    // handled above, so a miss here means a route inside the interface.
    // (A plain middleware rather than a path regex: an escaped pattern inside
    // a generated file is one backslash away from an unparseable server, and
    // the syntax gate caught exactly that.)
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(PUBLIC, 'index.html'));
    });
    console.log('[api] serving the built interface from public/ — one origin, ready for a domain');
  }
}

app.listen(port, () => {
  console.log(\`[api] listening on http://localhost:\${port} — backend: \${db.backend}\${seeded ? \`, seeded \${seeded} rows\` : ''}\`);
  if (owner) console.log(\`[api] owner account created: \${owner} — the password was shown once in Joe's chat.\`);
  console.log('[api] public: GET catalogue, POST /api/orders · protected: catalogue writes + GET /api/orders');
  ${relation
            ? `console.log('[api] two linked tables: /api/${relation.resource} · /api/${relation.resource}/:id/${resource} — every ${resource} row carries parent_label');`
            : ''}
});
`;
}

function fileReadme(brand: string, resource: string, labelAr: string, ownerEmail: string, relation: ApiRelation | null = null): string {
    const relDoc = !relation ? '' : `
## جدولان مرتبطان — ${relation.labelAr} ← ${labelAr}

لكل صفٍّ في \`${resource}\` حقل \`${relation.key}\` يشير إلى صفٍّ حقيقي في
\`${relation.resource}\`. الربط **مُتحقَّق منه**: لو أشرت إلى صفٍّ غير موجود يردّ
الخادم \`400 unknown_${relation.key}\`، ولو حاولت حذف أصلٍ له أبناء يردّ
\`409 has_children\` مع عددهم — فلا يبقى صفٌّ معلّقاً بلا أصل.

وكل صفٍّ يعود من الخادم يحمل \`parent_label\`: اسم أصله جاهزاً، بلا استعلام ثانٍ.

\`\`\`bash
# 1) أنشئ الأصل (يتطلّب رمزك)
curl -X POST http://localhost:4100/api/${relation.resource} -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" -d '{"${relation.labelKey}":"…"}'

# 2) اربط به صفّاً
curl -X POST http://localhost:4100/api/${resource} -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" -d '{"${relation.key}":1, …}'

# 3) اقرأ أبناء أصلٍ بعينه
curl http://localhost:4100/api/${relation.resource}/1/${resource}
\`\`\`
`;
    return `# ${brand} — API

خادم Express حقيقي فوق قاعدة بيانات حقيقية، **بلا أي اعتماديات أصلية**:
يستخدم \`node:sqlite\` المدمجة (Node ‏22.5 فأحدث)، وعلى Node أقدم يعمل تلقائياً
بمخزن JSON بنفس الواجهة — و\`/api/health\` يخبرك بصدق أي قاعدة تعمل.

## التشغيل

\`\`\`bash
npm install
npm start          # المنفذ 4100
PORT=5050 npm start
\`\`\`

## الحماية — ما هو عامّ وما هو لك وحدك

| عامّ للزوار | محميّ بحسابك |
|---|---|
| \`GET /api/${resource}\` و \`/:id\` — تصفّح ${labelAr} | \`POST/PUT/DELETE /api/${resource}\` — أي تغيير |
| \`POST /api/orders\` — إرسال طلب | \`GET /api/orders\` — قراءة الطلبات (فيها أسماء وأرقام) |
| \`GET /api/health\` | \`GET /api/auth/me\` · \`POST /api/auth/password\` |

حسابك: **${ownerEmail}** — وكلمة المرور ظهرت مرة واحدة في محادثة جو حين بُني
المشروع. ليست مخزّنة في أي ملف هنا: الملفات تحمل بصمة scrypt فقط، ولا تُستَرجع
منها كلمة المرور. لو ضاعت: احذف \`data.db\` (أو \`data.json\`) وأعد التشغيل
ليُنشَأ الحساب من جديد… وستفقد البيانات معه، أو غيّرها قبل ذلك من
\`POST /api/auth/password\`.

مفتاح توقيع الرموز يُولَّد ذاتياً في \`.auth-secret\` (خارج git) عند أول تشغيل،
فتبقى جلستك صالحة بعد إعادة التشغيل. لتثبيته بنفسك: \`API_JWT_SECRET=…\`.

## المسارات — ${labelAr}

\`\`\`bash
curl http://localhost:4100/api/health
curl http://localhost:4100/api/${resource}

# 1) سجّل الدخول واحصل على رمز
TOKEN=$(curl -s -X POST http://localhost:4100/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"email":"${ownerEmail}","password":"كلمة-مرورك"}' | sed -n 's/.*"token":"\\([^"]*\\)".*/\\1/p')

# 2) استعمله في كل ما يغيّر البيانات
curl -X POST http://localhost:4100/api/${resource} -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" -d '{"name":"جديد","details":"وصف","price":"50"}'
curl -X PUT  http://localhost:4100/api/${resource}/1 -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" -d '{"price":"75"}'
curl -X DELETE http://localhost:4100/api/${resource}/1 -H "Authorization: Bearer $TOKEN"
\`\`\`

## الطلبات — تكتبها واجهة المتجر/المطعم المربوطة تلقائياً

\`\`\`bash
# الزائر يرسل طلبه بلا حساب — هذا هو المقصود
curl -X POST http://localhost:4100/api/orders -H "Content-Type: application/json" \\
  -d '{"item":"طقم الهدية","qty":2,"customer":"خالد","phone":"05xxxxxxxx"}'

# وأنت وحدك تقرؤها
curl http://localhost:4100/api/orders -H "Authorization: Bearer $TOKEN"
\`\`\`

ويمكنك دائماً قراءتها داخل محادثة جو بجملة «اعرض الطلبات» — يقرؤها من القاعدة
مباشرة، فتعمل حتى والخادم متوقّف.
${relDoc}
البيانات محفوظة على القرص (\`data.db\` أو \`data.json\`) — تنجو من إعادة التشغيل.
`;
}

export class ApiProjectTool extends BaseTool {
    name = 'api_project';
    description = 'Scaffold a complete runnable Express API with a real zero-dependency database (node:sqlite or JSON fallback), then boot it and prove a real HTTP write/read round-trip.';
    version = '1.0.0';
    tags = ['build', 'api', 'backend', 'database'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            request: { type: 'string', description: 'What the API is for, in the user\'s words' },
            skipInstall: { type: 'boolean', description: 'Scaffold only — no npm install, no live boot proof' },
        },
        required: ['request'],
    };
    permissions: ToolPermission[] = ['execute', 'write'];
    sideEffects: ToolPermission[] = ['execute', 'write'];
    rateLimitPerMinute = 6;
    auditFields = ['request'];

    async execute(input: any, context?: any): Promise<ToolExecutionResult> {
        const logs: string[] = [];
        const request = String(input?.request || '').trim()
            .replace(/\n+\[(STANDING USER INSTRUCTIONS|ENGINEERING DISCIPLINE|ATTACHED FILES|RESPONSE LANGUAGE)[\s\S]*$/i, '').trim();
        if (!request) return { ok: false, error: 'no_request', logs };
        const sessionId = context?.sessionId;
        const uiLang = String(context?.language || '').toLowerCase();
        // Same rule as the React builder: the user's language, not the prompt's script.
        const isAr = uiLang ? uiLang.startsWith('ar') : /[؀-ۿ]/.test(request);
        try { broadcast({ type: 'build_started', sessionId, data: { tool: 'api_project', sessionId } } as any); } catch { /* UI optional */ }

        const term = (line: string) => {
            logs.push(line);
            try {
                broadcastTerminalLine(sessionId, line + '\r\n');
            } catch { /* UI optional */ }
        };

        const kind = detectPageKind(request);
        const brand = brandFrom(request, isAr) || (isAr ? 'مشروعي' : 'MyApp');
        const { resource, labelAr, seeds: catalogueSeeds } = apiResourceForKind(kind, isAr, request);
        // The schema follows the app's own blueprint. Seeds only make sense for
        // the catalogue shape — a booking table seeded with «Dish of the day»
        // would be noise pretending to be data.
        const columns = apiColumnsForRequest(request);
        // The parent table, when this system has one — «طبيب ← مواعيده».
        const relation = apiRelationForRequest(request);
        const isCatalogue = columns === CATALOGUE_COLUMNS;
        const seeds = isCatalogue ? catalogueSeeds : [];
        const dirName = `api-${slug(brand)}`;
        const { workspaceService } = require('../../services/WorkspaceService');
        const root = String(input?.root || workspaceService.getExplorerRoot());
        const sessionKey = String(sessionId || 'default').replace(/[^a-zA-Z0-9._-]/g, '_');
        let proj = path.join(root, dirName);
        // Same cross-session collision guard as the react scaffolder.
        if (fs.existsSync(proj) && ((global as any).joeProjects || {})[sessionKey]?.dir !== proj) {
            const suffix = sessionKey.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toLowerCase() || Date.now().toString(36).slice(-4);
            proj = path.join(root, `${dirName}-${suffix}`);
        }
        fs.mkdirSync(proj, { recursive: true });

        if (sessionId) broadcastThinkingDetail(sessionId, isAr
            ? `🗄️ أبني واجهة خلفية حقيقية بقاعدة بيانات: ${brand}`
            : `🗄️ Building a real backend with a database: ${brand}`);

        // The owner account. The password is generated HERE, hashed HERE with the
        // same scrypt the server uses, and only the hash reaches the disk — the
        // plaintext exists in one place: the message Joe writes in the chat.
        // The address must survive a BROWSER. `slug()` keeps Arabic letters, so a
        // brand like «مشروعي» produced owner@مشروعي.local — and an
        // <input type="email"> silently punycodes the domain, sending
        // owner@xn--wgbfq9brn.local instead. The owner could never sign in to
        // their own dashboard, and the login screen could only say «wrong
        // password». Caught by driving the real form in a real browser.
        const asciiSlug = String(brand || '').toLowerCase()
            .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
        const ownerEmail = `owner@${asciiSlug || 'joe'}.local`;
        const ownerPassword = crypto.randomBytes(9).toString('base64url');
        const ownerSalt = crypto.randomBytes(16).toString('hex');
        const ownerHash = crypto.scryptSync(ownerPassword, ownerSalt, 64).toString('hex');

        // A FEED IS ITS OWN SHAPE. The catalogue server (items + orders + an
        // owner account) is right for a shop and wrong for a social network:
        // it demanded an owner token for every post and stored name/details/
        // price. A feed build gets a server whose columns and routes are the
        // ones the app actually speaks.
        const feed = isFeedResource(resource);
        const files: Record<string, string> = feed ? {
            'package.json': filePackageJson(brand),
            'server.js': filePostsServerJs(brand),
            'db.js': filePostsDbJs(),
            'README.md': filePostsReadme(brand),
            '.gitignore': 'node_modules\ndata.db\ndata.json\n',
        } : {
            'package.json': filePackageJson(brand),
            'server.js': fileServerJs(resource, brand, path.basename(proj), relation),
            'db.js': fileDbJs(resource, columns, relation),
            'auth.js': fileAuthJs(),
            'seed.js': fileSeedJs(seeds, { email: ownerEmail, salt: ownerSalt, hash: ownerHash }),
            'README.md': fileReadme(brand, resource, labelAr, ownerEmail, relation),
            // .auth-secret holds the token-signing key: it must never be committed.
            '.gitignore': 'node_modules\ndata.db\ndata.json\n.auth-secret\n',
        };
        // Streamed to the Logs panel as each file lands — a backend build is
        // watched the same way a frontend build is.
        for (const [rel, body] of Object.entries(files)) {
            fs.writeFileSync(path.join(proj, rel), body, 'utf-8');
            try {
                broadcast({
                    type: 'file_stream', sessionId,
                    data: { file: rel, chunk: body, done: true, bytes: Buffer.byteLength(body), at: Date.now(), label: 'مكتوب' },
                } as any);
            } catch { /* UI optional — the file is already on disk */ }
        }
        term(`api_project: scaffolded ${Object.keys(files).length} files in ${proj}`);

        // ── the live proof: install, boot the REAL server, write and read a
        //    REAL row over REAL HTTP. Reported only as measured.
        let installed = false, proven = false, backend = '', createdId = 0, npmMissing = false;
        let authProven = false, lockedOut = false, ordersLocked = false, relationProven = false;
        /** Did THIS boot create the owner, or was one already in the database? */
        let ownerCreated = false;
        /** Did the server actually come up? «Booted but the proof failed» and
         *  «never started» are different facts and used to print the same line. */
        let booted = false;
        if (!input?.skipInstall) {
            // Through the Single Execution Authority — a direct spawn here
            // BLOCKED STARTUP on the user's machine (ExecutionEnforcer).
            const { executionEngine } = require('../../../kernel/ExecutionEngine');
            const inst = await (async () => {
                const h = executionEngine.runArgvStreaming('npm', ['install', '--no-audit', '--no-fund'], {
                    cwd: proj, timeout: 240_000, env: { NO_COLOR: '1' },
                    onLine: (l: string) => term(`  ${l.slice(0, 200)}`),
                });
                const r = await h.done;
                if (r.exitCode === null) return -1;
                if (r.exitCode === 124 && r.error === 'timeout') return -2;
                return r.exitCode;
            })();
            npmMissing = inst === -1;
            installed = inst === 0;
            term(`npm install → ${installed ? 'OK' : `exit ${inst}`}`);

            if (installed) {
                if (sessionId) broadcastThinkingDetail(sessionId, isAr ? '🚀 أشغّل الخادم وأثبت كتابة/قراءة حقيقية…' : '🚀 Booting the server for a real write/read proof…');
                const port = 4100 + Math.floor(Math.random() * 400);
                let child: { done: Promise<any>; kill: () => void } | null = null;
                try {
                    let upResolve: (v: boolean) => void = () => { /* set below */ };
                    const upPromise = new Promise<boolean>((resolve) => { upResolve = resolve; });
                    const upTimer = setTimeout(() => upResolve(false), 15_000);
                    child = executionEngine.runArgvStreaming(process.execPath, ['server.js'], {
                        cwd: proj, env: { PORT: String(port), NODE_NO_WARNINGS: '1' },
                        onLine: (l: string) => {
                            term(`  ${l.slice(0, 200)}`);
                            /**
                             * THE ACCOUNT MAY ALREADY EXIST — AND THEN THE NEW
                             * PASSWORD IS FICTION.
                             *
                             * seedOwner() creates the owner ONCE, on an empty
                             * database. Rebuild the same project over the same
                             * data.db and it correctly does nothing — while
                             * this tool has already minted a fresh password and
                             * is about to print it. That is exactly what his log
                             * showed: «owner login FAILED», and the message
                             * handed him the credential anyway.
                             *
                             * The server says which of the two happened. Listen.
                             */
                            if (/owner account created/.test(l)) ownerCreated = true;
                            if (/listening on/.test(l)) upResolve(true);
                        },
                    });
                    child!.done.then(() => upResolve(false));
                    const up = await upPromise;
                    booted = up;
                    clearTimeout(upTimer);
                    if (up) {
                        const base = `http://127.0.0.1:${port}`;
                        const health = await fetch(`${base}/api/health`).then(r => r.json()).catch(() => null);
                        backend = String(health?.backend || '');

                        // The LOCK is proved before the write is: an anonymous
                        // POST must be refused, and the owner's login must be
                        // what unlocks it. A guard nobody tested is a guard
                        // nobody has.
                        /**
                         * A FEED IS PROVED AS A FEED.
                         *
                         * This whole block interrogates a CATALOGUE: an owner
                         * login, a locked write, an orders table. The feed
                         * server has none of them by design — members post —
                         * so a perfectly working feed answered «auth proof →
                         * … owner login FAILED» and «live proof → FAILED», and
                         * the message then handed the user an owner password
                         * and endpoints that do not exist. A proof that asks
                         * the wrong questions is worse than none: it lies in
                         * both directions.
                         */
                        if (feed) {
                            const wrote = await fetch(`${base}/api/posts`, {
                                method: 'POST', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    author: isAr ? 'إثبات حيّ' : 'Live proof', handle: '@joe',
                                    text: isAr ? 'أول منشور — كُتب عبر HTTP حقيقي' : 'First post — written over real HTTP',
                                }),
                            }).then(r => r.json()).catch(() => null);
                            createdId = Number(wrote?.post?.id || 0);
                            const back: any = await fetch(`${base}/api/posts`).then(r => r.json()).catch(() => null);
                            const row = Array.isArray(back?.posts) ? back.posts.find((p: any) => Number(p.id) === createdId) : null;
                            // …and the social graph, which is what makes it a network.
                            const liked: any = await fetch(`${base}/api/posts/${createdId}/like`, {
                                method: 'POST', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ handle: '@joe' }),
                            }).then(r => r.json()).catch(() => null);
                            const empty = await fetch(`${base}/api/posts`, {
                                method: 'POST', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ author: 'x', text: '   ' }),
                            }).then(r => r.status).catch(() => 0);
                            proven = createdId > 0 && !!row && liked?.count === 1 && empty === 400;
                            term(`feed proof → post #${createdId} ${row ? 'written and read back' : 'NOT read back'}, like count ${liked?.count ?? '—'}, empty post → ${empty}`);
                            term(`live proof → ${proven ? `OK (backend ${backend})` : 'FAILED'}`);
                        } else {
                        const anon = await fetch(`${base}/api/${resource}`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: 'anonymous-must-be-refused' }),
                        }).then(r => r.status).catch(() => 0);
                        lockedOut = anon === 401;
                        const ordersAnon = await fetch(`${base}/api/orders`).then(r => r.status).catch(() => 0);
                        ordersLocked = ordersAnon === 401;
                        const wrongPass = await fetch(`${base}/api/auth/login`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email: ownerEmail, password: 'definitely-not-the-password' }),
                        }).then(r => r.status).catch(() => 0);
                        const login = await fetch(`${base}/api/auth/login`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email: ownerEmail, password: ownerPassword }),
                        }).then(r => r.json()).catch(() => null);
                        const token = String(login?.token || '');
                        authProven = lockedOut && ordersLocked && wrongPass === 401 && token.split('.').length === 3;
                        term(`auth proof → anonymous write ${anon}, orders ${ordersAnon}, wrong password ${wrongPass}, owner login ${token ? 'OK' : 'FAILED'}`);

                        /**
                         * THE PROOF MUST SPEAK THE SCHEMA IT JUST GENERATED.
                         *
                         * This posted {name, details, price} whatever the system
                         * was — so a clinic, whose table requires a date, refused
                         * it with 400 and the build reported «live proof →
                         * FAILED» on a server that was working perfectly. A proof
                         * that asks the wrong question lies in both directions.
                         */
                        const proofBody: Record<string, any> = isCatalogue
                            ? { name: isAr ? 'صف الإثبات الحي' : 'Live-proof row', details: 'written over real HTTP by Joe', price: '1' }
                            : (() => {
                                const b: Record<string, any> = {};
                                for (const c of columns) {
                                    if (!c.required) continue;
                                    b[c.key] = c.type === 'REAL' ? 1 : c.type === 'INT' ? undefined : (isAr ? 'صف الإثبات الحي' : 'Live-proof row');
                                }
                                return b;
                            })();
                        const made = await fetch(`${base}/api/${resource}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                            body: JSON.stringify(proofBody),
                        }).then(r => r.json()).catch(() => null);
                        createdId = Number(made?.item?.id || 0);
                        const listed = await fetch(`${base}/api/${resource}`).then(r => r.json()).catch(() => null);
                        proven = createdId > 0 && Array.isArray(listed?.[resource])
                            && listed[resource].some((r: any) => r.id === createdId);
                        term(`live proof → ${proven ? `OK (backend ${backend}, row #${createdId} written and read back)` : 'FAILED'}`);
                        // A REAL APP STARTS EMPTY. The catalogue keeps its proof
                        // row (its seeds are the design, and the durability check
                        // rides on it); a booking system does not open with a
                        // fabricated appointment in it.
                        if (!isCatalogue && createdId > 0) {
                            await fetch(`${base}/api/${resource}/${createdId}`, {
                                method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
                            }).catch(() => null);
                        }

                        /**
                         * THE LINK IS PROVED LIKE EVERYTHING ELSE: BY USING IT.
                         *
                         * A parent is created, a child is bound to it, the child
                         * is read back carrying the parent's name, the parent's
                         * own children are listed, a dangling link is refused,
                         * and deleting a parent that still has children is
                         * refused. Six answers, all measured over real HTTP.
                         */
                        if (relation) {
                            const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
                            const parentBody: Record<string, any> = {};
                            parentBody[relation.labelKey] = isAr ? 'أصل الإثبات الحي' : 'Live-proof parent';
                            const parent = await fetch(`${base}/api/${relation.resource}`, {
                                method: 'POST', headers: auth, body: JSON.stringify(parentBody),
                            }).then(r => r.json()).catch(() => null);
                            const parentId = Number(parent?.item?.id || 0);

                            const childBody: Record<string, any> = { [relation.key]: parentId };
                            for (const c of columns) {
                                if (c.key === relation.key) continue;
                                if (c.required) childBody[c.key] = c.type === 'REAL' ? 1 : (isAr ? 'ابن الإثبات' : 'linked row');
                            }
                            const child = await fetch(`${base}/api/${resource}`, {
                                method: 'POST', headers: auth, body: JSON.stringify(childBody),
                            }).then(r => r.json()).catch(() => null);
                            const childId = Number(child?.item?.id || 0);
                            const label = String(child?.item?.parent_label || '');

                            const kids: any = await fetch(`${base}/api/${relation.resource}/${parentId}/${resource}`)
                                .then(r => r.json()).catch(() => null);
                            const linked = Array.isArray(kids?.[resource]) && kids[resource].some((r: any) => Number(r.id) === childId);

                            const dangling = await fetch(`${base}/api/${resource}`, {
                                method: 'POST', headers: auth,
                                body: JSON.stringify({ ...childBody, [relation.key]: 999999 }),
                            }).then(r => r.status).catch(() => 0);
                            const delBusy = await fetch(`${base}/api/${relation.resource}/${parentId}`, {
                                method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
                            }).then(r => r.status).catch(() => 0);

                            // A PROOF THAT LEAVES ITS RUBBISH BEHIND IS A MESS,
                            // NOT A PROOF. The child goes, then the parent —
                            // which also demonstrates the other half of the
                            // rule: once nothing depends on it, it deletes.
                            await fetch(`${base}/api/${resource}/${childId}`, {
                                method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
                            }).catch(() => null);
                            const delFreed = await fetch(`${base}/api/${relation.resource}/${parentId}`, {
                                method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
                            }).then(r => r.status).catch(() => 0);

                            relationProven = parentId > 0 && childId > 0 && label === parentBody[relation.labelKey]
                                && linked && dangling === 400 && delBusy === 409 && delFreed === 200;
                            term(`relation proof → parent #${parentId}, child #${childId}, parent_label ${label ? 'carried' : 'MISSING'}, children ${linked ? 'listed' : 'NOT listed'}, dangling link → ${dangling}, delete-with-children → ${delBusy}, delete-when-free → ${delFreed}`);
                            proven = proven && relationProven;
                        }
                        }
                    } else {
                        term('live proof → server did not come up');
                    }
                } finally {
                    try { child?.kill(); } catch { /* already gone */ }
                }
            }
        }

        const projects: Record<string, any> = (global as any).joeProjects || ((global as any).joeProjects = {});
        // resource + port ride along so a LATER react build in this session
        // can link itself to this API (the full-stack chain).
        projects[sessionKey] = { dir: proj, type: 'api', brand, resource, port: 4100, updatedAt: Date.now(), lastRequest: request.slice(0, 80) };
        persistJoeProjects();

        const fileList = Object.keys(files).map(f => `  • ${f}`).join('\n');
        /**
         * THE MESSAGE MUST DESCRIBE THE SERVER THAT WAS BUILT.
         *
         * The feed build printed an owner e-mail and password, «POST
         * /api/orders», and «Protected … catalogue writes» — none of which
         * exist in it. Handing someone a credential for an account that was
         * never created is not a small slip; it is the build lying about its
         * own shape. A feed gets a feed's message.
         */
        if (feed) {
            const feedMsg = isAr
                ? `🗄️ ${proven ? 'بُنيت واجهة خلفية كاملة وثبت عملها بنشر وقراءة حقيقيَّين' : 'بُنيت واجهة خلفية كاملة'} — «${brand}».

📂 المسار: ${proj}
${fileList}

${proven
                    ? `✅ الإثبات الحي: الخادم اشتغل فعلاً، ونُشر منشور رقم ${createdId} عبر HTTP حقيقي وقُرئ من القاعدة (${backend === 'sqlite' ? 'SQLite المدمجة' : 'مخزن JSON'})، والإعجاب سُجّل، والمنشور الفارغ رُفض.`
                    : npmMissing ? '⚠️ npm غير متاح هنا — المشروع جاهز؛ ثبّته بنفسك: npm install ثم npm start.'
                        : installed ? '⚠️ الخادم لم يثبت جاهزيته في المهلة — شغّله يدوياً: npm start.'
                            : '⚠️ التثبيت لم يكتمل — جرّب npm install داخل المجلد.'}

🧭 مسارات ${labelAr}:
   GET/POST /api/posts · DELETE /api/posts/:id
   POST /api/posts/:id/like · GET/POST /api/posts/:id/comments
   GET/POST /api/follows · GET /api/health

👥 لا يوجد حساب مالك هنا عن قصد: في شبكة اجتماعية **الأعضاء هم من ينشرون**،
   فالكتابة عامّة. الهوية اسمٌ يكتبه المستخدم بلا كلمة مرور — ومع الاسم وحده
   لا يستطيع الخادم منع أحد من انتحال صفة غيره. أضِف حسابات قبل النشر على الإنترنت.

🧭 خطوات تالية — أرسل أيّ سطر كما هو:
   • «شغّل المشروع» → أشغّل الخادم وأبقيه يعمل
   • «عدّل …» → تعديل جراحي متحقق على ملفات الخادم`
                : `🗄️ A feed backend${proven ? ', proven with a real HTTP post/read' : ''} — "${brand}".

📂 Path: ${proj}
${fileList}
${proven ? `✅ Live proof: post #${createdId} written over real HTTP and read back (backend: ${backend}).` : ''}
Public by design — members post: GET/POST /api/posts · POST /api/posts/:id/like · GET/POST /api/posts/:id/comments · GET/POST /api/follows
No owner account: identity here is a name with no password. Add real accounts before putting this online.`;
            return {
                ok: true,
                output: { message: feedMsg, path: proj, dir: path.basename(proj), resource, installed, proven, backend, files: Object.keys(files) },
                logs,
            } as any;
        }
        const message = isAr
            ? `🗄️ ${proven ? 'بُنيت واجهة خلفية كاملة وثبت عملها بكتابة وقراءة حقيقيتين' : installed ? 'بُنيت واجهة خلفية كاملة وثُبتت حزمها' : 'بُنيت واجهة خلفية كاملة'} — «${brand}».

📂 المسار: ${proj}
${fileList}

${proven
                ? `✅ الإثبات الحي: الخادم اشتغل فعلاً، وكُتب صف رقم ${createdId} عبر HTTP حقيقي وقُرئ من القاعدة (${backend === 'sqlite' ? 'SQLite المدمجة' : 'مخزن JSON'}) — والبيانات محفوظة على القرص وتنجو من إعادة التشغيل.`
                : npmMissing ? '⚠️ npm غير متاح هنا — المشروع جاهز؛ ثبّته بنفسك: npm install ثم npm start.'
                    : booted ? '⚠️ الخادم اشتغل فعلاً، لكن الإثبات الحيّ لم يكتمل — لم أستطع تسجيل الدخول بحساب المالك (غالباً لأن القاعدة موجودة من بناء سابق). التفاصيل في السطر «auth proof» أعلاه، والملفات سليمة.'
                        : installed ? '⚠️ الخادم لم يثبت جاهزيته في المهلة — شغّله يدوياً: npm start.'
                            : input?.skipInstall ? 'ℹ️ تخطيت التثبيت كما طُلب — شغّله: npm install ثم npm start.' : '⚠️ التثبيت لم يكتمل — جرّب npm install داخل المجلد.'}

${authProven || ownerCreated || !installed
                ? `🔐 حسابك (يظهر مرة واحدة — احفظه الآن):
   البريد: ${ownerEmail}
   كلمة المرور: ${ownerPassword}
   ${authProven
                    ? 'تحقّقتُ حيّاً: كتابة بلا تسجيل دخول تُرفض بـ401، وقراءة الطلبات تُرفض، وكلمة مرور خاطئة تُرفض، ودخولك أنت نجح وأصدر رمزاً.'
                    : 'لم أستطع التحقّق من الدخول حيّاً هذه المرة — جرّبها، وإن رُفضت فغيّرها عبر POST /api/auth/password.'}
   ⚠️ كلمة المرور ليست مخزّنة في أي ملف — الملفات تحمل بصمتها فقط (scrypt) ولا يمكن استرجاعها منها.`
                : `🔐 حسابك: ${ownerEmail} — وكلمة المرور هي **القديمة**، لا واحدة جديدة.
   هذا المشروع بُني فوق قاعدة بيانات موجودة من قبل، فالحساب فيها لم يُنشأ من جديد
   (وهذا صحيح: إنشاؤه ثانيةً كان سيمحو مالكها). ولذلك رفض الخادم دخولي بكلمة
   مرور جديدة — ولن أسلّمك كلمةً أعلم أنها لا تعمل.
   • تذكر القديمة؟ استخدمها.
   • نسيتها؟ احذف data.db (أو data.json) داخل المجلد وأعد التشغيل — يُنشأ حساب
     جديد وتُطبع كلمته، وستفقد بيانات القاعدة معه.
   • أو غيّرها وأنت داخل: POST /api/auth/password.`}

🧭 مسارات ${labelAr}:
   عامّة للزوار: GET /api/${resource} · GET /api/${resource}/:id · POST /api/orders · GET /api/health
   محميّة لك: POST/PUT/DELETE /api/${resource} · GET /api/orders (فيها أسماء العملاء وأرقامهم)
   الدخول: POST /api/auth/login ثم أرسل \`Authorization: Bearer <token>\`
   أمثلة curl جاهزة داخل README.md
${relation ? `
🔗 جدولان مرتبطان — ${relation.labelAr} ← ${labelAr}:
   كل ${labelAr} ينتمي إلى صفٍّ حقيقي في /api/${relation.resource} عبر \`${relation.key}\`،
   ويعود من الخادم ومعه \`parent_label\` (اسم أصله) بلا استعلام ثانٍ.
   GET /api/${relation.resource} · GET /api/${relation.resource}/:id/${resource}
   POST/PUT/DELETE /api/${relation.resource} (محميّة لك)
   ${relationProven
                    ? 'تحقّقتُ حيّاً: رابط إلى صفٍّ غير موجود يُرفض بـ400، وحذف أصلٍ له أبناء يُرفض بـ409 مع عددهم — فلا يبقى صفٌّ يتيماً.'
                    : 'الربط مُتحقَّق منه في الخادم: رابط لا وجود له يُرفض، وحذف أصلٍ له أبناء يُرفض.'}` : ''}

🧭 خطوات تالية — أرسل أيّ سطر كما هو:
   • «شغّل المشروع» → أشغّل الخادم وأبقيه يعمل
   • «عدّل …» → تعديل جراحي متحقق على ملفات الخادم
   • لاحقاً: اربطه بواجهة React («ابنِ متجر react واربطه بالـ API»)`
            : `🗄️ ${proven ? 'A full backend, scaffolded AND proven with a real HTTP write/read' : 'A full backend scaffolded'} — "${brand}".

📂 Path: ${proj}
${fileList}
${proven ? `✅ Live proof: row #${createdId} written over real HTTP and read back (backend: ${backend}).` : ''}
${authProven || ownerCreated || !installed
                ? `Owner account (shown once): ${ownerEmail} / ${ownerPassword}`
                : `Owner account: ${ownerEmail} — the password is the OLD one. This project was built over an existing database, so the account was not re-created and a fresh password would not work. Delete data.db to start over, or change it from inside with POST /api/auth/password.`}
Public: GET /api/${resource} · POST /api/orders · GET /api/health
Protected (Bearer token from POST /api/auth/login): catalogue writes · GET /api/orders`;

        return {
            ok: true,
            output: {
                message, path: proj, dir: path.basename(proj), resource, installed, proven, authProven, backend, ownerEmail,
                relation: relation ? { resource: relation.resource, key: relation.key, labelKey: relation.labelKey } : null,
                relationProven,
                files: Object.keys(files),
            },
            logs,
        } as any;
    }
}
