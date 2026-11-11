/**
 * While the server says a session's run is going, the composer is busy: Stop
 * stays Stop between tools, a typed message is queued, not sent as a new run,
 * and the queue waits. Caught by the UI/UX check on 2026-11-05, ninety-seven
 * steps into the clinic: Send was back while Joe thought about its next step.
 */
import fs from 'fs';
import path from 'path';

const composer = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'web', 'src', 'components', 'CommandComposer.tsx'), 'utf8');

describe('Stop stays while the run goes', () => {
    it('the composer is not idle while the server reports the run', () => {
        expect(composer).toMatch(/const composerIdle = status === 'idle' && !runActive && !approval && !secretPrompt;/);
    });

    it('the send button follows that, not the momentary tool status', () => {
        const button = composer.slice(composer.indexOf('{/* Send Button'), composer.indexOf('{/* Send Button') + 1800);
        expect(button).toMatch(/className=\{`send-btn \$\{!composerIdle \? 'is-busy' : ''\}`\}/);
        expect(button).toMatch(/title=\{!composerIdle \? t\('stop'\) : t\('send'\)\}/);
        expect(button).not.toMatch(/status !== 'idle'/);
    });

    it('a prompt typed mid-run is queued, and the queue fires only when the run is over', () => {
        expect(composer).toMatch(/if \(!composerIdle && !approval && !secretPrompt\) \{\s*setPendingQueue/);
        expect(composer).toMatch(/if \(!composerIdle \|\| isUploading \|\| queuePaused\) return;/);
    });
});
