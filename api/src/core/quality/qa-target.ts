/**
 * WHERE JOE'S CHECKS MAY WRITE: THE PATH OF ONE BROWSER QA WALK, CHOSEN ONCE.
 *
 * Design v13.3 §2 (step 1): `designs/2026-11-15-user-lifecycle-v13.md`. A walk on a folder Joe has never
 * delivered runs as today. A walk on a folder the owner already has (a change run) must never write his
 * live data where it cannot be put back, so it takes one of three paths:
 *
 *   private-live  path 1: Joe's static preview, the audit's own server, or a dev server PROVEN front-only (§3);
 *   2t            today's walk, today's snapshot and whole-file put-back, behind the browser fence, for a Node
 *                 server in which the best-effort router of §3b sees no clear harm;
 *   no-write      path 3: everything else (§5).
 *
 * This file starts no process and changes nothing: it reads files only (fs/promises). The rule lists are the
 * lab's (`accounts-lab/v13/prove13.js`, `prove2t.js`), copied rule for rule, so the code matches what was
 * measured on Joe's 275 deliveries and the attack's shapes (§13).
 *
 * The §3b rules are a ROUTER, not a proof: an app that slips past them is walked exactly as today, no worse.
 */
import fs from 'fs';
import { builtinModules } from 'module';
import path from 'path';
import { isData } from './qa-leaves-no-trace';
import { isWithinRoot } from '../../modules/tools/path-containment';

/** The four paths, from the loosest to the strictest. */
export type QaPath = 'as-today' | 'private-live' | '2t' | 'no-write';

/** Why a walk did not take the looser path (§3, §3b). `owner-lines13.json › reasonToWhy` maps each key to a told reason. */
export type QaReasonKey = 'server' | 'serverCode' | 'apiRoutes' | 'otherRuntime' | 'backendScript' | 'backendDep' | 'devScript'
    | 'devProxy' | 'browserStore' | 'absWrite' | 'link' | 'workspace' | 'unread' | 'budget'
    | 'externalStore' | 'sender' | 'outsidePath' | 'notCovered' | 'envName' | 'notProven';

/** One reason: its key and the file or text that proved it (shown to the owner as `{detail}`). */
export interface QaReason { key: QaReasonKey; detail: string }

/**
 * What says the owner already has this folder (§2.1):
 *   ''          none: a new build (or «كمّل» on one never delivered) — the walk runs as today;
 *   'history'   `.joe/history.json` holds a delivered run (or an undone one that had been delivered);
 *   'result'    `.joe/result.json` says delivered;
 *   'delivered' the `.joe/delivered` marker written at the outermost delivery (never pruned);
 *   'imported'  the chat's project origin is an imported repository (the loop owner passes it);
 *   'data'      none of these, but the run CHANGES a folder that already exists (`resumed`) and it holds data
 *               files with records in them: an app delivered before the marker existed (review 7, M4).
 */
export type QaRecord = '' | 'history' | 'result' | 'delivered' | 'imported' | 'data';

/** The choice for one folder: the path, why, the record it stood on, and what reading the folder cost. */
export interface QaPathChoice {
    path: QaPath;
    reasons: QaReason[];
    record: QaRecord;
    facts: { files: number; read: number; ms: number };
}

/**
 * One per loop (verification, repair, pipeline, react build: §2.3). The loop owner seeds `record` (read ONCE,
 * so a round's own `.joe/` writes never change the path inside a loop) and `path` (chosen before the live start,
 * §2.5); `first` is the first choice the loop saw.
 */
export interface QaPin { path?: QaPath; first?: QaPathChoice; record?: QaRecord }

/** Strictness order (§2.3): no-write > 2t > private-live > as-today. */
export const QA_PATH_ORDER: readonly QaPath[] = ['as-today', 'private-live', '2t', 'no-write'];

/** The stricter of two paths; `undefined` counts as nothing. */
export function strictest(a: QaPath | undefined, b: QaPath | undefined): QaPath {
    const rank = (p: QaPath | undefined) => (p ? QA_PATH_ORDER.indexOf(p) : -1);
    const r = Math.max(rank(a), rank(b));
    return r < 0 ? 'no-write' : QA_PATH_ORDER[r];
}

/** Joe's static preview kinds (`ProjectRunTool.ts › startStaticBuildPreview`): a read-only child that never writes. */
export const STATIC_KINDS: ReadonlySet<string> = new Set(['static', 'static-site', 'static-records', 'static-build-fallback']);
/** The Node server kinds §3b may route to 2T. */
export const NODE_SERVER_KINDS: ReadonlySet<string> = new Set(['npm-start', 'node-entry', 'tsx-entry']);

// ─────────────────────────────────────────────────────────────────────────────
// §2.1 The delivery record
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Whether the owner has had this folder (§2.1). Reads `.joe/history.json` (a delivered entry, or an undone one
 * whose `undoneFrom` is delivered), `.joe/result.json` (status delivered), the `.joe/delivered` marker, and the
 * project origin the loop owner passes (`projectOriginFor(sessionId, root)` → 'imported'). Anything else —
 * missing, unreadable, failed, cancelled, `.joe/transcript.jsonl`, `.joe/delivery/*.jpg`, `.joe-versions/` — is ''.
 * Synchronous and cheap; read once per loop into `QaPin.record`.
 */
export function hasDeliveryRecord(projectRoot: string, opts: { origin?: 'built' | 'imported'; resumed?: boolean } = {}): QaRecord {
    const joe = path.join(projectRoot, '.joe');
    try {
        const h = JSON.parse(fs.readFileSync(path.join(joe, 'history.json'), 'utf8'));
        const runs: any[] = Array.isArray(h) ? h : (Array.isArray(h?.runs) ? h.runs : []);
        if (runs.some(r => r && (r.status === 'delivered' || (r.status === 'undone' && r.undoneFrom === 'delivered')))) return 'history';
    } catch { /* no history */ }
    try {
        const r = JSON.parse(fs.readFileSync(path.join(joe, 'result.json'), 'utf8'));
        if (r && r.status === 'delivered') return 'result';
    } catch { /* no result */ }
    try { if (fs.statSync(path.join(joe, 'delivered')).isFile()) return 'delivered'; } catch { /* no marker */ }
    if (opts.origin === 'imported') return 'imported';
    //  Review 8, L5: a retry of Joe's own build that never delivered (its `.joe` says so) is still a new build, whatever
    //  seed records it holds; M4's rule is for an app delivered before the record existed (no `.joe` record at all).
    if (opts.resumed && !joeBuildNeverDelivered(joe) && hasOwnerData(projectRoot)) return 'data';
    return '';
}

