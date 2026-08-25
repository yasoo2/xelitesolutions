/**
 * FIVE COMPONENTS DECIDED WHERE «CONTACT» WAS, AND ALL FIVE WERE WRONG.
 *
 * An in-page anchor to the contact section is right on a single page. On a
 * multi-page app that section lives on its own page, so on every other page —
 * including the home page, where the hero's main call to action sits — the
 * anchor resolves to nothing.
 *
 * Measured live on «اعمل لي صفحة هبوط وصفحة تواصل لشركة تنظيف», on a build
 * whose routes were correct:
 *
 *     🔎 84/100 — وجدت:
 *        • 12 رابط تنقّل يشير إلى قسم غير موجود في الصفحة
 *        • أزرار لا تستجيب: «#/contact تواصل»
 *
 * Five components asking one question is five chances to answer it differently,
 * and the question — «where does contact live in THIS build?» — has exactly one
 * answer, which depends on a page plan the components cannot see.
 *
 * So the guard holds the shape rather than the string: no component may write
 * the anchor literally, and the one place that decides must consult both
 * whether the app is multi-page and which page carries the section.
 */

import * as fs from 'fs';
import * as path from 'path';

const SOURCE = path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts');
const raw = fs.readFileSync(SOURCE, 'utf8');

/**
 * The CODE, without the prose that describes it.
 *
 * A guard that scans a whole file finds the defect quoted in the comment that
 * explains the defect, and goes red on a tree that is already fixed. That
 * happened three separate times today. A guard has to tell an instruction from
 * a description of one.
 */
const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .filter(l => !l.trim().startsWith('//'))
    .join('\n');

/** Built from parts, so this file does not match its own scan. */
const LITERAL_ANCHOR = new RegExp('href=' + '"' + '#contact' + '"', 'g');

describe('no component decides for itself where contact is', () => {
    it('not one literal contact anchor survives in a component template', () => {
        const hits = (src.match(LITERAL_ANCHOR) || []).length;
        expect(`literal-contact-anchors:${hits}`).toBe('literal-contact-anchors:0');
    });

    it('the components ask instead, and keep a fallback', () => {
        const asks = (src.match(/href=\{content\.contactHref/g) || []).length;
        //  Five is where this started. More is fine; fewer means one of them
        //  went back to deciding for itself.
        expect(asks).toBeGreaterThanOrEqual(5);
    });
});

describe('and the one reader answers from the page plan', () => {
    const block = (() => {
        const at = src.indexOf('contactHref = (()');
        return at < 0 ? '' : src.slice(at, at + 1200);
    })();

    it('there is exactly one such reader', () => {
        expect((src.match(/contactHref\s*=\s*\(\(\)/g) || []).length).toBe(1);
    });

    it('it asks whether the build is multi-page at all', () => {
        expect(block).toContain('multiPage');
    });

    it('it finds the page that actually carries the section', () => {
        //  Not «the second page», not «contact.html» — the page whose section
        //  list contains Contact. A build where he named the page something
        //  else entirely still has to work.
        expect(block).toMatch(/pages\.find\(/);
        expect(block).toContain("includes('Contact')");
    });

    it('it prefers the in-page anchor when Contact is on the home page', () => {
        //  A multi-page site can still carry Contact on «/» — his named pages
        //  decide that, not a shape. Then the anchor is correct and cheaper.
        expect(block).toMatch(/path === '\/'/);
    });

    it('and it invents nothing when no page carries the section', () => {
        //  A dead anchor is a finding the audit reports honestly. A route to a
        //  page that does not exist is a 404 with no explanation, which is
        //  worse: it looks like it worked.
        expect(block.slice(block.indexOf('holder'))).toContain('#contact');
    });
});
