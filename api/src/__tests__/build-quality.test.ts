/**
 * Build-quality overhaul — locks the SIX defects measured on a real delivered
 * build (an admin dashboard the user photographed and reported):
 *
 *   1. the self-check runtime rendered as visible page text
 *   2. one broken section script killed every control on the page (script.js
 *      is a single file; the first uncaught error aborts the rest)
 *   3. repairs were written to the combined file while the audit URL served
 *      the untouched split folder — every repair "failed" and was reverted
 *   4. the File Explorer mirror wrote into a root the explorer never lists
 *   5. dashboards got zero photographs by design; the model's #i-search icon
 *      did not exist; hand-drawn SVG used var() in presentation attributes
 *      (discarded) and var(--on-brand) inks (white on white)
 *   6. the reply ended at "ask for a change" instead of naming the real next
 *      steps (publish, multi-page, style reference)
 */
import fs from 'fs';
import path from 'path';
import { ensureScriptTags, assemblePage } from '../core/design/section-writer';
import { splitHtmlProject } from '../core/quality/html-qa';
import { imageBudget } from '../core/design/blueprints';
import { iconSprite, normalizeIconRefs } from '../core/design/layouts';
import { sanitizeInlineSvg, labelIconOnlyButtons } from '../core/design/svg-sanity';
import { selfCheckScript } from '../core/design/self-check';

const builderSrc = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'WebPageBuilderTool.ts'), 'utf-8');
const wsSrc = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'services', 'WorkspaceService.ts'), 'utf-8');

describe('1 — no runtime can ever render as visible page text', () => {
    test('ensureScriptTags wraps bare JS and leaves wrapped scripts alone', () => {
        const mixed = `<script>var a=1;</script>\n(function(){var leak=true;})();\n<script>var b=2;</script>`;
        const out = ensureScriptTags(mixed);
        // Nothing outside a <script> element survives.
        const residue = out.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '').trim();
        expect(residue).toBe('');
        // The bare part is still there — inside tags now.
        expect(out).toContain('var leak=true');
        expect((out.match(/<script\b/gi) || []).length).toBe(3);
    });

    test('assemblePage output has no JS outside <script> elements, even when handed bare JS', () => {
        const html = assemblePage({
            title: 'T', isArabic: false, tokenCss: ':root{}', baseLayer: 'body{}',
            sections: [{ id: 's1', index: 1, spec: 'hero: x', html: '<section id="s1">hi</section>', ok: true } as any],
            sprite: '<svg style="display:none"></svg>',
            script: `<script>var ok=1;</script>\n(function(){var bare=1;})();`,
        });
        const body = (html.match(/<body[^>]*>([\s\S]*)<\/body>/i) || [, ''])[1]
            .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
            .replace(/<[^>]+>/g, ' ');
        expect(body).not.toContain('function');
        expect(body).not.toContain('bare');
    });

    test('selfCheckScript is already a complete <script> element', () => {
        expect(selfCheckScript(true).trimStart().startsWith('<script>')).toBe(true);
        expect(selfCheckScript(false).trimEnd().endsWith('</script>')).toBe(true);
    });
});

