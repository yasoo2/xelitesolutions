/**
 * THE OWNER'S COMPUTERS, KEPT: A PERMANENT JOE LINK.
 *
 * The owner, 2026-11-08: «I have a computer in another city. How would Joe
 * know there is a computer there? I tell him: connect to my office computer —
 * how would I know its address, its name? That does not work.» A link that
 * needs someone at the other computer every time is no link to a computer
 * far away. So, the way every remote-control product works: the owner links
 * a computer ONCE, gives it a name («كمبيوتر المكتب»), and from then on it
 * starts with Windows, calls Joe by itself, and Joe knows it by that name —
 * on or off, from anywhere Joe is reachable.
 *
 * What is kept here, per computer: its id, its owner, the name he chose, a
 * hash of its key (the key itself lives only on that computer), and when it
 * was last seen. A key is 256 random bits; only its SHA-256 is stored, so
 * this file opens no computer. Forgetting a computer deletes its record: its
 * key is refused from then on, and its agent removes itself on that refusal.
 *
 * On disk in data/linked-computers.json (JOE_LINKED_COMPUTERS_FILE to move
 * it; never written under a test unless named), written atomically.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface KeptComputer {
    id: string;
    ownerId: string;
    name: string;
    keyHash: string;
    createdAt: number;
    lastSeen: number;
    os?: string;
    user?: string;
}

/** An id the owner forgot for good, with the day it happened: only these ids are told «forget». */
interface ForgottenLink { id: string; at: number; }

let cache: KeptComputer[] | null = null;
let forgottenCache: ForgottenLink[] | null = null;

function storeFile(): string | null {
    if (process.env.JOE_LINKED_COMPUTERS_FILE) return process.env.JOE_LINKED_COMPUTERS_FILE;
    if (process.env.JEST_WORKER_ID) return null;
    return path.join(process.cwd(), 'data', 'linked-computers.json');
}

function load(): KeptComputer[] {
    if (cache) return cache;
    const f = storeFile();
    if (!f) { forgottenCache = forgottenCache || []; return (cache = []); }
    let present = false;
    try { present = fs.existsSync(f); } catch { present = false; }
    if (!present) { forgottenCache = []; return (cache = []); }   // genuinely no store yet
    try {
        const j = JSON.parse(fs.readFileSync(f, 'utf8'));
        forgottenCache = Array.isArray(j?.forgotten)
            ? j.forgotten.filter((x: any) => x && typeof x.id === 'string').map((x: any) => ({ id: String(x.id), at: Number(x.at) || 0 }))
            : [];
        return (cache = Array.isArray(j?.computers)
            ? j.computers.filter((c: any) => c && typeof c.id === 'string' && typeof c.keyHash === 'string')
            : []);
    } catch {
        //  The store IS on disk but could not be read or parsed this moment — a transient read
        //  error, a half-written file caught mid-rename, a just-restored backup. Treating it as
        //  empty would make every kept id look unknown and could forget a still-linked computer
        //  (the owner's case, 2026-11-08). Do NOT cache «empty»: leave the cache unset so the next
        //  call retries, and report nothing kept for now rather than a false «empty».
        return [];
    }
}

/** The ids the owner forgot for good; loaded from the same store, safe on a transient read failure. */
function forgottenList(): ForgottenLink[] {
    if (forgottenCache) return forgottenCache;
    load();   // populates forgottenCache alongside cache (and leaves it unset on a read failure)
    return forgottenCache || [];
}

function save(): void {
    const f = storeFile();
    if (!f || !cache) return;
    try {
        fs.mkdirSync(path.dirname(f), { recursive: true });
        const tmp = `${f}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify({ computers: cache, forgotten: forgottenCache || [] }, null, 1));
        fs.renameSync(tmp, f);
    } catch { /* the link still works this session; the record waits for the next write */ }
}

const hash = (key: string) => crypto.createHash('sha256').update(String(key)).digest('hex');
const clean = (s: unknown, max: number) => String(s ?? '').replace(/[\u0000-\u001f]/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, max);

/** Re-reads the file on the next call (a test, or after a restart in place). */
export function reloadKeptComputers(): void { cache = null; forgottenCache = null; }

/**
 * A new kept computer for this owner under the name he chose (made unique
 * among his computers). Returns its id and its key — the key is given once,
 * to travel to that computer, and is never kept here.
 */
export function keepComputer(ownerId: string, wantedName: string, now = Date.now()): { id: string; name: string; key: string } {
    const list = load();
    const base = clean(wantedName, 60) || 'computer';
    const taken = new Set(list.filter(c => c.ownerId === ownerId).map(c => c.name.toLowerCase()));
    let name = base;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base.slice(0, 56)} ${n}`;
    const id = crypto.randomBytes(8).toString('hex');
    const key = crypto.randomBytes(32).toString('hex');
    list.push({ id, ownerId, name, keyHash: hash(key), createdAt: now, lastSeen: 0 });
    save();
    return { id, name, key };
}

/** The kept computer this id and key open, or null. Compared in constant time. */
export function verifyComputer(id: string, key: string): KeptComputer | null {
    const c = load().find(x => x.id === String(id || ''));
    if (!c || !key) return null;
    const a = Buffer.from(c.keyHash, 'hex');
    const b = Buffer.from(hash(key), 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b) ? c : null;
}

/** True while this id is a kept computer (any owner's): it may then say its key. */
export function verifyComputerId(id: string): boolean {
    return load().some(x => x.id === String(id || ''));
}

/** It called in: when, and what it says it is. */
export function sawComputer(id: string, hello: { os?: unknown; user?: unknown } = {}, now = Date.now()): void {
    const c = load().find(x => x.id === id);
    if (!c) return;
    c.lastSeen = now;
    if (hello.os) c.os = clean(hello.os, 80);
    if (hello.user) c.user = clean(hello.user, 60);
    save();
}

export function keptComputers(ownerId: string): KeptComputer[] {
    return load().filter(c => c.ownerId === ownerId).map(c => ({ ...c }));
}

/** The owner's kept computer by name or id (a name in any case, or a close one). */
export function findKeptComputer(ownerId: string, nameOrId: string): KeptComputer | null {
    const key = clean(nameOrId, 80).toLowerCase();
    if (!key) return null;
    const mine = load().filter(c => c.ownerId === ownerId);
    return mine.find(c => c.id === key) || mine.find(c => c.name.toLowerCase() === key)
        || mine.find(c => c.name.toLowerCase().includes(key) || key.includes(c.name.toLowerCase())) || null;
}

/** Forgets a computer for good: its key opens nothing from now on. */
export function forgetComputer(ownerId: string, nameOrId: string): KeptComputer | null {
    const c = findKeptComputer(ownerId, nameOrId);
    if (!c) return null;
    cache = load().filter(x => x.id !== c.id);
    //  Remember THIS id as forgotten, with the day. Only ids on this list are ever told to
    //  «forget» themselves; an id that is merely not found (a transient read failure, the store
    //  moved by process.cwd(), a restored backup) must keep its link (the owner's case,
    //  2026-11-08). The list is small — the owner's own computers — so it is kept whole.
    const fc = forgottenCache || (forgottenCache = []);
    if (!fc.some(x => x.id === c.id)) fc.push({ id: c.id, at: Date.now() });
    save();
    return c;
}

/** True when this id was forgotten for good: the socket may tell it, and only it, to remove itself. */
export function isForgotten(id: string): boolean {
    const key = String(id || '');
    return !!key && forgottenList().some(x => x.id === key);
}
