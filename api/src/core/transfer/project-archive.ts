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
import { isWithinRoot } from '../../modules/tools/path-containment';
import { installedEnvironmentKindSync, isMachineStateDirectory, JOE_PROJECT_RECORDS, toolOutputMarkers } from '../../shared/utils/project-tree';

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

/**
 * What an export leaves behind: the folders tools and Joe keep inside a project
 * (shared/utils/project-tree). This list knew `.checkpoints` but not
 * `.joe-versions` — ten undo snapshots of the whole project, so the archive
 * carried every file eleven times and a 500-file project no longer imported
 * under MAX_ENTRIES — nor the package caches and virtualenvs. Yarn's own folder
 * stays: it holds the release the project pins (`yarnPath`) and, for zero
 * installs, the committed cache, without which the imported project cannot run.
 */
const ARCHIVE_KEEPS = new Set(['.yarn']);

/**
 * A FOLDER NAMED LIKE A TOOL'S OUTPUT IS HIS WHEN IT HOLDS HIS FILES (round 22).
 *
 * Round 21 made `coverage` and `.joe` machine state at any depth here, where
 * before only node_modules, .git and .checkpoints were left behind: the export
 * of a project whose src/App.jsx imports `./coverage/Plans` dropped
 * src/coverage/Plans.jsx, and dropped `.joe/external-api.json` — the record the
 * preview proxy and the pipeline read, so the maintained API route answered 404
 * after import. A tool-output name is state where the tool writes it (the
 * root) or where it holds that tool's output, an installed environment is
 * known by what its installer wrote into it whatever it is called
 * (shared/utils/project-tree), and Joe's records that belong to the project
 * travel with it.
 */
function walk(dir: string, base: string, out: Array<{ abs: string; rel: string }>, parentEntries: string[] = []): void {
    const names = fs.readdirSync(dir);
    if (dir !== base && installedEnvironmentKindSync(dir, names, parentEntries)) return;
    for (const name of names) {
        const abs = path.join(dir, name);
        const st = fs.statSync(abs);
        if (st.isDirectory()) {
            const atRoot = dir === base;
            const entries = !atRoot && toolOutputMarkers(name) ? fs.readdirSync(abs) : undefined;
            if (isMachineStateDirectory(name, { atRoot, entries }) && !ARCHIVE_KEEPS.has(name)) continue;
            walk(abs, base, out, names);
        } else if (st.isFile()) out.push({ abs, rel: path.relative(base, abs) });
    }
}

export function archiveProject(projectDir: string): ExportResult {
    const root = path.resolve(projectDir);
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
        throw new Error(`not a directory: ${projectDir}`);
    }
    const files: Array<{ abs: string; rel: string }> = [];
    walk(root, root, files);
    for (const record of JOE_PROJECT_RECORDS) {
        const abs = path.join(root, ...record.split('/'));
        try { if (fs.statSync(abs).isFile()) files.push({ abs, rel: path.relative(root, abs) }); } catch { /* this project has none */ }
    }
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
        if (!isWithinRoot(target, dest)) {
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
