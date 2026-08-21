/**
 * THE SWEEP THAT SHOULD HAVE CAUGHT IT.
 *
 * The user found this himself: build in one chat, open a second, and its Logs
 * and Preview still wore the first one's work. I had missed it because my
 * method was to FOLLOW THE LOG — wait for a failure to print a line, then
 * chase it. Nothing about a panel showing the wrong content prints a line, so
 * a whole class of defects was invisible to me, and he was right to say so.
 *
 * This file is the method, made mechanical. It states an INVARIANT and then
 * checks every place the invariant could be broken — including places nobody
 * has complained about yet:
 *
 *   INVARIANT: anything that DISPLAYS a run belongs to the run's session.
 *   Every consumer of the live socket either (a) filters incoming events by
 *   the session on screen and clears when that session changes, or (b) is
 *   named here as a deliberate shared surface, with the reason written down.
 *
 * A new panel added tomorrow fails this test until it does one or the other.
 * That is the whole point: the rule outlives whoever remembers it.
 *
 * The sweep found three violations on its first run, none of them reported:
 *   • TodosPanel  — accepted a sessionId and never looked at it
 *   • TaskTracker — took no session at all
 *   • CommandComposer — kept the attachment and the half-typed line across a
 *     session switch, so a photo attached in one chat rode into the next
 */
import fs from 'fs';
import path from 'path';

const WEB_SRC = path.join(__dirname, '..', '..', '..', 'web', 'src');

/** Every file under web/src, recursively. */
const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true })
    .flatMap(e => {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) return walk(p);
        return /\.(tsx?|jsx?)$/.test(e.name) ? [p] : [];
    });

const rel = (p: string) => path.relative(WEB_SRC, p).replace(/\\/g, '/');

/**
 * Surfaces that are shared ON PURPOSE. Each entry must carry its reason —
 * an empty reason is itself a failure, because "it was like that already" is
 * not a reason.
 */
const DELIBERATELY_SHARED: Record<string, string> = {
    'pages/admin/SystemManagement.tsx':
        'An operator screen for the whole server: its events are system-wide by definition and belong to '
        + 'no conversation.',
    'services/runningSessions.ts':
        'The registry of which conversations are still working. "Who is running" is a fact about ALL of them, '
        + 'not about the one on screen, so this is the one consumer that deliberately listens without a session '
        + 'filter — scoping it would defeat its only purpose, which is to light the chip of a session you are NOT '
        + 'looking at. It writes to no panel: it keeps a set of ids and notifies subscribers.',
};

describe('INVARIANT: what displays a run belongs to the run’s session', () => {
    const consumers = walk(WEB_SRC).filter(f => /SocketService\.subscribe/.test(fs.readFileSync(f, 'utf-8')));

    it('the sweep actually finds the live-socket consumers', () => {
        // A sweep that silently matches nothing is worse than no sweep.
        expect(consumers.length).toBeGreaterThanOrEqual(8);
    });

    it.each(consumers.map(f => [rel(f), f]))('%s is session-scoped, or shared with a written reason', (name, file) => {
        const src = fs.readFileSync(file as string, 'utf-8');
        const reason = DELIBERATELY_SHARED[name as string];
        if (reason) {
            expect(reason.length).toBeGreaterThan(60);   // a real sentence, not a shrug
            return;
        }
        // It must KNOW the session…
        expect(src).toMatch(/sessionId/);
        // …compare an incoming event against it…
        const filters = /msg\?\.sessionId|event\?\.sessionId|msg\.sessionId|event\.sessionId|evSid|belongsHere|const mine|activeSessionRef|activeSidRef|activeSid/.test(src);
        expect(filters).toBe(true);
        // …and forget the previous conversation when it changes.
        const resets = /\}, \[[^\]]*sessionId[^\]]*\]\)|\}, \[activeSessionId\]\)|prevSessionIdRef/.test(src);
        expect(resets).toBe(true);
    });

    /**
     * The one exemption granted to a module that listens to EVERY session has
     * to stay harmless. It is allowed to know who is running; it is not allowed
     * to put anything on screen — that is what the scoping rule protects.
     */
    it('the unscoped run registry keeps ids and paints nothing', () => {
        const src = fs.readFileSync(path.join(WEB_SRC, 'services', 'runningSessions.ts'), 'utf-8');
        expect(src).not.toMatch(/document\.|window\.dispatchEvent|setState|useState|innerHTML/);
        // its whole surface is a set of ids plus subscribers
        expect(src).toMatch(/const running = new Set<string>\(\)/);
    });
});

