/**
 * A PUBLIC PAGE, READ AS TEXT — AND NOTHING THE MACHINE IS NOT MEANT TO REACH.
 *
 * Read on 2026-11-05: the engine had no way to read the web. browser_open
 * opens only this run's own servers or an address the request names (it
 * drives the owner's own browser page, with his sign-ins), and no other tool
 * fetched anything, so a model that did not know a library's API had to
 * guess it. web_read reads one public page the way a reader does: from the
 * server, with no cookies, no sign-ins and no script, as text.
 *
 * What it will not reach is decided at the moment it connects, not before:
 *   - http and https only, no credentials in the address, no internal host
 *     names (localhost, metadata endpoints);
 *   - every address a name resolves to is checked inside the connection's
 *     own lookup, so a name that answers public to a first look and private
 *     to the connection (DNS rebinding) is refused at connect time;
 *   - each redirect is a new address, checked the same way, four at most;
 *   - only text comes back (HTML, plain text, Markdown, JSON, XML), cut at a
 *     byte ceiling and a time ceiling.
 * What it reads is the internet's words, never the owner's: the adapter hands
 * it to the model as reference data, never as instructions (tools/web.ts).
 */
import dns from 'dns';
import http from 'http';
import https from 'https';
import net from 'net';
import { isPrivateAddress } from '../api-discovery/network-policy';

const INTERNAL_HOST = /^(?:localhost|localhost\.|host\.docker\.internal|metadata\.google\.internal|instance-data)(?:$|\.)|\.(?:local|internal|localhost|lan|home|corp)\.?$/iu;
const MAX_REDIRECTS = 4;
export const WEB_READ_MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 15_000;
const TEXT_TYPE = /^(?:text\/|application\/(?:json|xml|xhtml\+xml|rss\+xml|atom\+xml|javascript|x-javascript|ld\+json)|[^;]*\+(?:json|xml)\b)/iu;

export interface WebPage {
    url: string;
    status: number;
    contentType: string;
    title: string;
    text: string;
    /** The body was longer than the byte ceiling and was cut there. */
    truncated: boolean;
}

export type Lookup = (hostname: string, options: dns.LookupAllOptions, callback: (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void) => void;

/** Why this address may not be read, or '' when it may (the connection still checks what its name resolves to). */
export function webAddressProblem(raw: string): string {
    let url: URL;
    try { url = new URL(String(raw || '').trim()); } catch { return 'it is not a valid address'; }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'only http and https addresses can be read';
    if (url.username || url.password) return 'an address with a user name or password in it is never read';
    const host = url.hostname.replace(/^\[|\]$/gu, '');
    if (INTERNAL_HOST.test(host)) return 'it names a local or internal host';
    if (net.isIP(host) && isPrivateAddress(host)) return 'it is a private, local or reserved address';
    return '';
}

/**
 * The connection's own lookup: every address the name resolves to must be
 * public, and the connection is pinned to what was checked.
 */
export function publicOnlyLookup(base: Lookup = dns.lookup as unknown as Lookup, blocked: (address: string) => boolean = isPrivateAddress) {
    return (hostname: string, options: any, callback: (err: NodeJS.ErrnoException | null, address: any, family?: number) => void) => {
        const all = typeof options === 'object' && options?.all === true;
        base(hostname, { ...(typeof options === 'object' ? options : {}), all: true }, (err, addresses) => {
            if (err) return callback(err, all ? [] : '', 4);
            const list = Array.isArray(addresses) ? addresses : [];
            if (!list.length || list.some(a => blocked(a.address))) {
                const refused: NodeJS.ErrnoException = new Error(`refused: ${hostname} resolves to a private, local or reserved address`);
                refused.code = 'EPRIVATEADDRESS';
                return callback(refused, all ? [] : '', 4);
            }
            if (all) return callback(null, list);
            return callback(null, list[0].address, list[0].family);
        });
    };
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', laquo: '«', raquo: '»', copy: '©', reg: '®' };

function decodeEntities(s: string): string {
    return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (whole, code: string) => {
        if (code[0] === '#') {
            const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
            return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : whole;
        }
        return ENTITIES[code.toLowerCase()] ?? whole;
    });
}

/** The words of an HTML page, its blocks on their own lines, its code kept, its scripts and styles gone. */
export function htmlToText(html: string): { title: string; text: string } {
    const title = decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/iu)?.[1] || '').replace(/\s+/gu, ' ').trim());
    const body = html
        .replace(/<!--[\s\S]*?-->/gu, ' ')
        .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1\s*>/giu, ' ')
        .replace(/<(?:br|hr)\b[^>]*>/giu, '\n')
        .replace(/<li\b[^>]*>/giu, '\n- ')
        .replace(/<h([1-6])\b[^>]*>/giu, (_m, n: string) => `\n\n${'#'.repeat(Number(n))} `)
        .replace(/<\/(?:p|div|section|article|header|footer|nav|aside|main|h[1-6]|li|ul|ol|table|tr|pre|blockquote|dd|dt|figure)\s*>/giu, '\n')
        .replace(/<(?:td|th)\b[^>]*>/giu, ' | ')
        .replace(/<[^>]+>/gu, '');
    const text = decodeEntities(body)
        .replace(/[ \t\f\v ]+/gu, ' ')
        .replace(/ *\n */gu, '\n')
        .replace(/\n{3,}/gu, '\n\n')
        .trim();
    return { title, text };
}

