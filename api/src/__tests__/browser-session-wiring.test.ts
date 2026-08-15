import { executeTool } from '../modules/services/ToolService';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';
import { tools } from '../modules/tools/registry';

/**
 * The visible browser panel owns a dedicated id (for example `browser:chat-42`).
 * The chat/run id is a different thing. If ToolService injects the latter into
 * browser_run, Playwright operates a different page and the panel remains blank.
 */
const run = (name: string, input: any, context: any) =>
    executionFirewall.runInContext(undefined, () => executeTool(name, input, context)) as Promise<any>;

describe('browser session wiring', () => {
    const browserTool: any = tools.find((tool: any) => tool.name === 'browser_run');
    let originalExecute: any;

    beforeEach(() => {
        expect(browserTool).toBeTruthy();
        originalExecute = browserTool.execute;
    });

    afterEach(() => {
        browserTool.execute = originalExecute;
    });

    it('injects the dedicated visible-panel session, never the chat session', async () => {
        let observedInput: any;
        browserTool.execute = async (input: any) => {
            observedInput = input;
            return { ok: true, output: { sessionId: input.sessionId } };
        };

        const result = await run(
            'browser_run',
            { actions: [{ type: 'goto', url: 'https://example.test' }] },
            { sessionId: 'chat-42', browserSessionId: 'browser:chat-42', userId: 'test-user' },
        );

        expect(result.ok).toBe(true);
        expect(observedInput.sessionId).toBe('browser:chat-42');
        expect(observedInput.sessionId).not.toBe('chat-42');
    });

    it('pins the visible-panel session over a planner-provided session and falls back only for legacy callers', async () => {
        const seen: string[] = [];
        browserTool.execute = async (input: any) => {
            seen.push(input.sessionId);
            return { ok: true };
        };

        await run(
            'browser_run',
            { sessionId: 'explicit-browser', actions: [{ type: 'wait', ms: 1 }] },
            { sessionId: 'chat-42', browserSessionId: 'browser:chat-42', userId: 'test-user' },
        );
        await run(
            'browser_run',
            { actions: [{ type: 'wait', ms: 1 }] },
            { sessionId: 'legacy-chat-session', userId: 'test-user' },
        );

        expect(seen).toEqual(['browser:chat-42', 'legacy-chat-session']);
    });
});