describe('2 — one broken section script cannot kill the rest of script.js', () => {
    test('each extracted part is fenced in its own try/catch', () => {
        const page = `<!DOCTYPE html><html><head><style>body{}</style></head><body>
<script>null.classList.add('boom');</script>
<script>window.__second_ran = true;</script>
</body></html>`;
        const split = splitHtmlProject(page);
        expect(split.multiFile).toBe(true);
        expect((split.js.match(/try\{/g) || []).length).toBe(2);
        expect((split.js.match(/catch\(e\)/g) || []).length).toBe(2);
        // PROOF by execution: run the concatenated file — the second part must
        // still run even though the first throws.
        const g: any = { __second_ran: false };
        // eslint-disable-next-line no-new-func
        new Function('window', 'console', split.js)(g, { error: () => { } });
        expect(g.__second_ran).toBe(true);
    });

    test('JSON-LD / importmap / module scripts are NOT moved into script.js', () => {
        const page = `<html><head></head><body>
<script type="application/ld+json">{"@type":"Store"}</script>
<script type="module">import x from './x.js';</script>
<script>var plain = 1;</script>
</body></html>`;
        const split = splitHtmlProject(page);
        expect(split.indexHtml).toContain('application/ld+json');
        expect(split.indexHtml).toContain('type="module"');
        expect(split.js).toContain('var plain = 1');
        expect(split.js).not.toContain('@type');
    });
});

describe('3 — repairs are written where the audit URL points', () => {
    test('every repair branch writes through writeOut (combined file + re-split project)', () => {
        // The old bug: fs.writeFileSync(combined) while `url` served the split
        // folder — re-audits measured an unchanged file, and every repair was
        // reverted as "did not improve". No repair branch may write directly.
        const auditsOn = builderSrc.indexOf('[VISUAL AUDIT]');
        expect(auditsOn).toBeGreaterThan(0);
        const afterAudits = builderSrc.slice(auditsOn, builderSrc.indexOf('private async repairSections'));
        expect(afterAudits).not.toMatch(/fs\.writeFileSync\(path\.join\(ARTIFACT_DIR, filename\)/);
        expect((afterAudits.match(/writeOut\(/g) || []).length).toBeGreaterThanOrEqual(8);
        expect(builderSrc).toMatch(/const writeOut = \(h: string\) => \{/);
        expect(builderSrc).toMatch(/writeOut[\s\S]{0,900}splitHtmlProject\(h\)/);
    });
    test('repairSections prefers the caller\'s writer over a raw file write', () => {
        expect(builderSrc).toMatch(/write\?: \(h: string\) => void/);
        expect(builderSrc).toMatch(/if \(write\) write\(out\);/);
    });
});

describe('4 — built files land in the root the File Explorer displays', () => {
    test('WorkspaceService exposes the explorer\'s own root', () => {
        expect(wsSrc).toMatch(/getExplorerRoot\(\): string/);
    });
    test('the mirror uses getExplorerRoot, runs AFTER the audits, and logs failures', () => {
        expect(builderSrc).toMatch(/workspaceService\.getExplorerRoot\(\)/);
        // No mirror may resolve through the tool's workspace context again.
        expect(builderSrc).not.toMatch(/getActiveRoot\(context\?\.workspaceId\)/);
        // Order: the audit passes come BEFORE the mirror block.
        const audit = builderSrc.indexOf('[VISUAL AUDIT]');
        const mirror = builderSrc.indexOf('workspaceService.getExplorerRoot()');
        expect(mirror).toBeGreaterThan(audit);
        expect(builderSrc).toMatch(/explorer mirror failed/);
        // The site path mirrors too — a site was never mirrored at all.
        expect((builderSrc.match(/getExplorerRoot\(\)/g) || []).length).toBeGreaterThanOrEqual(2);
    });
    test('the chat reply tells the user WHERE the files are', () => {
        expect(builderSrc).toMatch(/في مستعرض الملفات/);
    });
});

describe('5 — dashboards get real images; the sprite covers what models write; SVG is sane', () => {
    test('an admin dashboard has a photo budget (thumbs/avatars), an app screen too', () => {
        expect(imageBudget('dashboard' as any)).toBeGreaterThanOrEqual(3);
        expect(imageBudget('app' as any)).toBeGreaterThanOrEqual(2);
    });
    test('the sprite carries the admin-screen vocabulary — #i-search existed on the page and not in the sprite', () => {
        const sprite = iconSprite();
        for (const id of ['search', 'user', 'settings', 'bell', 'trash', 'edit', 'filter', 'logout', 'plus', 'eye'])
            expect(sprite).toContain(`id="i-${id}"`);
    });
    test('normalizeIconRefs repoints the new names too', () => {
        const r = normalizeIconRefs('<svg class="icon"><use href="#search"/></svg><svg class="icon"><use href="#bell"/></svg>');
        expect(r.fixed).toBe(2);
        expect(r.html).toContain('#i-search');
        expect(r.html).toContain('#i-bell');
    });
    test('var() in an SVG presentation attribute is moved into style, where it is legal', () => {
        const r = sanitizeInlineSvg('<svg viewBox="0 0 100 40"><text x="5" y="10" font-size="var(--step-0)" fill="var(--text)">93</text></svg>');
        expect(r.movedToStyle).toBe(2);
        expect(r.html).not.toMatch(/font-size="var\(/);
        expect(r.html).toMatch(/style="[^"]*font-size:var\(--step-0\)/);
        // Idempotent — running again changes nothing.
        expect(sanitizeInlineSvg(r.html).movedToStyle).toBe(0);
    });
    test('a var(--on-brand) sparkline (white on a white card, 1.05:1) becomes var(--brand)', () => {
        const r = sanitizeInlineSvg('<svg><polyline points="0,10 10,5" style="stroke:var(--on-brand);fill:none"/></svg>');
        expect(r.remappedOnBrand).toBe(1);
        expect(r.html).toContain('stroke:var(--brand)');
        // …but --on-brand OUTSIDE an <svg> (text on a brand band) is untouched.
        const keep = sanitizeInlineSvg('<div style="color:var(--on-brand)">hi</div>');
        expect(keep.remappedOnBrand).toBe(0);
    });
    test('icon-only buttons get an accessible name; named ones are left alone', () => {
        const r = labelIconOnlyButtons(
            '<button class="hx"><svg class="icon"><use href="#i-search"/></svg></button>'
            + '<button aria-label="بحث"><svg class="icon"><use href="#i-search"/></svg></button>'
            + '<button><svg class="icon"><use href="#i-cart"/></svg> السلة</button>', true);
        expect(r.fixed).toBe(1);
        expect(r.html).toContain('aria-label="بحث"');
    });
});

describe('6 — the build ends with executable next steps, not a shrug', () => {
    test('the reply proposes publish / multi-page / style-reference, in Arabic, as send-as-is lines', () => {
        expect(builderSrc).toMatch(/خطوات تالية يمكنني تنفيذها الآن/);
        expect(builderSrc).toMatch(/«انشر المشروع» → رابط دائم/);
    });
});
