/**
 * THE LAB'S LIVE APPS, FOR THE STEP-1 TESTS (design v13.3 §12; agent H).
 *
 * The owner's live app in these tests is a real server started by Joe's own `project_run`, from a real folder,
 * holding the owner's records. The shapes are the accounts lab's (`D:\Joe\eval\egm\accounts-lab\fixtures\app7…app14.js`,
 * kept here as `app*.cjs` so git keeps them): every one logs each request it receives to `<project>.req.log`
 * beside the project, so a test reads what really reached the owner's server. The attack's dev-server shapes
 * (`egm-accounts-adv12-attack\fx\classify\…`) are kept as one JSON file and written out at test time.
 *
 * Nothing secret is kept here: the `.env` each shape loads is written when the test runs, and the only account is
 * the lab's made-up one.
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import type { AddressInfo } from 'net';

export const LIVE_APP_FIXTURES = __dirname;

/** The lab's made-up owner account (app7–app12 accept it). */
export const OWNER_ACCOUNT = { identity: 'owner@his-company.com', password: 'owner-secret-1' };

/** A delivery record (§2.1): `.joe/history.json` with one delivered run. */
export const DELIVERED_HISTORY = JSON.stringify([{ request: 'the first build', status: 'delivered', summary: '', at: 1 }]);

export interface LiveShape {
    name: string;
    app: string;
    flags: string;
    /** The project folder (the owner's app). */
    dir: string;
    /** The owner's store file the shape keeps its records in. */
    store: string;
    /** Every request the app received, one line each (`METHOD /path  BODY …`), beside the project. */
    log: string;
}

const STORE_OF = (app: string, flags: string, dir: string): string => {
    const f = flags.split(',');
    if (app === 'app14') return path.join(dir, 'data', f.includes('sqlite') ? 'shop.db' : 'store.json');
    if (['app9', 'app10', 'app11', 'app12', 'app13'].includes(app)) return path.join(dir, 'data', 'store.json');
    if (app === 'app7' && f.includes('root')) return path.join(dir, 'users.json');
    return path.join(dir, 'data', 'users.json');
};

/**
 * One of the lab's shapes as the owner's project: `app.js` (the shape), `server.js` (the lab's start: port from PORT,
 * the project folder, the flags), `package.json` (`npm start` = `node server.js`), a `.env` written now, and — when
 * `delivered` — the delivery record that makes every run on it a change run.
 */
