/**
 * JOE'S OWN STORE COMPUTED THE TOTAL, SHOWED IT, AND WAS REFUSED FOR NOT
 * HAVING ONE.
 *
 * Watched live by the owner. He asked for «سلة شراء تحسب الإجمالي», Joe's store
 * engine did exactly that, and the run ended:
 *
 *     Stopped at step "Building" — acceptance_criteria_unmet: counter
 *
 * Read from the generated `src/components/ShopApp.jsx`, verbatim:
 *
 *     const total = useMemo(() => lines.reduce(
 *         (s, l) => s + Number(l.product.price || 0) * l.qty, 0), [lines]);
 *     <p className="cart-total"><span>{'الإجمالي'}</span><b>{money(total)}</b></p>
 *
 * The criterion accepted `{total}` and `{total.toLocaleString()}` — a value
 * shown bare, or with a method called ON it — and had no shape at all for a
 * value passed THROUGH a formatter, which is how every currency in this
 * repository is printed.
 *
 * ⛔ SO IT WAS A CRITERION JOE'S OWN GENERATOR COULD NOT SATISFY. That is the
 * mirror of a criterion that can never fail, and it is worse: it blocked a
 * correct delivery and told the owner his store had no total. The class is the
 * session's most expensive one — EVIDENCE MATCHING A SPELLING INSTEAD OF
 * TESTING THE CLAIM.
 *
 * The claim is «the computed total reaches the page». The negatives below are
 * what stop the repair from becoming a criterion that can never fail instead.
 */

import { computedTotalEvidence } from '../core/quality/acceptance';

/** The real shape of the cart in Joe's store engine. */
const CART = (shown: string) => `import React, { useMemo, useState } from 'react';

export default function ShopApp({ content }) {
  const [cart, setCart] = useState([]);
  const lines = cart.map((c) => ({ product: c.product, qty: c.qty }));
  const total = useMemo(() => lines.reduce((s, l) => s + Number(l.product.price || 0) * l.qty, 0), [lines]);
  return (
    <section className="cart">
      <p className="cart-total"><span>{'الإجمالي'}</span><b>${shown}</b></p>
    </section>
  );
}
`;

describe('a computed total counts however it is printed', () => {
    it('⛔ POSITIVE — the exact code that was refused: {money(total)}', () => {
        expect(computedTotalEvidence(CART('{money(total)}'))).toBe(true);
    });

    it('POSITIVE — and the two shapes that already passed still pass', () => {
        expect(computedTotalEvidence(CART('{total}'))).toBe(true);
        expect(computedTotalEvidence(CART('{total.toLocaleString()}'))).toBe(true);
    });

    it('POSITIVE — a formatter with more than one argument counts too', () => {
        //  `{formatPrice(total, currency)}` is the same claim with a second
        //  argument; refusing it would rebuild the defect one shape narrower.
        expect(computedTotalEvidence(CART('{formatPrice(total, currency)}'))).toBe(true);
    });

    //  ── and it must still be able to say NO ──────────────────────────────
    it('NEGATIVE — a total that is computed and never shown is refused', () => {
        const hidden = `import React, { useMemo, useState } from 'react';

export default function ShopApp({ content }) {
  const [cart, setCart] = useState([]);
  const lines = cart.map((c) => ({ product: c.product, qty: c.qty }));
  const total = useMemo(() => lines.reduce((s, l) => s + Number(l.product.price || 0) * l.qty, 0), [lines]);
  return (<section className="cart"><p>{'الإجمالي'}</p></section>);
}
`;
        expect(computedTotalEvidence(hidden)).toBe(false);
    });

    it('NEGATIVE — a page that prints a DIFFERENT value is not a total', () => {
        //  The formatter shape must not turn «any call with any argument» into
        //  evidence — that would be the tick-for-any-number defect returning.
        expect(computedTotalEvidence(CART('{money(subtotalOfSomethingElse)}'))).toBe(false);
    });

    it('NEGATIVE — a name that merely CONTAINS the binding is not the binding', () => {
        //  `totalsCount` is not `total`. Without a word boundary the check
        //  would accept a neighbour's variable and call the claim proved.
        expect(computedTotalEvidence(CART('{money(totalsCount)}'))).toBe(false);
    });

    it('NEGATIVE — a page with no computed total at all is refused', () => {
        const none = `import React from 'react';

export default function ShopApp({ content }) {
  return (<section className="cart"><p className="cart-total">{'الإجمالي'}: 0</p></section>);
}
`;
        expect(computedTotalEvidence(none)).toBe(false);
    });
});