/**
 * INVARIANT 5, the part that bit: every rendered control does something.
 * A security screen shipped an «Analyze Hash» button with no handler at all,
 * promising per-file integrity checking the server never implemented.
 */
describe('INVARIANT: a rendered control is never a decoration', () => {
    /** Every <button> in the app must carry a handler, be a submit, or be disabled. */
    const deadControls = (src: string): number => {
        let dead = 0;
        for (const m of src.matchAll(/<button\b((?:[^>]|\n){0,400}?)>/g)) {
            const a = m[1];
            if (/onClick|onMouseDown|type="submit"|type='submit'|disabled/.test(a)) continue;
            dead++;
        }
        return dead;
    };

    it('the Sentinel security screen has no decorative control left', () => {
        const S = fs.readFileSync(path.join(WEB_SRC, 'pages', 'admin', 'sentinel', 'SentinelDashboard.tsx'), 'utf-8');
        expect(S).toMatch(/const verifyChain = async/);
        expect(S).toMatch(/onClick=\{verifyChain\}/);
        expect(deadControls(S)).toBe(0);
    });

    it('and neither do the panels the user lives in', () => {
        for (const f of [['components', 'JoeIDELayout.tsx'], ['components', 'TodosPanel.tsx'], ['components', 'TaskTracker.tsx'], ['components', 'WorkspacePanel.tsx']]) {
            const src = fs.readFileSync(path.join(WEB_SRC, ...f), 'utf-8');
            expect({ file: f.join('/'), dead: deadControls(src) }).toEqual({ file: f.join('/'), dead: 0 });
        }
    });
});

/**
 * The same invariant, one level down: the state a panel keeps must be reset or
 * archived when the conversation changes. These are the exact values that were
 * leaking, named so a regression is caught by name rather than by a user.
 */
