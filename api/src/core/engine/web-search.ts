/**
 * THE WEB SEARCHED: WHAT JOE'S ENGINE COULD NOT DO.
 *
 * The owner, 2026-11-08: «make Joe better than Codex and Manus». Manus
 * searches the web by itself, reads what it found and writes from it; Joe's
 * engine could only read a page whose address it already knew (web_read). A
 * request for research, a comparison, current prices or news was answered
 * from what the model remembered.
 *
 * One query, the best results (title, address, a line of what it says), from:
 *   1. Brave's search API, when the deployment has its key (BRAVE_SEARCH_API_KEY):
 *      the way for a server with many users;
 *   2. else Brave's public results page, asked as Joe (his own user agent);
 *   3. else DuckDuckGo's HTML results, then Yahoo's results page — each one
 *      that refuses us rested for a while, never hammered;
 *   4. and when those give nothing: the news feeds, an instant answer and
 *      Wikipedia's own search API, in the query's language.
 * Every request goes through web-read.ts, which refuses local, private and
 * internal addresses at connect time. What comes back is the internet's
 * words: reference data, never instructions.
 */
import { readPublicPage, type Lookup } from './web-read';

export interface SearchHit { title: string; url: string; snippet: string }
export interface SearchResult { provider: 'brave-api' | 'brave' | 'duckduckgo' | 'yahoo' | 'news' | 'instant' | 'wikipedia' | 'none'; hits: SearchHit[]; note?: string }

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ', '#39': '\'', hellip: '…', mdash: '—', ndash: '–' };
function textOf(html: string): string {
    return String(html || '')
        .replace(/<[^>]+>/gu, ' ')
        .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/giu, (m, e: string) => {
            if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
            return ENTITIES[e.toLowerCase()] ?? m;
        })
        .replace(/\s+/gu, ' ')
        .trim();
}

function publicHttp(u: string): boolean {
    try { const x = new URL(u); return (x.protocol === 'https:' || x.protocol === 'http:') && !/(^|\.)brave\.com$/iu.test(x.hostname); } catch { return false; }
}

