/**
 * ⛔ WHAT A ROLE'S SCREENS HIDE FROM IT, THE SERVER MUST REFUSE IT.
 *
 * Requests like the hard exam's H01 («logins with three roles (admin, doctor,
 * receptionist) and different permissions for each») are delivered with a
 * menu that differs per role. A menu is not a permission: a receptionist whose
 * screen has no «Revenue report» can still ask the server for the revenue,
 * and a system that answers has no permissions at all — only a tidy menu. No
 * check of Joe's asked the server; a build that hid screens passed.
 *
 * The builder gives task_finish an account for each role it seeds
 * (`accounts`). Joe signs in as each, in a browser of its own, through the
 * product's own form (sign-in.ts), opens every screen its menu offers, and
 * notes the data each screen reads from the server. Then, for every role, the
 * data of each screen ANOTHER role has and this one does not is asked for
 * with this role's own session. A refusal (401, 403, 404) is the permission
 * holding; data is a leak, named with the screen and the address.
 *
 * Only what was measured is said: a screen that reads nothing cannot be
 * asked for, and an address with an id in it is not guessed at.
 */
import { getChromiumLaunchOptions } from '../../modules/browser/manager';
import { requestedArtifact } from '../design/requested-artifact';
import { signInThroughPage, type SignInAccount } from './sign-in';
import { createLiveDataGuard, isDeleteControl, isWritingGet, type LiveDataGuard } from './live-data-guard';
import type { QaPath } from './qa-target';

/** The request asks for roles or permissions (the reader's own server claim, «roles:…»). */
export function asksRolePermissions(request: string): boolean {
    try {
        return requestedArtifact(String(request || '')).evidence.serverClaims.some(c => c.startsWith('roles:'));
    } catch {
        return false;
    }
}

export interface RoleAccount extends SignInAccount {
    role: string;
}

/** `accounts` as task_finish gives it: [{username|email, password, role}]; null when it is not a list of accounts. */
export function parseRoleAccounts(raw: unknown): RoleAccount[] | null {
    if (!Array.isArray(raw) || !raw.length || raw.length > 12) return null;
    const out: RoleAccount[] = [];
    for (const item of raw) {
        if (!item || typeof item !== 'object') return null;
        const a = item as Record<string, unknown>;
        const identity = String(a.username ?? a.email ?? a.identity ?? '').trim();
        const password = String(a.password ?? '');
        const role = String(a.role ?? '').trim();
        if (!identity || !password || !role || identity.length > 200 || password.length > 200 || role.length > 60) return null;
        out.push({ identity, password, role });
    }
    return out;
}

export interface RoleView {
    role: string;
    signedIn: boolean;
    why?: string;
    /** The screens its menu offered, as labelled. */
    screens: string[];
}

export interface RoleLeak {
    /** The role that was given what its screens hide from it. */
    role: string;
    /** The screen of another role whose data it is. */
    screen: string;
    /** The role whose screen it is. */
    of: string;
    path: string;
    status: number;
}

export interface RoleMeasurement {
    measured: boolean;
    views: RoleView[];
    leaks: RoleLeak[];
    /** Addresses asked for with a role's session and refused: the permissions that held. */
    refused: Array<{ role: string; screen: string; path: string; status: number }>;
    error?: string;
    /**
     * On the no-write walk (design v13.3 §6, path 3): the doors not pressed because their words or address delete
     * («control: …», «link: …»), and how many of the probe's requests the guard stopped. Absent elsewhere.
     */
    notTried?: string[];
    blocked?: number;
}

/** The browser's proxy: the verification's fence (design v13.3 §4.4), so the probe's browser reaches only the app. */
export interface ProbeBrowserProxy { server: string; bypass: string }

/**
 * How a probe's own browser is launched on a change run (§4.4, §6): behind the fence when one is given. A caller that
 * passes none launches it as before.
 */
export function probeLaunchOptions(base: Record<string, any>, browserProxy?: ProbeBrowserProxy): Record<string, any> {
    return browserProxy?.server ? { ...base, proxy: { server: browserProxy.server, bypass: browserProxy.bypass } } : base;
}

/** The menu's doors: buttons and links in a navigation, a sidebar or a tab list; never sign-out or a language. */
const MARK_DOORS = `(() => {
    const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const label = (el) => (el.getAttribute('aria-label') || el.innerText || '').trim().replace(/\\s+/g, ' ').slice(0, 48);
    const NOT_A_DOOR = /^(?:sign\\s*out|log\\s*out|logout|تسجيل\\s*الخروج|خروج|english|العربية|عربي|en|ar)$/i;
    document.querySelectorAll('[data-joe-door]').forEach(el => el.removeAttribute('data-joe-door'));
    const scopes = [...document.querySelectorAll('nav, aside, [role="navigation"], [role="tablist"], .sidebar, .nav, .menu')];
    const seen = new Set();
    const out = [];
    for (const scope of scopes) {
        for (const el of scope.querySelectorAll('a[href], button, [role="tab"], [role="menuitem"]')) {
            if (!visible(el) || el.closest('[data-joe-door]')) continue;
            const text = label(el);
            if (!text || NOT_A_DOOR.test(text) || seen.has(text)) continue;
            const href = el.getAttribute('href') || '';
            if (/^(?:https?:|mailto:|tel:)/i.test(href) && !href.startsWith(location.origin)) continue;
            seen.add(text);
            el.setAttribute('data-joe-door', String(out.length));
            out.push(text);
            if (out.length >= 15) return out;
        }
    }
    return out;
})()`;

