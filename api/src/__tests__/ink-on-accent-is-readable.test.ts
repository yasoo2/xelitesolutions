/**
 * A BLACK BUTTON WITH NOTHING VISIBLE INSIDE IT.
 *
 * Reported from the owner's own screen, in his words: «الزر الذي لونه اسود
 * ولم يظهر شو المكتوب فيه». The selected device button in the preview
 * toolbar was a black square, and the icon in it could not be seen.
 *
 * `PreviewPanel` filled that button with `var(--accent-primary)` — a ground
 * that changes with the theme AND with the chosen accent — and inked it with
 * the literal `#000`. Under the light «mono» accent the ground is #1B2620,
 * near-black, so the pair measured 1.34:1. Two more light accents were
 * already under the line: ice at 3.95 and turquoise at 4.28.
 *
 * Fixing that control led to the second defect, which nobody had measured:
 * `--joe-on-accent` for the light gold accent was `#ffffff`, and white on
 * #A87E22 is 3.70:1. The value had been chosen by the pattern «light theme,
 * so white ink» — a habit, not a measurement — and every accent-filled
 * control in the product had been inheriting it.
 *
 * SO THIS FILE COMPUTES, IT DOES NOT MATCH TEXT. A guard that greps for a
 * colour locks today's spelling and goes red the day the right value
 * changes; this one reads the values the stylesheets actually declare and
 * does the contrast arithmetic on them. It would have caught both defects on
 * the day each was written, and it stays true when the palette moves.
 */
import fs from 'fs';
import path from 'path';

const web = (...p: string[]) =>
    fs.readFileSync(path.join(__dirname, '..', '..', '..', 'web', 'src', ...p), 'utf-8');

const MIN_CONTRAST = 4.5; // WCAG AA for the icon-sized ink these controls carry

const rgb = (hex: string): [number, number, number] => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
];

const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex: string) => {
    const [r, g, b] = rgb(hex).map(channel);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};

/**
 * Each `html…{ … }` block in accents.css declares one accent and the ink that
 * belongs on it. They are read as a pair because that is how they are used:
 * a control filled with `--accent-primary` takes its ink from
 * `--joe-on-accent` in the same cascade.
 */
type AccentPair = { selector: string; accent: string; ink: string };

const accentPairs = (): AccentPair[] => {
    const css = web('styles', 'accents.css');
    const pairs: AccentPair[] = [];
    for (const block of css.split(/^(?=html)/m)) {
        const accent = /--accent-primary:\s*(#[0-9a-fA-F]{6})/.exec(block);
        const ink = /--joe-on-accent:\s*(#[0-9a-fA-F]{6})/.exec(block);
        if (!accent) continue;
        const selector = block.split('{')[0].trim().replace(/\s+/g, ' ');
        // A block that names an accent and no ink for it inherits whatever the
        // theme happens to carry — which is precisely how the light gold value
        // went unmeasured. Recorded as an empty ink so the assertion below
        // fails loudly rather than skipping the block.
        pairs.push({ selector, accent: accent[1], ink: ink ? ink[1] : '' });
    }
    return pairs;
};

describe('INVARIANT: the ink on an accent-filled control is readable', () => {
    test('accents.css declares an accent and its ink together', () => {
        const pairs = accentPairs();
        // Eight accents today — four families in two themes. The count is here
        // so that deleting the palette cannot quietly make this file vacuous.
        expect(pairs.length).toBeGreaterThanOrEqual(8);
        expect(pairs.filter(p => !p.ink)).toEqual([]);
    });

    test('every declared pair clears 4.5:1', () => {
        const failures = accentPairs()
            .map(p => ({ ...p, ratio: Number(contrast(p.ink, p.accent).toFixed(2)) }))
            .filter(p => p.ratio < MIN_CONTRAST);
        expect(failures).toEqual([]);
    });

    /**
     * The two defaults, for a session that has picked no accent at all.
     */
    test('the default accents clear 4.5:1 in both themes', () => {
        const theme = web('theme.css');
        const accents = web('styles', 'accents.css');
        const darkAccent = /--accent-primary:\s*(#[0-9a-fA-F]{6})/.exec(theme)![1];
        const darkInk = /html:not\(\[data-theme="light"\]\)\s*\{\s*--joe-on-accent:\s*(#[0-9a-fA-F]{6})/.exec(accents)![1];
        const lightInk = /html\[data-theme="light"\]\s*\{\s*--joe-on-accent:\s*(#[0-9a-fA-F]{6})/.exec(accents)![1];
        const lightAccent = /\[data-theme=["']light["']\][\s\S]*?--accent-primary:\s*(#[0-9a-fA-F]{6})/.exec(theme)![1];

        expect(contrast(darkInk, darkAccent)).toBeGreaterThanOrEqual(MIN_CONTRAST);
        expect(contrast(lightInk, lightAccent)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    });

    /**
     * IT PROVES ITSELF, EVERY RUN. Restoring either shipped defect has to turn
     * this file red — otherwise it is measuring its own arithmetic and not the
     * product. Both values are the ones that were actually in the tree.
     */
    test('is a live regression: the two shipped defects would fail it', () => {
        expect(contrast('#000000', '#1B2620')).toBeLessThan(MIN_CONTRAST); // the owner's black button, 1.34:1
        expect(contrast('#ffffff', '#A87E22')).toBeLessThan(MIN_CONTRAST); // light gold ink, 3.70:1
    });
});

/**
 * The control itself. The arithmetic above proves the PALETTE is sound; this
 * proves the button reads from it instead of carrying its own literal. The
 * rendered result is measured by the live harness, not here — contrast is a
 * property of a painted page, and node cannot see one.
 */
describe('INVARIANT: the preview device button takes its ink from the accent', () => {
    test('the active state uses the on-accent token, not a literal', () => {
        const src = web('components', 'PreviewPanel.tsx');
        const start = src.indexOf("background: active ? 'var(--accent-primary)'");
        expect(start).toBeGreaterThan(-1);
        const block = src.slice(start, src.indexOf('cursor:', start));
        expect(block).toContain("var(--joe-on-accent");
        expect(block).not.toMatch(/color:\s*active\s*\?\s*['"]#(?:000|000000|fff|ffffff)['"]/);
    });
});
