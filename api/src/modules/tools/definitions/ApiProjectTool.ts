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
import { brandFrom, brandFallback } from '../../../core/design/page-head';
import { detectPageKind, type PageKind } from '../../../core/design/blueprints';
import { ROLES, describeRoles } from '../../../core/design/roles';
import { broadcast, broadcastThinkingDetail, broadcastTerminalLine } from '../../../api/ws';
import { openTerminal } from '../../../core/quality/terminal-session';
import { persistJoeProjects, writeJoeProject } from '../../../api/page-store';

const slug = (s: string) => (String(s || '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 32)) || 'api';
const js = (s: string) => String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ');

/**
 * What this kind of business stores — the resource and its seed rows.
 *
 * `generic` is true when NOTHING in the request named the thing being stored
 * and the last-resort `items` was returned. The caller uses it to let the
 * request's own data model name the primary table instead; see the promotion
 * in `execute` below. Without that flag the two are indistinguishable —
 * a warehouse app that really is about «الأصناف» looks exactly like a freight
 * system that fell off the end of the list.
 */
export function apiResourceForKind(kind: PageKind, isAr: boolean, probe?: string): {
    resource: string; labelAr: string; seeds: Array<{ name: string; details: string; price: string }>;
    generic?: boolean;
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
        // The kind→table map moved beside the detectors it serves, because the
        // interface now reads the SAME map to decide whether a detected kind is
        // part of the system at all — two copies would drift.
        const { detectAppKind, RECORDS_TABLE_BY_KIND } = require('../../../core/design/app-blueprints');
        const appKind = detectAppKind(String(probe || ''));
        const named = appKind ? RECORDS_TABLE_BY_KIND[appKind] : null;
        if (named) {
            return {
                resource: named[0], labelAr: named[1],
                seeds: [],           // a real app starts empty — no fabricated rows
            };
        }
    }
    return {
        resource: 'items', labelAr: 'العناصر', generic: true,
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
            type: (f.type === 'number' || f.type === 'REAL') ? 'REAL' as const : f.type === 'INT' ? 'INT' as const : 'TEXT' as const,
            required: !!f.required,
        }))
        .filter((c: ApiColumn) => c.key && c.key !== 'id' && c.key !== 'created_at');
}

/**
 * Finance has a deterministic three-resource contract. When its primary table
 * is also present in the designed model, its fields are the API contract — not
 * the catalogue fallback used by presentation pages. Keeping this decision in
 * a pure helper makes the full-stack alignment regression-testable.
 */
export function apiPrimaryColumnsForApp(appKind: string | null, resource: string, designed: any[]): ApiColumn[] {
    if (appKind !== 'finance') return [];
    const primary = (designed || []).find((entity: any) => String(entity?.key || '') === String(resource || ''));
    return primary ? columnsFromFields(primary.fields || []) : [];
}

export interface ApiPrimarySelection {
    promoted: any | null;
    resource: string;
    labelAr: string;
    /** Keys backed by a declaration, named-entity list, or exact user token. */
    explicitKeys: string[];
}

/**
 * Choose the API's primary table without letting an inferred fragment replace a
 * known blueprint. Explicit declarations/lists outrank inference; an exact
 * table key in the request is the minimum evidence for an uncurated noun.
 */
export function selectApiPrimary(
    appKind: string | null,
    picked: { resource: string; labelAr: string; generic?: boolean },
    designed: any[],
    request: string,
): ApiPrimarySelection {
    const { declaredTables } = require('../../../core/design/declared-tables');
    const { namedEntities } = require('../../../core/design/named-entities');
    const declared = declaredTables(String(request || '')) as any[];
    const listed = declared.length ? declared : namedEntities(String(request || '')) as any[];
    const listedKeys = Array.from(new Set(
        listed.map(entity => String(entity?.key || '').toLowerCase()).filter(Boolean),
    ));
    const exactTokens = new Set((String(request || '').match(/[A-Za-z][A-Za-z0-9_]*/g) || [])
        .map(token => token.toLowerCase()));
    const explicitKeys = Array.from(new Set([
        ...listedKeys,
        ...(designed || []).map(entity => String(entity?.key || '').toLowerCase())
            .filter(key => key && exactTokens.has(key)),
    ]));
    const knownPrimary = !!picked.resource && picked.generic !== true && appKind !== 'generic';
    if (knownPrimary) {
        return { promoted: null, resource: picked.resource, labelAr: picked.labelAr, explicitKeys };
    }

    // A generic app may promote only a table the user actually named. Inferred
    // count is deliberately not evidence: `calleds` came from `called`, not a
    // table anyone typed, and therefore cannot become a route or a screen.
    const candidate = (designed || []).find(entity => {
        const key = String(entity?.key || '').toLowerCase();
        return key && key !== String(picked.resource || '').toLowerCase() && listedKeys.includes(key);
    });
    return candidate
        ? { promoted: candidate, resource: String(candidate.key), labelAr: String(candidate.ar || candidate.key), explicitKeys }
        : { promoted: null, resource: picked.resource, labelAr: picked.labelAr, explicitKeys };
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

    // ── ACCOUNTS ─────────────────────────────────────────────────────────
    // The same store the catalogue systems use: scrypt salt and hash only,
    // and never selected into any response body.
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
    db.listUsers = () => conn.prepare('SELECT id, email, role, created_at FROM users ORDER BY id').all()
      .map((u) => ({ id: u.id, email: u.email, role: u.role, created_at: u.created_at }));
    db.setRole = (id, role) => conn.prepare('UPDATE users SET role = ? WHERE id = ?').run(String(role), Number(id)).changes > 0;
    db.removeUser = (id) => conn.prepare('DELETE FROM users WHERE id = ?').run(Number(id)).changes > 0;
    db.countOwners = () => Number(conn.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'owner'").get().n);
  } catch { /* an older Node — the JSON backend below serves instead */ }
}

if (!db) {
  const FILE = path.join(HERE, 'data.json');
  const blank = { seq: 0, rows: [], likes: [], comments: [], cseq: 0, follows: [], users: [], useq: 0 };
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
  // The JSON twin of the accounts store — the same nine answers.
  const users = () => (load().users || []);
  db.countUsers = () => users().length;
  db.userByEmail = (email) => users().find((u) => u.email === String(email).toLowerCase()) || null;
  db.userById = (id) => users().find((u) => u.id === Number(id)) || null;
  db.createUser = ({ email, salt, hash, role = 'owner' }) => {
    const s2 = load();
    s2.users = s2.users || []; s2.useq = s2.useq || 0;
    const user = { id: ++s2.useq, email: String(email).toLowerCase(), salt: String(salt), hash: String(hash), role: String(role), created_at: new Date().toISOString() };
    s2.users.push(user); save(s2);
    return user;
  };
  db.setPassword = (id, salt, hash) => {
    const s2 = load();
    const u = (s2.users || []).find((x) => x.id === Number(id));
    if (!u) return false;
    u.salt = String(salt); u.hash = String(hash); save(s2);
    return true;
  };
  db.listUsers = () => users().map((u) => ({ id: u.id, email: u.email, role: u.role, created_at: u.created_at }));
  db.setRole = (id, role) => {
    const s2 = load();
    const u = (s2.users || []).find((x) => x.id === Number(id));
    if (!u) return false;
    u.role = String(role); save(s2);
    return true;
  };
  db.removeUser = (id) => {
    const s2 = load();
    const before = (s2.users || []).length;
    s2.users = (s2.users || []).filter((u) => u.id !== Number(id));
    save(s2);
    return s2.users.length < before;
  };
  db.countOwners = () => users().filter((u) => u.role === 'owner').length;
}

export { db };
`;
}

/**
 * THE FRONT DOOR — the block that makes a folder a SYSTEM.
 *
 * Measured on his own «social media platform» build: the interface was
 * packaged into the server's public/ («📦 Packaged the interface inside the
 * server»), the audit booted that server, asked for «/», and got **404** —
 * because only the catalogue server had ever served static files. The feed
 * server had none. So the whole system's front door was shut: on the audit's
 * browser, and on his domain the moment he uploaded the folder.
 *
 * One block, both servers, one behaviour. A server that carries an interface
 * must serve it, whatever kind of system it is.
 */
const SERVE_PACKAGED_UI = `
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
`;

function filePostsServerJs(brand: string, model: any[] = []): string {
    return `// ${brand} — the feed's API. Members post; everyone reads.
