import fs from 'fs';
import path from 'path';

describe('browser frame session isolation', () => {
    test('the embedded browser remounts when its owning chat session changes', () => {
        const source = fs.readFileSync(
            path.join(process.cwd(), '..', 'web', 'src', 'components', 'WorkspacePanel.tsx'),
            'utf8',
        );

        expect(source).toMatch(
            /<EmbeddedBrowser[\s\S]{0,180}key=\{browserSessionId \|\| \(sessionId \? `browser:\$\{sessionId\}` : 'browser:no-session'\)\}[\s\S]{0,180}sessionId=\{browserSessionId/,
        );
    });
});
