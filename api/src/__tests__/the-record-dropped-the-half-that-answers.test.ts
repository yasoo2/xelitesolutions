/**
 * THE RECORD KEPT EVERYTHING EXCEPT THE PART THAT ANSWERS THE QUESTION.
 *
 * Measured while diagnosing a real refusal on pushed main. The stored envelope
 * of the failing phase kept the phase name, its description, its deliverables,
 * its estimated time, the project name, three ids and the full requirements
 * text — and showed the only two fields that could explain the failure as:
 *
 *     phase.tasks:               [truncated evidence value]
 *     phase.requirementsCovered: [truncated evidence value]
 *
 * The nesting is `data → phase → tasks → each task`, which is depth 4 exactly.
 *
 * ⛔ THE CLASS: a depth cap always removes the DEEPEST structure, and the
 * deepest structure is always the most specific evidence there is. Shallow
 * metadata survives; the payload never does. And it is silent — the record
 * reads as complete. Two hours went into a defect whose evidence had been
 * collected, stored, and stripped of its decisive half before anyone read it.
 *
 * ⛔ AND RAISING THE CAP ALONE WOULD HAVE MADE IT WORSE. `MAX_EVENT_BYTES` is
 * the real limit, and exceeding it replaces the WHOLE payload with
 * `[event payload truncated]`. A deeper capture that overshoots loses
 * everything rather than the deep part — so the depth steps down until it
 * fits, ending at 4, which is exactly today's behaviour.
 */

import { compactEventForTest, MAX_EVENT_BYTES } from '../shared/run-evidence-store';

/** The real shape that lost its tasks: data → phase → tasks → task. */
const phaseEvent = (taskCount: number, pad = '') => ({
    type: 'tool_started',
    runId: 'run-1787816204535',
    sessionId: '6a8fe8ffd52cda431f2adf67',
    id: 'evt-244',
    seq: 244,
    ts: 1787816204535,
    data: {
        tool: 'phase_executor',
        phase: {
            phaseNumber: 2,
            name: 'UI Components',
            deliverables: 'Header, service list, and booking form components',
            tasks: Array.from({ length: taskCount }, (_, i) => ({
                tool: i === 0 ? 'write_file' : 'file_edit',
                description: 'task ' + i + pad,
                args: { filename: 'src/components/Header.jsx', find: 'x', replace: 'y' },
            })),
        },
    },
});

const tasksOf = (e: any) => e?.data?.phase?.tasks;

describe('the evidence keeps the layer that explains the failure', () => {
    it('⛔ POSITIVE — the task list survives, with its tools and its args', () => {
        const kept = compactEventForTest(phaseEvent(3)) as any;
        const tasks = tasksOf(kept);
        expect(Array.isArray(tasks)).toBe(true);
        expect(tasks).toHaveLength(3);
        //  The three things the diagnosis needed and could not get.
        expect(tasks[0].tool).toBe('write_file');
        expect(tasks[1].tool).toBe('file_edit');
        expect(tasks[1].args.filename).toBe('src/components/Header.jsx');
    });

    it('NEGATIVE — and it is no longer the string that hid it', () => {
        expect(JSON.stringify(tasksOf(compactEventForTest(phaseEvent(3)))))
            .not.toContain('truncated evidence value');
    });

    it('⛔ NEGATIVE — an event too large to hold deeply still fits the budget', () => {
        //  The property that makes the deeper capture safe: it may never push
        //  a record past the byte cap. A capture that overshoots loses the
        //  WHOLE payload, which is worse than the defect being repaired.
        const huge = compactEventForTest(phaseEvent(400, 'x'.repeat(4000)));
        expect(Buffer.byteLength(JSON.stringify(huge), 'utf8')).toBeLessThanOrEqual(MAX_EVENT_BYTES);
    });

    it('NEGATIVE — and it degrades by depth before it drops the payload whole', () => {
        //  Between «everything» and «nothing» there are useful middles, and
        //  the step-down is what keeps them. A huge event must still carry the
        //  shallow structure rather than collapsing to a bare string.
        const huge = compactEventForTest(phaseEvent(400, 'x'.repeat(4000))) as any;
        expect(huge.seq).toBe(244);
        expect(huge.runId).toBe('run-1787816204535');
    });

    it('NEGATIVE — a small event is untouched in every field', () => {
        //  Widening capture must not rewrite what already worked.
        const kept = compactEventForTest(phaseEvent(1)) as any;
        expect(kept.data.tool).toBe('phase_executor');
        expect(kept.data.phase.name).toBe('UI Components');
        expect(kept.data.phase.deliverables).toBe('Header, service list, and booking form components');
    });
});