//   npm start            (port 4100)
//   PORT=5050 npm start
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { seedOwner } from './seed.js';
import {
  hashPassword, verifyPassword, signToken, requireAuth, throttleKey, isLocked, noteMiss, clearMisses, normalizeEmail,
  optionalAuth, requireRole, requireWrite, scopeOf, mayTouch, isRole, ROLES,
} from './auth.js';
${model.length ? "import { mountEntities, entityCounts } from './entities.js';" : ''}

const HERE_DIR = path.dirname(fileURLToPath(import.meta.url));

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

${model.length ? `// ── THE REST OF THE PLATFORM ──────────────────────────────────────────────
// Groups, pages, messages, ad campaigns: real tables with real CRUD, the
// same guards every other system Joe builds uses. Reading is public — that
// is what a social platform is — and writing needs an account.
mountEntities(app, { requireAuth, optionalAuth, requireWrite, scopeOf, mayTouch });
` : ''}
// ── ACCOUNTS ───────────────────────────────────────────────────────────────
// The README used to say «identity here is a name with no password. Add real
// accounts before putting this online.» That sentence was a to-do list handed
// to the owner. These are the accounts.
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    return res.status(400).json({ ok: false, error: 'email_and_password_required' });
  }
  const key = throttleKey(req, normalizeEmail(email));
  const wait = isLocked(key);
  if (wait) return res.status(429).json({ ok: false, error: 'too_many_attempts', retry_after_seconds: wait });
  const user = db.userByEmail(normalizeEmail(email));
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

const ownerOnly = [requireAuth, requireRole('owner')];

app.get('/api/auth/users', ...ownerOnly, (_req, res) =>
  res.json({ ok: true, users: db.listUsers(), roles: ROLES }));

app.post('/api/auth/users', ...ownerOnly, (req, res) => {
  const { email, role, password } = req.body || {};
  if (typeof email !== 'string' || email.indexOf('@') < 1 || email.length > 160) {
    return res.status(400).json({ ok: false, error: 'bad_email' });
  }
  const want = String(role || 'staff').toLowerCase();
  if (!isRole(want)) return res.status(400).json({ ok: false, error: 'bad_role' });
  if (password !== undefined && (typeof password !== 'string' || password.length < 8 || password.length > 200)) {
    return res.status(400).json({ ok: false, error: 'weak_password', message: 'at least 8 characters' });
  }
  const mail = normalizeEmail(email);
  if (db.userByEmail(mail)) return res.status(409).json({ ok: false, error: 'email_taken' });
  const pass = typeof password === 'string' ? password : crypto.randomBytes(9).toString('base64url');
  const { salt, hash } = hashPassword(pass);
  const user = db.createUser({ email: mail, salt, hash, role: want });
  res.status(201).json({
    ok: true,
    user: { id: user.id, email: user.email, role: user.role },
    password: typeof password === 'string' ? undefined : pass,
  });
});

app.put('/api/auth/users/:id', ...ownerOnly, (req, res) => {
  const target = db.userById(req.params.id);
  if (!target) return res.status(404).json({ ok: false, error: 'not_found' });
  const want = String((req.body || {}).role || '').toLowerCase();
  if (!isRole(want)) return res.status(400).json({ ok: false, error: 'bad_role' });
  if (target.role === 'owner' && want !== 'owner' && db.countOwners() <= 1) {
    return res.status(409).json({ ok: false, error: 'last_owner' });
  }
  db.setRole(target.id, want);
  res.json({ ok: true, user: { id: target.id, email: target.email, role: want } });
});

app.delete('/api/auth/users/:id', ...ownerOnly, (req, res) => {
  const target = db.userById(req.params.id);
  if (!target) return res.status(404).json({ ok: false, error: 'not_found' });
  if (Number(target.id) === Number(req.user.id)) return res.status(409).json({ ok: false, error: 'cannot_delete_self' });
  if (target.role === 'owner' && db.countOwners() <= 1) return res.status(409).json({ ok: false, error: 'last_owner' });
  db.removeUser(target.id);
  res.json({ ok: true });
});

