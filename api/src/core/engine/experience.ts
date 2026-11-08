/**
 * JOE'S EXPERIENCE BOOK: WHAT HE DID THAT WORKED, AND WHAT DID NOT.
 *
 * The owner, 2026-11-08: «I want Joe to learn by himself from his work: a
 * database of his own experience, so that when someone asks what he did
 * before, he does it at once — open the phone, he goes in by himself because
 * he learned it — and uses the AI only for what he does not know. One day we
 * do without Claude, or make the local model strong at Joe's own work.»
 * Nothing like it existed (the review of 2026-11-08: a «smart reflex» cache
 * and a «self-evolution engine» were deleted in 2026 as never wired and full
 * of made-up answers).
 *
 * Stage one, for the work on his devices (operate runs):
 *
 *   - A RECIPE is kept for every request Joe's own checks proved done: the
 *     request, the device, and each successful step in order — a tap by the
 *     NAME of the control it pressed, never by where it was. A LESSON is kept
 *     for a run that failed: what was tried and why it stopped.
 *   - The same request again (the same words, read alike: «شغّل الكشاف» and
 *     «شغل الكشاف يا جو») is done FROM THE RECIPE, with no model call: each
 *     step again, then the same checks. Only an action that is fixed and safe:
 *     nothing that sends, deletes, pays or calls, nothing typed into a
 *     message, nothing on the computer's screen by position. A step that
 *     cannot be done (the phone changed) hands the run to the model, told
 *     where Joe stopped; a recipe that fails twice in a row is not replayed
 *     until a run teaches it again.
 *   - Every run is given the closest recipes and lessons as examples, so the
 *     model (Claude, or the local one) starts from what worked.
 *
 * Kept per owner in data/experience/book.json (JOE_EXPERIENCE_FILE);
 * JOE_EXPERIENCE=off stops learning and using it, JOE_EXPERIENCE_REPLAY=off
 * keeps the examples and stops the replays.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { EngineTool, ToolContext, ToolOutcome } from './types';

/** The control a tap pressed: its name (or, with none, the word beside it), and for a switch its state before the tap. */
export interface StepTarget { text?: string; description?: string; id?: string; kind?: string; near?: string; checked?: boolean }
export interface ExperienceStep { tool: string; args: Record<string, unknown>; target?: StepTarget }

export interface Recipe {
    id: string;
    ownerId: string;
    /** The request read alike (requestKey): what a new request is matched on. */
    key: string;
    /** His words, as he wrote them the time it was learned. */
    request: string;
    target: 'phone' | 'computer';
    kind: string;
    steps: ExperienceStep[];
    /** What Joe told him then, in his language. */
    summary: string;
    /** Whether it may be done again with no model, and if not, why. */
    replayable: boolean;
    whyNot?: string;
    language: string;
    model: string;
    createdAt: number;
    lastAt: number;
    /** What learning it cost: the model's spend and the time. */
    learnedCostUsd: number;
    learnedMs: number;
    /** Done again from the book: how often, how often it worked, and the failures in a row now. */
    replays: number;
    replayWins: number;
    failsInARow: number;
    /** Given to a run as an example. */
    shown: number;
    savedUsd: number;
}

export interface Lesson {
    id: string;
    ownerId: string;
    key: string;
    request: string;
    target: 'phone' | 'computer';
    reason: string;
    tried: string[];
    at: number;
}

interface Book { recipes: Recipe[]; lessons: Lesson[] }

const MAX_RECIPES_PER_OWNER = 500;
const MAX_LESSONS_PER_OWNER = 300;
/** A recipe whose replay failed this many times in a row is not replayed until a run teaches it again. */
export const REPLAY_FAILS_TO_RETIRE = 2;

export function experienceOn(env: NodeJS.ProcessEnv = process.env): boolean {
    return String(env.JOE_EXPERIENCE || '').toLowerCase() !== 'off';
}
export function replayOn(env: NodeJS.ProcessEnv = process.env): boolean {
    return experienceOn(env) && String(env.JOE_EXPERIENCE_REPLAY || '').toLowerCase() !== 'off';
}

/* ───────────────────────── reading a request alike ───────────────────────── */

