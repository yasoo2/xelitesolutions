/**
 * ⛔ «EACH STAFF MEMBER ONLY SEES THEIR OWN RECORDS» IS MEASURED, NOT ASSUMED.
 *
 * The 500-prompt exam, 2026-11-03: every full-stack prompt (50 of 500) ends
 * with that rule, and Joe had no instrument for it. The coverage check named
 * it «per-user record isolation (not measured)», an unmeasured requirement
 * never passes, and P151 was refused five times for a rule the builder could
 * not make measurable whatever it wrote. A requirement no build can satisfy
 * is Joe's defect, not the builder's.
 *
 * The builder declares only the DOORS, in `joe-isolation.json` at the project
 * root: how to sign in, two accounts of the role that must see only its own
 * records, and where a record is created and listed. Joe walks through them
 * itself, on the live server project_run started:
 *
 *   1. each account signs in (registered first, when a register door is given);
 *   2. A creates a record carrying a marker no one else could have written;
 *   3. A lists the records and must see it;
 *   4. B lists the records and must NOT see it, and B opening it by its id
 *      must not show it;
 *   5. a visitor who is not signed in must not see it either.
 *
 * The declaration is never evidence; only the answers are. A wrong
 * declaration (an admin account, a path that is not served) fails with what
 * was answered, which the builder can act on. Every request goes to the run's
 * own live address: a path is joined to it, and an absolute URL is refused.
 */
import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
import crypto from 'crypto';
import { hisWordsFor, requestedRecords } from './request-coverage';

export const ISOLATION_FILE = 'joe-isolation.json';

/** True when the request names a rule only this probe can measure. */
export function asksPerUserIsolation(request: string): boolean {
    try { return (requestedRecords(request, { backendRequested: true }).capabilities || []).some(c => c.startsWith('per-user record isolation')); }
    catch { return false; }
}

/**
 * The records the request names, by their route words («students»), so a
 * declaration can be held to them: the probe measures one of HIS records,
 * never a route made up for Joe.
 */
export function requestedRecordWords(request: string): string[] {
    try {
        const entities = requestedRecords(request, { backendRequested: true }).entities;
        return Array.from(new Set(entities.flatMap(e => [e.key, ...String(e.en || '').toLowerCase().split(/[^a-z0-9]+/u), ...hisWordsFor(e).split(' ')])
            .map(w => String(w || '').trim().toLowerCase()).filter(w => w.length >= 3)));
    } catch { return []; }
}

/** What the builder is told, in the first message, when the request names the rule. */
export function isolationBrief(request = ''): string {
    //  The example names one of the request's own records. A fixed example
    //  («/api/patients») was copied into a school system on 2026-11-03 (P152),
    //  which added /api/patients as an alias of its students to match it.
    const record = requestedRecords(request, { backendRequested: true }).entities[0]?.key || 'records';
    return [
        `The request says each user sees only their own records. Joe measures that itself on the running server, so ship \`${ISOLATION_FILE}\` at the project root naming the doors (paths are relative to the server's address; "{email}", "{password}" and "{marker}" are filled in by Joe):`,
        '{',
        '  "register": { "path": "/api/auth/register", "body": { "email": "{email}", "password": "{password}", "name": "{email}" } },',
        '  "login": { "path": "/api/auth/login", "body": { "email": "{email}", "password": "{password}" }, "token": "token" },',
        '  "users": [ { "email": "staff.a@example.test", "password": "Passw0rd!a" }, { "email": "staff.b@example.test", "password": "Passw0rd!b" } ],',
        `  "records": { "create": { "path": "/api/${record}", "body": { "name": "{marker}" } }, "list": "/api/${record}" }`,
        '}',
        'Use the routes your project already serves, for one of the records the request names, with the fields its create route really requires; never add a route for Joe. "register" is optional when the two accounts already exist (seeded). Both users must have the role that sees only its own records (staff, not admin). "token" names the field of the login answer that holds the bearer token; leave it out when the server signs in with a cookie. Joe signs in as each user, creates a record as the first, and checks that the second user and a signed-out visitor cannot see it.',
    ].join('\n');
}

interface Door { path: string; body?: Record<string, unknown> }
export interface IsolationDeclaration {
    register?: Door;
    login: Door & { token?: string };
    users: Array<{ email?: string; username?: string; password: string }>;
    records: { create: Door; list: string };
}

export interface IsolationResult {
    ok: boolean;
    /** Why it failed or could not be measured, in a sentence the builder can act on. */
    error?: string;
    /** What was asked and answered, step by step. */
    evidence: string[];
}

/**
 * Reads the declaration from the first delivered root that has one. With the
 * request's record words, the declared list must be the route of one of them.
 */
