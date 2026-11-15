/**
 * PATH 3, THE NO-WRITE WALK: NOTHING THE CHECKS DO IS SAVED IN THE OWNER'S LIVE APP.
 *
 * Design v13.3 §5. On a change run of an app whose data Joe cannot put back, the walk still reads everything —
 * pages, links, layout, field checks that need no submit — but writes nothing:
 *
 *   W2  every request other than GET / HEAD / OPTIONS is aborted inside the browser (`context.route`), except the
 *       one sign-in request of W7. The context must be created with `serviceWorkers: 'block'` (the caller's part:
 *       `context.route` does not see what a service worker intercepts);
 *   W3  WebSocket frames from the page to the server are dropped and recorded (server → page frames pass);
 *   W4  a GET whose path or query holds a delete word as a token, or a value Joe typed, is aborted;
 *   W5  a control or link that deletes is not pressed (`isDeleteControl`) and is listed «not tried»;
 *   W7  sign-in passes only inside `allowing(account, work)`: exactly one non-GET per call, whose body holds both
 *       the identity (≥ 3 characters) and the password (≥ 4), raw, URL-encoded or JSON-escaped; after the first
 *       sign-in, only to that same origin + path;
 *   W9  the errors a block caused are dropped, not charged (`drops`).
 *
 * The guard starts no process and stores nothing; `remove()` takes its routes off the context.
 */
import type { BrowserContext, Route, WebSocketRoute } from 'playwright';

/** The `notMeasured` kind the walk reports for a journey that needs a write (§5.3). */
export const LIVE_DATA_NOT_MEASURED = 'live_data_not_measured';

// ─────────────────────────────────────────────────────────────────────────────
// W8 — the delete words
// ─────────────────────────────────────────────────────────────────────────────

/** English, French, Spanish, German (whole words). */
const LATIN_WORDS = [
    'delete', 'del', 'remove', 'rm', 'destroy', 'erase', 'trash', 'discard', 'purge', 'wipe', 'archive', 'clear', 'drop', 'cancel',
    'deactivate', 'disable', 'ban', 'block', 'revoke', 'reset', 'unsubscribe', 'logout', 'log-out', 'signout', 'sign-out',
    'supprimer', 'effacer', 'retirer', 'corbeille', 'annuler', 'désinscrire', 'desinscrire',
    'eliminar', 'borrar', 'quitar', 'suprimir', 'papelera', 'cancelar', 'desuscribir', 'desinscribir',
    'löschen', 'loeschen', 'entfernen', 'papierkorb', 'stornieren', 'abmelden',
];
/** Russian: the stems with their usual endings (удал(ить/и/ение…), стер(еть/и…), корзин(а/у…)). */
const RUSSIAN = 'удал(?:ить|ите|и|ение|ения|ено|ён|ен|яю|ять|яет)|стер(?:еть|ите|и|т)|убрать|корзин(?:а|у|е|ы|ой)|отменить|отписаться';
/** Arabic (MSA + Gulf, Levantine, Egyptian, Maghrebi forms), with and without their shadda. */
const ARABIC_WORDS = [
    'حذف', 'احذف', 'إحذف', 'امسح', 'مسح', 'محو', 'امح', 'امحي', 'ازال', 'إزال', 'إزالة', 'ازالة', 'أزل', 'ازل', 'شيل',
    'نحّ', 'نح', 'نحي', 'حيّد', 'حيد', 'شطب', 'اشطب', 'فسخ', 'الغاء', 'إلغاء', 'ألغ', 'أرشف', 'ارشف',
];
/** The icons, matched anywhere. */
const ICONS = '🗑|❌|✖|✕|⌫';

const byLength = (a: string, b: string) => b.length - a.length;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LATIN_ALT = [...LATIN_WORDS].sort(byLength).map(esc).join('|');
const ARABIC_ALT = [...ARABIC_WORDS].sort(byLength).map(esc).join('|');

