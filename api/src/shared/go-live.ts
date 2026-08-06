/**
 * THE NOTE THAT REMEMBERS ITSELF — «قم بتذكيري فيها عندما نقرر ان نخرج جو للعامه».
 *
 * A reminder that lives in someone's memory is not a control. Joe runs today
 * with ENABLE_AUTH_BYPASS=true, which is correct for one person on one machine:
 * every tool call is trusted because there is only one caller. The moment the
 * same process answers somebody else, that setting means every visitor holds
 * every permission — and the person switching it on is exactly the person too
 * busy to remember a note written days earlier.
 *
 * So the note is machinery. It looks at the two facts that decide whether Joe
 * is public — a PUBLIC_URL that is not localhost, or an explicit
 * JOE_PUBLIC=1 — and speaks up when they disagree with the safety switches.
 * On a private machine it says nothing at all.
 */
export interface GoLiveVerdict {
    /** Is this process configured as if strangers can reach it? */
    public: boolean;
    /** Settings that are fine alone and dangerous together with «public». */
    blockers: string[];
    /** Worth doing before opening the door, but not dangerous on its own. */
    advice: string[];
}

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?$/i;

/** A URL that names a real host is the clearest evidence Joe is being shared. */
export function looksPublic(env: NodeJS.ProcessEnv = process.env): boolean {
    if (String(env.JOE_PUBLIC || '').trim() === '1') return true;
    const url = String(env.PUBLIC_URL || '').trim();
    if (!url) return false;
    try {
        const host = new URL(url).host;
        return !LOCAL_HOST.test(host);
    } catch {
        return false;
    }
}

export function goLiveCheck(env: NodeJS.ProcessEnv = process.env): GoLiveVerdict {
    const isPublic = looksPublic(env);
    const blockers: string[] = [];
    const advice: string[] = [];

    if (String(env.ENABLE_AUTH_BYPASS || '').toLowerCase() === 'true') {
        blockers.push('ENABLE_AUTH_BYPASS=true — كل زائر يملك كل الصلاحيات. اجعلها false.');
    }
    if (String(env.AUTO_APPROVE_ALL || '') === '1') {
        blockers.push('AUTO_APPROVE_ALL=1 — الأدوات عالية الخطورة تُنفَّذ بلا موافقة. أزلها.');
    }
    if (!String(env.SUPER_ADMIN_EMAILS || '').trim()) {
        blockers.push('SUPER_ADMIN_EMAILS فارغة — لا مالك معرّف للنظام. ضع بريدك في api/.env.');
    }
    if (!String(env.JWT_SECRET || '').trim() || String(env.JWT_SECRET).length < 24) {
        blockers.push('JWT_SECRET قصير أو غائب — اجعله سرّاً عشوائياً طويلاً.');
    }
    if (String(env.ENABLE_STARTUP_AUTO_INDEXING || '') === 'true') {
        advice.push('الفهرسة التلقائية عند الإقلاع تقرأ الشيفرة كلها — أطفئها على خادم عام.');
    }
    if (String(env.USE_USER_BROWSER_PROFILE || '') === '1') {
        advice.push('متصفّحك الشخصي كمسار افتراضي يعني أن جو يتصفّح بحساباتك أنت — على خادم عام اجعلها 0.');
    }
    return { public: isPublic, blockers, advice };
}

/** The banner: loud when it matters, silent when it does not. */
export function goLiveBanner(v: GoLiveVerdict): string {
    // A public server with nothing wrong deserves silence, not an alarm with an
    // empty list under it — the fastest way to teach someone to ignore alarms.
    if (!v.blockers.length) return '';
    if (!v.public) {
        // Not public: this is the reminder he asked for, kept to one line.
        return `ℹ️ جو يعمل محلياً بمفاتيح المستخدم الواحد. قبل إخراجه للعامة راجع ${v.blockers.length} إعداداً — شغّل: npm run go-live-check`;
    }
    const lines = [
        '',
        '════════════════════════════════════════════════════════════',
        '⛔ جو مضبوط كخادم عام — وهذه الإعدادات لا تصلح لذلك:',
        ...v.blockers.map(b => `   • ${b}`),
        ...(v.advice.length ? ['', 'ويُستحسن أيضاً:', ...v.advice.map(a => `   • ${a}`)] : []),
        '',
        'أوقف الخدمة، صحّح ما سبق، ثم أعد التشغيل.',
        '════════════════════════════════════════════════════════════',
        '',
    ];
    return lines.join('\n');
}

/**
 * Called at boot. Prints the banner, and — when Joe is declared public with
 * blockers still in place — refuses to start unless the operator has said, in
 * so many words, that they accept it. A warning nobody must acknowledge is a
 * warning that scrolls past.
 */
export function assertSafeToServe(env: NodeJS.ProcessEnv = process.env, exit: (code: number) => void = (c) => process.exit(c)): GoLiveVerdict {
    const v = goLiveCheck(env);
    const banner = goLiveBanner(v);
    if (banner) console.warn(banner);
    if (v.public && v.blockers.length && String(env.JOE_ALLOW_UNSAFE_PUBLIC || '') !== '1') {
        console.error('⛔ رفضتُ التشغيل كخادم عام بهذه الإعدادات. (للتجاوز عمداً: JOE_ALLOW_UNSAFE_PUBLIC=1)');
        exit(1);
    }
    return v;
}