/** Brave's results page → its web results, in order: each block marked data-type="web". */
export function parseBraveResults(html: string, max = 8): SearchHit[] {
    const hits: SearchHit[] = [];
    const seen = new Set<string>();
    for (const block of String(html || '').split('data-type="web"').slice(1)) {
        const chunk = block.split('data-type=')[0];
        const url = textOf((chunk.match(/<a\s[^>]*href="(https?:[^"]+)"/u) || [])[1] || '');
        if (!url || !publicHttp(url) || seen.has(url)) continue;
        const title = textOf((chunk.match(/class="title[^"]*"[^>]*>([\s\S]*?)<\/div>/u) || [])[1] || '');
        const snippet = textOf((chunk.match(/class="(?:generic-snippet|snippet-content|snippet-description|description)[^"]*"[^>]*>([\s\S]*?)<\/div>/u) || [])[1] || '');
        if (!title) continue;
        seen.add(url);
        hits.push({ title: title.slice(0, 200), url, snippet: snippet.slice(0, 400) });
        if (hits.length >= max) break;
    }
    return hits;
}

/** Brave's search API answer → its web results. */
export function parseBraveApi(json: unknown, max = 8): SearchHit[] {
    const rows: any[] = (json as any)?.web?.results || [];
    return rows
        .filter(r => r && typeof r.url === 'string' && publicHttp(r.url))
        .slice(0, max)
        .map(r => ({ title: textOf(String(r.title || '')).slice(0, 200), url: r.url, snippet: textOf(String(r.description || '')).slice(0, 400) }));
}

/** Wikipedia's search API answer → its articles, in the wiki's language. */
export function parseWikipedia(json: unknown, lang: string, max = 8): SearchHit[] {
    const rows: any[] = (json as any)?.query?.search || [];
    return rows.slice(0, max).map(r => ({
        title: String(r.title || ''),
        url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(String(r.title || '').replace(/ /gu, '_'))}`,
        snippet: textOf(String(r.snippet || '')).slice(0, 400),
    })).filter(h => h.title);
}

/**
 * A news feed (Bing's or Google's RSS) → its stories: headline, link, publisher,
 * date and the first lines. Bing's links go through its click counter with the
 * article's own address in `url=`: that address is kept, so web_read reads the
 * article (Google's wrapper opens only on a script, so its stories give headlines).
 */
export function parseNewsRss(xml: string, max = 6): SearchHit[] {
    const hits: SearchHit[] = [];
    for (const m of String(xml || '').matchAll(/<item>([\s\S]*?)<\/item>/gu)) {
        const item = m[1];
        const pick = (tag: string) => textOf(((item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'u')) || [])[1] || '').replace(/^<!\[CDATA\[|\]\]>$/gu, ''));
        const title = pick('title'), date = pick('pubDate'), desc = pick('description');
        const source = pick('source') || pick('News:Source');
        let url = pick('link');
        try {
            const u = new URL(url);
            const inner = u.searchParams.get('url');
            if (/(^|\.)bing\.com$/iu.test(u.hostname) && inner && /^https?:\/\//iu.test(inner)) url = inner;
        } catch { /* kept as it is */ }
        if (!title || !/^https?:\/\//u.test(url)) continue;
        let when = '';
        try { when = date ? new Date(date).toISOString().slice(0, 10) : ''; } catch { when = ''; }
        hits.push({ title: title.slice(0, 200), url, snippet: `${[source, when].filter(Boolean).join(' · ')}${desc && desc !== title ? `${source || when ? ' — ' : ''}${desc.slice(0, 300)}` : ''}` });
        if (hits.length >= max) break;
    }
    return hits;
}

/*
 * TWO MORE PUBLIC RESULT PAGES, FOR WHEN BRAVE RESTS.
 *
 * The Manus-style exam, 2026-11-09 (M05, «five famous shawarma places in Amman»):
 * Brave's page was resting after a 429, and what was left — news feeds, an
 * instant answer, Wikipedia — found one restaurant, so the page showed one and
 * was refused. DuckDuckGo's HTML results and Yahoo's results page, asked the
 * same moment, gave Time Out Amman, TripAdvisor's shawarma list and three
 * «best shawarma in Amman» articles. Both wrap their links (DuckDuckGo in
 * `uddg=`, Yahoo in `/RU=…/`): the page's own address is kept.
 */

/** DuckDuckGo's HTML results → its web results, ads left out. */
export function parseDuckHtml(html: string, max = 8): SearchHit[] {
    const hits: SearchHit[] = [];
    const seen = new Set<string>();
    for (const block of String(html || '').split(/class="result__a"/u).slice(1)) {
        const href = textOf((block.match(/^\s*(?:rel="[^"]*"\s*)?href="([^"]+)"/u) || [])[1] || '');
        let url = href;
        try {
            const u = new URL(href.startsWith('//') ? `https:${href}` : href);
            const inner = u.searchParams.get('uddg');
            if (inner) url = inner;
        } catch { continue; }
        if (!publicHttp(url) || /(^|\.)duckduckgo\.com$/iu.test((() => { try { return new URL(url).hostname; } catch { return ''; } })()) || seen.has(url)) continue;
        const title = textOf((block.match(/^[^>]*>([\s\S]*?)<\/a>/u) || [])[1] || '');
        const snippet = textOf((block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div|td)>/u) || [])[1] || '');
        if (!title) continue;
        seen.add(url);
        hits.push({ title: title.slice(0, 200), url, snippet: snippet.slice(0, 400) });
        if (hits.length >= max) break;
    }
    return hits;
}

/** Yahoo's results page → its web results (each title a link through r.search.yahoo.com with the page in /RU=…/). */
export function parseYahoo(html: string, max = 8): SearchHit[] {
    const hits: SearchHit[] = [];
    const seen = new Set<string>();
    for (const m of String(html || '').matchAll(/<div class="compTitle[^"]*"[^>]*>\s*(?:<h3[^>]*>\s*)?<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]{0,3000}?)(?=<div class="compTitle|$)/gu)) {
        let url = textOf(m[1]);
        const ru = url.match(/\/RU=([^/]+)\//u);
        if (ru) { try { url = decodeURIComponent(ru[1]); } catch { continue; } }
        if (!publicHttp(url) || /(^|\.)yahoo\.com$/iu.test((() => { try { return new URL(url).hostname; } catch { return ''; } })()) || seen.has(url)) continue;
        //  The title's own words, in the link's <h3>: Yahoo puts the site's address in a block before it.
        const title = textOf((m[2].match(/<h3[^>]*>([\s\S]*?)<\/h3>/u) || [])[1] || '') || textOf(m[2]);
        const snippet = textOf((m[3].match(/class="compText[^"]*"[^>]*>([\s\S]*?)<\/div>/u) || [])[1] || '');
        if (!title) continue;
        seen.add(url);
        hits.push({ title: title.slice(0, 200), url, snippet: snippet.slice(0, 400) });
        if (hits.length >= max) break;
    }
    return hits;
}

/** DuckDuckGo's instant answer → the topic's summary and its source, when it has one. */
export function parseInstantAnswer(json: unknown): SearchHit[] {
    const j = json as any;
    const hits: SearchHit[] = [];
    if (j?.Abstract && /^https?:\/\//u.test(String(j.AbstractURL || ''))) {
        hits.push({ title: `${String(j.Heading || '').trim()}${j.AbstractSource ? ` — ${j.AbstractSource}` : ''}`.slice(0, 200), url: String(j.AbstractURL), snippet: textOf(String(j.Abstract)).slice(0, 600) });
    }
    return hits;
}

const arabic = (q: string) => /[؀-ۿ]/u.test(q);

/** A public results page that refused us (429, a challenge, an «anomaly»): left alone for a while, never hammered. */
let braveRestUntil = 0;
const restUntil: Record<string, number> = {};
const BRAVE_REST_MS = 15 * 60_000;
const REFUSED = /captcha|anomaly|unusual traffic|are you a robot|too many requests/iu;

export async function searchWeb(query: string, opts: { count?: number; signal?: AbortSignal; lookup?: Lookup; env?: NodeJS.ProcessEnv; now?: () => number } = {}): Promise<SearchResult> {
    const q = String(query || '').trim().slice(0, 300);
    if (!q) return { provider: 'none', hits: [], note: 'no query' };
    const count = Math.max(1, Math.min(10, Math.floor(opts.count || 6)));
    const env = opts.env || process.env;
    const now = opts.now || Date.now;
    const lang = arabic(q) ? 'ar' : 'en';
    const problems: string[] = [];

    const key = String(env.BRAVE_SEARCH_API_KEY || '').trim();
    if (key) {
        try {
            const page = await readPublicPage(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=${count}`, {
                signal: opts.signal, lookup: opts.lookup, headers: { accept: 'application/json', 'x-subscription-token': key },
            });
            const hits = page.status < 400 ? parseBraveApi(JSON.parse(page.text), count) : [];
            if (hits.length) return { provider: 'brave-api', hits };
            problems.push(`the search API answered ${page.status}`);
        } catch (e: any) { problems.push(`the search API: ${String(e?.message || e).slice(0, 120)}`); }
    }
    if (now() >= braveRestUntil) {
        try {
            const page = await readPublicPage(`https://search.brave.com/search?q=${encodeURIComponent(q)}&source=web`, {
                signal: opts.signal, lookup: opts.lookup, keepHtml: true, headers: { 'accept-language': lang === 'ar' ? 'ar,en;q=0.8' : 'en,ar;q=0.5' },
            });
            const hits = page.status < 400 ? parseBraveResults(page.html || '', count) : [];
            if (hits.length) return { provider: 'brave', hits };
            if (page.status === 429 || /captcha/iu.test(page.html || '')) braveRestUntil = now() + BRAVE_REST_MS;
            problems.push(`the results page gave nothing (${page.status})`);
        } catch (e: any) { problems.push(`the results page: ${String(e?.message || e).slice(0, 120)}`); }
    } else problems.push('the results page is resting after refusing us');

    //  Two more public result pages, one after the other, each rested when it refuses us.
    const pages: Array<{ name: 'duckduckgo' | 'yahoo'; url: string; parse: (html: string) => SearchHit[] }> = [
        { name: 'duckduckgo', url: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}&kl=${lang === 'ar' ? 'xa-ar' : 'wt-wt'}`, parse: h => parseDuckHtml(h, count) },
        { name: 'yahoo', url: `https://search.yahoo.com/search?p=${encodeURIComponent(q)}`, parse: h => parseYahoo(h, count) },
    ];
    for (const p of pages) {
        if (now() < (restUntil[p.name] || 0)) { problems.push(`${p.name} is resting after refusing us`); continue; }
        try {
            const page = await readPublicPage(p.url, {
                signal: opts.signal, lookup: opts.lookup, keepHtml: true, headers: { 'accept-language': lang === 'ar' ? 'ar,en;q=0.8' : 'en,ar;q=0.5' },
            });
            const hits = page.status < 400 ? p.parse(page.html || '') : [];
            if (hits.length) return { provider: p.name, hits, ...(problems.length ? { note: problems.join('; ') } : {}) };
            //  DuckDuckGo answers a burst with 202 and an empty page.
            if (page.status === 429 || page.status === 403 || page.status === 202 || REFUSED.test(page.html || '')) restUntil[p.name] = now() + BRAVE_REST_MS;
            problems.push(`${p.name} gave nothing (${page.status})`);
        } catch (e: any) { problems.push(`${p.name}: ${String(e?.message || e).slice(0, 120)}`); }
    }

    //  Free, official sources together: today's news (Bing's feed links the articles
    //  themselves; Google's only its own wrapper, so it fills in), the topic's summary, the encyclopedia.
    const feed = (url: string, parse: (xml: string) => SearchHit[]) => readPublicPage(url, { signal: opts.signal, lookup: opts.lookup, keepHtml: true, headers: { accept: 'application/rss+xml,application/xml' } })
        //  The feed's own markup: its text has lost the <item> tags.
        .then(p => (p.status < 400 ? parse(p.html || p.text) : [])).catch(() => [] as SearchHit[]);
    const [bingNews, googleNews, instant, wiki] = await Promise.all([
        feed(`https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&setlang=${lang}`, xml => parseNewsRss(xml, Math.min(5, count))),
        feed(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${lang}${lang === 'ar' ? '&gl=SA&ceid=SA:ar' : '&gl=US&ceid=US:en'}`, xml => parseNewsRss(xml, 4)),
        readPublicPage(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`, { signal: opts.signal, lookup: opts.lookup, headers: { accept: 'application/json' } })
            .then(p => (p.status < 400 ? parseInstantAnswer(JSON.parse(p.text)) : [])).catch(() => [] as SearchHit[]),
        readPublicPage(`https://${lang}.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=3&srsearch=${encodeURIComponent(q)}`, { signal: opts.signal, lookup: opts.lookup, headers: { accept: 'application/json' } })
            .then(p => (p.status < 400 ? parseWikipedia(JSON.parse(p.text), lang, 3) : [])).catch(() => [] as SearchHit[]),
    ]);
    const news = [...bingNews, ...googleNews.filter(g => !bingNews.some(b => b.title === g.title))].slice(0, 5);
    const hits = [...instant, ...news, ...wiki].slice(0, Math.max(count, 6));
    if (hits.length) return { provider: news.length ? 'news' : instant.length ? 'instant' : 'wikipedia', hits, ...(problems.length ? { note: problems.join('; ') } : {}) };
    problems.push('the news, the instant answer and Wikipedia found nothing');
    return { provider: 'none', hits: [], note: problems.join('; ') };
}

/** For tests: no results page resting. */
export function resetSearchRest(): void { braveRestUntil = 0; for (const k of Object.keys(restUntil)) delete restUntil[k]; }
