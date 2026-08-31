/**
 * A DEAD BUTTON IS NOT A COLOUR PROBLEM.
 *
 * His words, and this file is the line they were about:
 *
 *     «وعندما يكتشف هذه الاختبارات أي مشكلة لا يرجعها للنظام ويصلحها ثم يرجع
 *     يختبرها»
 *
 * ⛔ FIRST, THE CLAIM I KILLED, because it nearly shipped. I read
 * `app-audit.ts` calling only `auditDesign` and was one step from publishing
 * «the React path never presses a button». It does — `probeControls` was split
 * out of `auditBehaviour` precisely so both fronts share one definition of a
 * dead control, and `app-audit.ts:710` presses and judges. The complaint was
 * real; my first explanation of it was false.
 *
 * ⛔ THE ACTUAL DEFECT IS ONE LAYER IN, and it is exact:
 *
 *     behaviour-audit.ts:912   'dead_controls'       severity CRITICAL
 *     app-audit.ts:775         id: f.code            → reaches findings as `high`
 *     self-repair.ts:56        REPAIRABLE_FINDINGS   13 ids, all style/structure
 *     ui-repair.ts:714         REPAIRS_THIS_FILE…    10 ids, all style
 *     self-repair.ts:78        worthRepairing = .some(id in either list)
 *     model-round.ts (header)  «A stylesheet appended to cannot change what
 *                               the application DOES»
 *
 * So Joe walked to the button, pressed it, watched nothing happen, called it
 * critical in his report — **and every repairer in the system was a painter.**
 * The one road past the deterministic ceiling was a CSS round, which is
 * correct for contrast and useless for a counter that does not count.
 *
 * ⛔ AND IT IS TONIGHT'S CLASS IN ITS MOST EXPENSIVE FORM: a producer emits
 * `dead_controls`, a reader admits thirteen style ids, and nothing forces them
 * to agree. The audit got better twice this month; the door was never told.
 *
 * The repair is a second road with the same four locks and only the first one
 * changed — one existing component file, parsed before believed, built, and
 * measured by pressing the button AGAIN. The set it acts on is DERIVED, not
 * remembered: a behaviour finding that no deterministic repairer claims. A
 * hand-kept third list would be this same defect one iteration later.
 */

import fs from 'fs';
import path from 'path';
import {
    handlerRepairable, fileForBehaviour, safeComponent, handlerRepairPrompt, askForHandler,
} from '../core/quality/model-round';
import { BEHAVIOUR_CODES } from '../core/quality/behaviour-audit';

const BEHAVIOUR_SRC = fs.readFileSync(
    path.join(__dirname, '..', 'core', 'quality', 'behaviour-audit.ts'), 'utf-8',
);
const MODEL_ROUND = fs.readFileSync(
    path.join(__dirname, '..', 'core', 'quality', 'model-round.ts'), 'utf-8',
);
const REACT = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf-8',
);

/** A component with a button that does nothing — the shape the browser reports. */
const DEAD = `import React from 'react';

export default function ServingsCounter() {
    return (
        <section className="servings">
            <h2>Servings</h2>
            <button type="button">Add serving</button>
            <span>4</span>
        </section>
    );
}
`;

