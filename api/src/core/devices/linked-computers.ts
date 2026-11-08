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
/** Why the store on disk could not be read, while it cannot; null when it reads or does not exist yet. */
let storeError: string | null = null;
let loggedError = '';

/**
 * The store cannot be read (or a new record cannot be saved) right now. Thrown
 * where a key would otherwise be handed out that no restart remembers.
 */
export class KeptStoreError extends Error {
    readonly code = 'kept_store_unreadable';
    constructor(message: string) { super(message); this.name = 'KeptStoreError'; }
}

function storeFile(): string | null {
    if (process.env.JOE_LINKED_COMPUTERS_FILE) return process.env.JOE_LINKED_COMPUTERS_FILE;
    if (process.env.JEST_WORKER_ID) return null;
    return path.join(process.cwd(), 'data', 'linked-computers.json');
}

/**
 * The store's text. An editor that saved the file added a byte-order mark
 * (UTF-8, or UTF-16 for Notepad's «Unicode»), and JSON.parse refused it: one
 * opened-and-saved file made every kept computer unknown (2026-11-08).
 */
function readStoreText(f: string): string {
    const b = fs.readFileSync(f);
    if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return b.subarray(3).toString('utf8');
    if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return b.subarray(2).toString('utf16le');
    if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff && b.length % 2 === 0) return Buffer.from(b.subarray(2)).swap16().toString('utf16le');
    return b.toString('utf8').replace(/^﻿/u, '');
}

function load(): KeptComputer[] {
    if (cache) return cache;
    const f = storeFile();
    if (!f) { storeError = null; forgottenCache = forgottenCache || []; return (cache = []); }
    let present = false;
    try { present = fs.existsSync(f); } catch { present = false; }
    if (!present) { storeError = null; forgottenCache = []; return (cache = []); }   // genuinely no store yet
    try {
        const text = readStoreText(f);
        //  An empty file holds nothing to lose: it is an empty store, not a broken one.
        const j = text.trim() ? JSON.parse(text) : {};
        //  Valid JSON of another shape is not a store of computers: saving over it would erase it.
        if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error('it is not a record of linked computers');
        forgottenCache = Array.isArray(j?.forgotten)
            ? j.forgotten.filter((x: any) => x && typeof x.id === 'string').map((x: any) => ({ id: String(x.id), at: Number(x.at) || 0 }))
            : [];
        storeError = null;
        return (cache = Array.isArray(j?.computers)
            ? j.computers.filter((c: any) => c && typeof c.id === 'string' && typeof c.keyHash === 'string')
            : []);
    } catch (e: any) {
        //  The store IS on disk but could not be read or parsed this moment — a transient read
        //  error, a half-written file caught mid-rename, a just-restored backup. Treating it as
        //  empty would make every kept id look unknown and could forget a still-linked computer
        //  (the owner's case, 2026-11-08). Do NOT cache «empty»: leave the cache unset so the next
        //  call retries, and report nothing kept for now rather than a false «empty».
        //  Said once per distinct reason (the socket asks on every call), and remembered so that
        //  pairing refuses instead of handing out a key nothing saves (keepComputer).
        storeError = `${f} cannot be read (${String(e?.message || e).slice(0, 200)})`;
        if (loggedError !== storeError) {
            loggedError = storeError;
            console.warn(`[LinkedComputers] ${storeError}: no computer can be linked for good, forgotten or let in by its key until it reads again`);
        }
        return [];
    }
}

/**
 * Why the record of kept computers cannot be read right now, or null when it
 * reads (or there is none yet). Pairing for good and forgetting refuse while
 * it says something: their change could not be saved.
 */
export function keptStoreProblem(): string | null {
    load();
    return cache ? null : storeError || 'the record of linked computers cannot be read';
}

/** The store, for a change that must reach the disk: a KeptStoreError while it cannot be read. */
function storeForChange(): KeptComputer[] {
    const list = load();
    if (!cache) throw new KeptStoreError(`The record of the owner's linked computers ${storeError ? `(${storeError})` : 'cannot be read'}: nothing was changed. Fix or move that file, then try again.`);
    return list;
}

/** The ids the owner forgot for good; loaded from the same store, safe on a transient read failure. */
function forgottenList(): ForgottenLink[] {
    if (forgottenCache) return forgottenCache;
    load();   // populates forgottenCache alongside cache (and leaves it unset on a read failure)
    return forgottenCache || [];
}

/**
 * Writes the store atomically. `strict`: a failure is thrown, for a change
 * that must survive a restart (a new key, a forget); otherwise it waits for
 * the next write (a «last seen» time).
 */
function save(strict = false): void {
    const f = storeFile();
    if (!f || !cache) return;
    try {
        fs.mkdirSync(path.dirname(f), { recursive: true });
        const tmp = `${f}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify({ computers: cache, forgotten: forgottenCache || [] }, null, 1));
        fs.renameSync(tmp, f);
    } catch (e: any) {
        if (strict) throw new KeptStoreError(`The record of the owner's linked computers (${f}) could not be saved (${String(e?.message || e).slice(0, 200)}): nothing was changed.`);
        /* the link still works this session; the record waits for the next write */
    }
}

const hash = (key: string) => crypto.createHash('sha256').update(String(key)).digest('hex');
const clean = (s: unknown, max: number) => String(s ?? '').replace(/[\u0000-\u001f]/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, max);

