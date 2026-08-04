/**
 * THE SETTINGS JOE IS WILLING TO EDIT ABOUT ITSELF.
 *
 * The owner asked for a screen in the control panel that sets environment
 * variables instead of hand-editing api/.env — right, and necessary once Joe
 * is online where nobody has a file manager on the server.
 *
 * But a screen that writes the environment is a screen that steers the
 * process, so the whole design rests on one rule: A CLOSED LIST OF NAMES.
 * With a free-text key field, one line —
 *
 *     NODE_OPTIONS=--require C:\evil.js
 *
 * — is remote code execution on the next boot, and nothing in the UI would
 * look wrong while it happened. Every key below is one Joe actually reads;
 * anything else is refused by name.
 *
 * Each entry also carries the two things a settings screen usually lies
 * about:
 *   - `secret`: the value is never sent back to a browser. Ever. The panel
 *     shows «set» and the last four characters, nothing more.
 *   - `live`: whether Joe re-reads it per use (takes effect immediately) or
 *     read it once at boot (needs a restart, and the UI must SAY so rather
 *     than pretend).
 */

export type EnvKind = 'text' | 'secret' | 'boolean' | 'number' | 'url' | 'emails' | 'path' | 'choice';

export interface EnvSetting {
    key: string;
    group: 'ownership' | 'ai' | 'local-brain' | 'storage' | 'runtime';
    kind: EnvKind;
    /** Arabic, because the owner reads this screen. */
    label: string;
    hint: string;
    /** true when Joe reads process.env at call time — a save takes effect at once. */
    live: boolean;
    /** never returned to the browser */
    secret?: boolean;
    choices?: string[];
    placeholder?: string;
    /** an extra confirmation string the caller must send (destructive changes) */
    confirm?: string;
}

export const ENV_SETTINGS: EnvSetting[] = [
    // ── من يملك هذا التنصيب ────────────────────────────────────────────────
    {
        key: 'SUPER_ADMIN_EMAILS', group: 'ownership', kind: 'emails', live: true,
        label: 'بُرُد المالكين',
        hint: 'من يطابق بريده هذه القائمة يصير مالكاً متى سجّل — لا بترتيب التسجيل. مفصولة بفواصل.',
        placeholder: 'you@example.com, partner@example.com',
    },
    {
        key: 'ADMIN_EMAIL', group: 'ownership', kind: 'text', live: true,
        label: 'بريد المسؤول',
        hint: 'يُعامَل كأحد المالكين أيضاً، ويُستعمل في الدخول الاحتياطي حين تتعذّر القاعدة.',
    },
    {
        key: 'REGISTRATION_OPEN', group: 'ownership', kind: 'boolean', live: true,
        label: 'السماح بتسجيل مستخدمين جدد',
        hint: 'أغلقه بعد إنشاء حسابك إن كان جو لك وحدك. المالكون المعرَّفون يمرّون حتى وهو مغلق.',
    },
    {
        key: 'ENABLE_AUTH_BYPASS', group: 'ownership', kind: 'boolean', live: true,
        label: 'تجاوز المصادقة (تطوير فقط)',
        hint: 'يفتح النظام بلا تسجيل دخول. مرفوض تماماً حين تكون البيئة إنتاجاً.',
    },
    {
        key: 'JWT_SECRET', group: 'ownership', kind: 'secret', live: false, confirm: 'rotate-jwt',
        label: 'مفتاح توقيع الجلسات',
        hint: 'تغييره يُخرج كل الجلسات فوراً — ومنها جلستك أنت — ويحتاج إعادة تشغيل.',
    },

    // ── مفاتيح الذكاء ──────────────────────────────────────────────────────
    { key: 'GROQ_API_KEY', group: 'ai', kind: 'secret', live: true, label: 'مفتاح Groq', hint: 'الردود النهائية السريعة.' },
    { key: 'OPENAI_API_KEY', group: 'ai', kind: 'secret', live: true, label: 'مفتاح OpenAI', hint: 'يُستعمل أيضاً للنطق الصوتي في وضع الصوت.' },
    { key: 'OPENROUTER_API_KEY', group: 'ai', kind: 'secret', live: true, label: 'مفتاح OpenRouter', hint: 'بوابة إلى عدة نماذج بمفتاح واحد.' },
    { key: 'GOOGLE_API_KEY', group: 'ai', kind: 'secret', live: true, label: 'مفتاح Google/Gemini', hint: 'اختياري.' },
    { key: 'CEREBRAS_API_KEY', group: 'ai', kind: 'secret', live: true, label: 'مفتاح Cerebras', hint: 'مزوّد مجاني سريع جداً.' },
    { key: 'MISTRAL_API_KEY', group: 'ai', kind: 'secret', live: true, label: 'مفتاح Mistral', hint: 'اختياري.' },

    // ── الدماغ المحلّي ─────────────────────────────────────────────────────
    {
        key: 'LOCAL_LLM_BASE_URL', group: 'local-brain', kind: 'url', live: true,
        label: 'عنوان النموذج المحلّي', hint: 'مثل Ollama على جهازك: http://127.0.0.1:11434',
        placeholder: 'http://127.0.0.1:11434',
    },
    { key: 'LOCAL_LLM_MODEL', group: 'local-brain', kind: 'text', live: true, label: 'اسم النموذج المحلّي', hint: 'الاسم كما هو مسحوب عندك.' },
    { key: 'JOE_VISION_BASE_URL', group: 'local-brain', kind: 'url', live: true, label: 'عنوان نموذج الرؤية', hint: 'لتحليل الصور محلياً.' },
    { key: 'JOE_VISION_MODEL', group: 'local-brain', kind: 'text', live: true, label: 'اسم نموذج الرؤية', hint: '' },

    // ── التخزين ───────────────────────────────────────────────────────────
    {
        key: 'PERSISTENCE_MODE', group: 'storage', kind: 'choice', live: false, choices: ['JSON', 'MONGO'],
        label: 'طريقة التخزين', hint: 'JSON = ملفات على القرص (محلياً). MONGO = قاعدة بيانات. يحتاج إعادة تشغيل.',
    },
    { key: 'MONGO_URI', group: 'storage', kind: 'secret', live: false, label: 'رابط MongoDB', hint: 'يُقرأ عند الإقلاع فقط — غيّره ثم أعد التشغيل.' },
    { key: 'EXTERNAL_PROJECTS_DIR', group: 'storage', kind: 'path', live: true, label: 'مجلّد المشاريع', hint: 'حيث تُبنى مشاريعك وتظهر في مستكشف الملفات.' },
    { key: 'ARTIFACT_DIR', group: 'storage', kind: 'path', live: true, label: 'مجلّد المخرجات', hint: 'الصور واللقطات والملفات المولَّدة.' },
    { key: 'BACKUP_DIR', group: 'storage', kind: 'path', live: true, label: 'مجلّد النسخ الاحتياطية', hint: 'ما تعرضه بطاقة النسخ في اللوحة.' },

    // ── التشغيل ───────────────────────────────────────────────────────────
    { key: 'PORT', group: 'runtime', kind: 'number', live: false, label: 'المنفذ', hint: 'يُقرأ عند الإقلاع — غيّره ثم أعد التشغيل.' },
    { key: 'PUBLIC_URL', group: 'runtime', kind: 'url', live: true, label: 'العنوان العام', hint: 'رابط جو كما يراه الزوّار — يُستعمل في الروابط المرسَلة.' },
    { key: 'NODE_ENV', group: 'runtime', kind: 'choice', live: false, choices: ['development', 'production'], label: 'بيئة التشغيل', hint: 'production يُغلق تجاوز المصادقة ومسارات التطوير.' },
    { key: 'BROWSER_EXECUTABLE_PATH', group: 'runtime', kind: 'path', live: true, label: 'مسار المتصفّح', hint: 'اتركه فارغاً ليجد جو Chromium بنفسه.' },
    { key: 'OFFLINE_MODE', group: 'runtime', kind: 'boolean', live: true, label: 'الوضع دون اتصال', hint: 'يوقف كل ما يحتاج إنترنت.' },
    { key: 'TTS_BASE_URL', group: 'runtime', kind: 'url', live: true, label: 'خادم النطق المحلّي', hint: 'خادم متوافق مع OpenAI للنطق — يُستعمل قبل OpenAI.' },
];

