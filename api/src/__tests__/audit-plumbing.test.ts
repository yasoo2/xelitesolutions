/**
 * Eight new checks joined the audits — and the builder was upgraded FIRST so
 * its own pages pass them. A checker added without fixing the generator just
 * turns every build red; a generator fixed without the checker regresses
 * silently. Both halves land together:
 *
 *   visual audit: broken images (the browser really tried), duplicate ids,
 *   missing <title>, missing viewport meta, missing meta description,
 *   target="_blank" without noopener, http:// mixed content.
 *   behaviour audit: clickables the Tab key can never reach.
 *
 * The pages Joe builds now carry a composed meta description on every path
 * (section-wise, site, single-shot, edit) — composed from what the page IS,
 * never pasted from the user's prompt, same rule as the title.
 */
import * as fs from 'fs';
import * as path from 'path';
import { metaDescription } from '../core/design/page-head';
import { assemblePage } from '../core/design/section-writer';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf-8');

describe('metaDescription — composed, never the prompt', () => {
    const request = 'ابني صفحة ويب لشركة تكنولوجية اسمها xelitesolutions وهي شركة مختصة بالبرمجيات';

    it('names the brand and says what the page is, in Arabic', () => {
        const d = metaDescription({ request, isArabic: true, kindLabel: 'landing' });
        expect(d).toContain('xelitesolutions');
        expect(d.length).toBeGreaterThan(30);
        expect(d.length).toBeLessThanOrEqual(160);
    });

    it('never pastes the user\'s instruction', () => {
        const d = metaDescription({ request, isArabic: true, kindLabel: 'landing' });
        expect(d).not.toContain('ابني صفحة');
    });

    it('a page of a site mentions its own page name', () => {
        const d = metaDescription({ request, isArabic: true, kindLabel: 'contact', pageName: 'اتصل بنا', brand: 'xelite' });
        expect(d).toContain('اتصل بنا');
        expect(d).toContain('xelite');
    });

    it('no brand in the request → the page kind alone, honestly', () => {
        const d = metaDescription({ request: 'اعمل متجر الكتروني', isArabic: true, kindLabel: 'store' });
        expect(d.length).toBeGreaterThan(10);
        expect(d).toContain('السلة');
    });

    it('stays inside the ~160 characters search engines display', () => {
        const d = metaDescription({
            request: 'a site named ' + 'VeryLongBrandName'.repeat(3),
            isArabic: false, kindLabel: 'landing', pageName: 'p'.repeat(80),
        });
        expect(d.length).toBeLessThanOrEqual(160);
    });
});

describe('assemblePage carries the description into the head', () => {
    const base = { title: 'X', isArabic: true, tokenCss: '', baseLayer: '', sections: [{ ok: true, id: 'a', html: '<section id="a"></section>' }] as any, sprite: '', script: '' };

    it('emits the meta description tag when given one', () => {
        const html = assemblePage({ ...base, description: 'وصف حقيقي للصفحة' });
        expect(html).toMatch(/<meta name="description" content="وصف حقيقي للصفحة">/);
    });

    it('escapes markup out of the content attribute', () => {
        const html = assemblePage({ ...base, description: 'desc "quoted" <script>' });
        // The dangerous characters are stripped, so the attribute closes where
        // the tag says it does and no element can be smuggled into the head.
        expect(html).toContain('<meta name="description" content="desc quoted script">');
        expect(html).not.toContain('<script>');
    });

    it('omits the tag entirely when there is no description — an empty tag is worse than none', () => {
        const html = assemblePage({ ...base, description: '  ' });
        expect(html).not.toContain('name="description"');
    });
});