describe('the two writers are forced to agree', () => {
    it('⛔ BEHAVIOUR_CODES equals every code the file actually emits', () => {
        //  The set lives beside the pushes so a reader elsewhere can ask which
        //  findings came from this instrument. Declared lists drift from the
        //  code that feeds them — that is the night's most expensive class —
        //  so the agreement is enforced here rather than remembered.
        const emitted = new Set(
            (BEHAVIOUR_SRC.match(/code: '[a-z_]+'/g) || []).map(m => m.replace(/code: '|'/g, '')),
        );
        expect(emitted.size).toBeGreaterThan(5);
        expect([...emitted].sort()).toEqual([...BEHAVIOUR_CODES].sort());
    });

    it('⛔ a dead control arrives as DATA, not only inside a sentence', () => {
        //  Reading offenders out of prose is the shape that gave `min:` a pass
        //  mark for matching a digit. `app-audit` forwards `evidence`; this is
        //  what fills it.
        //  ⛔ This pinned the spelling and went red the moment the evidence
        //  learned to carry the UNDECORATED name — an improvement, not a
        //  regression, and my own guard called it a failure. The claim is
        //  «the offenders arrive as data», so that is what is asserted: an
        //  evidence array, built from the dead controls, carrying a label
        //  and a kind. Both findings that emit it are counted.
        const evidences = BEHAVIOUR_SRC.split('\n').filter(l => l.includes('evidence: dead.slice('));
        expect(evidences.length).toBe(2);
        for (const line of evidences) {
            expect(line).toContain('label:');
            expect(line).toContain('kind: d.kind');
        }
    });
});

describe('what a painter cannot fix reaches an author', () => {
    it('⛔ POSITIVE — a dead control is offered to the author road', () => {
        const picked = handlerRepairable([
            { id: 'dead_controls', severity: 'high', detailEn: '2 of 3 controls do nothing when clicked' },
        ]);
        expect(picked.map(f => f.id)).toEqual(['dead_controls']);
    });

    it('⛔ POSITIVE — and so does every behaviour defect no repairer claims', () => {
        const ids = handlerRepairable([
            { id: 'dead_controls' }, { id: 'some_dead_controls' },
            { id: 'form_dead_submit' }, { id: 'form_reloads' }, { id: 'dead_anchors' },
        ] as any).map(f => f.id);
        expect(ids.sort()).toEqual([
            'dead_anchors', 'dead_controls', 'form_dead_submit', 'form_reloads', 'some_dead_controls',
        ]);
    });

    it('⛔ NEGATIVE — what a deterministic repairer CAN fix is left to it', () => {
        //  `keyboard_unreachable` is a behaviour finding AND is in
        //  REPAIRABLE_FINDINGS. Paying a model for it would be waste, and
        //  worse, it would take a proven fix away from a written one.
        expect(handlerRepairable([{ id: 'keyboard_unreachable' }] as any)).toEqual([]);
        expect(handlerRepairable([{ id: 'low_contrast' }, { id: 'type_scale_drift' }] as any)).toEqual([]);
    });

    it('⛔ NEGATIVE — and a finding from another instrument is not this road', () => {
        //  A dead server is not repaired by rewriting a component. Sending it
        //  here would be a confident repair of the wrong thing.
        expect(handlerRepairable([{ id: 'server_root_dead' }, { id: 'broken_routes' }] as any)).toEqual([]);
        expect(handlerRepairable([])).toEqual([]);
    });
});

