/**
 * BUSINESS MEMORY — Joe remembers who you are, and every build knows it.
 *
 * The oldest honest defect class in page builders: contact sections shipping
 * info@example.com and 059999999 because the tool knew nothing real. Joe
 * already refuses to FABRICATE contact data; this closes the other half —
 * the user tells Joe their real details ONCE («احفظ بيانات عملي: الجوال
 * 05xxxxxxxx») and every site, store, restaurant and API built afterwards
 * carries them, real links and all.
 *
 * Disk-persisted like everything Joe remembers (survives update-joe
 * restarts). Stored per session with a 'default' fallback: most users are
 * one business — saving once serves every future session.
 */
import fs from 'fs';
import path from 'path';

export interface BusinessProfile {
    brand?: string;
    phone?: string;
    whatsapp?: string;
    email?: string;
    instagram?: string;
    twitter?: string;
    address?: string;
    hours?: string;
    updatedAt?: number;
}

const FIELDS = ['brand', 'phone', 'whatsapp', 'email', 'instagram', 'twitter', 'address', 'hours'] as const;
type Field = typeof FIELDS[number];

const storeDir = () => process.env.JOE_CHAT_STORE_DIR || path.join(process.cwd(), 'data', 'db');
const storeFile = () => path.join(storeDir(), 'business-profile.json');
const keyOf = (sessionId: any) => String(sessionId || 'default').replace(/[^a-zA-Z0-9._-]/g, '_');

function loadAll(): Record<string, BusinessProfile> {
    try { return JSON.parse(fs.readFileSync(storeFile(), 'utf-8')); } catch { return {}; }
}

function saveAll(all: Record<string, BusinessProfile>): void {
    fs.mkdirSync(storeDir(), { recursive: true });
    fs.writeFileSync(storeFile(), JSON.stringify(all, null, 2));
}

/** The profile this session builds with — its own, else the shared default. */
export function getProfile(sessionId?: any): BusinessProfile | null {
    const all = loadAll();
    const own = all[keyOf(sessionId)];
    const fallback = all['default'];
    const p = own && Object.keys(own).some(k => k !== 'updatedAt') ? own : fallback;
    return p && FIELDS.some(f => p[f]) ? p : null;
}

/** Merge new fields in (empty string deletes a field) — saved to BOTH the
 *  session's slot and the shared default, so one save serves every session. */
export function setProfile(sessionId: any, patch: BusinessProfile): BusinessProfile {
    const all = loadAll();
    for (const slot of [keyOf(sessionId), 'default']) {
        const cur = all[slot] || {};
        for (const f of FIELDS) {
            const v = patch[f];
            if (v === undefined) continue;
            if (String(v).trim() === '') delete cur[f];
            else cur[f] = String(v).trim().slice(0, 200);
        }
        cur.updatedAt = Date.now();
        all[slot] = cur;
    }
    saveAll(all);
    return all[keyOf(sessionId)];
}

export function clearProfile(sessionId: any): void {
    const all = loadAll();
    delete all[keyOf(sessionId)];
    delete all['default'];
    saveAll(all);
}

/**
 * Deterministic parser for «احفظ بيانات عملي: الاسم مطعم الريف، الجوال
 * 0501234567، انستغرام reef_rest» — Arabic and English labels, ،/,/·/\n
 * separated. No model reads your phone number.
 */
export function parseProfileText(text: string): BusinessProfile {
    const out: BusinessProfile = {};
    const labels: Array<[Field, RegExp]> = [
        ['brand', /(الاسم|اسم\s*(العمل|المشروع|المتجر|المطعم)?|العلامة|brand|name)/i],
        ['whatsapp', /(واتس\s*اب|واتساب|الواتس|whatsapp)/i],
        ['phone', /(الجوال|جوال|الهاتف|هاتف|رقم|التلفون|تلفون|phone|mobile|tel)/i],
        ['email', /(البريد|بريد|الإيميل|ايميل|إيميل|email|mail)/i],
        ['instagram', /(انستغرام|انستقرام|إنستغرام|الانستا|انستا|instagram|insta)/i],
        ['twitter', /(تويتر|اكس\b|twitter|\bx\b)/i],
        ['address', /(العنوان|عنوان|الموقع الجغرافي|address|location)/i],
        ['hours', /(الدوام|ساعات|أوقات\s*العمل|hours)/i],
    ];
    /**
     * ARABIC GLUES ITS «و» TO THE NEXT WORD, AND HE WRITES WITH IT.
     *
     * The splitter knew commas and newlines. He wrote one sentence joined by
     * waw — «اسم المطعم دار الرفق والهاتف 0501234567 والعنوان …» — so nothing
     * split, the `brand` label matched first, and the name it saved was
     *
     *     «دار الرفق» والهاتف 0501234567 والعنوان…
     *
     * Measured downstream: that string became the project folder, the page
     * <title> and the hero of every build — `react-دار-الرفق-والهاتف-0501234567-وال`.
     * One missing separator corrupted his business name everywhere it is used.
     *
     * The repo already solved this shape once, in declared-tables: «space +
     * waw + an Arabic letter», never `\bو`, because `\b` is defined by `\w`.
     * Here it is narrowed further — the waw splits only where a LABEL follows
     * it, so a brand that legitimately contains «و» («سعد وأحمد») survives.
     */
    const LABEL_AHEAD = '(?:ال)?(?:اسم|علامة|واتس|جوال|هاتف|رقم|تلفون|بريد|ايميل|إيميل|انستغرام|انستقرام|إنستغرام|انستا|تويتر|عنوان|دوام|ساعات|أوقات)';
    const parts = String(text || '')
        .replace(/^[^:：]*[:：]/, '')                     // drop the «احفظ بيانات عملي:» head
        .split(new RegExp(`[،,·\n;]+|\\s+و(?=${LABEL_AHEAD})|\\s+and\\s+(?=[A-Za-z])`, 'i'))
        .map(s => s.trim()).filter(Boolean);
    for (const part of parts) {
        for (const [field, re] of labels) {
            const m = part.match(re);
            if (!m) continue;
            const value = part.slice((m.index || 0) + m[0].length).replace(/^[\s:：=هو-]+/, '').trim();
            if (value && !out[field]) out[field] = value.slice(0, 200);
            break;                                        // one label per fragment — first match wins
        }
    }
    // A bare email or Saudi phone with no label still lands where it belongs.
    for (const part of parts) {
        if (!out.email && /^[\w.+-]+@[\w-]+\.[\w.]+$/.test(part)) out.email = part;
        if (!out.phone && /^(\+?9665|05)\d{8}$/.test(part.replace(/[\s-]/g, ''))) out.phone = part.replace(/[\s-]/g, '');
    }
    return out;
}

/** The saved profile, formatted for the chat — honest about what is absent. */
export function formatProfile(p: BusinessProfile | null): string {
    if (!p) return '📇 لا توجد بيانات عمل محفوظة بعد.\nقل: «احفظ بيانات عملي: الاسم …، الجوال …، البريد …، انستغرام …»';
    const label: Record<string, string> = {
        brand: 'الاسم', phone: 'الجوال', whatsapp: 'واتساب', email: 'البريد',
        instagram: 'انستغرام', twitter: 'تويتر/X', address: 'العنوان', hours: 'الدوام',
    };
    const lines = FIELDS.filter(f => p[f]).map(f => `   • ${label[f]}: ${p[f]}`);
    return `📇 بيانات عملك المحفوظة — تُحقن تلقائياً في كل بناء قادم:\n${lines.join('\n')}\n\n✏️ للتعديل أعد الحفظ بقيم جديدة · «امسح بيانات عملي» للحذف`;
}
