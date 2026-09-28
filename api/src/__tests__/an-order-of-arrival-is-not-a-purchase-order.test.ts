/**
 * AN ORDER OF ARRIVAL IS NOT A PURCHASE ORDER.
 *
 * Measured in real Joe UI run 17 (CRITICAL-REAL-JOE-UI-001): asked to «Build
 * a Node.js command-line tool named inival ... prints the section names in
 * order of appearance», Joe built api-inival/ (POST /api/orders shredded
 * from «in order of appearance») plus react-inival/ — a database-backed
 * system for a CLI specification. Cause: `dataSignals` carries bare
 * `orders?`, so the SEQUENCE sense of «order» commissions a database.
 *
 * The same defect covers «report» in its DOCUMENT sense: «print a summary
 * report» is output, not a reports database. Both words are the most
 * ambiguous nouns in the data list, so a bare match now needs corroboration
 * — a second domain noun, an owned backend, or app-scope evidence — exactly
 * as `structuredInteraction` already requires two structural signals before
 * a noun can promote a document. Strong domain nouns (suppliers, inventory,
 * invoices, payments, the Arabic purchase-order forms) still suffice alone.
 *
 * Note on the earlier diagnosis: a word boundary alone does NOT fix this.
 * «file order» and «in order of appearance» contain WHOLE-WORD «order», so
 * `\border\b` still matches. Only the sense — corroborated or not —
 * distinguishes a purchase order from an order of arrival.
 */

import { PlanningEngine } from '../core/orchestrator/PlanningEngine';

const scope = (t: string) => PlanningEngine.classifyBuildScope(t);

describe('a sequence or document is not a data service', () => {
    it('POSITIVE — sequence-sense order does not commission a database', () => {
        for (const t of [
            'Build a Node.js command-line tool named inival that validates INI-style config files. '
                + 'Running `node inival.js --list <file>` prints the section names in order of appearance, one per line.',
            'Build a tool that prints results in file order.',
            'Build a semver sorter that lists versions in reverse order, one per line.',
            'Build a CLI that merges rotated logs in chronological order.',
            'Build a word counter that prints words in alphabetical order with counts.',
            'Build a flight board that shows departures in boarding order.',
        ]) {
            expect({ t, scope: scope(t) }).toEqual({ t, scope: 'page' });
        }
    });

    it('POSITIVE — document-sense report does not commission a database', () => {
        for (const t of [
            'Build a CLI that prints a summary report of test results to stdout.',
            'Build a Node.js tool that reads a CSV file and prints a one-page report of column totals.',
        ]) {
            expect({ t, scope: scope(t) }).toEqual({ t, scope: 'page' });
        }
    });

    it('POSITIVE — a substring of a data noun is not the noun', () => {
        // «reorders» contains «orders»; «reported» contains «report». Neither
        // is a purchase order or a reports database.
        for (const t of [
            'Build a CLI that reorders CSV rows by the second column.',
            'Build a CLI that prints the reported exit code of each step.',
        ]) {
            expect({ t, scope: scope(t) }).toEqual({ t, scope: 'page' });
        }
    });

    it('NEGATIVE — a request that really owns order/report data is STILL a system', () => {
        // The assertion that stops this repair from becoming the opposite
        // defect: a bare order/report plus corroboration must keep its backend.
        for (const t of [
            // App-scope corroboration: an order MANAGER is data-owning by definition.
            'Build an order management system.',
            'Build an order tracker with live status.',
            // Strong-signal corroboration: a second domain noun / owned backend.
            'Build a backend API for orders with authentication and a database.',
            'Build a dashboard with user accounts and monthly reports.',
            'Build an inventory system with suppliers, orders and reports.',
            'Build a shop backend with purchase orders, invoices and stock control.',
            // The Arabic purchase-order forms are unambiguous and stay strong.
            'ابنِ نظاماً لمشتل نباتات: النباتات والموردون والطلبيات',
        ]) {
            expect({ t, scope: scope(t) }).toEqual({ t, scope: 'system' });
        }
    });

    it('THE FOURTH LAW TEST — unseen ordering phrasings behave the same', () => {
        // No ordering adjective is enumerated anywhere: corroboration reads
        // the CLAIM (is data owned?), not the adjective, so a phrasing Joe
        // has never seen is refused the same way.
        for (const t of [
            'Build a CLI that prints tree nodes in topological order, one per line.',
            'Build a CLI that lists symbols in lexical order.',
            'Build a CLI that plays tracks in the order the user queued them.',
        ]) {
            expect({ t, scope: scope(t) }).toEqual({ t, scope: 'page' });
        }
        // ...and the same unseen adjective, asked for as a system, stays one.
        expect(scope('Build an order fulfillment system with suppliers and delivery tracking.')).toBe('system');
    });

    it('NEGATIVE — the Arabic sequence sense was never a data signal', () => {
        // English-only phenomenon: the Arabic data list carries purchase-order
        // nouns, not the sequence noun, so this passed before and must keep
        // passing — it pins the asymmetry, not the repair.
        expect(scope('ابنِ أداة سطر أوامر تطبع الأقسام بترتيب الظهور.')).toBe('page');
    });
});
