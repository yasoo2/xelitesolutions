import { EventEmitter } from 'events';
import mongoose from 'mongoose';
import { WebSocket, WebSocketServer } from 'ws';
import { Session } from '../shared/models/session';
import { attachBrowserWss, broadcastBrowserEvent, canAccessBrowserSession } from '../modules/browser/wsHub';

describe('browser panel session ownership', () => {
  const chatId = '507f1f77bcf86cd799439011';
  const sid = `browser:${chatId}`;
  const originalStore = (global as any).mockSessions;
  const originalMode = process.env.PERSISTENCE_MODE;
  const originalOffline = process.env.OFFLINE_MODE;
  const originalReadyState = (mongoose.connection as any)._readyState;

  beforeEach(() => {
    process.env.PERSISTENCE_MODE = 'JSON';
    (global as any).mockSessions = [{ id: chatId, userId: 'owner-a' }];
  });

  afterEach(() => {
    jest.restoreAllMocks();
    (mongoose.connection as any)._readyState = originalReadyState;
    (global as any).mockSessions = originalStore;
    if (originalMode === undefined) delete process.env.PERSISTENCE_MODE;
    else process.env.PERSISTENCE_MODE = originalMode;
    if (originalOffline === undefined) delete process.env.OFFLINE_MODE;
    else process.env.OFFLINE_MODE = originalOffline;
  });

  it('rejects a different account before the owner has opened the panel', async () => {
    await expect(canAccessBrowserSession('owner-b', sid)).resolves.toBe(false);
    await expect(canAccessBrowserSession('owner-a', sid)).resolves.toBe(true);
    await expect(canAccessBrowserSession('owner-b', sid)).resolves.toBe(false);
    await expect(canAccessBrowserSession('owner-a', chatId)).resolves.toBe(true);
  });

  it('rechecks ownership instead of retaining an earlier viewer claim', async () => {
    await expect(canAccessBrowserSession('owner-a', sid)).resolves.toBe(true);
    (global as any).mockSessions = [{ _id: chatId, userId: 'owner-b' }];
    await expect(canAccessBrowserSession('owner-a', sid)).resolves.toBe(false);
    await expect(canAccessBrowserSession('owner-b', sid)).resolves.toBe(true);
  });

  it('rejects unknown streams, missing identities, and extended namespaces', async () => {
    for (const target of ['unknown-stream', 'browser:unknown', `${sid}:extra`, 'browser:']) {
      await expect(canAccessBrowserSession('owner-a', target)).resolves.toBe(false);
    }
    await expect(canAccessBrowserSession('', sid)).resolves.toBe(false);
    await expect(canAccessBrowserSession('owner-b', 'browser:owner-a')).resolves.toBe(false);
    await expect(canAccessBrowserSession('owner-a', 'browser:owner-a')).resolves.toBe(true);
  });

  it('checks Mongo ownership for both browser and bare session ids', async () => {
    process.env.PERSISTENCE_MODE = 'MONGO';
    process.env.OFFLINE_MODE = 'false';
    (mongoose.connection as any)._readyState = 1;
    const lean = jest.fn().mockResolvedValue({ userId: 'owner-a' });
    const query = jest.spyOn(Session, 'findById').mockReturnValue({ select: () => ({ lean }) } as any);
    await expect(canAccessBrowserSession('owner-b', sid)).resolves.toBe(false);
    await expect(canAccessBrowserSession('owner-a', chatId)).resolves.toBe(true);
    expect(query).toHaveBeenCalledWith(chatId);
  });

  it('enforces the same check at the WebSocket boundary before broadcasting', async () => {
    const server = new EventEmitter();
    const onFirstClient = jest.fn();
    attachBrowserWss(server as WebSocketServer, { onFirstClient });
    const connect = async (userId: string) => {
      const socket = Object.assign(new EventEmitter(), {
        readyState: WebSocket.OPEN, close: jest.fn(), send: jest.fn(),
      });
      server.emit('connection', socket, { url: `/ws/browser?sessionId=${sid}`, auth: { sub: userId } });
      await new Promise<void>(resolve => setImmediate(resolve));
      return socket;
    };
    const stranger = await connect('owner-b');
    expect(stranger.close).toHaveBeenCalledWith(1008, 'forbidden');
    expect(onFirstClient).not.toHaveBeenCalled();
    const owner = await connect('owner-a');
    try {
      expect(onFirstClient).toHaveBeenCalledWith(sid);
      broadcastBrowserEvent(sid, { type: 'test-frame' } as any);
      expect(owner.send).toHaveBeenCalledTimes(1);
      expect(stranger.send).not.toHaveBeenCalled();
    } finally {
      owner.emit('close');
    }
  });

  it('does not treat a bare ObjectId as an unclaimed local panel id', async () => {
    const sid = '507f1f77bcf86cd799439012';

    await expect(canAccessBrowserSession('owner-a', sid)).resolves.toBe(false);
  });
});