interface Fetched { status: number; headers: http.IncomingHttpHeaders; body: Buffer; truncated: boolean }

function getOnce(url: URL, lookup: ReturnType<typeof publicOnlyLookup>, signal?: AbortSignal): Promise<Fetched> {
    const lib = url.protocol === 'https:' ? https : http;
    return new Promise((resolve, reject) => {
        const req = lib.get(url, {
            lookup: lookup as any,
            headers: { 'user-agent': 'Joe-web-read/1.0 (+reads public documentation)', accept: 'text/html,text/plain,text/markdown,application/json;q=0.9,*/*;q=0.1' },
            timeout: TIMEOUT_MS,
            signal,
        }, res => {
            const chunks: Buffer[] = [];
            let size = 0;
            let truncated = false;
            res.on('data', (chunk: Buffer) => {
                if (truncated) return;
                if (size + chunk.length > WEB_READ_MAX_BYTES) {
                    chunks.push(chunk.subarray(0, WEB_READ_MAX_BYTES - size));
                    size = WEB_READ_MAX_BYTES;
                    truncated = true;
                    res.destroy();
                    resolve({ status: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks), truncated });
                    return;
                }
                chunks.push(chunk);
                size += chunk.length;
            });
            res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks), truncated }));
            res.on('error', err => { if (!truncated) reject(err); });
        });
        req.on('timeout', () => req.destroy(new Error(`no answer within ${TIMEOUT_MS / 1000} s`)));
        req.on('error', reject);
    });
}

/**
 * Read one public page as text, following at most four redirects, each checked
 * anew. `lookup` and `blocked` are the resolver and the address rule; Joe
 * always uses the system's and isPrivateAddress (a test serves a page on its
 * own loopback by naming the one address it allows).
 */
export async function readPublicPage(raw: string, opts: { lookup?: Lookup; blocked?: (address: string) => boolean; signal?: AbortSignal } = {}): Promise<WebPage> {
    const lookup = publicOnlyLookup(opts.lookup, opts.blocked);
    let current = String(raw || '').trim();
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const problem = webAddressProblem(current);
        if (problem) throw new Error(`web_read refused ${current}: ${problem}`);
        const url = new URL(current);
        url.hash = '';
        const got = await getOnce(url, lookup, opts.signal);
        if (got.status >= 300 && got.status < 400 && got.headers.location) {
            current = new URL(String(got.headers.location), url).toString();
            continue;
        }
        const contentType = String(got.headers['content-type'] || '').toLowerCase();
        if (contentType && !TEXT_TYPE.test(contentType)) throw new Error(`web_read read ${url}: it is ${contentType.split(';')[0]}, not a page of text`);
        const charset = contentType.match(/charset=([\w-]+)/iu)?.[1]?.toLowerCase() || 'utf-8';
        let decoded: string;
        try { decoded = new TextDecoder(charset).decode(got.body); } catch { decoded = got.body.toString('utf8'); }
        const html = /html|xml/u.test(contentType) || (!contentType && /^\s*</u.test(decoded));
        const { title, text } = html && !/json/u.test(contentType) ? htmlToText(decoded) : { title: '', text: decoded.trim() };
        return { url: url.toString(), status: got.status, contentType: contentType.split(';')[0] || '', title, text, truncated: got.truncated };
    }
    throw new Error(`web_read followed ${MAX_REDIRECTS} redirects from ${raw} and stopped`);
}
