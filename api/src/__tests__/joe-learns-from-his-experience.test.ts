/**
 * JOE LEARNS FROM HIS OWN WORK: THE EXPERIENCE BOOK.
 *
 * The owner, 2026-11-08: «a database of Joe's own experience: asked what he
 * did before, he does it at once, by himself; the AI only for what he does
 * not know — one day we do without Claude». Pinned:
 *   - a request is read alike («شغّل الكشاف» = «شغل الكشاف يا جو في هاتفي»),
 *     never its opposite («اطفي الكشاف»);
 *   - only a fixed, safe action is done again with no model: never a press
 *     on «إرسال» or «حذف», a tap by position, a look, or an email;
 *   - a recipe is learned from a run Joe's checks passed, a lesson from one
 *     that failed; replays are counted, the money saved too; two failures in
 *     a row stop replays until a run teaches it again;
 *   - a run is given the closest ways and failures as examples, the owner's
 *     own only;
 *   - the steps are recorded as they ran: a tap keeps the control's NAME,
 *     and is found by it again where it now is;
 *   - in the engine: the same request done from the book is delivered by
 *     Joe's own checks with NO model call; a step that cannot be done hands
 *     the run to the model, told where Joe stopped.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

//  Loading the engine takes seconds on a busy laptop.
jest.setTimeout(180_000);

let dir = '';
beforeEach(() => {
    jest.resetModules();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-experience-'));
    process.env.JOE_EXPERIENCE_FILE = path.join(dir, 'book.json');
});
afterEach(() => {
    delete process.env.JOE_EXPERIENCE_FILE;
    delete process.env.JOE_EXPERIENCE_REPLAY;
    fs.rmSync(dir, { recursive: true, force: true });
});

const ex = () => require('../core/engine/experience');
const TORCH = [{ tool: 'android_devices', args: {} }, { tool: 'android_torch', args: { on: true } }, { tool: 'android_read', args: {} }];
const QS = [
    { tool: 'android_panel', args: { panel: 'quick_settings' } },
    { tool: 'android_read', args: {} },
    { tool: 'android_tap', args: {}, target: { text: 'الكشاف', id: 'com.android.systemui:id/tile', kind: 'Switch' } },
    { tool: 'android_read', args: {} },
];
function learn(over: Record<string, unknown> = {}) {
    return ex().learnFromRun({
        ownerId: 'owner-1', request: 'شغل الكشاف في هاتفي', target: 'phone', kind: 'act', ok: true, steps: TORCH,
        summary: 'شغّلتُ الكشاف.', language: 'ar', model: 'claude-haiku-5-5', costUsd: 0.007, durationMs: 60_000, ...over,
    });
}

describe('a request is read alike, never its opposite', () => {
    test('marks, alef forms, «يا جو», «في هاتفي», «الآن» and the article do not change it', () => {
        const { requestKey } = ex();
        const k = requestKey('شغل الكشاف');
        expect(requestKey('شغّل الكشاف يا جو')).toBe(k);
        expect(requestKey('شغل الكشاف في هاتفي الآن')).toBe(k);
        expect(requestKey('شغل كشاف')).toBe(k);
        expect(requestKey('اطفي الكشاف')).not.toBe(k);
        expect(requestKey('شغل الكشاف وشغل الموسيقى')).not.toBe(k);
        expect(requestKey('Turn on the flashlight please')).toBe(requestKey('turn on flashlight'));
    });
});

describe('only a fixed, safe action is done again with no model', () => {
    test.each([
        ['the flashlight', TORCH, 'act', true],
        ['a tile pressed by its name', QS, 'act', true],
        ['a press on «إرسال»', [{ tool: 'android_read', args: {} }, { tool: 'android_tap', args: {}, target: { text: 'إرسال' } }], 'act', false],
        ['a press on «Delete»', [{ tool: 'android_tap', args: {}, target: { description: 'Delete' } }], 'act', false],
        ['a tap by position', [{ tool: 'android_tap', args: { x: 10, y: 20 } }], 'act', false],
        ['an email', [{ tool: 'android_email', args: { to: ['a@b.c'] } }], 'act', false],
        ['a call', [{ tool: 'android_link', args: { uri: 'tel:123' } }], 'act', false],
        ['a look', [{ tool: 'android_read', args: {} }], 'look', false],
        ['only looking, though asked to act', [{ tool: 'android_devices', args: {} }, { tool: 'android_read', args: {} }], 'act', false],
        ['the computer\'s screen', [{ tool: 'device_press', args: { window: 3, control: 2 } }], 'act', false],
        ['a question to the owner', [{ tool: 'ask_owner', args: {} }, { tool: 'android_torch', args: {} }], 'act', false],
    ])('%s → %s', (_name, steps, kind, ok) => {
        expect(ex().replayability(steps, kind).ok).toBe(ok);
    });
});

describe('the book: recipes, lessons, replays', () => {
    test('a proven run is a recipe the same request finds, for the same owner and device only', () => {
        const r = learn();
        expect(r.replayable).toBe(true);
        const { replayFor } = ex();
        expect(replayFor('owner-1', 'شغّل الكشاف يا جو', 'phone')?.id).toBe(r.id);
        expect(replayFor('owner-2', 'شغّل الكشاف', 'phone')).toBeNull();
        expect(replayFor('owner-1', 'شغّل الكشاف', 'computer')).toBeNull();
        expect(replayFor('owner-1', 'اطفي الكشاف', 'phone')).toBeNull();
    });

    test('kept on disk: a restarted Joe still knows it', () => {
        const r = learn();
        jest.resetModules();
        expect(ex().replayFor('owner-1', 'شغل الكشاف', 'phone')?.id).toBe(r.id);
    });

    test('replays count, save what learning cost, and two failures in a row stop them until a run teaches it again', () => {
        const r = learn();
        const { noteReplay, replayFor, experienceView } = ex();
        noteReplay(r.id, true);
        expect(experienceView('owner-1').totals).toMatchObject({ recipes: 1, replays: 1, replayWins: 1, savedUsd: 0.007 });
        noteReplay(r.id, false);
        expect(replayFor('owner-1', 'شغل الكشاف', 'phone')).not.toBeNull();
        noteReplay(r.id, false);
        expect(replayFor('owner-1', 'شغل الكشاف', 'phone')).toBeNull();
        expect(experienceView('owner-1').recipes[0].replayable).toBe(false);
        // A run that did it again (with the model) teaches it again: replayable, its counts kept.
        learn({ steps: QS });
        expect(replayFor('owner-1', 'شغل الكشاف', 'phone')?.steps).toHaveLength(4);
        expect(experienceView('owner-1').recipes[0]).toMatchObject({ replays: 3, replayWins: 1, replayable: true });
    });

    test('JOE_EXPERIENCE_REPLAY=off keeps the book and stops the replays', () => {
        learn();
        process.env.JOE_EXPERIENCE_REPLAY = 'off';
        expect(ex().replayFor('owner-1', 'شغل الكشاف', 'phone')).toBeNull();
    });

    test('a failed run is a lesson; a run is given the closest ways and failures, the owner\'s own only', () => {
        learn();
        learn({ request: 'اطفي الكشاف', steps: [{ tool: 'android_torch', args: { on: false } }] });
        learn({ ok: false, request: 'شغل الكشاف بسرعة', reason: 'the flashlight tile was not on the screen', tried: ['android_tap «Torch» → failed: not found'] });
        learn({ ownerId: 'owner-2', request: 'شغل الكشاف', steps: [{ tool: 'android_torch', args: { on: true, secret: 'x' } }] });
        const facts = ex().experienceFacts('owner-1', 'شغل الكشاف الان', 'phone');
        expect(facts).toContain('JOE\'S EXPERIENCE');
        expect(facts).toContain('android_torch {"on":true}');
        expect(facts).toContain('WHAT FAILED BEFORE');
        expect(facts).toContain('the flashlight tile was not on the screen');
        expect(facts).not.toContain('secret');
        expect(ex().experienceFacts('owner-1', 'ارسل ايميل لشروق', 'phone')).toBe('');
    });

    test('he deletes what he does not want kept', () => {
        const r = learn();
        const { forgetExperience, experienceView } = ex();
        expect(forgetExperience('owner-2', r.id)).toBe(false);
        expect(forgetExperience('owner-1', r.id)).toBe(true);
        expect(experienceView('owner-1').recipes).toEqual([]);
    });
});

/* ── the steps as they ran, and done again ── */

