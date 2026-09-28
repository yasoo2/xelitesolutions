jest.mock('../core/llm', () => ({ generateSessionTitle: jest.fn() }));
jest.mock('../api/chat-store', () => ({
    persistChatStores: jest.fn(),
    usesLocalChatStore: jest.fn(() => true),
}));
jest.mock('../api/ws', () => ({ broadcast: jest.fn() }));

import { generateSessionTitle } from '../core/llm';
import { autoNameSessionAfterReply } from '../api/controllers/sessionController';

const generated = generateSessionTitle as jest.Mock;
const question = 'What is 19 × 7? Answer with the number only.';

describe('session titles describe the user request, not the model answer', () => {
    const previousMode = process.env.PERSISTENCE_MODE;
    const previousSessions = (global as any).mockSessions;
    const previousMessages = (global as any).mockMessages;

    beforeEach(() => {
        process.env.PERSISTENCE_MODE = 'JSON';
        generated.mockReset();
        (global as any).mockSessions = [];
        (global as any).mockMessages = [];
    });

    afterAll(() => {
        if (previousMode === undefined) delete process.env.PERSISTENCE_MODE;
        else process.env.PERSISTENCE_MODE = previousMode;
        (global as any).mockSessions = previousSessions;
        (global as any).mockMessages = previousMessages;
    });

    it('falls back to the first user message when a weak model returns a bare answer', async () => {
        const id = 'numeric-title-case';
        (global as any).mockSessions = [{ id, _id: id, title: 'New Chat' }];
        (global as any).mockMessages = [
            { sessionId: id, role: 'user', content: question },
            { sessionId: id, role: 'assistant', content: '133' },
        ];
        generated.mockResolvedValueOnce('133');

        await autoNameSessionAfterReply(id);

        expect((global as any).mockSessions[0].title).toBe(question);
        expect(generated).toHaveBeenCalledWith(question);
    });

    it('keeps a descriptive title from the model', async () => {
        const id = 'descriptive-title-case';
        (global as any).mockSessions = [{ id, _id: id, title: 'New Chat' }];
        (global as any).mockMessages = [{ sessionId: id, role: 'user', content: question }];
        generated.mockResolvedValueOnce('Multiplying Nineteen by Seven');

        await autoNameSessionAfterReply(id);

        expect((global as any).mockSessions[0].title).toBe('Multiplying Nineteen by Seven');
    });

    it('never overwrites a title chosen by the user', async () => {
        const id = 'manual-title-case';
        (global as any).mockSessions = [{ id, _id: id, title: 'My calculation' }];
        (global as any).mockMessages = [{ sessionId: id, role: 'user', content: question }];
        generated.mockResolvedValueOnce('133');

        await autoNameSessionAfterReply(id);

        expect((global as any).mockSessions[0].title).toBe('My calculation');
        expect(generated).not.toHaveBeenCalled();
    });
});
