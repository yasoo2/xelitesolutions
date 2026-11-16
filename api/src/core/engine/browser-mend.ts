/**
 * WHAT JOE CAN MEND HIMSELF, HE MENDS BEFORE HE REFUSES.
 *
 * The ladder exam, 2026-11-09: of 150 prompts, 69 had their delivery refused
 * by the browser check (123 refusals), and every refusal sent the work back to
 * the model and then ran every check again — 73 s a check, 357 minutes in all.
 * The reasons were mostly ones Joe has a written, deterministic fix for
 * (core/quality/ui-repair.ts): buttons under 40 px (38 prompts), a heading
 * hierarchy too flat (17), a form with no validation (11). The fixer existed;
 * the engine never called it.
 *
 * Two rules here:
 *
 *   1. A finding Joe's repairer answers is repaired by Joe: the source (never
 *      the built output) is mended, every file through the syntax gate, the
 *      project rebuilt when it has a build, and the page measured once more.
 *      Kept only when the page is not worse; put back otherwise. Never in the
 *      user's own repository: a change there is only what he asked for.
 *   2. A finding of taste the auditors themselves call minor (a heading scale,
 *      a spacing or colour drift, one <h1> too many, a heavy picture, a form
 *      with no validation the request never asked for) does not refuse a
 *      delivery: it is told with it. What is about proof — controls the walk
 *      did not reach, data not checked live — still refuses, low or not, and
 *      so does an Arabic field that types from the left: Arabic is his.
 */
import fs from 'fs';
import path from 'path';

export interface MendFinding { id: string; severity?: string; evidence?: unknown; detail?: string; detailEn?: string }

/** The minor findings of taste: told with the delivery, never a refusal on their own. */
export const TOLD_NOT_REFUSED: ReadonlySet<string> = new Set([
    'flat_hierarchy', 'type_scale_drift', 'spacing_drift', 'colour_drift', 'line_too_long',
    'h1_count', 'heavy_images', 'form_no_validation', 'field_case_minor', 'route_headings', 'control_job_unseen', 'journey_not_proven', 'order_not_kept', 'controls_not_reached',
]);

/**
 * The inspector's findings (ui-inspection.ts): told with the delivery, never a refusal — design v3
 * (D:\Joe\eval\egm\designs\2026-11-15-ui-inspection-revival-v3.md). Refusing on visual judgement kept
 * meeting pages it got wrong; a told line costs a visitor nothing when it is silent. `no_viewport_meta`
 * is not here: it is a DOM fact, the mender answers it, and it refuses as before. An id leaves this set
 * only by the promotion rule of v3 §7 (30 live deliveries told true, 0 false, and a design of its own).
 */
export const INSPECTOR_TOLD: ReadonlySet<string> = new Set([
    'low_contrast', 'mobile_overflow', 'content_unreachable', 'text_clipped', 'mobile_tap_targets',
    'mobile_small_text', 'mobile_header_fragmented', 'generic_image_composition', 'viewport_emulation_failed',
    'a11y_no_main', 'a11y_duplicate_ids', 'a11y_positive_tabindex', 'a11y_aria_hidden_focusable',
    'a11y_heading_skip', 'a11y_images_without_alt', 'a11y_inputs_without_labels', 'a11y_placeholder_as_label',
]);

/** Whether a finding refuses the delivery: everything except the inspector's told lines and a minor finding of taste. */
export function refuses(f: MendFinding): boolean {
    if (INSPECTOR_TOLD.has(String(f.id || ''))) return false;
    return !(String(f.severity || '') === 'low' && TOLD_NOT_REFUSED.has(String(f.id || '')));
}

/** What one finding costs the score — app-audit.ts scoreOf, the same numbers. */
const SCORE_COST: Record<string, number> = { high: 15, medium: 8, low: 3 };

/**
 * THE SCORE A REPAIR ROUND IS JUDGED BY: WHAT REFUSES, NOTHING TOLD.
 *
 * Review r40-2 (A2), 2026-11-15: the improve loops kept or rolled back a round
 * on the audit's own score, and that score pays for every told line too — so a
 * contrast line sampled differently on the second walk could roll back a real
 * fix of the buttons. The told lines cost nothing here: the score is the one
 * the refusing findings alone earn, and the audit's own when nothing is told.
 */
