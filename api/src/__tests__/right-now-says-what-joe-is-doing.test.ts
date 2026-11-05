/**
 * «Right now» names the agent engine's actual action, in the user's language.
 * Measured on 2026-11-05: for an hour of the clinic build it said «Performing
 * the requested action» — every engine status fell to the catch-all rule.
 */
import fs from 'fs';
import path from 'path';
import { traceDisplayKey, workStageFor } from '../../../web/src/lib/neuralTrace';

const i18n = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'web', 'src', 'i18n.ts'), 'utf8');

// The statuses run-1793904577852 actually sent (thinking_phase details).
const cases: Array<[string, string]> = [
    ['Running: engine shell run…', 'neuralDetailShell'],
    ['Running: engine shell start…', 'neuralDetailShell'],
    ['Running: engine shell logs…', 'neuralDetailShellWatch'],
    ['Running: engine file write…', 'neuralDetailWrite'],
    ['Running: engine file edit…', 'neuralDetailWrite'],
    ['Running: engine file read…', 'neuralDetailRead'],
    ['Running: engine file search…', 'neuralDetailRead'],
    ['Running: engine browser open…', 'neuralDetailBrowserAction'],
    ['Running: project run…', 'neuralDetailRunProject'],
    ['Running: project stop…', 'neuralDetailStopProject'],
    ['Running: quality run…', 'neuralDetailQuality'],
    ['Running: agent engine…', 'neuralDetailEngine'],
];

describe('«Right now» says what Joe is doing', () => {
    it.each(cases)('%s → %s', (status, key) => {
        expect(traceDisplayKey(status)).toBe(key);
    });

    it('every new sentence exists in English and Arabic', () => {
        for (const key of new Set(cases.map(c => c[1]))) {
            expect((i18n.match(new RegExp(`\\b${key}:`, 'g')) || []).length).toBeGreaterThanOrEqual(2);
        }
    });

    it('trying the project is a check, and the hand-in is verification', () => {
        expect(workStageFor('executing', 'Running: project run…')).toBe('test');
        expect(workStageFor('executing', 'Running: quality run…')).toBe('test');
        expect(workStageFor('executing', 'Running: engine task finish…')).toBe('verify');
        expect(workStageFor('executing', 'Running: engine file write…')).toBe('build');
    });
});
