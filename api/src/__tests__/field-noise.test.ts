/**
 * TWO KINDS OF NOISE IN THE FIELD LOG, both of them work nobody asked for.
 *
 * 1. «[GoogleOAuth] refresh failed (401): invalid_client The provided client
 *    secret is invalid.» — printed on EVERY profile fetch, each one a real
 *    round trip to Google (0.35s and 1.57s in the log). Wrong credentials do
 *    not become right between two requests.
 * 2. «[MongoDB] Failed to save to DB (continuing with cache)» — printed after
 *    every upload on a machine running JSON persistence, where there is no
 *    database to connect to at all.
 *
 * Both are now silent by construction, and both stay honest: a credential
 * fix is picked up without a restart, and a deployment WITH a database still
 * gets its mirror write.
 */
import fs from 'fs';
import path from 'path';

describe('Google credentials Joe already knows are wrong', () => {
    const SRC = fs.readFileSync(path.join(__dirname, '..', 'modules', 'integrations', 'googleOAuth.ts'), 'utf-8');

    it('the rejection is remembered against the CREDENTIALS, not the user', () => {
        // Keyed by client id + secret tail: change either and the next call
        // goes straight through, with no restart and no stale ban.
        expect(SRC).toContain('const credentialsKey = ()');
        expect(SRC).toMatch(/badCredentialsUntil\.set\(credentialsKey\(\)/);
    });

    it('a rejected credential short-circuits BEFORE the refresh call', () => {
        // Scoped to getAccessToken: the file also holds the initial CODE
        // exchange, and a user who just clicked «connect» deserves the real
        // error from Google rather than a cached refusal.
        const body = SRC.slice(SRC.indexOf('export async function getAccessToken'));
        const guard = body.indexOf('if (googleCredentialsRejected()) return rec.access_token || null;');
        const fetchAt = body.indexOf("fetch('https://oauth2.googleapis.com/token'");
        expect(guard).toBeGreaterThan(0);
        expect(guard).toBeLessThan(fetchAt);
    });

    it('only the APP\'s own credentials trip it — a revoked user token still forces a reconnect', () => {
        expect(SRC).toMatch(/data\?\.error === 'invalid_client' \|\| data\?\.error === 'unauthorized_client'/);
        expect(SRC).toMatch(/data\?\.error === 'invalid_grant'.*clearTokensEverywhere/s);
        // The tokens on disk are innocent when the app's keys are wrong.
        const at = SRC.indexOf("data?.error === 'invalid_client'");
        expect(SRC.slice(at, at + 500)).not.toContain('clearTokensEverywhere');
    });

    it('the window is bounded, so a fix outside the process is picked up', () => {
        expect(SRC).toMatch(/BAD_CREDENTIALS_WINDOW_MS = \d+ \* 60_000/);
    });

    it('it says what to DO about it, once', () => {
        expect(SRC).toMatch(/إعدادات Google غير صالحة/);
    });

    it('the state is observable and resettable', () => {
        const { googleCredentialsRejected, resetGoogleCredentialState } = require('../modules/integrations/googleOAuth');
        resetGoogleCredentialState();
        expect(googleCredentialsRejected()).toBe(false);
    });
});

describe('the database mirror is skipped when there is no database', () => {
    const SRC = fs.readFileSync(path.join(__dirname, '..', 'api', 'routes', 'files.ts'), 'utf-8');

    it('an upload in JSON mode never waits on a connection that cannot exist', () => {
        expect(SRC).toMatch(/PERSISTENCE_MODE \|\| ''\)\.toUpperCase\(\) !== 'JSON'/);
        expect(SRC).toMatch(/mongoose\.connection\?\.readyState === 1/);
        const guard = SRC.indexOf('const mongoLive =');
        const create = SRC.indexOf('FileModel.create(fileData)');
        expect(guard).toBeGreaterThan(0);
        expect(guard).toBeLessThan(create);
    });

    it('…and a deployment WITH a database still mirrors the upload', () => {
        // The write is guarded, not deleted — the honest failure log stays too.
        expect(SRC).toContain('FileModel.create(fileData)');
        expect(SRC).toContain('[MongoDB] File saved to DB successfully');
        expect(SRC).toContain('Failed to save to DB (continuing with cache)');
    });

    it('the disk cache is still the thing that must succeed', () => {
        // A failed cache write is a 500; the mirror never was and never is.
        expect(SRC).toMatch(/\[File Cache\] Failed to write cache[\s\S]{0,120}status\(500\)/);
    });
});
