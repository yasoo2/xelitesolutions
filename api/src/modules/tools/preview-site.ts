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
import path from 'path';
import { isWithinRoot } from './path-containment';

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

const LINK_HREF = /<a\b[^>]*?\bhref\s*=\s*["']([^"']*)["']/gi;

/** The project folder's own top-level entry a listing link points at, or ''. */
function listedTopLevelName(href: string): string {
    let ref = String(href || '')
        .replace(/&#(?:47|x2f);/gi, '/')
        .replace(/&#(?:92|x5c);/gi, '\\')
        .replace(/&amp;/gi, '&');
    try { ref = decodeURIComponent(ref); } catch { /* keep the raw text */ }
    // `serve` on Windows writes «\src&#47;» — a folder link with a backslash.
    ref = ref.replace(/\\/g, '/').replace(/[?#].*$/, '');
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(ref)) return '';
    const segments = ref.replace(/^(?:\.?\/)+/, '').split('/');
    return segments[0] || '';
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
 * Generator-independent: a page that links the project's own manifest, or
 * two of its top-level entries one of which is a folder, is the folder's
 * index — a site does not link its package.json or its src/ directory. A
 * project with its own root index.html is never judged: any static server
 * there answers with that document.
 */
export function listsProjectFiles(html: unknown, projectDir: unknown): boolean {
    const dir = String(projectDir || '').trim();
    if (!dir || isFile(path.join(dir, 'index.html'))) return false;
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return false; }
    const byName = new Map(entries.map(entry => [entry.name.toLowerCase(), entry]));
    const linked = new Set<string>();
    let linksAFolder = false;
    for (const match of String(html || '').matchAll(LINK_HREF)) {
        const name = listedTopLevelName(match[1]).toLowerCase();
        const entry = name ? byName.get(name) : undefined;
        if (!entry) continue;
        linked.add(name);
        if (entry.isDirectory()) linksAFolder = true;
    }
    return linked.has('package.json') || (linked.size >= 2 && linksAFolder);
}
