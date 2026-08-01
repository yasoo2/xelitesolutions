/**
 * Repair memory — Joe remembers the cure, not just the disease.
 *
 * Before this existed, every failure was diagnosed from zero: the same
 * "Cannot find module 'x'" that Joe repaired yesterday got a fresh blind
 * recovery plan today, in every session, forever. A senior engineer's real
 * edge is the scar tissue: «رأيت هذا الخطأ من قبل، والعلاج كان كذا».
 *
 * Mechanics:
 * - errorSignature() normalizes an error into a stable key: paths, numbers,
 *   quoted names and timestamps are masked so "ENOENT /home/a/x.txt" and
 *   "ENOENT /srv/b/y.txt" share one signature while staying distinct from
 *   "EACCES ...".
 * - recordRepair() stores what repair WORKED (proven by the failed step
 *   completing after it) — capped, newest-wins, atomic tmp+rename.
 * - recallRepair() returns the remembered cure for an error, if any, so the
 *   recovery planner starts from experience instead of zero.
 */
import * as fsp from 'fs/promises';
import * as fs from 'fs';
import * as path from 'path';

export interface RepairRecord {
    signature: string;
    /** First line of the raw error, for a human reading the store. */
    errorSample: string;
    /** What the successful recovery actually did (tasks/tools of repair nodes). */
    repair: string;
    /** How many times this cure was re-proven. */
    wins: number;
    lastAt: string;
}

const MAX_RECORDS = 200;
const STORE_FILE = 'repairs.json';

/** Masks the volatile parts of an error so recurrences share a signature. */
export function errorSignature(errorText: string): string {
    const firstLines = String(errorText || '').trim().split(/\r?\n/).slice(0, 2).join(' ');
    return firstLines
        .toLowerCase()
        // windows + posix paths → <path>
        .replace(/[a-z]:\\[^\s'"]+/gi, '<path>')
        .replace(/(?:\/[\w.-]+){2,}/g, '<path>')
        // quoted identifiers keep their value — 'adm-zip' IS the diagnosis —
        // but bare hex/ids/numbers are noise
        .replace(/0x[0-9a-f]+/g, '<hex>')
        .replace(/\b\d{4}-\d{2}-\d{2}[t ][\d:.]+z?\b/g, '<time>')
        .replace(/\b\d+\b/g, '<n>')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 300);
}

export class RepairMemory {
    private storePath: string;

    constructor(memoryDir: string = process.env.JOE_MEMORY_DIR || './data/memory') {
        this.storePath = path.join(memoryDir, STORE_FILE);
    }

    private load(): RepairRecord[] {
        try {
            const raw = fs.readFileSync(this.storePath, 'utf-8');
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr : [];
        } catch {
            return [];
        }
    }

    private async save(records: RepairRecord[]): Promise<void> {
        await fsp.mkdir(path.dirname(this.storePath), { recursive: true });
        const tmp = `${this.storePath}.tmp`;
        await fsp.writeFile(tmp, JSON.stringify(records.slice(-MAX_RECORDS), null, 2));
        await fsp.rename(tmp, this.storePath);
    }

    /** Called ONLY when a repair is proven: the failed step completed after it. */
    async recordRepair(errorText: string, repair: string): Promise<void> {
        const signature = errorSignature(errorText);
        const cleanRepair = String(repair || '').trim().slice(0, 500);
        if (!signature || !cleanRepair) return;
        const records = this.load();
        const existing = records.find((r) => r.signature === signature);
        if (existing) {
            existing.repair = cleanRepair; // newest proven cure wins
            existing.wins += 1;
            existing.lastAt = new Date().toISOString();
        } else {
            records.push({
                signature,
                errorSample: String(errorText || '').trim().split(/\r?\n/)[0].slice(0, 200),
                repair: cleanRepair,
                wins: 1,
                lastAt: new Date().toISOString(),
            });
        }
        await this.save(records);
    }

    /** The remembered cure for this error, or null if Joe never beat it before. */
    recallRepair(errorText: string): RepairRecord | null {
        const signature = errorSignature(errorText);
        if (!signature) return null;
        return this.load().find((r) => r.signature === signature) || null;
    }
}

export const repairMemory = new RepairMemory();
