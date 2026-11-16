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
 *   W9  the errors a block caused are dropped, not charged (`drops`) — a socket whose frame was dropped, for as
 *       long as it stays open and 3 s after it closes, for the errors that name it or speak of its answer.
 *   W10 a GET whose target is an ACTION (a path segment such as done / complete / toggle / approve / like /
 *       logout, `isActionUrl`) is never followed as a link, and is aborted when it is a navigation or is sent by a
 *       press — the classic «Mark done» link writes on a GET (review 7, B1). A GET answered with a redirect to a
 *       page (not an asset, not a sign-in, not the same page with a slash) is a WRITE SIGNAL: it is told, and the
 *       GETs of the same shape after it are aborted (`writeSignals`).
 *   W11 every request the guard lets through carries `QA_GUARD_HEADER` (a secret of this process). The fence,
 *       which is the browser's whole network, holds back on the no-write walk every write that does NOT carry it —
 *       what a shared worker or a dedicated worker's WebSocket sends never passes `context.route` (review 7, B2).
 *       Where no fence can read the traffic (no fence, or an https origin), `holdWorkers` stops shared and
 *       dedicated workers from being created at all, and each one the page asked for is told «not tried».
 *
 * The guard starts no process and stores nothing; `remove()` takes its routes off the context.
 */
import crypto from 'crypto';
import type { BrowserContext, Route, WebSocketRoute } from 'playwright';

/** W11: the header every request the guard lets through carries; the fence strips it before it forwards. */
export const QA_GUARD_HEADER = 'x-joe-guard';
/** W11: its value, a secret of this process (the page never sees it: it is added below the page, at the network). */
export const QA_GUARD_TAG = crypto.randomBytes(16).toString('hex');

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

/**
 * W10: the action words a GET's path segment names (review 7, B1). A segment is split on `- _ .`, and a token that
 * IS one of these words makes the address an action: `/tasks/1/done`, `/mark-as-read`, `/posts/3/like`. Arabic:
 * the same actions as a slug would spell them.
 */
export const ACTION_WORDS: readonly string[] = [
    'done', 'complete', 'completed', 'toggle', 'mark', 'read', 'unread', 'approve', 'reject', 'cancel', 'confirm', 'archive',
    'unarchive', 'restore', 'publish', 'unpublish', 'like', 'unlike', 'vote', 'upvote', 'downvote', 'subscribe', 'unsubscribe',
    'logout', 'signout', 'activate', 'deactivate', 'enable', 'disable', 'reset', 'send', 'resend', 'run', 'delete', 'remove',
    'تم', 'انجاز', 'إنجاز', 'اعتماد', 'موافقة', 'قبول', 'رفض', 'الغاء', 'إلغاء', 'تأكيد', 'تاكيد', 'أرشفة', 'ارشفة', 'استعادة',
    'استرجاع', 'نشر', 'اعجاب', 'إعجاب', 'تصويت', 'اشتراك', 'خروج', 'تفعيل', 'تعطيل', 'ارسال', 'إرسال', 'تشغيل', 'حذف',
    'ازالة', 'إزالة', 'مقروء',
];
const ACTION_SET = new Set(ACTION_WORDS.map(w => w.toLowerCase()));
/** A query parameter that names what the GET does (`?action=done`, `?_method=DELETE`). */
const ACTION_PARAM = /^(?:action|op|do|cmd|command|_method|method)$/i;

/**
 * W10: whether a GET's address names an action: a token of a decoded path segment that is an action word, or a
 * query parameter `action|op|do|cmd|command` holding one (`_method` with any value but GET). Static files never.
 */
export function isActionUrl(url: string): boolean {
    let u: URL;
    try { u = new URL(String(url), 'http://x.invalid'); } catch { return false; }
    let pathname = u.pathname;
    try { pathname = decodeURIComponent(pathname); } catch { /* raw */ }
    pathname = plain(pathname);
    if (STATIC_FILE.test(pathname)) return false;
    for (const seg of pathname.split('/')) {
        for (const token of seg.split(/[-_.]+/u)) if (token && ACTION_SET.has(token.toLowerCase())) return true;
    }
    for (const [k, v] of u.searchParams) {
        if (!ACTION_PARAM.test(k)) continue;
        const value = plain(String(v)).trim().toLowerCase();
        if (/^_?method$/i.test(k)) { if (value && value !== 'get') return true; continue; }
        if (ACTION_SET.has(value) || value.split(/[-_.\s]+/u).some(t => ACTION_SET.has(t))) return true;
    }
    return false;
}