describe('the file that holds the dead button is found, not guessed', () => {
    const sources = {
        'src/components/ServingsCounter.jsx': DEAD,
        'src/components/Footer.jsx': 'export default function Footer() { return <footer>ok</footer>; }',
    };

    it('⛔ POSITIVE — the component naming the label wins', () => {
        const pick = fileForBehaviour(
            [{ evidence: [{ label: 'Add serving', kind: 'button' }] }],
            sources,
        );
        expect(pick.file).toBe('src/components/ServingsCounter.jsx');
        expect(pick.labels).toEqual(['Add serving']);
    });

    it('⛔ NEGATIVE — a label nothing contains picks NOTHING', () => {
        //  Rewriting a working component to repair a broken one is worse than
        //  reporting that the offender could not be located. The round says so
        //  instead of editing at random.
        const pick = fileForBehaviour(
            [{ evidence: [{ label: 'Checkout', kind: 'button' }] }],
            sources,
        );
        expect(pick.file).toBe('');
    });

    /**
     *  ⛔ THE ONE THAT WAS SILENTLY BROKEN FOR EVERY PAGE BUT THE FIRST.
     *
     *  `app-audit.ts:608` merges each route's controls as
     *  `route === '/' ? c.label : `${route} ${c.label}``. So a dead button on
     *  `/menu` arrives here labelled «/menu Add serving», and looking that up
     *  in the component sources finds nothing at all. The road I published an
     *  hour earlier repaired the home page and **quietly did nothing on every
     *  other page of the site** — a failure with no error, which is the only
     *  kind that survives.
     *
     *  Found by reading the producer instead of trusting my reader, which is
     *  the same class the road itself exists to close.
     */
    it('⛔ POSITIVE — a control on a route other than / is still found', () => {
        const pick = fileForBehaviour(
            [{ evidence: [{ label: '/menu Add serving', kind: 'button' }] }],
            sources,
        );
        expect(pick.file).toBe('src/components/ServingsCounter.jsx');
        //  Both readings are kept: the prefix is absent on the home route, and
        //  a label that legitimately begins with a slash must still match.
        expect(pick.labels).toContain('Add serving');
        expect(pick.labels).toContain('/menu Add serving');
    });

    it('⛔ NEGATIVE — stripping the route does not invent a match', () => {
        //  «/menu Checkout» must still find nothing. A looser reader that
        //  matched on any word would now hit `Footer` through «ok» — the
        //  second chance has to be narrower, not just another chance.
        expect(fileForBehaviour(
            [{ evidence: [{ label: '/menu Checkout', kind: 'button' }] }], sources,
        ).file).toBe('');
    });

    it('⛔ NEGATIVE — no evidence at all picks nothing, and says why', () => {
        expect(fileForBehaviour([{ id: 'dead_controls' } as any], sources).file).toBe('');
        expect(fileForBehaviour([], sources).labels).toEqual([]);
    });
});