/** Words that say nothing of what is asked: who is called, politeness, «now», where (the device is kept apart). */
const FILLERS = new Set([
    'يا', 'جو', 'لو', 'سمحت', 'فضلك', 'رجاء', 'الان', 'هلا', 'هلق', 'الحين', 'هسا', 'هسه', 'حاليا', 'بسرعه',
    'هاتفي', 'جوالي', 'تلفوني', 'موبايلي', 'تليفوني', 'الهاتف', 'الجوال', 'التلفون', 'الموبايل', 'هاتف', 'جوال',
    'في', 'على', 'عال', 'لي', 'من',
    'please', 'joe', 'now', 'hey', 'my', 'on', 'the', 'a', 'an', 'phone', 'for', 'me', 'pls', 'plz',
]);

/** Arabic written alike: no marks, one alef, ى → ي, ة → ه; Latin lower case; punctuation out. */
export function normalizeWords(text: string): string[] {
    const t = String(text || '')
        .replace(/[ً-ٰٟـ]/gu, '')
        .replace(/[آأإٱ]/gu, 'ا')
        .replace(/ى/gu, 'ي')
        .replace(/ة/gu, 'ه')
        .replace(/ؤ/gu, 'و')
        .replace(/ئ/gu, 'ي')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]+/gu, ' ');
    return t.split(/\s+/u).filter(Boolean);
}

/** The request read alike: the words that say what is asked, the article off, in one order. */
export function requestKey(text: string): string {
    const words = normalizeWords(text)
        .filter(w => !FILLERS.has(w))
        .map(w => (w.length >= 5 && w.startsWith('ال') ? w.slice(2) : w));
    return [...new Set(words)].sort().join(' ');
}

function similarity(a: string, b: string): number {
    const x = new Set(a.split(' ').filter(Boolean)), y = new Set(b.split(' ').filter(Boolean));
    if (!x.size || !y.size) return 0;
    let both = 0;
    for (const w of x) if (y.has(w)) both++;
    return both / (x.size + y.size - both);
}

/* ───────────────────────── which steps may be done again ───────────────────────── */

/** Steps whose arguments do not depend on what a model read off the screen. */
const REPLAYABLE = new Set([
    'android_devices', 'android_read', 'android_look', 'android_torch', 'android_volume', 'android_open', 'android_key',
    'android_panel', 'android_scroll', 'android_link', 'android_tap', 'android_type', 'android_clear', 'android_apps',
    'network_devices', 'device_computers',
]);
/** Kept out of a recipe: the plan, the finish, and the question asked. */
const META = new Set(['plan_update', 'task_finish']);
/** What only he decides, every time: a control with such a name is never pressed from the book. */
const SENSITIVE = /\b(?:send|delete|remove|erase|pay|buy|purchase|order|checkout|call|dial|confirm|submit|transfer|uninstall|reset|format|sign\s*out|log\s*out)\b|إرسال|ارسال|أرسل|ارسل|حذف|احذف|مسح|امسح|دفع|ادفع|شراء|اشتر|اطلب|اتصال|اتصل|تأكيد|تاكيد|أكّد|تحويل|إلغاء التثبيت|الغاء التثبيت|ضبط المصنع|تسجيل الخروج/iu;
/** Waits after a step that moves the screen, so the next one finds it settled. */
const SETTLE_MS: Record<string, number> = { android_panel: 900, android_open: 1500, android_link: 1500, android_tap: 800, android_key: 600, android_scroll: 600, android_type: 400, android_clear: 300 };

function label(t?: StepTarget): string {
    return String(t?.text || t?.description || t?.near || t?.id || '').trim();
}

/** Whether the steps may be done again with no model; if not, why (in English, for the book). */
export function replayability(steps: ExperienceStep[], kind: string): { ok: boolean; why?: string } {
    if (kind !== 'act') return { ok: false, why: 'it asks what the screen shows or about the devices: the answer is read anew each time' };
    if (!steps.length) return { ok: false, why: 'no step to do again' };
    for (const s of steps) {
        if (s.tool === 'ask_owner') return { ok: false, why: 'Joe asked the owner something on the way' };
        if (!REPLAYABLE.has(s.tool)) return { ok: false, why: `${s.tool} is done only by a model reading the moment` };
        if (s.tool === 'android_tap') {
            if (!label(s.target)) return { ok: false, why: 'a tap by position, not by a control\'s name' };
            if (SENSITIVE.test(label(s.target))) return { ok: false, why: `it presses «${label(s.target)}», which he decides each time` };
        }
        if (s.tool === 'android_type' && SENSITIVE.test(String(s.args.text || ''))) return { ok: false, why: 'it types what he decides each time' };
        if (s.tool === 'android_link' && /^(?:tel|sms|smsto|mailto|whatsapp):/iu.test(String(s.args.uri || ''))) return { ok: false, why: 'it opens a call or a message' };
    }
    if (!steps.some(s => !/^(?:android_devices|android_read|android_look|android_apps|network_devices|device_computers)$/u.test(s.tool))) {
        return { ok: false, why: 'it only looked' };
    }
    return { ok: true };
}

