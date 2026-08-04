/**
 * WHAT A PUBLISHED SITE STILL POINTS AT.
 *
 * Publishing copies files to the open internet without ever reading them. A
 * page Joe built can carry an address that only resolves on the machine that
 * built it — the contact form's endpoint, a store's API base — and the result
 * is the quietest failure in the product:
 *
 *   the visitor fills in the form, presses send, sees nothing wrong, and the
 *   message goes to THEIR own computer, where nothing is listening.
 *
 * Nobody finds out. Not the visitor, not the owner. So publishing now reads
 * what it is about to publish and says, in the same breath as «نُشر», which
 * addresses will not work for anyone else and what to do about it.
 *
 * This is a warning, never a refusal: the user asked to publish, and publishing
 * is what happens. They are simply not left to discover it from silence.
 */
import fs from 'fs';
import path from 'path';

/** Hosts that exist only on the machine — or the private network — that built the page. */
const PRIVATE_HOST = new RegExp(
    'https?://(?:' +
    'localhost|' +
    '127\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}|' +
    '0\\.0\\.0\\.0|' +
    '10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}|' +
    '192\\.168\\.\\d{1,3}\\.\\d{1,3}|' +
    '172\\.(?:1[6-9]|2\\d|3[01])\\.\\d{1,3}\\.\\d{1,3}|' +
    '[a-z0-9-]+\\.local' +
    ')(?::\\d+)?[^\\s"\'<>()]*', 'gi');

const TEXTUAL = /\.(?:html?|css|js|mjs|cjs|json|txt|md|xml|svg|webmanifest)$/i;
const SKIP_DIR = /(?:^|[\\/])(?:node_modules|\.git|\.cache)(?:[\\/]|$)/;

export interface PrivateEndpoint { file: string; url: string }

/** Every address in a published tree that only the builder's machine can reach. */
export function findPrivateEndpoints(root: string, limit = 20): PrivateEndpoint[] {
    const found: PrivateEndpoint[] = [];
    const seen = new Set<string>();
    const walk = (dir: string) => {
        if (found.length >= limit) return;
        let entries: fs.Dirent[] = [];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            if (found.length >= limit) return;
            const p = path.join(dir, e.name);
            if (SKIP_DIR.test(p)) continue;
            if (e.isDirectory()) { walk(p); continue; }
            if (!TEXTUAL.test(e.name)) continue;
            let text = '';
            try { text = fs.readFileSync(p, 'utf-8'); } catch { continue; }
            for (const m of text.matchAll(PRIVATE_HOST)) {
                const url = m[0].replace(/[.,;]$/, '');
                const key = `${path.relative(root, p)}::${url}`;
                if (seen.has(key)) continue;
                seen.add(key);
                found.push({ file: path.relative(root, p) || e.name, url });
                if (found.length >= limit) return;
            }
        }
    };
    walk(root);
    return found;
}

/**
 * The note that rides along with a successful publish. Empty when there is
 * nothing to warn about — silence here means the site really is self-contained.
 */
export function privateEndpointWarning(root: string): string {
    const hits = findPrivateEndpoints(root);
    if (!hits.length) return '';
    const lines = hits.slice(0, 6).map(h => `  • \`${h.file}\` → ${h.url}`).join('\n');
    const more = hits.length > 6 ? `\n  • …و${hits.length - 6} موضعاً آخر` : '';
    return `\n\n⚠️ **عناوين لن تعمل عند الزوّار**\n`
        + `نُشرت الملفات كما هي، لكن فيها عناوين لا تُفتَح إلا من الجهاز الذي بناها:\n${lines}${more}\n`
        + `ما يعنيه ذلك: من يفتح الموقع من جهاز آخر سيرسل الطلب إلى **جهازه هو**، فلا يصل شيء — بلا رسالة خطأ.\n`
        + `الحل: اضبط «العنوان العام» (PUBLIC_URL) من الإعدادات إلى عنوانٍ يصله الناس، ثم أعد البناء والنشر. `
        + `وإن كان المقصود أن تعمل هذه الميزة محلياً فقط، فهي ستعمل ما دام جو يعمل ويمكن الوصول إليه.`;
}
