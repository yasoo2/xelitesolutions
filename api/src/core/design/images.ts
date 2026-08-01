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
import { englishSubject } from './subject-translation';

/** What the archives said the last time one was asked — reported to the user so
 *  "no photo" is always accompanied by the reason there is no photo. */
let lastSourceOutcomes: SourceOutcome[] = [];
/**
 * How many candidates the subject gate refused since the last read.
 *
 * Module-level for the same reason `lastSourceOutcomes` is: the counting
 * happens deep inside one photograph's resolution and the reporting happens
 * once for the whole page.
 */
let lastRefusedForSubject = 0;
let lastCandidatesSeen = 0;
/** How many subjects were asked in English on the archives' behalf — an Arabic
 *  page's subjects are translated for the SEARCH, never for the alt text. */
let lastTranslatedQueries = 0;
export function takeRelevanceTally(): { seen: number; refused: number; translated: number } {
    const t = { seen: lastCandidatesSeen, refused: lastRefusedForSubject, translated: lastTranslatedQueries };
    lastCandidatesSeen = 0; lastRefusedForSubject = 0; lastTranslatedQueries = 0;
    return t;
}

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

/**
 * Normalise a word to the evidence it carries — MORPHOLOGY ONLY.
 *
 * Plurals were folded here from the start. Word forms were not, and that is why
 * a real build came back with every photograph replaced by a gradient: the
 * subject Joe generates is «software engineer portrait», and a genuine picture
 * of an engineer is tagged `programming`, `development`, `coder`. None of those
 * is the literal string "engineer", so a good photograph scored zero.
 *
 * Suffix stripping on whole tokens, applied until it settles so "engineer" and
 * "engineering" agree. Never substrings: `includes('slot')` matching
 * «Christiansborg Slot» is the bug this file exists to prevent.
 *
 * SYNONYMS ARE DELIBERATELY NOT DONE HERE. Rewriting a query term to a shared
 * token collapses two distinct requirements into one — «software developer»
 * became a single term, and one incidental "Software" category then satisfied
 * the whole subject. That is precisely how the castle got in. Synonyms widen
 * what counts as EVIDENCE; they must never narrow what is being asked for.
 */
function fold(w: string): string {
    let x = w;
    for (let i = 0; i < 3; i++) {
        const before = x;
        x = x.endsWith('ies') && x.length > 4 ? x.slice(0, -3) + 'y'
            : /(sses|shes|ches)$/.test(x) ? x.slice(0, -2)
                : x.endsWith('s') && !x.endsWith('ss') && x.length > 3 ? x.slice(0, -1)
                    : x;
        for (const suf of ['ational', 'ation', 'ional', 'ment', 'ing', 'ers', 'er', 'ed', 'ion', 'ive']) {
            if (x.length > suf.length + 2 && x.endsWith(suf)) { x = x.slice(0, -suf.length); break; }
        }
        // "programming" -> "programm", which is not "program". Collapsing the
        // doubled consonant a suffix leaves behind is what makes the two agree;
        // without it a photograph tagged `programming` did not support the term
        // `program` and the page fell back to a gradient.
        if (/([bcdfgmnprt])\1$/.test(x) && x.length > 3) x = x.slice(0, -1);
        if (x === before) break;
    }
    return x;
}

/**
 * Other words that would satisfy a term — checked against the CANDIDATE's
 * metadata, never substituted into the query.
 *
 * Small and conservative on purpose: a wrong entry here puts the wrong
 * photograph on someone's page, which is the failure this module exists to
 * stop. Keys and values are stored folded, so both sides agree.
 *
 * A GENERIC WORD MAY NEVER PROVE A SPECIFIC ONE. The first draft mapped
 * `consultant -> business` and `portrait -> person, man, woman, people`, and
 * the suite immediately re-admitted «Founder June 2025» for "business
 * consultant" — one of the three photographs that shipped wrong and started all
 * of this — plus a stock skyline titled «Business district». If a term is broad
 * enough to describe half an archive, it is not evidence.
 */
const SYNONYM: Record<string, string[]> = {
    develop: ['program', 'cod', 'softwar'],
    engineer: ['develop', 'program'],
    softwar: ['program', 'cod', 'develop'],
    portrait: ['headshot'],
    offic: ['workspac', 'workplac'],
    chef: ['cook', 'culinary'],
    doctor: ['physician', 'clinic'],
    meet: ['confer'],
    consultant: ['advisor'],
};

