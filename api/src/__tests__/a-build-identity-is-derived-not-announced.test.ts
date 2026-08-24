/**
 *  A BUILD IDENTITY THAT IS ANNOUNCED IS NOT AN IDENTITY.
 *
 *  resolveBuildSha reads JOE_BUILD_SHA, then GIT_COMMIT_SHA, then the git
 *  HEAD of the working directory. Every one of those describes the
 *  ENVIRONMENT the process was started in. None of them reads the code that
 *  is actually executing.
 *
 *  Found on a live round: an isolated runtime announced a commit in its own
 *  environment and in its startup log while running a stale bundle from
 *  before that commit, and the round it produced was believed until somebody
 *  checked the bytes. Every «which build is this» answer that day — on this
 *  machine too — was a claim rather than a measurement.
 *
 *  A fingerprint cannot be announced. It is the digest of the bytes being
 *  run.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { runningBundleFingerprint, buildIdentity, resolveBuildSha } from '../shared/build-info';

const DIR = path.join(os.tmpdir(), 'joe-build-identity-' + process.pid);
const write = (name: string, body: string) => {
    fs.mkdirSync(DIR, { recursive: true });
    const p = path.join(DIR, name);
    fs.writeFileSync(p, body, 'utf-8');
    return p;
};

beforeEach(() => { fs.rmSync(DIR, { recursive: true, force: true }); fs.mkdirSync(DIR, { recursive: true }); });
afterAll(() => { fs.rmSync(DIR, { recursive: true, force: true }); });

describe('the fingerprint is taken from the bytes that run', () => {
    it('the same bytes give the same fingerprint', () => {
        const a = write('a.js', 'console.log(1);\n');
        const b = write('b.js', 'console.log(1);\n');
        expect(runningBundleFingerprint(a)).toBe(runningBundleFingerprint(b));
    });

    it('one changed byte changes it', () => {
        //  This is the whole point: a bundle that changed cannot keep saying
        //  it is the bundle it was.
        const p = write('c.js', 'console.log(1);\n');
        const before = runningBundleFingerprint(p);
        fs.writeFileSync(p, 'console.log(2);\n', 'utf-8');
        expect(runningBundleFingerprint(p)).not.toBe(before);
    });

    it('a file that cannot be read is unknown, never invented', () => {
        //  The negative, and the rule resolveBuildSha already follows: Joe
        //  must never invent a build identity.
        expect(runningBundleFingerprint(path.join(DIR, 'missing.js'))).toBe('unknown');
        expect(runningBundleFingerprint('')).toBe('unknown');
    });
});

describe('a claim and a measurement stand side by side', () => {
    it('the environment can set the claim and cannot touch the fingerprint', () => {
        //  An environment variable is exactly what was wrong: it names a
        //  commit without reading a byte of it.
        const p = write('d.js', 'console.log(3);\n');
        const claimed = 'e0835559299e178c75166029c2341b03f2adde6e';
        const id = buildIdentity({ JOE_BUILD_SHA: claimed } as any, DIR, p);
        expect(id.claimedSha).toBe(claimed);
        expect(id.bundleFingerprint).toBe(runningBundleFingerprint(p));
        expect(id.bundleFingerprint).not.toBe(claimed);
    });

    it('…so two processes claiming one commit are still provably different', () => {
        const claimed = 'e0835559299e178c75166029c2341b03f2adde6e';
        const one = buildIdentity({ JOE_BUILD_SHA: claimed } as any, DIR, write('e.js', 'A\n'));
        const two = buildIdentity({ JOE_BUILD_SHA: claimed } as any, DIR, write('f.js', 'B\n'));
        expect(one.claimedSha).toBe(two.claimedSha);
        expect(one.bundleFingerprint).not.toBe(two.bundleFingerprint);
    });

    it('the claim still answers when the environment provides one', () => {
        //  The old behaviour is not removed; it is joined by a measurement.
        expect(resolveBuildSha({ JOE_BUILD_SHA: 'abc1234' } as any, DIR)).toBe('abc1234');
    });
});
