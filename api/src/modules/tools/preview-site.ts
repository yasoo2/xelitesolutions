/**
 * IS THIS PROJECT A STATIC SITE? — and which chat owns its preview.
 *
 * Eval round 14 (2026-10-24, P001): a landing page Joe wrote file by file
 * (clinic-landing-ar/src/index.html, styles.css, app.js — no bundler, no
 * dist/; a scaffolded package.json whose only script was «node src/index.js»,
 * a file that never existed) reached its browser QA phase with no address:
 * project_run refused the missing target, and the preview route serves only
 * dist/. A correct site was refused with «no_target_for_this_instruction»
 * after 2 hours of work.
 *
 * ⛔ THE ANSWER IS A LOOPBACK SERVER, NOT A WIDER PUBLIC ROUTE. Two adversarial
 * reviews of a version that served source folders through /project-preview
 * (no auth, bound to 0.0.0.0) confirmed what that costs: server code holding
 * an SMTP password readable from the LAN, Windows 8.3 short names past the
 * dot-segment rule, a synchronous crawl per request that froze the API. So
 * /project-preview stays build-output only, and a static site is served only
 * by project_run's dependency-free server on 127.0.0.1 — and only after the
 * project's own start command has failed (staticSiteRoot is a fallback
 * classifier, never a reason to skip a real server).
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { isWithinRoot } from './path-containment';
import { isMachineStateDirectory } from '../../shared/utils/project-tree';

/** The joeProjects key for a chat session — never the browser panel's «browser:» id. */
export function previewKey(sessionId: unknown): string {
    const raw = String(sessionId || '').trim().replace(/^browser:/, '');
    return raw.replace(/[^a-zA-Z0-9._-]/g, '_') || 'default';
}

const BUNDLER = /^(?:vite|react-scripts|expo|parcel|parcel-bundler|webpack|webpack-cli|next|nuxt|@angular\/cli|@angular-devkit\/build-angular|@vue\/cli-service|@sveltejs\/kit|astro|esbuild|rollup|snowpack|gatsby|@remix-run\/dev|svelte|typescript)$/i;

function isFile(file: string): boolean {
    try { return fs.statSync(file).isFile(); } catch { return false; }
}

/** Why this project's SOURCE must not be served as a site, or null. */
export function buildRequirement(dir: string): string | null {
    const manifestPath = path.join(dir, 'package.json');
    if (fs.existsSync(manifestPath)) {
        let manifest: any = {};
        try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) || {}; } catch { return 'its package.json cannot be read'; }
        if (String(manifest?.scripts?.build || '').trim()) return 'it declares a build script';
        const deps = { ...(manifest.dependencies || {}), ...(manifest.devDependencies || {}) };
        const bundler = Object.keys(deps).find(name => BUNDLER.test(name));
        if (bundler) return `it depends on ${bundler}`;
    }
    if (isFile(path.join(dir, 'tsconfig.json'))) return 'it is a TypeScript project';
    return null;
}

