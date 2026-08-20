import fs from 'fs';
import path from 'path';

export type BuildShaGitReader = (cwd: string) => string | null | undefined;

function usableSha(value: string | null | undefined): string | null {
  const candidate = value?.trim();
  return candidate && /^[0-9a-f]{7,40}$/i.test(candidate) ? candidate : null;
}

function readText(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function resolveGitDirectory(cwd: string): string | null {
  const dotGit = path.join(cwd, '.git');
  try {
    if (fs.statSync(dotGit).isDirectory()) return dotGit;
  } catch {
    // Continue to the gitdir-file form used by linked worktrees.
  }

  const gitFile = readText(dotGit);
  const match = gitFile?.match(/^gitdir:\s*(.+)\s*$/im);
  return match ? path.resolve(cwd, match[1].trim()) : null;
}

function readPackedRef(gitDirectory: string, refName: string): string | null {
  const packedRefs = readText(path.join(gitDirectory, 'packed-refs'));
  if (!packedRefs) return null;

  for (const line of packedRefs.split(/\r?\n/)) {
    if (!line || line.startsWith('#') || line.startsWith('^')) continue;
    const [sha, ref] = line.trim().split(/\s+/, 2);
    if (ref === refName) return usableSha(sha);
  }
  return null;
}

function readGitSha(cwd: string): string | null {
  const gitDirectory = resolveGitDirectory(cwd);
  if (!gitDirectory) return null;

  const head = readText(path.join(gitDirectory, 'HEAD'));
  if (!head) return null;

  const detachedSha = usableSha(head);
  if (detachedSha) return detachedSha;

  const refMatch = head.trim().match(/^ref:\s+(refs\/[A-Za-z0-9._/-]+)$/);
  if (!refMatch) return null;
  const refName = refMatch[1];

  const directSha = usableSha(readText(path.join(gitDirectory, refName)));
  return directSha ?? readPackedRef(gitDirectory, refName);
}

/**
 * Resolve the commit that produced the running Joe process.
 *
 * An explicit build value wins when a deployment provides one. In the local
 * checkout, the git HEAD is the next reliable source. Unknown is intentional:
 * Joe must never invent a build identity when neither source is available.
 */
export function resolveBuildSha(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
  gitReader: BuildShaGitReader = readGitSha,
): string {
  const configured = usableSha(env.JOE_BUILD_SHA) ?? usableSha(env.GIT_COMMIT_SHA);
  if (configured) return configured;

  const candidates = [cwd, path.resolve(cwd, '..')];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    const fromGit = usableSha(gitReader(candidate));
    if (fromGit) return fromGit;
  }

  return 'unknown';
}
