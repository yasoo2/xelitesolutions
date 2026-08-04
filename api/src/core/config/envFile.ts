/**
 * WRITING api/.env WITHOUT LOSING WHAT IS ALREADY IN IT.
 *
 * A settings screen that rewrites the file from its own model deletes every
 * comment, every key it does not know about, and the order the operator put
 * them in. This edits IN PLACE: a known key is replaced on its own line, a
 * new key is appended under a dated heading, and everything else — including
 * keys this panel never shows — is left exactly as it was.
 *
 * The file holds every secret Joe has, so it is written 0600 and a timestamped
 * copy of the previous content is kept beside it. Values are never logged.
 */
import fs from 'fs';
import path from 'path';

export const envFilePath = () => path.join(process.cwd(), '.env');

/** Quote only when the value would otherwise be ambiguous. */
function encodeValue(v: string): string {
    if (v === '') return '';
    return /[\s#"']/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v;
}

export interface EnvWriteResult {
    file: string;
    updated: string[];
    added: string[];
    backup: string | null;
}

/**
 * Apply `changes` to the .env file. Keys with an empty string are written as
 * an empty assignment (KEY=) rather than deleted, so the operator can still
 * see the setting exists and is deliberately blank.
 */
export function writeEnvChanges(changes: Record<string, string>): EnvWriteResult {
    const file = envFilePath();
    const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
    const lines = before ? before.split(/\r?\n/) : [];

    const updated: string[] = [];
    const added: string[] = [];

    for (const [key, value] of Object.entries(changes)) {
        const line = `${key}=${encodeValue(value)}`;
        // A commented-out assignment is NOT a match: rewriting `# KEY=x` would
        // silently activate a setting the operator had deliberately disabled.
        const at = lines.findIndex(l => new RegExp(`^\\s*${key}\\s*=`).test(l));
        if (at >= 0) { lines[at] = line; updated.push(key); }
        else { added.push(key); }
    }

    if (added.length) {
        const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
        if (lines.length && lines[lines.length - 1].trim() !== '') lines.push('');
        lines.push(`# أُضيفت من لوحة جو — ${stamp}`);
        for (const key of added) lines.push(`${key}=${encodeValue(changes[key])}`);
    }

    let backup: string | null = null;
    if (before) {
        backup = `${file}.backup-${Date.now()}`;
        fs.writeFileSync(backup, before, { mode: 0o600 });
    }
    fs.writeFileSync(file, lines.join('\n').replace(/\n{3,}$/, '\n\n'), { mode: 0o600 });
    try { fs.chmodSync(file, 0o600); } catch { /* windows has no mode bits */ }

    return { file, updated, added, backup };
}

/** Keep the last N backups; a settings screen should not fill a disk. */
export function pruneEnvBackups(keep = 10): number {
    const dir = path.dirname(envFilePath());
    const base = `${path.basename(envFilePath())}.backup-`;
    const all = fs.readdirSync(dir).filter(f => f.startsWith(base)).sort();
    const drop = all.slice(0, Math.max(0, all.length - keep));
    for (const f of drop) { try { fs.unlinkSync(path.join(dir, f)); } catch { } }
    return drop.length;
}
