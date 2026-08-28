/**
 * THE ARABIC WAS CAREFUL AND THE ENGLISH WAS NOT.
 *
 * Measured live, twice, on the owner's running Joe, with one request:
 *
 *     …a navigation menu that collapses into a hamburger button on a phone,
 *     a servings counter with plus and minus buttons…, and a print button.
 *
 *     first run   → MapApp.jsx, 491 lines of Leaflet   (`navigation`)
 *     second run  → Hero · Menu · Gallery · Story · Location · OrderButton
 *                   — a restaurant                      (`\bmenu\b`)
 *
 * Three patterns caught the same sentence, and all three are the same class:
 *
 *     app-blueprints.ts:215   ['maps',       /…|navigation|…/i]
 *     blueprints.ts:30        ['restaurant', /…|قائمة الطعام|منيو|…|\bmenu\b|…/i]
 *     ReactProjectTool:1207   { section: 'Menu', re: /\bmenu\b|قائمة\s*(?:ال)?طعام|منيو/i }
 *
 * ⛔ AND LOOK AT THE TWO HALVES OF THE SAME PATTERN. The Arabic demands the
 * word for FOOD — «قائمة الطعام», «منيو». The English is a bare `\bmenu\b`.
 * The very trap `CLAUDE.md` names — «قائمة» means both *list* and *menu*, so
 * it needs context — was understood, written down, applied to the Arabic, and
 * not carried across to the English three characters away.
 *
 * ⛔ AND THE COST IS NOT SYMMETRIC, which is what settles the direction. A
 * wrong archetype DISCARDS THE WHOLE REQUEST and builds a different product; a
 * missed one costs a word while the page is still built from his sentence. So
 * an ambiguous signal must resolve to «not this archetype».
 *
 * A restaurant request says restaurant, café, dishes, food, bakery, pizza —
 * and every one of those is still in the pattern, untouched. What is gone is
 * the assumption that a page with a menu in it must serve lunch.
 */

import { detectAppKind, APP_KIND_SIGNALS } from '../core/design/app-blueprints';
import fs from 'fs';
import path from 'path';

const q = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf-8');
const BLUEPRINTS = q('core', 'design', 'blueprints.ts');
const REACT = q('modules', 'tools', 'definitions', 'ReactProjectTool.ts');

/** The exact sentence he was given, and the shapes it comes in. */
const NAV_PHRASES = [
    'a navigation menu that collapses into a hamburger button on a phone',
    'a dropdown menu in the header',
    'a hamburger menu on mobile',
    'the main menu and a footer',
    'a side menu for the dashboard',
];

/** Requests that really do want a restaurant, in his languages. */
const REAL_RESTAURANTS = [
    'Build a page for our restaurant with photos of the dishes',
    'A cafe landing page with opening hours',
    'صفحة مطعم مع قائمة الطعام والأسعار',
    'A bakery site with a pizza menu and prices',
];

/** Pull one entry's pattern out of a source table, by its key. */
const patternFor = (source: string, key: string): RegExp => {
    const line = source.split('\n').find(l => l.includes(`['${key}',`) && l.includes('/i]'));
    if (!line) throw new Error(`no table entry for ${key}`);
    const body = line.slice(line.indexOf('/') + 1, line.lastIndexOf('/i]'));
    return new RegExp(body, 'i');
};

describe('a menu in a page is not a menu on a table', () => {
    const restaurant = patternFor(BLUEPRINTS, 'restaurant');

    it('⛔ POSITIVE — no nav phrasing makes the page a restaurant', () => {
        for (const phrase of NAV_PHRASES) {
            expect({ phrase, restaurant: restaurant.test(phrase) })
                .toEqual({ phrase, restaurant: false });
        }
    });

    it('⛔ NEGATIVE — and a real restaurant request still is one', () => {
        //  The repair must not close the door it exists to guard. Both
        //  languages, and the food words untouched.
        for (const req of REAL_RESTAURANTS) {
            expect({ req, restaurant: restaurant.test(req) })
                .toEqual({ req, restaurant: true });
        }
    });

    it('⛔ POSITIVE — and the Menu SECTION is not attached to a nav bar either', () => {
        //  Two writers, one rule: `blueprints.ts` decides the kind and
        //  `SECTION_ASKS` decides the sections. Repairing one and not the
        //  other leaves the defect standing while looking fixed — the class
        //  that has cost this repository more than any other.
        const line = REACT.split('\n').find(l => l.includes("section: 'Menu'"));
        expect(line).toBeTruthy();
        const body = line!.slice(line!.indexOf('re: /') + 5, line!.lastIndexOf('/i'));
        const section = new RegExp(body, 'i');
        for (const phrase of NAV_PHRASES) {
            expect({ phrase, menuSection: section.test(phrase) })
                .toEqual({ phrase, menuSection: false });
        }
        expect(section.test('our menu with the dishes and prices')).toBe(true);
        expect(section.test('قائمة الطعام')).toBe(true);
    });
});

describe('a navigation menu is not turn-by-turn navigation', () => {
    it('⛔ POSITIVE — the live request no longer summons a map', () => {
        expect(detectAppKind(
            'Create one polished page titled Phone Menu Check with a heading, a navigation '
            + 'menu that collapses into a hamburger button on a phone, a servings counter '
            + 'with plus and minus buttons that changes a visible number, and a print button.',
        )).not.toBe('maps');
    });

    it('⛔ NEGATIVE — a request that really wants a map still gets one', () => {
        expect(detectAppKind('Build a map of our branches with pins')).toBe('maps');
        expect(detectAppKind('An app with GPS tracking of the driver')).toBe('maps');
        expect(detectAppKind('Build a navigation app with turn-by-turn directions')).toBe('maps');
        expect(detectAppKind('ابنِ تطبيق خرائط يعرض المواقع')).toBe('maps');
    });

    it('⛔ NEGATIVE — «navigation» alone is not an alternative on its own', () => {
        //  Checked against the pattern, not a sentence: a sentence test passes
        //  again the moment someone re-adds the bare word somewhere else.
        const maps = APP_KIND_SIGNALS.find(([k]) => k === 'maps')?.[1];
        expect(String(maps!.source).split('|')).not.toContain('navigation');
    });
});
