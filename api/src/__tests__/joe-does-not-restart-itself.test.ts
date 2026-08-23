/**
 * JOE RESTARTED ITSELF WHILE THE OWNER WAS USING IT.
 *
 * Measured on his machine, three times, mid-build: the reply never arrived,
 * no error appeared, and the process was simply gone. It was not memory — the
 * peak was 314MB of a 4096MB heap. It was the self-updater:
 *
 *     web/src/components/UpdateJoeItem.tsx
 *         localStorage.getItem(AUTO_PREF_KEY) !== '0'     -> a browser that has
 *                                                            never heard of the
 *                                                            preference says YES
 *         const AUTO_DELAY_S = 45;
 *
 *     api/src/api/routes/system.ts
 *         // Answer NOW: the updater is about to kill this very process.
 *
 * So opening Joe on a checkout that was behind started a countdown he never
 * asked for, and forty-five seconds later the running server was killed.
 *
 * Restarting the program someone is using — and rewriting the repository it
 * lives in — is not a default. The toggle already writes '1' when he turns it
 * on, so an absent preference now means off.
 *
 * THIS GUARD READS THE SOURCE, AND SAYS SO. There is no browser test harness
 * in this repository, so it asserts the one constant that decides the default
 * rather than the behaviour around it. That is a narrower promise than a real
 * test, and it is written down here so nobody mistakes it for one.
 */
import fs from 'fs';
import path from 'path';

const componentSource = (): string => fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'web', 'src', 'components', 'UpdateJoeItem.tsx'), 'utf-8');

describe('INVARIANT: the self-updater is opt-in', () => {
    test('the default is off', () => {
        expect(componentSource()).toContain('const AUTO_UPDATE_DEFAULT = false;');
    });

    test('an absent preference is not read as consent', () => {
        //  The exact expression that made silence mean yes.
        expect(componentSource()).not.toContain("getItem(AUTO_PREF_KEY) !== '0'");
    });

    test('and turning it on is still one click, storing the same value', () => {
        //  The fix must not orphan a preference the user already set.
        expect(componentSource()).toContain("next ? '1' : '0'");
        expect(componentSource()).toContain("stored === '1'");
    });
});
