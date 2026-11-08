/**
 * THE OWNER'S PHONES, LINKED THROUGH THE JOE APP: ANY ANDROID, FROM ANYWHERE.
 *
 * The owner, 2026-11-08: «why doesn't Joe work with every phone? … when Joe is
 * on a domain, can it work on the phone or tablet I open it from and control
 * it?» A cable needs the maker's driver (his Samsung had none) and works only
 * beside this computer; a browser page may not touch the phone it runs on.
 * The Joe app, installed once on any Android phone or tablet and allowed once
 * (accessibility, notifications), calls Joe by itself over the internet, the
 * way a linked computer does (linked-computers.ts).
 *
 * Linking: the owner asks Joe for a code (six digits, ten minutes, once). In
 * the app he types Joe's address and that code; the app calls in with it, and
 * Joe answers with the phone's id and key. Only the key's SHA-256 is kept here
 * (data/linked-phones.json, JOE_LINKED_PHONES_FILE to move it; never written
 * under a test unless named); the key lives only in the app. Forgetting a
 * phone deletes its record, and only a forgotten id is told to unlink itself.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { nameKey } from './linked-computers';

export interface KeptPhone {
    id: string;
    ownerId: string;
    name: string;
    keyHash: string;
    createdAt: number;
    lastSeen: number;
    model?: string;
    android?: string;
}

interface Store { phones: KeptPhone[]; forgotten: Array<{ id: string; at: number }> }

let cache: Store | null = null;
let storeError: string | null = null;

export class PhoneStoreError extends Error {
    readonly code = 'phone_store_unreadable';
    constructor(message: string) { super(message); this.name = 'PhoneStoreError'; }
}

function storeFile(): string | null {
    if (process.env.JOE_LINKED_PHONES_FILE) return process.env.JOE_LINKED_PHONES_FILE;
    if (process.env.JEST_WORKER_ID) return null;
    return path.join(process.cwd(), 'data', 'linked-phones.json');
}

function load(): Store | null {
    if (cache) return cache;
    const f = storeFile();
    if (!f || !fs.existsSync(f)) { storeError = null; return (cache = { phones: [], forgotten: [] }); }
    try {
        const raw = fs.readFileSync(f, 'utf8').replace(/^﻿/u, '');
        const j = raw.trim() ? JSON.parse(raw) : {};
        if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error('it is not a record of linked phones');
        storeError = null;
        return (cache = {
            phones: Array.isArray(j.phones) ? j.phones.filter((p: any) => p && typeof p.id === 'string' && typeof p.keyHash === 'string') : [],
            forgotten: Array.isArray(j.forgotten) ? j.forgotten.filter((x: any) => x && typeof x.id === 'string') : [],
        });
    } catch (e: any) {
        //  On disk but unreadable this moment: nothing is treated as «empty» (that would unlink
        //  every phone), and nothing new is handed out until it reads again.
        storeError = `${f} cannot be read (${String(e?.message || e).slice(0, 200)})`;
        return null;
    }
}

function save(strict: boolean): void {
    const f = storeFile();
    if (!f || !cache) return;
    try {
        fs.mkdirSync(path.dirname(f), { recursive: true });
        const tmp = `${f}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(cache, null, 1));
        fs.renameSync(tmp, f);
    } catch (e: any) {
        if (strict) throw new PhoneStoreError(`The record of linked phones (${f}) could not be saved (${String(e?.message || e).slice(0, 200)}): nothing was changed.`);
    }
}

function forChange(): Store {
    const s = load();
    if (!s) throw new PhoneStoreError(`The record of the owner's linked phones ${storeError ? `(${storeError})` : 'cannot be read'}: nothing was changed.`);
    return s;
}

const hash = (key: string) => crypto.createHash('sha256').update(String(key)).digest('hex');
const clean = (s: unknown, max: number) => String(s ?? '').replace(/[\u0000-\u001f]/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, max);

export function reloadLinkedPhones(): void { cache = null; storeError = null; pairings.clear(); }

/* ───────────── pairing codes: six digits, ten minutes, once ───────────── */

const PAIR_MS = 10 * 60_000;
const pairings = new Map<string, { ownerId: string; name: string; until: number }>();