export function refusingScore(audit: { score?: number; findings?: MendFinding[] } | null | undefined): number {
    const all = (audit?.findings || []) as MendFinding[];
    const score = Number(audit?.score || 0);
    const told = all.filter(f => !refuses(f));
    if (!told.length) return score;
    const kept = all.filter(refuses);
    const priced = all.every(f => String(f.severity || '') in SCORE_COST);
    let s = priced
        ? Math.max(0, kept.reduce((n, f) => n - SCORE_COST[String(f.severity)], 100))
        : Math.min(100, score + told.reduce((n, f) => n + (SCORE_COST[String(f.severity || '')] || 0), 0));
    if (kept.some(f => f.id === 'qa_budget_exhausted')) s = Math.min(s, 49);
    return s;
}

/**
 * WHAT AN IMPROVE LOOP IS HANDED: THE FINDINGS THAT REFUSE, THEIR IDS, AND THEIR SCORE.
 *
 * Review r40-2 (A2): `findings` was filtered and `findingIds` was not, and the
 * loop stops only when `findingIds` is empty. So a round whose refusing finding
 * was fixed ran once more on a told `low_contrast` with no findings at all —
 * and ui-repair, handed no findings, applies its untargeted blanket to the
 * user's stylesheets. A told line never opens a round, never feeds one, and is
 * never what a round is kept or rolled back for (design v3 §2.3).
 */
export function refusingMeasurement(audit: { score?: number; findings?: MendFinding[]; uiInspection?: string } | null | undefined): {
    score: number; findingIds: string[]; findings: Array<{ id: string; evidence?: any }>; told: string[]; inspection?: string;
} {
    const all = (audit?.findings || []) as MendFinding[];
    const kept = all.filter(refuses);
    //  Review 3 of r40 (11): the told ids and the walk's inspection status travel with every reading,
    //  so the improve loop puts back a round that brought an inspector's told kind (toldKindsBrought).
    const status = typeof audit?.uiInspection === 'string' ? audit.uiInspection : (all as any)[INSPECTION_STATUS];
    return {
        score: refusingScore(audit),
        findingIds: kept.map(f => String(f.id)),
        findings: kept.map(f => ({ id: String(f.id), evidence: f.evidence })),
        told: all.filter(f => !refuses(f)).map(f => String(f?.id || '')).filter(Boolean),
        ...(typeof status === 'string' ? { inspection: status } : {}),
    };
}

/**
 * Where app-audit.ts writes the walk's inspection status on the findings list it returns
 * (`complete`, `partial: …`, `failed: …`): verify.ts hands mendIsBetter the bare lists, and the
 * status has to travel with them. Not enumerable: never printed, never serialised.
 */
export const INSPECTION_STATUS = Symbol.for('joe.uiInspection');

/** Marks a walk's findings list with the status of the inspection that measured it. */
export function markInspection<T extends unknown[]>(findings: T, status: string): T {
    try {
        Object.defineProperty(findings, INSPECTION_STATUS, { value: String(status || ''), enumerable: false, configurable: true, writable: true });
    } catch { /* a frozen list stays unmarked: not a complete inspection */ }
    return findings;
}

/** A walk as mendIsBetter reads it: the audit, or its findings list (marked by app-audit.ts). */
export type MendMeasured = MendFinding[] | { findings?: MendFinding[]; uiInspection?: string } | null | undefined;

function measuredWalk(m: MendMeasured): { findings: MendFinding[]; inspected: boolean } {
    const findings = (Array.isArray(m) ? m : (m?.findings || [])) as MendFinding[];
    const own = !Array.isArray(m) && m && typeof m.uiInspection === 'string' ? m.uiInspection : undefined;
    const status = own ?? (findings as any)[INSPECTION_STATUS];
    return { findings, inspected: status === 'complete' };
}

/** What this file's mender answers beyond ui-repair's own list: repairHtmlShell writes the viewport meta (ui-repair.ts is not edited for it). */
const MENDS_HERE: ReadonlySet<string> = new Set(['no_viewport_meta']);

export interface Mend {
    /** What was repaired, in the reader's language. */
    repairs: string[];
    changed: string[];
    /** Puts every changed file back as it was, and rebuilds. */
    undo(): Promise<void>;
}

export type Mender = (root: string, findings: MendFinding[], isAr: boolean, say: (line: string) => void, pageDir?: string) => Promise<Mend | null>;

function hasBuildScript(root: string): boolean {
    try { return !!JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))?.scripts?.build; } catch { return false; }
}