/*
 * A DETOUR IS NOT PART OF THE WAY.
 *
 * Live on the owner's TECNO, 2026-11-08: «اطفي الكشاف» was learned as: tap the
 * tile → its detail panel opened → look → «back» → tap the tile's switch. Done
 * again, the first tap and the «back» are a detour at best, and at worst close
 * the panel the next step needs. A tap followed only by looks and then «back»
 * is taken out with them; looks repeated one after another are kept once.
 */
const LOOK_STEPS = new Set(['android_read', 'android_look', 'android_devices']);
export function pruneDetours(steps: ExperienceStep[]): ExperienceStep[] {
    const out = [...steps];
    for (let i = 0; i < out.length; i++) {
        if (out[i].tool !== 'android_tap') continue;
        let j = i + 1;
        while (j < out.length && LOOK_STEPS.has(out[j].tool)) j++;
        if (j < out.length && out[j].tool === 'android_key' && String(out[j].args.key || '').toLowerCase() === 'back') {
            out.splice(i, j - i + 1);
            i = Math.max(-1, i - 2);
        }
    }
    return out.filter((s, k) => !(k > 0 && LOOK_STEPS.has(s.tool) && s.tool === out[k - 1].tool && JSON.stringify(s.args) === JSON.stringify(out[k - 1].args)));
}

/* ───────────────────────── the book on disk ───────────────────────── */

let book: Book | null = null;

function bookFile(): string | null {
    if (process.env.JOE_EXPERIENCE_FILE) return process.env.JOE_EXPERIENCE_FILE;
    if (process.env.JEST_WORKER_ID) return null;
    return path.join(process.cwd(), 'data', 'experience', 'book.json');
}

function load(): Book {
    if (book) return book;
    book = { recipes: [], lessons: [] };
    const f = bookFile();
    if (f) {
        try {
            const j = JSON.parse(fs.readFileSync(f, 'utf8'));
            book = {
                //  A recipe kept before detours were taken out is read without them.
                recipes: Array.isArray(j?.recipes) ? j.recipes.filter((r: Recipe) => r && r.id && r.ownerId && Array.isArray(r.steps)).map((r: Recipe) => ({ ...r, steps: pruneDetours(r.steps) })) : [],
                lessons: Array.isArray(j?.lessons) ? j.lessons.filter((l: Lesson) => l && l.id && l.ownerId) : [],
            };
        } catch { /* no book yet, or unreadable: start empty */ }
    }
    return book;
}