/** W10: a redirect that is no write signal: to a sign-in page. */
const SIGN_IN_PATH = /(?:^|\/)(?:login|log-in|signin|sign-in|auth|session|sessions|دخول|تسجيل-الدخول)(?:$|[/?#.])/iu;

/** W10: the shape of an address, its ids taken out (`/tasks/12/done` → `/tasks/:id/done`): the GETs a write signal stops. */
export function addressShape(url: string): string {
    try {
        const u = new URL(String(url), 'http://x.invalid');
        return u.pathname.split('/').map(seg => (/^(?:\d+|[0-9a-f]{8,}|[0-9a-f-]{20,}|[A-Za-z0-9_-]{20,})$/iu.test(seg) ? ':id' : seg.toLowerCase())).join('/');
    } catch { return ''; }
}

/** W7: the words a sign-in form's text or `aria-label` holds, for the re-sign-in rule (the caller checks the form). */
export const SIGN_IN_WORDS = /(?<![\p{L}\p{N}])(?:sign in|sign-in|signin|log in|log-in|login)(?![\p{L}\p{N}])|دخول|تسجيل الدخول|connexion|iniciar sesi|anmelden|войти/iu;

/** A network-shaped message (W9's background rule). */
const NETWORK_TEXT = /Failed to fetch|NetworkError|Load failed|ERR_[A-Z_]+|net::|blocked by client|aborted/i;
/** A message that names a block: the guard's or the fence's. */
const BLOCK_TEXT = /ERR_BLOCKED_BY_CLIENT|ERR_TUNNEL_CONNECTION_FAILED|x-joe-fence|held by Joe/i;
/** W11: what the page logs when it asked for a worker the guard does not let it create. */
const HELD_WORKER_TEXT = /^\[joe-held-worker\] (\w+)/;
/** How long after an abort the page's messages are its consequence. */
export const GUARD_DROP_WINDOW_MS = 1500;
/**
 * W9 for a socket: a page that sent a frame the guard dropped waits for an answer that never comes, and says so
 * when ITS timer runs out (seconds later: «live updates: the server did not answer the subscription», 3 s after the
 * dropped subscribe — the 1,500 ms window missed it). Its errors stay the block's while that socket is open and
 * for this long after it closes.
 */
export const GUARD_SOCKET_TAIL_MS = 3000;
/** An error that speaks of a live socket, its subscription or its missing answer: a dropped socket's own (W9). */
const SOCKET_TEXT = /web\s?socket|\bsocket\b|\bwss?:\/\/|subscri(?:be|bed|ption)|live[ -]?updates?|real[ -]?time|did(?: not|n't) (?:answer|reply|respond)|no (?:answer|reply|response) from|disconnect|الاتصال المباشر|التحديثات? المباشرة|الاشتراك|لم يرد الخادم|لم يستجب الخادم/i;
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
     * 1,500 ms after an aborted background request; `'socket-window'` while a socket whose frame was dropped is
     * open (and 3 s after it closes), a message that names that socket or speaks of a socket, its subscription
     * or its missing answer. `''`: charge it.
     */
    drops(text: string, url?: string): '' | 'blocked-text' | 'aborted-url' | 'action-window' | 'background-network' | 'socket-window';
    /** W7: runs `work` with one sign-in request allowed. */
    allowing<T>(account: SignInAccount, work: () => Promise<T>): Promise<T>;
    /** The origin + path the first sign-in went to ('' before it). */
    signInUrl(): string;
    /** Lists something the walk did not press because it would write: 'form: …' | 'link: …' | 'control: …' | 'journey: …' | 'scenario: …'. */
    notTried(label: string): void;
    readonly notTriedLabels: readonly string[];
    /** W10: the GETs answered with a redirect to a page during the walk (a sign they saved something), in order. */
    writeSignals(): ReadonlyArray<{ url: string; location: string }>;
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
export async function createLiveDataGuard(context: BrowserContext, opts: { signIn?: SignInAccount; now?: () => number; holdWorkers?: boolean } = {}): Promise<LiveDataGuard> {
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
    /** The page's sockets the guard saw (W3): their address, whether a frame of theirs was dropped, when they closed. */
    const sockets: Array<{ url: string; dropped: boolean; closedAt: number }> = [];
    /** W10: the redirects seen, and the shapes of address they make the guard stop. */
    const signals: Array<{ url: string; location: string }> = [];
    const signalShapes = new Set<string>();
    const pathOf = (u: string) => { try { const x = new URL(u); return x.pathname + x.search; } catch { return String(u); } };
    let g: LiveDataGuard;

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
            //  W10: an action GET followed (a navigation) or sent by a press is a write; so is one of a shape that redirected.
            let navigation = false;
            try { navigation = r.isNavigationRequest(); } catch { navigation = false; }
            if (method !== 'OPTIONS' && (navigation || depth > 0) && (isActionUrl(url) || (signalShapes.size > 0 && signalShapes.has(addressShape(url))))) {
                record(method, url, 'get-write');
                g.notTried(`request: ${method} ${pathOf(url).slice(0, 80)}`);
                return route.abort('blockedbyclient');
            }
            return pass(route);
        }
        let body = '';
        try { body = r.postDataBuffer()?.toString('utf8') ?? ''; } catch { body = ''; }
        if (mayPass(body, url)) return pass(route);
        record(method, url, 'write');
        return route.abort('blockedbyclient');
    };
    /** W11: what the guard lets through goes on marked, so the fence knows the guard saw it. */
    const pass = (route: Route) => {
        let headers: Record<string, string> = {};
        try { headers = { ...route.request().headers() }; } catch { headers = {}; }
        headers[QA_GUARD_HEADER] = QA_GUARD_TAG;
        return route.fallback({ headers });
    };
    /** W10: a GET answered with a redirect to a page is a write signal (told, and its shape stopped from now on). */
    const onResponse = (resp: any) => {
        if (removed) return;
        try {
            const status = Number(resp.status());
            if (status < 300 || status > 399 || status === 304) return;
            const req = resp.request();
            const method = String(req.method()).toUpperCase();
            if (method !== 'GET' && method !== 'HEAD') return;
            const url = String(req.url());
            const from = new URL(url);
            if (STATIC_FILE.test(from.pathname)) return;
            const location = String((resp.headers() || {}).location || '');
            if (!location) return;
            const to = new URL(location, url);
            const trim = (p: string) => p.replace(/\/+$/u, '') || '/';
            if (to.origin === from.origin && trim(to.pathname) === trim(from.pathname)) return;
            if (SIGN_IN_PATH.test(to.pathname)) return;
            if (signals.length < 200) signals.push({ url, location: to.href });
            const shape = addressShape(url);
            if (shape) signalShapes.add(shape);
        } catch { /* a response that cannot be read is no signal */ }
    };
    //  A context that cannot tell its responses (a test's stand-in) simply gives no write signals.
    try { (context as any).on?.('response', onResponse); } catch { /* no events */ }
    /** W11: no fence can read this walk's traffic, so a worker is never created; each one asked for is told. */
    const onConsole = (msg: any) => {
        try {
            const m = HELD_WORKER_TEXT.exec(String(msg.text()));
            if (m) g.notTried(`channel: ${m[1] === 'SharedWorker' ? 'a shared background worker' : 'a background worker'} (not measured: Joe's checks cannot hold what it sends)`);
        } catch { /* not a message */ }
    };
    if (opts.holdWorkers) {
        await (context as any).addInitScript(() => {
            const hold = (name: 'Worker' | 'SharedWorker') => {
                try {
                    Object.defineProperty(window, name, {
                        configurable: true, writable: true,
                        value: function held() {
                            try { console.debug(`[joe-held-worker] ${name}`); } catch { /* no console */ }
                            throw new DOMException(`${name} is held by Joe's checks`, 'SecurityError');
                        },
                    });
                } catch { /* a frame that will not take it */ }
            };
            hold('SharedWorker');
            hold('Worker');
        });
        try { (context as any).on?.('console', onConsole); } catch { /* no events */ }
    }
    await context.route('**/*', handler);
    await context.routeWebSocket(/.*/, (ws: WebSocketRoute) => {
        const server = ws.connectToServer();
        if (removed) return;
        const socket = { url: String(ws.url() || ''), dropped: false, closedAt: Infinity };
        if (sockets.length < 500) sockets.push(socket);
        /*
         * When it closes, from either side (W9's socket tail). A close handler turns off Playwright's own forwarding
         * of the close to the other side, so each side's close is passed on here, as Playwright would.
         */
        const shut = (side: { close: (o?: { code?: number; reason?: string }) => Promise<void> }, code?: number, reason?: string) => {
            if (socket.closedAt === Infinity) socket.closedAt = now();
            Promise.resolve().then(() => side.close({ code, reason })).catch(() => Promise.resolve().then(() => side.close()).catch(() => undefined));
        };
        try { ws.onClose((code, reason) => shut(server, code, reason)); } catch { /* no close events: the socket stays «open» for W9 */ }
        try { server.onClose((code, reason) => shut(ws, code, reason)); } catch { /* the same */ }
        ws.onMessage(message => {
            if (removed) { server.send(message); return; }
            const text = typeof message === 'string' ? message : Buffer.from(message).toString('utf8');
            //  A sign-in sent over the socket is the call's one allowance, like a sign-in POST.
            if (allow && !passedThisCall && holdsBoth(text)) { passedThisCall = true; server.send(message); return; }
            socket.dropped = true;
            record('WS', ws.url(), 'ws');
        });
    });
    /** Whether a message names a socket: its full address, or its host and path. */
    const namesSocket = (t: string, url: string | undefined, socketUrl: string) => {
        if (!socketUrl) return false;
        if (url && url === socketUrl) return true;
        let short = '';
        try { const u = new URL(socketUrl); short = `${u.host}${u.pathname}`; } catch { short = ''; }
        return t.includes(socketUrl) || (!!short && short.length > 1 && t.includes(short));
    };

    g = {
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
            //  A dropped socket's own error, while it is open and 3 s after it closes — only one that is about it.
            const held = sockets.filter(x => x.dropped && at - x.closedAt < GUARD_SOCKET_TAIL_MS);
            if (held.length && (SOCKET_TEXT.test(t) || held.some(x => namesSocket(t, url, x.url)))) return 'socket-window';
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
        writeSignals: () => signals.slice(),
        async remove() {
            if (removed) return;
            removed = true;
            try { (context as any).off?.('response', onResponse); } catch { /* gone */ }
            try { (context as any).off?.('console', onConsole); } catch { /* gone */ }
            await context.unroute('**/*', handler).catch(() => undefined);
        },
    };
    return g;
}
