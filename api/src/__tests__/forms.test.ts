/**
 * Form validation and honest delivery.
 *
 * The content contract could already DETECT a form that only console.logs. But
 * detection is not enforcement — the repair went back to the same weak model
 * that wrote the problem — so a visitor still filled in a contact form, saw
 * «تم الإرسال بنجاح», and nothing was sent anywhere.
 *
 * The behaviour is verified in a real browser. What is checked here is the
 * promise that matters most: there is no branch in which this congratulates
 * anybody for a message that was not delivered.
 */

import { formBrief, formRuntime, formCss } from '../core/design/forms';

describe('the markup contract handed to the model', () => {
    const brief = formBrief();

    it('names the attributes the runtime looks for', () => {
        for (const a of ['data-joe-form', 'data-to']) expect(brief).toContain(a);
    });

    it('insists on real labels rather than placeholders', () => {
        expect(brief).toMatch(/a placeholder is not a label/i);
    });

    it('forbids the model writing its own success message', () => {
        expect(brief).toMatch(/Do NOT write submit handlers/i);
        expect(brief).toMatch(/success messages/i);
    });
});

describe('the runtime never claims a message was delivered', () => {
    const ar = formRuntime(true);
    const en = formRuntime(false);

    it.each([
        ['Arabic', () => ar, /تم الإرسال|أُرسلت رسالتك|شكرًا لرسالتك|نجح الإرسال/],
        ['English', () => en, /message sent|successfully sent|thanks for your message/i],
    ])('has no success wording in %s', (_l, rt, bad) => expect(rt()).not.toMatch(bad as RegExp));

    it('says the mail client was OPENED, not that the mail was sent', () => {
        expect(ar).toContain('فُتح برنامج البريد');
        expect(ar).toContain('اضغط «إرسال» فيه');
        expect(en).toMatch(/mail app was opened/i);
        expect(en).toMatch(/press send there/i);
    });

    it('states plainly when there is no endpoint that nothing was transmitted', () => {
        expect(ar).toContain('لم تُرسَل رسالتك إلى أي جهة');
        expect(en).toContain('NOT sent anywhere');
    });

    it('treats a placeholder address as no address at all', () => {
        // A form pointed at info@example.com would open a mail client addressed
        // to nobody while the page claimed it had done something useful.
        expect(ar).toContain('example');
        expect(ar).toContain('your-?email');
    });
});

describe('the runtime is a real, accessible validator', () => {
    const rt = formRuntime(true);

    it('takes over native validation instead of being blocked by it', () => {
        // A browser refuses to fire submit while a required field is empty, so
        // without this the whole handler never runs — which is exactly what the
        // first browser run showed: zero errors, no status, nothing.
        expect(rt).toContain("setAttribute('novalidate'");
        // …but the rules themselves are still the browser's, not ours.
        expect(rt).toContain('checkValidity()');
    });

    it('links each error to its field for a screen reader', () => {
        expect(rt).toContain("setAttribute('aria-invalid', 'true')");
        expect(rt).toContain('aria-describedby');
        expect(rt).toContain("setAttribute('role', 'alert')");
    });

    it('announces the summary in a live region', () => {
        expect(rt).toContain("setAttribute('aria-live', 'polite')");
        expect(rt).toContain("setAttribute('role', 'status')");
    });

    it('moves focus to the first field that needs fixing', () => {
        expect(rt).toContain('bad[0].focus()');
    });

    it('clears an error as soon as the visitor fixes it', () => {
        expect(rt).toContain("addEventListener('input'");
    });

    it('keeps what was typed instead of losing it', () => {
        expect(rt).toContain('joe-form-copy');
        expect(rt).toContain('clipboard');
    });

    it('is self-contained: no dependency, no network', () => {
        expect(rt.startsWith('<script>')).toBe(true);
        expect(rt).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|\bimport\s|\brequire\s*\(/);
        expect(rt).not.toMatch(/https?:\/\//);
    });
});

describe('the form styling', () => {
    const css = formCss();

    it('has balanced braces', () => {
        expect((css.match(/\{/g) || []).length).toBe((css.match(/\}/g) || []).length);
    });

    it('uses logical properties, so it is not mirrored in Arabic', () => {
        expect(css).toContain('margin-block-start');
        expect(css).not.toMatch(/margin-(left|right)\s*:/);
    });

    it('keeps the error colour readable in dark mode too', () => {
        expect(css).toContain('prefers-color-scheme:dark');
    });
});
