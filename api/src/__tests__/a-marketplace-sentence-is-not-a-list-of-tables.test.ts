/**
 * ⛔ «CUSTOMERS SEARCH WITH FILTERS AND BOOK» IS A SENTENCE, NOT TWO TABLES
 * (named-entities.ts isActorClause; scope-audit.ts multi_vendor, payments).
 *
 * The hard sample, 2026-11-09 (L372, a two-sided marketplace): «providers
 * create listings with availability, customers search with filters and book,
 * payments are held until completion, both sides review each other, and admins
 * moderate». The marketplace searched, booked, held payments and moderated, and
 * was refused five times in 33 minutes: «requested_entities_not_delivered:
 * customers search with filters; books», and «missing: multi-vendor
 * marketplace, payments» — its sellers were `providerId`, its held payments at
 * /api/admin/payments. Pinned: who-then-what is a clause, a bare verb after
 * one goes on with it, a list of records is still records; and a marketplace
 * of providers, and a payment held in escrow, are what they are.
 */
import { requestedRecords } from '../core/quality/request-coverage';
import { isActorClause } from '../core/design/named-entities';
import { capabilityEvidence, requestedCapabilities } from '../core/quality/scope-audit';

const MARKET = 'Build a two-sided marketplace for recruitment agency services: providers create listings with availability, customers search with filters and book, payments are held until completion, both sides review each other, and admins moderate.';

test.each([
    ['customers search with filters', true],
    ['admins moderate', true],
    ['users can export reports', true],
    ['both sides review each other', true],
    ['admin approves listings', true],
    ['الأطباء يراجعون المواعيد', true],
    ['customer orders', false],
    ['customer reviews', false],
    ['user profiles', false],
    ['products', false],
    ['المرضى', false],
])('«%s» is a sentence: %s', (item, sentence) => {
    expect(isActorClause(item)).toBe(sentence);
});

test('the marketplace\'s sentences are not tables; a list of records still is', () => {
    const market = requestedRecords(MARKET, { backendRequested: true }).entities.map(e => e.key);
    expect(market).not.toEqual(expect.arrayContaining(['books']));
    expect(market.some(k => /search|moderat/.test(k))).toBe(false);
    const shop = requestedRecords('Build a backend for my shop: products, product photos, customers, orders and customer reviews.', { backendRequested: true }).entities.map(e => e.key);
    expect(shop).toEqual(expect.arrayContaining(['products', 'customers', 'orders', 'reviews']));
    const clinic = requestedRecords('ابني نظاماً لإدارة عيادة: المرضى والمواعيد والفواتير، والأطباء يراجعون المواعيد', { backendRequested: true });
    expect(clinic.entities.map(e => e.key)).toEqual(expect.arrayContaining(['patients', 'appointments', 'invoices']));
    expect(clinic.clauses).toContain('الأطباء يراجعون المواعيد');
});

test('a marketplace of providers, and a payment held until the work is done, are found in the code', () => {
    const caps = requestedCapabilities(MARKET);
    const market = caps.find(c => c.id === 'multi_vendor')!;
    const pay = caps.find(c => c.id === 'payments')!;
    expect(market && pay).toBeTruthy();
    const source = `app.post('/api/listings', (req, res) => { const listing = { id, providerId: req.user.id }; });
app.get('/api/admin/payments', admin, (req, res) => res.json(db.bookings.map(b => ({ id: b.id, paymentStatus: b.paymentStatus }))));`;
    expect(capabilityEvidence(market, source)).toBe(true);
    expect(capabilityEvidence(pay, source)).toBe(true);
    //  A shop of one seller is still not a marketplace.
    expect(capabilityEvidence(market, `app.get('/api/products', list); const order = { customerId, total };`)).toBe(false);
});
