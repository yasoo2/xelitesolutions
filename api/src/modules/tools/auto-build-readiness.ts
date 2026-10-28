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

/** The workspace-relative package.json to check: this phase's, else the plan's once it is on disk. */
export function autoBuildManifest(phaseWrites: string[], plannedProjectFiles: string[], workspaceId?: string): string | null {
  const isManifest = (file: string) => /(^|\/)package\.json$/i.test(norm(file));
  const written = phaseWrites.map(norm).find(isManifest);
  if (written) return written;
  for (const planned of plannedProjectFiles.map(norm).filter(isManifest)) {
    try {
      if (fs.existsSync(resolveToolPath(planned, { workspaceId }))) return planned;
    } catch { /* outside the workspace: not ours to build */ }
  }
  return null;
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