/** A new six-digit code for this owner's phone (the name he chose, or the phone's model later). */
export function newPhonePairing(ownerId: string, name = '', now = Date.now()): { code: string; until: number } {
    for (const [c, p] of pairings) if (p.until < now) pairings.delete(c);
    let code = '';
    do { code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0'); } while (pairings.has(code));
    pairings.set(code, { ownerId, name: clean(name, 60), until: now + PAIR_MS });
    return { code, until: now + PAIR_MS };
}

export function isPhonePairingWaiting(code: string, now = Date.now()): boolean {
    const p = pairings.get(String(code || '').trim());
    return !!p && p.until >= now;
}

/**
 * The app called in with this code: the phone is kept under the owner's name
 * for it (or its model), and its id and key returned — once. Null for a code
 * not waiting. A PhoneStoreError when it cannot be saved: no key is handed out
 * that a restart forgets.
 */
export function claimPhonePairing(code: string, hello: { model?: unknown; android?: unknown; name?: unknown } = {}, now = Date.now()): { id: string; key: string; name: string; ownerId: string } | null {
    const c = String(code || '').trim();
    const p = pairings.get(c);
    if (!p || p.until < now) { pairings.delete(c); return null; }
    const s = forChange();
    pairings.delete(c);
    const base = p.name || clean(hello.name, 60) || clean(hello.model, 60) || 'phone';
    const taken = new Set(s.phones.filter(x => x.ownerId === p.ownerId).map(x => nameKey(x.name)));
    let name = base;
    for (let n = 2; taken.has(nameKey(name)); n++) name = `${base.slice(0, 56)} ${n}`;
    const id = crypto.randomBytes(8).toString('hex');
    const key = crypto.randomBytes(32).toString('hex');
    const rec: KeptPhone = { id, ownerId: p.ownerId, name, keyHash: hash(key), createdAt: now, lastSeen: now, ...(hello.model ? { model: clean(hello.model, 80) } : {}), ...(hello.android ? { android: clean(hello.android, 20) } : {}) };
    s.phones.push(rec);
    try { save(true); } catch (e) { s.phones = s.phones.filter(x => x !== rec); throw e; }
    return { id, key, name, ownerId: p.ownerId };
}

/* ───────────── the kept phones ───────────── */

export function verifyPhone(id: string, key: string): KeptPhone | null {
    const p = load()?.phones.find(x => x.id === String(id || ''));
    if (!p || !key) return null;
    const a = Buffer.from(p.keyHash, 'hex');
    const b = Buffer.from(hash(key), 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b) ? p : null;
}

export function isKeptPhoneId(id: string): boolean {
    return !!load()?.phones.some(x => x.id === String(id || ''));
}

export function isForgottenPhone(id: string): boolean {
    return !!load()?.forgotten.some(x => x.id === String(id || ''));
}

export function sawPhone(id: string, hello: { model?: unknown; android?: unknown } = {}, now = Date.now()): void {
    const p = load()?.phones.find(x => x.id === id);
    if (!p) return;
    p.lastSeen = now;
    if (hello.model) p.model = clean(hello.model, 80);
    if (hello.android) p.android = clean(hello.android, 20);
    save(false);
}

export function keptPhones(ownerId: string): KeptPhone[] {
    return (load()?.phones || []).filter(p => p.ownerId === ownerId).map(p => ({ ...p }));
}

/** The owner's phone by its exact id or exact name (nameKey); nothing looser — this is what forgetting goes by. */
export function exactKeptPhone(ownerId: string, idOrName: string): KeptPhone | null {
    const raw = String(idOrName ?? '').trim().toLowerCase().replace(/^app:/u, '');
    if (!raw) return null;
    const mine = (load()?.phones || []).filter(p => p.ownerId === ownerId);
    const byId = mine.find(p => p.id === raw);
    if (byId) return byId;
    const key = nameKey(idOrName);
    const byName = key ? mine.filter(p => nameKey(p.name) === key) : [];
    return byName.length === 1 ? byName[0] : null;
}

export function forgetPhone(ownerId: string, idOrExactName: string, now = Date.now()): KeptPhone | null {
    const p = exactKeptPhone(ownerId, idOrExactName);
    if (!p) return null;
    const s = forChange();
    const before = { phones: s.phones, forgotten: s.forgotten };
    s.phones = s.phones.filter(x => x.id !== p.id);
    s.forgotten = [...s.forgotten.filter(x => x.id !== p.id), { id: p.id, at: now }];
    try { save(true); } catch (e) { s.phones = before.phones; s.forgotten = before.forgotten; throw e; }
    return p;
}
