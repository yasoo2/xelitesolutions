import { TerminalKernel } from '../modules/terminal/terminal-kernel';
import { getTerminal, registerTerminal, removeTerminal } from '../modules/tools/terminal/TerminalState';

describe('TerminalKernel lifecycle guards', () => {
    const ids: string[] = [];
    const kernel = new TerminalKernel();

    afterEach(() => {
        for (const id of ids.splice(0)) removeTerminal(id);
    });

    test('a resize callback cannot re-enter resizeTerminal indefinitely', async () => {
        const id = 'test-resize-reentry';
        ids.push(id);
        let resizeCalls = 0;
        registerTerminal(id, {
            history: [],
            write: () => undefined,
            kill: () => undefined,
            resize: () => {
                resizeCalls++;
                void kernel.resizeTerminal(id, 100, 40);
            },
        });

        await kernel.resizeTerminal(id, 100, 40);

        expect(resizeCalls).toBe(1);
        expect(getTerminal(id)).toBeDefined();
    });

    test('kill removes the session before an exit callback can clean it again', async () => {
        const id = 'test-kill-reentry';
        ids.push(id);
        let killCalls = 0;
        registerTerminal(id, {
            history: [],
            write: () => undefined,
            resize: () => undefined,
            kill: () => {
                killCalls++;
                void kernel.killTerminal(id);
            },
        });

        await kernel.killTerminal(id);

        expect(killCalls).toBe(1);
        expect(getTerminal(id)).toBeUndefined();
    });
});