/**
 * THE FILES JOE'S REPAIRER MAY TOUCH: THE SOURCES, AND THE PAGE THE BROWSER OPENED.
 *
 * The ladder, 2026-11-09 (L155): «25 tap targets under 40px» — an answer the
 * repairer has — and nothing was repaired: the source walk leaves every folder
 * named public out (a bundler's static assets), and a Node server's page lives
 * exactly there, public/index.html and public/style.css. The model fixed it by
 * hand and the delivery was measured a third time, seven more minutes. The page
 * the browser opened is collected too, under its own folder; never a build's
 * output (dist, build, out) when the project builds it, never node_modules.
 */
export function mendSources(root: string, pageDir?: string): Record<string, string> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { collectSources } = require('../quality/self-repair');
    const out: Record<string, string> = { ...collectSources(root) };
    if (!pageDir) return out;
    const rel = path.relative(path.resolve(root), path.resolve(pageDir));
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return out;
    const relPosix = rel.split(path.sep).join('/');
    if (Object.keys(out).some(k => k.startsWith(`${relPosix}/`))) return out;
    if (/(^|\/)node_modules(\/|$)/i.test(relPosix)) return out;
    if (/(^|\/)(dist|build|out|\.next)(\/|$)/i.test(relPosix) && hasBuildScript(root)) return out;
    for (const [k, v] of Object.entries(collectSources(pageDir) as Record<string, string>)) out[`${relPosix}/${k}`] = v;
    return out;
}

/** How many instances a finding names: «21 tap target(s)…» is 21, else its evidence, else one. */
export function findingWeight(f: MendFinding & { detail?: string; detailEn?: string }): number {
    const n = Number((/^(\d+)\s/.exec(String(f.detailEn || f.detail || '')) || [])[1]);
    if (Number.isFinite(n) && n > 0) return n;
    return Array.isArray(f.evidence) && f.evidence.length ? f.evidence.length : 1;
}

/**
 * WHETHER JOE'S OWN REPAIR LEFT THE PAGE BETTER.
 *
 * The hard sample, 2026-11-09 (L272, an events company's three-role system):
 * «21 tap targets under 40px» and «unresponsive controls» — the repair could
 * answer the first, and every file was put back: two kinds of finding before,
 * two after, and the old rule counted kinds only. A repair that leaves fewer
 * instances of the same kinds, and adds no kind of its own, made the page
 * better and is kept; one that adds a kind is put back, whatever it fixed.
 *
 * Design v3 (2026-11-15): the inspector's lines are told, never refusals — but
 * a kind of them that Joe's OWN repair brought (a table that now spills off the
 * phone, words that now fail contrast) is still a page made worse, so that
 * repair is put back. A told line never refuses a delivery; it can veto a mend
 * only when BOTH walks' inspections were complete (review r40-2, A5): a first
 * inspection cut at its deadline before 390 px, or one that failed, has no
 * phone or contrast lines at all, so a complete second walk «brought» a line
 * that was there all along — and the mend of a refusing finding was put back
 * for it. Pass the audits (or the lists app-audit.ts marks), not copies.
 */
function inspectorKindsBrought(beforeWalk: MendMeasured, afterWalk: MendMeasured): string[] {
    const b = measuredWalk(beforeWalk), a = measuredWalk(afterWalk);
    if (!b.inspected || !a.inspected) return [];
    const had = new Set(b.findings.map(f => String(f.id || '')));
    return [...new Set(a.findings.map(f => String(f.id || '')).filter(id => INSPECTOR_TOLD.has(id) && !had.has(id)))];
}

export function mendIsBetter(beforeWalk: MendMeasured, afterWalk: MendMeasured): boolean {
    const before = measuredWalk(beforeWalk).findings, after = measuredWalk(afterWalk).findings;
    const was = before.filter(refuses), now = after.filter(refuses);
    const wasIds = new Set(was.map(f => String(f.id || '')));
    if (now.some(f => !wasIds.has(String(f.id || '')))) return false;
    if (inspectorKindsBrought(beforeWalk, afterWalk).length) return false;
    if (now.length < was.length) return true;
    const weight = (fs: MendFinding[]) => fs.reduce((n, f) => n + findingWeight(f as any), 0);
    if (now.length === was.length && weight(now) < weight(was)) return true;
    //  a tie on what refuses is broken by the minor taste it cleared — never by the inspector's sampled lines
    const notInspector = (fs: MendFinding[]) => fs.filter(f => !INSPECTOR_TOLD.has(String(f.id || ''))).length;
    return now.length === was.length && notInspector(after) < notInspector(before);
}