const owner = seedOwner();
const port = Number(process.env.PORT || 4100);
${SERVE_PACKAGED_UI}
app.listen(port, () => {
  console.log(\`[api] feed listening on http://localhost:\${port} — backend: \${db.backend}, \${db.count()} posts\`);
  if (owner) console.log(\`[api] owner account created: \${owner} — the password was shown once in Joe's chat.\`);
  ${model.length ? "console.log('[api] platform tables: ' + Object.keys(entityCounts()).join(', ') + ' — full CRUD, owner-guarded writes');" : ''}
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
      owner_id INTEGER DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )\`);
    // An existing database from an older build has no link column — add it
    // rather than refusing to start on data the owner already has.
    for (const c of COLS) {
      try { conn.exec(\`ALTER TABLE ${resource} ADD COLUMN \${c.key} \${sqlType(c)} \${sqlDefault(c)}\`); }
      catch { /* the column is already there — the normal case */ }
    }
    // WHOSE ROW THIS IS. A database written before this system had a team has
    // no such column; every row in it stays the house's, which is the owner's.
    try { conn.exec('ALTER TABLE ${resource} ADD COLUMN owner_id INTEGER DEFAULT NULL'); }
    catch { /* already there — the normal case */ }
    const rowOf = (r) => {
      if (!r) return null;
      const out = { id: r.id };
      for (const k of KEYS) out[k] = r[k];
      out.owner_id = r.owner_id ?? null;
      out.created_at = r.created_at;
      return out;
    };
    db = {
      backend: 'sqlite',
      columns: COLS,
      list: (ownerId) => (ownerId === undefined || ownerId === null
        ? conn.prepare('SELECT * FROM ${resource} ORDER BY id DESC LIMIT 500').all()
        : conn.prepare('SELECT * FROM ${resource} WHERE owner_id = ? ORDER BY id DESC LIMIT 500').all(Number(ownerId))
      ).map(rowOf),
      get: (id) => rowOf(conn.prepare('SELECT * FROM ${resource} WHERE id = ?').get(Number(id))),
      create: (body, ownerId) => {
        const r = conn.prepare(
          'INSERT INTO ${resource} (' + KEYS.concat('owner_id').join(', ') + ') VALUES ('
          + KEYS.concat('owner_id').map(() => '?').join(', ') + ')',
        ).run(...COLS.map((c) => cast(c, (body || {})[c.key])), ownerId === undefined || ownerId === null ? null : Number(ownerId));
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
    // ── THE TEAM ───────────────────────────────────────────────────────────
    // Salt and hash never leave this file. The accounts screen shows who
    // exists, not what would let somebody become them.
    db.listUsers = () => conn.prepare('SELECT id, email, role, created_at FROM users ORDER BY id').all()
      .map((u) => ({ id: u.id, email: u.email, role: u.role, created_at: u.created_at }));
    db.setRole = (id, role) => conn.prepare('UPDATE users SET role = ? WHERE id = ?').run(String(role), Number(id)).changes > 0;
    db.removeUser = (id) => conn.prepare('DELETE FROM users WHERE id = ?').run(Number(id)).changes > 0;
    db.countOwners = () => Number(conn.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'owner'").get().n);

    // ── the parent table, when this system has one ──────────────────────────
    if (REL) {
      conn.exec(\`CREATE TABLE IF NOT EXISTS \${REL.resource} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        \${REL_COLS.map((c) => \`\${c.key} \${sqlType(c)} \${sqlDefault(c)}\`).join(',\\n        ')},
        owner_id INTEGER DEFAULT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      )\`);
      try { conn.exec('ALTER TABLE ' + REL.resource + ' ADD COLUMN owner_id INTEGER DEFAULT NULL'); }
      catch { /* already there — the normal case */ }
      const prowOf = (r) => {
        if (!r) return null;
        const out = { id: r.id };
        for (const k of REL_KEYS) out[k] = r[k];
        out.owner_id = r.owner_id ?? null;
        out.created_at = r.created_at;
        return out;
      };
      db.rel = {
        list: (ownerId) => (ownerId === undefined || ownerId === null
          ? conn.prepare('SELECT * FROM ' + REL.resource + ' ORDER BY id DESC LIMIT 500').all()
          : conn.prepare('SELECT * FROM ' + REL.resource + ' WHERE owner_id = ? ORDER BY id DESC LIMIT 500').all(Number(ownerId))
        ).map(prowOf),
        get: (id) => prowOf(conn.prepare('SELECT * FROM ' + REL.resource + ' WHERE id = ?').get(Number(id))),
        create: (body, ownerId) => {
          const r = conn.prepare(
            'INSERT INTO ' + REL.resource + ' (' + REL_KEYS.concat('owner_id').join(', ') + ') VALUES ('
            + REL_KEYS.concat('owner_id').map(() => '?').join(', ') + ')',
          ).run(...REL_COLS.map((c) => cast(c, (body || {})[c.key])), ownerId === undefined || ownerId === null ? null : Number(ownerId));
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
    list: (ownerId) => load().rows.slice().reverse()
      .filter((r) => ownerId === undefined || ownerId === null || Number(r.owner_id) === Number(ownerId))
      .slice(0, 500),
    get: (id) => load().rows.find((r) => r.id === Number(id)) || null,
    create: (body, ownerId) => {
      const s = load();
      const row = { id: ++s.seq };
      for (const c of COLS) row[c.key] = cast(c, (body || {})[c.key]);
      row.owner_id = ownerId === undefined || ownerId === null ? null : Number(ownerId);
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
    // ── THE TEAM — the same four answers the SQLite backend gives ──────────
    listUsers: () => (load().users || []).map((u) => ({ id: u.id, email: u.email, role: u.role, created_at: u.created_at })),
    setRole: (id, role) => {
      const s = load();
      const u = (s.users || []).find((x) => x.id === Number(id));
      if (!u) return false;
      u.role = String(role);
      save(s);
      return true;
    },
    removeUser: (id) => {
      const s = load();
      const before = (s.users || []).length;
      s.users = (s.users || []).filter((u) => u.id !== Number(id));
      save(s);
      return s.users.length < before;
    },
    countOwners: () => (load().users || []).filter((u) => u.role === 'owner').length,
  };
  if (REL) {
    db.rel = {
      list: (ownerId) => load().parents.slice().reverse()
        .filter((p) => ownerId === undefined || ownerId === null || Number(p.owner_id) === Number(ownerId))
        .slice(0, 500),
      get: (id) => load().parents.find((p) => p.id === Number(id)) || null,
      create: (body, ownerId) => {
        const s = load();
        const row = { id: ++s.pseq };
        for (const c of REL_COLS) row[c.key] = cast(c, (body || {})[c.key]);
        row.owner_id = ownerId === undefined || ownerId === null ? null : Number(ownerId);
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

/**
 * THE REST OF THE SYSTEM'S TABLES.
 *
 * `db.js` owns the primary collection and its one optional parent — that is
 * where a store's products live, and it stays exactly as it is. A PLATFORM
 * needs more: vendors, customers, coupons, shipments; doctors, patients,
 * appointments. This module is generated beside it, from the model derived
 * from the request, and gives every entity the same three things db.js gives
 * the first one: a real table, real CRUD, and a foreign key that REFUSES to
 * point at a row that does not exist.
 *
 * Same dual backend as db.js: node:sqlite when this Node has it, a JSON file
 * with the same interface otherwise. Zero native dependencies either way.
 */
function fileEntitiesJs(entities: any[]): string {
    const MODEL = JSON.stringify(entities.map(e => ({
        key: e.key,
        fields: e.fields.map((f: any) => ({ key: f.key, type: f.type, required: !!f.required })),
        belongsTo: e.belongsTo || null,
    })));
    return `// The system's other tables — generated from the model Joe derived from your
// request. Each one has its own CRUD, its own validation, and a foreign key
// that is checked before a row is written.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODEL = ${MODEL};

const cast = (c, v) => {
  if (c.type === 'REAL') return Number(v || 0);
  if (c.type === 'INT') return v === '' || v === null || v === undefined ? null : Number(v);
  return String(v ?? '');
};
const sqlType = (c) => (c.type === 'INT' ? 'INTEGER' : c.type);
const sqlDefault = (c) => (c.required ? 'NOT NULL' : c.type === 'INT' ? 'DEFAULT NULL' : "DEFAULT ''");

/** What a row must carry to be written at all. */
function validate(entity, body, tables) {
  const b = body || {};
  for (const f of entity.fields) {
    const v = b[f.key];
    if (f.required && (v === undefined || v === null || String(v).trim() === '')) {
      return { error: f.key + '_required' };
    }
    // A picture is stored AS the picture, so the ordinary text cap would refuse
    // every photo. It gets its own, still bounded.
    var cap = /(^|_)(image|photo|picture|img)$/.test(f.key) ? 800000 : 500;
    if (v !== undefined && f.type !== 'REAL' && String(v).length > cap) return { error: 'too_long_' + f.key };
  }
  // A link that can dangle is not a relation.
  const rel = entity.belongsTo;
  if (rel) {
    const raw = b[rel.key];
    if (raw !== undefined && raw !== null && String(raw) !== '') {
      const parent = tables[rel.entity];
      if (!parent) return { error: 'unknown_parent_table' };
      if (!parent.get(raw)) return { error: rel.key + '_not_found' };
    }
  }
  return null;
}

let store;
if (process.env.JOE_FORCE_JSON_DB !== '1') {
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const conn = new DatabaseSync(path.join(HERE, 'data.db'));
    const tables = {};
    for (const e of MODEL) {
      conn.exec('CREATE TABLE IF NOT EXISTS ' + e.key + ' (id INTEGER PRIMARY KEY AUTOINCREMENT, '
        + e.fields.map((f) => f.key + ' ' + sqlType(f) + ' ' + sqlDefault(f)).join(', ')
        + ", owner_id INTEGER DEFAULT NULL, created_at TEXT DEFAULT (datetime('now')))");
      for (const f of e.fields) {
        try { conn.exec('ALTER TABLE ' + e.key + ' ADD COLUMN ' + f.key + ' ' + sqlType(f) + ' ' + sqlDefault(f)); }
        catch { /* already there — the normal case */ }
      }
      // Whose row this is — added to databases written before the team existed.
      try { conn.exec('ALTER TABLE ' + e.key + ' ADD COLUMN owner_id INTEGER DEFAULT NULL'); }
      catch { /* already there — the normal case */ }
    }
    for (const e of MODEL) {
      const keys = e.fields.map((f) => f.key);
      tables[e.key] = {
        entity: e,
        list: (ownerId) => (ownerId === undefined || ownerId === null
          ? conn.prepare('SELECT * FROM ' + e.key + ' ORDER BY id DESC LIMIT 500').all()
          : conn.prepare('SELECT * FROM ' + e.key + ' WHERE owner_id = ? ORDER BY id DESC LIMIT 500').all(Number(ownerId))),
        get: (id) => conn.prepare('SELECT * FROM ' + e.key + ' WHERE id = ?').get(Number(id)) || null,
        create: (body, ownerId) => {
          const r = conn.prepare('INSERT INTO ' + e.key + ' (' + keys.concat('owner_id').join(', ') + ') VALUES ('
            + keys.concat('owner_id').map(() => '?').join(', ') + ')')
            .run(...e.fields.map((f) => cast(f, (body || {})[f.key])), ownerId === undefined || ownerId === null ? null : Number(ownerId));
          return tables[e.key].get(r.lastInsertRowid);
        },
        update: (id, patch) => {
          const cur = tables[e.key].get(id);
          if (!cur) return null;
          const next = {};
          for (const f of e.fields) next[f.key] = (patch || {})[f.key] === undefined ? cur[f.key] : cast(f, patch[f.key]);
          conn.prepare('UPDATE ' + e.key + ' SET ' + keys.map((k) => k + ' = ?').join(', ') + ' WHERE id = ?')
            .run(...keys.map((k) => next[k]), Number(id));
          return tables[e.key].get(id);
        },
        remove: (id) => conn.prepare('DELETE FROM ' + e.key + ' WHERE id = ?').run(Number(id)).changes > 0,
        count: () => conn.prepare('SELECT COUNT(*) AS n FROM ' + e.key).get().n,
      };
    }
    store = { backend: 'sqlite', tables };
  } catch { /* no node:sqlite here — the JSON store below is the same interface */ }
}

if (!store) {
  const FILE = path.join(HERE, 'entities.json');
  const load = () => {
    try { return JSON.parse(fs.readFileSync(FILE, 'utf-8')); } catch { return { rows: {}, seq: {} }; }
  };
  const save = (s) => { try { fs.writeFileSync(FILE, JSON.stringify(s, null, 2)); } catch { /* read-only disk */ } };
  const tables = {};
  for (const e of MODEL) {
    tables[e.key] = {
      entity: e,
      list: (ownerId) => (load().rows[e.key] || []).slice().reverse()
        .filter((r) => ownerId === undefined || ownerId === null || Number(r.owner_id) === Number(ownerId))
        .slice(0, 500),
      get: (id) => (load().rows[e.key] || []).find((r) => r.id === Number(id)) || null,
      create: (body, ownerId) => {
        const s = load();
        s.rows[e.key] = s.rows[e.key] || []; s.seq[e.key] = s.seq[e.key] || 0;
        const row = { id: ++s.seq[e.key] };
        for (const f of e.fields) row[f.key] = cast(f, (body || {})[f.key]);
        row.owner_id = ownerId === undefined || ownerId === null ? null : Number(ownerId);
        row.created_at = new Date().toISOString();
        s.rows[e.key].push(row);
        save(s);
        return row;
      },
      update: (id, patch) => {
        const s = load();
        const row = (s.rows[e.key] || []).find((r) => r.id === Number(id));
        if (!row) return null;
        for (const f of e.fields) if ((patch || {})[f.key] !== undefined) row[f.key] = cast(f, patch[f.key]);
        save(s);
        return row;
      },
      remove: (id) => {
        const s = load();
        const before = (s.rows[e.key] || []).length;
        s.rows[e.key] = (s.rows[e.key] || []).filter((r) => r.id !== Number(id));
        save(s);
        return (s.rows[e.key] || []).length < before;
      },
      count: () => (load().rows[e.key] || []).length,
    };
  }
  store = { backend: 'json', tables };
}

export const entities = store;

/** Counts for /api/health — one number per table, measured not assumed. */
export function entityCounts() {
  const out = {};
  for (const key of Object.keys(store.tables)) out[key] = store.tables[key].count();
  return out;
}

/**
 * Mounts /api/<entity> for every table.
 *
 * Reading is public — a catalogue is meant to be read, and a visitor with no
 * account still sees the whole shelf. But a SIGNED-IN read is a different
 * question: an employee asks «which of these are mine?», and the answer is
 * scoped to the rows he wrote. Writing needs an account that may write, and
 * an employee may only ever touch his own row: 403 «not_your_row», never a
 * quiet success on somebody else's data.
 *
 * Every rule here comes from auth.js — this file decides nothing on its own.
 */
export function mountEntities(app, guards) {
  const { requireAuth, optionalAuth, requireWrite, scopeOf, mayTouch } = guards;
  for (const key of Object.keys(store.tables)) {
    const t = store.tables[key];
    app.get('/api/' + key, optionalAuth, (req, res) => res.json({ ok: true, [key]: t.list(scopeOf(req)) }));
    app.get('/api/' + key + '/:id', optionalAuth, (req, res) => {
      const row = t.get(req.params.id);
      if (!row) return res.status(404).json({ ok: false, error: 'not_found' });
      const mine = scopeOf(req);
      if (mine !== null && Number(row.owner_id) !== Number(mine)) return res.status(404).json({ ok: false, error: 'not_found' });
      res.json({ ok: true, row });
    });
    app.post('/api/' + key, requireAuth, requireWrite, (req, res) => {
      const bad = validate(t.entity, req.body, store.tables);
      if (bad) return res.status(400).json({ ok: false, ...bad });
      // The owner of a new row is the ACCOUNT that wrote it — never a value
      // out of the body, which anyone could put there.
      res.status(201).json({ ok: true, row: t.create(req.body, req.user.id) });
    });
    app.put('/api/' + key + '/:id', requireAuth, requireWrite, (req, res) => {
      const cur = t.get(req.params.id);
      if (!cur) return res.status(404).json({ ok: false, error: 'not_found' });
      if (!mayTouch(req, cur)) return res.status(403).json({ ok: false, error: 'not_your_row' });
      const bad = validate(t.entity, { ...cur, ...(req.body || {}) }, store.tables);
      if (bad) return res.status(400).json({ ok: false, ...bad });
      const row = t.update(req.params.id, req.body);
      if (!row) return res.status(404).json({ ok: false, error: 'not_found' });
      res.json({ ok: true, row });
    });
    app.delete('/api/' + key + '/:id', requireAuth, requireWrite, (req, res) => {
      const cur = t.get(req.params.id);
      if (!cur) return res.status(404).json({ ok: false, error: 'not_found' });
      if (!mayTouch(req, cur)) return res.status(403).json({ ok: false, error: 'not_your_row' });
      if (!t.remove(req.params.id)) return res.status(404).json({ ok: false, error: 'not_found' });
      res.json({ ok: true });
    });
    // The children of one parent, as their own address.
    const rel = t.entity.belongsTo;
    if (rel) {
      app.get('/api/' + rel.entity + '/:id/' + key, optionalAuth, (req, res) => {
        const rows = t.list(scopeOf(req)).filter((r) => String(r[rel.key]) === String(Number(req.params.id)));
        res.json({ ok: true, [key]: rows });
      });
    }
  }
}
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

/**
 * A TOKEN IF THERE IS ONE — and no 401 when there is not.
 *
 * The catalogue is public: a visitor must be able to read it without an
 * account, and that must not change. But a SIGNED-IN request is a different
 * question — «which of these rows are mine?» — and the answer needs to know
 * who is asking. So reading routes take this instead of requireAuth: the
 * anonymous visitor still gets the whole shelf, and an employee gets his own.
 */
export function optionalAuth(req, _res, next) {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token) {
    const claims = verifyToken(token);
    const user = claims && db.userById(claims.sub);
    if (user) req.user = { id: user.id, email: user.email, role: user.role };
  }
  next();
}

/**
 * WHO MAY DO WHAT — once, for the whole system.
 *
 * The role is re-read from the database on every request (see requireAuth
 * above), never trusted from the token alone: demoting somebody must take
 * effect the moment you press the button, not twelve hours later when their
 * token expires.
 */
export const ROLES = ${JSON.stringify(ROLES.map(r => ({
        key: r.key, ar: r.ar, en: r.en, write: r.write, ownRowsOnly: r.ownRowsOnly, manageUsers: r.manageUsers,
    })))};

/** An unknown role is the LEAST privileged one, never the most. */
const specOf = (role) => ROLES.find((r) => r.key === String(role || '').toLowerCase())
  || ROLES.find((r) => r.key === 'viewer');

export function canWrite(role) { return !!specOf(role).write; }
export function ownRowsOnly(role) { return !!specOf(role).ownRowsOnly; }
export function canManageUsers(role) { return !!specOf(role).manageUsers; }
export function isRole(key) { return ROLES.some((r) => r.key === String(key || '').toLowerCase()); }

/** The guard for a route only some roles may reach. */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ ok: false, error: 'auth_required' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ ok: false, error: 'forbidden', need: roles });
    next();
  };
}

