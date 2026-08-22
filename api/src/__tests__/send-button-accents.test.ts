/**
 * THE BUTTON THE USER CHOSE, AND A COLOUR PER MODE.
 *
 * From ten live mockups the user picked #2 «حلقة التقدّم»: a 30px circle
 * that IS the progress indicator while Joe works — replacing a 38px slab
 * with a static black square. And in his words: «تحت كل وضع عدة ألوان
 * لتغيّر لون الثيم» — Settings offers an accent palette under EACH theme
 * mode, stored independently, applied live.
 *
 * These locks read the web sources; the behaviour itself is proven by the
 * Playwright wire harness (verify_send_button_accents.ts, 15/15 on the
 * real app). Terminal-search contrast is intentionally verified only by
 * that live harness, because contrast is a rendered property, not a source
 * spelling to lock in this Node test.
 */
import fs from 'fs';
import path from 'path';

const web = (...p: string[]) =>
    fs.readFileSync(path.join(__dirname, '..', '..', '..', 'web', 'src', ...p), 'utf-8');

describe('the send button is the progress ring, not a slab', () => {
    const css = () => web('styles', 'joe-premium.css');

    it('is a 30px circle — the 38px block is gone from the composer', () => {
        const c = css();
        const block = c.slice(c.indexOf('.joe-chat-input-area .send-btn {'));
        expect(block).toContain('width: 30px !important');
        expect(block).toContain('border-radius: 50% !important');
        // The old size must not survive anywhere in the desktop rule.
        expect(block.slice(0, 600)).not.toContain('38px');
    });

    it('busy = transparent fill + track ring + spinning arc, all accent-driven', () => {
        const c = css();
        expect(c).toContain('.joe-chat-input-area .send-btn.is-busy');
        expect(c).toMatch(/is-busy \{\s*\n\s*background: transparent !important/);
        expect(c).toContain('border-top-color: var(--joe-gold-primary');
        expect(c).toContain('animation: joe-send-spin 1s linear infinite');
        // Reduced motion stops the arc, honestly.
        expect(c).toMatch(/prefers-reduced-motion[\s\S]{0,200}joe-send-spin|prefers-reduced-motion[\s\S]{0,200}animation: none/);
    });

    it('the icon ink rides --joe-on-accent so every accent stays readable', () => {
        expect(css()).toContain('color: var(--joe-on-accent');
        expect(web('styles', 'accents.css')).toContain('--joe-on-accent');
    });

    it('the composer renders ONLY the stop square while busy — the ring is CSS', () => {
        const src = web('components', 'CommandComposer.tsx');
        expect(src).not.toContain('btn-thinking-pulse');
        expect(src).toMatch(/<Square size=\{10\} fill="currentColor" \/>/);
    });
});

describe('accents — one palette per theme mode', () => {
    it('five accents exist, each defined for BOTH modes', () => {
        const css = web('styles', 'accents.css');
        for (const id of ['gold', 'turquoise', 'mono', 'ice']) {
            expect(css).toContain(`html[data-accent="${id}"]:not([data-theme="light"])`);
            expect(css).toContain(`html[data-theme="light"][data-accent="${id}"]`);
        }
        const ts = web('accents.ts');
        for (const id of ['emerald', 'gold', 'turquoise', 'mono', 'ice']) {
            expect(ts).toContain(`'${id}'`);
        }
    });

    it('light rules also target .joe-ide-layout — the element that owns the light tokens', () => {
        // Measured live: a custom property declared ON .joe-ide-layout beats
        // anything inherited from <html>, so the ice accent silently lost
        // until the light rules were scoped to the layout element too.
        const css = web('styles', 'accents.css');
        expect(css).toContain('html[data-theme="light"][data-accent="ice"] .joe-ide-layout');
    });

    it('each mode remembers its OWN choice (separate storage keys)', () => {
        const ts = web('accents.ts');
        expect(ts).toContain("joe-accent-dark");
        expect(ts).toContain("joe-accent-light");
        // Emerald is the default and clears the attribute entirely.
        expect(ts).toContain("removeAttribute('data-accent')");
    });

    it('the theme effect applies the accent the moment the mode flips', () => {
        const joe = web('pages', 'Joe.tsx');
        expect(joe).toContain("import { applyAccent } from '../accents'");
        expect(joe).toMatch(/setAttribute\('data-theme', theme\);[\s\S]{0,200}applyAccent\(theme\)/);
    });

    it('Settings shows a swatch row under EACH mode, wired to the store', () => {
        const dlg = web('components', 'SettingsDialog.tsx');
        expect(dlg).toContain("import { ACCENTS, getAccent, setAccent");
        expect(dlg).toMatch(/\(\['dark', 'light'\] as ThemeMode\[\]\)\.map/);
        expect(dlg).toContain('data-accent-id={`${mode}-${a.id}`}');
        expect(dlg).toContain('pickAccent(mode, a.id)');
    });
});


describe('accent button ink guard — contrast follows the rendered surface', () => {
    const styleBlockFrom = (src: string, marker: string) => {
        const start = src.indexOf(marker);
        if (start < 0) throw new Error(`missing style marker: ${marker}`);
        const end = src.indexOf('}}', start);
        return src.slice(start, end < 0 ? src.length : end);
    };

    const hasWhiteInkOnUnstableBackground = (block: string) => {
        const hasUnstableBackground = /background\s*:\s*(?:[^;}]*(?:var\(--accent-[^)]+\)|transparent|rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.\d+\s*\)))/i.test(block);
        const hasLiteralWhiteInk = /color\s*:\s*['"]#(?:fff|ffffff)['"]/i.test(block);
        return hasUnstableBackground && hasLiteralWhiteInk;
    };

    it('guards accent and transparent surfaces, while opaque status colors stay allowed', () => {
        expect(hasWhiteInkOnUnstableBackground("background: var(--accent-primary); color: '#fff';")).toBe(true);
        expect(hasWhiteInkOnUnstableBackground("background: rgba(255,255,255,0.08); color: '#ffffff';")).toBe(true);
        expect(hasWhiteInkOnUnstableBackground("background: #22c55e; color: '#fff';")).toBe(false);
    });

    it('both approved variable-background buttons use the on-accent token', () => {
        const src = web('components', 'CommandComposer.tsx');
        const primary = styleBlockFrom(src, 'background: providers[selectedProvider].isConnected');
        const secondary = styleBlockFrom(src, 'background: (browserCredBusy || !browserCredValue.trim())');

        expect(primary).toContain("color: 'var(--joe-on-accent, #fff)'");
        expect(secondary).toContain("color: 'var(--joe-on-accent, #fff)'");
        expect(primary).not.toMatch(/color\s*:\s*['"]#(?:fff|ffffff)['"]/i);
        expect(secondary).not.toMatch(/color\s*:\s*['"]#(?:fff|ffffff)['"]/i);

        // The two opaque status branches are deliberately unchanged.
        expect(primary).toContain("? '#22c55e'");
        expect(primary).toContain("? '#ef4444'");
    });

    it('is a live regression: restoring the old primary literal turns the guard red', () => {
        const src = web('components', 'CommandComposer.tsx');
        const current = styleBlockFrom(src, 'background: providers[selectedProvider].isConnected');
        const restored = current.replace("color: 'var(--joe-on-accent, #fff)'", "color: '#fff'");

        expect(hasWhiteInkOnUnstableBackground(restored)).toBe(true);
        expect(hasWhiteInkOnUnstableBackground(current)).toBe(false);
    });
});