export function labShape(parent: string, name: string, app: string, flags: string, opts: { delivered?: boolean; dependencies?: Record<string, string>; partner?: boolean; files?: Record<string, string> } = {}): LiveShape {
    const dir = path.join(parent, name);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, '.joe'), { recursive: true });
    let code = fs.readFileSync(path.join(LIVE_APP_FIXTURES, `${app}.cjs`), 'utf8');
    //  The lab's «partner» origin on port+1 (the stand-in for an outside mail service) listens only when asked.
    code = code.replace(/\nhttp\.createServer\(async \(req, res\) => \{ const raw = await body\(req\); fs\.appendFileSync\(log, `X-ORIGIN/, m => '\nif (process.env.JOE_LAB_PARTNER) ' + m.slice(1));
    //  One file, as a built app's server is: project_run reads its listen before it starts it.
    fs.writeFileSync(path.join(dir, 'server.js'), [
        ...(opts.partner ? ["process.env.JOE_LAB_PARTNER = '1';"] : []),
        `process.argv[2] = process.env.PORT; process.argv[3] = __dirname; process.argv[4] = ${JSON.stringify(flags === '-' ? '' : flags)};`,
        code,
    ].join('\n'));
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
        name: `shop-${name}`, private: true, scripts: { start: 'node server.js' },
        ...(opts.dependencies ? { dependencies: opts.dependencies } : {}),
    }, null, 2));
    //  Written at test time, never committed (§10).
    fs.writeFileSync(path.join(dir, '.env'), 'NODE_ENV=production\n');
    //  A declared dependency is «installed» as an empty package, so project_run starts the app without asking npm
    //  for it (the suite never reaches the network); the router reads the manifest, never node_modules.
    for (const dep of Object.keys(opts.dependencies || {})) {
        const at = path.join(dir, 'node_modules', dep);
        fs.mkdirSync(at, { recursive: true });
        fs.writeFileSync(path.join(at, 'package.json'), JSON.stringify({ name: dep, version: String(opts.dependencies![dep]).replace(/^[^\d]*/, ''), main: 'index.js' }));
        fs.writeFileSync(path.join(at, 'index.js'), 'module.exports = {};\n');
    }
    if (opts.delivered !== false) fs.writeFileSync(path.join(dir, '.joe', 'history.json'), DELIVERED_HISTORY);
    for (const [rel, text] of Object.entries(opts.files || {})) {
        fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
        fs.writeFileSync(path.join(dir, rel), text);
    }
    const log = path.join(parent, `${name}.req.log`);
    fs.rmSync(log, { force: true });
    return { name, app, flags, dir, store: STORE_OF(app, flags, dir), log };
}

let attack: Record<string, Record<string, string>> | null = null;
/** The v12 attack's shapes by name (the 11 dev servers of §13.2). */
export function attackShapeNames(): string[] {
    attack = attack || JSON.parse(fs.readFileSync(path.join(LIVE_APP_FIXTURES, 'attack-shapes.json'), 'utf8'));
    return Object.keys(attack!).sort();
}
/** Writes one attack shape into `parent/<name>`, with the delivery marker when `delivered`. */
export function attackShape(parent: string, name: string, delivered = true): string {
    attack = attack || JSON.parse(fs.readFileSync(path.join(LIVE_APP_FIXTURES, 'attack-shapes.json'), 'utf8'));
    const files = attack![name];
    if (!files) throw new Error(`no attack shape named ${name}`);
    const dir = path.join(parent, name);
    fs.rmSync(dir, { recursive: true, force: true });
    for (const [rel, text] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
        fs.writeFileSync(path.join(dir, rel), text);
    }
    if (delivered) {
        fs.mkdirSync(path.join(dir, '.joe'), { recursive: true });
        fs.writeFileSync(path.join(dir, '.joe', 'delivered'), '');
    }
    return dir;
}

/** The requests the shape's server received (top-level log lines). */
export function requestsOf(shape: LiveShape): string[] {
    let text = '';
    try { text = fs.readFileSync(shape.log, 'utf8'); } catch { text = ''; }
    return text.split('\n').filter(l => l && !l.startsWith('  '));
}
/** The non-GET requests the owner's server received (the lab's rule: a GET, HEAD, OPTIONS or WS upgrade is not a write). */
export function writesOf(shape: LiveShape): string[] {
    return requestsOf(shape).filter(l => !/^(?:GET|HEAD|OPTIONS|WS-UPGRADE|(?:FRONT|API)[ -](?:GET|HEAD|OPTIONS)) /.test(l) && !/^X-ORIGIN (?:GET|OPTIONS) /.test(l));
}
export function clearLog(shape: LiveShape): void { fs.rmSync(shape.log, { force: true }); }

/** Every file under a folder, relative, with its bytes. */
export function filesUnder(dir: string): Array<{ rel: string; abs: string; bytes: Buffer }> {
    const out: Array<{ rel: string; abs: string; bytes: Buffer }> = [];
    const walk = (d: string, rel: string) => {
        let entries: fs.Dirent[] = [];
        try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            const r = rel ? `${rel}/${e.name}` : e.name;
            const a = path.join(d, e.name);
            if (e.isDirectory()) walk(a, r);
            else if (e.isFile()) { try { out.push({ rel: r, abs: a, bytes: fs.readFileSync(a) }); } catch { /* gone */ } }
        }
    };
    walk(dir, '');
    return out;
}

export interface Hit { method: string; url: string; body: string; host: string }
export interface Served { url: string; port: number; hits: Hit[]; server: http.Server; close(): Promise<void> }
/** A plain server that logs every request it receives. */
export function serve(handler: (req: http.IncomingMessage, res: http.ServerResponse, body: string) => void, host = '127.0.0.1'): Promise<Served> {
    const hits: Hit[] = [];
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', () => { hits.push({ method: String(req.method), url: String(req.url), body, host: String(req.headers.host || '') }); handler(req, res, body); });
    });
    server.on('upgrade', (req, socket) => { hits.push({ method: 'UPGRADE', url: String(req.url), body: '', host: String(req.headers.host || '') }); socket.destroy(); });
    return new Promise(resolve => server.listen(0, host, () => {
        const port = (server.address() as AddressInfo).port;
        const shown = host === '::' || host === '0.0.0.0' ? '127.0.0.1' : host;
        resolve({ url: `http://${shown}:${port}/`, port, hits, server, close: () => new Promise<void>(r => { server.closeAllConnections?.(); server.close(() => r()); }) });
    }));
}

/** A request straight to the app, not through Joe's browser (the owner using his own app). */
export function send(url: string, method = 'GET', body?: unknown): Promise<{ status: number; text: string }> {
    return new Promise(resolve => {
        const raw = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
        const req = http.request(url, { method, timeout: 8000, headers: raw ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(raw) } : {} }, res => {
            let text = '';
            res.on('data', c => { text += c; });
            res.on('end', () => resolve({ status: res.statusCode || 0, text }));
        });
        req.on('timeout', () => req.destroy(new Error('timeout')));
        req.on('error', () => resolve({ status: 0, text: '' }));
        req.end(raw);
    });
}

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export const nonGet = (hits: Hit[]) => hits.filter(h => !/^(?:GET|HEAD|OPTIONS)$/.test(h.method));
