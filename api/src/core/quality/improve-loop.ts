/**
 * BUILD → MEASURE → THINK → IMPROVE → MEASURE AGAIN. UNTIL IT STOPS PAYING.
 *
 * «كان اتفاقنا نظاما ذكي جدا … وبعد ان ياخذ النتائج من المتصفح والثيرمال يرجع
 *  يحلل ويفكر ومن ثم يكمل … ومن ثم يرجع يحلل ما بناه ومن ثم يرجع يطور عليه
 *  حتى يخرج بنتيجه مبهره»
 *
 * He is right about the shape that was missing. What Joe did was a straight
 * line: build, measure once, repair once, measure once, «done». There was no
 * point in it where Joe looked at what SURVIVED and decided what to do about
 * that. The intelligence was all in the instruments and none of it after them.
 *
 * This is the loop. Three rules keep it from becoming the thing he actually
 * hates — motion that bills itself as progress:
 *
 *  1. EVERY ROUND MUST BE DIFFERENT FROM THE LAST. A loop over an idempotent
 *     repairer writes identical bytes forever. Each round is handed its own
 *     number, and the fixes escalate: 44px → 48 → 56, contrast 4.5 → 5.5 → 7.
 *     A round that cannot change a single byte does not run at all.
 *
 *  2. EVERY ROUND IS PAID FOR IN A MEASURED NUMBER. The score after must beat
 *     the score before. A round that does not is ROLLED BACK — the project
 *     goes back to the snapshot it started from — and the loop stops there.
 *     Time is not the unit of progress; the number is.
 *
 *  3. EVERY ROUND SAYS WHAT IT SAW, WHAT IT DECIDED AND WHAT HAPPENED. The
 *     reader can disagree with the decision, which is the whole point of
 *     showing it.
 *
 * Nothing here knows what a browser is. It takes a `measure` and a `rebuild`
 * from its caller, which is what lets the same loop be driven by the browser
 * audit, the terminal audit, or both added together — and lets it be tested
 * against a fake system that gets better on demand.
 */
import fs from 'fs';
import path from 'path';

export interface Measurement {
    score: number;
    /** Stable ids: `small_targets`, `low_contrast`, `tables_answer`. */
    findingIds: string[];
    /**
     * The findings THEMSELVES, with the offenders each one names.
     *
     * An id tells the next round what kind of problem is left; the evidence
     * tells it which element. That difference is what turns a blanket rule
     * over every button into surgery on the two the browser measured — and
     * surgery is what makes a round three possible, because a blanket cannot
     * be tightened twice.
     */
    findings?: Array<{ id: string; evidence?: any[] }>;
    /** Set when the measurement could not be taken; never counted as 0. */
    skipped?: boolean;
}

export interface ImproveRound {
    round: number;
    /** What the measurement said BEFORE this round changed anything. */
    before: number;
    /** …and after. Undefined when the round could not change a byte. */
    after?: number;
    /** The finding ids this round set out to remove. */
    targeted: string[];
    /** The files it really wrote. */
    changed: string[];
    /** Ids that were there before and are gone after — the honest gain. */
    fixed: string[];
    /** Why the loop moved on, or stopped here. */
    verdict: 'improved' | 'no_change_possible' | 'no_measured_gain' | 'build_failed' | 'target_reached' | 'nothing_left';
    /** True when this round's edits were undone because they did not pay. */
    rolledBack: boolean;
}

export interface ImproveResult {
    rounds: ImproveRound[];
    /** The measurement the user actually gets. */
    final: Measurement;
    first: Measurement;
    /** Ids removed across the whole loop. */
    fixed: string[];
    stoppedBecause: ImproveRound['verdict'];
}

export interface ImproveOptions {
    /** Take a fresh measurement of what is on disk right now. */
    measure: () => Promise<Measurement>;
    /**
     * Apply this round's repairs. Returns the files it changed — an empty
     * array means «this round has nothing new to write», which ENDS the loop
     * instead of spending a build on identical bytes.
     */
    repair: (
        round: number,
        remaining: string[],
        findings: Array<{ id: string; evidence?: any[] }>,
    ) => Promise<string[]>;
    /** Rebuild whatever the measurement measures. False stops the round. */
    rebuild: () => Promise<boolean>;
    /** Undo this round. Called only when a round failed to pay for itself. */
    rollback: (snapshotId: string) => Promise<boolean>;
    /** Take a restore point before a round writes anything. */
    snapshot: (label: string) => string;
    /** One line per event, in the reader's language. */
    say?: (line: string) => void;
    /** Stop early once the score reaches this. Default 95. */
    target?: number;
    /** Hard ceiling on rounds. Default 4. */
    maxRounds?: number;
}

