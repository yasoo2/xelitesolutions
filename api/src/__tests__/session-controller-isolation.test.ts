import * as SessionController from '../api/controllers/sessionController';

const response = () => {
    const state: { statusCode: number; body: any } = { statusCode: 200, body: undefined };
    const res: any = {
        status: (code: number) => { state.statusCode = code; return res; },
        json: (body: any) => { state.body = body; return res; },
    };
    return { res, state };
};

const requestFor = (userId: string, id = 'session-a') => ({
    auth: { sub: userId },
    params: { id },
    body: {},
} as any);

describe('session controller ownership in the JSON store', () => {
    const previousPersistence = process.env.PERSISTENCE_MODE;

    beforeEach(() => {
        process.env.PERSISTENCE_MODE = 'JSON';
        (global as any).mockSessions = [
            { id: 'session-a', _id: 'session-a', title: 'A private task', userId: 'user-a', metadata: { runQueue: { items: [], paused: false } } },
            { id: 'session-b', _id: 'session-b', title: 'B private task', userId: 'user-b', metadata: { runQueue: { items: [], paused: false } } },
        ];
        (global as any).mockMessages = [
            { _id: 'message-a', sessionId: 'session-a', role: 'user', content: 'A secret', createdAt: new Date() },
            { _id: 'message-b', sessionId: 'session-b', role: 'user', content: 'B secret', createdAt: new Date() },
        ];
    });

    afterAll(() => {
        if (previousPersistence === undefined) delete process.env.PERSISTENCE_MODE;
        else process.env.PERSISTENCE_MODE = previousPersistence;
    });

    it('lists only sessions owned by the authenticated user', async () => {
        const { res, state } = response();
        await SessionController.listSessions(requestFor('user-a'), res);
        expect(state.statusCode).toBe(200);
        expect(state.body.map((session: any) => session.id)).toEqual(['session-a']);
    });

    it('does not disclose another user session history, queue, or workspace', async () => {
        for (const action of [
            SessionController.listSessionMessages,
            SessionController.getSessionQueue,
            SessionController.sessionWorkspace,
        ]) {
            const { res, state } = response();
            await action(requestFor('user-b', 'session-a'), res);
            expect(state).toEqual({ statusCode: 404, body: { error: 'Session not found' } });
        }
    });

    it('does not let another user replace a session work queue', async () => {
        const { res, state } = response();
        const req = requestFor('user-b', 'session-a');
        req.body = { items: [{ id: 'queued', text: 'cross-account write', files: [] }], paused: false };
        await SessionController.replaceSessionQueue(req, res);
        expect(state).toEqual({ statusCode: 404, body: { error: 'Session not found' } });
        expect((global as any).mockSessions[0].metadata.runQueue.items).toEqual([]);
    });
});