type C = { index: number; text: string; description: string; id: string; kind: string };
function fakeTools(controls: C[][], log: string[]) {
    let screen = 0;
    const tool = (name: string, run: (a: any) => { ok: boolean; output: string }) => ({
        name, description: name, parameters: {}, parse: (a: any) => ({ ok: true, value: a || {} }),
        async run(a: any) { log.push(`${name} ${JSON.stringify(a)}`); return run(a); },
    });
    return {
        controlsOf: () => controls[Math.min(screen, controls.length - 1)],
        tools: [
            tool('android_devices', () => ({ ok: true, output: '- TECNO KI7 (connected)' })),
            tool('android_panel', () => ({ ok: true, output: 'open' })),
            tool('android_read', () => { screen++; return { ok: true, output: 'controls' }; }),
            tool('android_tap', a => ({ ok: !!a.control, output: a.control ? 'Tapped.' : 'no control' })),
            tool('android_torch', () => ({ ok: true, output: 'The flashlight is on.' })),
        ],
    };
}

describe('the steps are recorded by name and found again where they now are', () => {
    test('a tap keeps the control\'s name; a failed call is tried, not a step', async () => {
        const { recordingTools } = ex();
        const log: string[] = [];
        const tile = { index: 7, text: 'الكشاف', description: '', id: 'qs:tile', kind: 'Switch' };
        const f = fakeTools([[tile], [tile]], log);
        const trail = { steps: [] as any[], tried: [] as string[] };
        const [, panel, read, tap] = recordingTools(f.tools as any, trail, f.controlsOf);
        const ctx: any = { runId: 'r1' };
        await panel.run({ panel: 'quick_settings' }, ctx);
        await read.run({}, ctx);
        await tap.run({}, ctx);
        await tap.run({ control: 7 }, ctx);
        expect(trail.steps.map(s => s.tool)).toEqual(['android_panel', 'android_read', 'android_tap']);
        expect(trail.steps[2]).toEqual({ tool: 'android_tap', args: {}, target: { text: 'الكشاف', id: 'qs:tile', kind: 'Switch' } });
        expect(trail.tried).toHaveLength(4);
        expect(trail.tried[2]).toMatch(/failed/u);
    });

    test('done again: the tile is found by its name at its new number; a missing one stops with where and why', async () => {
        const { replaySteps, replayNote } = ex();
        const recipe = learn({ steps: QS });
        const log: string[] = [];
        const events: any[] = [];
        const moved = { index: 12, text: 'الكشاف', description: '', id: 'com.android.systemui:id/tile', kind: 'Switch' };
        const f = fakeTools([[], [{ index: 3, text: 'Wi-Fi', description: '', id: 'x', kind: 'Switch' }, moved], [moved]], log);
        const ctx: any = { runId: 'r2', signal: new AbortController().signal, emit: (e: any) => events.push(e) };
        const tools = new Map(f.tools.map(t => [t.name, t] as const));
        const r = await replaySteps(recipe, ctx, tools as any, f.controlsOf, async () => undefined);
        expect(r).toEqual({ done: true, ran: 4 });
        expect(log).toContain('android_tap {"control":12}');
        expect(events.filter(e => e.type === 'tool_call').map(e => e.name)).toEqual(['android_panel', 'android_read', 'android_tap', 'android_read']);

        const gone = fakeTools([[], [{ index: 3, text: 'Wi-Fi', description: '', id: 'x', kind: 'Switch' }]], []);
        const r2 = await replaySteps(recipe, { ...ctx, runId: 'r3' }, new Map(gone.tools.map(t => [t.name, t] as const)) as any, gone.controlsOf, async () => undefined);
        expect(r2.done).toBe(false);
        expect(r2.ran).toBe(2);
        expect(r2.why).toMatch(/«الكشاف» is not on the screen now/u);
        const note = replayNote(recipe, r2);
        expect(note).toContain('android_panel {"panel":"quick_settings"} → android_read');
        expect(note).toContain('read the screen first');
    });
});

