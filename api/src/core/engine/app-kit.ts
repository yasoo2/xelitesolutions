/**
 * JOE'S PRINT KIT, PLACED INTO THE APP WHEN THE BRIEF IS GIVEN (design arabic-pdf v9 §3.1).
 *
 * print.css (the v7 rule: the font only as a print default on :where(:root),
 * direction only where nothing says dir, print-color-adjust: exact in .joe-print,
 * .no-print), the four Cairo/Amiri woff2 of assets/fonts/ (byte-identical), OFL.txt,
 * README.md and JOE-KIT.json. Copied with Joe's own fs through resolveInProject, never
 * over a file that differs from the kit's copy. Every reader that judges the app
 * skips it (isJoeAppKit, shared/utils/project-tree.ts).
 */
import fs from 'fs';
import path from 'path';
import { resolveInProject } from './workspace';
import { findJoeAsset } from '../quality/outside-scan';

/** The kit's fonts: the name in the kit's fonts/ folder → the file in assets/fonts/. */
export const KIT_FONTS: Readonly<Record<string, string>> = {
    'cairo-arabic.woff2': 'cairo-400-arabic.woff2',
    'cairo-latin.woff2': 'cairo-400-latin.woff2',
    'amiri-700-arabic.woff2': 'amiri-700-arabic.woff2',
    'amiri-700-latin.woff2': 'amiri-700-latin.woff2',
};
export const KIT_FILES = ['print.css', 'README.md', 'OFL.txt', 'JOE-KIT.json'] as const;

/** Where the kit's own files are (assets/app-kit and assets/fonts), or null when Joe has no kit installed. */
export function appKitSource(): { kitDir: string; fontsDir: string } | null {
    const css = findJoeAsset(path.join('app-kit', 'print.css'));
    if (!css) return null;
    const kitDir = path.dirname(css);
    const fontsDir = path.join(path.dirname(kitDir), 'fonts');
    if (!Object.values(KIT_FONTS).every(f => fs.existsSync(path.join(fontsDir, f)))) return null;
    if (!KIT_FILES.every(f => fs.existsSync(path.join(kitDir, f)))) return null;
    return { kitDir, fontsDir };
}

/** The kit's folder in this project: public/vendor/joe-kit when public/ exists at the root, vendor/joe-kit otherwise. */
export function appKitTarget(root: string): string {
    try { if (fs.statSync(path.join(root, 'public')).isDirectory()) return 'public/vendor/joe-kit'; } catch { /* no public/ */ }
    return 'vendor/joe-kit';
}

/**
 * Place the kit; returns the kit's folder relative to the project ('' when Joe has no
 * kit, or when `signal` aborted) and the files written. A file already there with other
 * bytes is left as it is.
 *
 * A run that ends while the kit is copied gets nothing written after it ends (review 4
 * of r40, S5): every source is read and every target resolved first, the abort is
 * checked before each folder made and each file written, and an abort part way takes
 * back what this call wrote (its own files and the folders it made, nothing else).
 */
export async function placeAppKit(root: string, signal?: AbortSignal): Promise<{ dir: string; written: string[]; kept: string[] }> {
    const none = { dir: '', written: [] as string[], kept: [] as string[] };
    const source = appKitSource();
    if (!source || signal?.aborted) return none;
    const dir = appKitTarget(root);
    const plan: Array<{ rel: string; from: string }> = [
        ...KIT_FILES.map(f => ({ rel: `${dir}/${f}`, from: path.join(source.kitDir, f) })),
        ...Object.entries(KIT_FONTS).map(([to, from]) => ({ rel: `${dir}/fonts/${to}`, from: path.join(source.fontsDir, from) })),
    ];
    const writes: Array<{ rel: string; abs: string; bytes: Buffer }> = [];
    const kept: string[] = [];
    for (const step of plan) {
        const target = await resolveInProject(root, step.rel, 'write');
        if (!target.ok || !target.abs) continue;
        const bytes = await fs.promises.readFile(step.from);
        if (target.exists) {
            const now = await fs.promises.readFile(target.abs).catch(() => null);
            if (!now || !now.equals(bytes)) kept.push(step.rel);
            continue;
        }
        writes.push({ rel: step.rel, abs: target.abs, bytes });
    }
    const written: string[] = [];
    const wroteAbs: string[] = [];
    const madeDirs: string[] = [];
    const takeBack = async () => {
        for (const f of wroteAbs.reverse()) await fs.promises.rm(f, { force: true }).catch(() => { /* already gone */ });
        //  Deepest first; a folder that holds anything else is left (rmdir refuses it).
        for (const d of [...new Set(madeDirs)].sort((a, b) => b.length - a.length)) await fs.promises.rmdir(d).catch(() => { /* not empty, or gone */ });
        return none;
    };
    for (const w of writes) {
        if (signal?.aborted) return takeBack();
        const parent = path.dirname(w.abs);
        //  The folders this write makes (mkdir's own answer may carry a long-path prefix on Windows).
        for (let d = parent; d !== path.dirname(d) && !(await fs.promises.stat(d).then(() => true, () => false)); d = path.dirname(d)) madeDirs.push(d);
        await fs.promises.mkdir(parent, { recursive: true });
        if (signal?.aborted) return takeBack();
        await fs.promises.writeFile(w.abs, w.bytes);
        wroteAbs.push(w.abs);
        written.push(w.rel);
    }
    if (signal?.aborted) return takeBack();
    return { dir, written, kept };
}
