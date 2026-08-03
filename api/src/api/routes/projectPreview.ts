/**
 * LIVE PREVIEW for scaffolded projects — the missing half of the surgical
 * edit loop. Pages preview through /artifacts; a React project's production
 * build lives in its OWN dist/ inside the workspace, which nothing served.
 * So «ضف صورة» rebuilt the project, reported success… and the preview panel
 * had no URL to show the change on.
 *
 * This serves the ACTIVE project's dist per session key, resolved at REQUEST
 * time (the entry moves when a new project is scaffolded — a cached mount
 * would go stale). No auth on purpose, like /artifacts: the preview iframe
 * cannot attach a bearer token, and what is served is the user's own built
 * site on their own machine. no-store so every refresh shows the newest build.
 */
import { Router } from 'express';
import fs from 'fs';
import path from 'path';

/** The absolute file this preview request maps to, or null when it must 404. */
export function resolvePreviewFile(key: string, rel: string): string | null {
    const clean = String(key || '').replace(/[^a-zA-Z0-9._-]/g, '');
    const entry = ((global as any).joeProjects || {})[clean];
    if (!clean || !entry?.dir) return null;
    const dist = path.normalize(path.join(String(entry.dir), 'dist'));
    if (!fs.existsSync(dist)) return null;
    const file = path.normalize(path.join(dist, decodeURIComponent(String(rel || '')) || 'index.html'));
    if (!file.startsWith(dist + path.sep) && file !== dist) return null;   // no path escapes
    if (!fs.existsSync(file)) return null;
    if (fs.statSync(file).isDirectory()) {
        const idx = path.join(file, 'index.html');
        return fs.existsSync(idx) ? idx : null;
    }
    return file;
}

const router = Router();

// A regex route, not '/:key/*' — this Express's path parser rejects a bare
// star, and the preview must serve arbitrarily nested asset paths.
router.get(/^\/([a-zA-Z0-9._-]+)(?:\/(.*))?$/, (req, res) => {
    try {
        const key = String((req.params as any)[0] || '');
        const rel = String((req.params as any)[1] || '');
        const file = resolvePreviewFile(key, rel);
        if (!file) return res.status(404).send('No built project to preview — build one first.');
        res.setHeader('Cache-Control', 'no-store');
        return res.sendFile(file);
    } catch {
        return res.status(500).end();
    }
});

export default router;
