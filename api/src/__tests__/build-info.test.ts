import fs from 'fs';
import path from 'path';
import { resolveBuildSha } from '../shared/build-info';

const entrypoint = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.ts'), 'utf8');
const buildInfoSource = fs.readFileSync(path.join(__dirname, '..', 'shared', 'build-info.ts'), 'utf8');

describe('Joe startup build identity', () => {
  it('prints the resolved build SHA before the API starts serving', () => {
    expect(entrypoint).toContain("import { resolveBuildSha } from '../shared/build-info';");
    expect(entrypoint).toContain('const buildSha = resolveBuildSha();');
    expect(entrypoint).toContain("logger.info({ buildSha }, 'JOE_BUILD_SHA');");
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
    expect(resolveBuildSha({}, '/workspace/api', (cwd) => cwd === '/workspace/api' ? 'feedface' : 'cafebabe')).toBe('feedface');
  });

  it('tries the repository parent when the service directory is not the checkout root', () => {
    expect(resolveBuildSha({}, '/workspace/api', (cwd) => cwd === '/workspace' ? 'cafebabe' : null)).toBe('cafebabe');
  });

  it('prints unknown rather than inventing a build identity when every source is absent', () => {
    expect(resolveBuildSha({}, '/service', () => null)).toBe('unknown');
  });
});