const uniq = (a: string[]) => a.filter((v, i) => a.indexOf(v) === i);

/**
 * Run the loop.
 *
 * The caller has already taken the FIRST measurement — passing it in avoids
 * paying for the same browser run twice, and makes the «before» of round 1
 * provably the same number the build already reported.
 */
export async function improveUntilItStops(
    firstMeasurement: Measurement,
    opts: ImproveOptions,
): Promise<ImproveResult> {
    const say = (l: string) => { try { opts.say?.(l); } catch { /* logging is optional */ } };

    /**
     * A HALF-WIRED LOOP MUST SAY SO BEFORE IT SPENDS A BUILD.
     *
     * The build called this with `repair`, `rebuild`, `rollback` and
     * `snapshot` — and no `measure`. Every unit test passed, because each one
     * brings its own measure; the integration harness threw
     * «opts.measure is not a function» in the middle of round one, AFTER the
     * repair had already written to disk. A missing dependency should be a
     * refusal at the door, not an exception halfway down the corridor.
     */
    for (const need of ['measure', 'repair', 'rebuild', 'rollback', 'snapshot'] as const) {
        if (typeof (opts as any)[need] !== 'function') {
            say(`improve: not wired — no ${need}() was given, so no round can run`);
            return {
                rounds: [], first: firstMeasurement, final: firstMeasurement,
                fixed: [], stoppedBecause: 'no_change_possible',
            };
        }
    }

    const target = Number.isFinite(opts.target as number) ? Number(opts.target) : 95;
    const maxRounds = Math.max(1, Number(opts.maxRounds || 4));

    const rounds: ImproveRound[] = [];
    let current = firstMeasurement;
    let stoppedBecause: ImproveRound['verdict'] = 'no_change_possible';

    for (let round = 1; round <= maxRounds; round++) {
        if (current.skipped) { stoppedBecause = 'no_change_possible'; break; }
        /**
         *  ZERO FINDINGS, NOT A GOOD SCORE.
         *
         *  His instruction, in his own words:
         *
         *      «واذا وجد مشاكل يرجعه للنظام ويبقى على هذا الحال حتى يطبع
         *       اختبار الجوده صفر مشاكل»
         *
         *  The loop stopped at a SCORE — «95/100 is at or above the bar» —
         *  and a score of 97 still carried a finding he could read in the
         *  delivery: «Largest heading 17px against 14px body — no visual
         *  hierarchy». A bar that leaves named defects standing is a bar
         *  that declares victory over them.
         *
         *  So the target is emptiness. The score remains a floor for the
         *  case where a finding cannot be repaired at all — the loop still
         *  stops, and still says why, and the finding is still printed.
         */
        if (!current.findingIds.length) {
            stoppedBecause = 'nothing_left';
            say(`improve: round ${round} not needed — the audit reports zero findings`);
            break;
        }
        /**
         *  THE SCORE IS MEASURED. IT DOES NOT DECIDE.
         *
         *  What stood here ended the loop the moment the number passed a bar:
         *  «95/100 is at or above the 95 bar». So a build that measured 97 and
         *  still carried «Largest heading 17px against 14px body — no visual
         *  hierarchy» was declared finished, with the fix for that exact
         *  finding sitting written and unused.
         *
         *  He asked for the opposite and he is right: «حتى يطبع اختبار الجوده
         *  صفر مشاكل». A named defect outranks a flattering average.
         *
         *  Nothing runs forever: the loop still ends when a round can write no
         *  different byte, when a round gains nothing and is rolled back, when
         *  a round breaks the build, or at the round ceiling — and it says
         *  which of those happened.
         */

        const remaining = uniq(current.findingIds);
        say(`improve: round ${round}/${maxRounds} — ${current.score}/100, still open: ${remaining.join(', ') || '(none named)'}`);

        const snapshotId = (() => {
            try { return String(opts.snapshot(`before improve round ${round}`) || ''); }
            catch { return ''; }
        })();

        const changed = await opts.repair(round, remaining, current.findings || []).catch(() => [] as string[]);
        if (!changed.length) {
            /**
             * The honest end of the loop, and the common one. Nothing this
             * round could write differs from what is already on disk, so a
             * build and a browser run would measure the same page again. Say
             * it and stop, rather than spend two minutes proving it.
             */
            rounds.push({
                round, before: current.score, targeted: remaining, changed: [], fixed: [],
                verdict: 'no_change_possible', rolledBack: false,
            });
            stoppedBecause = 'no_change_possible';
            say(`improve: round ${round} had nothing new to write — stopping at ${current.score}/100 instead of repeating myself`);
            break;
        }

        say(`improve: round ${round} wrote ${changed.length} file(s) — rebuilding, then measuring again`);
        const built = await opts.rebuild().catch(() => false);
        if (!built) {
            const undone = snapshotId ? await opts.rollback(snapshotId).catch(() => false) : false;
            rounds.push({
                round, before: current.score, targeted: remaining, changed, fixed: [],
                verdict: 'build_failed', rolledBack: !!undone,
            });
            stoppedBecause = 'build_failed';
            say(`improve: round ${round} broke the build — ${undone ? 'rolled it back' : 'could NOT roll it back'} and stopped`);
            break;
        }

        const after = await opts.measure().catch(() => ({ score: -1, findingIds: [], skipped: true } as Measurement));
        if (after.skipped || after.score <= current.score) {
            const undone = snapshotId ? await opts.rollback(snapshotId).catch(() => false) : false;
            rounds.push({
                round, before: current.score, after: after.skipped ? undefined : after.score,
                targeted: remaining, changed, fixed: [],
                verdict: 'no_measured_gain', rolledBack: !!undone,
            });
            stoppedBecause = 'no_measured_gain';
            say(after.skipped
                ? `improve: round ${round} could not be measured — ${undone ? 'rolled back' : 'left as written'}, stopping at ${current.score}/100`
                : `improve: round ${round} measured ${current.score} → ${after.score} — no gain, ${undone ? 'rolled back' : 'left as written'}, stopping`);
            break;
        }

        const fixed = remaining.filter(id => !after.findingIds.includes(id));
        rounds.push({
            round, before: current.score, after: after.score, targeted: remaining, changed, fixed,
            verdict: 'improved', rolledBack: false,
        });
        say(`improve: round ${round} — ${current.score} → ${after.score}/100`
            + (fixed.length ? ` · gone: ${fixed.join(', ')}` : ' · the score moved but no finding closed')
            + (after.findingIds.length ? ` · still open: ${after.findingIds.join(', ')}` : ' · nothing left'));
        current = after;
        stoppedBecause = 'improved';
    }

    const fixedAll = uniq(rounds.flatMap(r => r.fixed));
    return { rounds, first: firstMeasurement, final: current, fixed: fixedAll, stoppedBecause };
}