describe('a switch already as asked is not pressed', () => {
    //  The flashlight tile toggles: «اطفي الكشاف» learned as a tap while it was ON must not
    //  turn it ON when done again while it is already OFF.
    test('learned with the switch on; done again with it already off: no tap, and he is told', async () => {
        const { recordingTools, replaySteps, replaySummary } = ex();
        const on = { index: 7, text: 'الكشاف', description: '', id: 'qs:tile', kind: 'Switch', checked: true };
        const trail = { steps: [] as any[], tried: [] as string[] };
        const learnLog: string[] = [];
        const lf = fakeTools([[on], [on]], learnLog);
        const [, , read, tap] = recordingTools(lf.tools as any, trail, lf.controlsOf as any);
        await read.run({}, { runId: 'l1' } as any);
        await tap.run({ control: 7 }, { runId: 'l1' } as any);
        expect(trail.steps[1].target).toMatchObject({ text: 'الكشاف', checked: true });

        const recipe = learn({ request: 'اطفي الكشاف', steps: [{ tool: 'android_panel', args: { panel: 'quick_settings' } }, { tool: 'android_read', args: {} }, trail.steps[1], { tool: 'android_read', args: {} }] });
        const off = { ...on, index: 9, checked: false };
        const log: string[] = [];
        const noted: string[] = [];
        const f = fakeTools([[], [off], [off]], log);
        const r = await replaySteps(recipe, { runId: 'r9', signal: new AbortController().signal, emit: () => undefined } as any,
            new Map(f.tools.map(t => [t.name, t] as const)) as any, f.controlsOf as any, async () => undefined, (_c: any, _t: string, what: string) => noted.push(what));
        expect(r).toMatchObject({ done: true, ran: 4, already: ['الكشاف'] });
        expect(log.some(l => l.startsWith('android_tap'))).toBe(false);
        expect(noted[0]).toMatch(/already off, as asked: not pressed/u);
        expect(replaySummary(recipe, 'ar', r.already)).toContain('على الحالة المطلوبة أصلًا، فلم أضغطه');

        // Still on: the tap is made, as learned.
        const log2: string[] = [];
        const f2 = fakeTools([[], [on], [on]], log2);
        const r2 = await replaySteps(recipe, { runId: 'r10', signal: new AbortController().signal, emit: () => undefined } as any,
            new Map(f2.tools.map(t => [t.name, t] as const)) as any, f2.controlsOf as any, async () => undefined);
        expect(r2.already).toBeUndefined();
        expect(log2).toContain('android_tap {"control":7}');
    });
});

