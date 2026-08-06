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
    const skip = new Set(['node_modules', 'dist', '.git', 'public', 'fonts']);
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
    'dead_links', 'small_targets', 'h1_count', 'keyboard_unreachable',
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

    if (!fs.existsSync(path.join(dir, 'node_modules'))) {
        // Nothing to rebuild with; the source is still correct on disk.
        return { changed, refused, repairs: plan.repairs, built: true, reverted: false };
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { executionEngine } = require('../../kernel/ExecutionEngine');
    const r = await executionEngine.runArgvStreaming('npm', ['run', 'build'], {
        cwd: dir, timeout: opts.timeoutMs ?? 240_000, env: { NO_COLOR: '1' },
        onLine: (l: string) => say(`  ${l.slice(0, 200)}`),
    }).done;

    if (r.ok === true) return { changed, refused, repairs: plan.repairs, built: true, reverted: false };

    for (const rel of changed) {
        try { fs.writeFileSync(path.join(dir, rel), sources[rel], 'utf-8'); } catch { /* best effort */ }
    }
    say('self-repair: build FAILED after repair — every change reverted');
    return { changed: [], refused, repairs: [], built: false, reverted: true };
}
