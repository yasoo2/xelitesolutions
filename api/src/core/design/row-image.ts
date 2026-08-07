/**
 * RUNGS TWO AND THREE — «هل يوجد اداه يمكنها البحث على الصور على الانترنت
 * وجلبها الى النظام… ام يمكننا شبك النظام على مصمم الصور».
 *
 * Both. In one ladder, tried in order, and the bottom rung cannot fail:
 *
 *   2. SEARCH  — the licensed-photo engine Joe has owned for months
 *                (Openverse and Wikimedia with no key at all, Pexels and
 *                Unsplash when their free keys are present). It already
 *                REFUSES an irrelevant result, which is why a wrong picture
 *                is rarer here than a missing one.
 *   3. DESIGN  — an image generator over HTTP, for a name no archive can
 *                match: a made-up product, a coined brand. Keyless by
 *                default; the address is one environment variable.
 *   4. CARD    — the row's own letter on a gradient derived from its name.
 *                Local, instant, and never the WRONG picture.
 *
 * Everything comes back as a DATA URL, exactly like a photo the owner picked
 * himself, because that is the one storage format that survives everything:
 * it needs no file path, no static route, no upload endpoint, and it keeps
 * working after the system is copied to a domain.
 *
 * Nothing here is decorative honesty: each picture reports WHICH rung produced
 * it, so a delivery message can say «٤ صور حقيقية، ٢ مولّدة، ١ بطاقة» instead
 * of «تم».
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

export type PictureSource = 'photo' | 'generated' | 'card';

export interface RowPicture {
    /** A data: URL — the same shape a picked file produces. */
    data: string;
    from: PictureSource;
    /** Attribution, when a licence asks for it. */
    credit?: string;
    /** Why a higher rung was skipped — never swallowed. */
    note?: string;
}

/** Bytes a row may carry. Past this the picture is shrunk or refused. */
const MAX_BYTES = 700_000;
const MAX_EDGE = 640;

/* ------------------------------------------------------------ rung four ---- */