describe('a control with no name of its own is known by the word beside it (the owner\'s TECNO)', () => {
    //  The quick settings as android_read gave them on 2026-11-08: the flashlight tile is a nameless
    //  FrameLayout, a Switch whose text is only its state, and «الكشاف» under them; the next tile alike.
    const box = (index: number, kind: string, text: string, cx: number, cy: number, w: number, h: number, extra: Record<string, unknown> = {}) =>
        ({ index, kind, text, description: '', id: '', x: cx - w / 2, y: cy - h / 2, width: w, height: h, checked: null, ...extra });
    const screen = (torchOn: boolean, shift = 0) => [
        box(13 + shift, 'FrameLayout', '', 540, 548, 1000, 300),
        box(33 + shift, 'Switch', torchOn ? 'تشغيل' : 'إيقاف', 882, 1385, 180, 40, { checked: torchOn }),
        box(34 + shift, 'FrameLayout', '', 882, 1322, 140, 140),
        box(36 + shift, 'TextView', 'الكشاف', 882, 1433, 180, 40, { id: 'tile_label' }),
        box(39 + shift, 'Switch', 'إيقاف', 654, 1385, 180, 40, { checked: false }),
        box(40 + shift, 'FrameLayout', '', 654, 1322, 140, 140),
        box(42 + shift, 'TextView', 'وضع الطائرة', 654, 1433, 180, 40, { id: 'tile_label' }),
    ];

    test('the tile is kept by «الكشاف» and its state, never by «إيقاف»', () => {
        const { targetOf } = ex();
        const s = screen(false);
        expect(targetOf(s, s[2])).toEqual({ kind: 'FrameLayout', near: 'الكشاف', checked: false });
        //  Its switch tapped instead: «إيقاف» is a state, not a name.
        expect(targetOf(s, s[1])).toMatchObject({ kind: 'Switch', near: 'الكشاف', checked: false });
        expect(targetOf(s, s[1]).text).toBeUndefined();
    });

    test('found again by that word at its new number; the other tile is never taken for it', () => {
        const { findControl, currentState } = ex();
        const later = screen(true, 5);
        const c = findControl(later, { kind: 'FrameLayout', near: 'الكشاف', checked: false });
        expect(c?.index).toBe(39);
        expect(currentState(later, c)).toBe(true);
        expect(findControl(later, { kind: 'FrameLayout', near: 'وضع الطائرة' })?.index).toBe(45);
        expect(findControl(later, { kind: 'FrameLayout', near: 'البلوتوث' })).toBeNull();
    });

    test('«شغل الكشاف» learned on this screen, done again: pressed when off, not pressed when already on', async () => {
        const { recordingTools, replaySteps, replayability } = ex();
        const trail = { steps: [] as any[], tried: [] as string[] };
        const before = screen(false);
        const lf = fakeTools([before, before], []);
        const [, , read, tap] = recordingTools(lf.tools as any, trail, lf.controlsOf as any);
        await read.run({}, { runId: 'tecno' } as any);
        await tap.run({ control: 34 }, { runId: 'tecno' } as any);
        expect(trail.steps[1].target).toEqual({ kind: 'FrameLayout', near: 'الكشاف', checked: false });
        const steps = [{ tool: 'android_panel', args: { panel: 'quick_settings' } }, { tool: 'android_read', args: {} }, trail.steps[1], { tool: 'android_read', args: {} }];
        expect(replayability(steps, 'act').ok).toBe(true);
        const recipe = learn({ steps });
        expect(recipe.replayable).toBe(true);

        const run = async (torchOn: boolean) => {
            const log: string[] = [];
            const f = fakeTools([[], screen(torchOn, 2), screen(true, 2)], log);
            const r = await replaySteps(recipe, { runId: `t${torchOn}`, signal: new AbortController().signal, emit: () => undefined } as any,
                new Map(f.tools.map(t => [t.name, t] as const)) as any, f.controlsOf as any, async () => undefined);
            return { r, log };
        };
        const off = await run(false);
        expect(off.r).toEqual({ done: true, ran: 4 });
        expect(off.log).toContain('android_tap {"control":36}');
        const on = await run(true);
        expect(on.r).toMatchObject({ done: true, already: ['الكشاف'] });
        expect(on.log.some(l => l.startsWith('android_tap'))).toBe(false);
    });
});

