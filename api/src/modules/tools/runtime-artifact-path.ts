import fs from 'fs';
import path from 'path';
import { isWithinRoot } from './path-containment';

function normaliseLabel(value: string): string {
    return value
        .replace(/\\/g, '/')
        .replace(/^\.\//u, '')
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLocaleLowerCase();
}

/**
 * Convert only a proven conceptual project prefix into a logical artifact path.
 * The accepted forms are `ProjectName/src/App.jsx` and exactly one parent marker
 * followed by that same conceptual name: `../ProjectName/src/App.jsx`.
 * Arbitrary parent traversal is intentionally left untouched so the owning tool
 * can reject it instead of silently moving it into a trusted root.
 */
export function normalizeConceptualArtifactPath(filePath: string, projectName?: string): string {
    const raw = String(filePath || '');
    const name = String(projectName || '').trim();
    if (!raw || !name || path.isAbsolute(raw)) return raw;

    const slashPath = raw.replace(/\\/g, '/').replace(/^\.\//u, '');
    const segments = slashPath.split('/').filter(Boolean);
    const projectIndex = segments[0] === '..' ? 1 : 0;
    const first = segments[projectIndex] || '';
    if (!first || normaliseLabel(first) !== normaliseLabel(name)) return raw;
    return segments.slice(projectIndex + 1).join(path.sep) || '.';
}

export function isSingleParentConceptualPath(filePath: string, projectName?: string): boolean {
    const raw = String(filePath || '').replace(/\\/g, '/').replace(/^\.\//u, '');
    return raw.split('/').filter(Boolean)[0] === '..'
        && normalizeConceptualArtifactPath(raw, projectName) !== raw;
}

const LEADING_CD = /^\s*cd(?:\s+\/d)?\s+(?:"([^"]+)"|'([^']+)'|([^\s"'&|;]+))\s*&&\s*/iu;

function isDirectory(dir: string): boolean {
    try { return fs.statSync(dir).isDirectory(); } catch { return false; }
}

/**
 * A planner-written shell command that starts by entering a directory
 * («cd dental-clinic-store && npm install react»), rebased onto the trusted
 * runtime root: the leading «cd» prefixes are removed and their target becomes
 * the cwd. Returns null when nothing can be proven, so the command runs
 * exactly as planned and containment decides.
 *
 * Eval round 15 (2026-10-24, P201): the planner wrote the install relative to
 * the workspace while the executor had already set cwd to the project itself,
 * so cmd looked for dental-clinic-store\dental-clinic-store and the build
 * stopped at 2/5 phases on «The system cannot find the path specified.» —
 * the same doubled root that file paths had (plannedTargetsWithinRoot).
 *
 * A target is taken literally when that directory exists; only otherwise is a
 * first segment equal to the project's own name read as its conceptual label
 * (normalizeConceptualArtifactPath). Every target must exist and stay inside
 * the root — «cd ../../etc» is never rebased.
 */
export function rebaseLeadingCd(command: string, baseCwd: string, projectName: string, runtimeRoot: string): { command: string; cwd: string } | null {
    const root = String(runtimeRoot || '').trim();
    if (!root) return null;
    let rest = String(command || '');
    let cwd = path.resolve(String(baseCwd || root));
    let moved = false;
    for (let m = rest.match(LEADING_CD); m; m = rest.match(LEADING_CD)) {
        const target = String(m[1] ?? m[2] ?? m[3] ?? '').trim();
        if (!target) break;
        let next = path.isAbsolute(target) ? path.resolve(target) : path.resolve(cwd, target);
        if (!isDirectory(next) && !path.isAbsolute(target) && path.resolve(cwd) === path.resolve(root)) {
            const logical = normalizeConceptualArtifactPath(target, projectName);
            if (logical !== target) next = path.resolve(root, logical);
        }
        if (!isWithinRoot(next, root) || !isDirectory(next)) break;
        cwd = next;
        rest = rest.slice(m[0].length);
        moved = true;
    }
    return moved && rest.trim() ? { command: rest, cwd } : null;
}