describe('the model is allowed to be wrong, not to be believed', () => {
    const GOOD = `import React, { useState } from 'react';

export default function ServingsCounter() {
    const [n, setN] = useState(4);
    return (
        <section className="servings">
            <h2>Servings</h2>
            <button type="button" onClick={() => setN(v => v + 1)}>Add serving</button>
            <span>{n}</span>
        </section>
    );
}
`;

    it('⛔ POSITIVE — a real repair passes every lock', () => {
        const gate = safeComponent(GOOD, DEAD);
        expect(gate.ok).toBe(true);
        expect(gate.source).toContain('useState');
        expect(gate.source).toContain('onClick');
    });

    it('⛔ POSITIVE — and a markdown fence is stripped, not refused', () => {
        //  A model told «no fence» sends one anyway. Refusing over it would
        //  throw away a correct repair for a formatting habit.
        const gate = safeComponent('```jsx\n' + GOOD + '\n```', DEAD);
        expect(gate.ok).toBe(true);
        expect(gate.source.startsWith('import React')).toBe(true);
    });

    it('⛔ NEGATIVE — a stub that deletes the buttons is refused', () => {
        //  «There are no dead buttons» is trivially true of a page with no
        //  buttons left. That measures better while being worse, and it is the
        //  exact trade this whole layer exists to refuse.
        const gate = safeComponent(
            'export default function ServingsCounter() { return <section />; }',
            DEAD + DEAD + DEAD,
        );
        expect(gate.ok).toBe(false);
        expect(gate.why).toContain('smaller');
    });

    it('⛔ NEGATIVE — network, eval and raw html never reach disk', () => {
        expect(safeComponent(GOOD.replace('setN(v => v + 1)', 'fetch("/api/x")'), DEAD).why).toBe('reaches the network');
        expect(safeComponent(GOOD.replace('setN(v => v + 1)', 'eval("x")'), DEAD).why).toBe('runs code it was not given');
        expect(safeComponent(GOOD.replace('<span>{n}</span>', '<span dangerouslySetInnerHTML={{__html: n}} />'), DEAD).why)
            .toBe('injects raw html');
    });

    it('⛔ NEGATIVE — an import the project does not have is a build failure in disguise', () => {
        const gate = safeComponent(`import axios from 'axios';\n` + GOOD, DEAD);
        expect(gate.ok).toBe(false);
        expect(gate.why).toContain('imports something new');
    });

    it('⛔ NEGATIVE — source that does not parse, or has no default export', () => {
        expect(safeComponent('export default function X() { return <div>; }', DEAD).why).toContain('does not parse');
        expect(safeComponent('const X = () => <div/>;', DEAD).why).toBe('no default export');
        expect(safeComponent('', DEAD).why).toBe('empty');
    });

    /**
     *  ⛔ MEASURED LIVE, THREE TIMES, AGAINST A REAL MODEL — and the second
     *  run is the reason the third exists.
     *
     *      run 1  both buttons wired in 3.7s — and `className="count"` gone
     *      run 2  brief says «keep every className», lock added
     *             → REFUSED: drops className "count" that the stylesheet targets
     *      run 3  the near miss is told what it missed, once
     *             → 659 chars, all four locks, both handlers, class kept,
     *               and <span className="count">{servings}</span>
     *
     *  Run 2 is the whole lesson twice over. **An instruction is not an
     *  enforcement** — the model was told and did it anyway. And **a lock that
     *  refuses every answer is a road that never opens**, which would have
     *  been worse than the defect: a behaviour repairer that costs a model
     *  call and repairs nothing.
     */
    it('⛔ POSITIVE — a class the stylesheet targets cannot be silently dropped', () => {
        //  Verbatim from run 1: the model wired both buttons and turned
        //  `<span className="count">4</span>` into a span with no class at all.
        const previous = DEAD.replace('<span>4</span>', '<span className="count">4</span>');
        expect(previous).toContain('className="count"');
        //  GOOD wires both buttons correctly and renders `<span>{n}</span>` —
        //  a repair that works and quietly takes the stylesheet's hook with it.
        expect(GOOD).not.toContain('className="count"');
        const gate = safeComponent(GOOD, previous);
        expect(gate.ok).toBe(false);
        expect(gate.why).toContain('drops className "count"');
    });

    it('⛔ NEGATIVE — ADDING a class is still allowed', () => {
        //  Tokens are compared, not whole attributes. A repair that adds
        //  `is-active` beside `count` is not a repair that deleted anything,
        //  and refusing it would make the lock a ban on improvement.
        const richer = GOOD.replace('className="servings"', 'className="servings is-active"');
        expect(safeComponent(richer, DEAD).ok).toBe(true);
    });

    /**
     *  ⛔ AND THIS TEST REPLACED ONE OF MINE THAT WAS WORTHLESS.
     *
     *  My first version asserted that `model-round.ts` CONTAINS the strings
     *  `nearMiss` and «YOUR PREVIOUS ANSWER WAS REJECTED». I then disabled the
     *  retry — `if (!nearMiss)` → `if (true)`, so no second attempt can ever
     *  happen — and **all twenty-two tests stayed green.** A guard that
     *  survives the removal of the thing it guards is not a guard; it is the
     *  same defect as `min:` passing for any digit and `filter` proving a
     *  filter exists because it is an array method.
     *
     *  So the road is driven instead of read. The model answers twice, and the
     *  test asserts which answer came back.
     */
    it('⛔ POSITIVE — a near miss is asked AGAIN, and the second answer is the one kept', async () => {
        const previous = DEAD.replace('<span>4</span>', '<span className="count">4</span>');
        const misses = GOOD;                                            // drops className="count"
        const keeps = GOOD.replace('<span>{n}</span>', '<span className="count">{n}</span>');
        const router = require('../core/llm/intelligent-router');
        const spy = jest.spyOn(router, 'routeToModel')
            .mockResolvedValueOnce(misses as any)
            .mockResolvedValueOnce(keeps as any);
        try {
            const got = await askForHandler(
                [{ id: 'dead_controls', evidence: [{ label: 'Add serving' }] }] as any,
                'src/components/ServingsCounter.jsx', previous, ['Add serving'], { timeoutMs: 5000 },
            );
            expect(spy).toHaveBeenCalledTimes(2);
            expect(got.source).toContain('className="count"');
            //  And the second prompt NAMES the failure — otherwise it is a
            //  re-roll wearing a repair's clothes, which is the defect this
            //  file closed one layer up.
            const secondPrompt = String((spy.mock.calls[1][0] as any[])[0].content);
            expect(secondPrompt).toContain('YOUR PREVIOUS ANSWER WAS REJECTED');
            expect(secondPrompt).toContain('drops className "count"');
        } finally { spy.mockRestore(); }
    });

    it('⛔ NEGATIVE — it is asked again ONCE, never in a loop', async () => {
        //  A stubborn model must not be able to spend the quota the planner
        //  needs. Two calls, then the road closes for this round and says why.
        const previous = DEAD.replace('<span>4</span>', '<span className="count">4</span>');
        const router = require('../core/llm/intelligent-router');
        const spy = jest.spyOn(router, 'routeToModel').mockResolvedValue(GOOD as any);
        try {
            const got = await askForHandler(
                [{ id: 'dead_controls', evidence: [{ label: 'Add serving' }] }] as any,
                'src/components/ServingsCounter.jsx', previous, ['Add serving'], { timeoutMs: 5000 },
            );
            expect(spy).toHaveBeenCalledTimes(2);
            expect(got.source).toBe('');
            expect(got.why).toContain('told and still');
        } finally { spy.mockRestore(); }
    });

    it('⛔ NEGATIVE — an answer that is not a near miss gets NO second chance', async () => {
        //  Retrying garbage is spending a model call to be told no twice.
        const router = require('../core/llm/intelligent-router');
        const spy = jest.spyOn(router, 'routeToModel').mockResolvedValue('not source at all' as any);
        try {
            const got = await askForHandler(
                [{ id: 'dead_controls', evidence: [{ label: 'Add serving' }] }] as any,
                'src/components/ServingsCounter.jsx', DEAD, ['Add serving'], { timeoutMs: 5000 },
            );
            expect(spy).toHaveBeenCalledTimes(1);
            expect(got.why).toBe('no default export');
        } finally { spy.mockRestore(); }
    });

    it('the brief names the dead controls and forbids a redesign', () => {
        const p = handlerRepairPrompt(
            [{ id: 'dead_controls', detailEn: '1 of 2 controls do nothing when clicked' }],
            'src/components/ServingsCounter.jsx', DEAD, ['Add serving'],
        );
        expect(p).toContain('"Add serving"');
        expect(p).toContain('dead_controls: 1 of 2 controls do nothing when clicked');
        expect(p).toContain('You are repairing behaviour, not redesigning');
        expect(p).toContain('Import nothing new');
        expect(p).toContain('Keep every className exactly as it is');
        //  The current source goes with it, or the answer is a fresh unrelated
        //  file rather than a repair of this one.
        expect(p).toContain('Add serving</button>');
    });
});