export const ENV_BY_KEY = new Map(ENV_SETTINGS.map(s => [s.key, s]));

/** The only names this installation will ever write. */
export const isSettableEnvKey = (key: string): boolean => ENV_BY_KEY.has(String(key || '').trim());

/**
 * Validate a value for its declared kind. Returns null when fine, or an
 * Arabic reason. Newlines are refused everywhere: a value carrying `\n`
 * writes a SECOND assignment into .env — the classic injection through a
 * settings form.
 */
export function validateEnvValue(setting: EnvSetting, raw: string): string | null {
    const v = String(raw ?? '');
    if (/[\r\n]/.test(v)) return 'القيمة لا يمكن أن تحتوي سطراً جديداً.';
    if (v.length > 2000) return 'القيمة أطول من الحدّ المسموح (2000 محرف).';
    if (v === '') return null;                       // clearing a value is always allowed
    switch (setting.kind) {
        case 'boolean':
            return ['true', 'false'].includes(v) ? null : 'القيمة يجب أن تكون true أو false.';
        case 'number':
            return /^\d{1,6}$/.test(v) ? null : 'القيمة يجب أن تكون رقماً.';
        case 'url':
            return /^https?:\/\/[^\s]+$/i.test(v) ? null : 'العنوان يجب أن يبدأ بـ http:// أو https://';
        case 'emails':
            return v.split(',').every(e => /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(e.trim()))
                ? null : 'قائمة بُرُد صحيحة مفصولة بفواصل.';
        case 'choice':
            return (setting.choices || []).includes(v) ? null : `القيم المقبولة: ${(setting.choices || []).join(' أو ')}`;
        default:
            return null;
    }
}

/**
 * Is this a value the browser may never see?
 *
 * `kind: 'secret'` and a separate `secret: true` flag were two ways to say the
 * same thing, and the registry only ever set the FIRST — so every API key was
 * declared secret and served in the clear. The proof caught it on its first
 * run. One question, one answer, and `kind` is the answer.
 */
export const isSecretSetting = (s: EnvSetting): boolean => s.secret === true || s.kind === 'secret';

/** What the browser is allowed to know about a value it may not read. */
export function maskEnvValue(setting: EnvSetting, value: string | undefined): { set: boolean; preview: string } {
    const v = String(value ?? '');
    if (!v) return { set: false, preview: '' };
    if (!isSecretSetting(setting)) return { set: true, preview: v.length > 120 ? `${v.slice(0, 120)}…` : v };
    return { set: true, preview: `••••${v.slice(-4)}` };
}
