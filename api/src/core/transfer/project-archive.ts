/**
 * Project export / import — a built project becomes ONE portable file.
 *
 * Export packs a project directory into a zip with a manifest (what, when,
 * from where). Import unpacks a zip into a FRESH directory — never on top of
 * existing work — and refuses, entry by entry, anything that tries to escape
 * the destination (the classic zip-slip attack: an entry named `../../evil`).
 *
 * Limits are enforced honestly: a size ceiling on extraction so a zip bomb
 * cannot fill the disk, and binary-safe copying throughout.
 */
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

export interface ExportResult {
    buffer: Buffer;
    files: number;
    bytes: number;
}

export interface ImportResult {
    dir: string;
    files: number;
    bytes: number;
}

const MANIFEST = 'joe-project.json';
/** Extraction ceiling — big enough for any real Joe project, too small for a zip bomb. */
const MAX_EXTRACT_BYTES = 200 * 1024 * 1024;
const MAX_ENTRIES = 5000;

const IGNORED = new Set(['node_modules', '.git', '.checkpoints']);

function walk(dir: string, base: string, out: Array<{ abs: string; rel: string }>): void {
    for (const name of fs.readdirSync(dir)) {
        if (IGNORED.has(name)) continue;
        const abs = path.join(dir, name);
        const st = fs.statSync(abs);
        if (st.isDirectory()) walk(abs, base, out);
        else if (st.isFile()) out.push({ abs, rel: path.relative(base, abs) });
    }
}

export function archiveProject(projectDir: string): ExportResult {
    const root = path.resolve(projectDir);
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
        throw new Error(`not a directory: ${projectDir}`);
    }
    const files: Array<{ abs: string; rel: string }> = [];
    walk(root, root, files);
    if (!files.length) throw new Error('the project directory is empty — nothing to export');

    const zip = new AdmZip();
    let bytes = 0;
    for (const f of files) {
        const data = fs.readFileSync(f.abs);
        bytes += data.length;
        // Zip paths are forward-slash by spec, whatever the exporting OS uses.
        zip.addFile(f.rel.split(path.sep).join('/'), data);
    }
    zip.addFile(MANIFEST, Buffer.from(JSON.stringify({
        tool: 'joe',
        v: 1,
        exportedAt: new Date().toISOString(),
        sourceDir: path.basename(root),
        files: files.length,
        bytes,
    }, null, 2), 'utf-8'));
    return { buffer: zip.toBuffer(), files: files.length, bytes };
}

export function extractProject(zipBuffer: Buffer, destBase: string): ImportResult {
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries().filter(e => !e.isDirectory);
    if (!entries.length) throw new Error('the archive is empty');
    if (entries.length > MAX_ENTRIES) throw new Error(`too many entries (${entries.length} > ${MAX_ENTRIES})`);

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dest = path.join(path.resolve(destBase), `imported-${stamp}`);
    fs.mkdirSync(dest, { recursive: true });

    let bytes = 0, written = 0;
    for (const e of entries) {
        if (e.entryName === MANIFEST) continue; // metadata, not project content
        // [ZIP-SLIP GUARD] The entry decides its own name; WE decide where it
        // may land. Anything resolving outside the fresh destination is refused
        // loudly — not skipped silently.
        const target = path.resolve(dest, e.entryName);
        if (target !== dest && !target.startsWith(dest + path.sep)) {
            throw new Error(`archive entry escapes the destination: ${e.entryName}`);
        }
        const data = e.getData();
        bytes += data.length;
        if (bytes > MAX_EXTRACT_BYTES) {
            throw new Error(`archive expands past the ${Math.round(MAX_EXTRACT_BYTES / 1048576)}MB ceiling — refusing`);
        }
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, data);
        written++;
    }
    if (!written) throw new Error('the archive held only metadata — nothing to import');
    return { dir: dest, files: written, bytes };
}