describe('the road is wired into the loop that measures', () => {
    it('⛔ behaviour is offered the model BEFORE colour', () => {
        //  Order is the claim: a critical dead control must not wait behind a
        //  CSS round that provably cannot touch it.
        const behaviourAt = REACT.indexOf('const behaviourLeft = handlerRepairable(');
        const cssAt = REACT.indexOf('const got = await askForCss(');
        expect(behaviourAt).toBeGreaterThan(0);
        expect(cssAt).toBeGreaterThan(0);
        expect(behaviourAt).toBeLessThan(cssAt);
    });

    it('⛔ the repaired file is returned to the loop, so it is rebuilt and re-measured', () => {
        //  Returning the changed path is what makes the loop rebuild, press the
        //  button again, and roll the round back if the score does not rise.
        //  Writing the file without returning it would be a repair nothing
        //  checked — «find, fix» with the «then test» missing, which is the
        //  half of his sentence this whole change is about.
        //  ⛔ THIS PINNED `return [pick.file];` AND WENT RED WHEN THE ROUND
        //  LEARNED TO CARRY BOTH SETS OF CHANGES — an improvement, called a
        //  failure by my own guard. The claim is «the repaired file reaches the
        //  loop», not the spelling of the array around it.
        expect(REACT).toContain('pick.file]');
        expect(REACT).toContain('...known.changed, pick.file');
        expect(REACT).toMatch(/fs\.writeFileSync\(path\.join\(proj, pick\.file\), fixed\.source, 'utf-8'\)/);
    });

    it('⛔ and it asks the provider HE chose, not the free mesh', () => {
        //  Four model calls in this file once routed to the free mesh while he
        //  had pasted a real key. A new call that repeats it is the same defect
        //  with a new name.
        expect(REACT).toContain('{ timeoutMs: 90_000, context },');
    });
});

