/**
 * Real photographs for the pages Joe builds.
 *
 * The builder was told "never external image hosts", and the QA pass replaced any
 * it found with a grey box reading "Image" — so every page Joe produced was
 * gradients and emoji. That is the single biggest reason the results looked like
 * a prototype rather than a site.
 *
 * The model now writes {{IMAGE:a subject}} wherever a photograph belongs. Those
 * markers are resolved here: every archive in photo-sources.ts is asked at once,
 * their answers compete in one ranked pool, and the winner is downloaded once,
 * cached on disk, and served from Joe itself. Pages therefore keep working with
 * no internet after the first build — the same reason the Google avatar is
 * cached rather than hot-linked.
 *
 * If the network is unavailable the marker degrades to a tasteful gradient
 * placeholder. It never leaves a broken image, and it never silently claims a
 * photo it does not have.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { parseSlot, scoreCandidate, SLOTS, buildImageBrief, groundSubject, type ImageSlot, type ImageBrief } from './image-brief';
import { searchAllSources, availableSources, type SourceOutcome } from './photo-sources';

/** What the archives said the last time one was asked — reported to the user so
 *  "no photo" is always accompanied by the reason there is no photo. */
let lastSourceOutcomes: SourceOutcome[] = [];
export function takeSourceOutcomes(): SourceOutcome[] { const o = lastSourceOutcomes; lastSourceOutcomes = []; return o; }
export { availableSources };

export interface ResolvedImage {
    query: string;
    /** URL to use in the page — always local to Joe. */
    src: string;
    alt: string;
    /** Attribution, required by most open licences. */
    credit?: { creator: string; license: string; source: string };
    fromCache: boolean;
    /** Where on the page this photo belongs. */
    slot?: ImageSlot;
    /** Which archive it actually came from. */
    provider?: string;
    /** Intrinsic size, so the page can reserve the box and not jump while loading. */
    width?: number;
    height?: number;
    bytes?: number;
}

/**
 * Intrinsic dimensions straight from the file header (JPEG/PNG/GIF/WebP).
 * Without width/height on an <img>, the browser reserves no space and the whole
 * page jumps when each photo arrives — the layout shift is the most visible
 * defect a generated page can have.
 */
export function imageSize(buf: Buffer): { width: number; height: number } | null {
    try {
        // PNG
        if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
            return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
        }
        // GIF
        if (buf.length > 10 && buf.toString('ascii', 0, 3) === 'GIF') {
            return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
        }
        // WebP (VP8X / VP8 / VP8L)
        if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
            const fmt = buf.toString('ascii', 12, 16);
            if (fmt === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
            if (fmt === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
            if (fmt === 'VP8L') {
                const b = buf.readUInt32LE(21);
                return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
            }
        }
        // JPEG: walk the segments to the frame header
        if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
            let i = 2;
            while (i < buf.length - 9) {
                if (buf[i] !== 0xff) { i++; continue; }
                const marker = buf[i + 1];
                // SOF0..SOF15, skipping the non-frame markers in that range
                if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
                    return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
                }
                i += 2 + buf.readUInt16BE(i + 2);
            }
        }
    } catch { /* an unreadable header just means no dimensions */ }
    return null;
}

function imagesDir(artifactDir: string): string {
    return path.join(artifactDir, 'images');
}

function cacheName(query: string, variant = 0): string {
    const key = variant ? `${query.toLowerCase().trim()}#${variant}` : query.toLowerCase().trim();
    return crypto.createHash('sha256').update(key).digest('hex').slice(0, 32);
}

/** An existing cached file for this query, if any. */
function findCached(artifactDir: string, query: string, variant = 0): string | null {
    const dir = imagesDir(artifactDir);
    const base = cacheName(query, variant);
    try {
        for (const ext of ['.jpg', '.jpeg', '.png', '.webp', '.gif']) {
            const f = path.join(dir, base + ext);
            if (fs.existsSync(f) && fs.statSync(f).size > 0) return `/artifacts/images/${base}${ext}`;
        }
    } catch { /* unreadable cache is the same as no cache */ }
    return null;
}

