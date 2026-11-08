/**
 * A FORM IS NOT AN ACCOUNT SYSTEM, AND A DISCOUNT FIELD IS NOT A COUPON SYSTEM.
 *
 * The ladder, 2026-11-08: every English «registration form … password with
 * strength meter» (L072–L080) was refused four times for «missing: user
 * accounts», and every English «price calculator: quantity, unit price,
 * discount percent and tax» (L061–L069) for «missing: coupons and discounts».
 * Their Arabic twins passed. Joe held its own good pages to systems nobody
 * asked for. Pinned: those requests ask for no such system; a request that
 * names the system still does.
 */
import { requestedCapabilities } from '../core/quality/scope-audit';

const ids = (request: string) => requestedCapabilities(request).map(c => c.id);

describe('a page with a form asks for the form, not for the system behind it', () => {
    test.each([
        'Build a registration form for a water delivery company with name, email, phone, a date of birth and a password with strength meter; show clear inline errors and a success message.',
        'Build a sign-up form for a gym with name, email and password, and validate every field.',
        'Make a login page for a bakery with email and password fields and a "forgot password" link.',
    ])('«%s» does not ask for user accounts', request => {
        expect(ids(request)).not.toContain('accounts');
    });

    test.each([
        'Build a clinic system with user accounts, registration and login.',
        'Build a registration form that stores the users in a database on the server.',
        'Make a login page where users log in to see their orders.',
        'Build an online store with authentication and an admin dashboard.',
        'Add login and registration to the app.',
    ])('«%s» still asks for user accounts', request => {
        expect(ids(request)).toContain('accounts');
    });
});

describe('a discount field asks for the field, not for coupons', () => {
    test.each([
        'Build a price calculator page for a warehouse: quantity, unit price, discount percent and tax, with the total updating as you type and validation of every field.',
        'Make an invoice page with a discount rate and VAT.',
        'Build a calculator with a percentage of discount and a total.',
    ])('«%s» does not ask for coupons', request => {
        expect(ids(request)).not.toContain('coupons');
    });

    test.each([
        'Build an online store with coupons and discounts.',
        'Add promo codes to the checkout.',
        'Build a shop where the owner manages discounts and coupon codes.',
        'Build a price calculator with a discount percent and a promo code field.',
    ])('«%s» still asks for coupons', request => {
        expect(ids(request)).toContain('coupons');
    });
});
