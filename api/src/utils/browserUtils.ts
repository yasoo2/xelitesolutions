
export function extractTitleFromHtml(html: string) {
    const m = String(html || '').match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i);
    const t = String(m?.[1] || '').replace(/\s+/g, ' ').trim();
    return t || '';
}

function normalizeDisplayUrl(raw: any) {
    let s = String(raw ?? '').trim();
    while (s.length >= 2) {
        const first = s[0];
        const last = s[s.length - 1];
        const wrap = (c: string) => c === '`' || c === '"' || c === "'" || c === '“' || c === '”' || c === '‘' || c === '’';
        if (wrap(first) && wrap(last)) s = s.slice(1, -1).trim();
        else break;
    }
    s = s.replace(/[)\]`.,;:!?،؛؟]+$/g, '').trim();
    if (!s) return s;
    if (/^https?:\/\//i.test(s)) return s;
    if (/^\/\//.test(s)) return `https:${s}`;
    if (/^(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+(?:\:\d+)?(?:\/|$)/i.test(s)) return `https://${s}`;
    return s;
}

export function inferSiteLabel(url: string, dom: string) {
    const u = normalizeDisplayUrl(url);
    try {
        if (u) {
            const host = new URL(u).hostname.replace(/^www\./i, '');
            if (host) return host;
        }
    } catch { }
    const d = String(dom || '');
    if (/youtube\.com|ytd-app/i.test(d)) return 'youtube.com';
    if (/accounts\.google\.com/i.test(d)) return 'accounts.google.com';
    if (/github\.com/i.test(d)) return 'github.com';
    const title = extractTitleFromHtml(d);
    return title || 'page';
}

export function summarizeBrowserOutputForChat(out: any) {
    if (!out || typeof out !== 'object') return out;
    const isBrowserStateLike =
        typeof (out as any).url === 'string' ||
        typeof (out as any).pageUrl === 'string' ||
        typeof (out as any).dom === 'string' ||
        typeof (out as any).screenshot === 'string' ||
        typeof (out as any).screenshotHref === 'string';
    if (!isBrowserStateLike) return out;
    const urlRaw =
        typeof (out as any).url === 'string'
            ? (out as any).url
            : typeof (out as any).pageUrl === 'string'
                ? (out as any).pageUrl
                : '';
    const url = normalizeDisplayUrl(urlRaw);
    const dom = typeof (out as any).dom === 'string' ? (out as any).dom : '';
    const title = dom ? extractTitleFromHtml(dom) : '';
    const site = inferSiteLabel(url, dom);
    const domLen = dom ? dom.length : 0;
    const hasScreenshot = typeof (out as any).screenshot === 'string' || typeof (out as any).screenshotHref === 'string';
    const redactionEnabled = typeof (out as any).redactionEnabled === 'boolean' ? Boolean((out as any).redactionEnabled) : undefined;
    const u = String(url || '').toLowerCase();
    const domLower = String(dom || '').toLowerCase();
    const hasPasswordField = /type=["']password["']|name=["']password["']|passw(or)?d|passwd/i.test(domLower);
    const hasLoginFormSignal = /<form\b[\s\S]{0,4000}(type=["']password["']|name=["']password["'])/i.test(dom);
    const urlLooksLogin = /serviceLogin|\/login\b|\/signin\b|accounts\.google\.com/i.test(u);
    const domStrongLogin = /<title[^>]*>[\s\S]*?(sign in|login|تسجيل\s+الدخول)[\s\S]*?<\/title>/i.test(dom) || /ServiceLogin/i.test(dom);

    const loginLike = Boolean((urlLooksLogin && (hasPasswordField || hasLoginFormSignal)) || (domStrongLogin && hasPasswordField));
    const summary: any = { site };
    if (url) summary.url = url;
    if (title) summary.title = title;
    if (loginLike) summary.pageType = 'login';
    if (domLen) summary.domLength = domLen;
    if (hasScreenshot) summary.hasScreenshot = true;
    if (typeof redactionEnabled === 'boolean') summary.redactionEnabled = redactionEnabled;
    return summary;
}

export function sanitizeToolResultForBroadcast(toolName: string, r: any) {
    const t = String(toolName || '');
    if (!/^browser_/.test(t) || !r || typeof r !== 'object') return r;
    const next: any = { ...r };
    if ('artifacts' in next) delete next.artifacts;
    if ('output' in next) next.output = summarizeBrowserOutputForChat((r as any).output);
    return next;
}
