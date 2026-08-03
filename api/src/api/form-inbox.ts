/**
 * STAGE 4 OF THE WORLD-CLASS ROADMAP — live data: the FORM INBOX.
 *
 * Every form Joe ever shipped was honest about the same weakness: «لم يُوصَل
 * هذا النموذج بخادم بعد». Now there IS a server — Joe himself. Built pages
 * and scaffolded apps POST their submissions to Joe's own public endpoint;
 * the messages land here, on disk, bounded, and the user reads them in the
 * chat with «اعرض رسائل النموذج». On a PUBLISHED site (GitHub Pages, where
 * localhost is unreachable) the runtime falls back to the mailto/copy path
 * it always had — the honesty is kept, the capability is added.
 */
import fs from 'fs';
import path from 'path';

export interface FormSubmission {
    site: string;
    fields: Record<string, string>;
    page?: string;
    at: number;
}

const MAX_SUBMISSIONS = 500;

function storeDir(): string {
    return String(process.env.JOE_CHAT_STORE_DIR || '').trim()
        || path.join(process.cwd(), 'data', 'db');
}
const inboxFile = () => path.join(storeDir(), 'form-inbox.json');

function readAll(): FormSubmission[] {
    try {
        const v = JSON.parse(fs.readFileSync(inboxFile(), 'utf-8'));
        return Array.isArray(v) ? v : [];
    } catch { return []; }
}

/** Append one submission. Direct write — submissions are rare and precious. */
export function appendSubmission(site: string, fields: Record<string, string>, page?: string): FormSubmission {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(fields || {})) {
        const key = String(k).slice(0, 60);
        if (!key) continue;
        clean[key] = String(v ?? '').slice(0, 2000);
        if (Object.keys(clean).length >= 20) break;
    }
    const entry: FormSubmission = { site: String(site).slice(0, 80), fields: clean, page: page ? String(page).slice(0, 120) : undefined, at: Date.now() };
    const all = readAll();
    all.push(entry);
    fs.mkdirSync(storeDir(), { recursive: true });
    fs.writeFileSync(inboxFile(), JSON.stringify(all.slice(-MAX_SUBMISSIONS), null, 0), 'utf-8');
    return entry;
}

/** The submissions for a set of site ids, newest first. */
export function listSubmissions(sites: string[], limit = 20): FormSubmission[] {
    const want = new Set(sites.filter(Boolean));
    return readAll().filter(s => want.size === 0 || want.has(s.site)).slice(-limit).reverse();
}
