/**
 * A WAY JOE KNOWS, WITH NEW WORDS IN ITS BLANKS — STILL NO MODEL.
 *
 * Stage two of the experience book (the owner, 2026-11-08: «he uses the AI
 * only for what he does not know»). Learned once, «اضبط الصوت على 50» is the
 * way for «اضبط الصوت على ٨٠»; «اكتب مرحبا» for «اكتب كيف حالك»; «افتح محادثة
 * أمي» for «افتح محادثة سارة»; a search in an address for another search.
 * Pinned:
 *   - Arabic-Indic digits read as 0–9 («٥٠» = «50»), and a different number is
 *     a different request;
 *   - a blank is only what the steps carry of his words; a number he said that
 *     the steps do not carry leaves no blank (it meant something else);
 *   - the words outside the blank must be the same; the filled steps must still
 *     be safe (no «احذف» typed, no «إرسال» pressed);
 *   - the very same words still find their own recipe first;
 *   - a filled replay that fails counts against the shape only, never against
 *     the request it was learned from;
 *   - done again, the new value reaches the tool, and he is told which way it
 *     was.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

jest.setTimeout(180_000);

let dir = '';
beforeEach(() => {
    jest.resetModules();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-blanks-'));
    process.env.JOE_EXPERIENCE_FILE = path.join(dir, 'book.json');
});
afterEach(() => {
    delete process.env.JOE_EXPERIENCE_FILE;
    fs.rmSync(dir, { recursive: true, force: true });
});

const ex = () => require('../core/engine/experience');
function learn(request: string, steps: any[], over: Record<string, unknown> = {}) {
    return ex().learnFromRun({
        ownerId: 'owner-1', request, target: 'phone', kind: 'act', ok: true, steps,
        summary: 'تم.', language: 'ar', model: 'claude-haiku-5-5', costUsd: 0.006, durationMs: 50_000, ...over,
    });
}

describe('numbers', () => {
    test('Arabic-Indic digits read as 0–9, and another number is another request', () => {
        const { requestKey } = ex();
        expect(requestKey('اضبط الصوت على ٥٠')).toBe(requestKey('اضبط الصوت على 50'));
        expect(requestKey('اضبط الصوت على ٥٠')).not.toBe(requestKey('اضبط الصوت على ٨٠'));
    });

    test('a number the steps carry is a blank: another number fills it', () => {
        const r = learn('اضبط الصوت على 50', [{ tool: 'android_volume', args: { level: 50, stream: 'media' } }]);
        expect(r.shape).toBeTruthy();
        expect(r.blanks).toEqual({ numbers: ['50'] });
        const f = ex().replayFor('owner-1', 'اضبط الصوت على ٨٠ يا جو', 'phone');
        expect(f?.id).toBe(r.id);
        expect(f?.from).toBe('اضبط الصوت على 50');
        expect(f?.request).toBe('اضبط الصوت على ٨٠ يا جو');
        expect(f?.steps[0].args).toEqual({ level: 80, stream: 'media' });
        //  The recipe kept is not changed by filling it.
        expect(ex().replayFor('owner-1', 'اضبط الصوت على 50', 'phone')?.steps[0].args.level).toBe(50);
    });

    test('other words, or another count of numbers, are not that shape', () => {
        learn('اضبط الصوت على 50', [{ tool: 'android_volume', args: { level: 50 } }]);
        const { replayFor } = ex();
        expect(replayFor('owner-1', 'اضبط صوت المنبه على 80', 'phone')).toBeNull();
        expect(replayFor('owner-1', 'اضبط الصوت على 80 ثم 20', 'phone')).toBeNull();
        expect(replayFor('owner-1', 'اضبط الصوت', 'phone')).toBeNull();
        expect(replayFor('owner-2', 'اضبط الصوت على 80', 'phone')).toBeNull();
    });

    test('a number he said that the steps do not carry leaves no blank', () => {
        const r = learn('ارفع الصوت 3 درجات', [{ tool: 'android_volume', args: { change: 'up' } }, { tool: 'android_volume', args: { change: 'up' } }]);
        expect(r.shape).toBeUndefined();
        expect(ex().replayFor('owner-1', 'ارفع الصوت 5 درجات', 'phone')).toBeNull();
    });
});

describe('texts', () => {
    test('a text typed is a blank', () => {
        learn('اكتب مرحبا', [{ tool: 'android_type', args: { text: 'مرحبا' } }]);
        const f = ex().replayFor('owner-1', 'اكتب كيف حالك يا صديقي', 'phone');
        expect(f?.steps[0].args.text).toBe('كيف حالك يا صديقي');
    });

    test('a control pressed by the name he said is a blank', () => {
        learn('افتح محادثة أمي', [
            { tool: 'android_open', args: { package: 'com.whatsapp' } },
            { tool: 'android_read', args: {} },
            { tool: 'android_tap', args: {}, target: { text: 'أمي', kind: 'TextView' } },
        ]);
        const f = ex().replayFor('owner-1', 'افتح محادثة سارة', 'phone');
        expect(f?.steps[2].target).toEqual({ text: 'سارة', kind: 'TextView' });
        expect(f?.steps[0].args).toEqual({ package: 'com.whatsapp' });
    });

    test('a text inside an address is a blank, written as the address wrote it', () => {
        learn('ابحث في الخريطة عن مطعم', [{ tool: 'android_link', args: { uri: `geo:0,0?q=${encodeURIComponent('مطعم')}` } }]);
        const f = ex().replayFor('owner-1', 'ابحث في الخريطة عن صيدلية قريبة', 'phone');
        expect(f?.steps[0].args.uri).toBe(`geo:0,0?q=${encodeURIComponent('صيدلية قريبة')}`);
    });

    test('filled steps must still be safe: nothing he decides each time', () => {
        learn('اكتب مرحبا', [{ tool: 'android_type', args: { text: 'مرحبا' } }]);
        learn('افتح محادثة أمي', [{ tool: 'android_read', args: {} }, { tool: 'android_tap', args: {}, target: { text: 'أمي' } }]);
        const { replayFor } = ex();
        expect(replayFor('owner-1', 'اكتب احذف كل شيء', 'phone')).toBeNull();
        expect(replayFor('owner-1', 'افتح محادثة إرسال', 'phone')).toBeNull();
    });
});

describe('the book keeps its own ways first', () => {
    const QS = [
        { tool: 'android_panel', args: { panel: 'quick_settings' } },
        { tool: 'android_read', args: {} },
        { tool: 'android_tap', args: {}, target: { text: 'الكشاف', kind: 'Switch', checked: false } },
    ];

    test('the same words find their own recipe; a failing filled shape never stops it', () => {
        const r = learn('شغل الكشاف', QS);
        const { replayFor, noteReplay } = ex();
        const bt = replayFor('owner-1', 'شغل البلوتوث', 'phone');
        expect(bt?.from).toBe('شغل الكشاف');
        expect(bt?.steps[2].target).toMatchObject({ text: 'البلوتوث', checked: false });
        noteReplay(bt, false);
        noteReplay(replayFor('owner-1', 'شغل يوتيوب', 'phone'), false);
        expect(replayFor('owner-1', 'شغل البلوتوث', 'phone')).toBeNull();
        const own = replayFor('owner-1', 'شغّل الكشاف', 'phone');
        expect(own?.id).toBe(r.id);
        expect(own?.from).toBeUndefined();
        expect(own?.steps[2].target.text).toBe('الكشاف');
    });

    test('a filled replay that works counts as a saving, and a run that teaches it again lets the shape fill again', () => {
        const r = learn('شغل الكشاف', QS);
        const { replayFor, noteReplay, experienceView } = ex();
        noteReplay(replayFor('owner-1', 'شغل الواي فاي', 'phone'), true);
        expect(experienceView('owner-1').totals).toMatchObject({ replays: 1, replayWins: 1, savedUsd: 0.006 });
        noteReplay(replayFor('owner-1', 'شغل البلوتوث', 'phone'), false);
        noteReplay(replayFor('owner-1', 'شغل البلوتوث', 'phone'), false);
        expect(replayFor('owner-1', 'شغل البلوتوث', 'phone')).toBeNull();
        learn('شغل الكشاف', QS);
        expect(replayFor('owner-1', 'شغل البلوتوث', 'phone')?.id).toBe(r.id);
    });
});

describe('done again', () => {
    test('the new value reaches the tool, and he is told which way it was', async () => {
        learn('اضبط الصوت على 50', [{ tool: 'android_volume', args: { level: 50 } }]);
        const { replayFor, replaySteps, replaySummary, replayNote } = ex();
        const recipe = replayFor('owner-1', 'اضبط الصوت على 80', 'phone');
        const seen: any[] = [];
        const tools = new Map([['android_volume', {
            name: 'android_volume', parse: (a: any) => ({ ok: true, value: a }),
            run: async (a: any) => { seen.push(a); return { ok: true, output: 'media 80%' }; },
        }]]);
        const r = await replaySteps(recipe, { runId: 'v1', signal: new AbortController().signal, emit: () => undefined } as any, tools as any, () => [], async () => undefined);
        expect(r.done).toBe(true);
        expect(seen).toEqual([{ level: 80 }]);
        expect(replaySummary(recipe, 'ar')).toContain('بالطريقة التي نجحت من قبل في «اضبط الصوت على 50»');
        expect(replaySummary(recipe, 'ar')).toContain('«اضبط الصوت على 80»');
        expect(replayNote(recipe, { done: false, ran: 0, why: 'x' })).toMatch(/same shape \(«اضبط الصوت على 50»\)/);
    });
});
