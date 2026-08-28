import fs from 'fs';
import path from 'path';
import { resolveBuildSha } from '../shared/build-info';

const entrypoint = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.ts'), 'utf8');
const buildInfoSource = fs.readFileSync(path.join(__dirname, '..', 'shared', 'build-info.ts'), 'utf8');

describe('Joe startup build identity', () => {
  /**
   *  This pinned three source lines, one of them an import. The boot now
   *  prints a CLAIM and a MEASUREMENT side by side — resolveBuildSha
   *  reads the environment, and the fingerprint is the digest of the
   *  bytes actually executing — so the import changed and this went red
   *  for a spelling, not for a behaviour.
   *
   *  It asserts the property instead: whatever it imports, the startup
   *  must announce the identity under JOE_BUILD_SHA, and it must carry
   *  the fingerprint, because a claim alone is what let a runtime report
   *  a commit it was not running.
   */
  it('announces the build identity before the API starts serving', () => {
    expect(entrypoint).toMatch(/from '\.\.\/shared\/build-info'/);
    expect(entrypoint).toContain("'JOE_BUILD_SHA'");
    expect(entrypoint).toContain('bundleFingerprint');
  });

  it('keeps build identity inside the fs/path boot boundary', () => {
    expect(buildInfoSource).not.toMatch(/from ['\"]child_process['\"]/);
    expect(buildInfoSource).not.toMatch(/\bexec(?:File)?Sync\s*\(/);
  });

  it('prefers an explicit build SHA supplied by the process environment', () => {
    expect(resolveBuildSha({ JOE_BUILD_SHA: 'abc1234', GIT_COMMIT_SHA: 'deadbeef' }, '/service', () => 'feedface')).toBe('abc1234');
  });

  it('accepts the deployment commit variable when the Joe-specific value is absent', () => {
    expect(resolveBuildSha({ GIT_COMMIT_SHA: 'deadbeef' }, '/service', () => 'feedface')).toBe('deadbeef');
  });

  it('reads the checkout HEAD from the service directory before its parent', () => {
    //  Passes on both platforms only because the FIRST candidate is `cwd`
    //  unchanged. Written the same way as its sibling so the pair cannot
    //  drift apart the next time one of them is edited.
    const service = path.join(path.sep, 'workspace', 'api');
    expect(resolveBuildSha({}, service, (cwd) => cwd === service ? 'feedface' : 'cafebabe')).toBe('feedface');
  });

  /**
   *  ⛔ THE PARENT IS WHATEVER `path.resolve` SAYS IT IS.
   *
   *  This read `cwd === '/workspace'`, which is the parent of `/workspace/api`
   *  on Linux and `C:\\workspace` on Windows — `path.resolve` anchors a
   *  rootless POSIX path to the current drive. So the callback never matched,
   *  the fallback never fired, and the test reported `unknown` on the one
   *  machine Joe actually runs on.
   *
   *  The claim is «it tries the parent», not «the parent is spelled with a
   *  forward slash». It is computed the same way the code computes it.
   */
  it('tries the repository parent when the service directory is not the checkout root', () => {
    const service = path.join(path.sep, 'workspace', 'api');
    const parent = path.resolve(service, '..');
    expect(resolveBuildSha({}, service, (cwd) => cwd === parent ? 'cafebabe' : null)).toBe('cafebabe');
  });

  it('prints unknown rather than inventing a build identity when every source is absent', () => {
    expect(resolveBuildSha({}, '/service', () => null)).toBe('unknown');
  });
});