/** The statuses of a run of Joe's that ended without delivering. */
const UNDELIVERED = new Set(['failed', 'cancelled', 'canceled', 'interrupted', 'aborted', 'error', 'errored', 'timeout', 'timed_out', 'running', 'building', 'started']);
/** Whether `.joe` records only Joe's own runs that never delivered (history or result) — a build being retried. */
function joeBuildNeverDelivered(joe: string): boolean {
    const statuses: string[] = [];
    try {
        const h = JSON.parse(fs.readFileSync(path.join(joe, 'history.json'), 'utf8'));
        const runs: any[] = Array.isArray(h) ? h : (Array.isArray(h?.runs) ? h.runs : []);
        for (const r of runs) statuses.push(String(r?.status || '').toLowerCase());
    } catch { /* no history */ }
    try {
        const r = JSON.parse(fs.readFileSync(path.join(joe, 'result.json'), 'utf8'));
        statuses.push(String(r?.status || '').toLowerCase());
    } catch { /* no result */ }
    return statuses.length > 0 && statuses.every(s => UNDELIVERED.has(s));
}

/** A data file holds records when it is more than an empty list, object or nothing. */
const EMPTY_RECORDS = /^\s*(?:\[\s*\]|\{\s*\}|null)?\s*$/u;

/**
 * Review 7, M4: whether an existing folder holds data files with records in them (the snapshot's own list,
 * `isData`): a database file of any size, or a records file that is not empty. A bounded, synchronous look
 * (depth 4, 400 entries); links are never followed.
 */