/** Words too common to prove anything about a photo's subject. */
const STOPWORDS = new Set(['the','a','an','of','in','on','at','and','or','with','for','to','by',
    'photo','image','picture','close','up','view','shot','background','people','person']);

/** Normalise a word so "developers" and "developer" are the same evidence. */
function fold(w: string): string {
    return w.endsWith('ies') && w.length > 4 ? w.slice(0, -3) + 'y'
        : w.endsWith('es') && w.length > 4 ? w.slice(0, -2)
            : w.endsWith('s') && w.length > 3 ? w.slice(0, -1)
                : w;
}

const words = (s: string): string[] =>
    String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(fold);

/**
 * How much of what we asked for does this candidate's own metadata support?
 *
 * Returns the share of the subject's meaningful terms that appear in the
 * candidate's title, description or tags, plus which ones matched.
 */
export function relevanceOf(query: string, result: any): { share: number; matched: string[]; terms: string[] } {
    const terms = [...new Set(words(query).filter(w => w.length > 2 && !STOPWORDS.has(w)))];
    const tags = Array.isArray(result?.tags) ? result.tags.map((t: any) => String(t?.name ?? t)) : [];
    // A SET OF WORDS, not one long string. `hay.includes('slot')` matched
    // "Christiansborg Slot", and `includes('port')` matched "ports" and
    // "Portas" — substring matching is how a castle in Copenhagen became the
    // illustration for a software consultancy.
    const hay = new Set(words([result?.title, result?.description, ...tags].join(' ')));
    const matched = terms.filter(t => hay.has(t));
    return { share: terms.length ? matched.length / terms.length : 0, matched, terms };
}

/**
 * Is this candidate actually a photograph of what was asked for?
 *
 * The old rule was "one shared term is enough". On Wikimedia Commons a file
 * carries a long list of categories, so one incidental shared word is nearly
 * free — and all three photographs on a page Joe shipped for a software
 * consultancy got in that way:
 *
 *   «Christiansborg Slot, Copenhagen»   — a castle, for "software developer",
 *                                          on the strength of a "Software" category
 *   «Sony Playstation 2 … Memory Card»  — a games console, for "team meeting office",
 *                                          on "Office equipment"
 *   «Founder June 2025»                 — for "business consultant", on "Business people"
 *
 * Each was one word out of two or three, from a category that says nothing
 * about the picture. So: whole words rather than substrings, and for a subject
 * of more than one term, TWO of them must be supported. One word is a
 * coincidence; two is a subject.
 *
 * A candidate with no metadata at all is now refused rather than waved through.
 * It cannot be shown to be relevant, and the fallback — the page's own gradient,
 * which is designed and on-palette — is better than a photograph of an unknown
 * thing.
 */
export function isRelevant(query: string, result: any): boolean {
    const { matched, terms } = relevanceOf(query, result);
    if (!terms.length) return true;                 // nothing to check against
    return terms.length === 1 ? matched.length === 1 : matched.length >= 2;
}

function extFor(contentType: string): string {
    const t = contentType.toLowerCase();
    if (t.includes('png')) return '.png';
    if (t.includes('webp')) return '.webp';
    if (t.includes('gif')) return '.gif';
    return '.jpg';
}

/**
 * Search + download one photograph for `query`. Returns null when the network is
 * unavailable or nothing suitable was found — the caller falls back to a
 * gradient rather than leaving a hole.
 */
