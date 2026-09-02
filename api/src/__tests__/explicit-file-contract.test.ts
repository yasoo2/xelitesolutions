import { parseExplicitFileRequest } from '../core/orchestrator/file-intent';
import { IntentParser } from '../core/intelligence/IntentParser';

const prompt = 'Create a file named joe-prompt-02.txt in the current workspace containing exactly three lines: Joe prompt 02; deterministic artifact check; completed only after read-back. Then read the file back and report its exact content. Do not change any other files.';

describe('explicit filesystem contracts', () => {
    test('extracts the path, exact lines, and read-back requirement without a model', () => {
        expect(parseExplicitFileRequest(prompt)).toEqual({
            path: 'joe-prompt-02.txt',
            content: 'Joe prompt 02\ndeterministic artifact check\ncompleted only after read-back',
            readBack: true,
        });
    });

    test('returns a deterministic file intent instead of deep analysis', async () => {
        const intent = await IntentParser.parse(prompt, {} as any);
        expect(intent.rawIntent.fileRequest.path).toBe('joe-prompt-02.txt');
        expect(intent.requiredTools).toEqual(['write_file', 'read_file']);
    });
});
