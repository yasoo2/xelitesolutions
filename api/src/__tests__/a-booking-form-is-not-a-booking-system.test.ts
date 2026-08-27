/**
 * A BOOKING FORM IS NOT A BOOKING SYSTEM.
 *
 * Measured on the owner's own sentence, with the classifier itself, after he
 * watched the run and said nothing had changed:
 *
 *     «Build a responsive website for a neighborhood bicycle repair studio
 *       called Spoke & Stem. Include a service list with prices, opening
 *       hours, location, phone CTA, and a booking form.»   -> scope = system
 *
 *     the same sentence with «and a booking form» removed  -> scope = page
 *
 * One phrase moved a five-line brochure into `system`. `deterministicPhasesFor`
 * then returns the two-phase plan — `api_project`, then `react_project` — so
 * Joe built him a database with a `users` table, shipped the `#/admin` screen
 * that every API-linked app ships, and **failed on the admin page it had
 * invented, blocking the site he actually asked for.** He never asked for
 * accounts, a database, or an admin panel. What he saw was:
 *
 *     🔑 Test account credentials — owner@spoke-stem.local / ZQv70_QUwfi-
 *     Error: broken_routes — 1 page(s) did not open: #/admin
 *     ⚠️ Build stopped honestly
 *
 * ⛔ THE CAUSE IS ONE TOKEN READING A NOUN WITHOUT ITS HEAD. `dataSignals`
 * carries `bookings?`, which matches inside «booking form». A booking FORM is
 * an element on a page. `orders?` does the same to «order button», `reports?`
 * to «reports section», `payments?` to «payment form» — the family this
 * repository has been closing all week, where a pattern matches a word instead
 * of examining the claim.
 *
 * ⛔ AND THE FUNCTION ALREADY KNEW THE SHAPE. It calls `stripDeclaredOptions`
 * because «a declared category list is field OPTIONS, not scope evidence» —
 * the same lesson, one step over, learned once and not carried across.
 */

import { PlanningEngine } from '../core/orchestrator/PlanningEngine';

const SPOKE = 'Build a responsive website for a neighborhood bicycle repair studio called Spoke & Stem. Include a service list with prices, opening hours, location, phone CTA, and a booking form.';

const scope = (t: string) => PlanningEngine.classifyBuildScope(t);

describe('an element on a page is not a data service', () => {
    it('⛔ POSITIVE — his sentence, verbatim, is a page and not a system', () => {
        //  The one that cost him an admin panel, a password, and his build.
        expect(scope(SPOKE)).not.toBe('system');
    });

    it('⛔ POSITIVE — and the same for every noun wearing a widget', () => {
        //  Not «fix booking» — fix the family. Each of these is a control on a
        //  page, and none of them means Joe should own a database.
        for (const t of [
            'Build a landing page for a clinic with an appointment form.',
            'Build a small site for a bakery with an order button on each product.',
            'Build a one-page site for an accountant with a reports section describing the service.',
            'Build a page for a charity with a payment link in the footer.',
            'اعمل صفحة هبوط لعيادة فيها نموذج حجز موعد',
            'اعمل صفحة لمطعم فيها زر الطلب وقائمة الأسعار',
        ]) {
            expect({ t, scope: scope(t) }).not.toEqual({ t, scope: 'system' });
        }
    });

    it('⛔ NEGATIVE — a request that really owns data is STILL a system', () => {
        //  The assertion that stops this repair from becoming the opposite
        //  defect. Widening the strip until a real backend request slips
        //  through would leave him with a front end and nowhere to put a row —
        //  a worse failure than the one being fixed, and a silent one.
        for (const t of [
            'Build a bookings system with user accounts and an admin dashboard.',
            'Build an inventory system with suppliers, orders and reports.',
            'Build a REST API and a database for a clinic, plus a front end.',
            'ابنِ نظام حجوزات فيه حسابات مستخدمين ولوحة تحكم',
            'ابنِ نظاماً لمشتل نباتات: النباتات والموردون والطلبيات',
        ]) {
            expect({ t, scope: scope(t) }).toEqual({ t, scope: 'system' });
        }
    });

    it('⛔ THE FOURTH LAW TEST — a noun Joe has never seen behaves the same', () => {
        //  Every case above uses a REAL word: booking, order, reports, payment.
        //  A repair that passed those and failed this would be the catalogue
        //  again in a new spot — five known nouns special-cased, and the sixth
        //  request back to building a database for a brochure.
        //
        //  These invented nouns are free IF the strip reads the trailing
        //  ELEMENT word and ignores what sits in front of it, which is the
        //  whole design. So they are asserted rather than assumed, because
        //  «it should work by construction» is not a measurement.
        expect(scope('Build a page with a florbing form.')).toBe('page');
        expect(scope('Build a landing page for a shop with a zibbet button.')).toBe('page');
        expect(scope('اعمل صفحة فيها نموذج فلربة')).toBe('page');
        //  ...and the same invented noun, asked for as a system, stays one.
        expect(scope('Build a florbing system with user accounts and an admin dashboard.')).toBe('system');
    });

    it('NEGATIVE — the strip removes the element, not the subject around it', () => {
        //  «a bakery with an order button» must still be recognisably a bakery
        //  site. If stripping ate the surrounding words the classifier would be
        //  answering about a different sentence.
        expect(scope('Build a landing page for a bakery with an order button.')).toBe('page');
        expect(scope('Build a portfolio site with a contact form.')).toBe('page');
    });

    it('NEGATIVE — an unchanged sentence is returned unchanged', () => {
        //  Nothing to strip must mean nothing stripped: a classifier that
        //  quietly rewrites input it was not meant to touch would move verdicts
        //  nobody asked it to move.
        const plain = 'Build a simple counter app with a button that increments the count.';
        expect(scope(plain)).toBe('app');
        expect(scope('Build a dashboard for tracking tasks.')).toBe('app');
    });
});
