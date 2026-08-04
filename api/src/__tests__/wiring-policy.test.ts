/**
 * THE WIRING POLICY — «لا أريد أن نضيف ونرمي، ثم نتفاجأ بعد فترة أنه لا يعمل
 * لأنه غير مرتبط بمسار صحيح».
 *
 * A feature is not finished when it exists. It is finished when the system
 * REACHES it. This file is the standing enforcement of that rule, and it runs
 * on every commit — so an addition that is not connected fails the build on
 * the day it lands, not in the field weeks later.
 *
 * What it refuses to let through:
 *   1. an alias that points at a tool which does not exist
 *   2. an alias whose target does a DIFFERENT JOB than its name promises
 *      (five names meaning «find this text» pointed at a filename glob and
 *      answered `{files: []}` — confident, empty and wrong)
 *   3. a tool named by the planner or by the orchestrator's deterministic
 *      list that resolves to nothing
 *   4. a generated component written to disk but never imported or rendered
 *   5. a capability the system depends on with no tool behind it at all
 *   6. a helper introduced with no caller
 */
import fs from 'fs';
import path from 'path';
import { tools } from '../modules/tools/registry';
import { TOOL_ALIASES } from '../modules/services/ToolService';

const NAMES = tools.map((t: any) => t.name);
const SRC = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf-8');
/** The panel's own source — the other half of any wire that ends on screen. */
const WEB = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', '..', '..', 'web', 'src', ...p), 'utf-8');
const resolves = (n: string) => NAMES.includes(n) || NAMES.includes(TOOL_ALIASES[n] || '');

describe('every name the system can utter reaches something real', () => {
    it('no alias points at a tool that does not exist', () => {
        const broken = Object.entries(TOOL_ALIASES).filter(([, target]) => !NAMES.includes(target));
        expect(broken).toEqual([]);
    });

    it('no alias shadows a registered tool of the same name', () => {
        const shadowed = Object.keys(TOOL_ALIASES).filter(a => NAMES.includes(a) && TOOL_ALIASES[a] !== a);
        expect(shadowed).toEqual([]);
    });

    it('a name that means CONTENT search never lands on the filename glob', () => {
        // The exact mis-wiring the audit found: grep and its synonyms answered
        // with an empty file list instead of ever reading a file.
        for (const n of ['grep', 'grep_search', 'ripgrep', 'code_search', 'search_code', 'find_in_files']) {
            expect(TOOL_ALIASES[n]).toBe('search_text');
        }
        for (const n of ['file_search', 'find_files', 'glob_search']) {
            expect(TOOL_ALIASES[n]).toBe('search_files');
        }
        // …and both tools really exist, doing their two different jobs.
        expect(NAMES).toContain('search_text');
        expect(NAMES).toContain('search_files');
    });

    it('every tool the PLANNER names resolves', () => {
        const planner = SRC('core', 'orchestrator', 'PlanningEngine.ts');
        const named = [...new Set([...planner.matchAll(/tool:\s*'([a-z_]+)'/g)].map(m => m[1]))]
            .filter(n => !['direct_response', 'central_answer'].includes(n));
        expect(named.filter(n => !resolves(n))).toEqual([]);
        expect(named.length).toBeGreaterThan(5);          // the fast paths are still there
    });

    it('every tool in the orchestrator\'s deterministic list resolves', () => {
        const orch = SRC('orchestration', 'AgentOrchestrator.ts');
        const block = (orch.match(/DETERMINISTIC_TOOLS\s*=\s*\[([\s\S]*?)\]/) || [])[1] || '';
        const named = [...block.matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
        expect(named.filter(n => !resolves(n))).toEqual([]);
        for (const must of ['react_project', 'project_edit', 'web_page_builder']) expect(named).toContain(must);
    });

    it('the file-lifecycle capabilities all exist — create, read, edit, list, search, DELETE', () => {
        // Deletion was missing entirely across 149 tools until the audit ran.
        for (const cap of ['write_file', 'read_file', 'file_edit', 'inspect_directory', 'search_files', 'search_text', 'delete_file']) {
            expect(NAMES).toContain(cap);
        }
    });
});

describe('nothing is written and then abandoned', () => {
    it('every helper introduced for the panels has real callers', () => {
        const ws = SRC('api', 'ws.ts');
        expect(ws).toContain('export function broadcastTerminalLine');
        for (const f of ['ReactProjectTool', 'ApiProjectTool', 'ImportProjectTool', 'WebPageBuilderTool']) {
            expect(SRC('modules', 'tools', 'definitions', `${f}.ts`)).toContain('broadcastTerminalLine(');
        }
        expect(SRC('modules', 'services', 'ToolService.ts')).toContain('broadcastTerminalLine(');
        // The observer hook exists because a proof needs it — and that proof uses it.
        expect(ws).toContain('export function observeBroadcasts');
        expect(fs.readFileSync(path.join(__dirname, '..', 'tests', 'manual', 'verify_build_e2e.ts'), 'utf-8'))
            .toContain('observeBroadcasts(');
    });

    it('the surgical editor is wired to the SAME audit engine the builder uses', () => {
        const edit = SRC('modules', 'tools', 'definitions', 'ProjectEditTool.ts');
        const build = SRC('modules', 'tools', 'definitions', 'ReactProjectTool.ts');
        expect(edit).toContain('app-audit');
        expect(build).toContain('app-audit');
        expect(edit).toContain('auditBuiltApp');
    });

    it('the local-brain breaker is consumed by the code that pays its cost', () => {
        expect(SRC('core', 'agents', 'narrator.ts')).toContain('isLocalBrainOpen');
        const router = SRC('core', 'llm', 'intelligent-router.ts');
        expect(router).toContain('export function isLocalBrainOpen');
        expect(router).toContain('noteLocalBrainTimeout()');
        expect(router).toContain('noteLocalBrainOk()');
    });
});

/**
 * The generated app is held to the same rule: a section component written to
 * disk that App.jsx never imports is the same «added and thrown» defect,
 * shipped to the user's own project.
 */
describe('a generated project imports and renders everything it writes', () => {
    const { ReactProjectTool, sectionsForKind } = require('../modules/tools/definitions/ReactProjectTool');
    const os = require('os');
    let out: any, root: string;
    beforeAll(async () => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-wirepolicy-'));
        out = await new ReactProjectTool().execute(
            { request: 'ابنِ متجر react للعطور', root, skipInstall: true }, { sessionId: 'wire-policy' });
    });
    afterAll(() => { fs.rmSync(root, { recursive: true, force: true }); delete (global as any).joeProjects?.['wire-policy']; });

    it('every section is written, imported AND rendered', () => {
        const app = fs.readFileSync(path.join(out.output.path, 'src', 'App.jsx'), 'utf-8');
        const shipped = fs.readdirSync(path.join(out.output.path, 'src', 'components')).map(f => f.replace('.jsx', ''));
        for (const s of sectionsForKind('store')) {
            expect(shipped).toContain(s);
            expect(app).toContain(`import ${s} from './components/${s}.jsx'`);
            expect(app).toContain(`<${s} content={content} />`);
        }
    });

    it('no component ships without a user — nothing is thrown into the folder', () => {
        const app = fs.readFileSync(path.join(out.output.path, 'src', 'App.jsx'), 'utf-8');
        const shipped = fs.readdirSync(path.join(out.output.path, 'src', 'components')).map(f => f.replace('.jsx', ''));
        const sections: string[] = sectionsForKind('store');
        for (const c of shipped) {
            const used = sections.includes(c) || app.includes(`<${c} `)
                || ['Navbar', 'Footer'].includes(c)
                // OrderButton and ProductView are imported BY other components.
                || ['OrderButton', 'ProductView'].some(x => x === c);
            expect({ component: c, used }).toEqual({ component: c, used: true });
        }
    });
});

/**
 * THE EVENT CONTRACT — the server and the UI must agree on names.
 *
 * The audit compared every WebSocket event the web app listens for against
 * every event the server can actually broadcast, and found EIGHT names the
 * UI waited on that nothing ever sent. Two mattered:
 *
 *   - `secret_required`: the browser agent hits «missing_secret:<KEY>» and
 *     the UI carries a complete credential prompt for it. Nobody sent the
 *     event, so the run reported an error and the prompt never appeared —
 *     a feature fully built on both sides that simply never met.
 *   - `run_started`: the panels reveal the workspace and clear the live file
 *     list when a run begins. The server only ever sent `user_input`, so
 *     that happened later, by luck, on the first tool.
 *
 * The rest were legacy synonyms (`tool_start`, `preview_url`,
 * `browser_opened`, `browser_started`, `browser_update`, `show_browser`)
 * pointing at events that never existed under those names.
 */
