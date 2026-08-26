/**
 * EVERY PRODUCT IN JOE'S STORE IS A GREY BOX.
 *
 * The owner opened a coffee storefront somebody else had built and asked why
 * Joe cannot produce one. Its products are drawn: a bag with a label plate
 * coloured per roast, a crimped top, a batch stamp. Joe's product grid, from
 * the generator itself:
 *
 *     react-app-templates.ts:4590
 *       {webImage(p.image) ? <img src={webImage(p.image)} …/>
 *                          : <div className="product-noimg" aria-hidden="true" />}
 *
 *     react-app-templates.ts:4666
 *       .product img, .product-noimg { … background: var(--line); }
 *
 * So a product with no image URL — which is every product, until someone
 * types one — renders as an empty rectangle in the border colour. A shop
 * whose entire catalogue is grey rectangles does not look unfinished; it
 * looks broken.
 *
 * AND THE DRAWER WAS ALREADY THERE, in the same file, already palette-aware:
 *
 *     react-app-templates.ts:661
 *       export function cardFor(name, brandHue) { … }
 *       var h = typeof brandHue === 'number'
 *             ? (brandHue + hueOf(name) % 40) % 360 : hueOf(name);
 *
 * It takes the brand hue and varies it slightly per row, so a coffee shop's
 * tiles are shades of its own colour rather than a rainbow. The records grid
 * calls it. The image field's preview calls it. The STORE does not — it draws
 * its own grey div two thousand lines away.
 *
 * THE CLASS is this session's third, in its fifth instance: two parties that
 * must agree, maintained separately, with nothing forcing them. Colours,
 * typefaces, sections, motion — and now the product itself. Each file correct
 * on its own, and half of Joe's output never reached by the layer.
 *
 * The negative cases matter: a real image URL must still win, and the empty
 * draft must still be the quiet slate rather than a colour derived from a
 * name that does not exist yet.
 */

import fs from 'fs';
import path from 'path';

const SRC = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'react-app-templates.ts'), 'utf-8');

/** The store's product tile, isolated by its own class name. */
function productTile(): string {
    const at = SRC.indexOf('className="product"');
    //  The anchor is proven before anything is built on it: indexOf returns
    //  -1 when the markup moves, and a negative assertion over the slice from
    //  -1 would pass on nothing at all.
    expect(at).toBeGreaterThan(-1);
    const end = SRC.indexOf('product-foot', at);
    expect(end).toBeGreaterThan(at);
    return SRC.slice(at, end);
}

describe('a product with no photo is drawn, not left blank', () => {
    it('POSITIVE — the store tile asks the card drawer', () => {
        expect(productTile()).toContain('cardFor');
    });

    it('POSITIVE — and no longer renders an empty div in its place', () => {
        expect(productTile()).not.toContain('product-noimg');
    });

    it('POSITIVE — the drawer is handed the brand hue, not left to a name hash', () => {
        //  A coffee shop's tiles must be shades of its own colour. cardFor
        //  already accepts the hue; the caller has to pass it.
        expect(productTile()).toMatch(/cardFor\([^)]*,\s*[A-Za-z_$][\w$]*\)/);
    });

    it('NEGATIVE — a real image URL still wins', () => {
        //  The drawn card is a FALLBACK. A shop that ignores the photo its
        //  owner uploaded is a worse defect than the one being closed.
        expect(productTile()).toContain('webImage(p.image)');
    });

    it('NEGATIVE — the drawer still answers an empty name with a quiet slate', () => {
        //  «An empty draft is not a red plant» — that reading already exists
        //  in cardFor and must survive being called from one more place.
        const at = SRC.indexOf('export function cardFor');
        expect(at).toBeGreaterThan(-1);
        const fn = SRC.slice(at, SRC.indexOf('\n}', at));
        expect(fn).toContain('empty');
    });

    it('NEGATIVE — the records grid keeps the caller it already had', () => {
        //  Wiring a second caller must not disturb the first.
        expect(SRC).toContain('cardFor(draft[primary.key])');
    });
});