export function readIsolationDeclaration(roots: string[], recordWords: string[] = []): { declaration?: IsolationDeclaration; file?: string; error?: string } {
    for (const root of roots) {
        const file = path.join(root, ISOLATION_FILE);
        if (!fs.existsSync(file)) continue;
        let raw: any;
        try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); }
        catch (e: any) { return { file, error: `${ISOLATION_FILE} is not valid JSON: ${String(e?.message || e).slice(0, 160)}` }; }
        const door = (d: any) => d && typeof d === 'object' && typeof d.path === 'string' && d.path.startsWith('/');
        const problems: string[] = [];
        if (raw?.register !== undefined && !door(raw.register)) problems.push('"register" needs a "path" that starts with "/"');
        if (!door(raw?.login)) problems.push('"login" needs a "path" that starts with "/" and a "body"');
        if (!Array.isArray(raw?.users) || raw.users.length < 2 || raw.users.slice(0, 2).some((u: any) => !u || typeof u.password !== 'string' || !(u.email || u.username)))
            problems.push('"users" needs two accounts, each with "email" (or "username") and "password"');
        if (!door(raw?.records?.create)) problems.push('"records.create" needs a "path" that starts with "/" and a "body" holding "{marker}"');
        else if (!JSON.stringify(raw.records.create.body ?? {}).includes('{marker}')) problems.push('"records.create.body" must hold "{marker}" in a field the list shows');
        if (typeof raw?.records?.list !== 'string' || !raw.records.list.startsWith('/')) problems.push('"records.list" needs a path that starts with "/"');
        if (!problems.length && recordWords.length) {
            const segments = String(raw.records.list).toLowerCase().split(/[^a-z0-9]+/u).filter(Boolean);
            if (!segments.some(s => recordWords.includes(s) || recordWords.includes(s.replace(/s$/u, '')) || recordWords.includes(`${s}s`))) {
                problems.push(`"records.list" is ${raw.records.list}, which is not the route of a record the request names (${recordWords.slice(0, 6).join(', ')}): declare the route your project serves for one of them`);
            }
        }
        if (problems.length) return { file, error: `${ISOLATION_FILE}: ${problems.join('; ')}` };
        return { declaration: raw as IsolationDeclaration, file };
    }
    return { error: `the request says each user sees only their own records, and Joe measures that on the running server through ${ISOLATION_FILE}, which the project does not have. Write it at the project root: the login door, two accounts of the role that sees only its own records, and where a record is created and listed (see the first message for its shape)` };
}

const fill = (value: unknown, vars: Record<string, string>): unknown => {
    if (typeof value === 'string') return value.replace(/\{(email|password|username|marker)\}/gu, (_m, k) => vars[k] ?? '');
    if (Array.isArray(value)) return value.map(v => fill(v, vars));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v, vars)]));
    return value;
};

const pick = (obj: any, dotted: string): unknown => dotted.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
const TOKEN_FIELDS = ['token', 'accessToken', 'access_token', 'jwt', 'data.token', 'data.accessToken', 'user.token'];
const ID_FIELDS = ['id', '_id', 'data.id', 'data._id', 'item.id', 'record.id'];

interface Session { label: string; token?: string; cookie?: string }

/**
 * The measurement. `base` is the live address project_run confirmed; every
 * request stays on it.
 */
