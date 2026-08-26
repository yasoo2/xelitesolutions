/**
 * Build checkpoints — an interrupted build resumes instead of starting over.
 *
 * A section-wise page build makes one model call per section. On the user's
 * real setup (free daily quotas, a laptop that sleeps, a power cut) a build
 * can die at section 7 of 11 — and until now every completed section was
 * thrown away and re-generated from zero, spending quota twice for the same
 * work.
 *
 * Every ACCEPTED section is persisted here the moment it lands. When the same
 * request is built again, the finished sections are reloaded and only the
 * missing ones are asked of the model. This is safe because the design seeds
 * (palette, archetype, type pair, flourish) are deterministic functions of the
 * request text — the same request always produces the same design, so an old
 * section and a new one belong to the same page by construction.
 *
 * Honesty rules:
 *  - a checkpoint is keyed by the EXACT request text (hashed) — a different
 *    request never reuses another build's sections;
 *  - checkpoints expire (6h) so stale work is not resurrected days later;
 *  - the checkpoint is deleted the moment a build assembles successfully;
 *  - the log says plainly which sections came from the checkpoint.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface BuildCheckpoint {
    v: 1;
    key: string;
    /** First 200 chars of the request, for humans reading the file. */
    requestPreview: string;
    ts: number;
    /** planId -> accepted section HTML */
    sections: Record<string, string>;
    /** planId -> the section title pushed to `titles` (context for later prompts) */
    titles: Record<string, string>;
}

export interface CheckpointReadFailure {
    status: 'failed';
    reason: string;
    /** Empty structural fields keep legacy consumers read-only while status is explicit. */
    sections: Record<string, string>;
    titles: Record<string, string>;
}

export interface CheckpointReadEmpty {
    status: 'empty';
    sections: Record<string, string>;
    titles: Record<string, string>;
}

export type CheckpointLoadResult = BuildCheckpoint | CheckpointReadFailure | CheckpointReadEmpty | null;

const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const DIR_NAME = '.checkpoints';

export function checkpointKey(sessionKey: string, request: string, kind: string): string {
    return crypto.createHash('md5').update(`${sessionKey}|${kind}|${request.trim()}`).digest('hex');
}

function fileFor(artifactDir: string, key: string): string {
    return path.join(artifactDir, DIR_NAME, `${key}.json`);
}

function failedCheckpoint(reason: unknown): CheckpointReadFailure {
    return {
        status: 'failed',
        reason: String((reason as any)?.message || reason).slice(0, 160),
        sections: {},
        titles: {},
    };
}

export function loadCheckpoint(artifactDir: string, key: string): CheckpointLoadResult {
    const file = fileFor(artifactDir, key);
    try {
        if (!fs.existsSync(file)) return null;
        const cp = JSON.parse(fs.readFileSync(file, 'utf-8')) as BuildCheckpoint;
        if (cp?.v !== 1 || cp.key !== key) return failedCheckpoint('checkpoint schema or key is invalid');
        if (Date.now() - cp.ts > TTL_MS) {
            // Expired work is deleted, not silently reused.
            try { fs.unlinkSync(file); } catch { /* already gone */ }
            return null;
        }
        if (!cp.sections || Object.keys(cp.sections).length === 0) {
            return { status: 'empty', sections: {}, titles: {} };
        }
        return cp;
    } catch (e: any) {
        return failedCheckpoint(e);
    }
}

/** Persist one accepted section. Read-modify-write with an atomic rename. */
export function saveCheckpointSection(
    artifactDir: string,
    key: string,
    request: string,
    planId: string,
    html: string,
    title: string,
): void {
    const file = fileFor(artifactDir, key);
    try {
        const dir = path.join(artifactDir, DIR_NAME);
        fs.mkdirSync(dir, { recursive: true });
        const existing = loadCheckpoint(artifactDir, key);
        if (existing && 'status' in existing && existing.status === 'failed') {
            console.warn(`[Checkpoint] refusing write (${existing.reason}) — preserving unreadable checkpoint.`);
            return;
        }
        let cp: BuildCheckpoint | null = existing && !('status' in existing) ? existing : null;
        if (!cp) {
            cp = { v: 1, key, requestPreview: request.slice(0, 200), ts: Date.now(), sections: {}, titles: {} };
        }
        cp.ts = Date.now();
        cp.sections[planId] = html;
        if (title) cp.titles[planId] = title;
        const tmp = `${file}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(cp), 'utf-8');
        fs.renameSync(tmp, file);
    } catch (e: any) {
        console.warn(`[Checkpoint] write failed (${String(e?.message || e).slice(0, 160)}).`);
    }
}

export function clearCheckpoint(artifactDir: string, key: string): void {
    try { fs.unlinkSync(fileFor(artifactDir, key)); } catch { /* already gone */ }
}