describe('a switch not on the screen is looked for once in the quick settings', () => {
    test('«اطفي الكشاف» learned with the panel open, done again with it closed: the panel is opened, the switch found and pressed', async () => {
        const { replaySteps } = ex();
        const recipe = learn({
            request: 'اطفي الكشاف', steps: [
                { tool: 'android_devices', args: {} },
                { tool: 'android_read', args: { serial: 'T' } },
                { tool: 'android_tap', args: { serial: 'T' }, target: { description: 'الكشاف', kind: 'Switch', checked: true } },
                { tool: 'android_read', args: { serial: 'T' } },
            ],
        });
        const home = [{ index: 1, kind: 'TextView', text: 'الساعة', description: '', id: '' }];
        const panel = [{ index: 33, kind: 'Switch', text: '', description: 'الكشاف', id: '', checked: true }];
        const log: string[] = [];
        //  read 1 → home; the panel opens; read 2 → the panel; read 3 → after the tap.
        const f = fakeTools([home, home, panel, panel], log);
        const r = await replaySteps(recipe, { runId: 'qs', signal: new AbortController().signal, emit: () => undefined } as any,
            new Map(f.tools.map(t => [t.name, t] as const)) as any, f.controlsOf as any, async () => undefined);
        expect(r).toEqual({ done: true, ran: 4 });
        expect(log.map(l => l.split(' ')[0])).toEqual(['android_devices', 'android_read', 'android_panel', 'android_read', 'android_tap', 'android_read']);
        expect(log).toContain('android_panel {"panel":"quick_settings","serial":"T"}');
    });

    test('a control that is no switch is not looked for there: the run goes to the model', async () => {
        const { replaySteps } = ex();
        const recipe = learn({ request: 'افتح البحث', steps: [{ tool: 'android_read', args: {} }, { tool: 'android_tap', args: {}, target: { text: 'Search' } }] });
        const log: string[] = [];
        const f = fakeTools([[], []], log);
        const r = await replaySteps(recipe, { runId: 'np', signal: new AbortController().signal, emit: () => undefined } as any,
            new Map(f.tools.map(t => [t.name, t] as const)) as any, f.controlsOf as any, async () => undefined);
        expect(r.done).toBe(false);
        expect(log.some(l => l.startsWith('android_panel'))).toBe(false);
    });
});

