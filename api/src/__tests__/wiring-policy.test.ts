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
