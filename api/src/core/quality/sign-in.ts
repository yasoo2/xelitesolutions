/**
 * ⛔ A SYSTEM BEHIND A SIGN-IN IS TESTED SIGNED IN, THROUGH ITS OWN FORM.
 *
 * The hard exam, 2026-11-05, H01: «Build a complete clinic management system
 * … logins with three roles … search and filters …». The clinic opened on its
 * sign-in page, as it should. Joe's live filter probe operated that page —
 *
 *     filtering: on the live page I operated 9 control(s) — «Username»
 *     (text), «English» (button), «العربية» (button) … — and the data shown
 *     never changed
 *
 * — a username box and a language switch, never the patients list behind
 * them. The builder said so itself, five times: «the checker's probe runs on
 * the login page, which has no data to filter», and stopped. Fifty-five
 * minutes, and a working clinic refused.
 *
 * Every serious system has a sign-in, and a check that cannot pass one
 * measures only the door. The builder seeds the accounts, so it gives one to
 * task_finish (`sign_in`); Joe signs in with it the way a user does — the
 * product's own form, its own button — and tests the screens behind it. The
 * account is not a claim about the work: a wrong one fails to sign in, and
 * that failure is said, never passed.
 */

export interface SignInAccount {
    /** What the form's first field takes: a username, an email or a phone number. */
    identity: string;
    password: string;
}

export type SignInResult =
    | { ok: true; already?: boolean }
    | { ok: false; why: string };

/** `sign_in` as task_finish gives it: {username|email|identity, password}; null when it is not an account. */
export function parseSignInAccount(raw: unknown): SignInAccount | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const a = raw as Record<string, unknown>;
    const identity = String(a.username ?? a.email ?? a.identity ?? a.user ?? a.login ?? '').trim();
    const password = String(a.password ?? '');
    if (!identity || !password || identity.length > 200 || password.length > 200) return null;
    return { identity, password };
}

const SIGN_IN_LABEL = /^(?:sign\s*in|log\s*in|login|تسجيل\s*الدخول|دخول|ادخل|أدخل)$/iu;

/**
 * Marks the page's sign-in form: its password field, the field before it that
 * takes the identity, and its submit button. Runs in the page.
 */
const MARK_FORM = `(() => {
    const visible = (el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    document.querySelectorAll('[data-joe-signin]').forEach(el => el.removeAttribute('data-joe-signin'));
    const password = [...document.querySelectorAll('input[type="password"]')].find(visible);
    if (!password) return { found: false };
    const scope = password.closest('form') || document;
    const fields = [...scope.querySelectorAll('input')].filter(el => visible(el)
        && /^(?:|text|email|tel|search)$/i.test(el.getAttribute('type') || '')
        && !el.disabled && !el.readOnly);
    const before = fields.filter(el => el.compareDocumentPosition(password) & Node.DOCUMENT_POSITION_FOLLOWING);
    const named = (el) => /user|email|mail|login|identi|phone|mobile|account|name/i.test([el.name, el.id, el.getAttribute('autocomplete'), el.getAttribute('placeholder'), el.getAttribute('aria-label')].join(' '));
    const identity = before.filter(named).pop() || before.pop() || fields.find(named);
    if (!identity) return { found: false, why: 'the sign-in form has a password field and no field before it for the account' };
    password.setAttribute('data-joe-signin', 'password');
    identity.setAttribute('data-joe-signin', 'identity');
    const buttons = [...scope.querySelectorAll('button, input[type="submit"]')].filter(visible);
    const submit = buttons.find(b => (b.getAttribute('type') || (b.tagName === 'BUTTON' ? 'submit' : '')).toLowerCase() === 'submit');
    if (submit) submit.setAttribute('data-joe-signin', 'submit');
    return { found: true };
})()`;

/** The visible words of the page's error or alert, when the form stays: what the product said. */
const READ_REFUSAL = `(() => {
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const said = [...document.querySelectorAll('[role="alert"], .error, .alert, .notice, .toast, [aria-live]')]
        .filter(visible).map(el => (el.innerText || '').trim()).filter(Boolean);
    return said.join(' · ').slice(0, 200);
})()`;

const SIGNED_OUT_CONTROL = /^(?:sign\s*out|log\s*out|logout|تسجيل\s*الخروج|خروج)$/iu;

async function hasSignOutControl(page: any): Promise<boolean> {
    return page.evaluate((source: string) => {
        const re = new RegExp(source, 'iu');
        return [...document.querySelectorAll('button, a, [role="button"]')].some((el: any) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && re.test(String(el.textContent || '').trim());
        });
    }, SIGNED_OUT_CONTROL.source).catch(() => false);
}

/** Whether the page shows a sign-in form (a visible password field) right now. */
export async function showsSignInForm(page: any): Promise<boolean> {
    return page.evaluate(() => [...document.querySelectorAll('input[type="password"]')].some((el: any) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    })).catch(() => false);
}

/**
 * Signs in through the page's own sign-in form: the account typed into its
 * fields, its own button pressed (Enter when it has none), and the form gone
 * afterwards. A page already signed in (a sign-out control, no password field)
 * is left as it is. A page whose sign-in sits behind a «Sign in» door has the
 * door opened first.
 */
export async function signInThroughPage(page: any, account: SignInAccount, opts: { timeoutMs?: number } = {}): Promise<SignInResult> {
    const timeoutMs = Math.max(2_000, opts.timeoutMs ?? 12_000);
    let marked: { found: boolean; why?: string } = await page.evaluate(MARK_FORM).catch(() => ({ found: false }));
    if (!marked.found && !marked.why) {
        if (await hasSignOutControl(page)) return { ok: true, already: true };
        const door = page.locator('button, a, [role="button"]').filter({ hasText: SIGN_IN_LABEL }).first();
        if (await door.isVisible().catch(() => false)) {
            await door.click({ timeout: 3_000 }).catch(() => { });
            await page.waitForTimeout(800).catch(() => { });
            marked = await page.evaluate(MARK_FORM).catch(() => ({ found: false }));
        }
    }
    if (!marked.found) return { ok: false, why: marked.why || 'the page shows no sign-in form (no password field), and no «Sign in» control opens one' };
    try {
        await page.locator('[data-joe-signin="identity"]').first().fill(account.identity, { timeout: 3_000 });
        await page.locator('[data-joe-signin="password"]').first().fill(account.password, { timeout: 3_000 });
    } catch (e: any) {
        return { ok: false, why: `the sign-in form's fields could not be filled: ${String(e?.message || e).split('\n')[0].slice(0, 120)}` };
    }
    const submit = page.locator('[data-joe-signin="submit"]').first();
    if (await submit.count().catch(() => 0)) await submit.click({ timeout: 3_000 }).catch(() => { });
    else await page.locator('[data-joe-signin="password"]').first().press('Enter').catch(() => { });
    //  Signed in is no sign-in form left on the page: a form drawn again with
    //  its error (a new password field in place of the old) is a refusal.
    const gone = await page.waitForFunction(() => ![...document.querySelectorAll('input[type="password"]')].some((el: any) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    }), undefined, { timeout: timeoutMs }).then(() => true).catch(() => false);
    if (!gone) {
        const said = String(await page.evaluate(READ_REFUSAL).catch(() => '') || '');
        return { ok: false, why: `the product kept its sign-in form after the account was entered${said ? `, and said «${said}»` : ''}` };
    }
    await page.waitForLoadState?.('networkidle', { timeout: 3_000 }).catch(() => { });
    await page.waitForTimeout(400).catch(() => { });
    return { ok: true };
}
