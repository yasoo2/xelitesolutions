/**
 * ⛔ «NODE BACKEND WITH SQLITE» IS THE STACK HE WANTS, NOT A RECORD TO SERVE.
 *
 * The hard exam, 2026-11-04, H01: a clinic of 29 files that passed the build,
 * the live run, the tests, the service, all 19 requirements and the Browser QA
 * was refused four times in a row with «requested items that could not be
 * read: Node backend with SQLite». «React frontend» beside it was read as the
 * interface it is, because its head is its last word; «Node backend with
 * SQLite» ends in the database, so its head — the word before what qualifies
 * it — was never looked at. The builder could change nothing to answer it.
 *
 * English names the head last, or right before a qualifier («with», «using»,
 * «on», «backed by»…): a backend with a database is a backend. A record with a
 * qualifier is still a record («invoices with payment status»).
 */
import { isFeaturePhrase } from '../core/design/listed-request';
import { listedRecords } from '../core/design/named-entities';
import { requestedRecords } from '../core/quality/request-coverage';

const H01 = 'Build a complete clinic management system: React frontend, Node backend with SQLite, logins with three roles (admin, doctor, receptionist) and different permissions for each, patients, appointments with no double-booking and per-doctor working hours, invoices with payment status, a monthly revenue report with a chart, an audit log of every change, search and filters, an Arabic/English language switch, and automated API tests.';

describe('a stack he names', () => {
    it.each([
        'Node backend with SQLite',
        'a Node.js backend using PostgreSQL',
        'an Express server on SQLite',
        'a REST API backed by MongoDB',
        'React frontend',
        'logins with three roles',
    ])('«%s» is an interface or stack phrase, never a record', phrase => {
        expect(isFeaturePhrase(phrase)).toBe(true);
    });

    it.each([
        'invoices with payment status',
        'appointments with no double-booking',
        'patients',
        'orders from customers',
    ])('«%s» is still a record', phrase => {
        expect(isFeaturePhrase(phrase)).toBe(false);
    });

    it('H01 leaves nothing unread, and its records are still his records', () => {
        const reading = requestedRecords(H01, { backendRequested: true });
        expect(reading.unread).toEqual([]);
        expect(reading.entities.map(e => e.key)).toEqual(expect.arrayContaining(['patients', 'appointments', 'invoices']));
        const entries = listedRecords(H01, { backend: true }).entries;
        expect(entries.some(e => /sqlite/iu.test(e.item))).toBe(false);
    });
});