const NEEDS_COMPILATION = /\.(?:ts|tsx|jsx|vue|svelte|scss|sass|less)(?:[?#].*)?$/i;
const LOADED_REF = /<(?:script|link|img|source|video|audio|iframe|embed|track)\b[^>]*?\b(?:src|href|poster)\s*=\s*["']([^"']+)["']/gi;

/**
 * Why this HTML cannot be served as-is, or null when it is browser-native.
 * Served at a server root (the loopback server), a root-absolute «/favicon.ico»
 * resolves correctly and is fine.
 */
export function entryHtmlProblem(html: string, opts: { servedAtRoot?: boolean } = {}): string | null {
    const text = String(html || '').replace(/<!--[\s\S]*?-->/g, '');
    if (/%PUBLIC_URL%/.test(text)) return 'it uses a %PUBLIC_URL% placeholder';
    for (const match of text.matchAll(LOADED_REF)) {
        const ref = String(match[1] || '').trim();
        if (!ref || ref.startsWith('#') || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(ref)) continue; // external, data:, mailto:, anchors
        if (NEEDS_COMPILATION.test(ref)) return `it loads "${ref}", which needs a build`;
        if (ref.startsWith('/') && !opts.servedAtRoot) return `it references "${ref}" from the server root`;
    }
    return null;
}

/**
 * The folder holding a build-free site's index.html (src/ first, then the
 * project root), or null. Only for a project whose own start failed: the
 * caller serves it on loopback with the strict static server.
 */
export function staticSiteRoot(projectDir: unknown, opts: { servedAtRoot?: boolean } = {}): string | null {
    const dir = String(projectDir || '').trim();
    if (!dir) return null;
    try { if (!fs.statSync(dir).isDirectory()) return null; } catch { return null; }
    if (buildRequirement(dir)) return null;
    for (const folder of ['src', '.']) {
        const root = folder === '.' ? dir : path.join(dir, folder);
        if (!isWithinRoot(root, dir)) continue;
        const entry = path.join(root, 'index.html');
        if (!isFile(entry)) continue;
        let html = '';
        try { html = fs.readFileSync(entry, 'utf8'); } catch { continue; }
        if (!entryHtmlProblem(html, opts)) return root;
    }
    return null;
}

/** A sentence for the run report: why this project has no static site to serve. */
export function whyNoStaticSite(projectDir: unknown): string {
    const dir = String(projectDir || '').trim();
    if (!dir) return 'no project directory is recorded for this session';
    if (!fs.existsSync(dir)) return `the project directory does not exist: ${dir}`;
    const build = buildRequirement(dir);
    if (build) return `no dist/index.html in ${dir}, and ${build}, so it must be built before it can be previewed`;
    for (const folder of ['src', '.']) {
        const entry = path.join(dir, folder, 'index.html');
        if (!isFile(entry)) continue;
        try {
            const problem = entryHtmlProblem(fs.readFileSync(entry, 'utf8'), { servedAtRoot: true });
            if (problem) return `no dist/index.html in ${dir}; ${path.join(folder, 'index.html')} cannot be served as-is because ${problem}`;
        } catch { /* unreadable */ }
    }
    return `no dist/index.html in ${dir}, and no index.html at its root or in src/`;
}

const ANCHOR = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
// An attribute by its exact name: «data-href» is not «href».
const attribute = (name: string) => new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i');
const HREF = attribute('href');
const TITLE = attribute('title');

function decodeEntities(text: string): string {
    return String(text || '')
        .replace(/&#x([0-9a-f]{1,6});/gi, (m, hex) => { try { return String.fromCodePoint(parseInt(hex, 16)); } catch { return m; } })
        .replace(/&#(\d{1,7});/g, (m, dec) => { try { return String.fromCodePoint(Number(dec)); } catch { return m; } })
        .replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
        .replace(/&amp;/gi, '&');
}

/**
 * The names a directory listing at `pageUrl` shows: each link that points at
 * a direct child of the listed path AND reads as that child's own name (its
 * text or title is the name, a folder's with its trailing «/»). That is how
 * every listing writes an entry — serve, http-server, Python's http.server,
 * serve-index, nginx and Apache autoindex — and how a site does not write its
 * navigation: «/admin» reads «Admin panel», «/api/health» is not a child of
 * «/», «#services» is an anchor.
 */
function listedEntryNames(html: string, pageUrl: string): Set<string> {
    let base: URL;
    try { base = new URL(pageUrl); } catch { return new Set(); }
    const listedPath = base.pathname.endsWith('/') ? base.pathname : `${base.pathname.replace(/[^/]*$/, '')}`;
    const names = new Set<string>();
    for (const match of String(html || '').matchAll(ANCHOR)) {
        const attributes = match[1] || '';
        const hrefMatch = HREF.exec(attributes);
        if (!hrefMatch) continue;
        // `serve` on Windows writes «\src&#47;» — a folder link with a backslash.
        const ref = decodeEntities(hrefMatch[1] ?? hrefMatch[2] ?? '').trim().replace(/\\/g, '/');
        if (!ref || ref.startsWith('#') || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(ref)) continue;
        let target: URL;
        try { target = new URL(ref, base); } catch { continue; }
        if (target.origin !== base.origin || !target.pathname.startsWith(listedPath)) continue;
        const rest = target.pathname.slice(listedPath.length).replace(/\/$/, '');
        if (!rest || rest.includes('/')) continue; // the listed folder itself, its parent, or deeper
        let name = rest;
        try { name = decodeURIComponent(rest); } catch { /* keep the raw segment */ }
        const said = (text: string) => {
            const t = decodeEntities(text).replace(/\s+/g, ' ').trim();
            return t === name || t === `${name}/` || t.startsWith(`${name} `) || t.startsWith(`${name}/ `);
        };
        const titleMatch = TITLE.exec(attributes);
        const text = String(match[2] || '').replace(/<[^>]*>/g, ' ');
        if (said(text) || (titleMatch && said(titleMatch[1] ?? titleMatch[2] ?? ''))) names.add(name.toLowerCase());
    }
    return names;
}

/** True when this folder answers «/» with a document of its own instead of a listing. */
function holdsIndexDocument(entries: fs.Dirent[]): boolean {
    return entries.some(entry => !entry.isDirectory() && /^index\.html?$/i.test(entry.name));
}

/** A loopback GET: its status and body (up to 1 MB), or null. Only project_run's own child is asked. */
function fetchLoopback(url: URL, timeoutMs = 2500): Promise<{ status: number; body: Buffer } | null> {
    if (url.protocol !== 'http:' || !/^(?:127\.0\.0\.1|localhost|\[::1\])$/i.test(url.hostname)) return Promise.resolve(null);
    return new Promise(resolve => {
        const req = http.get(url, { timeout: timeoutMs }, res => {
            const chunks: Buffer[] = [];
            let size = 0;
            res.on('data', (chunk: Buffer) => { size += chunk.length; if (size <= 1_000_000) chunks.push(chunk); });
            res.on('end', () => resolve(size > 1_000_000 ? null : { status: res.statusCode || 0, body: Buffer.concat(chunks) }));
            res.on('error', () => resolve(null));
        });
        req.on('timeout', () => { req.destroy(); resolve(null); });
        req.on('error', () => resolve(null));
    });
}

/**
 * …AND THE SERVER ITSELF CONFIRMS IT (review r21, second round).
 *
 * The shape above is a name overlap: a working app whose home page links
 * «/admin» and «/api», with its server in src/ beside admin/ and api/, named
 * two of src/'s three entries and was killed as a listing; so was a
 * bilingual page linking «/en» and «/ar» beside locales/en and locales/ar. A
 * file server is known by what it serves: a listed FILE answers with its own
 * bytes, a listed FOLDER with a listing of that folder's own children. An app
 * route answers with its page. So a candidate folder is a served listing only
 * when the server, asked for its entries, answers as a file server does. A
 * few entries are asked (each probe is one loopback request); if none
 * confirms, the page is not called a listing — browser QA still judges what
 * it shows.
 */
async function servedAsListing(folder: string, entries: fs.Dirent[], listed: Set<string>, pageUrl: string): Promise<boolean> {
    let base: URL;
    try { base = new URL(pageUrl); } catch { return false; }
    base = new URL(base.pathname.endsWith('/') ? base.pathname : base.pathname.replace(/[^/]*$/, ''), base);
    const named = entries.filter(entry => !entry.name.startsWith('.') && listed.has(entry.name.toLowerCase()));
    for (const entry of named.filter(e => e.isFile()).slice(0, 3)) {
        const answer = await fetchLoopback(new URL(encodeURIComponent(entry.name), base));
        if (!answer || answer.status !== 200) continue;
        const disk = await fs.promises.readFile(path.join(folder, entry.name)).catch(() => null);
        if (disk && answer.body.equals(disk)) return true;
    }
    for (const entry of named.filter(e => e.isDirectory()).slice(0, 3)) {
        const url = new URL(`${encodeURIComponent(entry.name)}/`, base);
        const answer = await fetchLoopback(url);
        if (!answer || answer.status !== 200) continue;
        const children = (await fs.promises.readdir(path.join(folder, entry.name), { withFileTypes: true }).catch(() => [] as fs.Dirent[]))
            .filter(child => !child.name.startsWith('.'));
        const inner = listedEntryNames(answer.body.toString('utf8'), url.href);
        const hits = children.filter(child => inner.has(child.name.toLowerCase())).length;
        if (children.length && hits * 5 >= children.length * 3) return true;
    }
    return false;
}

/**
 * IS WHAT THE SERVER ANSWERED A LIST OF THIS PROJECT'S FILES?
 *
 * Eval run500, 2026-10-27 (P001-landing-ar): the site was written into
 * src/index.html and the model's start script was «npx serve -l 8080». serve
 * answered — from the project root, which holds no index.html — with its
 * «Files within dental-clinic-site» listing. project_run called that «the
 * project is running», browser QA measured the listing («not one button,
 * link or form», «largest heading 15px»), and repair had no file of the site
 * to change. A correct site failed after 106 minutes.
 *
 * ⛔ AND A WORKING APP IS NOT A LISTING (review r21, b4094048). The first rule
 * was «links two top-level entries, one of them a folder»: an Express/EJS
 * home page linking /admin and /api/health, in a project with admin/ and
 * api/ folders, was called a listing and project_run killed the app. And it
 * could not see a listing of a subfolder at all (`serve public`).
 *
 * So the evidence is the listing's own shape, measured against the folder
 * actually being served: the page names, as listings do, at least two
 * entries of one project folder that holds no index document, and those are
 * most of that folder's visible entries (≥ 60 %; dot-files are not counted,
 * since most listers hide them). The served folder is not guessed from the
 * command: every folder of the project is a candidate (machine state such as
 * node_modules is not served), read asynchronously, stopping at the first
 * folder that matches.
 */
export async function listsProjectFiles(html: unknown, projectDir: unknown, pageUrl = 'http://127.0.0.1/'): Promise<boolean> {
    const dir = String(projectDir || '').trim();
    if (!dir) return false;
    const listed = listedEntryNames(String(html || ''), pageUrl);
    if (listed.size < 2) return false;
    const pending = [dir];
    while (pending.length) {
        const folder = pending.pop() as string;
        let entries: fs.Dirent[];
        try { entries = await fs.promises.readdir(folder, { withFileTypes: true }); } catch { continue; }
        for (const entry of entries) {
            if (entry.isDirectory() && !isMachineStateDirectory(entry.name)) pending.push(path.join(folder, entry.name));
        }
        if (holdsIndexDocument(entries)) continue;
        const visible = entries.filter(entry => !entry.name.startsWith('.'));
        const named = visible.filter(entry => listed.has(entry.name.toLowerCase())).length;
        if (named >= 2 && named * 5 >= visible.length * 3 && await servedAsListing(folder, entries, listed, pageUrl)) return true;
    }
    return false;
}