describe('the server and the UI agree on event names', () => {
    const WEB = path.join(__dirname, '..', '..', '..', 'web', 'src');
    const readAll = (dir: string): string => fs.readdirSync(dir, { withFileTypes: true })
        .map(e => e.isDirectory() ? readAll(path.join(dir, e.name))
            : /\.(ts|tsx)$/.test(e.name) ? fs.readFileSync(path.join(dir, e.name), 'utf-8') : '')
        .join('\n');
    const readApi = (dir: string): string => fs.readdirSync(dir, { withFileTypes: true })
        .map(e => e.isDirectory() ? (e.name === 'node_modules' ? '' : readApi(path.join(dir, e.name)))
            : /\.ts$/.test(e.name) ? fs.readFileSync(path.join(dir, e.name), 'utf-8') : '')
        .join('\n');

    // Client-side or client→server names: never broadcast BY the server.
    const CLIENT_ONLY = new Set([
        'connected', 'disconnected', 'terminal_input', 'terminal_resize', 'ping', 'pong',
        'message', 'error',                       // socket-level envelopes
    ]);

    it('every event the UI listens for is one the server can really send', () => {
        const web = readAll(WEB);
        const api = readApi(path.join(__dirname, '..'));
        // The character class MUST allow ':'. It did not, and that is exactly
        // how `admin:deployment_log` survived this lock: the super-admin panel
        // waited on that name for live deployment logs while the server sent
        // `admin:deploy_log` (a different name AND a different field), so not
        // one line ever arrived — and this test could not even see the name to
        // complain about it. Optional chaining (`msg?.type`) is matched too.
        const listened = [...new Set([...web.matchAll(/(?:event|msg|data)\??\.type === '([a-z_:]+)'/g)].map(m => m[1]))]
            .concat([...new Set([...web.matchAll(/msgType === '([a-z_:]+)'/g)].map(m => m[1]))])
            .filter(n => !CLIENT_ONLY.has(n));
        expect(listened.some(n => n.includes(':'))).toBe(true);   // the namespaced ones are IN scope now
        const orphans = listened.filter(n => !api.includes(`'${n}'`));
        expect(orphans).toEqual([]);
    });

    it('the panel reads the FIELD the sender writes, not one that looks like it', () => {
        // Half a name match is not a match: the listener took `msg.data.id`
        // from an event whose payload is `{ deploymentId, log, ts }`.
        const panel = fs.readFileSync(path.join(WEB, 'pages', 'admin', 'SystemManagement.tsx'), 'utf-8');
        expect(panel).toContain('msg.data?.deploymentId');
        expect(SRC('modules', 'services', 'DeployManager.ts')).toContain('deploymentId: deploymentId');
    });

    it('the interface asks NOTHING of a third party to render itself', () => {
        // Joe pulled five font families from fonts.googleapis.com on every page
        // load: it needed the internet to look right, it paid a third-party
        // handshake before the first paint, and it announced every visitor to
        // Google — which stops being a footnote once Joe is online for the
        // world. The fonts are vendored under web/public/fonts now, and this
        // keeps them there.
        const webRoot = path.join(WEB, '..');
        const html = fs.readFileSync(path.join(webRoot, 'index.html'), 'utf-8');
        expect(html).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
        expect(html).toContain('/fonts/fonts.css');

        const styles: string[] = [];
        const walk = (dir: string) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, e.name);
                if (e.isDirectory()) { walk(full); continue; }
                if (/\.(css|tsx|ts)$/.test(e.name)) styles.push(fs.readFileSync(full, 'utf-8'));
            }
        };
        walk(WEB);
        // A comment may NAME the old host; an @import or a url() may not use it.
        const live = styles.filter(b => /(@import\s+url\(['"]?https:\/\/fonts|src:\s*url\(['"]?https:\/\/fonts)/.test(b));
        expect(live.length).toBe(0);

        // …and every face the sheet declares must have a file behind it.
        const fontsDir = path.join(webRoot, 'public', 'fonts');
        const sheet = fs.readFileSync(path.join(fontsDir, 'fonts.css'), 'utf-8');
        const declared = [...sheet.matchAll(/url\('\/fonts\/([^']+)'\)/g)].map(m => m[1]);
        expect(declared.length).toBeGreaterThan(10);
        expect(declared.filter(d => !fs.existsSync(path.join(fontsDir, d)))).toEqual([]);
        // and the licence travels with them
        expect(fs.existsSync(path.join(fontsDir, 'OFL-LICENSE.txt'))).toBe(true);
    });

    it('no web fetch hardcodes /api — the base is one import, in one place', () => {
        // Three sentinel calls wrote `fetch('/api/...')` directly. They happen to
        // work today because API_URL IS '/api', which is precisely what makes it
        // the kind of bug that surfaces months later, in one panel only.
        const offenders: string[] = [];
        const walk = (dir: string) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, e.name);
                if (e.isDirectory()) { walk(full); continue; }
                if (!/\.(ts|tsx)$/.test(e.name)) continue;
                const body = fs.readFileSync(full, 'utf-8');
                if (/fetch\(\s*[`'"]\/api\//.test(body)) offenders.push(e.name);
            }
        };
        walk(WEB);
        expect(offenders).toEqual([]);
    });

    it('the credential prompt has a sender now', () => {
        expect(SRC('api', 'ws.ts')).toContain("type: 'secret_required'");
        expect(SRC('modules', 'browser', 'executor.ts')).toContain('broadcastSecretRequired(');
    });

    it('a run announces itself the moment it starts', () => {
        expect(SRC('api', 'routes', 'run.ts')).toContain("type: 'run_started'");
    });
});

/**
 * THE HTTP CONTRACT — the last seam.
 *
 * A `fetch` in the web app is a promise that a route exists. Probing a booted
 * server proves nothing (Express answers 404 for a POST-only route asked with
 * GET), so the map is read where it is declared: the mount table in app.ts and
 * every `router.<method>('…')` in the files it mounts.
 *
 * The audit found one hole and it was real: `POST /api/audio/speech` — the
 * voice mode's neural-speech request — had never been mounted. The client
 * swallowed Express's «Cannot POST» as a failed request and fell back to
 * browser speech, so the good half of the feature had simply never run once.
 */
describe('every URL the browser calls exists on the server', () => {
    const { serverRoutes, uiPaths, unreachableUiPaths, routeRegex } = require('../tests/routeMap');

    it('the map itself is real — a broken parser must not pass silently', () => {
        const routes = serverRoutes();
        expect(routes.length).toBeGreaterThan(100);
        expect(uiPaths().length).toBeGreaterThan(40);
        for (const known of ['/api/health', '/api/agent', '/api/sessions/abc/messages', '/api/audio/speech']) {
            expect(routes.some((r: any) => routeRegex(r.path).test(known))).toBe(true);
        }
    });

    it('no button in the UI calls a path nothing serves', () => {
        expect(unreachableUiPaths().map((u: any) => `${u.path} ← ${u.file}`)).toEqual([]);
    });

    it('voice mode has a server half now, and it never fakes success', () => {
        const audio = SRC('api', 'routes', 'audio.ts');
        expect(SRC('api', 'app.ts')).toContain("apiRouter.use('/audio', audioRoutes)");
        expect(audio).toContain("router.post('/speech'");
        // no engine ⇒ 503 + a reason, so the client falls back at once
        expect(audio).toContain('tts_unavailable');
        expect(audio).toContain('res.status(503)');
    });
});

/**
 * WHO IS AN ADMIN — one rule, on the server, and the browser may not vote.
 *
 * Three ways in existed at once, and two of them belonged to the visitor:
 *   - `count === 0 ? 'OWNER' : 'USER'` on every sign-up path, so the first
 *     stranger to find a fresh public deployment owned it;
 *   - `localStorage.admin === 'true'`, a value the visitor writes;
 *   - two of the owner's personal email addresses compiled into the bundle
 *     that ships to every browser.
 */
describe('admin is decided by the server, once', () => {
    const authRoutes = SRC('api', 'routes', 'auth.ts');
    const mw = SRC('api', 'middleware', 'auth.ts');
    const WEB_SRC = path.join(__dirname, '..', '..', '..', 'web', 'src');
    const webFile = (...p: string[]) => fs.readFileSync(path.join(WEB_SRC, ...p), 'utf-8');

    it('no sign-up path hands ownership to whoever arrives first', () => {
        expect(authRoutes).not.toMatch(/count\s*===\s*0\s*\?\s*'OWNER'/);
        expect(authRoutes).not.toMatch(/isFirstUser\s*\|\|\s*\(adminEmail/);
        // …they all go through the one decision instead
        expect((authRoutes.match(/roleForNewAccount\(/g) || []).length).toBeGreaterThanOrEqual(3);
        expect(mw).toContain('export function roleForNewAccount');
    });

    it('the decision itself: named wins, first-arrival does not', () => {
        const { roleForNewAccount } = require('../api/middleware/auth');
        const prev = process.env.SUPER_ADMIN_EMAILS;
        process.env.SUPER_ADMIN_EMAILS = 'owner@joe.local';
        try {
            expect(roleForNewAccount({ email: 'owner@joe.local', isFirstUser: false, isLoopback: false })).toBe('OWNER');
            expect(roleForNewAccount({ email: 'OWNER@JOE.LOCAL', isFirstUser: false, isLoopback: false })).toBe('OWNER');
            expect(roleForNewAccount({ email: 'stranger@x.com', isFirstUser: true, isLoopback: false })).toBe('USER');
            expect(roleForNewAccount({ email: 'stranger@x.com', isFirstUser: true, isLoopback: true })).toBe('USER');
            delete process.env.SUPER_ADMIN_EMAILS;
            // no allowlist: only the machine itself may bootstrap
            expect(roleForNewAccount({ email: 'dev@joe.local', isFirstUser: true, isLoopback: true })).toBe('OWNER');
            expect(roleForNewAccount({ email: 'dev@joe.local', isFirstUser: true, isLoopback: false })).toBe('USER');
            expect(roleForNewAccount({ email: 'dev@joe.local', isFirstUser: false, isLoopback: true })).toBe('USER');
        } finally {
            if (prev === undefined) delete process.env.SUPER_ADMIN_EMAILS;
            else process.env.SUPER_ADMIN_EMAILS = prev;
        }
    });

    it('the browser never grants itself the panel', () => {
        const main = webFile('main.tsx');
        // the gate reads the signed token and nothing else
        expect(main).toMatch(/const isAdmin = decoded\.role === 'SUPER_ADMIN' \|\| decoded\.role === 'OWNER';/);
        const readers: string[] = [];
        const walk = (dir: string) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, e.name);
                if (e.isDirectory()) { walk(full); continue; }
                if (!/\.(ts|tsx)$/.test(e.name)) continue;
                const body = fs.readFileSync(full, 'utf-8');
                // a comment may mention it; code may not READ it
                if (/localStorage\.getItem\(\s*['"]admin['"]\s*\)/.test(body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''))) {
                    readers.push(e.name);
                }
            }
        };
        walk(WEB_SRC);
        expect(readers).toEqual([]);
    });

    it('no personal email is compiled into the interface', () => {
        const offenders: string[] = [];
        const walk = (dir: string) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, e.name);
                if (e.isDirectory()) { walk(full); continue; }
                if (!/\.(ts|tsx)$/.test(e.name)) continue;
                const code = fs.readFileSync(full, 'utf-8')
                    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
                if (/['"][\w.+-]+@(gmail|hotmail|outlook|yahoo)\.com['"]/.test(code)) offenders.push(e.name);
            }
        };
        walk(WEB_SRC);
        expect(offenders).toEqual([]);
    });
});

/**
 * THE SETTINGS SCREEN is the panel's most dangerous page, so its guarantees
 * are locked rather than remembered.
 */
describe('the environment editor stays narrow', () => {
    const { ENV_SETTINGS, ENV_BY_KEY, isSettableEnvKey, validateEnvValue, maskEnvValue, isSecretSetting } =
        require('../core/config/envRegistry');
    const admin = SRC('api', 'routes', 'admin.ts');

    it('only names Joe actually reads are editable — and only from the list', () => {
        const api = fs.readFileSync(path.join(__dirname, '..', 'api', 'routes', 'admin.ts'), 'utf-8');
        expect(api).toContain('isSettableEnvKey');
        // the two that would hand over the process
        expect(isSettableEnvKey('NODE_OPTIONS')).toBe(false);
        expect(isSettableEnvKey('PATH')).toBe(false);
        expect(isSettableEnvKey('LD_PRELOAD')).toBe(false);
        expect(isSettableEnvKey('SUPER_ADMIN_EMAILS')).toBe(true);
        expect(ENV_SETTINGS.length).toBeGreaterThan(20);
    });

    it('every editable key is one the codebase really reads', () => {
        // A settings screen full of keys nothing consults is a screen of
        // switches wired to nothing.
        const read = (dir: string): string => fs.readdirSync(dir, { withFileTypes: true })
            .map(e => e.isDirectory() ? (e.name === 'node_modules' ? '' : read(path.join(dir, e.name)))
                : /\.ts$/.test(e.name) ? fs.readFileSync(path.join(dir, e.name), 'utf-8') : '').join('\n');
        const src = read(path.join(__dirname, '..'));
        const orphans = ENV_SETTINGS
            .map((s: any) => s.key)
            .filter((k: string) => !src.includes(`process.env.${k}`) && !src.includes(`process.env['${k}']`));
        expect(orphans).toEqual([]);
    });

    it('a secret is a secret in ONE place — kind and flag cannot disagree', () => {
        // They did: every API key declared `kind: 'secret'` while the mask
        // checked a separate `secret: true` that the registry never set, so
        // the panel served every key in the clear. Found by the live proof.
        for (const key of ['GROQ_API_KEY', 'OPENAI_API_KEY', 'JWT_SECRET', 'MONGO_URI']) {
            const s = ENV_BY_KEY.get(key);
            expect(isSecretSetting(s)).toBe(true);
            expect(maskEnvValue(s, 'super-secret-value-1234')).toEqual({ set: true, preview: '••••1234' });
        }
        expect(maskEnvValue(ENV_BY_KEY.get('PUBLIC_URL'), 'https://x.com'))
            .toEqual({ set: true, preview: 'https://x.com' });
    });

    it('a value can never write a second assignment into .env', () => {
        const s = ENV_BY_KEY.get('PUBLIC_URL');
        expect(validateEnvValue(s, 'https://a.com\nENABLE_AUTH_BYPASS=true')).toBeTruthy();
        expect(validateEnvValue(s, 'https://a.com')).toBeNull();
        expect(validateEnvValue(ENV_BY_KEY.get('REGISTRATION_OPEN'), 'yes')).toBeTruthy();
        expect(validateEnvValue(ENV_BY_KEY.get('PORT'), 'abc')).toBeTruthy();
    });

    it('the route keeps its three refusals and its owner gate', () => {
        expect(admin).toContain('const requireOwner');
        expect(admin).toContain("router.get('/env', requireOwner");
        expect(admin).toContain("router.post('/env', requireOwner");
        expect(admin).toContain('would_lock_you_out');
        expect(admin).toContain('unsafe_in_production');
        expect(admin).toContain('confirmation_required');
        // and it must never log a value
        expect(admin).not.toMatch(/logger\.(info|warn)\([^)]*clean\[/);
    });

    it('the file writer keeps mode 0600 and a backup', () => {
        const w = SRC('core', 'config', 'envFile.ts');
        expect(w).toContain('mode: 0o600');
        expect(w).toContain('backup-');
        // a commented-out assignment must not be silently reactivated: the
        // match is anchored at the start of the line, before any '#'
        expect(w).toMatch(/new RegExp\(`\^\\\\s\*\$\{key\}/);
    });
});

/**
 * THE BRAIN MUST KNOW WHAT IT OWNS.
 *
 * The deepest wiring defect of all was not in a seam between two files — it
 * was in the planner's own prompt, which listed SEVEN tool names, two of them
 * aliases. With the ~21 more that keyword paths name directly, 26 of 151
 * tools could ever be chosen and 125 could not be reached by any request in
 * any language: every browser audit, the database tools, the translator, the
 * load tester, the mobile and Go and Java builders. Registered, tested,
 * locked — and invisible to the thing that decides.
 *
 * The catalogue is retrieved per goal now. These cases keep it honest: it
 * must be built from the REGISTRY (never a literal list), it must stay small
 * enough for a free-tier model, it must cross the Arabic/English boundary,
 * and a name the planner invents must never reach the executor.
 */
describe('the planner is offered the whole toolbox, not a frozen list of seven', () => {
    const { selectToolsFor, catalogueFor, CORE_TOOLS, scoreTool, goalTerms } = require('../core/orchestrator/toolCatalog');
    const planner = SRC('core', 'orchestrator', 'PlanningEngine.ts');
    const NAMES_ALL = tools.map((t: any) => t.name);

    it('the frozen seven are gone and the catalogue comes from the registry', () => {
        expect(planner).not.toMatch(/Use ONLY existing tools: shell_execute/);
        expect(planner).toContain('catalogueFor(intent.goal)');
        const cat = SRC('core', 'orchestrator', 'toolCatalog.ts');
        expect(cat).toContain("import { tools } from '../../modules/tools/registry'");
    });

    it('every line it offers names a REAL tool with its REAL arguments', () => {
        for (const goal of ['ترجم الموقع', 'audit my page performance', 'شغّل دوكر']) {
            for (const line of catalogueFor(goal).split('\n').filter(Boolean)) {
                const name = (line.match(/^- ([a-z0-9_]+)\(/) || [])[1];
                expect(NAMES_ALL).toContain(name);
                const tool: any = tools.find((t: any) => t.name === name);
                const args = (line.match(/\(([^)]*)\)/) || [])[1] || '';
                for (const a of args.split(',').map(x => x.trim().replace(/\?$/, '')).filter(Boolean)) {
                    expect(Object.keys(tool.inputSchema?.properties || {})).toContain(a);
                }
            }
        }
    });

    it('an Arabic request reaches the English-described specialist', () => {
        const cases: Array<[string, string]> = [
            ['ترجم الموقع إلى الإنجليزية', 'browser_translate'],
            ['حلّل قاعدة البيانات وأنشئ ترحيل', 'db_schema_migrator'],
            ['ابنِ تطبيق جوال', 'mobile_builder'],
            ['دقّق السيو في موقعي', 'browser_seo_audit'],
            ['أنشئ خط أنابيب CI', 'ci_generate_pipeline'],
        ];
        for (const [goal, want] of cases) {
            const top = selectToolsFor(goal).filter((p: any) => p.score > 0).slice(0, 5).map((p: any) => p.name);
            expect({ goal, top }).toEqual({ goal, top: expect.arrayContaining([want]) });
        }
    });

    it('it stays affordable, and the core is always there', () => {
        for (const goal of ['ترجم الموقع', 'ساعدني', 'build me a store and deploy it and test everything']) {
            const cat = catalogueFor(goal);
            expect(cat.length).toBeLessThan(8000);
            const names = selectToolsFor(goal).map((p: any) => p.name);
            for (const c of CORE_TOOLS) if (NAMES_ALL.includes(c)) expect(names).toContain(c);
        }
    });

    it('reach is measured, not assumed: one corpus opens most of the toolbox', () => {
        const corpus = ['ترجم الموقع', 'افحص الأمان', 'اختبر الأداء', 'ابنِ تطبيق جوال', 'راجع الكود',
            'شغّل دوكر', 'دقّق الوصول', 'لقطة شاشة', 'الروابط المكسورة', 'وثائق swagger',
            'اكتب اختبارات', 'خط أنابيب CI', 'ابحث في الملفات', 'حلّل التكلفة السحابية', 'اقرأ الطلبات'];
        const reached = new Set<string>();
        for (const g of corpus) for (const t of selectToolsFor(g)) reached.add(t.name);
        expect(reached.size).toBeGreaterThan(90);      // was 26, for every request ever
    });

    it('the ranking DECIDES, not just describes — inspect verbs reach their specialist', () => {
        const { capabilityRoute } = require('../core/orchestrator/toolCatalog');
        const g: any = global as any;
        const before = g.joePages;
        g.joePages = { ...(before || {}), default: { html: '<html></html>' } };
        try {
            const cases: Array<[string, string]> = [
                ['افحص الروابط المكسورة في موقعي', 'browser_check_links'],
                ['دقّق السيو في موقعي', 'browser_seo_audit'],
                ['حوّل الصفحة إلى PDF', 'browser_save_pdf'],
                ['دقّق التباين وإمكانية الوصول', 'browser_contrast_audit'],
                ['افحص الاستجابة على الجوال', 'browser_responsive_check'],
            ];
            for (const [goal, want] of cases) {
                expect({ goal, tool: capabilityRoute(goal, { sessionId: 'default' })?.tool }).toEqual({ goal, tool: want });
            }
            // an INSPECT verb must never land on a BUILDER
            for (const [goal] of cases) {
                const t = capabilityRoute(goal, { sessionId: 'default' })?.tool || '';
                expect(t).not.toMatch(/_builder$|^react_project$|^web_page_builder$|^scaffold_/);
            }
        } finally { g.joePages = before; }
    });

    it('…and refuses when it cannot feed the tool, or when nobody asked for action', () => {
        const { capabilityRoute } = require('../core/orchestrator/toolCatalog');
        // no live page and no url in the sentence: the tool could only answer
        // «url is required», so the router must decline
        expect(capabilityRoute('دقّق السيو في الصفحة', { sessionId: 'nothing-here-at-all' })).toBeNull();
        // a question is a question
        expect(capabilityRoute('ما رأيك في الألوان؟', { sessionId: 'default' })).toBeNull();
        expect(capabilityRoute('شكراً لك', { sessionId: 'default' })).toBeNull();
    });

    it('a question is answered, never executed', () => {
        // «ما هو أفضل تصميم لموقع مطعم؟» carried a build verb and a web noun,
        // so the BUILD path built a restaurant site in reply to a question.
        expect(SRC('core', 'orchestrator', 'PlanningEngine.ts')).toContain('const isQuestion =');
        expect(SRC('core', 'orchestrator', 'PlanningEngine.ts')).toMatch(/const buildVerb = !isQuestion/);
    });

    it('a plan is one job, not two: a step that depends on another RECEIVES its output', () => {
        // `dependsOn` used to be pure ordering — «افحص ثم اكتب تقريراً بالنتيجة»
        // wrote the WORDS «تقرير بالنتائج» and threw the findings away, because
        // the planning prompt never taught the {{FROM:id}} the executor
        // understands. Proven live in verify_plan_dataflow.ts; locked here.
        const { PlanningEngine } = require('../core/orchestrator/PlanningEngine');
        expect(String(PlanningEngine.generateDynamicDag)).toContain('{{FROM:');

        const wired = PlanningEngine.wireDataFlow([
            { id: 'scan', tool: 'shell_execute', input: {}, dependsOn: [] },
            { id: 'report', tool: 'write_file', input: { path: 'r.md', content: 'تقرير بالنتائج' }, dependsOn: ['scan'] },
        ]);
        expect(wired[1].input.content).toContain('{{FROM:scan}}');
        // and the payload the planner authored itself is never overwritten
        const authored = 'م'.repeat(500);
        const kept = PlanningEngine.wireDataFlow([
            { id: 'scan', tool: 'shell_execute', input: {}, dependsOn: [] },
            { id: 'report', tool: 'write_file', input: { path: 'r.md', content: authored }, dependsOn: ['scan'] },
        ]);
        expect(kept[1].input.content).toBe(authored);
    });

    it('…and a broken graph is repaired instead of ending the run', () => {
        const { PlanningEngine } = require('../core/orchestrator/PlanningEngine');
        // a dependency on a step that does not exist froze the loop until
        // «Execution stopped»; a cycle did the same; two steps sharing an id
        // made the completed-set smaller than the graph forever.
        const repaired = PlanningEngine.wireDataFlow([
            { id: 'a', tool: 'central_answer', input: {}, dependsOn: ['ghost', 'a'] },
            { id: 'a', tool: 'central_answer', input: {}, dependsOn: ['a'] },
            { id: 'c', tool: 'central_answer', input: {}, dependsOn: ['a'] },
        ]);
        expect(new Set(repaired.map((s: any) => s.id)).size).toBe(3);
        const done = new Set<string>();
        for (let i = 0; i <= repaired.length; i++) {
            const ready = repaired.filter((s: any) => !done.has(s.id) && s.dependsOn.every((d: string) => done.has(d)));
            if (!ready.length) break;
            ready.forEach((s: any) => done.add(s.id));
        }
        expect(done.size).toBe(3);
        // a reference must be a declared dependency, or it resolves to nothing
        const ref = PlanningEngine.wireDataFlow([
            { id: 'scan', tool: 'shell_execute', input: {}, dependsOn: [] },
            { id: 'save', tool: 'write_file', input: { path: 'r.md', content: '{{FROM:scan}}' }, dependsOn: [] },
        ]);
        expect(ref[1].dependsOn).toContain('scan');
        // an unknown id is never written verbatim into the user's file
        const ghost = PlanningEngine.wireDataFlow([
            { id: 'a', tool: 'shell_execute', input: {}, dependsOn: [] },
            { id: 'b', tool: 'write_file', input: { path: 'r.md', content: 'X{{FROM:nowhere}}Y' }, dependsOn: [] },
        ]);
        expect(ghost[1].input.content).toBe('XY');
        // and the executor never stalls on an edge that names nothing
        expect(SRC('orchestration', 'AgentOrchestrator.ts')).toContain('|| !knownIds.has(depId)');
    });

    it('the whole run answers the user, and never in JSON', () => {
        // Measured on a real two-step run of «افحص الروابط ثم اكتب تقريراً»:
        // {"collect":{"content":"…3 روابط مكسورة…"},"report":{"success":true}}
        // and the chat message was the string `{"success":true}` — the findings
        // discarded, an object printed where a sentence belongs.
        const { composeAnswer } = require('../core/orchestrator/answerComposer');
        const { AgentLoopService } = require('../modules/services/AgentLoopService');
        const steps = [
            { id: 'collect', task: 'اقرأ نتائج الفحص', status: 'completed', result: { content: 'وجدتُ 3 روابط مكسورة' } },
            { id: 'report', task: 'اكتب التقرير', status: 'completed', result: { success: true } },
        ];
        const answer = composeAnswer(steps, 'ar');
        expect(answer).toContain('روابط مكسورة');
        expect(answer).not.toMatch(/[{}]/);
        // one speaking step still answers exactly as it always did
        expect(composeAnswer([{ id: 'a', task: 'x', status: 'completed', result: { answer: 'الجواب' } }], 'ar')).toBe('الجواب');
        // a run with nothing to say says what it DID, in the user's language
        expect(composeAnswer([{ id: 'a', task: 'أنشئ المجلد', status: 'completed', result: { ok: true } }], 'ar'))
            .toContain('أنشئ المجلد');
        // and the function that builds the chat message really uses it
        expect(AgentLoopService.extractAnswer({ ok: true, result: {}, steps }, 'ar')).toBe(answer);
        // the old walk-backwards path must never stringify an object either
        expect(AgentLoopService.extractAnswer({ ok: true, result: { a: { success: true } } }, 'ar')).not.toMatch(/[{}]/);
    });

    it('a run that failed halfway still reports the work that survived', () => {
        // Measured: two files written, the third step failed, and the whole
        // reply was «⚠️ File not found» — work invisible, error unplaceable,
        // English inside an Arabic session.
        const { composeFailure } = require('../core/orchestrator/answerComposer');
        const text = composeFailure([
            { id: 'build', task: 'ابنِ الصفحة', status: 'completed', result: { success: true } },
            { id: 'deploy', task: 'انشر الموقع', status: 'failed' },
        ], 'File not found', 'ar');
        expect(text).toContain('انشر الموقع');     // which step
        expect(text).toContain('File not found');  // the real detail, kept
        expect(text).toContain('ابنِ الصفحة');      // what survived
        expect(text).toMatch(/^توقّفت عند الخطوة/);  // the user's language
        // and the orchestrator must actually hand the steps to that function
        expect(SRC('orchestration', 'AgentOrchestrator.ts')).toMatch(/giveUp = .*steps: runSteps\(dag\)/s);
        expect(SRC('modules', 'services', 'AgentLoopService.ts')).toContain('composeFailure(');
    });

    it('a terminal never changes hands, and its output never sprays', () => {
        // Measured with two signed-in users (verify_browser_terminal_wiring.ts):
        // user B sent one `terminal_input` carrying A's terminal id, the owner
        // map OVERWROTE, B's command ran in A's live shell and A's output began
        // arriving on B's socket.
        const ws = SRC('api', 'ws.ts');
        expect(ws).toContain('if (existing && existing.userId !== uid) return;');
        expect(ws).toContain('refused terminal_input on');
        // an unowned shell line must be dropped, not shown to whoever is connected
        expect(ws).toMatch(/dropped terminal_output with no resolvable owner/);
        // the two owner registries that existed and were NEVER called
        expect(SRC('modules', 'services', 'AgentLoopService.ts')).toContain('registerRunOwner(runId');
        expect(SRC('modules', 'services', 'AgentLoopService.ts')).toContain('registerSessionOwner(sessionId');
        expect(SRC('modules', 'services', 'ToolService.ts')).toContain('registerSessionOwner(contextSessionId');
        // the panel's create call carries no userId — it must come from the context
        expect(SRC('modules', 'tools', 'definitions', 'TaskInteractionTools.ts'))
            .toContain("String(input?.userId || context?.userId || '').trim()");
    });

    it('one product, one browser launcher', () => {
        // Each of these had its own launch options, so a machine without the
        // bundled Chromium got a working browser panel and a screenshot tool
        // that died with «Executable doesn't exist».
        for (const f of [
            ['modules', 'tools', 'definitions', 'ScreenshotTool.ts'],
            ['modules', 'tools', 'definitions', 'BrowserVisionTool.ts'],
            ['core', 'quality', 'app-audit.ts'],
            ['core', 'quality', 'visual-audit.ts'],
            ['core', 'quality', 'behaviour-audit.ts'],
            ['core', 'design', 'reference.ts'],
        ]) {
            expect({ file: f.join('/'), uses: /getChromiumLaunchOptions/.test(SRC(...(f as [string]))) })
                .toEqual({ file: f.join('/'), uses: true });
        }
    });

    it('the browser skills survive the compiler and a poisoned tab', () => {
        // Measured on a real page (verify_browser_tools_live.ts): FOURTEEN of the
        // 29 browser tools died with «ReferenceError: __name is not defined» —
        // the helper a name-keeping compiler wraps around every function sent
        // into the page with page.evaluate. The shim belongs where every
        // browser tool's page is born, not in three audit modules privately.
        expect(SRC('modules', 'browser', 'manager.ts')).toContain('globalThis.__name = globalThis.__name');
        expect(SRC('modules', 'browser', 'manager.ts')).toMatch(/context\.addInitScript\(/);
        // One unreachable site used to make every LATER site unopenable: the tab
        // sat on chrome-error and the next navigation was reported as
        // «interrupted by another navigation».
        const smart = SRC('modules', 'tools', 'definitions', 'BrowserSmartTools.ts');
        expect(smart).toMatch(/interrupted by another navigation/);
        expect(smart).toContain("page.goto('about:blank'");
        // and «forbidden» is never the whole answer
        expect(SRC('modules', 'tools', 'definitions', 'BrowserRunTool.ts'))
            .toContain('هذه الجلسة تخصّ مستخدماً آخر');
        expect(SRC('modules', 'tools', 'definitions', 'BrowserRunTool.ts'))
            .toContain("context?.userId");
    });

    it('Joe can see the terminal, and it is the same world his tools work in', () => {
        // Measured before the fix: «ما آخر خطأ ظهر في الترمنال» scored
        // terminal_manager at ZERO — the one tool that can read the panel was
        // invisible to the planner, so the question could only be answered from
        // imagination. English scraped by at 7.8; Arabic found nothing.
        const { selectToolsFor } = require('../core/orchestrator/toolCatalog');
        for (const g of ['اقرأ ما في الطرفية', 'ما آخر خطأ ظهر في الترمنال', 'افتح طرفية جديدة', 'what did the terminal say']) {
            const names = selectToolsFor(g, 12).map((t: any) => t.name);
            expect({ g, sees: names.includes('terminal_manager') }).toEqual({ g, sees: true });
        }
        // and the panel's shell starts in the session's workspace, not in Joe's
        // own source tree — proven live in verify_terminal_brain.ts
        expect(SRC('modules', 'tools', 'definitions', 'TaskInteractionTools.ts')).toContain('cwd: workDir');
        expect(SRC('modules', 'tools', 'definitions', 'TaskInteractionTools.ts'))
            .toContain("getWorkspaceRoot(input?.workspaceId || context?.workspaceId)");
    });

    it('every frame of a run belongs to the person who started it', () => {
        // Measured end to end with two signed-in users (verify_user_journey_browser.ts):
        // the echo of the sentence the user TYPED, run_started, the thinking
        // narration, step_started, tool_started, tool_done and department_status
        // all resolved to «nobody» — and an event that belongs to nobody is
        // delivered to everybody.
        const ws = SRC('api', 'ws.ts');
        // the owner is looked for everywhere an event names its run or session
        expect(ws).toMatch(/const candidates = \[/);
        expect(ws).toContain("trimId((ev as any)?.data?.runId)");
        // …and the session is claimed at the door, before the first frame
        expect(SRC('api', 'routes', 'run.ts')).toContain('registerSessionOwner(sessionId');
        const toolSvc = SRC('modules', 'services', 'ToolService.ts');
        expect(toolSvc).toContain("data: { tool: effectiveName, input: effectiveInput, sessionId: contextSessionId }");
        expect(toolSvc).toContain("data: { tool: effectiveName, ok, sessionId: contextSessionId }");
    });

    it('an event with no address of its own inherits the run it came from', () => {
        // A static sweep of the 73 broadcast sites found FOURTEEN naming no
        // session, no run and no user — a file diff, a screenshot, shell output,
        // a task update, a notification, and «Joe needs your input», a question
        // that shown to everyone anyone could answer. Patching fourteen payloads
        // would leave the fifteenth to be written tomorrow, so the owner rides
        // in the execution context. Proven per type in verify_event_ownership.ts.
        const fw = SRC('orchestration', 'AgentExecutionFirewall.ts');
        expect(fw).toContain('public currentOwner()');
        expect(fw).toMatch(/userId\?: string; sessionId\?: string;/);
        const ws = SRC('api', 'ws.ts');
        expect(ws).toContain('executionFirewall.currentOwner?.()');
        // and the entry points declare whose run it is
        expect(SRC('orchestration', 'AgentOrchestrator.ts'))
            .toMatch(/\}, \{ userId: goal\.context\?\.userId, sessionId: goal\.context\?\.sessionId \|\| goal\.id \}\)/);
        expect(SRC('api', 'routes', 'tools.ts')).toMatch(/\}, \{ userId, sessionId \}\)/);
    });

    it('a link Joe hands out is not addressed to the reader’s own machine', () => {
        // Twenty-three sites built `http://localhost:${PORT}/…` and handed it to
        // a person — or wrote it INTO a page that gets published, so a visitor's
        // contact form posted to THEIR localhost and the message vanished.
        // PUBLIC_URL existed for this and only the sign-in flow honoured it.
        const { publicUrlFor } = require('../shared/utils/publicUrl');
        const before = process.env.PUBLIC_URL;
        try {
            process.env.PUBLIC_URL = 'https://joe.example.com/';
            expect(publicUrlFor('/artifacts/x/index.html')).toBe('https://joe.example.com/artifacts/x/index.html');
            delete process.env.PUBLIC_URL;
            process.env.PORT = '5002';
            expect(publicUrlFor('/artifacts/x/index.html')).toBe('http://localhost:5002/artifacts/x/index.html');
        } finally { if (before === undefined) delete process.env.PUBLIC_URL; else process.env.PUBLIC_URL = before; }
        // the user-facing builders go through it — no raw localhost link left
        for (const f of [
            ['modules', 'tools', 'definitions', 'WebPageBuilderTool.ts'],
            ['modules', 'tools', 'definitions', 'ProjectEditTool.ts'],
            ['core', 'design', 'forms.ts'],
        ]) {
            const src = SRC(...(f as [string]));
            expect({ file: f.join('/'), usesHelper: /publicUrlFor\(/.test(src) }).toEqual({ file: f.join('/'), usesHelper: true });
            expect({ file: f.join('/'), rawArtifactLink: /http:\/\/localhost:\$\{PORT\}\/artifacts/.test(src) })
                .toEqual({ file: f.join('/'), rawArtifactLink: false });
        }
    });

    it('publishing reads what it publishes, and says what will not work', () => {
        // The quietest failure in the product: a published page whose contact
        // form posts to `localhost`. The visitor sees nothing wrong, the request
        // goes to THEIR machine, the owner gets no message and no error, and
        // neither ever finds out. Publishing never read the files it copied.
        const { privateEndpointWarning, findPrivateEndpoints } = require('../shared/utils/privateEndpoints');
        const fs = require('fs'); const os = require('os'); const path = require('path');
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-'));
        try {
            fs.writeFileSync(path.join(dir, 'index.html'), `<form action="http://localhost:5002/api/public/forms/s"></form>`);
            expect(findPrivateEndpoints(dir)).toHaveLength(1);
            expect(privateEndpointWarning(dir)).toContain('PUBLIC_URL');
            // a genuinely public site must produce silence, or the warning is noise
            fs.writeFileSync(path.join(dir, 'index.html'), `<form action="https://joe.example.com/api/x"></form>`);
            expect(privateEndpointWarning(dir)).toBe('');
        } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* cleanup */ } }
        const deploy = SRC('modules', 'tools', 'definitions', 'DeployPagesTool.ts');
        expect(deploy).toContain('privateEndpointWarning(stage)');
        expect(deploy).toMatch(/\$\{privateNote\}`/);   // it reaches the message the user reads
    });

    it('a tool that apologises did not succeed', () => {
        // Measured with every provider unreachable: central_answer,
        // browser_summarize and browser_translate all returned ok:true carrying
        // «تعذّر الوصول إلى محرّك الذكاء» as their answer. The step was marked
        // completed, the run claimed success, and — because a completed node's
        // result is what {{FROM:…}} hands to the next step — the apology was
        // written into the user's report where the findings belong.
        const { isApologyOnly } = require('../shared/utils/honestResult');
        const { PROVIDER_FAILURE_PREFIX } = require('../core/llm/intelligent-router');
        const apology = `${PROVIDER_FAILURE_PREFIX} (لم يستجب أي مزوّد).`;
        expect(isApologyOnly({ message: apology })).toBe(true);
        expect(isApologyOnly({ message: `📄 ملخّص الصفحة: ${apology}`, url: 'http://x' })).toBe(true);
        // …but a real artifact keeps its success
        expect(isApologyOnly({ message: apology, previewUrl: 'http://x/y', path: 'a/index.html' })).toBe(false);
        expect(isApologyOnly({ message: '🔗 كل الروابط تعمل.' })).toBe(false);
        // asked once, centrally, of every tool
        expect(SRC('modules', 'services', 'ToolService.ts')).toContain('if (ok && isApologyOnly(output))');
        // and a dead brain is not an answer to surface as one
        expect(SRC('orchestration', 'AgentOrchestrator.ts'))
            .toContain('if (isDirectAnswer && !isProviderFailure(result.error))');
    });

    it('a spent daily quota is announced, and the button really moves', () => {
        // Joe already survived a spent quota by moving to the free/local mesh —
        // silently. The provider button went on showing the dead provider, so
        // the user could not tell why answers changed, and every new run asked
        // for a quota that was gone. Proven live against a real 429 in
        // verify_quota_switch.ts; locked here so the three halves stay together.
        const router = SRC('core', 'llm', 'intelligent-router.ts');
        expect(router).toContain('announceQuotaSwitch(routeKey, cfgProvider, cfgModel, waitMs)');
        expect(router).toContain("type: 'provider_quota'");
        expect(router).toMatch(/const last = quotaAnnounced\.get\(routeKey\)/);   // once per window
        const composer = WEB('components', 'CommandComposer.tsx');
        expect(composer).toContain("msg.type === 'provider_quota'");
        expect(composer).toContain('setActiveProvider(target)');
        expect(composer).toContain('setSelectedProvider(target)');
        expect(composer).toContain("localStorage.setItem('active_provider', target)");
    });

    it('independent steps run together — but never the ones sharing a live resource', () => {
        // The plan modelled independence from the day it was a DAG; the executor
        // awaited each node in turn and threw it away. Measured: three
        // independent two-second steps took 6.1s, then 2.0s. Proven live in
        // verify_parallel_execution.ts, including that the browser's three tools
        // never overlap — one page, one at a time.
        const orch = SRC('orchestration', 'AgentOrchestrator.ts');
        expect(orch).toContain('const batch = pickParallelBatch(readyNodes)');
        expect(orch).toMatch(/await Promise\.all\(batch\.map\(/);
        expect(orch).toContain('const SERIAL_TOOLS =');
        // the shared-resource families must all be in the serial class
        for (const family of ['browser_', 'project_', 'react_project', 'api_project',
            'web_page_builder', 'deploy_', 'git_', 'terminal_manager']) {
            expect({ family, serial: new RegExp(family.replace('_', '_?')).test(orch.match(/const SERIAL_TOOLS = [^;]+/)![0]) })
                .toEqual({ family, serial: true });
        }
        // and a written command no longer needs a model to be run
        expect(orch).toContain("node.tool === 'shell_execute' && typeof nodeInput?.command === 'string'");
    });

    it('the mind never schedules work the tools cannot be fed', () => {
        // 132 of 151 tools declare required arguments; the sanitiser filled
        // three of them by hand. Measured on a sentence that CONTAINED the
        // answer — «دقّق السيو في https://example.com» → browser_seo_audit with
        // input {} → ok=false, «no_url». Right tool, argument in plain sight,
        // and the intelligence layer already knew how to fill it.
        const { PlanningEngine } = require('../core/orchestrator/PlanningEngine');
        const filled = PlanningEngine.fillRequiredArgs(
            [{ id: 'a', description: 'دقّق السيو', tool: 'browser_seo_audit', input: {}, dependsOn: [] }],
            'دقّق السيو في https://example.com', {});
        expect(filled[0].tool).toBe('browser_seo_audit');
        expect(filled[0].input.url).toBe('https://example.com');
        // what the planner chose is never overwritten
        const kept = PlanningEngine.fillRequiredArgs(
            [{ id: 'a', description: 'x', tool: 'browser_seo_audit', input: { url: 'https://chosen.example' }, dependsOn: [] }],
            'دقّق السيو في https://other.example', {});
        expect(kept[0].input.url).toBe('https://chosen.example');
        // and an argument that genuinely is not there becomes a question, by name
        const asked = PlanningEngine.fillRequiredArgs(
            [{ id: 'a', description: 'املأ النموذج', tool: 'browser_fill_form', input: {}, dependsOn: [] }],
            'املأ النموذج', {});
        expect(asked[0].tool).toBe('central_answer');
        expect(asked[0].input.question).toContain('fields');
        // …wired into the real plan path, not a helper nobody calls
        expect(SRC('core', 'orchestrator', 'PlanningEngine.ts'))
            .toContain('PlanningEngine.fillRequiredArgs(steps as any, userGoal, context)');
    });

    it('the word «المتصفّح» does not mean «describe» — the field misroute', async () => {
        // From the user's session log: «قم باستخدام المتصفح وافتح على جوجل وابحث
        // عن دوله فلسطين» typed «قم باستخدام المتصفح عن د» into Google and
        // finished with an IP address. Arabic has no \b, `صِ?ف` was unanchored,
        // and «المتصفّح» contains «صف» — so the word BROWSER read as «describe»
        // and the request went to the free-form agent instead of the search tool.
        const { PlanningEngine } = require('../core/orchestrator/PlanningEngine');
        const plan = async (goal: string) => (await PlanningEngine.generatePlan(
            { intent: { goal, complexity: 'low', riskLevel: 'low', rawIntent: {} } })).steps[0];

        const s = await plan('قم باستخدام المتصفح وافتح على جوجل وابحث عن دوله فلسطين');
        expect(s.tool).toBe('browser_search');
        expect(String(s.input.query).trim()).toBe('دوله فلسطين');
        // and the cases the fix must not eat
        expect((await plan('افتح ويكيبيديا ولخّص عن ابن سينا')).tool).toBe('browser_run');
        expect((await plan('سجّل الدخول على جيت هاب')).tool).toBe('browser_run');
        // the deterministic search gate must come FIRST, as its own comment claims
        const src = SRC('core', 'orchestrator', 'PlanningEngine.ts');
        expect(src.indexOf('[SEARCH HAS PRIORITY]')).toBeLessThan(src.indexOf('[BROWSER AGENT FAST-PATH]'));
    });

    it('an answer that is about nothing is dropped, not passed on', () => {
        // Field log: asked to search for «دوله فلسطين», the browser loop finished
        // with «حسناً، عنوان IP: 2a00:… الوقت: …» and the run reported SUCCESS.
        // The evidence to catch it — the page's url, title and snippet — was
        // already collected by that same loop and never looked at.
        const { judgeAnswer } = require('../modules/browser/grounding');
        const bad = judgeAnswer(
            'حسناً، عنوان IP: 2a00:1d34:7472:3300:49f6:fd53:f5d6:e25c الوقت: 2026-08-04T15:38:54Z',
            'ابحث عن دوله فلسطين', { url: 'https://www.google.com/search', title: 'Google' });
        expect(bad.grounded).toBe(false);
        // …and the guard must not reject real work
        expect(judgeAnswer('فلسطين دولة في غرب آسيا وعاصمتها المعلنة القدس.',
            'ابحث عن دوله فلسطين', { title: 'دولة فلسطين' }).grounded).toBe(true);
        expect(judgeAnswer('تم تسجيل الدخول', 'سجّل الدخول على جيت هاب', {}).grounded).toBe(true);
        // wired into the loop's own done-branch, not a helper nobody calls
        const loop = SRC('modules', 'browser', 'reactLoop.ts');
        expect(loop).toContain('judgeAnswer(String(action.answer || \'\'), task, evidence)');
        expect(loop).toContain('ungroundedMessage(task, evidence)');
    });

    it('an application request is not answered with a page — «شرائح عليها صور»', async () => {
        // The user's verdict, measured: «ابني تطبيق خرائط شبيه بخرائط جوجل» came
        // back as index.html + styles.css — a POSTER of a maps app. Five of six
        // real system requests got a static page or just chat, while
        // react_project and api_project sat unused.
        const { PlanningEngine } = require('../core/orchestrator/PlanningEngine');
        const tools = async (goal: string) => (await PlanningEngine.generatePlan(
            { intent: { goal, complexity: 'high', riskLevel: 'low', rawIntent: {} } }))
            .steps.map((s: any) => s.tool).join(' + ');

        expect(await tools('ابني تطبيق خرائط شبيه بتطبيق خرائط جوجل')).toMatch(/react_project/);
        expect(await tools('ابن لي نظام حجوزات عيادة مع لوحة تحكم للطبيب')).toMatch(/api_project \+ react_project/);
        // …and a page request still gets a page
        expect(await tools('ابنِ لي صفحة هبوط لمقهى')).toMatch(/web_page_builder/);
        // the app depends on its backend, so it is wired to a server that exists
        const sys = await PlanningEngine.generatePlan({
            intent: { goal: 'اعمل تطبيق محادثة فوري بين المستخدمين', complexity: 'high', riskLevel: 'low', rawIntent: {} } });
        const api = sys.steps.find((x: any) => x.tool === 'api_project');
        const app = sys.steps.find((x: any) => x.tool === 'react_project');
        expect(app.dependsOn).toContain(api.id);
        // the classifier is deterministic — it holds when the brain is down
        expect(PlanningEngine.classifyBuildScope('ابني تطبيق خرائط')).toBe('app');
        expect(PlanningEngine.classifyBuildScope('نظام حجوزات مع تسجيل دخول')).toBe('system');
        expect(PlanningEngine.classifyBuildScope('صفحة هبوط لمنتج')).toBe('page');
    });

    it('a tool name the planner invents never reaches the executor', () => {
        const { PlanningEngine } = require('../core/orchestrator/PlanningEngine');
        const out = PlanningEngine.sanitizeSteps([
            { id: 'a', tool: 'a_tool_that_never_existed', description: 'x', input: {}, dependsOn: [] },
            { id: 'b', tool: 'ls', description: 'y', input: {}, dependsOn: [] },
        ] as any, 'goal');
        expect(out[0].tool).toBe('central_answer');
        expect(NAMES_ALL).toContain(out[1].tool);
    });
});

/**
 * AN APPLICATION IS A PROGRAM — «كما قلت لك النظام فقط هو معرض صور وكلمات وليس
 * تطبيقات حقيقية». The scope fix earned a real Vite project; this locks what
 * goes INSIDE it. Measured before the fix: a maps app, a task manager, a chat
 * app and a booking system produced byte-identical component lists (Hero,
 * Features, Steps, Cta, Faq, Contact) plus a restaurant menu and two invented
 * customers — and no map, no task, no message, no booking.
 */
describe('an application build ships a program, not a brochure', () => {
    const { detectAppKind, blueprintFor } = require('../core/design/app-blueprints');

    it('reads the domain from the request, without a model', () => {
        expect(detectAppKind('ابني تطبيق خرائط شبيه بتطبيق خرائط جوجل')).toBe('maps');
        expect(detectAppKind('اعمل لي برنامج إدارة مهام بسيط')).toBe('tasks');
        expect(detectAppKind('اعمل تطبيق محادثة فوري بين المستخدمين')).toBe('chat');
        expect(detectAppKind('ابن لي نظام حجوزات عيادة مع لوحة تحكم للطبيب')).toBe('booking');
        expect(detectAppKind('ابني نظام إدارة مخزون')).toBe('inventory');
        expect(detectAppKind('ابني تطبيق طقس')).toBe('weather');
        // a presentation site is NOT an app — that path must keep working
        expect(detectAppKind('ابنِ لي صفحة هبوط لمقهى')).toBeNull();
        expect(detectAppKind('صمم لي قائمة طعام لمطعم')).toBeNull();
        // and a page ABOUT an app is still a page
        expect(detectAppKind('صفحة هبوط لتطبيق خرائط')).toBeNull();
    });

    it('a maps app really depends on a map library', () => {
        expect(blueprintFor('maps', 'خرائط', true).deps.leaflet).toBeTruthy();
        expect(blueprintFor('maps', 'خرائط', true).engine).toBe('map');
    });

    it('each domain carries its own schema — never a restaurant menu', () => {
        const tasks = blueprintFor('tasks', 'مهام', true);
        expect(tasks.fields.map((f: any) => f.key)).toEqual(['title', 'notes', 'priority', 'due', 'status']);
        const booking = blueprintFor('booking', 'حجوزات', true);
        expect(booking.fields.map((f: any) => f.key)).toEqual(expect.arrayContaining(['date', 'time', 'status']));
        const inv = blueprintFor('inventory', 'مخزون', true);
        expect(inv.metrics.some((m: any) => m.kind === 'sumProduct')).toBe(true);
    });

    it('the app templates carry real behaviour, and the scaffolder reaches them', () => {
        const T = SRC('modules', 'tools', 'definitions', 'react-app-templates.ts');
        // the map is a map
        expect(T).toMatch(/tile\.openstreetmap\.org/);
        expect(T).toMatch(/nominatim\.openstreetmap\.org\/search/);
        expect(T).toMatch(/navigator\.geolocation\.getCurrentPosition/);
        // the records engine really writes, validates and exports
        expect(T).toMatch(/localStorage\.setItem/);
        expect(T).toMatch(/f\.required && !String/);
        expect(T).toMatch(/toCsv/);
        // weather asks a real forecast service, with no key to fabricate
        expect(T).toMatch(/api\.open-meteo\.com\/v1\/forecast/);
        // …and the scaffolder actually branches to all of it
        const R = SRC('modules', 'tools', 'definitions', 'ReactProjectTool.ts');
        expect(R).toMatch(/detectAppKind\(request\)/);
        expect(R).toMatch(/buildAppFiles\(appBp/);
        // an app build must not emit one brochure component
        expect(R).toMatch(/for \(const c of appBp \? \[\] : \['Navbar', \.\.\.sections, 'Footer'\]\)/);
        expect(R).toMatch(/if \(!appBp\) files\['src\/components\/AdminPanel\.jsx'\]/);
    });

    it('no fabricated person, dish or pricing tier can reach an application', () => {
        const T = SRC('modules', 'tools', 'definitions', 'react-app-templates.ts');
        for (const invented of ['سارة العتيبي', 'محمد الشهري', 'ليان القحطاني', 'طبق اليوم', 'الإصدار الكلاسيكي']) {
            expect(T).not.toContain(invented);
        }
        // and the app's content file describes a schema, never a marketing deck
        expect(T).not.toMatch(/testimonials:\s*\[/);
        expect(T).not.toMatch(/tiers:\s*\[/);
    });

    it('a real map library\'s own controls are not reported as dead links', () => {
        const A = SRC('core', 'quality', 'app-audit.ts');
        expect(A).toMatch(/class\*="leaflet"/);
    });
});

/**
 * AN EDIT ON AN APPLICATION SESSION NEVER BECOMES A NEW BROCHURE.
 *
 * From the field log, one minute after a clean 100/100 maps build:
 *   «اريد اعديل علىيه بان يعمب مسارات للتنقل من الى … مع ذكر المسافة والوقت»
 *   → semantic router -> edit_page → web_page_builder → a static HTML page
 *   about maps, with «خطة 1 — 10$ شهريا», while the React app was never opened.
 */
describe('the session\'s active artefact decides who edits it', () => {
    const plan = async (goal: string, sessionId: string) => {
        const { PlanningEngine } = require('../core/orchestrator/PlanningEngine');
        const p = await PlanningEngine.generatePlan(
            { intent: { goal, complexity: 'medium', riskLevel: 'low', rawIntent: {} } }, undefined, { sessionId });
        return (p?.steps || []).map((s: any) => s.tool).join(' + ');
    };
    const g: any = global as any;
    afterEach(() => { g.joeProjects = {}; g.joePages = {}; });

    it('an edit on a project session goes to the project editor — typos and all', async () => {
        g.joeProjects = { app1: { dir: '/tmp/x', type: 'react', updatedAt: Date.now() } };
        g.joePages = {};
        expect(await plan('اريد اعديل علىيه بان يعمب مسارات للتنقل من الى ويحدد مسار للتنقل على الخريطه مع ذكر المسافة وكم الوقت الذي نحتاجه', 'app1')).toBe('project_edit');
        expect(await plan('ضف ميزة تحديد المسار على الخريطة', 'app1')).toBe('project_edit');
        expect(await plan('اجعله يحدد الوقت اللازم للوصول', 'app1')).toBe('project_edit');
    });

    it('…and a page session still belongs to the page builder', async () => {
        g.joeProjects = {};
        g.joePages = { page1: { file: 'x.html', updatedAt: Date.now() } };
        expect(await plan('غيّر لون الأزرار إلى الأخضر', 'page1')).toBe('web_page_builder');
    });

    it('the map engine carries real directions, and the editor can upgrade an app to them', () => {
        const T = SRC('modules', 'tools', 'definitions', 'react-app-templates.ts');
        expect(T).toMatch(/router\.project-osrm\.org\/route\/v1\/driving/);
        expect(T).toMatch(/L\.polyline\(/);
        expect(T).toMatch(/leg\.distance/);
        expect(T).toMatch(/leg\.duration/);
        // the upgrade path: regenerate from the blueprint, keep the storage key
        const E = SRC('modules', 'tools', 'definitions', 'ProjectEditTool.ts');
        expect(E).toMatch(/ENGINE_ABILITY/);
        expect(E).toMatch(/buildAppFiles\(bp, \{[\s\S]{0,200}storeKey: appMeta\.storeKey/);
        expect(E).toMatch(/app upgrade reverted/);
    });
});

/**
 * JOE DOES NOT OVER-CLAIM.
 *
 * Three field failures in one session, all the same disease:
 *   • a full platform specification (Next.js, FastAPI, PostGIS, portals,
 *     offline maps, an AI assistant) → Joe scaffolded its small Leaflet app
 *     and reported plain success, silent about the other ninety percent;
 *   • «زر get directions لا يعمل» → the upgrade path regenerated index.html
 *     and announced the directions feature the app already had, without ever
 *     looking at the reported fault;
 *   • «the current route system is not sufficient, transform it into
 *     turn-by-turn navigation» → a THIRD copy of the app, built from scratch.
 */
describe('what was not built is said out loud', () => {
    it('an oversized specification is answered with an explicit gap list', () => {
        const R = SRC('modules', 'tools', 'definitions', 'ReactProjectTool.ts');
        expect(R).toMatch(/const UNMET:/);
        expect(R).toMatch(/unmetBlock/);
        // the gap list must name the big-ticket asks, not hand-wave
        for (const owed of ['next\\.?js', 'fastapi', 'postgis', 'kubernetes', 'offline']) {
            expect(R.toLowerCase()).toMatch(new RegExp(owed));
        }
    });

    it('an upgrade that changed no logic does not announce a feature', () => {
        const E = SRC('modules', 'tools', 'definitions', 'ProjectEditTool.ts');
        expect(E).toMatch(/const engineChanged = changed\.some/);
        expect(E).toMatch(/bugReport/);
        // a bug report gets a real browser audit rather than a headline
        expect(E).toMatch(/auditBuiltApp/);
    });

    it('a bug report or an enhancement edits the app instead of rebuilding it', async () => {
        const { PlanningEngine } = require('../core/orchestrator/PlanningEngine');
        const g: any = global as any;
        g.joeProjects = { s1: { dir: '/tmp/x', type: 'react', updatedAt: Date.now() } };
        g.joePages = {};
        const tools = async (goal: string) => (await PlanningEngine.generatePlan(
            { intent: { goal, complexity: 'medium', riskLevel: 'low', rawIntent: {} } }, undefined, { sessionId: 's1' }))
            .steps.map((s: any) => s.tool).join(' + ');
        expect(await tools('زر get directions لا يعمل بشكل صحيح')).toBe('project_edit');
        expect(await tools('The current route system is not sufficient. I want to transform it into a real turn-by-turn navigation system.')).toBe('project_edit');
        g.joeProjects = {}; g.joePages = {};
    });

    it('the map engine really navigates — GPS, voice, reroute, and an honest limit', () => {
        const T = SRC('modules', 'tools', 'definitions', 'react-app-templates.ts');
        expect(T).toMatch(/steps=true/);                        // maneuvers, not just a line
        expect(T).toMatch(/navigator\.geolocation\.watchPosition/);
        expect(T).toMatch(/SpeechSynthesisUtterance/);
        expect(T).toMatch(/rerouteFrom/);
        expect(T).toMatch(/clearWatch/);                        // the watch is released
        // Leaflet cannot rotate its map — the code says so rather than pretending
        expect(T).toMatch(/Leaflet does not rotate its map/);
    });
});

/**
 * A SECOND CHAT MUST NOT WEAR THE FIRST ONE'S BUILD.
 *
 * Reported from the field: run a build in session one, open a second chat,
 * and its Logs and Preview still showed session one's work. The panel state
 * was a single global value and every panel event was applied to whatever
 * conversation happened to be on screen — so a run still going in session one
 * kept writing into session two and flipping its tabs.
 */
describe('the panels belong to a session', () => {
    it('panel state is archived per session and restored on return', () => {
        const L = WEB('components', 'JoeIDELayout.tsx');
        expect(L).toMatch(/panelArchive/);
        expect(L).toMatch(/panelArchive\.current\.set\(previous/);
        expect(L).toMatch(/setLiveFiles\(saved\?\.liveFiles \|\| \[\]\)/);
    });

    it('an event naming another session never paints this one', () => {
        const L = WEB('components', 'JoeIDELayout.tsx');
        expect(L).toMatch(/const belongsHere/);
        expect(L).toMatch(/if \(!belongsHere\(event\)\) return;/);
        const J = WEB('pages', 'Joe.tsx');
        expect(J).toMatch(/const mine = \(msg: any\)/);
        expect(J).toMatch(/if \(!mine\(msg\)\) return;/);
    });

    it('the preview URL is filed under the session that produced it', () => {
        const J = WEB('pages', 'Joe.tsx');
        expect(J).toMatch(/previewBySession/);
        expect(J).toMatch(/previewBySession\.current\.set\(activeSessionId, url\)/);
        expect(J).toMatch(/setPreviewUrl\(activeSessionId \? previewBySession\.current\.get\(activeSessionId\) : undefined\)/);
    });
});

/**
 * THE FIFTH ENGINE — the honest half of «ابنِ منصة تواصل اجتماعي».
 *
 * A full social platform is ten systems. This is the part that can be
 * delivered as WORKING SOFTWARE: identity, a composer with a real image, a
 * feed that persists, likes that count, comments that thread, following that
 * filters, a profile. Everything else stays on the gap list, by name.
 */
describe('a social request gets a feed, not a messenger and not a brochure', () => {
    const { detectAppKind, blueprintFor, uncoveredFeatures } = require('../core/design/app-blueprints');

    it('the domain is read from the request, in both languages', () => {
        expect(detectAppKind('Build a next-generation social media platform with Posts and followers')).toBe('social');
        expect(detectAppKind('ابنِ منصة تواصل اجتماعي فيها منشورات ومتابعين')).toBe('social');
        // …and a pure messenger is still a messenger
        expect(detectAppKind('اعمل تطبيق محادثة فوري بين المستخدمين')).toBe('chat');
    });

    it('the engine is a feed with its own blueprint', () => {
        const bp = blueprintFor('social', 'منصة تواصل', true);
        expect(bp.engine).toBe('social');
        expect(bp.entityMany).toBe('المنشورات');
    });

    it('the feed template is a real program', () => {
        const T = SRC('modules', 'tools', 'definitions', 'react-app-templates.ts');
        expect(T).toMatch(/export function fileSocialAppJsx/);
        expect(T).toMatch(/toggleLike/);
        expect(T).toMatch(/addComment/);
        expect(T).toMatch(/toggleFollow/);
        expect(T).toMatch(/readImage/);           // a real photo, downscaled before storage
        expect(T).toMatch(/createStore\(content\.storeKey \+ ':posts'\)/);
        // and no invented people anywhere in it
        for (const invented of ['سارة العتيبي', 'محمد الشهري', 'ليان القحطاني']) {
            expect(T).not.toContain(invented);
        }
    });

    it('its server stores posts, and what is still missing is named', () => {
        const { apiResourceForKind } = require('../modules/tools/definitions/ApiProjectTool');
        expect(apiResourceForKind('generic', false, 'a social network with posts and followers').resource).toBe('posts');
        const gap = uncoveredFeatures('Build a social platform.\n\n- Posts\n- Stories\n- Live streaming\n- Ads platform', 'social', true);
        expect(gap).not.toContain('Posts');
        expect(gap).toEqual(expect.arrayContaining(['Stories', 'Live streaming', 'Ads platform']));
    });
});

/**
 * THE LINK TO THE SERVER MUST BE REAL, NOT DECORATIVE.
 *
 * The social build announced «مشروع كامل: واجهة + خادم» and shipped a server
 * whose table was a CATALOGUE (name/details/price) behind an owner Bearer
 * token. The feed app posts `{author, handle, text}` with no token, so every
 * write was a 400 and every read was a shape the app could not parse — the
 * badge quietly stayed "local" and nobody saw a line in the log.
 *
 * The invariant: when the front end is a feed, the server it ships with must
 * accept THAT app's request and answer in a shape THAT app can read.
 */
describe('a feed ships with a feed server', () => {
    const AP = () => SRC('modules', 'tools', 'definitions', 'ApiProjectTool.ts');

    it('a social request resolves to posts, and posts is recognised as a feed', () => {
        const { apiResourceForKind, isFeedResource } = require('../modules/tools/definitions/ApiProjectTool');
        // The resource is read from the REQUEST (the probe), not from the page
        // kind — a social platform is not a restaurant or a store.
        expect(apiResourceForKind('generic', true, 'ابنِ منصة تواصل اجتماعي فيها منشورات ومتابعين').resource).toBe('posts');
        expect(isFeedResource('posts')).toBe(true);
        expect(isFeedResource('products')).toBe(false);
    });

    it('its table carries a post, not a product', () => {
        const t = AP();
        expect(t).toMatch(/function filePostsDbJs/);
        const feedDb = t.slice(t.indexOf('function filePostsDbJs'), t.indexOf('function filePostsServerJs'));
        for (const col of ['author', 'handle', 'text', 'image']) expect(feedDb).toContain(col);
        expect(feedDb).not.toMatch(/price TEXT/);
    });

    it('members post — the write is public, and the body is the app\'s body', () => {
        const t = AP();
        const srv = t.slice(t.indexOf('function filePostsServerJs'), t.indexOf('function filePostsReadme'));
        expect(srv).toMatch(/app\.post\('\/api\/posts'/);
        expect(srv).toMatch(/const \{ author, handle, text, image, at \} = req\.body/);
        expect(srv).not.toMatch(/Bearer/);          // no owner token on a social feed
        expect(srv).not.toMatch(/requireOwner/);
        expect(srv).toMatch(/empty_post/);          // …but an empty post is still refused
    });

    it('the answer is a shape the generated app can actually read', () => {
        const srv = AP();
        expect(srv).toMatch(/res\.json\(\{ ok: true, posts, data: posts \}\)/);
        const T = SRC('modules', 'tools', 'definitions', 'react-app-templates.ts');
        expect(T).toMatch(/Array\.isArray\(d && d\.posts\) \? d\.posts/);
        expect(T).toMatch(/Array\.isArray\(d && d\.rows\) \? d\.rows/);
    });

    it('the feed branch is the one that actually gets written to disk', () => {
        const t = AP();
        expect(t).toMatch(/const feed = isFeedResource\(resource\)/);
        expect(t).toMatch(/'server\.js': filePostsServerJs\(brand\)/);
        expect(t).toMatch(/'db\.js': filePostsDbJs\(\)/);
    });
});

/**
 * TWO THINGS THE USER WATCHED HAPPEN AND SHOULD NOT HAVE.
 *
 * «في البداية قام بتشغيل الثيرمال ثم انتقل الى شاشة اللوغز» — the terminal
 * PANEL calls terminal_manager on mount, and that call was in the list of
 * tools that yank the workspace to the Terminal tab. A panel booting itself
 * is not a command worth watching.
 *
 * «في اثناء البناء تم فتح المتصفح … بدون اي فائده» — the self-QA honours
 * BROWSER_HEADED, which exists for when the user ASKED to watch Joe drive a
 * site. He did not ask to watch an internal check.
 */
describe('nothing opens on screen that the user did not ask for', () => {
    it('a panel calling terminal_manager never steals the tab', () => {
        const J = WEB('pages', 'Joe.tsx');
        const line = J.split('\n').find(l => l.includes('setWorkspaceTab(\'terminal\')') === false && l.includes('.includes(toolName)'));
        expect(line).toBeTruthy();
        expect(line).not.toContain('terminal_manager');
        expect(line).toContain('run_command');       // the real commands still do
    });

    it('the self-QA browser is headless whatever the environment says', () => {
        const A = SRC('core', 'quality', 'app-audit.ts');
        expect(A).toMatch(/chromium\.launch\(\{ \.\.\.getChromiumLaunchOptions\(\), headless: true \}\)/);
    });
});

/**
 * A LIKE IS A SHARED FACT, NOT A BROWSER'S OPINION.
 *
 * The first feed kept hearts, threads and follows in localStorage. Two people
 * looking at the same post saw two different numbers, and the generated README
 * said so honestly — which made it honest, not finished. A social network
 * whose social graph never leaves the device is a diary with a Follow button.
 *
 * The invariant: for a post that lives on the server, the SERVER's numbers
 * win. Local copies are the offline fallback, never the source of truth.
 */
describe('the social graph lives on the server', () => {
    const AP = () => SRC('modules', 'tools', 'definitions', 'ApiProjectTool.ts');
    const T = () => SRC('modules', 'tools', 'definitions', 'react-app-templates.ts');

    it('the server has somewhere to put them', () => {
        const t = AP();
        for (const table of ['CREATE TABLE IF NOT EXISTS likes', 'CREATE TABLE IF NOT EXISTS comments', 'CREATE TABLE IF NOT EXISTS follows']) {
            expect(t).toContain(table);
        }
        // …and the JSON fallback carries the SAME interface, or a user on an
        // older Node silently loses half the app.
        for (const method of ['likesFor', 'toggleLike', 'commentsFor', 'addComment', 'following', 'toggleFollow']) {
            expect(t.split(method).length - 1).toBeGreaterThanOrEqual(2);   // sqlite branch + json branch
        }
    });

    it('and routes to reach them', () => {
        const t = AP();
        expect(t).toMatch(/app\.post\('\/api\/posts\/:id\/like'/);
        expect(t).toMatch(/app\.post\('\/api\/posts\/:id\/comments'/);
        expect(t).toMatch(/app\.get\('\/api\/follows'/);
        expect(t).toMatch(/app\.post\('\/api\/follows'/);
        // one request paints the whole feed — no N+1 per card
        expect(t).toMatch(/likes: db\.likesFor\(p\.id\), comments: db\.commentsFor\(p\.id\)/);
    });

    it('a deleted post takes its hearts and its thread with it', () => {
        const t = AP();
        expect(t).toMatch(/DELETE FROM likes WHERE post_id/);
        expect(t).toMatch(/DELETE FROM comments WHERE post_id/);
        expect(t).toMatch(/s\.likes = s\.likes\.filter/);          // the JSON half too
    });

    it('the app calls them, and lets the server win', () => {
        const t = T();
        expect(t).toMatch(/apiPost\(content\.api, '\/' \+ encodeURIComponent\(id\) \+ '\/like'/);
        expect(t).toMatch(/apiSibling\(content\.api, 'follows'\)/);
        expect(t).toMatch(/Array\.isArray\(r\.likes\) \? r\.likes/);
        expect(t).toMatch(/Array\.isArray\(r\.comments\) \? r\.comments/);
    });

    it('deleting reaches the server, or the next poll undoes it', () => {
        const t = T();
        expect(t).toMatch(/export async function apiDelete/);
        expect(t).toMatch(/apiDelete\(content\.api, p\.id\)/);
    });

    it('the README states what identity still is — a name, not an account', () => {
        const t = AP();
        expect(t).toMatch(/بلا كلمة مرور/);
        // and it no longer claims likes are browser-local, because they are not
        expect(t).not.toMatch(/الإعجابات والتعليقات ما تزال محفوظة في متصفح/);
    });
});

/**
 * THE LOG MAY NOT PROMISE AN ENDPOINT THAT DOES NOT EXIST.
 *
 * Every full-stack build announced «…and writes orders to /api/orders»,
 * derived by string surgery from whatever the resource happened to be. The
 * feed server has no orders table, so the social build's log promised one
 * that was never generated. Nothing failed out loud — it was simply untrue.
 */
describe('the full-stack claim matches the server that was built', () => {
    it('a feed is not told it has an orders table', () => {
        const R = SRC('modules', 'tools', 'definitions', 'ReactProjectTool.ts');
        expect(R).toMatch(/const feedApi = \/\\\/api\\\/posts\$\/\.test\(apiLink\)/);
        expect(R).toMatch(/apiLink && !feedApi \? apiLink\.replace/);
        expect(R).toMatch(/reads and writes the LIVE feed at/);
    });
});

/**
 * A REACT BUILD SHIPS THE SAME HEAD AS EVERY OTHER PAGE.
 *
 * It did not, and the cost was invisible twice over: a page with no icon
 * makes the browser probe /favicon.ico, that 404 became «1 خطأ كونسول» in
 * Joe's OWN self-QA, and every clean React build was handed over at 85/100
 * with no way to tell why. Shared on WhatsApp, the same link came up blank.
 */
describe('the React head is publish-ready', () => {
    const R = () => SRC('modules', 'tools', 'definitions', 'ReactProjectTool.ts');

    it('the page declares its icon, so nothing probes a missing one', () => {
        const r = R();
        expect(r).toMatch(/<link rel="icon" type="image\/svg\+xml"/);
        expect(r).toMatch(/faviconDataUri\(\{ brand: c\.brand/);
        expect(r).toMatch(/fileIndexHtml\(content, \(palette as any\)\.hue \?\? 260\)/);
    });

    it('and carries the share card and theme colour', () => {
        const r = R();
        for (const tag of ['og:title', 'og:description', 'twitter:card', 'theme-color']) expect(r).toContain(tag);
    });

    it('a console error names the resource it came from', () => {
        const A = SRC('core', 'quality', 'app-audit.ts');
        expect(A).toMatch(/m\.location\(\)/);
        expect(A).toMatch(/l\?\.url \? ` ← \$\{String\(l\.url\)\.slice\(-60\)\}` : ''/);
    });
});

/**
 * ONE RULE, EVERY ENFORCEMENT POINT.
 *
 * «ما زالت الثيرمال والمتصفح تفتحان اثناء البناء … تبا لك» — he was right,
 * and the reason is the worst kind: I fixed ONE of THREE copies of the same
 * auto-switch list, shipped it, and reported it fixed. Joe.tsx was corrected;
 * CommandComposer.tsx and AutoOpenManager.ts kept firing. On top of that the
 * workspace DEFAULTED to the terminal tab in three separate places, and the
 * browser panel LAUNCHED a Chromium just by being shown.
 *
 * The invariant: showing a panel starts nothing, and a panel calling its own
 * tool never steals the screen. Checked at EVERY point that can break it —
 * that is the whole reason this file exists.
 */
describe('showing a panel starts nothing', () => {
    const files: Array<[string, string]> = [
        ['Joe.tsx', WEB('pages', 'Joe.tsx')],
        ['CommandComposer.tsx', WEB('components', 'CommandComposer.tsx')],
        ['AutoOpenManager.ts', WEB('services', 'AutoOpenManager.ts')],
    ];

    it('no tab-switch list anywhere treats terminal_manager as a command to watch', () => {
        for (const [name, src] of files) {
            for (const line of src.split('\n')) {
                // The lists are single-line arrays of tool names.
                if (!/\[\s*'[a-z_]+'\s*,/.test(line)) continue;
                if (!/terminal|shell|npm/.test(line)) continue;
                expect(`${name}: ${line.trim()}`).not.toMatch(/'terminal_manager'/);
            }
        }
        // …and the one place it is named, it is named to be EXCLUDED.
        expect(WEB('services', 'AutoOpenManager.ts')).toMatch(/const isPanelBoot = toolName === 'terminal_manager'/);
    });

    it('no workspace defaults to a tab that spawns something', () => {
        const defaults: Array<[string, string]> = [
            ['Joe.tsx', WEB('pages', 'Joe.tsx')],
            ['JoeIDELayout.tsx', WEB('components', 'JoeIDELayout.tsx')],
            ['WorkspacePanel.tsx', WEB('components', 'WorkspacePanel.tsx')],
        ];
        for (const [name, src] of defaults) {
            const m = src.match(/useState<WorkspaceTab(?:\s*\|\s*[^>]+)?>\('(\w+)'\)|useState<'browser'[^>]*>\('(\w+)'\)/);
            const initial = m && (m[1] || m[2]);
            expect(`${name}=${initial}`).not.toMatch(/=(terminal|browser)$/);
        }
    });

    it('watching the browser panel does not create a browser', () => {
        const M = SRC('modules', 'browser', 'manager.ts');
        const fn = M.slice(M.indexOf('export function startStreaming'), M.indexOf('export function liveBrowserSessionCount'));
        expect(fn).not.toMatch(/getBrowserSession/);      // the launch that used to happen here
        expect(fn).toMatch(/watched\.add\(sid\)/);
        // …and the stream still begins the moment a real browser appears.
        expect(M).toMatch(/resumeStreamingIfWatched\(sid\)/);
    });

    it('a design verb over an attached image builds without needing a model', () => {
        const P = SRC('core', 'orchestrator', 'PlanningEngine.ts');
        expect(P).toMatch(/imageOnly && WANTS_BUILD_RE\.test\(userPart\)/);
        expect(P).toMatch(/design verb \+ attached image → build the page/);
    });

    it('a feed is not sold an owner account it does not have', () => {
        const A = SRC('modules', 'tools', 'definitions', 'ApiProjectTool.ts');
        expect(A).toMatch(/if \(feed\) \{\s*\n\s*const feedMsg = isAr/);
        expect(A).toMatch(/feed proof → post #/);
    });

    it('a plain newline list under «Features:» is still a list', () => {
        const { requestedFeatures } = require('../core/design/app-blueprints');
        const plain = 'Build a social platform.\n\nFeatures:\n\nPosts\nStories\nReels\nAds platform\n';
        expect(requestedFeatures(plain)).toEqual(['Posts', 'Stories', 'Reels', 'Ads platform']);
    });
});

/**
 * A BUTTON THAT HIDES ITS LABEL IS A BUTTON WITH NO LABEL.
 *
 * Asked for from the field: «زر المزود اريد ان يكون كتابه وليس رموز … واذا كان
 * مجاني فليكتب بجانبه free بخط صغير ورقيق». The markup HAD a label all along;
 * a stylesheet rule literally titled «Hide provider label text - show only
 * icon» removed it, and the shared 28×28 sizing left it nowhere to render even
 * if it had not. Editing the component alone would have changed nothing on
 * screen — which is exactly the mistake this file exists to prevent.
 */
describe('the provider button says its name', () => {
    const CSS = () => fs.readFileSync(path.join(__dirname, '..', '..', '..', 'web', 'src', 'styles', 'joe-premium.css'), 'utf-8');

    it('no stylesheet hides the label any more', () => {
        const css = CSS();
        // Read ONLY the .provider-label rule blocks. A slice that ran to the
        // end of the file matched a `display:none` belonging to some other
        // selector — a test that fails for the wrong reason is not a test.
        const blocks = [...css.matchAll(/\.provider-label\s*\{([^}]*)\}/g)].map(m => m[1]);
        expect(blocks.length).toBeGreaterThan(0);
        for (const b of blocks) expect(b).not.toMatch(/display:\s*none/);
        expect(blocks.some(b => /display:\s*inline/.test(b))).toBe(true);
    });

    it('and the button is free to grow past the icon square', () => {
        expect(CSS()).toMatch(/\.joe-chat-input-area \.provider-btn \{[\s\S]{0,200}width: auto !important/);
    });

    it('the name comes from the provider, not from a hand-written list', () => {
        const C = WEB('components', 'CommandComposer.tsx');
        expect(C).toMatch(/providers\[activeProvider\]\?\.name/);
        expect(C).toMatch(/providers\[activeProvider\]\?\.isFree \? \(/);
        // the ten-character clip that turned «OpenRouter» into «Router»
        expect(C).not.toMatch(/activeProvider\.slice\(1\)\)\.slice\(0, 10\)/);
    });

    it('the name comes from the code, never from the browser cache', () => {
        const C = WEB('components', 'CommandComposer.tsx');
        // An older build wrote a translated HINT into `name`; the saved blob was
        // merged over the defaults, so «ضع مفتاح gsk هنا Groq» survived every
        // update. Settings are the user's; identity is the code's.
        expect(C).toMatch(/const \{ name, nameKey, tagKey, \.\.\.userOwned \}/);
        expect(C).toMatch(/name: DEFAULT_PROVIDERS\[k\]\.name/);
        expect(C).toMatch(/DEFAULT_PROVIDERS\[activeProvider\]\?\.name/);
    });

    it('a provider that takes a key shows a key, not a sentence', () => {
        const C = WEB('components', 'CommandComposer.tsx');
        expect(C).toMatch(/PROVIDER_KEY_INFO\[activeProvider\]\?\.need/);
        expect(C).toMatch(/className=\{`provider-key/);
        const css = CSS();
        const key = css.slice(css.indexOf('.provider-btn .provider-key'), css.indexOf('.provider-btn .provider-key') + 300);
        expect(Number((key.match(/width:\s*(\d+)px/) || [])[1])).toBeLessThanOrEqual(12);
    });

    it('«free» is smaller and lighter than the name, in the stylesheet itself', () => {
        const css = CSS();
        const free = css.slice(css.indexOf('.provider-btn .provider-free'), css.indexOf('.provider-btn .provider-free') + 400);
        const size = Number((free.match(/font-size:\s*(\d+)px/) || [])[1]);
        const weight = Number((free.match(/font-weight:\s*(\d+)/) || [])[1]);
        expect(size).toBeLessThan(12);      // the name's 12px
        expect(weight).toBeLessThan(600);   // the name's 600
    });
});