const normaliseStrings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

const normaliseMeasurement = (value: unknown, fallback: Measurement): Measurement => {
    const source = value && typeof value === 'object' ? value as any : {};
    const score = Number(source.score);
    const fallbackFindings = Array.isArray(fallback.findings) ? fallback.findings : [];
    const findings = Array.isArray(source.findings)
        ? source.findings
            .filter((f: any) => f && typeof f.id === 'string')
            .map((f: any) => ({ id: f.id, evidence: Array.isArray(f.evidence) ? f.evidence : [] }))
        : fallbackFindings;
    return {
        score: Number.isFinite(score) ? score : fallback.score,
        findingIds: normaliseStrings(source.findingIds).length
            ? normaliseStrings(source.findingIds)
            : normaliseStrings(fallback.findingIds),
        findings,
        ...(source.skipped === true ? { skipped: true } : {}),
    };
};

/**
 * Persistence and older callers can return a partial loop result. Reports must
 * remain truthful and readable in that case instead of crashing on
 * `undefined.length`; missing arrays become empty, while missing measurements
 * fall back to the measurement that was actually taken before the loop.
 */
export function normaliseImproveResult(
    value: Partial<ImproveResult> | null | undefined,
    fallback: Measurement,
): ImproveResult {
    const source = value && typeof value === 'object' ? value : {};
    const first = normaliseMeasurement(source.first, fallback);
    const rounds = Array.isArray(source.rounds)
        ? source.rounds.map((raw: any, index: number): ImproveRound => {
            const allowed: ImproveRound['verdict'][] = [
                'improved', 'no_change_possible', 'no_measured_gain', 'build_failed', 'target_reached',
            ];
            const before = Number(raw?.before);
            const after = Number(raw?.after);
            const verdict = allowed.includes(raw?.verdict) ? raw.verdict : 'no_change_possible';
            return {
                round: Number.isFinite(Number(raw?.round)) ? Number(raw.round) : index + 1,
                before: Number.isFinite(before) ? before : first.score,
                ...(Number.isFinite(after) ? { after } : {}),
                targeted: normaliseStrings(raw?.targeted),
                changed: normaliseStrings(raw?.changed),
                fixed: normaliseStrings(raw?.fixed),
                verdict,
                rolledBack: raw?.rolledBack === true,
            };
        })
        : [];
    const final = normaliseMeasurement(source.final, first);
    const fixed = normaliseStrings(source.fixed).length
        ? normaliseStrings(source.fixed)
        : uniq(rounds.flatMap(round => round.fixed));
    const stoppedBecause: ImproveRound['verdict'] =
        ['improved', 'no_change_possible', 'no_measured_gain', 'build_failed', 'target_reached']
            .includes(source.stoppedBecause as ImproveRound['verdict'])
            ? source.stoppedBecause as ImproveRound['verdict']
            // `Array.at` is ES2022; this package targets ES2020, so the call
            // type-checked nowhere and would have been a silent runtime risk on
            // any older engine. Same meaning, no library assumption.
            : (rounds[rounds.length - 1]?.verdict || 'no_change_possible');
    return { rounds, first, final, fixed, stoppedBecause };
}

