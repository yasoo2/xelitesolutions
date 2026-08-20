import fs from 'fs';
import path from 'path';

/**
 * A generated file batch is a catalog of files, not a list of directories.
 * Validate the catalog before any writer creates a parent directory so a
 * malformed entry cannot turn package.json (or another structural file) into
 * a directory and poison the next phase.
 */
export interface FileWriteStructureFailure {
    ok: false;
    error: string;
    path: string;
    projectRoot: string;
    reason: 'target_is_directory' | 'file_is_parent' | 'parent_is_file' | 'invalid_path';
    conflictPath?: string;
    repairHint: string;
}

export interface FileWriteStructureSuccess {
    ok: true;
}

export type FileWriteStructureCheck = FileWriteStructureSuccess | FileWriteStructureFailure;

export interface FileWriteStructureOptions {
    allowDirectories?: boolean;
}

const STRUCTURAL_FILE_NAMES = new Set([
    'package.json',
    'package-lock.json',
    'npm-shrinkwrap.json',
    'tsconfig.json',
    'jsconfig.json',
    'index.html',
    'vite.config.js',
    'vite.config.ts',
    '.gitignore',
    'README.md',
]);

function normalizeRelativeFilePath(raw: string): string {
    return raw.replace(/\\/g, '/').replace(/^\.\//u, '').replace(/\/+/gu, '/');
}

function failure(
    projectRoot: string,
    filePath: string,
    reason: FileWriteStructureFailure['reason'],
    conflictPath?: string,
): FileWriteStructureFailure {
    const detail = conflictPath ? `:${conflictPath}` : '';
    return {
        ok: false,
        error: `authored_path_structure_conflict:${reason}:${filePath}${detail}`,
        path: filePath,
        projectRoot,
        reason,
        conflictPath,
        repairHint: 'Emit each destination as one file path; do not use a file path as a directory or as a parent of another file.',
    };
}

/**
 * Validate a complete authored file catalog before a writer calls mkdirSync.
 * This is intentionally domain-neutral and is shared by all project writers.
 */
export function validateFileWriteBatch(
    projectRootInput: string,
    files: Record<string, unknown>,
    options: FileWriteStructureOptions = {},
): FileWriteStructureCheck {
    const projectRoot = path.resolve(String(projectRootInput || '.'));
    const allowDirectories = options.allowDirectories === true;
    const rawEntries = Object.entries(files || {});
    const normalized = new Map<string, { raw: string; trailingSlash: boolean; isDirectory: boolean }>();

    for (const [rawPath, value] of rawEntries) {
        const raw = String(rawPath || '');
        const relative = normalizeRelativeFilePath(raw);
        const trailingSlash = /[\\/]$/u.test(raw);
        const isDirectory = value === null;
        if (!relative || relative === '.' || path.posix.isAbsolute(relative)
            || relative === '..' || relative.startsWith('../')
            || (!isDirectory && typeof value !== 'string')
            || (isDirectory && !allowDirectories)) {
            return failure(projectRoot, raw || '.', 'invalid_path');
        }
        if (trailingSlash && !isDirectory) return failure(projectRoot, relative, 'target_is_directory');
        if (normalized.has(relative)) return failure(projectRoot, relative, 'file_is_parent', relative);
        normalized.set(relative, { raw, trailingSlash, isDirectory });
    }

    const paths = [...normalized.keys()].sort((left, right) => left.length - right.length);
    for (const filePath of paths) {
        const entry = normalized.get(filePath)!;
        const segments = filePath.split('/');
        if (entry.isDirectory && STRUCTURAL_FILE_NAMES.has(segments[segments.length - 1])) {
            return failure(projectRoot, filePath, 'target_is_directory');
        }
        for (let i = 0; i < segments.length - 1; i++) {
            const parent = segments.slice(0, i + 1).join('/');
            if (STRUCTURAL_FILE_NAMES.has(segments[i])) {
                return failure(projectRoot, filePath, 'file_is_parent', parent);
            }
            const parentEntry = normalized.get(parent);
            if (parentEntry && !parentEntry.isDirectory) {
                return failure(projectRoot, filePath, 'file_is_parent', parent);
            }
        }

        const absoluteTarget = path.join(projectRoot, filePath);
        try {
            if (fs.existsSync(absoluteTarget)) {
                const targetIsDirectory = fs.statSync(absoluteTarget).isDirectory();
                if (entry.isDirectory ? !targetIsDirectory : targetIsDirectory) {
                    return failure(projectRoot, filePath, 'target_is_directory');
                }
            }
            for (let i = 1; i < segments.length; i++) {
                const absoluteParent = path.join(projectRoot, ...segments.slice(0, i));
                if (fs.existsSync(absoluteParent) && fs.statSync(absoluteParent).isFile()) {
                    return failure(projectRoot, filePath, 'parent_is_file', segments.slice(0, i).join('/'));
                }
            }
        } catch {
            return failure(projectRoot, filePath, 'invalid_path');
        }
    }

    return { ok: true };
}

export { STRUCTURAL_FILE_NAMES };
