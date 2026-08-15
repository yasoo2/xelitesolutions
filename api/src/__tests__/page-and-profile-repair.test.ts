/**
 * «جميعها» — the five remaining repairs, held in place permanently.
 *
 * These gates are here because each of them broke once, in exactly the way a
 * unit test catches and a code review does not:
 *
 *   • the block matcher ATE every second CSS block, so the dark palette was
 *     silently skipped while the light one was fixed and the report said «done»
 *   • a bare `p { color }` in a patch for someone else's site loses to their
 *     own `p.faint {…}` — the patch applied, the page did not change
 *   • `aspect-ratio: attr(width)` parses and does nothing, which is the most
 *     expensive kind of wrong: it looks like a fix in the file
 *   • lazy-loading the FIRST image delays the very thing being measured
 */
import fs from 'fs';
import path from 'path';
import {
    repairContrast, repairLazyImages, repairResponsive, repairProjectFiles,
    contrastRatio, parseHex, fixForeground, luminance,
} from '../core/quality/ui-repair';

const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf-8');
const WHITE: [number, number, number] = [255, 255, 255];

describe('WCAG arithmetic', () => {
    it('agrees with the standard at both ends', () => {
        expect(Math.round(contrastRatio(WHITE, [0, 0, 0]))).toBe(21);
        expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 5);
        expect(luminance(WHITE)).toBeCloseTo(1, 5);
    });

    it('reads #rgb and #rrggbb, and refuses everything it cannot know', () => {
        expect(parseHex('#fff')).toEqual([255, 255, 255]);
        expect(parseHex('#1a2b3c')).toEqual([26, 43, 60]);
        for (const bad of ['var(--x)', 'rgba(0,0,0,.5)', 'red', '#12', '']) expect(parseHex(bad)).toBeNull();
    });

    it('raises a foreground the shortest distance that clears the bar', () => {
        const out = fixForeground([170, 170, 170], WHITE, 4.5);
        expect(contrastRatio(out, WHITE)).toBeGreaterThanOrEqual(4.5);
        expect(out[0]).toBeGreaterThan(40);            // it did not simply go black
        expect(fixForeground([0, 0, 0], WHITE, 4.5)).toEqual([0, 0, 0]);   // already fine → untouched
    });
});