/** Writing at all. A viewer is refused here, once, for every table there is. */
export function requireWrite(req, res, next) {
  if (!req.user) return res.status(401).json({ ok: false, error: 'auth_required' });
  if (!canWrite(req.user.role)) return res.status(403).json({ ok: false, error: 'read_only' });
  next();
}

/** Whose rows this request may see. \`null\` means everyone's. */
export function scopeOf(req) {
  return req.user && ownRowsOnly(req.user.role) ? req.user.id : null;
}

/**
 * May this request TOUCH this row?
 *
 * A row with no owner_id was written before this system had a team — it is the
 * house's row, and the house is the owner. An employee does not inherit it by
 * accident.
 */
export function mayTouch(req, row) {
  if (!req.user || !canWrite(req.user.role)) return false;
  if (!ownRowsOnly(req.user.role)) return true;
  if (!row || row.owner_id === null || row.owner_id === undefined || row.owner_id === '') return false;
  return Number(row.owner_id) === Number(req.user.id);
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

function fileServerJs(resource: string, brand: string, dirName: string, relation: ApiRelation | null = null, model: any[] = []): string {
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

app.get('/api/${relation.resource}', optionalAuth, (req, res) => res.json({ ok: true, ${relation.resource}: db.rel.list(scopeOf(req)) }));

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

app.post('/api/${relation.resource}', requireAuth, requireWrite, (req, res) => {
  const { value, error } = validateRel(req.body, false);
  if (error) return res.status(400).json({ ok: false, error });
  res.status(201).json({ ok: true, item: db.rel.create(value, req.user.id) });
});

app.put('/api/${relation.resource}/:id', requireAuth, requireWrite, (req, res) => {
  const cur = db.rel.get(req.params.id);
  if (!cur) return res.status(404).json({ ok: false, error: 'not_found' });
  if (!mayTouch(req, cur)) return res.status(403).json({ ok: false, error: 'not_your_row' });
  const { value, error } = validateRel(req.body, true);
  if (error) return res.status(400).json({ ok: false, error });
  const row = db.rel.update(req.params.id, value);
  if (!row) return res.status(404).json({ ok: false, error: 'not_found' });
  res.json({ ok: true, item: row });
});

app.delete('/api/${relation.resource}/:id', requireAuth, requireWrite, (req, res) => {
  const parent = db.rel.get(req.params.id);
  if (parent && !mayTouch(req, parent)) return res.status(403).json({ ok: false, error: 'not_your_row' });
  const kids = db.childrenOf(req.params.id).length;
  // Deleting the parent would leave every child pointing at nothing. The
  // owner is told exactly how many rows stand in the way.
  if (kids) return res.status(409).json({ ok: false, error: 'has_children', count: kids });
  if (!db.rel.remove(req.params.id)) return res.status(404).json({ ok: false, error: 'not_found' });
  res.json({ ok: true });
});
`;
    return fileServerJsBody(resource, brand, dirName, relation, relRoutes, model);
}

function fileServerJsBody(resource: string, brand: string, dirName: string, relation: ApiRelation | null, relRoutes: string, model: any[] = []): string {
    return `// ${brand} — a real Express API over a real database. Runs with:
//   npm start            (port 4100)
//   PORT=5050 npm start  (any port)
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { seed, seedOwner } from './seed.js';
import {
  hashPassword, verifyPassword, signToken, requireAuth, throttleKey, isLocked, noteMiss, clearMisses, normalizeEmail,
  optionalAuth, requireRole, requireWrite, scopeOf, mayTouch, isRole, ROLES,
} from './auth.js';
${model.length ? "import { mountEntities, entityCounts } from './entities.js';" : ''}

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
// 100kb refused every row that carried a photo — and the picture IS the row's
// data now, not a link to somewhere else.
app.use(express.json({ limit: '4mb' }));

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
  ${model.length
        // THE REPORT DESCRIBES THE WHOLE SYSTEM, INCLUDING ITS OWN TABLE.
        // `entityCounts()` covers the generated model only. The primary table
        // lives in db.js with the built-in CRUD, so a request that declared
        // «animals, vaccinations, doctors…» saw four of its five names here and
        // the fifth — the one promoted to primary — appeared nowhere, reading
        // as a table that was never built. It is served at /api/${resource};
        // the report now says so.
        ? `tables: Object.assign({ ${JSON.stringify(resource)}: db.count() }, entityCounts()),`
        : `tables: { ${JSON.stringify(resource)}: db.count() },`}
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

// ── THE TEAM ───────────────────────────────────────────────────────────────
// A system with one account is a system for one person. These four routes are
// how a business gets a counter clerk who cannot read the owner's rows and an
// accountant who cannot change anything — without ever handing out the
// owner's password, because a password is not a role.
//
// Only the owner reaches them: requireRole('owner') answers 403 to everybody
// else, including a staff account that guessed the address.
const ownerOnly = [requireAuth, requireRole('owner')];

app.get('/api/auth/users', ...ownerOnly, (_req, res) =>
  res.json({ ok: true, users: db.listUsers(), roles: ROLES }));

app.post('/api/auth/users', ...ownerOnly, (req, res) => {
  const { email, role, password } = req.body || {};
  if (typeof email !== 'string' || email.indexOf('@') < 1 || email.length > 160) {
    return res.status(400).json({ ok: false, error: 'bad_email' });
  }
  const want = String(role || 'staff').toLowerCase();
  if (!isRole(want)) return res.status(400).json({ ok: false, error: 'bad_role' });
  if (password !== undefined && (typeof password !== 'string' || password.length < 8 || password.length > 200)) {
    return res.status(400).json({ ok: false, error: 'weak_password', message: 'at least 8 characters' });
  }
  const mail = normalizeEmail(email);
  if (db.userByEmail(mail)) return res.status(409).json({ ok: false, error: 'email_taken' });
  // No password given: one is MADE here and returned exactly once. It is
  // stored only as a scrypt hash, so this response is the only time anybody
  // — including the owner — will ever see it.
  const pass = typeof password === 'string' ? password : crypto.randomBytes(9).toString('base64url');
  const { salt, hash } = hashPassword(pass);
  const user = db.createUser({ email: mail, salt, hash, role: want });
  res.status(201).json({
    ok: true,
    user: { id: user.id, email: user.email, role: user.role },
    password: typeof password === 'string' ? undefined : pass,
  });
});

app.put('/api/auth/users/:id', ...ownerOnly, (req, res) => {
  const target = db.userById(req.params.id);
  if (!target) return res.status(404).json({ ok: false, error: 'not_found' });
  const want = String((req.body || {}).role || '').toLowerCase();
  if (!isRole(want)) return res.status(400).json({ ok: false, error: 'bad_role' });
  // The last owner may not demote himself: a system nobody can administer is
  // a system whose accounts screen is locked forever.
  if (target.role === 'owner' && want !== 'owner' && db.countOwners() <= 1) {
    return res.status(409).json({ ok: false, error: 'last_owner' });
  }
  db.setRole(target.id, want);
  res.json({ ok: true, user: { id: target.id, email: target.email, role: want } });
});

app.delete('/api/auth/users/:id', ...ownerOnly, (req, res) => {
  const target = db.userById(req.params.id);
  if (!target) return res.status(404).json({ ok: false, error: 'not_found' });
  if (Number(target.id) === Number(req.user.id)) return res.status(409).json({ ok: false, error: 'cannot_delete_self' });
  if (target.role === 'owner' && db.countOwners() <= 1) return res.status(409).json({ ok: false, error: 'last_owner' });
  db.removeUser(target.id);
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

${model.length ? `// The rest of the system's tables — vendors, customers, coupons…
// Reading is public; writing needs an account, and an employee only ever
// touches his own rows. Every rule comes from auth.js.
mountEntities(app, { requireAuth, optionalAuth, requireWrite, scopeOf, mayTouch });
` : ''}${relRoutes}
app.get('/api/${resource}', optionalAuth, (req, res) => res.json({ ok: true, ${resource}: db.list(scopeOf(req)) }));

app.get('/api/${resource}/:id', optionalAuth, (req, res) => {
  const row = db.get(req.params.id);
  if (!row) return res.status(404).json({ ok: false, error: 'not_found' });
  const mine = scopeOf(req);
  if (mine !== null && Number(row.owner_id) !== Number(mine)) return res.status(404).json({ ok: false, error: 'not_found' });
  res.json({ ok: true, item: row, row });
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
      // Zero is a valid value for ordinary integer flags such as pinned and
      // completed. Only a declared foreign-key column must be strictly
      // positive and point at a real parent row.
      const isRelation = !!db.relation && c.key === db.relation.key;
      if (!Number.isInteger(n) || (isRelation && n <= 0)) return { error: 'bad_' + c.key };
      if (isRelation && !db.rel.get(n)) return { error: 'unknown_' + c.key };
      out[c.key] = n;
    } else {
      const str = String(v);
      if (str.length > 2000) return { error: 'bad_' + c.key };
      out[c.key] = str.trim();
    }
  }
  return { value: out };
};

app.post('/api/${resource}', requireAuth, requireWrite, (req, res) => {
  const { value, error } = validate(req.body, false);
  if (error) return res.status(400).json({ ok: false, error });
  // Whoever wrote the row owns it — read from the account, never from the body.
  // ONE SERVER, ONE ENVELOPE. The generated model's tables answer with a row
  // key and this one answered with an item key, so a client talking to its own
  // backend had to know which half of the schema a table came from. Both keys
  // carry the same row; item stays for anything already reading it.
  const created = db.create(value, req.user.id);
  res.status(201).json({ ok: true, item: created, row: created });
});

app.put('/api/${resource}/:id', requireAuth, requireWrite, (req, res) => {
  const cur = db.get(req.params.id);
  if (!cur) return res.status(404).json({ ok: false, error: 'not_found' });
  if (!mayTouch(req, cur)) return res.status(403).json({ ok: false, error: 'not_your_row' });
  const { value, error } = validate(req.body, true);   // a patch may be partial
  if (error) return res.status(400).json({ ok: false, error });
  const row = db.update(req.params.id, value);
  if (!row) return res.status(404).json({ ok: false, error: 'not_found' });
  res.json({ ok: true, item: row, row });
});

app.delete('/api/${resource}/:id', requireAuth, requireWrite, (req, res) => {
  const cur = db.get(req.params.id);
  if (!cur) return res.status(404).json({ ok: false, error: 'not_found' });
  if (!mayTouch(req, cur)) return res.status(403).json({ ok: false, error: 'not_your_row' });
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
 *
 * The block itself lives in ONE place and is shared with the feed server,
 * which for months did not have it — and answered 404 at its own front door.
 */
${SERVE_PACKAGED_UI}
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

## الفريق — ثلاثة أدوار، لا واحد

النظام لم يعد لشخص واحد. الحسابات تُصنع من داخله، ولا تُسلَّم كلمة مرورك لأحد:

${describeRoles(true)}

\`\`\`bash
# أنشئ حساب موظّف — كلمة مروره تُولَّد وتظهر في هذا الرد مرة واحدة فقط
curl -X POST http://localhost:4100/api/auth/users -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" -d '{"email":"clerk@${ownerEmail.split('@')[1] || 'joe.local'}","role":"staff"}'

curl http://localhost:4100/api/auth/users -H "Authorization: Bearer $TOKEN"      # من في النظام
curl -X PUT http://localhost:4100/api/auth/users/2 -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" -d '{"role":"viewer"}'                      # غيّر دوره
curl -X DELETE http://localhost:4100/api/auth/users/2 -H "Authorization: Bearer $TOKEN"
\`\`\`

القواعد التي يفرضها الخادم نفسه — لا الواجهة:

- كل صفٍّ يُكتب يحمل \`owner_id\` مأخوذاً من **الحساب**، لا من جسم الطلب.
- الموظّف يرى صفوفه هو فقط (\`GET\` برمزه)، ومحاولة تعديل صفّ غيره تُجاب **403 not_your_row**.
- المُطّلِع تُجاب كتابته **403 read_only** — قراءةً فقط.
- الزائر بلا حساب ما زال يرى الرفّ كاملاً: هذا هو المتجر، ولم يتغيّر.
- الصفوف المكتوبة قبل وجود الفريق (\`owner_id\` فارغ) تبقى للمالك — لا يرثها أحد.
- تغيير الدور يسري فوراً على الرمز القائم: الدور يُقرأ من القاعدة في كل طلب.
- ولا يمكن حذف آخر مالك ولا تنزيله (**409 last_owner**)، ولا حذف الحساب لنفسه.

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

        /**
         * The category declaration is field OPTIONS, not a name and not a
         * table list. Read raw, brandFrom shipped «مشروع الات،» as this
         * project's NAME on a live build — the mangled tail of «بفئات:». The
         * name, the kind and the columns read the sentence without it; the
         * blueprint keeps the raw request, because the options ARE its.
         */
        const { stripDeclaredOptions } = require('../../../core/design/app-blueprints');
        const requestForReading = stripDeclaredOptions(request);
        const kind = detectPageKind(requestForReading);
        const { detectAppKind } = require('../../../core/design/app-blueprints');
        // This is the authoritative application contract used to choose the
        // API resource. Persist it so a later frontend phase cannot re-derive
        // a different kind from its shorter phase request.
        const appKind = detectAppKind(requestForReading);
        const brand = brandFrom(requestForReading, isAr) || brandFallback(requestForReading, isAr, kind);
        const picked = apiResourceForKind(kind, isAr, requestForReading);
        // The schema follows the app's own blueprint. Seeds only make sense for
        // the catalogue shape — a booking table seeded with «Dish of the day»
        // would be noise pretending to be data.
        const requestColumns = apiColumnsForRequest(request);
        // Productivity is a deliberate two-collection contract. The generic
        // schema designer may infer incidental words such as dates or
        // persistences, but the app's two real surfaces are notes and tasks;
        // both sides must share these exact columns and types.
        const isProductivity = appKind === 'productivity';
        const productivityNotesColumns: ApiColumn[] = [
            { key: 'title', type: 'TEXT', required: true },
            { key: 'body', type: 'TEXT', required: true },
            { key: 'category', type: 'TEXT', required: false },
            { key: 'pinned', type: 'INT', required: false },
            { key: 'completed', type: 'INT', required: false },
        ];
        const productivityTaskColumns: ApiColumn[] = [
            { key: 'title', type: 'TEXT', required: true },
            { key: 'details', type: 'TEXT', required: false },
            { key: 'priority', type: 'TEXT', required: false },
            { key: 'due', type: 'TEXT', required: false },
            { key: 'completed', type: 'INT', required: false },
        ];
        /**
         * The parent table, when this system has one — «طبيب ← مواعيده».
         *
         * BUT NOT WHEN HE NAMED THE TABLES HIMSELF.
         *
         * The relation comes from the blueprint of the KIND, and the model
         * comes from the request. Ask for «Tables: bookings, clients» and the
         * two disagree: the model is exactly those two, each with belongsTo
         * null, while the blueprint still hands over a `providers` parent. The
         * server then announced «two linked tables: /api/providers» for a
         * parent it never created, and the build's own relation proof tested
         * that ghost and reported «parent_label MISSING» — a failure invented
         * by the check, about a feature nobody asked for, printed under a
         * server that was working perfectly.
         *
         * The declared tables are the tables. When he writes them down,
         * nothing is added behind them.
         */
        const { declaredTables } = require('../../../core/design/declared-tables');
        const declaredForRelation = declaredTables(request).length;
        /**
         * AND THE REST OF THE SYSTEM'S TABLES.
         *
         * One table was the ceiling: «multi-vendor marketplace, inventory,
         * shipping, coupons…» answered with `products` and `orders`. The model
         * derived here gives vendors, customers, coupons and shipments their
         * own tables, their own CRUD and a foreign key that refuses to dangle.
         * Empty for anything that does not clearly name a domain — a plain
         * store keeps behaving exactly as it does today.
         */
        const { describeModel } = require('../../../core/design/data-model');
        /**
         * AND WHEN NO DOMAIN MATCHES, THE MODEL DESIGNS ONE.
         *
         * Six hand-written domains is a ceiling with his name on it: a
         * veterinary clinic, a freight system, a gym — anything else fell back
         * to one table and waited for me to add a seventh domain by hand. The
         * model is let in exactly here, where it is trustworthy on his laptop:
         * it DESCRIBES the tables under a constrained decoder, a strict
         * validator refuses anything unsafe, and the deterministic generator
         * builds it. Every failure lands on the six domains.
         */
        const { designDataModel } = require('../../../core/design/schema-designer');
        const designed = await designDataModel(request, { onNote: (n: string) => term(n) });

        /**
         * AND THE SYSTEM NAMES ITS OWN PRIMARY TABLE.
         *
         * The picker above reads a LIST of application kinds — social, chat,
         * booking, pos… — and anything not on it lands on `items`. That list
         * grows with the world; his sentence does not wait for it. Measured on
         * the freight request: nine tables were designed and mounted correctly,
         * and the interface built on top of them still called `/api/items`,
         * a table that holds nothing he asked about. The database was right and
         * the front door pointed at the wrong room.
         *
         * So when the picker had NOTHING to go on and the request described its
         * own system, the first table of that system becomes the primary one.
         * The name comes from his words, not from a list somebody has to extend
         * — and the `model.filter(e => e.key !== resource)` below then keeps it
         * from being defined twice, which is the rule that already existed for
         * a declared table colliding with the built-in one.
         *
         * A request that named its kind keeps that kind: a chat app still
         * stores `messages`, because the picker was not guessing there.
         *
         * THE TEST IS NOT «did the picker fall back», IT IS «is the picker's
         * answer part of the system». Measured: the freight sentence never
         * reached the fallback at all — «المستودعات» made it read as an
         * INVENTORY app, so the picker confidently returned `items`, one word
         * matched out of eight domains. A single keyword cannot outrank a
         * system the request spelled out, so the primary table is replaced
         * exactly when the picker's answer is not one of the tables being
         * built. A restaurant keeps `dishes` and its seed menu, because
         * `dishes` IS in the model.
         */
        const primarySelection = selectApiPrimary(appKind, picked, designed, request);
        const promoted = primarySelection.promoted;
        const resource = primarySelection.resource;
        const labelAr = primarySelection.labelAr;
        // A described system starts EMPTY. Seeding «عنصر تجريبي أول» into
        // `shipments` would be fabricated data wearing his table's name.
        const catalogueSeeds = promoted ? [] : picked.seeds;
        /**
         * A PROMOTED TABLE BRINGS ITS OWN COLUMNS.
         *
         * `apiColumnsForRequest` reads the WHOLE request, which is right for a
         * table the request is entirely about and wrong for one table out of
         * nine. Measured: promoting `animals` in the clinic request gave it the
         * columns derived from the sentence as a whole — appointments and all —
         * so a write of `{name: 'Loop-proof cat'}` was refused with
         * `date_required`. The table existed, was reachable, and could not be
         * written to.
         *
         * The model already inferred what an `animals` row is. That is what the
         * table is built from.
         */
        const promotedColumns = promoted ? columnsFromFields((promoted as any).fields || []) : [];
        const primaryDesignedColumns = apiPrimaryColumnsForApp(appKind, resource, designed);
        const columns = isProductivity
            ? productivityNotesColumns
            : (primaryDesignedColumns.length
                ? primaryDesignedColumns
                : (promoted && promotedColumns.length ? promotedColumns : requestColumns));
        if (primaryDesignedColumns.length) {
            term(`data model: /api/${resource} uses its finance contract columns — ${primaryDesignedColumns.map(c => c.key).join(', ')}`);
        }
        if (promoted && promotedColumns.length) {
            term(`data model: /api/${resource} carries its own columns — ${promotedColumns.map(c => c.key).join(', ')}`);
        }
        if (promoted) {
            term(`data model: the request describes its own system — the primary table is /api/${resource}, not the generic /api/items`);
            if (sessionId) {
                broadcastThinkingDetail(sessionId, isAr
                    ? `🗂️ الجدول الأساسي من طلبك نفسه: /api/${resource} — لا /api/items`
                    : `🗂️ The primary table comes from your own request: /api/${resource} — not /api/items`);
            }
        }

        /**
         * …AND A SYSTEM HE DESCRIBED IS NOT A PARENT/CHILD PAIR.
         *
         * The rule above — «the declared tables are the tables» — was right and
         * too narrow: it only recognised a declaration carrying the literal
         * word «الجداول». Measured on an eleven-domain freight sentence, which
         * declares nothing under that label but describes nine tables in plain
         * words: the model designed all nine, and then a two-table
         * suppliers/items pattern replaced them, so the delivered database held
         * `suppliers` and `items` and not one word he wrote.
         *
         * The relation shortcut earns its place on a request that names a
         * parent and its children and nothing else. Once the request has
         * described a system of its own, that system IS the answer.
         */
        const relation = (declaredForRelation || designed.length >= 3)
            ? null
            : apiRelationForRequest(request);
        if (!relation && !declaredForRelation && designed.length >= 3) {
            term(`data model: ${designed.length} tables described by the request — the parent/child shortcut is not used`);
        }
        /**
         * A DECLARED TABLE THAT IS ALREADY THE SYSTEM'S OWN PRIMARY TABLE.
         *
         * `alreadyOwned` below does exactly this for `orders`, and the primary
         * table needed the same rule. «Tables: bookings, clients» on a booking
         * system produced TWO definitions of `bookings`: the built-in one in
         * db.js (name, phone, service, date…) and a second one in the model
         * (title, date, time, status) — both mounted on `/api/bookings`, the
         * generic mount registered first and therefore winning.
         *
         * So a write shaped for the real table was validated against the other
         * one, answered 400, and the build reported «live proof → FAILED» on a
         * server that was working. One name cannot mean two tables; the
         * built-in one is the one with the CRUD, the auth and the ownership
         * rules, so it keeps the name — and Joe says so instead of silently
         * dropping a word the user typed.
         */
        const collided = designed.filter((e: any) => e.key === resource).map((e: any) => e.key);
        const productivityModel = [{
            key: 'tasks', ar: 'المهام', en: 'Tasks', belongsTo: null,
            fields: productivityTaskColumns.map((c) => ({ key: c.key, type: c.type === 'INT' ? 'number' : 'text', required: c.required })),
        }];
        // Do not let a free-form inference result turn a Notes + Tasks app into
        // dates/persistences. For every other domain the general designer stays
        // the source of truth exactly as before.
        const explicitKeys = new Set(primarySelection.explicitKeys);
        const model = isProductivity
            ? productivityModel
            : appKind === 'finance'
                ? designed.filter((e: any) => e.key !== resource)
                : designed.filter((e: any) => {
                    const key = String(e?.key || '').toLowerCase();
                    return key !== String(resource || '').toLowerCase() && explicitKeys.has(key);
                });
        if (collided.length) {
            term(`data model: ${collided.join(', ')} — already the system's own table, not regenerated`);
            if (sessionId) {
                broadcastThinkingDetail(sessionId, isAr
                    ? `ℹ️ «${collided.join('، ')}» هو جدول النظام الأساسي أصلاً (/api/${resource}) — لم أُكرّره`
                    : `ℹ️ "${collided.join(', ')}" is already the system's own table (/api/${resource}) — not duplicated`);
            }
        }
        if (model.length) {
            if (isProductivity) term('data model: productivity exposes /api/notes and /api/tasks with shared CRUD fields');
            if (sessionId) broadcastThinkingDetail(sessionId, describeModel(model, isAr));
        }
        /**
         * AND A TABLE HE NAMED THAT THE SYSTEM ALREADY OWNS IS SAID OUT LOUD.
         *
         * He asked for «النباتات والموردون والطلبيات». Orders is not generated,
         * because every API this tool builds already serves `/api/orders` — a
         * second table with that name is a table nobody can reach. Silently
         * dropping the word would read as «you ignored a third of my request».
         */
        const { alreadyOwned } = require('../../../core/design/named-entities');
        const owned: string[] = alreadyOwned(request);
        if (owned.length) {
            term(`data model: ${owned.join(', ')} — already served by the built-in table, not regenerated`);
            if (sessionId) {
                broadcastThinkingDetail(sessionId, isAr
                    ? `ℹ️ ${owned.join(' و')} موجودة أصلاً في النظام (جدول مدمج على /api/orders) — لم أُكرّرها`
                    : `ℹ️ ${owned.join(', ')} already exists as a built-in table (/api/orders) — not duplicated`);
            }
        }
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
        /**
         * A NEW BUILD DOES NOT INHERIT AN OLD DATABASE.
         *
         * From his delivery:
         *
         *     Owner account: owner@myapp.local — the password is the OLD one.
         *     This project was built over an existing database, so the account
         *     was not re-created and a fresh password would not work.
         *
         * That paragraph is honest, and it should never have needed to exist.
         * A build lands on `api-<brand>`, and «MyApp» is the brand of every
         * unnamed English request — so his second build inherited the first
         * one's data.db: its rows, its owner, and a password he no longer had.
         * A password that cannot be used is not a credential, it is an
         * apology.
         *
         * A fresh build gets a fresh folder. The old one is left exactly where
         * it is — its data is his, and deleting it silently would be worse
         * than reusing it.
         */
        let inheritedFrom = '';
        if (fs.existsSync(path.join(proj, 'data.db'))) {
            inheritedFrom = proj;
            for (let n = 2; n < 50; n++) {
                const candidate = path.join(root, `${path.basename(proj)}-${n}`);
                if (!fs.existsSync(path.join(candidate, 'data.db'))) { proj = candidate; break; }
            }
            term(`fresh build: ${path.basename(inheritedFrom)} already carries a database — building in ${path.basename(proj)} instead, and leaving the old one untouched`);
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
            /**
             * A FEED IS NOT THE WHOLE PLATFORM — «Groups Pages Messaging Ads».
             *
             * His twelve-feature request produced ONE table and a paragraph
             * listing eleven things Joe had not built. Four of the twelve are
             * rows with fields and a lifecycle, and the machinery to serve
             * them has existed for weeks — the feed branch simply never used
             * it. It does now: the same entity tables, the same accounts, the
             * same roles as every other system Joe builds.
             */
            'package.json': filePackageJson(brand),
            'server.js': filePostsServerJs(brand, model),
            'db.js': filePostsDbJs(),
            ...(model.length ? { 'entities.js': fileEntitiesJs(model) } : {}),
            'auth.js': fileAuthJs(),
            'seed.js': fileSeedJs([], { email: ownerEmail, salt: ownerSalt, hash: ownerHash }),
            'README.md': filePostsReadme(brand),
            '.gitignore': 'node_modules\ndata.db\ndata.json\n.auth-secret\n',
        } : {
            'package.json': filePackageJson(brand),
            'server.js': fileServerJs(resource, brand, path.basename(proj), relation, model),
            'db.js': fileDbJs(resource, columns, relation),
            ...(model.length ? { 'entities.js': fileEntitiesJs(model) } : {}),
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
            /**
             * THE SHELL HE CAN SEE — SAME AS THE INTERFACE BUILD.
             *
             * The install ran here before and printed its output with no
             * prompt above it, so the panel filled with npm's chatter attached
             * to no command. The session prints the directory and the tool
             * versions first, echoes each command before it spawns, and closes
             * it with an exit code and a duration.
             */
            const shell = openTerminal(term);
            await shell.open(isAr ? 'طرفية جو — بناء الخادم' : 'Joe\'s terminal — building the server', proj);
            const instRun = await shell.run('npm', ['install', '--no-audit', '--no-fund'], { cwd: proj, timeout: 240_000 });
            const inst = instRun.missing ? -1 : instRun.timedOut ? -2 : (instRun.exitCode as number);
            npmMissing = inst === -1;
            installed = inst === 0;
            shell.note(installed
                ? 'packages installed — the server can boot now'
                : npmMissing ? 'npm is not on this machine — the project is written, but nothing can run here'
                    : `install did not finish (exit ${inst})`);

            if (installed) {
                if (sessionId) broadcastThinkingDetail(sessionId, isAr ? '🚀 أشغّل الخادم وأثبت كتابة/قراءة حقيقية…' : '🚀 Booting the server for a real write/read proof…');
                const port = 4100 + Math.floor(Math.random() * 400);
                let child: { done: Promise<any>; kill: () => void } | null = null;
                try {
                    let upResolve: (v: boolean) => void = () => { /* set below */ };
                    const upPromise = new Promise<boolean>((resolve) => { upResolve = resolve; });
                    const upTimer = setTimeout(() => upResolve(false), 15_000);
                    // A long-running process cannot be awaited like a command,
                    // but it must still be ANNOUNCED the same way — otherwise
                    // the server's own log appears under no command at all.
                    term(`${path.basename(proj)} $ node server.js   # PORT=${port}`);
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
        // Keep the session's React scaffold ownership separate from the API
        // artifact.  The API is often built after scaffold_project; replacing
        // the single registry entry used to erase the scaffold directory and
        // force ReactProjectTool into a sibling (react-<brand>), which made
        // build, run, and QA inspect different projects.
        const previousProject = projects[sessionKey];
        const currentPipelineRunId = String(context?.runId || '').trim();
        const previousPipelineRunId = String(previousProject?.pipelineRunId || '').trim();
        const samePipelineHandoff = !!currentPipelineRunId && currentPipelineRunId === previousPipelineRunId;
        const inheritedScaffoldDir = samePipelineHandoff && previousProject?.type === 'scaffold' && typeof previousProject?.dir === 'string'
            ? previousProject.dir
            : samePipelineHandoff && typeof previousProject?.scaffoldDir === 'string' ? previousProject.scaffoldDir : '';
        // resource + port ride along so a LATER react build in this session
        // can link itself to this API (the full-stack chain).
        // The model rides along: the interface builder generates one admin screen
        // per table from the SAME design, and asking the LLM a second time for
        // the same answer would be both slower and free to disagree with itself.
        /**
         * THE MODEL THE INTERFACE RECEIVES IS THE WHOLE SYSTEM.
         *
         * `model` was filtered above so the promoted primary table is not
         * generated twice in entities.js — right for the SERVER's files, wrong
         * as the record handed onward: the interface builds its screens from
         * this entry, and a primary table absent from it is a table the server
         * serves that no screen anywhere lets anyone touch. Measured on the
         * freight pair: `clients` promoted, served at /api/clients — and the
         * interface managed `shipments` with admin screens for the rest,
         * clients reachable only by curl. The primary rides at the HEAD, so
         * the interface's main screen manages exactly what the server calls
         * primary.
         */
        const handedModel = promoted ? [promoted, ...model] : model;
        writeJoeProject(sessionKey, {
            dir: proj, type: 'api', brand, resource, port: 4100, updatedAt: Date.now(),
            lastRequest: request.slice(0, 80),
            ...(inheritedScaffoldDir ? { scaffoldDir: inheritedScaffoldDir } : {}),
            ...(appKind ? { appKind } : {}),
            ...(handedModel.length ? { model: handedModel } : {}),
            // Runtime-only handoff for the immediately following React build.
            // page-store strips this field before persistence; the plaintext
            // password remains out of every generated file and database record.
            runtimeAuth: {
                email: ownerEmail,
                password: ownerPassword,
                loginPath: '/api/auth/login',
                tokenStorageKey: `joe-admin-token:${brand || 'app'}`,
                route: '#/admin',
            },
        }, currentPipelineRunId);
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

${model.length ? `🗂️ جداول النظام (${model.length}) — لكلٍّ منها CRUD كامل ومسار خاص:
${model.map((e: any) => `   • ${e.ar} → /api/${e.key}${e.belongsTo ? ` (مرتبط بـ ${e.belongsTo.entity} عبر ${e.belongsTo.key} — رابط لا يتدلّى)` : ''}`).join('\n')}
` : ''}
🧭 مسارات ${labelAr}:
   عامّة للزوار: GET /api/${resource} · GET /api/${resource}/:id · POST /api/orders · GET /api/health
   محميّة لك: POST/PUT/DELETE /api/${resource} · GET /api/orders (فيها أسماء العملاء وأرقامهم)
   الدخول: POST /api/auth/login ثم أرسل \`Authorization: Bearer <token>\`
   أمثلة curl جاهزة داخل README.md

👥 فريقك — النظام لم يعد لشخص واحد:
${describeRoles(true)}
   إنشاء حساب: POST /api/auth/users {email, role} — كلمة مروره تُولَّد وتظهر **مرة واحدة**
   الأدوار: GET · PUT · DELETE /api/auth/users — للمالك وحده (غيره يُجاب 403)
   ⚠️ الموظّف لا يرى صفوف غيره ولا يلمسها (403 not_your_row)، والصفوف المكتوبة
      قبل وجود الفريق تبقى للمالك — لا يرثها أحد بالصدفة.
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
${model.length ? `System tables (${model.length}), each with full CRUD:
${model.map((e: any) => `   • ${e.en} → /api/${e.key}${e.belongsTo ? ` (linked to ${e.belongsTo.entity} by ${e.belongsTo.key} — a key that cannot dangle)` : ''}`).join('\n')}
` : ''}Public: GET /api/${resource} · POST /api/orders · GET /api/health
Protected (Bearer token from POST /api/auth/login): catalogue writes · GET /api/orders

Team — three roles, accounts made from inside the system:
${describeRoles(false)}
   POST /api/auth/users {email, role} — the password is generated and shown ONCE.
   GET · PUT · DELETE /api/auth/users — owner only (403 for anybody else).`;

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