/**
 * ⛔ AND THE ROAD WAS UNREACHABLE FOR AS LONG AS IT HAS EXISTED.
 *
 * The owner watched this four rounds running, in his own browser:
 *
 *     improve: round 1 — 71 → 74/100 · gone: mobile_tap_targets
 *     improve: round 2/4 — 74/100, still open: dead_anchors, dead_controls,
 *       spacing_drift
 *     … dead_controls still open when the loop stopped
 *
 * The repair callback opened with:
 *
 *     const known = await repairRound(…);
 *     if (known.changed.length) return known.changed;   ← round over
 *     …                                                  ← behaviour road, here
 *
 * **So one contrast tweak ended the round, and the dead button waited.** Style
 * findings never run out — there is always another eight pixels somewhere — so
 * the most severe thing the browser can find was permanently queued behind the
 * least severe thing it can fix.
 *
 * Category 4, in the repair for Category 4: correct code on a path nothing
 * executes. Guards green, road never taken, and the only instrument that could
 * see it was the owner watching his own screen.
 */
describe('a dead control is asked before a colour is', () => {
    const REPAIR = (() => {
        const at = REACT.indexOf('repair: async (round: number');
        return REACT.slice(at, REACT.indexOf('rebuild: async ()', at));
    })();

    it('⛔ POSITIVE — a behaviour defect stops the deterministic early return', () => {
        //  The one line that made the road reachable.
        expect(REPAIR).toContain('const severeFirst = handlerRepairable(lastAudit?.findings || []).length > 0;');
        expect(REPAIR).toContain('if (known.changed.length && !severeFirst) return known.changed;');
    });

    it('⛔ POSITIVE — and the check comes BEFORE the early return, not after', () => {
        //  Order is the whole claim. Computed after it, the guard would be a
        //  comment: the function has already returned.
        const severeAt = REPAIR.indexOf('const severeFirst =');
        const returnAt = REPAIR.indexOf('if (known.changed.length && !severeFirst)');
        expect(severeAt).toBeGreaterThan(0);
        expect(severeAt).toBeLessThan(returnAt);
    });

    it('⛔ NEGATIVE — with no behaviour defect, the old economy is untouched', () => {
        //  A round that fixed contrast and nothing else must still end there.
        //  Paying for a model call on every cosmetic round is the waste the
        //  early return exists to prevent, and it is kept.
        expect(REPAIR).toContain('&& !severeFirst');
        expect(REPAIR).not.toContain('if (known.changed.length) return known.changed;');
    });

    it('⛔ NEGATIVE — a round that repairs both reports BOTH', () => {
        //  The style fixes already written this round are real. Returning only
        //  the authored file would drop them from the round's ledger, and the
        //  rollback would then judge a different set of changes than the one on
        //  disk — a repair that measures something it did not do.
        expect(REPAIR).toContain('return [...known.changed, pick.file];');
    });

    it('⛔ NEGATIVE — and when the model round is switched off, style still counts', () => {
        //  `JOE_MODEL_ROUND=0` used to return an empty array, discarding the
        //  deterministic changes of that round along with the model's.
        expect(REPAIR).toContain("if (String(process.env.JOE_MODEL_ROUND || '1') === '0') return known.changed;");
    });
});
