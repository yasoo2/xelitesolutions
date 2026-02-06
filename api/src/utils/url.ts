
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
        'github': 'https://github.com',
        'google': 'https://google.com',
        'openai': 'https://openai.com',
        'chatgpt': 'https://chat.openai.com',
        'linkedin': 'https://linkedin.com',
        'whatsapp': 'https://web.whatsapp.com',
        'gmail': 'https://mail.google.com',
        'facebook': 'https://facebook.com',
        'youtube': 'https://youtube.com',
        'yahoo': 'https://yahoo.com',
        'instagram': 'https://instagram.com',
        'twitter': 'https://x.com',
        'amazon': 'https://amazon.com',
    };

    const arLabels: Record<string, string> = {
        'جيت هاب': 'https://github.com',
        'جيتهاب': 'https://github.com',
        'جيت-هاب': 'https://github.com',
        'جوجل': 'https://google.com',
        'قوقل': 'https://google.com',
        'لينكد ان': 'https://linkedin.com',
        'لينكدإن': 'https://linkedin.com',
        'واتساب': 'https://web.whatsapp.com',
        'واتس اب': 'https://web.whatsapp.com',
        'جيميل': 'https://mail.google.com',
        'فيسبوك': 'https://facebook.com',
        'فيس بوك': 'https://facebook.com',
        'يوتيوب': 'https://youtube.com',
        'ياهو': 'https://yahoo.com',
        'انستجرام': 'https://instagram.com',
        'تويتر': 'https://x.com',
        'امازون': 'https://amazon.com',
        'أمازون': 'https://amazon.com',
    };

    const lower = s.toLowerCase();

    // GOD MODE: Check if any label is CONTAINED in the string, prioritizing longer matches
    const allLabels = { ...labels, ...arLabels };
    const sortedKeys = Object.keys(allLabels).sort((a, b) => b.length - a.length);
    for (const key of sortedKeys) {
        if (lower.includes(key)) return allLabels[key];
    }

    // Fallback to extraction if not a sharp label
    let candidate = s
        .replace(/^(?:افتح\s+|open\s+|اذهب\s+الى\s+|visit\s+|انتقل\s+إلى\s+|انتقل\s+الى\s+|شغل\s+|شغل\s+موقع\s+|ادخل\s+|اذهب\s+)/i, '')
        .trim()
        .replace(/\s*(?:على\s+المتصفح|بالـ?متصفح|في\s+المتصفح|المتصفح|صفحة|صفحه|موقع|شاشة|الشاشة|متصفحك|المتصفح\s+الخاص\s+بك)\s*$/i, '')
        .trim();

    if (/^\//.test(candidate)) {
        try {
            if (baseUrl) return fixKnownHosts(new URL(candidate, baseUrl).toString());
        } catch { }
        return candidate;
    }

    const cleanCandidate = candidate.replace(/^\/\//, '');
    const looksDomain =
        /^(?:www\.)?[a-z0-9][a-z0-9-]{0,62}(?:\.[a-z0-9-]{1,63})+(?::\d+)?(?:\/[^\s"'<>]*)?$/i.test(cleanCandidate);

    if (looksDomain) return fixKnownHosts(`https://${cleanCandidate}`);

    return s;
}