/** A stable hue from the name — the same plant is always the same colour. */
function hueOf(text: string): number {
    let h = 0;
    const s = String(text || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    return h;
}

/**
 * The designed card. The Node twin of the one the built app draws for itself,
 * so a row filled by this tool and a row filled by the browser look identical.
 */
export function designedCard(name: string): string {
    const raw = String(name || '').trim();
    const label = raw.charAt(0) || '•';
    const empty = !raw;
    const h = empty ? 214 : hueOf(raw);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240">'
        + '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
        + `<stop offset="0" stop-color="hsl(${h},${empty ? '10%' : '62%'},${empty ? '76%' : '52%'})"/>`
        + `<stop offset="1" stop-color="hsl(${(h + 34) % 360},${empty ? '8%' : '58%'},${empty ? '62%' : '34%'})"/>`
        + '</linearGradient></defs>'
        + '<rect width="320" height="240" fill="url(#g)"/>'
        + '<circle cx="270" cy="34" r="76" fill="rgba(255,255,255,.10)"/>'
        + '<circle cx="34" cy="214" r="58" fill="rgba(0,0,0,.10)"/>'
        + '<text x="160" y="150" text-anchor="middle" font-family="system-ui,sans-serif"'
        + ' font-size="110" font-weight="800" fill="rgba(255,255,255,.92)">'
        + label.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</text></svg>';
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/* ----------------------------------------------------------- the shrinker -- */

/**
 * A photograph off the internet is two megabytes; a database row is not.
 *
 * Node has no image encoder here and this project adds no native dependency
 * for one — but Joe owns a browser, and a browser has had a perfectly good
 * one since 2010. One page is opened for a whole batch, not one per picture.
 */
export class Shrinker {
    private browser: any = null;
    private page: any = null;

    async ready(): Promise<boolean> {
        if (this.page) return true;
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { chromium } = require('playwright');
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { getChromiumLaunchOptions } = require('../../modules/browser/manager');
            this.browser = await chromium.launch({ ...getChromiumLaunchOptions(), headless: true });
            this.page = await this.browser.newPage();
            await this.page.goto('about:blank');
            /**
             * esbuild names every helper it compiles, and a browser has no
             * `__name`. Without this line the shrink function throws inside the
             * page, the catch returns '', and EVERY rung above the designed
             * card silently produces nothing — which is exactly what the first
             * run of this measured.
             */
            await this.page.evaluate(
                'globalThis.__name = globalThis.__name || (function (f) { return f; });',
            ).catch(() => { });
            return true;
        } catch { return false; }
    }

    /** Bytes in, a bounded JPEG data URL out — or '' when it cannot be read. */
    async shrink(buf: Buffer, mime: string, maxEdge = MAX_EDGE): Promise<string> {
        if (!(await this.ready())) return '';
        const src = `data:${mime || 'image/jpeg'};base64,${buf.toString('base64')}`;
        try {
            return String(await this.page.evaluate(async (o: any) => {
                const load = (u: string) => new Promise<any>((res, rej) => {
                    const i = new Image();
                    i.onload = () => res(i);
                    i.onerror = () => rej(new Error('decode'));
                    i.src = u;
                });
                const img: any = await load(o.src);
                const scale = Math.min(1, o.edge / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
                const w = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
                const h = Math.max(1, Math.round((img.naturalHeight || 1) * scale));
                const c = document.createElement('canvas');
                c.width = w; c.height = h;
                const ctx = c.getContext('2d');
                if (!ctx) return '';
                ctx.drawImage(img, 0, 0, w, h);
                return c.toDataURL('image/jpeg', 0.74);
            }, { src, edge: maxEdge }) || '');
        } catch { return ''; }
    }

    async close() {
        try { await this.page?.close(); } catch { /* already gone */ }
        try { await this.browser?.close(); } catch { /* already gone */ }
        this.page = null; this.browser = null;
    }
}

/* ------------------------------------------------------------- rung three -- */

/**
 * The generator's address. Keyless by default and overridable in one variable,
 * because the right generator today is not the right one in a year — and
 * because a user with a Cloudflare or Together key should be able to point at
 * it without a code change.
 *
 * `{prompt}` is replaced with the URL-encoded subject.
 */
export function generatorUrl(): string {
    return String(process.env.JOE_IMAGE_GEN
        || 'https://image.pollinations.ai/prompt/{prompt}?width=640&height=480&nologo=true');
}

/**
 * Is the generator switched on? ON by default — a picture is what he asked for,
 * and every failure below it falls to the designed card rather than to nothing.
 * `JOE_IMAGE_GEN_ON=0` turns it off for a machine that must not reach out.
 */
export function generatorEnabled(): boolean {
    return String(process.env.JOE_IMAGE_GEN_ON || '1') !== '0';
}

async function fetchBytes(url: string, timeoutMs: number): Promise<{ buf: Buffer; mime: string } | null> {
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), Math.max(1000, timeoutMs));
        const r = await fetch(url, { signal: ctrl.signal, headers: { accept: 'image/*' } });
        clearTimeout(t);
        if (!r.ok) return null;
        const mime = String(r.headers.get('content-type') || 'image/jpeg').split(';')[0];
        if (!/^image\//.test(mime)) return null;
        const buf = Buffer.from(await r.arrayBuffer());
        // A refusal page dressed as an image, or a tracking pixel.
        if (buf.length < 512) return null;
        return { buf, mime };
    } catch { return null; }
}

/* -------------------------------------------------------------- the ladder - */

export interface PictureOptions {
    /** Words that place the subject: «مشتل نباتات» beside «نخيل برحي». */
    context?: string;
    timeoutMs?: number;
    shrinker?: Shrinker;
    /** Skip the network entirely — the card alone. */
    offline?: boolean;
    onNote?: (note: string) => void;
}

/**
 * One picture for one row. Never throws, never returns nothing: the worst case
 * is the designed card, which is exactly the point of having it.
 */