/** Why a repair was put back, in words the builder can act on (mendIsBetter's reasons). */
export function whyMendNotBetter(beforeWalk: MendMeasured, afterWalk: MendMeasured): string {
    const before = measuredWalk(beforeWalk).findings, after = measuredWalk(afterWalk).findings;
    const was = before.filter(refuses), now = after.filter(refuses);
    const wasIds = new Set(was.map(f => String(f.id || '')));
    const brought = [...new Set([...now.map(f => String(f.id || '')).filter(id => !wasIds.has(id)), ...inspectorKindsBrought(beforeWalk, afterWalk)])];
    if (brought.length) return `the page measured after it showed what it did not before: ${brought.join(', ')}`;
    const weight = (fs: MendFinding[]) => fs.reduce((n, f) => n + findingWeight(f as any), 0);
    return `the same ${now.length} blocking finding(s) stayed, ${weight(now)} instance(s) against ${weight(was)} before`;
}

/** Whether Joe's repairer answers any of these findings. */
export function mendable(findings: MendFinding[]): boolean {
    let can: ReadonlySet<string> = new Set();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    try { can = require('../quality/ui-repair').REPAIRS_THIS_FILE_CAN_MAKE || new Set(); } catch { /* no repairer */ }
    return findings.some(f => can.has(String(f.id || '')) || MENDS_HERE.has(String(f.id || '')));
}

async function rebuild(root: string, say: (line: string) => void): Promise<boolean> {
    if (!hasBuildScript(root)) return true;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { runDoctored } = require('../quality/log-doctor');
    const r = await runDoctored('npm', ['run', 'build'], { cwd: root, timeoutMs: 240_000, onNote: say });
    return r?.ok === true;
}

/**
 * Joe's own repair of the findings the browser named: the offenders by name when
 * the finding carries them. Null when there is nothing it answers, nothing it
 * changed, or the rebuild failed (then every file is already back).
 */
export const mendPage: Mender = async (root, findings, isAr, say, pageDir) => {
    if (!mendable(findings)) return null;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { repairProjectFiles, repairText } = require('../quality/ui-repair');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { syntaxOk } = require('../../modules/tools/definitions/ProjectEditTool');
    const before: Record<string, string> = mendSources(root, pageDir);
    if (!Object.keys(before).length) return null;
    const plan = repairProjectFiles(before, {
        isArabic: isAr,
        findings: findings.map(f => ({ id: f.id, ...(Array.isArray(f.evidence) ? { evidence: f.evidence } : {}) })),
    });
    const changed: string[] = [];
    /** Each file's times before the repair: a file put back is the same file, to the walk's own record too (app-audit.ts codeFingerprint). */
    const times: Record<string, { atime: Date; mtime: Date }> = {};
    for (const [rel, text] of Object.entries(plan.files as Record<string, string>)) {
        if (text === before[rel]) continue;
        const gate = syntaxOk(rel, text);
        if (!gate.ok) { say(`mend: ${rel} not written: ${gate.error}`); continue; }
        try {
            const s = fs.statSync(path.join(root, rel));
            times[rel] = { atime: s.atime, mtime: s.mtime };
        } catch { /* a new file has no times to keep */ }
        try { fs.writeFileSync(path.join(root, rel), text, 'utf8'); changed.push(rel); } catch (e: any) { say(`mend: ${rel} not written: ${e?.message || e}`); }
    }
    const putBack = async () => {
        for (const rel of changed) {
            try {
                fs.writeFileSync(path.join(root, rel), before[rel], 'utf8');
                if (times[rel]) fs.utimesSync(path.join(root, rel), times[rel].atime, times[rel].mtime);
            } catch { /* best effort */ }
        }
    };
    if (!changed.length) return null;
    if (!await rebuild(root, say)) {
        await putBack();
        await rebuild(root, say);
        say('mend: the project did not build after the repair, so every file was put back');
        return null;
    }
    return {
        repairs: (plan.repairs as Array<{ id: string; detail: string; detailEn?: string }>).map(r => repairText(r, isAr)).filter(Boolean),
        changed,
        undo: async () => { await putBack(); await rebuild(root, say); },
    };
};