/**
 * W8 on labels, text, `aria-label` and `title`: a Latin or Cyrillic word only as a whole word (bounded by the ends
 * or by a character that is not a letter or digit, case-insensitive: `rm` never hits «Confirm», `del` never
 * «Model», `block` never «Blockchain»); an Arabic word only as a whole word too, allowing the clitics و/ف/ب/ل/ال in
 * front («احذف», «والحذف» hit; «انحياز» does not); the icons anywhere. Test it on text whose Arabic diacritics and
 * tatweel are removed (`isDeleteControl` does that).
 */
export const DELETE_WORDS = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${LATIN_ALT}|${RUSSIAN})(?![\\p{L}\\p{N}])`
    + `|(?<![\\p{L}\\p{N}])(?:[وفبل])?(?:ال)?(?:${ARABIC_ALT})(?![\\p{L}\\p{N}])`
    + `|${ICONS}`,
    'iu',
);

/**
 * W8 in URLs (W4, and a link's href in W5): a delete word as a token of the decoded path or query, bounded by
 * `/ ? & = . _ -` or the ends.
 */
export const DELETE_URL = new RegExp(`(?:^|[/?&=._-])(?:${LATIN_ALT}|${RUSSIAN}|${ARABIC_ALT})(?=$|[/?&=._-])`, 'iu');

/** W4: a value Joe typed (his marks), raw or URL-encoded. */
export const QA_MARKS = /joe\.qa(?:\+|%2B)|qa\.tester|Joe(?:\+|%20| )QA|JoeQA|QA(?:\+|%20| )(?:Tester|note|value)|__joeQaXss|اختبار|%D8%A7%D8%AE%D8%AA%D8%A8%D8%A7%D8%B1/i;

/** W7: the words a sign-in form's text or `aria-label` holds, for the re-sign-in rule (the caller checks the form). */
export const SIGN_IN_WORDS = /(?<![\p{L}\p{N}])(?:sign in|sign-in|signin|log in|log-in|login)(?![\p{L}\p{N}])|دخول|تسجيل الدخول|connexion|iniciar sesi|anmelden|войти/iu;

/** A network-shaped message (W9's background rule). */
const NETWORK_TEXT = /Failed to fetch|NetworkError|Load failed|ERR_[A-Z_]+|net::|blocked by client|aborted/i;
/** A message that names a block: the guard's or the fence's. */
const BLOCK_TEXT = /ERR_BLOCKED_BY_CLIENT|ERR_TUNNEL_CONNECTION_FAILED|x-joe-fence/i;
/** How long after an abort the page's messages are its consequence. */
export const GUARD_DROP_WINDOW_MS = 1500;
/** A static file, judged by its query only (a stylesheet named reset.css is not a GET that writes). */
const STATIC_FILE = /\.(?:css|js|mjs|map|woff2?|ttf|otf|eot|png|jpe?g|gif|svg|webp|avif|ico)$/i;

/** Text as W8 reads it: Arabic diacritics and tatweel removed. */
function plain(text: string): string {
    return String(text || '').replace(/[ً-ٰٟـ]/g, '');
}

/**
 * W5: whether a control or link deletes. Its label (text, `aria-label`, `title`) holds a delete word or icon, or
 * its href holds one as a URL token; a lone `×` counts unless it is the close button of an open dialog
 * (`inOpenDialogClose`, the caller's check: `[role=dialog] [aria-label*=close i], dialog button` inside the
 * dialog that holds it).
 */
export function isDeleteControl(label: string, href?: string, inOpenDialogClose?: boolean): boolean {
    const text = plain(label).trim();
    if (text === '×') return !inOpenDialogClose;
    if (text && DELETE_WORDS.test(text)) return true;
    if (href) {
        let decoded = String(href);
        try { decoded = decodeURIComponent(decoded); } catch { /* raw */ }
        const tail = plain(decoded).replace(/^[a-z][\w+.-]*:\/\/[^/]+/i, '');
        if (DELETE_URL.test(tail)) return true;
    }
    return false;
}

/** W4: whether a GET (or HEAD) URL writes: a delete word as a token of its path or query, or one of Joe's marks. */
export function isWritingGet(url: string): boolean {
    if (QA_MARKS.test(url)) return true;
    let decoded = url;
    try { decoded = decodeURIComponent(url); } catch { /* raw */ }
    if (QA_MARKS.test(decoded)) return true;
    const tail = plain(decoded).replace(/^[a-z][\w+.-]*:\/\/[^/]+/i, '');
    const q = tail.indexOf('?');
    const pathPart = q < 0 ? tail : tail.slice(0, q);
    const query = q < 0 ? '' : tail.slice(q);
    if (STATIC_FILE.test(pathPart)) return DELETE_URL.test(query);
    return DELETE_URL.test(tail);
}

// ─────────────────────────────────────────────────────────────────────────────
// The guard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The account the walk signs in with. From the audit's credentials (`app-audit.ts`):
 * `{ identity: c.identity ?? c.email ?? '', password: c.password ?? '' }`. A token-only account makes no sign-in
 * POST and needs no allowance; `reloadKeepsSession` runs inside `guard.allowing(account, …)`, so its re-sign-in
 * follows W7.
 */
export interface SignInAccount { identity: string; password: string }

/**
 * One aborted request. `background`: its `(method, origin+path)` was first seen while no action bracket was open
 * (it never counts for an action). `landing`: before any action at all. `kind`: a non-GET, a GET that writes, or a
 * page → server WebSocket frame.
 */
export interface GuardAbort { method: string; url: string; at: number; background: boolean; landing: boolean; kind: 'write' | 'get-write' | 'ws' }

export interface LiveDataGuard {
    aborted(): readonly GuardAbort[];
    wasAborted(url: string): boolean;
    /** Opens an action bracket (depth + 1); returns `mark()`. */
    begin(): number;
    /** Closes the innermost bracket; returns the non-background aborts since `at`. An inner end never closes the outer. */
    end(at: number): number;
    /** The count of non-background aborts so far. */
    mark(): number;
    /**
     * W9: whether a console message, page error or failed request is the block's doing: `'blocked-text'` it names a
     * block (`ERR_BLOCKED_BY_CLIENT`, the fence's refusal); `'aborted-url'` its URL was aborted; `'action-window'`
     * within 1,500 ms after an aborted action request; `'background-network'` a network-shaped message within
     * 1,500 ms after an aborted background request. `''`: charge it.
     */
    drops(text: string, url?: string): '' | 'blocked-text' | 'aborted-url' | 'action-window' | 'background-network';
    /** W7: runs `work` with one sign-in request allowed. */
    allowing<T>(account: SignInAccount, work: () => Promise<T>): Promise<T>;
    /** The origin + path the first sign-in went to ('' before it). */
    signInUrl(): string;
    /** Lists something the walk did not press because it would write: 'form: …' | 'link: …' | 'control: …' | 'journey: …' | 'scenario: …'. */
    notTried(label: string): void;
    readonly notTriedLabels: readonly string[];
    /** Unroutes, and lets later WebSockets through untouched. */
    remove(): Promise<void>;
}

/** The forms a secret may take in a request body: raw, URL-encoded (both space spellings), JSON-escaped. */
function spellings(s: string): string[] {
    if (!s) return [];
    const enc = encodeURIComponent(s);
    return [...new Set([s, enc, enc.replace(/%20/g, '+'), JSON.stringify(s).slice(1, -1)])];
}

const originPath = (u: string) => { try { const x = new URL(u); return x.origin + x.pathname; } catch { return u; } };

/**
 * Installs the no-write guard on a walk's private context (§5.2). Call it before the first page opens; `remove()` in
 * the walk's `finally`. `signIn` is the default account `allowing` falls back to when called with an empty one.
 */
export async function createLiveDataGuard(context: BrowserContext, opts: { signIn?: SignInAccount; now?: () => number } = {}): Promise<LiveDataGuard> {
    const now = opts.now ?? Date.now;
    const aborts: GuardAbort[] = [];
    const firstSeen = new Map<string, boolean>();   // (method origin+path) → background, fixed at its first abort
    const notTried: string[] = [];
    let depth = 0;
    let anyAction = false;
    let lastActionAt = -Infinity;
    let lastBackgroundAt = -Infinity;
    let allow: { id: string[]; pw: string[] } | null = null;
    let passedThisCall = false;
    let signInUrl = '';
    let removed = false;

    const record = (method: string, url: string, kind: GuardAbort['kind']) => {
        const key = `${method} ${originPath(url)}`;
        if (!firstSeen.has(key)) firstSeen.set(key, depth === 0);
        const background = firstSeen.get(key) as boolean;
        const at = now();
        aborts.push({ method, url, at, background, landing: !anyAction, kind });
        if (background) lastBackgroundAt = at; else lastActionAt = at;
    };
    const holdsBoth = (text: string) => !!allow
        && allow.pw.some(s => text.includes(s))
        && allow.id.some(s => text.includes(s));
    const mayPass = (text: string, url: string) => {
        if (!allow || passedThisCall || !holdsBoth(text)) return false;
        if (signInUrl && originPath(url) !== signInUrl) return false;
        if (!signInUrl) signInUrl = originPath(url);
        passedThisCall = true;
        return true;
    };

    const handler = async (route: Route) => {
        if (removed) return route.fallback();
        const r = route.request();
        const method = String(r.method()).toUpperCase();
        const url = r.url();
        if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
            if (method !== 'OPTIONS' && isWritingGet(url)) { record(method, url, 'get-write'); return route.abort('blockedbyclient'); }
            return route.fallback();
        }
        let body = '';
        try { body = r.postDataBuffer()?.toString('utf8') ?? ''; } catch { body = ''; }
        if (mayPass(body, url)) return route.fallback();
        record(method, url, 'write');
        return route.abort('blockedbyclient');
    };
    await context.route('**/*', handler);
    await context.routeWebSocket(/.*/, (ws: WebSocketRoute) => {
        const server = ws.connectToServer();
        if (removed) return;
        ws.onMessage(message => {
            if (removed) { server.send(message); return; }
            const text = typeof message === 'string' ? message : Buffer.from(message).toString('utf8');
            //  A sign-in sent over the socket is the call's one allowance, like a sign-in POST.
            if (allow && !passedThisCall && holdsBoth(text)) { passedThisCall = true; server.send(message); return; }
            record('WS', ws.url(), 'ws');
        });
    });

    const g: LiveDataGuard = {
        aborted: () => aborts,
        wasAborted: (url: string) => !!url && aborts.some(a => a.url === url),
        mark: () => aborts.filter(a => !a.background).length,
        begin() { depth++; anyAction = true; return g.mark(); },
        end(at: number) { depth = Math.max(0, depth - 1); return g.mark() - at; },
        drops(text: string, url?: string) {
            const t = String(text || '');
            const at = now();
            if (BLOCK_TEXT.test(t)) return 'blocked-text';
            if (url && g.wasAborted(url)) return 'aborted-url';
            if (at - lastActionAt < GUARD_DROP_WINDOW_MS) return 'action-window';
            if (at - lastBackgroundAt < GUARD_DROP_WINDOW_MS && NETWORK_TEXT.test(t)) return 'background-network';
            return '';
        },
        async allowing<T>(account: SignInAccount, work: () => Promise<T>): Promise<T> {
            const a = account && (account.identity || account.password) ? account : (opts.signIn ?? { identity: '', password: '' });
            const identity = String(a.identity || ''), password = String(a.password || '');
            const prev = allow, prevPassed = passedThisCall;
            allow = identity.length >= 3 && password.length >= 4 ? { id: spellings(identity), pw: spellings(password) } : null;
            passedThisCall = false;
            try { return await work(); } finally { allow = prev; passedThisCall = prevPassed; }
        },
        signInUrl: () => signInUrl,
        notTried(label: string) { const l = String(label || '').trim(); if (l && !notTried.includes(l)) notTried.push(l); },
        get notTriedLabels() { return notTried; },
        async remove() {
            if (removed) return;
            removed = true;
            await context.unroute('**/*', handler).catch(() => undefined);
        },
    };
    return g;
}