export async function pictureFor(name: string, opts?: PictureOptions): Promise<RowPicture> {
    const subject = String(name || '').trim();
    if (!subject) return { data: designedCard(''), from: 'card', note: 'no name to search for' };
    if (opts?.offline) return { data: designedCard(subject), from: 'card', note: 'offline' };

    const timeoutMs = opts?.timeoutMs ?? 12_000;
    const shrinker = opts?.shrinker || new Shrinker();
    const ownShrinker = !opts?.shrinker;
    const query = [subject, opts?.context].filter(Boolean).join(' ').slice(0, 80);
    let note = '';

    try {
        /* — rung two: a real photograph, already licensed and already vetted — */
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { sourceImage } = require('./images');
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-pic-'));
            try {
                const found = await sourceImage(dir, query, timeoutMs, 0, 'card');
                const file = found && String(found.src || '');
                const onDisk = file ? path.join(dir, path.basename(file)) : '';
                if (onDisk && fs.existsSync(onDisk)) {
                    const buf = fs.readFileSync(onDisk);
                    const mime = /\.png$/i.test(onDisk) ? 'image/png' : /\.webp$/i.test(onDisk) ? 'image/webp' : 'image/jpeg';
                    // Every photograph is shrunk, not only the enormous ones:
                    // a 300KB row is still a 300KB row on every list render.
                    let data = await shrinker.shrink(buf, mime);
                    if (!data && buf.length <= MAX_BYTES) data = `data:${mime};base64,${buf.toString('base64')}`;
                    if (data) {
                        const c = found.credit;
                        return {
                            data, from: 'photo',
                            credit: c ? `${c.creator} — ${c.license} · ${c.source}` : undefined,
                        };
                    }
                    note = 'a photograph was found but could not be decoded';
                } else {
                    note = 'no relevant licensed photograph';
                }
            } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ } }
        } catch (e: any) {
            note = `search unavailable: ${String(e?.message || e).slice(0, 60)}`;
        }
        opts?.onNote?.(note);

        /* — rung three: have one made — */
        if (generatorEnabled()) {
            const url = generatorUrl().replace('{prompt}', encodeURIComponent(query));
            const got = await fetchBytes(url, timeoutMs);
            if (got) {
                const data = await shrinker.shrink(got.buf, got.mime);
                if (data) return { data, from: 'generated', note };
            }
            note = `${note}${note ? '; ' : ''}the generator did not answer`;
        } else {
            note = `${note}${note ? '; ' : ''}generator off (JOE_IMAGE_GEN_ON=0)`;
        }

        /* — rung four: the floor — */
        return { data: designedCard(subject), from: 'card', note };
    } finally {
        if (ownShrinker) await shrinker.close();
    }
}

/**
 * A picture for every name, with ONE browser for the whole batch.
 *
 * Sequential on purpose: eight parallel downloads against a free archive is
 * how a build earns a rate limit for every user of that archive.
 */
export async function picturesFor(names: string[], opts?: PictureOptions): Promise<RowPicture[]> {
    const shrinker = opts?.shrinker || new Shrinker();
    const own = !opts?.shrinker;
    const out: RowPicture[] = [];
    try {
        for (const n of names) out.push(await pictureFor(n, { ...opts, shrinker }));
    } finally { if (own) await shrinker.close(); }
    return out;
}

/** «٤ صور حقيقية · ٢ مولّدة · ١ بطاقة» — the sentence a delivery message needs. */
export function describePictures(list: RowPicture[], isAr: boolean): string {
    const n = (k: PictureSource) => list.filter(p => p.from === k).length;
    const parts: string[] = [];
    if (n('photo')) parts.push(isAr ? `${n('photo')} صورة حقيقية مرخّصة` : `${n('photo')} licensed photo(s)`);
    if (n('generated')) parts.push(isAr ? `${n('generated')} صورة مولَّدة` : `${n('generated')} generated`);
    if (n('card')) parts.push(isAr ? `${n('card')} بطاقة مصمّمة` : `${n('card')} designed card(s)`);
    return parts.join(isAr ? ' · ' : ' · ');
}
