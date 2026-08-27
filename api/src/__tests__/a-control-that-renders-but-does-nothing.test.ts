/**
 * JOE COULD DRAW A SERVINGS COUNTER AND NEVER MAKE IT COUNT.
 *
 * Measured on the owner's own machine, watching a run through his interface.
 * Joe's own words, before it built anything:
 *
 *     I did not recognise the kind of thing you asked for, and I have no ready
 *     engine for it. I am going to build a generic structure instead — a
 *     presentation page, not a working program.
 *
 * and the audit that followed:
 *
 *     self-QA: 64/100 — h1_count, dead_anchors, some_dead_controls,
 *                       low_contrast, mobile_tap_targets, type_scale_drift
 *     improve: round 1 — 64 → 67/100 · gone: mobile_tap_targets
 *     improve: round 2 — still open: some_dead_controls
 *     ERROR: acceptance_criteria_unmet: counter
 *
 * A tap-target is a CSS rule and closed in one round. **A dead control needs
 * component code and survived every round** — so the one finding a user
 * actually feels is precisely the one the loop cannot act on.
 *
 * ⛔ AND THE CAUSE WAS ONE SENTENCE IN THE AUTHORING BRIEF: «The only import
 * allowed is: import React from 'react';». Meanwhile `ALLOWED_IMPORT` has
 * always admitted `import React, { useState } from 'react'` — the optional
 * group is right there in the pattern — and `the-interface-has-an-author-now`
 * already asserts an authored contact form built with `useState`, `onSubmit`
 * and `preventDefault`.
 *
 * **The capability existed. The instruction told the model not to use it.** The
 * brief mentioned state, handlers or interactivity exactly ZERO times, and a
 * model reading «the only import allowed is React» writes markup and stops.
 *
 * Every repair of that night was in the layer that JUDGES the build. This is
 * the first in the layer that WRITES it, and it is the owner's standing
 * condition restated as a test: a control that renders but does nothing is a
 * failure, not a partial success.
 */

import fs from 'fs';
import path from 'path';

const AUTHOR = fs.readFileSync(
    path.join(__dirname, '..', 'core', 'design', 'authored-ui.ts'),
    'utf-8',
);

/** The brief as the source really builds it, not as it is remembered. */
const BRIEF = AUTHOR.slice(
    AUTHOR.indexOf('HARD CONTRACT'),
    AUTHOR.indexOf('THE DESIGN THIS PROJECT WAS COMPOSED WITH'),
);

describe('the author may write behaviour, and is told to', () => {
    it('⛔ POSITIVE — the brief names the hook import it used to forbid', () => {
        //  Not «does not forbid» — NAMES it. A model given a list of one
        //  allowed import does not infer that a second is tolerated.
        expect(BRIEF).toContain("import React, { useState } from 'react';");
    });

    it('⛔ POSITIVE — and it says interactivity is part of the section', () => {
        //  Permission alone would leave it optional. The measured failure was a
        //  model that drew the control and stopped, so the instruction has to
        //  be an obligation.
        expect(BRIEF).toContain('INTERACTIVITY IS PART OF THE SECTION');
        expect(BRIEF).toContain('CHANGES ON SCREEN');
        expect(BRIEF).toContain('useState and real handlers');
    });

    it('⛔ POSITIVE — the exact controls he asked for are named as examples', () => {
        //  «a counter, a filter, a cart total, a toggle, a quantity that
        //  recalculates» — his servings counter is the first of them, and a
        //  brief that spoke only in the abstract is how the old one produced
        //  nothing.
        for (const example of ['counter', 'filter', 'cart total', 'toggle', 'quantity']) {
            expect({ example, named: BRIEF.includes(example) }).toEqual({ example, named: true });
        }
    });

    it('⛔ POSITIVE — a dead control is called a FAILURE, not a partial success', () => {
        //  The owner's own standard, in the brief the model actually reads:
        //  fewer sections that work beat more that only look right.
        expect(BRIEF).toContain('renders but does nothing is a failure');
        expect(BRIEF).toContain('prefer fewer sections that work');
    });

    it('⛔ NEGATIVE — the validator still admits the hook import, and only that', () => {
        //  The permission must be real at the gate too, or the brief invites
        //  the model to write files that are then discarded — a worse failure
        //  than the silence it replaces, because the work is done and thrown
        //  away.
        const rule = /const ALLOWED_IMPORT = .*$/m.exec(AUTHOR)?.[0] || '';
        const allowed = new RegExp(rule.slice(rule.indexOf('/') + 1, rule.lastIndexOf('/')));
        expect(allowed.test("import React, { useState } from 'react';")).toBe(true);
        expect(allowed.test("import React from 'react';")).toBe(true);
        //  ...and nothing else. The section still has no dependencies.
        expect(allowed.test("import axios from 'axios';")).toBe(false);
        expect(allowed.test("import { useQuery } from '@tanstack/react-query';")).toBe(false);
    });

    it('⛔ NEGATIVE — the safety bans are untouched', () => {
        //  Widening what the author may DO must not widen what it may REACH.
        //  Storage, fetch, raw HTML and external addresses stay refused.
        for (const banned of [
            'dangerouslySetInnerHTML', 'localStorage', 'sessionStorage',
            'new\\s+Function', 'eval\\s*\\(', '<script',
        ]) {
            expect({ banned, stillRefused: AUTHOR.includes(banned) })
                .toEqual({ banned, stillRefused: true });
        }
    });
});
