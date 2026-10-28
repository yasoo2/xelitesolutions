import fs from 'fs';
import path from 'path';
import { resolveToolPath } from './utils';

/**
 * What the phase's automatic build check needs to know before it may speak.
 *
 * Eval run500, P001-landing-ar (2026-10-25, run-1792949598462): phase 1 of a
 * four-phase plan wrote package.json (vite in devDependencies) and an Express
 * entry, then the auto-build ran `npm run build` in a folder that had never
 * been installed:
 *
 *     'vite' is not recognized as an internal or external command
 *     BUILD_CHECK_FAILED
 *
 * The phase failed as "Auto-build check failed" — the build's own words were
 * dropped, so self-fix answered "no evidence-bound repair file" and the whole
 * build stopped at 0/4. And even installed, the build had nothing to build:
 * public/index.html and the components belonged to phases 2–3.
 *
 * A build check measures the project, so it runs on the project as the plan
 * makes it: dependencies the manifest declares are installed first, a check
 * whose planned files are still unwritten waits for the phase that writes them
 * (the final phase never waits), and a failure carries what the build said.
 */

const norm = (file: string) => String(file || '').trim().replace(/\\/g, '/').replace(/^\.\//, '');

/**
 * The workspace-relative files a planned task writes.
 *
 * Eval run500, P001-landing-ar (2026-10-28, run-1793183272224): phase 1 ran
 * scaffold_project with baseDir «dental-clinic-landing» and a structure holding
 * package.json, yet the phase said «this phase wrote no package.json» and no
 * later phase ever found a manifest to build: only path/filename arguments were
 * read as writes, and a scaffold names its files as baseDir + structure keys.
 * Directories (null content) are not files; a structure whose every key repeats
 * baseDir is read as the tool writes it, without the doubled prefix.
 */
export function plannedTaskWrites(task: any): string[] {
  const args = { ...(task?.args || {}), ...(task?.input || {}) };
  if (String(task?.tool || '').trim() !== 'scaffold_project') {
    const file = norm(String(args.path || args.filePath || args.filename || ''));
    return file ? [file] : [];
  }
  const structure = args.structure && typeof args.structure === 'object' && !Array.isArray(args.structure) ? args.structure : {};
  const base = norm(String(args.baseDir || args.projectName || args.name || '.')).replace(/\/+$/, '') || '.';
  const keys = Object.keys(structure).map(norm);
  const repeated = base !== '.' && keys.length > 0 && keys.every(key => key === base || key.startsWith(`${base}/`));
  return Object.entries(structure)
    .filter(([, content]) => content !== null)
    .map(([key]) => {
      const file = norm(key);
      return repeated ? (file === base ? '' : file.slice(base.length + 1)) : file;
    })
    .filter(Boolean)
    .map(file => (base === '.' ? file : `${base}/${file}`));
}

/** Every file the whole plan writes, once each: write tasks and scaffolds alike. */
export function planWrites(phases: any[]): string[] {
  return Array.from(new Set<string>((Array.isArray(phases) ? phases : []).flatMap((planned: any) =>
    (Array.isArray(planned?.tasks) ? planned.tasks : [])
      .filter((task: any) => /^(?:ai_write_file|write_file|scaffold_project)$/.test(String(task?.tool || '').trim()))
      .flatMap((task: any) => plannedTaskWrites(task)))));
}

/**
 * The workspace-relative package.json files to check: for each file this
 * phase wrote, the manifest nearest above it — one this phase wrote, or one
 * the plan writes that an earlier phase put on disk.
 *
 * ⛔ EVERY PROJECT THE PHASE TOUCHED (round 21 review). This returned the
 * first manifest only, so a phase of a two-project plan (an API and its web
 * client) checked whichever package.json came first and never built the
 * other. `everyPlanned` (the final phase, which never waits) adds every
 * planned manifest on disk, so a check an earlier phase deferred is never
 * dropped because the completing phase wrote nothing inside that project.
 */
export function autoBuildManifests(
  phaseWrites: string[],
  plannedProjectFiles: string[],
  workspaceId?: string,
  opts: { everyPlanned?: boolean } = {},
): string[] {
  const isManifest = (file: string) => /(^|\/)package\.json$/i.test(file);
  const written = phaseWrites.map(norm).filter(Boolean);
  const candidates = new Set(written.filter(isManifest));
  const onDisk = new Set<string>();
  for (const planned of plannedProjectFiles.map(norm).filter(isManifest)) {
    if (candidates.has(planned)) continue;
    try {
      if (fs.existsSync(resolveToolPath(planned, { workspaceId }))) { candidates.add(planned); onDisk.add(planned); }
    } catch { /* outside the workspace: not ours to build */ }
  }
  const dirOf = (manifest: string) => (manifest.includes('/') ? manifest.slice(0, manifest.lastIndexOf('/')) : '');
  const touched = new Set<string>();
  for (const file of written) {
    let nearest: string | null = null;
    let depth = -1;
    for (const manifest of candidates) {
      const dir = dirOf(manifest);
      if (dir && !file.startsWith(`${dir}/`)) continue;
      const level = dir ? dir.split('/').length : 0;
      if (level > depth) { nearest = manifest; depth = level; }
    }
    if (nearest) touched.add(nearest);
  }
  if (opts.everyPlanned) for (const manifest of onDisk) touched.add(manifest);
  return Array.from(touched).sort();
}

/**
 * ONE READER OF «DOES THIS PROJECT DECLARE A BUILD?» — for the phase's
 * automatic build check and for self-fix's post-repair proof alike.
 *
 * The post-repair proof used to run «npm run build» on every project, so a
 * build-free site (`start: npx serve src`) or a plain server failed the rerun
 * on «Missing script: "build"» after its repair had landed (eval P001). And the
 * phase's check ran `npm run --if-present build` with no build script, which
 * prints nothing and exits 0 — «Auto-build check passed» and a passed receipt
 * for a build that never ran (round 21 review). Only a manifest that cannot be
 * read keeps the build step, so npm reports the real error.
 */
export function manifestDeclaresBuild(projectRoot: string): boolean {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
    const build = manifest?.scripts?.build;
    return typeof build === 'string' && build.trim().length > 0;
  } catch {
    return true;
  }
}

