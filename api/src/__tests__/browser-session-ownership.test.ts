import { canAccessBrowserSession } from '../modules/browser/wsHub';

describe('browser panel session ownership', () => {
  it('claims a browser-prefixed ObjectId-like panel id locally without Mongo lookup', async () => {
    const sid = `browser:507f1f77bcf86cd799439011-${Date.now()}`;

    await expect(canAccessBrowserSession('owner-a', sid)).resolves.toBe(true);
    await expect(canAccessBrowserSession('owner-b', sid)).resolves.toBe(false);
    await expect(canAccessBrowserSession('owner-a', sid)).resolves.toBe(true);
  });

  it('does not treat a bare ObjectId as an unclaimed local panel id', async () => {
    const sid = '507f1f77bcf86cd799439012';

    await expect(canAccessBrowserSession('owner-a', sid)).resolves.toBe(false);
  });
});
