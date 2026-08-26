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

/**
 *  A BUILD IDENTITY THAT IS ANNOUNCED IS NOT AN IDENTITY.
 *
 *  resolveBuildSha above reads JOE_BUILD_SHA, then GIT_COMMIT_SHA, then
 *  the git HEAD of the working directory. Every one of those describes
 *  the ENVIRONMENT the process was started in. None of them reads the
 *  code that is actually executing.
 *
 *  Found the hard way on a live round: an isolated runtime announced
 *  e0835559 in its startup log and in its own environment while running
 *  a stale bundle from before that commit, and the round it produced was
 *  believed for as long as it took to notice. Every «which build is this»
 *  answer today — including the ones asked on the owner's own machine —
 *  was a claim rather than a measurement.
 *
 *  A fingerprint cannot be announced. It is the digest of the bytes being
 *  run, so two processes claiming one SHA with different fingerprints are
 *  provably different, and a process whose fingerprint changed without a
 *  redeploy is provably not what it was.
 *
 *  Unknown stays unknown: when the file cannot be read, this says so
 *  rather than inventing a value — the same rule resolveBuildSha follows.
 */
export function runningBundleFingerprint(entry: string = process.argv[1] || ''): string {
    try {
        const file = String(entry || '').trim();
        if (!file) return 'unknown';
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const fs = require('fs');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const crypto = require('crypto');
        const bytes = fs.readFileSync(file);
        return crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 12);
    } catch {
        return 'unknown';
    }
}

export interface BuildIdentity {
    /** What the environment SAYS this build is. */
    claimedSha: string;
    /** What the running bytes ARE. Cannot be set by an environment variable. */
    bundleFingerprint: string;
    /** The file those bytes came from. */
    entry: string;
}

/** Both halves, so a claim can be compared with a measurement. */
export function buildIdentity(
    env: NodeJS.ProcessEnv = process.env,
    cwd: string = process.cwd(),
    entry: string = process.argv[1] || '',
): BuildIdentity {
    return {
        claimedSha: resolveBuildSha(env, cwd),
        bundleFingerprint: runningBundleFingerprint(entry),
        entry: String(entry || ''),
    };
}
