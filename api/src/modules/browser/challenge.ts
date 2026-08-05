/**
 * «عاده ما يتوقف المتصفح اثبت انه انت بشري وليس روبوت».
 *
 * A screenshot of https://www.google.com/sorry/index — Google's anti-abuse
 * interstitial — with the agent stopped dead in front of it.
 *
 * THE HONEST ANSWER, AND WHY IT IS ALSO THE BETTER ONE.
 *
 * A checkbox that asks whether you are a person is an access control. Joe does
 * not defeat it: no solver service, no fingerprint spoofing, no pretending to
 * be a human being. That is not squeamishness — it is engineering. Every
 * bypass is a bet against a company whose whole job is winning that bet, and
 * it breaks again next week, silently, in the middle of his work.
 *
 * What actually removes the problem is two things, and both are here:
 *
 *   1. STOP PROVOKING IT. Joe was driving google.com/search — a page built for
 *      a human with a mouse — from an automated browser, in six places. That
 *      is precisely what /sorry/ exists to answer. Automated searching moves
 *      to an endpoint that welcomes it; Google stays for when HE is driving.
 *
 *   2. WHEN ONE APPEARS ANYWAY, HAND IT TO THE HUMAN AND WAIT. The panel
 *      already has «Control enabled ✓ — you now control the browser». What was
 *      missing is that Joe never noticed the wall, never asked, and never
 *      resumed. Now it detects the challenge, says so in his own language,
 *      gives him the controls, watches the page, and carries on the same task
 *      the moment he has cleared it. Ten seconds of his time instead of a dead
 *      run — and it works on Google, Cloudflare, hCaptcha and whatever comes
 *      next, because a person really is on the other side.
 */
import { broadcastBrowserEvent } from './wsHub';

export type ChallengeKind = 'google_sorry' | 'recaptcha' | 'hcaptcha' | 'cloudflare' | 'unusual_traffic';

export interface Challenge {
    kind: ChallengeKind;
    /** What to tell the user, in Arabic — it is his browser and his decision. */
    message: string;
    url: string;
}

const BY_URL: Array<[RegExp, ChallengeKind, string]> = [
    [/\/sorry\/index|\/sorry\/image/i, 'google_sorry', 'جوجل يطلب إثبات أنك إنسان قبل المتابعة.'],
    [/hcaptcha\.com\/(challenge|captcha)/i, 'hcaptcha', 'الموقع يطلب حلّ اختبار hCaptcha.'],
    [/__cf_chl|cdn-cgi\/challenge-platform/i, 'cloudflare', 'Cloudflare يفحص متصفحك قبل السماح بالدخول.'],
];

/**
 * Is this page a human check? Asked of the URL first (free and certain), then
 * of the DOM — and deliberately narrow: a page that merely EMBEDS a reCAPTCHA
 * widget in a form is not blocking anybody, and stopping on those would turn a
 * rescue into a nuisance.
 */
export async function detectChallenge(page: any): Promise<Challenge | null> {
    let url = '';
    try { url = String(page.url() || ''); } catch { return null; }
    for (const [re, kind, message] of BY_URL) {
        if (re.test(url)) return { kind, message, url };
    }
    try {
        const found = await page.evaluate(() => {
            const text = (document.body?.innerText || '').slice(0, 4000);
            // The wording these walls use, in the languages they use it in.
            if (/unusual traffic|حركة مرور غير عادية|حركة مرور غير معتادة/i.test(text)) return 'unusual_traffic';
            if (/verify you are human|checking your browser|التحقق من أنك إنسان|جارٍ التحقق من متصفحك/i.test(text)) return 'cloudflare';
            // A reCAPTCHA is a WALL only when it is essentially the whole page:
            // a widget inside a long form is a normal part of that form.
            const box = document.querySelector('iframe[src*="recaptcha"], #recaptcha, .g-recaptcha');
            if (box && text.replace(/\s+/g, ' ').trim().length < 1200) return 'recaptcha';
            return '';
        });
        if (found === 'unusual_traffic') return { kind: 'unusual_traffic', message: 'الموقع يشتبه بحركة آلية ويطلب إثبات أنك إنسان.', url };
        if (found === 'cloudflare') return { kind: 'cloudflare', message: 'الموقع يفحص متصفحك قبل السماح بالدخول.', url };
        if (found === 'recaptcha') return { kind: 'recaptcha', message: 'الصفحة تطلب حلّ اختبار reCAPTCHA للمتابعة.', url };
    } catch { /* mid-navigation, or a page that refuses evaluation */ }
    return null;
}

export interface HandoffResult {
    cleared: boolean;
    waitedMs: number;
    kind: ChallengeKind;
}

/**
 * HAND THE WHEEL OVER, AND KEEP WATCHING.
 *
 * The panel is told exactly what is in the way and that control is his; then
 * this polls the page until the wall is gone. It returns the moment he clears
 * it, so the task he asked for continues from where it stopped instead of
 * dying at a checkbox.
 */
export async function waitForHumanToClear(
    page: any,
    challenge: Challenge,
    opts: { sessionId: string; timeoutMs?: number; onNote?: (m: string) => void } = { sessionId: '' },
): Promise<HandoffResult> {
    const timeoutMs = opts.timeoutMs ?? 3 * 60_000;
    const startedAt = Date.now();

    const say = (message: string, done = false) => {
        try {
            broadcastBrowserEvent(opts.sessionId, {
                type: 'browser_challenge', ts: Date.now(),
                kind: challenge.kind, url: challenge.url, message, done,
                // The panel already knows how to grant control; this asks for it.
                takeControl: !done,
            } as any);
        } catch { /* the panel is optional — the wait is not */ }
        opts.onNote?.(message);
    };

    say(`🙋 ${challenge.message} تحكّم بالمتصفح في اللوحة وأكمِل التحقّق — سأتابع من حيث توقّفت فور انتهائك.`);

    while (Date.now() - startedAt < timeoutMs) {
        await new Promise(r => setTimeout(r, 1500));
        let still: Challenge | null = null;
        try { still = await detectChallenge(page); } catch { still = null; }
        if (!still) {
            const waitedMs = Date.now() - startedAt;
            say(`✅ تجاوزنا التحقّق — أتابع المهمة الآن (${Math.round(waitedMs / 1000)} ثانية).`, true);
            return { cleared: true, waitedMs, kind: challenge.kind };
        }
    }

    const waitedMs = Date.now() - startedAt;
    say('⌛ انتهت مهلة الانتظار دون تجاوز التحقّق — توقّفت بدل الادّعاء بأنني أكملت.', true);
    return { cleared: false, waitedMs, kind: challenge.kind };
}

/**
 * A SEARCH ENGINE THAT DOES NOT ASK WHETHER A ROBOT IS DRIVING.
 *
 * Joe pointed its automated browser at google.com/search in six places. That
 * page is written for a person, and Google answers automation with /sorry/ —
 * correctly, and increasingly. DuckDuckGo publishes an HTML endpoint meant to
 * be read by programs, which is why the wall stops appearing in the first
 * place. This is the address the AGENT uses; a human typing «افتح جوجل» still
 * gets Google, because a human on the keyboard is exactly what Google wants.
 *
 * Override with JOE_SEARCH_URL when an operator has their own endpoint.
 */
export function agentSearchUrl(query: string): string {
    const q = encodeURIComponent(String(query || '').trim());
    const template = String(process.env.JOE_SEARCH_URL || '').trim();
    if (template) return template.includes('{q}') ? template.replace('{q}', q) : `${template}${q}`;
    return `https://duckduckgo.com/html/?q=${q}`;
}
