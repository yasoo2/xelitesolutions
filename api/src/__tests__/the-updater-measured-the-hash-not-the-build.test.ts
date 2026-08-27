/**
 * THE UPDATER ASKED WHETHER THE HASH MOVED, NOT WHETHER THE BUILD WAS CURRENT.
 *
 * Measured on the owner's machine, 2026-08-27, after a day of repairs:
 *
 *     Joe's running bundle    17:33   (built before any of the day's work)
 *     his checkout            5f58e3c4 — every repair, on disk
 *     six repairs searched for inside the bundle: NONE present
 *
 * He ran `update-joe.ps1`, it pulled nothing new because the pull had already
 * happened, and `$skipBuild` was:
 *
 *     $skipBuild = ($before -eq $after) -and (dist files exist)
 *
 * — so it skipped the build and started Joe on a bundle from hours earlier.
 * **Three consecutive live runs died on a defect whose fix was sitting on his
 * disk the whole time, never compiled in.** He reported «nothing changed, still
 * stupid», and he was right about what he saw and wrong about why, because the
 * updater had told him it was up to date.
 *
 * ⛔ THE CLASS IS THE ONE THIS REPOSITORY HAS CLOSED ALL DAY: a signal that
 * measures something ADJACENT to the claim. A moving hash is not a current
 * build. A build that failed, a pull that was never built, a local edit — each
 * leaves the hash still and the bundle stale.
 *
 * So the condition asks the question directly: is the bundle newer than the
 * newest source file? And when the source cannot be read, it BUILDS — because
 * an unnecessary build costs minutes and a missing one cost a day.
 */

import fs from 'fs';
import path from 'path';

const UPDATER = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'update-joe.ps1'),
    'utf-8',
);

describe('the updater compares the bundle to the source', () => {
    it('⛔ POSITIVE — freshness is decided by timestamps, not by the hash alone', () => {
        //  The hash test may remain — a pull that brought nothing AND a bundle
        //  newer than every source file really is nothing to do. What must not
        //  remain is the hash test ALONE.
        expect(UPDATER).toContain('$bundleIsCurrent');
        expect(UPDATER).toMatch(/\$skipBuild = \(\$before -eq \$after\) -and \$builtBoth -and \$bundleIsCurrent/);
    });

    it('⛔ POSITIVE — it reads BOTH source trees, not just the API', () => {
        //  The web build takes four minutes and is the half he actually looks
        //  at. A freshness check that watched only `api/src` would ship him a
        //  stale interface over a fresh server and be harder to see than the
        //  defect it replaced.
        expect(UPDATER).toContain('api\\src');
        expect(UPDATER).toContain('web\\src');
    });

    it('⛔ NEGATIVE — the OLDEST bundle file is compared, not the newest', () => {
        //  If `api/dist` rebuilt and `web/dist` did not, the newest bundle file
        //  is fresh and the interface is stale. Taking the oldest is what makes
        //  a half-finished build count as not built.
        expect(UPDATER).toMatch(/Sort-Object \| Select-Object -First 1/);
        expect(UPDATER).toMatch(/Sort-Object LastWriteTimeUtc -Descending \| Select-Object -First 1/);
    });

    it('⛔ NEGATIVE — when the source cannot be read, it BUILDS', () => {
        //  «I don't know» must fall to the safe side. The old condition's whole
        //  failure was answering a question it could not answer; a catch that
        //  set this true would repeat it with a new instrument.
        const guard = UPDATER.slice(UPDATER.indexOf('$bundleIsCurrent = $false'), UPDATER.indexOf('$skipBuild ='));
        expect(guard).toContain('catch');
        expect(guard).toMatch(/catch \{[\s\S]*?\$bundleIsCurrent = \$false/);
    });

    it('NEGATIVE — the old hash-only condition is gone, not merely bypassed', () => {
        //  Left in place it would be the thing a future reader copies.
        expect(UPDATER).not.toMatch(/\$skipBuild = \(\$before -eq \$after\) -and\s*\n\s*\(Test-Path/);
    });

    it('the script still parses as PowerShell — a BOM and Arabic intact', () => {
        //  Windows PowerShell 5.1 reads a BOM-less file as ANSI and turns every
        //  Arabic string into a parse error, so an edit that dropped the BOM
        //  would break the one script he runs after every delivery.
        const raw = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'update-joe.ps1'));
        expect([raw[0], raw[1], raw[2]]).toEqual([0xef, 0xbb, 0xbf]);
        expect(UPDATER).toContain('السؤال ليس');
    });
});
