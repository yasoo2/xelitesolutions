/**
 * «THE SERVER DID NOT COME UP» WAS THREE DIFFERENT FACTS WEARING ONE SENTENCE.
 *
 * Seen on the owner's screen, in the log panel, while the rest of the build was
 * competing for the disk:
 *
 *     api_project: scaffolded 7 files in …\api-مشروع-بيت-الشام
 *     → exit 0 · 4.6s
 *     live proof → server did not come up
 *
 * The readiness check is a text match on «listening on» with one failure value,
 * `false`. So the same line is printed when:
 *
 *   · the process CRASHED    — and its exit code is the answer
 *   · it was still STARTING  — fifteen seconds was not enough on a busy machine
 *   · it is RUNNING FINE     — and announces itself in different words
 *
 * The first needs a fix, the second needs patience, the third needs the match
 * widened. One sentence for all three tells the owner none of them — and the
 * server's own last line was already on screen directly above it.
 *
 * Same shape as «left as written» for three rollback outcomes and
 * «react_delivery_quality_gate_failed» for a named finding: a report that
 * describes the MECHANISM instead of the FINDING.
 *
 * This guard is structural because the defect is: it reads the source and
 * requires each outcome to reach the report separately. The behaviour itself
 * needs a spawned child and a port, and a guard that needs those is a guard
 * that gets skipped.
 */

import * as fs from 'fs';
import * as path from 'path';

const SOURCE = path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ApiProjectTool.ts');
const raw = fs.readFileSync(SOURCE, 'utf8');

/** The code, without the prose — a scan that reads comments finds its own explanation. */
const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .filter(l => !l.trim().startsWith('//'))
    .join('\n');

describe('a failure says WHICH failure', () => {
    it('the one-sentence-for-everything line is gone', () => {
        expect(src).not.toContain('server did not come up');
    });

    it('a crash is told apart from a slow start', () => {
        //  `child.done` resolving before readiness is a crash. It must set its
        //  own reason, and carry the exit code, because «it exited» and «it
        //  exited with 1» are different amounts of help.
        expect(src).toMatch(/child!\.done\.then\(/);
        expect(src).toMatch(/exited[\s\S]{0,80}code/);
        expect(src).toMatch(/still starting/);
    });

    it('and the reason reaches the owner, not just a variable', () => {
        expect(src).toMatch(/no live proof: \$\{whyNot\}/);
    });

    it('the server\'s own last line is reported with it', () => {
        //  It was already on screen above the failure and told nobody
        //  anything, because nothing connected the two.
        expect(src).toMatch(/lastLine/);
        expect(src).toMatch(/its last line was/);
    });

    it('and printing NOTHING is reported as a fact of its own', () => {
        //  A silent process is not the same as a failing one, and the
        //  silence is the strongest clue there is.
        expect(src).toMatch(/printed nothing at all/);
    });
});