describe('INVARIANT: no panel keeps another conversation’s state', () => {
    const read = (...p: string[]) => fs.readFileSync(path.join(WEB_SRC, ...p), 'utf-8');

    it('the workspace panels archive and restore per session', () => {
        const L = read('components', 'JoeIDELayout.tsx');
        expect(L).toMatch(/panelArchive/);
        expect(L).toMatch(/setLiveFiles\(saved\?\.liveFiles \|\| \[\]\)/);
    });

    it('the preview URL is filed under the session that produced it', () => {
        expect(read('pages', 'Joe.tsx')).toMatch(/previewBySession/);
    });

    it('the agent task list clears when the conversation changes', () => {
        const T = read('components', 'TodosPanel.tsx');
        expect(T).toMatch(/useEffect\(\(\) => \{ setTodos\(\[\]\)/);
    });

    it('the progress ring belongs to its run', () => {
        const T = read('components', 'TaskTracker.tsx');
        expect(T).toMatch(/sessionId/);
        expect(T).toMatch(/activeSid/);
    });

    it('an attachment never rides from one chat into the next', () => {
        const C = read('components', 'CommandComposer.tsx');
        // Inside the session-switch branch, both the files and the draft go.
        //
        // The bound is the branch's own `return;`, not a character count. A
        // fixed 900-char window meant that writing a comment inside the branch
        // pushed the last assertion out of view and reported a reset that is
        // still there as missing — a red test for prose.
        const at = C.indexOf('if (prev && prev !== sessionId)');
        expect(at).toBeGreaterThan(0);
        const branch = C.slice(at, C.indexOf('return;', at));
        expect(branch).toMatch(/setAttachedFiles\(\[\]\)/);
        // `text` is the box the user actually types in; `draftText` is the
        // draft-mode buffer. The first fix cleared only the latter and the
        // live browser proof caught the typed line still on screen.
        expect(branch).toMatch(/setText\(''\)/);
        expect(branch).toMatch(/setDraftText\(''\)/);
    });
});

/**
 * INVARIANT 4 (honesty), swept where it kept failing: the gap list must come
 * from the REQUEST, not from a table of words I happened to anticipate.
 *
 * Measured in the field AFTER the first honesty fix: a request naming twelve
 * features got exactly ONE of them reported as unbuilt, because «AI assistant»
 * was in my table and «Stories», «Reels», «Live streaming», «Groups», «Pages»,
 * «Video calls», «Ads platform», «Creator dashboard» were not.
 */
describe('INVARIANT: what was not built is named in the user’s own words', () => {
    const SOCIAL = [
        'Build a next-generation social media platform.', '', 'Features:', '',
        '- Posts', '- Stories', '- Reels', '- Live streaming', '- Groups', '- Pages',
        '- Messaging', '- Video calls', '- AI moderation', '- Recommendations',
        '- Ads platform', '- Creator dashboard',
    ].join('\n');

    it('reads the features out of the request', () => {
        const { requestedFeatures } = require('../core/design/app-blueprints');
        expect(requestedFeatures(SOCIAL)).toEqual([
            'Posts', 'Stories', 'Reels', 'Live streaming', 'Groups', 'Pages',
            'Messaging', 'Video calls', 'AI moderation', 'Recommendations',
            'Ads platform', 'Creator dashboard',
        ]);
    });

    it('reports every feature the delivered engine does not cover', () => {
        const { uncoveredFeatures } = require('../core/design/app-blueprints');
        const gap = uncoveredFeatures(SOCIAL, 'chat', true);
        expect(gap).toContain('Stories');
        expect(gap).toContain('Ads platform');
        expect(gap).toContain('Creator dashboard');
        // …and never claims something IS missing when the engine delivers it
        expect(gap).not.toContain('Messaging');
        expect(gap.length).toBe(11);
    });

    it('the delivery message is built from that list, not only from the table', () => {
        const R = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf-8');
        expect(R).toMatch(/uncoveredFeatures\(request, appBp\.engine/);
        expect(R).toMatch(/askedButMissing/);
    });
});

/**
 * INVARIANT: the two halves of a full stack are about the same thing.
 * A chat app was wired to /api/items — a conversation reading a catalogue.
 */
describe('INVARIANT: the server stores what the app talks about', () => {
    const { apiResourceForKind } = require('../modules/tools/definitions/ApiProjectTool');
    it('an app request names the resource after the app', () => {
        expect(apiResourceForKind('generic', false, 'a platform with Messaging and video calls').resource).toBe('messages');
        expect(apiResourceForKind('generic', true, 'نظام حجوزات عيادة').resource).toBe('bookings');
        expect(apiResourceForKind('generic', true, 'نظام إدارة مخزون').resource).toBe('items');
    });
    it('and a presentation build keeps the resource it always had', () => {
        expect(apiResourceForKind('restaurant', true, 'موقع مطعم').resource).toBe('dishes');
        expect(apiResourceForKind('store', true, 'متجر').resource).toBe('products');
    });
    it('an application starts empty — no fabricated rows in its database', () => {
        expect(apiResourceForKind('generic', true, 'تطبيق محادثة').seeds).toHaveLength(0);
    });
});

/**
 * INVARIANT: a relative API base is never handed to `new URL()` alone.
 *
 * From the field — clicking «تسجيل الدخول بواسطة جوجل»:
 *
 *   Uncaught TypeError: Failed to construct 'URL': Invalid URL
 *       at onClick (Login-….js)
 *
 * `API_URL` is `/api` on purpose: same origin, no CORS, proxied by Vite in
 * development and Nginx in production. But a path is not a URL, and the URL
 * constructor rejects one without an origin. `apiClient` had always
 * absolutised before constructing; the login page reached for the raw constant
 * and nothing in the build, the types, or the tests objected — the button
 * simply threw on every click.
 *
 * The knowledge now lives in `config.apiUrl()`, and this sweep keeps it there:
 * a `new URL()` fed from the API base, anywhere under web/src, without a base
 * argument, fails here rather than in his console.
 */
describe('INVARIANT: an API endpoint is absolutised before it becomes a URL', () => {
    const files = walk(WEB_SRC);

    it('config exports the helper that owns this rule', () => {
        const cfg = fs.readFileSync(path.join(WEB_SRC, 'config.ts'), 'utf-8');
        expect(cfg).toMatch(/const apiUrl = \(path: string\): string =>/);
        expect(cfg).toMatch(/window\.location\.origin/);
        expect(cfg).toMatch(/export \{[^}]*apiUrl[^}]*\}/);
    });

    it.each(files.map(f => [rel(f), f]))('%s never builds a URL from the raw API base', (_name, file) => {
        const src = fs.readFileSync(file as string, 'utf-8');
        // `new URL(`${API}/x`)` / `new URL(API_URL + …)` with no second argument.
        const offenders = [...src.matchAll(/new URL\(\s*(`[^`]*\$\{\s*(?:API|API_URL)\s*\}[^`]*`|API_URL[^,)]*)\s*\)/g)];
        expect(offenders.map(m => m[0])).toEqual([]);
    });

    it('and the login page uses the helper for both Google endpoints', () => {
        const login = fs.readFileSync(path.join(WEB_SRC, 'pages', 'Login.tsx'), 'utf-8');
        expect(login).toMatch(/new URL\(apiUrl\('\/auth\/google'\)\)/);
        expect(login).toMatch(/new URL\(apiUrl\('\/auth\/google\/config'\)\)/);
    });
});