describe('a detour is not part of the way', () => {
    test('a tap undone by «back» is taken out with the looks between; repeated looks are kept once', () => {
        //  «اطفي الكشاف» as learned live on the TECNO, 2026-11-08.
        const learned = [
            { tool: 'android_devices', args: {} },
            { tool: 'android_read', args: { serial: 'T' } },
            { tool: 'android_tap', args: {}, target: { kind: 'Button', near: 'الكشاف', checked: true } },
            { tool: 'android_read', args: { serial: 'T' } },
            { tool: 'android_look', args: { serial: 'T' } },
            { tool: 'android_key', args: { key: 'back', serial: 'T' } },
            { tool: 'android_read', args: { serial: 'T' } },
            { tool: 'android_tap', args: { serial: 'T' }, target: { description: 'الكشاف', kind: 'Switch', checked: true } },
            { tool: 'android_read', args: { serial: 'T' } },
        ];
        const { pruneDetours } = ex();
        expect(pruneDetours(learned).map((s: any) => `${s.tool}${s.target ? ` ${s.target.description || s.target.near}` : ''}`)).toEqual([
            'android_devices', 'android_read', 'android_tap الكشاف', 'android_read',
        ]);
        //  A tap with real work after it (typing) is no detour, even when «back» follows.
        const typed = [{ tool: 'android_tap', args: {}, target: { text: 'Search' } }, { tool: 'android_type', args: { text: 'x' } }, { tool: 'android_key', args: { key: 'back' } }];
        expect(pruneDetours(typed)).toHaveLength(3);
        //  The book learns without the detour.
        expect(learn({ request: 'اطفي الكشاف', steps: learned }).steps).toHaveLength(4);
    });
});

