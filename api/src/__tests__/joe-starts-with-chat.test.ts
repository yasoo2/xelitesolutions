import fs from 'fs';
import path from 'path';

const webSource = (...parts: string[]) => fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'web', 'src', ...parts),
  'utf8',
);

describe('Joe starts directly in the conversation', () => {
  it('does not gate a new or existing workspace behind project onboarding', () => {
    const joe = webSource('pages', 'Joe.tsx');

    expect(joe).not.toContain('ProjectOnboardingModal');
    expect(joe).not.toContain('isOnboardingOpen');
    expect(joe).not.toContain('setIsOnboardingOpen');
    expect(joe).not.toContain('handleSelectLocal');
    expect(joe).not.toContain('handleSelectGitHub');
  });

  it('keeps GitHub as an explicit command-composer action', () => {
    const joe = webSource('pages', 'Joe.tsx');

    expect(joe).toContain('onGitClick={() => setIsGitHubOpen(true)}');
    expect(joe).toContain('<GitHubConnectDialog');
  });
});