describe('the builder passes a description on every path', () => {
    const src = read('modules/tools/definitions/WebPageBuilderTool.ts');

    it('section-wise and site assemblies both compose one', () => {
        const calls = src.match(/description: metaDescription\(/g) || [];
        expect(calls.length).toBeGreaterThanOrEqual(2);
    });

    it('the single-shot/edit fallback injects one when the head has none', () => {
        expect(src).toMatch(/name=\["']description\["']/);
        expect(src).toMatch(/<meta name="description" content="\$\{desc\}">/);
    });
});

describe('the new checks exist with honest severities', () => {
    const visual = read('core/quality/visual-audit.ts');
    const behaviour = read('core/quality/behaviour-audit.ts');

    it.each([
        ['broken_images', 'major'],
        ['no_title', 'major'],
        ['no_viewport', 'major'],
        ['http_resources', 'major'],
        ['duplicate_ids', 'minor'],
        ['no_meta_description', 'minor'],
        ['blank_no_noopener', 'minor'],
    ])('visual audit: %s at severity %s', (code, severity) => {
        const m = visual.match(new RegExp(`code: '${code}', severity: '(\\w+)'`));
        expect(m?.[1]).toBe(severity);
    });

    it('behaviour audit: keyboard_unreachable is major — a mouse-only page is not a working page', () => {
        const m = behaviour.match(/code: 'keyboard_unreachable', severity: '(\w+)'/);
        expect(m?.[1]).toBe('major');
    });

    it('broken images are the ones the browser REALLY failed to load, not a src-pattern guess', () => {
        expect(visual).toMatch(/img\.complete && img\.naturalWidth === 0/);
    });

    it('keyboard check exempts natively focusable elements and tabindex carriers', () => {
        const block = behaviour.slice(behaviour.indexOf('keyboardUnreachable'));
        expect(block).toContain("'BUTTON'");
        expect(block).toContain("hasAttribute('tabindex')");
    });
});


describe('visible browser QA is part of page delivery', () => {
    const builder = read('modules/tools/definitions/WebPageBuilderTool.ts');
    const pipeline = read('modules/tools/definitions/ProjectPipelineTool.ts');
    const visual = read('core/quality/visual-audit.ts');
    const behaviour = read('core/quality/behaviour-audit.ts');

    it('focuses and warms the Browser panel before page audits', () => {
        expect(builder).toContain("reason: 'page_qa'");
        expect(builder).toContain('warmBrowserSession(PANEL_BROWSER_SID)');
        expect(builder).toContain('waitForPanelWatcher(PANEL_BROWSER_SID, 4000)');
    });

    it('the evidence-first pipeline performs visible QA after the final live run', () => {
        expect(pipeline).toContain("if (liveUrl) {");
        expect(pipeline).not.toContain("if (finalVerified && liveUrl) {");
        expect(pipeline).toContain("reason: 'pipeline_qa'");
        expect(pipeline).toContain('warmBrowserSession(panelSid)');
        expect(pipeline).toContain('waitForPanelWatcher(panelSid, 4000)');
        expect(pipeline).toContain('watchSessionId: panelSid || undefined');
        expect(pipeline).toContain('serveUrl: liveUrl');
        expect(pipeline).toContain('browserQaFailed = true');
    });

    it('does one bounded project_repair pass for blocking live QA, then rechecks the same live URL', () => {
        expect(pipeline).toContain("'project_repair'");
        expect(pipeline).toContain('browserQaRepairAttempted');
        expect(pipeline).toContain('browser QA bounded repair start');
        expect(pipeline).toContain('serveUrl: liveUrl');
        expect(pipeline).toContain('browser QA recheck score=');
        expect(pipeline).toContain('browserQaRepairStatus');
    });

    it('project_repair accepts explicit pipeline evidence and audits its live URL', () => {
        const repair = read('modules/tools/definitions/ProjectRepairTool.ts');
        expect(repair).toContain('serveUrl: { type:');
        expect(repair).toContain('artifactRootDir: { type:');
        expect(repair).toContain("const dir = String(input?.projectDir || built?.projectDir");
        expect(repair).toContain("...(serveUrl ? { serveUrl } : {})");
        expect(repair).toContain('artifactRootDir,');
        expect(repair).not.toContain('if (!built || !dir');
    });

    it('passes the same watched session through repair re-audits', () => {
        expect((builder.match(/watchSessionId: panelBrowserSid/g) || []).length).toBeGreaterThanOrEqual(2);
        expect(builder).toContain('onProgress: qaProgress');
        expect(builder).toContain('auditBehaviour(url, {');
    });

    it('visual audit borrows the panel page and leaves private fallback explicit', () => {
        expect(visual).toContain('getBrowserSession(opts.watchSessionId)');
        expect(visual).toContain('resumeStreamingIfWatched(opts.watchSessionId)');
        expect(visual).toContain("opts.onProgress?.('watching')");
        expect(visual).toContain('private:');
    });

    it('behaviour audit presses controls on the borrowed panel page', () => {
        expect(behaviour).toContain('getBrowserSession(opts.watchSessionId)');
        expect(behaviour).toContain("opts?.onProgress?.('pressing')");
        expect(behaviour).toContain('setSessionViewport(opts?.watchSessionId || \'\', 1280, 900)');
    });
});
