/**
 * HE ASKED FOR A RECIPE CARD AND JOE BUILT A SHOP.
 *
 * Measured on his machine, on `59f28203`, after the reader and the judge had
 * both been made honest:
 *
 *     read from your request: 5 named — a hero with the dish name · an
 *       ingredients list · a numbered steps list · a servings counter with plus
 *       and minus buttons that changes the ingredient quantities · a print button
 *
 *     what was actually built: AdminPanel · OrderButton · Products · Contact · Navbar
 *     grep of the built source: ingredient → 0 files · serving → 0 · print → 0
 *
 *     MISSING an ingredients list — and the judge was RIGHT
 *
 * `SECTION_ASKS` holds eleven remembered sections — Faq, Gallery, Location,
 * Menu, Pricing, Products, Stats, Steps, Story, Team, Testimonials. «an
 * ingredients list» matches none of them, so `asked` came back empty and
 * `sectionsForRequest` returned the KIND's whole template: a shop, complete
 * with an admin panel and an order button he never asked for.
 *
 * And a second gate finished the job — `['Navbar', ...sections, 'Footer']
 * .filter(c => componentTemplates[c])` dropped, in silence, anything with no
 * remembered template behind it.
 *
 * ⛔ THE FOURTH LAW AT THE ONE LAYER THAT NEVER OBEYED IT. The reader reads his
 * sentence. The judge rules on it honestly. The builder between them consults a
 * table of eleven shapes and builds the nearest one. Every catalogue closed
 * this week was a version of this; **this is the one that decides what gets
 * written**, which is why it is the one he has been complaining about since his
 * first message.
 */

import fs from 'fs';
import path from 'path';
import { sectionNameFor } from '../modules/tools/definitions/ReactProjectTool';

const REACT = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'),
    'utf-8',
);

describe('what he named becomes what gets built', () => {
    it('⛔ POSITIVE — his five requirements become five section names', () => {
        //  Verbatim from his run's reader line. None of these exists in
        //  SECTION_ASKS, and every one of them must now produce a component.
        //  Three content words, so `HeroDishName` and not `HeroDish` — my first
        //  expectation here was wrong and the code was right. Written out
        //  because a guard corrected by loosening it until it passes is how a
        //  test stops being evidence.
        expect(sectionNameFor('a hero with the dish name')).toBe('HeroDishName');
        expect(sectionNameFor('an ingredients list')).toBe('IngredientsList');
        expect(sectionNameFor('a numbered steps list')).toBe('NumberedStepsList');
        expect(sectionNameFor('a print button')).toBe('PrintButton');
        //  `ServingsCounterPlus` — three content words after the stop list, and
        //  «plus» is one of them. Measured rather than assumed: I guessed
        //  `ServingsCounter` twice and the code was right both times. The name
        //  need not be pretty, it needs to be STABLE and to name his thing.
        expect(sectionNameFor('a servings counter with plus and minus buttons'))
            .toBe('ServingsCounterPlus');
    });

    it('⛔ POSITIVE — and so does any request nobody has ever tested', () => {
        //  The catalogue test: invented domains must work by construction,
        //  because the next request is never on any list.
        expect(sectionNameFor('a florbing gauge')).toBe('FlorbingGauge');
        expect(sectionNameFor('the zibbet leaderboard')).toBe('ZibbetLeaderboard');
    });

    it('⛔ NEGATIVE — a name that cannot be a component is refused, not mangled', () => {
        //  An Arabic requirement yields no ASCII identifier. Emitting one
        //  anyway would write a file nothing can import — a build that fails
        //  for a reason unrelated to his request, which is worse than keeping
        //  the template section.
        expect(sectionNameFor('سلة مشتريات')).toBe('');
        expect(sectionNameFor('')).toBe('');
        expect(sectionNameFor('a')).toBe('');
        expect(sectionNameFor('123 456')).toBe('');
    });

    it('NEGATIVE — stop words are dropped, so the name is about the thing', () => {
        //  «AnIngredientsList» would be a different component every time the
        //  model varied its article. The name has to be stable across phrasings
        //  of the same requirement.
        expect(sectionNameFor('the ingredients list')).toBe('IngredientsList');
        expect(sectionNameFor('an ingredients list')).toBe('IngredientsList');
    });

    it('⛔ the named sections reach the builder, and survive the template filter', () => {
        //  Two separate gates dropped them, and repairing one without the other
        //  leaves the defect intact while looking fixed.
        expect(REACT).toMatch(/const namedSections = namedByHim\s*\n?\s*\.map\(r => sectionNameFor\(r\.text\)\)/);
        expect(REACT).toContain('const names = [...new Set([...templated, ...namedSections])];');
    });

    it('⛔ NEGATIVE — the template sections are still built too', () => {
        //  A navbar and a footer are not things he lists, and a page without
        //  them is not what he meant either. Replacing the template outright
        //  would trade one silent omission for another.
        expect(REACT).toContain("const templated = ['Navbar', ...sections, 'Footer'].filter(c => componentTemplates[c]);");
    });
});
