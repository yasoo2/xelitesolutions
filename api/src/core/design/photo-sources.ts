/**
 * Where the photographs come from.
 *
 * One archive was one archive's worth of luck. Openverse is excellent for
 * everyday subjects and thin for others — a search for "restaurant kitchen chef"
 * returns plenty, a search for a specific piece of machinery returns three
 * unusable thumbnails, and the page ends up with a gradient where a photo
 * belonged. Asking several archives the same question and ranking ALL the
 * answers together is what turns "whatever the first archive had" into "the best
 * available picture of this thing".
 *
 * Every source here is real and reachable without registration, except the two
 * that require a key — and those simply do not run when the key is absent. There
 * is no stub, no sample data and no pretend provider: a source that cannot run
 * reports why, and the caller says so.
 */

export interface PhotoCandidate {
    /** Full-size file to download. */
    url: string;
    /** Smaller rendition, preferred when it is still big enough. */
    preview?: string;
    title: string;
    description?: string;
    tags: string[];
    width?: number;
    height?: number;
    creator: string;
    license: string;
    /** Human landing page, used for attribution. */
    landing: string;
    /** Which archive answered. */
    provider: string;
}

export interface SourceOutcome {
    provider: string;
    ok: boolean;
    count: number;
    /** Present when ok === false — shown to the user, never swallowed. */
    reason?: string;
}

/* ---------- shared fetch ---------------------------------------------------- */

const UA = 'Joe-AI-Agent/1.0 (self-hosted page builder; contact: local install)';

async function getJson(url: string, timeoutMs: number, headers?: Record<string, string>): Promise<{ data?: any; reason?: string }> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA, ...(headers || {}) } });
        if (!r.ok) return { reason: `HTTP ${r.status}` };
        return { data: await r.json() };
    } catch (e: any) {
        const m = String(e?.message || e);
        return { reason: /abort/i.test(m) ? `timed out after ${Math.round(timeoutMs / 1000)}s` : m.slice(0, 90) };
    } finally { clearTimeout(t); }
}

/** A licence that forbids commercial use or modification cannot go on a business
 *  page that crops it. Applied to every source, not just the one that had the bug. */
export function licenceAllows(license: string): boolean {
    const l = String(license || '').toLowerCase();
    if (!l) return true;                       // unstated: the archive's own policy governs
    if (/\bnc\b|noncommercial|non-commercial/.test(l)) return false;
    if (/\bnd\b|noderiv/.test(l)) return false;
    if (/fair use|non-free|copyright(ed)?( only)?$/.test(l)) return false;
    return true;
}

/* ---------- 1. Openverse (no key) ------------------------------------------- */

function openverseEndpoint(): string {
    return String(process.env.JOE_IMAGE_API || 'https://api.openverse.org/v1/images/');
}

async function searchOpenverse(query: string, timeoutMs: number): Promise<{ items: PhotoCandidate[]; reason?: string }> {
    const url = `${openverseEndpoint()}?q=${encodeURIComponent(query)}&page_size=8&mature=false&license_type=commercial,modification`;
    const { data, reason } = await getJson(url, timeoutMs);
    if (!data) return { items: [], reason };
    const results: any[] = Array.isArray(data?.results) ? data.results : [];
    const items = results.map((r): PhotoCandidate => ({
        url: String(r?.url || r?.thumbnail || ''),
        preview: r?.thumbnail ? String(r.thumbnail) : undefined,
        title: String(r?.title || ''),
        description: r?.description ? String(r.description) : undefined,
        tags: Array.isArray(r?.tags) ? r.tags.map((t: any) => String(t?.name ?? t)) : [],
        width: Number(r?.width) || undefined,
        height: Number(r?.height) || undefined,
        creator: String(r?.creator || 'Unknown'),
        license: String(r?.license || '').toUpperCase(),
        landing: String(r?.foreign_landing_url || r?.url || ''),
        provider: 'openverse',
    })).filter(c => c.url);
    return { items };
}

/* ---------- 2. Wikimedia Commons (no key) ----------------------------------- */

