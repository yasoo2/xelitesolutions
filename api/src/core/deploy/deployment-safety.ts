import path from 'path';

export type AutoUpdateSafetyInput = {
    root: string;
    runtimeMode?: string;
    worktreeStatus: string;
    ahead: number;
};

export type AutoUpdateSafety =
    | { ok: true }
    | { ok: false; reason: string };

function normaliseRoot(root: string): string {
    return path.resolve(String(root || '').trim()).replace(/\\/g, '/').replace(/\/+$/u, '').toLocaleLowerCase();
}

/**
 * The historical updater points at the owner's personal checkout. That root is
 * never an acceptable target for an unattended destructive update, regardless
 * of whether the checkout currently looks clean.
 */
export function isProtectedPersonalRoot(root: string): boolean {
    const normalized = normaliseRoot(root);
    return normalized === '/root/xelitesolutions'
        || normalized.endsWith('/root/xelitesolutions');
}

/**
 * Decide whether an automatic fast-forward update may proceed. This function is
 * deliberately pure so its refusal paths can be tested without ever deleting a
 * file or mutating a repository.
 */
export function assessAutoUpdateSafety(input: AutoUpdateSafetyInput): AutoUpdateSafety {
    const root = String(input.root || '').trim();
    if (!root) return { ok: false, reason: 'automatic update blocked: repository root is empty' };
    if (isProtectedPersonalRoot(root)) {
        return { ok: false, reason: `automatic update blocked: protected personal repository root (${root})` };
    }
    if (String(input.runtimeMode || '').trim().toLocaleLowerCase() !== 'production') {
        return { ok: false, reason: 'automatic update blocked outside production mode' };
    }
    if (String(input.worktreeStatus || '').trim()) {
        return { ok: false, reason: 'automatic update blocked: repository has uncommitted or untracked files' };
    }
    if (!Number.isInteger(input.ahead) || input.ahead < 0) {
        return { ok: false, reason: 'automatic update blocked: unable to prove local commit relationship' };
    }
    if (input.ahead > 0) {
        return { ok: false, reason: `automatic update blocked: local branch is ahead by ${input.ahead} commit(s)` };
    }
    return { ok: true };
}

export function parseAheadCount(revListOutput: string): number | null {
    const match = String(revListOutput || '').trim().match(/^(\d+)\s+(\d+)$/u);
    if (!match) return null;
    const ahead = Number(match[1]);
    return Number.isInteger(ahead) ? ahead : null;
}
