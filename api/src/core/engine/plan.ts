/**
 * THE RUN'S WORKING MEMORY: WHAT WAS ASKED, AND HOW FAR THE WORK HAS COME.
 *
 * The first engine read a one-sentence request as one requirement. Nothing
 * reminded the file writers which requested items were still open, so P001's
 * customer reviews were dropped without a word. The only check that read
 * the request's items ran at the very end, hours later.
 *
 * Here the requested items are read once, at the start, by the readers the
 * final judge uses (Joe's clause reader, plus the grounded model reading when
 * a model is reachable). They are numbered R1…Rn, stay in the plan for the
 * whole run, and are recited at the end of every step. The model reports
 * progress on them and may add items. It cannot remove one: an item the
 * request named is part of the contract whether the model likes it or not.
 */
import type { EngineTool, ParseResult, PlanState, PlanStep, Requirement, RequirementStatus } from './types';
import { formatPlan } from './context';

export interface RequirementSeed {
    text: string;
    quote?: string;
    key?: string;
}

function norm(s: string): string {
    return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** R1…Rn in reading order, one entry per distinct item. */
export function seededRequirements(seeds: RequirementSeed[]): Requirement[] {
    const out: Requirement[] = [];
    const seenKey = new Set<string>();
    const seenText = new Set<string>();
    for (const s of seeds) {
        const text = String(s.text || '').trim();
        if (!text) continue;
        if (s.key && seenKey.has(s.key)) continue;
        if (seenText.has(norm(text))) continue;
        if (s.key) seenKey.add(s.key);
        seenText.add(norm(text));
        out.push({ id: `R${out.length + 1}`, text, status: 'open', fromRequest: true, quote: s.quote, key: s.key });
    }
    return out;
}

export function newPlan(requirements: Requirement[]): PlanState {
    return { requirements, steps: [], revision: 0 };
}

export interface PlanArgs {
    steps?: PlanStep[];
    requirements?: { id: string; status: RequirementStatus; evidence?: string }[];
    add_requirements?: { text: string }[];
    note?: string;
}

const STEP_STATUS = new Set(['pending', 'in_progress', 'done']);
const REQ_STATUS = new Set(['open', 'done', 'blocked']);

function asArray(v: unknown): unknown[] | undefined {
    if (v == null) return undefined;
    return Array.isArray(v) ? v : undefined;
}

export function parsePlanArgs(raw: unknown): ParseResult<PlanArgs> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'plan_update takes an object: {"steps": [...], "requirements": [...], "add_requirements": [...], "note": "..."}.' };
    const a = raw as Record<string, unknown>;
    const out: PlanArgs = {};
    if (a.steps !== undefined) {
        const steps = asArray(a.steps);
        if (!steps) return { ok: false, error: '"steps" must be a list like [{"title": "Write the page", "status": "in_progress"}].' };
        out.steps = [];
        for (const s of steps) {
            const title = typeof s === 'string' ? s : String((s as any)?.title ?? (s as any)?.step ?? '').trim();
            const status = typeof s === 'string' ? 'pending' : String((s as any)?.status ?? 'pending');
            if (!title) return { ok: false, error: 'Every step needs a "title".' };
            if (!STEP_STATUS.has(status)) return { ok: false, error: `Step status "${status}" is not one of pending, in_progress, done.` };
            out.steps.push({ title, status: status as PlanStep['status'] });
        }
    }
    if (a.requirements !== undefined) {
        const reqs = asArray(a.requirements);
        if (!reqs) return { ok: false, error: '"requirements" must be a list like [{"id": "R1", "status": "done", "evidence": "..."}].' };
        out.requirements = [];
        for (const r of reqs) {
            const id = String((r as any)?.id ?? '').trim().toUpperCase();
            const status = String((r as any)?.status ?? '');
            if (!/^R\d+$/.test(id)) return { ok: false, error: `Requirement id "${id}" is not of the form R1, R2, …` };
            if (!REQ_STATUS.has(status)) return { ok: false, error: `Requirement status "${status}" is not one of open, done, blocked.` };
            const evidence = (r as any)?.evidence == null ? undefined : String((r as any).evidence).slice(0, 500);
            out.requirements.push({ id, status: status as RequirementStatus, evidence });
        }
    }
    if (a.add_requirements !== undefined) {
        const adds = asArray(a.add_requirements);
        if (!adds) return { ok: false, error: '"add_requirements" must be a list like [{"text": "..."}].' };
        out.add_requirements = [];
        for (const r of adds) {
            const text = typeof r === 'string' ? r.trim() : String((r as any)?.text ?? '').trim();
            if (text) out.add_requirements.push({ text: text.slice(0, 300) });
        }
    }
    if (a.note !== undefined) out.note = String(a.note).slice(0, 600);
    if (!out.steps && !out.requirements && !out.add_requirements && out.note === undefined) {
        return { ok: false, error: 'plan_update needs at least one of "steps", "requirements", "add_requirements" or "note".' };
    }
    return { ok: true, value: out };
}