/** Files the plan puts in this project that no phase has written yet. */
export function plannedFilesNotYetWritten(projectDir: string, plannedProjectFiles: string[], workspaceId?: string): string[] {
  const dir = norm(projectDir).replace(/\/+$/, '');
  const pending: string[] = [];
  for (const planned of Array.from(new Set(plannedProjectFiles.map(norm).filter(Boolean)))) {
    if (dir && !planned.startsWith(`${dir}/`)) continue;
    try {
      if (!fs.existsSync(resolveToolPath(planned, { workspaceId }))) pending.push(planned);
    } catch { /* outside the workspace: never a file this build waits for */ }
  }
  return pending;
}

/** The manifest declares packages and none were ever installed here. */
export function manifestAwaitsInstall(projectRoot: string): boolean {
  let manifest: any;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  } catch {
    return false;
  }
  const declared = ['dependencies', 'devDependencies', 'optionalDependencies'].some(bucket =>
    manifest && manifest[bucket] && typeof manifest[bucket] === 'object' && Object.keys(manifest[bucket]).length > 0);
  return declared && !fs.existsSync(path.join(projectRoot, 'node_modules'));
}

/** What the build said, without the shell's failure marker, bounded from the end where errors land. */
export function buildFailureEvidence(output: string, limit = 900): string {
  const text = String(output || '')
    .replace(/\x1b\[[0-9;]*m/g, '')
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(line => line.trim() && line.trim() !== 'BUILD_CHECK_FAILED')
    .join('\n')
    .trim();
  return text.length > limit ? text.slice(text.length - limit) : text;
}
