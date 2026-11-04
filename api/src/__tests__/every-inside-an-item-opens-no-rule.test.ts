/**
 * ⛔ «EVERY» INSIDE AN ITEM QUANTIFIES IT; IT OPENS NO RULE.
 *
 * The hard exam, 2026-11-04, H01: «…, an audit log of every change, search and
 * filters, an Arabic/English language switch, and automated API tests.» The
 * list reader cut the list at « every » and kept «every change, search and
 * filters, an Arabic/English language switch, and automated API tests» as one
 * rule of the records — as it did with «every endpoint» (P102…P150), «كل
 * الحجوزات» (P252…P300) and «كل سطر» (P301…P349) across the 500 exam.
 *
 * «Each» and «every» open a rule only after a comma or an «and» («, and each
 * staff member only sees their own records», «، وكل موظف يرى سجلاته فقط»).
 * Measured over the 520 exam prompts: no table and no unread item of a
 * request that needs a server changed; only these false rules went.
 */
import { normaliseListedRequest } from '../core/design/listed-request';

const H01 = 'Build a complete clinic management system: React frontend, Node backend with SQLite, logins with three roles (admin, doctor, receptionist) and different permissions for each, patients, appointments with no double-booking and per-doctor working hours, invoices with payment status, a monthly revenue report with a chart, an audit log of every change, search and filters, an Arabic/English language switch, and automated API tests.';

describe('a rule that ends a records list', () => {
    it.each([
        ['H01', H01],
        ['a backup every night', 'Build a notes app: notes, folders, tags, a backup every night, and export to PDF.'],
        ['تذكير قبل كل موعد', 'ابني نظام عيادة: المرضى، المواعيد، تذكير قبل كل موعد، والفواتير.'],
        ['every endpoint', 'Create a REST API for a library with endpoints for books, members, loans, input validation, proper error codes, and automated tests for every endpoint.'],
    ])('«every» inside an item opens none (%s)', (_name, request) => {
        expect(normaliseListedRequest(request).rules).toEqual([]);
    });

    it.each([
        ['a comma and «and each»', 'Build a staff portal: employees, shifts, leave requests, and each staff member only sees their own records.', 'each staff member only sees their own records'],
        ['«and every»', 'Build a gym system: members, classes, payments and every trainer sees only their classes.', 'every trainer sees only their classes'],
        ['«، وكل»', 'ابني نظام موارد بشرية: الموظفين، الإجازات، الحضور، وكل موظف يرى سجلاته فقط.', 'كل موظف يرى سجلاته فقط'],
        ['«where»', 'Build a CRM: customers, deals, notes where each sales rep sees only their deals.', 'where each sales rep sees only their deals'],
    ])('a rule after a comma or an «and» is still a rule (%s)', (_name, request, rule) => {
        expect(normaliseListedRequest(request).rules.join(' ')).toContain(rule);
    });
});
