import path from 'path';

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