function save(): void {
    const f = bookFile();
    if (!f) return;
    const b = load();
    try {
        fs.mkdirSync(path.dirname(f), { recursive: true });
        const tmp = `${f}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(b));
        fs.renameSync(tmp, f);
    } catch (e: any) {
        console.warn('[Experience] the book could not be saved:', e?.message || e);
    }
}

/** For tests: forget what is in memory and read the file again. */
export function reloadExperience(): void { book = null; }

const newId = () => crypto.randomBytes(6).toString('hex');

/* ───────────────────────── learning ───────────────────────── */

export interface RunLesson {
    ownerId: string;
    /** The request that stands alone: his words, or what his short message continued. */
    request: string;
    target: 'phone' | 'computer';
    kind: string;
    ok: boolean;
    steps: ExperienceStep[];
    /** Every call tried, failed ones included, for a lesson: «android_tap «Wi-Fi» → failed: …». */
    tried?: string[];
    summary: string;
    reason?: string;
    language: string;
    model: string;
    costUsd?: number;
    durationMs?: number;
}

/** After a run: a recipe when Joe's checks proved it done, a lesson when it failed. Returns what was kept. */
export function learnFromRun(r: RunLesson, now = Date.now()): Recipe | Lesson | null {
    if (!experienceOn() || !r.ownerId) return null;
    const key = requestKey(r.request);
    if (!key) return null;
    const b = load();
    if (!r.ok) {
        const lesson: Lesson = {
            id: newId(), ownerId: r.ownerId, key, request: r.request.slice(0, 300), target: r.target,
            reason: String(r.reason || r.summary || 'it was not done').slice(0, 400), tried: (r.tried || []).slice(-8).map(t => t.slice(0, 160)), at: now,
        };
        b.lessons.push(lesson);
        const mine = b.lessons.filter(l => l.ownerId === r.ownerId);
        if (mine.length > MAX_LESSONS_PER_OWNER) b.lessons.splice(b.lessons.indexOf(mine[0]), 1);
        save();
        return lesson;
    }
    const steps = pruneDetours(r.steps.filter(s => !META.has(s.tool)));
    const can = replayability(steps, r.kind);
    const old = b.recipes.find(x => x.ownerId === r.ownerId && x.key === key && x.target === r.target);
    const fresh: Recipe = {
        id: old?.id || newId(), ownerId: r.ownerId, key, request: r.request.slice(0, 300), target: r.target, kind: r.kind,
        steps, summary: String(r.summary || '').slice(0, 600), replayable: can.ok, ...(can.ok ? {} : { whyNot: can.why }),
        language: r.language, model: r.model, createdAt: old?.createdAt || now, lastAt: now,
        learnedCostUsd: Math.max(0, Number(r.costUsd) || 0) || old?.learnedCostUsd || 0, learnedMs: Math.max(0, Number(r.durationMs) || 0),
        replays: old?.replays || 0, replayWins: old?.replayWins || 0, failsInARow: 0, shown: old?.shown || 0, savedUsd: old?.savedUsd || 0,
    };
    if (old) b.recipes[b.recipes.indexOf(old)] = fresh; else b.recipes.push(fresh);
    const mine = b.recipes.filter(x => x.ownerId === r.ownerId);
    if (mine.length > MAX_RECIPES_PER_OWNER) {
        const oldest = mine.reduce((a, c) => (c.lastAt < a.lastAt ? c : a));
        b.recipes.splice(b.recipes.indexOf(oldest), 1);
    }
    save();
    return fresh;
}

/** The recipe to do again for this request, with no model: the same words read alike, safe, and still trusted. */
export function replayFor(ownerId: string, request: string, target: 'phone' | 'computer'): Recipe | null {
    if (!replayOn() || !ownerId) return null;
    const key = requestKey(request);
    if (!key) return null;
    const r = load().recipes.find(x => x.ownerId === ownerId && x.key === key && x.target === target);
    return r && r.replayable && r.failsInARow < REPLAY_FAILS_TO_RETIRE ? r : null;
}

/** A replay ended: worked (with what learning it had cost, now saved) or not. */
export function noteReplay(id: string, worked: boolean, now = Date.now()): void {
    const r = load().recipes.find(x => x.id === id);
    if (!r) return;
    r.replays++;
    if (worked) { r.replayWins++; r.failsInARow = 0; r.savedUsd += r.learnedCostUsd; r.lastAt = now; }
    else r.failsInARow++;
    save();
}

/* ───────────────────────── examples for a run ───────────────────────── */

function stepLine(s: ExperienceStep): string {
    const args = { ...s.args };
    delete (args as any).serial;
    const shown = s.tool === 'android_tap' && label(s.target) ? `«${label(s.target)}»` : Object.keys(args).length ? JSON.stringify(args).slice(0, 120) : '';
    return `${s.tool}${shown ? ` ${shown}` : ''}`;
}

/**
 * The closest ways that worked and the closest failures, for the run's first
 * message: the model, Claude or local, starts from what Joe already knows.
 * Empty when the book has nothing near.
 */
export function experienceFacts(ownerId: string, request: string, target: 'phone' | 'computer', n = 3): string {
    if (!experienceOn() || !ownerId) return '';
    const key = requestKey(request);
    if (!key) return '';
    const b = load();
    const near = <T extends { key: string; target: string; ownerId: string }>(rows: T[]) => rows
        .filter(x => x.ownerId === ownerId && x.target === target)
        .map(x => ({ x, s: similarity(key, x.key) }))
        .filter(v => v.s >= 0.34)
        .sort((p, q) => q.s - p.s)
        .slice(0, n)
        .map(v => v.x);
    const recipes = near(b.recipes);
    const lessons = near(b.lessons);
    if (!recipes.length && !lessons.length) return '';
    for (const r of recipes) r.shown++;
    if (recipes.length) save();
    const lines: string[] = [];
    if (recipes.length) {
        lines.push('JOE\'S EXPERIENCE: ways that worked before for requests like this one, proven by Joe\'s checks. Start from them; the screen may differ now, so read it before you tap.');
        for (const r of recipes) lines.push(`- «${r.request}» (${r.target}): ${r.steps.map(stepLine).join(' → ')}`);
    }
    if (lessons.length) {
        lines.push('WHAT FAILED BEFORE for requests like this one (do not repeat it as it was):');
        for (const l of lessons) lines.push(`- «${l.request}»: ${l.reason.replace(/\s+/gu, ' ').slice(0, 200)}${l.tried.length ? ` — tried: ${l.tried.slice(-3).join('; ')}` : ''}`);
    }
    return lines.join('\n');
}

/* ───────────────────────── recording a run's steps ───────────────────────── */

export interface Trail { steps: ExperienceStep[]; tried: string[] }

/**
 * The run's tools, each kept as it is and recording what it did: a successful
 * call becomes a step (a tap with the name of the control it pressed, read off
 * the last android_read), every call a line of what was tried.
 */
export function recordingTools(tools: EngineTool[], trail: Trail, controlsOf: (runId: string) => Control[]): EngineTool[] {
    return tools.map(t => ({
        ...t,
        async run(args: any, ctx: ToolContext): Promise<ToolOutcome> {
            let target: StepTarget | undefined;
            if (t.name === 'android_tap' && args && Number.isInteger(args.control)) {
                const all = controlsOf(ctx.runId) || [];
                const c = all.find(k => k.index === args.control);
                if (c) target = targetOf(all, c);
            }
            const outcome = await t.run(args, ctx);
            const step: ExperienceStep = { tool: t.name, args: cleanArgs(t.name, args), ...(target ? { target } : {}) };
            trail.tried.push(`${stepLine(step)} → ${outcome.ok ? 'ok' : `failed: ${String(outcome.output || '').split('\n')[0].slice(0, 100)}`}`);
            if (outcome.ok && !META.has(t.name)) trail.steps.push(step);
            return outcome;
        },
    }));
}

/** The arguments as a recipe keeps them: a tap by name drops its number; long text is cut. */
function cleanArgs(tool: string, args: unknown): Record<string, unknown> {
    const a: Record<string, unknown> = {};
    if (!args || typeof args !== 'object') return a;
    for (const [k, v] of Object.entries(args as Record<string, unknown>)) {
        if (tool === 'android_tap' && (k === 'control' || k === 'x' || k === 'y')) continue;
        if (typeof v === 'string') a[k] = v.slice(0, 400);
        else if (typeof v === 'number' || typeof v === 'boolean') a[k] = v;
        else if (Array.isArray(v)) a[k] = v.slice(0, 20).map(x => (typeof x === 'string' ? x.slice(0, 200) : x));
    }
    if (tool === 'android_tap' && !('control' in (args as any)) && 'x' in (args as any)) { a.x = (args as any).x; a.y = (args as any).y; }
    return a;
}

/* ───────────────────────── doing it again ───────────────────────── */

function sameText(a?: string, b?: string): boolean {
    const n = (s?: string) => normalizeWords(String(s || '')).join(' ');
    return !!n(a) && n(a) === n(b);
}

/*
 * A CONTROL WITH NO NAME OF ITS OWN IS KNOWN BY THE WORD BESIDE IT.
 *
 * The owner's TECNO, 2026-11-08: the flashlight tile is three controls in one
 * column — a nameless FrameLayout (what is tapped), a Switch whose text is only
 * its state («إيقاف» / «تشغيل»), and the TextView «الكشاف» under them. The
 * tap is kept with the nearest real word in its column («near»), never with a
 * state word, and with the state of the nearest switch in that column
 * («checked»): done again, the tile is found by that word, and a tile already
 * the other way is not pressed.
 */
export type Control = { index: number; text: string; description: string; id: string; kind: string; checked?: boolean | null; x?: number; y?: number; width?: number; height?: number };

const STATE_WORD = /^(?:تشغيل|إيقاف|ايقاف|مفعل|مفعّل|غير مفعل|غير مفعّل|متوقف|مشغل|مشغّل|مطفأ|مطفا|on|off|enabled|disabled|checked|unchecked)$/iu;

/** A control's own name, unless it is only a state («تشغيل», «off»). */
function ownName(c: Control): string {
    const n = String(c.text || c.description || '').trim();
    return n && !STATE_WORD.test(normalizeWords(n).join(' ')) && !STATE_WORD.test(n) ? n : '';
}

function centre(c: Control): { x: number; y: number } {
    return { x: (c.x || 0) + (c.width || 0) / 2, y: (c.y || 0) + (c.height || 0) / 2 };
}

/** The controls in the same column as c, near it: nearest first. */
function column(controls: Control[], c: Control): Control[] {
    const o = centre(c);
    //  Close to it: within about one and a half of its own heights (a tile's label sits just under it).
    const reachX = Math.max((c.width || 0) / 2, 40), reach = Math.max(1.6 * (c.height || 0), 160);
    return controls
        .filter(d => d !== c && d.index !== c.index)
        .map(d => ({ d, p: centre(d) }))
        .filter(v => Math.abs(v.p.x - o.x) <= reachX && Math.hypot(v.p.x - o.x, v.p.y - o.y) <= reach)
        .sort((a, b) => Math.hypot(a.p.x - o.x, a.p.y - o.y) - Math.hypot(b.p.x - o.x, b.p.y - o.y))
        .map(v => v.d);
}

function nearWord(controls: Control[], c: Control): string {
    for (const d of column(controls, c)) { const n = ownName(d); if (n) return n; }
    return '';
}

/** The on/off state of the control, or of the nearest switch in its column. */
function stateOf(controls: Control[], c: Control): boolean | undefined {
    if (typeof c.checked === 'boolean') return c.checked;
    const s = column(controls, c).find(d => typeof d.checked === 'boolean');
    return s && typeof s.checked === 'boolean' ? s.checked : undefined;
}

/** What a tap is kept as: the control's own name, or the word beside it; its state when it has one. */
export function targetOf(controls: Control[], c: Control): StepTarget {
    const text = c.text && ownName({ ...c, description: '' }) ? c.text : '';
    const description = !text && c.description && ownName({ ...c, text: '' }) ? c.description : '';
    const near = text || description ? '' : nearWord(controls, c);
    const checked = stateOf(controls, c);
    return {
        ...(text ? { text } : {}),
        ...(description ? { description } : {}),
        ...(c.id ? { id: c.id } : {}),
        ...(c.kind ? { kind: c.kind } : {}),
        ...(near ? { near } : {}),
        ...(typeof checked === 'boolean' ? { checked } : {}),
    };
}

/** The current on/off state of a control found again (itself, or the switch in its column). */
export function currentState(controls: Control[], c: Control): boolean | undefined {
    return stateOf(controls, c);
}

/** The control a recorded tap pressed, on the screen as it is now: by id and name, then by name, then by the word beside it. */
export function findControl<C extends Control>(controls: C[], t: StepTarget): C | null {
    if (!t.text && !t.description) {
        //  Known by the word beside it: the one nameless control of that kind whose column holds that word.
        if (t.near) {
            const by = controls.filter(c => !ownName(c) && (!t.kind || c.kind === t.kind) && sameText(nearWord(controls, c), t.near));
            return by.length === 1 ? by[0] : null;
        }
        //  Known only by its id: found when exactly one control has it (tiles often share one id).
        const same = t.id ? controls.filter(c => c.id === t.id && (!t.kind || c.kind === t.kind)) : [];
        return same.length === 1 ? same[0] : null;
    }
    const named = (c: C) => (t.text ? sameText(c.text, t.text) : false) || (t.description ? sameText(c.description, t.description) : false);
    return controls.find(c => !!t.id && c.id === t.id && named(c))
        || controls.find(c => named(c) && (!t.kind || c.kind === t.kind))
        || controls.find(c => named(c))
        || null;
}

export interface ReplayOutcome { done: boolean; ran: number; why?: string; at?: string; already?: string[] }

/**
 * Does the recipe's steps again, in this run, through the run's own tools (so
 * the firewall, the audit and the device record see each one), each shown in
 * the run's activity. Stops at the first step that cannot be done.
 *
 * A SWITCH ALREADY AS ASKED IS NOT PRESSED. The flashlight tile toggles: «اطفي
 * الكشاف» learned as one tap on «الكشاف» while it was ON would, done again
 * while it is already OFF, turn it ON. A tap on a control that had an on/off
 * state is kept with that state (target.checked); when the control now shows
 * the other state — the one the tap made — it is not pressed, and `done` says
 * so (`already`), so the owner is told it already was.
 */
export async function replaySteps(
    recipe: Recipe, ctx: ToolContext, tools: Map<string, EngineTool>,
    controlsOf: (runId: string) => Control[],
    pause: (ms: number) => Promise<void> = ms => new Promise(r => setTimeout(r, ms)),
    noteDone?: (ctx: ToolContext, tool: string, what: string) => void,
): Promise<ReplayOutcome> {
    let ran = 0;
    const already: string[] = [];
    for (const [i, step] of recipe.steps.entries()) {
        if (ctx.signal.aborted) return { done: false, ran, why: 'the run was cancelled' };
        const tool = tools.get(step.tool);
        if (!tool) return { done: false, ran, why: `${step.tool} is not among this run's tools`, at: stepLine(step) };
        let args: Record<string, unknown> = { ...step.args };
        if (step.tool === 'android_tap' && step.target) {
            let screen = controlsOf(ctx.runId) || [];
            let c = findControl(screen, step.target);
            /*
             * A switch not on the screen is looked for once in the quick settings, where the
             * phone's switches live (flashlight, Wi-Fi, Bluetooth, airplane mode…). Live on the
             * TECNO, 2026-11-08: «اطفي الكشاف» was learned with the panel already open, so its
             * recipe never opened it; done again with the panel closed, the tile was not there.
             */
            if (!c && typeof step.target.checked === 'boolean' && tools.has('android_panel') && tools.has('android_read')) {
                const serial = typeof step.args.serial === 'string' ? { serial: step.args.serial } : {};
                for (const [name, a] of [['android_panel', { panel: 'quick_settings', ...serial }], ['android_read', serial]] as const) {
                    const t = tools.get(name)!;
                    const p = t.parse(a);
                    if (!p.ok) break;
                    const id = `replay-${recipe.id}-${i}-${name}`;
                    ctx.emit({ type: 'tool_call', id, name, args: p.value } as any);
                    let o: ToolOutcome;
                    try { o = await t.run(p.value, ctx); } catch (e: any) { o = { ok: false, output: String(e?.message || e) }; }
                    ctx.emit({ type: 'tool_result', id, name, ok: o.ok, output: String(o.output || '').slice(0, 2000), durationMs: 0, facts: o.facts } as any);
                    if (!o.ok) break;
                    if (name === 'android_panel') await pause(SETTLE_MS.android_panel);
                }
                screen = controlsOf(ctx.runId) || [];
                c = findControl(screen, step.target);
            }
            if (!c) return { done: false, ran, why: `the control «${label(step.target)}» is not on the screen now`, at: stepLine(step) };
            const now = currentState(screen, c);
            if (typeof step.target.checked === 'boolean' && typeof now === 'boolean' && now !== step.target.checked) {
                already.push(label(step.target));
                noteDone?.(ctx, 'android_tap', `«${label(step.target)}» was already ${now ? 'on' : 'off'}, as asked: not pressed`);
                ran++;
                continue;
            }
            args = { ...args, control: c.index };
        }
        const parsed = tool.parse(args);
        if (!parsed.ok) return { done: false, ran, why: parsed.error, at: stepLine(step) };
        const id = `replay-${recipe.id}-${i}`;
        ctx.emit({ type: 'tool_call', id, name: step.tool, args: parsed.value } as any);
        const started = Date.now();
        let out: ToolOutcome;
        try { out = await tool.run(parsed.value, ctx); } catch (e: any) { out = { ok: false, output: String(e?.message || e) }; }
        ctx.emit({ type: 'tool_result', id, name: step.tool, ok: out.ok, output: String(out.output || '').slice(0, 2000), durationMs: Date.now() - started, facts: out.facts } as any);
        //  A picture refused (a locked phone takes none) only fails to look: the reads beside it look.
        if (!out.ok && step.tool !== 'android_look') return { done: false, ran, why: String(out.output || 'it failed').split('\n')[0].slice(0, 300), at: stepLine(step) };
        ran++;
        const wait = SETTLE_MS[step.tool];
        if (wait) await pause(wait);
    }
    return { done: true, ran, ...(already.length ? { already } : {}) };
}

