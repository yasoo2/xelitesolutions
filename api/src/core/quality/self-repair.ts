/**
 * REPAIR-AND-REBUILD — one cycle, one definition, two callers.
 *
 * Joe has been able to mend a project's source for a while, but only when the
 * user ASKED: «أصلح الواجهة» reached browser_ui_fix and everything happened.
 * A build that Joe itself had just measured at 62/100 was handed over at
 * 62/100 with the findings printed underneath, as if reading the report were
 * the user's job.
 *
 * The cycle is the same wherever it runs, so it lives here rather than in the
 * tool that happened to need it first:
 *
 *   1. repair the SOURCE (never the built output — the files are what ships)
 *   2. gate EVERY changed file through the syntax checker before writing
 *   3. rebuild for real
 *   4. if the build fails, put every file back exactly as it was
 *
 * Step 4 is the load-bearing one. A repair that breaks a build is worse than
 * the defect it fixed, so the only acceptable outcome of a failed rebuild is
 * that the user's project is byte-for-byte what it was before Joe touched it.
 */
import fs from 'fs';
import path from 'path';
import { repairProjectFiles, type Repair } from './ui-repair';

/** Every source file a UI repair could possibly touch, relative to the project. */
export function collectSources(dir: string): Record<string, string> {
    const out: Record<string, string> = {};
    // `.joe-versions` holds the snapshots that make «تراجع» possible. Repairing
    // the files INSIDE them would rewrite history — every restore would hand
    // back a past that had been quietly edited, which is worse than no history.
    const skip = new Set(['node_modules', 'dist', '.git', 'public', 'fonts', '.joe-versions']);
    const walk = (abs: string, rel: string, depth: number) => {
        if (depth > 6) return;
        let entries: fs.Dirent[] = [];
        try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            if (skip.has(e.name)) continue;
            const childAbs = path.join(abs, e.name);
            const childRel = rel ? `${rel}/${e.name}` : e.name;
            if (e.isDirectory()) { walk(childAbs, childRel, depth + 1); continue; }
            if (!/\.(html|jsx|tsx|css)$/i.test(e.name)) continue;
            try { out[childRel] = fs.readFileSync(childAbs, 'utf-8'); } catch { /* unreadable */ }
        }
    };
    walk(dir, '', 0);
    return out;
}

/**
 * Which findings this module can actually answer. A build is only rebuilt when
 * one of these is present — a rebuild costs the user half a minute, and
 * spending it on `console_errors` (which no deterministic edit can fix) would
 * be theatre.
 */
export const REPAIRABLE_FINDINGS = new Set([
    'dead_links', 'small_targets', 'mobile_tap_targets', 'tap_targets',
    'mobile_overflow', 'responsive', 'h1_count', 'keyboard_unreachable',
    'heavy_images', 'html_lang', 'missing_viewport', 'low_contrast', 'dead_images_alt',
]);

export function worthRepairing(findings: Array<{ id: string }>): boolean {
    return findings.some(f => REPAIRABLE_FINDINGS.has(f.id));
}

export interface RepairCycle {
    changed: string[];
    refused: string[];
    repairs: Repair[];
    built: boolean;
    reverted: boolean;
    /** Set when nothing was attempted, so a caller can say why. */
    skipped?: string;
    /**
     * The snapshot taken BEFORE the first byte was written.
     *
     * `reverted` only covers a repair that failed to BUILD. A repair that
     * builds perfectly and MEASURES WORSE is the other failure, and it has no
     * undo without this id — which is how a build that scored 78, was
     * repaired down to 73, and was reported as «keeping the original verdict
     * (78/100)» shipped the 73 files to the user.
     */
    snapshotId?: string;
}

export async function repairAndRebuild(
    dir: string,
    opts: { onLine?: (s: string) => void; isArabic?: boolean; timeoutMs?: number } = {},
): Promise<RepairCycle> {
    const say = (s: string) => { try { opts.onLine?.(s); } catch { /* logging is optional */ } };
    const empty: RepairCycle = { changed: [], refused: [], repairs: [], built: true, reverted: false };

    const sources = collectSources(dir);
    if (!Object.keys(sources).length) return { ...empty, skipped: 'no_sources' };

    const isArabic = opts.isArabic ?? /[؀-ۿ]/.test(Object.values(sources).join('\n').slice(0, 20_000));
    const plan = repairProjectFiles(sources, { isArabic } as any);
    if (!Object.keys(plan.files).length) return { ...empty, skipped: 'nothing_to_repair' };

    /**
     * BEFORE THE FIRST BYTE IS WRITTEN, THE PROJECT IS PUT ASIDE.
     *
     * The revert below undoes a repair that failed to BUILD. It cannot undo a
     * repair that built perfectly and that he simply did not want — and that is
     * the ordinary case: Joe changed his files, correctly, and he wants them
     * back. A snapshot costs a directory copy of the source and buys «تراجع».
     */
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { snapshotProject } = require('../project/versions');
    let snapshotId = '';
    try { snapshotId = String(snapshotProject(dir, 'قبل الإصلاح الذاتي')?.id || ''); }
    catch { /* never blocks the repair */ }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { syntaxOk } = require('../../modules/tools/definitions/ProjectEditTool');
    const changed: string[] = [];
    const refused: string[] = [];
    for (const [rel, text] of Object.entries(plan.files)) {
        const gate = syntaxOk(rel, text);
        if (!gate.ok) { refused.push(`${rel}: ${gate.error}`); continue; }
        try { fs.writeFileSync(path.join(dir, rel), text, 'utf-8'); changed.push(rel); }
        catch (e: any) { refused.push(`${rel}: ${e?.message || e}`); }
    }
    say(`self-repair: ${changed.length} file(s) repaired${refused.length ? `, ${refused.length} refused` : ''}`);
    for (const r of refused) say(`  ⚠️ ${r}`);
    if (!changed.length) return { ...empty, refused, skipped: 'all_refused' };

    /**
     * A MISSING node_modules IS NOT A REASON TO SKIP THE VERIFICATION.
     *
     * This used to return `built: true` without building anything whenever the
     * packages were absent — which means a repair that broke the project would
     * be written, reported as verified, and never caught. The integration sweep
     * found it: node_modules deleted, the cycle answered «built», and nothing
     * had run. The doctor exists precisely to install what is missing and then
     * build, so the only honest skip left is a project with no build script.
     */
    let hasBuildScript = false;
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'));
        hasBuildScript = !!pkg?.scripts?.build;
    } catch { /* no manifest — nothing to run */ }
    if (!hasBuildScript) {
        say('self-repair: no build script — the repaired source is on disk, unverified by a build');
        return { changed, refused, repairs: plan.repairs, built: true, reverted: false, skipped: 'no_build_script' };
    }

    // Through the doctor: if this rebuild fails for a reason that has nothing
    // to do with the repair — a package the project was always missing — it is
    // healed and retried rather than costing the user a correct repair.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { runDoctored } = require('./log-doctor');
    const r = await runDoctored('npm', ['run', 'build'], {
        cwd: dir, timeoutMs: opts.timeoutMs ?? 240_000,
        onLine: (l: string) => say(`  ${l.slice(0, 200)}`),
        onNote: say,
    });

    if (r.ok === true) return { changed, refused, repairs: plan.repairs, built: true, reverted: false, snapshotId };

    for (const rel of changed) {
        try { fs.writeFileSync(path.join(dir, rel), sources[rel], 'utf-8'); } catch { /* best effort */ }
    }
    say('self-repair: build FAILED after repair — every change reverted');
    return { changed: [], refused, repairs: [], built: false, reverted: true, snapshotId };
}
