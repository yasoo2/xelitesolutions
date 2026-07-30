/**
 * Real photographs for the pages Joe builds.
 *
 * The builder was told "never external image hosts", and the QA pass replaced any
 * it found with a grey box reading "Image" — so every page Joe produced was
 * gradients and emoji. That is the single biggest reason the results looked like
 * a prototype rather than a site.
 *
 * The model now writes {{IMAGE:a subject}} wherever a photograph belongs. Those
 * markers are resolved here: searched on Openverse (openly-licensed images, no
 * API key), downloaded once, cached on disk, and served from Joe itself. Pages
 * therefore keep working with no internet after the first build — the same
 * reason the Google avatar is cached rather than hot-linked.
 *
 * If the network is unavailable the marker degrades to a tasteful gradient
 * placeholder. It never leaves a broken image, and it never silently claims a
 * photo it does not have.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/** Read at call time, not at import time: an env var set after this module is
 *  loaded (tests, a redeploy that swaps the source) must still take effect. */
function imageApi(): string {
    return String(process.env.JOE_IMAGE_API || 'https://api.openverse.org/v1/images/');
}

export interface ResolvedImage {
    query: string;
    /** URL to use in the page — always local to Joe. */
    src: string;
    alt: string;
    /** Attribution, required by most open licences. */
    credit?: { creator: string; license: string; source: string };
    fromCache: boolean;
}

function imagesDir(artifactDir: string): string {
    return path.join(artifactDir, 'images');
}

function cacheName(query: string): string {
    return crypto.createHash('sha256').update(query.toLowerCase().trim()).digest('hex').slice(0, 32);
}

/** An existing cached file for this query, if any. */
function findCached(artifactDir: string, query: string): string | null {
    const dir = imagesDir(artifactDir);
    const base = cacheName(query);
    try {
        for (const ext of ['.jpg', '.jpeg', '.png', '.webp', '.gif']) {
            const f = path.join(dir, base + ext);
            if (fs.existsSync(f) && fs.statSync(f).size > 0) return `/artifacts/images/${base}${ext}`;
        }
    } catch { /* unreadable cache is the same as no cache */ }
    return null;
}

function extFor(contentType: string): string {
    const t = contentType.toLowerCase();
    if (t.includes('png')) return '.png';
    if (t.includes('webp')) return '.webp';
    if (t.includes('gif')) return '.gif';
    return '.jpg';
}

async function fetchJson(url: string, timeoutMs: number): Promise<any | null> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Joe-AI-Agent' } });
        if (!r.ok) return null;
        return await r.json();
    } catch { return null; } finally { clearTimeout(t); }
}

/**
 * Search + download one photograph for `query`. Returns null when the network is
 * unavailable or nothing suitable was found — the caller falls back to a
 * gradient rather than leaving a hole.
 */
export async function sourceImage(artifactDir: string, query: string, timeoutMs = 9000): Promise<ResolvedImage | null> {
    const cached = findCached(artifactDir, query);
    if (cached) return { query, src: cached, alt: query, fromCache: true };

    const url = `${imageApi()}?q=${encodeURIComponent(query)}&page_size=3&mature=false&license_type=all-cc`;
    const data = await fetchJson(url, timeoutMs);
    const results: any[] = Array.isArray(data?.results) ? data.results : [];
    for (const r of results) {
        const src = String(r?.url || r?.thumbnail || '').trim();
        if (!src) continue;
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            const res = await fetch(src, { signal: ctrl.signal, headers: { 'User-Agent': 'Joe-AI-Agent' } });
            if (!res.ok) continue;
            const contentType = String(res.headers.get('content-type') || '');
            if (!contentType.startsWith('image/')) continue;
            const buf = Buffer.from(await res.arrayBuffer());
            if (!buf.length || buf.length > 6_000_000) continue;
            const dir = imagesDir(artifactDir);
            fs.mkdirSync(dir, { recursive: true });
            const name = cacheName(query) + extFor(contentType);
            fs.writeFileSync(path.join(dir, name), buf);
            return {
                query,
                src: `/artifacts/images/${name}`,
                alt: String(r?.title || query).slice(0, 120),
                credit: {
                    creator: String(r?.creator || 'Unknown'),
                    license: String(r?.license || '').toUpperCase(),
                    source: String(r?.foreign_landing_url || r?.url || ''),
                },
                fromCache: false,
            };
        } catch { /* try the next result */ } finally { clearTimeout(t); }
    }
    return null;
}

/** A gradient stand-in, used only when a real photo could not be obtained. */
export function gradientPlaceholder(query: string, hue: number): string {
    const h2 = (hue + 40) % 360;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">` +
        `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
        `<stop offset="0%" stop-color="hsl(${hue},62%,58%)"/><stop offset="100%" stop-color="hsl(${h2},68%,40%)"/>` +
        `</linearGradient></defs><rect width="800" height="600" fill="url(#g)"/>` +
        `<text x="50%" y="52%" font-family="system-ui,sans-serif" font-size="30" fill="rgba(255,255,255,.85)" ` +
        `text-anchor="middle">${escapeXml(query).slice(0, 40)}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function escapeXml(s: string): string {
    return String(s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c] as string));
}

export const IMAGE_MARKER = /\{\{\s*IMAGE\s*:\s*([^}]{2,80}?)\s*\}\}/g;

export interface ImageResolution {
    html: string;
    requested: number;
    real: number;
    credits: Array<{ creator: string; license: string; source: string }>;
}

/**
 * Replace every {{IMAGE:...}} marker in the page. Distinct queries are fetched
 * once and reused, and the whole pass is bounded so a slow network cannot hold a
 * build hostage.
 */
export async function resolveImages(html: string, artifactDir: string, hue: number, opts?: { max?: number; timeoutMs?: number }): Promise<ImageResolution> {
    const max = opts?.max ?? 12;
    const queries: string[] = [];
    for (const m of String(html).matchAll(IMAGE_MARKER)) {
        const q = m[1].trim();
        if (q && !queries.includes(q)) queries.push(q);
    }
    if (!queries.length) return { html, requested: 0, real: 0, credits: [] };

    const resolved = new Map<string, ResolvedImage>();
    // Sequential on purpose: a laptop on a home connection does better with one
    // request at a time than with a dozen competing ones.
    for (const q of queries.slice(0, max)) {
        const img = await sourceImage(artifactDir, q, opts?.timeoutMs ?? 9000);
        if (img) resolved.set(q, img);
    }

    const credits: ImageResolution['credits'] = [];
    const out = String(html).replace(IMAGE_MARKER, (_full, rawQuery: string) => {
        const q = String(rawQuery).trim();
        const img = resolved.get(q);
        if (!img) return gradientPlaceholder(q, hue);
        if (img.credit && img.credit.license && !credits.some(c => c.source === img.credit!.source)) {
            credits.push(img.credit);
        }
        return img.src;
    });

    return { html: out, requested: queries.length, real: resolved.size, credits };
}