/** What the owner is told when the book did it: his language, no model named, the cost it saved. */
export function replaySummary(recipe: Recipe, language: string, already: string[] = []): string {
    const n = recipe.steps.length;
    const ar = String(language || '').toLowerCase().startsWith('ar');
    const was = already.length
        ? (ar ? ` وكان ${already.map(a => `«${a}»`).join(' و')} على الحالة المطلوبة أصلًا، فلم أضغطه.` : ` ${already.map(a => `«${a}»`).join(', ')} was already as asked, so I did not press it.`)
        : '';
    return ar
        ? `نفّذتُ «${recipe.request}» من خبرتي: أعدتُ الخطوات التي نجحت من قبل (${n} ${n === 1 ? 'خطوة' : n === 2 ? 'خطوتان' : n <= 10 ? 'خطوات' : 'خطوة'})، دون استدعاء الذكاء الاصطناعي، ثم تأكدتُ من النتيجة بفحوصي.${was}`
        : `I did «${recipe.request}» from my experience: the ${n} step(s) that worked before, with no AI call, then checked the result with my own checks.${was}`;
}

/** What the model is told when the book could not finish: where Joe stopped, so it goes on from there. */
export function replayNote(recipe: Recipe, r: ReplayOutcome, checksFailed?: string): string {
    const done = recipe.steps.slice(0, r.ran).map(stepLine).join(' → ');
    return [
        `JOE FIRST REPEATED THE WAY THAT WORKED BEFORE for this same request (his experience): ${done ? `these steps were done: ${done}` : 'no step could be done'}.`,
        checksFailed ? `Every step ran, but Joe's checks did not pass: ${checksFailed}` : `Then ${r.at ? `«${r.at}»` : 'the next step'} could not be done: ${r.why || 'it failed'}.`,
        'The device may have changed since. Go on from its state now: read the screen first, and do not repeat a step that is already done.',
    ].join('\n');
}

