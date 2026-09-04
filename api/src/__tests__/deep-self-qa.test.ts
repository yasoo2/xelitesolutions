/**
 * «لا اريد فقط حركات بسيطة»
 *
 * The self-QA opened one page, at one width, pressed at most fourteen things,
 * COUNTED the forms without typing into any of them, and sent the panel not a
 * single one of the two events the panel has always known how to draw. His
 * five complaints were five separate defects, and these are the gates that
 * hold each fix down.
 *
 * Proven live in a real browser with a real WebSocket client reading what the
 * panel received (verify_deep_self_qa.ts, 27/27): 236 pointer moves, 65 red
 * outlines, 41 clicks, 34 controls over 4 pages, 8 forms filled with 24 real
 * field values, and 3 viewports — with the dead button still reported dead.
 */
import fs from 'fs';
import path from 'path';
import { judgeBehaviour } from '../core/quality/behaviour-audit';
import { formatAudit } from '../core/quality/app-audit';
import { VIEWPORTS, effectiveViewports } from '../core/quality/ui-inspection';
import { repairMeasuredMobileHeader } from '../core/quality/ui-repair';

const SRC = path.join(__dirname, '..');
const read = (...p: string[]) => fs.readFileSync(path.join(SRC, ...p), 'utf-8');

describe('the pointer moves and the element under test is outlined', () => {
    const E = () => read('core', 'quality', 'audit-eyes.ts');

    it('the audit emits the two events the panel has always been able to draw', () => {
        // They existed since the panel was written and ONLY the agent's executor
        // ever sent them — which is precisely «لا يوجد موشر وتحديد بالاحمر».
        const e = E();
        expect(e).toMatch(/type: 'cursor_move', x: px, y: py/);
        expect(e).toMatch(/type: 'highlight_boxes', boxes:/);
        expect(e).toMatch(/type: 'action_feedback', event: 'click'/);
        expect(e).toMatch(/broadcastBrowserEvent/);
    });

    it('and moves the REAL mouse, so a hover menu actually opens', () => {
        expect(E()).toMatch(/await page\.mouse\.move\(px, py\)/);
    });

    it('does not paint a second pointer into a stream already watched by the panel', () => {
        const e = E();
        expect(e).toContain('this.watched = !!this.sid;');
        expect(e).toContain('this.paint = !this.watched && !!opts?.alwaysPaint;');
        expect(e).toContain('get visible(): boolean { return this.watched || this.paint; }');
    });

    it('keeps phone frames contained and maps pointer and clicks into the fitted image', () => {
        const stream = fs.readFileSync(path.join(SRC, '..', '..', 'web', 'src', 'components', 'ModernBrowserStream.tsx'), 'utf-8');
        expect(stream).toContain('export function fittedFrameRect');
        expect(stream).toContain('const displayFrame = fittedFrameRect(viewSize.w, viewSize.h, w, h);');
        expect(stream).toContain('left: displayFrame.left');
        expect(stream).toContain('width: displayFrame.width');
        expect(stream).toContain('fitted.left + targetNorm.x * fitted.width');
        expect(stream).toContain('if (localX < fitted.left || localX > fitted.left + fitted.width');
    });

    it('the overlay lives OUTSIDE <body>, where the fingerprint cannot see it', () => {
        // A pointer drawn into the body would make every dead button look alive:
        // the verdict is a before/after hash of body's markup and node counts.
        const e = E();
        expect(e).toMatch(/document\.documentElement\.appendChild\(host\)/);
        expect(e).toMatch(/attachShadow\(\{ mode: 'open' \}\)/);
        expect(e).not.toMatch(/document\.body\.appendChild\(host\)/);
    });

    it('and it is a FUNCTION — a string is never invoked by Playwright', () => {
        // Measured: page.evaluate('(o) => {…}') evaluates to a function object
        // and returns undefined. The whole overlay painted nothing, silently,
        // because the call was `.catch(() => {})`.
        const e = E();
        expect(e).toMatch(/function paintEye\(o: any\) \{/);
        expect(e).toMatch(/export async function evalInPage/);
        expect(e).toMatch(/__name is not defined/);
        expect(e).not.toMatch(/const PAINT = `/);
    });

    it('and the page is handed back with nothing of ours on it', () => {
        expect(E()).toMatch(/function wipeEye\(\)/);
        expect(read('core', 'quality', 'app-audit.ts')).toMatch(/await eyes\.clear\(page\)/);
    });
});

describe('every menu, every route — not fourteen buttons', () => {
    const B = () => read('core', 'quality', 'behaviour-audit.ts');

    it('the ceiling is time, not a hard-coded fourteen', () => {
        const b = B();
        expect(b).toMatch(/const MAX_CONTROLS = 40;/);
        expect(b).toMatch(/const DEFAULT_BUDGET_MS = 60_000;/);
        expect(b).toMatch(/if \(Date\.now\(\) > deadline\) \{ budgetHit = true; break; \}/);
    });

    it('menus are catalogued FIRST — what they hide is invisible until they open', () => {
        const b = B();
        expect(b).toMatch(/\[aria-haspopup\].*not\(\[aria-haspopup="dialog"\]\), \[aria-expanded\], \.menu-toggle/);
        expect(b).toMatch(/\.hamburger/);
        expect(b).toMatch(/forEach\(el => push\(el, 'menu'\)\)/);
        expect(b.indexOf("push(el, 'menu')")).toBeLessThan(b.indexOf("push(el, 'button')"));
    });

    it('and an in-app route is a control, while someone else’s site is not', () => {
        const b = B();
        expect(b).toMatch(/querySelectorAll\('a\[href\^="#\/"\]'\)\.forEach\(el => push\(el, 'link'\)\)/);
    });

    it('does not accuse a footer link to the route already on screen', () => {
        const b = B();
        expect(b).toContain("const currentHashRoute = window.location.hash || '#/';");
        expect(b).toContain("kind === 'link' && /^#\\//.test(routeHref) && routeHref === currentHashRoute");
    });

    it('restores the exact route after testing an in-app navigation', () => {
        const b = B();
        expect(b).toContain('const probeStartUrl = page.url();');
        expect(b).toContain("await page.goto(probeStartUrl, { waitUntil: 'load', timeout: 5000 })");
    });

    it('keeps duplicate controls distinct after the page re-renders', () => {
        const b = B();
        expect(b).toContain('const ordinal = out.filter(candidate => candidate.kind === kind');
        expect(b).toContain("${c.kind}|${c.label}|${c.href || ''}|${c.ordinal ?? 0}");
        expect(b).toContain('const semanticControlKey');
        expect(b).toContain('replacementFor(fresh, c)');
    });

    it('the stamps from the last page are wiped — a hash route never reloads', () => {
        // This cost 34 controls: every element still carried `data-joe-ctl`, the
        // dedupe guard skipped them all, and routes 2-4 pressed nothing.
        const b = B();
        expect(b).toMatch(/querySelectorAll\('\[data-joe-ctl\]'\)\.forEach\(el => el\.removeAttribute\('data-joe-ctl'\)\)/);
        expect(b).toMatch(/querySelectorAll\('\[data-joe-fld\]'\)\.forEach/);
    });

    it('and the whole walk shares one budget instead of one per page', () => {
        expect(read('core', 'quality', 'app-audit.ts')).toMatch(/const walkUntil = Date\.now\(\) \+ Math\.max\(45_000, timeoutMs \* 2\)/);
    });
});

describe('the forms are filled in and sent, not counted', () => {
    const B = () => read('core', 'quality', 'behaviour-audit.ts');

    it('every field is typed into by its declared type', () => {
        const b = B();
        expect(b).toMatch(/export async function probeForms/);
        expect(b).toMatch(/await el\.fill\(valueFor\(fld\.type, fld\.tag, runNonce, pageLanguage\), \{ timeout: 2500 \}\)/);
        expect(b).toMatch(/await el\.selectOption\(fld\.options\[0\]/);
        expect(b).toMatch(/await el\.check\(\{ timeout: 2000, force: true \}\)/);
        for (const t of ['email', 'tel', 'date', 'password', 'url']) expect(b).toMatch(new RegExp(`case '${t}'`));
    });

    it('and sent through the button a visitor would press', () => {
        const b = B();
        expect(b).toMatch(/const sub = await page\.\$\(f\.submitSel\)/);
        expect(b).toMatch(/form\.requestSubmit \? form\.requestSubmit\(\) : form\.submit\(\)/);
    });

    it('a full form that does nothing on submit is a critical finding', () => {
        // The finding that could not exist before: nothing was ever typed, so
        // «submit is dead» and «submit works» measured identically.
        const j = judgeBehaviour([], { formsDeadSubmit: 2 }, []);
        const f = j.findings.find(x => x.code === 'form_dead_submit')!;
        expect(f).toBeTruthy();
        expect(f.severity).toBe('critical');
        expect(f.ar).toContain('عُبِّئ');
        expect(f.en).toContain('filled in completely and submitted');
    });

    it('while a form the browser correctly refuses is not accused of anything', () => {
        expect(judgeBehaviour([], { formsValidated: 3, formsDeadSubmit: 0 }, []).findings
            .some(f => f.code === 'form_dead_submit')).toBe(false);
    });

    it('and Playwright takes ONE argument — two threw, and the forms vanished', () => {
        const b = B();
        expect(b).toMatch(/findForms, \{ maxForms: opts\?\.maxForms \?\? MAX_FORMS, maxFields: MAX_FIELDS_PER_FORM \}/);
        expect(b).toMatch(/metrics\.formsError = String\(e\?\.message \|\| e\)/);
    });
});

describe('the interface itself is inspected — «وفحص ui»', () => {
    const U = () => read('core', 'quality', 'ui-inspection.ts');

    /**
     *  ⛔ THIS TEST PINNED THE DEFECT. It asserted `[390, 820]` — two widths —
     *  while the delivery he reads said «3 viewport(s)», because
     *  `metrics.viewports` APPENDED the restore width after the loop. So the
     *  one thing that looks for horizontal scrolling, oversized boxes and
     *  unreadable text never ran at a desktop width, and the number in the
     *  report said it had.
     *
     *  Desktop is measured now, and the count is DERIVED from the same array
     *  rather than assembled beside it — which is the only way the two cannot
     *  drift again.
     */
    it('at a phone, a tablet AND a desktop width, then back to where it was', () => {
        // Headed Chromium on Windows can retain the smaller outer-window
        // constraint when enlarged again. Descending keeps every requested
        // viewport exact while still measuring all three classes.
        expect(VIEWPORTS.map(v => v.w)).toEqual([1280, 820, 390]);
        const u = U();
        expect(u).toMatch(/await applyViewportSize\(page, vp\.w, vp\.h\)/);
        expect(u).toMatch(/await applyViewportSize\(page, openingViewport\.width, openingViewport\.height\)/);
    });

    it('fits the responsive matrix to a visible panel without inventing a desktop width', () => {
        expect(effectiveViewports(1280).map(v => v.w)).toEqual([1280, 820, 390]);
        expect(effectiveViewports(820).map(v => v.w)).toEqual([820, 390]);
        expect(effectiveViewports(390).map(v => v.w)).toEqual([390]);
    });

    it('measures a fragmented mobile header and has an evidence-bound repair', () => {
        const u = U();
        expect(u).toContain("code: 'mobile_header_fragmented'");
        expect(u).toContain('bannerBox.height > 144 || rows >= 3 || offscreenControls > 0');
        expect(u).toContain("banner.querySelectorAll('a[href],button,[role=\"button\"]')");
        const repaired = repairMeasuredMobileHeader('.site-header{}', [{ sel: 'header.site-header > div.header-inner' }]);
        expect(repaired.repairs[0].id).toBe('mobile_header_fragmented');
        expect(repaired.text).toContain('grid-template-columns: minmax(0, 1fr) auto');
        expect(repairMeasuredMobileHeader(repaired.text, [{ sel: 'header.site-header > div.header-inner' }]).repairs).toEqual([]);
    });

    it('⛔ every width it REPORTS is a width it measured', () => {
        //  The claim, not the spelling: the reported list is appended only
        //  after the page proves window.innerWidth matches the requested
        //  viewport. A failed emulation is a tool finding, never a fake app
        //  measurement.
        //  ⛔ Comments stripped FIRST, and by lines rather than by a regex.
        //  My first version of this check matched the defect quoted inside the
        //  comment that EXPLAINS the defect, and went red on the fixed file.
        //  Third time in this repository: a guard is anchored on code, never
        //  on prose that describes code.
        const code = U().split('\n')
            .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l))
            .join('\n');
        const assignments = code.match(/metrics\.viewports\s*=\s*[^;]+;/g) || [];
        expect(assignments).toEqual(['metrics.viewports = measuredViewports;']);
    });

    it('and the panel is told the page got narrower, or it draws a smear', () => {
        expect(read('modules', 'browser', 'manager.ts')).toMatch(/export function setSessionViewport/);
        expect(read('core', 'quality', 'app-audit.ts')).toMatch(/setSessionViewport\(opts\.watchSessionId, w, h\)/);
    });

    /**
     *  ⛔ THIS TEST WAS A SPELL-CHECK, AND IT PROVED IT BY GOING RED ON A RENAME.
     *
     *  It asserted the SOURCE TEXT of ui-inspection.ts contained
     *
     *      /0\.2126 \* a\[0\] \+ 0\.7152 \* a\[1\] \+ 0\.0722 \* a\[2\]/
     *      /\(size >= 24 \|\| \(size >= 18\.66 && bold\)\) \? 3 : 4\.5/
     *
     *  Then the arithmetic moved out of `page.evaluate` into a function whose
     *  parameter is called `sizePx` instead of `size` — **behaviour identical,
     *  every published contrast value unchanged** — and this test failed. A
     *  guard that a rename can break, and that an inverted branch cannot, is
     *  testing the words of a claim rather than the claim.
     *
     *  The arithmetic is now proven against the W3C's own numbers in
     *  `the-contrast-rule-was-checked-by-spelling.test.ts`: black on white is
     *  21:1, a colour on itself is 1:1, #767676 passes AA and #777777 does
     *  not. What is left here is the one thing that file cannot check — that
     *  the finding still exists and still reaches him.
     */
    it('contrast is WCAG arithmetic, and the arithmetic is REACHABLE by a test', () => {
        const u = U();
        //  Exported, therefore testable. This is the property that was
        //  missing, and it is the property the whole sweep is about.
        expect(u).toMatch(/export function relativeLuminance\(/);
        expect(u).toMatch(/export function contrastRatio\(/);
        expect(u).toMatch(/export function requiredRatio\(/);
        expect(u).toMatch(/code: 'low_contrast'/);
        // Chromium's computed style uses color(srgb ...) for color-mix().
        // The page-side collector must understand it and composite translucent
        // layers, otherwise a modern generated palette can be judged as black
        // or transparent and stop a healthy build.
        expect(u).toMatch(/color\(\s*srgb/);
        expect(u).toContain('layers: any[] = [];');
        expect(u).toContain('if (fg[3] < 0.995)');
        //  And the page no longer decides: it reports what it saw.
        expect(u).toContain('const c = { checked: raw.checked, skipped: raw.skipped, fails: judgeContrast(raw.samples) };');
        expect(u).toContain('evidence: c.fails.slice(0, 24)');
    });

    it('and the structural checks a screen reader would fail on', () => {
        const u = U();
        for (const c of ['images_without_alt', 'inputs_without_labels', 'duplicate_ids', 'aria_hidden_focusable']) {
            expect(u).toContain(c);
        }
        expect(u).toMatch(/code: 'mobile_overflow'/);
        expect(u).toMatch(/code: 'mobile_tap_targets'/);
        expect(u).toMatch(/code: 'no_viewport_meta'/);
    });

    it('proves each responsive viewport actually applied before blaming the app', () => {
        const u = U();
        expect(u).toContain('actualVw: actualVw');
        expect(u).toContain("code: 'viewport_emulation_failed'");
        expect(u).toContain('metrics.viewports = measuredViewports');
        expect(u).toContain('Math.abs(actualVw - vp.w) > 2');
        expect(u).toContain('const viewports = effectiveViewports(availableWidth)');
        expect(u).toContain("Emulation.setDeviceMetricsOverride");
        expect(u).toContain('dontSetVisibleSize: false');
        expect(u).toContain('screenWidth: width, screenHeight: height');
        expect(u).toContain('await page.waitForTimeout(180)');
        expect(u).toContain('await page.waitForTimeout(240)');
    });

    it('every failing element is OUTLINED, not just listed', () => {
        const u = U();
        expect((u.match(/eyes\?\.mark\(/g) || []).length).toBeGreaterThanOrEqual(4);
    });

    it('and the findings reach the delivery message', () => {
        const a = read('core', 'quality', 'app-audit.ts');
        expect(a).toMatch(/behaviour\.findings\.push\(\.\.\.ui\.findings\)/);
        expect(a).toMatch(/opts\?\.onProgress\?\.\('inspecting'\)/);
    });
});

describe('the camera does not edit the page it is filming', () => {
    it('the stream no longer hides the caret, which rewrote every input', () => {
        /**
         * Measured on an IDLE page with nothing clicked: the body fingerprint
         * flipped between two values in 11 of 25 samples, because Playwright's
         * default `caret: 'hide'` writes `caret-color: transparent !important`
         * into every input before each shot and strips it after. At stream FPS
         * the audit's «did this click change anything?» was part coin-flip on
         * any page with a form. 0/25 after the fix.
         */
        const m = read('modules', 'browser', 'manager.ts');
        expect(m).toMatch(/caret: 'initial'/);
        expect(m).toMatch(/THE STREAM MUST NOT EDIT THE PAGE IT IS FILMING/);
    });

    it('declares each streamed JPEG with the page viewport that produced it', () => {
        const m = read('modules', 'browser', 'manager.ts');
        expect(m).toContain('const actualViewport = s.page.viewportSize()');
        expect(m).toContain('w: actualViewport?.width || s.viewport.w');
        expect(m).toContain('h: actualViewport?.height || s.viewport.h');
    });

    it('and the fingerprint ignores it even if some other camera does it', () => {
        expect(read('core', 'quality', 'behaviour-audit.ts'))
            .toMatch(/replace\(\/caret-color:\\s\*transparent\\s\*!important;\?\\s\*\/gi, ''\)/);
    });
});

describe('and the first thing it measured was Joe’s own work', () => {
    /**
     * The hour the deep audit went live it put a build through three widths
     * and found four defects that had shipped in every React site Joe has
     * ever produced. They are fixed, and measured clean afterwards
     * (verify_app_audit.ts, 11/11: «the clean build has no findings of its
     * own — including at phone and tablet width, with its forms filled in»).
     */
    const R = () => read('modules', 'tools', 'definitions', 'ReactProjectTool.ts');

    it('the header no longer drags the whole page sideways on a phone', () => {
        const r = R();
        expect(r).toMatch(/\.header-inner\{flex-wrap:wrap\}/);
        expect(r).toMatch(/\.nav-links\{display:flex;gap:10px;flex-wrap:wrap;min-width:0\}/);
    });

    it('the hero eyebrow clears AA instead of missing it by 0.1', () => {
        // Measured 4.4:1 where 4.5 is required — brand ink on its own tint.
        expect(R()).toMatch(/\.hero-eyebrow\{[^}]*color:color-mix\(in srgb,var\(--brand\) 42%,var\(--text\)\)/);
    });

    it('a thumb can hit the footer links and the form fields', () => {
        const r = R();
        expect(r).toMatch(/\.footer-links a\{[^}]*min-height:44px\}/);
        expect(r).toMatch(/input,textarea,select\{padding:12px 14px;min-height:44px/);
        expect(r).toMatch(/\.btn\{display:inline-flex;align-items:center;justify-content:center;min-height:44px/);
    });

    it('the app’s own star is a real required attribute, not decoration', () => {
        // «العنوان *» with no `required` on the input: the finding «نموذج بلا
        // أي حقل مطلوب» appeared on every build he ever ran, and the repair
        // pass could not hold it because the generator re-emitted it.
        const t = read('modules', 'tools', 'definitions', 'react-app-templates.ts');
        expect((t.match(/required=\{!!f\.required\}/g) || []).length).toBeGreaterThanOrEqual(3);
    });

    it('and its small buttons and its own name were measured too', () => {
        const t = read('modules', 'tools', 'definitions', 'react-app-templates.ts');
        expect(t).toMatch(/\.btn\.tiny\{padding:6px 12px;min-height:44px/);
        expect(t).toMatch(/\.app-name\{[^}]*color:color-mix\(in srgb,var\(--brand,#111\) 45%,var\(--text,#111\)\)/);
        // «حذف» measured 3.29:1 — the last WCAG failure left in the app.
        expect(t).toMatch(/\.btn\.danger\{background:transparent;color:#96271b/);
        expect(t).toMatch(/\[data-theme="dark"\] \.btn\.danger/);
        // «متصل بالخادم» measured 4.21:1 — a tenth under AA.
        expect(t).toMatch(/\.badge\.on\{color:#15722f/);
    });

    it('and the footer headings are one level down, not two', () => {
        const r = R();
        expect(r).toMatch(/<h3>\{content\.contactTitle\}<\/h3>/);
        expect(r).toMatch(/\.footer-col h3\{/);
        expect(r).not.toMatch(/<h4>\{content\.contactTitle\}<\/h4>/);
    });
});

describe('a measurement it cannot make honestly, it does not make', () => {
    it('text over a gradient or a photo is SKIPPED, never scored 1.05:1', () => {
        /**
         * Joe's own hero came back at «1.05:1 — طاولتك جاهزة الليلة», which was
         * not a defect: the walk reads backgroundColor and the band's colour
         * lives in backgroundImage, so white-on-gradient measured as
         * white-on-white. A false blocker is the thing he was shown before and
         * the thing this must never produce.
         */
        const u = read('core', 'quality', 'ui-inspection.ts');
        expect(u).toMatch(/if \(st\.backgroundImage && st\.backgroundImage !== 'none'\)/);
        expect(u).toContain('backgroundImage)) return null;');
        expect(u).toMatch(/if \(!bgc\) \{ skipped\+\+; continue; \}/);
        expect(u).toMatch(/metrics\.contrastUnmeasurable = c\.skipped;/);
    });

    it('an inline link in a sentence is not a tap target', () => {
        expect(read('core', 'quality', 'ui-inspection.ts'))
            .toMatch(/if \(el\.tagName === 'A' && \/\^inline\$\/\.test\(getComputedStyle\(el\)\.display\)\) return;/);
    });

    it('a control the app DISABLED is not reported as broken', () => {
        // Measured on his own build: «تصدير CSV» carries disabled={!rows.length}
        // and the list was empty, so the probe called a correctly-disabled
        // button «لا يستجيب».
        const b = read('core', 'quality', 'behaviour-audit.ts');
        expect(b).toMatch(/A DISABLED CONTROL IS NOT A BROKEN ONE/);
        expect(b).toMatch(/\(el as HTMLButtonElement\)\.disabled === true \|\| el\.getAttribute\('aria-disabled'\) === 'true'/);
    });

    it('the audit answers YES to a confirm — «حذف» was never testable otherwise', () => {
        /**
         * His run: «أزرار لا تستجيب: «النباتات»، «حذف»». The delete button asks
         * «حذف هذا السجلّ؟» and the audit's dialog handler was `d.dismiss()` —
         * it said NO, nothing changed, and the button was called broken. A
         * tester who cancels every dialog is testing the cancel path.
         */
        for (const f of ['app-audit.ts', 'behaviour-audit.ts']) {
            const src = read('core', 'quality', f);
            expect(src).toMatch(/d\.accept\('Joe QA'\)/);
            expect(src).toMatch(/kind === 'beforeunload'/);
            expect(src).not.toMatch(/\(d: any\) => d\.dismiss\(\)/);
        }
    });

    it('and a tab that is already open is not a dead control', () => {
        expect(read('core', 'quality', 'behaviour-audit.ts'))
            .toMatch(/aria-selected'\) === 'true' \|\| el\.getAttribute\('aria-current'\)/);
    });

    it('a 401 while the audit is signed out is the app’s own rule, not a defect', () => {
        // His run lost 30 points to two findings that said the server correctly
        // refused an unauthenticated write the audit itself provoked.
        const a = read('core', 'quality', 'app-audit.ts');
        expect(a).toMatch(/\\b40\[13\]\\b\|Unauthorized\|Forbidden/);
        expect(a).toMatch(/r\.status\(\) !== 401 && r\.status\(\) !== 403/);
        // …and 404/500 still cost what they always cost.
        expect(a).toMatch(/if \(r\.status\(\) >= 400 && r\.status\(\) !== 401/);
    });

    it('and a click that hands over a FILE counts as an effect', () => {
        const b = read('core', 'quality', 'behaviour-audit.ts');
        expect(b).toMatch(/page\.on\('download', onDownload\)/);
        expect(b).toMatch(/effect = afterUrl !== beforeUrl\s*\n?\s*\? 'navigation'/);
        expect(b).toMatch(/: downloaded \|\| downloadClicks > downloadClicksBefore\s*\n?\s*\? 'download'\s*\n?\s*: \(changed\(before, after\)/);
    });

    it('and a form is exercised once per audit, not once per route', () => {
        // A hash route does not rebuild the document: re-sending the SAME form
        // changes nothing, and «nothing changed» is how this audit says «dead».
        const b = read('core', 'quality', 'behaviour-audit.ts');
        expect(b).toMatch(/if \(opts\.seenForms\.has\(key\)\) \{ metrics\.formsRepeated/);
        expect(read('core', 'quality', 'app-audit.ts')).toMatch(/const seenForms = new Set<string>\(\);/);
    });

    it('and every finding names what it is talking about', () => {
        const u = read('core', 'quality', 'ui-inspection.ts');
        expect(u).toMatch(/mobileTinyNames\.slice\(0, 3\)/);
        expect(u).toMatch(/sample: 'h' \+ levels\[i - 1\] \+ ' ← h' \+ levels\[i\]/);
    });

    it('does not call hash-router paths missing section anchors', () => {
        const b = read('core', 'quality', 'behaviour-audit.ts');
        expect(b).toMatch(/h === 'top' \|\| h\.includes\('\/'\)/);
    });

    it('re-discovers controls after interactions instead of replaying one fixed list', () => {
        const b = read('core', 'quality', 'behaviour-audit.ts');
        expect(b).toMatch(/EXPLORE THE STATES THAT THE FIRST CATALOGUE COULD NOT SEE/);
        expect(b).toMatch(/evalInPage\(page, findControls, limit\)/);
        expect(b).toMatch(/stateful\?: boolean/);
        expect(b).toMatch(/!initialKeys\.has\(controlKey\(c\)\) \|\| c\.stateful/);
        expect(b).toMatch(/metrics\.exploratoryActions\+\+/);
        expect(b).toMatch(/metrics\.statesVisited/);
        const a = read('core', 'quality', 'app-audit.ts');
        expect(a).toMatch(/exploratory action/);
        expect(a).toMatch(/controlsDiscovered/);
    });
});

describe('and the report counts what was actually done', () => {
    it('pages, controls, forms, fields and viewports — all measured', () => {
        const ar = formatAudit({
            score: 91, findings: [], routes: ['/', '#/a', '#/b'], pressed: 34,
            formsFilled: 8, fieldsFilled: 24, viewports: ['390x844', '820x1180', '1280x720'],
        }, true);
        expect(ar).toContain('3 صفحة');
        expect(ar).toContain('34 عنصر مضغوط');
        expect(ar).toContain('8 نموذج معبّأ ومُرسل');
        expect(ar).toContain('24 حقل');
        expect(ar).toContain('3 مقاسات شاشة');
    });

    it('and a run with no forms does not claim a field it never typed', () => {
        const ar = formatAudit({ score: 100, findings: [], routes: ['/'], pressed: 4 }, true);
        expect(ar).toContain('0 نموذج معبّأ ومُرسل');
        expect(ar).not.toContain('حقل');
    });
});
