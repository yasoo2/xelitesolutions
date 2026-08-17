import path from 'path';

export type ArtifactValidationResult = {
    content: string;
    error?: string;
};

/**
 * Model output is file content, not a chat transcript. A complete Markdown
 * fence is harmless wrapper noise and can be removed deterministically. A
 * JSON-only exception may salvage a missing closing wrapper when the body parses
 * completely; other partial fences or prose remain contract violations.
 */
export function normalizeArtifactContent(filePath: string, rawContent: unknown): ArtifactValidationResult {
    let content = String(rawContent ?? '').trim();
    if (!content) return { content: '', error: `artifact_validation_failed: ${filePath} has no content` };

    const fenced = content.match(/^```(?:[A-Za-z0-9_+.#-]+)?\s*\n([\s\S]*?)\n```\s*$/u);
    if (fenced) content = fenced[1].trim();

    // A provider can truncate only the closing fence while still returning a
    // complete JSON body. That wrapper defect is deterministic to repair: parse
    // the body first, and only then remove the opening fence. Never apply this
    // salvage to source code or to malformed JSON; those remain contract errors.
    if (!fenced && /^```(?:json)?\s*\n[\s\S]*$/iu.test(content) && path.extname(filePath).toLowerCase() === '.json') {
        const body = content.replace(/^```(?:json)?\s*\n/iu, '').trim();
        try {
            JSON.parse(body);
            content = body;
        } catch {
            // Keep the original content so validateArtifactContent reports the
            // incomplete fence and no unsafe guess reaches disk.
        }
    }

    return { content };
}

function isStructuredExtension(ext: string): boolean {
    return ['.json', '.yaml', '.yml', '.toml', '.ini', '.env'].includes(ext);
}

function isSourceExtension(ext: string): boolean {
    return ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.java', '.cs', '.rb', '.php', '.sh', '.sql'].includes(ext);
}

function looksLikePython(source: string): boolean {
    // Do not treat a valid ES/TypeScript import such as
    // `import * as express from 'express'` as Python. Only match syntax that
    // JavaScript/TypeScript cannot use in this destination: Python's `def`,
    // `from ... import ...`, a Python main guard, a Python shebang, or a bare
    // Python-style import with no `from` clause.
    return /(?:^|\n)\s*(?:from\s+[A-Za-z_][\w.]*\s+import\s+|def\s+[A-Za-z_]\w*\s*\([^)]*\)\s*:|if\s+__name__\s*==\s*["']__main__["']|#!\s*\/usr\/bin\/env\s+python(?:3)?\b|import\s+(?:flask|django|numpy|pandas|requests|torch|tensorflow|sklearn|scipy|pytest)(?:\s|$))/iu.test(source);
}

function looksLikeNode(source: string): boolean {
    return /(?:\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=|\brequire\s*\(|\bmodule\.exports\b|\bimport\s+[\s\S]*?\s+from\s+["'])/u.test(source);
}

/**
 * Validate only high-confidence, destination-level contracts. This is not a
 * formatter and never invents a replacement artifact. It protects the later
 * build/run/QA gates from content that could not possibly satisfy its path.
 */
export function validateArtifactContent(filePath: string, content: string): string | null {
    const ext = path.extname(filePath).toLowerCase();
    const basename = path.basename(filePath).toLowerCase();

    if (/```(?:json|javascript|typescript|python|js|ts|py)?/iu.test(content)) {
        return `artifact_type_mismatch: ${filePath} still contains an incomplete Markdown fence`;
    }

    if (isStructuredExtension(ext)) {
        if (ext === '.json') {
            try {
                JSON.parse(content);
            } catch (error: any) {
                const detail = String(error?.message || 'invalid JSON').split('\n')[0];
                return `artifact_validation_failed: ${filePath} is not valid JSON (${detail})`;
            }
        }
        return null;
    }

    if (!isSourceExtension(ext)) return null;

    if (['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx'].includes(ext) && looksLikePython(content)) {
        return `artifact_type_mismatch: ${filePath} has Python source markers but requires JavaScript/TypeScript`;
    }
    if (ext === '.py' && looksLikeNode(content)) {
        return `artifact_type_mismatch: ${filePath} has Node.js source markers but requires Python`;
    }

    return null;
}

export function prepareArtifactContent(filePath: string, rawContent: unknown): ArtifactValidationResult {
    const normalized = normalizeArtifactContent(filePath, rawContent);
    if (normalized.error) return normalized;
    const error = validateArtifactContent(filePath, normalized.content);
    return error ? { content: normalized.content, error } : normalized;
}
