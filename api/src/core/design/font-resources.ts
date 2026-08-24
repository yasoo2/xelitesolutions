import fs from 'fs';
import path from 'path';

export type FontResourcePruneResult = {
    css: string;
    removed: string[];
};

const isExternalResource = (value: string) => /^(?:data:|https?:|\/\/)/i.test(value);

function resourcePath(cssFilePath: string, projectRoot: string, rawUrl: string): string | null {
    const clean = String(rawUrl || '').split(/[?#]/, 1)[0];
    if (!clean || isExternalResource(clean)) return null;
    const resolved = path.resolve(path.dirname(cssFilePath), clean);
    const relative = path.relative(path.resolve(projectRoot), resolved);
    return relative === '' || (!relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))
        ? resolved
        : '';
}

/**
 * Keep generated font declarations honest.
 *
 * A generated stylesheet may be assembled before the resource-copy step has
 * found a usable asset root. A declaration for a file that is not under the
 * generated project then becomes a browser 404 and a false typography claim.
 * Local declarations/imports are therefore retained only when their concrete
 * file exists next to the CSS file; data and remote resources are outside this
 * local contract and are left untouched.
 */
export function pruneMissingFontResources(css: string, cssFilePath: string, projectRoot: string): FontResourcePruneResult {
    const removed: string[] = [];
    let output = String(css || '');

    output = output.replace(/@font-face\s*\{[^}]*\}/giu, (face) => {
        const urls = [...face.matchAll(/url\(\s*(?:"([^"]+)"|'([^']+)'|([^)'\s]+))\s*\)/giu)]
            .map((match) => match[1] || match[2] || match[3] || '')
            .filter(Boolean);
        const missing = urls.find((raw) => {
            const resolved = resourcePath(cssFilePath, projectRoot, raw);
            return resolved !== null && (!resolved || !fs.existsSync(resolved));
        });
        if (!missing) return face;
        removed.push(missing);
        return '';
    });

    output = output.replace(/@import\s+(?:url\(\s*)?(?:"([^"]+)"|'([^']+)'|([^)'\s]+))\s*\)?[^;]*;/giu, (statement, doubleQuoted, singleQuoted, bare) => {
        const raw = doubleQuoted || singleQuoted || bare || '';
        const resolved = resourcePath(cssFilePath, projectRoot, raw);
        if (resolved === null || (resolved && fs.existsSync(resolved))) return statement;
        removed.push(raw);
        return '';
    });

    return { css: output, removed };
}