/* ───────────────────────── what the page shows ───────────────────────── */

export interface ExperienceView {
    recipes: Array<Pick<Recipe, 'id' | 'request' | 'target' | 'replayable' | 'whyNot' | 'replays' | 'replayWins' | 'failsInARow' | 'shown' | 'savedUsd' | 'createdAt' | 'lastAt' | 'summary'> & { steps: number }>;
    lessons: Array<Pick<Lesson, 'id' | 'request' | 'target' | 'reason' | 'at'>>;
    totals: { recipes: number; replayable: number; replays: number; replayWins: number; savedUsd: number; lessons: number };
}

export function experienceView(ownerId: string): ExperienceView {
    const b = load();
    const recipes = b.recipes.filter(r => r.ownerId === ownerId).sort((p, q) => q.lastAt - p.lastAt);
    const lessons = b.lessons.filter(l => l.ownerId === ownerId).sort((p, q) => q.at - p.at).slice(0, 50);
    return {
        recipes: recipes.map(r => ({
            id: r.id, request: r.request, target: r.target, replayable: r.replayable && r.failsInARow < REPLAY_FAILS_TO_RETIRE,
            ...(r.whyNot ? { whyNot: r.whyNot } : r.failsInARow >= REPLAY_FAILS_TO_RETIRE ? { whyNot: 'its last replays failed: a run will teach it again' } : {}),
            replays: r.replays, replayWins: r.replayWins, failsInARow: r.failsInARow, shown: r.shown, savedUsd: r.savedUsd,
            createdAt: r.createdAt, lastAt: r.lastAt, summary: r.summary, steps: r.steps.length,
        })),
        lessons: lessons.map(l => ({ id: l.id, request: l.request, target: l.target, reason: l.reason, at: l.at })),
        totals: {
            recipes: recipes.length,
            replayable: recipes.filter(r => r.replayable && r.failsInARow < REPLAY_FAILS_TO_RETIRE).length,
            replays: recipes.reduce((s, r) => s + r.replays, 0),
            replayWins: recipes.reduce((s, r) => s + r.replayWins, 0),
            savedUsd: Math.round(recipes.reduce((s, r) => s + r.savedUsd, 0) * 10000) / 10000,
            lessons: b.lessons.filter(l => l.ownerId === ownerId).length,
        },
    };
}

/** He deletes a recipe or a lesson from his book. True when it was his and is gone. */
export function forgetExperience(ownerId: string, id: string): boolean {
    const b = load();
    const ri = b.recipes.findIndex(r => r.id === id && r.ownerId === ownerId);
    if (ri >= 0) { b.recipes.splice(ri, 1); save(); return true; }
    const li = b.lessons.findIndex(l => l.id === id && l.ownerId === ownerId);
    if (li >= 0) { b.lessons.splice(li, 1); save(); return true; }
    return false;
}