/** Does the candidate's own vocabulary support this term, in any accepted form? */
function supports(term: string, hay: Set<string>): boolean {
    if (hay.has(term)) return true;
    const alts = SYNONYM[term];
    return !!alts && alts.some(a => hay.has(fold(a)));
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
    /**
     * Reported in the WORDS THE SUBJECT WAS WRITTEN IN, matched on their stems.
     *
     * `fold` now strips derivational endings too, so "developer" stems to
     * "develop" — correct for comparison and meaningless in a build log that
     * tells someone which parts of their subject were supported. Keep both: the
     * stem does the work, the original does the explaining.
     */
    const seen = new Set<string>();
    const pairs: Array<{ raw: string; stem: string }> = [];
    for (const raw of String(query || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
        const stem = fold(raw);
        if (stem.length <= 2 || STOPWORDS.has(stem) || STOPWORDS.has(raw) || seen.has(stem)) continue;
        seen.add(stem);
        pairs.push({ raw, stem });
    }
    const terms = pairs.map(p => p.raw);
    const tags = Array.isArray(result?.tags) ? result.tags.map((t: any) => String(t?.name ?? t)) : [];
    // A SET OF WORDS, not one long string. `hay.includes('slot')` matched
    // "Christiansborg Slot", and `includes('port')` matched "ports" and
    // "Portas" — substring matching is how a castle in Copenhagen became the
    // illustration for a software consultancy.
    const hay = new Set(words([result?.title, result?.description, ...tags].join(' ')));
    const matched = pairs.filter(p => supports(p.stem, hay)).map(p => p.raw);
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

    /**
     * ASK IN THE ARCHIVES' LANGUAGE. An Arabic page asks for Arabic subjects,
     * and every archive titles its photographs in English — so the relevance
     * gate compared Arabic words against English evidence and refused every
     * candidate, on every Arabic build, always. The subject is translated by
     * dictionary (deterministic, works with every LLM provider dead) for the
     * SEARCH and the GATE; the alt text the visitor hears stays as written.
     */
    const { query: searchQuery, translated } = englishSubject(query);
    if (translated) lastTranslatedQueries++;

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
    const { candidates, outcomes } = await searchAllSources(searchQuery, timeoutMs, wanted);
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
    /**
     * COUNT WHAT THE GATE THREW AWAY.
     *
     * "The archive failed", "the archive returned nothing" and "the archive
     * returned twelve photographs and none of them were of the subject" are
     * three completely different problems, and all three reached the user as
     * the same coloured box with nothing said. The last one is the one this
     * gate creates, so it is the one it has to own up to.
     */
    lastRefusedForSubject += candidates.filter(
        c => !isRelevant(searchQuery, { title: c.title, description: c.description, tags: c.tags })).length;
    lastCandidatesSeen += candidates.length;

    const ranked = candidates
        .filter(c => isRelevant(searchQuery, { title: c.title, description: c.description, tags: c.tags }))
        .map(c => ({
            c,
            score: scoreCandidate(searchQuery, slot, { title: c.title, description: c.description, tags: c.tags },
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
        if (!isRelevant(searchQuery, r)) continue;
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

/**
 * Remove style declarations whose url() still carries marker braces.
 *
 * The marker pipeline covers well-formed {{IMAGE:...}} — but a model sometimes
 * emits a MALFORMED one inside an inline style («url('... avatar}}») that the
 * marker regex cannot match, and it survives every sweep. Measured on the
 * user's machine: three 404s per page-load for a url that was never a url.
 * A background that cannot load is better absent — the card keeps its own
 * surface color underneath.
 */
export function stripBrokenStyleImages(html: string): { html: string; removed: number } {
    let removed = 0;
    const out = String(html).replace(/style="([^"]*)"/gi, (full, css: string) => {
        if (!/\{\{|\}\}/.test(css)) return full;
        const cleaned = css
            .replace(/background[^;:"]*:\s*[^;]*(?:\{\{|\}\})[^;]*(?:;|$)/gi, () => { removed++; return ''; })
            .replace(/url\([^)]*(?:\{\{|\}\})[^)]*\)?/gi, () => { removed++; return 'none'; })
            .trim();
        return cleaned ? `style="${cleaned}"` : '';
    });
    return { html: out, removed };
}

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
    /**
     * Candidates the archives DID return, and how many were refused for not
     * being of the subject. Without this, a page full of gradients says nothing
     * about whether the network failed, the search was empty, or the pictures
     * were simply of something else.
     */
    candidatesSeen: number;
    refusedForSubject: number;
    /** Subjects translated to English so the archives could understand them. */
    translatedQueries: number;
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
        const grounded = brief ? groundSubject(subject, brief, gi++, slot) : subject;
        parsed.push({ key: `${slot}|${grounded}`, slot, subject: grounded });
    }
    const queries: string[] = [];
    for (const p of parsed) if (!queries.includes(p.key)) queries.push(p.key);
    if (!queries.length) return { html, requested: 0, real: 0, credits: [], bytes: 0, sources: {}, sourceErrors: [], candidatesSeen: 0, refusedForSubject: 0, translatedQueries: 0 };

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
        const grounded = brief ? groundSubject(subject, brief, mi++, slot) : subject;
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
    const tally = takeRelevanceTally();
    return {
        html: out, requested: Math.min(requested, max), real: resolved.size, credits, bytes,
        sources,
        sourceErrors: Array.from(failures, ([p, r]) => `${p}: ${r}`),
        candidatesSeen: tally.seen,
        refusedForSubject: tally.refused,
        translatedQueries: tally.translated,
    };
}


/**
 * NO IMAGE MAY POINT AT SOMETHING THAT IS NOT THERE.
 *
 * The marker sweep upstream replaces a WELL-FORMED `{{IMAGE:…}}` that never
 * resolved. It cannot help when the marker arrives mangled, and a real build
 * shipped exactly that: the page requested
 *
 *   /artifacts/joe-…/software%20developer%7D%7D        → 404
 *   /artifacts/joe-…/avatar-programming%7D%7D          → 404
 *   /artifacts/joe-…/xelite-solutions-logo.png         → 404
 *
 * — three different failures with one thing in common. The first two are a
 * marker that lost its opening brace somewhere upstream, so the sweep's regex
 * did not recognise it; the third is the model inventing a filename, which no
 * marker logic was ever going to catch. Every one of them reached the browser
 * as a broken image, which is what the user saw and reported.
 *
 * So this does not reason about markers at all. It asks the only question that
 * matters — IS THE FILE THERE? — and anything that is not gets the page's own
 * gradient, which always renders. A remote URL is left alone: Joe does not emit
 * those, and rewriting someone's deliberate CDN link would be worse than the
 * problem.
 */
export function groundImageSrcs(
    html: string,
    dir: string,
    hue: number,
): { html: string; fixed: number; broken: string[] } {
    const broken: string[] = [];
    let fixed = 0;

    const exists = (raw: string): boolean => {
        try {
            const clean = decodeURIComponent(String(raw).split(/[?#]/)[0]).trim();
            if (!clean) return false;
            // A path that climbs out of the artifact directory is not "there"
            // either, whatever the filesystem says.
            const full = path.resolve(dir, clean);
            const root = path.resolve(dir);
            if (full !== root && !full.startsWith(root + path.sep)) return false;
            return fs.existsSync(full) && fs.statSync(full).isFile();
        } catch { return false; }
    };

    /**
     * MARKUP ONLY. A store's cart runtime BUILDS markup in JavaScript —
     * `'<img src="' + item.image + '">'` — and a naive sweep over the whole
     * document rewrites that string literal, dropping a multi-line data URI
     * into the middle of an expression. Measured: "Unexpected string" on every
     * page of every store, the entire runtime dead, from a repair whose whole
     * purpose was to stop shipping broken pages.
     *
     * Script and style bodies are blanked character-for-character, so an offset
     * into the mask is an offset into the original and the edits below land in
     * real markup.
     */
    const src0 = String(html || '');
    const masked = src0.replace(/<(script|style)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi,
        (full, tag, body) => full.slice(0, full.length - body.length - `</${tag}>`.length)
            + ' '.repeat(body.length) + `</${tag}>`);

    const edits: Array<{ at: number; end: number; text: string }> = [];
    for (const m of masked.matchAll(/<img\b[^>]*>/gi)) {
        const tag = m[0];
        const srcM = tag.match(/\ssrc\s*=\s*["']([^"']*)["']/i);
        if (!srcM) continue;
        const v = srcM[1].trim();
        // Already a picture: a data URI, or a remote address someone chose.
        if (/^(data:|https?:|\/\/)/i.test(v)) continue;
        if (v && exists(v)) continue;

        broken.push(v.slice(0, 60));
        fixed++;
        // The alt text is what the picture was FOR, so it is the best subject
        // available for the gradient that replaces it.
        const alt = (tag.match(/\salt\s*=\s*["']([^"']*)["']/i) || [])[1] || '';
        const subject = (alt || v.replace(/[{}|]/g, ' ')).replace(/\.(png|jpe?g|webp|svg|gif)$/i, '').trim();
        const at = m.index! + srcM.index!;
        edits.push({ at, end: at + srcM[0].length, text: ` src="${gradientPlaceholder(subject || 'image', hue)}"` });
    }

    let out = src0;
    for (let i = edits.length - 1; i >= 0; i--) {
        out = out.slice(0, edits[i].at) + edits[i].text + out.slice(edits[i].end);
    }
    return { html: out, fixed, broken };
}