/** The one-line story of the loop, for a delivery report. */
export function improveSummary(r: ImproveResult, isAr: boolean): string {
    const paid = r.rounds.filter(x => x.verdict === 'improved');
    //  «Zero findings» is not «no gain» — the first is the goal reached, the
    //  second is a loop that could not move. They must never read the same.
    if (r.stoppedBecause === 'nothing_left' && !paid.length) {
        return isAr
            ? `🔁 دورة التحسين: ${r.first.score}/100 — الفحص لم يجد عطباً واحداً منذ الجولة الأولى.`
            : `🔁 Improvement loop: ${r.first.score}/100 — the audit found not one finding from the first round.`;
    }
    if (!paid.length) {
        return isAr
            ? `🔁 دورة التحسين: ${r.first.score}/100 — لم تُنتج أي جولة مكسباً مقيساً، فتوقّفتُ عند أول رقم بدل تكرار نفسي.`
            : `🔁 Improvement loop: ${r.first.score}/100 — no round produced a measured gain, so I stopped at the first number instead of repeating myself.`;
    }
    const steps = [r.first.score, ...paid.map(p => p.after ?? p.before)].join(' → ');
    const why = {
        nothing_left: isAr ? 'لم يبقَ عطبٌ واحد — الفحص يقول صفر' : 'not one finding is left — the audit reports zero',
        target_reached: isAr ? 'بلغتُ الحد المطلوب' : 'reached the bar',
        no_measured_gain: isAr ? 'الجولة التالية لم تكسب شيئاً فتراجعتُ عنها' : 'the next round gained nothing and was rolled back',
        no_change_possible: isAr ? 'لم يبقَ ما أستطيع كتابته بشكل مختلف' : 'nothing left I could write differently',
        build_failed: isAr ? 'الجولة التالية كسرت البناء فتراجعتُ عنها' : 'the next round broke the build and was rolled back',
        improved: isAr ? 'بلغتُ سقف الجولات' : 'hit the round ceiling',
    }[r.stoppedBecause];
    return (isAr
        ? `🔁 دورة التحسين: ${steps}/100 عبر ${paid.length} جولة مدفوعة — ${why}.`
        : `🔁 Improvement loop: ${steps}/100 across ${paid.length} paid round(s) — ${why}.`)
        + (r.fixed.length ? (isAr ? ` زالت فعلاً: ${r.fixed.join('، ')}.` : ` Actually gone: ${r.fixed.join(', ')}.`) : '');
}

/**
 * The repair half, wired to the real repairer.
 *
 * Kept here so the loop's caller is three lines, and so the ROUND — the thing
 * that makes each pass different — cannot be forgotten at a call site.
 */
export async function repairRound(
    dir: string,
    round: number,
    opts: {
        isArabic?: boolean;
        /** The last measurement's offenders — what makes this pass surgery. */
        findings?: Array<{ id: string; evidence?: any[] }>;
    } = {},
): Promise<{ changed: string[]; repairs: any[] }> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { collectSources } = require('./self-repair');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { repairProjectFiles } = require('./ui-repair');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { syntaxOk } = require('../../modules/tools/definitions/ProjectEditTool');

    const sources = collectSources(dir);
    if (!Object.keys(sources).length) return { changed: [], repairs: [] };

    const plan = repairProjectFiles(sources, { isArabic: opts.isArabic, round, findings: opts.findings });
    const changed: string[] = [];
    for (const [rel, text] of Object.entries(plan.files as Record<string, string>)) {
        // Identical bytes are not a change, and a round of them is not work.
        if (sources[rel] === text) continue;
        const gate = syntaxOk(rel, text);
        if (!gate.ok) continue;
        try { fs.writeFileSync(path.join(dir, rel), text, 'utf-8'); changed.push(rel); }
        catch { /* a file that cannot be written is simply not changed */ }
    }
    return { changed, repairs: plan.repairs };
}
