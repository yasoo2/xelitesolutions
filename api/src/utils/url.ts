
/**
 * Shared URL normalization logic for browser navigation.
 * Handles cleaning, protocol prefixing, and resolving "smart labels" like 'github' or 'جوجل'.
 */
export function normalizeUrlForGoto(raw: any, baseUrl?: string) {
    let s = String(raw ?? '').trim();

    // Clean wrapping quotes and backticks
    s = s.replace(/^[`"'“”‘’]+/, '').replace(/[`"'“”‘’]+$/, '').trim();
    if (!s) return s;

    const fixKnownHosts = (u: string) => {
        const input = String(u || '').trim();
        if (!input) return input;
        try {
            const parsed = new URL(input);
            const host = String(parsed.hostname || '').trim().toLowerCase();
            const hadWww = /^www\./i.test(host);
            const hostNoWww = host.replace(/^www\./i, '');
            const isXeliteLike =
                (/xelite/i.test(hostNoWww) && /solution/i.test(hostNoWww)) ||
                /^xelitesolutions(?:\.(?:co|com))?$/i.test(hostNoWww);
            if (isXeliteLike) {
                const tld = /\.com$/i.test(hostNoWww) ? 'com' : 'co';
                parsed.hostname = `${hadWww ? 'www.' : ''}xelitesolutions.${tld}`;
                return parsed.toString();
            }
            return input;
        } catch {
            return input;
        }
    };

    // If it already has a protocol, just fix hosts and return
    if (/^https?:\/\//i.test(s)) return fixKnownHosts(s);
    if (/^\/\//.test(s)) return `https:${s}`;

    // Smart label resolution
    const labels: Record<string, string> = {
        'facebook': 'https://facebook.com',
        'فيسبوك': 'https://facebook.com',
        'youtube': 'https://youtube.com',
        'يوتيوب': 'https://youtube.com',
        'instagram': 'https://instagram.com',
        'انستجرام': 'https://instagram.com',
        'twitter': 'https://x.com',
        'تويتر': 'https://x.com',
        'amazon': 'https://amazon.com',
        'امازون': 'https://amazon.com',
        'أمازون': 'https://amazon.com',
        'github': 'https://github.com',
        'جيت هاب': 'https://github.com',
        'google': 'https://google.com',
        'جوجل': 'https://google.com',
        'openai': 'https://openai.com',
        'chatgpt': 'https://chat.openai.com',
        'linkedin': 'https://linkedin.com',
        'لينكد ان': 'https://linkedin.com',
        'whatsapp': 'https://web.whatsapp.com',
        'واتساب': 'https://web.whatsapp.com',
        'gmail': 'https://mail.google.com',
        'جيميل': 'https://mail.google.com',
    };

    const label = s.toLowerCase().replace(/^(?:افتح\s+|open\s+|اذهب\s+الى\s+|visit\s+|انتقل\s+إلى\s+|انتقل\s+الى\s+)/i, '').trim();
    if (labels[label]) return labels[label];

    // Handle relative paths
    if (/^\//.test(s)) {
        try {
            if (baseUrl) return fixKnownHosts(new URL(s, baseUrl).toString());
        } catch { }
        return s;
    }

    const candidate = s.replace(/^\/\//, '');
    const isLocal =
        /^localhost(?::\d+)?(?:\/|$)/i.test(candidate) ||
        /^127\.0\.0\.1(?::\d+)?(?:\/|$)/.test(candidate) ||
        /^\d+\.\d+\.\d+\.\d+(?::\d+)?(?:\/|$)/.test(candidate);

    // Basic domain detection
    const looksDomain =
        /^(?:www\.)?[a-z0-9][a-z0-9-]{0,62}(?:\.[a-z0-9-]{1,63})+(?::\d+)?(?:\/[^\s"'<>]*)?$/i.test(candidate);

    if (isLocal) return `http://${candidate}`;
    if (looksDomain) return fixKnownHosts(`https://${candidate}`);

    // Special handling for Xelite Solutions
    if (/^xelite/i.test(candidate) && /solution/i.test(candidate)) {
        if (!/\./.test(candidate)) return 'https://xelitesolutions.co';
        return fixKnownHosts(`https://${candidate}`);
    }

    return s;
}
