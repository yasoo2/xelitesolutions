/**
 * HE RESTARTED JOE ON HIS OWN LAPTOP AND WAS ASKED FOR A PASSWORD.
 *
 * Seen in front of him, immediately after a restart: the Joe page redirected
 * to /login and asked for an email, a password, or a Google account — on a
 * single-user install, on his own machine, with this three lines into the
 * script that starts it:
 *
 *     start-joe.ps1:24   $env:ENABLE_AUTH_BYPASS = "true"
 *
 * The server had been serving him without a token the whole time. The CLIENT
 * had not: its three ways past the login page were `import.meta.env.DEV`, a
 * build-time VITE_ variable, and a URL parameter — every one of them decided
 * by the browser bundle, and not one of them asking the server. He runs a
 * PRODUCTION web build against a DEVELOPMENT server, so the two disagreed and
 * the side that cannot know won.
 *
 * The class is the seam again: two parties that must agree about one fact,
 * each holding half of it, with nothing making them compare. The same shape as
 * the delivery list and the judge's vocabulary drifting apart, and as the
 * acceptance ledger calling a clause unchecked while another reader judged it.
 *
 * This adds no permission. The server has been answering these requests
 * without a token all along; the flag says out loud what it was already doing,
 * where the other side can read it. With NODE_ENV=production, or the bypass
 * off, it is false — and the negative cases below are what hold that in place,
 * because a convenience that can be talked into opening a real deployment's
 * front door is not a convenience.
 */

import { joeRunsWithoutAccounts } from '../api/app';

describe('the server states whether this install has accounts', () => {
    it('a single-user dev install says so', () => {
        expect(joeRunsWithoutAccounts({ NODE_ENV: 'development', ENABLE_AUTH_BYPASS: 'true' } as any)).toBe(true);
    });

    it('and production never does, whatever the bypass says', () => {
        //  The one that matters: a deployment must not be talked into opening
        //  its own front door by an environment variable that travelled with
        //  it from someone's laptop.
        expect(joeRunsWithoutAccounts({ NODE_ENV: 'production', ENABLE_AUTH_BYPASS: 'true' } as any)).toBe(false);
    });

    it('nor does a dev server with the bypass off, or absent', () => {
        expect(joeRunsWithoutAccounts({ NODE_ENV: 'development', ENABLE_AUTH_BYPASS: 'false' } as any)).toBe(false);
        expect(joeRunsWithoutAccounts({ NODE_ENV: 'development' } as any)).toBe(false);
        expect(joeRunsWithoutAccounts({} as any)).toBe(false);
    });

    it('and only the exact word «true» opens it', () => {
        //  «1», «yes» and «TRUE» are the shapes a hurried hand types, and each
        //  of them silently meaning yes is how a bypass spreads to machines
        //  nobody audited. One spelling, stated.
        for (const v of ['1', 'yes', 'TRUE', 'True', ' true', 'true ']) {
            expect(joeRunsWithoutAccounts({ NODE_ENV: 'development', ENABLE_AUTH_BYPASS: v } as any)).toBe(false);
        }
    });

    it('the answer is always a boolean, never absent', () => {
        //  An absent field and a false one read alike to a client that tests
        //  truthiness, and «I did not answer» is not «no» — the distinction
        //  this whole night has been about.
        expect(typeof joeRunsWithoutAccounts({} as any)).toBe('boolean');
    });
});