export function hasOwnerData(projectRoot: string): boolean {
    let seen = 0;
    const walk = (dir: string, rel: string, depth: number): boolean => {
        if (depth > 4 || seen > 400) return false;
        let es: fs.Dirent[];
        try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch { return false; }
        for (const e of es) {
            if (++seen > 400) return false;
            if (e.isSymbolicLink()) continue;
            const r = rel ? `${rel}/${e.name}` : e.name;
            const abs = path.join(dir, e.name);
            if (e.isDirectory()) {
                if (NOT_DATA_DIRS.has(e.name.toLowerCase()) || e.name === '.joe-versions' || e.name === '.joe-qa') continue;
                if (walk(abs, r, depth + 1)) return true;
                continue;
            }
            if (!e.isFile() || !isData(r)) continue;
            try {
                const st = fs.statSync(abs);
                if (!st.size) continue;
                if (/\.(?:db|sqlite|sqlite3|db3)$/iu.test(e.name)) return true;
                if (st.size > 64 * 1024) return true;
                if (!EMPTY_RECORDS.test(fs.readFileSync(abs, 'utf8'))) return true;
            } catch { /* gone */ }
        }
        return false;
    };
    return walk(path.resolve(projectRoot), '', 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// §3 Path 1 for a dev server: the rules (prove13.js, rule for rule)
// ─────────────────────────────────────────────────────────────────────────────

const SKIP = new Set(['node_modules', '.git', '.joe', '.joe-versions', '.joe-qa', '.cache', 'coverage', '.parcel-cache', '.turbo', '.vite', 'dist', 'build', '.idea', '.vscode']);
const CODE = /\.(?:[cm]?[jt]sx?|vue|svelte|astro|html?)$/i;
const CONFIG = /^(?:vite|vitest|webpack|astro|svelte|vue|craco|rsbuild|rspack|nuxt|next|remix|quasar|angular)\.config\.[cm]?[jt]s$|^angular\.json$|^vue\.config\.js$/i;
/** D1: the dev script's program is one of these front tools (cross-env / env assignments allowed in front of it). */
const FRONT_TOOL = /^(?:vite(?:\s+(?:dev|serve))?|react-scripts\s+start|parcel(?:\s+serve)?(?:\s+\S+\.html)?|astro\s+dev|webpack\s+serve|webpack-dev-server|ng\s+serve|vue-cli-service\s+serve|rsbuild\s+dev|craco\s+start)(?:\s+--?[\w-]+(?:[ =]\S+)?)*$/i;
/** D2: a package script that starts or reaches a backend. */
const BACKEND_SCRIPT = /(?:^|[\s&|;(])(?:node|nodemon|tsx|ts-node(?:-dev)?|bun|deno|json-server|concurrently|npm-run-all|run-p|run-s|python3?|py|php|ruby|rails|go\s+run|dotnet|java|next|nuxt|nuxi|remix|wrangler|netlify\s+dev|vercel\s+dev|firebase\s+(?:serve|emulators)|supabase\s+start|pocketbase|docker(?:-compose)?|compose|pm2|forever|serve\s+-s\s+\S+\s+--cors)(?=$|[\s&|;)])/i;
/** D3: a server package. */
const BACKEND_DEPS = /^(?:express|fastify|koa|@koa\/[\w-]+|@hapi\/[\w-]+|hapi|restify|polka|h3|hono|@hono\/[\w-]+|elysia|json-server|next|nuxt|@remix-run\/[\w-]+|@sveltejs\/kit|@astrojs\/(?:node|vercel|netlify|cloudflare|deno)|@nestjs\/[\w-]+|socket\.io|ws|http-proxy|http-proxy-middleware|express-http-proxy|better-sqlite3|sqlite3|lowdb|nedb|@seald-io\/nedb|mongoose|mongodb|pg|mysql2?|prisma|@prisma\/client|nodemailer|vite-plugin-mock|vite-plugin-api|vite-plugin-node|@vitejs\/plugin-basic-ssl-never)$/;
/** D8: a backend SDK that writes from the browser to a store that is not the walked origin. */
const BROWSER_STORE_DEPS = /^(?:firebase|@firebase\/[\w-]+|@supabase\/[\w-]+|pocketbase|appwrite|@emailjs\/[\w-]+|emailjs-com|emailjs|@aws-sdk\/[\w-]+|aws-amplify|@aws-amplify\/[\w-]+|airtable|contentful-management|@sanity\/client|parse|realm-web|@react-native-firebase\/[\w-]+|convex|@instantdb\/[\w-]+|@clerk\/[\w-]+|@auth0\/[\w-]+)$/;
const BROWSER_STORE_TEXT = /\bscript\.google\.com\/macros\b|\bdocs\.google\.com\/forms\b|\bformspree\.io\b|\bgetform\.io\b|\bapi\.emailjs\.com\b|\bemailjs\.(?:init|send|sendForm)\b|\bnew\s+PocketBase\s*\(|\bnew\s+Appwrite\b|\bnew\s+Client\s*\(\s*\)\s*\.setEndpoint\b|\bfirebase(?:app)?\.(?:initializeApp|firestore|database)\b|\binitializeApp\s*\(|\bcreateClient\s*\(\s*['"`]https?:|\.supabase\.co\b|\.firebaseio\.com\b|firestore\.googleapis\.com|\baxios\.create\s*\(\s*\{[^}]*\bbaseURL\s*:\s*(?!['"`]\/(?!\/))|\bnew\s+(?:WebSocket|EventSource)\s*\(|\bimport\.meta\.env\.VITE_\w*(?:API|URL|BACKEND|SERVER|ENDPOINT|HOST)\w*|\bprocess\.env\.REACT_APP_\w*(?:API|URL|BACKEND|SERVER|ENDPOINT|HOST)\w*/;
/** D9: an API address written into the front (case-sensitive names: API_BASE, apiUrl, baseURL, BACKEND_URL, endpoint …). */
const API_BASE = /\b(?:[A-Z_]*(?:API|BACKEND|SERVER|ENDPOINT)[A-Z_]*|BASE_URL|baseU(?:rl|RL)|api(?:Base|Url|URL|Root|Host)?|endpoint|backendUrl|serverUrl)\s*[:=]\s*['"`]https?:\/\/(?!(?:localhost|127\.\d+\.\d+\.\d+|\[::1\])[:/'"`])/;
const ABS_WRITE = /\bfetch\s*\(\s*['"`]https?:\/\/|\baxios(?:\.\w+)?\s*\(\s*['"`]https?:|\bsendBeacon\s*\(|<form[^>]+action\s*=\s*['"]https?:\/\/|\bXMLHttpRequest\b[\s\S]{0,200}\.open\s*\(\s*['"`](?:POST|PUT|PATCH|DELETE)['"`]\s*,\s*['"`]https?:/i;
/** D4: server code (the evidence `ProjectRunTool.ts › hasServerStartEvidence` uses). */
const SERVER_START = /\.listen\s*\(|\bcreateServer\s*\(|\b(?:express|fastify|koa)\s*\(\s*\)/;
/** D4 does not look in these. */
const NOT_SERVER_CODE_PATH = /(?:^|\/)(?:public|static|assets|tests?|__tests__|spec|e2e)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/i;
/** D6: another runtime or a deploy backend. */
const OTHER_RUNTIME_FRONT = /\.(?:py|php|rb|go|cs|java)$|^(?:requirements[\w.-]*\.txt|pyproject\.toml|Pipfile|Gemfile|composer\.json|go\.mod|Dockerfile|docker-compose\.ya?ml|compose\.ya?ml|wrangler\.toml|netlify\.toml|vercel\.json|firebase\.json)$/i;
/** D5: server-side routes or functions. */
const API_ROUTE_DIR = /^(?:pages\/api|src\/pages\/api|app\/api|src\/app\/api|server|src\/server|api|src\/api\/server|backend|functions|netlify\/functions|supabase\/functions|src\/routes\/api)(?:\/|$)/i;
const API_ROUTE_FILE = /(?:^|\/)(?:route\.[cm]?[jt]sx?|\+server\.[cm]?[jt]s|\+page\.server\.[cm]?[jt]s|\+layout\.server\.[cm]?[jt]s|middleware\.[cm]?[jt]s)$/i;
/** D7: any form of a dev-server proxy or middleware, in a config file or in a file it imports. */
const DEV_HOOK = /\bproxy\b\s*[:=(]|['"]proxy['"]\s*:|\bconfigure(?:Preview)?Server\b|\bserver\.middlewares\b|\bsetupMiddlewares\b|\bonBefore(?:Setup)?Middleware\b|\bbefore\s*\(\s*app\b|\bdevServer\s*:\s*\{[\s\S]{0,400}\b(?:before|after|setupMiddlewares|proxy)\b|\bcreateProxyMiddleware\b|\bhttp-proxy\b/;
const IMPORT = /(?:\bimport\s+(?:[\w*{}\s,]+\s+from\s+)?|\brequire\s*\(\s*|\bimport\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g;
const MAX_CODE_FILE = 2 * 1024 * 1024;

// ─────────────────────────────────────────────────────────────────────────────
// §3b The 2T router (prove2t.js, rule for rule)
// ─────────────────────────────────────────────────────────────────────────────

/** The snapshot's limits (qa-leaves-no-trace.ts: MAX_FILES, MAX_TOTAL_BYTES, MAX_FILE_BYTES, MAX_DEPTH). */
const SNAP_MAX_FILES = 2000, SNAP_MAX_BYTES = 256 * 1024 * 1024, SNAP_MAX_FILE = 64 * 1024 * 1024, SNAP_MAX_DEPTH = 6;
/** The folders the snapshot never treats as data (qa-leaves-no-trace.ts › NOT_DATA_DIRS). */
const NOT_DATA_DIRS = new Set(['node_modules', '.git', '.joe', '.next', '.nuxt', '.svelte-kit', '.output', 'dist', 'build', 'out', 'coverage', '.cache', '.parcel-cache', '.turbo', '.vite', '__pycache__', '.pytest_cache', '.venv', 'venv', '.mypy_cache', '.idea', '.vscode']);
const DATA_DIR = /^(?:data|db|database|databases|storage|uploads?|var|records)$/iu;
/** T6: the env names a 2T app may hold values for. */
export const ENV_ALLOW: ReadonlySet<string> = new Set(['PORT', 'HOST', 'NODE_ENV', 'TZ', 'LOG_LEVEL', 'DEBUG', 'JWT_SECRET', 'JWT_EXPIRES_IN', 'SESSION_SECRET', 'COOKIE_SECRET', 'APP_NAME']);
/** T2: a dependency that keeps data outside the folder. */
export const STORE_DEPS = /^(?:pg|postgres|pg-promise|mysql2?|mariadb|mssql|tedious|oracledb|mongodb|mongoose|redis|ioredis|@redis\/client|cassandra-driver|neo4j-driver|firebase|firebase-admin|@firebase\/[\w-]+|@supabase\/[\w-]+|@planetscale\/database|@neondatabase\/serverless|@vercel\/(?:postgres|kv|blob)|@upstash\/[\w-]+|faunadb|couchbase|nano|pouchdb|dynamoose|@aws-sdk\/[\w-]+|aws-sdk|@google-cloud\/[\w-]+|@azure\/[\w-]+|appwrite|pocketbase|convex|airtable|@notionhq\/client|googleapis|@libsql\/client|@electric-sql\/[\w-]+|@prisma\/client|prisma|typeorm|sequelize|knex|@mikro-orm\/[\w-]+|drizzle-orm|objection|bookshelf|waterline|conf|configstore|env-paths|electron-store|appdata-path|xdg-basedir|node-persist)$/;
/** T3: a dependency that can send (mail, payments, HTTP clients, sockets, jobs, queues, process tools). */
export const SENDER_DEPS = /^(?:nodemailer|@sendgrid\/[\w-]+|mailgun\.js|mailgun-js|postmark|resend|@mailchimp\/[\w-]+|twilio|vonage|@vonage\/[\w-]+|messagebird|stripe|@stripe\/[\w-]+|@paypal\/[\w-]+|braintree|square|moyasar|tap-payments|web-push|@slack\/[\w-]+|discord\.js|telegraf|node-telegram-bot-api|whatsapp-web\.js|@whiskeysockets\/baileys|pusher|ably|openai|@anthropic-ai\/sdk|@google\/generative-ai|axios|node-fetch|got|undici|superagent|needle|request|ky|ws|socket\.io-client|execa|cross-spawn|shelljs|node-cron|cron|agenda|bull|bullmq|bree|node-schedule|amqplib|kafkajs|mqtt)$/;
/** T2: a database address in server code. */
const STORE_URL = /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|rediss?|amqps?|mssql|sqlserver|cockroachdb|neo4j(?:\+s)?|libsql):\/\/|[\w-]+\.supabase\.co\b|[\w-]+\.firebaseio\.com\b|firestore\.googleapis\.com|\.amazonaws\.com\b|\.documents\.azure\.com\b|\.database\.windows\.net\b|\.turso\.io\b/i;
/** T5: a drive path (one separator exactly, so a doubled one cannot backtrack past the look-ahead), ~/, a POSIX system path as an fs argument, or home code. */
const HOME_CODE = /os\.homedir\(\)|process\.env\.(?:APPDATA|LOCALAPPDATA|HOME|USERPROFILE|XDG_\w+)\b|['"`](?:[A-Za-z]:[\\/]{1,2}(?![\\/])(?!Windows\b)|~[\\/])[^'"`\n]+|\b(?:fs\w*|fsp|promises)\.\w+\(\s*['"`]\/(?:var|home|Users|srv|opt|data|mnt|tmp)\//;
/** T3: an outbound call in server code. */
const OUTBOUND = /\bfetch\s*\(|\bhttps?\.(?:request|get)\s*\(|\bnew\s+(?:WebSocket|EventSource)\s*\(|\bXMLHttpRequest\b|\bnet\.(?:connect|createConnection)\s*\(|\btls\.connect\s*\(|\bdgram\b|\bdns\.(?:lookup|resolve)/;
/** T3: the core modules a 2T server may import; any other core module (network, process, worker, cluster, inspector …) is refused without being named. */
export const CORE_OK: ReadonlySet<string> = new Set(['fs', 'fs/promises', 'path', 'http', 'https', 'url', 'crypto', 'os', 'util', 'events', 'stream', 'stream/promises', 'zlib', 'querystring', 'buffer', 'timers', 'timers/promises', 'string_decoder', 'assert', 'sqlite', 'readline', 'perf_hooks']);
const CORE = new Set(builtinModules.map(m => m.replace(/^node:/, '')));
const SERVER_SKIP = /^(?:public|static|client|frontend|web|www|assets|dist|build|out|tests?|__tests__|spec|e2e|docs?|scripts?)$/i;
const OTHER_RUNTIME_SERVER = /\.(?:py|php|rb|go|cs|java)$|^(?:requirements[\w.-]*\.txt|pyproject\.toml|Pipfile|Gemfile|composer\.json|go\.mod)$/i;
const ENV_FILE_REF = /--env-file(?:-if-exists)?[= ]['"]?([^\s'"]+)|loadEnvFile\s*\(\s*['"`]([^'"`]+)|dotenv[\w.]*\.config\s*\(\s*\{[^}]*\bpath\s*:\s*[^'"`]*['"`]([^'"`]+)|env-cmd\s+(?:-f\s+)?([^\s]+)/g;
const WRITE_CALL = /\b(?:writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|copyFile|copyFileSync|rename|renameSync|DatabaseSync|Database|open|openSync)\s*\(([^;\n]{0,240})/g;
const WRITES = /\b(?:writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|rename|renameSync|copyFile|copyFileSync|DatabaseSync|Database|Datastore|open|openSync)\s*\(\s*([\w$.]+)/g;

/** The write calls whose target T4b reads: `[call, which argument is the file]`. */
const TARGET_CALLS: ReadonlyArray<[RegExp, number]> = [
    [/\b(?:writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|outputFile|outputFileSync|outputJson|outputJsonSync|writeJson|writeJsonSync)\s*\(/g, 0],
    [/\b(?:rename|renameSync|copyFile|copyFileSync|move|moveSync)\s*\(/g, 1],
    [/\bnew\s+(?:JSONFile|JSONFileSync|TextFile|TextFileSync|DataFile|DataFileSync|FileSync|FileAsync|DatabaseSync|Database)\s*\(/g, 0],
];
/** Names a file expression may hold that are no part of its name. */
const NAME_FREE = new Set(['path', 'fs', 'fsp', 'promises', 'join', 'resolve', 'dirname', 'basename', 'normalize', '__dirname', '__filename', 'process', 'cwd',
    'import', 'meta', 'fileURLToPath', 'URL', 'new', 'require', 'JSON', 'String', 'posix', 'win32', 'sep', 'true', 'false', 'null', 'undefined', 'await']);

/** One call's arguments, split at its top-level commas (strings and brackets kept whole). */
function callArgs(text: string, open: number): string[] {
    const args: string[] = [];
    let depth = 0, cur = '', quote = '';
    for (let i = open; i < text.length && i < open + 600; i++) {
        const ch = text[i];
        if (quote) { cur += ch; if (ch === '\\') { cur += text[++i] || ''; continue; } if (ch === quote) quote = ''; continue; }
        if (ch === '"' || ch === '\'' || ch === '`') { quote = ch; cur += ch; continue; }
        if (ch === '(' || ch === '[' || ch === '{') { depth++; cur += ch; continue; }
        if (ch === ')' || ch === ']' || ch === '}') { if (depth === 0) { args.push(cur.trim()); return args; } depth--; cur += ch; continue; }
        if (ch === ',' && depth === 0) { args.push(cur.trim()); cur = ''; continue; }
        cur += ch;
    }
    args.push(cur.trim());
    return args;
}

/**
 * What one file expression names, read through the file's own constants (three deep): the string parts in order,
 * or `unresolved` when a part comes from something the file does not define (a parameter, an import, the env).
 */
function fileNameOf(expr: string, text: string, depth = 0): { parts: string[]; raw: string[]; unresolved: boolean; climbs: number; fileBased: boolean } {
    const parts: string[] = [];
    let unresolved = false;
    let fileBased = false;
    const push = (literal: string) => { for (const p of literal.split(/[\\/]/u)) if (p && p !== '.') parts.push(p); };
    const follow = (inner: string) => { const sub = fileNameOf(inner, text, depth + 1); parts.push(...sub.raw); unresolved = unresolved || sub.unresolved; fileBased = fileBased || sub.fileBased; };
    if (/\bprocess\.env\b|\bimport\.meta\.env\b/u.test(expr)) unresolved = true;
    /*
     * A folder the app is STARTED with (`process.argv[3]`) is whatever the start says — any folder, outside the project
     * too (review 8, H3). Nothing in the file makes it the project: review 9 (M3) proved that `process.argv[3] =
     * __dirname` may be only a default (`if (!process.argv[3]) …`) or come after the read, and the start then passes
     * an outside folder. A name read from the arguments is not read to the end, so not covered: never 2T.
     */
    if (/\bprocess\s*\.\s*argv\b/u.test(expr)) return { parts: [], raw: [], unresolved: true, climbs: 0, fileBased: false };
    //  In source order: a template literal (its text, then each ${…}), a quoted string, a name (or a member read).
    const TOKEN = /`((?:\\[\s\S]|[^`\\])*)`|(['"])((?:\\.|(?!\2)[^\\])*)\2|([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)/gu;
    for (const m of expr.matchAll(TOKEN)) {
        if (m[1] !== undefined) {
            m[1].split(/\$\{([^}]*)\}/u).forEach((piece, i) => (i % 2 === 0 ? push(piece) : follow(piece)));
            continue;
        }
        if (m[3] !== undefined) { push(m[3]); continue; }
        const chain = String(m[4] || '').split('.').map(x => x.trim());
        const name = chain[0];
        //  `__dirname`, `import.meta.url`: the name starts at the code file's own folder.
        if (name === '__dirname' || name === '__filename' || name === 'import') fileBased = true;
        if (NAME_FREE.has(name)) continue;
        //  `cfg.file`, `this.path`: a member read is not this file's to name.
        if (chain.length > 1 || depth >= 3) { unresolved = true; continue; }
        const esc = name.replace(/\$/gu, '\\$');
        const def = new RegExp(`\\b(?:const|let|var)\\s+${esc}\\s*=\\s*([^;\\n]+)`, 'u').exec(text);
        if (def) { follow(def[1]); continue; }
        //  `const [port, root] = process.argv.slice(2)`: a folder the app is STARTED with is whatever the start says —
        //  any folder, outside the project too (review 8, H3). It is not read to the end, so not covered: never 2T.
        const unpacked = new RegExp(`\\b(?:const|let|var)\\s*[\\[{][^\\]}=;]*(?<![\\w$])${esc}(?![\\w$])[^\\]}=;]*[\\]}]\\s*=\\s*([^;\\n]+)`, 'u').exec(text);
        if (unpacked && !/\bprocess\s*\.\s*argv\b/u.test(unpacked[1])) { follow(unpacked[1]); continue; }
        unresolved = true;
    }
    //  How far above its base the name climbs («..»): above the project is outside what the snapshot keeps.
    let level = 0, lowest = 0;
    for (const p of parts) { level += p === '..' ? -1 : 1; lowest = Math.min(lowest, level); }
    return { parts: parts.filter(p => p !== '..'), raw: parts, unresolved, climbs: -lowest, fileBased };
}

/** T4b: every file a server file's write calls name, read as far as the file itself names it. */
function writeTargets(text: string): Array<{ expr: string; parts: string[]; raw: string[]; unresolved: boolean; climbs: number; fileBased: boolean }> {
    const out: Array<{ expr: string; parts: string[]; raw: string[]; unresolved: boolean; climbs: number; fileBased: boolean }> = [];
    for (const [re, which] of TARGET_CALLS) {
        for (const m of text.matchAll(re)) {
            const args = callArgs(text, (m.index || 0) + m[0].length);
            const expr = String(args[which] || '').trim();
            //  An in-memory database, or a handle (a file descriptor, a stream) and not a name: nothing to read.
            if (!expr || /^['"`]:memory:['"`]$/u.test(expr) || /^\d+$/u.test(expr)) continue;
            out.push({ expr, ...fileNameOf(expr, text) });
            if (out.length >= 200) return out;
        }
    }
    return out;
}

interface Collect { reasons: QaReason[]; no(key: QaReasonKey, detail: string): void }
function collector(): Collect {
    const reasons: QaReason[] = [];
    return { reasons, no: (key, detail) => { if (reasons.length < 10) reasons.push({ key, detail }); } };
}

async function readJson(file: string): Promise<any> {
    return JSON.parse(await fs.promises.readFile(file, 'utf8'));
}

async function isFile(file: string): Promise<boolean> {
    try { return (await fs.promises.stat(file)).isFile(); } catch { return false; }
}

/** §3b: whether a Node server may take 2T. Reads the whole folder (budgeted), starts nothing. */
async function prove2T(root: string, budgetMs: number): Promise<{ ok: boolean; reasons: QaReason[]; facts: { files: number; read: number } }> {
    const t0 = Date.now();
    const c = collector();
    const facts = { files: 0, read: 0, dataFiles: 0, dataBytes: 0 };
    let pkg: any = {};
    try { pkg = await readJson(path.join(root, 'package.json')); } catch { /* none: T1 decides */ }
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}), ...(pkg.optionalDependencies || {}) };
    for (const d of Object.keys(deps)) {
        if (STORE_DEPS.test(d)) c.no('externalStore', `a database or storage client: ${d}`);
        if (SENDER_DEPS.test(d)) c.no('sender', `a sender, HTTP client, job runner or process tool: ${d}`);
    }
    if (pkg.workspaces) c.no('notProven', 'package.json "workspaces"');
    const envFiles = new Set<string>();
    const scripts = Object.values(pkg.scripts || {}).map(String).join('\n');
    if (/\bNODE_OPTIONS\s*=/.test(scripts)) c.no('notProven', 'a start script sets NODE_OPTIONS');
    for (const m of scripts.matchAll(ENV_FILE_REF)) envFiles.add(m[1] || m[2] || m[3] || m[4]);
    const codeFiles = new Map<string, { abs: string; size: number }>();
    let overBudget = false;
    const walk = async (dir: string, rel: string, depth: number, server: boolean): Promise<void> => {
        if (Date.now() - t0 > budgetMs) { if (!overBudget) c.no('budget', 'not read whole within the budget'); overBudget = true; return; }
        let es: fs.Dirent[];
        try { es = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
        for (const e of es) {
            const abs = path.join(dir, e.name), r = rel ? `${rel}/${e.name}` : e.name;
            let link = e.isSymbolicLink();
            if (!link && e.isDirectory()) { try { link = (await fs.promises.lstat(abs)).isSymbolicLink(); } catch { /* gone */ } }
            if (link) { if (e.name !== 'node_modules') c.no('link', `a link: ${r}`); continue; }
            if (e.isDirectory()) {
                if (['node_modules', '.git', '.joe', '.joe-versions', '.joe-qa'].includes(e.name)) continue;
                await walk(abs, r, depth + 1, server && !SERVER_SKIP.test(e.name));
                continue;
            }
            if (!e.isFile()) continue;
            let st: fs.Stats;
            try { st = await fs.promises.stat(abs); } catch { continue; }
            facts.files++;
            //  The snapshot's coverage: every data file must be inside its limits.
            if (isData(r) && !r.split('/').some(p => NOT_DATA_DIRS.has(p.toLowerCase()))) {
                facts.dataFiles++; facts.dataBytes += st.size;
                if (depth > SNAP_MAX_DEPTH) c.no('notCovered', `a data file deeper than the snapshot reads: ${r}`);
                if (st.size > SNAP_MAX_FILE) c.no('notCovered', `a data file over 64 MB: ${r}`);
            }
            if (/^\.env(?:\.|$)/.test(e.name) && !/\.(?:example|sample|template)$/i.test(e.name)) envFiles.add(r);
            if (OTHER_RUNTIME_SERVER.test(e.name) && server) c.no('otherRuntime', `another runtime: ${r}`);
            if (/\.(?:[cm]?[jt]s)$/i.test(e.name)) codeFiles.set(r, { abs, size: st.size });
        }
    };
    await walk(root, '', 0, true);
    //  Server code = the start entry and every file it requires or imports, transitively.
    const start = String((pkg.scripts || {}).start || '');
    const fromStart = (start.match(/\b(?:node|nodemon|tsx|ts-node)\s+(?:--?[\w-]+(?:[= ]\S+)?\s+)*([\w./-]+\.[cm]?[jt]s)\b/) || [])[1];
    const candidates = [fromStart, pkg.main, 'server.js', 'app.js', 'index.js', 'main.js', 'server/server.js', 'server/index.js', 'server/app.js', 'src/server.js', 'src/index.js']
        .filter(Boolean).map(f => String(f).replace(/^\.\//, ''));
    const readText = async (r: string) => {
        const f = codeFiles.get(r);
        if (!f || f.size > MAX_CODE_FILE) return '';
        const text = await fs.promises.readFile(f.abs, 'utf8').catch(() => '');
        facts.read += text.length;
        return text;
    };
    let entry: string | undefined;
    for (const f of candidates) {
        if (!codeFiles.has(f)) continue;
        if (f === fromStart || f === pkg.main || /\.listen\s*\(|createServer\s*\(/.test(await readText(f))) { entry = f; break; }
    }
    if (!entry) c.no('notProven', `no Node server entry Joe can read (start: "${start.slice(0, 50)}")`);
    const server = new Set<string>();
    const queue = entry ? [entry] : [];
    const texts = new Map<string, string>();
    while (queue.length) {
        const r = queue.shift() as string;
        if (server.has(r)) continue;
        server.add(r);
        const text = await readText(r);
        texts.set(r, text);
        for (const m of text.matchAll(/\brequire\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]|\bfrom\s+['"](\.{1,2}\/[^'"]+)['"]|\bimport\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
            const base = path.posix.normalize(path.posix.join(path.posix.dirname(r), m[1] || m[2] || m[3]));
            const hit = [base, ...['.js', '.cjs', '.mjs', '.ts', '/index.js', '/index.ts'].map(x => base + x)].find(x => codeFiles.has(x));
            if (hit) queue.push(hit);
        }
    }
    for (const r of server) {
        const f = codeFiles.get(r);
        if (!f) continue;
        if (f.size > MAX_CODE_FILE) { c.no('notProven', `a server file over 2 MB: ${r}`); continue; }
        const text = texts.get(r) ?? '';
        //  T4: every data file named in a path.join / path.resolve that reaches a write must be one the snapshot keeps.
        const written = new Set([...text.matchAll(WRITES)].map(x => x[1].split('.').pop()));
        const targets: string[] = [];
        for (const m of text.matchAll(/\b(?:const|let|var)\s+([\w$]+)\s*=\s*([^;\n]*\bpath\.(?:join|resolve)\s*\([^;\n]*)/g)) {
            if (written.has(m[1])) for (const j of m[2].matchAll(/\bpath\.(?:join|resolve)\s*\(([^)]*)\)/g)) targets.push(j[1]);
        }
        for (const m of text.matchAll(/(?:writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|DatabaseSync|Database|Datastore)\s*\(\s*path\.(?:join|resolve)\s*\(([^)]*)\)/g)) targets.push(m[1]);
        for (const arg of targets) {
            const lits = [...arg.matchAll(/['"`]([^'"`$]+)['"`]/g)].map(x => x[1]).filter(x => x !== '..' && x !== '.');
            const last = lits[lits.length - 1] || '';
            if (/\.(?:json|jsonl|ndjson|db|sqlite3?|db3|csv)$/i.test(last) && !/^(?:package|tsconfig|jsconfig|manifest|composer)\.json$/i.test(last)) {
                const rel = lits.join('/');
                if (!isData(rel)) c.no('notCovered', `a data file the server writes and the snapshot does not keep: ${r}: ${rel}`);
            }
        }
        if (STORE_URL.test(text)) c.no('externalStore', `a database address in ${r}`);
        const hm = text.match(HOME_CODE);
        if (hm) c.no('outsidePath', `a data path outside the folder: ${r}: ${hm[0].slice(0, 50)}`);
        //  Outbound calls are looked for in the code only: the HTML and scripts it sends to the browser are blanked first.
        const codeOnly = text.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/`(?:\\[\s\S]|[^`\\])*`|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/g, '""');
        const ob = codeOnly.match(OUTBOUND);
        if (ob) c.no('sender', `an outbound call in server code: ${r}: ${ob[0]}`);
        for (const m of text.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)|\bfrom\s+['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]/g)) {
            const name = String(m[1] || m[2] || m[3]).replace(/^node:/, '');
            if (CORE.has(name) && !CORE_OK.has(name)) c.no('sender', `server code imports the core module "${name}": ${r}`);
        }
        for (const m of text.matchAll(ENV_FILE_REF)) envFiles.add(m[1] || m[2] || m[3] || m[4]);
        //  dotenv / process.loadEnvFile with a path: a plain literal is read like .env; anything computed is not proven.
        if (/dotenv|loadEnvFile/.test(text)) {
            for (const m of text.matchAll(/(?:\.config|\bloadEnvFile)\s*\(\s*(\{[^}]*\bpath\s*:\s*([^,}]+)|[^)\s][^)]*)?/g)) {
                const arg = String(m[2] || m[1] || '').trim();
                if (!arg) continue;
                const lit = arg.match(/^['"`]([^'"`$]+)['"`]$/);
                if (lit) envFiles.add(lit[1]); else c.no('notProven', `an env file named by code Joe cannot resolve: ${r}: ${arg.slice(0, 60)}`);
            }
        }
        //  Write targets: a literal file name in the call must be one the snapshot keeps (or sit under a data folder).
        for (const m of text.matchAll(WRITE_CALL)) {
            const lits = [...m[1].matchAll(/['"`]([^'"`]+\.(?:json|jsonl|ndjson|db|sqlite3?|db3|csv|txt|log|dat|bin|xml|ya?ml))['"`]/g)].map(x => x[1]);
            const dirs = [...m[1].matchAll(/['"`]([\w.-]+)['"`]/g)].map(x => x[1]);
            for (const l of lits) {
                if (!isData(l) && !dirs.some(dd => DATA_DIR.test(dd)) && !/\.log$/i.test(l)) c.no('notCovered', `a file the server writes that the snapshot does not keep: ${r}: ${l}`);
            }
        }
        //  T4b (review 7, M1): every file a write call names must be one the snapshot keeps — its name read through
        //  the file's own constants (`const FILE = DIR + '/orders.json'`, `new JSONFile('orders.json')`); a name
        //  Joe cannot read to the end (a parameter, an import, an env value) is not proven, so no 2T.
        for (const t of writeTargets(text)) {
            if (t.unresolved) { c.no('notCovered', `a file the server writes whose name Joe cannot read to the end: ${r}: ${t.expr.slice(0, 60)}`); continue; }
            const rel = t.parts.join('/').replace(/\/{2,}/gu, '/').replace(/^\.?\//u, '');
            //  A log is no store of his (as before), wherever it is written.
            if (!rel || /\.log$/iu.test(rel)) continue;
            //  H3: a name that climbs out of the project — above the code file's folder for `__dirname`, above the
            //  project for a name relative to where it starts — is a store the snapshot never keeps.
            if (t.climbs > (t.fileBased ? r.split('/').length - 1 : 0)) { c.no('outsidePath', `a file the server writes outside the folder: ${r}: ${t.expr.slice(0, 60)}`); continue; }
            if (!isData(rel) && !rel.split('/').some(seg => DATA_DIR.test(seg))) c.no('notCovered', `a file the server writes that the snapshot does not keep: ${r}: ${rel}`);
        }
    }
    if (facts.dataFiles > SNAP_MAX_FILES || facts.dataBytes > SNAP_MAX_BYTES) c.no('notCovered', `more data than the snapshot keeps (${facts.dataFiles} files, ${Math.round(facts.dataBytes / 1048576)} MB)`);
    //  T6: every env file the app loads holds harmless names only, no path values, nothing outside the project.
    const rootAbs = path.resolve(root);
    for (const f of envFiles) {
        if (!f) continue;
        const abs = path.resolve(root, f);
        if (abs === rootAbs || !isWithinRoot(abs, rootAbs)) { c.no('envName', `an env file outside the project: ${f}`); continue; }
        let text = '';
        try { text = await fs.promises.readFile(abs, 'utf8'); } catch { continue; }
        for (const line of text.split(/\r?\n/)) {
            const mm = line.match(/^\s*(?:export\s+)?([A-Za-z_][\w.]*)\s*=\s*(.*)$/);
            if (!mm) continue;
            const v = mm[2].trim().replace(/^['"]|['"]$/g, '');
            if (!v) continue;
            if (!ENV_ALLOW.has(mm[1])) c.no('envName', `${f}: ${mm[1]}`);
            else if (/^(?:[A-Za-z]:[\\/]|\/|~[\\/]|\.\.[\\/])/.test(v)) c.no('outsidePath', `${f}: ${mm[1]} is a path`);
        }
    }
    return { ok: c.reasons.length === 0, reasons: c.reasons, facts: { files: facts.files, read: facts.read } };
}

/** §3: whether a dev server is a front only. Reads the whole folder (no file-count cap), budgeted. */
async function proveFront(root: string, budgetMs: number, budgetBytes: number, t0: number, c: Collect, facts: { files: number; read: number }): Promise<void> {
    let pkg: any;
    try { pkg = await readJson(path.join(root, 'package.json')); } catch { c.no('unread', 'package.json not readable'); return; }
    const scripts: Record<string, unknown> = pkg.scripts || {};
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}), ...(pkg.optionalDependencies || {}) };
    const dev = String(scripts.dev || '').trim().replace(/^(?:cross-env\s+)?(?:[A-Z_][A-Z0-9_]*=\S+\s+)+/, '');
    if (!FRONT_TOOL.test(dev)) c.no('devScript', `the dev script is not a front tool alone: "${String(scripts.dev).slice(0, 80)}"`);
    //  D2: the scripts that run while the dev server serves: dev, its pre/post hooks, and every script they call.
    const running = new Set<string>();
    const q = ['predev', 'dev', 'postdev'];
    while (q.length) {
        const k = q.shift() as string;
        if (running.has(k) || scripts[k] == null) continue;
        running.add(k);
        for (const m of String(scripts[k]).matchAll(/\b(?:npm\s+run(?:-script)?|pnpm(?:\s+run)?|yarn(?:\s+run)?|bun\s+run)\s+([\w:.-]+)/g)) q.push(m[1]);
    }
    for (const k of running) if (BACKEND_SCRIPT.test(String(scripts[k]))) c.no('backendScript', `script "${k}" starts or reaches a server: "${String(scripts[k]).slice(0, 80)}"`);
    for (const d of Object.keys(deps)) {
        if (BACKEND_DEPS.test(d)) c.no('backendDep', `a server package: ${d}`);
        if (BROWSER_STORE_DEPS.test(d)) c.no('browserStore', `a client that writes to another service: ${d}`);
    }
    if (pkg.proxy) c.no('devProxy', 'package.json "proxy"');
    if (pkg.workspaces) c.no('workspace', 'package.json "workspaces"');
    const configs: string[] = [];
    let over = false;
    const walk = async (dir: string, rel: string): Promise<void> => {
        if (over) return;
        if (Date.now() - t0 > budgetMs || facts.read > budgetBytes) { over = true; return; }
        let es: fs.Dirent[];
        try { es = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
        for (const e of es) {
            if (over) return;
            const abs = path.join(dir, e.name), r = rel ? `${rel}/${e.name}` : e.name;
            if (e.isDirectory() || e.isSymbolicLink()) {
                if (e.isSymbolicLink() && e.name !== 'node_modules') { c.no('link', `a link: ${r}`); continue; }
                if (SKIP.has(e.name) || e.name.startsWith('.')) continue;
                if (API_ROUTE_DIR.test(r)) c.no('apiRoutes', `server-side code folder: ${r}/`);
                await walk(abs, r);
                continue;
            }
            if (!e.isFile()) continue;
            facts.files++;
            if (OTHER_RUNTIME_FRONT.test(e.name)) c.no('otherRuntime', `another runtime or a deploy backend: ${r}`);
            if (API_ROUTE_FILE.test(r)) c.no('apiRoutes', `a server route file: ${r}`);
            if (r === 'src/setupProxy.js' || r === 'src/setupProxy.ts') c.no('devProxy', r);
            if (CONFIG.test(e.name)) configs.push(abs);
            if (!CODE.test(e.name) && !/\.(?:json|env[\w.-]*)$/i.test(e.name) && !e.name.startsWith('.env')) continue;
            let st: fs.Stats;
            try { st = await fs.promises.stat(abs); } catch { continue; }
            if (st.size > MAX_CODE_FILE) { c.no('unread', `a code file over 2 MB: ${r}`); continue; }
            const text = await fs.promises.readFile(abs, 'utf8').catch(() => '');
            facts.read += text.length;
            if (!CODE.test(e.name)) continue;
            if (SERVER_START.test(text) && !NOT_SERVER_CODE_PATH.test(r)) c.no('serverCode', `server code: ${r}`);
            const bs = text.match(BROWSER_STORE_TEXT);
            if (bs) c.no('browserStore', `writes to another service: ${r}: ${bs[0].slice(0, 60)}`);
            if (ABS_WRITE.test(text)) c.no('absWrite', `sends to a written outside address: ${r}`);
            const ab = text.match(API_BASE);
            if (ab) c.no('absWrite', `an outside API address written in the front: ${r}: ${ab[0].slice(0, 60)}`);
        }
    };
    await walk(root, '');
    if (over) c.no('budget', `not read whole within the budget (${facts.files} files, ${Math.round((Date.now() - t0) / 1000)} s)`);
    //  D7: configs and every relative file they import, transitively.
    const seen = new Set<string>();
    const queue = [...configs];
    while (queue.length) {
        const f = queue.shift() as string;
        if (seen.has(f)) continue;
        seen.add(f);
        const text = await fs.promises.readFile(f, 'utf8').catch(() => null);
        if (text == null) continue;
        const hook = text.match(DEV_HOOK);
        if (hook) c.no('devProxy', `a dev-server proxy or middleware: ${path.relative(root, f).replace(/\\/g, '/')}: ${hook[0].slice(0, 50)}`);
        for (const m of text.matchAll(IMPORT)) {
            const base = path.resolve(path.dirname(f), m[1]);
            for (const x of [base, ...['.js', '.mjs', '.cjs', '.ts', '.mts', '.json', '/index.js', '/index.ts'].map(e => base + e)]) {
                if (await isFile(x)) { queue.push(x); break; }
            }
        }
    }
}

/**
 * The path for one folder (§2.2), decided in order:
 *   no delivery record → as-today; no `serveUrl` (the audit's own server) → private-live; a static kind →
 *   private-live; a dev server §3 proves a front → private-live; a Node server §3b's router passes → 2t;
 *   anything else (an unproven server, expo-web, unknown, override, already-running) → no-write.
 *
 * `record`: the loop's record from `QaPin.record` (read once by the loop owner, §2.1); when absent the folder is read.
 * `origin`: the chat's project origin (`projectOriginFor`), used only when `record` is absent.
 * Budgets: 30 s and 256 MB read by default; past them → no-write with `budget`.
 */
export async function chooseQaPath(projectRoot: string, input: { kind: string; hasServeUrl: boolean; budgetMs?: number; budgetBytes?: number; record?: QaRecord; origin?: 'built' | 'imported' }): Promise<QaPathChoice> {
    const t0 = Date.now();
    const c = collector();
    const facts = { files: 0, read: 0, ms: 0 };
    const budgetMs = input.budgetMs ?? 30_000;
    const budgetBytes = input.budgetBytes ?? 256 * 1024 * 1024;
    const record: QaRecord = input.record !== undefined ? input.record : hasDeliveryRecord(projectRoot, { origin: input.origin });
    const done = (p: QaPath): QaPathChoice => { facts.ms = Date.now() - t0; return { path: p, reasons: c.reasons, record, facts }; };
    if (!record) return done('as-today');
    if (!input.hasServeUrl) return done('private-live');
    const kind = String(input.kind || '');
    if (STATIC_KINDS.has(kind)) return done('private-live');
    if (NODE_SERVER_KINDS.has(kind)) {
        const t = await prove2T(projectRoot, budgetMs);
        facts.files = t.facts.files;
        facts.read = t.facts.read;
        if (t.ok) return done('2t');
        for (const r of t.reasons) c.no(r.key, r.detail);
        return done('no-write');
    }
    if (kind !== 'dev-server') { c.no('server', `a server of its own (${kind || 'unknown kind'})`); return done('no-write'); }
    await proveFront(projectRoot, budgetMs, budgetBytes, t0, c, facts);
    return done(c.reasons.length ? 'no-write' : 'private-live');
}

/**
 * The path one audit of a loop runs (§2.3): the stricter of the loop's pin and this audit's own choice.
 * `comparable` is false when that path is not the one the loop pinned — the loop then keeps its earlier
 * measurement (no `mendIsBetter`; in `improveUntilItStops` the round returns `{ skipped: true }`) and tells
 * `notComparable`. A pin with no path yet is seeded from this choice (and `first`, `record` with it), so the
 * loop's later audits compare against it; with no pin at all the choice runs as it is.
 */
export function pinnedPath(pin: QaPin | undefined, choice: QaPathChoice): { path: QaPath; comparable: boolean } {
    if (!pin) return { path: choice.path, comparable: true };
    if (!pin.path) {
        pin.path = choice.path;
        if (!pin.first) pin.first = choice;
        if (pin.record === undefined) pin.record = choice.record;
        return { path: choice.path, comparable: true };
    }
    if (!pin.first) pin.first = choice;
    const ran = strictest(pin.path, choice.path);
    return { path: ran, comparable: ran === pin.path };
}