/** A same-origin read the page made, as a path: numbers in it are ids. */
function readPath(url: string, origin: string): string {
    try {
        const u = new URL(url);
        if (u.origin !== origin) return '';
        return u.pathname.replace(/\/\d+(?=\/|$)/gu, '/:id');
    } catch { return ''; }
}

interface Walk {
    view: RoleView;
    /** The reads each screen made that the landing did not. */
    reads: Map<string, Set<string>>;
    all: Set<string>;
    auth: string;
    context: any;
}

/**
 * Signs in as each account, walks its menu, then asks the server, with each
 * role's own session, for the data of every screen only other roles have.
 */
export async function measureRoles(url: string, accounts: RoleAccount[], opts: {
    timeoutMs?: number;
    signal?: AbortSignal;
    /**
     * The verification's path (design v13.3 §6). On the no-write walk (path 3) each role's context runs under the
     * guard (live-data-guard.ts): nothing but its one sign-in is sent, a door whose words or address delete is not
     * pressed, and a read whose address writes (W4) is not asked. Elsewhere the probe runs as before.
     */
    qaPath?: QaPath;
    /** The verification's fence (§4.4): the probe's own Chromium reaches only the app's address through it. */
    browserProxy?: ProbeBrowserProxy;
} = {}): Promise<RoleMeasurement> {
    if (!url || accounts.length < 2) return { measured: false, views: [], leaks: [], refused: [], error: 'two or more accounts, one per role, are needed to compare what each role may see' };
    const deadline = Date.now() + Math.max(20_000, opts.timeoutMs ?? 150_000);
    const left = () => Math.max(0, deadline - Date.now());
    const stopped = () => left() <= 0 || opts.signal?.aborted === true;
    const origin = new URL(url).origin;
    const noWrite = opts.qaPath === 'no-write';
    const notTried: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { chromium } = require('playwright');
    let browser: any;
    try {
        browser = await chromium.launch(probeLaunchOptions({ ...getChromiumLaunchOptions(), headless: true }, opts.browserProxy));
    } catch (e: any) {
        return { measured: false, views: [], leaks: [], refused: [], error: `the browser could not start: ${String(e?.message || e).slice(0, 200)}` };
    }
    const walks: Walk[] = [];
    const guards: LiveDataGuard[] = [];
    /** Path 3's account for the guard (W7): the identity and password the role signs in with. */
    const accountOf = (a: RoleAccount): SignInAccount => ({ identity: String(a.identity || ''), password: String(a.password || '') });
    /** What the result says on path 3: the doors not pressed and the requests stopped. Nothing elsewhere. */
    const noWriteFacts = (): Pick<RoleMeasurement, 'notTried' | 'blocked'> => noWrite
        ? { notTried: Array.from(new Set([...notTried, ...guards.flatMap(g => g.notTriedLabels)])), blocked: guards.reduce((n, g) => n + g.aborted().length, 0) }
        : {};
    try {
        for (const account of accounts) {
            if (stopped()) break;
            //  Path 3 (W1, W2): a private context with service workers blocked, so every request passes the guard.
            const context = await browser.newContext(noWrite ? { viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' } : { viewport: { width: 1280, height: 900 } });
            //  No fence that reads the traffic (none, or an https app): its workers are not created (W11, review 7 B2).
            const holdWorkers = !opts.browserProxy?.server || !/^http:/i.test(String(url));
            const guard = noWrite ? await createLiveDataGuard(context, { signIn: accountOf(account), ...(holdWorkers ? { holdWorkers } : {}) }) : null;
            if (guard) guards.push(guard);
            const page = await context.newPage();
            page.setDefaultTimeout(4_000);
            const walk: Walk = { view: { role: account.role, signedIn: false, screens: [] }, reads: new Map(), all: new Set(), auth: '', context };
            walks.push(walk);
            let current = '';
            page.on('request', (r: any) => {
                if (r.method() !== 'GET' || !['fetch', 'xhr'].includes(r.resourceType())) return;
                const p = readPath(r.url(), origin);
                if (!p) return;
                const auth = r.headers()['authorization'];
                if (auth) walk.auth = auth;
                walk.all.add(p);
                if (current) {
                    if (!walk.reads.has(current)) walk.reads.set(current, new Set());
                    walk.reads.get(current)!.add(p);
                }
            });
            try {
                await page.goto(url, { waitUntil: 'load', timeout: Math.min(15_000, Math.max(3_000, left())) });
                await page.waitForTimeout(500);
                const signInOnce = () => signInThroughPage(page, account, { timeoutMs: Math.min(12_000, Math.max(2_000, left())) });
                //  Path 3 (W7): the role's one sign-in request is the only write that passes.
                const signed = guard ? await guard.allowing(accountOf(account), signInOnce) : await signInOnce();
                if (!signed.ok) { walk.view.why = signed.why; continue; }
                walk.view.signedIn = true;
                const landing = new Set(walk.all);
                const doors: string[] = await page.evaluate(MARK_DOORS).catch(() => []);
                walk.view.screens = doors;
                /** Path 3 (W5): a door whose words or address delete is not pressed (listed «not tried»). */
                const keptShut = async (label: string, at: number): Promise<boolean> => {
                    if (!guard) return false;
                    const href = String(await page.locator(`[data-joe-door="${at}"]`).first().getAttribute('href').catch(() => '') || '');
                    if (!isDeleteControl(label, href)) return false;
                    if (!notTried.includes(`control: ${label}`)) notTried.push(`control: ${label}`);
                    return true;
                };
                for (let i = 0; i < doors.length && !stopped(); i++) {
                    current = doors[i];
                    const door = page.locator(`[data-joe-door="${i}"]`).first();
                    if (!(await door.count().catch(() => 0))) {
                        //  The menu was drawn again: its doors are marked again, by label.
                        const again: string[] = await page.evaluate(MARK_DOORS).catch(() => []);
                        const at = again.indexOf(doors[i]);
                        if (at < 0) continue;
                        if (await keptShut(doors[i], at)) continue;
                        await page.locator(`[data-joe-door="${at}"]`).first().click({ timeout: 3_000 }).catch(() => { });
                    } else {
                        if (await keptShut(doors[i], i)) continue;
                        await door.click({ timeout: 3_000 }).catch(() => { });
                    }
                    await page.waitForLoadState('networkidle', { timeout: 2_500 }).catch(() => { });
                    await page.waitForTimeout(300);
                }
                current = '';
                //  What the landing read belongs to every screen; a screen's own reads are what it added.
                for (const [screen, reads] of walk.reads) walk.reads.set(screen, new Set([...reads].filter(p => !landing.has(p))));
            } catch (e: any) {
                walk.view.why = walk.view.why || `the page could not be walked: ${String(e?.message || e).split('\n')[0].slice(0, 160)}`;
            }
        }
        const signedIn = walks.filter(w => w.view.signedIn);
        if (signedIn.length < 2) {
            return {
                measured: false, views: walks.map(w => w.view), leaks: [], refused: [],
                error: `fewer than two of the accounts signed in: ${walks.filter(w => !w.view.signedIn).map(w => `${w.view.role} (${w.view.why || 'not signed in'})`).join('; ')}`,
                ...noWriteFacts(),
            };
        }
        const leaks: RoleLeak[] = [];
        const refused: RoleMeasurement['refused'] = [];
        for (const walk of signedIn) {
            const mine = new Set(walk.view.screens);
            for (const other of signedIn) {
                if (other === walk) continue;
                for (const [screen, reads] of other.reads) {
                    if (mine.has(screen)) continue;
                    for (const p of reads) {
                        if (stopped()) break;
                        if (p.includes(':id') || walk.all.has(p) || leaks.some(l => l.role === walk.view.role && l.path === p) || refused.some(r => r.role === walk.view.role && r.path === p)) continue;
                        //  Path 3 (W4): a read whose address deletes is never asked, with any role's session.
                        if (noWrite && isWritingGet(origin + p)) continue;
                        const answer = await walk.context.request.get(origin + p, {
                            headers: walk.auth ? { authorization: walk.auth } : {},
                            timeout: Math.min(5_000, Math.max(1_000, left())),
                            failOnStatusCode: false,
                        }).catch(() => null);
                        if (!answer) continue;
                        const status = answer.status();
                        if ([401, 403, 404].includes(status)) { refused.push({ role: walk.view.role, screen, path: p, status }); continue; }
                        if (status >= 200 && status < 300) {
                            const body = String(await answer.text().catch(() => '')).trim();
                            const empty = !body || body === '[]' || body === '{}' || body === 'null';
                            if (!empty) leaks.push({ role: walk.view.role, screen, of: other.view.role, path: p, status });
                        }
                    }
                }
            }
        }
        return { measured: true, views: walks.map(w => w.view), leaks, refused, ...noWriteFacts() };
    } finally {
        for (const w of walks) {
            //  Path 3 (W1): every page is sent to about:blank before its context closes.
            if (noWrite) for (const p of w.context.pages?.() || []) await p.goto('about:blank').catch(() => { });
            await w.context.close().catch(() => { });
        }
        for (const g of guards) await g.remove().catch(() => { });
        await browser.close().catch(() => { });
    }
}

/** The measurement as the delivery ledger says it: null when every role was refused what its screens hide. */
export function roleLeakError(m: RoleMeasurement): string | null {
    if (!m.measured) return `roles not measured: ${m.error || 'the roles could not be compared'}`;
    if (!m.leaks.length) return null;
    return `the server gives a role what its screens hide from it: ${m.leaks.slice(0, 6).map(l => `${l.role} was given GET ${l.path} (${l.status}) — the data of «${l.screen}», a screen only ${l.of} has`).join('; ')}`;
}