/** Commons hosts a lot of what a niche subject actually needs — machinery,
 *  architecture, food, places — and none of it needs a key. */
async function searchWikimedia(query: string, timeoutMs: number, width = 1600): Promise<{ items: PhotoCandidate[]; reason?: string }> {
    const params = new URLSearchParams({
        action: 'query', format: 'json', formatversion: '2', origin: '*',
        generator: 'search',
        gsrsearch: `${query} filetype:bitmap`,
        gsrnamespace: '6',             // File:
        gsrlimit: '10',
        prop: 'imageinfo',
        iiprop: 'url|size|mime|extmetadata',
        // Ask for the width this SLOT needs, not a fixed 1600 and certainly not
        // the 40 MP original. An avatar shown at 64px was costing as many bytes
        // as the hero — pixels nobody can see, on a connection somebody pays for.
        iiurlwidth: String(Math.max(200, Math.min(2000, Math.round(width)))),
    });
    const endpoint = String(process.env.JOE_WIKIMEDIA_API || 'https://commons.wikimedia.org/w/api.php');
    const { data, reason } = await getJson(`${endpoint}?${params}`, timeoutMs);
    if (!data) return { items: [], reason };
    const pages: any[] = Array.isArray(data?.query?.pages) ? data.query.pages : [];
    const strip = (s: string) => String(s || '').replace(/<[^>]*>/g, '').trim();

    const items: PhotoCandidate[] = [];
    for (const p of pages) {
        const info = Array.isArray(p?.imageinfo) ? p.imageinfo[0] : null;
        if (!info) continue;
        const mime = String(info.mime || '');
        if (!/^image\/(jpeg|png|webp)$/.test(mime)) continue;      // no SVG/TIFF into an <img> hero
        const ex = info.extmetadata || {};
        const license = strip(ex.LicenseShortName?.value || ex.License?.value || '');
        if (!licenceAllows(license)) continue;
        // A File: title is a written description in practice ("Chef plating a dish
        // at Noma.jpg"), which is exactly what ranking needs.
        const title = String(p.title || '').replace(/^File:/i, '').replace(/\.(jpe?g|png|webp)$/i, '').replace(/[_-]+/g, ' ');
        const categories = strip(ex.Categories?.value || '').split('|').filter(Boolean).slice(0, 8);
        items.push({
            url: String(info.thumburl || info.url || ''),
            preview: info.thumburl ? String(info.thumburl) : undefined,
            title,
            description: strip(ex.ImageDescription?.value || '').slice(0, 300),
            tags: categories,
            width: Number(info.thumbwidth || info.width) || undefined,
            height: Number(info.thumbheight || info.height) || undefined,
            creator: strip(ex.Artist?.value || 'Wikimedia Commons'),
            license: license || 'Wikimedia Commons',
            landing: String(info.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(String(p.title || ''))}`),
            provider: 'wikimedia',
        });
    }
    return { items: items.filter(c => c.url) };
}

/* ---------- 3. Pexels / Unsplash (only with a key the user supplies) -------- */

async function searchPexels(query: string, timeoutMs: number): Promise<{ items: PhotoCandidate[]; reason?: string }> {
    const key = String(process.env.PEXELS_API_KEY || '').trim();
    if (!key) return { items: [], reason: 'no PEXELS_API_KEY set' };
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=8`;
    const { data, reason } = await getJson(url, timeoutMs, { Authorization: key });
    if (!data) return { items: [], reason };
    const photos: any[] = Array.isArray(data?.photos) ? data.photos : [];
    const items = photos.map((p): PhotoCandidate => ({
        url: String(p?.src?.large2x || p?.src?.large || p?.src?.original || ''),
        preview: p?.src?.medium ? String(p.src.medium) : undefined,
        title: String(p?.alt || query),
        tags: [],
        width: Number(p?.width) || undefined,
        height: Number(p?.height) || undefined,
        creator: String(p?.photographer || 'Pexels'),
        license: 'Pexels License',
        landing: String(p?.url || 'https://www.pexels.com'),
        provider: 'pexels',
    })).filter(c => c.url);
    return { items };
}

async function searchUnsplash(query: string, timeoutMs: number): Promise<{ items: PhotoCandidate[]; reason?: string }> {
    const key = String(process.env.UNSPLASH_ACCESS_KEY || '').trim();
    if (!key) return { items: [], reason: 'no UNSPLASH_ACCESS_KEY set' };
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=8&content_filter=high`;
    const { data, reason } = await getJson(url, timeoutMs, { Authorization: `Client-ID ${key}` });
    if (!data) return { items: [], reason };
    const results: any[] = Array.isArray(data?.results) ? data.results : [];
    const items = results.map((p): PhotoCandidate => ({
        url: String(p?.urls?.regular || p?.urls?.full || ''),
        preview: p?.urls?.small ? String(p.urls.small) : undefined,
        title: String(p?.description || p?.alt_description || query),
        tags: Array.isArray(p?.tags) ? p.tags.map((t: any) => String(t?.title ?? t)) : [],
        width: Number(p?.width) || undefined,
        height: Number(p?.height) || undefined,
        creator: String(p?.user?.name || 'Unsplash'),
        license: 'Unsplash License',
        landing: String(p?.links?.html || 'https://unsplash.com'),
        provider: 'unsplash',
    })).filter(c => c.url);
    return { items };
}

/* ---------- the pool -------------------------------------------------------- */

type Searcher = (q: string, ms: number, width?: number) => Promise<{ items: PhotoCandidate[]; reason?: string }>;

const SOURCES: Array<{ name: string; search: Searcher; needsKey?: string }> = [
    { name: 'openverse', search: searchOpenverse },
    { name: 'wikimedia', search: searchWikimedia },
    { name: 'pexels', search: searchPexels, needsKey: 'PEXELS_API_KEY' },
    { name: 'unsplash', search: searchUnsplash, needsKey: 'UNSPLASH_ACCESS_KEY' },
];

/** Which sources can actually run right now, and which are dormant for want of a key. */
export function availableSources(): { active: string[]; dormant: Array<{ name: string; needs: string }> } {
    const active: string[] = [];
    const dormant: Array<{ name: string; needs: string }> = [];
    for (const s of SOURCES) {
        if (!s.needsKey) { active.push(s.name); continue; }
        if (String(process.env[s.needsKey] || '').trim()) active.push(s.name);
        else dormant.push({ name: s.name, needs: s.needsKey });
    }
    return { active, dormant };
}

/**
 * Ask every available archive at once and return one pool of candidates.
 *
 * Parallel, not sequential: three archives queried one after another would add
 * three timeouts to every single photograph on the page. A source that fails
 * costs nothing — the others still answer, and the failure is reported rather
 * than hidden.
 */
export async function searchAllSources(query: string, timeoutMs = 9000, width?: number): Promise<{ candidates: PhotoCandidate[]; outcomes: SourceOutcome[] }> {
    const runnable = SOURCES.filter(s => !s.needsKey || String(process.env[s.needsKey] || '').trim());
    const settled = await Promise.all(runnable.map(async (s): Promise<{ o: SourceOutcome; items: PhotoCandidate[] }> => {
        try {
            const { items, reason } = await s.search(query, timeoutMs, width);
            return { o: { provider: s.name, ok: !reason && items.length > 0, count: items.length, reason }, items };
        } catch (e: any) {
            return { o: { provider: s.name, ok: false, count: 0, reason: String(e?.message || e).slice(0, 90) }, items: [] };
        }
    }));

    // The same photograph is on more than one archive; keep the first sighting.
    const seen = new Set<string>();
    const candidates: PhotoCandidate[] = [];
    for (const s of settled) {
        for (const c of s.items) {
            const key = c.url.replace(/^https?:\/\//, '').split('?')[0].toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            if (!licenceAllows(c.license)) continue;
            candidates.push(c);
        }
    }
    return { candidates, outcomes: settled.map(s => s.o) };
}