export async function sourceImage(artifactDir: string, query: string, timeoutMs = 9000, variant = 0, slot: ImageSlot = 'card'): Promise<ResolvedImage | null> {
    const cached = findCached(artifactDir, query, variant);
    if (cached) return { query, src: cached, alt: query, fromCache: true, slot };

    // EVERY archive is asked, in parallel, and their answers compete in one pool.
    // A single archive is a single archive's worth of luck: a subject Openverse is
    // thin on left a gradient in the page even though Wikimedia had the picture.
    //
    // Licences that forbid commercial use or modification are excluded at the
    // source. A real build returned BY-NC and BY-NC-ND photos for a company
    // website: NC forbids commercial use — which a business site is — and ND
    // forbids the cropping any layout does. Joe was handing the user a licence
    // breach with a tidy credits line underneath it.
    // Ask each archive for a rendition sized to THIS slot. The extra pixels in a
    // 2400px original dropped into a 300px card are bytes the visitor pays for
    // and never sees. 2x the slot minimum keeps it crisp on a retina screen.
    const wanted = Math.round(SLOTS[slot].minWidth * 1.25);
    const { candidates, outcomes } = await searchAllSources(query, timeoutMs, wanted);
    lastSourceOutcomes = outcomes;
    // A subject the model asked for twice must not come back as the same photo
    // in both places — a build shipped the identical portrait as two different
    // customers' testimonials. Skip the candidates already used for this subject.
    // Rank before downloading: metadata alone tells us relevance and, when the
    // archive reports them, the dimensions. Taking the first acceptable hit is
    // what put a portrait in a wide card and a military photo on a tech page.
    // Relevance GATES the ranking, it does not merely contribute to it. Shape
    // and resolution alone scored an irrelevant photo 27-37 against a floor of
    // 25, so a well-proportioned picture of the wrong thing outranked having no
    // picture at all — measured against the three that actually shipped.
    const ranked = candidates
        .filter(c => isRelevant(query, { title: c.title, description: c.description, tags: c.tags }))
        .map(c => ({
            c,
            score: scoreCandidate(query, slot, { title: c.title, description: c.description, tags: c.tags },
                c.width && c.height ? { width: c.width, height: c.height } : null),
        }))
        .filter(x => x.score > 25)
        .sort((a, b) => b.score - a.score)
        .map(x => x.c);

    let skip = variant;
    for (const c of ranked) {
        const r = { title: c.title, description: c.description, tags: c.tags };
        const src = c.url.trim();
        if (!src) continue;
        // RELEVANCE. Keyword search returns whatever it likes: a build for a
        // software consultancy came back with a photo credited to "7th Army
        // Training Command" — a military exercise on a consulting page. Require
        // the result's own metadata to share a meaningful word with the subject
        // that was asked for, so an unrelated hit is skipped rather than shipped.
        if (!isRelevant(query, r)) continue;
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            const res = await fetch(src, { signal: ctrl.signal, headers: { 'User-Agent': 'Joe-AI-Agent' } });
            if (!res.ok) continue;
            const contentType = String(res.headers.get('content-type') || '');
            if (!contentType.startsWith('image/')) continue;
            const buf = Buffer.from(await res.arrayBuffer());
            if (!buf.length || buf.length > 6_000_000) continue;
            // A 200px thumbnail stretched across a hero looks worse than no photo
            // at all, and a portrait crammed into a wide band looks broken. Judge
            // the actual file, not the metadata, which is often missing.
            const dim = imageSize(buf) || (c.width && c.height ? { width: c.width, height: c.height } : null);
            const spec = SLOTS[slot];
            // Judged against what this position actually needs, not one global
            // minimum: an avatar can be 400px, a hero cannot.
            if (dim && dim.width < Math.min(600, spec.minWidth)) continue;
            if (skip > 0) { skip--; continue; }
            const dir = imagesDir(artifactDir);
            fs.mkdirSync(dir, { recursive: true });
            const name = cacheName(query, variant) + extFor(contentType);
            fs.writeFileSync(path.join(dir, name), buf);
            return {
                query,
                src: `/artifacts/images/${name}`,
                alt: (c.title || query).slice(0, 120),
                credit: {
                    creator: c.creator || 'Unknown',
                    license: c.license || '',
                    source: c.landing || c.url,
                },
                fromCache: false,
                slot,
                provider: c.provider,
                width: dim?.width,
                height: dim?.height,
                bytes: buf.length,
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

export const IMAGE_MARKER = /\{\{\s*IMAGE\s*:\s*([^}]{2,110}?)\s*\}\}/g;

export interface ImageResolution {
    html: string;
    requested: number;
    real: number;
    credits: Array<{ creator: string; license: string; source: string }>;
    /** Total weight of the photographs the page now carries. */
    bytes: number;
    /** Which archive each photo came from, and why any of them failed. */
    sources: Record<string, number>;
    sourceErrors: string[];
}

/**
 * Give every sourced <img> its intrinsic size and lazy loading.
 *
 * Without width/height the browser reserves no space and the page jumps as each
 * photo lands; without loading="lazy" a page with nine photos downloads all nine
 * before the visitor has scrolled. Both are applied only to tags Joe filled in,
 * and only where the author did not already set them.
 */
function hardenImgTags(html: string, byLocalSrc: Map<string, ResolvedImage>): string {
    return html.replace(/<img\b[^>]*>/gi, (tag) => {
        const srcMatch = tag.match(/src\s*=\s*"([^"]+)"/i);
        const src = srcMatch?.[1] || '';
        const img = byLocalSrc.get(src);
        if (!img) return tag;
        let out = tag;
        if (img.width && img.height && !/\bwidth\s*=/i.test(out) && !/\bheight\s*=/i.test(out)) {
            out = out.replace(/<img\b/i, `<img width="${img.width}" height="${img.height}"`);
        }
        if (!/\bloading\s*=/i.test(out)) out = out.replace(/<img\b/i, '<img loading="lazy" decoding="async"');
        // Give the photo the shape its position needs. Without this a portrait
        // dropped into a wide card stretches the whole row.
        if (img.slot && SLOTS[img.slot] && !/\bstyle\s*=/i.test(out)) {
            out = out.replace(/<img\b/i, `<img style="${SLOTS[img.slot].css}"`);
        }
        // An empty alt on a content photograph is a real accessibility failure;
        // fall back to the subject that was searched for.
        if (!/\balt\s*=\s*"[^"]+"/i.test(out)) {
            out = /\balt\s*=/i.test(out)
                ? out.replace(/\balt\s*=\s*"[^"]*"/i, `alt="${escapeAttr(img.alt || img.query)}"`)
                : out.replace(/<img\b/i, `<img alt="${escapeAttr(img.alt || img.query)}"`);
        }
        return out;
    });
}

