/**
 * Publish source — what «انشر المشروع» actually publishes.
 *
 * The promise at the end of every build is «انشر المشروع» → a permanent URL.
 * Measured end to end, the chain was broken twice:
 *
 *  1. deploy_pages read the WORKSPACE root, which for a freshly built page is
 *     an empty my-workspace folder — the reply was «لا يوجد سكربت build ولا
 *     index.html — لا شيء ثابت لنشره» seconds after Joe finished building a
 *     complete page somewhere else (the artifacts dir).
 *
 *  2. The page's real photographs are written as src="/artifacts/images/…" —
 *     an absolute path only Joe's local server answers. Published verbatim to
 *     https://owner.github.io/repo/, every one of them 404s: the site goes
 *     live with the exact «بدون صور» defect the builder just fixed.
 *
 * This module closes both: it FINDS the thing Joe most recently built (the
 * session's site, its split project, its single page — then the newest build
 * mirrored for the File Explorer), and STAGES it as a self-contained static
 * site: entry renamed to index.html, every referenced /artifacts/ asset
 * copied in next to the page and the reference rewritten relative, so the
 * folder works from ANY host with no Joe server behind it.
 */
import fs from 'fs';
import path from 'path';

export interface BuiltSource {
    kind: 'site' | 'project' | 'page';
    /** Absolute directory to publish wholesale (site/project). */
    dir?: string;
    /** Absolute single html file to publish as index.html (page). */
    file?: string;
    /** Where it came from, for the user's report. */
    labelAr: string;
}

const sessionKeyOf = (sessionId: any) =>
    String(sessionId || 'default').replace(/[^a-zA-Z0-9._-]/g, '_');

/**
 * The most recently built artifact this session — or, when the session store
 * is gone (a restart), the newest build mirrored under joe-output/.
 */
export function findBuiltArtifact(opts: {
    sessionId?: any;
    artifactDir: string;
    explorerRoot?: string;
}): BuiltSource | null {
    const { sessionId, artifactDir, explorerRoot } = opts;
    const key = sessionKeyOf(sessionId);
    const store = (global as any).joePages?.[key];

    // 1) The session's multi-page site.
    if (store?.site?.dir) {
        const dir = path.join(artifactDir, store.site.dir);
        if (fs.existsSync(path.join(dir, 'index.html'))) {
            return { kind: 'site', dir, labelAr: 'الموقع الذي بنيته في هذه الجلسة' };
        }
    }
    // 2) The session's split project (index.html + styles.css + script.js).
    {
        const dir = path.join(artifactDir, `joe-${key}`);
        if (fs.existsSync(path.join(dir, 'index.html'))) {
            return { kind: 'project', dir, labelAr: 'الصفحة التي بنيتها في هذه الجلسة' };
        }
    }
    // 3) The session's combined single file.
    {
        const file = path.join(artifactDir, store?.filename && /\.html?$/i.test(store.filename)
            ? store.filename : `joe-${key}.html`);
        if (fs.existsSync(file)) {
            return { kind: 'page', file, labelAr: 'الصفحة التي بنيتها في هذه الجلسة' };
        }
    }
    // 4) The newest mirrored build in the File Explorer (survives restarts).
    if (explorerRoot) {
        const out = path.join(explorerRoot, 'joe-output');
        try {
            const dirs = fs.readdirSync(out)
                .map(name => path.join(out, name))
                .filter(p => { try { return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'index.html')); } catch { return false; } })
                .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
            if (dirs.length) return { kind: 'project', dir: dirs[0], labelAr: 'آخر بناء محفوظ في مستعرض الملفات' };
        } catch { /* no mirror yet */ }
    }
    return null;
}

/**
 * Copy the source into `stage` as a publishable static site and make it
 * SELF-CONTAINED: /artifacts/... references become local relative files.
 * Returns what was done, so the caller can report it instead of implying it.
 */
export function stageForPages(src: BuiltSource, stage: string, artifactDir: string): {
    files: number; assetsLocalized: number; unresolved: string[];
} {
    fs.mkdirSync(stage, { recursive: true });
    if (src.dir) {
        fs.cpSync(src.dir, stage, { recursive: true });
    } else if (src.file) {
        fs.copyFileSync(src.file, path.join(stage, 'index.html'));
    }

    let assetsLocalized = 0;
    const unresolved: string[] = [];
    const seen = new Map<string, string>();   // /artifacts/x → relative path

    const localize = (ref: string): string | null => {
        if (seen.has(ref)) return seen.get(ref)!;
        const rel = decodeURIComponent(ref.replace(/^\/artifacts\//, ''));
        // Never allow the reference to climb out of the artifacts dir.
        const rootAbs = path.resolve(artifactDir);
        const abs = path.resolve(artifactDir, rel);
        if (!abs.startsWith(rootAbs + path.sep) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
            unresolved.push(ref);
            seen.set(ref, '');
            return null;
        }
        const to = path.join(stage, rel);
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(abs, to);
        assetsLocalized++;
        seen.set(ref, rel);
        return rel;
    };

    let files = 0;
    const walk = (dir: string) => {
        for (const name of fs.readdirSync(dir)) {
            const p = path.join(dir, name);
            if (fs.statSync(p).isDirectory()) { walk(p); continue; }
            files++;
            if (!/\.(html?|css|js)$/i.test(name)) continue;
            const before = fs.readFileSync(p, 'utf-8');
            // src="/artifacts/…", href="/artifacts/…", url(/artifacts/…) —
            // every form the pipeline (or the model) writes.
            const after = before.replace(/(["'(])\/artifacts\/([^"')\s>]+)/g, (whole, open: string, tail: string) => {
                const rel = localize(`/artifacts/${tail}`);
                if (!rel) return whole;
                // The page may sit in a subfolder of the stage; references are
                // rewritten relative to the FILE that holds them — and encoded,
                // because a bare space in url(...) is invalid CSS.
                const fromDir = path.dirname(p);
                const relFromFile = path.relative(fromDir, path.join(stage, rel)).split(path.sep).join('/');
                return `${open}${encodeURI(relFromFile)}`;
            });
            if (after !== before) fs.writeFileSync(p, after, 'utf-8');
        }
    };
    walk(stage);
    return { files, assetsLocalized, unresolved };
}
