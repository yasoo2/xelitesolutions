import router from '../api/routes/browser';
import * as manager from '../modules/browser/manager';

describe('saved browser login status authorization', () => {
  const originalStore = (global as any).mockSessions;
  const route = (router as any).stack.find((entry: any) => entry.route?.path === '/session/status').route;
  const handler = route.stack[route.stack.length - 1].handle;

  beforeEach(() => {
    (global as any).mockSessions = [{ id: 'private-chat', userId: 'owner' }];
  });

  afterEach(() => {
    (global as any).mockSessions = originalStore;
    jest.restoreAllMocks();
  });

  it.each([
    ['owner', 200, true],
    ['another-user', 403, false],
    ['', 401, false],
  ])('limits saved login metadata for %s', async (userId, expectedStatus, mayRead) => {
    const read = jest.spyOn(manager, 'hasSavedBrowserSession').mockReturnValue(true);
    let status = 200;
    let body: any;
    const res: any = {
      status: (code: number) => { status = code; return res; },
      json: (value: any) => { body = value; return res; },
    };
    await handler({ auth: { sub: userId }, query: { sessionId: 'browser:private-chat' } }, res);
    expect(status).toBe(expectedStatus);
    expect(read).toHaveBeenCalledTimes(mayRead ? 1 : 0);
    if (mayRead) expect(body).toEqual({ ok: true, saved: true });
    else expect(body).not.toHaveProperty('saved');
  });
});