/** Apply an update. Returns the problems the model should know about, if any. */
export function applyPlanUpdate(plan: PlanState, args: PlanArgs): string[] {
    const problems: string[] = [];
    if (args.steps) {
        const inProgress = args.steps.filter(s => s.status === 'in_progress');
        if (inProgress.length > 1) {
            problems.push(`${inProgress.length} steps were marked in_progress; only the first one keeps that status.`);
            let first = true;
            for (const s of args.steps) {
                if (s.status !== 'in_progress') continue;
                if (first) { first = false; continue; }
                s.status = 'pending';
            }
        }
        plan.steps = args.steps;
    }
    //  Added before statuses are set: a model that adds a requirement and marks
    //  it in the same call («add R1, R1 is open») was refused «There is no
    //  requirement R1» — the owner's phone run, 2026-11-07, its first step red.
    if (args.add_requirements) {
        for (const a of args.add_requirements) {
            if (plan.requirements.some(r => norm(r.text) === norm(a.text))) continue;
            plan.requirements.push({ id: `R${plan.requirements.length + 1}`, text: a.text, status: 'open', fromRequest: false });
        }
    }
    if (args.requirements) {
        for (const u of args.requirements) {
            const r = plan.requirements.find(x => x.id === u.id);
            if (!r) { problems.push(`There is no requirement ${u.id}; the ids are ${plan.requirements.map(x => x.id).join(', ') || 'none yet'}.`); continue; }
            r.status = u.status;
            if (u.evidence !== undefined) r.evidence = u.evidence;
        }
    }
    if (args.note !== undefined) plan.note = args.note || undefined;
    plan.revision++;
    return problems;
}

export const planUpdateTool: EngineTool<PlanArgs> = {
    name: 'plan_update',
    description: 'Record your plan and your progress. Call it first, then whenever a step is finished or the plan changes. "steps" replaces the whole step list; keep exactly one step in_progress. "requirements" sets the status (open, done, blocked) of listed requirement ids, with the evidence you saw. "add_requirements" adds items the request implies that are not listed yet. Requirements read from the request cannot be removed. Returns the plan as it now stands.',
    parameters: {
        type: 'object',
        properties: {
            steps: {
                type: 'array',
                description: 'The full, ordered step list.',
                items: {
                    type: 'object',
                    properties: {
                        title: { type: 'string' },
                        status: { type: 'string', enum: ['pending', 'in_progress', 'done'] },
                    },
                    required: ['title', 'status'],
                },
            },
            requirements: {
                type: 'array',
                description: 'Progress on requirement ids (R1, R2, …).',
                items: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        status: { type: 'string', enum: ['open', 'done', 'blocked'] },
                        evidence: { type: 'string' },
                    },
                    required: ['id', 'status'],
                },
            },
            add_requirements: {
                type: 'array',
                items: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
            },
            note: { type: 'string', description: 'A short note to yourself: a decision, a finding, what to do next.' },
        },
    },
    parse: parsePlanArgs,
    async run(args, ctx) {
        const problems = applyPlanUpdate(ctx.state.plan, args);
        ctx.emit({ type: 'plan', plan: ctx.state.plan });
        const text = formatPlan(ctx.state.plan) || '(the plan is empty)';
        return {
            ok: problems.length === 0,
            output: problems.length ? `${problems.join('\n')}\n\n${text}` : text,
            facts: { plan: ctx.state.plan },
        };
    },
};