export async function measureIsolation(base: string, decl: IsolationDeclaration, opts: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<IsolationResult> {
    const evidence: string[] = [];
    const origin = new URL(base);
    const url = (p: string) => {
        const u = new URL(p, origin);
        if (u.origin !== origin.origin) throw new Error(`${p} leaves the run's own server`);
        return u;
    };
    //  node:http, as probeServedResources: the same transport in the API
    //  process and in tests, no redirect followed, and a hard bound per answer.
    const call = (method: string, p: string, session?: Session, body?: unknown): Promise<{ status: number; text: string; json: any; cookie: string }> => new Promise((resolve, reject) => {
        const target = url(p);
        const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
        const headers: Record<string, string | number> = { accept: 'application/json' };
        if (payload) { headers['content-type'] = 'application/json'; headers['content-length'] = payload.length; }
        if (session?.token) headers.authorization = `Bearer ${session.token}`;
        if (session?.cookie) headers.cookie = session.cookie;
        if (opts.signal?.aborted) return reject(new Error('the run was cancelled'));
        const client = target.protocol === 'https:' ? https : http;
        const req = client.request(target, { method, headers, timeout: opts.timeoutMs ?? 10_000 }, res => {
            const chunks: Buffer[] = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                opts.signal?.removeEventListener('abort', onAbort);
                const text = Buffer.concat(chunks).toString('utf8');
                let json: any;
                try { json = text ? JSON.parse(text) : undefined; } catch { json = undefined; }
                const cookies = ([] as string[]).concat(res.headers['set-cookie'] || []);
                resolve({ status: res.statusCode || 0, text, json, cookie: cookies.map(c => c.split(';')[0]).filter(Boolean).join('; ') });
            });
            res.on('error', reject);
        });
        const onAbort = () => req.destroy(new Error('the run was cancelled'));
        opts.signal?.addEventListener('abort', onAbort, { once: true });
        req.on('timeout', () => req.destroy(new Error(`${method} ${p} gave no answer within ${Math.round((opts.timeoutMs ?? 10_000) / 1000)} s`)));
        req.on('error', e => { opts.signal?.removeEventListener('abort', onAbort); reject(e); });
        req.end(payload);
    });
    const fail = (error: string): IsolationResult => ({ ok: false, error, evidence });

    try {
        const sessions: Session[] = [];
        for (const [i, user] of decl.users.slice(0, 2).entries()) {
            const who = String(user.email || user.username);
            const label = i === 0 ? `A (${who})` : `B (${who})`;
            const vars = { email: String(user.email || ''), username: String(user.username || user.email || ''), password: user.password, marker: '' };
            if (decl.register) {
                const r = await call('POST', decl.register.path, undefined, fill(decl.register.body ?? {}, vars));
                evidence.push(`POST ${decl.register.path} as ${label} → ${r.status}`);
            }
            const login = await call('POST', decl.login.path, undefined, fill(decl.login.body ?? {}, vars));
            const token = String((decl.login.token ? pick(login.json, decl.login.token) : TOKEN_FIELDS.map(f => pick(login.json, f)).find(v => typeof v === 'string' && v)) || '') || undefined;
            evidence.push(`POST ${decl.login.path} as ${label} → ${login.status}${token ? ' with a token' : login.cookie ? ' with a session cookie' : ''}`);
            if (login.status >= 400 || (!token && !login.cookie)) {
                return fail(`${label} could not sign in at POST ${decl.login.path}: ${login.status} ${login.text.slice(0, 160) || '(empty answer)'}${!token && !login.cookie && login.status < 400 ? ' — the answer held no token and set no cookie' : ''}`);
            }
            sessions.push({ label, token, cookie: login.cookie || undefined });
        }
        const [a, b] = sessions;
        const marker = `joe-isolation-${crypto.randomBytes(5).toString('hex')}`;
        const created = await call('POST', decl.records.create.path, a, fill(decl.records.create.body ?? {}, { email: '', username: '', password: '', marker }));
        evidence.push(`POST ${decl.records.create.path} as ${a.label} with «${marker}» → ${created.status}`);
        if (created.status >= 400) return fail(`${a.label} could not create a record at POST ${decl.records.create.path}: ${created.status} ${created.text.slice(0, 200)}`);
        const id = ID_FIELDS.map(f => pick(created.json, f)).find(v => typeof v === 'string' || typeof v === 'number');

        const listA = await call('GET', decl.records.list, a);
        evidence.push(`GET ${decl.records.list} as ${a.label} → ${listA.status}, ${listA.text.includes(marker) ? 'shows' : 'does not show'} the record`);
        if (listA.status >= 400 || !listA.text.includes(marker)) {
            return fail(`${a.label} created «${marker}» but GET ${decl.records.list} as ${a.label} ${listA.status >= 400 ? `answered ${listA.status}` : 'does not show it'}: the list must show a user their own records`);
        }
        const listB = await call('GET', decl.records.list, b);
        evidence.push(`GET ${decl.records.list} as ${b.label} → ${listB.status}, ${listB.text.includes(marker) ? 'SHOWS' : 'does not show'} A's record`);
        if (listB.text.includes(marker)) return fail(`${b.label} sees ${a.label}'s record «${marker}» at GET ${decl.records.list}: each user must see only their own records`);
        if (id !== undefined) {
            const one = `${decl.records.list.replace(/\/+$/u, '')}/${encodeURIComponent(String(id))}`;
            const byId = await call('GET', one, b);
            evidence.push(`GET ${one} as ${b.label} → ${byId.status}`);
            if (byId.status < 400 && byId.text.includes(marker)) return fail(`${b.label} opens ${a.label}'s record by its id at GET ${one} (${byId.status}): a record must not open for another user`);
        }
        const anon = await call('GET', decl.records.list);
        evidence.push(`GET ${decl.records.list} signed out → ${anon.status}`);
        if (anon.status < 400 && anon.text.includes(marker)) return fail(`a visitor who is not signed in sees ${a.label}'s record «${marker}» at GET ${decl.records.list}`);
        return { ok: true, evidence };
    } catch (e: any) {
        return fail(`the isolation probe could not finish: ${String(e?.message || e).slice(0, 200)}`);
    }
}