/**
 * A computer's name as the owner may type it again: the same name whatever
 * its case, its spaces, the quotes around it, and the Arabic letter forms he
 * may or may not type — أ إ آ ٱ as ا, ى and Persian ی as ي, ة as ه, Persian
 * ک as ك, Arabic-Indic digits as 0-9, the tatweel, the short vowels and the
 * invisible direction marks dropped. Two names with the same key are the
 * same name to him; forgetting takes nothing looser than this (device-link.ts).
 */
export function nameKey(s: unknown): string {
    return String(s ?? '').normalize('NFKC')
        .replace(/[​-‏‪-‮⁦-⁩﻿]/gu, '')
        .replace(/[ً-ٰٟـ]/gu, '')
        .replace(/[آأإٱ]/gu, 'ا')
        .replace(/[ىی]/gu, 'ي')
        .replace(/ة/gu, 'ه')
        .replace(/ک/gu, 'ك')
        .replace(/[٠-٩]/gu, d => String(d.charCodeAt(0) - 0x0660))
        .replace(/[۰-۹]/gu, d => String(d.charCodeAt(0) - 0x06F0))
        .replace(/\s+/gu, ' ')
        .replace(/^[\s«»"“”'‘’]+|[\s«»"“”'‘’]+$/gu, '')
        .toLowerCase();
}

/** Re-reads the file on the next call (a test, or after a restart in place). */
export function reloadKeptComputers(): void { cache = null; forgottenCache = null; storeError = null; }

/**
 * A new kept computer for this owner under the name he chose (made unique
 * among his computers). Returns its id and its key — the key is given once,
 * to travel to that computer, and is never kept here.
 *
 * Only once it is SAVED: while the store on disk cannot be read, or the new
 * record cannot be written, this throws a KeptStoreError and hands out
 * nothing. It used to return an id and a key that were never written (a BOM
 * an editor added was enough), the installer was served, and the agent was
 * refused with 4403 for ever after (2026-11-08).
 */
export function keepComputer(ownerId: string, wantedName: string, now = Date.now()): { id: string; name: string; key: string } {
    const list = storeForChange();
    const base = clean(wantedName, 60) || 'computer';
    const taken = new Set(list.filter(c => c.ownerId === ownerId).map(c => nameKey(c.name)));
    let name = base;
    for (let n = 2; taken.has(nameKey(name)); n++) name = `${base.slice(0, 56)} ${n}`;
    const id = crypto.randomBytes(8).toString('hex');
    const key = crypto.randomBytes(32).toString('hex');
    const record: KeptComputer = { id, ownerId, name, keyHash: hash(key), createdAt: now, lastSeen: 0 };
    list.push(record);
    try { save(true); } catch (e) {
        const i = list.indexOf(record);
        if (i >= 0) list.splice(i, 1);
        throw e;
    }
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

/**
 * The owner's kept computer by its exact id or its exact name (nameKey), or
 * null. Nothing looser: this is what forgetting goes by. A name two computers
 * share under nameKey is no answer either.
 */
export function exactKeptComputer(ownerId: string, idOrName: string): KeptComputer | null {
    const raw = String(idOrName ?? '').trim().toLowerCase();
    if (!raw) return null;
    const mine = load().filter(c => c.ownerId === ownerId);
    const byId = mine.find(c => c.id.toLowerCase() === raw);
    if (byId) return byId;
    const key = nameKey(idOrName);
    const byName = key ? mine.filter(c => nameKey(c.name) === key) : [];
    return byName.length === 1 ? byName[0] : null;
}

/**
 * Forgets a computer for good: its key opens nothing from now on. By its id
 * only — the caller resolved the owner's words to ONE computer already
 * (device-link.ts forgetExactly), so nothing here matches a name again: a
 * fuzzy re-match here once forgot «laptop» when he named «the office laptop»
 * (2026-11-08). A KeptStoreError when the change cannot reach the disk:
 * a forget that a restart undoes is no forget.
 */
export function forgetComputerById(ownerId: string, id: string): KeptComputer | null {
    const want = String(id ?? '').trim().toLowerCase();
    if (!want) return null;
    const list = storeForChange();
    const c = list.find(x => x.ownerId === ownerId && x.id.toLowerCase() === want);
    if (!c) return null;
    const before = { computers: cache, forgotten: forgottenCache };
    cache = list.filter(x => x.id !== c.id);
    //  Remember THIS id as forgotten, with the day. Only ids on this list are ever told to
    //  «forget» themselves; an id that is merely not found (a transient read failure, the store
    //  moved by process.cwd(), a restored backup) must keep its link (the owner's case,
    //  2026-11-08). The list is small — the owner's own computers — so it is kept whole.
    const fc = [...(forgottenCache || [])];
    if (!fc.some(x => x.id === c.id)) fc.push({ id: c.id, at: Date.now() });
    forgottenCache = fc;
    try { save(true); } catch (e) { cache = before.computers; forgottenCache = before.forgotten; throw e; }
    return c;
}

/** Forgets a computer for good by its exact id or exact name (exactKeptComputer); nothing looser. */
export function forgetComputer(ownerId: string, idOrExactName: string): KeptComputer | null {
    const c = exactKeptComputer(ownerId, idOrExactName);
    return c ? forgetComputerById(ownerId, c.id) : null;
}

/** True when this id was forgotten for good: the socket may tell it, and only it, to remove itself. */
export function isForgotten(id: string): boolean {
    const key = String(id || '');
    return !!key && forgottenList().some(x => x.id === key);
}