describe('in the engine', () => {
    function deps(model: any, tools: any[], before?: any) {
        return {
            model, tools,
            processes: { async start() { throw new Error('none'); }, logs: () => undefined, stop: async () => true, list: () => [], stopAll: async () => undefined },
            browser: () => { throw new Error('no browser'); },
            machine: { platform: 'win32', shell: 'Windows PowerShell 5.1' },
            ...(before ? { before } : {}),
        };
    }
    const passing = async () => ({ passed: true, checks: [{ id: 'acted', status: 'passed', detail: 'done' }], unproven: [], at: 1 });

    test('the same request done from the book is delivered by Joe\'s checks with no model call', async () => {
        const { runEngine } = require('../core/engine/loop');
        const { finishTool } = require('../core/engine/finish');
        const { replaySteps, replaySummary } = ex();
        const recipe = learn();
        const log: string[] = [];
        const f = fakeTools([[]], log);
        const model = { label: 'never', vision: false, contextTokens: () => 64_000, async step() { throw new Error('the model was called'); } };
        const projectDir = fs.mkdtempSync(path.join(dir, 'run-'));
        const result = await runEngine({
            runId: 'run-book', request: 'شغل الكشاف', language: 'ar', replyLanguage: 'ar', projectDir, operate: true,
            deadlineAt: Date.now() + 60_000, signal: new AbortController().signal, emit: () => undefined, joe: {},
        }, deps(model, [...f.tools, finishTool(passing)], async (ctx: any, tools: Map<string, any>) => {
            const r = await replaySteps(recipe, ctx, tools, f.controlsOf, async () => undefined);
            return r.done ? { finish: replaySummary(recipe, 'ar') } : { note: 'x' };
        }));
        expect(result.status).toBe('delivered');
        expect(result.steps).toBe(0);
        expect(result.summary).toContain('من خبرتي');
        expect(result.summary).toContain('دون استدعاء الذكاء الاصطناعي');
        expect(log.map(l => l.split(' ')[0])).toEqual(['android_devices', 'android_torch', 'android_read']);
    });

    test('a step that cannot be done hands the run to the model, which is told where Joe stopped', async () => {
        const { runEngine } = require('../core/engine/loop');
        const { finishTool } = require('../core/engine/finish');
        const { replaySteps, replayNote } = ex();
        const recipe = learn({ steps: QS });
        const f = fakeTools([[], []], []);
        let firstMessage = '';
        let calls = 0;
        const model = {
            label: 'scripted', vision: false, contextTokens: () => 64_000,
            async step(messages: any[]) {
                calls++;
                if (calls === 1) firstMessage = String(messages.find((m: any) => m.role === 'user')?.content || '');
                return { text: '', toolCalls: [{ id: `c${calls}`, name: calls === 1 ? 'android_torch' : 'task_finish', arguments: calls === 1 ? '{}' : '{"summary":"شغّلتُ الكشاف."}' }], durationMs: 1 };
            },
        };
        const projectDir = fs.mkdtempSync(path.join(dir, 'run-'));
        const result = await runEngine({
            runId: 'run-hand', request: 'شغل الكشاف', language: 'ar', replyLanguage: 'ar', projectDir, operate: true,
            deadlineAt: Date.now() + 60_000, signal: new AbortController().signal, emit: () => undefined, joe: {},
        }, deps(model, [...f.tools, finishTool(passing)], async (ctx: any, tools: Map<string, any>) => {
            const r = await replaySteps(recipe, ctx, tools, f.controlsOf, async () => undefined);
            return r.done ? { finish: 'x' } : { note: replayNote(recipe, r) };
        }));
        expect(result.status).toBe('delivered');
        expect(calls).toBe(2);
        expect(firstMessage).toContain('JOE FIRST REPEATED THE WAY THAT WORKED BEFORE');
        expect(firstMessage).toContain('«الكشاف» is not on the screen now');
    });
});