describe('contrast is repaired in the tokens, per theme', () => {
    const palette = [
        ':root { --bg: #ffffff; --text: #8a8a8a; --text-muted: #b0b0b0; --brand: #f2c14e; }',
        '[data-theme="dark"] { --bg: #10131a; --text: #e9edf5; --text-muted: #3d4658; }',
        '.card { padding: 16px; }',
        '',
    ].join('\n');

    it('fixes BOTH palettes — a matcher that eats every second block is the bug this catches', () => {
        const out = repairContrast(palette);
        const light = out.text.slice(0, out.text.indexOf('[data-theme'));
        const dark = out.text.slice(out.text.indexOf('[data-theme'));
        for (const [css, bg] of [[light, '#ffffff'], [dark, '#10131a']] as const) {
            for (const token of ['text', 'text-muted']) {
                const hex = css.match(new RegExp(`--${token}\\s*:\\s*(#[0-9a-f]{6})`, 'i'))![1];
                expect(contrastRatio(parseHex(hex)!, parseHex(bg)!)).toBeGreaterThanOrEqual(4.5);
            }
        }
        expect(out.repairs[0].count).toBe(3);           // light ×2, dark ×1 — dark --text already passed
    });

    it('leaves the brand colour exactly as the owner chose it', () => {
        expect(repairContrast(palette).text).toMatch(/--brand:\s*#f2c14e/);
    });

    it('is idempotent, and does not touch a palette that already passes', () => {
        const once = repairContrast(palette).text;
        expect(repairContrast(once).text).toBe(once);
        const good = ':root { --bg: #ffffff; --text: #111111; }';
        expect(repairContrast(good)).toEqual({ text: good, repairs: [] });
    });
});

describe('performance: the hero stays eager', () => {
    const jsx = `export default function P(){return(<section>
  <img src="/hero.jpg" alt="a" />
  <img src="/b.jpg" alt="b" />
  <img src="/c.jpg" alt="c" loading="eager" />
</section>);}`;

    it('defers everything below the first image and nothing above it', () => {
        const out = repairLazyImages(jsx);
        const line = (needle: string) => out.text.split('\n').find(l => l.includes(needle)) || '';
        expect(line('/hero.jpg')).not.toMatch(/loading=/);
        expect(line('/b.jpg')).toMatch(/loading="lazy" decoding="async"/);
        expect(line('/c.jpg')).toMatch(/loading="eager"/);        // an explicit choice is respected
        expect(out.repairs[0].count).toBe(1);
    });

    it('runs twice without adding anything', () => {
        const once = repairLazyImages(jsx).text;
        expect(repairLazyImages(once)).toEqual({ text: once, repairs: [] });
    });
});

describe('responsive rules are appended once', () => {
    it('stop the page being wider than the phone', () => {
        const out = repairResponsive('.a{color:red}');
        expect(out.text).toMatch(/html, body \{ max-width: 100%; overflow-x: hidden; \}/);
        expect(out.text).toMatch(/@media \(max-width: 480px\)/);
        expect(repairResponsive(out.text).text).toBe(out.text);
    });

    it('keeps a measured overflow finding actionable when the browser has no safe selector', () => {
        const old = '/* ── إصلاح جو: التجاوب ────────────────────────────────────────────────── */\n.a{color:red}';
        const plan = repairProjectFiles({ 'styles.css': old }, {
            findings: [{ id: 'mobile_overflow' }],
        });
        expect(plan.files['styles.css']).toMatch(/إصلاح جو الجراحي: overflow قيس على الجوال/);
        expect(plan.repairs.map(r => r.id)).toContain('responsive');
    });

    it('uses measured mobile findings instead of losing them at the repair boundary', () => {
        const plan = repairProjectFiles({ 'styles.css': '.a{color:red}' }, {
            findings: [
                { id: 'mobile_overflow', evidence: [{ sel: 'a.brand', label: 'wider than the screen', w: 600, h: 50 }] },
                { id: 'mobile_tap_targets', evidence: [{ sel: 'a.brand', label: 'tap target < 40px', w: 86, h: 33 }] },
            ],
        });
        const css = plan.files['styles.css'];
        expect(css).toMatch(/إصلاح جو الجراحي: overflow قيس على الجوال/);
        expect(css).toMatch(/a\.brand/);
        expect(css).toMatch(/min-height:\s*44px/);
        expect(plan.repairs.map(r => r.id)).toEqual(expect.arrayContaining(['responsive', 'small_targets']));
        expect(repairProjectFiles({ 'styles.css': css }, {
            findings: [
                { id: 'mobile_overflow', evidence: [{ sel: 'a.brand', w: 600, h: 50 }] },
                { id: 'mobile_tap_targets', evidence: [{ sel: 'a.brand', w: 86, h: 33 }] },
            ],
        }).files).toEqual({});
    });
});

describe('all three reach a real project through one entry point', () => {
    it('repairProjectFiles applies colour, lazy images and responsive rules', () => {
        const plan = repairProjectFiles({
            'src/styles/app.css': ':root { --bg: #ffffff; --text-muted: #bbbbbb; }',
            'src/App.jsx': 'export default function A(){return(<div><img src="/1.png" alt="1" /><img src="/2.png" alt="2" /></div>);}',
        });
        const css = plan.files['src/styles/app.css'];
        expect(css).not.toMatch(/--text-muted:\s*#bbbbbb/);
        expect(css).toMatch(/إصلاح جو: التجاوب/);
        expect(css).toMatch(/min-height:\s*44px/);
        expect(plan.files['src/App.jsx']).toMatch(/loading="lazy"/);
        // Tokens must stay above the appended blocks, or a variable is redefined
        // after it has already been read.
        expect(css.indexOf('--text-muted')).toBeLessThan(css.indexOf('إصلاح جو: التجاوب'));
    });
});

describe('a page Joe does not own', () => {
    const T = () => read('modules', 'tools', 'definitions', 'PageFixTool.ts');

    it('overrides the site\'s own rules — a bare tag selector loses to theirs', () => {
        expect(T()).toMatch(/color: \$\{hex\} !important/);
        expect(T()).toMatch(/overflow-x: hidden !important/);
        expect(T()).toMatch(/min-height: 44px !important/);
    });

    it('never emits attr() — it parses, and does nothing', () => {
        expect(T()).not.toMatch(/aspect-ratio: attr\(/);
        expect(T()).toMatch(/aspect-ratio: \$\{img\.w \/ g\} \/ \$\{img\.h \/ g\}/);
    });

    it('measures again after applying, and says plainly it cannot touch the server', () => {
        expect(T()).toMatch(/const after: PageIssues = await page\.evaluate\(MEASURE\)/);
        expect(T()).toMatch(/هذه الصفحة ليست ملكك/);
        expect(T()).toMatch(/loading="lazy" في HTML/);      // what CSS cannot do is said, not hidden
    });

    it('hands a human check to the human, like every other browser path', () => {
        expect(T()).toMatch(/waitForHumanToClear/);
        expect(T()).toMatch(/human_check_not_cleared/);
    });

    it('is registered and routed', () => {
        expect(read('modules', 'tools', 'registry.ts')).toMatch(/new PageFixTool\(\)/);
        expect(read('core', 'orchestrator', 'PlanningEngine.ts')).toMatch(/uiRepairIntent \? 'browser_page_fix'/);
    });
});

describe('his real browser is the default path', () => {
    const M = () => read('modules', 'browser', 'manager.ts');

    it('asking for the real profile is enough to turn persistence on', () => {
        expect(M()).toMatch(/parseBool\(process\.env\.USE_USER_BROWSER_PROFILE\) \?\? false\)\;?\s*\n?\}/);
        const fn = M().slice(M().indexOf('export function isPersistentBrowserMode'), M().indexOf('/** True when Joe should inherit'));
        expect(fn).toMatch(/USE_USER_BROWSER_PROFILE/);
    });

    it('a locked profile is answered with a copy, not with «close your browser»', () => {
        expect(M()).toMatch(/cloneRealBrowserProfile\(real\)/);
        expect(M()).toMatch(/BROWSER_CLONE_LOCKED_PROFILE/);
    });

    it('the copy carries logins and leaves caches behind', () => {
        const m = M();
        expect(m).toMatch(/'Local State'/);
        expect(m).toMatch(/CLONE_PROFILE_DIRS = \['Network', 'Local Storage'\]/);
        expect(m).toMatch(/CACHE_DIR_RE/);
        // IndexedDB is gigabytes of app data and holds no session.
        expect(m).not.toMatch(/CLONE_PROFILE_DIRS = \[[^\]]*IndexedDB/);
    });

    it('and it is switched on in the launcher, everywhere it is set', () => {
        const ps = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'start-joe.ps1'), 'utf-8');
        const all = ps.match(/\$env:USE_USER_BROWSER_PROFILE\s*=\s*"(\d)"/g) || [];
        expect(all.length).toBeGreaterThanOrEqual(2);
        expect(all.every(s => s.includes('"1"'))).toBe(true);
    });
});