function escapeAttr(s: string): string {
    return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Creative-Commons images must be credited IN THE PAGE. Joe was reporting the
 * credits to the chat only, which leaves the published page in breach of the
 * licence — the one defect here that could actually cost the user something.
 */
export function creditsBlock(credits: ImageResolution['credits'], isAr: boolean): string {
    if (!credits.length) return '';
    const items = credits.map(c => {
        const who = escapeAttr(c.creator || 'Unknown');
        const lic = escapeAttr(c.license || 'CC');
        return c.source
            ? `<li><a href="${escapeAttr(c.source)}" target="_blank" rel="noopener noreferrer nofollow">${who}</a> — ${lic}</li>`
            : `<li>${who} — ${lic}</li>`;
    }).join('');
    const title = isAr ? 'مصادر الصور' : 'Image credits';
    const note = isAr
        ? 'الصور مستخدمة بموجب رخص المشاع الإبداعي، ونُسبت لأصحابها.'
        : 'Photographs used under Creative Commons licences, credited to their authors.';
    return `\n<section class="joe-image-credits" aria-label="${escapeAttr(title)}" style="max-width:var(--maxw,1180px);margin:0 auto;padding:24px 16px;border-top:1px solid var(--border,rgba(0,0,0,.1));font-size:12px;line-height:1.7;color:var(--text-muted,#667)">
  <strong style="display:block;margin-bottom:6px">${title}</strong>
  <p style="margin:0 0 6px">${note}</p>
  <ul style="margin:0;padding-inline-start:18px;list-style:disc">${items}</ul>
</section>\n`;
}

/**
 * Replace every {{IMAGE:...}} marker in the page. Distinct queries are fetched
 * once and reused, and the whole pass is bounded so a slow network cannot hold a
 * build hostage.
 */
export async function resolveImages(html: string, artifactDir: string, hue: number, opts?: { max?: number; timeoutMs?: number; brief?: ImageBrief }): Promise<ImageResolution> {
    const max = opts?.max ?? 12;
    const brief = opts?.brief;
    // Each marker carries its position and its subject. A generic subject is
    // replaced with one grounded in what this business actually does — "business
    // people" finds nothing about a consultancy, "business consultant strategy
    // meeting" does.
    const parsed: Array<{ key: string; slot: ImageSlot; subject: string }> = [];
    let gi = 0;
    for (const m of String(html).matchAll(IMAGE_MARKER)) {
        const { slot, subject } = parseSlot(m[1]);
        const grounded = brief ? groundSubject(subject, brief, gi++) : subject;
        parsed.push({ key: `${slot}|${grounded}`, slot, subject: grounded });
    }
    const queries: string[] = [];
    for (const p of parsed) if (!queries.includes(p.key)) queries.push(p.key);
    if (!queries.length) return { html, requested: 0, real: 0, credits: [], bytes: 0, sources: {}, sourceErrors: [] };

    // How many times each subject appears — a repeat needs its own photo.
    const occurrences = new Map<string, number>();
    for (const p of parsed) occurrences.set(p.key, (occurrences.get(p.key) || 0) + 1);
    const slotOf = new Map<string, ImageSlot>();
    const subjectOf = new Map<string, string>();
    for (const p of parsed) { slotOf.set(p.key, p.slot); subjectOf.set(p.key, p.subject); }

    // key = `${query}#${variant}`
    const resolved = new Map<string, ResolvedImage>();
    let fetched = 0;
    // Sequential on purpose: a laptop on a home connection does better with one
    // request at a time than with a dozen competing ones.
    const failures = new Map<string, string>();
    for (const q of queries) {
        const times = Math.min(occurrences.get(q) || 1, 4);
        for (let v = 0; v < times && fetched < max; v++) {
            const img = await sourceImage(artifactDir, subjectOf.get(q)!, opts?.timeoutMs ?? 9000, v, slotOf.get(q));
            fetched++;
            // Keep the reason an archive gave. "No photo" with no explanation is
            // the kind of silence that reads as a bug in Joe rather than a search
            // that came back empty.
            for (const o of takeSourceOutcomes()) if (!o.ok && o.reason) failures.set(o.provider, o.reason);
            if (img) resolved.set(`${q}#${v}`, img);
        }
    }

    const credits: ImageResolution['credits'] = [];
    const seen = new Map<string, number>();
    let mi = 0;
    let out = String(html).replace(IMAGE_MARKER, (_full, rawQuery: string) => {
        const { slot, subject } = parseSlot(rawQuery);
        const grounded = brief ? groundSubject(subject, brief, mi++) : subject;
        const q = `${slot}|${grounded}`;
        const v = seen.get(q) || 0;
        seen.set(q, v + 1);
        // Fall back to the first variant when a later one could not be sourced.
        const img = resolved.get(`${q}#${v}`) || resolved.get(`${q}#0`);
        if (!img) return gradientPlaceholder(grounded, hue);
        if (img.credit && img.credit.license && !credits.some(c => c.source === img.credit!.source)) {
            credits.push(img.credit);
        }
        return img.src;
    });

    const byLocalSrc = new Map<string, ResolvedImage>();
    for (const img of resolved.values()) byLocalSrc.set(img.src, img);
    out = hardenImgTags(out, byLocalSrc);

    let bytes = 0;
    for (const img of resolved.values()) bytes += img.bytes || 0;

    // Count OCCURRENCES on both sides: a subject used twice is two photos to
    // source, so reporting "2 of 1" was arithmetic the user would rightly query.
    let requested = 0;
    for (const [, n] of occurrences) requested += Math.min(n, 4);

    const sources: Record<string, number> = {};
    for (const img of resolved.values()) {
        const p = img.provider || (img.fromCache ? 'cache' : 'unknown');
        sources[p] = (sources[p] || 0) + 1;
    }
    return {
        html: out, requested: Math.min(requested, max), real: resolved.size, credits, bytes,
        sources,
        sourceErrors: Array.from(failures, ([p, r]) => `${p}: ${r}`),
    };
}
