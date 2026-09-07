import { authorizedLiveSessions, registerSessionOwner } from '../api/ws';

describe('live session subscription authorization', () => {
  const previousStore = (global as any).mockSessions;

  beforeEach(() => {
    (global as any).mockSessions = [
      { id: 'persisted-private', userId: 'account-a' },
      { id: 'persisted-other', userId: 'account-b' },
    ];
  });
  afterEach(() => { (global as any).mockSessions = previousStore; });

  it('checks persisted ownership even before a session has a live run', async () => {
    await expect(authorizedLiveSessions('account-b', ['persisted-private'])).resolves.toEqual([]);
    await expect(authorizedLiveSessions('account-a', ['persisted-private', 'persisted-other'])).resolves.toEqual(['persisted-private']);
  });

  it('rejects unauthenticated, unknown and browser-namespace subscriptions', async () => {
    await expect(authorizedLiveSessions('', ['persisted-private'])).resolves.toEqual([]);
    await expect(authorizedLiveSessions('account-a', ['unknown', 'browser:account-a', null, {}, ''])).resolves.toEqual([]);
  });

  it('respects trusted live ownership and deduplicates subscriptions', async () => {
    registerSessionOwner('registered-test-session', 'account-a');
    await expect(authorizedLiveSessions('account-b', ['registered-test-session'])).resolves.toEqual([]);
    await expect(authorizedLiveSessions('account-a', ['registered-test-session', 'persisted-private', 'persisted-private']))
      .resolves.toEqual(['registered-test-session', 'persisted-private']);
  });
});
